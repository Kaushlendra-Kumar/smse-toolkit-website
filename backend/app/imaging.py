"""Image preprocessing shared by micrograph training and serving."""

import numpy as np
from PIL import Image

# In the NFFA-EUROPE dataset the microscope data panel always starts at ~79–83% of the image
# height (median 0.831, 1st percentile 0.778, independent of class). Training images are cut
# at this fixed fraction so no panel text ever reaches the network.
NFFA_PANEL_CROP = 0.77


def info_bar_top(img: Image.Image) -> int | None:
    """Row where an SEM information panel (scale bar, magnification, kV...) starts, if any.

    The panel is a mostly-white band entered through a sharp brightness edge in the bottom
    third of the image. Requiring the edge (not just bright rows) avoids mistaking a bright
    specimen or background for the panel.
    """
    a = np.asarray(img.convert("L"), dtype=np.float32)
    h = a.shape[0]
    white = (a > 200).mean(axis=1)
    mean = a.mean(axis=1)
    band_h = max(2, int(0.04 * h))
    best, best_score = None, 0.0
    for y in range(int(h * 0.65), h - 4):
        band = white[y : y + band_h].mean()
        jump = mean[y : y + 3].mean() - mean[max(0, y - 4) : y - 1].mean()
        score = band * max(0.0, jump)
        if band > 0.5 and jump > 25 and score > best_score:
            best, best_score = y, score
    return best


def strip_info_bar(img: Image.Image, fallback: float | None = None) -> Image.Image:
    """Crop away the SEM data panel. `fallback` (fraction of height) applies when none is detected."""
    top = info_bar_top(img)
    if top is None:
        if fallback is None:
            return img
        top = int(img.height * fallback)
    top = max(int(img.height * 0.5), top - 2)  # never discard more than half the image
    return img.crop((0, 0, img.width, top))


def crop_fraction(img: Image.Image, fraction: float = NFFA_PANEL_CROP) -> Image.Image:
    """Keep the top `fraction` of the image (fixed crop for NFFA dataset images)."""
    return img.crop((0, 0, img.width, int(img.height * fraction)))
