import { giftAssetPath, readGift, writeGift } from "@/lib/gifts";
import { writeBlobBytes } from "@/lib/providers/blob";

/**
 * Attach a recorded voice note to one object in a gift.
 *
 * The objects are the things the memory was made of; this is the sender
 * saying why. It is the one part of a gift that is not generated - Marble
 * makes the room and Tripo makes the pan, but only the person who sent it can
 * say what the pan was for.
 *
 * No login, by design: the link is the capability, exactly as it is for
 * opening the gift. Anyone who can open it could in principle record on it,
 * which is the same trade the rest of the product makes.
 */

export const dynamic = "force-dynamic";

/** Long enough for a sentence or two, short enough that nobody waits to hear it. */
const MAX_BYTES = 2_000_000;

/** What a browser's MediaRecorder actually produces, across engines. */
const TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
};

export async function POST(request: Request, ctx: RouteContext<"/api/gifts/[id]/voice">) {
  const { id } = await ctx.params;

  const gift = await readGift(id);
  if (!gift) return Response.json({ error: "No such gift." }, { status: 404 });
  if (!gift.world?.objects?.length) {
    return Response.json({ error: "This gift has nothing in it yet." }, { status: 409 });
  }

  const form = await request.formData();
  const objectId = String(form.get("objectId") ?? "");
  const audio = form.get("audio");

  const target = gift.world.objects.find((o) => o.id === objectId);
  if (!target) return Response.json({ error: "No such object." }, { status: 404 });

  if (!(audio instanceof Blob)) {
    return Response.json({ error: "No recording was sent." }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return Response.json({ error: "That recording is too long." }, { status: 413 });
  }

  // Strip any codec parameters: browsers send "audio/webm;codecs=opus".
  const mime = (audio.type || "audio/webm").split(";")[0].trim();
  const extension = TYPES[mime];
  if (!extension) {
    return Response.json({ error: `Unsupported audio type ${mime}.` }, { status: 415 });
  }

  // Named for the object, not for the recording, so a second take replaces the
  // first rather than leaving the old one orphaned in the store.
  const filename = `voice-${objectId}.${extension}`;
  const bytes = Buffer.from(await audio.arrayBuffer());
  await writeBlobBytes(giftAssetPath(gift.id, filename), bytes, mime);

  target.audioUrl = `/${giftAssetPath(gift.id, filename)}`;
  await writeGift(gift);

  return Response.json({ objectId, audioUrl: target.audioUrl, bytes: bytes.byteLength });
}
