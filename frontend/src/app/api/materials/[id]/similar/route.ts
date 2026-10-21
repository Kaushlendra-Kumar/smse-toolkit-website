import { similarMaterials } from "@/lib/server/materials";
import { CACHE, respond } from "@/lib/server/respond";

export async function GET(_request: Request, ctx: RouteContext<"/api/materials/[id]/similar">) {
  const { id } = await ctx.params;
  return respond(() => similarMaterials(id), CACHE.day);
}
