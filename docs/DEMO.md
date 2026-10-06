# Demo and submission guide

This is the tracked source of truth for Lantern's judge walkthrough, launch
film, five-minute product demo, and required visual asset board. Generated media
lives under ignored `shots/`; the renderer, scripts, timings, narration, and
verification rules remain in git.

## Contents

- [Submission set](#submission-set)
- [Five-minute judge walkthrough](#five-minute-judge-walkthrough)
- [Video source](#video-source)
- [Rendering](#rendering)
- [Narration and disclosure](#narration-and-disclosure)
- [Asset board](#asset-board)
- [Verification](#verification)

## Submission set

Tripothon requires three distinct artifacts:

1. **Playable demo** — the deployed Lantern app.
2. **Screen-recorded walkthrough** — the complete product journey, not only a
   launch trailer.
3. **Visual asset board** — composed evidence frames and environment stills.

Lantern additionally has a 90-second motion-designed launch film. It is the
hook, not a replacement for the required walkthrough.

## Five-minute judge walkthrough

| Time | Chapter | Evidence |
|---|---|---|
| 0:00–0:30 | proposition | landing page; actual hero world behind the sentence |
| 0:30–1:20 | receiving | threshold card, named recipient, deliberate step inside |
| 1:20–2:10 | exploring | real walking and looking in the sewing room |
| 2:10–2:55 | creating | the three intake prompts; no fabricated submit/result |
| 2:55–3:35 | progressive world | 100k preview, enhancing label, same-camera full-res swap |
| 3:35–4:20 | tool synergy | independent Tripo objects inside Marble; normal and labelled collider evidence |
| 4:20–4:45 | grounded runtime | supported spawn, collision, surface seating |
| 4:45–5:00 | sharing | recipient link and opt-in Constellation |

Keep every label and evidence field readable. Hold on details before moving on;
use eased moves, not constant drift. Product interactions must be captured from
the real application. Screenshots from the same verified session are acceptable
for reading pauses.

## Video source

Reusable renderer: `scripts/render-launch-video.mts`

The renderer reads verified captures from `shots/asset-board/` and
`shots/sweep/`, composes rounded browser cards, builds reusable chapter clips,
and preserves earlier masters under versioned filenames.

Expected ignored output structure:

```text
shots/demo/
  cards/
  segments/
  lantern-launch-preview-v1-18s.mp4
  lantern-launch-v1-90s.mp4
  lantern-product-demo-v1-5min.mp4
```

Rejected exports keep `rejected` in the name; never overwrite a prior master.

## Rendering

Render in order:

```powershell
npm run video:launch -- preview
npm run video:launch -- 90
npm run video:launch -- 300
```

The first command produces the required 18-second motion preview. The 90-second
piece is a product-launch film with designed motion and sound; it does not need
narration. The 300-second piece is the complete product walkthrough and leaves
room for natural speech.

Masters are 1920×1080, 60 fps, H.264 MP4. Motion is generated from stable
high-resolution product captures so pans and zooms are deterministic instead of
the shaky result of hand-steered browser recording.

## Narration and disclosure

The tracked narration master is [DEMO-NARRATION.md](DEMO-NARRATION.md).

The current production track uses Microsoft `en-NG-EzinneNeural` at `-5%` and
is explicitly disclosed as a synthetic neural voice. Do not describe downloaded
or synthesized speech as a human recording. Replace it with a consenting human
recording when one is available; the visual edit is timed to accept that track.

The large presentation cursor is reconstructed editorially and labelled on
screen. It improves readability but is not proof of a click, transaction, share,
or successful generation. Normal product captures and collider debug views are
real; debug evidence is labelled **EDITORIAL EVIDENCE**.

## Asset board

The board uses installed system Chrome with its real GPU:

```powershell
npm run capture:board -- all
npm run capture:compose
```

The capture runner rejects software rendering, waits for the requested splat,
collider, and object count, then saves repeatable frames. Exact gift ids, camera
query parameters, and shot rationale live in [CAPTURE.md](CAPTURE.md).

Never use `shot.mjs` for final splat judgement. It is a diagnostic for page and
network behavior; software rendering can produce an empty or misleading world.

## Verification

For each final MP4, verify:

- resolution is exactly 1920×1080;
- average and nominal frame rate are 60 fps;
- duration is 18, 90, or 300 seconds as intended;
- decoded frame count matches duration × frame rate;
- the file decodes from beginning to end;
- UI labels are readable at 100% playback size;
- chapter transitions are clean and do not flash stale frames;
- audio is present where intended and does not clip;
- earlier versions still exist separately.

The renderer performs metadata and decode checks after export. Review the final
master at normal speed as well; a technically valid file can still contain a
bad hold, unreadable text, or uncomfortable motion.
