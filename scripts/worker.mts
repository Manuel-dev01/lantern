/**
 * The worker Lantern did not have.
 *
 * The pipeline is driven by whoever polls `tick`. That was the sender's
 * browser, which means a closed tab left a gift stopped half-built with the
 * credits already spent on it. The app now carries a gift on for a while by
 * itself, but a serverless function cannot outlive its own invocation, so the
 * guarantee has to live somewhere that stays running.
 *
 * This is that process: a loop that asks the store what is unfinished and
 * drives it, for ever. It is the same work `gift:drive` does by hand, with no
 * end and no operator.
 *
 * It deliberately holds no state. Everything it needs is in Blob, so it can be
 * killed and restarted at any moment, and running two of it is wasteful but
 * not harmful - the pipeline takes work under a lease.
 *
 *   BLOB_READ_WRITE_TOKEN=... LANTERN_BASE_URL=... node scripts/worker.mts
 */

import { listBlobs, readBlobJson } from "../src/lib/providers/storage.ts";
import type { Gift } from "../src/lib/gifts.ts";

const BASE = process.env.LANTERN_BASE_URL ?? "https://lantern-manuel-dev01s-projects.vercel.app";

/** How often to ask what needs doing when there is nothing to do. */
const IDLE_MS = 30_000;
/** How often to tick a gift that is actively building. */
const BUSY_MS = 4_000;

function log(message: string): void {
  console.log(`${new Date().toISOString()}  ${message}`);
}

async function unfinished(): Promise<string[]> {
  const docs = (await listBlobs("gifts/")).filter((b) => b.pathname.endsWith(".json"));
  const ids: string[] = [];

  for (const doc of docs) {
    const gift = await readBlobJson<Gift>(doc.pathname);
    if (!gift) continue;
    if (gift.stage !== "ready" && gift.stage !== "failed") ids.push(gift.id);
  }
  return ids;
}

async function tick(id: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/api/gifts/${id}/tick`, { method: "POST" });
    const data = (await res.json()) as { stage?: string; label?: string; busy?: boolean };
    return data.stage ?? null;
  } catch {
    // This runs on a network; a dropped request is normal and not a failure.
    return null;
  }
}

log(`worker up, driving ${BASE}`);

for (;;) {
  let ids: string[] = [];
  try {
    ids = await unfinished();
  } catch (err) {
    log(`could not list gifts: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!ids.length) {
    await new Promise((r) => setTimeout(r, IDLE_MS));
    continue;
  }

  log(`driving ${ids.length}: ${ids.join(", ")}`);

  const live = new Set(ids);
  while (live.size) {
    for (const id of [...live]) {
      const stage = await tick(id);
      if (stage === "ready" || stage === "failed") {
        log(`${id} ${stage}`);
        live.delete(id);
      }
    }
    await new Promise((r) => setTimeout(r, BUSY_MS));
  }
}
