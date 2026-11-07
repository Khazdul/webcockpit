# 0131 — Spotlights: the gallery

- Status: Accepted (stage 46 built in wave 2 of the broad pass; owner testing with stages 42–47)
- Date: 2026-11-07
- Related: stage 46 (`docs/stages/46-spotlights.md`), ADR 0127 (the look
  pages base: the large box, the kit, the player core), ADR 0019
  (Spotlights), ADR 0021 (viewer settings), ADR 0032 (bare spotlights,
  marker tips), ADR 0110 (Spotlights settings), ADR 0114 (the ghost look
  and the Spotlights card), ADR 0125 (start surface and the lantern kit).
- Reference: `notes/research/start-menu-mockups/README.md` ("Round 7
  decisions"), `round7/spotlights/spotlights-b.html` with `spot.js` and
  `spot.css`, `round7/spotlights/CONTENT.md`.

## Context

Until stage 46, start menu → Spotlights played the reel at once in the
full-page player, with the Spotlights card at the top right (ADR 0114)
holding the current spotlight, `‹ ›`, the countdown and the filter (ADR
0110). The owner chose round 7's direction **B "Galleriet"**: the page
opens on a wall of cards in the large box of layout B, the settings are
the filter row above the wall, a card plays in a viewer that grows out of
it inside the box and plays on through the rest, and Esc returns to the
wall with the current spotlight's card chosen. Every function of the old
reel stays. Owner decisions taken with the direction: the letters F
(Filter), D (Display), P (Play all / Play again), S left free; an end
card when the reel runs out; ANSI normal red drawn brighter on the dark
wells while the Display colours are Default.

The stage ran as three packages: 46-A (the wall and the filter row), 46-B
(the viewer), 46-C (tests, this ADR, Inv §7.6).

## Decision

### The page and its loading (46-A)

- `startSpotlights(nav, services)` keeps its name and signature (the menu
  calls it), its `busy` guard and its texts: `Loading spotlights…` flashes
  on the menu, a failure flashes `Spotlights could not be loaded.`. It
  lazy-imports `spotlight-reel`, makes **one `ReelSource` for the page**
  (so a filter change reads only the windows not read yet, ADR 0110), and
  pushes `SpotlightsWall` for a reel, for nothing passing, or for no data.
  Without `services.embedPlayer` it flashes `Spotlights are not available
  here.` and stays on the menu.
- No data and nothing passing are **states of the wall**, not pages of
  their own: nothing passing keeps the filter row and says `No spotlights
  match your settings.` with "Turn on a kind or a character above, or
  choose a longer period."; no data has no filter row and the text that
  says how spotlights are made. `EmptyStateFrame`, `FilteredFrame`,
  `CREDITS_EMPTY` and the settings popup stay exported for Credits until
  stage 47; the menu no longer calls `services.openSpotlights`.
- The wall's model is `WallReel`: the reel, one still per spotlight and
  the reel's length, built once per load from the lazily loaded module, so
  the player code stays out of the chrome chunk.

### The wall (46-A)

- `SpotlightsWall` is a `lookFrame` in `Box size="large"` titled
  Spotlights. Head: a dim `Filter` caption (F marked), the kind chips
  with their icons in the kind colours, `All` plus one chip per recorded
  character, the period as the kit's native `Select`. Body: a card grid
  (auto-fill, min 248 px). Foot: **Play all** (P, primary), the summary
  `5 spotlights · 01:06` (h:mm:ss from one hour), the flash.
- A card: the kind (icon and name in the kind colour), its index, a still
  of 4 lines (3 on a phone), the label (2 lines), `Rasta · level 42 · 26
  Sep 2026`. The chosen card is `.is-on`; with the keyboard in the filter
  row it stays chosen but dimmer (`.is-idle`). Cards are a class component
  with `shouldComponentUpdate`, so a cursor move re-renders two cards; they
  use `content-visibility: auto` with a fixed intrinsic size.
- **The still** (`spotStill(reel, i, n = 4)` in `spotlight-reel.ts`) is
  the last *n* visible lines of the cut window up to the moment: prompts
  and blank lines skipped, echoed commands in the echo colour, SGR state
  carried across lines (its own small parser; the export model's is not in
  the player chunk). The window start is found by bisection (`seekLine`)
  and only the window's lines are read. A death or a PvP kill (stamped on
  its own text line, `logUs`) ends on the first visible line at its
  moment; a level-up or an achievement (stamped by GMCP) takes the text up
  to 250 ms after.
