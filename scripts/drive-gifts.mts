/**
 * Push every unfinished gift along until it is done.
 *
 * There is no worker: whoever is polling `tick` is what moves a gift forward.
 * That is fine while a sender has the page open, and it means a gift whose
 * only watcher went away - a closed tab, a seeding script that died - simply
 * stops, halfway built, with credits already spent on it.
 *
 * This is the safety net. It finds anything not ready or failed and ticks it
 * to the end, round-robin so one slow gift does not hold up the rest.
 *
 *   node --env-file=.env scripts/drive-gifts.mts
 */

import { listBlobs, readBlobJson } from "../src/lib/providers/blob.ts";
import type { Gift } from "../src/lib/gifts.ts";

const BASE = process.env.LANTERN_BASE_URL ?? "https://lantern-manuel-dev01s-projects.vercel.app";

const docs = (await listBlobs("gifts/")).filter((b) => b.pathname.endsWith(".json"));
const pending: string[] = [];

for (const doc of docs) {
  const gift = await readBlobJson<Gift>(doc.pathname);
  if (!gift) continue;
  if (gift.stage !== "ready" && gift.stage !== "failed") pending.push(gift.id);
}

if (!pending.length) {
  console.log("Nothing unfinished.");
  process.exit(0);
}

console.log(`driving ${pending.length}: ${pending.join(", ")}\n`);

const live = new Set(pending);
const began = Date.now();

for (let round = 0; round < 500 && live.size; round++) {
  for (const id of [...live]) {
    try {
      const res = await fetch(`${BASE}/api/gifts/${id}/tick`, { method: "POST" });
      const data = (await res.json()) as {
        stage?: string;
        label?: string;
        objectsDone?: number;
        objectsTotal?: number;
        error?: string;
      };

      if (data.stage === "ready" || data.stage === "failed") {
        console.log(`\n${id} ${data.stage}${data.error ? ` — ${data.error}` : ""}`);
        live.delete(id);
        continue;
      }

      const count = data.objectsTotal ? ` ${data.objectsDone}/${data.objectsTotal}` : "";
      process.stdout.write(
        `\r${((Date.now() - began) / 60000).toFixed(1)}m  ${id} ${data.label ?? data.stage}${count}        `,
      );
    } catch {
      // This connection drops constantly. A failed poll is not a failed gift;
      // the next round tries again.
    }
  }
  await new Promise((r) => setTimeout(r, 4000));
}

console.log(`\ndone. still unfinished: ${live.size ? [...live].join(", ") : "none"}`);
