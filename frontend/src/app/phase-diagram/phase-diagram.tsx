"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";

import { Badge, Button, Card, CardTitle, Input, Label, Notice } from "@/components/ui";
import { apiGet } from "@/lib/api";

import { Ternary } from "./ternary";

type Entry = {
  material_id: string;
  formula: string;
  x: number;
  frac: number[];
  formation_energy: number;
  e_above_hull: number | null;
  is_stable: boolean;
  spacegroup: string | null;
};
type PhaseResponse = { elements: string[]; total: number; entries: Entry[] };

const EXAMPLES: string[][] = [
  ["Fe", "O"],
  ["Ti", "O"],
  ["Ni", "Al"],
  ["Cu", "Zn"],
  ["Li", "Co", "O"],
  ["Ba", "Ti", "O"],
  ["Li", "Fe", "P"],
  ["Al", "Ni", "Ti"],
];

function PointTooltip({ active, payload }: { active?: boolean; payload?: { payload: Entry }[] }) {
  if (!active || !payload?.length) return null;
  const e = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold">
        {e.formula} <span className="font-normal text-muted">{e.spacegroup}</span>
      </p>
      <p className="font-mono text-muted">{e.material_id}</p>
      <p className="mt-1">ΔH<sub>f</sub> = {e.formation_energy.toFixed(3)} eV/atom</p>
      <p>{e.is_stable ? "On the convex hull (stable)" : `${(e.e_above_hull ?? 0).toFixed(3)} eV/atom above hull`}</p>
      <p className="mt-1 text-muted">Click to open</p>
    </div>
  );
}

