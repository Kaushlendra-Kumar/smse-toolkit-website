"use client";

import { ChevronLeft, ChevronRight, ExternalLink, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Button, Card, Input, Label, Notice, Segmented } from "@/components/ui";
import { apiGet } from "@/lib/api";

type Preset = { label: string; description: string; fields: string[]; filters: string[]; defaults?: Record<string, number> };
type PresetsResponse = { presets: Record<string, Preset>; range_fields: Record<string, string> };
type Row = Record<string, string | number | boolean | null> & { material_id: string; formula_pretty: string };
type SearchResponse = { total: number; results: Row[] };

const PAGE = 25;

// Columns shown per preset (flattened field names returned by the API).
const COLUMNS: Record<string, string[]> = {
  overview: ["density", "density_atomic", "band_gap", "energy_above_hull", "crystal_system"],
  semiconductors: ["band_gap", "is_gap_direct", "efermi", "energy_above_hull", "crystal_system"],
  elasticity: ["k_vrh", "k_voigt", "k_reuss", "g_vrh", "g_voigt", "g_reuss", "universal_anisotropy", "homogeneous_poisson"],
  magnetism: ["ordering", "total_magnetization", "total_magnetization_normalized_vol", "num_magnetic_sites", "types_of_magnetic_species"],
  dielectric: ["e_total", "e_ionic", "e_electronic", "n", "band_gap"],
  piezoelectric: ["e_ij_max", "band_gap", "crystal_system", "spacegroup"],
  surfaces: ["weighted_surface_energy", "weighted_work_function", "surface_anisotropy", "shape_factor", "has_reconstructed"],
};

const EXTRA_LABELS: Record<string, string> = {
  density_atomic: "Atomic density (Å³/atom)",
  crystal_system: "Crystal system",
  spacegroup: "Space group",
  is_gap_direct: "Direct gap",
  ordering: "Ordering",
  types_of_magnetic_species: "Magnetic species",
  has_reconstructed: "Reconstructed",
};

function fmt(v: Row[string]) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return Math.abs(v) >= 1000 || (Math.abs(v) < 0.001 && v !== 0) ? v.toExponential(2) : +v.toFixed(3);
  return v;
}

const defaultsFor = (p?: Preset) => Object.fromEntries(Object.entries(p?.defaults ?? {}).map(([k, v]) => [k, String(v)]));

export function MaterialsExplorer() {
  // Deep link from the periodic table: /materials?elements=Fe
  const linkedElements = useSearchParams().get("elements");
  const [meta, setMeta] = useState<PresetsResponse | null>(null);
  const [preset, setPreset] = useState(linkedElements ? "overview" : "semiconductors");
  const [elements, setElements] = useState(linkedElements ?? "");
  const [exclude, setExclude] = useState("");
  const [stableOnly, setStableOnly] = useState(true);
  const [ranges, setRanges] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiGet<PresetsResponse>("/materials/presets")
      .then((m) => {
        setMeta(m);
        setRanges(defaultsFor(m.presets[preset]));
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once; preset changes are handled by choosePreset
  }, []);

  const cfg = meta?.presets[preset];

  const choosePreset = (p: string) => {
    setPreset(p);
    setRanges(defaultsFor(meta?.presets[p]));
    setData(null);
    setPage(0);
  };

  const run = useCallback(
    async (p: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiGet<SearchResponse>("/materials/search", {
          preset,
          elements,
          exclude_elements: exclude,
          is_stable: stableOnly ? true : undefined,
          limit: PAGE,
          skip: p * PAGE,
          ...ranges,
        });
        setData(res);
        setPage(p);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [preset, elements, exclude, stableOnly, ranges],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(0);
  };

  if (!meta) return error ? <Notice>{error}</Notice> : <p className="text-muted">Loading…</p>;

  const columns = COLUMNS[preset] ?? [];
  const label = (f: string) => meta.range_fields[f] ?? EXTRA_LABELS[f] ?? f;
  const pages = data ? Math.ceil(data.total / PAGE) : 0;

  return (
    <div className="space-y-6">
      <Segmented
        label="Property set"
        value={preset}
        onChange={choosePreset}
        options={Object.entries(meta.presets).map(([value, p]) => ({ value, label: p.label }))}
      />

      <Card>
        <p className="mb-5 text-sm text-muted">{cfg?.description}</p>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="elements" hint="must contain all">
                Elements
              </Label>
              <Input id="elements" placeholder="e.g. Ga N" value={elements} onChange={(e) => setElements(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="exclude">Exclude elements</Label>
              <Input id="exclude" placeholder="e.g. Pb Cd" value={exclude} onChange={(e) => setExclude(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={stableOnly} onChange={(e) => setStableOnly(e.target.checked)} className="size-4 accent-accent" />
              Thermodynamically stable only
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cfg?.filters.map((f) => (
              <fieldset key={f}>
                <legend className="mb-1.5 text-sm font-medium">{label(f)}</legend>
                <div className="flex gap-2">
                  {(["min", "max"] as const).map((b) => (
                    <Input
                      key={b}
                      aria-label={`${label(f)} ${b}`}
                      placeholder={b}
                      inputMode="decimal"
                      value={ranges[`${f}_${b}`] ?? ""}
                      onChange={(e) => setRanges((r) => ({ ...r, [`${f}_${b}`]: e.target.value }))}
                      className="font-mono"
                    />
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <Button type="submit" loading={loading}>
            <Search className="size-4" aria-hidden /> Search
          </Button>
        </form>
      </Card>

      {error && <Notice>{error}</Notice>}

      {data && (
        <Card className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-sm">
            <span className="text-muted">
              {data.total.toLocaleString()} material{data.total === 1 ? "" : "s"}
              {data.total > 0 && ` · page ${page + 1} of ${pages}`}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" className="px-2" aria-label="Previous page" disabled={page === 0 || loading} onClick={() => run(page - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="ghost" className="px-2" aria-label="Next page" disabled={page + 1 >= pages || loading} onClick={() => run(page + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-2.5 font-medium">Material</th>
                  <th className="px-3 py-2.5 font-medium">Formula</th>
                  {columns.map((c) => (
                    <th key={c} className="px-3 py-2.5 font-medium whitespace-nowrap">
                      {label(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.results.map((r) => (
                  <tr key={r.material_id} className="hover:bg-surface-2">
                    <td className="px-5 py-2">
                      <a
                        href={`https://next-gen.materialsproject.org/materials/${r.material_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-accent hover:underline"
                      >
                        {r.material_id}
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    </td>
                    <td className="px-3 py-2 font-medium">{r.formula_pretty}</td>
                    {columns.map((c) => (
                      <td key={c} className="px-3 py-2 font-mono tabular-nums">
                        {fmt(r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.total === 0 && <p className="px-5 py-6 text-sm text-muted">No materials match these filters.</p>}
        </Card>
      )}
    </div>
  );
}
