-- PhotoAI schema — Postgres + pgvector
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event_date DATE,
  slug TEXT UNIQUE NOT NULL,
  -- Cosine-similarity cutoff for guest matches. Tunable per event in the admin UI.
  similarity_threshold REAL NOT NULL DEFAULT 0.45,
  retention_days INT NOT NULL DEFAULT 90,
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
  status TEXT NOT NULL DEFAULT 'queued', -- queued | processing | ready | failed
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
-- Approximate index; exact scan is also fine at single-event scale.
CREATE INDEX IF NOT EXISTS faces_embedding_idx ON faces USING hnsw (embedding vector_cosine_ops);

-- No biometric identifiers here by design: counts and timestamps only.
CREATE TABLE IF NOT EXISTS guest_search_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'search', -- search | deletion
  match_count INT NOT NULL DEFAULT 0,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
