"""Out-of-distribution ("not recognised") detection for the micrograph classifier.

Usage (from backend/, after training):  .venv/Scripts/python -m ml.micrograph.ood

Fits three standard detectors on the training-set embeddings of the published model,
sets each threshold so that 95% of in-distribution *validation* micrographs are accepted,
and reports honest numbers on the untouched *test* micrographs and two OOD sets:
  • CIFAR-10 test images (natural photos) — easy OOD
  • DTD (Describable Textures Dataset) — hard OOD: textures look like microstructure
Writes frontend/public/models/micrograph_ood.json (+ .bin) for the browser.

References: Hendrycks & Gimpel 2017 (max softmax); Lee et al. 2018 (Mahalanobis).
"""

import json
import os
import pickle
import random
import tarfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
os.environ.setdefault("HF_HOME", str(BACKEND / ".cache" / "huggingface"))

import numpy as np  # noqa: E402
import timm  # noqa: E402
import torch  # noqa: E402
from PIL import Image  # noqa: E402
from sklearn.metrics import roc_auc_score  # noqa: E402
from sklearn.model_selection import train_test_split  # noqa: E402

from app.imaging import strip_info_bar  # noqa: E402
from ml.micrograph.train import MODELS, SIZE, WithCAM, dihedral, load_items, transforms  # noqa: E402

OOD = BACKEND / "data" / "ood"
WEB = BACKEND.parent / "frontend" / "public" / "models"
PCA_DIM = 128
TPR = 0.95


def ood_images() -> dict[str, list[Image.Image]]:
    sets: dict[str, list[Image.Image]] = {}
    cifar = OOD / "cifar.tar.gz"
    if cifar.exists():
        with tarfile.open(cifar) as t:
            batch = pickle.load(t.extractfile("cifar-10-batches-py/test_batch"), encoding="bytes")
        arr = batch[b"data"].reshape(-1, 3, 32, 32).transpose(0, 2, 3, 1)
        idx = np.random.default_rng(0).choice(len(arr), 1500, replace=False)
        sets["CIFAR-10 photos"] = [Image.fromarray(arr[i]) for i in idx]
    dtd = OOD / "dtd.tar.gz"
    if dtd.exists():
        imgs = []
        with tarfile.open(dtd) as t:
            members = [m for m in t.getmembers() if m.name.endswith(".jpg") and "/images/" in m.name]
            random.Random(0).shuffle(members)
            for m in members[:1500]:
                img = Image.open(t.extractfile(m)).convert("RGB")
                img.thumbnail((640, 640))  # like the downscaled micrographs
                imgs.append(img.copy())
        sets["DTD textures"] = imgs
    return sets


@torch.no_grad()
def embed(model, images, device, batch=64):
    """TTA-averaged softmax and embedding — exactly what the browser computes."""
    _, val_tf = transforms()
    probs, embs = [], []
    for i in range(0, len(images), batch):
        x = torch.stack([val_tf(strip_info_bar(im.convert("RGB"))) for im in images[i : i + batch]]).to(device)
        p_acc, e_acc = 0, 0
        for v in dihedral(x):
            logits, _, e = model(v)
            p_acc = p_acc + logits.softmax(1)
            e_acc = e_acc + e
        probs.append((p_acc / 8).cpu().numpy())
        embs.append((e_acc / 8).cpu().numpy())
    return np.concatenate(probs), np.concatenate(embs)


def fpr_at_tpr(id_scores, ood_scores, threshold):
    """Higher score = more in-distribution. Returns (ID accepted, OOD wrongly accepted)."""
    return float((id_scores >= threshold).mean()), float((ood_scores >= threshold).mean())


