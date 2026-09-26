import type { World } from "./types";
import {
  type Gift,
  type GiftStage,
  giftAssetPath,
  writeGift,
} from "./gifts.ts";
import { mirrorToBlob } from "./providers/blob.ts";
import { parseGlbBounds, spawnFromBounds } from "./providers/glb.ts";
import {
  type GenerateWorldResult,
  getWorld,
  wlFetch,
  type Operation,
} from "./providers/worldlabs.ts";

/**
 * Advancing a gift, one stage at a time.
 *
 * Marble takes 27 seconds for a draft and 5m35s for a full world; Vercel's
 * maximum function timeout is 300 seconds. So no request can sit and wait for
 * a world - `advance` does at most one stage of work and returns, and the
 * client calls it again. That also means every stage must be idempotent, since
 * a stage may well run twice.
 *
 * There is no queue and no worker. The client's polling is the clock. If the
 * visitor closes the tab the pipeline pauses and resumes when the link is next
 * opened, which is a fair trade for having no infrastructure to keep alive.
 */

/** Which levels of detail to mirror. Ordered smallest-first so something renders early. */
const LODS = ["150k", "500k", "full_res"];

export interface AdvanceResult {
  gift: Gift;
  /** True when this call changed something, so the caller can pace its polling. */
  changed: boolean;
}

export async function advance(gift: Gift): Promise<AdvanceResult> {
  try {
    switch (gift.stage) {
      case "world_generating":
        return await checkWorld(gift);
      case "world_mirroring":
        return await mirrorWorld(gift);
      case "objects_generating":
        // Slice 4 fills this in. Until then a world with no objects is done.
        return await settle(gift, "ready");
      default:
        return { gift, changed: false };
    }
  } catch (err) {
    // A failed gift must say so. An endless spinner is the worst outcome here:
    // the visitor cannot tell it from a slow one.
    gift.error = err instanceof Error ? err.message : String(err);
    return await settle(gift, "failed");
  }
}

async function settle(gift: Gift, stage: GiftStage): Promise<AdvanceResult> {
  if (gift.stage === stage) return { gift, changed: false };
  gift.stage = stage;
  await writeGift(gift);
  return { gift, changed: true };
}

/** Is Marble finished? One cheap request; no writes unless the answer changed. */
async function checkWorld(gift: Gift): Promise<AdvanceResult> {
  if (!gift.operationId) throw new Error("No Marble operation to poll.");

  const op = await wlFetch<Operation<GenerateWorldResult>>(
    `/marble/v1/operations/${gift.operationId}`,
  );

  if (!op.done) return { gift, changed: false };
  if (op.error) {
    throw new Error(`Marble failed: ${JSON.stringify(op.error)}`);
  }

  const worldId = String(op.response?.world_id ?? op.response?.id ?? "");
  if (!worldId) throw new Error("Marble finished without a world id.");

  gift.worldId = worldId;
  return await settle(gift, "world_mirroring");
}

/**
 * Copy the world's assets into our own storage.
 *
 * Marble's URLs expire, so nothing here may be handed to a browser. This is
 * the heaviest stage - a full_res splat is over 20 MB - and the one most
 * likely to bump the function limit, which is why it runs alone.
 */
async function mirrorWorld(gift: Gift): Promise<AdvanceResult> {
  if (!gift.worldId) throw new Error("No world to mirror.");

  const world = await getWorld(gift.worldId);
  const assets = world.assets ?? {};
  const spz = assets.splats?.spz_urls ?? {};

  // Everything this world needs copied, smallest first so the cheap ones are
  // banked before the 20 MB one is attempted.
  const wanted: Array<{ name: string; filename: string; source: string }> = [];
  for (const lod of LODS) {
    const source = spz[lod];
    if (source) {
      wanted.push({ name: `splat-${lod}`, filename: `splat-${lod}.spz`, source });
    }
  }
  if (!wanted.length) {
    throw new Error(`No splats on world ${gift.worldId}: ${JSON.stringify(assets.splats)}`);
  }
  if (assets.mesh?.collider_mesh_url) {
    wanted.push({
      name: "collider",
      filename: "collider.glb",
      source: assets.mesh.collider_mesh_url,
    });
  }
  if (assets.thumbnail_url) {
    wanted.push({
      name: "thumbnail",
      filename: "thumbnail.webp",
      source: assets.thumbnail_url,
    });
  }

  const done = gift.assets ?? {};

  // One asset per tick. Mirroring them all in a single call is what killed the
  // first attempt: three splats plus a collider is ~36 MB, and the fetch was
  // terminated at 408 seconds - past any function limit. One bounded download
  // per call keeps every tick short and makes a failure resumable.
  const next = wanted.find((item) => !done[item.name]);
  if (next) {
    const mirrored = await mirrorToBlob(next.source, giftAssetPath(gift.id, next.filename));
    gift.assets = { ...done, [next.name]: mirrored.url };

    // The collider is also what the camera and object placement are derived
    // from, so measure it while the bytes are in hand rather than fetching our
    // own copy back out.
    if (next.name === "collider") {
      const measured = parseGlbBounds(mirrored.data);
      if (measured) {
        gift.bounds = { min: measured.min, max: measured.max };
      }
    }

    await writeGift(gift);
    return { gift, changed: true };
  }

  // Everything is mirrored; assemble the manifest the viewer renders.
  const splatLods: Record<string, string> = {};
  for (const lod of LODS) {
    const url = done[`splat-${lod}`];
    if (url) splatLods[lod] = url;
  }
  const best = LODS.filter((l) => splatLods[l]).pop()!;

  let spawn: World["spawn"];
  let target: World["target"];
  if (gift.bounds) {
    const placement = spawnFromBounds({
      min: gift.bounds.min,
      max: gift.bounds.max,
      size: [
        gift.bounds.max[0] - gift.bounds.min[0],
        gift.bounds.max[1] - gift.bounds.min[1],
        gift.bounds.max[2] - gift.bounds.min[2],
      ],
      center: [
        (gift.bounds.min[0] + gift.bounds.max[0]) / 2,
        (gift.bounds.min[1] + gift.bounds.max[1]) / 2,
        (gift.bounds.min[2] + gift.bounds.max[2]) / 2,
      ],
      vertices: 0,
      triangles: 0,
    });
    spawn = placement.spawn;
    target = placement.target;
  }

  gift.world = {
    id: gift.worldId,
    splatUrl: splatLods[best],
    splatLods,
    colliderUrl: done.collider,
    bounds: gift.bounds,
    spawn,
    target,
    objects: [],
    caption: assets.caption ?? undefined,
    thumbnailUrl: done.thumbnail,
    fromName: gift.fromName,
    toName: gift.toName,
  };

  return await settle(gift, "objects_generating");
}
