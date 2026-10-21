/**
 * Sliding-window rate limiter (in memory). On serverless hosts each instance has its own
 * memory, so this is a per-instance limit: it stops simple floods and runaway scripts from
 * exhausting the Materials Project quota, not a determined distributed attacker. CDN caching
 * (Cache-Control s-maxage on API responses) is the main protection.
 */

export type Limit = { limit: number; windowMs: number };
export type Decision = { allowed: boolean; remaining: number; retryAfterSec: number };

export class RateLimiter {
  private hits = new Map<string, number[]>();
  private maxKeys: number;

  constructor(maxKeys = 10_000) {
    this.maxKeys = maxKeys;
  }

  check(key: string, { limit, windowMs }: Limit, now = Date.now()): Decision {
    const since = now - windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.prune(since);
    return { allowed: true, remaining: limit - recent.length, retryAfterSec: 0 };
  }

  /** Drop idle keys so memory stays bounded. */
  private prune(since: number) {
    for (const [k, ts] of this.hits) if (!ts.some((t) => t > since)) this.hits.delete(k);
    // Still too many active keys: drop the oldest entries (Map keeps insertion order).
    for (const k of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) break;
      this.hits.delete(k);
    }
  }
}

/** Limits per API path (first match wins). Heavy routes download multi-MB calculation files. */
export const API_LIMITS: [RegExp, Limit][] = [
  [/^\/api\/materials\/[^/]+\/(electronic|fermi)$/, { limit: 10, windowMs: 60_000 }],
  [/^\/api\//, { limit: 60, windowMs: 60_000 }],
];

export function limitFor(path: string): Limit | null {
  return API_LIMITS.find(([re]) => re.test(path))?.[1] ?? null;
}

/** Client IP from proxy headers (Vercel sets x-forwarded-for / x-real-ip). */
export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}
