# Stage 45 — History and the run log player

Status: **Next** (planned 2026-11-07; built in wave 2 of the broad pass,
after stage 42, in parallel with stages 43, 44, 46 and 47).

## Goal

Move History (start menu → History) out of the TUI grid and into the new
look the owner chose in round 7: **A "Tabell och kort"** (table and card)
in the big box of layout **B "Rummet växer"**, with Statistics in the same
box and Rate and Delete as small boxes over it. Keep every function, key
and phone path History has today.

The run log player (History → Run log) keeps **today's player** (stage
32c, ADR 0114 "ghost look") almost unchanged, filling the whole player
window. The only additions are a **Back button at the top left** (the
kit's Back), playback times as **h:mm:ss**, and a clear error box in
History when a run log cannot open. The exported HTML replay stays
exactly as it is today.

## Owner decisions

From "Round 7 decisions (owner, 2026-11-07)" in
`notes/research/start-menu-mockups/README.md`, and the defaults the owner
accepted for the round 7 open questions (recorded here as decisions):

1. **History = A "Tabell och kort"** (`round7/history/history-a.html`):
   the session table with sortable heads and character pills; the chosen
   session in a card at the right with its actions; Backup, Restore and
   the storage line in the foot; Statistics in the same box; Rate and
   Delete as small boxes over the page.
2. **Width cap.** On a very wide screen the History box does **not grow
   wider than its content needs**; past that width it stays centred at its
   content width and more sky shows on both sides. (Height still follows
   layout B: the full window less the box margin.)
3. **Run log player = none of the A/B/C mockups.** Today's player, almost
   unchanged, filling the whole player window (no sky, no box, no
   wordmark). The only addition is a **Back button**, top left, in the
   kit's Back style. The HTML replay is **exactly as today** (no Back,
   same times, same header).
4. **No key-hint row on History**; a small **"?" button** (and the `?`
   key) shows the page's keys in a small box.
5. **Playback times as h:mm:ss**: `12:41 / 3:41:07`, i.e. `h:mm:ss` from
   one hour, `mm:ss` below (today: unbounded minutes, `221:07`). Applies to
   the run log player's time readout, the rail's seek hint and its marker
   tips. Durations in History stay durations (`3h41m` in the table, `3 h
   41 min` in the card). The HTML replay keeps today's format (decision 3).
6. **A clearer error box when a run log cannot open**: today a failed
   open only logs to the console and nothing happens. Now History shows a
   small box: "This run log could not be opened." with the reason and an
   OK button.

Technical decisions taken while planning (record them in this stage's
ADR, **0130**, assigned by the main session):

- **Statistics in the new look is a new component**, not a restyle of
  `src/chrome/frames/statistics.tsx`: that file's `statsBody` and
  `LiveStatsFrame` also serve the in-game Statistics pane
  (`src/chrome/stats-pane.tsx`, ADR 0109) and the phone's ESC menu, which
  stay as they are. The new page reuses the pure model
  (`src/runs/stats.ts` `buildStats`, `rateSeries`) and the pure helpers in
  `stats-layout.ts` (sorting, `fmtK`, `fmtClock`, `sparkBuckets`).
- **The player keeps Close and its header.** The owner asked for one
  addition only, so the control box's Close (`Back to History (Esc)`) and
  the header's key hints (with `ESC Back` clickable) stay. Back hides and
  shows with the rest of the chrome (it hides 6 s after the last activity
  while playing, stays while paused), and the header's left part leaves
  room for it on a narrow window. Whether Close and the header hints should
  go now that Back exists is an open question for the owner (below).
- **Row click selects, double click / Enter opens** (the mockup). Today a
  single click on a row opens the log. On a touch screen a tap selects and
  shows the card (on a phone, under the row); the card's Run log button
  opens it.
