# 0109 — The Statistics pane

- Status: Accepted; addenda 2026-11-01 (pane bar removed, ADR 0111; ESC menu removed, ADR 0112)
- Date: 2026-10-31
- Related: stage 30 (`docs/stages/30-fixed-menu.md` S4, S7, S10, "30d
  build plan"), ADR 0016 (pane context), ADR 0018 (runs, LiveRuns, the
  Statistics model), ADR 0020 (the map's auto float), ADR 0065 (pane bar
  and pane list), ADR 0075 (phone), ADR 0095 (pane buttons), ADR 0099
  (menu bar), ADR 0107 (chrome surfaces), ADR 0108 (focus)

## Context

Stage 30 removes the ESC menu on desktop and tablet in 30f. ESC →
Statistics, the live view of the run, needs a home before then. S7 makes it
a built-in pane, hidden by default and shown from the Panes popup, with a
layout that adapts to the pane's size, and with the latest run of the tab
once the run has ended. History → STATS stays a full-page frame on the
start page, and the ESC frame stays until 30f (the phone keeps it longer).

## Decision

- **Pane id:** `statistics`, label `Statistics`, short name `STAT`, last in
  `PANE_IDS` (so last among the built-in rows of the Panes popup and in
  `getPanes()`). `on: false` in the defaults; the settings migration gives
  existing users the entry from the defaults (off) without a version bump.
  It never blanks on a disconnect (`BLANK_WHEN_INACTIVE` false): it shows
  the latest run. Leftover priority last; drop order right after the map
  and the script panes. Minimum 3 rows in a side dock.
- **Not on the phone** (`NOT_ON_PHONE`): `allocatePhone` gives it no tab and
  the phone's Options → Panes grid leaves it out; the phone keeps ESC →
  Statistics. **Not in a player** (`LIVE_ONLY`): `applyViewer` turns it off
  whatever a VIEW record says, and the viewer's pane toggles leave it out,
  so the log player and the HTML replay never show it.
- **Place:** every layout holds it, as for every built-in pane:
  `defaultLayout()` and the layout migration add `defaultStatsFloat()`, an
  `auto` float of 82 × 26 outer cells (80 × 24 inside, room for the wide
  layout). `allocate` centres it over the game pane and cuts it to the
  game pane (`statsAutoFloatRect`), then clamps it as any float. A move or
  resize stores a real rectangle and drops `auto`; it can be docked like
  any pane. Reset layout writes `defaultLayout()`, so it is the auto float
  again. The migration appends it in front of the existing floats.
- **Rendering split:** the pane in the cockpit chunk
  (`src/panes/statistics.ts`) is only the shell. On its first show it calls
  `PaneContext.statsView(host)`, a hook the App builds from the shell's
  `ui.mountStatsPane`, which loads the chrome chunk and mounts
  `mountStatsPane` (`src/chrome/stats-pane.tsx`) into the pane's content
  element, as the Settings popups mount (ADR 0107). The pane then passes
  its content size (`resize(cols, rows)`), and 0 × 0 when hidden. Without
  the hook (the player, the phone, tests) it stays empty. The cockpit chunk
  grows by the shell only; the HTML replay bundle carries no view code.
- **One renderer:** `statsBody` (`src/chrome/frames/statistics.tsx`) draws
  the rows (header, ALLIES / ACHIEVEMENTS, KILLS / PvPs and their Totals,
  the sparklines, the ruler) for the ESC frame, History → STATS and the
  pane, with the same classes and colours. `StatsView` keeps the frame's
  focus, keys, footer and R. The layout math is pure in
  `src/chrome/frames/stats-layout.ts`: `statsFit` (the frame's vertical
  budget, unchanged), `statsPaneLayout`, `fitHeader`.
- **Adaptive layout** (`statsPaneLayout`): **wide** when the pane has at
  least 64 columns (`STATS_WIDE_MIN_COLS`: two tables of 28 cells, the
  width below which a phone frame stacks) and at least 12 rows (the 10
  fixed rows and two data rows); the frame's widths, KILLS / PvPs fitting
  the height, the sparklines and then the ruler dropping when it is short.
  Otherwise **narrow**: one column (a margin, T = cols − 3 cells, a blank
  and the scrollbar) with ALLIES, ACHIEVEMENTS, KILLS and PvPs one under
  the other, each with all its rows (at least one) and no scroll box of its
  own, then XP/h above TP/h at T cells, then the ruler at T cells. The
  whole column is one scroll box with its `░█` bar in the last column; the
  wheel scrolls it. Below 30 cells of T the sparklines drop, below 24 the
  ruler; the tables never go below 26 cells (a narrower pane clips them).
  Requiring 12 rows for wide is beyond the plan: a wide but very short
  pane would otherwise cut its fixed rows, where narrow scrolls.
