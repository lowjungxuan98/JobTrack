import { ApiReference } from "@scalar/nextjs-api-reference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = ApiReference({
  url: "/openapi.json",
  theme: "default",
  metaData: {
    title: "Job Tracker API Reference",
  },
});
