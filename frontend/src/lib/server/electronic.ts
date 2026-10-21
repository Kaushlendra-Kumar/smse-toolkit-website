import "server-only";

import { gunzipSync } from "node:zlib";

import { cacheLife } from "next/cache";

import { HttpError } from "./materials";

/**
 * Band structure + density of states from the Materials Project.
 * Task IDs come from the electronic_structure endpoint; the calculated objects live in the
 * public AWS open-data bucket `materialsproject-parsed` (same source mp-api uses), keyed by
 * the legacy numeric id. Only what the plots need is returned (~100 kB instead of ~13 MB).
 */

const S3 = "https://materialsproject-parsed.s3.amazonaws.com";
const WINDOW = 10; // eV around the Fermi level kept for plotting

type Vec = [number, number, number];

/** New-style ids ("aaaciqgh") are base-26 encodings of the legacy integer ids used for S3 keys. */
export function legacyTaskId(id: string): string {
  const bare = id.replace(/^mp-/, "");
  if (/^\d+$/.test(bare)) return `mp-${bare}`;
  if (!/^[a-z]+$/.test(bare)) throw new HttpError(502, `Unexpected task id format: ${id}`);
  let n = 0;
  for (const c of bare) n = n * 26 + (c.charCodeAt(0) - 97);
  return `mp-${n}`;
}

