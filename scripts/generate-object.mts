/**
 * Generate one Tripo gift object and place it inside a generated world.
 *
 *   npm run object:generate
 *   npm run object:generate -- --world-id <id> --prompt "a worn stuffed rabbit"
 *   npm run object:generate -- --at 0,0.4,-1 --scale 0.5
 *
 * Tripo's `model_url` expires roughly five minutes after the task completes,
 * so the GLB is downloaded inside this script and mirrored to our own storage.
 * A provider URL must never reach the browser.
 */

import { join } from "node:path";

import type { GiftObject, World } from "../src/lib/types.ts";
import { placeInWorld, readGlbBounds } from "./lib/glb.mts";
import { formatBytes, readJson, REPO_ROOT, saveBytes, writeJson } from "./lib/storage.mts";
import { createTripoClient } from "./lib/tripo.mts";

/**
 * Scale and position come from the world's own bounds, not from constants.
 * Tripo normalises every model to a unit bounding box, and Marble worlds are
 * not metric, so a hardcoded `scale: 1` put a rabbit two thirds the height of
 * the room's ceiling.
 */
async function place(world: World, glbPath: string) {
  const objectBounds = await readGlbBounds(glbPath);
  if (!world.bounds || !objectBounds) return null;
  return placeInWorld(world.bounds, objectBounds, { heightFraction: HEIGHT_FRACTION });
}

const DEFAULT_PROMPT = "a worn plush stuffed rabbit, well-loved, one ear flopped over";

// Low-poly is not optional: these load in a browser alongside a splat world.
const MODEL = "P1-20260311";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const prompt = arg("prompt") ?? DEFAULT_PROMPT;
const HEIGHT_FRACTION = Number(arg("height-fraction") ?? 0.14);
const scaleOverride = arg("scale") ? Number(arg("scale")) : undefined;
const positionOverride = arg("at")
  ? (arg("at")!.split(",").map(Number) as [number, number, number])
  : undefined;
const reposition = process.argv.includes("--reposition");

// Default to the newest generated world.
let worldId = arg("world-id");
if (!worldId) {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dir = join(process.cwd(), "public", "worlds");
  const entries = await readdir(dir).catch(() => [] as string[]);
  worldId = entries.at(-1);
}
if (!worldId) {
  throw new Error("No world found. Run `npm run world:generate` first.");
}

const world = await readJson<World>(`worlds/${worldId}`, "world.json");
if (!world) {
  throw new Error(
    `No world.json for ${worldId}. The splat export may have failed — check public/worlds/${worldId}/.`,
  );
}

// Re-place the objects already in this world, without generating anything.
// Placement is iterated far more often than meshes are, and regenerating a
// mesh to move it would burn credits for nothing.
if (reposition) {
  let changed = 0;
  for (const obj of world.objects ?? []) {
    const glbPath = join(REPO_ROOT, "public", obj.modelUrl.replace(/^\//, ""));
    const placement = await place(world, glbPath);
    if (!placement) {
      console.warn(`  ${obj.id}: no bounds available — left as is`);
      continue;
    }
    obj.position = placement.position;
    obj.scale = placement.scale;
    changed++;
    console.log(
      `  ${obj.id}: scale ${placement.scale.toFixed(3)} at [${placement.position.map((n) => n.toFixed(2)).join(", ")}]`,
    );
  }
  await writeJson(`worlds/${worldId}`, "world.json", world);
  console.log(`
Repositioned ${changed} object(s) in world ${worldId}.`);
  process.exit(0);
}

const client = createTripoClient();

const balance = await client.getBalance();
if (!balance.balance) {
  throw new Error(
    `Tripo balance is 0 credits, so this generation would fail.\n` +
      `Top up or claim the free tier at platform.tripo3d.ai, then re-run.`,
  );
}
console.log(`Tripo balance: ${balance.balance} credits`);
console.log(`Prompt: ${prompt}`);

const started = Date.now();
const taskId = await client.textToModel({
  prompt,
  model: MODEL,
  smart_low_poly: true,
  texture: true,
});
console.log(`  task ${taskId}`);

const task = await client.waitForTask(taskId, {
  pollingIntervalMs: 5_000,
  onProgress: (t) => console.log(`  ${t.status} ${t.progress ?? 0}%`),
});

// Download immediately - the URL is already dying.
const downloaded = await client.downloadModel(task);
if (!downloaded) {
  throw new Error(
    `Task ${taskId} finished with no downloadable model:\n${JSON.stringify(task.output, null, 2)}`,
  );
}

const asset = await saveBytes(`worlds/${worldId}`, `object-${taskId}.glb`, downloaded.data);
console.log(`  saved ${formatBytes(asset.bytes)} to ${asset.publicUrl}`);

const placement = await place(world, asset.path);
if (!placement) {
  console.warn("  No world or object bounds — falling back to a guessed placement.");
}
const position = positionOverride ?? placement?.position ?? [0, 0.5, -1.5];
const scale = scaleOverride ?? placement?.scale ?? 1;
console.log(`  scale ${scale.toFixed(3)} at [${position.map((n) => n.toFixed(2)).join(", ")}]`);

const object: GiftObject = {
  id: taskId,
  modelUrl: asset.publicUrl,
  position,
  scale,
  caption: prompt,
};

world.objects = [...(world.objects ?? []), object];
await writeJson(`worlds/${worldId}`, "world.json", world);

console.log(`\nPlaced in world ${worldId} at [${position.join(", ")}], scale ${scale}.`);
console.log(`Total ${Math.round((Date.now() - started) / 1000)}s.`);
console.log(
  `\nOrbit the camera so it passes behind and then in front of the desk.\n` +
    `Clean occlusion both ways is the whole point of the hybrid renderer.`,
);
