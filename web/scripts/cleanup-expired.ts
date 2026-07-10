/**
 * Retention job: deletes events past their expires_at, including all photos,
 * face embeddings, and stored files. Run daily, e.g. via cron:
 *   0 3 * * *  cd /path/to/web && npm run cleanup
 */
import { pool } from "../src/lib/db";
import { deletePrefix } from "../src/lib/storage";

async function main() {
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
