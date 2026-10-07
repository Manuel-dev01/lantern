/**
 * Replay the browser's seating, exactly, offline.
 *
 * The viewer loads each object with GLTFLoader, sets position and scale, then
 * measures a world-space Box3 and drops the box's underside onto the floor.
 * The server, by contrast, measured bounds straight from the glTF POSITION
 * accessors - which ignore any transform on the nodes above the mesh.
 *
 * If those two disagree, an object rests correctly by one measurement and
 * hangs in the air by the other, and no amount of looking at a screenshot
 * will say which. This runs the real loader, the real seating rule and the
 * real Box3 against the real files, and prints the final underside height
 * next to the floor it is supposed to be touching.
 *
 *   node --env-file=.env scripts/probe-seating.mts <giftId> <collider.glb> <objDir>
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshBVH } from "three-mesh-bvh";

import { readGift } from "../src/lib/gifts.ts";
import { mergeSceneGeometry } from "../src/lib/firstPerson.ts";
import { alignMarbleCollider } from "../src/lib/providers/collider.ts";
import { findPerch, orientFor, restingHeight, seatOnFloor } from "../src/lib/seating.ts";

const [id, colliderPath, objDir] = process.argv.slice(2);
if (!id || !colliderPath || !objDir) {
  console.error("usage: probe-seating.mts <giftId> <collider.glb> <objDir>");
  process.exit(1);
}

const loader = new GLTFLoader();

async function load(path: string) {
  const b = await readFile(path);
  return loader.parseAsync(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    "",
  );
}

/**
 * The object's true local bounding box, transforms and all.
 *
 * GLTFLoader cannot run here - it reaches for `self` to decode textures - and
 * a texture has no bearing on where a bowl's underside is. This reads the
 * glTF JSON chunk directly and does what Box3.setFromObject does: take each
 * primitive's POSITION accessor box and push it through the world matrix of
 * the node holding it.
 *
 * That last part is the point. The server's own measurement reads the
 * accessors and stops, so a mesh parented under a transformed node is
 * measured in the wrong frame.
 */
function localBounds(bytes: Buffer): { box: THREE.Box3; transformed: boolean } {
  const json = JSON.parse(
    bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"),
  );

  const box = new THREE.Box3();
  let transformed = false;

  const walk = (index: number, parent: THREE.Matrix4) => {
    const node = json.nodes[index];
    const local = new THREE.Matrix4();

    if (node.matrix) {
      local.fromArray(node.matrix);
      transformed = true;
    } else {
      local.compose(
        new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]),
        new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
        new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]),
      );
      if (node.translation || node.rotation || node.scale) transformed = true;
    }

    const world = new THREE.Matrix4().multiplyMatrices(parent, local);

    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives ?? []) {
        const accessor = json.accessors?.[prim.attributes?.POSITION];
        if (!accessor?.min || !accessor?.max) continue;
        const primBox = new THREE.Box3(
          new THREE.Vector3().fromArray(accessor.min),
          new THREE.Vector3().fromArray(accessor.max),
        );
        box.union(primBox.applyMatrix4(world));
      }
    }

    for (const child of node.children ?? []) walk(child, world);
  };

  const scene = json.scenes?.[json.scene ?? 0];
  for (const root of scene?.nodes ?? []) walk(root, new THREE.Matrix4());

  return { box, transformed };
}

const gift = await readGift(id);
if (!gift?.world) throw new Error(`No world on ${id}.`);

const collider = await load(colliderPath);
if (gift.world.colliderTransform === "flip-x") alignMarbleCollider(collider.scene);
const merged = mergeSceneGeometry(collider.scene);
if (!merged) throw new Error("collider had no meshes.");
const bvh = new MeshBVH(merged);

const spawnY = gift.world.spawn?.[1] ?? 0;
const spawnXZ = { x: gift.world.spawn?.[0] ?? 0, z: gift.world.spawn?.[2] ?? 0 };

const overhead = (gift.bounds?.max[1] ?? spawnY) + 1;

const raw = (x: number, z: number, from = spawnY) =>
  bvh.raycast(
    new THREE.Ray(new THREE.Vector3(x, from, z), new THREE.Vector3(0, -1, 0)),
    THREE.DoubleSide,
  );

const query = (x: number, z: number) => {
  const hits = raw(x, z);
  if (!hits.length) return null;
  let lowest = Infinity;
  for (const h of hits) lowest = Math.min(lowest, h.point.y);
  return { y: lowest, surfaces: hits.length };
};

const surfaces = (x: number, z: number) =>
  raw(x, z, overhead).map((h) => ({ y: h.point.y, up: Math.abs(h.face?.normal.y ?? 0) > 0.35 }));

// Does the collider actually distinguish a countertop from a wall? If the
// winding is inconsistent this returns nothing upward-facing and every object
// silently falls back to the floor.
{
  const probe = surfaces(0.77, -0.77);
  console.log(
    `surfaces under the old stove spot: ` +
      probe.map((p) => `${p.y.toFixed(2)}${p.up ? " up" : " down"}`).join(", ") || "none",
  );
  const anyUp = surfaces(0, 0).some((p) => p.up);
  console.log(`floor under spawn reads upward-facing: ${anyUp}`);
  for (const object of gift.world.objects ?? []) {
    const [x, , z] = object.position;
    console.log(
      `${(object.caption ?? "?").padEnd(26)} original surfaces: ` +
        (raw(x, z, overhead)
          .map(
            (hit) =>
              `${hit.point.y.toFixed(2)} normalY=${(hit.face?.normal.y ?? 0).toFixed(2)}`,
          )
          .join(", ") || "none"),
    );
  }
  console.log();
}

