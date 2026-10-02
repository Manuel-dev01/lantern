/**
 * Rebuild an existing gift's objects, keeping its world.
 *
 * A world costs 1,580 Marble credits and five minutes; its objects cost 40
 * each. When something about object generation changes - the size budget, a
 * placement rule - throwing away a perfectly good world to test it is waste.
 *
 * This clears the object specs and runs the pipeline's own object stage over
 * them, so what it exercises is the real code path rather than a copy of it.
 *
 *   node --env-file=.env scripts/rebuild-objects.mts <giftId>
 */

import { advance } from "../src/lib/pipeline.ts";
import { readGift, writeGift, stageLabel } from "../src/lib/gifts.ts";
import { deleteBlobs, listBlobs } from "../src/lib/providers/storage.ts";

const id = process.argv[2];
if (!id) {
  console.error("usage: rebuild-objects.mts <giftId>");
  process.exit(1);
}

const gift = await readGift(id);
if (!gift) throw new Error(`No gift ${id}.`);
if (!gift.world) throw new Error(`Gift ${id} has no world to keep.`);

// What is on disk before anything is regenerated. Whatever of this the new
// run does not claim is dead weight, and is removed at the end.
const before = (await listBlobs(`gifts/${id}/`))
  .map((b) => b.pathname)
  .filter((p) => p.split("/").pop()!.startsWith("object-"));

for (const spec of gift.objects ?? []) {
  delete spec.taskId;
  delete spec.modelUrl;
  delete spec.meshBounds;
  delete spec.error;
  delete spec.attempts;
}
gift.world.objects = [];
gift.stage = "objects_generating";
delete gift.error;
await writeGift(gift);

console.log(`${id}: rebuilding ${(gift.objects ?? []).length} objects\n`);

let current = gift;
for (let tick = 0; tick < 400; tick++) {
  const { gift: next } = await advance(current);
  current = next;

  const done = (current.objects ?? []).filter((o) => o.modelUrl || o.error).length;
  process.stdout.write(
    `\r  ${stageLabel(current.stage)} — ${done}/${(current.objects ?? []).length}   `,
  );

  if (current.stage === "ready" || current.stage === "failed") break;
  await new Promise((r) => setTimeout(r, 3000));
}

console.log(`\n\nstage: ${current.stage}${current.error ? ` — ${current.error}` : ""}`);
for (const o of current.world?.objects ?? []) {
  console.log(`  ${(o.caption ?? "?").padEnd(26)} ${o.position.map((v) => v.toFixed(2)).join(", ")}`);
}
for (const spec of current.objects ?? []) {
  if (spec.error) console.log(`  FAILED ${spec.name}: ${spec.error}`);
}

// The previous models, now referenced by nothing. Left alone they accumulate
// with every rebuild - the first one stranded 10.4 MB.
const live = new Set(
  (current.objects ?? []).map((o) => o.modelUrl).filter(Boolean).map((u) => u!.replace(/^\//, "")),
);
const orphans = before.filter((p) => !live.has(p));

if (orphans.length) {
  await deleteBlobs(orphans);
  console.log(`
removed ${orphans.length} superseded object${orphans.length === 1 ? "" : "s"}`);
}
