import { NextResponse } from "next/server";
import { stopCrawl } from "@/src/server-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = stopCrawl();
  return NextResponse.json(result.body, { status: result.status });
}
