/**
 * Retention job: deletes events past their expires_at, including all photos,
 * face embeddings, and stored files. Run daily, e.g. via cron:
 *   0 3 * * *  cd /path/to/web && npm run cleanup
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Next.js loads .env automatically but tsx does not; mirror that here so the
// script sees the same DATABASE_URL/STORAGE_DIR as the app. Real env vars win.
const envFile = path.resolve(process.cwd(), ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !line.trimStart().startsWith("#") && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

async function main() {
  const { pool } = await import("../src/lib/db");
  const { deletePrefix } = await import("../src/lib/storage");

  const { rows } = await pool.query(
    "DELETE FROM events WHERE expires_at < now() RETURNING id, name"
  );
  for (const event of rows) {
    await deletePrefix(`events/${event.id}`);
    console.log(`deleted expired event ${event.id} (${event.name})`);
  }
  console.log(`cleanup complete: ${rows.length} event(s) removed`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
