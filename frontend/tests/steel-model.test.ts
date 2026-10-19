// Checks the in-browser steel model against scikit-learn's own predictions.
// Run: node --test tests/   (Node >= 22.18 runs TypeScript directly)
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { loadSteelModel, type TargetKey } from "../src/lib/steel-model.ts";

const root = new URL("../", import.meta.url);

// Serve /models/* from public/ instead of over HTTP.
globalThis.fetch = (async (url: string) => {
  const data = await readFile(new URL(`public${url}`, root));
  return new Response(data);
}) as typeof fetch;

test("matches scikit-learn on 200 random compositions", async () => {
  const fixture = JSON.parse(await readFile(new URL("tests/steel_fixture.json", root), "utf8"));
  const model = await loadSteelModel();
  const features: string[] = fixture.features;
  let worst = 0;
  for (const [i, row] of (fixture.X as number[][]).entries()) {
    const temperature = row[row.length - 1];
    const composition = Object.fromEntries(features.slice(0, -1).map((f, j) => [f, row[j]]));
    const { predictions } = model.predict(composition, temperature);
    for (const key of Object.keys(fixture.expected) as TargetKey[]) {
      const exp = fixture.expected[key].mean[i];
      const got = predictions[key].value;
      worst = Math.max(worst, Math.abs(got - exp) / Math.max(1, Math.abs(exp)));
      assert.ok(Math.abs(got - exp) < 0.01 * Math.max(1, Math.abs(exp)), `${key} row ${i}: ${got} vs ${exp}`);
      assert.ok(Math.abs(predictions[key].std - fixture.expected[key].std[i]) < 0.05 + 0.01 * fixture.expected[key].std[i]);
    }
  }
  console.log(`worst relative deviation: ${(worst * 100).toFixed(4)}%`);
});

test("flags out-of-range inputs and rejects unknown features", async () => {
  const model = await loadSteelModel();
  assert.ok(model.predict({ C: 1.5 }, 27).warnings.some((w) => w.startsWith("C = 1.5")));
  assert.throws(() => model.predict({ Xx: 1 }, 27), /Unknown features/);
});
