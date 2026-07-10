import sharp from "sharp";
import { pool, toVectorLiteral } from "./db";
import { detectFaces } from "./ml";
import { readStoredFile, saveFile } from "./storage";

/**
 * Background face-indexing pipeline. Runs in-process with bounded
 * concurrency — fine for hundreds of photos per event. If events grow to
 * many thousands of photos, lift this into a real job queue (BullMQ etc.)
 * without changing processPhoto itself.
 */

const CONCURRENCY = 3;

let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= CONCURRENCY) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export function enqueuePhoto(photoId: string): void {
  // Fire and forget; failures land in the photo row's status/error columns.
  void withSlot(() => processPhoto(photoId)).catch((err) => {
    console.error(`photo ${photoId} processing failed:`, err);
  });
}

async function processPhoto(photoId: string): Promise<void> {
  const { rows } = await pool.query(
    "UPDATE photos SET status = 'processing' WHERE id = $1 RETURNING event_id, original_path, original_filename",
    [photoId]
  );
  if (rows.length === 0) return; // deleted while queued
  const { event_id: eventId, original_path: originalPath, original_filename: filename } = rows[0];

  try {
    const original = await readStoredFile(originalPath);

    // Derivatives: auto-rotated by EXIF, stripped of metadata.
    const image = sharp(original, { failOn: "none" }).rotate();
    const meta = await image.metadata();
    const webBuf = await image
      .clone()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    const thumbBuf = await image
      .clone()
      .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();

    const webPath = `events/${eventId}/web/${photoId}.jpg`;
    const thumbPath = `events/${eventId}/thumbs/${photoId}.jpg`;
    await saveFile(webPath, webBuf);
    await saveFile(thumbPath, thumbBuf);

    // Detect on the web-sized version: big enough for small faces in group
    // shots, far cheaper than shipping 20MB originals to the ML service.
    const detection = await detectFaces(webBuf, filename);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM faces WHERE photo_id = $1", [photoId]);
      for (const face of detection.faces) {
        await client.query(
          `INSERT INTO faces (photo_id, event_id, bounding_box, det_score, embedding)
           VALUES ($1, $2, $3, $4, $5::vector)`,
          [
            photoId,
            eventId,
            JSON.stringify(face.bounding_box),
            face.det_score,
            toVectorLiteral(face.embedding),
          ]
        );
      }
      await client.query(
        `UPDATE photos
         SET status = 'ready', error = NULL, face_count = $2, web_path = $3, thumbnail_path = $4,
             width = $5, height = $6
         WHERE id = $1`,
        [photoId, detection.faces.length, webPath, thumbPath, meta.width ?? null, meta.height ?? null]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query("UPDATE photos SET status = 'failed', error = $2 WHERE id = $1", [
      photoId,
      message.slice(0, 500),
    ]);
    throw err;
  }
}

/** Re-queue photos stuck from a previous process (e.g. after a restart). */
export async function requeueStalled(eventId: string): Promise<number> {
  const { rows } = await pool.query(
    `UPDATE photos SET status = 'queued'
     WHERE event_id = $1 AND status IN ('processing', 'failed')
     RETURNING id`,
    [eventId]
  );
  for (const row of rows) enqueuePhoto(row.id);
  return rows.length;
}
