"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import Threshold from "@/components/Threshold";
import { type Gift, stageLabel } from "@/lib/gifts";

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
  const [entered, setEntered] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("enter") === "1",
  );

  const done = stage === "ready" || stage === "failed";

  useEffect(() => {
    if (done) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch(`/api/gifts/${gift.id}/tick`, { method: "POST" });
        if (!res.ok || cancelled) return;
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

    void tick();
    const handle = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [gift.id, done, router]);

  if (stage === "ready" && gift.world) {
    return (
      <div className="relative h-full w-full">
        {/* Mounted now, behind the card, so the world's several megabytes are
            downloading while the visitor reads whose gift this is. */}
        <WorldViewer world={gift.world} />
        {entered ? null : <Threshold gift={gift} onEnter={() => setEntered(true)} />}
      </div>
    );
  }

  return (
    <div className="grid h-full w-full place-items-center px-6">
      <div className="max-w-md text-center">
        {gift.toName ? (
          <p className="text-sm tracking-wide text-white/40">
            for {gift.toName}
          </p>
        ) : null}

        {gift.memory ? (
          <p className="mt-6 text-lg leading-relaxed text-white/80">
            &ldquo;{gift.memory}&rdquo;
          </p>
        ) : (
          <p className="mt-6 text-lg leading-relaxed text-white/80">
            A place is being made.
          </p>
        )}

        <p className="mt-10 text-sm tracking-wide text-white/50">
          {stage === "failed"
            ? "something went wrong"
            : `${stageLabel(stage)}…`}
          {/* Counting the things is the difference between a wait that is
              happening and a wait that has hung. Objects take the longest of
              any stage, so this is where it matters most. */}
          {stage === "objects_generating" && toMake > 0
            ? ` ${made} of ${toMake}`
            : ""}
        </p>

        {stage === "failed" && error ? (
          <p className="mt-3 font-mono text-xs leading-relaxed text-red-300/60">
            {error}
          </p>
        ) : null}

        {gift.fromName && stage !== "failed" ? (
          <p className="mt-10 text-sm tracking-wide text-white/40">
            from {gift.fromName}
          </p>
        ) : null}
      </div>
    </div>
  );
}
