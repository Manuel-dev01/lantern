"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import Atmosphere, { MemoryLight } from "@/components/Atmosphere";
import Threshold from "@/components/Threshold";
import VoiceNotes from "@/components/VoiceNotes";
import { isMine } from "@/lib/mine";
import { type Gift, readableName, stageLabel } from "@/lib/gifts";

const WorldViewer = dynamic(() => import("@/components/WorldViewer"), { ssr: false });

/**
 * A gift, while it is being built and once it is finished.
 *
 * The waiting is deliberately not a spinner. STRATEGY is explicit that the
 * wait is part of the ritual: the sender sees their own words back while the
 * place is made for them. A draft takes about 27 seconds and a full world over
 * five minutes, so this screen is read, not glanced at.
 *
 * Polling here is also what drives the pipeline - there is no worker. Each
 * `tick` advances one stage server-side, so stopping the poll stops the build.
 */

/**
 * Slow enough not to hammer the providers, fast enough to feel alive.
 *
 * Not faster: Blob keeps a 60-second minimum cache on the gift document, so a
 * tighter poll buys no extra freshness and only adds redundant calls.
 */
const POLL_MS = 5000;

export default function GiftView({ gift }: { gift: Gift }) {
  const router = useRouter();
  const [stage, setStage] = useState(gift.stage);
  const [error, setError] = useState(gift.error);
  const [made, setMade] = useState(0);
  const [toMake, setToMake] = useState(gift.objects?.length ?? 0);

  /**
   * Whether the visitor has stepped through the door.
   *
   * `?enter=1` skips it, which the screenshot script and any debug link need -
   * otherwise every capture is a photograph of the card.
   */
  /** Whether this browser is the one that made this gift. */
  const [mine, setMine] = useState(false);
  const [recorded, setRecorded] = useState(false);

  // localStorage is not readable while rendering on the server, so this is
  // settled after mount rather than in the initialiser.
  useEffect(() => {
    setMine(isMine(gift.id));
  }, [gift.id]);

  const [entered, setEntered] = useState(false);

  // The server cannot see the query string here. Reading it in the state
  // initialiser made `?enter=1` render a door on the server and a world on the
  // client, which React correctly reported as a hydration mismatch.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("enter") === "1") {
      setEntered(true);
    }
  }, []);

  /**
   * Stop polling only when there is nothing left to wait for.
   *
   * `ready` alone is not enough. The world arrives through a server re-render,
   * and that refresh is fire-and-forget - if it is dropped, which is routine
   * on a slow connection, the stage says ready, `gift.world` is still
   * undefined, and the poll had already shut itself down. The result was a
   * twenty-minute wait ending on the word "ready" for ever.
   */
  const done = (stage === "ready" && Boolean(gift.world)) || stage === "failed";

  /** Consecutive failed polls. The pipeline is the poll, so this is a stall. */
  const [silent, setSilent] = useState(0);

  /**
   * Follow the server when it disagrees with us.
   *
   * `stage` is seeded from the prop once and then owned locally, and `done`
   * includes "failed" - so once a gift failed, polling stopped and nothing
   * could ever move the screen off it again. A retry that worked perfectly
   * well on the server left the visitor looking at "something went wrong".
   */
  useEffect(() => {
    setStage(gift.stage);
    setError(gift.error);
  }, [gift.stage, gift.error]);

  useEffect(() => {
    if (done) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/gifts/${gift.id}/tick`, { method: "POST" });
        if (cancelled) return;

        // A non-ok answer is not nothing. Swallowing it is what left a gift
        // frozen on "finding the things that mattered 2 of 4" for ever while
        // the storage behind it was returning 403 - the poll *is* the
        // pipeline, so a failing poll means nothing is happening at all.
        if (!res.ok) {
          setSilent((n) => n + 1);
          return;
        }
        setSilent(0);
        const data = (await res.json()) as {
          stage: Gift["stage"];
          error?: string;
          ready: boolean;
          objectsDone?: number;
          objectsTotal?: number;
        };
        if (cancelled) return;

        setStage(data.stage);
        setError(data.error);
        if (typeof data.objectsDone === "number") setMade(data.objectsDone);
        if (typeof data.objectsTotal === "number") setToMake(data.objectsTotal);

        // The finished world lives on the server document, not in this
        // response, so let the server component hand it down.
        if (data.ready) router.refresh();
      } catch {
        // A dropped poll is not a failure - this connection drops often. The
        // interval simply tries again.
      }
    }

    // Sequential, not on an interval.
    //
    // setInterval fires whether or not the last tick has returned, and a tick
    // can take a minute. Overlapping ticks each read the whole gift, work, and
    // write the whole gift back, so the slower one wins by writing last - which
    // walked two finished gifts backwards into an earlier stage.
    let handle: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await tick();
      if (!cancelled) handle = setTimeout(loop, POLL_MS);
    };
    void loop();

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [gift.id, done, router]);

  if (stage === "ready" && gift.world) {
    const objects = gift.world.objects ?? [];

    return (
      <div className="relative h-full w-full">
        {/* Mounted now, behind the card, so the world's several megabytes are
            downloading while the visitor reads whose gift this is. */}
        <WorldViewer world={gift.world} />

        {/* The sender is offered the microphone; the recipient never is.
            Being asked to record a message onto a gift you were given makes
            no sense, and there is no login to tell them apart - only the fact
            that one of the two browsers is the one that made it. */}
        {mine && !recorded && objects.length ? (
          <VoiceNotes
            giftId={gift.id}
            objects={objects}
            alreadyShared={Boolean(gift.shared)}
            onDone={() => {
              setRecorded(true);
              // The voices were just written to the gift, and the world on
              // screen was built before they existed.
              router.refresh();
            }}
          />
        ) : entered ? null : (
          <Threshold gift={gift} onEnter={() => setEntered(true)} />
        )}
      </div>
    );
  }

  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden bg-[#05060a] px-6">
      {/* The same light that is behind the door, because this is the same
          room being built - the sender is already standing in the hallway. */}
      <Atmosphere preset="memory">
        <MemoryLight hue={52} chroma={0.1} y={54} tall />
      </Atmosphere>

      <div className="relative max-w-md text-center">
        {readableName(gift.toName) ? (
          <p className="text-[11px] tracking-[0.26em] text-white/60 uppercase">
            for {readableName(gift.toName)}
          </p>
        ) : null}

        {gift.memory ? (
          <blockquote
            style={{
              margin: "2rem 0 0",
              fontFamily: "var(--font-newsreader), Georgia, serif",
              fontStyle: "italic",
              fontWeight: 300,
              fontSize: "clamp(20px, 2.6vw, 30px)",
              lineHeight: 1.35,
              textWrap: "pretty",
              color: "rgba(255,255,255,.9)",
            }}
          >
            &ldquo;{gift.memory}&rdquo;
          </blockquote>
        ) : (
          <p className="mt-8 text-lg leading-relaxed text-white/80">A place is being made.</p>
        )}

        <p className="mt-10 text-sm tracking-wide text-white/50">
          {stage === "failed" ? "something went wrong" : `${stageLabel(stage)}…`}
          {/* Counting the things is the difference between a wait that is
              happening and a wait that has hung. Objects take the longest of
              any stage, so this is where it matters most. */}
          {stage === "objects_generating" && toMake > 0 ? ` ${made} of ${toMake}` : ""}
        </p>

        {/* Said plainly, and only once it is clearly not a blip. The detail
            stays small and monospaced: it is for whoever is debugging, not
            for the person who was sent a gift. */}
        {stage === "failed" ? (
          <div className="mt-6">
            <p className="text-sm leading-relaxed text-white/55">
              Nothing was lost. This can usually be picked up where it stopped.
            </p>
            <button
              type="button"
              onClick={() => {
                setSilent(0);
                void fetch(`/api/gifts/${gift.id}/tick?retry=1`, { method: "POST" })
                  .then(() => router.refresh())
                  .catch(() => undefined);
              }}
              className="mt-6 inline-flex rounded-full border border-white/25 px-6 py-2.5 text-xs tracking-[0.15em] text-white/80 uppercase transition-all duration-700 hover:border-[rgba(255,236,210,.55)] hover:bg-[rgba(255,236,210,.08)]"
            >
              try again
            </button>
            {error ? (
              <p className="mt-6 font-mono text-[10px] leading-relaxed text-white/50">{error}</p>
            ) : null}
          </div>
        ) : null}

        {/* Four misses is twenty seconds of hearing nothing back. */}
        {stage !== "failed" && silent >= 4 ? (
          <p className="mt-4 text-xs leading-relaxed text-white/55">
            Still trying, but not hearing back. This page keeps going on its own — it is safe to
            close and come back to the link.
          </p>
        ) : null}

        {readableName(gift.fromName) && stage !== "failed" ? (
          <p className="mt-10 text-[11px] tracking-[0.24em] text-white/55 uppercase">
            from {readableName(gift.fromName)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
