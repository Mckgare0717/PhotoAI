"""Face detection + embedding microservice.

Stateless by design: images come in, embeddings go out. Nothing is written
to disk and nothing is retained after the response is sent, which is what
lets the guest selfie flow guarantee search-and-discard.
"""

import os
import threading

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile

DET_SIZE = int(os.environ.get("DET_SIZE", "960"))
MAX_IMAGE_BYTES = int(os.environ.get("MAX_IMAGE_BYTES", str(30 * 1024 * 1024)))

app = FastAPI(title="PhotoAI face service")

_analyzer = None
_analyzer_lock = threading.Lock()


def get_analyzer():
    global _analyzer
    if _analyzer is None:
        with _analyzer_lock:
            if _analyzer is None:
                from insightface.app import FaceAnalysis

                analyzer = FaceAnalysis(
                    name=os.environ.get("INSIGHTFACE_MODEL", "buffalo_l"),
                    providers=["CPUExecutionProvider"],
                )
                # Large det_size helps with group/event photos where faces are small.
                analyzer.prepare(ctx_id=0, det_size=(DET_SIZE, DET_SIZE))
                _analyzer = analyzer
    return _analyzer


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _analyzer is not None}


@app.post("/detect")
async def detect(image: UploadFile = File(...)):
    data = await image.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="image too large")

    buf = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=422, detail="could not decode image")

    faces = get_analyzer().get(img)

    results = []
    for face in faces:
        x1, y1, x2, y2 = (float(v) for v in face.bbox)
        results.append(
            {
                "bounding_box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                "det_score": float(face.det_score),
                # L2-normalised 512-dim ArcFace embedding: cosine similarity == dot product.
                "embedding": [float(v) for v in face.normed_embedding],
            }
        )

    return {
        "width": int(img.shape[1]),
        "height": int(img.shape[0]),
        "faces": results,
    }
