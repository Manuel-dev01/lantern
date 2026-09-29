/**
 * Re-place an existing gift's objects without rebuilding them.
 *
 * Placement is pure: it takes the world bounds and each mesh's own bounds,
 * both of which are already on the gift document, and returns positions. So a
 * placement bug can be repaired for gifts that already exist - the models stay
 * mirrored where they are, nothing is regenerated, and no Tripo credits are
 * spent re-making things that were fine.
 *
 * This exists because the first four objects were placed through the back
 * wall: the arc asked for more depth than the room had. Every gift made before
 * that fix needs this run over it.
 *
 *   node --env-file=.env scripts/replace-objects.mts <giftId>
 */

import { readGift, writeGift } from "../src/lib/gifts.ts";
import { placeObjects, type GlbBounds } from "../src/lib/providers/glb.ts";

const id = process.argv[2];
if (!id) {
  console.error("usage: replace-objects.mts <giftId>");
  process.exit(1);
}

const gift = await readGift(id);
if (!gift) throw new Error(`No gift ${id}.`);
if (!gift.world || !gift.bounds) throw new Error(`Gift ${id} has no world yet.`);

// Only objects that actually made it: mirrored, and measured at mirror time.
const specs = (gift.objects ?? []).filter((s) => s.modelUrl && s.meshBounds);
if (!specs.length) {
  console.log(`Gift ${id} has no placed objects. Nothing to do.`);
  process.exit(0);
}

/** The stored min/max, widened back into the shape the placer expects. */
const widen = (b: { min: [number, number, number]; max: [number, number, number] }): GlbBounds => ({
  min: b.min,
  max: b.max,
  size: [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]],
  center: [
    (b.min[0] + b.max[0]) / 2,
    (b.min[1] + b.max[1]) / 2,
    (b.min[2] + b.max[2]) / 2,
  ],
  vertices: 0,
  triangles: 0,
});

const before = gift.world.objects ?? [];
const placements = placeObjects(gift.bounds, specs.map((s) => widen(s.meshBounds!)));

gift.world.objects = specs.map((spec, i) => ({
  id: spec.taskId!,
  modelUrl: spec.modelUrl!,
  position: placements[i].position,
  scale: placements[i].scale,
  caption: spec.name ?? spec.prompt,
}));

const b = gift.bounds;
const inside = (p: readonly number[]) =>
  p[0] >= b.min[0] && p[0] <= b.max[0] && p[2] >= b.min[2] && p[2] <= b.max[2];

for (let i = 0; i < gift.world.objects.length; i++) {
  const now = gift.world.objects[i];
  const was = before.find((o) => o.id === now.id);
  const fmt = (p: readonly number[]) => p.map((v) => v.toFixed(2)).join(", ");
  console.log(
    `${(now.caption ?? "?").padEnd(26)} ${was ? fmt(was.position) : "(new)"}  ->  ${fmt(now.position)}  ${inside(now.position) ? "inside" : "OUTSIDE"}`,
  );
}

await writeGift(gift);
console.log(`\nRewrote ${id}.`);
