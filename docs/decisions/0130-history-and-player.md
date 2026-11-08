# 0130 — History and the run log player in the new look

- Status: Accepted (stage 45 built in wave 2 of the broad pass; owner testing with stages 42–47)
- Date: 2026-11-07
- Related: stage 45 (`docs/stages/45-history-player.md`), ADR 0127 (the look
  pages base; its "42f" section is the player core this stage uses), ADR
  0018 (runs, History, the log player), ADR 0019 (export and the replay),
  ADR 0075 (phone), ADR 0109 (the Statistics pane), ADR 0114 (the player's
  ghost look), ADR 0125 (start surface and the lantern kit), ADR 0128
  (stage 43; the Export editor on the phone).
- Reference: `notes/research/start-menu-mockups/README.md` ("Round 7
  decisions"), `round7/history/` (`history-a.html` with `hist.css`,
  `hpages.js`, `hdata.js`; `CONTENT.md`).

## Context

History (start menu → History) was the last large TUI cell-grid page of
the start menu: a button column, a filter row of pills with `‹ ›` edge
slots and a table. In round 7 the owner chose direction **A "Tabell och
kort"** (a table and a card) in layout B's large box, with Statistics in
the same box and Rate and Delete as small boxes over it, a width cap on
wide screens, a "?" button instead of the key-hint row, `h:mm:ss` times in
the run log player, a Back button in the player and a clear box when a run
log cannot open. The player itself keeps today's look (none of the A/B/C
player mockups); the HTML replay stays exactly as it is.

Stage 45 runs as five packages: 45-A (the History page), 45-B
(Statistics), 45-C (the small boxes), 45-D (the player: verification and
tests; the code is stage 42f's) and 45-E (tests, this ADR, the Inv
notes). Each package's decisions are below.

## Decision

### 45-A — The History page

**One look frame in the large box.** `HistoryFrame` (`history.tsx`, CSS in
`history.css`) is a `lookFrame` with `<Box title="History" size="large"
maxWidth={1180}>` (layout B, Back, hood "History"). Head: the character
pills (`Seg kind="pills"`, scrolls sideways keeping the chosen one in
view) and the "?" button (45-C). Body: the kit's `Table` (sortable heads
Char, Date, Time, Dur., Expires, Rating with ▾ / ▴; Expires gold `Saved`,
a dim `N days`, or the warm `--lk-soon` at 2 days or less; Rating as the
kit's gold `Stars`) beside a 290 px **card** for the chosen session. Foot:
Backup and Restore (small), `LookFlash` and the storage line. The export
name `HistoryFrame` and `NO_PLAYER` stay.

