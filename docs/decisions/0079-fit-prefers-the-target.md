# 0079 — A mark's fit prefers the target when the player cannot fit too

- Status: Accepted
- Date: 2026-10-06
- Builds on ADR 0057 (script marks, `fitRooms`), ADR 0077 §B (Map search
  focus)

## Context

A focused mark (Map search, `mapMark` with `focus`) fits the view to the
player's room and the marked rooms. When they lie so far apart that even
ZOOM_MIN cannot show both, `fitRooms` clamped the zoom but still centred
halfway between them, so the view often showed neither. The owner
(2026-10-06): in that case send the view to the searched room.

## Decision

`fitRooms` first tries the player plus the targets as before. If that
needs a zoom below ZOOM_MIN:

1. it fits the targets alone, on the first target's layer;
2. if the targets alone still need less than ZOOM_MIN, it centres on the
   first target (the nearest one: `findRooms` and Map search order by
   distance) at ZOOM_MIN.

Everything else is unchanged: it never zooms in, a move under a held
focus re-fits (and so stays on the target while the player is far away),
and the focus's end restores the zoom centred on the player.

## Consequences

- A far search result is always on screen; the player's own room may be
  off screen until the focus ends or the player pans.
- The layer follows the target when the player is left out.
