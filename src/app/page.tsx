import Link from "next/link";

import Atmosphere from "@/components/Atmosphere";
import HeroWorld from "@/components/landing/HeroWorld";
import { BuildStatus, TheDoor, VoiceNoteList } from "@/components/landing/Showcase";
import { MEMORIES } from "@/lib/landing";

/**
 * The page a stranger lands on.
 *
 * It used to be a live splat world filling the viewport with two small links
 * over it, which proved the product in two seconds and explained nothing. A
 * judge arriving cold could walk around it indefinitely without learning that
 * the thing is a gift made for one named person - which is the whole idea,
 * and half the score.
 *
 * So it tells the story instead, in the order the story happens: here is what
 * you make, here is the person who opens it, here is how it is built, here is
 * what others have made.
 *
 * The one rule it keeps from before: no photography of people. The product
 * builds places and objects and never figures, so light does the work an
 * image would usually do.
 */

const serif = "var(--font-newsreader), Georgia, serif";
const gutter = "clamp(24px, 7vw, 112px)";

/**
 * The room behind the hero.
 *
 * Pinned rather than "the latest world", because this one is chosen: a small
 * interior that reads well out of focus and behind text. Only its splat is in
 * storage - no collider, no objects - since nobody walks through the hero.
 */
const HERO_WORLD = "35b95a56-5688-40e0-ada8-0079f1038a71";

