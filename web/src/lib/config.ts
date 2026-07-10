import path from "node:path";

export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://photoai:photoai@localhost:5432/photoai";

export const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";

export const STORAGE_DIR = path.resolve(
  process.cwd(),
  process.env.STORAGE_DIR ?? "../storage"
);

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

export const SESSION_SECRET = process.env.SESSION_SECRET ?? "";

export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

export const DEFAULT_SIMILARITY_THRESHOLD = 0.45;
export const DEFAULT_RETENTION_DAYS = 90;

// Guest search rate limit: N requests per window per IP.
export const SEARCH_RATE_LIMIT = 10;
export const SEARCH_RATE_WINDOW_MS = 5 * 60 * 1000;

export function requireSecrets() {
  if (!ADMIN_PASSWORD || !SESSION_SECRET) {
    throw new Error(
      "ADMIN_PASSWORD and SESSION_SECRET must be set (see web/.env.example)"
    );
  }
}
