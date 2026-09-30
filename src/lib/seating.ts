/**
 * Where an object should actually come to rest.
 *
 * Placement is computed on the server from bounding boxes alone, because that
 * is all the pipeline has. It has been wrong three times in three ways - the
 * objects outside the world, under the floor, then on top of the roof - and
 * each was a guess about geometry the server cannot see.
 *
 * The browser can see it: the BVH built for walking knows every surface. This
 * is the last step, run there, and it answers two questions the server cannot.
 *
 * **Which surface?** The lowest, not the first. A downward ray through a spot
 * tucked under a counter meets the countertop first, and resting on that puts
 * a kerosene stove in the air at shoulder height - measured at -0.168 against
 * a floor of -0.870.
 *
 * **Is this spot open floor?** How many surfaces lie below it. Exactly one
 * means open ground. More means it is under something, so the object is drawn
 * back toward the spawn until it is in the clear - which is where a person
 * would have set it down anyway.
 *
 * Kept separate from the viewer so the same code can be run against a
 * downloaded collider offline, rather than checked by looking at screenshots.
 */

export interface FloorInfo {
  /** The lowest surface below the point: the floor. */
  y: number;
  /** How many surfaces lie below it. One means open floor. */
  surfaces: number;
}

export type FloorQuery = (x: number, z: number) => FloorInfo | null;

export interface Seat {
  x: number;
  z: number;
  /** The floor height the object should rest its underside on. */
  y: number;
  /** How far it had to be pulled back to find open floor. */
  moved: number;
  /** False when even the spawn's own spot is obstructed. */
  clear: boolean;
}

export function seatOnFloor(
  query: FloorQuery,
  point: { x: number; z: number },
  spawn: { x: number; z: number },
  { steps = 10, pull = 0.12 }: { steps?: number; pull?: number } = {},
): Seat | null {
  let x = point.x;
  let z = point.z;
  let info = query(x, z);
  if (!info) return null;

  const startX = x;
  const startZ = z;

  // Walk back toward the spawn while the spot is under something. Never past
  // the spawn itself: an object at the visitor's feet is worse than one under
  // a counter, and the loop is bounded so a room with no clear floor at all
  // simply keeps its original spot.
  for (let i = 0; i < steps && info.surfaces > 1; i++) {
    x += (spawn.x - x) * pull;
    z += (spawn.z - z) * pull;
    const next = query(x, z);
    if (!next) break;
    info = next;
  }

  if (info.surfaces > 1) {
    // Nowhere clear on that line. Leave it where the server put it and rest it
    // on the floor rather than on the furniture above it.
    const original = query(startX, startZ);
    return original
      ? { x: startX, z: startZ, y: original.y, moved: 0, clear: false }
      : null;
  }

  return {
    x,
    z,
    y: info.y,
    moved: Math.hypot(x - startX, z - startZ),
    clear: true,
  };
}
