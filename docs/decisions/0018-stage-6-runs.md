# 0018 — Stage 6: run events, the run library, History, Statistics and the log player

- Status: Accepted
- Date: 2026-09-27

## Context

Stage 6 (spec §2.8, §5 row 6) turns the raw capture of ADR 0008 and
0016 into runs the owner can browse, rate, keep, back up and watch. Three
builders work on it: P0 (foundation) first, then P1 (History,
Statistics, Exit rating) and P2 (log player) in parallel. This ADR fixes
the contracts between them. Builders add their details under "Package
notes".

## Decision

### Modules

| Module | Owner | Role |
|---|---|---|
| `src/runs/events.ts` | P0 | `RunEvent` types and `RunEventDeriver`: bus in, events out. Pure TS, injected clock and timer. |
| `src/runs/store.ts` | P0 | DB v5 stores and record shapes (extends `src/capture/store.ts`). |
| `src/runs/library.ts` | P0 | `RunLibrary`: sessions, chain loading, save/rate, delete, retention sweep, backup/restore, storage estimate. |
| `src/runs/stitch.ts` | P0 | Pure chain stitching and session summaries. |
| `src/runs/stats.ts` | P0 | Pure aggregation: events → `StatsModel` (tables, sparklines, XP ruler data). |
| `src/runs/live.ts` | P0 | `LiveRuns` on `App`: the current run's events in memory, save/rate of the live chain. |
| `src/chrome/frames/history*.tsx`, `statistics.tsx` | P1 | History, Rate, Delete modal, Statistics (one renderer, two surfaces). |
| `src/player/*` | P2 | Log player: timeline, controllable replay, view, chrome. |

No DOM outside `src/chrome`, `src/player` view files and `src/app`.

### Run lifecycle

- The raw capture keeps its lifecycle (ADR 0008): a run starts at
  `playing` and is sealed when the connection leaves it.
- `run_start` is written at the first `Char.Vitals` of the run (Inv
  §7.2), with the baseline `level`, `xp`, `tp` when known and
  `previousRunId` = the character's latest sealed run at that moment
  (after orphan sealing).
- **Too short:** a run sealed without a `run_start` is deleted (meta,
  chunks, events). It had nothing but a login.
- `run_end` on a clean seal; `orphan_close` when an orphan is sealed at
  start-up (its `us` is the seal time; `endedUs` stays the last chunk's
  `lastUs` as today).
- Events are buffered in memory and written on the recorder's promise
  chain with the chunks (every 2 s, on pagehide, at seal). Replays never
  write events (the recorder never has a run for them).

### Run events

```ts
type RunEvent =
  | { type: 'run_start'; us: number; character: string; level?: number; xp?: number; tp?: number; previousRunId?: string; schema: 1 }
  | { type: 'run_end'; us: number }
  | { type: 'orphan_close'; us: number }
  | { type: 'level_up'; us: number; level: number }
  | { type: 'kill'; us: number; logUs: number; mobName: string; xpDelta: number }
  | { type: 'pkill'; us: number; logUs: number; name: string; race: string; xpDelta: number }
  | { type: 'tp_gained'; us: number; tpDelta: number }
  | { type: 'xp_loss'; us: number; xpDelta: number }
  | { type: 'tp_loss'; us: number; tpDelta: number }
  | { type: 'char_death'; us: number; logUs: number; level?: number }
  | { type: 'achievement'; us: number; name: string }
  | { type: 'group_changed'; us: number; members: string[] };
```

- `us` is µs since the epoch on the capture clock (the frame receive
  time of the line or GMCP message that caused it; the fold time for
  kill/pkill). `logUs` is the `Line.ts` of the death line itself, so the
  player and stage 7 can find the exact `.log` line without content
  matching (Inv §7.2 browser note).
- Field semantics follow Inv §7.2 exactly (kill fold 500 ms, even split
  with remainder to the last, negative XP resets the fold anchor, mob
  name with article and the trailing ` (LABEL)` stripped, pkill `name` up
  to ` the `, `race` = `"the Orc"` or `""`, level-ups only upwards, level
  derived from XP, group members = player allies in join order, first
  `Group.Set` before the baseline ignored). Unknown event types are
  ignored by readers. Additive changes do not bump `schema`.
- Death lines come from system rules (Inv §8.3: pc_death prio 3 wins over
  mob_death prio 4 on the same line; char_death), installed through the
  same `SystemRules` as the timers.
- The deriver runs in every App, replays included (the player's UI pane
  rebuilds the `◆` lines); only the recorder persists what it emits.
- **UI lines:** attributed kills, pkills and deaths get a `◆` line in the
  UI pane, worded as Cockpit's `KILL` / `PKILL` / `DEATH` announces
  (`/home/ole/MUME/docs/events.md`, `ui-pane.md`; P0 records the exact
  forms below).

### Storage (DB version 5)

- `runs` records gain optional fields (absent on older records = the
  default): `saved: boolean` (false), `rating: number` 0–5 (0),
  `savedUs: number | null`, `summary: RunSummary | null`.
- `RunSummary` is kept current by the writer: `{ startUs (run_start),
  lastEventUs, level?, xp?, tp?, kills, pkills, deaths, previousRunId? }`.
  History lists from `runs` alone; it never reads events or chunks.
- New store `runEvents`, keyPath `['runId', 'seq']`, record
  `{ runId, seq, event: RunEvent }`.
