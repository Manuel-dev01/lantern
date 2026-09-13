"use client";

import dynamic from "next/dynamic";
import type { World } from "@/lib/types";

// WebGL + Spark touch browser globals, so keep this out of the server render.
const WorldViewer = dynamic(() => import("@/components/WorldViewer"), {
  ssr: false,
});

// Phase 1 spike: a public Spark sample stands in until the first Marble
// export lands. Swapping in a real world is a change to this object only.
const SPIKE_WORLD: World = {
  id: "spike",
  splatUrl: "https://sparkjs.dev/assets/splats/butterfly.spz",
  spawn: [0, 1.6, 3],
};

export default function Home() {
  return (
    <main className="h-dvh w-dvw bg-[#05060a]">
      <WorldViewer world={SPIKE_WORLD} />
    </main>
  );
}
