import { ML_SERVICE_URL } from "./config";

export interface DetectedFace {
  bounding_box: { x1: number; y1: number; x2: number; y2: number };
  det_score: number;
  embedding: number[];
}

export interface DetectResult {
  width: number;
  height: number;
  faces: DetectedFace[];
}

/**
 * Send image bytes to the face service and get embeddings back. The buffer
 * only ever lives in memory here — nothing is persisted on either side,
 * which is what the guest privacy promise relies on.
 */
export async function detectFaces(imageBuffer: Buffer, filename: string): Promise<DetectResult> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(imageBuffer)]), filename);

  const res = await fetch(`${ML_SERVICE_URL}/detect`, { method: "POST", body: form });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`face service error ${res.status}: ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as DetectResult;
}

/** Pick the most prominent face in a selfie (largest box wins). */
export function primaryFace(result: DetectResult): DetectedFace | undefined {
  return [...result.faces].sort((a, b) => {
    const areaA = (a.bounding_box.x2 - a.bounding_box.x1) * (a.bounding_box.y2 - a.bounding_box.y1);
    const areaB = (b.bounding_box.x2 - b.bounding_box.x1) * (b.bounding_box.y2 - b.bounding_box.y1);
    return areaB - areaA;
  })[0];
}
