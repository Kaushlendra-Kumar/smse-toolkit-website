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
  const res = await fetch(`${S3}/${key}`, { signal: AbortSignal.timeout(20000) });
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
  bands: Record<string, number[][]>;
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
  const keep = (spin: number[][]) =>
    spin
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

export async function getElectronic(materialId: string) {
  "use cache";
  cacheLife("weeks"); // calculated data doesn't change between database releases

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
