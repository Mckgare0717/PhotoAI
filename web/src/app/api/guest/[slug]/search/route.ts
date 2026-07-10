import { NextResponse } from "next/server";
import { ensureSchema, pool, toVectorLiteral } from "@/lib/db";
import { detectFaces, primaryFace } from "@/lib/ml";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";
import { signFileUrl } from "@/lib/sign";

export const maxDuration = 60;

type Params = { params: Promise<{ slug: string }> };

/**
 * Guest selfie search. Privacy contract: the selfie and its embedding exist
 * only in memory for the duration of this request. Nothing biometric is
 * written to disk, the database, or the logs — only an anonymous
 * (event, timestamp, match_count) row is recorded.
 */
export async function POST(req: Request, { params }: Params) {
  await ensureSchema();
  const { slug } = await params;

  if (!checkRateLimit(`search:${clientIp(req)}`)) {
    return NextResponse.json(
      { error: "Too many searches — please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  const { rows } = await pool.query(
    "SELECT id, similarity_threshold, expires_at FROM events WHERE slug = $1",
    [slug]
  );
  if (rows.length === 0) return NextResponse.json({ error: "event not found" }, { status: 404 });
  const event = rows[0];
  if (new Date(event.expires_at) < new Date()) {
    return NextResponse.json({ error: "this event has expired" }, { status: 410 });
  }

  const form = await req.formData();
  const selfie = form.get("selfie");
  const consent = form.get("consent");
  if (consent !== "true") {
    return NextResponse.json({ error: "consent is required" }, { status: 400 });
  }
  if (!(selfie instanceof File) || selfie.size === 0) {
    return NextResponse.json({ error: "no selfie provided" }, { status: 400 });
  }
  if (selfie.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "selfie too large (max 15MB)" }, { status: 413 });
  }

  // In-memory only: never persisted.
  const selfieBuffer = Buffer.from(await selfie.arrayBuffer());
  const detection = await detectFaces(selfieBuffer, "selfie.jpg");
  const face = primaryFace(detection);
  if (!face) {
    return NextResponse.json(
      { error: "We couldn't find a face in that photo. Try better lighting and face the camera." },
      { status: 422 }
    );
  }

  const matches = await pool.query(
    `SELECT p.id, p.original_filename, p.original_path, p.web_path, p.thumbnail_path,
            max(1 - (f.embedding <=> $1::vector))::float AS similarity
     FROM faces f
     JOIN photos p ON p.id = f.photo_id
     WHERE f.event_id = $2 AND p.status = 'ready'
       AND (1 - (f.embedding <=> $1::vector)) >= $3
     GROUP BY p.id
     ORDER BY similarity DESC
     LIMIT 500`,
    [toVectorLiteral(face.embedding), event.id, event.similarity_threshold]
  );

  await pool.query(
    "INSERT INTO guest_search_logs (event_id, kind, match_count) VALUES ($1, 'search', $2)",
    [event.id, matches.rows.length]
  );

  return NextResponse.json({
    matchCount: matches.rows.length,
    results: matches.rows.map((row) => ({
      photoId: row.id,
      filename: row.original_filename,
      similarity: row.similarity,
      thumbnailUrl: row.thumbnail_path ? signFileUrl(row.thumbnail_path, 3600) : null,
      webUrl: row.web_path ? signFileUrl(row.web_path, 3600) : null,
      downloadUrl: signFileUrl(row.original_path, 3600),
    })),
  });
}
