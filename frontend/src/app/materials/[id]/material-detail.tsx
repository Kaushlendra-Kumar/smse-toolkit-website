"use client";

import { ArrowLeft, ExternalLink, FileDown } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useEffect, useState } from "react";

import type { Structure } from "@/components/crystal-viewer";
import { Badge, Button, Card, CardTitle, Notice } from "@/components/ui";
import { apiGet } from "@/lib/api";
import { downloadMaterialReport } from "@/lib/report";

import { ElectronicPlot } from "./electronic-plot";
import { FermiSection } from "./fermi-section";
import { XrdPlot } from "./xrd-plot";

// three.js is ~600 kB: load it only on this page, in the browser.
const CrystalViewer = dynamic(() => import("@/components/crystal-viewer").then((m) => m.CrystalViewer), {
  ssr: false,
  loading: () => <div className="aspect-square w-full animate-pulse rounded-lg border border-line bg-surface-2" />,
});

type Value = string | number | boolean | null | undefined | unknown[];
type Material = Record<string, Value> & { material_id: string; formula_pretty: string; structure?: Structure };
type Similar = {
  formula_anonymous: string;
  spacegroup_number: number | null;
  total: number;
  results: { material_id: string; formula_pretty: string; band_gap: number | null; density: number | null; energy_above_hull: number | null; is_stable: boolean }[];
};

/** [field, label, unit] grouped like the Materials Project page. */
const GROUPS: [string, [string, string, string?][]][] = [
  ["Structure", [["crystal_system", "Crystal system"], ["spacegroup", "Space group"], ["nsites", "Sites in cell"], ["volume", "Volume", "Å³"], ["density", "Density", "g/cm³"], ["density_atomic", "Atomic volume", "Å³/atom"]]],
  ["Thermodynamics", [["formation_energy_per_atom", "Formation energy", "eV/atom"], ["energy_above_hull", "Energy above hull", "eV/atom"], ["is_stable", "Stable"], ["theoretical", "Theoretical only"]]],
  ["Electronic", [["band_gap", "Band gap", "eV"], ["is_gap_direct", "Direct gap"], ["is_metal", "Metal"], ["efermi", "Fermi energy", "eV"], ["cbm", "Conduction band min.", "eV"], ["vbm", "Valence band max.", "eV"]]],
  ["Magnetic", [["ordering", "Ordering"], ["total_magnetization", "Total magnetization", "μB/cell"], ["total_magnetization_normalized_formula_units", "Magnetization", "μB/f.u."], ["num_magnetic_sites", "Magnetic sites"], ["types_of_magnetic_species", "Magnetic species"]]],
  ["Mechanical", [["k_vrh", "Bulk modulus (VRH)", "GPa"], ["g_vrh", "Shear modulus (VRH)", "GPa"], ["universal_anisotropy", "Elastic anisotropy"], ["homogeneous_poisson", "Poisson's ratio"]]],
  ["Dielectric & piezoelectric", [["e_total", "Dielectric constant (total)"], ["e_electronic", "Dielectric constant (electronic)"], ["e_ionic", "Dielectric constant (ionic)"], ["n", "Refractive index"], ["e_ij_max", "Piezoelectric modulus", "C/m²"]]],
  ["Surfaces", [["weighted_surface_energy", "Weighted surface energy", "J/m²"], ["weighted_work_function", "Work function", "eV"], ["surface_anisotropy", "Surface anisotropy"], ["shape_factor", "Shape factor"]]],
];

type Oxidation = {
  method: string | null;
  average: Record<string, number>;
  species: string[];
  sites: { element: string; valence: number; sites: number }[];
};

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", ".": "·" };
/** 3 → "³⁺", -2 → "²⁻", 0 → "⁰", 2.67 → "²·⁶⁷⁺" */
export function charge(v: number): string {
  if (v === 0) return "⁰";
  const mag = String(+Math.abs(v).toFixed(2)).replace(/^1$/, "");
  return [...mag].map((c) => SUP[c] ?? c).join("") + (v > 0 ? "⁺" : "⁻");
}

