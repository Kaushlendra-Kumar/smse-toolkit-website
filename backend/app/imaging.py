"""Image preprocessing shared by micrograph training and serving."""

import numpy as np
from PIL import Image


def info_bar_top(img: Image.Image) -> int | None:
    """Row where an SEM information panel (scale bar, magnification, kV...) starts, if any.

    SEM images usually carry a bright data panel at the bottom. Left in, a CNN can
    learn to read magnification/instrument text instead of the microstructure.
    """
    a = np.asarray(img.convert("L"), dtype=np.float32)
    h = a.shape[0]
    white = (a > 200).mean(axis=1)
    lo = int(h * 0.6)
    rows = np.nonzero(white[lo:] > 0.5)[0]
    if rows.size == 0:
        return None
    r = lo + int(rows[-1])
    while r > lo and white[r - 1] > 0.3:
        r -= 1
    return r


def strip_info_bar(img: Image.Image, fallback: float | None = None) -> Image.Image:
    """Crop away the SEM data panel. `fallback` (fraction of height) applies when none is detected."""
    top = info_bar_top(img)
    if top is None:
        if fallback is None:
            return img
        top = int(img.height * fallback)
    top = max(int(img.height * 0.5), top - 2)  # never discard more than half the image
    return img.crop((0, 0, img.width, top))
