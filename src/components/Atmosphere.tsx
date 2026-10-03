import type { CSSProperties, ReactNode } from "react";

/**
 * The light in the room.
 *
 * Lantern's whole surface is one dark space with something warm in it, and
 * these are that warmth: soft blurred shapes drifting slowly behind the type.
 * They are not decoration in the usual sense - there is no photography
 * anywhere in this product, by rule, because the worlds contain places and
 * objects and never people. Light is what stands in for an image.
 *
 * Rendered as plain blurred divs rather than an image or a canvas, so they
 * cost nothing to load, scale to any viewport, and keep moving while a
 * 23 MB world downloads behind them.
 */

type Preset = "slit" | "memory" | "closing";

const rg = (colour: string) => `radial-gradient(closest-side, ${colour}, transparent)`;

/** Dust in a sunbeam. Slow enough that you only notice it if you stop. */
const MOTES: Array<[number, number, number, number]> = [
  [22, 30, 3, 0.16],
  [71, 24, 4.5, 0.12],
  [63, 66, 2.4, 0.2],
  [33, 70, 3.6, 0.1],
];

function motes(from: number, to: number): ReactNode[] {
  return MOTES.slice(from, to).map(([x, y, size, opacity], k) => (
    <div
      key={`mote-${from}-${k}`}
      aria-hidden
      style={{
        position: "absolute",
        borderRadius: "50%",
        pointerEvents: "none",
        left: `${x}%`,
        top: `${y}%`,
        width: `max(14px, ${size}vw)`,
        height: `max(14px, ${size}vw)`,
        background: rg("oklch(0.9 0.08 75 / 1)"),
        opacity,
        filter: "blur(2px)",
        animation: `lt-mote ${26 + k * 5}s ease-in-out ${-k * 4}s infinite alternate`,
      }}
    />
  ));
}

function blob(style: CSSProperties, key: string): ReactNode {
  return (
    <div
      key={key}
      aria-hidden
      style={{ position: "absolute", borderRadius: "50%", pointerEvents: "none", ...style }}
    />
  );
}

/** Light through a gap in a curtain, falling across a floor. */
function slit(): ReactNode[] {
  return [
    blob(
      {
        right: "16%",
        top: "6%",
        width: "max(140px, 18vw)",
        height: "78%",
        borderRadius: "40%",
        background: rg("oklch(0.62 0.12 58 / .45)"),
        filter: "blur(50px)",
        animation: "lt-breathe 12s ease-in-out infinite",
      },
      "glow",
    ),
    <div
      key="beam"
      aria-hidden
      style={{
        position: "absolute",
        right: "24%",
        top: "12%",
        width: "max(9px, 1.2vw)",
        height: "62%",
        background:
          "linear-gradient(to bottom, oklch(0.92 0.06 82 / .95), oklch(0.82 0.1 68 / .9) 65%, oklch(0.6 0.12 50 / .5))",
        filter: "blur(3px)",
        animation: "lt-flicker 13s ease-in-out infinite",
      }}
    />,
    blob(
      {
        right: "4%",
        top: "70%",
        width: "max(260px, 46vw)",
        height: "16%",
        background:
          "radial-gradient(ellipse at 70% 30%, oklch(0.7 0.12 60 / .38), transparent 65%)",
        filter: "blur(22px)",
        transform: "skewX(-38deg)",
      },
      "floor",
    ),
    ...motes(0, 3),
  ];
}

/** A single warm source, centred, for the last thing on the page. */
function closing(): ReactNode[] {
  return [
    blob(
      {
        left: "50%",
        top: "50%",
        width: "max(520px, 70vw)",
        height: "max(380px, 44vw)",
        transform: "translate(-50%, -50%)",
        background: rg("oklch(0.55 0.12 52 / .42)"),
        filter: "blur(50px)",
      },
      "halo",
    ),
    blob(
      {
        left: "50%",
        top: "46%",
        width: "max(180px, 20vw)",
        height: "max(220px, 24vw)",
        transform: "translate(-50%, -50%)",
        background: rg("oklch(0.82 0.11 72 / .4)"),
        filter: "blur(50px)",
        animation: "lt-breathe 10s ease-in-out infinite",
      },
      "core",
    ),
    ...motes(0, 2),
  ];
}

export default function Atmosphere({
  preset,
  children,
}: {
  preset: Preset;
  children?: ReactNode;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        animation: "lt-drift 40s ease-in-out infinite alternate",
        ...(preset === "slit" ? { animationDuration: "60s" } : null),
      }}
    >
      {preset === "slit" ? slit() : preset === "closing" ? closing() : null}
      {/* The memory preset is driven by which memory is showing, so its light
          is handed in rather than built here. */}
      {preset === "memory" ? children : null}
      {preset === "memory" ? motes(1, 4) : null}
    </div>
  );
}

/**
 * The glow behind one memory, tinted to it.
 *
 * Each memory carries a hue - a kitchen in Lagos is not the same colour as a
 * roof at six o'clock - and the light behind the card crossfades with the
 * words. It is the only thing on the page that says a world has a mood
 * without showing one.
 */
export function MemoryLight({ hue, chroma, y, tall }: { hue: number; chroma: number; y: number; tall: boolean }) {
  return (
    <>
      {blob(
        {
          left: "50%",
          top: `${y}%`,
          width: "max(600px, 95vw)",
          height: tall ? "max(420px, 55vw)" : "max(260px, 30vw)",
          transform: "translate(-50%, -50%)",
          background: rg(`oklch(0.56 ${chroma} ${hue} / .5)`),
          filter: "blur(50px)",
        },
        "wash",
      )}
      {blob(
        {
          left: "58%",
          top: `${y - 6}%`,
          width: "max(220px, 26vw)",
          height: "max(220px, 26vw)",
          transform: "translate(-50%, -50%)",
          background: rg(`oklch(0.82 ${chroma * 0.8} ${hue + 8} / .42)`),
          filter: "blur(50px)",
          animation: "lt-breathe 11s ease-in-out infinite",
        },
        "core",
      )}
    </>
  );
}
