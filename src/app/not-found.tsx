import Link from "next/link";

/**
 * A link that does not lead anywhere.
 *
 * Reached two ways, and the second is the one that matters: a gift id that
 * never existed, or a gift that exists and could not be read. Storage
 * failures used to surface here as Next's stock white "404 | This page could
 * not be found" - a recipient opening something they were sent would conclude
 * the link was wrong and never try again.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#05060a] px-6 text-center">
      <div className="max-w-sm">
        <p className="text-[11px] tracking-[0.26em] text-white/55 uppercase">lantern</p>
        <p
          style={{
            margin: "1.5rem 0 0",
            fontFamily: "var(--font-newsreader), Georgia, serif",
            fontWeight: 300,
            fontSize: "clamp(24px, 3vw, 34px)",
            lineHeight: 1.25,
            color: "rgba(255,255,255,.9)",
          }}
        >
          There is nothing at this link.
        </p>
        <p className="mt-5 text-sm leading-relaxed text-white/55">
          It may have been mistyped, or the place may not have finished being built. If someone
          sent it to you, it is worth asking them for it again.
        </p>
        <Link
          href="/"
          className="mt-9 inline-flex rounded-full border border-white/25 px-6 py-2.5 text-xs tracking-[0.15em] text-white/80 uppercase transition-all duration-700 hover:border-[rgba(255,236,210,.55)] hover:bg-[rgba(255,236,210,.08)]"
        >
          go to lantern
        </Link>
      </div>
    </main>
  );
}
