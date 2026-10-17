"""Train steel mechanical-property models on the NIMS MatNavi low-alloy steel dataset.

Usage (from backend/):  .venv/Scripts/python -m ml.steel.train

Compares the 2023 approach (multiple linear regression) against non-linear
models using GroupKFold by alloy, so every score reflects alloys the model
never saw during training. The best model per target is refit on all data
and saved to models/steel.joblib together with metrics and feature ranges.
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

BACKEND = Path(__file__).resolve().parents[2]
DATA = BACKEND / "data" / "raw" / "low_alloy_steels.csv"
OUT = BACKEND / "models" / "steel.joblib"

FEATURES = ["C", "Si", "Mn", "P", "S", "Ni", "Cr", "Mo", "Cu", "V", "Al", "N", "Ceq", "Nb + Ta", "Temperature (°C)"]
TARGETS = {
    "proof_stress": "0.2% Proof Stress (MPa)",
    "tensile_strength": "Tensile Strength (MPa)",
    "elongation": "Elongation (%)",
    "reduction_in_area": "Reduction in Area (%)",
}


def load() -> pd.DataFrame:
    df = pd.read_csv(DATA)
    df.columns = [c.strip() for c in df.columns]
    n = len(df)
    # Physically impossible rows: UTS must exceed 0.2% proof stress and stay in a sane range.
    df = df[(df["Tensile Strength (MPa)"] < 2000) & (df["Tensile Strength (MPa)"] >= df["0.2% Proof Stress (MPa)"])]
    print(f"Loaded {n} rows, kept {len(df)} after cleaning; {df['Alloy code'].nunique()} distinct alloys")
    return df.reset_index(drop=True)


def candidates() -> dict:
    return {
        "Linear regression (2023 baseline)": make_pipeline(StandardScaler(), LinearRegression()),
        "Random forest": RandomForestRegressor(n_estimators=200, min_samples_leaf=2, random_state=0, n_jobs=-1),
        "Extra trees": ExtraTreesRegressor(n_estimators=200, min_samples_leaf=2, random_state=0, n_jobs=-1),
        "Gradient boosting": HistGradientBoostingRegressor(max_iter=400, learning_rate=0.05, min_samples_leaf=10, random_state=0),
    }


def main() -> None:
    df = load()
    X, groups = df[FEATURES].to_numpy(), df["Alloy code"].to_numpy()
    cv = GroupKFold(n_splits=5)

    bundle: dict = {"features": FEATURES, "targets": {}, "comparison": {}}
    for key, col in TARGETS.items():
        y = df[col].to_numpy()
        scores = {}
        for name, model in candidates().items():
            pred = np.empty_like(y, dtype=float)
            for tr, te in cv.split(X, y, groups):
                pred[te] = model.fit(X[tr], y[tr]).predict(X[te])
            scores[name] = {"r2": round(r2_score(y, pred), 3), "mae": round(mean_absolute_error(y, pred), 2)}
        best = max(scores, key=lambda n: scores[n]["r2"])
        final = candidates()[best].fit(X, y)
        bundle["targets"][key] = {"label": col, "model": final, "algorithm": best, **scores[best]}
        bundle["comparison"][key] = scores
        print(f"\n{col}")
        for name, s in scores.items():
            print(f"  {'*' if name == best else ' '} {name:<36} R²={s['r2']:.3f}  MAE={s['mae']}")

    bundle["feature_ranges"] = {
        f: {"min": float(df[f].min()), "max": float(df[f].max()), "median": float(df[f].median())} for f in FEATURES
    }
    bundle["n_samples"] = len(df)
    bundle["n_alloys"] = int(df["Alloy code"].nunique())
    bundle["examples"] = (
        df.drop_duplicates("Alloy code").sample(6, random_state=1)[["Alloy code", *FEATURES[:-1]]]
        .rename(columns={"Alloy code": "name"}).to_dict(orient="records")
    )

    OUT.parent.mkdir(exist_ok=True)
    joblib.dump(bundle, OUT, compress=3)
    metrics = {k: {kk: vv for kk, vv in v.items() if kk != "model"} for k, v in bundle["targets"].items()}
    (OUT.parent / "steel_metrics.json").write_text(json.dumps({"best": metrics, "comparison": bundle["comparison"]}, indent=2))
    print(f"\nSaved {OUT}")


if __name__ == "__main__":
    main()
