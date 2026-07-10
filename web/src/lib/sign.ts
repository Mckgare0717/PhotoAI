import { createHmac, timingSafeEqual } from "node:crypto";
import { SESSION_SECRET } from "./config";

/**
 * Short-lived HMAC-signed URLs for stored files. Guests only receive links to
 * photos their selfie actually matched, and the links expire, so knowing a
 * photo's path is never enough on its own to fetch someone else's photos.
 */

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

function sig(storagePath: string, exp: number): string {
  // Never sign (or verify) with an empty key — that would make every guest
  // photo URL forgeable in a misconfigured deployment.
  if (!SESSION_SECRET) throw new Error("SESSION_SECRET must be set to serve files");
  return createHmac("sha256", SESSION_SECRET)
    .update(`file.${storagePath}.${exp}`)
    .digest("hex")
    .slice(0, 32);
}

export function signFileUrl(storagePath: string, ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const encoded = storagePath.split("/").map(encodeURIComponent).join("/");
  return `/api/files/${encoded}?exp=${exp}&sig=${sig(storagePath, exp)}`;
}

export function verifyFileSig(storagePath: string, exp: number, provided: string): boolean {
  if (!SESSION_SECRET) return false;
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = sig(storagePath, exp);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
