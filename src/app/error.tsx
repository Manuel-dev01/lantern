"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * The last thing between a server error and a blank page.
 *
 * The landing page and the gallery both read storage while rendering, with no
 * guard - one outage, or one missing environment variable, and every visitor
 * got React's stock "Application error: a client-side exception has occurred".
 * There was no boundary anywhere in the app.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Nothing is reporting errors yet; the console is the only record there is.
    console.error("Lantern:", error);
  }, [error]);

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
          Something went wrong on our side.
        </p>
        <p className="mt-5 text-sm leading-relaxed text-white/55">
          Nothing you made is lost. This is usually temporary.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <button
            type="button"
            onClick={reset}
            className="inline-flex rounded-full border border-white/25 px-6 py-2.5 text-xs tracking-[0.15em] text-white/80 uppercase transition-all duration-700 hover:border-[rgba(255,236,210,.55)] hover:bg-[rgba(255,236,210,.08)]"
          >
            try again
          </button>
          <Link href="/" className="text-xs tracking-wide text-white/55 hover:text-white/80">
            go to lantern
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-8 font-mono text-[10px] text-white/55">{error.digest}</p>
        ) : null}
      </div>
    </main>
  );
}
