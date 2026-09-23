/**
 * Upload a world's binaries to Vercel Blob and point its manifest at them.
 *
 *   npm run world:push                 # every world
 *   npm run world:push -- --world-id <id>
 *   npm run world:push -- --force      # re-upload even if already remote
 *
 * Why this exists: splats, collider meshes and object meshes are tens of
 * megabytes and would live in git history forever. They are gitignored, which
 * means a deployed build has the manifests but none of the files they name.
 * This moves the files somewhere the deployment can reach and rewrites the
 * manifest to absolute URLs, so `data/worlds/<id>.json` stays the single
 * source of truth in both places.
 *
 * Needs BLOB_READ_WRITE_TOKEN, which `vercel env pull` writes into .env.local
 * once a Blob store is attached to the project.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { put } from "@vercel/blob";

import type { World } from "../src/lib/types.ts";
import { requireEnv } from "./lib/env.mts";
import {
  formatBytes,
  listManifestIds,
  readManifest,
  REPO_ROOT,
  writeManifest,
} from "./lib/storage.mts";

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
    "  vercel link                            # connect this directory once",
    "  vercel blob store add lantern-assets",
    "  vercel env pull                        # writes .env.local, read here too",
  ].join("\n"),
);

const only = arg("world-id");
const ids = only ? [only] : await listManifestIds();

if (!ids.length) {
  throw new Error("No world manifests in data/worlds. Run `npm run world:generate` first.");
}

/** Local app-relative URLs are the ones that still need uploading. */
function isLocal(url: string | undefined): url is string {
  return Boolean(url && url.startsWith("/"));
}

async function upload(worldId: string, url: string): Promise<{ url: string; bytes: number }> {
  const path = join(REPO_ROOT, "public", url.replace(/^\//, ""));
  const data = await readFile(path);
  // addRandomSuffix off so re-uploading the same asset is idempotent rather
  // than leaving a trail of orphans in the store.
  const result = await put(`worlds/${worldId}/${url.split("/").pop()}`, data, {
    access: "public",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { url: result.url, bytes: data.byteLength };
}

for (const id of ids) {
  const world = await readManifest<World>(id);
  if (!world) {
    console.warn(`${id}: no manifest, skipping`);
    continue;
  }

  console.log(`\n${id}`);
  let changed = false;
  let totalBytes = 0;

  // Every asset the manifest names, in one list so objects are not forgotten.
  const slots: Array<{ label: string; get: () => string | undefined; set: (u: string) => void }> = [
    { label: "splat", get: () => world.splatUrl, set: (u) => (world.splatUrl = u) },
    { label: "collider", get: () => world.colliderUrl, set: (u) => (world.colliderUrl = u) },
    { label: "thumbnail", get: () => world.thumbnailUrl, set: (u) => (world.thumbnailUrl = u) },
  ];
  world.objects?.forEach((obj, i) => {
    slots.push({
      label: `object ${i}`,
      get: () => obj.modelUrl,
      set: (u) => (obj.modelUrl = u),
    });
  });

  for (const slot of slots) {
    const current = slot.get();
    if (!current) continue;
    if (!isLocal(current) && !force) {
      console.log(`  ${slot.label}: already remote`);
      continue;
    }
    // With --force, a remote URL has no local file to re-read; skip it.
    if (!isLocal(current)) {
      console.log(`  ${slot.label}: remote, no local copy to re-upload`);
      continue;
    }
    try {
      const { url, bytes } = await upload(id, current);
      slot.set(url);
      totalBytes += bytes;
      changed = true;
      console.log(`  ${slot.label}: ${formatBytes(bytes)} -> ${url}`);
    } catch (err) {
      console.error(`  ${slot.label}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  }

  if (changed) {
    await writeManifest(id, world);
    console.log(`  manifest rewritten (${formatBytes(totalBytes)} uploaded)`);
  } else {
    console.log("  nothing to upload");
  }
}

console.log(
  "\nCommit data/worlds/ so the deployment gets the new URLs. The binaries stay out of git.",
);
