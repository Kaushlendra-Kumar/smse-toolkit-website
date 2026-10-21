/**
 * Iso-surface extraction (marching tetrahedra) on a periodic 3D grid — used for Fermi surfaces.
 * Grid values v[(i*n + j)*n + k] sample fractional coordinates (i/n, j/n, k/n) of a periodic cell.
 * The surface is produced in the cell centred at the origin (fractional −½…½), upsampled by
 * periodic trilinear interpolation for smoothness, with gradient-based normals.
 */

export type Mesh = { positions: Float32Array; normals: Float32Array };

const CORNERS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];
// Six tetrahedra sharing the cube diagonal 0–6 (consistent across neighbouring cubes).
const TETS = [
  [0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6],
];

/** Periodic trilinear upsampling of an n³ grid by factor u → (n·u)³. */
export function upsample(v: ArrayLike<number>, n: number, u: number): Float32Array {
  const m = n * u;
  const out = new Float32Array(m * m * m);
  const at = (i: number, j: number, k: number) => v[(((i % n) * n + (j % n)) * n) + (k % n)];
  for (let a = 0; a < m; a++) {
    const x = a / u;
    const i0 = Math.floor(x);
    const fx = x - i0;
    for (let b = 0; b < m; b++) {
      const y = b / u;
      const j0 = Math.floor(y);
      const fy = y - j0;
      for (let c = 0; c < m; c++) {
        const z = c / u;
        const k0 = Math.floor(z);
        const fz = z - k0;
        let s = 0;
        for (let di = 0; di < 2; di++)
          for (let dj = 0; dj < 2; dj++)
            for (let dk = 0; dk < 2; dk++) {
              const w = (di ? fx : 1 - fx) * (dj ? fy : 1 - fy) * (dk ? fz : 1 - fz);
              if (w) s += w * at(i0 + di, j0 + dj, k0 + dk);
            }
        out[(a * m + b) * m + c] = s;
      }
    }
  }
  return out;
}

/**
 * Marching tetrahedra for the iso-level `iso` on a periodic m³ grid.
 * `basis` (3 row vectors) maps fractional coordinates to Cartesian positions.
 */
export function isosurface(v: ArrayLike<number>, m: number, basis: number[][], iso = 0): Mesh {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx = (i: number, j: number, k: number) => ((((i % m) + m) % m) * m + (((j % m) + m) % m)) * m + (((k % m) + m) % m);
  const val = (i: number, j: number, k: number) => v[idx(i, j, k)];
  // Gradient in fractional grid units (central differences, periodic).
  const grad = (i: number, j: number, k: number) => [
    val(i + 1, j, k) - val(i - 1, j, k),
    val(i, j + 1, k) - val(i, j - 1, k),
    val(i, j, k + 1) - val(i, j, k - 1),
  ];
  const half = m / 2;
  const toCart = (g: number[]) => {
    const f = [g[0] / m - 0.5, g[1] / m - 0.5, g[2] / m - 0.5];
    return [0, 1, 2].map((c) => f[0] * basis[0][c] + f[1] * basis[1][c] + f[2] * basis[2][c]);
  };
  // Normals: gradient transformed with the inverse-transpose of the basis is overkill here;
  // using basis directions is adequate for shading.
  const gradCart = (g: number[]) => [0, 1, 2].map((c) => g[0] * basis[0][c] + g[1] * basis[1][c] + g[2] * basis[2][c]);

  for (let a = 0; a < m; a++)
    for (let b = 0; b < m; b++)
      for (let c = 0; c < m; c++) {
        // Grid point (a,b,c) of the centred cell corresponds to stored index shifted by m/2.
        const cube = CORNERS.map(([x, y, z]) => [a + x, b + y, c + z]);
        const vals = cube.map(([x, y, z]) => val(x + half, y + half, z + half) - iso);
        if (vals.every((s) => s < 0) || vals.every((s) => s >= 0)) continue;
        for (const tet of TETS) {
          const p = tet.map((t) => cube[t]);
          const s = tet.map((t) => vals[t]);
          const inside = [0, 1, 2, 3].filter((t) => s[t] < 0);
          const outside = [0, 1, 2, 3].filter((t) => s[t] >= 0);
          if (!inside.length || !outside.length) continue;
          const cut = (i: number, o: number) => {
            const t = s[i] / (s[i] - s[o]);
            const g = [0, 1, 2].map((d) => p[i][d] + t * (p[o][d] - p[i][d]));
            const gi = grad(p[i][0] + half, p[i][1] + half, p[i][2] + half);
            const go = grad(p[o][0] + half, p[o][1] + half, p[o][2] + half);
            const gr = gradCart([0, 1, 2].map((d) => gi[d] + t * (go[d] - gi[d])));
            const len = Math.hypot(gr[0], gr[1], gr[2]) || 1;
            return { pos: toCart(g), nor: gr.map((x) => x / len) };
          };
          const tris: { pos: number[]; nor: number[] }[][] = [];
          if (inside.length === 1 || outside.length === 1) {
            const [lone, others] = inside.length === 1 ? [inside[0], outside] : [outside[0], inside];
            tris.push(others.map((o) => cut(lone, o)));
          } else {
            const [i0, i1] = inside;
            const [o0, o1] = outside;
            const q = [cut(i0, o0), cut(i0, o1), cut(i1, o1), cut(i1, o0)];
            tris.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]);
          }
          for (const tri of tris)
            for (const vert of tri) {
              pos.push(...vert.pos);
              nor.push(...vert.nor);
            }
        }
      }
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nor) };
}