async function openData(key: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${S3}/${key}`, { signal: AbortSignal.timeout(Number(process.env.S3_TIMEOUT_MS ?? 25000)) });
  if (!res.ok) throw new HttpError(404, "Calculated data file not found in the Materials Project open data.");
  const json = JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8"));
  const doc = Array.isArray(json) ? json[0] : json;
  return (doc.data ?? doc) as Record<string, unknown>;
}

function round(v: number, d = 3) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

type BSData = {
  efermi: number;
  lattice_rec: { matrix: Vec[] };
  kpoints: Vec[]; // fractional reciprocal coordinates
  bands: Record<string, unknown>;
  branches: { start_index: number; end_index: number; name: string }[];
  is_metal: boolean;
  band_gap: { energy: number; direct: boolean; transition: string | null };
};

function slimBandStructure(d: BSData) {
  const m = d.lattice_rec.matrix;
  const cart = (f: Vec): Vec => [0, 1, 2].map((j) => f[0] * m[0][j] + f[1] * m[1][j] + f[2] * m[2][j]) as Vec;
  // Distance along the path; branch starts continue from the previous branch end (discontinuity jumps).
  const x = new Array<number>(d.kpoints.length).fill(0);
  const breaks: number[] = [];
  let pos = 0;
  d.branches.forEach((br, bi) => {
    if (bi > 0) breaks.push(round(pos, 4));
    for (let i = br.start_index; i <= br.end_index; i++) {
      if (i > br.start_index) {
        const a = cart(d.kpoints[i - 1]);
        const b = cart(d.kpoints[i]);
        pos += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      }
      x[i] = round(pos, 4);
    }
  });
  // High-symmetry labels from branch names, e.g. "\Gamma-M": start → Γ, end → M.
  const labels: { x: number; label: string }[] = [];
  const add = (xv: number, label: string) => {
    if (label && !labels.some((l) => Math.abs(l.x - xv) < 1e-6 && l.label === label)) labels.push({ x: xv, label });
  };
  for (const br of d.branches) {
    const [from, to] = br.name.split("-");
    add(x[br.start_index], from);
    add(x[br.end_index], to);
  }
  const keep = (spin: unknown) =>
    bandArray(spin)
      .map((band) => band.map((e) => e - d.efermi))
      .filter((band) => band.some((e) => Math.abs(e) <= WINDOW))
      .map((band) => band.map((e) => round(e)));
  return {
    x,
    labels,
    up: keep(d.bands["1"]),
    down: d.bands["-1"] ? keep(d.bands["-1"]) : null,
    is_metal: d.is_metal,
    band_gap: d.band_gap ? { energy: round(d.band_gap.energy), direct: d.band_gap.direct, transition: d.band_gap.transition } : null,
  };
}

type DOSData = {
  efermi: number;
  energies: number[];
  densities: Record<string, number[]>;
  atom_dos?: Record<string, { densities: Record<string, number[]> }>;
};

function slimDos(d: DOSData) {
  const idx = d.energies.map((e, i) => [e - d.efermi, i] as const).filter(([e]) => Math.abs(e) <= WINDOW);
  const pick = (arr: number[]) => idx.map(([, i]) => round(arr[i], 3));
  const elements: Record<string, { up: number[]; down: number[] | null }> = {};
  for (const [el, v] of Object.entries(d.atom_dos ?? {})) {
    elements[el] = { up: pick(v.densities["1"]), down: v.densities["-1"] ? pick(v.densities["-1"]) : null };
  }
  return {
    energies: idx.map(([e]) => round(e)),
    total: { up: pick(d.densities["1"]), down: d.densities["-1"] ? pick(d.densities["-1"]) : null },
    elements,
  };
}

/** Band arrays come either as plain nested lists or as serialised numpy arrays ({dtype, data}). */
function bandArray(v: unknown): number[][] {
  if (Array.isArray(v)) return v as number[][];
  if (v && typeof v === "object" && Array.isArray((v as { data?: unknown }).data)) return (v as { data: number[][] }).data;
  throw new HttpError(502, "Unexpected band-structure format.");
}

/**
 * Fermi surface data: bands crossing E_F on the full periodic k-grid.
 * MP's uniform calculation stores one of each ±k pair (time-reversal half grid);
 * the full n×n×n grid is rebuilt with E(−k) = E(k). Energies are sent in meV relative to E_F.
 */
async function fermiData(materialId: string) {

  const key = process.env.MP_API_KEY;
  if (!key) throw new HttpError(503, "Materials Project API key is not configured.");
  const res = await fetch(
    `https://api.materialsproject.org/materials/electronic_structure/?material_ids=${encodeURIComponent(materialId)}&_fields=dos,is_metal`,
    { headers: { "x-api-key": key } },
  );
  if (!res.ok) throw new HttpError(502, `Materials Project error ${res.status}`);
  const doc = ((await res.json()).data ?? [])[0] as { dos?: { task_id?: string; total?: Record<string, { task_id?: string }> }; is_metal?: boolean } | undefined;
  const task = doc?.dos?.task_id ?? doc?.dos?.total?.["1"]?.task_id;
  if (!task) throw new HttpError(404, "No uniform band-structure calculation for this material.");

  const d = (await openData(`bandstructures/${legacyTaskId(task)}.json.gz`)) as {
    efermi: number;
    kpoints: Vec[];
    bands: Record<string, unknown>;
    lattice_rec: { matrix: Vec[] };
    is_metal: boolean;
  };
  if (!d.is_metal) return { metal: false as const };

  // Grid size from the k-point spacing.
  let step = 1;
  for (const k of d.kpoints) for (const c of k) if (Math.abs(c) > 1e-6) step = Math.min(step, Math.abs(c));
  const n = Math.round(1 / step);
  if (n < 4 || n > 64) throw new HttpError(502, `Unsupported k-grid (${n}).`);
  const wrap = (c: number) => ((Math.round(c * n) % n) + n) % n;
  const index = (k: Vec) => (wrap(k[0]) * n + wrap(k[1])) * n + wrap(k[2]);
  const negIndex = (k: Vec) => (wrap(-k[0]) * n + wrap(-k[1])) * n + wrap(-k[2]);

  const spins = Object.keys(d.bands).filter((s) => s === "1" || s === "-1");
  const sheets: { spin: number; band: number; values: number[] }[] = [];
  for (const spin of spins) {
    const bands = bandArray(d.bands[spin]);
    bands.forEach((band, bi) => {
      const rel = band.map((e) => e - d.efermi);
      if (!(Math.min(...rel) < 0 && Math.max(...rel) > 0)) return; // only bands that cross E_F
      const grid = new Array<number>(n * n * n).fill(NaN);
      d.kpoints.forEach((k, i) => {
        grid[index(k)] = rel[i];
        grid[negIndex(k)] = rel[i];
      });
      const missing = grid.filter((v) => Number.isNaN(v)).length;
      if (missing > grid.length * 0.01) throw new HttpError(502, `The k-grid could not be completed by symmetry (${missing} points missing).`);
      // Fill any isolated gaps with the neighbour average (rare).
      for (let i = 0; i < grid.length; i++) if (Number.isNaN(grid[i])) grid[i] = grid[(i + 1) % grid.length] || 0;
      sheets.push({ spin: Number(spin), band: bi, values: grid.map((v) => Math.round(v * 1000)) }); // meV
    });
  }
  return { metal: true as const, n, reciprocal: d.lattice_rec.matrix, sheets };
}

