import type { World } from "./types";
import { deleteBlobs, listBlobs, readBlobJson, writeBlobJson } from "./providers/blob.ts";

/**
 * A gift: the thing a visitor makes and sends.
 *
 * Gifts live in Blob as `gifts/<id>.json`, beside the binaries they point at.
 * The committed `data/worlds/*.json` manifests are a different thing - those
 * are curated hero worlds, generated from this machine. Anything a visitor
 * makes lands here, because a deployment cannot write to its own repository.
 *
 * The document holds provider job ids, never transient status. Status is
 * computed by asking the providers, so a poll costs no writes and the document
 * changes only when the pipeline genuinely advances. That is what keeps a
 * blob store - with no transactions - safe for this.
 */

export type GiftStage =
  | "world_generating"
  | "world_mirroring"
  | "objects_generating"
  | "rigging"
  | "ready"
  | "failed";

export interface GiftObjectSpec {
  /** A couple of plain words, shown to the recipient. */
  name?: string;
  /** What to ask Tripo for. */
  prompt: string;
  taskId?: string;
  /** Our own URL, once mirrored. Never a provider URL. */
  modelUrl?: string;
  /**
   * The mesh's own bounding box, measured from the bytes as they were
   * mirrored. Kept so placement never has to download the model back out of
   * the store to find out how big it is.
   */
  meshBounds?: { min: [number, number, number]; max: [number, number, number] };
  /**
   * Rigging, for the one or two things in a gift that could be alive.
   *
   * Most of what a memory contains is a pan or a bowl, and Tripo will say so
   * when asked. `riggable` records that answer so it is asked once, not on
   * every tick for the rest of the gift's life.
   */
  riggable?: boolean;
  rigTaskId?: string;
  animateTaskId?: string;

  /** Creation attempts so far. Tripo rate-limits, and a retry is not a failure. */
  attempts?: number;
  error?: string;
}

export interface Gift {
  id: string;
  createdAt: string;
  stage: GiftStage;

  fromName?: string;
  toName?: string;
  /** What the sender wrote. Shown back to them while they wait. */
  memory?: string;

  /** The prompt actually sent to Marble. */
  worldPrompt: string;
  model: string;

  operationId?: string;
  worldId?: string;

  objects: GiftObjectSpec[];

  /**
   * Assets already copied into our storage, keyed by name ("splat-500k",
   * "collider"). Mirroring does one asset per tick and records it here, so a
   * failure or a timeout resumes rather than restarting - a full_res splat is
   * over 20 MB and re-downloading it on every retry is how the first attempt
   * blew past the function limit.
   */
  assets?: Record<string, string>;

  /** Measured from the collider once, then reused when the manifest is built. */
  bounds?: World["bounds"];

  /** The finished manifest, in the same shape the viewer already renders. */
  world?: World;

  /**
   * Whether this gift may appear in the constellation.
   *
   * Off unless the sender says otherwise. The memory box invites people to
   * write something true about one other person, and a good number of them
   * will - publishing that by default because a gallery looks better full is
   * not a trade this project gets to make on their behalf.
   *
   * The sender is asked once, after they have seen what was built, which is
   * the only moment they know what they would be sharing.
   */
  shared?: boolean;

  /**
   * A soft claim on the right to do work, so two drivers do not do it twice.
   *
   * There is no worker and no lock. Once the server keeps advancing a gift on
   * its own, a browser polling the same gift is a second driver - and two
   * drivers both looking at the same unstarted object will each create a Tripo
   * task for it, spending twice and keeping one of them.
   *
   * Best effort, not a guarantee: this is a field in a document on a store
   * that can serve a stale read, so two holders remain possible for a short
   * window. It narrows the race by a lot and costs one read.
   */
  leaseUntil?: string;
  leaseHolder?: string;

  /** Set when stage is "failed". Shown to the visitor rather than a blank screen. */
  error?: string;
}

const PREFIX = "gifts/";

export function giftPath(id: string): string {
  return `${PREFIX}${id}.json`;
}

