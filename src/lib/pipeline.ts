import type { World } from "./types";
import {
  type Gift,
  type GiftStage,
  giftAssetPath,
  writeGift,
} from "./gifts.ts";
import { listBlobs, mirrorToBlob } from "./providers/blob.ts";
import { parseGlbBounds, placeObjects, spawnFromBounds } from "./providers/glb.ts";
import { createTripoClient } from "./providers/tripo.ts";
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

/**
 * Which levels of detail to mirror, smallest first.
 *
 * 100k matters more than it looks: draft worlds do not offer 150k, so leaving
 * it out meant the smallest thing a gift could show was a 5 MB splat - about
 * seven minutes before a first frame on a slow connection. 100k is around
 * 1 MB, which is the difference between a gift opening and a gift being closed.
 */
const LODS = ["100k", "150k", "500k", "full_res"];

/**
 * The path a browser should use for a mirrored asset.
 *
 * Same-origin, never the Blob host directly. vercel.ts rewrites `/gifts/*`
 * onto the store, exactly as it does for `/worlds/*`. Handing out Blob URLs
 * instead is the mistake documented in docs/DEPLOY.md: Spark loads splats with
 * Range requests, `Range` is not CORS-safelisted, and the preflight comes back
 * 405 with no hint that CORS was ever involved.
 */
function assetHref(gift: Gift, filename: string): string {
  return `/${giftAssetPath(gift.id, filename)}`;
}

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
        return await buildObjects(gift);
      case "rigging":
        return await rigHeroes(gift);
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

  // What is already mirrored comes from the store, not from the gift
  // document.
  //
  // Blob enforces a 60-second minimum cache on public objects, so a document
  // read straight back can be a minute out of date - and acting on that meant
  // re-downloading a 26 MB splat that was already sitting in the store.
  // `list` goes to the API rather than the CDN, so it is strongly consistent,
  // which makes a stale document merely wasteful instead of wrong.
  const prefix = giftAssetPath(gift.id, "");
  const present = new Map(
    (await listBlobs(prefix)).map((blob) => [blob.pathname.slice(prefix.length), blob.url]),
  );

  // Two views of the same asset: `done` holds the absolute Blob URL for
  // server-side use, `hrefs` the same-origin path the browser is given.
  const done: Record<string, string> = {};
  const hrefs: Record<string, string> = {};
  for (const item of wanted) {
    const url = present.get(item.filename);
    if (url) {
      done[item.name] = url;
      hrefs[item.name] = assetHref(gift, item.filename);
    }
  }

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
  //
  // Bounds are measured when the collider is downloaded, but a stale document
  // can arrive here without them. Fetching the mirrored collider back is
  // cheap next to regenerating a world, so do that rather than stall.
  if (!gift.bounds && done.collider) {
    const res = await fetch(done.collider, { cache: "no-store" });
    if (res.ok) {
      const measured = parseGlbBounds(Buffer.from(await res.arrayBuffer()));
      if (measured) gift.bounds = { min: measured.min, max: measured.max };
    }
  }

  const splatLods: Record<string, string> = {};
  for (const lod of LODS) {
    const href = hrefs[`splat-${lod}`];
    if (href) splatLods[lod] = href;
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
    colliderUrl: hrefs.collider,
    bounds: gift.bounds,
    spawn,
    target,
    objects: [],
    caption: assets.caption ?? undefined,
    thumbnailUrl: hrefs.thumbnail,
    fromName: gift.fromName,
    toName: gift.toName,
  };

  return await settle(gift, "objects_generating");
}

/**
 * Low-poly is not optional.
 *
 * These load in a browser beside a splat world that is already tens of
 * megabytes, so a dense mesh is not a quality choice, it is a broken page.
 */
const TRIPO_MODEL = "P1-20260311";

/** The LLM is asked for three to six; this is the hard ceiling on credits and time. */
const MAX_OBJECTS = 6;

