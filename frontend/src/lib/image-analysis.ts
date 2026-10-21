/**
 * Quantitative microstructure analysis on grayscale images (pure functions, no DOM):
 *   • porosity / pore-size distribution (threshold + connected components)
 *   • grain size by ASTM E112 planimetric (Jeffries) and lineal-intercept (Heyn) methods
 * Validated on synthetic microstructures with known ground truth in tests/image-analysis.test.ts.
 */

export type Gray = { w: number; h: number; data: Uint8Array };

/** Luma (same weights as PIL "L"). */
export function toGray(rgba: Uint8ClampedArray, w: number, h: number): Gray {
  const data = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) data[i] = Math.round((rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000);
  return { w, h, data };
}

/**
 * Row where a bright SEM data panel (scale bar, kV, magnification) starts, or null.
 * Same rule as backend/app/imaging.py: a mostly-white band entered through a sharp brightness
 * edge in the bottom third — the edge requirement keeps bright specimens from being cropped.
 */
export function dataBarTop(img: Gray): number | null {
  const { w, h, data } = img;
  const white = new Float32Array(h);
  const mean = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let c = 0;
    let s = 0;
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x];
      if (v > 200) c++;
      s += v;
    }
    white[y] = c / w;
    mean[y] = s / w;
  }
  const avg = (arr: Float32Array, a: number, b: number) => {
    let s = 0;
    for (let i = a; i < b; i++) s += arr[i];
    return s / Math.max(1, b - a);
  };
  const bandH = Math.max(2, Math.floor(0.04 * h));
  let best: number | null = null;
  let bestScore = 0;
  for (let y = Math.floor(h * 0.65); y < h - 4; y++) {
    const band = avg(white, y, Math.min(h, y + bandH));
    const jump = avg(mean, y, y + 3) - avg(mean, Math.max(0, y - 4), y - 1);
    const score = band * Math.max(0, jump);
    if (band > 0.5 && jump > 25 && score > bestScore) {
      best = y;
      bestScore = score;
    }
  }
  return best;
}

/** Top rows [0, rows) of an image. */
export function cropRows(img: Gray, rows: number): Gray {
  return { w: img.w, h: rows, data: img.data.slice(0, img.w * rows) };
}

/** Separable box blur, applied twice (≈ Gaussian), radius r. */
export function smooth(img: Gray, r = 1): Gray {
  if (r <= 0) return img;
  const { w, h } = img;
  let src = Float32Array.from(img.data);
  const tmp = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let k = -r; k <= r; k++) {
          const xx = x + k;
          if (xx >= 0 && xx < w) {
            s += src[y * w + xx];
            n++;
          }
        }
        tmp[y * w + x] = s / n;
      }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let k = -r; k <= r; k++) {
          const yy = y + k;
          if (yy >= 0 && yy < h) {
            s += tmp[yy * w + x];
            n++;
          }
        }
        out[y * w + x] = s / n;
      }
    src = out;
  }
  return { w, h, data: Uint8Array.from(src, (v) => Math.round(v)) };
}

/** Otsu's threshold: maximises between-class variance of the histogram. */
export function otsu(img: Gray): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of img.data) hist[v]++;
  const total = img.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

/** Binary mask: 1 where the feature is (dark features: value <= thr; bright: value > thr). */
export function threshold(img: Gray, thr: number, dark: boolean): Uint8Array {
  return Uint8Array.from(img.data, (v) => (dark ? (v <= thr ? 1 : 0) : v > thr ? 1 : 0));
}

function morph(mask: Uint8Array, w: number, h: number, r: number, dilate: boolean): Uint8Array {
  if (r <= 0) return mask;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let hit = !dilate;
      for (let dy = -r; dy <= r && hit !== dilate; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const xx = x + dx;
          const yy = y + dy;
          const v = xx >= 0 && xx < w && yy >= 0 && yy < h ? mask[yy * w + xx] : dilate ? 0 : 1;
          if (dilate ? v : !v) {
            hit = dilate;
            break;
          }
        }
      out[y * w + x] = hit ? 1 : 0;
    }
  return out;
}

/** Morphological opening (removes specks smaller than the disk of radius r). */
export const open = (m: Uint8Array, w: number, h: number, r: number) => morph(morph(m, w, h, r, false), w, h, r, true);
/** Morphological closing (bridges gaps narrower than the disk of radius r). */
export const close = (m: Uint8Array, w: number, h: number, r: number) => morph(morph(m, w, h, r, true), w, h, r, false);

export type Component = { label: number; area: number; touchesBorder: boolean; cx: number; cy: number };

/** 4-connected component labelling of mask==1 (iterative flood fill). */
export function components(mask: Uint8Array, w: number, h: number): { labels: Int32Array; comps: Component[] } {
  const labels = new Int32Array(w * h);
  const comps: Component[] = [];
  const stack = new Int32Array(w * h);
  let next = 0;
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || labels[start]) continue;
    next++;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = next;
    let area = 0;
    let border = false;
    let sx = 0;
    let sy = 0;
    while (sp) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      area++;
      sx += x;
      sy += y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) {
        if (q >= 0 && mask[q] && !labels[q]) {
          labels[q] = next;
          stack[sp++] = q;
        }
      }
    }
    comps.push({ label: next, area, touchesBorder: border, cx: sx / area, cy: sy / area });
  }
  return { labels, comps };
}

