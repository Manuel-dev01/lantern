/**
 * Rebuild the constellation index from the gift documents.
 *
 * The index is the gallery's source of truth, but the `shared` flag on each
 * gift is the record of what its sender actually chose. This walks every
 * document and rebuilds the index from those flags - for the gifts shared
 * before the index existed, and as the repair if the two ever disagree.
 *
 *   node --env-file=.env scripts/reindex-shared.mts
 */

import { listBlobs, readBlobJson } from "../src/lib/providers/blob.ts";
import { writeSharedIndex, type Gift, type SharedCard } from "../src/lib/gifts.ts";

const docs = (await listBlobs("gifts/")).filter((b) => b.pathname.endsWith(".json"));
const cards: SharedCard[] = [];

for (const doc of docs) {
  const gift = await readBlobJson<Gift>(doc.pathname);
  if (!gift?.shared || gift.stage !== "ready" || !gift.world) continue;

  cards.push({
    id: gift.id,
    toName: gift.toName,
    fromName: gift.fromName,
    thumbnailUrl: gift.world.thumbnailUrl,
    createdAt: gift.createdAt,
  });
  console.log(`  ${gift.id}  ${gift.toName ?? "someone"}`);
}

cards.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
await writeSharedIndex(cards);
console.log(`\nindexed ${cards.length}`);
