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

/** One surface a downward ray passed through. */
export interface Surface {
  y: number;
  /** True when the face points upward - something can be set down on it. */
  up: boolean;
}

export type SurfaceQuery = (x: number, z: number) => Surface[];

export interface Perch {
  x: number;
  z: number;
  /** The height the object's underside should sit at. */
  y: number;
  /** True when this is furniture rather than the floor. */
  raised: boolean;
}

/**
 * Somewhere to set a remembered thing down.
 *
 * Resting everything on the floor is correct and looks wrong: a frying pan and
 * a bowl on the floor of a kitchen read as dropped, not kept. Things belong on
 * the surfaces people put them on, and the collider knows where those are - a
 * countertop is an upward-facing surface with clear air above it, and that is
 * a definition this can actually test.
 *
 * Candidates are sampled along the direction the object was already given, so
 * the arrangement the server chose is preserved; only the height and the exact
 * spot change. Each candidate is checked at its corners too, so an object is
 * not perched half off the edge of a counter.
 *
 * Falls back to the floor, which is always a surface, so a world with no
 * furniture still works.
 */
export function findPerch(
  query: SurfaceQuery,
  spawn: { x: number; z: number; y: number },
  direction: { x: number; z: number },
  object: { height: number; radius: number },
  taken: Array<{ x: number; z: number }>,
  {
    near = 0.45,
    far = 2.4,
    steps = 14,
    sweep = Math.PI / 3,
    arcSteps = 11,
    spacing = 0.25,
    raisedBy = 0.15,
    preferFloor = false,
  }: {
    near?: number;
    far?: number;
    steps?: number;
    sweep?: number;
    arcSteps?: number;
    spacing?: number;
    raisedBy?: number;
    /** Big things belong on the floor. See the caller for where the line is. */
    preferFloor?: boolean;
  } = {},
): Perch | null {
  const target = (near + far) / 2;
  const facing = Math.atan2(direction.z, direction.x);

  let best: (Perch & { score: number }) | null = null;

  // Sweep either side of the direction the server chose rather than along it.
  // A counter runs across the view, not away from it, so searching one line
  // out from the spawn found the worktop for exactly one object in four.
  for (let a = 0; a < arcSteps; a++) {
    const turn = arcSteps === 1 ? 0 : (a / (arcSteps - 1) - 0.5) * 2 * sweep;
    const angle = facing + turn;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);

    for (let i = 0; i < steps; i++) {
      const distance = near + ((far - near) * i) / (steps - 1);
      const x = spawn.x + dx * distance;
      const z = spawn.z + dz * distance;

      const rest = restingHeight(query, x, z, spawn.y, object);
      if (!rest) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < spacing)) continue;

      const raised = rest.y - rest.floor > raisedBy;

      // A surface someone would actually put something on beats the floor,
      // and open floor beats the dark underneath of a cupboard - unless the
      // object is too big to have been lifted onto anything, in which case
      // the floor is where it would be.
      let score = raised
        ? preferFloor
          ? 0
          : 100
        : rest.surfaces === 1
          ? preferFloor
            ? 100
            : 50
          : 0;
      score += (rest.y - rest.floor) * (preferFloor ? -20 : 20);

      // On furniture, nearer is better; on the floor, mid-range is.
      //
      // Aiming for the middle of the search range drove everything to the far
      // edge of the worktop, hard against the wall, where a reconstruction
      // rounds the join upward and the object ends up a few centimetres proud
      // of the surface you can see. It is also not where anyone sets a bowl
      // down. The front of a counter is both the honest part of the mesh and
      // the natural place for a thing to be.
      score -= raised ? (distance - near) * 12 : Math.abs(distance - target) * 10;
      // All else equal, stay near the spot the server picked, so the objects
      // keep the spread they were given.
      score -= Math.abs(turn) * 6;

      if (!best || score > best.score) best = { x, z, y: rest.y, raised, score };
    }
  }

  return best ? { x: best.x, z: best.z, y: best.y, raised: best.raised } : null;
}

/**
 * The height an object would come to rest at over one spot, or null if it
 * cannot sit there.
 *
 * Takes the highest upward-facing surface below `reach` with room above it
 * for the object, and only accepts it if the object's whole footprint is
 * supported at roughly the same height - otherwise a bowl ends up hanging over
 * the edge of a counter with nothing under half of it.
 */
