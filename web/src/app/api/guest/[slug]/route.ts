import { NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";

type Params = { params: Promise<{ slug: string }> };

/** Public event lookup for the guest page. Exposes only what a guest needs. */
export async function GET(_req: Request, { params }: Params) {
  await ensureSchema();
  const { slug } = await params;
  const { rows } = await pool.query(
    "SELECT id, name, event_date, expires_at FROM events WHERE slug = $1",
    [slug]
  );
  if (rows.length === 0) return NextResponse.json({ error: "event not found" }, { status: 404 });
  const event = rows[0];
  if (new Date(event.expires_at) < new Date()) {
    return NextResponse.json({ error: "this event has expired" }, { status: 410 });
  }
  return NextResponse.json({ event: { name: event.name, event_date: event.event_date } });
}
