import Link from "next/link";

import WorldStage from "@/components/WorldStage";
import { loadLatestWorld } from "@/lib/worlds";
import type { World } from "@/lib/types";

// Until the first Marble export lands, a public Spark sample stands in so the
// app never renders an empty canvas.
const SPIKE_WORLD: World = {
  id: "spike",
  splatUrl: "https://sparkjs.dev/assets/splats/butterfly.spz",
  spawn: [0, 1.6, 3],
};

export default async function Home() {
  const world = (await loadLatestWorld()) ?? SPIKE_WORLD;

  return (
    <main className="relative h-dvh w-full bg-[#05060a]">
      <WorldStage world={world} />

      {/* Deliberately quiet. Someone arriving should meet the place first and
          understand what this is by standing in it; the invitation to make one
          is for after that, not instead of it. */}
      <Link
        href="/make"
        className="absolute right-5 top-5 z-10 rounded-full bg-black/40 px-4 py-2 text-xs tracking-wide text-white/50 backdrop-blur-sm transition hover:text-white/90"
      >
        make one
      </Link>
    </main>
  );
}
