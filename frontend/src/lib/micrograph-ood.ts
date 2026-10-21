/**
 * "Not recognised" detection and few-shot custom classes on top of the micrograph CNN.
 * Parameters come from backend/ml/micrograph/ood.py (micrograph_ood.json [+ .bin]).
 */

export type OodConfig = {
  method: "max softmax" | "prototype cosine" | "Mahalanobis" | "kNN" | "softmax + kNN";
  knn_k?: number;
  bank_size?: number;
  zscore?: { msp: [number, number]; knn: [number, number] };
  threshold: number;
  tpr_target: number;
  evaluation: Record<string, { threshold: number; test_id_accepted: number } & Record<string, { auroc: number; ood_wrongly_accepted: number } | number>>;
  embedding_dim: number;
  prototypes: number[][];
  pca_dim?: number;
};

type Detector = { config: OodConfig; score: (probs: number[], emb: Float32Array) => number };

let loading: Promise<Detector | null> | null = null;

const normalise = (v: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  return Float32Array.from(v, (x) => x / n);
};
export const cosine = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

export function loadDetector(): Promise<Detector | null> {
  loading ??= (async () => {
    const res = await fetch("/models/micrograph_ood.json");
    if (!res.ok) return null; // detector not trained yet — the page simply skips the check
    const config: OodConfig = await res.json();
    const protos = config.prototypes.map((p) => Float32Array.from(p));
    if (config.method === "max softmax") return { config, score: (p: number[]) => Math.max(...p) };
    if (config.method === "prototype cosine") {
      return { config, score: (_p: number[], e: Float32Array) => Math.max(...protos.map((q) => cosine(normalise(e), q))) };
    }
    if (config.method === "kNN" || config.method === "softmax + kNN") {
      // normalised-feature mean (D) | PCA components (P×D) | bank of training features (B×P)
      const D = config.embedding_dim;
      const P = config.pca_dim ?? 128;
      const B = config.bank_size ?? 0;
      const k = config.knn_k ?? 10;
      const buf = new Float32Array(await (await fetch("/models/micrograph_ood.bin")).arrayBuffer());
      const nmu = buf.subarray(0, D);
      const comps = buf.subarray(D, D + P * D);
      const bank = buf.subarray(D + P * D, D + P * D + B * P);
      const knn = (e: Float32Array) => {
        const n = normalise(e);
        const z = new Float32Array(P);
        for (let r = 0; r < P; r++) {
          let s = 0;
          for (let c = 0; c < D; c++) s += (n[c] - nmu[c]) * comps[r * D + c];
          z[r] = s;
        }
        const zn = normalise(z);
        const sims = new Float32Array(B);
        for (let b = 0; b < B; b++) {
          let s = 0;
          for (let i = 0; i < P; i++) s += zn[i] * bank[b * P + i];
          sims[b] = s;
        }
        sims.sort();
        return sims[B - k]; // k-th largest similarity
      };
      if (config.method === "kNN") return { config, score: (_p: number[], e: Float32Array) => knn(e) };
      const [mm, ms] = config.zscore!.msp;
      const [km, ks] = config.zscore!.knn;
      return { config, score: (p: number[], e: Float32Array) => (Math.max(...p) - mm) / ms + (knn(e) - km) / ks };
    }
    // Mahalanobis in a PCA subspace: mean (D) | components (P×D) | class means (K×P) | precision (P×P)
    const D = config.embedding_dim;
    const P = config.pca_dim ?? 128;
    const K = config.prototypes.length;
    const buf = new Float32Array(await (await fetch("/models/micrograph_ood.bin")).arrayBuffer());
    const mu = buf.subarray(0, D);
    const comps = buf.subarray(D, D + P * D);
    const cmeans = buf.subarray(D + P * D, D + P * D + K * P);
    const prec = buf.subarray(D + P * D + K * P);
    return {
      config,
      score: (_p: number[], e: Float32Array) => {
        const z = new Float32Array(P);
        for (let r = 0; r < P; r++) {
          let s = 0;
          for (let c = 0; c < D; c++) s += (e[c] - mu[c]) * comps[r * D + c];
          z[r] = s;
        }
        let best = Infinity;
        for (let k = 0; k < K; k++) {
          const d = Float32Array.from(z, (v, i) => v - cmeans[k * P + i]);
          let q = 0;
          for (let i = 0; i < P; i++) {
            let row = 0;
            for (let j = 0; j < P; j++) row += prec[i * P + j] * d[j];
            q += d[i] * row;
          }
          best = Math.min(best, q);
        }
        return -best; // higher = more like the training micrographs
      },
    };
  })().catch(() => {
    loading = null;
    return null;
  });
  return loading;
}

/** True if the image looks like one of the trained categories. */
export async function isRecognised(probs: number[], emb: Float32Array): Promise<{ recognised: boolean; method: string } | null> {
  const det = await loadDetector();
  if (!det) return null;
  return { recognised: det.score(probs, emb) >= det.config.threshold, method: det.config.method };
}

// ---------------- custom (lab) classes ----------------

export type CustomClass = { name: string; examples: number[][] }; // L2-normalised embeddings
const KEY = "smse-custom-micrograph-classes-v1";
const EVENT = "smse-custom-classes-change";
let memory = "[]"; // fallback when localStorage is unavailable

/** External-store API for useSyncExternalStore (hydration-safe). */
export function subscribeCustomClasses(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
export function customClassesSnapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}
export function parseCustomClasses(raw: string): CustomClass[] {
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveCustomClasses(classes: CustomClass[]) {
  memory = JSON.stringify(classes);
  try {
    localStorage.setItem(KEY, memory);
  } catch {
    // storage full or blocked — classes still work for this session
  }
  window.dispatchEvent(new Event(EVENT));
}

export const toStored = (emb: Float32Array) => Array.from(normalise(emb), (v) => +v.toFixed(5));

/**
 * Nearest-prototype classification over built-in classes (from ood.py) and custom classes.
 * Returns the best custom match if it beats every built-in class.
 */
export async function matchCustom(emb: Float32Array, classes: CustomClass[]) {
  if (!classes.length) return null;
  const e = normalise(emb);
  const det = await loadDetector();
  const builtin = det ? Math.max(...det.config.prototypes.map((p) => cosine(e, Float32Array.from(p)))) : -1;
  let best: { name: string; similarity: number } | null = null;
  for (const c of classes) {
    if (!c.examples.length) continue;
    const proto = normalise(c.examples.reduce((acc, ex) => acc.map((v, i) => v + ex[i]), new Array(ex0(c)).fill(0)));
    const sim = cosine(e, proto);
    if (!best || sim > best.similarity) best = { name: c.name, similarity: sim };
  }
  return best && best.similarity > builtin ? { ...best, builtin } : null;
}
const ex0 = (c: CustomClass) => c.examples[0].length;
