# PhotoAI — Event Photography with Private Face Search

Two-sided event photo platform:

- **Photographer/Admin portal** — create events, bulk-upload photos, automatic
  background face indexing, processing dashboard, QR code + share link.
- **Guest portal** — scan the event QR code, consent, take/upload a selfie, and
  instantly see every photo you appear in. View, select, download individually
  or as a zip. **The selfie is never stored** — search-and-discard only.

## Architecture

```
┌──────────────┐   embeddings    ┌────────────────────┐
│  web (Next)  │ ───────────────▶│ ml-service (FastAPI│
│  UI + API    │◀─────────────── │ InsightFace/ArcFace│
└──────┬───────┘   face vectors  └────────────────────┘
       │
       ├── Postgres 16 + pgvector (events, photos, faces[vector(512)], logs)
       └── Local file storage (originals / web / thumbs) — S3-swappable
```

- `web/` — Next.js 15 (App Router) + Tailwind. Business API lives in
  `src/app/api/*` route handlers; upload → thumbnail → face-indexing pipeline
  in `src/lib/pipeline.ts` (in-process queue, concurrency 3).
- `ml-service/` — stateless FastAPI service exposing `POST /detect`
  (image in → bounding boxes + L2-normalised 512-d ArcFace embeddings out).
  Uses InsightFace `buffalo_l` on CPU; nothing touches disk.
- `db/init.sql` — schema (also auto-applied by the web app on first query).

## Quick start (Docker)

```bash
export ADMIN_PASSWORD=pick-a-password
export SESSION_SECRET=$(openssl rand -hex 32)
docker compose up --build
```

Then open http://localhost:3000/admin (first ML image build downloads the
InsightFace model, ~300MB).

## Quick start (local dev)

```bash
# 1. Postgres with pgvector, database "photoai" (user photoai/photoai)
#    e.g. docker run -p 5432:5432 -e POSTGRES_USER=photoai -e POSTGRES_PASSWORD=photoai -e POSTGRES_DB=photoai pgvector/pgvector:pg16

# 2. ML service
cd ml-service
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000

# 3. Web app
cd web
cp .env.example .env   # fill in ADMIN_PASSWORD + SESSION_SECRET
npm install
npm run dev
```

## How matching works

- Every uploaded photo is resized (web 1600px + thumb 480px, EXIF-rotated,
  metadata stripped) and sent to the ML service; each detected face's
  embedding is stored in `faces.embedding vector(512)` with an HNSW index.
- A guest selfie is embedded the same way (largest detected face wins) and
  compared by cosine similarity: `1 - (embedding <=> query)`.
- Photos with any face at/above the event's threshold are returned ranked by
  best similarity.

### Similarity threshold

Tunable per event in the admin UI (default **0.45**). Note: the project brief
suggested ~0.6, but for InsightFace `buffalo_l` normalised embeddings the
practical same-person range is roughly 0.35–0.65 — 0.6 misses many true
matches in event conditions (angles, low light). Start at 0.45; raise it if
guests see strangers (e.g. siblings/lookalikes), lower to ~0.35 to catch more.

## Privacy & GDPR posture (built in, not bolted on)

- **Consent screen** before any selfie capture, explaining exactly what is
  processed, that biometrics are involved, and the single-use guarantee.
- **Search-and-discard**: the guest selfie and its embedding live only in
  request memory (`web/src/app/api/guest/[slug]/search/route.ts`,
  `ml-service/app/main.py`) — never written to disk, DB, or logs.
- **No biometric logging**: `guest_search_logs` stores event id, timestamp,
  and match count only.
- **Right to erasure**: guests can delete their face embeddings from an event
  via "Delete my face data" (fresh selfie → matching vectors deleted; the
  selfie follows the same discard rule).
- **Retention**: events auto-expire (default 90 days, per-event tunable up to
  365). Expired events return `410` to guests; `npm run cleanup` (cron it
  daily) hard-deletes expired events, embeddings, and files.
- **Lawful basis**: organizers can record their lawful basis per event in the
  admin UI (e.g. explicit consent collected at event sign-in).
- **Scoped access**: guests only ever receive short-lived HMAC-signed URLs to
  photos their own selfie matched; the zip endpoint re-verifies each
  signature. No cross-event matching anywhere.
- **Rate limiting** on guest search and deletion endpoints (10 requests /
  5 min / IP) to deter scraping-by-selfie.

## Environment variables (web)

See `web/.env.example`. Required in production: `DATABASE_URL`,
`ML_SERVICE_URL`, `STORAGE_DIR`, `ADMIN_PASSWORD`, `SESSION_SECRET`,
`NEXT_PUBLIC_BASE_URL`.

## Deliberate MVP simplifications

- **Storage** is a thin module (`web/src/lib/storage.ts`) over the local
  filesystem; swap for S3/R2 by reimplementing its five functions.
- **Job queue** is in-process with bounded concurrency; `requeueStalled()`
  recovers photos stuck after a crash. Move to BullMQ/Redis for multi-node.
- **Rate limiter** is in-memory (single process).
- **Admin auth** is a single shared password (`ADMIN_PASSWORD`) with signed
  HTTP-only session cookies — add per-photographer accounts when multiple
  photographers need separate access.
