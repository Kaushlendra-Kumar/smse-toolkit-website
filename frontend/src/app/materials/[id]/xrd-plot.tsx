"use client";

import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import { Button, Card, CardTitle } from "@/components/ui";
import { computeXrd, WAVELENGTHS, type Radiation, type XrdStructure } from "@/lib/xrd";

const W = 820;
const H = 320;
const M = { top: 24, right: 16, bottom: 40, left: 48 };
const PW = W - M.left - M.right;
const PH = H - M.top - M.bottom;
const FWHM = 0.15; // degrees — a typical laboratory diffractometer

/** Plain-text Miller indices for CSV/tooltips: "(1 -1 0 0)". */
const fmtHkl = (h: number[]) => `(${h.join(" ")})`;

/** Crystallographic notation: negative indices drawn with an overline, e.g. (1 1̄ 0 0). Works in HTML and SVG text. */
function Hkl({ hkl, svg = false }: { hkl: number[]; svg?: boolean }) {
  const Part = svg ? "tspan" : "span";
  return (
    <>
      (
      {hkl.map((v, i) =>
        v < 0 ? (
          <Part key={i} style={{ textDecoration: "overline" }}>
            {-v}
          </Part>
        ) : (
          <Part key={i}>{v}</Part>
        ),
      )}
      )
    </>
  );
}

