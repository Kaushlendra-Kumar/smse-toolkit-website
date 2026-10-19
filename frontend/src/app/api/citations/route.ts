import { resolveDoi } from "@/lib/server/citations";
import { HttpError } from "@/lib/server/materials";
import { respond } from "@/lib/server/respond";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return respond(async () => {
    if (typeof body?.doi !== "string") throw new HttpError(422, "Send JSON like {\"doi\": \"10.1063/1.4812323\"}.");
    return resolveDoi(body.doi);
  });
}
