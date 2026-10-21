"use client";

import { useEffect, useState } from "react";

import { Card, CardTitle, Segmented } from "@/components/ui";
import { apiGet } from "@/lib/api";

type Spin = number[][];
type Electronic = {
  path: string | null;
  bandstructure: {
    x: number[];
    labels: { x: number; label: string }[];
    up: Spin;
    down: Spin | null;
    is_metal: boolean;
    band_gap: { energy: number; direct: boolean; transition: string | null } | null;
  } | null;
  dos: {
    energies: number[];
    total: { up: number[]; down: number[] | null };
    elements: Record<string, { up: number[]; down: number[] | null }>;
  } | null;
};

const GREEK: Record<string, string> = { Gamma: "Γ", Sigma: "Σ", Delta: "Δ", Lambda: "Λ" };
const prettyK = (l: string) =>
  l.replace(/\\(Gamma|Sigma|Delta|Lambda)/g, (_, g) => GREEK[g]).replace(/\\mid/g, "|").replace(/_(\d)/g, (_, d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]);
const ELEMENT_COLORS = ["#e8590c", "#7048e8", "#2f9e44", "#c2255c", "#1c7ed6"];

// SVG layout (viewBox units)
const W = 820;
const H = 440;
const M = { top: 16, right: 12, bottom: 36, left: 52 };
const GAP = 18;
const BS_W = 560;
const DOS_W = W - M.left - M.right - BS_W - GAP;
const PH = H - M.top - M.bottom;

