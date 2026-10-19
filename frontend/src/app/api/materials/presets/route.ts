import { presetsResponse } from "@/lib/server/materials";

export function GET() {
  return Response.json(presetsResponse());
}
