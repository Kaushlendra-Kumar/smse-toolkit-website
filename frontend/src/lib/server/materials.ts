import "server-only";

/**
 * Materials Project lookup (server side, so MP_API_KEY never reaches the browser).
 * Port of backend/app/routers/materials.py; each preset is one of the 2023 lookup tools.
 */

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const RANGE_FIELDS: Record<string, string> = {
  band_gap: "Band gap (eV)",
  density: "Density (g/cm³)",
  energy_above_hull: "Energy above hull (eV/atom)",
  formation_energy_per_atom: "Formation energy (eV/atom)",
  volume: "Volume (Å³)",
  nsites: "Number of sites",
  nelements: "Number of elements",
  efermi: "Fermi energy (eV)",
  k_vrh: "Bulk modulus, VRH (GPa)",
  k_voigt: "Bulk modulus, Voigt (GPa)",
  k_reuss: "Bulk modulus, Reuss (GPa)",
  g_vrh: "Shear modulus, VRH (GPa)",
  g_voigt: "Shear modulus, Voigt (GPa)",
  g_reuss: "Shear modulus, Reuss (GPa)",
  universal_anisotropy: "Elastic anisotropy",
  homogeneous_poisson: "Poisson's ratio",
  total_magnetization: "Total magnetization (μB)",
  total_magnetization_normalized_vol: "Magnetization / volume (μB/Å³)",
  total_magnetization_normalized_formula_units: "Magnetization / f.u. (μB/f.u.)",
  num_magnetic_sites: "Magnetic sites",
  num_unique_magnetic_sites: "Unique magnetic sites",
  e_total: "Total dielectric constant",
  e_ionic: "Ionic dielectric constant",
  e_electronic: "Electronic dielectric constant",
  n: "Refractive index",
  e_ij_max: "Piezoelectric modulus (C/m²)",
  weighted_surface_energy: "Weighted surface energy (J/m²)",
  weighted_work_function: "Weighted work function (eV)",
  surface_anisotropy: "Surface energy anisotropy",
  shape_factor: "Shape factor",
};

export const ORDERINGS = ["FM", "AFM", "FiM", "NM"] as const;

const BASE_FIELDS = [
  "material_id", "formula_pretty", "chemsys", "nsites", "density", "density_atomic",
  "volume", "symmetry", "energy_above_hull", "formation_energy_per_atom", "is_stable", "theoretical",
];

type Preset = {
  label: string;
  description: string;
  fields: string[];
  filters: string[];
  defaults?: Record<string, number>;
  has_props: string | null;
};

export const PRESETS: Record<string, Preset> = {
  overview: {
    label: "Overview",
    description: "Density, atomic density and stability of materials containing the given elements.",
    fields: ["band_gap", "is_metal"],
    filters: ["density", "energy_above_hull", "nelements"],
    has_props: null,
  },
  semiconductors: {
    label: "Semiconductors",
    description: "Materials within a band-gap window containing the given elements.",
    fields: ["band_gap", "is_gap_direct", "is_metal", "efermi"],
    filters: ["band_gap", "energy_above_hull"],
    defaults: { band_gap_min: 0.5, band_gap_max: 3.5 },
    has_props: null,
  },
  elasticity: {
    label: "Elasticity",
    description: "Bulk and shear moduli (Voigt, Reuss, VRH), elastic anisotropy and Poisson's ratio.",
    fields: ["bulk_modulus", "shear_modulus", "universal_anisotropy", "homogeneous_poisson"],
    filters: ["k_vrh", "g_vrh", "universal_anisotropy", "homogeneous_poisson"],
    has_props: "elasticity",
  },
  magnetism: {
    label: "Magnetic properties",
    description: "Magnetic ordering, total magnetization and number of magnetic sites.",
    fields: [
      "ordering", "is_magnetic", "total_magnetization", "total_magnetization_normalized_vol",
      "total_magnetization_normalized_formula_units", "num_magnetic_sites", "num_unique_magnetic_sites",
      "types_of_magnetic_species",
    ],
    filters: ["total_magnetization", "num_magnetic_sites", "num_unique_magnetic_sites"],
    has_props: "magnetism",
  },
  dielectric: {
    label: "Dielectric properties",
    description: "Total, ionic and electronic dielectric constants and refractive index.",
    fields: ["e_total", "e_ionic", "e_electronic", "n", "band_gap"],
    filters: ["e_total", "e_ionic", "e_electronic", "n"],
    has_props: "dielectric",
  },
  piezoelectric: {
    label: "Piezoelectric properties",
    description: "Maximum piezoelectric modulus of non-centrosymmetric materials.",
    fields: ["e_ij_max", "band_gap"],
    filters: ["e_ij_max"],
    has_props: "piezoelectric",
  },
  surfaces: {
    label: "Surface properties",
    description: "Weighted surface energy, work function, anisotropy, shape factor, reconstruction.",
    fields: ["weighted_surface_energy", "weighted_work_function", "surface_anisotropy", "shape_factor", "has_reconstructed"],
    filters: ["weighted_surface_energy", "weighted_work_function", "surface_anisotropy", "shape_factor"],
    has_props: "surface_properties",
  },
};