export type PorosityResult = {
  threshold: number;
  porosity: number; // area fraction 0–1
  pores: { area: number; diameter: number; touchesBorder: boolean }[]; // px² / px (×scale² / ×scale for µm)
  mask: Uint8Array;
};

export function analysePorosity(img: Gray, opts: { thr?: number; poresDark?: boolean; minArea?: number; smoothing?: number } = {}): PorosityResult {
  const { w, h } = img;
  const s = smooth(img, opts.smoothing ?? 1);
  const thr = opts.thr ?? otsu(s);
  let mask = threshold(s, thr, opts.poresDark ?? true);
  mask = open(mask, w, h, 1);
  const { comps } = components(mask, w, h);
  const minArea = opts.minArea ?? 4;
  const pores = comps
    .filter((c) => c.area >= minArea)
    .map((c) => ({ area: c.area, diameter: 2 * Math.sqrt(c.area / Math.PI), touchesBorder: c.touchesBorder }));
  const poreArea = pores.reduce((a, p) => a + p.area, 0);
  return { threshold: thr, porosity: poreArea / (w * h), pores, mask };
}

export type GrainResult = {
  threshold: number;
  grains: { area: number; diameter: number }[]; // interior grains only (not touching the border)
  grainCount: number; // Jeffries count: interior + ½ border grains
  meanArea: number; // px²  (planimetric, N_A = grainCount / image area)
  meanIntercept: number; // px  (Heyn lineal intercept)
  intersections: number;
  lineLength: number;
  labels: Int32Array;
  boundary: Uint8Array;
};

/**
 * Grain size from a micrograph with visible grain boundaries.
 * boundariesDark: etched boundaries appear dark (typical optical/SEM metallography).
 */
export function analyseGrains(
  img: Gray,
  opts: { thr?: number; boundariesDark?: boolean; closeRadius?: number; minArea?: number; smoothing?: number; lines?: number } = {},
): GrainResult {
  const { w, h } = img;
  const s = smooth(img, opts.smoothing ?? 1);
  const thr = opts.thr ?? otsu(s);
  let boundary = threshold(s, thr, opts.boundariesDark ?? true);
  boundary = close(boundary, w, h, opts.closeRadius ?? 1); // bridge small gaps in boundaries
  const interior = Uint8Array.from(boundary, (v) => 1 - v);
  const { labels, comps } = components(interior, w, h);
  const minArea = opts.minArea ?? 20;
  const valid = comps.filter((c) => c.area >= minArea);
  const inside = valid.filter((c) => !c.touchesBorder);
  const edge = valid.length - inside.length;
  // Jeffries planimetric: grains fully inside count 1, grains cut by the border count ½.
  const grainCount = inside.length + edge / 2;

  // Heyn lineal intercept: evenly spaced horizontal + vertical test lines. A crossing is counted
  // when the line passes from one grain into a *different* grain (boundary pixels are skipped).
  // Counting grain-identity changes, not dark-pixel runs, avoids under-counting where boundaries
  // merge at triple junctions or where a line grazes along a boundary.
  const validLabel = new Uint8Array(comps.length + 1);
  for (const c of valid) validLabel[c.label] = 1;
  // Thin the boundaries to zero width: every boundary (or noise) pixel takes the label of the
  // nearest grain (multi-source BFS), so a test line that clips a small grain's corner inside a
  // thick boundary still registers that grain.
  const full = new Int32Array(w * h);
  const queue = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;
  for (let i = 0; i < w * h; i++) {
    if (labels[i] && validLabel[labels[i]]) {
      full[i] = labels[i];
      queue[qt++] = i;
    }
  }
  while (qh < qt) {
    const p = queue[qh++];
    const x = p % w;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p + w < w * h ? p + w : -1]) {
      if (q >= 0 && !full[q]) {
        full[q] = full[p];
        queue[qt++] = q;
      }
    }
  }
  const nLines = opts.lines ?? 10;
  let intersections = 0;
  let lineLength = 0;
  const scan = (get: (i: number) => number, len: number) => {
    for (let i = 1; i < len; i++) if (get(i) && get(i - 1) && get(i) !== get(i - 1)) intersections++;
    lineLength += len;
  };
  for (let k = 1; k <= nLines; k++) {
    const y = Math.floor((k * h) / (nLines + 1));
    const x = Math.floor((k * w) / (nLines + 1));
    scan((i) => full[y * w + i], w);
    scan((i) => full[i * w + x], h);
  }

  return {
    threshold: thr,
    grains: inside.map((c) => ({ area: c.area, diameter: 2 * Math.sqrt(c.area / Math.PI) })),
    grainCount,
    meanArea: grainCount > 0 ? (w * h) / grainCount : NaN,
    meanIntercept: intersections > 0 ? lineLength / intersections : NaN,
    intersections,
    lineLength,
    labels,
    boundary,
  };
}

/** ASTM E112 grain size number from grains per mm² (planimetric). */
export const astmFromArea = (meanAreaMm2: number) => 3.321928 * Math.log10(1 / meanAreaMm2) - 2.954;
/** ASTM E112 grain size number from the mean lineal intercept in mm. */
export const astmFromIntercept = (meanInterceptMm: number) => -6.643856 * Math.log10(meanInterceptMm) - 3.288;
