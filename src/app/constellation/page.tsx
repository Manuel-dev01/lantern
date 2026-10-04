import Link from "next/link";

import { readableName, readSharedIndex } from "@/lib/gifts";

/**
 * Every gift whose sender chose to show it.
 *
 * Three jobs at once. It is the answer to a cold start - a visitor who has not
 * been sent anything still has something to walk into. It is the browsing
 * surface a judge needs, because the create flow takes five minutes and nobody
 * evaluating forty entries will wait through it on every one. And it is the
 * only place the scale of the thing is visible: one gift is a demo, forty
 * rooms built for forty named people is an argument.
 *
 * Each card shows the world and who it was for, never the memory. The memory
 * belongs to the two people it is about.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "The constellation · Lantern",
  description: "Places people have built for each other.",
};

export default async function ConstellationPage() {
  const gifts = await readSharedIndex();

  return (
    <main
      style={{
        minHeight: "100svh",
        background: "#05060a",
        padding: "clamp(72px, 12vh, 140px) clamp(24px, 7vw, 112px) clamp(64px, 10vh, 120px)",
      }}
    >
      <nav className="mx-auto mb-[clamp(56px,9vh,96px)] flex max-w-5xl items-center justify-between gap-6">
        <Link href="/" className="-m-2 inline-flex min-h-11 items-center p-2 text-xs tracking-[0.3em] text-white/80 uppercase">
          lantern
        </Link>
        <Link
          href="/make"
          className="-m-2 inline-flex min-h-11 items-center p-2 text-xs tracking-[0.22em] text-white/55 uppercase transition hover:text-white/80"
        >
          make one
        </Link>
      </nav>

      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-[18px]">
          <div className="text-[11px] tracking-[0.24em] text-white/55 uppercase">
            the constellation
          </div>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontWeight: 300,
              fontSize: "clamp(26px, 2.8vw, 40px)",
              lineHeight: 1.25,
              maxWidth: "24ch",
              textWrap: "pretty",
              color: "rgba(255,255,255,.88)",
            }}
          >
            Places people have built for each other. Each one was made for someone by name.
          </p>
        </header>

        {gifts.length === 0 ? (
          // An empty gallery should still say what it is for, rather than
          // reading as a page that failed to load.
          <div className="mt-24 text-center">
            <p className="text-sm text-white/55">No one has shared a place yet.</p>
            <Link
              href="/make"
              className="mt-8 inline-flex rounded-full border border-white/25 px-7 py-3 text-xs tracking-[0.15em] text-white/80 uppercase transition-all duration-1000 hover:border-[rgba(255,236,210,.55)] hover:bg-[rgba(255,236,210,.08)]"
            >
              make the first one
            </Link>
          </div>
        ) : (
          <ul
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
              gap: "clamp(20px, 2.5vw, 32px)",
              listStyle: "none",
              padding: 0,
              marginTop: "clamp(48px, 7vh, 72px)",
            }}
          >
            {gifts.map((gift, k) => (
              <li key={gift.id} style={{ marginTop: ["0px", "48px", "16px"][k % 3] }}>
                <Link href={`/g/${gift.id}`} className="group flex flex-col gap-[18px]">
                  <div
                    style={{
                      position: "relative",
                      aspectRatio: "4/5",
                      borderRadius: 12,
                      overflow: "hidden",
                      border: "1px solid rgba(255,255,255,.08)",
                      background:
                        "repeating-linear-gradient(135deg,rgba(255,255,255,.03) 0 1px,transparent 1px 12px),#08090d",
                    }}
                  >
                    {gift.thumbnailUrl ? (
                      // Marble's own preview of the world, mirrored like
                      // everything else. Plain img: these are arbitrary
                      // remote-shaped paths behind a rewrite, not build-time
                      // assets, and they are already sized for this.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={gift.thumbnailUrl}
                        alt="A place someone built"
                        loading="lazy"
                        className="h-full w-full object-cover opacity-75 transition duration-1000 group-hover:opacity-100"
                      />
                    ) : null}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(to top, rgba(5,6,10,.75) 0%, transparent 55%)",
                      }}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="text-[11px] tracking-[0.24em] text-white/60 uppercase">
                      {readableName(gift.toName)
                        ? `For ${readableName(gift.toName)}`
                        : "For someone"}
                    </div>
                    {readableName(gift.fromName) ? (
                      <div className="text-[13px] text-white/55">
                        from {readableName(gift.fromName)}
                      </div>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
