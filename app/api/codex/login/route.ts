import { NextResponse } from "next/server";
import { captureDeviceAuth, spawnCodex } from "@/lib/codex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const proc = spawnCodex(["login", "--device-auth"]);
  try {
    const { url, code } = await captureDeviceAuth(proc);
    return NextResponse.json({ url, code, expiresInSec: 900 });
  } catch (e) {
    try {
      proc.kill();
    } catch {}
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
