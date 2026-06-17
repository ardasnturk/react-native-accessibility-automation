import { NextResponse } from "next/server";
import { listRuns } from "@/src/server-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listRuns());
}
