# 0032 — Marker hover tips, bare Spotlights reel

- Status: Accepted
- Date: 2026-09-29
- Amends: ADR 0018 (markers), ADR 0019 ("Spotlights", "Replay payload"),
  ADR 0021 (the reel gets the gear)

## Context

Owner feedback (2026-09-29):

1. Spotlights from the start menu are short snapshots: no panes (map,
   comm …) and no gear in the control box.
2. Hovering a strip marker (K, D, A, L) should show a small text near it
   saying what happened (which player died, …), in every player: RUN
   LOG, Spotlights and the HTML replay.

## Decision

### Bare reel

`openSpotlightReel` sets a viewer override with every pane off before it
opens the chain (so no VIEW record switches one on again) and passes
`viewerSettings: false` (no gear, no settings section). The info box
still sits at the game text's top right, which is now the whole stage.

### Marker tips

- `markTip(event, level?)` (src/player/strip.ts): `Killed *Name the
  Race* (1.2k xp)`, `Died (level N)`, `Reached level N`,
  `Achievement: …`. `markersOf` fills `Marker.tip`.
- `PlacedMark { letter, offset, tip? }` is what the view takes;
  `markRows` gives each row `tips`: one `L  text` line per marker, in
  time order. A marker without a tip gets its letter's name
  (`LETTER_TIPS`: Player kill, Death, Achievement, Level up).
- The reel's tips name the character (`Rasta: Killed …`), since one reel
  mixes characters.
- HTML replay: payload markers carry `tip` (optional, additive, schema
  unchanged). Replays exported before this show the letter names.
- View: `.wc-player-tip`, shown on `pointerover` of a marker row, one
  cell row per line, ending where the marker's text starts, from the
  marker's row down (moved up when it would pass the bottom); body
  colour on the `--c-line-hl` band. It hides on `pointerout`, with the
  chrome, and when the markers are redrawn.

## Consequences

- Touch devices get no tip (no hover); a tap still seeks.

## Amendment 2026-09-29 — no xp in kill tips

Owner feedback: the xp gained on a player kill is too much information in
a tip. `markTip` now gives `Killed *Name the Race*` only (the line above
keeps the original wording for the record). HTML replays exported before
this carry the old text in their payload and keep showing it.

## Amendment 2026-09-29 — no letter prefix

Owner feedback: the tip lines drop the `L  ` prefix; `markRows` gives
`tips` as the plain texts (`Reached level 42`), one line per marker, in
time order. This applies to old HTML replays opened in a new build only
if re-exported (the replay page code ships in the file).
