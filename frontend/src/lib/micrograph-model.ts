/**
 * In-browser SEM micrograph classification with ONNX Runtime Web.
 * Preprocessing mirrors backend/app/routers/micrograph.py + app/imaging.py:
 * strip the SEM data panel, resize short side to 224, center-crop, ImageNet-normalize.
 */
import type { InferenceSession } from "onnxruntime-web/wasm";

import { dataBarTop, toGray } from "./image-analysis";

export type MicrographMeta = {
  classes: string[];
  descriptions: Record<string, string>;
  architecture: string;
  input_size: number;
  mean: number[];
  std: number[];
  dataset: string;
  metrics: { val_accuracy: number; val_macro_f1: number; n_train: number; n_val: number };
};

export type MicrographResult = {
  predictions: { label: string; probability: number }[];
  /** The exact 224×224 crop the model saw (after removing the SEM data panel). */
  input: ImageData;
  /** Class activation map for the top class, normalised to 0–1, row-major camSize×camSize. */
  cam: Float32Array;
  camSize: number;
  /** TTA-averaged penultimate features (for "not recognised" detection and custom classes). */
  embedding: Float32Array;
};

let loading: Promise<{ session: InferenceSession; meta: MicrographMeta; ort: typeof import("onnxruntime-web/wasm") }> | null =
  null;

export function loadMicrographMeta(): Promise<MicrographMeta> {
  return fetch("/models/micrograph_meta.json").then((r) => {
    if (!r.ok) throw new Error("Could not load the micrograph model description.");
    return r.json();
  });
}

function loadModel() {
  loading ??= (async () => {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.wasmPaths = "/ort/"; // served from public/ort (see scripts/copy-ort.mjs)
    ort.env.wasm.numThreads = 1; // multi-threading needs cross-origin isolation; 1 thread is fast enough here
    const [session, meta] = await Promise.all([
      ort.InferenceSession.create("/models/micrograph.onnx", { executionProviders: ["wasm"] }),
      loadMicrographMeta(),
    ]);
    return { session, meta, ort };
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

/** Start downloading the model early (e.g. when the page opens). */
export const preloadMicrographModel = () => void loadModel().catch(() => {});

/** Row where a bright SEM information panel starts, or null (shared rule, see image-analysis.ts). */
function infoBarTop(px: Uint8ClampedArray, w: number, h: number): number | null {
  return dataBarTop(toGray(px, w, h));
}

async function toTensorData(
  file: Blob,
  size: number,
  mean: number[],
  std: number[],
): Promise<{ data: Float32Array; input: ImageData }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This browser can't read that image format. Please use JPG or PNG (TIFF isn't supported in browsers).");
  }
  // 1. Read pixels at full resolution and find the data panel.
  const full = new OffscreenCanvas(bitmap.width, bitmap.height);
  const fctx = full.getContext("2d", { willReadFrequently: true })!;
  fctx.drawImage(bitmap, 0, 0);
  const { width: w, height: h } = bitmap;
  const top = infoBarTop(fctx.getImageData(0, 0, w, h).data, w, h);
  const cropH = top === null ? h : Math.max(Math.floor(h * 0.5), top - 2);

  // 2. Resize so the short side is `size`, then center-crop size×size.
  const scale = size / Math.min(w, cropH);
  const rw = Math.max(size, Math.round(w * scale));
  const rh = Math.max(size, Math.round(cropH * scale));
  const out = new OffscreenCanvas(size, size);
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const ox = Math.floor((rw - size) / 2) / scale;
  const oy = Math.floor((rh - size) / 2) / scale;
  ctx.drawImage(bitmap, ox, oy, size / scale, size / scale, 0, 0, size, size);
  bitmap.close();

  // 3. Normalize into CHW float32.
  const input = ctx.getImageData(0, 0, size, size);
  const px = input.data;
  const plane = size * size;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) data[c * plane + i] = (px[i * 4 + c] / 255 - mean[c]) / std[c];
  }
  return { data, input };
}

/** The 8 rotations/reflections of a CHW image (micrographs have no canonical orientation). */
function dihedralViews(data: Float32Array, s: number): Float32Array[] {
  const plane = s * s;
  const views: Float32Array[] = [];
  for (let k = 0; k < 4; k++)
    for (const flip of [false, true]) {
      const out = new Float32Array(data.length);
      for (let y = 0; y < s; y++)
        for (let x = 0; x < s; x++) {
          // source pixel for (x, y) after rotating by k·90° and optional horizontal flip
          let sx = flip ? s - 1 - x : x;
          let sy = y;
          for (let r = 0; r < k; r++) [sx, sy] = [s - 1 - sy, sx];
          for (let c = 0; c < 3; c++) out[c * plane + y * s + x] = data[c * plane + sy * s + sx];
        }
      views.push(out);
    }
  return views;
}

const softmax = (logits: Float32Array) => {
  const max = Math.max(...logits);
  const exps = Array.from(logits, (v) => Math.exp(v - max));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / total);
};

export async function classifyMicrograph(file: Blob): Promise<MicrographResult> {
  const { session, meta, ort } = await loadModel();
  const size = meta.input_size;
  const { data, input } = await toTensorData(file, size, meta.mean, meta.std);
  const run = (d: Float32Array) => session.run({ [session.inputNames[0]]: new ort.Tensor("float32", d, [1, 3, size, size]) });

  // Test-time augmentation: average class probabilities (and embeddings) over the 8 dihedral
  // views, exactly as the reported test accuracy was measured. The heatmap uses the original view.
  const views = (meta as { tta?: boolean }).tta ? dihedralViews(data, size) : [data];
  const output = await run(views[0]);
  const probs = softmax(output.logits.data as Float32Array);
  const emb = Float32Array.from(output.embedding?.data as Float32Array ?? []);
  for (const v of views.slice(1)) {
    const o = await run(v);
    softmax(o.logits.data as Float32Array).forEach((p, i) => (probs[i] += p));
    if (o.embedding) (o.embedding.data as Float32Array).forEach((x, i) => (emb[i] += x));
  }
  probs.forEach((_, i) => (probs[i] /= views.length));
  emb.forEach((_, i) => (emb[i] /= views.length));
  const predictions = meta.classes
    .map((label, i) => ({ label, probability: probs[i] }))
    .sort((a, b) => b.probability - a.probability);

  // Heatmap for the predicted class: positive evidence only, scaled to 0–1.
  const camT = output.cam;
  const camSize = camT.dims[3];
  const k = meta.classes.indexOf(predictions[0].label);
  const plane = camSize * camSize;
  const cam = (camT.data as Float32Array).slice(k * plane, (k + 1) * plane).map((v) => Math.max(0, v));
  const peak = Math.max(...cam) || 1;
  for (let i = 0; i < plane; i++) cam[i] /= peak;
  return { predictions, input, cam, camSize, embedding: emb };
}
