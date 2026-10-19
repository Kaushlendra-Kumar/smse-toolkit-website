import type { NextRequest } from "next/server";

import { searchMaterials } from "@/lib/server/materials";
import { respond } from "@/lib/server/respond";

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams; // read outside respond(): marks the route dynamic
  return respond(() => searchMaterials(params));
}
