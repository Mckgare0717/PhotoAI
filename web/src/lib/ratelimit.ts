import { SEARCH_RATE_LIMIT, SEARCH_RATE_WINDOW_MS } from "./config";

/**
 * In-memory sliding-window rate limiter, per IP. Good enough for a single
 * web process; swap for Redis if the app is ever scaled horizontally.
 */

declare global {
  // eslint-disable-next-line no-var
  var __photoaiRateBuckets: Map<string, number[]> | undefined;
}

const buckets: Map<string, number[]> =
  global.__photoaiRateBuckets ?? (global.__photoaiRateBuckets = new Map());

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const windowStart = now - SEARCH_RATE_WINDOW_MS;
  const hits = (buckets.get(key) ?? []).filter((t) => t > windowStart);
  if (hits.length >= SEARCH_RATE_LIMIT) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}
