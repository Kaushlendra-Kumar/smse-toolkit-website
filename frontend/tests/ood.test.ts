// The browser "not recognised" detector must reproduce the Python scores (backend/ml/micrograph/ood.py).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
globalThis.fetch = (async (url: string) => new Response(await readFile(new URL(`public${url}`, root)))) as typeof fetch;

const { loadDetector } = await import("../src/lib/micrograph-ood.ts");

test("browser OOD scores match Python", async () => {
  const fixture: { probs: number[]; embedding: number[]; score: number }[] = JSON.parse(
    await readFile(new URL("tests/ood_fixture.json", root), "utf8"),
  );
  const det = await loadDetector();
  assert.ok(det, "detector files missing");
  for (const [i, f] of fixture.entries()) {
    const s = det.score(f.probs, Float32Array.from(f.embedding));
    assert.ok(Math.abs(s - f.score) < 1e-3 * Math.max(1, Math.abs(f.score)), `#${i}: ${s} vs ${f.score}`);
  }
  console.log(`method: ${det.config.method}; ${fixture.length} cases match`);
});
