import type { World } from "./types";
import { readBlobJson, writeBlobJson } from "./providers/blob.ts";

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
    case "ready":
      return "ready";
    case "failed":
      return "something went wrong";
  }
}
