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

export async function searchMaterials(q: URLSearchParams) {
  const key = process.env.MP_API_KEY;
  if (!key)
    throw new HttpError(
      503,
      "Materials Project API key is not configured. Set MP_API_KEY in the deployment's environment variables (free key: https://next-gen.materialsproject.org/api).",
    );
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

  let res: Response;
  try {
    res = await fetch(`https://api.materialsproject.org/materials/summary/?${params}`, {
      headers: { "x-api-key": key },
      cache: "no-store",
    });
  } catch (e) {
    throw new HttpError(502, `Could not reach Materials Project: ${(e as Error).message}`);
  }
  if (res.status === 401 || res.status === 403) throw new HttpError(502, "Materials Project rejected the API key. Check MP_API_KEY.");
  if (!res.ok) throw new HttpError(502, `Materials Project error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { data?: Doc[]; meta?: { total_doc?: number } };
  return { total: data.meta?.total_doc ?? data.data?.length ?? 0, results: (data.data ?? []).map(flatten) };
}