const picked: Array<{ x: number; z: number }> = [];

for (const o of gift.world.objects ?? []) {
  const name = o.modelUrl.split("/").pop()!;
  const { box: local, transformed } = localBounds(await readFile(join(objDir, name)));

  const node = new THREE.Object3D();
  const carrier = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  carrier.geometry.boundingBox = local.clone();
  carrier.geometry.boundingSphere = local.getBoundingSphere(new THREE.Sphere());
  node.add(carrier);

  node.position.fromArray(o.position);
  node.scale.setScalar(o.scale ?? 1);

  // Apply the viewer's orientation before measuring the seating footprint.
  // Measuring first hid failures for thin objects: once a lighter is laid
  // down, its long side becomes part of the support area.
  node.rotation.set(0, o.rotationY ?? 0, 0);
  const unturned = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3());
  const orient = orientFor(unturned, { x: o.position[0], z: o.position[2] }, spawnXZ);
  if (orient.lay) {
    const axis = orient.lay === "x" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    node.rotateOnWorldAxis(axis, Math.PI / 2);
  }
  node.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), orient.yaw);
  const dim = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3());
  const seatedHeight = dim.y;

  // What the server thought this mesh measured, from the raw accessors.
  const spec = (gift.objects ?? []).find((s) => s.modelUrl === o.modelUrl);
  const accessorMinY = spec?.meshBounds ? spec.meshBounds.min[1] * (o.scale ?? 1) : NaN;
  const eyeHeight = Math.max(
    spawnY - (gift.world.spawnFloorY ?? gift.bounds?.min[1] ?? 0),
    1e-3,
  );

  const object = { height: seatedHeight, radius: Math.max(dim.x, dim.z) * 0.5 };
  const spacing = gift.world.placementSpacing ?? 0.25;
  let perch = null as ReturnType<typeof findPerch>;

  if (gift.world.curatedPlacement) {
    const [x, , z] = o.position;
    const rest = restingHeight(surfaces, x, z, spawnY, object);
    if (rest && !picked.some((spot) => Math.hypot(spot.x - x, spot.z - z) < spacing)) {
      perch = { x, z, y: rest.y, raised: rest.y - rest.floor > 0.15 };
    }
  }

  perch ??= findPerch(
    surfaces,
    { ...spawnXZ, y: spawnY },
    (() => {
      let dx = o.position[0] - spawnXZ.x;
      let dz = o.position[2] - spawnXZ.z;
      const l = Math.hypot(dx, dz) || 1;
      return { x: dx / l, z: dz / l };
    })(),
    object,
    picked,
    {
      preferFloor:
        gift.world.placementMode === "floor" || seatedHeight > eyeHeight * 0.3,
      spacing,
    },
  );
  if (perch) picked.push({ x: perch.x, z: perch.z });

  const seat = perch
    ? { x: perch.x, z: perch.z, y: perch.y, moved: 0, clear: true, raised: perch.raised }
    : seatOnFloor(query, { x: o.position[0], z: o.position[2] }, spawnXZ);
  if (!seat) {
    console.log(`${(o.caption ?? name).padEnd(26)} NO SEAT (query returned null)`);
    continue;
  }

  node.position.x = seat.x;
  node.position.z = seat.z;

  const before = new THREE.Box3().setFromObject(node);
  node.position.y += seat.y - before.min.y;
  const after = new THREE.Box3().setFromObject(node);

  console.log(
    `${(o.caption ?? name).padEnd(26)}\n` +
      `   turn              lay=${orient.lay ?? "none"} yaw=${((orient.yaw * 180) / Math.PI).toFixed(0)}deg   height ${seatedHeight.toFixed(3)} of eye ${eyeHeight.toFixed(2)}\n` +
      `   scaled bounds      ${dim.x.toFixed(3)} x ${dim.y.toFixed(3)} x ${dim.z.toFixed(3)}\n` +
      `   rests at          ${seat.y.toFixed(3)}  ${perch ? (perch.raised ? "ON FURNITURE" : "on the floor") : "floor fallback"}${perch ? ` at ${perch.x.toFixed(8)},${perch.z.toFixed(8)}` : ""}\n` +
      `   true min.y*scale   ${(local.min.y * (o.scale ?? 1)).toFixed(3)}   accessor min.y*scale ${accessorMinY.toFixed(3)}${transformed ? "  <- node transforms present" : ""}\n` +
      `   Box3 min.y before  ${before.min.y.toFixed(3)}\n` +
      `   final underside    ${after.min.y.toFixed(3)}   gap to floor ${(after.min.y - seat.y).toFixed(4)}\n` +
      `   final top          ${after.max.y.toFixed(3)}   height ${(after.max.y - after.min.y).toFixed(3)}`,
  );
}
