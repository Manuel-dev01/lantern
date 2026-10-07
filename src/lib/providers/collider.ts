import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshBVH } from "three-mesh-bvh";

import { findSupportedSpawn, mergeSceneGeometry } from "../firstPerson.ts";
import type { World } from "../types.ts";

/**
 * Put a Marble collider in the same Three.js frame as its splat.
 *
 * Both assets arrive Y-down and +Z-forward. The splat has always been rotated
 * 180° around X in the viewer, but the collider was left raw. That made the
 * source camera appear below its own floor, so the spawn repair moved visitors
 * away from Marble's clean capture viewpoint and into stretched edge data.
 */
export function alignMarbleCollider(root: THREE.Object3D): void {
  root.quaternion.premultiply(new THREE.Quaternion(1, 0, 0, 0));
  root.updateWorldMatrix(true, true);
}

/** Transform raw accessor bounds through the same 180° X rotation. */
export function marbleBounds(
  bounds: NonNullable<World["bounds"]>,
): NonNullable<World["bounds"]> {
  return {
    min: [bounds.min[0], -bounds.max[1], -bounds.max[2]],
    max: [bounds.max[0], -bounds.min[1], -bounds.min[2]],
  };
}

/** Measure a safe camera start from the collider triangles, not their box. */
export async function supportedSpawnFromGlb(
  input: Uint8Array,
  seed: [number, number, number],
  bounds: NonNullable<World["bounds"]>,
) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    "",
  );
  alignMarbleCollider(gltf.scene);
  const geometry = mergeSceneGeometry(gltf.scene);
  if (!geometry) return null;

  return findSupportedSpawn(new MeshBVH(geometry), new THREE.Vector3().fromArray(seed), {
    minY: bounds.min[1],
    maxY: bounds.max[1],
  });
}
