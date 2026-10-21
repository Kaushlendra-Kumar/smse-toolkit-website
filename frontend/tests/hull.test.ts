import assert from "node:assert/strict";
import { test } from "node:test";

import { lowerHullEdges, ternaryXY } from "../src/lib/hull.ts";

const P = (frac: number[], e: number) => ({ ...ternaryXY(frac), e });
const key = (edges: [number, number][]) => edges.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`).sort();

test("one stable ternary compound connects to all three elements", () => {
  const pts = [P([1, 0, 0], 0), P([0, 1, 0], 0), P([0, 0, 1], 0), P([1 / 3, 1 / 3, 1 / 3], -1)];
  assert.deepEqual(key(lowerHullEdges(pts)), ["0-1", "0-2", "0-3", "1-2", "1-3", "2-3"]);
});

test("binary compound on an edge splits the triangle", () => {
  // AB compound at the A–B midpoint; C connects to it (two facets: A-AB-C and AB-B-C).
  const pts = [P([1, 0, 0], 0), P([0, 1, 0], 0), P([0, 0, 1], 0), P([0.5, 0.5, 0], -0.5)];
  assert.deepEqual(key(lowerHullEdges(pts)), ["0-2", "0-3", "1-2", "1-3", "2-3"]);
});

test("competing compounds: the lower one wins the tie-line", () => {
  // AB (deep) and C-rich compound; AB–C line vs A–B–C diagonal.
  const pts = [P([1, 0, 0], 0), P([0, 1, 0], 0), P([0, 0, 1], 0), P([0.5, 0.5, 0], -1), P([0.25, 0.25, 0.5], -0.2)];
  const edges = key(lowerHullEdges(pts));
  // C-rich compound sits above the AB–C line (energy on line at that point = -0.5), so it is not a hull vertex.
  assert.ok(!edges.some((e) => e.split("-").includes("4")));
  assert.ok(edges.includes("2-3"));
});
