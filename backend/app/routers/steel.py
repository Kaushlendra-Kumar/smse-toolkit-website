"""Steel mechanical-property prediction from composition and test temperature."""

from functools import lru_cache

import joblib
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings

router = APIRouter(prefix="/api/steel", tags=["steel"])

TEMPERATURE = "Temperature (°C)"


def _path():
    return get_settings().models_dir / "steel.joblib"


def model_ready() -> bool:
    return _path().exists()


@lru_cache
def _bundle() -> dict:
    if not model_ready():
        raise HTTPException(503, "Steel model not trained yet. Run: python -m ml.steel.train")
    return joblib.load(_path())


class SteelInput(BaseModel):
    composition: dict[str, float] = Field(
        description="Weight % per element, keys as in /api/steel/schema. Missing elements default to 0."
    )
    temperature: float = Field(27, description="Test temperature in °C")


def _matrix(bundle: dict, composition: dict[str, float], temperatures: list[float]) -> np.ndarray:
    unknown = set(composition) - set(bundle["features"])
    if unknown:
        raise HTTPException(422, f"Unknown features: {', '.join(sorted(unknown))}")
    row = [composition.get(f, 0.0) for f in bundle["features"][:-1]]
    return np.array([[*row, t] for t in temperatures], dtype=float)


def _predict(target: dict, X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    model = target["model"]
    mean = model.predict(X)
    trees = getattr(model, "estimators_", None)
    if trees is not None and len(trees) > 1:
        # Spread across the ensemble members ≈ model uncertainty.
        std = np.stack([t.predict(X) for t in trees]).std(axis=0)
    else:
        std = np.full_like(mean, target["mae"])
    return mean, std


@router.get("/schema")
def schema() -> dict:
    b = _bundle()
    return {
        "features": b["features"],
        "feature_ranges": b["feature_ranges"],
        "targets": {k: {kk: v[kk] for kk in ("label", "algorithm", "r2", "mae")} for k, v in b["targets"].items()},
        "n_samples": b["n_samples"],
        "n_alloys": b["n_alloys"],
        "examples": b["examples"],
        "comparison": b["comparison"],
    }


@router.post("/predict")
def predict(body: SteelInput) -> dict:
    b = _bundle()
    ranges = b["feature_ranges"]
    X = _matrix(b, body.composition, [body.temperature])

    warnings = []
    for f, v in zip(b["features"], X[0]):
        lo, hi = ranges[f]["min"], ranges[f]["max"]
        if v < lo - 1e-9 or v > hi + 1e-9:
            warnings.append(f"{f} = {v:g} is outside the training range [{lo:g}, {hi:g}]; prediction is an extrapolation.")

    temps = np.linspace(ranges[TEMPERATURE]["min"], ranges[TEMPERATURE]["max"], 25).round().tolist()
    X_curve = _matrix(b, body.composition, temps)

    predictions, curve = {}, {"temperature": temps}
    for key, target in b["targets"].items():
        mean, std = _predict(target, X)
        predictions[key] = {"label": target["label"], "value": round(float(mean[0]), 2), "std": round(float(std[0]), 2)}
        c_mean, c_std = _predict(target, X_curve)
        curve[key] = {"mean": c_mean.round(2).tolist(), "std": c_std.round(2).tolist()}

    return {"predictions": predictions, "curve": curve, "warnings": warnings}
