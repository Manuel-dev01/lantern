import { requireEnv } from "./providers/env.ts";
import { fetchWithRetry } from "./providers/net.ts";

/**
 * Turning a memory into a world.
 *
 * The sender writes a few sentences about a person and a place. This turns
 * that into one Marble prompt and a handful of objects for Tripo - the two
 * halves the rest of the pipeline needs.
 *
 * DeepSeek, because that is the key we have. Two things about it shape the
 * code, both found by probing rather than from docs:
 *
 *  - `response_format: {type: "json_schema"}` is rejected outright:
 *    "This response_format type is unavailable now". Only `json_object` works,
 *    so the shape is enforced here rather than by the API.
 *  - `deepseek-flash` is a reasoning model defaulting to high effort. A first
 *    attempt spent its entire 700-token budget on reasoning and returned an
 *    empty string. It needs `effort: "low"` and real headroom.
 */

const ENDPOINT = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-flash";

/** Reasoning eats the budget before any content is written. 700 produced nothing at all. */
const MAX_TOKENS = 3000;

export interface GiftPlan {
  worldPrompt: string;
  objects: Array<{ name: string; prompt: string }>;
}

/**
 * The instruction that matters most here is "no people".
 *
 * Left to itself the model writes the scene as a photograph of the moment -
 * "two brothers stand around a dismantled bicycle". Marble renders what it is
 * told, so that becomes figures standing in a room someone is about to walk
 * into alone. The gift is the empty place, held exactly as it was.
 */
const SYSTEM = `You turn a memory into a place someone can walk into.

Return JSON only, with this exact shape:
{"worldPrompt": string, "objects": [{"name": string, "prompt": string}]}

worldPrompt describes a single interior or exterior location for a
photorealistic 3D scene generator. Rules, in order of importance:

1. NO PEOPLE. No figures, no faces, no hands, nobody standing or sitting.
   The place is empty and still, as if everyone stepped out a moment ago.
   This matters more than anything else: someone will walk through it alone.
2. One place, one time of day, one light source described plainly.
3. Give it depth - something near, something far, a doorway or window. Flat
   walls make a dull room to stand in.
4. Concrete and sensory, not sentimental. Name materials, colours, wear.
5. Keep the arrival area and a short walking loop clear. Put no large object,
   wall, railing, foliage, fog, mirror, or reflective surface close to the
   viewpoint. Major floors, walls and horizons must be continuous and plain.
6. Describe enough of the surroundings to make every direction coherent.
7. 60-90 words. Photographic. No camera directions, no story, no metaphor.

objects: 3 to 6 small physical things that belonged in that place and carry
the memory. Each needs:
  - name: two or three plain words ("the blue bicycle")
  - prompt: one line describing that single object alone, for a 3D model
    generator. One object on its own, no scene, no background, no people.

Choose things a person could pick up or stand beside. Avoid anything huge,
anything abstract, and anything with text on it.`;

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export async function planGift(memory: string): Promise<GiftPlan> {
  const key = requireEnv(
    "DEEPSEEK_API_KEY",
    "Locally: add it to .env. On Vercel: `vercel env add DEEPSEEK_API_KEY production`, then redeploy.",
  );

  const res = await fetchWithRetry(
    ENDPOINT,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: memory },
        ],
        max_tokens: MAX_TOKENS,
        // Without this the model reasons until the budget is gone.
        effort: "low",
        response_format: { type: "json_object" },
      }),
    },
    { label: "deepseek" },
  );

  const body = (await res.json()) as DeepSeekResponse;
  if (!res.ok) {
    throw new Error(`DeepSeek ${res.status}: ${body.error?.message ?? "unknown error"}`);
  }

  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(
      "DeepSeek returned no content. Usually the token budget went entirely to reasoning.",
    );
  }

  return validate(content);
}

/**
 * Trust nothing.
 *
 * The API cannot enforce a schema here, so a malformed or half-right answer
 * has to be caught now rather than stored and discovered when a world comes
 * back wrong - by which point it has cost credits.
 */
function validate(content: string): GiftPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`DeepSeek did not return JSON: ${content.slice(0, 200)}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("DeepSeek returned JSON that is not an object.");
  }

  const raw = parsed as { worldPrompt?: unknown; objects?: unknown };

  const worldPrompt = typeof raw.worldPrompt === "string" ? raw.worldPrompt.trim() : "";
  if (worldPrompt.length < 40) {
    throw new Error(
      `worldPrompt is missing or too short to generate from: ${JSON.stringify(raw.worldPrompt)}`,
    );
  }

  if (!Array.isArray(raw.objects)) {
    throw new Error("objects is missing or not an array.");
  }

  const objects: GiftPlan["objects"] = [];
  for (const entry of raw.objects) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as { name?: unknown; prompt?: unknown };
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const prompt = typeof item.prompt === "string" ? item.prompt.trim() : "";
    if (!name || !prompt) continue;
    objects.push({ name: name.slice(0, 60), prompt: prompt.slice(0, 300) });
  }

  if (!objects.length) {
    throw new Error("objects contained nothing usable.");
  }

  return {
    // Long prompts get truncated by the generator anyway; better to do it here
    // where it is visible.
    worldPrompt: worldPrompt.slice(0, 1200),
    // Six is the ceiling the intake promises, and each one costs Tripo credits.
    objects: objects.slice(0, 6),
  };
}