- **Header** (`paneHeader`): one row, the live header shortened to fit, in
  this order: the stars, the level, `STATISTICS —`, the run's duration;
  `Run ended` stays as long as the name does; then cut with `…`. Narrow, it
  fits the column less a cell on each side (the scrollbar's column is not
  counted).
- **Keys and focus:** none. The pane never takes the game's keys: every
  mousedown in the view is prevented (no focus, no selection), and the
  cockpit's mouseup returns the keys to the input. A click on a column
  title sorts (as in the frame; the sort is kept while the view lives);
  the wheel and the bar's thumbs scroll the tables (wide) or the column
  (narrow). No focused table, so every title has the section colour.
- **Data** (`StatsFeed`, `src/chrome/stats-feed.ts`): while shown, a load
  at once, then on run events at most once per second, and a 1 Hz tick
  while a run is in progress (the running clock; a replay is on log time
  and has none). Hidden or disposed: no subscription and no timer. A run in
  progress: `chainEvents()`, as the ESC frame. No run in progress: the
  latest run of the tab, `ended` (header `Run ended`): a recorded run (the
  anchor) as its chain from the store after `chain()` flushed pending
  writes; a run that is not recorded (a replay, capture off, another tab
  recording) from the deriver's memory, so it does not blank when it ends.
  Before any run in the tab: `No run yet`, centred. The rating stars of
  the anchor's saved chain, read on show and when a run starts or ends.
- **LiveRuns additions** (ADR 0018 addendum): `latest()` returns the latest
  run of the tab, in progress or ended, with the recorder id it had while
  in progress ('' when not recorded) and the deriver's events (kept until
  the next run starts). `chainEvents()` of a live run that is not recorded
  is that run's own events: it used to look up the anchor, which is then
  an older recorded run of the tab, and showed that run's chain instead.
- **Pane buttons:** Colour, Border, Background and the cross (ADR 0095); no
  Gear, since there is nothing to set.
- **Pane bar:** the bundled `panebar` script leaves Statistics out (its
  six built-in buttons keep their room in a 33-cell dock; an extra `STA`
  button cut every name to three letters). `getPanes()` and `setPaneOn`
  still include it.

## Consequences

- The ESC frame, History → STATS and the pane share one renderer; a change
  to the tables or charts shows in all three.
- The Panes popup, the script API's pane list and the help texts list
  Statistics; the phone, the player and the pane bar do not.
- A run that was not recorded and ended while the pane was hidden still
  shows (the deriver keeps its events); a pane switched on after a page
  reload shows `No run yet` until a run starts, since the anchor is per tab.
- The float's z-order slot exists while it is off, as the map's does, so
  the z-index of the user's own floats is one higher than before.
- The cockpit chunk grows by about 1 kB, the chrome chunk by about 5 kB,
  the HTML replay bundle by about 2 kB (the shell and the layout code).

## Addendum: the pane bar removed (2026-11-01, ADR 0111)

The decision's "Pane bar" item no longer applies: the bundled `panebar`
script is removed (ADR 0111), so there is no STAT button question left.
`getPanes()` and `setPaneOn` still include Statistics.

## Addendum: the ESC menu removed (2026-11-01, stage 30f)

The ESC menu is gone on desktop and tablet (ADR 0112): there the pane is
the only live Statistics view in play. The ESC frame (`LiveStatsFrame`)
stays for the phone, which has no Statistics pane.

## Addendum: History's Statistics is its own page (2026-11-07, ADR 0130)

History → Stats no longer pushes `SessionStatsFrame`: stage 45's
`HistoryStatsFrame` draws an archived session in History's large box with
the same pure model (`buildStats`, `rateSeries`, the sort helpers). The
pane and the phone's ESC frame keep `statsBody`, unchanged.
`SessionStatsFrame` has no caller left (wave 3's sweep).

## Addendum: the pane is a live kill feed (2026-11-10, ADR 0134)

Stage 49 replaces the pane's drawing: `src/chrome/stats-pane.ts` (header,
four tiles, the Earlier list, the latest-kill card with its rating) in
place of `statsBody`, still mounted by the chrome chunk through
`ctx.statsView`. This ADR's "Adaptive layout", "Header" and "Keys and
focus" no longer apply to the pane. The feed loads on run events and once
a minute instead of every second. The phone's ESC frame keeps `statsBody`.
