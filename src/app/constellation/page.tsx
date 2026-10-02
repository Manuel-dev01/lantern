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
    <main className="min-h-dvh w-full bg-[#05060a] px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <header className="text-center">
          <h1 className="text-2xl text-white/90">The constellation</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/45">
            Places people have built for each other. Each one was made for someone by name.
          </p>
        </header>

        {gifts.length === 0 ? (
          // An empty gallery should still say what it is for, rather than
          // reading as a page that failed to load.
          <div className="mt-20 text-center">
            <p className="text-sm text-white/40">No one has shared a place yet.</p>
            <Link
              href="/make"
              className="mt-8 inline-block rounded-full border border-white/20 px-6 py-2.5 text-xs tracking-[0.15em] text-white/80 uppercase transition hover:border-white/50 hover:text-white"
            >
              make the first one
            </Link>
          </div>
        ) : (
          <ul className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {gifts.map((gift) => (
              <li key={gift.id}>
                <Link
                  href={`/g/${gift.id}`}
                  className="group block overflow-hidden rounded-xl border border-white/10 transition hover:border-white/30"
                >
                  <div className="aspect-[4/3] w-full bg-white/[0.03]">
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
                        className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100"
                      />
                    ) : null}
                  </div>

                  <div className="px-4 py-4">
                    <p className="text-sm text-white/75">
                      {readableName(gift.toName) ? `For ${readableName(gift.toName)}` : "For someone"}
                    </p>
                    {readableName(gift.fromName) ? (
                      <p className="mt-1 text-xs tracking-wide text-white/35">
                        from {readableName(gift.fromName)}
                      </p>
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