/**
 * Short, unambiguous ids.
 *
 * A gift id goes in a URL someone reads out or types, so Crockford's alphabet:
 * no I, L, O or U, which kills the 1/l and 0/O confusions and any accidental
 * word. Ten characters is ~50 bits, far beyond guessing for a private link.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function newGiftId(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

export async function readGift(id: string): Promise<Gift | null> {
  return readBlobJson<Gift>(giftPath(id));
}

export async function writeGift(gift: Gift): Promise<void> {
  await writeBlobJson(giftPath(gift.id), gift);
}

/** Where a gift's assets live, so every stage agrees on the layout. */
export function giftAssetPath(id: string, filename: string): string {
  return `${PREFIX}${id}/${filename}`;
}

/** Human-readable progress. This is the copy a visitor actually reads. */
export function stageLabel(stage: GiftStage): string {
  switch (stage) {
    case "world_generating":
      return "building the place";
    case "world_mirroring":
      return "bringing it closer";
    case "objects_generating":
      return "finding the things that mattered";
    case "rigging":
      return "teaching one of them to move";
    case "ready":
      return "ready";
    case "failed":
      return "something went wrong";
  }
}

/** One card in the constellation. Everything it needs, and nothing private. */
export interface SharedCard {
  id: string;
  toName?: string;
  fromName?: string;
  thumbnailUrl?: string;
  createdAt: string;
}

/** Where a versioned index lives. Each write makes a new, never-cached name. */
const SHARED_PREFIX = "shared/";

/**
 * Read the newest shared index.
 *
 * Deliberately not "read N gift documents and filter". Those are fetched over
 * public URLs that an edge cache holds for a while, and two readers in
 * different places genuinely see different versions - which showed as a
 * gallery stuck at three cards while five gifts were shared.
 *
 * `list` is the store's own API and is strongly consistent, so the newest
 * index is found reliably. Its contents are then fetched from a URL that has
 * never existed before and so cannot be stale.
 */
export async function readSharedIndex(): Promise<SharedCard[]> {
  const files = await listBlobs(SHARED_PREFIX);
  const newest = files[0];
  if (!newest) return [];

  try {
    const res = await fetch(newest.url, { cache: "no-store" });
    if (!res.ok) return [];
    return (await res.json()) as SharedCard[];
  } catch {
    return [];
  }
}

/**
 * Replace the index, then remove the ones it supersedes.
 *
 * New name first, old names after: a reader between the two steps finds either
 * the new index or the old one, never nothing.
 */
export async function writeSharedIndex(cards: SharedCard[]): Promise<void> {
  const existing = await listBlobs(SHARED_PREFIX);

  await writeBlobJson(`${SHARED_PREFIX}index-${Date.now()}.json`, cards);

  const stale = existing.map((f) => f.pathname);
  if (stale.length) await deleteBlobs(stale);
}

/** Add or remove one gift from the index, keeping it newest-first. */
export async function setShared(gift: Gift, shared: boolean): Promise<void> {
  const cards = (await readSharedIndex()).filter((c) => c.id !== gift.id);

  if (shared) {
    cards.push({
      id: gift.id,
      toName: gift.toName,
      fromName: gift.fromName,
      thumbnailUrl: gift.world?.thumbnailUrl,
      createdAt: gift.createdAt,
    });
  }

  cards.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  await writeSharedIndex(cards);
}

/**
 * The gifts that may be shown publicly, newest first.
 *
 * Listing asks the store rather than keeping an index, for the same reason
 * mirroring does: an index is a second source of truth that can drift, and
 * `list` is strongly consistent. Only the documents are read - a gift's assets
 * live under the same prefix and are skipped by the `.json` suffix.
 */
export async function listSharedGifts(limit = 60): Promise<Gift[]> {
  const blobs = await listBlobs(PREFIX);
  const docs = blobs.filter((b) => b.pathname.endsWith(".json"));

  const gifts = await Promise.all(
    docs.slice(0, limit).map((b) => readBlobJson<Gift>(b.pathname).catch(() => null)),
  );

  return gifts
    .filter((gift): gift is Gift => Boolean(gift?.shared && gift.stage === "ready" && gift.world))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
