/**
 * Tie-lines of a ternary phase diagram: edges of the lower convex hull of
 * (u, v, E) points, where (u, v) is the composition position in the triangle and E the
 * formation energy per atom. Brute force O(n⁴) over triangles — fine for the few dozen
 * stable phases a ternary system has.
 */
export type HullPoint = { u: number; v: number; e: number };

export function lowerHullEdges(points: HullPoint[], tol = 1e-6): [number, number][] {
  const n = points.length;
  const edges = new Set<string>();
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const [p, q, r] = [points[i], points[j], points[k]];
        // Triangle must be non-degenerate in composition space.
        const area = (q.u - p.u) * (r.v - p.v) - (r.u - p.u) * (q.v - p.v);
        if (Math.abs(area) < 1e-9) continue;
        // Plane E = a·u + b·v + c through the three points.
        const a = ((q.e - p.e) * (r.v - p.v) - (r.e - p.e) * (q.v - p.v)) / area;
        const b = ((r.e - p.e) * (q.u - p.u) - (q.e - p.e) * (r.u - p.u)) / area;
        const c = p.e - a * p.u - b * p.v;
        // Lower facet: no point lies below the plane.
        let ok = true;
        for (let m = 0; m < n && ok; m++) if (points[m].e < a * points[m].u + b * points[m].v + c - tol) ok = false;
        if (!ok) continue;
        // Skip facets that contain another point strictly inside (coplanar sub-division happens via smaller triangles).
        let inside = false;
        for (let m = 0; m < n && !inside; m++) {
          if (m === i || m === j || m === k) continue;
          const s = points[m];
          if (Math.abs(s.e - (a * s.u + b * s.v + c)) > tol) continue;
          const w1 = ((q.u - s.u) * (r.v - s.v) - (r.u - s.u) * (q.v - s.v)) / area;
          const w2 = ((r.u - s.u) * (p.v - s.v) - (p.u - s.u) * (r.v - s.v)) / area;
          const w3 = 1 - w1 - w2;
          if (w1 > -1e-9 && w2 > -1e-9 && w3 > -1e-9) inside = true;
        }
        if (inside) continue;
        for (const [x, y] of [[i, j], [j, k], [i, k]]) edges.add(`${x},${y}`);
      }
  return [...edges].map((s) => s.split(",").map(Number) as [number, number]);
}

/** Composition fractions (a, b, c) → position in an equilateral triangle with A(0,0), B(1,0), C(½, √3/2). */
export const ternaryXY = ([, b, c]: number[]) => ({ u: b + c / 2, v: (c * Math.sqrt(3)) / 2 });
