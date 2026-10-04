import { after } from "next/server";

import { readGift, stageLabel, writeGift } from "@/lib/gifts";
import { advanceWithLease } from "@/lib/pipeline";

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
  const before = gift?.stage;
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

  // Persist whatever the retry branches above just changed, *before* handing
  // over. advanceWithLease re-reads the stored document to take its lease, so
  // an in-memory stage reset was silently discarded and every retry path -
  // the failed-gift button, ?retry, ?rebuild - was dead code: the gift went
  // straight back into `default: changed false` and stayed failed for ever.
  if (gift.stage !== before) await writeGift(gift);

  const { gift: updated, changed, busy } = await advanceWithLease(gift);

  // Keep going after the answer is sent.
  //
  // Nothing here is a worker: whoever polls this is what moves a gift
  // forward. So a sender who closes the tab halfway through leaves their gift
  // stopped, half built, with the credits already spent on it. `after` lets
  // one request carry it for the rest of the invocation, and hand on to a
  // fresh one if it still is not finished - so the build survives the browser
  // that started it.
  //
  // The lease is what makes this safe to run alongside a browser that is
  // still polling: only one of them does work at a time.
  if (!busy && updated.stage !== "ready" && updated.stage !== "failed") {
    after(() => carryOn(id, request.url, chainDepth(request.url)));
  }

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
    busy,
    objectsDone,
    objectsTotal,
    error: updated.error,
    ready: updated.stage === "ready",
  });
}

/**
 * How many times this chain has handed on, so it cannot run forever.
 *
 * Twelve links of four minutes covers about fifty minutes, comfortably past
 * the longest gift observed (about twenty), and bounds the damage if a stage
 * ever fails in a way that looks like progress.
 */
const CHAIN_MAX = 12;

/** Leave room inside the 300s budget to hand on cleanly. */
const WORK_MS = 230_000;

function chainDepth(url: string): number {
  return Number(new URL(url).searchParams.get("chain") ?? 0);
}

async function carryOn(id: string, url: string, depth: number): Promise<void> {
  const deadline = Date.now() + WORK_MS;

  while (Date.now() < deadline) {
    const gift = await readGift(id);
    if (!gift || gift.stage === "ready" || gift.stage === "failed") return;

    const { busy } = await advanceWithLease(gift);
    // Someone else is driving it. Nothing to add, and no reason to hand on.
    if (busy) return;

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  if (depth >= CHAIN_MAX) return;

  const next = new URL(url);
  next.searchParams.set("chain", String(depth + 1));
  try {
    await fetch(next.toString(), { method: "POST" });
  } catch {
    // The chain is a convenience, not the guarantee. If handing on fails the
    // cron picks the gift up later.
  }
}