function restingHeight(
  query: SurfaceQuery,
  x: number,
  z: number,
  reach: number,
  object: { height: number; radius: number },
): { y: number; floor: number; surfaces: number } | null {
  const surfaces = query(x, z);
  if (!surfaces.length) return null;

  const sorted = [...surfaces].sort((a, b) => b.y - a.y);
  const floor = sorted[sorted.length - 1].y;

  for (const surface of sorted) {
    if (!surface.up) continue;

    // Must be something you could reach and see over, not the roof. The ray
    // starts above the building so that the real ceiling is known, which
    // means the roof itself is in this list and has to be excluded here.
    if (surface.y > reach - 0.05) continue;

    // What is directly above it, and so how much room the object has. Open
    // air if nothing is: measuring this against eye height instead was what
    // kept a 35 cm stove off a counter with a metre of space above it.
    // The nearest surface above, not the highest one.
    //
    // `sorted` runs downwards, so `find` returned the first thing it met from
    // the top - the roof - and every spot on a worktop was judged against the
    // ceiling. A counter tucked under a wall cabinet always looked like it had
    // metres of room, and objects were put in the gap.
    const above =
      [...sorted].reverse().find((s) => s.y > surface.y + 1e-4)?.y ?? Infinity;
    if (above - surface.y < object.height * 1.15) continue;

    // Mostly supported, not perfectly.
    //
    // A reconstructed worktop is a thin band - this kitchen's is about 0.2
    // deep with nothing behind its back edge - so insisting all four corners
    // be on it rejected every spot on the counter, and everything fell to the
    // floor. Three of four at a little over half the radius is the difference
    // between a bowl sitting near the edge, which is where bowls sit, and a
    // bowl balanced on air.
    const corners = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].filter((angle) => {
      const px = x + Math.cos(angle) * object.radius * 0.6;
      const pz = z + Math.sin(angle) * object.radius * 0.6;
      return query(px, pz).some((s) => s.up && Math.abs(s.y - surface.y) < 0.05);
    });
    if (corners.length < 3) continue;

    return { y: surface.y, floor, surfaces: sorted.length };
  }

  return null;
}

/** Which way to turn an object so it reads as the thing it is. */
export interface Orientation {
  /** The horizontal axis to bring up to vertical, laying a sliver down. */
  lay: "x" | "z" | null;
  /** Radians about Y, applied after any lay-down. */
  yaw: number;
}

/**
 * How extreme a sliver has to be before it is certainly standing wrong.
 *
 * Nothing in an object's bounds distinguishes a cup, which belongs upright,
 * from a key, which does not. So this only moves things too extreme to be
 * anything else: measured across fourteen real objects, 0.3 catches a brass
 * key at 0.127 and leaves the tin cup at 0.88, the hand broom at 0.96, the
 * wool scarf and the curling poster exactly as they are.
 */
const SLIVER = 0.3;

/**
 * Two faults, two rules, because one rule for both breaks whatever the other
 * fixes:
 *
 *   A. A flat sliver standing on its edge - a key balanced upright. Its thin
 *      axis is horizontal and its longest vertical. Lay it down.
 *   B. A long object pointing away from the visitor. Tripo puts plenty of
 *      them on Z, which is the direction the spawn faces, so a tray or a
 *      stool foreshortens into an unreadable blob. Turn the long side across
 *      the view rather than along it.
 *
 * Pure, and separate from the viewer, so the offline probe exercises the same
 * code the browser runs rather than a copy that can drift from it.
 */
export function orientFor(
  size: { x: number; y: number; z: number },
  at: { x: number; z: number },
  spawn: { x: number; z: number },
): Orientation {
  const smallest = Math.min(size.x, size.y, size.z);
  const largest = Math.max(size.x, size.y, size.z);

  const lay: Orientation["lay"] =
    size.y === largest && smallest !== size.y && smallest / largest < SLIVER
      ? smallest === size.x
        ? "x"
        : "z"
      : null;

  // What the footprint becomes once it is lying down: the laid axis trades
  // places with height.
  const flat =
    lay === "x"
      ? { x: size.y, z: size.z }
      : lay === "z"
        ? { x: size.x, z: size.y }
        : { x: size.x, z: size.z };

  // Square the long side across the line from the spawn, so the whole length
  // of the thing is visible instead of receding away from the visitor.
  const along = flat.x >= flat.z ? 0 : Math.PI / 2;
  const toObject = Math.atan2(at.z - spawn.z, at.x - spawn.x);

  // Three rotates the other way round from atan2.
  //
  // A +Y rotation by t maps local +X to (cos t, 0, -sin t), whose compass
  // angle is -t, while `toObject` is measured as atan2(dz, dx). Adding the
  // quarter turn instead of subtracting it only agrees on the axes, so an
  // object fanned out to either side had its long edge turned *along* the
  // line of sight - exactly the foreshortening this exists to prevent, and
  // invisible to the offline probe because it imports this same function.
  return { lay, yaw: along - toObject - Math.PI / 2 };
}
