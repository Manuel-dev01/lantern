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
 */

import { readGift, writeGift } from "../src/lib/gifts.ts";

const id = process.argv[2];
if (!id || id.startsWith("--")) {
  console.error(
    "usage: tune-gift.mts <giftId> [--fov n] [--radius n] " +
      "[--target x,y,z] [--scale-factor n] [--write]",
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

function triple(name: string): [number, number, number] | undefined {
  const raw = option(name);
  if (raw === undefined) return undefined;
  const values = raw.split(",").map(Number);
  if (values.length !== 3 || !values.every(Number.isFinite)) {
    throw new Error(`--${name} must be x,y,z, received ${raw}.`);
  }
  return values as [number, number, number];
}

const fov = positive("fov");
if (fov !== undefined && (fov < 35 || fov > 90)) {
  throw new Error("--fov must be between 35 and 90 degrees.");
}
const radius = positive("radius");
const target = triple("target");
const scaleFactor = positive("scale-factor");
const shouldWrite = process.argv.includes("--write");

if ([fov, radius, target, scaleFactor].every((value) => value === undefined)) {
  throw new Error("Nothing to tune. Pass at least one tuning option.");
}

const gift = await readGift(id);
if (!gift?.world) throw new Error(`Gift ${id} has no finished world manifest.`);

const before = {
  cameraFov: gift.world.cameraFov,
  explorationRadius: gift.world.explorationRadius,
  target: gift.world.target,
  objectScales: gift.world.objects?.map((object) => ({
    id: object.id,
    caption: object.caption,
    scale: object.scale,
  })),
};

if (fov !== undefined) gift.world.cameraFov = fov;
if (radius !== undefined) gift.world.explorationRadius = radius;
if (target !== undefined) gift.world.target = target;
if (scaleFactor !== undefined) {
  for (const object of gift.world.objects ?? []) {
    object.scale = (object.scale ?? 1) * scaleFactor;
  }
}

const after = {
  cameraFov: gift.world.cameraFov,
  explorationRadius: gift.world.explorationRadius,
  target: gift.world.target,
  objectScales: gift.world.objects?.map((object) => ({
    id: object.id,
    caption: object.caption,
    scale: object.scale,
  })),
};

console.log(JSON.stringify({ id, before, after }, null, 2));

if (shouldWrite) {
  await writeGift(gift);
  console.log(`\n${id}: wrote tuned manifest to R2.`);
} else {
  console.log("\ndry run only; pass --write to save these values.");
}
