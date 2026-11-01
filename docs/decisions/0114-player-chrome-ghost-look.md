# 0114 — The players in the ghost look (stage 32c)

- Status: Accepted
- Date: 2026-11-01
- Related: stage 32 (`docs/stages/32-players.md`, "Owner pick" and "32c
  plan"), the A2 mockup (`notes/research/player-mockups/`, `boardA2`).
  Amends ADR 0018 (the log player's chrome), ADR 0021 (the viewer
  settings' UI) and ADR 0110 (the reel's gear and empty stage).

## Context

The log player, the HTML replay and the Spotlights reel drew their chrome
as TUI: a box-drawn control box with `◄◄ Rewind`, a settings section
folded into it behind `⚙`, a two-column half-block strip with `K►`
letters, and the reel's 30 × 7 info box with the gear popup for its
filter. The owner (2026-11-01) wants them in the ghost look of the in-game
popups, steps of 10 s, a display icon, and the reel's filter in its info
card; the pick was direction A as revised (A2).

## Decision

### Control box (`src/player/view.ts`)

- Plain DOM, one row, dark glass (`rgba(10,10,10,.95)`, `#2a2a2a` border,
  6 px radius) at fixed px sizes (13 px, the mockup's): To the start,
  −10 s, Play/Pause (round), +10 s, speed `◄ 1× ►` (one step per click
  through 0.25–8×, the arrow disabled at its end), the time `00:12 /
  02:02`, then Panes, Display, the mode's own buttons and Close. Close
  is ESC (`closeTitle`; the run log `Back to History (Esc)`, the reel
  `Back to the start page (Esc)`); the HTML replay has none and keeps its
  Fullscreen as an icon button (`boxButtons` now carry an icon).
- Fixed px rather than the cell font: Display's font size changes the
  game text, not the controls, and the box looks the same in every log.
- The box's buttons never take the focus on a press (mousedown default
  prevented), so Space after a click plays or pauses rather than pressing
  the button again; Tab still reaches them.
- On a player too narrow for the full box (a phone) it goes compact: next
  to the rail, without the time, with narrower buttons. The width is
  measured once at full size, so the switch does not oscillate.

### Popups

- Panes (pane switches in PANE_IDS order, then script panes, and Reset
  layout, dim when there is nothing to reset) and Display (font size
  segmented Default / Small / Medium / Large; colours as six swatches with
  each theme's background, Default the recorded one). They replace the
  folded settings section of ADR 0021; `ViewerControls` is now
  `{ panes?, font, setFont, theme, setTheme, swatch }`.
- One at a time, above the box, right edges aligned, height capped by the
  room above. They carry `data-wc-own-keys` (keys there are theirs, Tab
  wraps inside as in ADR 0108, Esc in them closes them). Opened from the
  keyboard they take the focus; opened by a press they leave the keys with
  the player. Esc with a popup open closes it before anything else.
- The chrome does not auto-hide while a popup is open (ADR 0021 let the
  section hide; a popup over the game that vanishes under the pointer was
  worse).
- The reel gets Display only (`viewerSettings: 'display'`): its panes stay
  off (ADR 0032); font and colours survive its rebuilds.

### Rail and markers

- `RAIL_W` = 12 px at the right edge (narrower than the two cells it
  replaces); the stage and the font fit (`playerFontSize` now reserves px)
  end left of it. A 4 px track inset 10 px at both ends, the played part,
  a gold 12 × 3 px playhead. Click and drag seek as before, with the
  `MM:SS` hint; on a coarse pointer the touch target reaches 10 px over
  the stage's edge.
- Markers are the kind icons (Death a red skull, PvP kill orange crossed
  swords, Achievement a gold star, Level-up green double chevrons; K/D/A/L
  map to them), left of the rail at the earliest event's place. Events
  closer than 18 px share one marker with one icon per kind (MARK_ORDER);
  the tip lists them as before.

### Header

- Kept as the top line, its two parts on dark chips (opaque, since the
  game text's first line runs under it); the hint fitting is unchanged
  (cells), with each chip's padding (two cells) counted. Hints: run log `Space
  Play/Pause · ← → 10 s · 1–6 Speed · ↑↓ Cursor · ESC Back`; reel `← →
  Prev/next · Shift ← → 10 s · 1–6 Speed · ESC Back`; replay `Space Play ·
  ← → 10 s · ↑↓ Scroll · 1–6 Speed · F Fullscreen`.

### Keys

- ← / → (with or without Shift) go back or forward 10 s, Home goes to the
  start (it moved the cursor to the first line before; ↑↓, PgUp/PgDn and
  End still move the cursor), 1–6 the speed. The reel's keys hook takes
  plain ← → for previous / next as before, so its 10 s keys are Shift+← →.

### Spotlights card (`src/player/spotlight-card.ts`)

- Replaces the TUI info box and the gear popup: `‹ Spotlight n / N ›`
  (disabled at the ends), the kind icon and name in its colour, the label
  bold (two lines at most), `character · date`, and the countdown as a
  2 px line draining from both sides to the moment. Below: the filter —
  Kinds and Characters fold out (folded: a summary, `All`, `3 of 4`,
  names), Period is a native list. The rules and patches are the popup's
  (moved to `src/share/spotlights.ts`); the names come from
  `RunLibrary.characters()` through `ReelOptions.characters`.
- Made once per open and kept on the player element across rebuilds, so a
  fold stays open and the focus stays while the reel rebuilds under it.
  It carries `data-wc-own-keys`; a press does not move the focus into it
  (the reel keeps ← → and Space), Esc in it gives the keys back, and the
  Period list gives them back once chosen.
- 330 px at the top right, under the header line; on a narrower player it
  shrinks to the room left (so the filter stays reachable on a phone) and
  hides below 240 px.
- Nothing passes: the reel stops, the card stays with its filter and says
  `No spotlights match your settings.`; the stage behind is blank with a
  top line `Spotlights · Nothing to play · ESC Back`. The empty stage's
  `Settings…` of ADR 0110 is gone (the filter is in the card).
- The gear (`PlayerViewOptions.gear`, `setGearOn`) and the settings
  popups' `spotlights` target are removed. The start page's "filtered"
  pages keep their `Settings…` popup (`SpotlightsPopup`), drawn by the
  page itself.

### HTML replay

- The same `PlayerView`: the chrome's CSS and icons are bundled into the
  replay runtime; nothing is fetched (checked from `file://` with the
  network refused).

## Consequences

- One look for the three players and the in-game popups.
- The rail and the compact box give the game text a little more room.
- The filter is always in view in the reel, at the cost of a taller card
  over the game text's top right (folded, three rows).
- The ADR 0021 settings section, the ADR 0110 gear and its popup target,
  and the TUI box helpers (`stripCells`, `countdownRow`, `labelLines`,
  `boxFits`) are gone.
