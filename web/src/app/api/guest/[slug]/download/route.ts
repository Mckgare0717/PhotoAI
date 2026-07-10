import { PassThrough, Readable } from "node:stream";
import archiver from "archiver";
import { NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";
import { verifyFileSig } from "@/lib/sign";
import { readStoredFile } from "@/lib/storage";

export const maxDuration = 300;

type Params = { params: Promise<{ slug: string }> };

interface ZipItem {
  path: string; // storage path from a signed downloadUrl
  exp: number;
  sig: string;
}

/**
 * "Download all" as a zip. The client passes back the signed download URLs it
 * received from /search; each signature is re-verified here, so a guest can
 * only zip photos their own selfie matched.
 */
export async function POST(req: Request, { params }: Params) {
  await ensureSchema();
  const { slug } = await params;

  const { rows } = await pool.query("SELECT id, name FROM events WHERE slug = $1", [slug]);
  if (rows.length === 0) return NextResponse.json({ error: "event not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { items?: ZipItem[] } | null;
  const items = (body?.items ?? []).slice(0, 500);
  if (items.length === 0) return NextResponse.json({ error: "no photos selected" }, { status: 400 });

  const verified = items.filter(
    (item) =>
      typeof item.path === "string" &&
      !item.path.includes("..") &&
      verifyFileSig(item.path, Number(item.exp), String(item.sig ?? ""))
  );
  if (verified.length === 0) {
    return NextResponse.json({ error: "links expired — please search again" }, { status: 403 });
  }

  const archive = archiver("zip", { zlib: { level: 1 } });
  const stream = new PassThrough();
  archive.pipe(stream);

  void (async () => {
    const seen = new Set<string>();
    for (const item of verified) {
      if (seen.has(item.path)) continue;
      seen.add(item.path);
      try {
        const data = await readStoredFile(item.path);
        archive.append(data, { name: item.path.split("/").pop() ?? "photo.jpg" });
      } catch {
        // skip missing files rather than failing the whole zip
      }
    }
    await archive.finalize();
  })();

  const eventName = String(rows[0].name).replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "photos";
  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${eventName}.zip"`,
    },
  });
}