export function PhaseDiagram() {
  const router = useRouter();
  const [a, setA] = useState("Fe");
  const [b, setB] = useState("O");
  const [c, setC] = useState("");
  const [data, setData] = useState<PhaseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [maxHull, setMaxHull] = useState(0.3);

  const load = useCallback(async (els: string[]) => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiGet<PhaseResponse>("/phase", { elements: els.filter(Boolean).join(",") }));
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Show Fe–O on first visit.
  useEffect(() => {
    apiGet<PhaseResponse>("/phase", { elements: "Fe,O" })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const ternary = (data?.elements.length ?? 0) === 3;

  const { hull, others, stable } = useMemo(() => {
    if (!data) return { hull: [], others: [], stable: [] };
    if (data.elements.length === 3) {
      const stable = data.entries
        .filter((e) => e.is_stable && !e.frac.some((f) => f > 0.9999))
        .sort((p, q) => p.formation_energy - q.formation_energy);
      return { hull: [], others: [], stable };
    }
    // Hull vertices: lowest stable entry at each composition, left to right.
    const best = new Map<number, Entry>();
    for (const e of data.entries) {
      if (!e.is_stable) continue;
      const key = Math.round(e.x * 1e6);
      const cur = best.get(key);
      if (!cur || e.formation_energy < cur.formation_energy) best.set(key, e);
    }
    const hull = [...best.values()].sort((p, q) => p.x - q.x);
    const others = data.entries.filter((e) => !e.is_stable && (e.e_above_hull ?? Infinity) <= maxHull);
    return { hull, others, stable: hull.filter((e) => e.x > 0 && e.x < 1) };
  }, [data, maxHull]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    load([a, b, c]);
  };

  const [ea, eb] = data?.elements ?? [a, b];
  const systemName = (data?.elements ?? [a, b]).join("–");
  const open = (e: Entry) => router.push(`/materials/${e.material_id}`);

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <div className="w-28">
            <Label htmlFor="el-a">Element A</Label>
            <Input id="el-a" value={a} onChange={(e) => setA(e.target.value)} required maxLength={2} />
          </div>
          <div className="w-28">
            <Label htmlFor="el-b">Element B</Label>
            <Input id="el-b" value={b} onChange={(e) => setB(e.target.value)} required maxLength={2} />
          </div>
          <div className="w-32">
            <Label htmlFor="el-c" hint="ternary">
              Element C
            </Label>
            <Input id="el-c" value={c} onChange={(e) => setC(e.target.value)} maxLength={2} placeholder="optional" />
          </div>
          <Button type="submit" loading={loading}>
            Compute hull
          </Button>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((els) => (
              <Button
                key={els.join()}
                type="button"
                variant="ghost"
                className="px-2.5 py-1 text-xs"
                onClick={() => {
                  setA(els[0]);
                  setB(els[1]);
                  setC(els[2] ?? "");
                  load(els);
                }}
              >
                {els.join("–")}
              </Button>
            ))}
          </div>
        </form>
      </Card>

      {error && <Notice>{error}</Notice>}

      {data && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <Card>
            <CardTitle aside={<Badge>{data.total} entries</Badge>}>
              {systemName} {ternary ? "ternary phase diagram" : "formation energy convex hull"}
            </CardTitle>
            {ternary ? (
              <Ternary elements={data.elements} entries={data.entries} maxHull={maxHull} />
            ) : (
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 8 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={[0, 1]}
                    ticks={[0, 0.25, 0.5, 0.75, 1]}
                    tickFormatter={(v) => (v === 0 ? ea : v === 1 ? eb : `${Math.round(v * 100)}%`)}
                    tick={{ fill: "var(--muted)", fontSize: 12 }}
                    stroke="var(--line)"
                    label={{ value: `Atomic fraction of ${eb}`, position: "bottom", offset: 6, fill: "var(--muted)", fontSize: 12 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="formation_energy"
                    tick={{ fill: "var(--muted)", fontSize: 12 }}
                    stroke="var(--line)"
                    width={64}
                    tickFormatter={(v) => v.toFixed(1)}
                    label={{ value: "ΔHf (eV/atom)", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 12 }}
                  />
                  <ReferenceLine y={0} stroke="var(--muted)" strokeDasharray="4 4" />
                  <Tooltip content={<PointTooltip />} cursor={{ strokeDasharray: "3 3" }} />
                  <Scatter
                    name="Above hull"
                    data={others}
                    fill="var(--muted)"
                    fillOpacity={0.45}
                    shape="circle"
                    isAnimationActive={false}
                    onClick={(p) => open(p.payload as Entry)}
                    className="cursor-pointer"
                  />
                  <Scatter
                    name="Stable"
                    data={hull}
                    fill="var(--accent)"
                    line={{ stroke: "var(--accent)", strokeWidth: 2 }}
                    lineType="joint"
                    isAnimationActive={false}
                    onClick={(p) => open(p.payload as Entry)}
                    className="cursor-pointer"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                Show unstable phases up to
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={maxHull}
                  onChange={(e) => setMaxHull(Number(e.target.value))}
                  className="w-32 accent-accent"
                />
                <span className="font-mono tabular-nums">{maxHull.toFixed(2)}</span> eV/atom above hull
              </label>
              {!ternary && (
                <span className="text-xs text-muted">
                  {others.length} of {data.entries.length - hull.length} unstable entries shown
                </span>
              )}
            </div>
          </Card>

          <Card className="h-fit">
            <CardTitle>Stable compounds</CardTitle>
            {stable.length === 0 ? (
              <p className="text-sm text-muted">
                No stable compounds in the {systemName} system in the Materials Project — at 0 K these elements don&apos;t
                form a thermodynamically stable compound (in this dataset).
              </p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {stable.map((e) => (
                  <li key={e.material_id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/materials/${e.material_id}`} className="font-medium hover:text-accent">
                      {e.formula}
                      <span className="ml-2 text-xs font-normal text-muted">{e.spacegroup}</span>
                    </Link>
                    <span className="font-mono tabular-nums text-muted">{e.formation_energy.toFixed(3)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-muted">
              Formation energies (eV/atom) from DFT calculations in the{" "}
              <a href="https://materialsproject.org" className="underline" target="_blank" rel="noreferrer">
                Materials Project <ExternalLink className="inline size-3" aria-hidden />
              </a>
              , which uses its full multi-element hull; it is a 0 K ground-state picture, not a temperature phase
              diagram.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