- **The reel's length** is the sum of `spotLengthMs`, mirroring
  `buildTimeline`: the lead-in is free, gaps of 10 s or less play in real
  time, then the dwell to `toUs`. A unit test holds it to the timeline's
  `durationMs`.
- The stills use the Default palette with the brighter red
  (`SPOTLIGHT_PALETTE_TWEAK`, `{ 1: '#c43c3c' }`), as CSS custom
  properties on the page; they do not follow the viewer's Display theme
  (owner question below).
- **Chips** (`chipPatch(f, name | null, names)` in `share/spotlights.ts`):
  All off brings back the remembered set (or every name); a name while
  All is on shows only that name; the last name off turns All back on and
  keeps the remembered set. Every chip writes `settings.spotlights` at
  once (Credits follows, ADR 0110). The wall rebuilds through the page's
  `ReelSource`, the latest change wins (a sequence number, no debounce),
  and the chosen card stays chosen while it still passes, else the first.
  The filter changes only on the wall (the viewer covers the row), so ADR
  0110's "rebuild while playing" becomes "rebuild the wall".
- **Keys on the wall**: arrows in 2D (columns read from the grid's
  computed template after the box has settled), PgUp / PgDn, Home / End,
  Enter or Space plays the chosen card, P plays all, F (or Tab, or ↑ from
  the top row) moves into the filter row, Esc / Back to the menu. In the
  filter row: ← → walk the chips and the period, Tab / Shift+Tab the
  groups (kinds, characters, period), Space / Enter toggles a chip or
  steps the period forward, ↓ or Esc back to the wall. The stack prevents
  arrow keys on a focused select, so the native select is for the mouse
  and touch only; F returns to the stop last used. Mouse: a click
  chooses, a double click plays; touch: a tap plays.

### The viewer (46-B)

- `SpotlightsViewer({ reel, start, cardRect, onLeave })` is mounted by the
  wall over its box's window while a card plays; the wall stays laid out
  under it, inert. `cardRect(i?)` scrolls card *i* into view and returns
  its rectangle (the viewer grows from the start card and shrinks into the
  current one).
- **Head**: the kind (icon and name in its colour), the label set large,
  `Rasta · level 42 · Saturday 26 September 2026` (fixed English names,
  no comma), and ‹ `n / N` › as small glass icon buttons with the tips
  `Previous spotlight (←)` / `Next spotlight (→)`, disabled at the ends.
  **Countdown**: a fine rule that drains from both sides to the moment,
  gone after it.
- **Game well**: the embedded `PlayerHost` from `services.embedPlayer`,
  playing the bare view with `hours` (ADR 0127 42f), inset in the well;
  the well copies the player's `--term-bg` after each draw and Display
  change, so the inset text sits on one colour. The phone's lone GAME tab
  strip is hidden inside the slot.