/**
 * What a keepsake is allowed to weigh.
 *
 * `smart_low_poly` alone did not do the work its name suggests: the first real
 * gift's four objects came to 10.4 MB, 2 to 3.5 MB each, for things a visitor
 * sees at about 35 cm across - beside a splat world already 23 MB, on a
 * connection that has to carry both.
 *
 * Measured, not assumed. The same frying pan prompt, same model:
 *
 *   before  3,461,320 bytes   ~90 credits
 *   after     708,316 bytes    40 credits
 *
 * Nearly five times smaller and cheaper to make. `pbr: false` is most of it -
 * a PBR set is several textures where one suffices for an object this size -
 * and `texture_quality: "standard"` and a face cap take the rest. Run
 * `npm run object:size` to re-measure if these are ever changed.
 */
const OBJECT_BUDGET = {
  face_limit: 10_000,
  texture_quality: "standard",
  pbr: false,
} as const;

/**
 * How many things in one gift are allowed to move.
 *
 * Rigging costs credits and minutes per object, and a room where everything
 * moves is a toy rather than a memory. One or two is what makes a room feel
 * inhabited.
 */
const MAX_RIGGED = 2;

/**
 * The rig model version, passed explicitly because the server default is dead.
 *
 * Sending no version makes Tripo pick `v2.5-20250123`, which it then rejects
 * itself: "invalid model 'v2.5-20250123', allowed values: v1.0-20240301,
 * v2.5-20260210". The SDK sets nothing, so there is no default to rely on and
 * every rig call has to name one.
 */
const RIG_VERSION = "v2.5-20260210";

/** Statuses Tripo will not move on from. */
const TRIPO_DEAD = ["failed", "cancelled", "banned", "expired", "unknown"];

/**
 * How many times to re-offer an object that was rate-limited.
 *
 * Bounded so a permanently throttled account cannot keep a gift on the waiting
 * screen for ever - at that point the honest answer is a room with fewer
 * things in it.
 */
const MAX_ATTEMPTS = 12;

/** Tripo's "too many at once", which is worth retrying rather than recording. */
function isRateLimited(message: string): boolean {
  return (
    message.includes("code=2000") ||
    /exceeded the limit/i.test(message) ||
    /rate.?limit/i.test(message) ||
    message.includes("429")
  );
}

/**
 * Turn the object list into things standing in the room.
 *
 * Same rule as every other stage: one bounded unit of work per call, every
 * step idempotent, because polling means any step may run twice.
 *
 *   1. nothing started   -> create every task at once, so Tripo runs them in
 *                           parallel on its machines rather than ours
 *   2. tasks outstanding -> poll, and mirror the first that has finished
 *   3. nothing left      -> place them and open the gift
 *
 * A failed object is recorded and skipped. Four of five remembered things is
 * still a gift; only a failed *world* fails the gift.
 */
