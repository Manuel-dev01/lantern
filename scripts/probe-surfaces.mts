/**
 * Find footprint-safe raised surfaces in a real Marble collider.
 *
 * Screenshots cannot tell whether a reconstructed table is represented in the
 * physics mesh. This probe uses the same coordinate transform and support
 * test as the viewer and prints places where a keepsake can actually rest.
 *
 *   npm run gift:surfaces -- <giftId> <collider.glb> [radius] [height]
 *   npm run gift:surfaces -- <giftId> <collider.glb> --screen x,y,width,height
 */

import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshBVH } from "three-mesh-bvh";

import { readGift } from "../src/lib/gifts.ts";
import { mergeSceneGeometry } from "../src/lib/firstPerson.ts";
import { alignMarbleCollider } from "../src/lib/providers/collider.ts";
import { restingHeight, type SurfaceQuery } from "../src/lib/seating.ts";

const [id, colliderPath, radiusArg = "0.1", heightArg = "0.18"] = process.argv.slice(2);
if (!id || !colliderPath) {
  console.error("usage: probe-surfaces.mts <giftId> <collider.glb> [radius] [height]");
  process.exit(1);
}

const gift = await readGift(id);
if (!gift?.world?.bounds) throw new Error(`No world on ${id}.`);

const bytes = await readFile(colliderPath);
const gltf = await new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  "",
);
if (gift.world.colliderTransform === "flip-x") alignMarbleCollider(gltf.scene);

const geometry = mergeSceneGeometry(gltf.scene);
if (!geometry) throw new Error("collider had no meshes.");
const bvh = new MeshBVH(geometry);

const bounds = gift.world.bounds;
const spawn = gift.world.spawn ?? [0, 0, 0];
const overhead = bounds.max[1] + 1;
const radius = Number(radiusArg);
const height = Number(heightArg);

const screenIndex = process.argv.indexOf("--screen");
if (screenIndex !== -1) {
  const screen = process.argv[screenIndex + 1]?.split(",").map(Number);
  if (!screen || screen.length !== 4 || !screen.every(Number.isFinite)) {
    throw new Error("--screen must be x,y,width,height.");
  }
  const [x, y, width, viewportHeight] = screen;
  if (width <= 0 || viewportHeight <= 0) throw new Error("screen dimensions must be positive.");
  const camera = new THREE.PerspectiveCamera(
    gift.world.cameraFov ?? 60,
    width / viewportHeight,
    0.01,
    1000,
  );
  camera.position.fromArray(spawn);
  camera.lookAt(new THREE.Vector3().fromArray(gift.world.target ?? [0, 0, -1]));
  camera.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(
    new THREE.Vector2((x / width) * 2 - 1, 1 - (y / viewportHeight) * 2),
    camera,
  );
  const hits = bvh.raycast(raycaster.ray, THREE.DoubleSide);
  console.log(`screen ${x},${y} collider hits: ${hits.length}`);
  for (const hit of hits.slice(0, 12)) {
    console.log(
      `${hit.point.x.toFixed(4)}, ${hit.point.y.toFixed(4)}, ${hit.point.z.toFixed(4)} ` +
        `distance ${hit.distance.toFixed(4)} normalY ${(hit.face?.normal.y ?? 0).toFixed(3)}`,
    );
  }
  process.exit(0);
}

const query: SurfaceQuery = (x, z) =>
  bvh
    .raycast(
      new THREE.Ray(new THREE.Vector3(x, overhead, z), new THREE.Vector3(0, -1, 0)),
      THREE.DoubleSide,
    )
    .map((hit) => ({
      y: hit.point.y,
      // Marble's reconstructed slabs do not have consistent winding; this is
      // intentionally the same absolute-normal test the viewer uses.
      up: Math.abs(hit.face?.normal.y ?? 0) > 0.35,
    }));

const candidates: Array<{ x: number; z: number; y: number; rise: number; distance: number }> = [];
const step = 0.08;
for (let x = bounds.min[0]; x <= bounds.max[0]; x += step) {
  for (let z = Math.max(bounds.min[2], spawn[2] - 3); z <= Math.min(bounds.max[2], spawn[2] + 3); z += step) {
    const rest = restingHeight(query, x, z, spawn[1], { radius, height });
    if (!rest || rest.y - rest.floor <= 0.15) continue;
    candidates.push({
      x,
      z,
      y: rest.y,
      rise: rest.y - rest.floor,
      distance: Math.hypot(x - spawn[0], z - spawn[2]),
    });
  }
}

candidates.sort((a, b) => a.distance - b.distance);
console.log(`safe raised candidates: ${candidates.length}`);
for (const point of candidates.slice(0, 80)) {
  console.log(
    `${point.x.toFixed(3)}, ${point.z.toFixed(3)} -> y ${point.y.toFixed(3)} ` +
      `(rise ${point.rise.toFixed(3)}, distance ${point.distance.toFixed(3)})`,
  );
}