export default function Home() {
  return (
    <main style={{ background: "#05060a", color: "rgba(255,255,255,.9)", overflowX: "hidden" }}>
      {/* ---- 01 Hero ---------------------------------------------------- */}
      <section style={{ position: "relative", minHeight: "100svh", overflow: "hidden" }}>
        {/* A real generated room, under the designed light. Saying the product
            builds places you can walk through, over an actual splat of one,
            is the one claim on this page that proves itself. It fades in only
            once decoded, so the page is complete without it. */}
        <HeroWorld splatUrl={`/worlds/${HERO_WORLD}/splat-500k.spz`} />
        <Atmosphere preset="slit" />
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top,#05060a 4%,transparent 45%),linear-gradient(to right,#05060a 0%,transparent 55%)",
            pointerEvents: "none",
          }}
        />

        <nav
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 24,
            padding: `28px ${gutter}`,
            zIndex: 2,
          }}
        >
          <Link href="/" className="text-xs tracking-[0.3em] text-white/80 uppercase">
            lantern
          </Link>
          <Link
            href="/constellation"
            className="text-xs tracking-[0.22em] text-white/45 uppercase transition hover:text-white/80"
          >
            constellation
          </Link>
        </nav>

        <div
          style={{
            position: "absolute",
            left: gutter,
            right: gutter,
            bottom: "clamp(56px, 10vh, 112px)",
            display: "flex",
            flexDirection: "column",
            gap: 26,
            maxWidth: 640,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontFamily: serif,
              fontWeight: 300,
              fontSize: "clamp(38px, 5.4vw, 80px)",
              lineHeight: 1.05,
              letterSpacing: "-.02em",
              textWrap: "balance",
              color: "rgba(255,255,255,.92)",
            }}
          >
            Build someone the place they remember.
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: "clamp(15px, 1.3vw, 18px)",
              lineHeight: 1.75,
              color: "rgba(255,255,255,.6)",
              maxWidth: "40ch",
              textWrap: "pretty",
            }}
          >
            Describe a room from a memory. Lantern builds it as a world you can walk through, and
            gives you a link to send to the person it was about.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "20px 28px",
              marginTop: 6,
            }}
          >
            <Link
              href="/make"
              className="inline-flex rounded-full bg-[rgba(255,240,220,.92)] px-[34px] py-[15px] text-[15px] whitespace-nowrap text-[#05060a] transition-colors duration-1000 hover:bg-[rgb(255,240,220)]"
            >
              make one
            </Link>
            <Link href="/constellation" className="text-sm text-white/55 transition hover:text-white/90">
              see what others have made
            </Link>
          </div>
        </div>
      </section>

      {/* ---- 02 The other end -------------------------------------------- */}
      <section
        style={{
          padding: `clamp(96px, 16vh, 180px) ${gutter} 0`,
          display: "flex",
          flexDirection: "column",
          gap: 22,
          maxWidth: 1280,
          margin: "0 auto",
        }}
      >
        <div className="text-[11px] tracking-[0.24em] text-white/45 uppercase">the other end</div>
        <p
          style={{
            margin: 0,
            fontFamily: serif,
            fontWeight: 300,
            fontSize: "clamp(26px, 3vw, 42px)",
            lineHeight: 1.3,
            letterSpacing: "-.01em",
            maxWidth: "24ch",
            textWrap: "pretty",
            color: "rgba(255,255,255,.88)",
          }}
        >
          Lantern is made for the person who opens the link. They get a door with their name on it,
          and a memory of a place you shared.
        </p>
      </section>

      {/* ---- 03 The door -------------------------------------------------- */}
      <TheDoor />

      {/* ---- 04 How it works ---------------------------------------------- */}
      <section
        style={{
          padding: `clamp(112px, 18vh, 200px) ${gutter} 0`,
          maxWidth: 1280,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "clamp(88px, 14vh, 160px)",
        }}
      >
        <div className="text-[11px] tracking-[0.24em] text-white/45 uppercase">
          how a place is made
        </div>

        <Step
          numeral="i"
          title="You describe it."
          body="A few sentences about a room. What it looked like, what was in it, what the light was doing."
        >
          <div
            style={{
              flex: "1 1 340px",
              minWidth: 0,
              border: "1px solid rgba(255,255,255,.12)",
              borderRadius: 14,
              padding: "clamp(22px, 3vw, 36px)",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <div className="text-[11px] tracking-[0.24em] text-white/40 uppercase">the place</div>
            <p
              style={{
                margin: 0,
                fontFamily: serif,
                fontWeight: 300,
                fontSize: "clamp(19px, 1.7vw, 23px)",
                lineHeight: 1.55,
                color: "rgba(255,255,255,.85)",
                textWrap: "pretty",
              }}
            >
              {MEMORIES[2].text}
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  width: 1,
                  height: "1.1em",
                  marginLeft: 3,
                  verticalAlign: "-.15em",
                  background: "rgba(255,236,210,.7)",
                  animation: "lt-breathe 1.6s ease-in-out infinite",
                }}
              />
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                paddingTop: 16,
                borderTop: "1px solid rgba(255,255,255,.08)",
              }}
            >
              <span className="text-sm text-white/45">for Tobi</span>
              <span className="text-sm text-white/70">build it</span>
            </div>
          </div>
        </Step>

        <Step
          numeral="ii"
          title="Lantern builds it."
          body="World Labs’ Marble turns the description into a world you walk through in first person. Tripo makes the objects that were in it, the water tank, the aerials, and sets them into the scene so they sit behind and in front of what’s already there."
          reverse
        >
          <div
            style={{
              flex: "1 1 340px",
              minWidth: 0,
              position: "relative",
              aspectRatio: "16/10",
              borderRadius: 14,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,.1)",
              background:
                "repeating-linear-gradient(135deg,rgba(255,255,255,.035) 0 1px,transparent 1px 12px),#08090d",
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(ellipse 70% 60% at 60% 70%, oklch(0.58 0.15 45 / .35), transparent 70%)",
              }}
            />
            <div className="absolute top-4 left-[18px] font-mono text-[11px] text-white/40">
              marble world capture · the roof
            </div>
            <BuildStatus />
          </div>
        </Step>

        <Step
          numeral="iii"
          title="You leave your voice in it."
          body="Record a short note on any object. When they walk towards it, your voice fades in. Then send the link."
        >
          <VoiceNoteList />
        </Step>
      </section>

      {/* ---- 05 Constellation --------------------------------------------- */}
      <section
        style={{
          padding: `clamp(120px, 20vh, 220px) ${gutter} 0`,
          maxWidth: 1280,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "clamp(40px, 6vh, 64px)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 24,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 560 }}>
            <div className="text-[11px] tracking-[0.24em] text-white/45 uppercase">
              the constellation
            </div>
            <p
              style={{
                margin: 0,
                fontFamily: serif,
                fontWeight: 300,
                fontSize: "clamp(26px, 2.8vw, 40px)",
                lineHeight: 1.25,
                color: "rgba(255,255,255,.88)",
                textWrap: "pretty",
              }}
            >
              Places people have built for each other. Each one was made for someone by name.
            </p>
          </div>
          <Link
            href="/constellation"
            className="text-sm whitespace-nowrap text-white/60 transition hover:text-white/90"
          >
            walk the constellation
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
            gap: "clamp(20px, 2.5vw, 32px)",
          }}
        >
          {MEMORIES.map((memory, k) => (
            <Link
              key={memory.to}
              href="/constellation"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 18,
                color: "inherit",
                marginTop: ["0px", "48px", "16px"][k],
              }}
            >
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
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: `radial-gradient(ellipse 80% 55% at 55% ${memory.tall ? 55 : 78}%, oklch(0.58 ${memory.chroma} ${memory.hue} / .4), transparent 75%)`,
                  }}
                />
                <div className="absolute top-3.5 right-4 left-4 font-mono text-[11px] text-white/40">
                  world capture · {memory.place}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="text-[11px] tracking-[0.24em] text-white/60 uppercase">
                  for {memory.to}
                </div>
                <div
                  style={{
                    fontFamily: serif,
                    fontStyle: "italic",
                    fontWeight: 300,
                    fontSize: 18,
                    lineHeight: 1.5,
                    color: "rgba(255,255,255,.75)",
                    textWrap: "pretty",
                  }}
                >
                  &ldquo;{memory.short}&rdquo;
                </div>
                <div className="text-[13px] text-white/40">from {memory.from}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ---- 06 Closing ---------------------------------------------------- */}
      <section
        style={{
          position: "relative",
          marginTop: "clamp(120px, 18vh, 200px)",
          minHeight: "clamp(560px, 86vh, 820px)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <Atmosphere preset="closing" />
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom,#05060a 0%,transparent 35%,transparent 70%,#05060a 100%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 28,
            padding: `0 ${gutter}`,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: serif,
              fontWeight: 300,
              fontSize: "clamp(34px, 4.6vw, 66px)",
              lineHeight: 1.1,
              letterSpacing: "-.015em",
              maxWidth: "16ch",
              textWrap: "balance",
              color: "rgba(255,255,255,.92)",
            }}
          >
            Who would you build a place for?
          </h2>
          <Link
            href="/make"
            className="inline-flex rounded-full bg-[rgba(255,240,220,.92)] px-[34px] py-[15px] text-[15px] whitespace-nowrap text-[#05060a] transition-colors duration-1000 hover:bg-[rgb(255,240,220)]"
          >
            make one
          </Link>
        </div>
      </section>

      <footer
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: "16px 32px",
          padding: `40px ${gutter} 48px`,
        }}
        className="text-[11px] tracking-[0.22em] text-white/32 uppercase"
      >
        <span>lantern</span>
        <span>tripothon s1 · build a world as a gift</span>
      </footer>
    </main>
  );
}

/** One of the three steps: words on one side, something to look at on the other. */
function Step({
  numeral,
  title,
  body,
  reverse = false,
  children,
}: {
  numeral: string;
  title: string;
  body: string;
  reverse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        // wrap-reverse puts the picture above the words on a phone for the
        // middle step, so the three do not read as an identical stack.
        flexWrap: reverse ? "wrap-reverse" : "wrap",
        gap: "40px clamp(40px, 6vw, 96px)",
        alignItems: "center",
      }}
    >
      {reverse ? children : null}
      <div
        style={{
          flex: "1 1 300px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          maxWidth: 420,
        }}
      >
        <div className="font-mono text-xs text-white/35">{numeral}</div>
        <h2
          style={{
            margin: 0,
            fontFamily: serif,
            fontWeight: 300,
            fontSize: "clamp(28px, 2.6vw, 38px)",
            lineHeight: 1.15,
            color: "rgba(255,255,255,.9)",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 16,
            lineHeight: 1.8,
            color: "rgba(255,255,255,.58)",
            textWrap: "pretty",
          }}
        >
          {body}
        </p>
      </div>
      {reverse ? null : children}
    </div>
  );
}
