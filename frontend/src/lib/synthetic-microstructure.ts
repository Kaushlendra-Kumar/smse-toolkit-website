/**
 * Synthetic microstructures with exactly known ground truth — used to validate the image
 * analysis (tests/image-analysis.test.ts) and as demo images on the Image Analysis page.
 */
import type { Gray } from "./image-analysis";

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
}

function finish(values: Float32Array, w: number, h: number, noise: number, r: () => number): Gray {
  // mild 3×3 blur + Gaussian noise, like a real micrograph
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < w && yy >= 0 && yy < h) {
            s += values[yy * w + xx];
            n++;
          }
        }
      out[y * w + x] = Math.max(0, Math.min(255, Math.round(s / n + noise * gaussian(r))));
    }
  return { w, h, data: out };
}

export type GrainTruth = { grainCount: number; meanArea: number; meanIntercept: number };

/**
 * Voronoi grain structure with dark boundaries of width `boundary` px.
 * Truth uses the same conventions as analyseGrains: Jeffries count and the same test lines.
 */
export function syntheticGrains(w: number, h: number, nGrains: number, seed = 1, opts: { boundary?: number; noise?: number; lines?: number } = {}) {
  const r = rng(seed);
  const sx = Array.from({ length: nGrains }, () => r() * w);
  const sy = Array.from({ length: nGrains }, () => r() * h);
  const shade = Array.from({ length: nGrains }, () => 150 + r() * 80);
  const label = new Int32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let best = 0;
      let bd = Infinity;
      for (let k = 0; k < nGrains; k++) {
        const d = (x - sx[k]) ** 2 + (y - sy[k]) ** 2;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      label[y * w + x] = best;
    }
  // Boundary = pixels within `boundary`/2 of a label change.
  const bw = opts.boundary ?? 3;
  const edge = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const l = label[y * w + x];
      if ((x + 1 < w && label[y * w + x + 1] !== l) || (y + 1 < h && label[(y + 1) * w + x] !== l)) edge[y * w + x] = 1;
    }
  const half = Math.floor(bw / 2);
  const values = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let onB = false;
      for (let dy = -half; dy <= half && !onB; dy++)
        for (let dx = -half; dx <= half; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < w && yy >= 0 && yy < h && edge[yy * w + xx]) {
            onB = true;
            break;
          }
        }
      values[y * w + x] = onB ? 45 : shade[label[y * w + x]];
    }

  // Ground truth with the analysis conventions.
  const touches = new Uint8Array(nGrains);
  const present = new Uint8Array(nGrains);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const l = label[y * w + x];
      present[l] = 1;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches[l] = 1;
    }
  let inside = 0;
  let border = 0;
  for (let k = 0; k < nGrains; k++) {
    if (!present[k]) continue;
    if (touches[k]) border++;
    else inside++;
  }
  const grainCount = inside + border / 2;
  const nLines = opts.lines ?? 10;
  let crossings = 0;
  let length = 0;
  for (let k = 1; k <= nLines; k++) {
    const yy = Math.floor((k * h) / (nLines + 1));
    const xx = Math.floor((k * w) / (nLines + 1));
    for (let x = 1; x < w; x++) if (label[yy * w + x] !== label[yy * w + x - 1]) crossings++;
    for (let y = 1; y < h; y++) if (label[y * w + xx] !== label[(y - 1) * w + xx]) crossings++;
    length += w + h;
  }
  const truth: GrainTruth = { grainCount, meanArea: (w * h) / grainCount, meanIntercept: length / crossings };
  return { image: finish(values, w, h, opts.noise ?? 8, r), truth };
}

/** Random circular pores (dark) in a bright matrix until `fraction` of the area is porous. */
export function syntheticPores(w: number, h: number, fraction: number, seed = 1, opts: { rMin?: number; rMax?: number; noise?: number } = {}) {
  const r = rng(seed);
  const mask = new Uint8Array(w * h);
  let filled = 0;
  const target = fraction * w * h;
  const rMin = opts.rMin ?? 3;
  const rMax = opts.rMax ?? 18;
  let guard = 0;
  while (filled < target && guard++ < 100000) {
    const cx = r() * w;
    const cy = r() * h;
    const rad = rMin + r() * (rMax - rMin);
    for (let y = Math.max(0, Math.floor(cy - rad)); y <= Math.min(h - 1, Math.ceil(cy + rad)); y++)
      for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(w - 1, Math.ceil(cx + rad)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad && !mask[y * w + x]) {
          mask[y * w + x] = 1;
          filled++;
        }
      }
  }
  const values = Float32Array.from(mask, (m) => (m ? 55 : 185));
  return { image: finish(values, w, h, opts.noise ?? 10, r), truth: { porosity: filled / (w * h) } };
}
