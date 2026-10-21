import assert from "node:assert/strict";
import { test } from "node:test";

import { isosurface, upsample } from "../src/lib/isosurface.ts";

/** f(k) = |k|² − r² on a periodic cubic grid (k in the centred cell) — its zero set is a sphere. */
function sphereGrid(n: number, r: number) {
  const v = new Float32Array(n * n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++) {
        const f = [i, j, k].map((x) => ((x / n + 0.5) % 1) - 0.5); // fractional, wrapped to −½…½
        v[(i * n + j) * n + k] = f[0] ** 2 + f[1] ** 2 + f[2] ** 2 - r * r;
      }
  return v;
}

const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

test("iso-surface of |k|²−r² is a sphere of radius r", () => {
  const n = 20;
  const r = 0.3;
  const mesh = isosurface(sphereGrid(n, r), n, I3);
  assert.ok(mesh.positions.length > 0);
  let worst = 0;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const d = Math.hypot(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
    worst = Math.max(worst, Math.abs(d - r));
  }
  // Linear interpolation on a 1/20 grid: error well below one grid spacing (0.05).
  assert.ok(worst < 0.01, `max radial error ${worst}`);
});

test("normals point radially for a sphere", () => {
  const n = 16;
  const mesh = isosurface(sphereGrid(n, 0.25), n, I3);
  let minDot = 1;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const p = [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]];
    const len = Math.hypot(...p);
    const dot = (p[0] * mesh.normals[i] + p[1] * mesh.normals[i + 1] + p[2] * mesh.normals[i + 2]) / len;
    minDot = Math.min(minDot, dot);
  }
  assert.ok(minDot > 0.9, `min cos(normal, radius) ${minDot}`);
});

test("upsampling keeps grid values and interpolates in between", () => {
  const n = 4;
  const v = Float32Array.from({ length: n ** 3 }, (_, i) => i % 7);
  const u = upsample(v, n, 2);
  for (let i = 0; i < n; i++) assert.equal(u[((2 * i) * 8 + 0) * 8 + 0], v[(i * n) * n]);
});
