# Stage 46 — Spotlights: the gallery

Status: **Done**, released in 0.3.0 (approved by the owner 2026-11-08). Before that: **Owner testing**, one performance check still open (2026-11-08;
planned 2026-11-07, built in wave 2 of the broad pass on
`stage-41-start-page`, wave 3 and its sweep done). Left: a headed re-run
of the wall and the viewer on the owner's machine (production build,
Firefox, 390×844@3; ADR 0131 "Performance").

## Goal

Replace today's Spotlights (start menu → Spotlights: the reel plays at
once in the full-page player with a card at the top right, ADR 0019, 0032,
0110, 0114) with the round 7 direction the owner chose: **B "Galleriet"**.
Spotlights opens on a **wall of cards** in the big box of layout **B
"Rummet växer"**, one card per spotlight in reel order with a still of the
game text at the moment; the Spotlights settings are the **filter row
above the wall**; Enter on a card (or Play all) opens the reel in a
**viewer that grows out of the card** inside the box and plays on through
the rest; Esc returns to the wall with the current spotlight's card
chosen, a second Esc to the menu. Every function of today's reel is kept.

## Owner decisions

From "Round 7 decisions (owner, 2026-11-07)" in
`notes/research/start-menu-mockups/README.md`, and the defaults the owner
accepted for the round 7 open questions (recorded here as decisions):

1. **Spotlights = B "Galleriet"** (`round7/spotlights/spotlights-b.html`,
   shared code `spot.js`, `spot.css`): the wall, the filter row above it,
   the viewer growing out of a card and playing on, Esc back to the wall.
2. **Shortcut letters F, D, P, S** (the reel had none; F is Fullscreen in
   the HTML replay, a different page, so no clash):
   - **F** Filter: moves the keyboard into the filter row (on the wall);
   - **D** Display: the font size and colours popover (in the viewer);
   - **P** Play all on the wall; Play again on the end card;
   - **S** belonged to direction A's filtered page (`Settings…`). B has no
     settings page (its filter row *is* the settings), so **S is not used
     in B**; it stays free on this page. (Noted for the owner below.)
3. **An end card when the reel runs out** (today it parks paused on the
   last spotlight): in the viewer, "End of the reel", `12 of 12`, **Play
   again** (P, from the first) and Back to the wall (Esc).
4. **A brighter dark red on black**: ANSI normal red (`#800000` in the
   Default palette) is hard to read on the near-black wells. In
   Spotlights (the card stills and the viewer) it is drawn brighter
   (about `#c43c3c`, tune for at least 3:1 on the well colour) **when the
   Display colours are Default**; a chosen theme keeps its own red. The
   run log player, the HTML replay and the game are not changed.

Technical decisions taken while planning (record them in this stage's
ADR, **0131**, assigned by the main session):

- **The reel loads before the page opens**, as today: menu → Spotlights
  flashes `Loading spotlights…` on the menu, then the wall opens with its
  cards; a load failure flashes `Spotlights could not be loaded.` on the
  menu (today's texts). No data and "nothing passes" are states of the
  wall, not pages of their own: today's `EmptyStateFrame` /
  `FilteredFrame` are no longer used by Spotlights.
- **The viewer plays in the real player** (a `PlayerHost` with its App on
  the replay clock, game text only as ADR 0032), embedded in the big box
  instead of covering the page, with the view's own header, rail and
  control box turned off (stage 42's player core: embedded host, bare
  view). The new head, countdown, horizontal track and control row are
  this stage's Preact chrome, driving the engine and the view's actions.
  The pause cursor line, the wheel, click-to-cursor and every key stay the
  view's.
- **The controls stay in view** (B; no auto-hide in the viewer). The
  viewer's Back (the box's Back at the top left) and Esc leave the
  viewer; there is no Close button.
- **The filter changes only on the wall** (the viewer covers the row), so
  ADR 0110's "rebuild while playing" rules become "rebuild the wall": the
  chosen card stays chosen when it still passes, else the first card.