export function presetsResponse() {
  return {
    presets: Object.fromEntries(
      Object.entries(PRESETS).map(([k, p]) => [k, { label: p.label, description: p.description, fields: p.fields, filters: p.filters, defaults: p.defaults }]),
    ),
    range_fields: RANGE_FIELDS,
    orderings: ORDERINGS,
  };
}

const ELEMENT = /^[A-Z][a-z]?$/;

export function splitElements(raw: string | null): string[] {
  if (!raw) return [];
  const items = raw
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((e) => e[0].toUpperCase() + e.slice(1).toLowerCase());
  const bad = items.filter((e) => !ELEMENT.test(e));
  if (bad.length) throw new HttpError(422, `Not valid element symbols: ${bad.join(", ")}`);
  return items;
}

type Doc = Record<string, unknown>;

/** Flatten nested MP structures into table-friendly scalars. */
export function flatten(doc: Doc): Doc {
  const out: Doc = { ...doc };
  const sym = (out.symmetry ?? {}) as Doc;
  delete out.symmetry;
  out.crystal_system = sym.crystal_system ?? null;
  out.spacegroup = sym.symbol ?? null;
  for (const [key, prefix] of [["bulk_modulus", "k"], ["shear_modulus", "g"]] as const) {
    const moduli = (out[key] ?? {}) as Doc;
    delete out[key];
    for (const avg of ["voigt", "reuss", "vrh"]) out[`${prefix}_${avg}`] = moduli[avg] ?? null;
  }
  if (Array.isArray(out.types_of_magnetic_species)) out.types_of_magnetic_species = out.types_of_magnetic_species.join(" ");
  return out;
}

function apiKey(): string {
  const key = process.env.MP_API_KEY;
  if (!key)
    throw new HttpError(
      503,
      "Materials Project API key is not configured. Set MP_API_KEY in the deployment's environment variables (free key: https://next-gen.materialsproject.org/api).",
    );
  return key;
}