- **Shortcut letters** (the mockup's, unique on the page): **R** Run log,
  **T** Stats, **A** Rate, **S** Save, **X** Export, **D** Delete, **B**
  Backup, **O** Restore, **?** keys. ←/→ change the character pill.

## References

Read first: `CLAUDE.md`, the top of `progress.md`, this file, then:

- Mockups (throwaway code, re-derive the look in the app's structure):
  - `notes/research/start-menu-mockups/round7/history/history-a.html`
    (+ `history-a.js`, `history-a.css`, `hist.css` for the shell,
    Statistics and the dialogs, `hpages.js` for Stats / Rate / Delete,
    `hdata.js` for the action list and keymap). States: `?do=stats`,
    `?do=rate`, `?do=delete`, `?empty`, `?error`, `?restorefail`,
    `?statsloading`, `?menu`.
  - `round7/history/CONTENT.md`: the real content, states, messages and
    keys of History, the player and the replay (the inventory to keep).
  - `round7/history/index.html`: the review notes per direction.
  - `round7/layout/b-room.html`: how a big page opens (the menu panel
    grows into the box; stage 42 builds it).
  - `round7/base/README.md`: the kit's look (classes and tokens).
  - The player mockups `player-a/b/c.html` are **not** chosen; do not
    build them.
- `docs/stages/42-look-pages-base.md` (the shared base: layout B, kit
  extensions, player core; its "API" and "Canonical names" sections).
  Do not start before it is merged.
- ADRs: 0018 (runs, History, the log player), 0019 (export, replay,
  PlayerView options), 0021 (viewer settings), 0109 (Statistics pane),
  0114 (ghost look), 0123 (Lykta), 0125 (start surface and lantern kit),
  0126 (wordmark), and 0127 (stage 42).
- Inventory: `notes/research/cockpit-inventory.md` §7.3 (Statistics),
  §7.4 (History), §7.5 (log player).

## Current code (what this stage replaces or touches)

| File | Today | This stage |
|---|---|---|
| `src/chrome/frames/history.tsx` | TUI History frame, `RateFrame`, `DeleteFrame`, `NO_PLAYER` | Rewritten as a `lookFrame` (WP 45-A); Rate and Delete move to WP 45-C |
| `src/chrome/frames/history-model.ts` | Pure: sort, cells, pill window, formatters, `storageText` | Kept; grid-only helpers (`pillWindow`, `PILL_*`, `expiresCell`, `ratingCell`) stay for tests until wave 3; new pure helpers added (card deeds) |
| `src/chrome/frames/statistics.tsx`, `stats-layout.ts` | Statistics renderer shared by History → STATS, the Statistics pane and the ESC menu | **Not changed** (read-only); `SessionStatsFrame` is no longer pushed by History |
| `src/chrome/frames/export-editor.tsx` | Export editor (stage 43 rebuilds it) | Read-only: History pushes `<ExportEditorFrame session={…} />` as today |
| `src/player/*`, `src/app/player-host.ts`, `src/app/shell.ts` | The player, its host, the shell's `openPlayer` | Changed by stage 42's player core (see "Uses from stage 42"), **not** by this stage |

What must keep working (from the code and `CONTENT.md`):

- **Data**: one row per session (`RunLibrary.listSessions(nowUs())`),
  re-read whenever History is the top frame again; the live run is never
  listed; storage line from `lib.estimate()` (`Storage: 46 MB of 299 GB`).
- **Filter pills**: `All` + one per character (alphabetical); choosing one
  filters at once and puts the cursor on row 0; overflow scrolls (no `‹ ›`
  cells any more: the pill row scrolls sideways, the chosen pill kept in
  view).
- **Sort**: header click; same column flips; a new column starts ▲ for
  text, ▼ for the rest; default Date ▼; Expires and Rating keep saved
  above unsaved (`nextHistorySort`, `sortSessions`, unchanged). Phone: a
  sort select (Newest first, Oldest first, Character, Longest, Rating,
  Expires soonest).
- **Cursor**: follows its session through sort, save and reload; after a
  delete it stays at the same index (today's `cursorId` / `cursorIdx`
  logic).
- **Actions and when they are off**: Run log (needs `hasLog`), Stats,
  Rate, Delete (need a session), Save (off when saved), Export (needs
  `hasLog`; today the phone gets `Export: desktop only.`; stage 43 makes
  the Export editor work on a phone (its ADR 0075 addendum), so **this
  stage removes the phone gate**, see WP 45-A), Backup (off with no
  runs), Restore (file picker `.gz,.jsonl.gz,application/gzip`; always
  on: the way back from a new device), Back.
- **Messages** (the page's flash, same texts): `Saved.`, `Saved
  <backup file name>.`, `Restored N runs (M already present).`, `Rated
  ★★★★.`, `Saved, no rating.`, `Session deleted.`, and in the fail
  colour `Could not read the runs: …`, `Save failed: …`, `Backup failed:
  …`, `Restore failed: …` (BadBackupError text), `Rating failed: …`,
  `Delete failed: …`, `Log player not available.` One action at a time (`busy` guard).
- **Rate**: `Gibur · 2026-11-06 · 21:12 · 3h41m`, five stars; 0–5, ←/→,
  click a star (`ratingKey`); Enter saves (also an unsaved session); Esc
  cancels; starts at the saved rating (0 if unsaved).
- **Delete**: Character, Date, Time, Duration, Runs; `Saved: yes — ★★★★`
  when saved; the permanent-delete warning; **Y deletes every run of the
  chain, any other key cancels** (kept), plus Delete / Cancel glass
  buttons for the mouse.
- **Statistics** ("Session details"): ALLIES, ACHIEVEMENTS (with the time
  into the session), KILLS (`name · N · XP/N · XP tot`, default XP tot ▼,
  sortable by the head labels) + Total, PvPs (`⚔ *Name the Race* · N ·
  XP`) + Total, XP/h and TP/h sparklines (y max / half / 0, x `00:00` →
  duration), the XP ruler (gained band, red on a loss, level marks).
  Tab / Shift+Tab move the focused table, ↑↓ scroll, PgUp/PgDn, Home/End,
  click a head to sort, Esc back. States: `Loading…`, `No XP data.`,
  `Could not read the session: …`. Phone: one column.
- **Run log**: Enter / double click / R / the Run log button →
  `services.openPlayer(session)`; the start page is hidden with History's
  state intact; Esc or Back returns to History exactly as it was.
- **Keys today that change**: Tab zones filter → table → buttons become
  rows ↔ buttons (as the Profile list, ADR 0125); ←/→ in the rows change
  the pill (today they jumped to the buttons); every action has its
  letter. Esc always goes back.
- **The player** (unchanged except Back and h:mm:ss): autoplay 1×; header
  `Gibur (L41) · Run 1 of 2 · 2026-11-06 21:12` with its hints; the rail
  with markers and tips; the control box (To the start, ±10 s, Play/Pause,
  speed, time, Panes, Display, Fullscreen, Close); Panes and Display
  popups; auto-hide; the pause cursor line; keys Space, ←/→ (±Shift) 10 s,
  Home, ↑↓ PgUp PgDn End, 1–6, Esc (popup first). Phone: compact box.
- **The HTML replay**: everything as today (`src/replay/*`, header
  `<title> · Gibur (L41) · date`, hints with `F Fullscreen`, no Close, no
  Back, `MM:SS`, comments, cuts, embedded map).

## Scope

In: the History page, its Statistics, Rate, Delete, the keys box and the
run-log error box in the new look; History's tests; verifying the
player's Back and h:mm:ss (built by stage 42's player core) and their
tests; this stage's ADR; Inv §7.4 / §7.5 notes.

Out: the player's look (unchanged); the HTML replay (unchanged); the
Export editor (stage 43); the in-game Statistics pane and the phone ESC
menu's Statistics (unchanged); About / README text (stage 47 and wave 3).

## Work packages

Each package is sized for one subagent. File ownership is exclusive
across stages 43–47 in wave 2: touch only the files listed for your
package; read anything. Shared test files are edited only in the hunks
named here.

### WP 45-A — The History page

Owns: `src/chrome/frames/history.tsx` (the `HistoryFrame` part),
`src/chrome/frames/history.css` (new), `src/chrome/frames/history-model.ts`
(additions only: e.g. `sessionDeeds(s)` summing `runs[].summary` kills,
pkills, deaths; `fmtDurLong`; the phone sort options).

- `export const HistoryFrame = lookFrame(function HistoryFrame() …)`;
  keep the export name and `NO_PLAYER` (tests import them).
- `<Box title="History" size="large" maxWidth={…} onBack={nav.pop}>` per
  stage 42; the cap is the content's natural width (table up to ~800 px +
  gap + 290 px card + padding; measure and set it once, around 1180 px).
- Head: the pill row (`Seg kind="pills"`, scrolls sideways), the "?" button at the
  right (WP 45-C's `HistoryKeysButton`).
- Body: the kit's `Table` / `TableRow` (sortable heads `Char · Date · Time · Dur. ·
  Expires · Rating`; Expires `Saved` gold, `N days`, ≤ 2 days warm;
  Rating `Stars`), the card at the right (name, `Level N`, long date
  and time, Duration + runs, Deeds (kills · PvP · deaths), Kept (Saved +
  stars, or "Expires in N days" with the drain gauge), Log (captured or
  not), and the six actions as glass buttons in a column: Run log
  (primary), Stats, Rate, Save, Export, Delete (danger)).
- Foot: Backup, Restore, the flash (`LookFlash`), the storage line.
- States: loading (`Loading…` in the table), empty (`No runs recorded
  yet.`; the card says "Recorded sessions show here. Restore brings back
  a backup from another browser."), read error (flash + "The runs could
  not be read.").
- Phone (≤ 760 px): no table head, two-line rows, the sort select, the
  card opens under the chosen row with its buttons in a wrapping row.
- Keys: ↑↓ PgUp PgDn (10) Home End in the rows, ←/→ the pill, Enter opens
  the run log, the letters above, Tab / Shift+Tab rows ↔ buttons (←→ / ↑↓
  walk the buttons, Enter presses, skipping disabled ones), `?` keys box,
  Esc back.
- Statistics: `nav.push(<HistoryStatsFrame session={cur} />)` (WP 45-B),
  shown in the same box (stage 42's box swap).
- Export: `nav.push(<ExportEditorFrame session={cur} />)` on every
  device; **remove the phone gate** (`Export: desktop only.`): stage 43
  builds the Export editor for the phone in the same wave. If stage 43's
  phone layout does not land, wave 3 restores the gate.
- Run log: `const r = await services.openPlayer(s)`; on failure open WP
  45-C's `RunLogErrorDialog` with `r.error`; without the service flash
  `NO_PLAYER` as today.

Uses from 42: `Box size="large" maxWidth`, `BoxHead` / `BoxBody` /
`BoxFoot`, `Table` / `TableRow` (`stackBelow` for the phone's two-line
rows), `Seg kind="pills"`, `Select`, `GlassButton`, `LookFlash`, `Stars`,
`useListCursor`, `useButtonZone`, `letterAction`, the icons `play`,
`stats`, `star`, `save`, `backup`, `restore`, `help`, and
`PlayerOpenResult`.

### WP 45-B — Statistics in the new look

Owns: `src/chrome/frames/history-stats.tsx` (new), `history-stats.css`
(new).

- `export const HistoryStatsFrame = lookFrame(function … ({ session }))`,
  a large box titled **Statistics** that replaces History's content in
  the same box (stage 42's box swap; Back / Esc returns to History
  with its state).
- Head: the name (Cinzel), `Level N`, `Session details · <long date> ·
  21:12 · 3h41m · 2 runs · ★★★★`.
- Body: the mockup's grid (`hist.css` "Statistics", `hpages.js` `stats`):
  Allies, Achievements (time into the session, `h:mm:ss` from one hour, as
  `stats-layout.ts` `fmtClock` already does), Kills and PvPs tables with
  sortable heads (reuse `sortKills`, `sortPvps`, `nextStatSort`,
  `DEFAULT_KILL_SORT`, `DEFAULT_PVP_SORT`), the two sparklines as inline
  SVG (`sparkBuckets` / `rateSeries`), the XP ruler across both columns.
- Data: `lib.events(session.runs.map(r => r.runId))` → `buildStats(events,
  { character })`, as `SessionStatsFrame` does today.
- Keys: Tab / Shift+Tab focus the four tables (the focused section head
  in the accent colour), ↑↓ scroll the focused table, PgUp/PgDn, Home/End,
  Esc back. Click a table to focus it; the wheel scrolls it.
- Phone: one column, tables unbounded (the body scrolls).

Uses from 42: the box swap, `BoxBody`, `Rule` and `.wc-lk-sec`,
`.wc-lk-kv`, `.wc-lk-empty`, `.wc-lk-scroll`, the `--lk-accent` token.

### WP 45-C — Rate, Delete, the keys box and the run-log error box

Owns: `src/chrome/frames/history-dialogs.tsx` (new),
`history-dialogs.css` (new). Removes `RateFrame` and `DeleteFrame` from
`history.tsx` **only after** WP 45-A has landed (or, when run in
parallel, WP 45-A deletes them in its rewrite and imports the new ones;
agree on the exports below and do not edit each other's files).

Exports (the contract WP 45-A codes against):

```ts
export function RateDialog(p: { session: Session; done: () => Promise<void> }): VNode;   // pushed as an overlay frame
export function DeleteDialog(p: { session: Session; done: () => Promise<void> }): VNode; // pushed as an overlay frame
export function RunLogErrorDialog(p: { session: Session; error: string }): VNode;
export function HistoryKeysButton(): VNode;  // the "?" glass icon button; opens the keys box (also the `?` key, via openHistoryKeys)
export function openHistoryKeys(nav: Nav): void;
```

- Rate: a small Lykta box over the veiled page, hood "Rate", the session
  line, five big stars (hover peeks, click sets), the rating as words,
  Save (Enter) and Cancel (Esc) buttons. Same keys and flashes as today.
- Delete: hood "Delete session", the key/value list, `Saved: yes — ★★★★`,
  the warning in the danger colour, **Y** deletes, any other key cancels,
  Delete (danger, letter Y) and Cancel buttons.
- Run-log error: hood "Run log", "This run log could not be opened."
  then the reason (`error`, wrapped), then "The run data may be damaged.
  Stats and Backup may still work." and OK (Enter / Esc / click).
- Keys box: stage 42's `openKeyHelp(nav, 'Keys', rows)` listing History's
  keys in two columns (`↑ ↓` Move, `← →` Character, `Enter` Run log, the
  letters, `Tab` Buttons, `?` This list, `Esc` Back); Esc, `?` or a click
  closes.

Uses from 42: overlay frames (`nav.push(node, { overlay: true })`: the
page under it stays drawn under a veil), `Dialog` (`dlg` `rate`,
`delete`, `runlog-error`, hook `.wc-lk-dialog[data-dlg]`), `KeyHelp` /
`openKeyHelp`, icon-only `GlassButton` (`icon="help"`, `title`), `Stars`,
the `--lk-danger` token.

### WP 45-D — The player: verify Back and h:mm:ss, tests

Owns: `tests/e2e/player.spec.ts`, `tests/e2e/viewer.spec.ts` (only if a
selector moved), `tests/e2e/replay.spec.ts` (one new assertion: no Back,
`MM:SS` kept).

- Stage 42's player core (42f) delivers the Back button (`.wc-pv-back`),
  h:mm:ss and the `openPlayer` result, with its own
  `tests/e2e/player-core.spec.ts` (see "Uses from stage 42"). This package checks
  them against the owner's decisions on Chromium and Firefox, desktop and
  phone, and writes the e2e coverage:
  - Back is at the top left, in the kit look, hides with the chrome while
    playing and shows on a pointer move or a key; clicking it returns to
    History exactly as it was (filter, sort, cursor, scroll).
  - On a narrow window (≤ 480 px) Back never covers the header's left
    part or the compact box.
  - The time readout: a 1h34m session shows `…/ 1:34:xx`; a 2 min one
    `00:20 / 02:02` (today's tests keep passing).
  - The HTML replay: no Back element, `MM:SS` unchanged.
- The player core's files (`src/player/view.ts`, `strip.ts`,
  `player.css`, `src/app/player-host.ts`, `src/app/shell.ts`,
  `src/chrome/kit/hooks.ts`) are stage 42's and read only in wave 2 (the
  fallback "this package builds it" is dropped: stage 42 builds it). A gap
  found here is fixed in wave 3 and named in the report.

### WP 45-E — History tests, ADR, docs

Owns: `tests/e2e/history.spec.ts`, `tests/unit/chrome-history.test.tsx`
(the `History frame` describe; leave `ESC menu: Statistics and Exit with
rating` as it is), `tests/e2e/phone-history.spec.ts` (new), ADR 0130,
Inv §7.4 / §7.5 notes in `notes/research/cockpit-inventory.md`,
this stage file's checklist.

- `tests/e2e/phone-frames.spec.ts`: **delete only** the test
  `Statistics stack their sides; History swipes sideways to every column`
  (one hunk; stages 43 and 44 edit other tests in that file) and cover the
  same ground in `phone-history.spec.ts`.
- Runs after WP 45-A/B/C have landed on the stage branch (or in step with
  them, selector by selector).

## Tasks

- [ ] Stage 42 merged; read its file and ADR 0127
- [x] WP 45-A: History page (table, pills, card, foot, states, phone, keys, width cap)
- [x] WP 45-B: Statistics in the same box
- [x] WP 45-C: Rate, Delete, keys box, run-log error box
- [x] WP 45-D: player Back and h:mm:ss verified; player/replay tests
- [x] WP 45-E: History unit and e2e tests, phone test moved, ADR 0130, Inv notes
- [ ] Typecheck, lint, unit, e2e (Chromium and Firefox) green
- [ ] Performance check (below)
- [ ] Screenshots at 1280×720, 1440×900, 2560×1440 and 390×844 reviewed by
      the main session against `history-a.html`
- [ ] Test guide for the owner (below) checked

## Test plan

Unit (`vitest`):
- `tests/unit/chrome-history.test.tsx`, `History model`: keep; add the
  new pure helpers (`sessionDeeds`, `fmtDurLong`, phone sort options).
- `History frame`: rewrite for the new DOM: pills filter, header sort,
  cursor follows a session through save/sort, Save / Backup / Restore
  flashes and failures, Export pushes the Export editor (also on a
  phone; update the existing `EXPORT opens the export editor` case and
  drop the phone refusal case), disabled actions,
  letters, Tab zones, Run log calls `openPlayer`, a failed open shows the
  error box, `Log player not available.` without the service.
- New: Rate (keys 0–5, ←/→, Enter saves an unsaved session, Esc), Delete
  (Y deletes, other keys cancel), the keys box, Statistics (loading, no
  XP, read error, table focus and sort).
- `tests/unit/player-timeline.test.ts` `fmtClock` cases change with stage
  42 (owned there).

E2E (`playwright`):
- `tests/e2e/history.spec.ts`: rewrite the first test on the new
  selectors (stage 42's kit classes and `tests/e2e/look.ts` helpers; keep `[data-btn]` ids on the glass
  buttons: `RUN LOG`, `STATS`, `RATE`, `SAVE`, `EXPORT`, `DELETE`,
  `BACKUP`, `RESTORE`) with the same story: demo backup, three rows
  newest first, Rasta saved ★★★★, storage line, filter Gittan, sort by
  Dur., Save and Rate 2, Stats of Rasta (allies, achievements, a PvP,
  sort Kills), Delete the 12 min session. Keep the second test (Exit with
  a rating) and only update its History selectors.
- New: the width cap (at 2560×1440 the box is narrower than the window
  less the margins and centred); the empty page; Restore of a bad file;
  the keys box; the run-log error box (a session whose log chunks are
  removed through the dev hook).
- `tests/e2e/player.spec.ts`: Back (see WP 45-D); keep every existing
  test green (Close and the header hints stay).
- `tests/e2e/replay.spec.ts`: no Back, `MM:SS`.
- `tests/e2e/phone-history.spec.ts`: History at 390×844 (rows, the card
  under the row, its buttons tappable ≥ 32 px, Stats one column, Export
  opens the Export page) and the player's Back by tap.
- Other specs that open History (`export.spec.ts`, `runs.spec.ts`,
  `underscores.spec.ts`, `editor.spec.ts`, `scrolling.spec.ts`,
  `scrollbar-drag.spec.ts`, `smoke.spec.ts`, `chrome.spec.ts`): grep for
  `History`, `.wc-tr`, `wc-history`, `RUN LOG`, `─── History ───` and fix
  only the History steps (one helper per spec), leaving the rest to their
  owners.

## Performance notes

- The table renders every session (a few hundred at most): plain DOM rows
  with no per-row effects; use `content-visibility: auto` on rows if a
  list of 500 sessions takes more than 8 ms to render (measure with the
  demo backup restored several times through the dev hook).
- The big box over the animated sky: stage 42's rule (ADR 0127): the sky
  runs at its calm rate behind a large box, the large window's blur kept
  or dropped by its measurement, no `backdrop-filter` on the table or the
  card. History adds no animation of its own besides the card's content
  swap (opacity only).
- The player: Back is one more element in the chrome; it must not add
  layout work per frame (it is shown/hidden with the chrome's class, no
  measuring per frame). Re-run the player part of the Iris Xe check from
  stage 32 if the chrome changed: no frame over 16 ms while playing at 8×.
- Statistics: sparklines as one SVG path each; build them once per data
  load, not per render.

## Test guide for the owner

Branch of the broad pass (the main session gives the name), `npm run dev`,
open http://localhost:5173/. Restore the demo runs first: History →
Restore (O) → `tests/fixtures/runs-demo.jsonl.gz`, or play a short
session.

1. **Open History** (H). The menu panel grows into the big box. On a very
   wide window (or zoomed out) the box stops growing at its content width
   and the sky shows on both sides.
2. **The table and the card.** ↑↓ moves the row; the card at the right
   shows the chosen session (level, length, deeds, kept or expiring, log).
   ←/→ changes the character pill. Click a column head to sort, click
   again to flip.
3. **Actions.** Try the letters: R run log, T stats, A rate, S save, X
   export, D delete, B backup, O restore. Tab moves into the buttons.
   Disabled buttons are dim.
4. **"?"** (the button at the top right, or the `?` key): the keys in a
   small box. There is no key row at the bottom any more.
5. **Stats** (T): the session's details in the same box; Tab between the
   tables, click a head to sort; Back or Esc returns to History.
6. **Rate** (A) and **Delete** (D): small boxes over the page. Rate with
   0–5 or ←/→, Enter saves. Delete asks; Y deletes, anything else
   cancels.
7. **Run log** (Enter, double click or R): today's player, filling the
   window, with a **Back** button at the top left (it hides while playing
   and comes back when you move the mouse). Times over an hour read
   `1:34:07`. Back or Esc returns to History as you left it.
8. **A broken run log** (if you have one): a small box says it could not
   be opened, and why.
9. **Phone** (or a narrow window): rows on two lines, a sort list, the
   card opens under the chosen row; Export opens the new Export page
   (stage 43); the player's
   Back works by tap.
10. **The exported HTML replay** (Export → HTML replay): exactly as
    before, no Back.

Feedback wanted: the table and card at your usual window size; the width
cap; the "?" box instead of a key row; the player's Back (place, hiding
with the controls); the open questions below.

## Open questions for the owner (after testing)

The build follows the default until the owner answers.

1. The player now has Back at the top left **and** Close in the control
   box **and** `ESC Back` in the header hints. Keep all three, or drop
   Close and/or the header hints? *Default: keep all three (the owner
   asked for one addition only).*
2. Should the HTML replay also show times as `h:mm:ss` (today `MM:SS`)?
   *Default: `MM:SS`, exactly as today.*

## Uses from stage 42

The canonical names are in `docs/stages/42-look-pages-base.md` ("API" and
"Canonical names") and ADR 0127. Stage 42's files are read-only in wave 2.

Layout and kit:

1. `Box size="large"` in layout B: the menu panel grows into the box and
   back (a morph proxy; the page is laid out at its final size at once);
   content faded in when settled (`useBoxSettled()`); reduced motion a
   short cross-fade.
2. `Box maxWidth={px}`: the large box stops at its content width, centred
   (the proxy grows to that rect).
3. **The box swap**: a large-box frame pushed over a large-box frame keeps
   the box (no shrink/grow), cross-fades the hood title and the content;
   pop reverses it (built into `Box`, no API).
4. `BoxHead`, `BoxBody` (the scroller, `.wc-lk-scroll`, `bodyRef`),
   `BoxFoot`.
5. **Overlay frames**: `nav.push(node, { overlay: true })` and `Dialog`
   (a small Lykta box, hood title, glass buttons; `.wc-lk-dialog[data-dlg]`).
6. `KeyHelp` / `openKeyHelp` and an icon-only `GlassButton` for "?".
7. `Table` / `TableRow` with sortable heads (`▾/▴`, `data-dir`), `.is-on`
   row selection, a `cols` grid template, the two-line row mode
   (`stackBelow`).
8. `Seg kind="pills"` (single select, sideways scroll keeping the chosen
   one in view, `aria-checked`).
9. `Select` (a native select in a glass well).
10. `useListCursor` (↑↓ PgUp PgDn Home End, click selects, double click or
    Enter activates, `touch: 'tap-selects'`, scroll into view after keys)
    and `useButtonZone` (Tab / Shift+Tab rows ↔ buttons, arrows walk,
    skipping disabled), as the Profile list does; `letterAction`.
11. Text helpers and tokens: `Rule`, `.wc-lk-sec`, `.wc-lk-kv`,
    `.wc-lk-empty`, `OrnRule`, `Stars`, `.wc-lk-dim` / `.wc-lk-faint` /
    `.wc-lk-gold` / `.wc-lk-bad`, `--lk-accent`, `--lk-danger`, `--lk-soon`
    (the warm "soon" colour).
12. `Icon` names `play`, `stats`, `star`, `save`, `backup`, `restore`,
    `help`, `close`; a page's own drawing as an `IconDraw`.

Player core (42f; files `src/player/view.ts`, `strip.ts`, `player.css`,
`src/app/player-host.ts`, `src/app/shell.ts`, `src/chrome/kit/hooks.ts`):

13. `fmtClock(ms, hours)` (`h:mm:ss` from one hour, `mm:ss` below) and the
    PlayerView option `hours`; the run log player and the Spotlights
    viewer use hours, the HTML replay keeps `MM:SS`.
14. PlayerView option `back: { title: 'Back to History (Esc)' }`: Back at
    the top left in the kit's look (`.wc-pv-back`, styles from
    `look-glass.css`), part of the chrome (auto-hides with it), calling
    `onEsc`; the header's left part leaves room for it when narrow. On for
    the run log player; off (absent) for the HTML replay.
15. `ChromeServices.openPlayer(session): Promise<PlayerOpenResult>` with
    `PlayerOpenResult = { ok: true } | { ok: false; error: string }`;
    `Shell.startPlayer` returns the failure instead of only logging it.
