import { presetsResponse } from "@/lib/server/materials";
import { CACHE, cacheControl } from "@/lib/server/respond";

export function GET() {
  return Response.json(presetsResponse(), { headers: { "Cache-Control": cacheControl(CACHE.day) } });
}
