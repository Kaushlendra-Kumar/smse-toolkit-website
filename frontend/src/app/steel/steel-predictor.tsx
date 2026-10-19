"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge, Card, CardTitle, Input, Label, Notice, Segmented } from "@/components/ui";
import { loadSteelModel, type SteelModel, type TargetKey } from "@/lib/steel-model";

const TEMP = "Temperature (°C)";

const UNITS: Record<TargetKey, string> = {
  proof_stress: "MPa",
  tensile_strength: "MPa",
  elongation: "%",
  reduction_in_area: "%",
};
const SHORT: Record<TargetKey, string> = {
  proof_stress: "0.2% Proof stress",
  tensile_strength: "Tensile strength",
  elongation: "Elongation",
  reduction_in_area: "Reduction in area",
};

function predictFrom(model: SteelModel, elements: string[], comp: Record<string, string>, temperature: number) {
  const composition: Record<string, number> = {};
  for (const f of elements) {
    const v = parseFloat(comp[f]);
    if (comp[f] !== "" && comp[f] !== undefined && Number.isNaN(v)) return { result: null, error: `${f} must be a number.` };
    composition[f] = Number.isNaN(v) ? 0 : v;
  }
  try {
    return { result: model.predict(composition, temperature), error: null };
  } catch (e) {
    return { result: null, error: (e as Error).message };
  }
}

export function SteelPredictor() {
  const [model, setModel] = useState<SteelModel | null>(null);
  const [comp, setComp] = useState<Record<string, string>>({});
  const [temperature, setTemperature] = useState(27);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chartTarget, setChartTarget] = useState<TargetKey>("tensile_strength");

  useEffect(() => {
    loadSteelModel()
      .then((m) => {
        setModel(m);
        const s = m.schema;
        const ex = s.examples[0];
        setComp(Object.fromEntries(s.features.filter((f) => f !== TEMP).map((f) => [f, String(ex[f] ?? s.feature_ranges[f].median)])));
      })
      .catch((e) => setLoadError(e.message));
  }, []);

  const schema = model?.schema ?? null;
  const elements = useMemo(() => schema?.features.filter((f) => f !== TEMP) ?? [], [schema]);

  // The model runs in the browser in ~1 ms, so predictions are simply derived from the inputs.
  const { result, error } = model ? predictFrom(model, elements, comp, temperature) : { result: null, error: loadError };

  const chartData = useMemo(() => {
    if (!result) return [];
    const c = result.curve[chartTarget];
    return result.curve.temperature.map((t, i) => ({
      t,
      mean: c.mean[i],
      band: [+(c.mean[i] - c.std[i]).toFixed(2), +(c.mean[i] + c.std[i]).toFixed(2)],
    }));
  }, [result, chartTarget]);

  if (!schema) {
    return error ? <Notice>{error}</Notice> : <p className="text-muted">Loading model…</p>;
  }

  const tRange = schema.feature_ranges[TEMP];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <Card className="h-fit">
        <CardTitle>Composition (wt %)</CardTitle>
        <Label htmlFor="example">Start from a dataset alloy</Label>
        <select
          id="example"
          className="mb-5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          onChange={(e) => {
            const ex = schema.examples.find((x) => x.name === e.target.value);
            if (ex) setComp(Object.fromEntries(elements.map((f) => [f, String(ex[f])])));
          }}
        >
          {schema.examples.map((ex) => (
            <option key={ex.name} value={ex.name}>
              Alloy {ex.name}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-3">
          {elements.map((f) => {
            const r = schema.feature_ranges[f];
            return (
              <div key={f}>
                <Label htmlFor={`el-${f}`} hint={`${r.min}–${r.max}`}>
                  {f}
                </Label>
                <Input
                  id={`el-${f}`}
                  inputMode="decimal"
                  value={comp[f] ?? ""}
                  onChange={(e) => setComp((c) => ({ ...c, [f]: e.target.value }))}
                  className="font-mono"
                />
              </div>
            );
          })}
        </div>

        <div className="mt-5">
          <Label htmlFor="temp" hint={`${tRange.min}–${tRange.max} °C`}>
            Test temperature: <span className="font-mono">{temperature} °C</span>
          </Label>
          <input
            id="temp"
            type="range"
            min={tRange.min}
            max={tRange.max}
            step={1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </div>
      </Card>

      <div className="min-w-0 space-y-6">
        {error && <Notice>{error}</Notice>}
        {result?.warnings.map((w) => (
          <Notice key={w} tone="warn">
            {w}
          </Notice>
        ))}

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {(Object.keys(SHORT) as TargetKey[]).map((k) => {
            const p = result?.predictions[k];
            return (
              <Card key={k} className="p-4">
                <p className="text-xs text-muted">{SHORT[k]}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {p ? p.value.toFixed(k.includes("stress") || k.includes("strength") ? 0 : 1) : "—"}
                  <span className="ml-1 text-sm font-normal text-muted">{UNITS[k]}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted tabular-nums">{p ? `± ${p.std.toFixed(1)} ${UNITS[k]} model spread` : " "}</p>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardTitle>Effect of temperature</CardTitle>
          <Segmented
            label="Property to plot"
            value={chartTarget}
            onChange={setChartTarget}
            options={(Object.keys(SHORT) as TargetKey[]).map((k) => ({ value: k, label: SHORT[k] }))}
          />
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={[tRange.min, tRange.max]}
                  tick={{ fill: "var(--muted)", fontSize: 12 }}
                  stroke="var(--line)"
                  unit=" °C"
                />
                <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} stroke="var(--line)" width={56} unit={UNITS[chartTarget] === "%" ? "%" : ""} />
                <Tooltip
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(t) => `${t} °C`}
                  formatter={(v, name) =>
                    name === "band" && Array.isArray(v)
                      ? [`${v[0]} – ${v[1]} ${UNITS[chartTarget]}`, "± 1σ"]
                      : [`${v} ${UNITS[chartTarget]}`, SHORT[chartTarget]]
                  }
                />
                <Area dataKey="band" stroke="none" fill="var(--accent)" fillOpacity={0.15} isAnimationActive={false} />
                <Line dataKey="mean" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <ReferenceLine x={temperature} stroke="var(--muted)" strokeDasharray="4 4" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardTitle aside={<Badge>{schema.n_samples} tests · {schema.n_alloys} alloys</Badge>}>Model validation</CardTitle>
          <p className="mb-4 text-sm text-muted">
            5-fold cross-validation grouped by alloy: every score is measured on steels the model never saw in training.
            The 2023 thesis used multiple linear regression.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-136 text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2 pr-4 font-medium">Model</th>
                  {(Object.keys(SHORT) as TargetKey[]).map((k) => (
                    <th key={k} className="py-2 pr-4 font-medium">
                      {SHORT[k]} R²
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {Object.keys(schema.comparison.proof_stress).map((model) => (
                  <tr key={model}>
                    <td className="py-2 pr-4">{model}</td>
                    {(Object.keys(SHORT) as TargetKey[]).map((k) => {
                      const best = schema.targets[k].algorithm === model;
                      return (
                        <td key={k} className={`py-2 pr-4 font-mono tabular-nums ${best ? "font-semibold text-accent" : ""}`}>
                          {schema.comparison[k][model].r2.toFixed(3)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
