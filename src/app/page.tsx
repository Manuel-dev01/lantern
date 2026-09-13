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
    <main className="h-dvh w-dvw bg-[#05060a]">
      <WorldStage world={world} />
    </main>
  );
}
