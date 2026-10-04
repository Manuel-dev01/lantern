/**
 * Put one world's splat into storage, for the landing page to stand in.
 *
 * Not the whole world: no collider and no objects. The hero is a backdrop
 * nobody walks through, so it needs the splat and nothing else - which is the
 * difference between a 4.8 MB upload and a 14 MB one.
 *
 *   node --env-file=.env scripts/push-hero.mts <worldId>
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeBlobBytes } from "../src/lib/providers/storage.ts";

const id = process.argv[2];
if (!id) {
  console.error("usage: push-hero.mts <worldId>");
  process.exit(1);
}

const dir = join(process.cwd(), "public", "worlds", id);

for (const file of ["splat-500k.spz", "thumbnail.webp"]) {
  const bytes = await readFile(join(dir, file));
  const type = file.endsWith(".webp") ? "image/webp" : "application/octet-stream";
  process.stdout.write(`${file} (${(bytes.length / 1e6).toFixed(1)} MB)… `);
  const { url } = await writeBlobBytes(`worlds/${id}/${file}`, bytes, type);
  console.log(`-> ${url}`);
}
