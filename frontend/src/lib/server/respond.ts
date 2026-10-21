import "server-only";

import { HttpError } from "./materials";

/** CDN cache lifetimes (seconds) for successful GET responses. */
export const CACHE = {
  /** Search results: Materials Project data changes with database releases, a few times a year. */
  search: { sMaxAge: 3600, swr: 86_400 },
  /** A single material, phase diagram, oxidation states, citations. */
  day: { sMaxAge: 86_400, swr: 604_800 },
  /** Calculation files (band structures, Fermi surfaces) never change for a given task. */
  week: { sMaxAge: 604_800, swr: 2_592_000 },
} as const;

export type CachePolicy = { sMaxAge: number; swr: number };

export function cacheControl({ sMaxAge, swr }: CachePolicy): string {
  return `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`;
}

/**
 * Run a handler and turn HttpErrors into FastAPI-style `{ detail }` JSON (what src/lib/api.ts
 * expects). Successful responses get a CDN Cache-Control header when `cache` is given; errors
 * are never cached. Anything else is re-thrown: Next.js uses internal errors for control flow
 * (e.g. dynamic-rendering signals) and handles real crashes itself.
 */
export async function respond(fn: () => Promise<unknown> | unknown, cache?: CachePolicy): Promise<Response> {
  try {
    const headers: HeadersInit = cache ? { "Cache-Control": cacheControl(cache) } : {};
    return Response.json(await fn(), { headers });
  } catch (e) {
    if (e instanceof HttpError) {
      return Response.json({ detail: e.message }, { status: e.status, headers: { "Cache-Control": "no-store" } });
    }
    throw e;
  }
}
