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
  if (gift.stage === "failed" && new URL(request.url).searchParams.has("retry")) {
    gift.stage = gift.worldId ? "world_mirroring" : "world_generating";
    gift.error = undefined;
  }

  const { gift: updated, changed } = await advance(gift);

  return Response.json({
    id: updated.id,
    stage: updated.stage,
    label: stageLabel(updated.stage),
    changed,
    error: updated.error,
    ready: updated.stage === "ready",
  });
}