async function mpSummary(params: URLSearchParams): Promise<{ data: Doc[]; total: number }> {
  let res: Response;
  try {
    res = await fetch(`https://api.materialsproject.org/materials/summary/?${params}`, {
      headers: { "x-api-key": apiKey() },
      cache: "no-store",
    });
  } catch (e) {
    throw new HttpError(502, `Could not reach Materials Project: ${(e as Error).message}`);
  }
  if (res.status === 401 || res.status === 403) throw new HttpError(502, "Materials Project rejected the API key. Check MP_API_KEY.");
  if (!res.ok) throw new HttpError(502, `Materials Project error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { data?: Doc[]; meta?: { total_doc?: number } };
  return { data: json.data ?? [], total: json.meta?.total_doc ?? json.data?.length ?? 0 };
}

const MATERIAL_ID = /^(mp|mvc)-[a-z0-9]+$/i;

/** Large or UI-irrelevant blobs dropped from the detail response. */
const DETAIL_DROP = ["dos", "bandstructure", "xas", "grain_boundaries", "builder_meta", "origins", "task_ids", "property_name", "warnings"];

export async function getMaterial(id: string) {
  if (!MATERIAL_ID.test(id)) throw new HttpError(422, "Material ids look like 'mp-149'.");
  const { data } = await mpSummary(new URLSearchParams({ material_ids: id, _all_fields: "true", _limit: "1" }));
  if (!data.length) throw new HttpError(404, `${id} was not found in the Materials Project.`);
  const doc = { ...data[0] };
  for (const k of DETAIL_DROP) delete doc[k];
  const structure = doc.structure;
  delete doc.structure;
  return { ...flatten(doc), structure };
}

/** Isostructural analogues: same anonymous formula (e.g. AB2) and same space group. */
export async function similarMaterials(id: string) {
  if (!MATERIAL_ID.test(id)) throw new HttpError(422, "Material ids look like 'mp-149'.");
  const { data } = await mpSummary(
    new URLSearchParams({ material_ids: id, _fields: "formula_anonymous,symmetry", _limit: "1" }),
  );
  if (!data.length) throw new HttpError(404, `${id} was not found.`);
  const anon = data[0].formula_anonymous as string;
  const sg = (data[0].symmetry as Doc | undefined)?.number as number | undefined;
  const params = new URLSearchParams({
    formula: anon,
    _fields: "material_id,formula_pretty,band_gap,density,energy_above_hull,is_stable",
    _sort_fields: "energy_above_hull",
    _limit: "13",
  });
  if (sg) params.set("spacegroup_number", String(sg));
  const res = await mpSummary(params);
  return {
    formula_anonymous: anon,
    spacegroup_number: sg ?? null,
    total: Math.max(0, res.total - 1),
    results: res.data.filter((d) => d.material_id !== id).slice(0, 12),
  };
}

/** All non-empty sub-systems of a set of elements, as MP chemsys strings ("Fe", "Fe-O", ...). */
function subsystems(els: string[]): string[] {
  const out: string[] = [];
  for (let mask = 1; mask < 1 << els.length; mask++) {
    out.push(els.filter((_, i) => mask & (1 << i)).sort().join("-"));
  }
  return out;
}

/**
 * Entries of a binary (A–B) or ternary (A–B–C) system for a formation-energy convex hull.
 * `frac` is the atomic fraction of each requested element, in the requested order.
 */
export async function phaseEntries(raw: string | null) {
  const els = [...new Set(splitElements(raw))];
  if (els.length < 2 || els.length > 3) throw new HttpError(422, "Choose two or three different elements, e.g. Fe O or Li Fe O.");
  const { data, total } = await mpSummary(
    new URLSearchParams({
      chemsys: subsystems(els).join(","),
      _fields: "material_id,formula_pretty,composition_reduced,formation_energy_per_atom,energy_above_hull,is_stable,symmetry",
      _limit: "1000",
    }),
  );
  const entries = data.flatMap((d) => {
    const comp = (d.composition_reduced ?? {}) as Record<string, number>;
    const counts = els.map((e) => comp[e] ?? 0);
    const sum = counts.reduce((p, q) => p + q, 0);
    if (sum === 0 || typeof d.formation_energy_per_atom !== "number") return [];
    const frac = counts.map((c) => c / sum);
    return [{
      material_id: d.material_id as string,
      formula: d.formula_pretty as string,
      frac,
      x: frac[1], // binary: atomic fraction of element B
      formation_energy: d.formation_energy_per_atom as number,
      e_above_hull: (d.energy_above_hull as number | null) ?? null,
      is_stable: Boolean(d.is_stable),
      spacegroup: ((d.symmetry as Doc | undefined)?.symbol as string | undefined) ?? null,
    }];
  });
  return { elements: els, total, entries };
}

export async function searchMaterials(q: URLSearchParams) {
  apiKey();
  const preset = q.get("preset") ?? "overview";
  const cfg = PRESETS[preset];
  if (!cfg) throw new HttpError(422, `Unknown preset '${preset}'. Choose one of: ${Object.keys(PRESETS).join(", ")}`);

  const limit = Math.min(200, Math.max(1, Number(q.get("limit") ?? 50) || 50));
  const skip = Math.max(0, Number(q.get("skip") ?? 0) || 0);
  const params = new URLSearchParams({
    _fields: [...BASE_FIELDS, ...cfg.fields].join(","),
    _limit: String(limit),
    _skip: String(skip),
  });
  if (cfg.has_props) params.set("has_props", cfg.has_props);
  const els = splitElements(q.get("elements"));
  if (els.length) params.set("elements", els.join(","));
  const ex = splitElements(q.get("exclude_elements"));
  if (ex.length) params.set("exclude_elements", ex.join(","));
  const formula = q.get("formula")?.trim();
  if (formula) params.set("formula", formula);
  for (const b of ["is_stable", "is_metal"]) {
    const v = q.get(b);
    if (v === "true" || v === "false") params.set(b, v);
  }
  const ordering = q.get("ordering");
  if (ordering) {
    if (!(ORDERINGS as readonly string[]).includes(ordering)) throw new HttpError(422, `ordering must be one of ${ORDERINGS.join(", ")}`);
    params.set("ordering", ordering);
  }
  for (const [k, v] of q) {
    const m = /^(.+)_(min|max)$/.exec(k);
    if (m && m[1] in RANGE_FIELDS && v !== "") {
      if (!Number.isFinite(Number(v))) throw new HttpError(422, `${k} must be a number`);
      params.set(k, String(Number(v)));
    }
  }
  const sort = q.get("sort");
  if (sort) {
    const allowed = new Set([...BASE_FIELDS, ...cfg.fields, ...Object.keys(RANGE_FIELDS)]);
    if (!allowed.has(sort.replace(/^-/, ""))) throw new HttpError(422, `Cannot sort by '${sort}'`);
    params.set("_sort_fields", sort);
  }

  const { data, total } = await mpSummary(params);
  return { total, results: data.map(flatten) };
}