async function buildObjects(gift: Gift): Promise<AdvanceResult> {
  const specs = (gift.objects ?? []).slice(0, MAX_OBJECTS);

  // Nothing to build: a hand-authored world, or an LLM that returned nothing.
  if (!specs.length) return await settle(gift, "ready");

  const client = createTripoClient();

  // ---- 1. start the next object that has not been started -----------------
  //
  // One per tick, not all at once. Tripo caps concurrent generation, and
  // firing four together failed three of them with "you have exceeded the
  // limit of generation". Ticks are seconds apart and a model takes minutes,
  // so staggered starts still overlap almost entirely - the parallelism is
  // kept, the burst is not.
  const next = specs.find((spec) => !spec.taskId && !spec.error);
  if (next) {
    // Checked once, before spending anything. An empty balance otherwise fails
    // each object separately and delivers an empty room with no explanation.
    const balance = await client.getBalance();
    if (!balance.balance) {
      throw new Error(
        "Tripo has no credits, so none of the objects can be made. " +
          "Top up at platform.tripo3d.ai and retry this gift.",
      );
    }

    next.attempts = (next.attempts ?? 0) + 1;

    try {
      next.taskId = await client.textToModel({
        prompt: next.prompt,
        model: TRIPO_MODEL,
        smart_low_poly: true,
        texture: true,
        ...OBJECT_BUDGET,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // A rate limit is a "come back shortly", not a failure. Recording it as
      // one is what emptied three quarters of the first real gift. Leaving the
      // spec unstarted means the next tick simply tries again.
      if (isRateLimited(message) && next.attempts < MAX_ATTEMPTS) {
        await writeGift(gift);
        return { gift, changed: false };
      }
      next.error = message;
    }

    gift.objects = specs;
    await writeGift(gift);
    return { gift, changed: true };
  }

  // ---- 2. mirror the first task that has finished -------------------------
  for (const spec of specs) {
    if (!spec.taskId || spec.error || spec.modelUrl) continue;

    const task = await client.getTask(spec.taskId);

    if (TRIPO_DEAD.includes(task.status)) {
      spec.error = task.error_msg ?? `Tripo task ${task.status}.`;
      gift.objects = specs;
      await writeGift(gift);
      return { gift, changed: true };
    }

    if (task.status !== "success") {
      // Queued or running. Nothing changed, so the client keeps polling.
      return { gift, changed: false };
    }

    const downloaded = await client.downloadModel(task);
    if (!downloaded) {
      spec.error = "Tripo finished with no downloadable model.";
    } else {
      // model_url dies about five minutes after the task completes, so the
      // bytes are copied now and only our own URL is ever stored.
      const filename = `object-${spec.taskId}.glb`;
      const mirrored = await mirrorToBlob(downloaded.url, giftAssetPath(gift.id, filename));
      spec.modelUrl = assetHref(gift, filename);

      // Measured here, from the bytes already in hand. Placement then never
      // has to pull the model back out of the store to learn its size.
      const measured = parseGlbBounds(mirrored.data);
      if (measured) spec.meshBounds = { min: measured.min, max: measured.max };
    }

    gift.objects = specs;
    await writeGift(gift);
    return { gift, changed: true };
  }

  // ---- 3. place them and open the gift ------------------------------------
  const ready = specs.filter((spec) => spec.modelUrl && spec.meshBounds);

  if (ready.length && gift.world && gift.bounds) {
    const placements = placeObjects(
      gift.bounds,
      ready.map((spec) => boundsOf(spec.meshBounds!)),
    );

    gift.world.objects = ready.map((spec, i) => ({
      id: spec.taskId!,
      modelUrl: spec.modelUrl!,
      position: placements[i].position,
      scale: placements[i].scale,
      // The plain name reads better under an object than the prompt that
      // produced it: "the enamel cup", not a paragraph of model direction.
      caption: spec.name ?? spec.prompt,
    }));
  }

  return await settle(gift, "rigging");
}

/**
 * Teach one or two things in the room to move.
 *
 * A gift that is entirely still reads as a diorama. One thing breathing makes
 * the whole room feel inhabited, which is why STRATEGY asks for this on a
 * couple of hero objects rather than on everything: it costs credits and
 * minutes per object, and most of what a memory contains is a pan or a bowl
 * that has no business moving.
 *
 * Tripo decides what is riggable, not us. `rigCheck` is asked once per object
 * and the answer is kept, because a bowl will not become riggable later.
 *
 * Three calls per hero, one per tick, same as every other stage:
 *
 *   rigCheck -> rigModel -> retargetAnimation
 *
 * The animated GLB replaces the still one, so the viewer never has to know
 * which objects are alive - it plays whatever clips arrive inside the file.
 *
 * Nothing here can fail a gift. A room full of still objects is the thing we
 * already had; this is the part that is allowed not to work.
 */
async function rigHeroes(gift: Gift): Promise<AdvanceResult> {
  const specs = gift.objects ?? [];
  const built = specs.filter((spec) => spec.modelUrl && spec.taskId);
  if (!built.length) return await settle(gift, "ready");

  const client = createTripoClient();

  // ---- 1. ask once which of them could move ------------------------------
  const unasked = built.find((spec) => spec.riggable === undefined);
  if (unasked) {
    try {
      const checkId = await client.rigCheck({ input: unasked.taskId! });
      // Short next to the 300s tick budget. A rig check answers in seconds;
      // anything slower than this is not worth holding a gift open for.
      const task = await client.waitForTask(checkId, { timeoutMs: 60_000 });
      unasked.riggable = Boolean(task.output?.riggable);
    } catch (err) {
      // Could not tell, so treat it as still. Better a quiet room than a
      // gift stuck on a question nobody asked for.
      console.warn(`Lantern: rig check failed for ${unasked.name}`, err);
      unasked.riggable = false;
    }
    await writeGift(gift);
    return { gift, changed: true };
  }

  const heroes = built.filter((spec) => spec.riggable).slice(0, MAX_RIGGED);

  // ---- 2. rig the next one that has not been rigged -----------------------
  const unrigged = heroes.find((spec) => !spec.rigTaskId);
  if (unrigged) {
    try {
      unrigged.rigTaskId = await client.rigModel({
        input: unrigged.taskId!,
        out_format: "glb",
        spec: "tripo",
        model_version: RIG_VERSION,
      });
    } catch (err) {
      console.warn(`Lantern: could not rig ${unrigged.name}`, err);
      unrigged.riggable = false;
    }
    await writeGift(gift);
    return { gift, changed: true };
  }

  // ---- 3. animate, then swap the still model for the moving one -----------
  for (const hero of heroes) {
    if (!hero.rigTaskId || hero.animateTaskId) continue;

    try {
      const rigged = await client.getTask(hero.rigTaskId);
      if (!TRIPO_DEAD.includes(rigged.status) && rigged.status !== "success") {
        return { gift, changed: false };
      }
      if (rigged.status !== "success") throw new Error(rigged.error_msg ?? "rig failed");

      hero.animateTaskId = await client.retargetAnimation({
        input: hero.rigTaskId,
        animation: "preset:idle",
        out_format: "glb",
        bake_animation: true,
        model_version: RIG_VERSION,
      });
    } catch (err) {
      console.warn(`Lantern: could not animate ${hero.name}`, err);
      hero.riggable = false;
    }
    await writeGift(gift);
    return { gift, changed: true };
  }

  for (const hero of heroes) {
    if (!hero.animateTaskId) continue;

    const task = await client.getTask(hero.animateTaskId);
    if (!TRIPO_DEAD.includes(task.status) && task.status !== "success") {
      return { gift, changed: false };
    }

    if (task.status === "success") {
      const downloaded = await client.downloadModel(task);
      if (downloaded) {
        const filename = `alive-${hero.taskId}.glb`;
        await mirrorToBlob(downloaded.url, giftAssetPath(gift.id, filename));

        // The placed object points at the moving version from here on.
        const placed = gift.world?.objects?.find((o) => o.id === hero.taskId);
        if (placed) placed.modelUrl = assetHref(gift, filename);
      }
    }

    // Either way this hero is finished with.
    hero.riggable = false;
    await writeGift(gift);
    return { gift, changed: true };
  }

  return await settle(gift, "ready");
}

/** The stored min/max, widened back into the shape the placer expects. */
function boundsOf(b: { min: [number, number, number]; max: [number, number, number] }) {
  return {
    min: b.min,
    max: b.max,
    size: [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]] as [
      number,
      number,
      number,
    ],
    center: [
      (b.min[0] + b.max[0]) / 2,
      (b.min[1] + b.max[1]) / 2,
      (b.min[2] + b.max[2]) / 2,
    ] as [number, number, number],
    vertices: 0,
    triangles: 0,
  };
}
