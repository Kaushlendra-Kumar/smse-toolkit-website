import "server-only";

import { HttpError } from "./materials";

/**
 * Run a handler and turn HttpErrors into FastAPI-style `{ detail }` JSON (what src/lib/api.ts
 * expects). Anything else is re-thrown: Next.js uses internal errors for control flow
 * (e.g. dynamic-rendering signals) and handles real crashes itself.
 */
export async function respond(fn: () => Promise<unknown> | unknown): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
