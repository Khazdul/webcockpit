# Round 7 · History and the players — content inventory

What the real pages contain today (read from the code on 2026-11-07), so the
mockups show real content and keep every action reachable. Sources:
`src/chrome/frames/history.tsx`, `history-model.ts`, `statistics.tsx`,
`stats-layout.ts`, `src/player/*` (`view.ts`, `engine.ts`, `timeline.ts`,
`strip.ts`, `viewer.ts`, `icons.ts`, `fit.ts`, `clock.ts`, `player.css`),
`src/app/player-host.ts`, `src/replay/{export,page,title}.ts`, ADR 0018,
ADR 0019 (export / replay), ADR 0114 (ghost look).

## 1. History (start menu → History; Inv §7.4)

**Data.** One row per *session* (a chain of runs stitched when a run names
its predecessor and starts < 1 h after it). Fields: character, start, end,
`runs` (count), `saved`, `rating` 0–5 (max over saved runs), `hasLog` (any
run has captured text), `expiresDays` (14-day retention from the oldest run;
null when saved), level (from the run summary). The active (live) run is
never listed. Each run summary also has kills, pkills, deaths, level, xp, tp.

**Filter pills.** `All` + one per character with sessions, alphabetical.
Choosing one filters at once (cursor to row 0). Overflow: the row windows
by whole pills with `‹ ›` arrows.

**Table.** Columns `Char · Date · Time · Dur. · Expires · Rating`.
Date `2026-11-06`, time `21:12`, duration `3h41m` / `48m`, Expires `Saved`
(gold) or `<N> days`, Rating N gold stars (blank when unsaved or 0).
Header click sorts: same column flips; a new column starts at text ▲ / the
rest ▼. Default `Date ▼` (newest first); ties newest first; Expires and
Rating keep saved sessions above unsaved ones in both directions.

**Buttons (9).** `RUN LOG` (needs a captured log) · `STATS` · `RATE` ·
`SAVE` (off when saved) · `EXPORT` (needs a log; phone → flash
`Export: desktop only.`) · `DELETE` · `BACKUP` (off with no runs) ·
`RESTORE` (file picker `.gz,.jsonl.gz`) · `BACK`.

**Keys today.** Three focus zones (filter → table → buttons, Tab /
Shift+Tab). Filter: ←/→ move and filter, ↓/Enter into the table. Table:
↑↓ PgUp PgDn Home End, ↑ on row 0 → filter, ← → buttons, Enter/Space/click
opens the run log. Buttons: ↑↓, → back to the table. Footer hints
`↑↓ Navigate · Tab/←→ Cycle · Enter Open · ESC Back` (they go: no hint rows).

**Messages (flash row).** `Saved.` · `Saved webcockpit-runs-2026-11-07.jsonl.gz.`
· `Restored 4 runs (2 already present).` · `Rated ★★★★.` · `Saved, no rating.`
· `Session deleted.` · failures in red: `Could not read the runs: …`,
`Save failed: …`, `Backup failed: …`, `Restore failed: <BadBackupError text>`,
`Rating failed: …`, `Delete failed: …`, `Log player not available.`,
`Export: desktop only.`

**Storage line.** `Storage: 46 MB of 299 GB` (navigator.storage estimate).

**Empty.** `No runs recorded yet.` in the table; Backup disabled; Restore
still works (the way back from a new device).

**Rate (sub-frame "Rate the session").** `Gibur · 2026-11-06 · 21:12 ·
3h41m`, five stars, keys 0–5 / ←→, click a star; Enter saves (also saves
an unsaved session), Esc cancels. Starts at the saved rating (0 if unsaved).

**Delete (modal "Delete session").** Character, Date, Time, Duration, Runs;
`Saved: yes — ★★★★` when saved; "This will permanently delete the
session's logs and run data. This cannot be undone." `Y` deletes every run
of the chain; any other key cancels.

**Stats (sub-frame, "Session details").** Header `Session details — Gibur ·
2026-11-06 · 21:12 · 3h41m`. Four tables: ALLIES (♦ names, two per row) ·
ACHIEVEMENTS (`★ <achievement>` and `↑ Reached level 42`, in time order) ·
KILLS (`name · N · XP/N · XP tot`, default XP tot ▼, sortable by clicking
the title labels) + Total · PvPs (`⚔ *Name the Race* · N · XP`) + Total.
XP/h and TP/h sparklines (y labels max / half / 0, x axis `00:00` →
duration). XP ruler: start → now over the level range, the gained band
labelled `48.2k XP` (red when a loss), level marks `▌40 ▌41 42▐`.
Keys: Tab/Shift+Tab switch the focused table (gold title), ↑↓ scroll,
PgUp/PgDn, Home/End, Esc back. States: `Loading…`, `No XP data.`,
`Could not read the session: …`. Phone: the two sides stack.

