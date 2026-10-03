"use client";

import { useRouter } from "next/navigation";

import Atmosphere from "@/components/Atmosphere";
import { rememberMine } from "@/lib/mine";
import { useEffect, useRef, useState } from "react";

/**
 * Making a gift.
 *
 * Three questions, one at a time. A single form with three fields would be
 * less code, but it reads as paperwork - and the thing being asked for here is
 * a memory, which nobody hands over to a form. One question on an empty screen
 * gives it room.
 *
 * The middle question is the one that matters: everything the world is built
 * from comes out of it, so it gets the space and the prompting. The two names
 * either side are deliberately trivial to answer, so the hard one sits between
 * two easy ones.
 */

interface Step {
  key: "toName" | "memory" | "fromName";
  question: string;
  hint?: string;
  placeholder: string;
  multiline?: boolean;
  optional?: boolean;
}

const STEPS: Step[] = [
  {
    key: "toName",
    question: "Who is this for?",
    placeholder: "their name",
  },
  {
    key: "memory",
    question: "Tell me about a place.",
    hint: "Somewhere that mattered to both of you. What it looked like, the time of day, what was lying around. Small details are better than big ones.",
    placeholder: "Her kitchen in Lagos, always too hot, always smelling of fried plantain…",
    multiline: true,
  },
  {
    key: "fromName",
    question: "And who is it from?",
    placeholder: "your name",
    optional: true,
  },
];

export default function Intake() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const [full] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("full") === "1",
  );

  const step = STEPS[index];
  const value = answers[step.key] ?? "";
  const last = index === STEPS.length - 1;
  // The memory needs enough to build from; a name just needs to exist.
  const enough = step.optional || (step.multiline ? value.trim().length >= 15 : value.trim().length >= 1);

  // Focus follows the question, so answering never needs the mouse.
  useEffect(() => {
    inputRef.current?.focus();
  }, [index]);

  async function submit() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toName: answers.toName,
          fromName: answers.fromName,
          memory: answers.memory,
          // `/make?full=1` builds the good world: about five and a half
          // minutes and 1,580 credits, against twenty-seven seconds and 200
          // for a draft. A stranger gets the draft, because a world that
          // arrives is worth more to them than a sharper one that tests their
          // patience - and because a busy day should not be able to spend the
          // balance in twenty-one gifts. The gifts that have to look their
          // best are made deliberately.
          model: full ? "marble-1.1" : undefined,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        throw new Error(data.error ?? "The world could not be started.");
      }
      // So this browser is offered the chance to leave a voice on it, and
      // whoever it is sent to is not.
      rememberMine(data.id);
      router.push(`/g/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSending(false);
    }
  }

  function next() {
    if (!enough || sending) return;
    if (last) void submit();
    else setIndex((i) => i + 1);
  }

  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden bg-[#05060a] px-6">
      {/* The same slit of light as the front page, so writing a memory happens
          in the same room the worlds are seen in. */}
      <Atmosphere preset="slit" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to right,#05060a 0%,transparent 65%),linear-gradient(to top,#05060a 4%,transparent 40%)",
        }}
      />

      <div className="relative w-full max-w-lg">
        <p className="font-mono text-[11px] tracking-[0.2em] text-white/30">
          {String(index + 1)} / {STEPS.length}
        </p>

        <h1
          style={{
            margin: "1.5rem 0 0",
            fontFamily: "var(--font-newsreader), Georgia, serif",
            fontWeight: 300,
            fontSize: "clamp(28px, 3.4vw, 44px)",
            lineHeight: 1.15,
            letterSpacing: "-.015em",
            color: "rgba(255,255,255,.92)",
          }}
        >
          {step.question}
        </h1>

        {step.hint ? (
          <p className="mt-3 text-sm leading-relaxed text-white/40">{step.hint}</p>
        ) : null}

        {step.multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={value}
            rows={5}
            placeholder={step.placeholder}
            disabled={sending}
            onChange={(e) => setAnswers((a) => ({ ...a, [step.key]: e.target.value }))}
            // Enter submits, shift+enter breaks the line - the usual bargain
            // for a box people will write a paragraph in.
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                next();
              }
            }}
            style={{
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontWeight: 300,
              fontSize: "clamp(18px, 2vw, 22px)",
              lineHeight: 1.6,
            }}
            className="mt-8 w-full resize-none border-b border-white/15 bg-transparent pb-3 text-white/90 transition-colors duration-700 outline-none placeholder:text-white/20 focus:border-[rgba(255,236,210,.45)]"
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={value}
            placeholder={step.placeholder}
            disabled={sending}
            onChange={(e) => setAnswers((a) => ({ ...a, [step.key]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") next();
            }}
            style={{
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontWeight: 300,
              fontSize: "clamp(18px, 2vw, 22px)",
            }}
            className="mt-8 w-full border-b border-white/15 bg-transparent pb-3 text-white/90 transition-colors duration-700 outline-none placeholder:text-white/20 focus:border-[rgba(255,236,210,.45)]"
          />
        )}

        <div className="mt-8 flex items-center gap-5">
          <button
            type="button"
            onClick={next}
            disabled={!enough || sending}
            className="inline-flex rounded-full bg-[rgba(255,240,220,.92)] px-7 py-3 text-[15px] whitespace-nowrap text-[#05060a] transition-colors duration-700 hover:bg-[rgb(255,240,220)] disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/30"
          >
            {sending ? "starting…" : last ? "build it" : "next"}
          </button>

          {index > 0 && !sending ? (
            <button
              type="button"
              onClick={() => setIndex((i) => i - 1)}
              className="text-sm text-white/35 transition hover:text-white/60"
            >
              back
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="mt-6 text-sm leading-relaxed text-red-300/70">{error}</p>
        ) : null}

        {last && !error ? (
          <p className="mt-10 text-xs leading-relaxed text-white/25">
            Building takes about a minute. You will get a link to send them.
          </p>
        ) : null}
      </div>
    </div>
  );
}
