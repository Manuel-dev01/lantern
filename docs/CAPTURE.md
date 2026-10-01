# Capture plan — the video and the asset board

Both are **required** submission deliverables, and neither can be made by me: recording needs a
real screen, a real microphone and a connection that can pull 23 MB. This is the plan so Oct 3 is
execution rather than design.

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
Wait for the HUD to read **`on mesh`** and **`objects n/n`** before capturing. Until the collider
lands, the player is standing on a flat stand-in and nothing in frame is where it will end up.

---

## The video — 90 seconds

The structure STRATEGY fixed, with what to actually record against each beat. It opens on the
**recipient**, not the technology. A judge who watches twenty of these has seen twenty tool demos.

| time | beat | what to record |
|---|---|---|
| 0–20s | the hook | A real person opening a real link on a phone. Their face, then their screen. No narration over it. |
| 20–60s | the create flow | `/make`, typing a genuine memory, the wait screen counting the things, the gift opening. Cut the wait down, but show that it is a wait. |
| 60–90s | the technical reveal | Marble's room, Tripo objects inside it, an object passing behind and in front of real geometry. Then the voice note firing as you walk up to something. |
| last 15s | the constellation | `/constellation`, then one card opening into a world. |

**The hook is the whole film.** If the first twenty seconds are a screen recording of a form, the
rest does not matter.

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
| `S65X3KQAZT` | a kitchen in Lagos | objects on the worktop; the one most walked and most debugged |
| `WMSSFM4WRF` | a sewing room in Enugu | full quality, five objects |
| `XE7ZRG0GJ1` | a rooftop at six o'clock | outdoor, good for the wide arrival shot |
| `ZPRNWX3S5W` | a corner shop | dark interior, strong contrast for object close-ups |

These four are seeded and shared. Their memories are written, not real — they exist so a judge
finds a populated gallery. **At least one gift in the video should be a real one**, sent to
someone who did not know it was coming. That is Phase 5's actual milestone and the only part of
the film that cannot be faked.

---

## Before recording

- Make the gift you will film **in advance**; a full world takes about twenty minutes end to end.
- Record the voice notes before filming the walk-through, or the objects will be silent.
- Check `objects n/n` reaches the full count, and that the splat has reached full_res, before you
  start. The sharpening is visible on camera and will look like a glitch.