export function ElectronicPlot({ id }: { id: string }) {
  const [data, setData] = useState<Electronic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState("4");

  useEffect(() => {
    let live = true;
    apiGet<Electronic>(`/materials/${encodeURIComponent(id)}/electronic`)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id]);

  if (error) {
    return (
      <Card>
        <CardTitle>Electronic structure</CardTitle>
        <p className="text-sm text-muted">{error}</p>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card>
        <CardTitle>Electronic structure</CardTitle>
        <div className="aspect-820/440 w-full animate-pulse rounded-lg bg-surface-2" />
        <p className="mt-2 text-xs text-muted">Loading the band structure and density of states (first view of a material takes a few seconds)…</p>
      </Card>
    );
  }

  const E = Number(range);
  const y = (e: number) => M.top + ((E - e) / (2 * E)) * PH;
  const bs = data.bandstructure;
  const dos = data.dos;

  // Band-structure x scale
  const xmax = bs ? bs.x[bs.x.length - 1] || 1 : 1;
  const bx = (v: number) => M.left + (v / xmax) * BS_W;
  // New sub-path where the k-path jumps (two consecutive points at the same x, e.g. "A|L").
  const bandPath = (band: number[]) =>
    band.map((e, i) => `${i === 0 || bs!.x[i] === bs!.x[i - 1] ? "M" : "L"}${bx(bs!.x[i]).toFixed(1)},${y(e).toFixed(1)}`).join("");

  // Merge labels at the same position (path discontinuities) as "X|U".
  const ticks: { x: number; label: string }[] = [];
  for (const l of bs?.labels ?? []) {
    const t = ticks.find((q) => Math.abs(q.x - l.x) < 1e-4);
    if (t) {
      if (!t.label.split("|").includes(prettyK(l.label))) t.label += `|${prettyK(l.label)}`;
    } else ticks.push({ x: l.x, label: prettyK(l.label) });
  }

  // DOS: both spin channels summed for spin-polarised calculations.
  const both = (s: { up: number[]; down: number[] | null }) => (s.down ? s.up.map((v, i) => v + s.down![i]) : s.up);
  const totalDos = dos ? both(dos.total) : [];
  const dx0 = M.left + BS_W + GAP;
  let dmax = 0;
  if (dos) dos.energies.forEach((e, i) => Math.abs(e) <= E && (dmax = Math.max(dmax, totalDos[i])));
  dmax = dmax || 1;
  const dx = (v: number) => dx0 + (v / dmax) * DOS_W;
  // SVG `points` list (polyline/polygon), not path syntax.
  const dosPath = (vals: number[]) =>
    dos!.energies.map((e, i) => (Math.abs(e) <= E + 0.5 ? `${dx(vals[i]).toFixed(1)},${y(e).toFixed(1)}` : null)).filter(Boolean).join(" ");
  const elements = dos ? Object.keys(dos.elements) : [];

  const yTicks: number[] = [];
  for (let v = -E; v <= E; v += E > 4 ? 2 : 1) yTicks.push(v);

  return (
    <Card>
      <CardTitle
        aside={
          <Segmented
            label="Energy window"
            value={range}
            onChange={setRange}
            options={[
              { value: "2", label: "±2 eV" },
              { value: "4", label: "±4 eV" },
              { value: "8", label: "±8 eV" },
            ]}
          />
        }
      >
        Electronic structure
      </CardTitle>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-xl" role="img" aria-label="Band structure and density of states">
          <defs>
            <clipPath id="bs-clip">
              <rect x={M.left} y={M.top} width={BS_W} height={PH} />
            </clipPath>
            <clipPath id="dos-clip">
              <rect x={dx0} y={M.top} width={DOS_W} height={PH} />
            </clipPath>
          </defs>

          {/* y axis + grid */}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={dx0 + DOS_W} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={v === 0 ? undefined : "2 4"} />
              <text x={M.left - 8} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">
                {v}
              </text>
            </g>
          ))}
          <text transform={`translate(14 ${M.top + PH / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="var(--muted)">
            E − E<tspan baselineShift="sub" fontSize="9">F</tspan> (eV)
          </text>

          {/* band structure */}
          {bs ? (
            <g>
              <rect x={M.left} y={M.top} width={BS_W} height={PH} fill="none" stroke="var(--line)" />
              {ticks.map((t) => (
                <g key={t.x}>
                  <line x1={bx(t.x)} x2={bx(t.x)} y1={M.top} y2={M.top + PH} stroke="var(--line)" />
                  <text x={bx(t.x)} y={H - 14} textAnchor="middle" fontSize="13" fill="var(--fg)">
                    {t.label}
                  </text>
                </g>
              ))}
              <g clipPath="url(#bs-clip)" fill="none" strokeWidth="1.5">
                {bs.up.map((b, i) => (
                  <path key={`u${i}`} d={bandPath(b)} stroke="var(--accent)" />
                ))}
                {bs.down?.map((b, i) => (
                  <path key={`d${i}`} d={bandPath(b)} stroke="#e8590c" strokeDasharray="4 3" />
                ))}
              </g>
              <line x1={M.left} x2={M.left + BS_W} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeDasharray="6 4" />
            </g>
          ) : (
            <text x={M.left + BS_W / 2} y={M.top + PH / 2} textAnchor="middle" fontSize="13" fill="var(--muted)">
              No band structure calculation available
            </text>
          )}

          {/* DOS */}
          {dos && (
            <g>
              <rect x={dx0} y={M.top} width={DOS_W} height={PH} fill="none" stroke="var(--line)" />
              <g clipPath="url(#dos-clip)">
                <polygon
                  points={`${dx(0)},${y(Math.max(-E - 0.5, dos.energies[0]))} ${dosPath(totalDos)} ${dx(0)},${y(Math.min(E + 0.5, dos.energies[dos.energies.length - 1]))}`} fill="var(--accent)" fillOpacity="0.15" stroke="var(--accent)" strokeWidth="1.2" />
                {elements.map((el, i) => (
                  <polyline key={el} points={dosPath(both(dos.elements[el]))} fill="none" stroke={ELEMENT_COLORS[i % ELEMENT_COLORS.length]} strokeWidth="1.2" />
                ))}
              </g>
              <line x1={dx0} x2={dx0 + DOS_W} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeDasharray="6 4" />
              <text x={dx0 + DOS_W / 2} y={H - 14} textAnchor="middle" fontSize="12" fill="var(--muted)">
                DOS (states/eV)
              </text>
            </g>
          )}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
        {bs?.band_gap && (
          <span>
            Band gap <span className="font-mono">{bs.band_gap.energy} eV</span>
            {bs.band_gap.energy > 0 && <span className="text-muted"> · {bs.band_gap.direct ? "direct" : "indirect"}{bs.band_gap.transition ? ` (${prettyK(bs.band_gap.transition)})` : ""}</span>}
          </span>
        )}
        {bs?.is_metal && <span>Metallic</span>}
        <span className="flex items-center gap-1.5 text-muted">
          <span className="h-0.5 w-5 bg-accent" aria-hidden /> {bs?.down ? "spin up" : "bands / total DOS"}
        </span>
        {bs?.down && (
          <span className="flex items-center gap-1.5 text-muted">
            <span className="h-0 w-5 border-t-2 border-dashed border-[#e8590c]" aria-hidden /> spin down
          </span>
        )}
        {elements.map((el, i) => (
          <span key={el} className="flex items-center gap-1.5 text-muted">
            <span className="h-0.5 w-5" style={{ background: ELEMENT_COLORS[i % ELEMENT_COLORS.length] }} aria-hidden /> {el} DOS
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        DFT (GGA/GGA+U) calculations from the Materials Project{data.path ? `, k-path convention: ${data.path.replace("_", "–")}` : ""}. DFT typically
        underestimates band gaps.
      </p>
    </Card>
  );
}
