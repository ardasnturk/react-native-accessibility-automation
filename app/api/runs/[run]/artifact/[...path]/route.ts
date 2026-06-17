import { stat } from "node:fs/promises";
import { contentTypeFor, getArtifactPath, streamArtifact } from "@/src/server-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ run: string; path: string[] }> }) {
  const { run, path } = await context.params;
  const artifact = getArtifactPath(run, path);
  if (!artifact) {
    return Response.json({ error: "Artifact not found" }, { status: 404 });
  }

  const artifactStat = await stat(artifact);
  return new Response(streamArtifact(artifact) as unknown as BodyInit, {
    headers: {
      "Content-Type": contentTypeFor(artifact),
      "Content-Length": String(artifactStat.size),
    },
  });
}
