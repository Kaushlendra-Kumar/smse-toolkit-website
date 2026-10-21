import assert from "node:assert/strict";
import { test } from "node:test";

import { clientIp, limitFor, RateLimiter } from "../src/lib/rate-limit.ts";

test("allows up to the limit, then blocks with Retry-After", () => {
  const rl = new RateLimiter();
  const lim = { limit: 3, windowMs: 60_000 };
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(rl.check("ip", lim, t0 + i).allowed, true);
  const d = rl.check("ip", lim, t0 + 10);
  assert.equal(d.allowed, false);
  assert.ok(d.retryAfterSec >= 59 && d.retryAfterSec <= 60);
});

test("window slides: requests are allowed again after it passes", () => {
  const rl = new RateLimiter();
  const lim = { limit: 2, windowMs: 1000 };
  rl.check("ip", lim, 0);
  rl.check("ip", lim, 10);
  assert.equal(rl.check("ip", lim, 500).allowed, false);
  assert.equal(rl.check("ip", lim, 1011).allowed, true);
});

test("clients are limited independently", () => {
  const rl = new RateLimiter();
  const lim = { limit: 1, windowMs: 60_000 };
  assert.equal(rl.check("a", lim).allowed, true);
  assert.equal(rl.check("a", lim).allowed, false);
  assert.equal(rl.check("b", lim).allowed, true);
});

test("memory stays bounded", () => {
  const rl = new RateLimiter(100);
  for (let i = 0; i < 1000; i++) rl.check(`ip${i}`, { limit: 5, windowMs: 60_000 });
  // @ts-expect-error — inspecting private state in a test
  assert.ok(rl.hits.size <= 101);
});

test("route limits and client IP parsing", () => {
  assert.equal(limitFor("/api/materials/mp-1/fermi")?.limit, 10);
  assert.equal(limitFor("/api/materials/search")?.limit, 60);
  assert.equal(limitFor("/steel"), null);
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })), "1.2.3.4");
  assert.equal(clientIp(new Headers({ "x-real-ip": "5.6.7.8" })), "5.6.7.8");
});
