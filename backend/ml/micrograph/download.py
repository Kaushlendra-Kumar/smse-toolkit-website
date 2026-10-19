"""Download and extract the NFFA-EUROPE SEM dataset (CC-BY 4.0).

Aversa et al., "The first annotated set of scanning electron microscopy images
for nanoscience", Scientific Data 5, 180172 (2018). doi:10.1038/sdata.2018.172

Usage (from backend/):  .venv/Scripts/python -m ml.micrograph.download [Class ...]

Resumable: partial downloads continue where they stopped, archives are
MD5-verified, and already-extracted classes are skipped.
"""

import hashlib
import io
import json
import sys
import tarfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
from PIL import Image, UnidentifiedImageError

RECORD = "https://b2share.eudat.eu/api/records/qtq9v-ys023"
DATA = Path(__file__).resolve().parents[2] / "data" / "micrographs"
ARCHIVES = DATA / "_archives"
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}
SHORT_SIDE = 320
CHUNK = 8 * 1024 * 1024
WORKERS = 8
STALL_WINDOW = 30  # seconds
MIN_RATE = 8 * 1024  # bytes/s; below this a connection counts as stalled


def md5(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(client: httpx.Client, url: str, dest: Path, size: int) -> None:
    """Parallel ranged download. The server throttles long-lived connections, so the file
    is fetched as many short chunk-sized requests over WORKERS connections. Progress is
    recorded in <dest>.parts ({"chunk": bytes, "done": [indices]}), so interrupted runs resume."""
    state = dest.with_name(dest.name + ".parts")
    chunk = CHUNK
    if state.exists():
        saved = json.loads(state.read_text())
        if isinstance(saved, list):  # older format: bare list of 32 MiB chunk indices
            saved = {"chunk": 32 * 1024 * 1024, "done": saved}
        chunk, done = saved["chunk"], set(saved["done"])
    else:
        # A plain partial file from an older sequential run: keep its whole chunks.
        have = dest.stat().st_size if dest.exists() else 0
        if have == size:
            return
        done = set(range(have // chunk))
    n_chunks = -(-size // chunk)
    with dest.open("r+b" if dest.exists() else "wb") as f:
        f.truncate(size)
    lock = threading.Lock()
    t0, start_done = time.time(), len(done)

    def fetch(i: int) -> None:
        a, b = i * chunk, min(size, (i + 1) * chunk) - 1
        attempt = 0
        while True:
            try:
                # Stream straight to disk (each thread has its own handle) — keeps RAM use tiny.
                with client.stream("GET", url, headers={"Range": f"bytes={a}-{b}"}) as r, dest.open("r+b") as f:
                    if r.status_code != 206:
                        raise httpx.HTTPError(f"bad range response {r.status_code}")
                    f.seek(a)
                    got, window_start, window_bytes = 0, time.time(), 0
                    for piece in r.iter_bytes(256 * 1024):
                        f.write(piece)
                        got += len(piece)
                        window_bytes += len(piece)
                        # Only a near-dead connection is abandoned; a merely slow server is waited out.
                        if time.time() - window_start > STALL_WINDOW:
                            if window_bytes / STALL_WINDOW < MIN_RATE:
                                raise httpx.HTTPError("connection stalled; retrying on a fresh one")
                            window_start, window_bytes = time.time(), 0
                if got != b - a + 1:
                    raise httpx.HTTPError(f"short chunk: {got} of {b - a + 1} bytes")
                break
            except httpx.HTTPError:
                attempt += 1
                if attempt >= 20:
                    raise
                time.sleep(min(60, 3 * attempt))
        with lock:
            done.add(i)
            state.write_text(json.dumps({"chunk": chunk, "done": sorted(done)}))
            rate = (len(done) - start_done) * chunk / 1e6 / max(time.time() - t0, 1e-6)
            print(f"\r  {dest.name}: {len(done)}/{n_chunks} chunks · {rate:.1f} MB/s   ", end="", flush=True)

    with ThreadPoolExecutor(WORKERS) as pool:
        list(pool.map(fetch, [i for i in range(n_chunks) if i not in done]))
    state.unlink()
    print()


def extract(archive: Path, class_name: str) -> int:
    """Extract images flattened into DATA/<class_name>/ (never trusting tar paths),
    downscaled to SHORT_SIDE px — training runs at 224 px, and this cuts ~11 GB to <1 GB."""
    out = DATA / class_name
    out.mkdir(parents=True, exist_ok=True)
    n = 0
    with tarfile.open(archive) as tar:
        for member in tar:
            name = Path(member.name).name
            if not member.isfile() or Path(name).suffix.lower() not in IMAGE_EXT or name.startswith("._"):
                continue
            src = tar.extractfile(member)
            if src is None:
                continue
            try:
                img = Image.open(io.BytesIO(src.read())).convert("RGB")
            except (UnidentifiedImageError, OSError):
                continue
            scale = SHORT_SIDE / min(img.size)
            if scale < 1:
                img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
            dest = out / f"{Path(name).stem}.jpg"
            if dest.exists():  # same filename in different sub-folders of the tar
                dest = out / f"{Path(name).stem}_{n}.jpg"
            img.save(dest, quality=92)
            n += 1
    return n


def main(only: list[str]) -> None:
    ARCHIVES.mkdir(parents=True, exist_ok=True)
    limits = httpx.Limits(max_connections=WORKERS, max_keepalive_connections=0)  # fresh connection per chunk
    with httpx.Client(timeout=httpx.Timeout(60, read=300), follow_redirects=True, limits=limits) as client:
        entries = client.get(f"{RECORD}/files").json()["entries"]
        # Smallest classes first, so a usable subset arrives early on a slow server.
        for e in sorted(entries, key=lambda e: e["size"]):
            key, size = e["key"], e["size"]
            class_name = key.removesuffix(".tar")
            if only and class_name not in only:
                continue
            marker = DATA / class_name / ".complete"
            if marker.exists():
                print(f"✓ {class_name} already extracted")
                continue
            archive = ARCHIVES / key
            for attempt in range(5):
                try:
                    download(client, e["links"]["content"], archive, size)
                    break
                except httpx.HTTPError as exc:
                    print(f"\n  network error ({exc}); retrying {attempt + 1}/5")
            else:
                sys.exit(f"Failed to download {key}")
            expected = (e.get("checksum") or "").removeprefix("md5:")
            if expected and md5(archive) != expected:
                archive.unlink()
                sys.exit(f"Checksum mismatch for {key}; deleted, please re-run.")
            n = extract(archive, class_name)
            marker.write_text(str(n))
            archive.unlink()  # reclaim disk space
            print(f"✓ {class_name}: {n} images")


if __name__ == "__main__":
    main(sys.argv[1:])
