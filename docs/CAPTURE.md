# Capture plan — the video and the asset board

Both are **required** submission deliverables, and final capture needs a real GPU, a real screen,
a real microphone and a connection that can pull 23 MB. This is the plan so capture is execution
rather than design.

Base URL: `https://lantern-manuel-dev01s-projects.vercel.app`

---

## Composing a frame

`?cam=x,y,z&look=x,y,z` pins the camera exactly. A pinned camera takes neither the walker nor
orbit, and draws no "click to look around" caption, so it is safe for stills.

The workflow is: **walk to a frame, read it off the HUD, pin it.**

1. Open the gift with `?hud=1` and walk until it looks right.
2. The HUD prints `pos x y z` then `dir x y z`, in that order.
3. Reopen as `?cam=<pos>&look=<dir>` — same frame, repeatable, reload-proof.

Add `&enter=1` to skip the threshold card, or every capture is a photograph of the door.
Wait for the HUD to read **`on mesh`** and **`objects n/n`**, and for the **enhancing this room**
badge to disappear, before capturing. Until the collider lands the player is standing on a flat
stand-in; until enhancement finishes the room is a deliberately soft streaming preview.

---

## The two videos

The **90-second film is the product launch piece**: designed type, eased moves, sound and clicks,
no required narration. It opens on the recipient experience and sells the idea quickly.

The **five-minute film is the scored product walkthrough**: landing page, receiving, real
navigation, creation flow, progressive detail, object/world integration, collider evidence and
sharing. It leaves enough time for calm narration and never turns editorial cursor movement into
evidence of a click or completed action.

Both are rendered from stable, verified captures rather than hand-steered recording, which keeps
the motion smooth and reproducible. Source, timings, disclosure, commands and final-file checks
live in [DEMO.md](DEMO.md); the narration master is [DEMO-NARRATION.md](DEMO-NARRATION.md).

---

## The asset board

Several judges are VFX and 3D artists and will read this board as a portfolio piece. Compose it;
do not screenshot whatever happened to be on screen.

Shots worth having:

1. **The threshold.** `/g/<id>` with no params. The card over the loading room.
2. **Arrival.** The first frame inside, spawn position, full_res.
3. **The occlusion proof.** A Tripo object half behind splat geometry. This frame *is* the Tool
   Synergy claim (25% of both tool tracks) and should be shot deliberately, pinned with `?cam=`,
   and shot twice — once with `?debug=collider` to show the mesh doing the work, once without.
4. **An object close up**, sharp mesh against soft splats. The contrast is the argument: Marble
   makes the place, Tripo makes the things in it.
5. **The same room at two levels of detail**, `?lod=100k` against `?lod=full_res`, pinned to the
   identical camera. Shows the streaming ladder honestly.
6. **The constellation**, full of rooms built for named people.

### Gifts to shoot

| id | memory | note |
|---|---|---|
| `1KAJZTJBK1` | her kitchen in Lagos | curated tabletop still life; strongest placement close-up |
| `Z1MV55219C` | the front room in Enugu where she sewed | sewing-machine composition; strongest object close-up |
| `WBRE2FTFGN` | the roof of the block of flats | repaired mesh-derived spawn; strongest wide arrival shot |

These three are live and shared. **At least one gift in the video should be a real one**, sent to
someone who did not know it was coming. That is Phase 5's actual milestone and the only part of
the film that cannot be faked.

### Reproduce the board

The final stills use system Chrome's real GPU. `shot.mjs` is deliberately a software-rendered
diagnostic and must not be used for these images: Spark measured at roughly zero fps there and
returned blank or partial splat frames.

```powershell
npm run capture:board -- all
npm run capture:compose
```

The capture runner refuses a SwiftShader/software renderer and waits for the requested splat,
the collider, and every object request before saving. The individual PNGs and the composed board
land in `shots/asset-board/`; that directory is intentionally ignored because these are generated
submission artifacts, not application assets.

---

## Before recording

- Make the gift you will film **in advance**; a full world takes about twenty minutes end to end.
- Record the voice notes before filming the walk-through, or the objects will be silent.
- Check `objects n/n` reaches the full count, the HUD names `splat-full_res.spz`, and the
  enhancement badge has disappeared before you start. The streaming preview is useful to a
  visitor and wrong for a final-quality still.