async function electronicData(materialId: string) {

  const key = process.env.MP_API_KEY;
  if (!key) throw new HttpError(503, "Materials Project API key is not configured.");
  const res = await fetch(
    `https://api.materialsproject.org/materials/electronic_structure/?material_ids=${encodeURIComponent(materialId)}&_fields=bandstructure,dos`,
    { headers: { "x-api-key": key } },
  );
  if (!res.ok) throw new HttpError(502, `Materials Project error ${res.status}`);
  const doc = ((await res.json()).data ?? [])[0] as
    | { bandstructure?: Record<string, { task_id?: string } | null>; dos?: { task_id?: string; total?: Record<string, { task_id?: string }> } }
    | undefined;
  if (!doc) throw new HttpError(404, "No electronic structure calculation for this material.");

  const path = ["setyawan_curtarolo", "hinuma", "latimer_munro"].find((p) => doc.bandstructure?.[p]?.task_id);
  const bsTask = path ? doc.bandstructure![path]!.task_id! : null;
  const dosTask = doc.dos?.task_id ?? doc.dos?.total?.["1"]?.task_id ?? null;

  const [bs, dos] = await Promise.all([
    bsTask ? openData(`bandstructures/${legacyTaskId(bsTask)}.json.gz`).then((d) => slimBandStructure(d as BSData)).catch(() => null) : null,
    dosTask ? openData(`dos/${legacyTaskId(dosTask)}.json.gz`).then((d) => slimDos(d as DOSData)).catch(() => null) : null,
  ]);
  if (!bs && !dos) throw new HttpError(404, "Band structure and DOS data are not available for this material.");
  return { path: path ?? null, bandstructure: bs, dos };
}

type Outcome<T> = { ok: T } | { error: { status: number; message: string } };

/** Run `fn`; HttpErrors become plain data so they survive the `use cache` boundary (classes don't). */
async function capture<T>(fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: await fn() };
  } catch (e) {
    // Only permanent outcomes ("no data for this material") are returned — and therefore cached.
    // Transient failures (timeouts, upstream 5xx) throw, so they are never cached.
    if (e instanceof HttpError && e.status < 500) return { error: { status: e.status, message: e.message } };
    throw e;
  }
}

function unwrap<T>(o: Outcome<T>): T {
  if ("error" in o) throw new HttpError(o.error.status, o.error.message);
  return o.ok;
}

// Successful results are cached for a week; "not available" outcomes too (they don't change
// between database releases). Transient failures (network) throw and are not cached.
async function cachedElectronic(materialId: string) {
  "use cache";
  cacheLife("weeks");
  return capture(() => electronicData(materialId));
}

async function cachedFermi(materialId: string) {
  "use cache";
  cacheLife("weeks");
  return capture(() => fermiData(materialId));
}

async function resolve<T>(load: () => Promise<Outcome<T>>): Promise<T> {
  let outcome: Outcome<T>;
  try {
    outcome = await load();
  } catch {
    throw new HttpError(504, "The Materials Project data took too long to download — please try again in a moment.");
  }
  return unwrap(outcome);
}

export const getElectronic = (materialId: string) => resolve(() => cachedElectronic(materialId));
export const getFermi = (materialId: string) => resolve(() => cachedFermi(materialId));
