import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { checkPassword } from "@/lib/auth";
import { ensureSchema, pool } from "@/lib/db";
import { deletePrefix } from "@/lib/storage";

export const maxDuration = 300;

/**
 * Retention enforcement over HTTP, for deployments where the standalone
 * server image can't run scripts/cleanup-expired.ts (which needs dev deps).
 * Authenticate with an admin session cookie, or for cron jobs with the
 * admin password in a header:
 *
 *   0 3 * * *  curl -fsS -X POST -H "x-admin-password: $ADMIN_PASSWORD" \
 *                 https://your-host/api/admin/cleanup
 */
export async function POST(req: Request) {
  const headerPassword = req.headers.get("x-admin-password");
  const authorized = (headerPassword && checkPassword(headerPassword)) || (await isAdmin());
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await ensureSchema();
  const { rows } = await pool.query(
    "DELETE FROM events WHERE expires_at < now() RETURNING id, name"
  );
  for (const event of rows) {
    await deletePrefix(`events/${event.id}`);
  }
  return NextResponse.json({
    removed: rows.map((e) => ({ id: e.id, name: e.name })),
    count: rows.length,
  });
}
