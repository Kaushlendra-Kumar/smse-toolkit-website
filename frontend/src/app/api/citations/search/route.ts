import type { NextRequest } from "next/server";

import { searchCrossref } from "@/lib/server/citations";
import { CACHE, respond } from "@/lib/server/respond";

export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  return respond(() => searchCrossref(q.get("q") ?? "", Number(q.get("rows") ?? 5) || 5), CACHE.day);
}
