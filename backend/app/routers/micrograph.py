"""SEM micrograph classification served from an ONNX export of the trained CNN."""

import io
import json
from functools import lru_cache

import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from app.config import get_settings
from app.imaging import strip_info_bar

router = APIRouter(prefix="/api/micrograph", tags=["micrograph"])

MAX_BYTES = 15 * 1024 * 1024


def _paths():
    d = get_settings().models_dir
    return d / "micrograph.onnx", d / "micrograph_meta.json"


def model_ready() -> bool:
    return all(p.exists() for p in _paths())


@lru_cache
def _load():
    if not model_ready():
        raise HTTPException(503, "Micrograph model not trained yet. See backend/ml/micrograph/README.md")
    import onnxruntime as ort

    onnx_path, meta_path = _paths()
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    return session, json.loads(meta_path.read_text())


def preprocess(img: Image.Image, size: int, mean: list[float], std: list[float]) -> np.ndarray:
    """Match the validation transform: strip SEM data panel, resize short side, center crop, normalize."""
    img = strip_info_bar(img.convert("RGB"))
    w, h = img.size
    scale = size / min(w, h)
    img = img.resize((max(size, round(w * scale)), max(size, round(h * scale))), Image.BICUBIC)
    w, h = img.size
    left, top = (w - size) // 2, (h - size) // 2
    img = img.crop((left, top, left + size, top + size))
    arr = (np.asarray(img, dtype=np.float32) / 255.0 - mean) / std
    return arr.transpose(2, 0, 1)[None].astype(np.float32)


@router.get("/info")
def info() -> dict:
    _, meta = _load()
    return {k: meta[k] for k in ("classes", "descriptions", "architecture", "metrics", "dataset") if k in meta}


@router.post("/predict")
async def predict(file: UploadFile = File(...)) -> dict:
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Image too large (max 15 MB).")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(422, "Could not read that file as an image.") from None

    session, meta = _load()
    x = preprocess(img, meta["input_size"], meta["mean"], meta["std"])
    logits = session.run(None, {session.get_inputs()[0].name: x})[0][0]
    probs = np.exp(logits - logits.max())
    probs /= probs.sum()
    order = np.argsort(probs)[::-1]
    return {
        "predictions": [
            {"label": meta["classes"][i], "probability": round(float(probs[i]), 4)} for i in order
        ],
        "image": {"width": img.width, "height": img.height, "mode": img.mode},
    }
