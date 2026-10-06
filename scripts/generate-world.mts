/**
 * Generate one Marble world and mirror its assets to disk.
 *
 *   npm run world:generate
 *   npm run world:generate -- --world-id <id>      # re-mirror an existing world
 *   npm run world:generate -- --model marble-1.1   # escalate past draft
 *   npm run world:generate -- --lod 500k           # one level of detail
 *   npm run world:generate -- --lods 150k,500k,full_res   # mirror several
 *
 * A completed generation already carries finished assets: .spz splats at three
 * levels of detail, and a collider mesh GLB. Both are downloaded here and
 * nothing else. The separate export endpoints exist for other formats (PLY,
 * high-res textured mesh) and are not needed for the normal path.
 *
 * The world id is checkpointed to `public/worlds/<id>/_run.json` as soon as it
 * exists, so a download failure never costs another generation: re-run with
 * `--world-id` to pick up where it stopped.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { World } from "../src/lib/types.ts";
import { readGlbBounds, spawnFromBounds } from "../src/lib/providers/glb.ts";
import { supportedSpawnFromGlb } from "../src/lib/providers/collider.ts";
import {
  existingAsset,
  formatBytes,
  REPO_ROOT,
  saveAsset,
  readManifest,
  writeJson,
  writeManifest,
} from "./lib/storage.mts";
import {
  elapsed,
  generateWorld,
  getWorld,
  pollOperation,
  WorldLabsError,
  type GenerateWorldResult,
} from "../src/lib/providers/worldlabs.ts";

// Written for the theme: a doorway, a desk and a bed give hard occluders at
// three distinct depths, which is exactly what the Tripo-behind-splat
// occlusion test needs to be unambiguous. The floor plane is for the Phase 1
// BVH walking work.
const WORLD_PROMPT = `A child's bedroom at dusk in the early 2000s, seen from the doorway. Warm orange light from a bedside lamp, the rest of the room in blue shadow. A low bed with rumpled sheets on the left, a wooden desk under a half-curtained window on the right, an open doorway to a dark hallway. Toys and books scattered across the carpet. Deep space between the foreground furniture and the far wall. Photographic, soft focus, nostalgic.`;

const DEFAULT_MODEL = "marble-1.0-draft";
const DEFAULT_LOD = "full_res";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const model = arg("model") ?? DEFAULT_MODEL;
const lod = arg("lod") ?? DEFAULT_LOD;
// Mirroring several levels costs only bandwidth and lets the viewer choose one
// per device, which is the only way a 26.8 MB full_res world is usable on a
// phone.
const lods = (arg("lods") ?? lod).split(",").map((l) => l.trim()).filter(Boolean);
const existingId = arg("world-id");

const runStarted = Date.now();
const timings: Array<{ stage: string; detail: string }> = [];

// ─── world ──────────────────────────────────────────────────────────────────

let world: GenerateWorldResult;

if (existingId) {
  console.log(`Resuming with existing world ${existingId} — skipping generation.`);
  world = await getWorld(existingId);
} else {
  console.log(`Generating world with ${model}`);
  console.log(`  prompt: ${WORLD_PROMPT.slice(0, 90)}…`);
  const started = Date.now();

  const op = await generateWorld({
    displayName: `Lantern spike ${new Date().toISOString().slice(0, 16)}`,
    model,
    textPrompt: WORLD_PROMPT,
  });

  world = await pollOperation<GenerateWorldResult>(op, {
    label: "generate",
    intervalMs: 10_000,
    timeoutMs: 1_200_000,
  });
  timings.push({ stage: "generate", detail: elapsed(started) });
}

const worldId = String(world.world_id ?? world.id ?? "");
if (!worldId) {
  throw new Error(
    `No world id in the response:\n${JSON.stringify(world, null, 2)}`,
  );
}

console.log(`\n  WORLD ID: ${worldId}`);
console.log(`  re-mirror without regenerating: npm run world:generate -- --world-id ${worldId}`);
if (world.world_marble_url) console.log(`  marble: ${world.world_marble_url}`);

const dir = `worlds/${worldId}`;
await writeJson(dir, "_run.json", {
  worldId,
  model,
  prompt: WORLD_PROMPT,
  generatedAt: new Date().toISOString(),
  raw: world,
});

// ─── assets ─────────────────────────────────────────────────────────────────

const assets = world.assets ?? {};
const spzUrls = assets.splats?.spz_urls ?? {};
const available = Object.entries(spzUrls).filter(([, url]) => Boolean(url));

console.log(`\n  splat LoDs available: ${available.map(([k]) => k).join(", ") || "none"}`);

const splatUrl = spzUrls[lod] ?? available[0]?.[1];
if (!splatUrl) {
  throw new Error(
    `No splat asset on this world. assets.splats =\n${JSON.stringify(assets.splats, null, 2)}`,
  );
}
if (!spzUrls[lod]) {
  console.warn(`  requested LoD "${lod}" missing — falling back to "${available[0][0]}"`);
}

// The level of detail is part of the filename, so several can coexist and
// switching between them downloads the new one rather than silently reusing a
// cached file under a shared name.
const wanted = lods.filter((l) => spzUrls[l]);
const missing = lods.filter((l) => !spzUrls[l]);
if (missing.length) {
  console.warn(`  levels not offered by this world: ${missing.join(", ")}`);
}
if (!wanted.length) wanted.push(available[0][0]);

const downloads: Array<{ name: string; filename: string; url: string; required: boolean }> =
  wanted.map((level, i) => ({
    name: `splat-${level}`,
    filename: `splat-${level}.spz`,
    url: spzUrls[level]!,
    // Only the first has to succeed; the rest are alternative sizes.
    required: i === 0,
  }));

const chosenLod = wanted[0];

const colliderUrl = assets.mesh?.collider_mesh_url;
if (colliderUrl) {
  downloads.push({ name: "collider", filename: "collider.glb", url: colliderUrl, required: false });
} else {
  console.warn("  no collider_mesh_url — occlusion and collision will be unavailable.");
}

if (assets.thumbnail_url) {
  downloads.push({
    name: "thumbnail",
    filename: "thumbnail.webp",
    url: assets.thumbnail_url,
    required: false,
  });
}

const saved: Record<string, string> = {};

const force = process.argv.includes("--force");

for (const item of downloads) {
  const started = Date.now();
  try {
    const cached = force ? null : await existingAsset(dir, item.filename);
    if (cached) {
      saved[item.name] = cached.publicUrl;
      timings.push({ stage: item.name, detail: `cached — ${formatBytes(cached.bytes)}` });
      console.log(`  ${item.name}: already mirrored (${formatBytes(cached.bytes)}) — pass --force to refetch`);
      continue;
    }
    const asset = await saveAsset(dir, item.filename, item.url);
    saved[item.name] = asset.publicUrl;
    timings.push({
      stage: item.name,
      detail: `${elapsed(started)} — ${formatBytes(asset.bytes)} -> ${asset.publicUrl}`,
    });
    console.log(`  ${item.name}: ${formatBytes(asset.bytes)} -> ${asset.publicUrl}`);
  } catch (err) {
    timings.push({ stage: item.name, detail: `FAILED after ${elapsed(started)}` });
    console.error(`\n  ${item.name} download FAILED:`);
    console.error(err instanceof WorldLabsError ? err.message : String(err));
    console.error(`  resume with: npm run world:generate -- --world-id ${worldId}\n`);
    if (item.required) process.exitCode = 1;
  }
}

// ─── world.json ─────────────────────────────────────────────────────────────

// Collect whichever levels actually made it to disk.
const splatLods: Record<string, string> = {};
for (const level of wanted) {
  const url = saved[`splat-${level}`];
  if (url) splatLods[level] = url;
}
// The heaviest level is the default, and the viewer steps down from there.
const ORDER = ["100k", "150k", "500k", "full_res"];
const best = ORDER.filter((l) => splatLods[l]).pop() ?? Object.keys(splatLods)[0];

if (best) {
  // The camera has to be placed from the world's real bounds. A hardcoded
  // spawn put the first world's camera above its ceiling and outside its back
  // wall, because Marble worlds are neither origin-centred nor metric.
  const colliderPath = saved.collider
    ? join(REPO_ROOT, "public", saved.collider.replace(/^\//, ""))
    : null;
  const bounds = colliderPath ? await readGlbBounds(colliderPath) : null;

  if (bounds) {
    const f = (v: number[]) => v.map((n) => n.toFixed(2)).join(", ");
    console.log(`\n  bounds: [${f(bounds.min)}] .. [${f(bounds.max)}]`);
    console.log(`  size:   [${f(bounds.size)}]  ${bounds.triangles.toLocaleString()} triangles`);
  } else {
    console.warn("\n  No collider bounds — falling back to a guessed camera position.");
  }

  const placement = bounds
    ? spawnFromBounds(bounds)
    : { spawn: [0, 1.6, 3] as [number, number, number], target: [0, 1, 0] as [number, number, number] };
  const supported =
    bounds && colliderPath
      ? await supportedSpawnFromGlb(await readFile(colliderPath), placement.spawn, {
          min: bounds.min,
          max: bounds.max,
        })
      : null;
  if (supported) placement.spawn = [supported.x, supported.y, supported.z];
  console.log(`  spawn:  [${placement.spawn.map((n) => n.toFixed(2)).join(", ")}]`);

  // Re-mirroring a world must not throw away what has been placed in it.
  // Generation owns the world's assets and geometry; the objects, and who the
  // gift is from and to, belong to the gift and are merged back in.
  const previous = await readManifest<World>(worldId);

  const record: World = {
    id: worldId,
    splatUrl: splatLods[best],
    splatLods,
    colliderUrl: saved.collider,
    spawn: placement.spawn,
    spawnFloorY: supported?.floorY,
    target: placement.target,
    cameraFov: previous?.cameraFov ?? 55,
    explorationRadius:
      previous?.explorationRadius ??
      (supported
        ? Math.max(0.75, (supported.y - supported.floorY) * 1.2)
        : undefined),
    bounds: bounds ? { min: bounds.min, max: bounds.max } : undefined,
    objects: previous?.objects ?? [],
    fromName: previous?.fromName,
    toName: previous?.toName,
    caption: assets.caption ?? undefined,
    thumbnailUrl: saved.thumbnail,
  };
  console.log(`\nWrote ${await writeManifest(worldId, record)}`);
} else {
  console.error("\nNo splat downloaded — manifest not written, nothing for the app to load.");
}

// ─── summary ────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
// On a resume the model comes from the world, not from our default flag.
const reportedModel = String(world.model ?? model);
console.log(`World ${worldId} (${reportedModel}, default lod ${best ?? chosenLod}) — total ${elapsed(runStarted)}`);
for (const t of timings) console.log(`  ${t.stage.padEnd(12)} ${t.detail}`);