function show(v: Value): string | null {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return Math.abs(v) >= 1000 || (Math.abs(v) < 0.001 && v !== 0) ? v.toExponential(3) : String(+v.toFixed(4));
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export function MaterialDetail({ id: idPromise }: { id: Promise<string> }) {
  const id = use(idPromise);
  const [mat, setMat] = useState<Material | null>(null);
  const [similar, setSimilar] = useState<Similar | null>(null);
  const [oxidation, setOxidation] = useState<Oxidation | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    apiGet<Material>(`/materials/${encodeURIComponent(id)}`)
      .then((m) => live && setMat(m))
      .catch((e) => live && setError(e.message));
    apiGet<Similar>(`/materials/${encodeURIComponent(id)}/similar`)
      .then((s) => live && setSimilar(s))
      .catch(() => {});
    apiGet<Oxidation>(`/materials/${encodeURIComponent(id)}/oxidation`)
      .then((o) => live && setOxidation(o))
      .catch(() => {}); // not every material has an oxidation-state analysis (e.g. metals)
    return () => {
      live = false;
    };
  }, [id]);

  return (
    <div className="space-y-6">
      <Link href="/materials" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Materials Explorer
      </Link>

      {error && <Notice>{error}</Notice>}
      {!mat && !error && <p className="text-muted">Loading {id}…</p>}

      {mat && (
        <>
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">{mat.formula_pretty}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-muted">
                <span className="font-mono">{mat.material_id}</span>
                {show(mat.crystal_system) && <span>· {show(mat.crystal_system)}</span>}
                {show(mat.spacegroup) && <span>· {show(mat.spacegroup)}</span>}
                {mat.is_stable === true && <Badge>Stable</Badge>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button
                variant="ghost"
                loading={pdfBusy}
                onClick={async () => {
                  setPdfBusy(true);
                  try {
                    await downloadMaterialReport({ material: mat, groups: GROUPS, format: (v) => show(v as Value), oxidation, similar: similar?.results ?? [] });
                  } catch (e) {
                    setError(`Could not create the PDF: ${(e as Error).message}`);
                  } finally {
                    setPdfBusy(false);
                  }
                }}
              >
                <FileDown className="size-4" aria-hidden /> PDF report
              </Button>
              <a
                href={`https://next-gen.materialsproject.org/materials/${mat.material_id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
              >
                View on Materials Project <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_1fr]">
            <Card className="h-fit">
              <CardTitle>Crystal structure</CardTitle>
              {mat.structure ? <CrystalViewer structure={mat.structure} /> : <p className="text-sm text-muted">No structure available.</p>}
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              {oxidation && oxidation.sites.length > 0 && (
                <Card className="p-4" >
                  <CardTitle>Oxidation states</CardTitle>
                  <ul className="flex flex-wrap gap-2" aria-label="Oxidation states by site">
                    {oxidation.sites.map((s) => (
                      <li key={`${s.element}${s.valence}`} className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-sm">
                        <span className="font-semibold">
                          {s.element}
                          {charge(s.valence)}
                        </span>
                        <span className="ml-1.5 text-xs text-muted">
                          ×{s.sites} site{s.sites === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {oxidation.sites.some((a) => oxidation.sites.some((b) => a.element === b.element && a.valence !== b.valence)) && (
                    <p className="mt-2 text-xs text-accent">Mixed valence: one element occurs in more than one oxidation state.</p>
                  )}
                  <p className="mt-2 text-xs text-muted">{oxidation.method ?? "Bond valence analysis"} (Materials Project)</p>
                </Card>
              )}
              {GROUPS.map(([title, fields]) => {
                const rows = fields.map(([f, label, unit]) => [label, show(mat[f]), unit] as const).filter(([, v]) => v !== null);
                if (!rows.length) return null;
                return (
                  <Card key={title} className="p-4">
                    <CardTitle>{title}</CardTitle>
                    <dl className="space-y-1.5 text-sm">
                      {rows.map(([label, v, unit]) => (
                        <div key={label} className="flex justify-between gap-3">
                          <dt className="text-muted">{label}</dt>
                          <dd className="text-right font-mono tabular-nums">
                            {v}
                            {unit && <span className="ml-1 font-sans text-xs text-muted">{unit}</span>}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </Card>
                );
              })}
            </div>
          </div>

          {mat.structure && <XrdPlot structure={mat.structure} formula={mat.formula_pretty} />}

          <ElectronicPlot id={mat.material_id} />

          {mat.is_metal === true && <FermiSection id={mat.material_id} />}

          {similar && similar.results.length > 0 && (
            <Card className="p-0">
              <div className="border-b border-line px-5 py-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Isostructural materials</h2>
                <p className="mt-1 text-sm text-muted">
                  Same formula type ({similar.formula_anonymous}) and space group
                  {similar.spacegroup_number ? ` (#${similar.spacegroup_number})` : ""} — {similar.total.toLocaleString()} found, most
                  stable first.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted">
                    <tr className="border-b border-line">
                      <th className="px-5 py-2 font-medium">Formula</th>
                      <th className="px-3 py-2 font-medium">Material</th>
                      <th className="px-3 py-2 font-medium">Band gap (eV)</th>
                      <th className="px-3 py-2 font-medium">Density</th>
                      <th className="px-3 py-2 font-medium">E above hull</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {similar.results.map((r) => (
                      <tr key={r.material_id} className="hover:bg-surface-2">
                        <td className="px-5 py-2 font-medium">
                          <Link href={`/materials/${r.material_id}`} className="hover:text-accent">
                            {r.formula_pretty}
                          </Link>
                        </td>
                        <td className="px-3 py-2 font-mono text-muted">{r.material_id}</td>
                        <td className="px-3 py-2 font-mono tabular-nums">{show(r.band_gap) ?? "—"}</td>
                        <td className="px-3 py-2 font-mono tabular-nums">{show(r.density) ?? "—"}</td>
                        <td className="px-3 py-2 font-mono tabular-nums">{show(r.energy_above_hull) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
