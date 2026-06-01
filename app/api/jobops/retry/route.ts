import { triggerJobOps } from "@/lib/jobops-trigger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return triggerJobOps("retry", ["retry"]);
}
