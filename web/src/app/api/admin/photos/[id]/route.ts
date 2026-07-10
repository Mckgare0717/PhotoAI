import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { ensureSchema, pool } from "@/lib/db";
import { deleteStoredFile } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureSchema();
  const { id } = await params;

  const { rows } = await pool.query(
    "DELETE FROM photos WHERE id = $1 RETURNING original_path, web_path, thumbnail_path",
    [id]
  );
  if (rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { original_path, web_path, thumbnail_path } = rows[0];
  for (const p of [original_path, web_path, thumbnail_path]) {
    if (p) await deleteStoredFile(p).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
