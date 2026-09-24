/**
 * Upload a world's binaries to Vercel Blob.
 *
 *   npm run world:push                 # every world
 *   npm run world:push -- --world-id <id>
 *   npm run world:push -- --force      # re-upload even if already in the store
 *
 * Why this exists: splats, collider meshes and object meshes are tens of
 * megabytes and would live in git history forever. They are gitignored, which
 * means a deployed build has the manifests but none of the files they name.
 * This uploads the files to somewhere the deployment can reach.
 *
 * Manifests are deliberately NOT rewritten. They keep relative
 * `/worlds/<id>/<file>` paths, and vercel.ts rewrites that prefix onto the Blob
 * store in production. Pointing them at absolute Blob URLs instead would make
 * every local page load pull ~10 MB back over the internet, and would put Spark
 * cross-origin - where its Range requests trigger a preflight that the Blob
 * host answers with 405, and the world fails with only "network error".
 *
 * Needs BLOB_READ_WRITE_TOKEN, which `vercel env pull` writes into .env.local
 * once a Blob store is attached to the project.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { list, put } from "@vercel/blob";

import type { World } from "../src/lib/types.ts";
import { requireEnv } from "./lib/env.mts";
import { formatBytes, listManifestIds, readManifest, REPO_ROOT } from "./lib/storage.mts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const force = process.argv.includes("--force");
const token = requireEnv(
  "BLOB_READ_WRITE_TOKEN",
  [
    "This comes from the Blob store attached to the Vercel project, not from",
    "hand-editing .env. Run:",
    "  vercel link                              # connect this directory once",
    "  vercel blob create-store lantern-assets --access public --yes",
    "  vercel env pull                          # writes .env.local, read here too",
  ].join("\n"),
);

const only = arg("world-id");
const ids = only ? [only] : await listManifestIds();

if (!ids.length) {
  throw new Error("No world manifests in data/worlds. Run `npm run world:generate` first.");
}

/** Every asset path a manifest names. Relative paths are the ones we host. */
function assetPaths(world: World): string[] {
  const paths = [world.splatUrl, world.colliderUrl, world.thumbnailUrl];
  // Every mirrored level of detail, not just the default one - a phone asks
  // for a smaller splat than the desktop default and it has to be there.
  for (const url of Object.values(world.splatLods ?? {})) paths.push(url);
  for (const obj of world.objects ?? []) paths.push(obj.modelUrl);
  // The default level usually also appears in splatLods.
  return [...new Set(paths.filter((p): p is string => Boolean(p && p.startsWith("/"))))];
}

let uploaded = 0;
let skipped = 0;

for (const id of ids) {
  const world = await readManifest<World>(id);
  if (!world) {
    console.warn(`${id}: no manifest, skipping`);
    continue;
  }

  console.log(`\n${id}`);

  const prefix = `worlds/${id}/`;
  // One listing per world, so an unchanged re-run costs a single request
  // instead of re-uploading megabytes over a slow link.
  const existing = new Set<string>();
  if (!force) {
    try {
      const { blobs } = await list({ prefix, token });
      for (const blob of blobs) existing.add(blob.pathname);
    } catch (err) {
      console.warn(`  could not list existing blobs: ${err instanceof Error ? err.message : err}`);
    }
  }

  for (const relative of assetPaths(world)) {
    const filename = relative.split("/").pop()!;
    const pathname = prefix + filename;

    if (existing.has(pathname)) {
      console.log(`  ${filename}: already in the store`);
      skipped++;
      continue;
    }

    try {
      const data = await readFile(join(REPO_ROOT, "public", relative.replace(/^\//, "")));
      // A fixed pathname rather than a random suffix, so re-uploading replaces
      // the file instead of leaving orphans behind.
      await put(pathname, data, {
        access: "public",
        token,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      uploaded++;
      console.log(`  ${filename}: ${formatBytes(data.byteLength)} uploaded`);
    } catch (err) {
      console.error(`  ${filename}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  }
}

console.log(`\n${uploaded} uploaded, ${skipped} already present.`);
console.log("Manifests are unchanged - they stay relative and vercel.ts maps them to the store.");
