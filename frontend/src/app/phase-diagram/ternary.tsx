"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { lowerHullEdges, ternaryXY } from "@/lib/hull";

export type TernaryEntry = {
  material_id: string;
  formula: string;
  frac: number[];
  formation_energy: number;
  e_above_hull: number | null;
  is_stable: boolean;
  spacegroup: string | null;
};

const W = 640;
const PAD = 48;
const SIDE = W - 2 * PAD;
const H = (SIDE * Math.sqrt(3)) / 2 + 2 * PAD;

/** Ternary convex-hull phase diagram: stable phases, tie-lines and (optionally) unstable phases. */
export function Ternary({ elements, entries, maxHull }: { elements: string[]; entries: TernaryEntry[]; maxHull: number }) {
  const router = useRouter();
  const [hover, setHover] = useState<TernaryEntry | null>(null);

  const px = (frac: number[]) => {
    const { u, v } = ternaryXY(frac);
    return { x: PAD + u * SIDE, y: H - PAD - v * SIDE };
  };

  const { stable, edges, unstable } = useMemo(() => {
    // One point per composition on the hull (lowest energy).
    const best = new Map<string, TernaryEntry>();
    for (const e of entries) {
      if (!e.is_stable) continue;
      const key = e.frac.map((f) => f.toFixed(4)).join(",");
      const cur = best.get(key);
      if (!cur || e.formation_energy < cur.formation_energy) best.set(key, e);
    }
    const stable = [...best.values()];
    const edges = lowerHullEdges(stable.map((s) => ({ ...ternaryXY(s.frac), e: s.formation_energy })));
    const unstable = entries.filter((e) => !e.is_stable && (e.e_above_hull ?? Infinity) <= maxHull);
    return { stable, edges, unstable };
  }, [entries, maxHull]);

  const corners = [px([1, 0, 0]), px([0, 1, 0]), px([0, 0, 1])];
  const isElement = (e: TernaryEntry) => e.frac.some((f) => f > 0.9999);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-2xl" role="img" aria-label={`${elements.join("–")} ternary phase diagram`}>
        <polygon points={corners.map((c) => `${c.x},${c.y}`).join(" ")} fill="var(--surface-2)" stroke="var(--muted)" strokeWidth="1.2" />
        {edges.map(([i, j]) => {
          const a = px(stable[i].frac);
          const b = px(stable[j].frac);
          return <line key={`${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--accent)" strokeOpacity="0.55" strokeWidth="1.2" />;
        })}
        {unstable.map((e) => {
          const p = px(e.frac);
          return (
            <circle
              key={e.material_id}
              cx={p.x}
              cy={p.y}
              r={3}
              fill="var(--muted)"
              fillOpacity="0.5"
              className="cursor-pointer"
              onMouseEnter={() => setHover(e)}
              onMouseLeave={() => setHover(null)}
              onClick={() => router.push(`/materials/${e.material_id}`)}
            />
          );
        })}
        {stable.map((e) => {
          const p = px(e.frac);
          const el = isElement(e);
          return (
            <g key={e.material_id} className="cursor-pointer" onMouseEnter={() => setHover(e)} onMouseLeave={() => setHover(null)} onClick={() => router.push(`/materials/${e.material_id}`)}>
              <circle cx={p.x} cy={p.y} r={el ? 6 : 5} fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5" />
              {!el && (
                <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="11" fill="var(--fg)" style={{ paintOrder: "stroke", stroke: "var(--surface-2)", strokeWidth: 3 }}>
                  {e.formula}
                </text>
              )}
            </g>
          );
        })}
        {elements.map((el, i) => {
          const c = corners[i];
          return (
            <text key={el} x={c.x + (i === 0 ? -14 : i === 1 ? 14 : 0)} y={c.y + (i === 2 ? -14 : 22)} textAnchor="middle" fontSize="16" fontWeight="600" fill="var(--fg)">
              {el}
            </text>
          );
        })}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute right-2 top-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm">
          <p className="font-semibold">
            {hover.formula} <span className="font-normal text-muted">{hover.spacegroup}</span>
          </p>
          <p className="font-mono text-muted">{hover.material_id}</p>
          <p className="mt-1">ΔH<sub>f</sub> = {hover.formation_energy.toFixed(3)} eV/atom</p>
          <p>{hover.is_stable ? "Stable (on the hull)" : `${(hover.e_above_hull ?? 0).toFixed(3)} eV/atom above hull`}</p>
        </div>
      )}
      <p className="mt-2 text-center text-xs text-muted">
        {stable.filter((s) => !isElement(s)).length} stable compounds · {edges.length} tie-line{edges.length === 1 ? "" : "s"} · lines connect phases that coexist in equilibrium
      </p>
    </div>
  );
}
