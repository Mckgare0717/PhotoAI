import { Pool } from "pg";
import { DATABASE_URL, DEFAULT_RETENTION_DAYS, DEFAULT_SIMILARITY_THRESHOLD } from "./config";

declare global {
  // eslint-disable-next-line no-var
  var __photoaiPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __photoaiSchemaReady: Promise<void> | undefined;
}

export const pool: Pool =
  global.__photoaiPool ?? (global.__photoaiPool = new Pool({ connectionString: DATABASE_URL, max: 10 }));

const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event_date DATE,
  slug TEXT UNIQUE NOT NULL,
  similarity_threshold REAL NOT NULL DEFAULT ${DEFAULT_SIMILARITY_THRESHOLD},
  retention_days INT NOT NULL DEFAULT ${DEFAULT_RETENTION_DAYS},
  expires_at TIMESTAMPTZ NOT NULL,
  lawful_basis TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  original_path TEXT NOT NULL,
  web_path TEXT,
  thumbnail_path TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  face_count INT NOT NULL DEFAULT 0,
  width INT,
  height INT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photos_event_idx ON photos(event_id);

CREATE TABLE IF NOT EXISTS faces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  bounding_box JSONB NOT NULL,
  det_score REAL,
  embedding vector(512) NOT NULL
);
CREATE INDEX IF NOT EXISTS faces_event_idx ON faces(event_id);
CREATE INDEX IF NOT EXISTS faces_embedding_idx ON faces USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS guest_search_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'search',
  match_count INT NOT NULL DEFAULT 0,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export function ensureSchema(): Promise<void> {
  if (!global.__photoaiSchemaReady) {
    global.__photoaiSchemaReady = pool
      .query(SCHEMA_SQL)
      .then(() => undefined)
      .catch((err) => {
        global.__photoaiSchemaReady = undefined;
        throw err;
      });
  }
  return global.__photoaiSchemaReady;
}

/** Serialise a float array into pgvector's text format. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
