"use client";

import dynamic from "next/dynamic";

/**
 * Keeps the 3D engine out of the landing page's first load.
 *
 * `HeroWorld` statically imports three.js and Spark. Imported directly by the
 * page, that put a ~3 MB chunk (about 1 MB gzipped) of renderer and
 * WebAssembly in front of hydration - before a single word of the page could
 * become interactive, and on top of the 4.8 MB splat it then fetches.
 *
 * Loaded this way the page is readable and interactive first, and the room
 * arrives into it. Which is also what it looks like by design: the designed
 * light is there immediately and the real world fades in behind it.
 */
const HeroWorld = dynamic(() => import("@/components/landing/HeroWorld"), {
  ssr: false,
  loading: () => null,
});

export default function HeroBackdrop({ splatUrl }: { splatUrl: string }) {
  return <HeroWorld splatUrl={splatUrl} />;
}