- **Track**: the played part in the mithril inlay tint, the playhead as an
  inlay rivet, a tick between spotlights, one kind marker per spotlight at
  its moment; markers closer than 20 px share one and its tip lists every
  event (`Rasta: Killed *Ibuki the Half-Elf*`). Hover shows an h:mm:ss
  hint; a click or a drag seeks on release (as the player's rail); a
  marker click seeks to its moment; wider targets on a coarse pointer.
- **Control row** (always in view, no auto-hide): To the start, −10 s,
  round glass Play / Pause, +10 s, the speed well `‹ 1× ›` (arrows off at
  the ends), the clock `00:40 / 02:39` (hidden under a 740 px container),
  Display (D; an icon under 600 px) and Fullscreen (desktop, where the page
  can). The buttons call `view.press`, so Play resumes from the cursor
  line as Space does. There is no Close: the box's Back and Esc leave.
- **Display**: the kit `Popover` with the font size (`Seg`) and the six
  colour swatches from `host.viewerControls(true)`, no Panes; kept across
  reels. D opens it; ↑ ↓ choose the row, ← → change the value, D or Esc
  close it.
- **End card**: when the engine parks at the end, a veil over the well
  with "End of the reel", `5 of 5`, **Play again** (P, from the first) and
  Back to the wall (Esc). Any seek or ← removes it. → on the last does
  nothing (`navTarget`).
- **Grow and shrink**: the viewer is laid out at full size at once;
  `clip-path` and `opacity` animate from the card's rectangle (480 ms,
  `cubic-bezier(.3,.8,.2,1)`) and back into the current spotlight's card
  (380 ms) before `onLeave(current)` is called; keys are swallowed during
  the shrink. Reduced motion: no animation. `useSkyPause(true)` pauses the
  start sky while the viewer is open, so the player's App and the sky
  never run together.

### The bare reel (46-B, `spotlight-mode.ts`)

- `openSpotlightReel(host, reel, { bare: true, start, keys, onEsc, onEnd,
  autoplay? })` is a separate path, typed with overloads, returning a
  `BareReel`: `reel`, `starts`, `moments`, `marks`, `duration`, `speeds`,
  `index()`, `countdown()`, `go(dir)` (`navTarget` and `RESTART_MS`; from
  the end, ← plays again), `goTo(i, play?)`, `open(reel, start)` and
  `subscribe(fn)`, which survives re-opens. The page draws all chrome; the
  bare reel has no settings subscription and no empty stage.
- It sets every pane off (script panes too, ADR 0032), Display only, the
  palette tweak `{ 1: SPOTLIGHT_RED }` (`#c43c3c`, about 3.6:1 on the
  near-black well; applied by the host only while the Display theme is
  Default), and calls `onEnd` once each time the engine parks at the end.
- The card path (`openCardReel`, `ReelHandle`, `spotlight-card.ts`,
  `spotlight.css`) stays unchanged because the read-only shell's
  `openSpotlights` still calls it; wave 3 removes them with
  `Shell.openSpotlights`. Until then `spotlight-mode` imports the card, so
  its CSS (5.5 kB, 1.5 kB gzip) rides in the lazily loaded chunk.

### Keys, the kept host and leaving (46-B)

- **Key routing**: the stack's and the view's window listeners both get
  every key, the stack's first (`stopPropagation` on window does not stop
  the other). While the viewer is open the wall's handler and a viewer
  frame key layer swallow every key on the stack's side (the layer takes
  Esc itself before the host is ready); the view handles the reel keys,
  with the viewer's `keys` hook first (D, Display's keys, P on the end
  card). The Popover's own Esc layer closes Display first; a flag reset by
  `setTimeout(0)` makes the view's following Esc a no-op, so one Esc closes
  Display and a second leaves. The box's Back while the viewer is open
  sends a keydown Escape on window, which leaves as Esc does.
- **The kept host**: the host stays alive while the page is open. On
  leaving, the paused host's slot is taken out of the document (the view's
  keys then pass) and kept at module level, one at a time (the shell
  refuses a second player). The next card puts it back and seeks (same
  reel) or calls `open()` (a rebuilt wall). A MutationObserver on the
  direct children of every ancestor of the page's frame, plus a
  `setTimeout(0)` check after parking, disposes it when the frame leaves
  the document (a pop with the hold, or a whole start-page swap). A
  backward seek still rebuilds the player App (engine behaviour); the
  chunk load and the host are saved.
- **Follow loop**: engine events plus a rAF loop while playing update the
  countdown, the played part and the playhead by direct style writes;
  Preact re-renders only when the index, play state, speed, whole second
  or end state change.

### Tests (46-C)

