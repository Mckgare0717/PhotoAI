import path from "node:path";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { ensureSchema, pool } from "@/lib/db";
import { enqueuePhoto } from "@/lib/pipeline";
import { saveFile } from "@/lib/storage";

export const maxDuration = 300;

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_FILE_BYTES = 30 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureSchema();
  const { id: eventId } = await params;

  const { rows } = await pool.query("SELECT id FROM events WHERE id = $1", [eventId]);
  if (rows.length === 0) return NextResponse.json({ error: "event not found" }, { status: 404 });

  const form = await req.formData();
  const files = form.getAll("photos").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "no files" }, { status: 400 });

  const accepted: { id: string; filename: string }[] = [];
  const rejected: { filename: string; reason: string }[] = [];

  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase() || ".jpg";
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      rejected.push({ filename: file.name, reason: "unsupported file type" });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      rejected.push({ filename: file.name, reason: "file exceeds 30MB" });
      continue;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const inserted = await pool.query(
      `INSERT INTO photos (event_id, original_filename, original_path)
       VALUES ($1, $2, '') RETURNING id`,
      [eventId, file.name]
    );
    const photoId = inserted.rows[0].id as string;
    const originalPath = `events/${eventId}/originals/${photoId}${ext}`;
    await saveFile(originalPath, buffer);
    await pool.query("UPDATE photos SET original_path = $2 WHERE id = $1", [photoId, originalPath]);

    enqueuePhoto(photoId);
    accepted.push({ id: photoId, filename: file.name });
  }

  return NextResponse.json({ accepted, rejected }, { status: 201 });
}