export function XrdPlot({ structure, formula }: { structure: XrdStructure; formula: string }) {
  const [radiation, setRadiation] = useState<Radiation>("CuKa");
  const [max2t, setMax2t] = useState(90);

  const { peaks, error } = useMemo(() => {
    try {
      // Merge reflections within 0.05° for display (DFT cells are often very slightly distorted).
      const raw = computeXrd(structure, WAVELENGTHS[radiation], [5, max2t]);
      const merged: typeof raw = [];
      for (const p of raw) {
        const last = merged[merged.length - 1];
        if (last && p.twoTheta - last.twoTheta < 0.05) {
          if (p.intensity > last.intensity) last.hkl = p.hkl;
          last.intensity += p.intensity;
          last.multiplicity += p.multiplicity;
        } else merged.push({ ...p });
      }
      const top = Math.max(...merged.map((p) => p.intensity), 1);
      return { peaks: merged.map((p) => ({ ...p, intensity: (p.intensity / top) * 100 })), error: null };
    } catch (e) {
      return { peaks: [], error: (e as Error).message };
    }
  }, [structure, radiation, max2t]);

  const x = (t: number) => M.left + ((t - 5) / (max2t - 5)) * PW;
  const y = (i: number) => M.top + PH - (i / 105) * PH;

  // Pseudo-experimental profile: Gaussian broadening of each line.
  const profile = useMemo(() => {
    const sigma = FWHM / 2.3548;
    const pts: number[] = [];
    const n = 900;
    let peakMax = 0;
    for (let s = 0; s <= n; s++) {
      const t = 5 + ((max2t - 5) * s) / n;
      let v = 0;
      for (const p of peaks) if (Math.abs(p.twoTheta - t) < 5 * sigma) v += p.intensity * Math.exp(-((p.twoTheta - t) ** 2) / (2 * sigma * sigma));
      pts.push(v);
      peakMax = Math.max(peakMax, v);
    }
    return pts.map((v, s) => `${x(5 + ((max2t - 5) * s) / n).toFixed(1)},${y((v / (peakMax || 1)) * 100).toFixed(1)}`).join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- x/y derive from max2t
  }, [peaks, max2t]);

  const labelled = [...peaks].sort((a, b) => b.intensity - a.intensity).slice(0, 8);
  const table = [...peaks].sort((a, b) => b.intensity - a.intensity).slice(0, 12).sort((a, b) => a.twoTheta - b.twoTheta);

  const downloadCsv = () => {
    const rows = ["two_theta_deg,d_spacing_A,relative_intensity,hkl,multiplicity", ...peaks.map((p) => `${p.twoTheta.toFixed(4)},${p.d.toFixed(5)},${p.intensity.toFixed(3)},"${fmtHkl(p.hkl)}",${p.multiplicity}`)];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: `${formula}-xrd-${radiation}.csv` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Card>
      <CardTitle
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="X-ray source"
              value={radiation}
              onChange={(e) => setRadiation(e.target.value as Radiation)}
              className="rounded-lg border border-line bg-surface px-2 py-1 text-sm"
            >
              {(Object.keys(WAVELENGTHS) as Radiation[]).map((r) => (
                <option key={r} value={r}>
                  {r.replace("Ka", " Kα")} ({WAVELENGTHS[r]} Å)
                </option>
              ))}
            </select>
            <select aria-label="2θ range" value={max2t} onChange={(e) => setMax2t(Number(e.target.value))} className="rounded-lg border border-line bg-surface px-2 py-1 text-sm">
              {[60, 90, 120, 150].map((v) => (
                <option key={v} value={v}>
                  5–{v}°
                </option>
              ))}
            </select>
            <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={downloadCsv} disabled={!peaks.length}>
              <Download className="size-3.5" aria-hidden /> CSV
            </Button>
          </div>
        }
      >
        Simulated XRD pattern
      </CardTitle>

      {error ? (
        <p className="text-sm text-muted">{error}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-xl" role="img" aria-label={`Simulated powder X-ray diffraction pattern of ${formula}`}>
              <rect x={M.left} y={M.top} width={PW} height={PH} fill="none" stroke="var(--line)" />
              {Array.from({ length: Math.floor((max2t - 10) / 10) + 1 }, (_, i) => 10 + i * 10).map((t) => (
                <g key={t}>
                  <line x1={x(t)} x2={x(t)} y1={M.top + PH} y2={M.top + PH + 5} stroke="var(--muted)" />
                  <text x={x(t)} y={M.top + PH + 18} textAnchor="middle" fontSize="12" fill="var(--muted)">
                    {t}
                  </text>
                </g>
              ))}
              <text x={M.left + PW / 2} y={H - 4} textAnchor="middle" fontSize="12" fill="var(--muted)">
                2θ (°)
              </text>
              <text transform={`translate(16 ${M.top + PH / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="var(--muted)">
                Intensity (a.u.)
              </text>
              <polyline points={profile} fill="none" stroke="var(--muted)" strokeOpacity="0.6" strokeWidth="1" />
              {peaks.map((p) => (
                <line key={p.twoTheta} x1={x(p.twoTheta)} x2={x(p.twoTheta)} y1={y(0)} y2={y(p.intensity)} stroke="var(--accent)" strokeWidth="1.6">
                  <title>
                    2θ {p.twoTheta.toFixed(3)}° · d {p.d.toFixed(4)} Å · {fmtHkl(p.hkl)} · I {p.intensity.toFixed(1)}
                  </title>
                </line>
              ))}
              {labelled.map((p) => (
                <text key={`l${p.twoTheta}`} x={x(p.twoTheta)} y={y(p.intensity) - 5} textAnchor="middle" fontSize="11" fill="var(--fg)">
                  <Hkl hkl={p.hkl} svg />
                </text>
              ))}
            </svg>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-4 font-medium">2θ (°)</th>
                  <th className="py-2 pr-4 font-medium">d (Å)</th>
                  <th className="py-2 pr-4 font-medium">hkl</th>
                  <th className="py-2 pr-4 font-medium">I / I<sub>max</sub></th>
                  <th className="py-2 font-medium">Mult.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line font-mono tabular-nums">
                {table.map((p) => (
                  <tr key={p.twoTheta}>
                    <td className="py-1.5 pr-4">{p.twoTheta.toFixed(3)}</td>
                    <td className="py-1.5 pr-4">{p.d.toFixed(4)}</td>
                    <td className="py-1.5 pr-4 font-sans"><Hkl hkl={p.hkl} /></td>
                    <td className="py-1.5 pr-4">{p.intensity.toFixed(1)}</td>
                    <td className="py-1.5">{p.multiplicity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">
            Kinematic powder pattern computed in your browser from the calculated structure (same method as pymatgen&apos;s
            XRDCalculator; no thermal or preferred-orientation effects). The grey trace is broadened to {FWHM}° FWHM for
            comparison with measured patterns. DFT lattice constants are usually within ~1–2% of experiment, which shifts peaks
            slightly.
          </p>
        </>
      )}
    </Card>
  );
}
