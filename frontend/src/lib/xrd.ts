/**
 * Powder X-ray diffraction pattern from a crystal structure — a TypeScript port of
 * pymatgen's XRDCalculator.get_pattern (MIT licence; scattering coefficients from
 * pymatgen/analysis/diffraction/atomic_scattering_params.json). Kinematic theory,
 * no thermal (Debye–Waller) or anomalous-dispersion terms, as in pymatgen's default.
 * Verified against pymatgen in tests/xrd.test.ts.
 */
import ELEMENTS from "./elements.json" with { type: "json" };
import SCATTERING from "./xrd-scattering.json" with { type: "json" };

export const WAVELENGTHS = {
  CuKa: 1.54184,
  MoKa: 0.71073,
  CrKa: 2.291,
  FeKa: 1.93735,
  CoKa: 1.79026,
  AgKa: 0.560885,
} as const;
export type Radiation = keyof typeof WAVELENGTHS;

export type XrdStructure = {
  lattice: { matrix: number[][] };
  sites: { species: { element: string; occu: number }[]; abc: number[] }[];
};

export type XrdPeak = { twoTheta: number; intensity: number; d: number; hkl: number[]; multiplicity: number };

const TWO_THETA_TOL = 1e-5;
const SCALED_INTENSITY_TOL = 1e-3;
const Z: Record<string, number> = Object.fromEntries(ELEMENTS.map((e) => [e.s, e.n]));
const COEFF: Record<string, number[][]> = SCATTERING;

function inverse3(m: number[][]): number[][] {
  const [a, b, c] = m;
  const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  const inv = [
    [b[1] * c[2] - b[2] * c[1], a[2] * c[1] - a[1] * c[2], a[1] * b[2] - a[2] * b[1]],
    [b[2] * c[0] - b[0] * c[2], a[0] * c[2] - a[2] * c[0], a[2] * b[0] - a[0] * b[2]],
    [b[0] * c[1] - b[1] * c[0], a[1] * c[0] - a[0] * c[1], a[0] * b[1] - a[1] * b[0]],
  ];
  return inv.map((r) => r.map((v) => v / det));
}

