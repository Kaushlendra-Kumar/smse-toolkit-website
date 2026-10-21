// Accuracy of grain-size and porosity measurement on synthetic microstructures with known truth.
import assert from "node:assert/strict";
import { test } from "node:test";

import { analyseGrains, analysePorosity, otsu } from "../src/lib/image-analysis.ts";
import { syntheticGrains, syntheticPores } from "../src/lib/synthetic-microstructure.ts";

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

test("grain size: planimetric and intercept within 6% over 16 random structures", () => {
  const areaErr: number[] = [];
  const intErr: number[] = [];
  for (let i = 0; i < 16; i++) {
    const n = 30 + i * 12; // 30 … 210 grains in 384×384 px
    const { image, truth } = syntheticGrains(384, 384, n, 100 + i);
    const g = analyseGrains(image);
    areaErr.push(Math.abs(g.meanArea - truth.meanArea) / truth.meanArea);
    intErr.push(Math.abs(g.meanIntercept - truth.meanIntercept) / truth.meanIntercept);
  }
  console.log(
    `grain size — mean abs error: planimetric ${(mean(areaErr) * 100).toFixed(2)}% (max ${(Math.max(...areaErr) * 100).toFixed(2)}%), ` +
      `intercept ${(mean(intErr) * 100).toFixed(2)}% (max ${(Math.max(...intErr) * 100).toFixed(2)}%)`,
  );
  assert.ok(Math.max(...areaErr) < 0.06, `planimetric max error ${Math.max(...areaErr)}`);
  assert.ok(Math.max(...intErr) < 0.06, `intercept max error ${Math.max(...intErr)}`);
});

test("porosity within 1.5 percentage points over 16 random structures (2–40% porous)", () => {
  const err: number[] = [];
  for (let i = 0; i < 16; i++) {
    const target = 0.02 + i * 0.025;
    const { image, truth } = syntheticPores(384, 384, target, 300 + i);
    const p = analysePorosity(image);
    err.push(Math.abs(p.porosity - truth.porosity));
  }
  console.log(`porosity — mean abs error ${(mean(err) * 100).toFixed(2)} pp (max ${(Math.max(...err) * 100).toFixed(2)} pp)`);
  assert.ok(Math.max(...err) < 0.015, `max error ${Math.max(...err)}`);
});

test("Otsu separates a bimodal histogram", () => {
  const data = new Uint8Array(1000).map((_, i) => (i < 500 ? 50 : 200));
  const t = otsu({ w: 1000, h: 1, data });
  assert.ok(t >= 50 && t < 200);
});
