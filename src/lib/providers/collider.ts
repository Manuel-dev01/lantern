import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshBVH } from "three-mesh-bvh";

import { findSupportedSpawn, mergeSceneGeometry } from "../firstPerson.ts";
import type { World } from "../types.ts";

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
  const geometry = mergeSceneGeometry(gltf.scene);
  if (!geometry) return null;

  return findSupportedSpawn(new MeshBVH(geometry), new THREE.Vector3().fromArray(seed), {
    minY: bounds.min[1],
    maxY: bounds.max[1],
  });
}