**The width cap.** `HISTORY_MAX_W = 1180` (in `history-model.ts`): the table up to 800 px + the
26 px gap + the 290 px card + the window's padding (44) and frame (16) is
about 1176. Measured at 2560×1440: the box is at most 1180 px wide,
centred, full height (layout B's height rule is unchanged). Statistics
imports the same constant (wave 3; it had its own `HISTORY_STATS_MAXW`
copy), so the box swap keeps the rectangle instead of morphing its width.

**The narrow form follows the page's own width, never the device.** A
ResizeObserver on the box body: under 680 px of content (about a 760 px
viewport, the mockup's breakpoint) the page is narrow; a width of 0 while
the page is hidden is ignored. Narrow: the body scrolls everything, the
table is not `scroll`, the heads give way to a sort `Select` and rows take
two lines (`stackBelow` forced on: `stackBelow={1e6}`, because the kit
measures the table's width and beside the card the table is narrow on
purpose), and the card opens under the chosen row with its buttons in a
wrapping row. Wide: the table's body scrolls under fixed heads and the
card stands beside it. Columns tighten through a container query below
1040 px of page; the card is compacted under 780 px of viewport height.

**The card.** Name (Cinzel), `Level N`, the long date and time
(`fmtLongDate`, own English weekday and month tables instead of
`toLocaleDateString`, so Chromium, Firefox and Node print the same
`Friday, 6 November 2026`), Duration (`fmtDurLong`, `3 h 41 min · 2
runs`), Deeds (kills · PvP · deaths summed over `runs[].summary` by
`sessionDeeds`; "Not recorded" for runs from before stage 6), Kept (Saved
and stars, or "Expires in N days" with a draining gauge), Log (captured
text or not). The six actions as glass buttons in a column: Run log
(primary), Stats, Rate, Save, Export, Delete (danger). Its content fades
(opacity only, 220 ms × `--lk-ts`) when the chosen session changes.

**The cursor.** An own `cursorId` / `cursorIdx` state, as before: the
cursor follows its session through sort, save and reload and stays at the
same index after a delete. `useListCursor` is kept in step with it in a
layout effect (`lc.set(cursor)`; `onChange` writes back) with
`activateOn: 'dblclick'` and `touch: 'tap-selects'`: a click selects, a
double click or Enter opens the run log (today a single click opened it);
on touch a tap selects and a tap on the chosen row opens (the kit's rule,
as the Profile list). **A pointer passing over a row does not move the
cursor** (wave 3): the page delegates the cursor's `onPointerDown`,
`onClick` and `onDblClick` but not its `onPointerMove`. The kit's rule
"a pointer move over a row moves the cursor" fits a list whose actions
sit on the row; here the six actions sit in the card and act on the
cursor, and the way from a row to the card crosses other rows (in the
narrow form the card even moved under the hovered row and followed the
pointer down). The chosen mockup builds its list with hover off. A click
or double click on a row, and a head click, also bring the keyboard back
to the rows (`zone.reset()`), as the old frame did.

**Keys.** ↑↓ PgUp PgDn (10) Home End move; ← / → change the pill (only in
the rows' zone: in the buttons they walk the buttons); Enter or Space open
the run log; letters R T A S X D B O (Run log, Stats, Rate, Save, Export,
Delete, Backup, Restore) fire in both zones; `?` opens the keys box; Tab /
Shift+Tab move rows ↔ buttons through `useButtonZone` with the ids of the
six card actions then BACKUP and RESTORE (disabled ones skipped; the "?"
button is reached by its key, not the ring); the chosen row turns
`.is-idle` while the keyboard is in the buttons; Esc goes back. Keys typed
in the phone's native sort `<select>` pass through to it.

**Actions and the busy guard** are unchanged: Run log and Export need a
captured log, Save is off when saved, Stats / Rate / Delete need a row,
Backup needs runs, Restore is always on (`.gz,.jsonl.gz,application/gzip`).
One action runs at a time. Every flash text is today's. The list is
re-read whenever History is the top frame again. A failed first read
shows the read error ("The runs could not be read." plus the flash); a
later failed reload keeps the list and only flashes.

**The phone sort list.** Its value is `key:dir`; the six options are
Newest first, Oldest first, Character, Longest, Rating, Expires soonest.
When the current sort is none of them (a head click on a wide window, say
Time ▴), one more entry "By time of day ▴" names it, so the list never
shows a wrong order.

**Run log.** `const r = await openPlayer(s)`; on `{ ok: false }` the
run-log error box (45-C) opens over the page with `r.error`; without the
service the flash says `Log player not available.` as before. While the
open is pending (a large log loads for a while) the page holds every key
(Esc too), its Back and its actions (wave 3): otherwise Esc could leave
History during the load, and the player's Back would then return to the
menu, or the error box would land over the menu or Statistics. As a
second guard the error box is pushed only while History is still mounted
and the top frame.

**Export on every device.** `nav.push(<ExportEditorFrame session={…} />)`;
the phone gate (`Export: desktop only.`) is removed, because stage 43
built the Export editor's phone layout in the same wave (ADR 0128 §43d).

**Performance.** The sorted list and the pill names are memoised on
`[all, pill, sort]`; each row is a class component with
`shouldComponentUpdate` on (session, index, state), and the rows' pointer
handlers are delegated from their parent, so a cursor key re-renders two
rows, not all. Rows carry `content-visibility: auto` (intrinsic 41 px, 62
px stacked). No `backdrop-filter` on the table or the card.

### 45-B — Statistics in the same box

**A new component, not a restyle.** `HistoryStatsFrame`
(`history-stats.tsx|css`) is a look frame in a large box titled
"Statistics" with the same cap as History, pushed by History, so stage
42's box swap keeps the box and cross-fades the hood and the content;
Back or Esc returns to History with its state. `statistics.tsx`,
`stats-layout.ts` and `SessionStatsFrame` are untouched: their
`statsBody` and `LiveStatsFrame` also serve the in-game Statistics pane
(ADR 0109) and the phone's ESC menu. The new page reuses the pure model
(`buildStats`, `rateSeries`) and helpers (`sortKills`, `sortPvps`,
`nextStatSort`, the default sorts, `fmtK`, `fmtClock`). Data:
`lib.events(runIds)` → `buildStats(events, { character })`, as before.
`SessionStatsFrame` is no longer pushed by anything (wave 3's sweep).

**Layout.** The head: the name in Cinzel, `Level N` (the session's, else
the model's), `Session details · <long date> · 21:12 · 3h41m · 2 runs`,
and the stars when saved and rated. The body is the mockup's two-column
grid: Allies (diamond-marked names that wrap; 96 px, then scrolls; "Played
alone."), Achievements (an icon, the text and the time into the session;
"None this session."), Kills and PvPs as kit `Table`s with sortable heads
and a Total row under each on the same grid ("No kills.", "No PvP this
session."), the XP/h and TP/h sparklines, and the Experience ruler across
both columns (gold band, red on a loss; the label in a bracket, or free
when the band is under 14 % wide; level ticks; "No XP data."). Kill and
PvP tables grow with a tall window (`max(190px, 100dvh - 650px)`; the
mockup's fixed 190 px left space empty on big screens). One column under
`@container wc-page (max-width: 760px)`: tables show every row and the
body scrolls.

**Sparklines** are inline SVG: 48 `rateSeries` buckets in a viewBox
0..47 × 0..74 with `preserveAspectRatio="none"` and a non-scaling stroke,
one area path and one line path each, built once per data load. Y labels
max / half / 0; the x axis 00:00 → the duration.

**Keys.** Tab / Shift+Tab cycle the four sections (default Kills; the
focused one's heading in `--lk-accent`); ↑↓ scroll a row, PgUp/PgDn a
page, Home/End the ends, in the focused table when it overflows,
otherwise in the box body (the phone's single column). A press or the
wheel on a section focuses it; a head click sorts (a new column: text
ascending, numbers descending).

**The scrollbar gutter is measured** (`offsetWidth - clientWidth`, on
resize only) and set as `--hs-gut`: the kit's heads and totals assume an
8 px gutter, and Firefox on Linux uses overlay scrollbars (0 px).

**Icons** for PvP, achievements and levels are local copies of the
player's `KIND_PATH` (a unit test keeps them equal) so the chrome chunk
does not import the player module.

### 45-C — Rate, Delete, the run-log error box and the keys box

**Overlay frames with the kit's `Dialog`.** `RateDialog`, `DeleteDialog`,
`RunLogErrorDialog` and the keys box (`history-dialogs.tsx|css`) are
`lookFrame`s pushed with `nav.push(node, { overlay: true })`: History
stays drawn and inert under the veil and keeps its state. `RateFrame` and
`DeleteFrame` (TUI) are gone.

**Keys the Dialog does not model** go in a `useKeyLayer` on the dialog's
frame, which runs before the Dialog's own handler.
- Rate (hood "Rate the session", today's and the mockup's title): the
  session line `Gibur · 2026-11-06 · 21:12 · 3h41m`, five big stars, the
  rating in words (0: "No rating — the session is still saved"). 0–5 and
  ← / → (also ↑ / ↓) set it, so the arrows never walk the buttons; Enter,
  Space and S press Save (primary) and save an unsaved session too; Esc
  cancels. A click sets a star, a click on the lit last star clears it;
  hover peeks with a mouse only (`pointerenter`), so a tap leaves no hover
  state. The peek outlines the stars only; the words under them always
  name the rating Save stores (wave 3, as the mockup: with the pointer
  resting on a star, a click that clears it or a key would otherwise leave
  words that disagree with the stars). The stars are `<button role=radio>`s with an inline SVG that never
  take focus. Flashes as before.
- Delete (hood "Delete session"): a key/value list (Character, the long
  date, Time, the long duration, Runs, and `Saved: yes — ★★★★` in gold when
  saved) and the permanent-delete warning in the danger colour. **Y**
  deletes every run of the chain; every other non-modifier key cancels
  (Enter and Tab included; a modifier alone waits), as today. The buttons
  are "Yes, delete" (danger, Y marked: the kit marks the letter inside the
  label and "Delete" has no Y) and "Cancel". The delete button is not
  primary, so Enter cancels; `anyKeyCancels` makes a click on the veil
  cancel.

**A one-shot guard** in each box: once it starts saving or deleting, or
is closing, it holds every key and pops once. A quick second key during
the IndexedDB write can no longer pop History (the TUI frames had this
bug).

**The run-log error box** (dlg `runlog-error`, hood "Run log"): "This run
log could not be opened.", the session line, the reason from
`PlayerOpenResult.error` verbatim in a mono well (`pre-wrap`,
`overflow-wrap: anywhere`, so a long id never widens the box), then "The
run data may be damaged. Stats and Backup may still work." OK, Enter or
Esc close it.

**The keys box** (dlg `keys`, hood "Keys") reuses `Dialog` and `KeyHelp`
with any-key-closes, but lays two `KeyHelp` lists side by side (the moving
keys, then the letters), wrapping to one column on a narrow screen, to
keep the box low; `openKeyHelp`'s single list was very tall. The "?"
button is an icon-only `GlassButton` (data-btn `KEYS`, title "Keys (?)").

No `backdrop-filter` in the boxes; the only motion is the kit's dialog
entry and the stars' 250 ms colour change (scaled by `--lk-ts`).

### 45-D — The run log player: Back and h:mm:ss verified

Stage 42f built the player core (ADR 0127 "42f"); this stage changed no
player source. 45-D checked it against the owner's decisions in e2e on
Chromium, Firefox and the phone: Back is top left in the kit's look,
hides with the chrome after 6 s of play and returns on a pointer move, a
key or a tap; a click returns to History exactly as it was, checked as a
whole snapshot (pill, sort direction, row count, cursor row and index,
card name, the table's scrollTop) on 39 sessions (the demo backup plus 12
copies shifted k hours with renamed run ids, so chains stay apart and
nothing expires under the pinned demo clock). On windows of 480, 420, 390,
360 and 320 px Back never meets the header's left part or the compact
box. `h:mm:ss` from one hour in the clock and the rail's drag hint (the
run log player has no hover hint); `mm:ss` below. The HTML replay has no
Back and keeps `MM:SS` (`02:02`, `94:07`). Close and the header's `ESC
Back` stay (open question 1's default).

### 45-E — Tests and documents

**One story per spec, the new hooks.** `history.spec.ts` keeps its story
(demo backup, three rows newest first, Rasta saved ★★★★, the storage
line, filter Gittan, sort by Dur., Save and Rate 2, Stats of Rasta, Delete
the 12 min session) and the Exit-with-rating test on the new DOM, and adds
the empty page (only Restore and "?" on; Restore fills it). The hooks:
the page `.wc-start .wc-frame:not([hidden]) .wc-hist`; rows
`.wc-lk-tr[data-id][data-i]` and their cells `.wc-hist-char|date|time|
dur|exp|rate`; the chosen row `.wc-lk-tr.is-on` (`.is-cur` / `.is-idle`);
heads `.wc-lk-th[data-key][data-dir]`; pills `.wc-hist-pills
[role=radio][data-opt]`; buttons `.wc-lk-btn[data-btn]` (`RUN LOG`,
`STATS`, `RATE`, `SAVE`, `EXPORT`, `DELETE`, `BACKUP`, `RESTORE`,
`KEYS`); the card `.wc-hist-card`; Statistics `.wc-hs-box`,
`[data-tbl=kills|pvps]`, `.wc-hs-sec[data-sec].is-focus`; the boxes
`.wc-lk-dialog[data-dlg=rate|delete|runlog-error|keys]`.

**The phone test moved.** phone-frames.spec's "Statistics stack their
sides; History swipes sideways to every column" (a TUI test) is deleted;
`phone-history.spec.ts` covers the same ground on the new look: nothing
scrolls sideways, every cell of a two-line row is on the screen, the sort
list, "?" by tap, Statistics in one column with every table head on the
screen, and Back by tap to History as it was. The card's buttons and
Export on the phone stay in 45-A's `phone-history-page.spec.ts`, Rate and
Delete in 45-C's `phone-history-dialogs.spec.ts`, the player's Back by tap
in 45-D's `phone-player.spec.ts`.

**Other specs' History steps** were moved to the new hooks, one helper
each: `export.spec.ts`, `phone-export.spec.ts` (its gate skip is gone: the
tests now run), `scrolling.spec.ts` (the History table, the Statistics
tables, the export case), `scrollbar-drag.spec.ts`. `underscores.spec.ts`
checked accented capitals on "a kit row on the cell grid" in History's TUI
table; History left the cell grid, so the check now uses a line of the
in-game Statistics pane (still `statsBody` on the cell grid), with a solid
fill on the marked line so it and its twin stand on the same colour (the
pane's lantern frame paints a gradient), run after the input-line and
output-row checks because its float covers the game text.

**Unit tests** (`chrome-history.test.tsx`, the "History frame" describe):
45-A's rewrite, 45-C's dialog assertions, and Backup / Restore flashes and
failures (`Saved <file>.`, `Backup failed: …`, `Restored N runs (M already
present).`, `Restore failed: <BadBackupError>`), `Save failed: …`, and the
busy guard (a second S and a B while a save waits do nothing).

## Measurements

History with about 500 sessions (the demo backup plus 166 copies shifted
one hour each, restored through History's Restore), production build
(`vite build`, `vite preview`), headless at 1440×900, the page's clock
pinned to the demo day. Each figure runs from the event to the next
animation frame plus a `setTimeout(0)`, so about 16 ms means "within one
frame". Two runs per browser on a machine shared with other builds:

| | Chromium | Firefox |
|---|---|---|
| ↓ (cursor) | median 13–15 ms, max 21–32 ms | median 14 ms, max 17–33 ms |
| head-click sort | median 19–29 ms, max 25–61 ms | median 14–15 ms, max 16–35 ms |
| ← / → (pill) | median 14–23 ms, max 17–44 ms | median 24–30 ms, max 27–32 ms |
| open History (click → 500 rows drawn) | 21–46 ms | 26–39 ms |

45-A's dev-server numbers (683 sessions): ↓ 14–30 ms in Chromium (median
about 16) and 15–22 ms in Firefox after a first 146 ms JIT hit; before
memoised rows and delegated handlers a ↓ took 21–34 ms (Chromium) and
48–210 ms (Firefox). A sort or a pill change re-renders every row once
and can take two frames at 500 sessions; a cursor key stays within one.
The stage's rule ("`content-visibility: auto` if 500 sessions take more
than 8 ms to render") is applied: rows carry it.

The player: 45-D measured frame times while playing the demo at 8× with
the chrome shown, headless 1440×900: Chromium p50 / p95 / max 16.7 ms
with and without Back; Firefox headless noisy (p95 17–33 ms, max 33–166 ms)
with no consistent difference. Back reads layout once. The real-window
Iris Xe check is left for wave 3 (it needs the owner's machine).

No chunk sizes were measured per package; the History, Statistics and
dialog code and CSS are in the chrome chunk (about 9 kB raw CSS and 13 kB
raw TSX for Statistics). Wave 3's build pass records the chrome chunk.

## Consequences

- History, Statistics, Rate and Delete no longer use the TUI widgets.
  Wave 3 removed the grid-only model helpers (`pillWindow`, `PILL_*`,
  `pillWidth`, `expiresCell`, `ratingCell`, `Cell`, `panPills`,
  `scrollPills`) with their tests, and Statistics' own copy of
  `fmtLongDate` (it imports History's). `SessionStatsFrame`
  (statistics.tsx, not stage 45's file) is left for the main session's
  sweep.
- History is the reference user of the kit's `Table` with a cursor and a
  button zone. Kit gaps found here, solved with local helpers, for wave 3:
  1. `TableRow` passes no `onPointerDown`, which the cursor needs to tell a
     tap from a click; History delegates every row pointer handler from the
     rows' parent.
  2. On a coarse pointer Back grows to 40 px and covers the large window's
     top padding; History and Statistics each step their head down under
     `pointer: coarse` (10 and 16 px). Every large page needs the same rule.
  3. `Table scroll` puts a fixed 26 px (8 px gutter) on the heads and
     totals; Firefox's overlay scrollbars are 0 px. Statistics measures the
     gutter; History's heads sit about 8 px left of its cells in headless
     Firefox.
  4. `stackBelow` measures the table, not the page; a forced `stacked`
     prop would be cleaner than `stackBelow={1e6}`.
  5. `DialogButton` has no `icon` (the mockup's trash on "Yes, delete").
  6. A dialog needing arrows, digits or Y-or-anything-cancels adds its own
     `useKeyLayer`; with `anyKeyCancels` the Dialog's Enter presses the
     primary rather than cancelling.
- Player core gaps (stage 42f's files; wave 3, `player.css` / `view.ts`):
  Back's translucent glass over the game text (`backdrop-filter` that
  Firefox does not render inside the player chrome, and a light chip in
  Paper) wants an opaque fill and no `backdrop-filter`; a tap on a hidden
  control presses it (the chrome shows on pointerdown and the click lands),
  so a stray tap top left leaves the player; ignoring chrome clicks for
  about 300 ms after a pointerdown showed it would fix both Back and the
  box's buttons.
- The run log open now reports why it failed; History is its only reader.

## Open questions (defaults built)

1. The player has Back (top left), Close (control box) and `ESC Back`
   (header hints). *Default: keep all three.*
2. The HTML replay's times as `h:mm:ss`? *Default: `MM:SS`, as today.*
3. Touch: a second tap on the chosen row opens the run log (the kit's
   `tap-selects`, as the Profile list). *Default: kept.*
4. Rate's hood is "Rate the session" (the mockup's and today's), the
   stage file said "Rate"; Delete's buttons are "Yes, delete" / "Cancel"
   (the mockup said "Keep it"). *Defaults as built.*

## Addenda to older ADRs

- ADR 0018 (runs, History, the log player): addendum 2026-11-07, History
  in the new look.
- ADR 0075 (phone): addendum 2026-11-07, History's Export gate removed.
- ADR 0109 (the Statistics pane): addendum 2026-11-07, History's
  Statistics is its own page; the pane and the ESC menu keep `statsBody`.

## Wave 3 sweep (2026-11-08)

`SessionStatsFrame` (and its `sessionHeader`) is removed from
statistics.tsx; the file keeps the ESC menu's live Statistics and the
pane's `statsBody`. History and Statistics drop their own room under a
coarse Back (the kit's Back clears them, ADR 0127). Still open: the
real-window Iris Xe check of the player.

## Final check (2026-11-08): measured

Headed (real windows) on the owner's Iris Xe, a `VITE_KIT=1` production
build under `vite preview`, load average 1.4–4.5, nothing else running;
the full method and every page in `bench/results/look-box.md`, "Final
check". Cells: `fps · p95 / max frame ms · frames > 20 ms` over 5 s; no
page had a main-thread stall over 16 ms or (Chromium) a long animation
frame while idle. The Profile list is the reference row.

| page | Chromium 1728×1000 @2 | Chromium 390×844 @3 | Firefox 1728×1000 @2 | Firefox 390×844 @3 |
|---|---|---|---|---|
| Profile list | 59.7 · 18.0 / 34.9 · 2 | 59.6 · 18.1 / 35.8 · 3 | 58.8 · 26.6 / 45.6 · 35 | 58.9 · 28.9 / 50.3 · 20 |
| History | 60.0 · 18.1 / 19.6 · 0 | 60.0 · 18.0 / 19.8 · 0 | 58.6 · 19.7 / 36.2 · 14 | 59.2 · 30.1 / 47.2 · 28 |
History (the demo backup, the capped box) idles like the other large
pages. The player was not measured in this pass (its headed Iris Xe
check with Back stays open).

## Owner feedback (2026-11-08): the run log in the big box

The owner reversed decision 3 ("today's player, filling the whole
player window, no sky, no box"): the run log player starts in History's
big box with its border and the sky around it; its Fullscreen fills the
whole window and the browser goes fullscreen. Technical decisions:

- **How it opens.** A new service, `ChromeServices.openRunLog(session)`
  (`Shell.openRunLog`), makes a player host in a hidden parking element
  in the page root, loads the session into it as the run log player
  (Back, `h:mm:ss`) and resolves to `{ ok: true, host }` or `{ ok: false,
  error }`. History then pushes `RunLogFrame` (`src/chrome/frames/run-log.tsx`)
  with the host; the frame moves `host.el` into its slot. Loading first
  keeps the old contract: a failed open shows `RunLogErrorDialog` and
  History never moved; an open that finishes when History is no longer
  the top frame disposes the host. The "one player, only from the start
  page" rules are `makeHost`'s, shared with `embedPlayer`.
  `ChromeServices.openPlayer` is gone (History was its only user);
  `Shell.openPlayer` and `openPlayerChain` keep the whole-window path for
  the dev hooks (`__wc.openPlayer`, `?player=`, `openPlayerLogs`), the
  bench and the tests that drive the player directly.
- **The page.** `RunLogFrame` is a look frame with `Box size="large"
  title="Run log"`: pushed over History's large box it is the kit's box
  swap (the box stays, the hood's title cross-fades to "Run log", the
  player fades in). The box's own Back is hidden by CSS: the player's
  Back (top left, hiding with its chrome), Esc and the control box's Close
  are the ways back. The window's padding is a 20 px band under the hood
  (so the hood never covers the player's header) and nothing else; the
  slot fills the rest and the player fills the slot (`ResizeObserver`
  relayout, as any host). The host's close disposes it and the frame pops
  itself (only while it is the top frame); the frame's unmount disposes a
  host still open (a fresh start page). History stays mounted under it,
  so its filter, sort, cursor and scroll are as left.
- **Keys.** `usePlayerKeys(true)`: the frame's key layer swallows every
  key at the stack and the view handles them (as the Spotlights viewer).
  The player has no `F` key (only the HTML replay has one); none added.
- **Fullscreen.** The control box's button puts the player's own element
  in fullscreen (`toggleFullscreen(doc, host.el)`; `isFullscreen(doc,
  el)` for its label and icon) instead of the document. The browser's
  top layer then shows the player alone, filling the screen, whatever
  the box's styles (its window is a size container and isolated, which
  would trap a `position: fixed` copy); the filled state *is* the
  browser's fullscreen state, so leaving it any way (the button, the
  browser's Esc, F11) puts the player back in the box with no state of
  our own, and closing the player (its element leaves the page) leaves
  fullscreen. The page's own fullscreen (the phone's corner button, a
  tablet's menu bar) is separate: with the page fullscreen the player's
  button still reads "Fullscreen" and asks for its own element. The
  phone has no player Fullscreen button (as before); there the box
  nearly fills the screen (layout B's 6 px margin).
- **Sky.** `useSkyPause(true)` while the frame shows: the sky stays as a
  still picture around the box, so the run log costs no more frames than
  the full-window player did (the "Performance" budget above; the box
  adds no animation besides the swap's fades).
