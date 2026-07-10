import { NextResponse } from "next/server";
import { ensureSchema, pool, toVectorLiteral } from "@/lib/db";
import { detectFaces, primaryFace } from "@/lib/ml";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";

export const maxDuration = 60;

type Params = { params: Promise<{ slug: string }> };

/**
 * GDPR-style erasure: the guest submits a fresh selfie, we delete every
 * stored face embedding that matches it. The selfie itself follows the same
 * search-and-discard rule as /search. The photos remain (they may contain
 * other people); only this guest's biometric vectors are removed, so they
 * will no longer be findable by face search.
 */
export async function POST(req: Request, { params }: Params) {
  await ensureSchema();
  const { slug } = await params;

  if (!checkRateLimit(`delete:${clientIp(req)}`)) {
    return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });
  }

  const { rows } = await pool.query(
    "SELECT id, similarity_threshold FROM events WHERE slug = $1",
    [slug]
  );
  if (rows.length === 0) return NextResponse.json({ error: "event not found" }, { status: 404 });
  const event = rows[0];

  const form = await req.formData();
  const selfie = form.get("selfie");
  if (!(selfie instanceof File) || selfie.size === 0) {
    return NextResponse.json({ error: "no selfie provided" }, { status: 400 });
  }

  const selfieBuffer = Buffer.from(await selfie.arrayBuffer());
  const detection = await detectFaces(selfieBuffer, "selfie.jpg");
  const face = primaryFace(detection);
  if (!face) {
    return NextResponse.json({ error: "We couldn't find a face in that photo." }, { status: 422 });
  }

  const deleted = await pool.query(
    `DELETE FROM faces
     WHERE event_id = $2 AND (1 - (embedding <=> $1::vector)) >= $3
     RETURNING photo_id`,
    [toVectorLiteral(face.embedding), event.id, event.similarity_threshold]
  );

  await pool.query(
    "INSERT INTO guest_search_logs (event_id, kind, match_count) VALUES ($1, 'deletion', $2)",
    [event.id, deleted.rows.length]
  );

  return NextResponse.json({ deletedFaceCount: deleted.rows.length });
}
