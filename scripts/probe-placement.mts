/**
 * Ask the collider where a gift's objects actually land.
 *
 * Placement has now been wrong three times in three different ways - outside
 * the world, under the floor, on top of the roof - and each time it was
 * diagnosed by staring at a screenshot. This reads the answer out of the
 * collider instead: for each object, what a downward ray from the spawn hits,
 * how far that is above the floor, and whether the object is standing on open
 * ground or on top of the furniture it was meant to sit beside.
 *
 *   node --env-file=.env scripts/probe-placement.mts <giftId> <collider.glb>
 */

import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshBVH } from "three-mesh-bvh";

import { readGift } from "../src/lib/gifts.ts";
import { mergeSceneGeometry } from "../src/lib/firstPerson.ts";
import { seatOnFloor } from "../src/lib/seating.ts";

const id = process.argv[2];
const path = process.argv[3];
if (!id || !path) {
  console.error("usage: probe-placement.mts <giftId> <collider.glb>");
  process.exit(1);
}

const gift = await readGift(id);
if (!gift?.world || !gift.bounds) throw new Error(`No world on ${id}.`);

const bytes = await readFile(path);
const gltf = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  "",
);

const merged = mergeSceneGeometry(gltf.scene);
if (!merged) throw new Error("collider had no meshes.");
const bvh = new MeshBVH(merged);

const spawnY = gift.world.spawn?.[1] ?? 0;

/** Every surface under a point, not just the first. */
function hitsBelow(x: number, z: number, from: number): number[] {
  const mesh = new THREE.Mesh(merged!);
  mesh.geometry.boundsTree = bvh;
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(x, from, z),
    new THREE.Vector3(0, -1, 0),
  );
  raycaster.firstHitOnly = false;
  const hits: THREE.Intersection[] = [];
  bvh.raycast(raycaster.ray, THREE.DoubleSide).forEach((h) => hits.push(h));
  return hits.map((h) => h.point.y).sort((a, b) => b - a);
}

console.log(`spawn y        : ${spawnY.toFixed(3)}`);
console.log(`bounds min y   : ${gift.bounds.min[1].toFixed(3)}`);
console.log(`bounds max y   : ${gift.bounds.max[1].toFixed(3)}`);

const atSpawn = hitsBelow(0, 0, spawnY);
console.log(`floor at spawn : ${atSpawn.length ? atSpawn[0].toFixed(3) : "none"}  (all: ${atSpawn.map((v) => v.toFixed(2)).join(", ")})`);
console.log();

// The viewer's own seating rule, run here against the real collider so the
// result is a number rather than an impression of a screenshot.
const spawnXZ = { x: gift.world.spawn?.[0] ?? 0, z: gift.world.spawn?.[2] ?? 0 };
const query = (x: number, z: number) => {
  const below = hitsBelow(x, z, spawnY);
  return below.length ? { y: below[below.length - 1], surfaces: below.length } : null;
};

console.log("--- seatOnFloor, as the browser will run it ---");
for (const o of gift.world.objects ?? []) {
  const seat = seatOnFloor(query, { x: o.position[0], z: o.position[2] }, spawnXZ);
  console.log(
    `${(o.caption ?? "?").padEnd(26)} ` +
      (seat
        ? `-> ${seat.x.toFixed(2)},${seat.z.toFixed(2)} floor ${seat.y.toFixed(3)} ` +
          `moved ${seat.moved.toFixed(2)} ${seat.clear ? "open floor" : "STILL OBSTRUCTED"}`
        : "no floor found"),
  );
}
console.log();

for (const o of gift.world.objects ?? []) {
  const [x, y, z] = o.position;
  const below = hitsBelow(x, z, spawnY);
  const top = below.length ? below[0] : null;
  const floor = below.length ? below[below.length - 1] : null;
  console.log(
    `${(o.caption ?? "?").padEnd(26)} at ${x.toFixed(2)},${z.toFixed(2)}\n` +
      `   server y   ${y.toFixed(3)}\n` +
      `   first hit  ${top === null ? "none" : top.toFixed(3)}  <- what restOnFloor uses\n` +
      `   lowest     ${floor === null ? "none" : floor.toFixed(3)}  <- the actual floor\n` +
      `   surfaces   ${below.length}  (${below.map((v) => v.toFixed(2)).join(", ")})`,
  );
}
