import { NextResponse } from "next/server";
import { getCrawlStatus } from "@/src/server-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getCrawlStatus());
}
