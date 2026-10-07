/**
 * Curate a generated gift without regenerating its paid assets.
 *
 * Gaussian worlds occasionally need a tighter arrival frame than their
 * collider bounds imply. This changes only the gift manifest: no Marble or
 * Tripo job is started, and the default is a dry run.
 *
 *   npm run gift:tune -- WBRE2FTFGN --fov 50 --radius 1.25
 *   npm run gift:tune -- 1KAJZTJBK1 --target 0.45,-0.05,-2.01
 *   npm run gift:tune -- WBRE2FTFGN --scale-factor 0.72 --write
 *   npm run gift:tune -- WBRE2FTFGN --navigation look --yaw 22 --pitch 14 --write
 *   npm run gift:tune -- WBRE2FTFGN --flip-collider --spawn 0,0,0 --floor -0.59
 *   npm run gift:tune -- 1KAJZTJBK1 --positions "0,0,-2;0.2,0,-2" --write
 */

import { readGift, writeGift } from "../src/lib/gifts.ts";
import { marbleBounds } from "../src/lib/providers/collider.ts";

const id = process.argv[2];
if (!id || id.startsWith("--")) {
  console.error(
    "usage: tune-gift.mts <giftId> [--fov n] [--radius n] " +
      "[--navigation look|walk] [--yaw n] [--pitch n] " +
      "[--spawn x,y,z] [--floor n] [--target x,y,z] " +
      "[--positions x,y,z;x,y,z] [--scale-factor n] [--flip-collider] [--write]",
  );
  process.exit(1);
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function positive(name: string): number | undefined {
  const raw = option(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`--${name} must be a positive number, received ${raw}.`);
  }
  return value;
}

function finite(name: string): number | undefined {
  const raw = option(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`--${name} must be a number, received ${raw}.`);
  }
  return value;
}

function triple(name: string): [number, number, number] | undefined {
  const raw = option(name);
  if (raw === undefined) return undefined;
  const values = raw.split(",").map(Number);
  if (values.length !== 3 || !values.every(Number.isFinite)) {
    throw new Error(`--${name} must be x,y,z, received ${raw}.`);
  }
  return values as [number, number, number];
}

function triples(name: string): Array<[number, number, number]> | undefined {
  const raw = option(name);
  if (raw === undefined) return undefined;
  const values = raw.split(";").map((value) => value.split(",").map(Number));
  if (!values.length || values.some((value) => value.length !== 3 || !value.every(Number.isFinite))) {
    throw new Error(`--${name} must be x,y,z;x,y,z, received ${raw}.`);
  }
  return values as Array<[number, number, number]>;
}

const fov = positive("fov");
if (fov !== undefined && (fov < 35 || fov > 90)) {
  throw new Error("--fov must be between 35 and 90 degrees.");
}
const radius = positive("radius");
const navigation = option("navigation");
if (navigation !== undefined && navigation !== "look" && navigation !== "walk") {
  throw new Error("--navigation must be look or walk.");
}
const yaw = positive("yaw");
if (yaw !== undefined && (yaw < 5 || yaw > 90)) {
  throw new Error("--yaw must be between 5 and 90 degrees.");
}
const pitch = positive("pitch");
if (pitch !== undefined && (pitch < 5 || pitch > 60)) {
  throw new Error("--pitch must be between 5 and 60 degrees.");
}
const target = triple("target");
const spawn = triple("spawn");
const floor = finite("floor");
const positions = triples("positions");
const scaleFactor = positive("scale-factor");
const flipCollider = process.argv.includes("--flip-collider");
const shouldWrite = process.argv.includes("--write");

if (
  [fov, radius, navigation, yaw, pitch, target, spawn, floor, positions, scaleFactor].every(
    (value) => value === undefined,
  ) &&
  !flipCollider
) {
  throw new Error("Nothing to tune. Pass at least one tuning option.");
}

const gift = await readGift(id);
if (!gift?.world) throw new Error(`Gift ${id} has no finished world manifest.`);

const before = {
  cameraFov: gift.world.cameraFov,
  navigationMode: gift.world.navigationMode,
  viewYawDegrees: gift.world.viewYawDegrees,
  viewPitchDegrees: gift.world.viewPitchDegrees,
  explorationRadius: gift.world.explorationRadius,
  target: gift.world.target,
  spawn: gift.world.spawn,
  spawnFloorY: gift.world.spawnFloorY,
  colliderTransform: gift.world.colliderTransform,
  colliderFrame: gift.colliderFrame,
  bounds: gift.world.bounds,
  objectScales: gift.world.objects?.map((object) => ({
    id: object.id,
    caption: object.caption,
    scale: object.scale,
    position: object.position,
  })),
};

if (fov !== undefined) gift.world.cameraFov = fov;
if (radius !== undefined) gift.world.explorationRadius = radius;
if (navigation !== undefined) gift.world.navigationMode = navigation;
if (yaw !== undefined) gift.world.viewYawDegrees = yaw;
if (pitch !== undefined) gift.world.viewPitchDegrees = pitch;
if (target !== undefined) gift.world.target = target;
if (spawn !== undefined) gift.world.spawn = spawn;
if (floor !== undefined) gift.world.spawnFloorY = floor;
if (positions !== undefined) {
  const objects = gift.world.objects ?? [];
  if (positions.length !== objects.length) {
    throw new Error(
      `--positions supplied ${positions.length} positions for ${objects.length} objects.`,
    );
  }
  objects.forEach((object, index) => {
    object.position = positions[index];
  });
}
if (flipCollider && gift.world.colliderTransform !== "flip-x") {
  gift.world.colliderTransform = "flip-x";
  if (gift.world.bounds) gift.world.bounds = marbleBounds(gift.world.bounds);
  if (gift.bounds) gift.bounds = marbleBounds(gift.bounds);
}
if (gift.world.colliderTransform === "flip-x") gift.colliderFrame = "three";
if (scaleFactor !== undefined) {
  for (const object of gift.world.objects ?? []) {
    object.scale = (object.scale ?? 1) * scaleFactor;
  }
}

const after = {
  cameraFov: gift.world.cameraFov,
  navigationMode: gift.world.navigationMode,
  viewYawDegrees: gift.world.viewYawDegrees,
  viewPitchDegrees: gift.world.viewPitchDegrees,
  explorationRadius: gift.world.explorationRadius,
  target: gift.world.target,
  spawn: gift.world.spawn,
  spawnFloorY: gift.world.spawnFloorY,
  colliderTransform: gift.world.colliderTransform,
  colliderFrame: gift.colliderFrame,
  bounds: gift.world.bounds,
  objectScales: gift.world.objects?.map((object) => ({
    id: object.id,
    caption: object.caption,
    scale: object.scale,
    position: object.position,
  })),
};

console.log(JSON.stringify({ id, before, after }, null, 2));

if (shouldWrite) {
  await writeGift(gift);
  console.log(`\n${id}: wrote tuned manifest to R2.`);
} else {
  console.log("\ndry run only; pass --write to save these values.");
}
