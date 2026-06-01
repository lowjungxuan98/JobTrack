import { NextResponse } from "next/server";
import spec from "@/lib/openapi-spec.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /openapi.json — returns the OpenAPI spec with `servers` derived from
// the inbound request, so Scalar's "Try it" panel always points at whatever
// host you actually loaded /reference from (localhost:3010, 8001, ngrok…).
export async function GET(req: Request) {
  const host = req.headers.get("host") ?? "localhost:3000";
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (req.headers.get("host")?.startsWith("localhost") ? "http" : "https");
  return NextResponse.json({
    ...spec,
    servers: [{ url: `${proto}://${host}`, description: "Current host" }],
  });
}
