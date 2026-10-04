"use client";

import Atmosphere, { MemoryLight } from "@/components/Atmosphere";
import { type Gift, readableName } from "@/lib/gifts";

/**
 * The moment the whole project exists for.
 *
 * A finished gift used to drop the visitor straight into a 3D world with
 * "click to look around". Nothing said a person had made it, who they were, or
 * what it was made out of - so the one idea Lantern is built on, that the
 * recipient's experience is the product, was invisible to anyone who opened a
 * link. Creativity and Theme fit are half the App score and both live here.
 *
 * It is a door, not a landing page. One name, one memory, one way through.
 *
 * The world is already loading behind this card. A gift is several megabytes
 * and the card is the only honest cover we have for that - by the time someone
 * has read whose it is and why, the room is usually there.
 */
export default function Threshold({
  gift,
  onEnter,
}: {
  gift: Gift;
  onEnter: () => void;
}) {
  // A gift can be made without either name, and it must still read as a gift.
  const maker = readableName(gift.fromName);
  const opening = maker ? `${maker} made a place for you.` : "Someone made a place for you.";
  const to = readableName(gift.toName);

  return (
    <div className="absolute inset-0 z-10 grid place-items-center overflow-hidden bg-[#05060a] px-6">
      <Atmosphere preset="memory">
        <MemoryLight hue={52} chroma={0.12} y={52} tall />
      </Atmosphere>

      {/* Darkens the edges so the card sits in the middle of a room rather
          than on a panel. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 80% at 50% 50%, transparent 30%, rgba(5,6,10,.92) 95%)",
        }}
      />

      <div className="relative max-w-md text-center">
        {to ? (
          <p className="text-[11px] tracking-[0.26em] text-white/60 uppercase">for {to}</p>
        ) : null}

        <p className="mt-6 text-[15px] leading-[1.7] text-white/55">{opening}</p>

        {/* The sender's own words, unedited. This is what makes a recipient
            understand the world was made about them and nobody else. */}
        {gift.memory?.trim() ? (
          <blockquote
            style={{
              margin: "2rem 0 0",
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontStyle: "italic",
              fontWeight: 300,
              fontSize: "clamp(22px, 3vw, 34px)",
              lineHeight: 1.3,
              letterSpacing: "-.01em",
              textWrap: "pretty",
              color: "rgba(255,255,255,.92)",
            }}
          >
            &ldquo;{gift.memory.trim()}&rdquo;
          </blockquote>
        ) : null}

        <button
          type="button"
          onClick={onEnter}
          className="mt-12 inline-flex rounded-full border border-white/30 px-8 py-3.5 text-[15px] whitespace-nowrap text-white/90 transition-all duration-1000 hover:border-[rgba(255,236,210,.55)] hover:bg-[rgba(255,236,210,.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          step inside
        </button>

        {/* No controls here. The viewer teaches them at the moment they are
            needed, and it knows whether this is a phone; saying it twice in two
            different ways only contradicts itself. A door says what is behind
            it, not how to walk. */}
        <p className="mt-8 text-xs tracking-wide text-white/50">
          a place, built from that memory · it takes a moment to open
        </p>
      </div>
    </div>
  );
}
