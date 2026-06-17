import { NextResponse } from "next/server";
import { getConfig, updateConfig } from "@/src/server-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getConfig());
}

export async function POST(request: Request) {
  const result = await updateConfig(await request.json());
  return NextResponse.json(result.body, { status: result.status });
}
