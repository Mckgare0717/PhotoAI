import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { verifyFileSig } from "@/lib/sign";
import { contentTypeFor, readStoredFile } from "@/lib/storage";

type Params = { params: Promise<{ path: string[] }> };

/**
 * Serves stored files. Access requires either an admin session or a valid
 * short-lived signature (handed out by the search endpoint for matched
 * photos only).
 */
export async function GET(req: Request, { params }: Params) {
  const { path: segments } = await params;
  const storagePath = segments.map(decodeURIComponent).join("/");
  if (storagePath.includes("..")) {
    return NextResponse.json({ error: "bad path" }, { status: 400 });
  }

  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  const authorized = verifyFileSig(storagePath, exp, sig) || (await isAdmin());
  if (!authorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const data = await readStoredFile(storagePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentTypeFor(storagePath),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": url.searchParams.get("download")
          ? `attachment; filename="${storagePath.split("/").pop()}"`
          : "inline",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