- Chunks stay uncompressed (ADR 0008).

### Sessions (stitching)

- A run joins its predecessor's chain when its `summary.previousRunId`
  names that run and `startUs − predecessor.lastEventUs < 3600 s`
  (Inv §7.2). Runs without a summary (stage 1–5 captures) are chains of
  their own; their `startUs` is the meta's.
- `Session = { id (first runId), character, runs: RunMeta[] (oldest
  first), startUs, endUs, saved, rating, hasLog, expiresDays, level? }`.
  `saved` = any run saved; `rating` = max over saved runs; `hasLog` =
  any run with `bytes > 0`; `expiresDays` = ceil((oldest run start + 14 d
  − now) / 1 d), floor 0; null when saved.
- The active run (unsealed, this tab's) is never listed in History.

### RunLibrary (P0; P1 and P2 use it)

```ts
class RunLibrary {
  static open(factory?: IDBFactory): Promise<RunLibrary>;
  listSessions(nowUs: number): Promise<Session[]>;       // newest first
  characters(): Promise<string[]>;                       // with sealed runs, alphabetical
  events(runIds: string[]): Promise<RunEvent[]>;         // in time order
  chainLog(runIds: string[]): Promise<Array<{ meta: RunMeta; text: string }>>;
  save(session: Session, rating?: number): Promise<void>;  // every run in the chain
  remove(session: Session): Promise<void>;               // meta, chunks, events
  sweep(nowUs: number): Promise<number>;                 // retention, see below
  backup(): Promise<Blob>;                               // all runs
  restore(file: Blob): Promise<{ added: number; skipped: number }>;
  estimate(): Promise<{ usage: number; quota: number } | null>;
}
```

- `save` with no rating keeps each run's rating; with a rating sets it
  on every run of the chain. Un-save does not exist; Delete is the only
  way out (Inv §7.8).
- **Retention:** `sweep` seals orphans whose lock is free, then deletes
  every unsaved sealed run whose start is older than 14 days. It runs
  when the start page first shows, under the Web Lock
  `webcockpit-sweep` (`ifAvailable`, so only one tab sweeps). Errors are
  silent.
- **Backup** file `webcockpit-runs-YYYY-MM-DD.jsonl.gz`: gzip
  (`CompressionStream`) of JSON lines — a header
  `{"type":"webcockpit-runs","schema":1,"exportedUs":…}`, then per run a
  `run` line (the meta), its `event` lines and its `chunk` lines.
  `zcat` reads it. **Restore** adds runs whose `runId` is not present and
  skips the rest; a bad file is rejected before anything is written.

### LiveRuns (P0; P1 uses it)

`app.runs: LiveRuns` — `current(): { runId: string; events: RunEvent[] }
| null` (null before `run_start`), `subscribe(fn)`, `chain(): Promise<
Session | null>` (the live run plus its sealed predecessors in the
chain), `saveChain(rating: number)` (Inv §4.6: rating > 0 saves the
chain with it; 0 re-saves an already saved chain keeping its rating and
never creates a save), and the anchor rule for a disconnected tab (the
latest run that started in this tab).

### Statistics model (P0; P1 renders it)

`buildStats(events, opts) → StatsModel`: allies (union of group members
minus self, alphabetical), achievements + level-ups in time order, kill
and pvp tables grouped by name with totals, XP/h and TP/h series (gains
only) for the sparklines, XP ruler data (start, now, level range),
duration, level. Everything in Inv §7.3 that is data, not layout.

### Log player (P2)

- **Entry:** History → RUN LOG or Enter on a row calls
  `ChromeServices.openPlayer(session)`; the shell hides the start page
  (its frame stack and History state intact), shows the player, and
  shows the start page again on ESC. The player is not reachable while a
  live session runs in the tab (History is a start page feature).
- **Engine:** a player `App` of its own (a new instance per open,
  disposed on exit; P2 adds `App.dispose()`), offline, with no profile
  (raw game text, as Cockpit's player and the stage 7 HTML replay), fed
  by a controllable replay socket. It never captures and never reads or
  writes per-character archives (already true for replays).
- **Replay clock:** the player's `GameState`/timers `now()` and the
  scheduler for its trackers follow log time (ADR 0017 "Time"), so bars,
  countdowns and the kill fold are right at any speed and after a seek.
  Gaps longer than 10 s in the log collapse to 0 wall time (Inv §7.5);
  log time still jumps by the real gap. *Amended 2026-09-28 (owner
  feedback):* each run's lead-in — every entry up to and including its
  first visible one (an inbound line with non-blank text, or a command
  the output echoes) — also takes 0 playback time, so text shows at 00:00
  and run 2 of a chain starts straight after run 1.
- **Chain:** the runs of the session play as one timeline; the header
  shows `Run X of Y`. Between runs the player's connection passes
  through `disconnected` so the panes behave as they did live.
- **Speeds:** 0.25×, 0.5×, 1×, 2×, 4×, 8× (keys `1`–`6`, and in the
  control box). Default 1×.
- **Seek:** forward = fast-forward at speed 0 without painting until the
  target; backward = rebuild the player App and fast-forward from the
  chain start. Target: a seek to the end of a 5 h run in ≤ 2 s. If that
  is missed, P2 adds checkpoints or a faster path and notes it here.
- **Recorded layout:** the player's settings are the viewer's current
  settings overlaid with the latest `VIEW` record at the playhead (an
  in-memory store, never saved). ~~The grid is laid out at the recorded
  `SIZE` cols × rows; the font size is chosen so that grid fits the
  window (centred).~~ *Amended 2026-09-28 (owner decision): no
  letterboxing.* The cockpit is laid out on the viewer's window less the
  strip's 2 columns, at the recorded font size, so docks keep their
  recorded cell sizes and the game pane flexes to fill the rest, as live;
  the text reflows (the server sends width 500, the client wraps). The
  font size only shrinks when the grid would be below the cockpit's
  60 × 18 minimum. `SIZE` records are not used for the layout. Runs
  without `VIEW` use the current settings. The input pane is not shown.
- **Echo:** replayed commands are echoed in the output the way live
  sends are (closes the stage 5 open issue; applies to `#replay` and
  fixtures too).
- **Chrome** (Inv §7.5): header, 2-column strip with played/remaining
  and the gold half-block playhead (click/drag seeks), K/D/A/L markers
  from the chain's events at `logUs ?? us` (click seeks), control box
  (`◄◄ Rewind`, `► Play` / `▌▌ Pause`, speed, `MM:SS / MM:SS`),
  auto-hide after 6 s in play, pause cursor line (Space resumes from
  it), keys as in Inv §7.5, auto-pause at the end.
- The renderer that turns a chain into timed screen updates is kept
  separate from the in-app chrome, so stage 7's HTML replay can reuse it.

### Shared seams

- `ChromeServices` gains `runs: () => Promise<RunLibrary>` and
  `openPlayer(session: Session): void` (P1 adds the fields and the calls;
  P2 implements `openPlayer` in the shell through `src/app/player-host.ts`,
  with a minimal hook in `shell.ts`).
- The ESC menu gets `Statistics` (only while `app.runs.current()` is not
  null) and the Exit confirm gets the rating row; both are P1's.
- Start page: History becomes active (P1). Spotlights and Credits stay
  dim (stage 7).

## Rationale

- Summaries on the run record keep History cheap with months of runs.
- `logUs` on death events removes Cockpit's ADR 0135 content matching.
- A full App per player instance reuses every pane, tracker and parser
  unchanged, so the player shows exactly what the live client showed;
  rebuild-on-backward-seek is simple and, at ~3 MB/s replay speed,
  fast enough for typical runs.
- No profile in the player keeps it deterministic and identical to the
  shareable HTML replay; the owner can ask otherwise after testing.

## Consequences

- Stage 7 reads the same library and events for Spotlights and Credits,
  and reuses the player's renderer for the HTML replay.
- Runs captured in stages 1–5 have no events: they list, play and back
  up, but show empty statistics and no markers.

## Package notes

(Builders append here.)

### P0 — foundation (2026-09-27)

**Files.** `src/runs/events.ts` (types, `RunEventDeriver`, `parseDeathLine`,
`runUiMessage`), `src/runs/summary.ts` (`RunSummary`, `summarize`,
`summarizeAll`; Node-safe, the demo generator uses it), `src/runs/store.ts`
(`RunStore extends CaptureStore`), `src/runs/stitch.ts`,
`src/runs/library.ts`, `src/runs/stats.ts`, `src/runs/live.ts`. Changed:
`src/core/db.ts` (v5), `src/capture/store.ts` (`RunMeta` optional fields),
`src/capture/recorder.ts` (events, too-short deletion, orphans,
`lastRun`, `acquire` exported), `src/app/app.ts` (`app.runEvents`,
`app.runs`), `src/app/shell.ts` (`runLibrary()`, sweep), `src/main.ts`
(`__wc.runs()`), `vite.config.ts` (fixture route serves `.jsonl.gz`),
`src/panes/ui.ts` (tag colours). Tests: `tests/unit/runs-{events,stats,
library,demo}.test.ts`, `tests/e2e/runs.spec.ts`.

**Public API.**

```ts
// src/runs/events.ts
type RunEvent = …exactly as above…;
class RunEventDeriver {                        // App: app.runEvents
  constructor({ now?: () => ms, scheduler?: Scheduler, foldMs?: 500 });
  attach(bus): this;  installRules(system): void;  dispose();
  get started(): boolean;  get events(): readonly RunEvent[];   // current run
  subscribe(fn: (e: RunEvent) => void): () => void;
  onLine(text, tsUs); onGmcp(pkg, data, tsUs);   // direct feed (tests, generators)
}
parseDeathLine(text) → { kind:'mob', name } | { kind:'pc', name, race } | { kind:'char' } | null
stripLabel(s), splitPcName(full), fmtXp(n), runUiMessage(e)

// src/runs/stitch.ts
interface Session { id; character; runs: RunMeta[]; startUs; endUs; saved; rating;
                    hasLog; expiresDays: number | null; level? }
stitchChains(metas) → RunMeta[][];  stitchSessions(metas, nowUs) → Session[] (newest first)
toSession(runs, nowUs); runStartUs(meta); runEndUs(meta); expiresDays(startedUs, nowUs)
STITCH_GAP_US, RETENTION_DAYS (14), DAY_US

// src/runs/library.ts
class RunLibrary {
  constructor(store: RunStore, { locks?, storage? });
  static open(factory?, opts?): Promise<RunLibrary>;
  readonly store: RunStore;
  listSessions(nowUs); characters(); events(runIds); chainLog(runIds);
  chainOf(runId, nowUs): Promise<Session | null>;   // includes that run even unsealed
  save(session, rating?, nowUs?); remove(session);
  sweep(nowUs): Promise<number>;                     // runs deleted; never rejects
  backup(nowUs?): Promise<Blob>; restore(blob): Promise<{ added, skipped }>;
  estimate(): Promise<{ usage, quota } | null>;
}
backupFileName(date) → 'webcockpit-runs-YYYY-MM-DD.jsonl.gz'
BadBackupError (restore rejects with it; message is user-readable English)

// src/runs/stats.ts
buildStats(events, { nowUs?, character? }) → StatsModel {
  character; level; startUs; endUs; durationUs; allies: string[];
  milestones: { us, kind: 'achievement'|'level', text: '★ …'|'↑ Reached level N', level? }[];
  kills: { name, n, xpPer, xpTotal }[] (XP tot ▼); killTotal: { n, xp };
  pvps: { name, race, label: '*Name the Race*', n, xp }[] (XP ▼); pvpTotal;
  deaths; xpGains / tpGains: { us, delta }[]; xp / tp: { start, now };
  ruler: { startXp, nowXp, delta, fromLevel, toLevel, fromXp, toXp } | null; runs }
rateSeries(gains, startUs, endUs, buckets) → number[]   // per hour, per bucket
xpRuler(startXp, nowXp)

// src/runs/live.ts — app.runs
class LiveRuns {
  current(): { runId: string; events: readonly RunEvent[] } | null;  // runId '' = not recorded
  subscribe(fn: () => void): () => void;       // after every event
  library(): Promise<RunLibrary | null>;       // over the recorder's store
  anchor(): string | null;                     // recording run, else latest run of this tab
  chain(): Promise<Session | null>;            // flushes the recorder first
  chainEvents(): Promise<RunEvent[]>;          // stored (cached) + live in-memory
  saveChain(rating): Promise<void>;            // Inv §4.6 rule
}

// Shell: shell.runLibrary(): Promise<RunLibrary> (one per page, lazy) — P1
// can pass it as ChromeServices.runs. Dev: await window.__wc.runs().
```

`RunStore` adds `append(runId, { chunk?, bytes?, lines?, events?, summary? })`,
`getEvents`, `lastEventSeq`, `deleteRun`, `runsOf(character)`,
`latestSealedRun`, `updateRuns`, `sealOrphan`, `putWholeRun`.
`ChromeServices` is unchanged (P1 adds `runs` / `openPlayer`).

**UI lines** (kind `state`, values bold yellow):
`◆ KILL: <mob name>, <xp> xp.`, `◆ PKILL: <name>, <xp> xp.`,
`◆ DEATH: You died.` XP as Cockpit's `fmt_xp`: `950`, `5.4k`, `48k`. Tag
colours: KILL `#6fe060` (the XP/h green), PKILL `#ff5f5f` (the PvP `⚔`
red), DEATH `#e03c3c` (the ruler's loss red).

**How it runs.** App builds the deriver before the UI messages and the
recorder (a fold flushed at the run's end is announced before `logged
out`), gives it the GameState clock (`now`, ms) and the engine scheduler
(fold timer), and installs its rule after the timers'. The rule is one
catch-all action at priority 3 with pattern `%0`: a system action with the
same pattern as the timers' `%*` would replace it. Per line it rejects on
two character reads unless the line ends in `P.`, `g.` or `..`. Cost
(`node bench/script-bench.ts`, 93 883 real lines, run started so every
line is checked): system rules 0.54–0.61 → 0.67–0.77 µs per line
(≈ +0.13 µs); the script bench now includes the rule.

Event `us`: GMCP events use the `gmcp.raw` receive time; kills/pkills the
fold time (`max(now()·1000, latest input µs)`), `logUs` the death line's
`Line.ts`; `run_end` the clock at leaving `playing`.

Recorder: events are buffered with the lines and written in the same
transaction as their chunk (`RunStore.append`) with the updated summary;
`previousRunId` is stamped on `run_start` when it is written (the
character's latest sealed run other than this one; the event object is
mutated, so LiveRuns sees it too). A stage 6 run is created with
`summary: null`; stage 1–5 runs have no field and are never deleted.

**Interpretations and deviations.**
- *Pc form:* the stars may be followed by MUME's label
  (`*a Dwarf* (m) has drawn his last breath! R.I.P.` in a real log); the
  label is stripped before the star test, so that line is a pkill (Cockpit's
  patterns made it a mob kill named `*a Dwarf*`). An undead line with stars
  stays a kill.
- *Fold order:* one queue in arrival order, mixed kills and pkills, the
  remainder to the last (Cockpit processed all mob kills, then pkills).
- *Negative XP* moves the fold anchor but keeps queued kills (they fold
  with the XP gained from the new anchor, usually 0); Cockpit dropped them.
- *Group baseline:* the pre-baseline `Group.Set` writes no row of its own,
  but the ally set at `run_start` is written once right after `run_start`
  (same `us`), so Statistics lists allies who never left or joined.
  Checks run on `Group.Set/Add/Remove` and on `Group.Update` carrying a
  `type`; allies are in id order (MUME's join order), room-scoped as MUME
  reports them.
- *Level:* from XP (`levelFromXp`) on every Vitals; `level_up` when it is
  higher than the last observation (so a level regained after a death
  penalty is logged again, as Cockpit). StatusVars' level is used only
  while XP is unknown.
- *Orphans:* `orphan_close.us` is the seal time, but it does not move
  `summary.lastEventUs`; the orphan's `lastEventUs` becomes at least its
  last chunk's `lastUs` (so an orphan sealed days later does not stitch to
  the next run).
- *Too-short runs* are deleted at seal and by orphan sealing (recorder and
  sweep). `recorder.lastRun` falls back to the previous run of the tab.
- *UI prefix:* `◆` as this ADR decides; Inv §2.4 lists `▶ KILL` /
  `▶ PKILL` / `▶ DEATH` (Cockpit's `script_ui`).
- *Backup* holds sealed runs only (the live run is written on). Restore
  seals any unsealed run it finds; lines of unknown type reject the file.
- *Stats XP now* follows Inv §7.3 (start + kill/pkill deltas + losses per
  `run_start`), so XP from other sources is not in it; level derives from
  that value.
- *Replay clock:* the deriver takes the App's `now`/scheduler. In a speed-0
  replay today, folds run on wall time (a burst folds late, or at the run's
  end); P2's replay clock fixes that for the player.

**Demo data.** `tests/fixtures/runs-demo.jsonl.gz` (regenerate with `node
tests/fixtures/runs-demo.gen.ts`, 10 KB): Gittan 2026-09-25 20:15 (35 min,
four kills incl. an undead, an achievement), Rasta 2026-09-26 21:00 and
22:02 (38 + 32 min, one stitched session, saved ★★★★: allies Norsy and
Kuzzim join and leave, a double kill in one fold, a level-up 41 → 42, an
achievement, a pkill of Ibuki the Half-Elf, a death with its XP/TP loss),
Gittan 2026-09-27 18:40 (12 min, one kill). Logs have GMCP, VIEW and SIZE
records and MUME's output shape; the stored events come from replaying
them through the real deriver (`runs-demo.test.ts` checks they still
match). Times are local. E2e: `await (await __wc.runs()).restore(await
(await fetch('/__fixtures/runs-demo.jsonl.gz')).blob())`.

**Bench** (`npm run bench`, 2026-09-27, all §1.3 budgets PASS): script
bench 500 rules + system 27.6 µs/line; Chromium key → send p99 0.15 ms,
no late frames, burst 1665 ms with longest frame 48.9 ms (stage 5: 1559
ms / 42.3 ms; ADR 0017 measured 40–56 ms for the same build on this
machine); Firefox burst 1431 ms, longest frame 34.2 ms.

**Sweep.** `Shell.showStart` runs `runLibrary().sweep(nowUs())` once per
page (first start page), silently.

### P1 — History, Statistics, Exit rating (2026-09-27)

**Files.** New: `src/chrome/frames/history.tsx` (HistoryFrame, RateFrame,
DeleteFrame), `history-model.ts` (sort, cells, pill window, formatters;
pure), `statistics.tsx` (StatsView, LiveStatsFrame, SessionStatsFrame),
`stats-layout.ts` (widths, table sort and cells, sparklines, XP ruler as
coloured segments; pure). Changed: `src/chrome/index.tsx`
(`StartPageHandle.show({ keep })`), `kit/hooks.ts` (`ChromeServices.runs`,
`openPlayer?`), `kit/widgets.tsx` (`Stars`, `ratingKey`, `Button.dim`,
`Page.titleClass`), `kit/kit.css`, `frames/start-main.tsx` (History
active), `frames/esc-main.tsx` (Statistics row, Exit with rating;
`EscActions.runs?: LiveRuns`), `src/app/shell.ts` (two lines: `runs` in
`services()`, `runs: app.runs` for the menu), `src/theme/presets.ts` +
`apply.ts` (`STATS_COLORS` as `--st-*`: Cockpit's statistics palette),
`src/capture/recorder.ts` (per-run buffers). Tests:
`tests/unit/chrome-history.test.tsx`, `chrome-stats-layout.test.ts`,
`capture.test.ts` (the race), `font-glyphs.test.ts` (new glyphs),
`tests/e2e/history.spec.ts`. History and Statistics are in the chrome
chunk (`runs/stats.ts` only there).

**Seam for P2.** `ChromeServices.openPlayer?(session)` is called by
RUN LOG, Enter/Space on a row with a log, and a click on such a row;
without it History flashes `Log player not available.`. The shell adds
`openPlayer` in `services()` and, to open: `this.start?.hide()` and hide
`startHost`; to return: show `startHost` and call
**`this.start.show({ keep: true })`** — not `showStart()`, which starts a
fresh frame stack (and is where the sweep runs). With `keep` the stack is
the same component tree (never unmounted while hidden), so History has its
filter, sort, cursor and scroll; it re-reads the list when it is on top
again and keeps the cursor on the same session id. The Statistics tick and
the banner stop while hidden (`useIsTop` is false).

**Recorder race (P0's open issue).** Each run now has its own
`RunCapture` (lines, events, seq, summary, lock release). The run that takes
events is switched at the next run's start, as before; a run that starts
before the previous seal task ran no longer shares or clears its buffers.
Unit test in `capture.test.ts`.

**Interpretations and deviations.**
- *Buttons:* RUN LOG, STATS, RATE, SAVE, EXPORT, DELETE, BACKUP, RESTORE,
  BACK. EXPORT is dim but selectable (flashes `Coming in a later stage.`)
  and disabled without a log, as RUN LOG. STATS / RATE / DELETE are
  disabled without a row (Cockpit: enabled no-ops). BACKUP is disabled
  when there are no sessions. Home/End/PgUp/PgDn act in the table only.
- *Focus on open:* the table, row 0. Filter resets to All on each open.
- *Table height* fits the data, at least the button column, at most the
  window; the storage line (`Storage: 147 KB of 6.4 GB`, from
  `estimate()`) sits on the row above the footer.
- *Feedback:* `Saved.`, `Rated ★★★.` / `Saved, no rating.`,
  `Session deleted.`, `Saved webcockpit-runs-….jsonl.gz.` (backup),
  `Restored N runs (M already present).`, `Restore failed: …` (the
  `BadBackupError` text).
- *Rate* shows the session (`Rasta · 2026-09-26 · 21:00 · 1h34m`) above
  the stars. Stars everywhere are `★` gold / `☆` grey (Exit's sketch);
  JetBrains Mono lacks `☆` and `▬`, DejaVu is its fallback.
- *Statistics:* default focus KILLS. Scrollbars sit on the data rows only
  (not on the title/divider rows). No row hover in the History variant
  (`C_ROW_HOVER` is undefined, Inv §10.3). When the window is short the
  sparklines, then the ruler, are dropped before KILLS/PvPs go below 2
  rows. Live stars (` · ★★★`) are read on open and on R, not every tick
  (the live chain can only be saved from Exit). Live duration runs on the
  wall clock, except in a replay (log time, no running clock). Numbers
  that do not fit their column are k-formatted; Totals always are.
- *Exit rating:* rateable when `app.runs.anchor()` is not null (so never
  in a replay); prefill from `chain()` (saved rating, else 0) unless the
  user already changed it; Y awaits `saveChain(rating)` (errors ignored)
  and then exits.
- *ESC menu:* Statistics sits between Reconnect and Profile, shown while
  `app.runs.current()` is not null (re-checked a tick after every run
  event and on every status change).

**Open issues.**
- Sparkline rates early in a run are extreme (a 90k kill in a 10 s run
  is 945M XP/h): per-bucket rates as Inv §7.3 defines them. Owner may
  want a minimum span.

### Main session — sparkline rates (2026-09-27)

Owner request after P1: the sparklines showed extreme rates early in a
run (a 90k kill 10 s in drew ~945M XP/h). `rateSeries` now samples, at
the end of each slice, the gains in a trailing window of one slice or
10 min (`RATE_WINDOW_US`), whichever is longer; time before the run
start counts as no gain. A kill early in a run now reads as at most
6× its XP per hour and fades after 10 min. This departs from Inv §7.3's
per-slice rate on purpose.

### P2 — log player (2026-09-27)

**Files.** New: `src/player/timeline.ts` (chain → timed entries, gap
collapse, time mappings), `clock.ts` (`ReplayClock`), `socket.ts`
(`PlayerSocket`), `engine.ts` (`PlayerEngine`, `SPEEDS`, `Wall`,
`parseSize`), `strip.ts` (strip/marker/clock maths, `markersOf`),
`fit.ts` (`fitFontSize`, `parseView`, `overlayView`), `view.ts` +
`player.css` (in-app chrome), `src/app/player-host.ts` (`PlayerHost`:
the App target, recorded layout, paint gate). Changed: `src/app/app.ts`
(`player` and `clockUs` options, `replayOn(socket, label)`, `dispose()`),
`src/net/session.ts` (`clockUs`, `dispose()`), `src/net/replay-socket.ts`
(`FrameBuilder`, shared with `logToFrames`), `src/core/bus.ts` (`clear`,
`total`), `src/ui/output-pane.ts` (replayed echo, `stampRows`),
`src/app/shell.ts` (`openPlayer`, `openPlayerChain`, `playerHost`),
`src/main.ts` (`?player=`, `__wc.openPlayer`, `__wc.openPlayerLogs`).
Tests: `tests/unit/player-{timeline,engine,app}.test.ts`,
`player-helpers.ts`, `tests/e2e/player.spec.ts`.

**Architecture.**

```
RunLibrary.chainLog + events ─► buildTimeline ─► PlayerEngine ──► PlayerTarget
                                  (pure)          (play/pause/     (PlayerHost: a player App
                                                   seek/speed,      per build, on the engine's
                                                   ReplayClock)     ReplayClock; VIEW/SIZE → layout)
                                                        ▲
                                     PlayerView (chrome) ┘ drives it, reads position
```

- *Timeline:* every capture line is an entry (IN, OUT, GMCP, VIEW, SIZE)
  in typed arrays (`ts` µs, `play` ms, run, kind, body offsets). A gap
  > 10 s (inside a run or between runs) takes 0 playback time; log time
  keeps it. `countAt`, `logUsAt`, `playAtLogUs`, `runAt` are binary
  searches.
- *Clock:* `ReplayClock` is the player App's `now`, `clockUs` (Session
  frame and `cmd.sent` timestamps, so `Line.ts` and `data-ts` are log
  time) and `Scheduler` (#ticker, timers hub tick/save, the kill fold).
  The engine moves it to each entry's log time before delivering it, and
  to `logUsAt(position)` between entries, so timers fire at their log
  time relative to the lines at any speed and through a fast-forward.
  Over a jump > 60 s periodic timers are only ticked through the last 60 s.
- *Delivery:* IN/GMCP entries < 1 ms apart go as one telnet frame
  (`FrameBuilder`: prompts get IAC GA, GMCP records IAC SB … SE with the
  IAC WILL GMCP announce once per connection); OUT entries as
  `PlayerSocket.sent` (→ `cmd.sent { replay: true }`); VIEW / SIZE to the
  target. A run's first entry ends the previous run's socket (`replay
  finished` → `disconnected`) and connects a new one; the chain's end ends
  the last and pauses.
- *Play:* `p = anchorPos + (wall − anchorWall) × speed`; the driver sleeps
  until the next entry (1–250 ms), slices of 8 ms continue after the next
  frame (as ReplaySocket). Speed changes re-anchor.
- *Seek:* forward = fast-forward in 50 ms task slices with the target's
  painting off (the App's output and pane `requestFrame` go through a
  gate that queues while closed); backward = dispose the App, new clock,
  new App, fast-forward from 0. A seek during a seek retargets it (or
  rebuilds when it goes back). No checkpoints: not needed (below).
- *Player App* (`App({ player: true })`): no capture (the recorder gets a
  store that never opens and no status lines), no storage (clock,
  pane database, `localStorage`/`sessionStorage` for the UI ring), no
  replay `[SYSTEM]` lines, rows stamped with `data-ts`, no profile.
  `App.dispose()` detaches the session silently and disposes the engine,
  deriver, game state, recorder, status, clock strip, panes, cockpit and
  input, removes its window/document listeners and DOM and clears the
  bus; unit tests check DOM, bus handlers, clock timers and listener
  balance over repeated builds.
- *Recorded layout:* each build gets an in-memory `SettingsStore` with the
  viewer's settings; a VIEW record replaces its parts whole
  (`overlayView`). After a backward seek the VIEWs are replayed, so the
  settings are those of the latest VIEW before the playhead. The theme
  and cell custom properties are set on `.wc-player` (`applyTheme(s, el)`,
  `CellMetrics({ root: el })`), so the viewer's page is untouched. With a
  SIZE the stage is `cols × rows` cells at the largest font size where
  `cols + 2` (the strip) × `rows` fit the window, centred left of the
  strip; without one it fills the window at the settings' size. The input
  slot keeps its row but is hidden.
- *Chrome* (Inv §7.5): header (80 cols centred left of the strip,
  `<char> (L<lvl>) · Run X of Y · YYYY-MM-DD HH:MM`, `ESC Back`), 2-col
  strip (`#9a9a9a` played / `#242424` remaining, gold `▀`/`▄` playhead at
  `half = round(f × (rows×2 − 1))`), markers 5 cols left of it on the same
  row mapping (`A D K L` + `►`, `#4d4d4d`, click seeks to the row's
  earliest), control box 8 cols in / 1 row up (`◄◄ Rewind`, `► Play` /
  `▌▌ Pause`, speed, `MM:SS / MM:SS`), auto-hide after 6 s in play. Keys
  on a window capture listener that stops every key (the hidden input
  panes never see them): Space, ↑/↓, PgUp/PgDn (±20), Home/End, `1`–`6`,
  ESC. Pause cursor: `.wc-player-cursor` (`bg #303030`) on an output row,
  parked on the last line on pause and after a seek lands in pause; the
  wheel moves it ±1 in pause; a click on a line sets it; Space resumes
  from its `data-ts` (a backward seek) unless it is still the last line.
  Strip: press/drag previews the playhead with an `MM:SS` hint, the seek
  happens on release.
- *Shell:* `openPlayer(session)` loads the chain (the player chunk is a
  dynamic import), hides the start page and shows `.wc-player`; ESC
  disposes it and calls `start.show({ keep: true })`.

**Seek numbers** (dev server, 1440 × 860, Cockpit log
`Rasta/2026-09-18T18-11-42.log`: 4.73 MB, 107 941 entries, 5 h 27 min
logged, 4 h 10 min of playback after gap collapse; no GMCP/VIEW/SIZE):

| | Chromium | Firefox |
|---|---|---|
| fetch + parse + first build | 141 ms | 146 ms |
| seek to the end: fast-forward | 364 ms | 377 ms |
| … until the output has painted its 20 000 rows | 1.56 s | 0.77 s |
| backward seek to the middle (rebuild): ff / painted | 158 ms / 571 ms | 171 ms / 534 ms |
| forward seek by a quarter: ff / painted | 89 ms / 583 ms | 84 ms / 450 ms |

The ≤ 2 s target holds without checkpoints. The fast-forward is cheap
because nothing paints; most of the time after it is the output pane
building the last 20 000 rows at 1 000 rows per frame (spec §1.3's frame
budget), during which the text visibly catches up for a moment.

**Bench** (`npm run bench`, after the merge with P1, with the echo of
replayed commands): all §1.3 budgets PASS in the recorded run (see
`bench/results/latest.md`: burst Chromium 1.61 s, longest frame 44.0
ms; Firefox 1.46 s, 34.7 ms); over four runs Chromium 1.48–1.66 s and
38–45 ms, Firefox 1.35–1.46 s and 31–35 ms. One earlier Chromium run had a
single 62.7 ms frame; an A/B with the echo switched off gave 1.55–1.64 s
and 42–45 ms, so the echo costs nothing measurable (it mostly appends to
the prompt row) and the outlier was noise.

**Reuse by the stage 7 HTML replay.** `timeline.ts`, `clock.ts`,
`socket.ts`, `engine.ts`, `strip.ts` and `fit.ts` have no DOM and no
dependency on the in-app chrome or the shell. The HTML replay embeds the
chain (capture text per run) and the marker list, builds a timeline, and
gives `PlayerEngine` its own `TargetFactory` (an App-like renderer in the
exported page, or the same player App if the export bundles it) and its
own chrome over `engine.play/pause/seek/setSpeed/position/subscribe`;
`strip.ts` gives it the same strip, marker rows and clock. Only
`view.ts`, `player.css` and `player-host.ts` are in-app.

**Echo.** Replayed `cmd.sent` is echoed like a live send (after the
prompt row, `wc-echo`), for the player, `#replay` and `?fixture=`; the
two width commands sent on entering `playing` are skipped when replayed
(live they are sent with `echo: false`). Closes the stage 5 open issue.

**Deviations and choices.**
- Markers use `pkill` → K as the ADR says; mob kills have no marker.
- Space at the end restarts from the start (the HTML replay's rule).
- Rewind keeps play or pause. A marker click keeps the mode.
- Strip drag seeks on release (a live seek per pointer move would rebuild
  on every backward move); the playhead and hint follow the pointer.
- The UI pane keeps the replay wording at run boundaries (`Replay
  started.` / `Replay finished.`), not the live `Connecting…` lines.
- The player App has no keep-alive effect: its pings go to a socket that
  drops them (as `#replay`).
- Dev: `?player=<backup fixture>[&session=<id>]`, `__wc.openPlayer(id?)`,
  `__wc.openPlayerLogs([rel…], character?)` (raw `.log` fixtures, not
  stored; used for the numbers above).

**Open issues.**
- After a long seek the output catches up over ~0.5–1.2 s (20 000 rows
  at 1 000 per frame). A shorter scrollback in the player, or building
  only the last screenful first, would hide it if the owner minds.
- A window too small for the recorded grid even at font size 6 clips the
  grid (the player's too-small handling is the cockpit's own notice).

### Owner test 1 fixes (2026-09-28)

**Lead-in (delay from RUN LOG to the first text).** Verified cause: the
recorder writes the GMCP of the login phase (up to `PRE_RUN_GMCP_MAX`) at
its receive times: `Comm.Channel.List` arrives at connect (after
`Core.Supports.Set`), `Char.Name` only after the name and password were
typed. Then come VIEW/SIZE, the width commands and `Char.Vitals`, and the
first text line a moment later. The timeline played every gap ≤ 10 s in
real time, so the player spent the login time (a synthetic run with 8 s
of login: first text at playback 8.4 s) on a blank screen; logins over
10 s collapsed, which is why it varied. The demo backup has only 0.3 s.
Fix in `buildTimeline`, so recordings already in the browser play right:
entries up to and including each run's first visible one take no
playback time (`hasInk`: text other than blanks and SGR; or an `OUT` that
is not empty and not one of `PLAYING_COMMANDS`, which the output does not
echo). The engine delivers them all at playback 0 (records applied, the
replay clock moved through their log times), `logUsAt(0)` is the first
line's time, and `durationMs`, the `MM:SS / MM:SS` clock, the strip and
the markers (`playAtLogUs`: an event in the lead-in maps to the run's
start) all use the same shortened timeline. The same holds at the start
of run 2 … N of a chain, whatever the gap (≤ 10 s used to play). The
recorder is unchanged: GMCP keeps its receive time (ADR 0008 / 0016
semantics); the capture stays a faithful log and the player decides how
to play it.

**Layout (no letterbox).** `fitFontSize` (fit the SIZE grid) is replaced
by `playerFontSize(appearance, w, h, reserveCols)`: the recorded size, or
the largest smaller one whose grid left of the strip meets
`MIN_VIEW_COLS × MIN_VIEW_ROWS` (else `FONT_SIZE_MIN`). The stage is
`left 0`, full height, `width = player − 2 cells`. The target's `size()`
is kept in `PlayerTarget` (the stage 7 HTML replay may want it) but the
in-app host ignores it. The P2 open issue about a grid too big for the
window is gone: the cockpit's own layout handles any window.

**Header hints.** The right part is `Space Play/Pause · 1–6 Speed · ↑↓
Cursor · ESC Back` (`HINTS`, `fitHints` in `strip.ts`), styled as the
header (`C_HINT`, ` · ` like the footers). The header is 80 columns, wider
only as far as the full list needs (96 with a typical left part), centred
left of the strip. On a narrow window `↑↓ Cursor`, then `1–6 Speed`, then
`Space Play/Pause` give way; `ESC Back` always stays (clickable) and at
least 2 columns separate the hints from the left part, which is clipped
only if even `ESC Back` does not fit.


## Addendum: LiveRuns for the Statistics pane (2026-10-31, ADR 0109)

`LiveRuns.latest()` returns the latest run of the tab, in progress or
ended: the recorder's id it had while in progress ('' when not recorded),
its events from the deriver (kept until the next run starts) and whether
it ended. The Statistics pane shows an ended run that was not recorded
from it. `chainEvents()` of a live run that is not recorded now returns
that run's own events: before, it looked up the anchor, which is then an
older recorded run of the tab, and returned that run's chain without the
live events.
