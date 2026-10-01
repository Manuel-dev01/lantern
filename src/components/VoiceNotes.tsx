"use client";

import { useEffect, useRef, useState } from "react";

import type { GiftObject } from "@/lib/types";

/**
 * Leaving your voice on the things in the room.
 *
 * Everything else in a gift is generated: Marble makes the place, Tripo makes
 * the objects, an LLM decides which objects. This is the only part that is
 * actually the sender, and it is the part that makes a world a gift rather
 * than a demo - the pan is just a pan until someone says what it was for.
 *
 * Deliberately one take. There is no trimming, no waveform, no re-record
 * ritual beyond pressing the button again. People edit themselves into
 * blandness when you give them tools to, and a slightly awkward real sentence
 * is worth more here than a polished one.
 */
export default function VoiceNotes({
  giftId,
  objects,
  onDone,
}: {
  giftId: string;
  objects: GiftObject[];
  onDone: () => void;
}) {
  const [recordingFor, setRecordingFor] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      objects.filter((o) => o.audioUrl).map((o) => [o.id, o.audioUrl as string]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  // A live microphone outlives this component if nobody stops it, and the
  // browser keeps showing the recording indicator when it does.
  useEffect(() => {
    return () => {
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function start(objectId: string) {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      chunks.current = [];

      media.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };

      media.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: media.mimeType });
        await upload(objectId, blob);
      };

      recorder.current = media;
      media.start();
      setRecordingFor(objectId);
    } catch {
      setError("I could not reach the microphone. Check the browser's permission for this page.");
    }
  }

  function stop() {
    recorder.current?.stop();
    setRecordingFor(null);
  }

  async function upload(objectId: string, blob: Blob) {
    setSaving(objectId);
    try {
      const form = new FormData();
      form.set("objectId", objectId);
      form.set("audio", blob);

      const res = await fetch(`/api/gifts/${giftId}/voice`, { method: "POST", body: form });
      const data = (await res.json()) as { audioUrl?: string; error?: string };

      if (!res.ok || !data.audioUrl) throw new Error(data.error ?? "That did not save.");
      setSaved((previous) => ({ ...previous, [objectId]: data.audioUrl! }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function share(next: boolean) {
    setShared(next);
    try {
      await fetch(`/api/gifts/${giftId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared: next }),
      });
    } catch {
      // Put the box back rather than claiming something was shared when it
      // was not - this is a consent control, so a silent failure is the one
      // outcome it must not have.
      setShared(!next);
      setError("That did not save. The place has not been shared.");
    }
  }

  return (
    <div className="absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-[#05060a] px-6 py-10">
      <div className="w-full max-w-md">
        <p className="text-sm tracking-[0.2em] text-white/35 uppercase">before you send it</p>
        <h2 className="mt-5 text-xl leading-relaxed text-white/90">
          Say something about each of these.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/45">
          They will hear it when they walk up to it. A sentence is plenty.
        </p>

        <ul className="mt-8 space-y-3">
          {objects.map((object) => {
            const isRecording = recordingFor === object.id;
            const isSaving = saving === object.id;
            const has = saved[object.id];

            return (
              <li
                key={object.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/10 px-4 py-3"
              >
                <span className="text-sm text-white/75">{object.caption ?? "something"}</span>

                <button
                  type="button"
                  disabled={isSaving || (recordingFor !== null && !isRecording)}
                  onClick={() => (isRecording ? stop() : start(object.id))}
                  className={`shrink-0 rounded-full border px-4 py-1.5 text-xs tracking-wide transition disabled:opacity-30 ${
                    isRecording
                      ? "border-red-400/60 text-red-300"
                      : "border-white/20 text-white/70 hover:border-white/50 hover:text-white"
                  }`}
                >
                  {isSaving ? "saving…" : isRecording ? "stop" : has ? "record again" : "record"}
                </button>
              </li>
            );
          })}
        </ul>

        {error ? (
          <p className="mt-6 text-xs leading-relaxed text-red-300/70">{error}</p>
        ) : null}

        {/* Asked here because this is the first moment the sender knows what
            they would be sharing. Off unless they say otherwise: the memory
            box invites people to write something true about one other person,
            and a full gallery is not worth publishing that by default. The
            memory itself is never shown in the constellation either way. */}
        <label className="mt-8 flex cursor-pointer items-start gap-3 text-left">
          <input
            type="checkbox"
            checked={shared}
            onChange={(event) => void share(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-white/80"
          />
          <span className="text-xs leading-relaxed text-white/45">
            Show this place in the constellation. Only the room and their name — never what
            you wrote.
          </span>
        </label>

        <button
          type="button"
          onClick={onDone}
          className="mt-10 w-full rounded-full border border-white/20 px-6 py-3 text-xs tracking-[0.15em] text-white/80 uppercase transition hover:border-white/50 hover:text-white"
        >
          {Object.keys(saved).length ? "done" : "skip this"}
        </button>
      </div>
    </div>
  );
}
