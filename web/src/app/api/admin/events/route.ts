import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { DEFAULT_RETENTION_DAYS } from "@/lib/config";
import { ensureSchema, pool } from "@/lib/db";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT e.id, e.name, e.event_date, e.slug, e.similarity_threshold, e.retention_days,
            e.expires_at, e.created_at,
            count(p.id)::int AS photo_count,
            count(p.id) FILTER (WHERE p.status IN ('queued','processing'))::int AS processing_count,
            coalesce(sum(p.face_count), 0)::int AS face_count
     FROM events e LEFT JOIN photos p ON p.event_id = e.id
     GROUP BY e.id ORDER BY e.created_at DESC`
  );
  return NextResponse.json({ events: rows });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureSchema();
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    eventDate?: string;
    retentionDays?: number;
    lawfulBasis?: string;
  };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const retention = Math.min(Math.max(body.retentionDays ?? DEFAULT_RETENTION_DAYS, 1), 365);
  const slug = randomBytes(6).toString("base64url");
  const { rows } = await pool.query(
    `INSERT INTO events (name, event_date, slug, retention_days, expires_at, lawful_basis)
     VALUES ($1, $2, $3, $4, now() + make_interval(days => $4), $5)
     RETURNING *`,
    [body.name.trim(), body.eventDate || null, slug, retention, body.lawfulBasis?.trim() || null]
  );
  return NextResponse.json({ event: rows[0] }, { status: 201 });
}
