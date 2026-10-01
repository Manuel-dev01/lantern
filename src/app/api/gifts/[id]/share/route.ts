import { readGift, writeGift } from "@/lib/gifts";

/**
 * Whether a gift may appear in the constellation.
 *
 * Deliberately a separate, explicit call rather than a field set at creation.
 * At intake nobody knows what they would be agreeing to show - the world does
 * not exist yet. They are asked once, afterwards, looking at it.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: RouteContext<"/api/gifts/[id]/share">) {
  const { id } = await ctx.params;

  const gift = await readGift(id);
  if (!gift) return Response.json({ error: "No such gift." }, { status: 404 });

  let body: { shared?: unknown };
  try {
    body = (await request.json()) as { shared?: unknown };
  } catch {
    return Response.json({ error: "Expected a choice." }, { status: 400 });
  }

  // Strictly true, never truthy. A consent flag should not be settable by
  // accident from a stray string.
  gift.shared = body.shared === true;
  await writeGift(gift);

  return Response.json({ id: gift.id, shared: gift.shared });
}
