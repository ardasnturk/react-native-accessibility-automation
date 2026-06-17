import { NextResponse } from "next/server";
import { deleteRun } from "@/src/server-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ run: string }> }) {
  const { run } = await context.params;
  const result = await deleteRun(run);
  if (result.status === 204) {
    return new Response(null, { status: 204 });
  }

  return NextResponse.json(result.body, { status: result.status });
}
