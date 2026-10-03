"use client";

import { useEffect, useState } from "react";

import Atmosphere, { MemoryLight } from "@/components/Atmosphere";
import { MEMORIES } from "@/lib/landing";

/**
 * The three moving parts of the landing page.
 *
 * All client-side, all on timers, and deliberately slow: nine seconds on a
 * memory, three on a build status. The page is meant to be read, not
 * operated, and anything faster turns into a carousel someone has to wait
 * out.
 *
 * The memories here are real ones from the product, not invented marketing
 * copy - the same three that seeded the constellation.
 */

/** A memory, shown as the recipient first meets it: a door with a name on it. */
export function TheDoor() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const handle = setInterval(() => setIndex((i) => (i + 1) % MEMORIES.length), 9000);
    return () => clearInterval(handle);
  }, [index]);

  return (
    <section
      style={{
        position: "relative",
        marginTop: "clamp(56px, 9vh, 96px)",
        minHeight: "clamp(620px, 92vh, 880px)",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
      }}
    >
      <Atmosphere preset="memory">
        {MEMORIES.map((memory, k) => (
          <div
            key={memory.to}
            style={{
              position: "absolute",
              inset: 0,
              opacity: k === index ? 1 : 0,
              transition: "opacity 3.5s ease",
            }}
          >
            <MemoryLight hue={memory.hue} chroma={memory.chroma} y={memory.y} tall={memory.tall} />
          </div>
        ))}
      </Atmosphere>

      {/* Fades the light into the page above and below, so the section has no
          edges - it is a room you pass through, not a panel. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom,#05060a 0%,transparent 22%,transparent 78%,#05060a 100%),radial-gradient(ellipse 90% 80% at 50% 50%,transparent 35%,rgba(5,6,10,.9) 95%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          width: "100%",
          padding: "0 clamp(24px, 7vw, 112px)",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "grid", width: "100%", maxWidth: 760 }}>
          {MEMORIES.map((memory, k) => (
            <div
              key={memory.to}
              style={{
                gridArea: "1/1",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: 24,
                opacity: k === index ? 1 : 0,
                transition: "opacity 2.6s ease",
                pointerEvents: k === index ? "auto" : "none",
              }}
              aria-hidden={k !== index}
            >
              <div className="text-[11px] tracking-[0.26em] text-white/60 uppercase">
                for {memory.to}
              </div>
              <div className="text-[15px] leading-[1.7] text-white/55">
                {memory.from} made a place for you.
              </div>
              <blockquote
                style={{
                  margin: "8px 0 0",
                  fontFamily: "var(--font-newsreader), Georgia, serif",
                  fontStyle: "italic",
                  fontWeight: 300,
                  fontSize: "clamp(24px, 3.2vw, 44px)",
                  lineHeight: 1.28,
                  letterSpacing: "-.01em",
                  textWrap: "pretty",
                  color: "rgba(255,255,255,.92)",
                }}
              >
                &ldquo;{memory.text}&rdquo;
              </blockquote>
              <a
                href="/constellation"
                className="mt-[18px] inline-flex rounded-full border border-white/30 px-8 py-3.5 text-[15px] whitespace-nowrap text-white/90 transition-all duration-1000 hover:border-[rgba(255,236,210,.55)] hover:bg-[rgba(255,236,210,.08)]"
              >
                step inside
              </a>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 36,
          display: "flex",
          justifyContent: "center",
          gap: 10,
        }}
      >
        {MEMORIES.map((memory, k) => (
          <button
            key={memory.to}
            type="button"
            onClick={() => setIndex(k)}
            aria-label={`Show the gift for ${memory.to}`}
            style={{
              width: 28,
              height: 28,
              padding: 0,
              border: 0,
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                display: "block",
                width: k === index ? 24 : 8,
                height: 2,
                borderRadius: 2,
                background: "rgba(255,255,255,.55)",
                transition: "width 1.6s ease",
              }}
            />
          </button>
        ))}
      </div>
    </section>
  );
}

/** The real stage labels, cycling, exactly as a sender sees them while waiting. */
export function BuildStatus() {
  const labels = ["building the place", "bringing it closer", "finding the things that mattered"];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const handle = setInterval(() => setIndex((i) => (i + 1) % labels.length), 3200);
    return () => clearInterval(handle);
  }, [labels.length]);

  return (
    <div style={{ position: "absolute", left: 18, bottom: 16, display: "grid" }}>
      {labels.map((label, k) => (
        <span
          key={label}
          style={{
            gridArea: "1/1",
            fontSize: 14,
            letterSpacing: ".02em",
            color: "rgba(255,255,255,.75)",
            opacity: k === index ? 1 : 0,
            transition: "opacity 1.4s ease",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

const BARS = [5, 9, 14, 8, 18, 11, 6, 13, 16, 7, 10, 4];

/** Voice notes on objects, one of them playing. */
export function VoiceNoteList() {
  const notes = [
    { label: "the water tank", length: "0:21", active: false },
    { label: "the aerials", length: "0:34", active: true },
    { label: "the ledge we sat on", length: "0:12", active: false },
  ];

  return (
    <div style={{ flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
      {notes.map((note) => (
        <div
          key={note.label}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            padding: "18px 22px",
            border: `1px solid rgba(255,255,255,${note.active ? ".22" : ".08"})`,
            borderRadius: 12,
          }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 15,
              color: `rgba(255,255,255,${note.active ? ".88" : ".55"})`,
            }}
          >
            {note.label}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 3, height: 22 }}>
            {BARS.map((height, k) => (
              <span
                key={k}
                style={{
                  display: "block",
                  width: 2,
                  height,
                  borderRadius: 2,
                  background: note.active ? "rgba(255,236,210,.75)" : "rgba(255,255,255,.25)",
                  transformOrigin: "center",
                  animation: note.active
                    ? `lt-wave ${1.4 + (k % 4) * 0.3}s ease-in-out ${-k * 0.15}s infinite`
                    : "none",
                }}
              />
            ))}
          </div>

          <span className="font-mono text-xs text-white/40">{note.length}</span>
        </div>
      ))}
    </div>
  );
}
