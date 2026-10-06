/**
 * Verify that a gift opens above a real, capsule-sized patch of collider.
 *
 *   npm run gift:spawn -- <giftId> <collider.glb>
 */

import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshBVH } from "three-mesh-bvh";

import { readGift } from "../src/lib/gifts.ts";
import { findSupportedSpawn, mergeSceneGeometry } from "../src/lib/firstPerson.ts";

const [giftId, colliderPath] = process.argv.slice(2);
if (!giftId || !colliderPath) {
  console.error("usage: probe-spawn.mts <giftId> <collider.glb>");
  process.exit(1);
}

const gift = await readGift(giftId);
if (!gift?.world) throw new Error(`No world on ${giftId}.`);

const bytes = await readFile(colliderPath);
const gltf = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  "",
);
const geometry = mergeSceneGeometry(gltf.scene);
if (!geometry) throw new Error("Collider had no meshes.");

const spawn = new THREE.Vector3().fromArray(gift.world.spawn ?? [0, 1.6, 3]);
const bounds = gift.world.bounds ?? gift.bounds;
const bvh = new MeshBVH(geometry);
const supported = findSupportedSpawn(bvh, spawn, {
  minY: bounds?.min[1] ?? spawn.y - 1,
  maxY: bounds?.max[1] ?? spawn.y + 1,
});

const overhead = (bounds?.max[1] ?? spawn.y) + 1;
const hits = bvh.raycast(
  new THREE.Ray(new THREE.Vector3(spawn.x, overhead, spawn.z), new THREE.Vector3(0, -1, 0)),
  THREE.DoubleSide,
);
console.log(
  `origin surfaces ${
    hits
      .map(
        (hit) =>
          `${hit.point.y.toFixed(3)} (normalY ${(hit.face?.normal.y ?? 0).toFixed(3)})`,
      )
      .join(", ") || "none"
  }`,
);

console.log(`saved spawn     ${spawn.toArray().map((value) => value.toFixed(3)).join(", ")}`);
if (!supported) {
  console.error("supported spawn none");
  process.exitCode = 1;
} else {
  console.log(
    `supported spawn ${supported.x.toFixed(3)}, ${supported.y.toFixed(3)}, ${supported.z.toFixed(3)}`,
  );
  console.log(`floor           ${supported.floorY.toFixed(3)}`);
  console.log(`eye height      ${supported.eyeHeight.toFixed(3)}`);
  console.log(`relocated       ${supported.distance.toFixed(3)}`);
}
