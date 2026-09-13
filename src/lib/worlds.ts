import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { World } from "./types";

/**
 * Server-side lookup of generated worlds.
 *
 * Worlds are mirrored to `public/worlds/<id>/` by `npm run world:generate`,
 * each with a `world.json` matching the World shape. They live outside the
 * repo (gitignored — they are large binaries), so the app has to tolerate
 * finding none at all.
 */

const WORLDS_DIR = join(process.cwd(), "public", "worlds");

/** The most recently generated world, or null if none exist yet. */
export async function loadLatestWorld(): Promise<World | null> {
  let entries: string[];
  try {
    entries = await readdir(WORLDS_DIR);
  } catch {
    return null; // No worlds generated yet - expected before the first run.
  }

  const candidates: Array<{ world: World; mtimeMs: number }> = [];

  for (const id of entries) {
    const manifest = join(WORLDS_DIR, id, "world.json");
    try {
      const [raw, stats] = await Promise.all([
        readFile(manifest, "utf8"),
        stat(manifest),
      ]);
      candidates.push({ world: JSON.parse(raw) as World, mtimeMs: stats.mtimeMs });
    } catch {
      // A directory mid-generation has no world.json yet. Skip it.
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].world;
}
