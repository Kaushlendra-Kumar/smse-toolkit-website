"""Deploy the API to a Hugging Face Space (Docker SDK, free CPU tier).

Usage (from backend/):
    $env:HF_TOKEN = "hf_..."; .venv/Scripts/python deploy_space.py [--name smse-toolkit-api]

Needs a Hugging Face *write* token (https://huggingface.co/settings/tokens). Reads
MP_API_KEY / CROSSREF_MAILTO from backend/.env and stores them as encrypted Space
secrets — they are never uploaded as files.
"""

import argparse
import os
import shutil
import tempfile
from pathlib import Path

from huggingface_hub import HfApi

from app.config import get_settings

BACKEND = Path(__file__).resolve().parent
REQUIRED_MODELS = ["steel.joblib", "micrograph.onnx", "micrograph_meta.json"]

SPACE_README = """---
title: SMSE AI Toolkit API
emoji: 🔬
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
short_description: Micrograph recognition, steel properties, materials lookup
---

Backend API for the SMSE AI Toolkit (School of Materials Science and Engineering,
NIT Calicut). Interactive docs at `/docs`.

Data: NFFA-EUROPE SEM dataset (CC-BY 4.0), NIMS MatNavi, Materials Project.
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--token", default=os.environ.get("HF_TOKEN"), help="Hugging Face write token (default: $HF_TOKEN)")
    ap.add_argument("--name", default="smse-toolkit-api", help="Space name")
    args = ap.parse_args()
    if not args.token:
        raise SystemExit("Pass --token or set HF_TOKEN (create a *write* token at https://huggingface.co/settings/tokens).")

    missing = [m for m in REQUIRED_MODELS if not (BACKEND / "models" / m).exists()]
    if missing:
        raise SystemExit(f"Train the models first; missing in models/: {', '.join(missing)}")

    api = HfApi(token=args.token)
    user = api.whoami()["name"]
    repo_id = f"{user}/{args.name}"
    api.create_repo(repo_id, repo_type="space", space_sdk="docker", exist_ok=True)

    # Stage exactly what the container needs.
    with tempfile.TemporaryDirectory() as tmp:
        stage = Path(tmp)
        shutil.copytree(BACKEND / "app", stage / "app", ignore=shutil.ignore_patterns("__pycache__"))
        (stage / "models").mkdir()
        for m in REQUIRED_MODELS:
            shutil.copy2(BACKEND / "models" / m, stage / "models" / m)
        for f in ("Dockerfile", "requirements.txt", ".dockerignore"):
            shutil.copy2(BACKEND / f, stage / f)
        (stage / "README.md").write_text(SPACE_README, encoding="utf-8")
        api.upload_folder(repo_id=repo_id, repo_type="space", folder_path=stage, commit_message="Deploy SMSE AI Toolkit API")

    settings = get_settings()
    if settings.mp_api_key:
        api.add_space_secret(repo_id, "MP_API_KEY", settings.mp_api_key)
    else:
        print("! MP_API_KEY not set in backend/.env — Materials Explorer will be disabled until you add it as a Space secret.")
    if settings.crossref_mailto:
        api.add_space_secret(repo_id, "CROSSREF_MAILTO", settings.crossref_mailto)

    host = repo_id.replace("/", "-").replace("_", "-").lower()
    print(f"\nDeployed: https://huggingface.co/spaces/{repo_id}")
    print(f"API URL (set as API_URL on Vercel): https://{host}.hf.space")
    print("The first build takes a few minutes; watch the 'Logs' tab on the Space page.")


if __name__ == "__main__":
    main()
