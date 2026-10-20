import { getMaterial } from "@/lib/server/materials";
import { respond } from "@/lib/server/respond";

export async function GET(_request: Request, ctx: RouteContext<"/api/materials/[id]">) {
  const { id } = await ctx.params;
  return respond(() => getMaterial(id));
}
