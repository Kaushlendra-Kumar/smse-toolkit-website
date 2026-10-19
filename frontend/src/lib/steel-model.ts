/**
 * In-browser steel property prediction: evaluates the scikit-learn tree ensembles
 * exported by backend/ml/steel/export_web.py (public/models/steel.{json,bin}).
 */

const TEMP = "Temperature (°C)";

export type TargetKey = "proof_stress" | "tensile_strength" | "elongation" | "reduction_in_area";
type Range = { min: number; max: number; median: number };

export type SteelSchema = {
  nodes: number;
  features: string[];
  feature_ranges: Record<string, Range>;
  targets: Record<TargetKey, { label: string; algorithm: string; r2: number; mae: number; trees: [number, number][] }>;
  n_samples: number;
  n_alloys: number;
  examples: ({ name: string } & Record<string, number>)[];
  comparison: Record<TargetKey, Record<string, { r2: number; mae: number }>>;
};

export type SteelPrediction = {
  predictions: Record<TargetKey, { label: string; value: number; std: number }>;
  curve: { temperature: number[] } & Record<TargetKey, { mean: number[]; std: number[] }>;
  warnings: string[];
};

export type SteelModel = {
  schema: SteelSchema;
  predict: (composition: Record<string, number>, temperature: number) => SteelPrediction;
};

let loading: Promise<SteelModel> | null = null;

export function loadSteelModel(): Promise<SteelModel> {
  loading ??= (async () => {
    const [schemaRes, binRes] = await Promise.all([fetch("/models/steel.json"), fetch("/models/steel.bin")]);
    if (!schemaRes.ok || !binRes.ok) throw new Error("Could not load the steel model files.");
    const schema: SteelSchema = await schemaRes.json();
    const buf = await binRes.arrayBuffer();
    const n = schema.nodes;
    const value = new Float32Array(buf, 0, n);
    const left = new Int16Array(buf, 4 * n, n);
    const right = new Int16Array(buf, 6 * n, n);
    const feature = new Int8Array(buf, 8 * n, n);

    const tree = (offset: number, x: Float32Array) => {
      let i = 0;
      while (feature[offset + i] !== -1) {
        i = x[feature[offset + i]] <= value[offset + i] ? left[offset + i] : right[offset + i];
      }
      return value[offset + i];
    };

    /** Mean and (population) std across trees — std is the ensemble spread shown as ± in the UI. */
    const ensemble = (key: TargetKey, x: Float32Array) => {
      const trees = schema.targets[key].trees;
      let sum = 0;
      let sq = 0;
      for (const [offset] of trees) {
        const v = tree(offset, x);
        sum += v;
        sq += v * v;
      }
      const mean = sum / trees.length;
      return { mean, std: Math.sqrt(Math.max(0, sq / trees.length - mean * mean)) };
    };

    const round = (v: number) => Math.round(v * 100) / 100;
    const keys = Object.keys(schema.targets) as TargetKey[];

    const predict = (composition: Record<string, number>, temperature: number): SteelPrediction => {
      const unknown = Object.keys(composition).filter((k) => !schema.features.includes(k));
      if (unknown.length) throw new Error(`Unknown features: ${unknown.join(", ")}`);
      const row = (t: number) => Float32Array.from(schema.features, (f) => (f === TEMP ? t : (composition[f] ?? 0)));

      const warnings: string[] = [];
      const x = row(temperature);
      schema.features.forEach((f, i) => {
        const { min, max } = schema.feature_ranges[f];
        const v = f === TEMP ? temperature : (composition[f] ?? 0);
        if (v < min - 1e-9 || v > max + 1e-9)
          warnings.push(`${f} = ${+x[i].toPrecision(6)} is outside the training range [${min}, ${max}]; prediction is an extrapolation.`);
      });

      const tr = schema.feature_ranges[TEMP];
      const temps = Array.from({ length: 25 }, (_, i) => Math.round(tr.min + ((tr.max - tr.min) * i) / 24));
      const rows = temps.map(row);

      const predictions = {} as SteelPrediction["predictions"];
      const curve = { temperature: temps } as SteelPrediction["curve"];
      for (const k of keys) {
        const p = ensemble(k, x);
        predictions[k] = { label: schema.targets[k].label, value: round(p.mean), std: round(p.std) };
        const pts = rows.map((r) => ensemble(k, r));
        curve[k] = { mean: pts.map((q) => round(q.mean)), std: pts.map((q) => round(q.std)) };
      }
      return { predictions, curve, warnings };
    };

    return { schema, predict };
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}
