"""Copy one held-out test image per class into the frontend's sample gallery.

Usage (from backend/): .venv/Scripts/python -m ml.micrograph.samples

Uses the exact split from train.py, so the samples are images the model never trained on.
The first test image of each class is taken (no cherry-picking).
"""

import shutil
from pathlib import Path

import numpy as np
from sklearn.model_selection import train_test_split

from ml.micrograph.train import load_items

OUT = Path(__file__).resolve().parents[3] / "frontend" / "public" / "samples"
WANTED = ["Fibres", "Nanowires", "Particles", "Porous_Sponge", "Biological", "Tips"]


def main() -> None:
    classes, items = load_items()
    labels = [y for _, y in items]
    idx = np.arange(len(items))
    _, rest = train_test_split(idx, test_size=0.2, stratify=labels, random_state=0)
    _, te_idx = train_test_split(rest, test_size=0.5, stratify=[labels[i] for i in rest], random_state=0)
    OUT.mkdir(parents=True, exist_ok=True)
    for name in WANTED:
        c = classes.index(name)
        path = next(items[i][0] for i in sorted(te_idx) if items[i][1] == c)
        shutil.copy2(path, OUT / f"{name}.jpg")
        print(f"{name}: {path.name}")
    (OUT / "LICENSE.txt").write_text(
        "Sample images from the NFFA-EUROPE SEM dataset — Aversa et al., Scientific Data 5, 180172 (2018),\n"
        "doi:10.1038/sdata.2018.172 — licensed CC-BY 4.0. Downscaled; otherwise unmodified.\n"
    )


if __name__ == "__main__":
    main()
