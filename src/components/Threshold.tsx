"use client";

import { type Gift } from "@/lib/gifts";

/**
 * The moment the whole project exists for.
 *
 * Until now a finished gift dropped the visitor straight into a 3D world with
 * "click to look around". Nothing said a person had made it, who they were, or
 * what it was made out of - so the one idea Lantern is built on, that the
 * recipient's experience is the product, was invisible to anyone who opened a
 * link. Creativity and Theme fit are half the App score and both live here.
 *
 * It is a door, not a landing page. One name, one memory, one way through.
 *
 * The world is already loading behind this card. A gift is several megabytes
 * and the card is the only honest cover we have for that - by the time someone
 * has read whose it is and why, the room is usually there. That is the reason
 * this is an overlay rather than a screen that comes before.
 */
export default function Threshold({
  gift,
  onEnter,
}: {
  gift: Gift;
  onEnter: () => void;
}) {
  // A gift can be made without either name, and it must still read as a gift.
  const maker = gift.fromName?.trim();
  const opening = maker ? `${maker} made a place for you.` : "Someone made a place for you.";

  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-[#05060a] px-6">
      <div className="max-w-md text-center">
        {gift.toName?.trim() ? (
          <p className="text-sm tracking-[0.2em] text-white/35 uppercase">
            for {gift.toName.trim()}
          </p>
        ) : null}

        <p className="mt-6 text-xl leading-relaxed text-white/90">{opening}</p>

        {/* The sender's own words, unedited. This is the thing that makes a
            recipient understand the world was made about them and not for
            anyone else. */}
        {gift.memory?.trim() ? (
          <p className="mt-8 text-lg leading-relaxed text-white/60 italic">
            &ldquo;{gift.memory.trim()}&rdquo;
          </p>
        ) : null}

        <button
          type="button"
          onClick={onEnter}
          className="mt-12 rounded-full border border-white/20 px-8 py-3 text-sm tracking-[0.15em] text-white/80 uppercase transition hover:border-white/50 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          step inside
        </button>

        <p className="mt-8 text-xs tracking-wide text-white/25">
          built from a memory · walk with the arrow keys, or drag to look
        </p>
      </div>
    </div>
  );
}
