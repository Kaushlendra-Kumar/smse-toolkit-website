import type { NextRequest } from "next/server";

import { phaseEntries } from "@/lib/server/materials";
import { respond } from "@/lib/server/respond";

export function GET(request: NextRequest) {
  const elements = request.nextUrl.searchParams.get("elements");
  return respond(() => phaseEntries(elements));
}