**Export.** Opens the Export editor (another group's page; the HTML replay
is built there: title, excludes, comments, `HTML REPLAY` / `TEXT FILE`).

**Phone.** Same frame on the TUI grid; Export refuses.

## 2. Run log player (History → RUN LOG, Enter or a row click)

**Opening.** `openPlayer(session)` loads the chain (async), hides the start
page (its History state intact) and shows the player; Esc returns to History
exactly as it was. Not reachable during a live session. Autoplay at 1×.

**Stage.** The *player cockpit*: a full App on the replay clock, laid out
like the live client at the recorded font size and VIEW (game text, map,
Timers, Group, Comm, UI, Character panes as recorded; script panes from
SPANE records), no input row. Raw game text with the recorded ANSI colours.
Idle gaps > 10 s and each run's lead-in take no playback time. Runs of a
chain play as one timeline; between runs the connection drops and rejoins.

**Header (top line).** `Gibur (L41) · Run 1 of 2 · 2026-11-06 21:12` and the
key hints `Space Play/Pause · ← → 10 s · 1–6 Speed · ↑↓ Cursor · ESC Back`
(they give way when narrow; ESC Back clickable). *The hints go* (rule).

**Rail (right edge, 12 px).** Track, the played part, a gold playhead.
Click / drag seeks with an `MM:SS` hint. **Markers** (kind icons, left of
the rail): Death (red skull), PvP kill (orange crossed swords), Achievement
(gold star), Level-up (green double chevron); events closer than 18 px
share one marker; hover tip lists them (`Killed *Ugluk the Orc*`,
`Died (level 41)`, `Reached level 42`, `Achievement: …`); click seeks.

**Control box (bottom right, ghost glass).** To the start (Home) ·
Back 10 s (←) · Play/Pause (Space, round) · Forward 10 s (→) · speed
`‹ 1× ›` (0.25 0.5 1 2 4 8, keys 1–6) · time `12:41 / 3:41:07`-style
(`MM:SS` with unbounded minutes: `221:07`) · Panes · Display · Fullscreen ·
Close (`Back to History (Esc)`). Compact on a phone (no time); tight at
320 px (no Fullscreen, no To the start).

**Popups (one at a time, above the box).** *Panes*: switches for Character,
Timers, Group, Comm, UI, Map (+ script panes), `Reset layout` (dim when
nothing to reset). *Display*: Font size `Default / Small / Medium / Large`;
Colours `Default / Dark / Teal / Paper / Sepia / Slate` (swatches).

**Modes.** Play: output follows the tail; chrome auto-hides 6 s after the
last activity (not while a popup is open). Pause: chrome stays, a *cursor
line* sits on the last line; ↑/↓, PgUp/PgDn (±20), End, the wheel, a click
move it; Space resumes from the cursor line's time. Ends: auto-pause.
Seeking backward rebuilds (a short wait on long runs).

**Keys.** Space · ←/→ ±10 s · Home start · ↑↓ PgUp PgDn End cursor ·
1–6 speed · Esc closes a popup, else back · (F in the replay).

## 3. HTML replay (Export editor → HTML REPLAY; a downloaded file)

A single self-contained `.html` (payload + the player runtime + fonts as
data URIs), opened from `file://` with no network or storage. The same
PlayerView with: header `<export title> · Gibur (L41) · 2026-11-06`
(title clipped at 60), hints `Space Play · ← → 10 s · ↑↓ Scroll · 1–6
Speed · F Fullscreen`; **no Close / no Esc Back** (Esc leaves fullscreen);
Fullscreen icon in the box (F); `MM:SS` beside the pointer over the rail;
comments from the export doc shown as wrapped yellow `## …` rows with a
hold (the next entry waits, log time stands still); cuts (excluded ranges)
skipped; the embedded map subset in the Map pane; Panes and Display
popups as in the app. Page title = export title, else `Gibur · 2026-11-06`.
Damaged file: one line `This replay could not be read (…).` Autoplay.
GPL notice comment at the top of the file.
