import { listSharedGifts } from "@/lib/gifts";
import { listBlobs, readBlobJson } from "@/lib/providers/blob";
import type { Gift } from "@/lib/gifts";

/**
 * Why the constellation is empty, answered by the deployment itself.
 *
 * listSharedGifts returns one gift locally and nothing in production, and
 * readBlobJson swallows every error to null, so from outside there is no way
 * to tell a failed read from an unshared gift. This reports both.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const blobs = await listBlobs("gifts/");
  const docs = blobs.filter((b) => b.pathname.endsWith(".json"));

  const rows = await Promise.all(
    docs.slice(0, 20).map(async (b) => {
      const gift = await readBlobJson<Gift>(b.pathname);
      return {
        pathname: b.pathname,
        read: Boolean(gift),
        shared: gift?.shared ?? null,
        stage: gift?.stage ?? null,
        world: Boolean(gift?.world),
      };
    }),
  );

  return Response.json({
    blobs: blobs.length,
    docs: docs.length,
    shared: (await listSharedGifts()).length,
    rows,
  });
}
