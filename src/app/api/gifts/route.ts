import { type Gift, newGiftId, writeGift } from "@/lib/gifts";
import { generateWorld } from "@/lib/providers/worldlabs.ts";

/**
 * Start a gift.
 *
 * Kicks off a Marble generation and writes the gift document, then returns
 * immediately - the world takes 27 seconds at draft and over five minutes at
 * full quality, and this request has 300. The client polls `tick` from here.
 *
 * Slice 1: the prompt is hardcoded. Slice 2 replaces this with the LLM turning
 * a visitor's answers into one.
 */

export const dynamic = "force-dynamic";

/**
 * Starting a generation is quick, but the Marble call itself can be slow to
 * acknowledge on a bad link.
 */
export const maxDuration = 300;

const PLACEHOLDER_PROMPT = `A child's bedroom at dusk in the early 2000s, seen from the doorway. Warm orange light from a bedside lamp, the rest of the room in blue shadow. A low bed with rumpled sheets on the left, a wooden desk under a half-curtained window on the right. Toys and books scattered across the carpet. Photographic, soft focus, nostalgic.`;

/**
 * Draft unless told otherwise.
 *
 * A draft is ~200 credits and 27 seconds; marble-1.1 is ~1,580 and 5m35s. At
 * 5,190 credits that is the difference between 25 gifts and three, so a
 * stranger trying the flow gets a draft and hero gifts are generated
 * deliberately.
 */
const DEFAULT_MODEL = "marble-1.0-draft";

export async function POST(request: Request) {
  let body: {
    prompt?: string;
    model?: string;
    fromName?: string;
    toName?: string;
    memory?: string;
  } = {};

  try {
    body = await request.json();
  } catch {
    // An empty body is fine - Slice 1 has defaults for everything.
  }

  const worldPrompt = body.prompt?.trim() || PLACEHOLDER_PROMPT;
  const model = body.model?.trim() || DEFAULT_MODEL;
  const id = newGiftId();

  try {
    const operation = await generateWorld({
      displayName: `Lantern gift ${id}`,
      model,
      textPrompt: worldPrompt,
    });

    const operationId = String(operation.operation_id ?? operation.name ?? "").replace(
      /^operations\//,
      "",
    );
    if (!operationId) {
      throw new Error(
        `Marble accepted the request but returned no operation id: ${JSON.stringify(operation)}`,
      );
    }

    const gift: Gift = {
      id,
      createdAt: new Date().toISOString(),
      stage: "world_generating",
      fromName: body.fromName?.trim() || undefined,
      toName: body.toName?.trim() || undefined,
      memory: body.memory?.trim() || undefined,
      worldPrompt,
      model,
      operationId,
      objects: [],
    };

    await writeGift(gift);

    return Response.json({ id, stage: gift.stage, url: `/g/${id}` }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Worth distinguishing: running out of credits is the most likely failure
    // here and looks nothing like a bug from the outside.
    return Response.json({ error: message }, { status: 502 });
  }
}
