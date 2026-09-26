import { notFound } from "next/navigation";

import GiftView from "@/components/GiftView";
import { readGift } from "@/lib/gifts";

/**
 * A gift, by its short id.
 *
 * Must be dynamic. `/` is statically prerendered, and a gift generated after
 * the last build would 404 forever under the same treatment.
 */
export const dynamic = "force-dynamic";

export default async function GiftPage(props: PageProps<"/g/[id]">) {
  const { id } = await props.params;
  const gift = await readGift(id);
  if (!gift) notFound();

  return (
    <main className="h-dvh w-dvw bg-[#05060a]">
      <GiftView gift={gift} />
    </main>
  );
}
