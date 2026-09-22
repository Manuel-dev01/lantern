/**
 * Minimal GLB inspector.
 *
 * Marble worlds arrive in an arbitrary scale and are not centred on the
 * origin, so a hardcoded camera position is meaningless: the first world put
 * `spawn: [0, 1.6, 3]` above the ceiling and behind the back wall. Reading the
 * real bounds out of the collider lets every world place its own camera.
 *
 * This parses the glTF JSON chunk and reads POSITION accessor min/max, which
 * the format requires to be present - no mesh data is decoded, so an 8 MB file
 * costs almost nothing to inspect.
 */

import { readFile } from "node:fs/promises";

const JSON_CHUNK = 0x4e4f534a;

export type Vec3 = [number, number, number];

export interface GlbBounds {
  min: Vec3;
  max: Vec3;
  size: Vec3;
  center: Vec3;
  vertices: number;
  triangles: number;
}

export async function readGlbBounds(path: string): Promise<GlbBounds | null> {
  const buf = await readFile(path);
  if (buf.length < 12 || buf.readUInt32LE(0) !== 0x46546c67) return null; // "glTF"

  let offset = 12;
  let gltf: Record<string, any> | null = null;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    if (type === JSON_CHUNK) {
      gltf = JSON.parse(buf.subarray(offset + 8, offset + 8 + length).toString("utf8"));
      break;
    }
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  if (!gltf) return null;

  const accessors = gltf.accessors ?? [];
  const positions = new Set<number>();
  let triangles = 0;

  for (const mesh of gltf.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.attributes?.POSITION !== undefined) positions.add(prim.attributes.POSITION);
      if (prim.indices !== undefined) triangles += (accessors[prim.indices]?.count ?? 0) / 3;
    }
  }

  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let vertices = 0;

  for (const index of positions) {
    const accessor = accessors[index];
    if (!accessor) continue;
    vertices += accessor.count ?? 0;
    for (let k = 0; k < 3; k++) {
      if (accessor.min) min[k] = Math.min(min[k], accessor.min[k]);
      if (accessor.max) max[k] = Math.max(max[k], accessor.max[k]);
    }
  }

  if (!Number.isFinite(min[0]) || !Number.isFinite(max[0])) return null;

  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    center: [(max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2],
    vertices,
    triangles: Math.round(triangles),
  };
}

/**
 * A camera position inside the world rather than outside it: centred
 * horizontally, at roughly standing eye height off the floor, set back toward
 * one end so the room is in front of you.
 */
export function spawnFromBounds(b: GlbBounds): { spawn: Vec3; target: Vec3 } {
  const floorY = b.min[1];
  return {
    spawn: [b.center[0], floorY + b.size[1] * 0.65, b.center[2] + b.size[2] * 0.35],
    target: [b.center[0], floorY + b.size[1] * 0.5, b.center[2]],
  };
}
