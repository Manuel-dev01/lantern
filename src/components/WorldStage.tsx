"use client";

import dynamic from "next/dynamic";
import type { World } from "@/lib/types";

// WebGL and Spark touch browser globals, so the viewer must not render on the
// server. `ssr: false` is not allowed in a Server Component, which is the only
// reason this thin client wrapper exists.
const WorldViewer = dynamic(() => import("@/components/WorldViewer"), {
  ssr: false,
});

export default function WorldStage({ world }: { world: World }) {
  return <WorldViewer world={world} />;
}
