import { getOxidation } from "@/lib/server/materials";
import { respond } from "@/lib/server/respond";

export async function GET(_request: Request, ctx: RouteContext<"/api/materials/[id]/oxidation">) {
  const { id } = await ctx.params;
  return respond(() => getOxidation(id));
}