- **Chips** (B): one chip per kind (with its icon, `role=checkbox`); an
  `All` chip and one chip per recorded character; while All is on, a name
  chip shows only that name; turning the last name off turns All back on;
  the period is a native select. Every change is saved at once (the same
  `settings.spotlights` as today) and also filters Credits (ADR 0110,
  unchanged).
- **The player host stays alive while the page is open** (paused and
  hidden on the wall), so a second card opens quickly; it is disposed when
  the page closes.
- **Times as h:mm:ss** from one hour (stage 45's decision 5) in the
  viewer's clock, the track's hover hint and the wall's reel length.

## References

Read first: `CLAUDE.md`, the top of `progress.md`, this file, then:

- Mockups (throwaway code; re-derive the look in the app's structure):
  - `notes/research/start-menu-mockups/round7/spotlights/spotlights-b.html`
    with `spot.js` (data, reel model, screen, track, controls, Display,
    the menu → page shell) and `spot.css`. States: `?open` (the wall),
    `?at=N` (the viewer on spotlight N), `?pause`, `?end`, `?display`,
    `?none` (nothing passes), `?filtered`, `?empty`, `?error`, `?freeze`.
  - `round7/spotlights/CONTENT.md`: everything the reel does today (keep
    it all), the states, the phone.
  - `round7/spotlights/index.html`: the review notes.
  - Today's look: `round7/shots/spotlights/today-*.png` (gitignored; make
    them again with the dev server and the demo backup if missing).
  - `round7/layout/b-room.html` (the big page), `round7/base/README.md`
    (the kit's look).
- `docs/stages/42-look-pages-base.md` and ADR 0127 (its "API" and
  "Canonical names" sections). Do not start before it is merged.
- ADRs: 0019 (Spotlights), 0021 (viewer settings), 0032 (bare spotlights,
  marker tips), 0110 (Spotlights settings), 0114 (ghost look), 0125 (start
  surface, kit), 0127 (stage 42).
- Inventory: `notes/research/cockpit-inventory.md` §7.6.

## Current code (what this stage replaces or touches)

| File | Today | This stage |
|---|---|---|
| `src/chrome/frames/spotlights.tsx` | `startSpotlights(nav, services)`, `EmptyStateFrame`, `FilteredFrame`, `SPOTLIGHTS_EMPTY`, `CREDITS_EMPTY` | `startSpotlights` keeps its name and signature (the menu calls it) and now loads the reel and pushes the wall. **Keep exporting `EmptyStateFrame`, `FilteredFrame` and `CREDITS_EMPTY` unchanged**: Credits imports them until stage 47 lands; wave 3 removes what is dead |
| `src/player/spotlight-mode.ts` | Opens the reel on a full-page host with the card, header, keys, markers | Reworked for the embedded bare viewer: start at card *i*, the end card hook, no card |
| `src/player/spotlight-card.ts`, `spotlight.css` | The card (count, ‹ ›, kind, label, countdown, the filter folds) | The card goes; keep the pure helpers (`countdownLeft`, `REEL_NO_MATCH`) where the viewer needs them |
| `src/player/spotlight-reel.ts` | `ReelSource`, `loadReel`, positions, `navTarget`, marks, `fmtDate` | Kept; additions only (the still lines per spotlight, the reel's length) |
| `src/share/spotlights.ts` | Selection, rotation, filter rules, patches | Kept; additions only (the chip rules) |
| `src/chrome/popups/spotlights-settings.tsx` | The settings popup (filtered pages) | Not used by Spotlights any more; **not deleted** here (Credits still opens it until stage 47; wave 3 removes it if dead) |
| `src/app/shell.ts`, `src/app/player-host.ts`, `src/player/view.ts`, `strip.ts`, `player.css`, `src/chrome/kit/hooks.ts` | Player and shell; `Shell.openSpotlights()` / `ChromeServices.openSpotlights` (load and play full-page) | Changed by stage 42's player core, **not** by this stage. The wall no longer calls `openSpotlights`; it stays until wave 3 removes it (or stage 42 replaces it) |

What must keep working (from the code and `CONTENT.md`):

- **What a spotlight is** (unchanged, `src/share/spotlights.ts`): death,
  level-up, PvP kill, achievement from sealed runs with a log; window
  `[moment − 10 s, moment + 5 s]` trimmed to the first visible line; the
  rotation order; one reel = one timeline with a blank transition before
  each spotlight; labels (`*Ibuki the Half-Elf*`, `Death (level 42)`,
  `Reached level 42`, `Achievement: …`); kind names, colours and icons
  (PvP kill `#e0915a`, Death `#e06c6c`, Level up `#7fbf7f`, Achievement
  `#e3b341`); only the game text shows (every pane off, ADR 0032).
- **Filters** (`settings.spotlights`): kinds (Achievements, Deaths,
  Level-ups, PvP kills), characters (All, or a remembered subset; `No
  characters recorded yet.`), period (All time, Last year, Last 3 months,
  Last month, Last week), saved at once; Credits follows them.
- **Viewer keys**: ←/→ previous / next spotlight (← restarts the current
  one after 1.5 s, restarts the first on the first; → does nothing on the
  last, `navTarget`), Shift+←/→ ±10 s, Home to the start, Space play /
  pause, 1–6 speed (0.25 … 8×), pause cursor ↑ ↓ PgUp PgDn End, the wheel,
  a click on a line (Space resumes from the cursor line), Esc closes the
  popover first, then leaves the viewer.
- **Viewer controls**: To the start, −10 s, Play/Pause, +10 s, speed `‹ 1×
  ›` (arrows off at the ends), time `00:05 / 01:06`, Display (font size
  Default / Small / Medium / Large; colours Default, Dark, Teal, Paper,
  Sepia, Slate; kept across reels), Fullscreen (desktop, where the page
  can).
- **Track**: the whole reel, the played part, the playhead, one kind
  marker per spotlight at its moment (near ones share one; the tip lists
  them, `Rasta: Killed *Ibuki the Half-Elf*`), click or drag seeks with a
  time hint; the countdown to the moment (gone after it).
- **Phone (390 px)**: everything by tap; the box at 6 px margins; the
  viewer's control row compact (no time); game text bottom-anchored;
  touch targets ≥ 32 px.
- **Dev hooks** the tests use: `__wc.shell.playerHost` (the open host,
  also when embedded), `__wc.settings`, `__wc.runs()`.

## Scope

In: the Spotlights page (wall, filter row, states), the viewer in the box,
the end card, the brighter red, Spotlights' tests, this stage's ADR
(0131), the Spotlights part of Inv §7.6.

Out: the selection rules and the reel's timeline (unchanged); Credits
(stage 47; it keeps using the settings); the player core (stage 42); the
HTML replay; About / README text (stage 47 and wave 3).

## Work packages

Each package is sized for one subagent. File ownership is exclusive
across stages 43–47 in wave 2: touch only your files; read anything.

### WP 46-A — The wall and the filter row

Owns: `src/chrome/frames/spotlights.tsx`, `src/chrome/frames/spotlights-wall.tsx`
(new), `src/chrome/frames/spotlights.css` (new), `src/share/spotlights.ts`
(additions only: `chipPatch(f, name)` for B's character chips),
`src/player/spotlight-reel.ts` (additions only: `spotStill(reel, i, n = 4)`
→ the last *n* visible lines before the moment, as styled runs; and the
reel's total length).

- `startSpotlights(nav, services)`: as today (`busy` guard, `Loading
  spotlights…`, errors), but it loads through a `ReelSource` it keeps for
  the page (lazy `import('../../player/spotlight-reel')`, `services.runs()`)
  and pushes `<SpotlightsWall source reel characters />` for a reel, the
  no-data wall, or the nothing-passes wall.
- `SpotlightsWall = lookFrame(…)`: `<Box title="Spotlights" size="large"
  onBack>`; head: a dim `Filter` caption (F marked), the kind chips (with
  icons), the character chips (`All` + names), the period select; body:
  the card grid (auto-fill, min 248 px); foot: **Play all** (P, primary),
  the summary `12 spotlights · 3:12`, the flash.
- Card: kind icon and name in the kind colour, the index, the still (4
  lines, 3 on a phone, in the Default palette with the brighter red, or
  the chosen Display theme's colours), the label (2 lines), `Rasta · level
  42 · 26 Sep 2026`. Selection = `.is-on` (text brightens, the still to
  full opacity).
- States: no data (no filter row; `SPOTLIGHTS_EMPTY.no_data`); nothing
  passes (filter row kept; `No spotlights match your settings.` + "Turn on
  a kind or a character above, or choose a longer period.").
- Keys on the wall: arrows move in 2D (columns from the layout), PgUp /
  PgDn, Home / End, Enter plays the chosen card, P plays all, F to the
  filter row (←/→ chips, Space / Enter toggles, Tab to the period, ↓ or
  Esc back to the wall), Esc / Back to the menu. Mouse: click selects,
  double click plays; touch: a tap plays.
- A filter change rebuilds through the kept `ReelSource` (only unread
  windows are read, ADR 0110), keeps the chosen card when it still passes,
  latest change wins.
- Calls WP 46-B's `openViewer(i)` and gets `onLeave(i)` back to choose
  that card.

Uses from 42: `Box size="large"` and `useBoxSettled()` (the columns are
measured after the growth), `BoxHead` / `BoxBody` / `BoxFoot`, `Seg multi`
(the chips: `role=checkbox`, `aria-checked`, icons, `kind="pills"` for the
sideways scroll), `Select`, `useGridCursor`, `GlassButton` (`primary` for
Play all), `LookFlash`, `KeyLabel` for the caption, `letterAction`,
`.wc-lk-empty`, the kind icons as `IconDraw` from `kindIcon`
(`src/player/icons.ts`).

### WP 46-B — The viewer

Owns: `src/chrome/frames/spotlights-viewer.tsx` (new),
`src/chrome/frames/spotlights-viewer.css` (new),
`src/player/spotlight-mode.ts`, `src/player/spotlight-card.ts`,
`src/player/spotlight.css`.

- `SpotlightsViewer({ reel, start, onLeave })` inside the wall's box
  window: the head (kind, label large, `Rasta · level 42 · Wednesday 26
  September 2026`, ‹ `3 / 12` › with `Previous spotlight (←)` / `Next
  spotlight (→)` tooltips, the ends disabled), the countdown line, the
  game well (the embedded `PlayerHost` from stage 42's `embedPlayer`), the
  horizontal track, the control row, the Display popover.
- **Grows out of the card**: the viewer layer is laid out at full size
  at once and its `clip-path` animates from the card's rect to the whole
  window (≈ 480 ms out, 380 ms back; reduced motion: none), so nothing
  reflows while it moves. Esc shrinks it back into the current
  spotlight's card.
- `openSpotlightReel(host, reel, { bare: true, start: i, onEnd, keys })`:
  the reel without the card; ←/→ through the view's `keys` hook as today
  (`navTarget`, `RESTART_MS`); D opens the Display popover; the view's
  `onEsc` closes the popover first, then calls `onLeave(current)`.
- **The end card**: when the engine parks at the end, an overlay in the
  well: "End of the reel", `12 of 12`, Play again (P), Back to the wall
  (Esc). Any seek or ← takes it away.
- The track: played part, the playhead (a small rivet in the mithril
  inlay tint), one marker per spotlight (`reelMarks`), ticks between
  spotlights, the hover / drag time hint (h:mm:ss), click or drag seeks,
  a wider touch target on a phone.
- Controls drive the engine (`host.engine`: `play`, `pause`, `seek`,
  `setSpeed`, `subscribe`) and the view's actions (`press('play')` resumes
  from the cursor line as Space does). Display uses the host's
  `ViewerControls` (display only, no Panes).
- The brighter red: `host.setPaletteTweak({ 1: '#c43c3c' })` (stage 42),
  applied only while the viewer theme is Default.
- Pauses the start sky while the viewer is open: `useSkyPause(true)`
  (stage 42).

Uses from 42 (player core): `services.embedPlayer(slot)`, the PlayerView
options `bare` and `hours`, `view.press(act)`,
`PlayerHost.viewerControls(true)`, `PlayerHost.setPaletteTweak`,
`fmtClock(ms, true)`, `shell.playerHost` set for the embedded host; (kit)
`Popover`, icon-only `GlassButton`, the `--lk-inlay-*` tokens,
`useSkyPause`, the icons `prev`, `next`, `play`, `pause`, `start`,
`back10`, `fwd10`, `display`, `fullscreen`.

WP 46-A and 46-B agree on this contract before they start:

```ts
// spotlights-viewer.tsx
export function SpotlightsViewer(p: {
  reel: Reel;                       // the wall's current reel
  start: number;                    // the card index to play from
  cardRect: () => DOMRect | null;   // the chosen card (grow / shrink)
  onLeave: (current: number) => void;
}): VNode;
```

### WP 46-C — Tests, ADR, docs

Owns: `tests/e2e/spotlights.spec.ts` (except the Credits test, see
below), `tests/e2e/spotlights-settings.spec.ts` (except the Credits test),
`tests/e2e/phone-spotlights.spec.ts` (the Spotlights tests; leave `the run
log's box fits` as it is), `tests/unit/spotlight-mode.test.ts`,
`tests/unit/spotlights-settings.test.tsx` (only the parts that test
Spotlights pages; leave `filtered empty pages (start page)` while
`FilteredFrame` exists), `tests/unit/share-reel.test.ts` (except the
`Credits roll` describe and its import, which stage 47 removes), this
stage's ADR (0131), the Spotlights part of Inv §7.6 (stage 47 writes the
Credits part), the checklist.

- `tests/unit/chrome-frames.test.tsx`, `start page` describe: edit only
  the test `Spotlights shows the empty state from the service; any key
  returns` (the menu now pushes the wall; `services.openSpotlights` is
  no longer how the page loads). Other hunks of that file belong to
  stages 42, 44 and 47.
- **Do not edit** the Credits tests in `spotlights.spec.ts` (`Credits rolls
  the chronicle; ESC returns, and so does the end`) and
  `spotlights-settings.spec.ts` (`Credits follows the filters; its
  filtered page rolls after a change`): stage 47 deletes exactly those
  two tests and replaces them in `credits.spec.ts`.

## Tasks

- [x] Stage 42 merged (with the player core); read its file and ADR 0127
- [x] WP 46-A: wall, cards and stills, filter row and chips, states, keys,
      phone
- [x] WP 46-B: viewer in the box, grow/shrink, head, countdown, track,
      controls, Display, end card, brighter red
- [x] WP 46-C: tests, ADR 0131, Inv §7.6 (Spotlights part)
- [x] Typecheck, lint (no lint script), unit, e2e (Chromium and Firefox) green
- [ ] Performance check (below): headless and the wave-3 run done; left: a
      headed re-run of the wall and the viewer on the owner's machine
      (production build, Firefox, 390×844@3; ADR 0131 "Performance")
- [x] Screenshots at 1280×720, 1440×900 and 390×844 reviewed by the main
      session against `spotlights-b.html` (`?open`, `?at=3`, `?pause`,
      `?end`, `?display`, `?none`, `?empty`)
- [x] Test guide for the owner (below) checked (against the code and specs)
- [x] Wave 3 sweep: the full-page reel, its card, `Shell.openSpotlights`,
      the old-look empty pages and the settings popup removed; one copy of
      the kinds' icons

## Test plan

Unit (`vitest`):
- `share-spotlights.test.ts`: add `chipPatch` (a name while All is on →
  only that name; the last name off → All on; All off → the remembered
  set).
- `share-reel.test.ts`: add `spotStill` (visible lines only, the last
  *n* before the moment, ANSI runs kept) and the reel length.
- `spotlight-mode.test.ts`: rewrite the card describe for the bare viewer
  (start at *i*, ←/→ rules, the end card, Display only, no Panes); keep
  `rebuild` cases that still apply to the wall's rebuild.
- New `spotlights-wall.test.tsx`: chips write `settings.spotlights`, the
  wall rebuilds and keeps the chosen card, empty states, letters F / P,
  2D keys, Enter opens the viewer.

E2E (`playwright`):
- `spotlights.spec.ts` main test, rewritten: the demo backup; menu →
  Spotlights shows the wall (5 cards, newest first: Rasta's death, then
  Gittan); the first card's kind `Death` in `rgb(224, 108, 108)`, label
  `Death (level 42)`; Enter opens the viewer on it; the text plays (`You
  are dead!`); → next, ← restart rules; Shift+→ +10 s; 1–6 speed; Space
  pause, ↑ moves the cursor line, Space resumes; the end card after the
  last; Play again; Esc → the wall with the current card chosen; Esc →
  the menu.
- `the Spotlights box has Fullscreen`: in the viewer's control row.
- `spotlights-settings.spec.ts`: the chips (kinds off/on, a name while
  All, the last name off), the period, the rebuild keeping the card; the
  nothing-passes wall and its way back; no Options on the start page.
- `phone-spotlights.spec.ts` (390, 360 wide): chips scroll and tap, cards
  tap to play, the control row fits, the track seeks by tap.
- The brighter red: a still and the viewer's output with Default colours
  show ANSI 31 as the tweaked colour; with Dark it is the theme's.

## Performance notes

- **Many cards**: a reel can hold hundreds of spotlights. Build each
  still once per reel load (string work on text already in memory), render
  cards with `content-visibility: auto` and a fixed intrinsic size, and no
  per-card filters or shadows that repaint on scroll. Target: the wall of
  200 cards renders in < 50 ms on the Iris Xe, scrolls at 60 fps.
- **The viewer over the sky**: the viewer is opaque; pause the start sky
  while it is open (resume on leaving), so the player's App and the sky
  never run together.
- **Grow / shrink**: animate `clip-path` and `opacity` only, with the
  viewer laid out before the animation starts; no layout during the
  480 ms. Check with the performance panel: no long task over 50 ms when a
  card opens (the host is kept alive, so a second card does not rebuild
  the App).
- **Rebuilds**: a chip click must not re-read windows already read
  (ADR 0110's `ReelSource`); debounce nothing, latest change wins.
- Measure Chromium and Firefox at 1440×900 and 390×844@3 (a stage 41-style
  headed run is enough); note the numbers in the stage file.

## Test guide for the owner

Branch of the broad pass (the main session gives the name), `npm run dev`,
open http://localhost:5173/. You need recorded runs with deaths, level-ups,
PvP kills or achievements (or History → Restore the demo backup
`tests/fixtures/runs-demo.jsonl.gz`).

1. **Open Spotlights** (L). "Loading spotlights…" briefly, then the menu
   grows into the big box with a wall of cards: kind, a still of the game
   text at the moment, the label, the character and date.
2. **Filter row.** Click the kind chips, the character chips (All, or a
   name), the period. The wall changes at once. Press **F** to move the
   keyboard there (←/→, Space), ↓ or Esc to go back to the cards. The
   Credits chronicle follows the same filter.
3. **Move on the wall** with the arrow keys; **Enter** (or a double click,
   or a tap on a phone) plays the chosen card. **P** plays all from the
   first.
4. **The viewer** grows out of the card and plays on through the rest:
   ←/→ previous / next spotlight, Shift+←/→ ±10 s, Space pause, ↑↓ moves
   the cursor line while paused, 1–6 speed, **D** Display (font and
   colours), the track to seek, Fullscreen.
5. **The end**: an end card, "End of the reel", with Play again (P).
6. **Esc** (or Back): the viewer shrinks back into the card you were on;
   Esc again goes to the menu.
7. **Red text** (hits on you) is brighter than before on the dark wells
   with the Default colours.
8. **Nothing passes** (turn every kind off): the wall says so and keeps
   the filter row. **No runs at all**: the wall says how spotlights are
   made.
9. **Phone** (or a narrow window): the chips scroll sideways, a tap plays
   a card, the controls fit.

Feedback wanted: the wall (card size, the stills), opening and leaving
the viewer, the controls always in view, the end card, the red, the
letters.

## Open questions for the owner (after testing)

The build follows the default until the owner answers.

1. **S** is free on this page (it was direction A's `Settings…`); give it
   a use, or leave it? *Default: leave it free.*
2. The wall shows every spotlight; with hundreds, should it group them
   (by character or month) or stay one wall? *Default: one wall in reel
   order.*

## Uses from stage 42

The canonical names are in `docs/stages/42-look-pages-base.md` ("API" and
"Canonical names") and ADR 0127. Stage 42's files are read-only in wave 2.

Layout and kit:

1. `Box size="large"` in layout B (the panel grows into the box and back;
   content faded in when settled) and `useBoxSettled()` so the wall
   measures its columns after the growth.
2. `BoxHead`, `BoxBody` (scroller, `.wc-lk-scroll`), `BoxFoot`; `Box`'s
   `onBack` may change between renders (the viewer's Back leaves the
   viewer, the wall's goes to the menu).
3. `Seg multi` for the chips (`role=checkbox`, `aria-checked`, an icon
   before the label, `kind="pills"` for the sideways scroll on a phone,
   `selected` for the keyboard's chip; ←/→ and Space are the page's keys).
4. `Select` (a native select in a glass well).
5. `useGridCursor` (2D arrows over a wrapping grid, `columns()` from the
   layout, PgUp / PgDn, Home / End, click selects, double click / Enter
   activates, `touch: 'tap-activates'`).
6. `Popover` anchored to a button (Esc and a click outside close it;
   `data-wc-own-keys` when it has controls).
7. `GlassButton` icon-only (‹ ›, the transport buttons) and `primary`
   (Play all).
8. `Icon` names `play`, `pause`, `start`, `back10`, `fwd10`, `prev`,
   `next`, `display`, `fullscreen`, `filter`; the four kind icons as
   `IconDraw` from `kindIcon` (`src/player/icons.ts`).
9. The mithril inlay tokens `--lk-inlay-*` (one source with the wordmark)
   for the playhead rivet and accents.
10. `useSkyPause(on)` (the viewer pauses the start sky while open).

Player core (42f; files `src/player/view.ts`, `strip.ts`, `player.css`,
`src/app/player-host.ts`, `src/app/shell.ts`, `src/chrome/kit/hooks.ts`):

11. **Embedded player**: `ChromeServices.embedPlayer(slot: HTMLElement):
    Promise<PlayerHost | null>`: a `PlayerHost` mounted in `slot` (it
    fills it and follows its size), the start page stays shown, the shell
    tracks it as `playerHost` (dev hook) and refuses a second player; the
    host's `close()` / `dispose()` hand back without showing or hiding the
    start page.
12. **Bare view**: the PlayerView option `bare: true` (no header, rail,
    control box, hint, tip or auto-hide; the keys, the pause cursor line,
    the wheel and clicks stay); `view.press(act)` for `start`, `back`,
    `play` (resumes from the cursor line as Space), `fwd`, `slower`,
    `faster`; `onEsc` as today.
13. `PlayerHost.viewerControls(displayOnly)` public (the Display popover's
    font and theme, kept across reels).
14. `PlayerHost.setPaletteTweak(map | null)`: ANSI index → colour, applied
    over the recorded / Default theme only while the viewer theme is
    Default (the brighter red).
15. `fmtClock(ms, true)` and the PlayerView option `hours` (`h:mm:ss` from
    one hour).
