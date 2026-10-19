"""Fine-tune an ImageNet CNN on the NFFA-EUROPE SEM dataset and export it to ONNX.

Usage (from backend/, after `python -m ml.micrograph.download`):
    .venv/Scripts/python -m ml.micrograph.train [--arch convnext_tiny.fb_in22k_ft_in1k] [--epochs 12]

Outputs models/micrograph.onnx + models/micrograph_meta.json (classes, preprocessing,
held-out test metrics, confusion matrix) consumed by app/routers/micrograph.py.
"""

import argparse
import json
import os
import random
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
# Keep pretrained-weight downloads inside the project.
os.environ.setdefault("HF_HOME", str(BACKEND / ".cache" / "huggingface"))
os.environ.setdefault("TORCH_HOME", str(BACKEND / ".cache" / "torch"))

import numpy as np  # noqa: E402
import timm  # noqa: E402
import torch  # noqa: E402
from PIL import Image  # noqa: E402
from sklearn.metrics import classification_report, confusion_matrix, f1_score  # noqa: E402
from sklearn.model_selection import train_test_split  # noqa: E402
from torch import nn  # noqa: E402
from torch.utils.data import DataLoader, Dataset  # noqa: E402
from torchvision.transforms import v2 as T  # noqa: E402

from app.imaging import strip_info_bar  # noqa: E402

DATA = BACKEND / "data" / "micrographs"
MODELS = BACKEND / "models"
SIZE = 224
MEAN, STD = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]

DESCRIPTIONS = {
    "Biological": "Cells, tissues, pollen, bacteria and other biological specimens.",
    "Fibres": "Fibrous structures — polymer, carbon or electrospun fibres and fibre mats.",
    "Films_Coated_Surface": "Thin films and coated surfaces, often showing grains, cracks or coating morphology.",
    "MEMS_devices_and_electrodes": "Micro-electro-mechanical systems, electrodes and fabricated device structures.",
    "Nanowires": "Elongated nanoscale wires or rods, standing or lying on a substrate.",
    "Particles": "Discrete nano- or micro-particles, spheres and clusters.",
    "Patterned_surface": "Lithographically patterned surfaces — regular arrays, gratings, pillars or holes.",
    "Porous_Sponge": "Porous, foam-like or sponge structures with an open pore network.",
    "Powder": "Powders and agglomerated granular material.",
    "Tips": "AFM/STM probe tips and sharp needle-like structures.",
}


class Micrographs(Dataset):
    def __init__(self, items: list[tuple[Path, int]], transform):
        self.items, self.transform = items, transform

    def __len__(self):
        return len(self.items)

    def __getitem__(self, i):
        path, label = self.items[i]
        # Every NFFA image carries a data panel (~bottom 17%); crop it so the model learns morphology.
        img = strip_info_bar(Image.open(path).convert("RGB"), fallback=0.78)
        return self.transform(img), label


class Rot90:
    """Random multiple-of-90° rotation: micrographs have no canonical orientation."""

    def __call__(self, x):
        return torch.rot90(x, random.randint(0, 3), dims=(-2, -1))


def transforms():
    train = T.Compose([
        T.PILToTensor(),
        T.RandomResizedCrop(SIZE, scale=(0.35, 1.0), antialias=True),
        T.RandomHorizontalFlip(),
        T.RandomVerticalFlip(),
        Rot90(),
        T.ColorJitter(brightness=0.25, contrast=0.25),
        T.ToDtype(torch.float32, scale=True),
        T.Normalize(MEAN, STD),
    ])
    # Must mirror app/routers/micrograph.py::preprocess (resize short side, center crop).
    val = T.Compose([
        T.PILToTensor(),
        T.Resize(SIZE, interpolation=T.InterpolationMode.BICUBIC, antialias=True),
        T.CenterCrop(SIZE),
        T.ToDtype(torch.float32, scale=True),
        T.Normalize(MEAN, STD),
    ])
    return train, val


def load_items():
    classes = sorted(d.name for d in DATA.iterdir() if d.is_dir() and not d.name.startswith("_") and (d / ".complete").exists())
    if len(classes) < 2:
        raise SystemExit("No downloaded classes found. Run: python -m ml.micrograph.download")
    items = [(p, i) for i, c in enumerate(classes) for p in sorted((DATA / c).glob("*.jpg"))]
    return classes, items


