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

/**
 * Just enough of the glTF JSON chunk to find POSITION bounds. The format
 * guarantees accessor min/max exist, so no mesh data is ever decoded.
 */
interface Gltf {
  accessors?: Array<{ count?: number; min?: number[]; max?: number[] }>;
  meshes?: Array<{
    primitives?: Array<{ attributes?: Record<string, number>; indices?: number }>;
  }>;
}

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
  return parseGlbBounds(await readFile(path));
}

/**
 * The same measurement, from bytes rather than a path.
 *
 * The runtime pipeline never has a file: it streams a collider from Marble
 * straight into Blob, and measures the bytes it already holds rather than
 * downloading its own copy back.
 */
export function parseGlbBounds(input: Uint8Array): GlbBounds | null {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf.length < 12 || buf.readUInt32LE(0) !== 0x46546c67) return null; // "glTF"

  let offset = 12;
  let gltf: Gltf | null = null;
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

/**
 * Where a generated object should sit inside a generated world.
 *
 * Tripo normalises every model to a unit bounding box, so scale 1 means "as
 * tall as one world unit" - in a room measuring 1.47 units floor to ceiling
 * that is a two-thirds-height rabbit. Neither the scale nor the height can be
 * a constant: both depend on the world, which is why they are computed.
 *
 * `heightFraction` is the object's height as a share of the room's height.
 * 0.14 reads as a small keepsake on the floor; raise it for furniture-sized
 * things.
 */
export function placeInWorld(
  world: { min: Vec3; max: Vec3 },
  object: GlbBounds,
  { heightFraction = 0.14 }: { heightFraction?: number } = {},
): { position: Vec3; scale: number } {
  const roomHeight = world.max[1] - world.min[1];
  const objectHeight = object.size[1] || 1;
  const scale = (roomHeight * heightFraction) / objectHeight;

  // Rest it on the floor: the model is centred on its own origin, so lift it
  // by half its scaled height rather than burying it to the waist.
  const floorY = world.min[1];
  const restY = floorY - object.min[1] * scale;

  return {
    position: [
      (world.min[0] + world.max[0]) / 2,
      restY,
      (world.min[2] + world.max[2]) / 2,
    ],
    scale,
  };
}
