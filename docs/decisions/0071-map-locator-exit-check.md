# 0071 — Map locator: exit check, tentative origin, learned-id guard

- Status: Accepted
- Date: 2026-10-03
- Amends: ADR 0020 ("Locating the player", the locator notes)

## Context

The owner ran west from "The Entrance to Mirkwood" (map room 21165) and
the map stayed one room behind along a row of "Old Forest Road" rooms.
In `arda.mm2` the west chain is 20637 (exits s e w) → 20624 (n s e w) →
20623 (s e w) → 20611 (n s e w), all named "Old Forest Road", none with
a server id. MUME calls 20637 "Field Covered with Beets" (the map is
outdated there), so it was not located and the tracker kept 21165. The
next `w` with Room.Info "Old Forest Road" (really 20624) was matched by
step 2 (direction + name) from the stale 21165 to 20637, and every later
step matched by name only: one room off for good. Wrong matches also
taught server ids to the wrong rooms (persisted in IndexedDB), and a
learned id was checked by name only, so in a row of same-named rooms a
bad one was reused forever.

MMapper's path machine avoids this: it compares name, description and
exits, and when lost it searches again instead of stepping from a stale
position.

## Decision

1. **Step 2 (direction + name) also needs the room to agree.** With
   `exits` = Room.Info's exit set equals the map room's visible exits
   (true when Room.Info has no `exits`) and `desc` = the normalised
   descriptions are equal (unknown when either is empty):
   - from a located last room: accept when `exits` or `desc` holds. A
     changed description (outdated map, the map-demo Cobble Street case)
     is tolerated when the exits agree; a changed exit set (a found
     hidden door, an outdated exit) is tolerated when the description
     agrees. Both differing rejects the room.
   - from a tentative last room (not located itself): accept only when
     `exits` holds and `desc` does not differ.
   A rejected room falls through to step 3 (name + description), which
   finds 20624 uniquely in the bug scenario.
2. **Lost but moving.** When a Room.Info after a real `Event.Moved`
   direction is not located, the tracker advances its position along the
   last room's exit when it has exactly one target. The scene shows that
   room as not located (far outline), the view follows it, and the next
   Room.Info is located from it. No exit or several targets: the room
   stays (as before). The prespam path is drawn only while located (as
   before); a blind step (two Event.Moved) also moves from the tentative
   room.
3. **No learning from a tentative origin.** A match by direction or text
   whose last room was tentative (not located, but a room is held)
   teaches no ids, neither its own nor its neighbours'. Matches by map id
   or learned id still teach neighbour ids.
4. **Learned ids** are used only while the room's name and visible exit
   set agree with Room.Info (exits only when Room.Info lists them);
   otherwise the id is forgotten, as for a name mismatch before.

Performance: names (and descriptions in step 2) are compared with
`a === b` first and normalised only when they differ, and the step-1
name normalisation is no longer done up front. The description is read
in step 2 only when the exits disagree or the origin is tentative.

## Measurements

`node bench/map-locate-bench.ts 100000`: a seeded random walk on
arda.mm2, 100 000 arrivals (`Event.Moved` + `Room.Info`, map server ids
where the map has them, else an invented id for half the rooms, exit
ids likewise, 2 % changed descriptions), median of 7 rounds, Node 26,
six interleaved runs each:

| | Tracker.apply per Room.Info | locate() per Room.Info |
|---|---|---|
| before (0d1a3ff) | 0.75–0.91 µs | 0.30–0.41 µs |
| after | 0.47–0.53 µs | 0.07–0.12 µs |

Located-but-wrong rooms in the walk: 0 before and after. The checks
alone (before the identical-string fast path) measured within noise of
the old code for Tracker.apply and about +0.06 µs for locate().

## Consequences

- Tests: `tests/unit/map-tracking.test.ts` "lost on a row of lookalike
  rooms (ADR 0071)" replays the Old Forest Road walk (none → 20624 dir →
  20623 dir → 20611 dir), the rejected lookalike, the tolerances, the
  learn guard and the learned-id exit check. map-demo still locates 29
  of 29.
- A room whose exits and description both changed in MUME is not
  located by direction any more; the tentative advance keeps the
  position on track until a room agrees.
- Bad ids already stored in IndexedDB by the old rules are dropped the
  first time their room's name or exit set disagrees.
