/**
 * In-browser SEM micrograph classification with ONNX Runtime Web.
 * Preprocessing mirrors backend/app/routers/micrograph.py + app/imaging.py:
 * strip the SEM data panel, resize short side to 224, center-crop, ImageNet-normalize.
 */
import type { InferenceSession } from "onnxruntime-web/wasm";

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

export type MicrographResult = { predictions: { label: string; probability: number }[] };

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

/** Row where a bright SEM information panel starts, or null (port of app/imaging.py). */
function infoBarTop(px: Uint8ClampedArray, w: number, h: number): number | null {
  const white = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let count = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // PIL "L" conversion: L = R*299/1000 + G*587/1000 + B*114/1000
      if ((px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 > 200) count++;
    }
    white[y] = count / w;
  }
  const lo = Math.floor(h * 0.6);
  let last = -1;
  for (let y = lo; y < h; y++) if (white[y] > 0.5) last = y;
  if (last < 0) return null;
  let r = last;
  while (r > lo && white[r - 1] > 0.3) r--;
  return r;
}

async function toTensorData(file: Blob, size: number, mean: number[], std: number[]): Promise<Float32Array> {
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
  const px = ctx.getImageData(0, 0, size, size).data;
  const plane = size * size;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) data[c * plane + i] = (px[i * 4 + c] / 255 - mean[c]) / std[c];
  }
  return data;
}

export async function classifyMicrograph(file: Blob): Promise<MicrographResult> {
  const { session, meta, ort } = await loadModel();
  const size = meta.input_size;
  const data = await toTensorData(file, size, meta.mean, meta.std);
  const input = new ort.Tensor("float32", data, [1, 3, size, size]);
  const output = await session.run({ [session.inputNames[0]]: input });
  const logits = output[session.outputNames[0]].data as Float32Array;
  const max = Math.max(...logits);
  const exps = Array.from(logits, (v) => Math.exp(v - max));
  const total = exps.reduce((a, b) => a + b, 0);
  return {
    predictions: meta.classes
      .map((label, i) => ({ label, probability: exps[i] / total }))
      .sort((a, b) => b.probability - a.probability),
  };
}