@torch.no_grad()
def evaluate(model, loader, device, amp=False):
    model.eval()
    preds, labels = [], []
    for x, y in loader:
        with torch.autocast(device.type, dtype=torch.float16, enabled=amp):
            preds.append(model(x.to(device, non_blocking=True)).argmax(1).cpu())
        labels.append(y)
    return torch.cat(labels).numpy(), torch.cat(preds).numpy()


def main():
    ap = argparse.ArgumentParser()
    # EfficientNet-B0 in fp32: on GPUs without tensor cores (e.g. GTX 16xx) it trains ~13x faster
    # than ConvNeXt-Tiny, and fp16 autocast is *slower* there. Pass --amp on RTX-class GPUs.
    ap.add_argument("--arch", default="efficientnet_b0.ra_in1k")
    ap.add_argument("--epochs", type=int, default=15)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=5e-4)
    ap.add_argument("--amp", action="store_true", help="fp16 mixed precision (helps only with tensor cores)")
    # Worker processes hang at start-up on Windows; images are small, so loading in-process is fine.
    ap.add_argument("--workers", type=int, default=0 if os.name == "nt" else 4)
    ap.add_argument("--export-only", action="store_true", help="re-export the saved checkpoint to ONNX")
    ap.add_argument(
        "--evaluate-only", action="store_true",
        help="skip training: test-evaluate + export the saved best checkpoint (e.g. after an interrupted run)",
    )
    args = ap.parse_args()

    if args.export_only:
        meta = json.loads((MODELS / "micrograph_meta.json").read_text())
        export_onnx(args.arch, len(meta["classes"]))
        return

    torch.manual_seed(0)
    random.seed(0)
    torch.backends.cudnn.benchmark = True
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    use_amp = args.amp and device.type == "cuda"
    classes, items = load_items()
    labels = [y for _, y in items]
    counts = np.bincount(labels, minlength=len(classes))
    print(f"{len(items)} images, {len(classes)} classes on {device}:")
    for c, n in zip(classes, counts):
        print(f"  {c:<30} {n}")

    # Stratified 80 / 10 / 10 split.
    idx = np.arange(len(items))
    tr_idx, rest = train_test_split(idx, test_size=0.2, stratify=labels, random_state=0)
    va_idx, te_idx = train_test_split(rest, test_size=0.5, stratify=[labels[i] for i in rest], random_state=0)
    t_train, t_val = transforms()
    loader = lambda ix, tf, shuffle: DataLoader(  # noqa: E731
        Micrographs([items[i] for i in ix], tf), batch_size=args.batch, shuffle=shuffle,
        num_workers=args.workers, pin_memory=True, persistent_workers=args.workers > 0, drop_last=shuffle,
    )
    dl_train, dl_val, dl_test = loader(tr_idx, t_train, True), loader(va_idx, t_val, False), loader(te_idx, t_val, False)

    model = timm.create_model(
        args.arch, pretrained=not args.evaluate_only, num_classes=len(classes), drop_path_rate=0.1
    ).to(device)
    # Inverse-sqrt-frequency class weights soften the ~30x imbalance.
    weights = torch.tensor((counts.max() / counts) ** 0.5, dtype=torch.float32, device=device)
    criterion = nn.CrossEntropyLoss(weight=weights, label_smoothing=0.1)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.05)
    steps = args.epochs * len(dl_train)
    scheduler = torch.optim.lr_scheduler.OneCycleLR(optimizer, max_lr=args.lr, total_steps=steps, pct_start=0.1)
    scaler = torch.amp.GradScaler(enabled=use_amp)

    MODELS.mkdir(exist_ok=True)
    ckpt = MODELS / "micrograph_best.pt"
    best_f1, history = -1.0, []
    if args.evaluate_only:
        history = history_from_log()
    for epoch in range(1, 0 if args.evaluate_only else args.epochs + 1):
        model.train()
        t0, total, seen = time.time(), 0.0, 0
        for x, y in dl_train:
            x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
            with torch.autocast(device.type, dtype=torch.float16, enabled=use_amp):
                loss = criterion(model(x), y)
            optimizer.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
            scheduler.step()
            total += loss.item() * len(y)
            seen += len(y)
            if (seen // len(y)) % 50 == 0:
                print(f"  epoch {epoch} · {seen}/{len(dl_train.dataset)} images · {seen / (time.time() - t0):.0f} img/s", flush=True)
        y_true, y_pred = evaluate(model, dl_val, device, use_amp)
        acc, f1 = float((y_true == y_pred).mean()), float(f1_score(y_true, y_pred, average="macro"))
        history.append({"epoch": epoch, "train_loss": round(total / seen, 4), "val_accuracy": round(acc, 4), "val_macro_f1": round(f1, 4)})
        flag = ""
        if f1 > best_f1:
            best_f1, flag = f1, "  ← best"
            torch.save(model.state_dict(), ckpt)
        print(f"epoch {epoch:2d}  loss {total / seen:.4f}  val acc {acc:.4f}  macro-F1 {f1:.4f}  ({time.time() - t0:.0f}s){flag}", flush=True)

    # Final, unbiased numbers on the untouched test split.
    model.load_state_dict(torch.load(ckpt, map_location=device))
    y_true, y_pred = evaluate(model, dl_test, device, use_amp)
    test_acc = float((y_true == y_pred).mean())
    test_f1 = float(f1_score(y_true, y_pred, average="macro"))
    report = classification_report(y_true, y_pred, target_names=classes, output_dict=True, zero_division=0)
    print(f"\nTEST accuracy {test_acc:.4f}  macro-F1 {test_f1:.4f}")
    print(classification_report(y_true, y_pred, target_names=classes, digits=3, zero_division=0))

    meta = {
        "classes": classes,
        "descriptions": {c: DESCRIPTIONS.get(c, "") for c in classes},
        "architecture": f"{args.arch} (timm), fine-tuned",
        "input_size": SIZE,
        "mean": MEAN,
        "std": STD,
        "dataset": "NFFA-EUROPE SEM dataset (Aversa et al., Sci. Data 2018), CC-BY 4.0",
        "metrics": {
            "val_accuracy": round(test_acc, 4),  # reported on the held-out test split
            "val_macro_f1": round(test_f1, 4),
            "n_train": len(tr_idx),
            "n_val": len(te_idx),
            "per_class": {c: {k: round(report[c][k], 3) for k in ("precision", "recall", "f1-score", "support")} for c in classes},
            "confusion_matrix": confusion_matrix(y_true, y_pred).tolist(),
        },
        "history": history,
    }
    (MODELS / "micrograph_meta.json").write_text(json.dumps(meta, indent=2))
    export_onnx(args.arch, len(classes))


def history_from_log(log: Path = BACKEND / "data" / "train.log") -> list[dict]:
    """Recover per-epoch validation history from a previous run's log (for --evaluate-only)."""
    import re

    if not log.exists():
        return []
    pat = re.compile(r"epoch +(\d+) +loss ([\d.]+) +val acc ([\d.]+) +macro-F1 ([\d.]+)")
    text = log.read_text(encoding="utf-8", errors="ignore")
    return [
        {"epoch": int(e), "train_loss": float(lo), "val_accuracy": float(a), "val_macro_f1": float(f)}
        for e, lo, a, f in pat.findall(text)
    ]


def export_onnx(arch: str, num_classes: int) -> None:
    """Export the best checkpoint to ONNX (fp32, batch 1) and verify it against PyTorch."""
    import onnxruntime as ort

    model = timm.create_model(arch, pretrained=False, num_classes=num_classes)
    model.load_state_dict(torch.load(MODELS / "micrograph_best.pt", map_location="cpu"))
    model.eval()
    dummy = torch.randn(1, 3, SIZE, SIZE)
    onnx_path = MODELS / "micrograph.onnx"
    torch.onnx.export(
        model, (dummy,), str(onnx_path), input_names=["image"], output_names=["logits"],
        opset_version=18, dynamo=True, external_data=False,
    )
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    with torch.no_grad():
        expected = model(dummy).numpy()
    diff = np.abs(sess.run(None, {"image": dummy.numpy()})[0] - expected).max()
    print(f"Saved {onnx_path} ({onnx_path.stat().st_size / 1e6:.0f} MB); max |Δlogit| vs PyTorch = {diff:.2e}")
    if diff > 1e-3:
        raise SystemExit("ONNX output diverges from PyTorch")
    # The website runs the model in the browser: publish model + metadata to the frontend.
    import shutil

    web = BACKEND.parent / "frontend" / "public" / "models"
    web.mkdir(parents=True, exist_ok=True)
    for f in ("micrograph.onnx", "micrograph_meta.json"):
        shutil.copy2(MODELS / f, web / f)
    print(f"Copied model to {web}")


if __name__ == "__main__":
    main()
