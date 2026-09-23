import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { World } from "./types";

/**
 * Server-side lookup of generated worlds.
 *
 * Manifests live in `data/worlds/<id>.json` and are committed; the splats,
 * collider and object meshes they point at are not. Those are large binaries,
 * so they are kept out of git entirely - mirrored to `public/worlds/` for local
 * development, and uploaded to blob storage for anything deployed.
 *
 * That split is why the manifest is a separate file rather than living beside
 * its assets: the app needs to read it at build time and at request time, on a
 * machine that has never seen the binaries.
 */

const WORLDS_DIR = join(process.cwd(), "data", "worlds");

/** The most recently generated world, or null if none exist yet. */
export async function loadLatestWorld(): Promise<World | null> {
  const worlds = await loadWorlds();
  return worlds[0] ?? null;
}

export async function loadWorld(id: string): Promise<World | null> {
  try {
    const raw = await readFile(join(WORLDS_DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as World;
  } catch {
    return null;
  }
}

/** Every world, newest first. */
export async function loadWorlds(): Promise<World[]> {
  let entries: string[];
  try {
    entries = await readdir(WORLDS_DIR);
  } catch {
    return []; // No worlds generated yet - expected before the first run.
  }

  const found: Array<{ world: World; mtimeMs: number }> = [];

  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const path = join(WORLDS_DIR, name);
    try {
      const [raw, stats] = await Promise.all([readFile(path, "utf8"), stat(path)]);
      found.push({ world: JSON.parse(raw) as World, mtimeMs: stats.mtimeMs });
    } catch {
      // A half-written manifest is not worth crashing the page over.
    }
  }

  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found.map((f) => f.world);
}
