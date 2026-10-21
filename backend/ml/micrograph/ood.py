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
KNN_BANK = 2000
KNN_K = 10
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
    dtd_dir = OOD / "dtd_sample"
    if dtd.exists() and not (dtd_dir / ".done").exists():
        # Extract a fixed random sample once, in archive order (gzip has no random access:
        # reading members out of order re-decompresses the archive every time).
        with tarfile.open(dtd) as t:
            names = [m.name for m in t.getmembers() if m.name.endswith(".jpg") and "/images/" in m.name]
        wanted = set(random.Random(0).sample(names, min(1500, len(names))))
        dtd_dir.mkdir(parents=True, exist_ok=True)
        with tarfile.open(dtd, mode="r|gz") as t:  # streaming, single pass
            for m in t:
                if m.name in wanted:
                    img = Image.open(t.extractfile(m)).convert("RGB")
                    img.thumbnail((640, 640))  # like the downscaled micrographs
                    img.save(dtd_dir / Path(m.name).name, quality=92)
        (dtd_dir / ".done").write_text("ok")
    if (dtd_dir / ".done").exists():
        sets["DTD textures"] = sorted(dtd_dir.glob("*.jpg"))
    return sets


@torch.no_grad()
def embed(model, images, device, batch=64):
    """TTA-averaged softmax and embedding — exactly what the browser computes."""
    _, val_tf = transforms()
    probs, embs = [], []

    def as_image(item):
        if isinstance(item, Path):  # open lazily — thousands of open handles exceed OS limits
            with Image.open(item) as im:
                return im.convert("RGB")
        return item.convert("RGB")

    for i in range(0, len(images), batch):
        x = torch.stack([val_tf(strip_info_bar(as_image(im))) for im in images[i : i + batch]]).to(device)
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
    load = lambda ix: [Path(items[i][0]) for i in ix]  # noqa: E731

    # Embeddings are cached per model checkpoint, so re-running the analysis is instant.
    stamp = int((MODELS / "micrograph_best.pt").stat().st_mtime)
    cache = BACKEND / ".cache" / f"ood_embeddings_{stamp}.npz"
    if cache.exists():
        z = np.load(cache)
        p_tr, e_tr, p_va, e_va, p_te, e_te = (z[k] for k in ("p_tr", "e_tr", "p_va", "e_va", "p_te", "e_te"))
        print("Loaded cached micrograph embeddings.", flush=True)
    else:
        print("Embedding train / val / test micrographs (8-view TTA)…", flush=True)
        p_tr, e_tr = embed(model, load(tr_idx), device)
        p_va, e_va = embed(model, load(va_idx), device)
        p_te, e_te = embed(model, load(te_idx), device)
        cache.parent.mkdir(exist_ok=True)
        np.savez(cache, p_tr=p_tr, e_tr=e_tr, p_va=p_va, e_va=e_va, p_te=p_te, e_te=e_te)
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

    # --- Detector 4: k-nearest-neighbour distance on L2-normalised features (Sun et al., ICML 2022)
    # Browser-sized: normalised features → PCA-128 → re-normalised; bank of KNN_BANK training images.
    n_tr = norm(e_tr)
    nmu = n_tr.mean(0)
    _, _, nvt = np.linalg.svd(n_tr - nmu, full_matrices=False)
    ncomps = nvt[:PCA_DIM]
    proj = lambda e: norm((norm(e) - nmu) @ ncomps.T)  # noqa: E731
    bank_idx = np.random.default_rng(0).choice(len(n_tr), min(KNN_BANK, len(n_tr)), replace=False)
    bank = proj(e_tr[bank_idx])

    def knn(e):
        sims = proj(e) @ bank.T  # cosine similarity to every bank image
        return np.sort(sims, axis=1)[:, -KNN_K]  # k-th largest similarity: higher = more in-distribution

    # --- Detector 5: max softmax + kNN, each standardised on the validation micrographs
    def zfit(f):
        v = f(p_va, e_va)
        return v.mean(), v.std() + 1e-9
    msp_mu, msp_sd = zfit(lambda p, e: p.max(1))
    knn_mu, knn_sd = zfit(lambda p, e: knn(e))
    combo = lambda p, e: (p.max(1) - msp_mu) / msp_sd + (knn(e) - knn_mu) / knn_sd  # noqa: E731

    scorers = {
        "max softmax": lambda p, e: p.max(1),
        "prototype cosine": lambda p, e: cos(e),
        "Mahalanobis": lambda p, e: maha(e),
        "kNN": lambda p, e: knn(e),
        "softmax + kNN": combo,
    }

    ood_cache = BACKEND / ".cache" / f"ood_sets_{stamp}.npz"
    if ood_cache.exists():
        z = np.load(ood_cache)
        names = [str(n) for n in z["names"]]
        ood = {n: (z[f"p{i}"], z[f"e{i}"]) for i, n in enumerate(names)}
        print("Loaded cached OOD embeddings.", flush=True)
    else:
        print("Embedding OOD sets…", flush=True)
        ood = {name: embed(model, imgs, device) for name, imgs in ood_images().items()}
        arrays = {f"p{i}": v[0] for i, v in enumerate(ood.values())} | {f"e{i}": v[1] for i, v in enumerate(ood.values())}
        np.savez(ood_cache, names=np.array(list(ood)), **arrays)
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
    if best in ("kNN", "softmax + kNN"):
        # norm-mean (D) + components (P×D) + bank (B×P), float32
        blob = np.concatenate([nmu, ncomps.ravel(), bank.ravel()]).astype("<f4")
        (WEB / "micrograph_ood.bin").write_bytes(blob.tobytes())
        out.update(pca_dim=PCA_DIM, knn_k=KNN_K, bank_size=int(len(bank)),
                   zscore={"msp": [float(msp_mu), float(msp_sd)], "knn": [float(knn_mu), float(knn_sd)]})
    if best == "Mahalanobis":
        # mean (1280) + components (128×1280) + class means (K×128) + precision (128×128), float32
        blob = np.concatenate([mu, comps.ravel(), cmeans.ravel(), prec.ravel()]).astype("<f4")
        (WEB / "micrograph_ood.bin").write_bytes(blob.tobytes())
        out["pca_dim"] = PCA_DIM
    (WEB / "micrograph_ood.json").write_text(json.dumps(out), encoding="utf-8")
    # Parity fixture for the browser implementation (frontend/tests/ood.test.ts).
    pick = [(p_te[i], e_te[i]) for i in range(5)] + [(v[0][i], v[1][i]) for v in ood.values() for i in range(3)]
    fixture = [{"probs": p.round(7).tolist(), "embedding": e.round(6).tolist(), "score": float(scorers[best](p[None], e[None])[0])} for p, e in pick]
    (BACKEND.parent / "frontend" / "tests" / "ood_fixture.json").write_text(json.dumps(fixture), encoding="utf-8")
    (MODELS / "micrograph_ood_report.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"Wrote {WEB / 'micrograph_ood.json'}")


if __name__ == "__main__":
    main()
