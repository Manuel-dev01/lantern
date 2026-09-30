/**
 * Generate one Tripo object and report what it actually weighs.
 *
 * The four objects in the first real gift came to 10.4 MB between them -
 * 2 to 3.5 MB each for things a visitor sees at about 35 cm across, beside a
 * splat world that is already 23 MB. `smart_low_poly` alone was clearly not
 * doing the work its name suggests.
 *
 * This exists so the settings that fix that are measured rather than assumed.
 * It generates a single object, downloads it, and prints the byte count; run
 * it with the same prompt twice under different flags to get an honest A/B.
 *
 *   node --env-file=.env scripts/probe-object-size.mts --prompt "..." \
 *     --face-limit 10000 --texture-quality standard --no-pbr
 */

import { createTripoClient } from "../src/lib/providers/tripo.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const prompt =
  arg("prompt") ??
  "A single blackened cast-iron frying pan with an oily sheen and scratched base, shown alone as a 3D object.";

const params: Record<string, unknown> = {
  prompt,
  model: arg("model") ?? "P1-20260311",
  smart_low_poly: !process.argv.includes("--no-low-poly"),
  texture: true,
};

if (arg("face-limit")) params.face_limit = Number(arg("face-limit"));
if (arg("texture-quality")) params.texture_quality = arg("texture-quality");
if (arg("compress")) params.compress = arg("compress");
if (process.argv.includes("--no-pbr")) params.pbr = false;
if (process.argv.includes("--pbr")) params.pbr = true;

console.log("params:", JSON.stringify(params, null, 1));

const client = createTripoClient();
const before = (await client.getBalance()).balance;

const taskId = await client.textToModel(params as never);
console.log(`task ${taskId} — polling`);

let task;
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  task = await client.getTask(taskId);
  process.stdout.write(`\r  ${task.status} ${task.progress ?? 0}%   `);
  if (["success", "failed", "cancelled", "banned", "expired", "unknown"].includes(task.status)) break;
}
console.log();

if (!task || task.status !== "success") {
  console.error(`ended as ${task?.status}: ${task?.error_msg ?? "no model"}`);
  process.exit(1);
}

const downloaded = await client.downloadModel(task);
if (!downloaded) throw new Error("finished with no downloadable model.");

const res = await fetch(downloaded.url);
const bytes = new Uint8Array(await res.arrayBuffer());

const after = (await client.getBalance()).balance;
console.log(`\nbytes   : ${bytes.length.toLocaleString()}`);
console.log(`credits : ${before - after}`);
