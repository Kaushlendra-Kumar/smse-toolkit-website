import type { NextRequest } from "next/server";

import { searchElectrodes } from "@/lib/server/materials";
import { respond } from "@/lib/server/respond";

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return respond(() => searchElectrodes(params));
}
