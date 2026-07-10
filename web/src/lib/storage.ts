import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { STORAGE_DIR } from "./config";

/**
 * Local filesystem storage. All paths stored in the DB are relative to
 * STORAGE_DIR so this module can be swapped for an S3/R2 client without
 * touching the rest of the app.
 */

function resolveSafe(storagePath: string): string {
  const abs = path.resolve(STORAGE_DIR, storagePath);
  if (!abs.startsWith(STORAGE_DIR + path.sep)) {
    throw new Error("path escapes storage root");
  }
  return abs;
}

export async function saveFile(storagePath: string, data: Buffer): Promise<void> {
  const abs = resolveSafe(storagePath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, data);
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  return readFile(resolveSafe(storagePath));
}

export async function deletePrefix(prefix: string): Promise<void> {
  await rm(resolveSafe(prefix), { recursive: true, force: true });
}

export async function deleteStoredFile(storagePath: string): Promise<void> {
  await rm(resolveSafe(storagePath), { force: true });
}

export function contentTypeFor(storagePath: string): string {
  const ext = path.extname(storagePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".heic":
      return "image/heic";
    default:
      return "application/octet-stream";
  }
}
