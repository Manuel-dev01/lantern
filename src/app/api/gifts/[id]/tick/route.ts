import { readGift, stageLabel } from "@/lib/gifts";
import { advance } from "@/lib/pipeline";

/**
 * Advance a gift by one stage.
 *
 * This is the whole orchestration. There is no queue and no worker: the client
 * polling this endpoint is what drives the pipeline forward. Each call does at
 * most one stage of work so it stays well inside the 300s function limit, and
 * every stage is idempotent because polling means any stage may run twice.
 *
 * POST rather than GET because it mutates, and so nothing caches it.
 */

export const dynamic = "force-dynamic";

/**
 * Mirroring a full_res splat is the heaviest thing this does, so take the
 * whole budget rather than inheriting a default that might be lower.
 */
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/gifts/[id]/tick">) {
  const { id } = await ctx.params;

  const gift = await readGift(id);
  if (!gift) {
    return Response.json({ error: "No such gift." }, { status: 404 });
  }

  // A failed gift is worth retrying rather than regenerating: the world itself
  // already cost credits and still exists, so only the stage that failed needs
  // to run again. Mirroring records each asset as it lands, so a retry picks
  // up where it stopped.
  const params = new URL(request.url).searchParams;

  if (gift.stage === "failed" && params.has("retry")) {
    gift.stage = gift.worldId ? "world_mirroring" : "world_generating";
    gift.error = undefined;
  }

  // A finished gift can still be missing things: Tripo rate-limits, and an
  // object that lost that race left an error behind rather than a model.
  // Clearing those and going back sends only the missing ones for another go -
  // the world and the objects that did arrive are untouched and cost nothing.
  if (gift.stage === "ready" && params.has("retry")) {
    const missing = (gift.objects ?? []).filter((o) => o.error && !o.modelUrl);
    if (missing.length) {
      for (const spec of missing) {
        spec.error = undefined;
        spec.attempts = 0;
      }
      gift.stage = "objects_generating";
    }
  }

  // Reassemble a finished gift's manifest from the assets already in the
  // store. No downloads and no credits: the mirroring stage asks the store
  // what exists and skips anything present. Needed whenever the manifest
  // shape changes under gifts that were built before it.
  if (gift.stage === "ready" && gift.worldId && params.has("rebuild")) {
    gift.stage = "world_mirroring";
    gift.error = undefined;
  }

  const { gift: updated, changed } = await advance(gift);

  // Counted rather than guessed: a stage name alone cannot tell a visitor
  // whether anything is happening over four minutes of object generation.
  const objects = updated.objects ?? [];
  const objectsTotal = objects.length;
  const objectsDone = objects.filter((o) => o.modelUrl || o.error).length;

  return Response.json({
    id: updated.id,
    stage: updated.stage,
    label: stageLabel(updated.stage),
    changed,
    objectsDone,
    objectsTotal,
    error: updated.error,
    ready: updated.stage === "ready",
  });
}