- E2E (`spotlights.spec.ts`, `spotlights-settings.spec.ts`,
  `phone-spotlights.spec.ts`), on the demo backup: the wall in reel order
  (Rasta's death, then Gittan), the Death colour, the stills; Enter into
  the viewer and its head; ← → and the restart rule, Shift+← → 10 s, 1–6,
  Space, ↑ and Space again from the cursor line; the end card, → doing
  nothing there, P; Esc back to the third card, Esc to the menu with the
  host disposed; Fullscreen and Back; a click and a double click, P, the
  same host on the next card; the brighter red in a still and in the
  viewer, a Dark theme keeping its own; the chips, the period, F and the
  filter keys, the rebuild keeping the card; the nothing-passes and
  no-data walls; the phone at 390 and 360 px by tap (chips, a card, the
  control row, the track, Display, Back).
- Unit: the start page's Spotlights tests expect the wall
  (`chrome-frames`, `spotlights-settings`); `spotlight-mode.test.ts` adds
  the bare reel's rules (the start card, ← → at the ends, a paused
  `goTo`, `autoplay`, the end once per stop, Display and subscribers kept
  across a rebuilt reel) and keeps the card tests, marked for wave 3;
  `share-reel.test.ts` adds the stills and length of a loaded reel and the
  page's one `ReelSource` reading each window once. The wall's and the
  viewer's own tests are `spotlights-wall.test.tsx`,
  `spotlights-still.test.ts` and `spotlights-viewer.test.tsx`.

## Measurements

- The wall, 200 cards (dev server, headless, 1440×900): Chromium render
  and layout 30–55 ms, a key move 4–8 ms; Firefox (headless, software
  rendering) 135–360 ms, a key move 30–160 ms. The 50 ms target needs a
  production build in a real window (wave 3).
- Opening a card (dev server, headless Chromium, 1440×900, the demo
  backup): no long task over 50 ms on the first open (embed, chunk load,
  App build), the second (kept host) or a third card. Not yet measured on
  a build, in a real window, in Firefox or at 390×844@3 (wave 3).
- Build (46-C, integration tip with 46-A and 46-B, gzip): the
  `spotlights` chunk 1.73 kB, `spotlight-reel` 2.42 kB, `spotlight-mode`
  4.69 kB JS plus 1.54 kB CSS (the old card's, until wave 3). 46-A against
  its base: chrome JS +4.34 kB, chrome CSS +1.16 kB.

## Consequences

- Spotlights is a page to browse, not a reel that starts at once: the
  first spotlight plays after one key (Enter or P) instead of none.
- The settings are visible where they act; Credits follows the same row.
- The player host lives for the page's lifetime, one at a time; a second
  card opens without loading the chunk or making a host.
- `services.openSpotlights`, the shell's full-page reel, the card and its
  CSS, `EmptyStateFrame` / `FilteredFrame` (once Credits leaves them) and
  the settings popup are dead or nearly so; wave 3 removes them.
- Local helpers that belong in the kit or `src/player/icons.ts`: the kind
  icons as `IconDraw` (duplicated in the wall and the viewer), `cardDate`
  and `longDate` (fixed English names), `wallSummary`, the plain
  transport button and the round glass play button, the colour swatch
  radio group. `SPOTLIGHT_RED` (spotlight-mode) and
  `SPOTLIGHT_PALETTE_TWEAK` (share/spotlights) hold the same colour; one
  should import the other.

## Open questions for the owner

1. **S** is free on this page (it was direction A's `Settings…`). *Built:
   left free.*
2. Hundreds of spotlights: group the wall by character or month, or one
   wall? *Built: one wall in reel order.*
3. Should the card stills follow the viewer's Display theme? *Built: the
   Default palette with the brighter red.*
4. Prev at the first spotlight: the head's ‹ is disabled there (as the old
   card); mockup B left it enabled (← restarts the first). *Built:
   disabled; the ← key still restarts.*
5. The end card follows mockup A's title-card style, since B has none.
