"""Export the steel tree ensembles for in-browser inference.

Writes frontend/public/models/steel.bin + steel.json. Binary layout (little-endian),
N = total nodes across all trees of all targets:

    value   float32[N]  threshold (internal node) or prediction (leaf)
    left    int16[N]    left child index within its tree (-1 for a leaf)
    right   int16[N]    right child index within its tree
    feature int8[N]     split feature (-1 for a leaf)

steel.json carries per-tree [offset, node_count] plus the schema the UI needs.
Traversal mirrors scikit-learn: X is cast to float32, go left if x[f] <= threshold.
Only tree ensembles (Random forest / Extra trees) are exportable.
"""

import json
from pathlib import Path

import joblib
import numpy as np

BACKEND = Path(__file__).resolve().parents[2]
WEB = BACKEND.parent / "frontend" / "public" / "models"


def export_web(bundle: dict | None = None) -> None:
    bundle = bundle or joblib.load(BACKEND / "models" / "steel.joblib")
    values, lefts, rights, feats = [], [], [], []
    targets, offset = {}, 0
    for key, t in bundle["targets"].items():
        trees = getattr(t["model"], "estimators_", None)
        if trees is None:
            raise SystemExit(f"{key}: {t['algorithm']} is not a tree ensemble; cannot export for the browser.")
        index = []
        for est in trees:
            tr = est.tree_
            n = tr.node_count
            if n > 32767:
                raise SystemExit("Tree too large for int16 child indices.")
            leaf = tr.children_left == -1
            values.append(np.where(leaf, tr.value[:, 0, 0], tr.threshold).astype(np.float32))
            lefts.append(tr.children_left.astype(np.int16))
            rights.append(tr.children_right.astype(np.int16))
            feats.append(np.where(leaf, -1, tr.feature).astype(np.int8))
            index.append([offset, n])
            offset += n
        targets[key] = {
            "label": t["label"], "algorithm": t["algorithm"], "r2": t["r2"], "mae": t["mae"], "trees": index,
        }

    WEB.mkdir(parents=True, exist_ok=True)
    with (WEB / "steel.bin").open("wb") as f:
        for arrs in (values, lefts, rights, feats):
            f.write(np.concatenate(arrs).tobytes())
    meta = {
        "nodes": offset,
        "features": bundle["features"],
        "feature_ranges": bundle["feature_ranges"],
        "targets": targets,
        "n_samples": bundle["n_samples"],
        "n_alloys": bundle["n_alloys"],
        "examples": bundle["examples"],
        "comparison": bundle["comparison"],
    }
    (WEB / "steel.json").write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")
    print(f"Web export: {offset:,} nodes, steel.bin {(WEB / 'steel.bin').stat().st_size / 1e6:.1f} MB")
    write_fixture(bundle)


def write_fixture(bundle: dict, n: int = 200) -> None:
    """Random in-range inputs + scikit-learn predictions, checked by frontend/tests/steel-model.test.ts."""
    rng = np.random.default_rng(0)
    feats, ranges = bundle["features"], bundle["feature_ranges"]
    X = np.column_stack([rng.uniform(ranges[f]["min"], ranges[f]["max"], n) for f in feats])
    X[:, -1] = np.round(X[:, -1])
    expected = {
        key: {
            "mean": t["model"].predict(X).tolist(),
            "std": np.stack([e.predict(X) for e in t["model"].estimators_]).std(axis=0).tolist(),
        }
        for key, t in bundle["targets"].items()
    }
    out = BACKEND.parent / "frontend" / "tests" / "steel_fixture.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"features": feats, "X": X.tolist(), "expected": expected}), encoding="utf-8")


if __name__ == "__main__":
    export_web()
