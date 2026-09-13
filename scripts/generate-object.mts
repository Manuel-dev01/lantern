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

import type { GiftObject, World } from "../src/lib/types.ts";
import { formatBytes, readJson, saveBytes, writeJson } from "./lib/storage.mts";
import { createTripoClient } from "./lib/tripo.mts";

const DEFAULT_PROMPT = "a worn plush stuffed rabbit, well-loved, one ear flopped over";

// Low-poly is not optional: these load in a browser alongside a splat world.
const MODEL = "P1-20260311";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const prompt = arg("prompt") ?? DEFAULT_PROMPT;
const scale = Number(arg("scale") ?? 1);
const position = (arg("at") ?? "0,0.5,-1.5")
  .split(",")
  .map(Number) as [number, number, number];

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
