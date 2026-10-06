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
 * Where to stand when the world opens.
 *
 * The origin, facing -Z, whenever the origin is inside the world. Marble
 * builds a world around the camera that captured it, so (0,0,0) is the
 * viewpoint the whole scene was reconstructed from - already at eye height,
 * already indoors, already facing the way the room was seen.
 *
 * The centre of the bounding box is *not* that. A collider includes everything
 * visible through a window, so the box can be far bigger than the room: two
 * generated gifts measured 13 and 11 units deep against a bedroom's 3.65. Both
 * put the camera outside the building looking up at the underside of a roof,
 * then falling, respawning at the same bad spot, and falling again.
 *
 * The box is only used when the origin really is outside it, which means the
 * world was built somewhere other than around its own camera.
 */
export function spawnFromBounds(b: GlbBounds): { spawn: Vec3; target: Vec3 } {
  const originInside = [0, 1, 2].every((i) => b.min[i] <= 0 && b.max[i] >= 0);

  if (originInside) {
    // -Z is the direction a three.js camera looks by default, and the
    // direction Marble's capture faced.
    return { spawn: [0, 0, 0], target: [0, 0, -Math.max(b.size[2] * 0.25, 0.5)] };
  }

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

/**
 * Where a gift's objects go, for worlds that are mostly window.
 *
 * `placeInWorld` above derives everything from the bounding box, which is only
 * safe in a tight interior like the hero bedroom. A Marble collider takes in
 * whatever is visible through a window or an open wall, so in the generated
 * gifts - 11 and 13 units deep against that bedroom's 3.65 - the box centre is
 * a point outdoors and its height is the height of the sky. Objects placed
 * from it land in the garden at the size of furniture.
 *
 * So this works from the origin instead, exactly as `spawnFromBounds` does.
 * Marble builds a world around the camera that captured it, which means the
 * origin is indoors, at eye height, on open floor that someone was standing on.
 *
 * Objects are laid in a shallow arc in front of that spot, so they are in view
 * the moment the gift opens rather than behind the visitor's head.
 */
export function placeObjects(
  world: { min: Vec3; max: Vec3 },
  objects: GlbBounds[],
  {
    heightFraction = 0.22,
    supported,
  }: {
    heightFraction?: number;
    supported?: { spawn: Vec3; floorY: number };
  } = {},
): Array<{ position: Vec3; scale: number }> {
  const floorY = supported?.floorY ?? world.min[1];
  const originInside = [0, 1, 2].every((i) => world.min[i] <= 0 && world.max[i] >= 0);

  // The drop from where the camera stood to the lowest geometry. In a world
  // that is mostly outdoors this is still the height of a person, where the
  // full box height would be the height of the sky.
  const eyeHeight = supported
    ? Math.max(supported.spawn[1] - supported.floorY, 1e-3)
    : originInside
    ? Math.max(-floorY, 1e-3)
    : Math.max((world.max[1] - floorY) * 0.65, 1e-3);

  const centreX = supported
    ? supported.spawn[0]
    : originInside
      ? 0
      : (world.min[0] + world.max[0]) / 2;
  const centreZ = supported
    ? supported.spawn[2]
    : originInside
      ? 0
      : (world.min[2] + world.max[2]) / 2;

  const count = objects.length;

  return objects.map((object, index) => {
    // Scale by the largest dimension, never by height.
    //
    // Tripo normalises the bounding *box*, not the height, so a flat object
    // has a tiny height and dividing by it inflates the thing enormously: a
    // frying pan came out at scale 1.06 - over a metre across - beside a
    // kerosene stove at 0.24, because the pan is wide and shallow. Largest
    // dimension is what "something you could pick up" actually means.
    const longest = Math.max(object.size[0], object.size[1], object.size[2]) || 1;
    // Roughly 0.22 of eye height is a 35cm object for a person.
    const scale = (eyeHeight * heightFraction) / longest;

    // Fan them across the view rather than stacking them on one spot. A single
    // object sits straight ahead; more spread out either side of it.
    const spread = count > 1 ? (index / (count - 1) - 0.5) * (Math.PI / 2) : 0;
    // -Z is the direction the capture faced, and the way the player looks on
    // arrival.
    const dirX = Math.sin(spread);
    const dirZ = -Math.cos(spread);

    // How far out the arc sits: what the room allows, not what the arc wants.
    //
    // Asking unconditionally is what put the first four objects through the
    // back wall: the arc wanted 1.6 eye heights of clearance in a kitchen with
    // 1.07, so every one landed outside the collider and the room opened
    // empty. A room is not obliged to be deep in the direction it was
    // photographed from - this one is 5.5 units wide and 2.4 deep.
    const margin = (longest * scale) / 2 + eyeHeight * 0.15;
    const far = Math.min(eyeHeight * 2.1, reachWithin(world, centreX, centreZ, dirX, dirZ, margin));
    // Alternate near and far *within* that depth rather than at a fixed offset,
    // so the stagger survives in a shallow room instead of collapsing into a
    // flat row the moment the clamp binds.
    const distance = index % 2 === 1 ? far : far * 0.78;

    return {
      position: [
        centreX + dirX * distance,
        // The model is centred on its own origin, so lift it by its own
        // underside rather than burying it to the waist.
        floorY - object.min[1] * scale,
        centreZ + dirZ * distance,
      ] as Vec3,
      scale,
    };
  });
}

/**
 * How far a ray from the spawn can travel before it leaves the bounding box.
 *
 * A slab clip on X and Z only - height is handled by resting on the floor.
 * `margin` keeps the object clear of the surface rather than half-buried in
 * it, so it is the object's own half-width plus a little breathing room.
 *
 * Note what this does and does not promise. The bounding box is not the room:
 * a collider takes in whatever is visible through a window, so staying inside
 * the box does not guarantee staying indoors. But the box is a hard outer
 * limit, and clipping to it can only ever pull an object closer to the spawn,
 * never push it further out - so it fixes objects that were outside the world
 * without being able to create a new way to be outside the room.
 */
function reachWithin(
  world: { min: Vec3; max: Vec3 },
  fromX: number,
  fromZ: number,
  dirX: number,
  dirZ: number,
  margin: number,
): number {
  const limit = (from: number, dir: number, lo: number, hi: number) => {
    if (dir > 1e-6) return (hi - margin - from) / dir;
    if (dir < -1e-6) return (lo + margin - from) / dir;
    return Infinity;
  };

  return Math.max(
    0,
    Math.min(
      limit(fromX, dirX, world.min[0], world.max[0]),
      limit(fromZ, dirZ, world.min[2], world.max[2]),
    ),
  );
}