/** True for a hexagonal lattice (a = b, γ = 120°, α = β = 90°), like pymatgen's Lattice.is_hexagonal. */
function isHexagonal(m: number[][]): boolean {
  const len = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
  const ang = (u: number[], v: number[]) => (Math.acos((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (len(u) * len(v))) * 180) / Math.PI;
  const [a, b, c] = m;
  const close = (x: number, y: number, tol: number) => Math.abs(x - y) < tol;
  return (
    close(len(a), len(b), 1e-2) &&
    close(ang(b, c), 90, 5) &&
    close(ang(a, c), 90, 5) &&
    (close(ang(a, b), 120, 5) || close(ang(a, b), 60, 5))
  );
}

/** Representative Miller index of a family: non-negative, largest first when possible. */
function familyLabel(hkls: number[][]): number[] {
  return [...hkls].sort((p, q) => {
    const neg = (v: number[]) => v.filter((x) => x < 0).length;
    if (neg(p) !== neg(q)) return neg(p) - neg(q);
    for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return q[i] - p[i];
    return 0;
  })[0];
}

export function computeXrd(structure: XrdStructure, wavelength: number, range: [number, number] = [0, 90]): XrdPeak[] {
  const A = structure.lattice.matrix;
  // Crystallographic reciprocal lattice (no 2π): rows of (A⁻¹)ᵀ.
  const inv = inverse3(A);
  const B = [0, 1, 2].map((i) => [inv[0][i], inv[1][i], inv[2][i]]);
  const toRad = Math.PI / 180;
  const minR = (2 * Math.sin((range[0] / 2) * toRad)) / wavelength;
  const maxR = (2 * Math.sin((range[1] / 2) * toRad)) / wavelength;
  const lens = A.map((v) => Math.hypot(v[0], v[1], v[2]));
  const hmax = lens.map((l) => Math.ceil(maxR * l));

  // Sites grouped by element (form factor depends only on element).
  const groups = new Map<string, { coeff: number[][]; z: number; f: number[][]; occ: number[] }>();
  for (const site of structure.sites) {
    for (const sp of site.species) {
      const coeff = COEFF[sp.element];
      if (!coeff) throw new Error(`No X-ray scattering coefficients for ${sp.element}.`);
      const g = groups.get(sp.element) ?? { coeff, z: Z[sp.element], f: [], occ: [] };
      g.f.push(site.abc);
      g.occ.push(sp.occu);
      groups.set(sp.element, g);
    }
  }

  const hex = isHexagonal(A);
  const reflections: { intensity: number; twoTheta: number; d: number; hkl: number[] }[] = [];
  for (let h = -hmax[0]; h <= hmax[0]; h++)
    for (let k = -hmax[1]; k <= hmax[1]; k++)
      for (let l = -hmax[2]; l <= hmax[2]; l++) {
        // Friedel half-space: (h,k,l) lexicographically positive; (-h,-k,-l) is added as ×2.
        if (!(h > 0 || (h === 0 && k > 0) || (h === 0 && k === 0 && l > 0))) continue;
        const gx = h * B[0][0] + k * B[1][0] + l * B[2][0];
        const gy = h * B[0][1] + k * B[1][1] + l * B[2][1];
        const gz = h * B[0][2] + k * B[1][2] + l * B[2][2];
        const g = Math.hypot(gx, gy, gz);
        if (g > maxR || g < minR || g === 0) continue;
        const theta = Math.asin(Math.min(1, (wavelength * g) / 2));
        const s2 = (g / 2) ** 2;
        let re = 0;
        let im = 0;
        for (const grp of groups.values()) {
          let sum = 0;
          for (const [a, b] of grp.coeff) sum += a * Math.exp(-b * s2);
          const fs = grp.z - 41.78214 * s2 * sum;
          for (let j = 0; j < grp.f.length; j++) {
            const phase = 2 * Math.PI * (h * grp.f[j][0] + k * grp.f[j][1] + l * grp.f[j][2]);
            re += fs * grp.occ[j] * Math.cos(phase);
            im += fs * grp.occ[j] * Math.sin(phase);
          }
        }
        const lorentz = (1 + Math.cos(2 * theta) ** 2) / (Math.sin(theta) ** 2 * Math.cos(theta));
        reflections.push({
          intensity: 2 * (re * re + im * im) * lorentz,
          twoTheta: (2 * theta) / toRad,
          d: 1 / g,
          hkl: hex ? [h, k, -h - k, l] : [h, k, l],
        });
      }

  // Merge reflections closer than TWO_THETA_TOL. Clustering (rather than snapping to a fixed
  // grid) keeps symmetry-equivalent reflections together even when floating-point noise puts
  // them on either side of a grid edge.
  reflections.sort((a, b) => a.twoTheta - b.twoTheta);
  const peaks: { intensity: number; twoTheta: number; d: number; hkls: number[][] }[] = [];
  for (const r of reflections) {
    const last = peaks[peaks.length - 1];
    const neg = r.hkl.map((v) => -v);
    if (last && r.twoTheta - last.twoTheta <= TWO_THETA_TOL) {
      last.intensity += r.intensity;
      last.hkls.push(r.hkl, neg);
    } else peaks.push({ intensity: r.intensity, twoTheta: r.twoTheta, d: r.d, hkls: [r.hkl, neg] });
  }

  if (!peaks.length) return [];
  const max = Math.max(...peaks.map((p) => p.intensity));
  return peaks
    .filter((p) => (p.intensity / max) * 100 > SCALED_INTENSITY_TOL)
    .map((p) => ({
      twoTheta: p.twoTheta,
      intensity: (p.intensity / max) * 100,
      d: p.d,
      hkl: familyLabel(p.hkls),
      multiplicity: p.hkls.length,
    }));
}