def main():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    meta = json.loads((MODELS / "micrograph_meta.json").read_text())
    classes = meta["classes"]
    arch = meta["architecture"].split(" ")[0]
    base = timm.create_model(arch, pretrained=False, num_classes=len(classes))
    base.load_state_dict(torch.load(MODELS / "micrograph_best.pt", map_location="cpu"))
    model = WithCAM(base).eval().to(device)

    _, items = load_items()
    labels = np.array([y for _, y in items])
    idx = np.arange(len(items))
    tr_idx, rest = train_test_split(idx, test_size=0.2, stratify=labels, random_state=0)
    va_idx, te_idx = train_test_split(rest, test_size=0.5, stratify=labels[rest], random_state=0)
    load = lambda ix: [Image.open(items[i][0]) for i in ix]  # noqa: E731

    print("Embedding train / val / test micrographs (8-view TTA)…", flush=True)
    p_tr, e_tr = embed(model, load(tr_idx), device)
    p_va, e_va = embed(model, load(va_idx), device)
    p_te, e_te = embed(model, load(te_idx), device)
    y_tr = labels[tr_idx]

    # --- Detector 2: cosine similarity to class prototypes (normalised class means)
    norm = lambda e: e / np.linalg.norm(e, axis=1, keepdims=True)  # noqa: E731
    protos = norm(np.stack([norm(e_tr[y_tr == k]).mean(0) for k in range(len(classes))]))
    cos = lambda e: (norm(e) @ protos.T).max(1)  # noqa: E731

    # --- Detector 3: Mahalanobis with shared covariance in a 128-d PCA space
    mu = e_tr.mean(0)
    _, _, vt = np.linalg.svd(e_tr - mu, full_matrices=False)
    comps = vt[:PCA_DIM]  # (128, 1280)
    z_tr = (e_tr - mu) @ comps.T
    cmeans = np.stack([z_tr[y_tr == k].mean(0) for k in range(len(classes))])
    centred = z_tr - cmeans[y_tr]
    cov = centred.T @ centred / len(z_tr) + 1e-6 * np.eye(PCA_DIM)
    prec = np.linalg.inv(cov)

    def maha(e):
        z = (e - mu) @ comps.T
        d = np.stack([np.einsum("ij,jk,ik->i", z - m, prec, z - m) for m in cmeans], 1)
        return -d.min(1)  # higher = more in-distribution

    scorers = {"max softmax": lambda p, e: p.max(1), "prototype cosine": lambda p, e: cos(e), "Mahalanobis": lambda p, e: maha(e)}

    print("Embedding OOD sets…", flush=True)
    ood = {name: embed(model, imgs, device) for name, imgs in ood_images().items()}
    if not ood:
        raise SystemExit("No OOD sets found in data/ood (cifar.tar.gz / dtd.tar.gz).")

    results = {}
    for name, f in scorers.items():
        s_va, s_te = f(p_va, e_va), f(p_te, e_te)
        thr = float(np.quantile(s_va, 1 - TPR))  # accept 95% of validation micrographs
        row = {"threshold": thr, "test_id_accepted": float((s_te >= thr).mean())}
        for oname, (p_o, e_o) in ood.items():
            s_o = f(p_o, e_o)
            auroc = roc_auc_score(np.r_[np.ones(len(s_te)), np.zeros(len(s_o))], np.r_[s_te, s_o])
            row[oname] = {"auroc": float(auroc), "ood_wrongly_accepted": float((s_o >= thr).mean())}
        results[name] = row
        print(f"\n{name}: threshold {thr:.4f}; test micrographs accepted {row['test_id_accepted']:.1%}")
        for oname in ood:
            r = row[oname]
            print(f"   {oname:<16} AUROC {r['auroc']:.3f}   OOD wrongly accepted {r['ood_wrongly_accepted']:.1%}")

    hard = "DTD textures" if "DTD textures" in ood else next(iter(ood))
    best = max(results, key=lambda n: results[n][hard]["auroc"])
    print(f"\nSelected detector: {best} (best AUROC on {hard})")

    WEB.mkdir(parents=True, exist_ok=True)
    out = {
        "method": best,
        "threshold": results[best]["threshold"],
        "tpr_target": TPR,
        "evaluation": results,
        "embedding_dim": int(e_tr.shape[1]),
        "prototypes": np.round(protos, 6).tolist(),  # also used by custom classes in the browser
    }
    if best == "Mahalanobis":
        # mean (1280) + components (128×1280) + class means (K×128) + precision (128×128), float32
        blob = np.concatenate([mu, comps.ravel(), cmeans.ravel(), prec.ravel()]).astype("<f4")
        (WEB / "micrograph_ood.bin").write_bytes(blob.tobytes())
        out["pca_dim"] = PCA_DIM
    (WEB / "micrograph_ood.json").write_text(json.dumps(out), encoding="utf-8")
    (MODELS / "micrograph_ood_report.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"Wrote {WEB / 'micrograph_ood.json'}")


if __name__ == "__main__":
    main()
