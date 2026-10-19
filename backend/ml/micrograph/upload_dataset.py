"""Upload the processed micrograph dataset to a Hugging Face dataset repo.

Usage (from backend/):
    $env:HF_TOKEN = "hf_..."; .venv/Scripts/python -m ml.micrograph.upload_dataset [--name nffa-sem-micrographs]

Uploads data/micrographs/<Class>/*.jpg (ImageFolder layout, 320 px short side) plus a
dataset card, one commit per class. Re-run the same command if interrupted: classes
already online are skipped.
Retrieve later with:  python -m ml.micrograph.download --from-hf <user>/<name>
"""

import argparse
import os
from pathlib import Path

from huggingface_hub import HfApi

DATA = Path(__file__).resolve().parents[2] / "data" / "micrographs"

CARD = """---
license: cc-by-4.0
task_categories:
- image-classification
tags:
- materials-science
- electron-microscopy
- SEM
pretty_name: NFFA-EUROPE SEM micrographs (downscaled, 10 classes)
size_categories:
- 10K<n<100K
---

# NFFA-EUROPE SEM dataset — downscaled copy

{n} scanning electron microscope images in 10 classes, stored as JPEG with a
320 px short side (ImageFolder layout: one folder per class). Used to train the
micrograph classifier of the SMSE AI Toolkit (NIT Calicut).

| Class | Images |
|---|---|
{rows}

## Source and licence

Derived from the **NFFA-EUROPE SEM Dataset** by R. Aversa, M. H. Modarres, S. Cozzini,
R. Ciancio and A. Chiusole — *“The first annotated set of scanning electron microscopy
images for nanoscience”*, Scientific Data 5, 180172 (2018),
https://doi.org/10.1038/sdata.2018.172 — original data:
https://doi.org/10.23728/b2share.19cc2afd23e34b92b36a1dfd0113a89f

Licensed **CC BY 4.0**. Changes: images were downscaled to a 320 px short side and
re-encoded as JPEG (quality 92); class labels are unchanged.
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--token", default=os.environ.get("HF_TOKEN"))
    ap.add_argument("--name", default="nffa-sem-micrographs")
    args = ap.parse_args()
    if not args.token:
        raise SystemExit("Pass --token or set HF_TOKEN (a *write* token from https://huggingface.co/settings/tokens).")

    classes = sorted(d.name for d in DATA.iterdir() if d.is_dir() and (d / ".complete").exists())
    counts = {c: len(list((DATA / c).glob("*.jpg"))) for c in classes}
    if len(classes) < 10:
        print(f"! Only {len(classes)} complete classes found: {', '.join(classes)}")

    api = HfApi(token=args.token)
    repo_id = f"{api.whoami()['name']}/{args.name}"
    api.create_repo(repo_id, repo_type="dataset", exist_ok=True)
    rows = "\n".join(f"| {c.replace('_', ' ')} | {n:,} |" for c, n in counts.items())
    (DATA / "README.md").write_text(CARD.format(n=f"{sum(counts.values()):,}", rows=rows), encoding="utf-8")

    # One commit per class (each ≤ ~4.2k files). Classes already complete online are skipped,
    # so re-running after an interruption resumes instead of starting over.
    online: dict[str, int] = {}
    for f in api.list_repo_files(repo_id, repo_type="dataset"):
        if f.endswith(".jpg") and "/" in f:
            online[f.split("/")[0]] = online.get(f.split("/")[0], 0) + 1
    for c in classes:
        if online.get(c, 0) >= counts[c]:
            print(f"✓ {c} already uploaded")
            continue
        print(f"↑ {c}: {counts[c]:,} images…", flush=True)
        api.upload_folder(
            repo_id=repo_id, repo_type="dataset", folder_path=DATA / c, path_in_repo=c,
            allow_patterns=["*.jpg"], commit_message=f"Add {c} ({counts[c]} images)",
        )
    api.upload_file(
        path_or_fileobj=DATA / "README.md", path_in_repo="README.md",
        repo_id=repo_id, repo_type="dataset", commit_message="Dataset card",
    )
    print(f"\nUploaded {sum(counts.values()):,} images: https://huggingface.co/datasets/{repo_id}")


if __name__ == "__main__":
    main()
