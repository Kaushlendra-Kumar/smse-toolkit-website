import { NextResponse, type NextRequest } from "next/server";

import { clientIp, limitFor, RateLimiter } from "@/lib/rate-limit";

const limiter = new RateLimiter();

/** Rate-limit the API routes per client IP (see src/lib/rate-limit.ts for the limits). */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const limit = limitFor(path);
  if (!limit) return NextResponse.next();
  const heavy = limit.limit <= 10 ? "heavy" : "api";
  const decision = limiter.check(`${clientIp(request.headers)}:${heavy}`, limit);
  if (!decision.allowed) {
    return NextResponse.json(
      { detail: `Too many requests — please wait ${decision.retryAfterSec} s and try again.` },
      { status: 429, headers: { "Retry-After": String(decision.retryAfterSec), "Cache-Control": "no-store" } },
    );
  }
  const res = NextResponse.next();
  res.headers.set("X-RateLimit-Limit", String(limit.limit));
  res.headers.set("X-RateLimit-Remaining", String(decision.remaining));
  return res;
}

export const config = { matcher: "/api/:path*" };
