import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { isAdmin } from "@/lib/auth";
import { BASE_URL } from "@/lib/config";
import { ensureSchema, pool } from "@/lib/db";
import { deletePrefix } from "@/lib/storage";
import { signFileUrl } from "@/lib/sign";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureSchema();
  const { id } = await params;

  const { rows } = await pool.query("SELECT * FROM events WHERE id = $1", [id]);
  if (rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  const event = rows[0];

  const photos = await pool.query(
    `SELECT id, original_filename, status, error, face_count, thumbnail_path, uploaded_at
     FROM photos WHERE event_id = $1 ORDER BY uploaded_at DESC`,
    [id]
  );
  const stats = await pool.query(
    `SELECT count(*)::int AS searches FROM guest_search_logs WHERE event_id = $1 AND kind = 'search'`,
    [id]
  );

  const guestUrl = `${BASE_URL}/e/${event.slug}`;
  const qrDataUrl = await QRCode.toDataURL(guestUrl, { width: 320, margin: 1 });

  return NextResponse.json({
    event,
    guestUrl,
    qrDataUrl,
    searchCount: stats.rows[0].searches,
    photos: photos.rows.map((p) => ({
      ...p,
      thumbnail_url: p.thumbnail_path ? signFileUrl(p.thumbnail_path) : null,
      thumbnail_path: undefined,
    })),
  });
}

export async function PATCH(req: Request, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureSchema();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    similarityThreshold?: number;
    retentionDays?: number;
    name?: string;
    lawfulBasis?: string;
  };

  const updates: string[] = [];
  const values: unknown[] = [id];
  if (body.similarityThreshold !== undefined) {
    const t = Number(body.similarityThreshold);
    if (!Number.isFinite(t) || t < 0.1 || t > 0.95) {
      return NextResponse.json({ error: "threshold must be between 0.1 and 0.95" }, { status: 400 });
    }
    values.push(t);
    updates.push(`similarity_threshold = $${values.length}`);
  }
  if (body.retentionDays !== undefined) {
    const d = Math.min(Math.max(Number(body.retentionDays), 1), 365);
    values.push(d);
    updates.push(`retention_days = $${values.length}`);
    updates.push(`expires_at = created_at + make_interval(days => $${values.length})`);
  }
  if (body.name?.trim()) {
    values.push(body.name.trim());
    updates.push(`name = $${values.length}`);
  }
  if (body.lawfulBasis !== undefined) {
    values.push(body.lawfulBasis.trim() || null);
    updates.push(`lawful_basis = $${values.length}`);
  }
  if (updates.length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const { rows } = await pool.query(
    `UPDATE events SET ${updates.join(", ")} WHERE id = $1 RETURNING *`,
    values
  );
  if (rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ event: rows[0] });
}

export async function DELETE(_req: Request, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureSchema();
  const { id } = await params;
  const { rowCount } = await pool.query("DELETE FROM events WHERE id = $1", [id]);
  if (!rowCount) return NextResponse.json({ error: "not found" }, { status: 404 });
  await deletePrefix(`events/${id}`);
  return NextResponse.json({ ok: true });
}
