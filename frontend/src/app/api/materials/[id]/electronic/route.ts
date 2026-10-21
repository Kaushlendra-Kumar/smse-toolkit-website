import { getElectronic } from "@/lib/server/electronic";
import { HttpError } from "@/lib/server/materials";
import { respond } from "@/lib/server/respond";

export async function GET(_request: Request, ctx: RouteContext<"/api/materials/[id]/electronic">) {
  const { id } = await ctx.params;
  return respond(() => {
    if (!/^(mp|mvc)-[a-z0-9]+$/i.test(id)) throw new HttpError(422, "Material ids look like 'mp-149'.");
    return getElectronic(id);
  });
}
