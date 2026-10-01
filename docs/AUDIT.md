# Audit list

Known issues, deliberately deferred. Kept here so nothing survives only in a chat log.

Ordered by what would cost the most if a judge hit it, not by effort.

---

## Open

### Worlds — reported by Manuel, not yet characterised
Bugs seen in some of the seeded worlds. **No detail captured yet**; this is a placeholder so it
is not lost. Needs: which gift id, what was wrong, and a screenshot if it is visual.

### Object placement
- A kerosene stove now seats on the worktop with everything else. On the floor looked better for
  that object specifically. If this is worth fixing it should be decided by size or height, never
  by the object's name, so it generalises past kitchens.
- Object orientation is whatever Tripo produced. The wooden spoon stands on end. There is no
  rotation applied beyond `rotationY`, and nothing inspects which way is "up" for a given mesh.
- Contact shadow strength is a guess (0.5 centre, 0.22 mid). Unverified against a real screen.

### Performance and weight
- `splat-full_res.spz` is **23 MB**. The ladder now climbs 100k → 500k → full_res, so the room is
  usable long before it arrives, but the total a gift pulls is still large.
- Mobile has never been measured. STRATEGY's target is ≥30fps and first frame under 10s on a
  mid-range Android over cellular. Untested.

### Consistency between readers
Two readers in different places can see different versions of the same Blob document for a short
window. A gift shared in one place is not instantly shared everywhere, and the constellation can
lag a minute behind the toggle. Nothing depends on it being instant, but it reads as broken to
whoever just ticked the box.

### Auto-rig
Implemented, correct, and effectively inert — see the Phase 3 section in STRATEGY. `rigCheck` and
`rigModel` work; `retargetAnimation` fails `1004` on every variant tried. The LLM prompt's NO
PEOPLE rule means almost nothing in a real gift is riggable anyway.

---

## Fixed, kept for the record

These each looked like a different bug and were the same mistake: trusting the bounding box, or
trusting a document instead of the store.

- **Objects outside the world.** The placement arc asked for more depth than the room had.
- **Objects under the floor.** Rested on `bounds.min.y`, which is not the floor.
- **Objects on the roof.** The ground ray started above the building and kept the first surface
  it met.
- **Objects floating with no shadow.** They were touching; nothing in a splat scene casts a
  shadow, so contact had to be drawn.
- **Objects on the wrong part of a surface.** The score aimed mid-range and pushed everything to
  the back edge of the worktop.
- **Gifts walking backwards through their stages.** Overlapping ticks raced, and the slower one
  won by writing last. Found by seeding, would have hit real senders.
- **A fabricated link.** A TinyURL that never existed, handed over as if real.
