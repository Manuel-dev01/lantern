"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The room tone.
 *
 * Lantern's landing page is a dark room with a light in it, and a dark room
 * has a sound. This is that: a slow, very quiet chord that drifts and never
 * resolves, so the page has air without ever becoming a thing being played at
 * someone.
 *
 * Synthesised rather than a file, for three reasons that all matter here:
 *
 *  - **Licensing.** This gets submitted and launched publicly. A track needs a
 *    licence, an attribution and a paper trail; four oscillators need none.
 *  - **Weight.** The page already carries a 4.8 MB splat. Music would double
 *    that for something most visitors never hear.
 *  - **It never loops.** The detune drifts on its own slow cycle, so there is
 *    no seam to notice and no two minutes that repeat.
 *
 * Browsers will not start audio before a gesture, which is correct and not
 * worth fighting: it waits for the first click, scroll or key, then fades in
 * over eight seconds. Nobody is ambushed, and the choice is remembered.
 */

/** A low minor ninth. Warm, unresolved, and far enough down not to compete. */
const CHORD = [110, 164.81, 220, 277.18];

/** Quiet enough to be atmosphere and not a soundtrack. */
const LEVEL = 0.045;
const FADE_SECONDS = 8;

const STORAGE_KEY = "lantern.sound";

export default function Ambience() {
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  const audio = useRef<{ ctx: AudioContext; master: GainNode } | null>(null);

  // Whether this visitor has turned it off before. Read after mount, because
  // localStorage does not exist while rendering on the server.
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    try {
      setWanted(localStorage.getItem(STORAGE_KEY) !== "off");
    } catch {
      // Private windows throw. Treat it as wanting sound; the toggle still works.
      setWanted(true);
    }
    setReady(true);
  }, []);

  /** Build the graph once, on the gesture that is allowed to start it. */
  function start() {
    if (audio.current) return;

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0;

    // Takes the edge off the oscillators so it reads as breath rather than
    // as a synthesiser.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.Q.value = 0.4;

    filter.connect(master);
    master.connect(ctx.destination);

    CHORD.forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency;

      const voice = ctx.createGain();
      // Upper notes quieter, so the chord sits down rather than spreading.
      voice.gain.value = 1 / (i + 1.6);

      // Each voice drifts at its own slow rate, a few cents either way. This
      // is the whole reason it never sounds looped.
      const drift = ctx.createOscillator();
      drift.frequency.value = 0.03 + i * 0.011;
      const depth = ctx.createGain();
      depth.gain.value = 0.6 + i * 0.25;
      drift.connect(depth).connect(osc.detune);
      drift.start();

      osc.connect(voice).connect(filter);
      osc.start();
    });

    // The filter opens and closes over about a minute, which is what makes it
    // feel like a room rather than a held chord.
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.016;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 180;
    sweep.connect(sweepDepth).connect(filter.frequency);
    sweep.start();

    audio.current = { ctx, master };
    fade(LEVEL);
    setOn(true);
  }

  function fade(to: number) {
    const current = audio.current;
    if (!current) return;
    const { ctx, master } = current;
    void ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(to, ctx.currentTime + (to > 0 ? FADE_SECONDS : 1.5));
  }

  // The first gesture of any kind is the one allowed to start audio.
  useEffect(() => {
    if (!ready || !wanted) return;

    const begin = () => start();
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "wheel", "touchstart"];
    for (const event of events) window.addEventListener(event, begin, { once: true, passive: true });

    return () => {
      for (const event of events) window.removeEventListener(event, begin);
    };
  }, [ready, wanted]);

  // Nobody wants a tab they have left still humming at them.
  useEffect(() => {
    const onVisibility = () => {
      const current = audio.current;
      if (!current) return;
      if (document.hidden) void current.ctx.suspend();
      else if (on) void current.ctx.resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [on]);

  useEffect(() => {
    return () => {
      void audio.current?.ctx.close();
      audio.current = null;
    };
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Not worth telling anyone about.
    }

    if (next) {
      if (audio.current) fade(LEVEL);
      else start();
    } else {
      fade(0);
    }
  }

  if (!ready) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Turn the room tone off" : "Turn the room tone on"}
      // No mix-blend-mode: it makes the browser recomposite this element
      // against everything beneath it, which on a page of large blurred
      // layers and a WebGL canvas is the most expensive pixel on screen. A
      // backdrop and a border do the same job for nothing.
      className="fixed right-4 bottom-4 z-50 flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 py-2.5 text-white/55 backdrop-blur-sm transition-colors duration-700 hover:text-white/80"
    >
      <span className="text-[10px] tracking-[0.24em] uppercase">sound</span>
      <span aria-hidden className="flex h-3 items-center gap-[2px]">
        {[4, 9, 6].map((height, k) => (
          <span
            key={k}
            style={{
              display: "block",
              width: 2,
              height,
              borderRadius: 2,
              background: "currentColor",
              opacity: on ? 1 : 0.35,
              transformOrigin: "center",
              transition: "opacity .7s ease",
              animation: on ? `lt-wave ${1.8 + k * 0.5}s ease-in-out ${-k * 0.3}s infinite` : "none",
            }}
          />
        ))}
      </span>
    </button>
  );
}
