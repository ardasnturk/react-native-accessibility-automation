import { NextResponse } from "next/server";
import { readRunReport } from "@/src/server-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ run: string }> }) {
  const { run } = await context.params;
  const report = await readRunReport(run);
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json(report);
}
