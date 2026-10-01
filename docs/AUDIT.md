# Audit list

Known issues, deliberately deferred. Kept here so nothing survives only in a chat log.

Ordered by what would cost the most if a judge hit it, not by effort.

---

## Open

### Worlds — reported by Manuel, not yet characterised
Bugs seen in some of the seeded worlds. **No detail captured yet**; this is a placeholder so it
is not lost. Needs: which gift id, what was wrong, and a screenshot if it is visual.

### Object placement
- Contact shadow strength is a guess (0.5 centre, 0.22 mid). Unverified against a real screen, and
  a one-line change once someone can see one.

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
- **Objects facing the wrong way.** Two separate faults needing two rules: flat slivers standing on
  edge (a brass key upright), and long objects pointing away from the visitor because Tripo put
  their long axis on Z, which is the direction the spawn faces. The sliver rule is deliberately
  conservative - it moves 1 object in 44 and leaves the tin cup, hand broom, scarf and poster alone,
  because nothing in the bounds tells a cup from a key.
- **Everything on the worktop.** A kerosene stove belongs on the floor. Decided by size against the
  visitor's own height, never by the object's name, so it means the same in a bedroom.
