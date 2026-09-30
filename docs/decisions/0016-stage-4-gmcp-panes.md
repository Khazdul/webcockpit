# 0016 — Stage 4: GMCP state models and panes

- Status: Accepted
- Date: 2026-09-27

## Context

Stage 4 (spec §2.4, §5 row 4) fills the Character, Group, Comm and UI
panes from GMCP and adds the input-line clock. Three builders work on
it: P0 (foundation) first, then P1 (Character, Group, clock) and P2
(Comm, UI) in parallel. This ADR fixes the contracts between them.
Builders add their own details under "Package notes".

## Decision

### Modules

| Module | Owner | Role |
|---|---|---|
| `src/gmcp/` | P1, P2 | Pure-TS state models, no DOM: `char.ts`, `group.ts`, `bands.ts`, `levels.ts` (P1), `clock.ts` (P1), `comm.ts` (P2). Unit tested in Node. |
| `src/panes/` | P0 context; P1 `character.ts`, `group.ts`; P2 `comm.ts`, `ui.ts` | DOM renderers, one `PaneShell` subclass per pane. |
| `src/panes/shade.ts` | P1 | Shade ramp (Inv §2.1) from the pane's effective background. P2 may use it. |
| `src/ui/input-pane.ts` clock strip | P1 | `.wc-input-clock` already exists. |

Hot-path rule: GMCP handlers only update model state and mark the pane
dirty; the pane re-renders once in the next frame (the context's frame
scheduler). No Preact in pane content; direct DOM, cell grid.

### Pane context (P0)

`PANE_FACTORIES[id]` becomes `(ctx: PaneContext) => PaneShell`, where
`PaneContext` carries at least `doc`, `bus`, `settings` (the store),
`requestFrame`, `sender` (for Comm.Channel.Enable etc. if needed) and a
lazy IndexedDB opener. The cockpit gets the context from `App`.
`PaneShell` gets an `active` flag driven by `conn.state` (`playing` →
active). Inactive Character/Group/Comm blank their content; UI does not.

### Bus additions (P0)

- `ui.message`: `{ kind: 'system' | 'event' | 'state' | 'warn' | 'error',
  name?: string, tag?: string, parts: Array<string | { value: string }> }`.
  `{value}` parts are the bold yellow dynamic values. The UI pane renders
  the prefix (`● SYSTEM:`, `▶ NAME:`, `◆ TAG:`, `⚠ WARN:`, `✖ ERROR:`).
  Any module may emit it.

### Settings (P0)

Global, in the settings store (additive, migrate fills defaults):

- `group: { showPlayers: boolean; npcMode: 'off' | 'labeled' | 'all' }`,
  default `true`, `'labeled'`.
- `comm: { filters: Record<string, boolean>; showHeader: boolean }`,
  sparse filters (missing = enabled), default `{}`, `true`.

### Storage (P0)

- IndexedDB gains a `comm` object store (DB version bump): one record
  per message `{ character, ts, seq, channel, talker, talkerType,
  destination, text }`, raw and unnormalised (formatting at render
  time). Index on `[character, ts]`. Pruned to 7 days at start.
- Clock state: `localStorage` key `wc.clock`, global, last writer wins
  (Inv §2.5 "Persistence").
- UI messages: `sessionStorage` ring (1000) so a reload of the tab keeps
  them; a new tab starts empty (Cockpit: current session only).

### GMCP in the raw capture (P0)

Inbound GMCP is recorded in the run's raw capture as its own line type,
so recorded runs replay with panes. The format keeps Cockpit logs
readable (an old log has no such lines) and `ReplaySocket` turns the
lines back into `IAC SB GMCP … IAC SE`. P0 picks the marker and notes
it below.

### Text-derived state

Wimpy (`Wimpy set to: N` / `Wimpy removed.`) and clock lines (`… of the
Third Age.`, `The current time is …`) are system-store actions in the
script engine, never in the profile.

### Game data

The XP level table (1–100) and TP tables are facts about MUME, written
in our own format in `src/gmcp/levels.ts`. No code from Cockpit.

## Consequences

- Stage 6's log player can replay GMCP-driven panes from runs recorded
  from stage 4 on.
- Owner decision 2026-09-27: the log player and the HTML replay show
  every pane in the player's layout (not the input pane). The capture
  therefore also records snapshots of the layout and appearance
  settings and the window size in cells, at run start and on change.
  Text-derived pane content (UI messages, timers) is rebuilt from the
  recorded lines, GMCP and sent commands.
- The pane context is where stage 5's Timers pane plugs in.

## Package notes

(Builders append here.)

### P0 — foundation (2026-09-27)

**Pane context** (`src/panes/context.ts`). `PANE_FACTORIES[id]` is
`(ctx: PaneContext) => PaneShell`. App builds the context; the cockpit
passes it to every factory (`cockpit.paneContext`).

```ts
interface PaneContext {
  doc: Document;
  bus: Bus;                                 // gmcp, conn.state, text.line, ui.message …
  settings: SettingsStore;                  // pane colours, group, comm
  cells: CellSource;                        // { get(): {w,h}; subscribe(fn) }
  requestFrame(cb: () => void): void;       // rAF in the app
  sender: Sender;                           // the Session (sendCommand, sendGmcp)
  connState(): ConnState;                   // state now; changes come on the bus
  openDb(): Promise<IDBDatabase>;           // lazy, shared, rejects without IndexedDB
  now(): number;                            // ms, Date.now
  localStorage: Storage | null;             // clock (wc.clock)
  sessionStorage: Storage | null;           // UI message ring
}
createPaneContext({ doc, ...partial })      // test defaults for the rest
```

**PaneShell** (`src/panes/pane.ts`), `new PaneShell(ctx, id, opts?)`:

- `active` follows `conn.state` (`playing` → active); `data-active` on the
  pane element mirrors it. `BLANK_WHEN_INACTIVE` (all but `ui`) or
  `opts.blankWhenInactive` decides whether inactive shows `blank()`.
- `markDirty()` schedules one `render()` in the next frame (coalesced,
  skipped while hidden; showing renders). Size changes, pane colour or
  appearance changes and activation mark dirty by themselves.
- Override `protected render()` (draw `this.cols` × `this.rows` into
  `this.content`), optionally `protected blank()` (default: empty
  content) and `protected onActiveChange(active)` (e.g. reset the model on
  disconnect). `protected own(unsub)` registers bus/settings
  subscriptions for `dispose()`; `protected ctx` is the context.
- Sketch in the file header of `pane.ts`.

**Bus.** `ui.message` as decided (`UiMessage`, `UiMessageKind`,
`UiMessagePart` in `src/core/types.ts`); nobody emits it yet. New for the
capture: `view.settings { json }` (App, at start and when the view part of
the settings changes) and `view.size { cols, rows }` (cockpit relayout).
`gmcp.raw` carries `ts` (frame receive time, µs) when it came through a
Session. `conn.state` carries `replay: true` for every change of a replay
connection.

**Settings.** `group: { showPlayers, npcMode }` and `comm: { filters,
showHeader }` as decided. `comm.filters` keeps only `false` entries
(`migrateComm`); enable a channel by patching it to `true` (the entry is
dropped). `viewSnapshot(s)` picks `appearance, panes, layout, group,
comm` — add a future screen setting to it so the capture records it.

**Comm storage** (`src/gmcp/comm-archive.ts`). DB version 3, store `comm`
(keyPath `seq`, autoIncrement), indexes `character_ts` and `ts`.
`CommArchive.open(ctx.openDb)`, `append(rec) → seq`,
`loadRecent(character, limit = 1000)` (oldest first, last 7 days),
`prune()` (all characters, older than 7 days). `ts` is ms since the epoch;
`talkerType` / `destination` are `null` when absent.

**Capture records** (`src/capture/format.ts`). A line body that starts
with ESC + an upper-case letter is a client record `<ts> ESC<TYPE>
<payload>`; the assembler keeps only SGR (`ESC [ … m`) in `Line.raw`, so
no inbound line can look like one, and Cockpit logs replay unchanged.
`cat -v` shows `^[GMCP Char.Vitals {…}`.

| Record | Payload | When |
|---|---|---|
| `GMCP` | `<Package.Name>[ <json>]`, JSON verbatim (CR/LF → space) | every inbound message except `Core.Ping`; the connection's messages from before the run (≤ 64, e.g. `Comm.Channel.List`, the starting `Char.Name`) are written first |
| `VIEW` | `ViewSnapshot` JSON | run start; 500 ms after a change (last wins); pending change at run end |
| `SIZE` | `{"cols":C,"rows":R}` (cockpit cells) | same as `VIEW` |

`ReplaySocket` turns `GMCP` records into `IAC SB GMCP … IAC SE` at their
timestamps, preceded once by `IAC WILL GMCP`, and skips other records. A
recorded `Char.Name` takes the replay to `playing`, so panes are active
during a replay. The recorder never starts a run for a connection whose
`conn.state` has `replay`, which keeps "replays are never captured".
When the replay ends the connection is `disconnected` and the panes
blank again (UI stays).

**Demo fixture.** `tests/fixtures/gmcp-demo.log` (regenerate with
`node tests/fixtures/gmcp-demo.gen.ts`), ~58 s: login with
`Comm.Channel.List` before `Char.Name`, StatusVars, full Vitals, a group
(ally, labeled MERC, unlabeled dog) with Remove / re-Add under new ids and
the dog promoted by `Group.Update {label}`, partial updates (only
`hp-string`, then only `hp`), a fight with `buffer`/`opponent` and later
`*-hits` only, comm on all ten channels (own messages as `you`, whisper
with destination, ANSI in an enemy yell), `Event.Sun rise`, the `time`
line and `The current time is 8:00am.`, `Wimpy set to: 50`,
`Event.Achieved`, and a level-up from 5 770 000 to 5 795 500 XP (level 25
→ 26 by the XP table). The dev server's fixture route searches
`tests/fixtures` before `$WEBCOCKPIT_FIXTURES`: open
`/?fixture=gmcp-demo.log` (add `&speed=0` for instant, `&speed=2` for
double speed).

### P1 — Character, Group, clock (2026-09-27)

**GameState hub** (`src/gmcp/state.ts`). The models live outside the
panes so they keep state while a pane is hidden and so the input-line
clock can share them. App builds one `GameState`, attaches it to the bus
before the panes and the script engine, and passes it in the context:
`PaneContext.game` (new field). `createPaneContext` gives an unattached
one by default (tests call `ctx.game.attach(ctx.bus)` or `onGmcp`).

```ts
game.char   CharModel    // Char.Name / StatusVars / Vitals; view() → CharView
game.group  GroupModel   // Group.*, Char.Vitals fight fields; displayed(opts)
game.clock  ClockModel   // anchor, precision, syncs, nextTransition(now)
game.subscribe((part: 'char' | 'group' | 'clock') => …)
game.installRules(engine.system)   // wimpy + clock lines, priority 3
game.mssp(vars)                    // Session option onMssp
```

Resets: `connecting` and a live `disconnected` reset char and group; a
replay's `disconnected` does not. The clock never resets.

**Replay end (changed).** `PaneShell` ignores a `disconnected` that
carries `replay`: after a replay the panes keep their last picture until
the next connection starts (`connecting` deactivates them). Live
disconnects blank as before. This supersedes the last sentence of the P0
capture note above.

**Pane factories** in `src/panes/factories.ts` (both packages made the
same move independently; see P2 below).

**Drawing.** `src/panes/grid.ts` `CellLine` (per-cell char, fg, bg,
bold/italic → `div.wc-prow` with merged spans), `centre`, `overflowLine`.
`src/panes/shade.ts` `paneShade(settings, id)` → `{ ramp, light, bg }`
resolved per render (never cached), `fillFor(hex, light)` = washout on a
light pane. Layout functions are pure and unit tested:
`characterLines(view, ramp, w, h)`, `groupLines(members, w, h, nameFg,
light)`.

**Options.** Options → Panes is now a hub (`PanesHub` in `options.tsx`):
General (the pane grid, title `General`) · Communication · Group · Back,
Cockpit's order without Timers (stage 5). The Group page is
`options-group.tsx`. At the merge P2's Communication row moved from the
grid's tail into the hub (key `comm`); the grid's tail is Reset layout ·
Back again. Settings apply live on both surfaces.

**Clock.** `src/gmcp/clock.ts`: epoch in unix seconds; precision
`unset < day < hour < minute`, never lowered while the page lives;
`localStorage` `wc.clock` = `{ epoch, precision, lastSync, reason }`
written after each sync, loaded with the age rules (> 7 d → seed/unset,
24 h–7 d → at most day). MSSP: MUME's table carries `GAME YEAR`, `GAME
MONTH` (name), `GAME DAY` (0-based), `GAME HOUR`, as MMapper reads it; it
syncs to hour precision only while the clock is at day or below. The
strip (`src/ui/clock-strip.ts`, `InputPane.clockEl`) renders ` ` + 5-cell
time (right-aligned) + ` ` + icon (8 cells; changed 2026-09-30 from
left-aligned without the blank, so a five-character time such as `10:14`
no longer touches the icon) and re-renders 5 ms after each wall-clock
second boundary while a countdown shows.

**Deviations.**
- TP bar: progress through the current level's TP range (the same rule
  as XP). Inv §2.2's example "L5 with 100 TP = full for a troll" does not
  match Cockpit's own table code; we follow the table.
- Fight identities are matched against unlabeled NPCs too (after
  members), so a tanking pet shows in npcMode `all`.
- `Group.Update` for an unknown id is taken as an add when it carries a
  `type`, else ignored.
- Washed moves bar is `#c4b3a1` (Cockpit `#c4b2a1`, rounding).

**Demo fixture (changed).** MUME output shape (owner feedback): replies
end with an empty line and the prompt; unsolicited output is framed by
empty lines; every comm message is also in the game output. Adds an
unlabeled pony (npcMode `all`), the mercenary tanking via `buffer` /
`buffer-hits`, a consistent clock (`6 am` time line, sunrise, `The
current time is 7:03am.`), and XP 5 770 000 → 5 860 000 / TP 41 500 →
42 700 across the level-up so both gain segments show. ~61 s.

### P2 — Comm and UI panes (2026-09-27)

**Modules.** `src/gmcp/comm.ts` (pure): channel list and header order,
`headerLayout` (ADR 0098 regimes), `formatComm` → coloured segments
(ADR 0013 rules), `parseAnsi` (SGR → `StyleRun`s), filters and solo
(`toggleChannel`, `soloChannel`), `commTime`. `src/panes/comm.ts`
(`CommPane`), `src/panes/ui.ts` (`UiPane`), `src/panes/anchored-list.ts`
(the shared bottom-anchored list, scrolled by item), `src/panes/panes.css`,
`src/app/ui-messages.ts` (emitters), `src/chrome/frames/comm-options.tsx`.

**`PANE_FACTORIES` moved to `src/panes/factories.ts`.** The subclasses
import `pane.ts`, so the table there made an import cycle (`CommPane`
extended `undefined`). The cockpit imports it from `factories.ts`; P1's
Character and Group entries go there at the merge.

**Scroll by item with CSS wrapping.** The list builds only the items that
can show (`rows + 1`, each at least one row), bottom-anchored in an
absolutely positioned stack, and measures what the browser laid out once
per render: the item heights decide whether one more step up is allowed
(the oldest item may not leave blank space above it) and step the offset
back when a render finds blank space (filter flip, timestamps appearing).
One wheel notch = one step; small deltas (trackpads) accumulate to 40 px.
The indicator is its own row below the list; mouse down returns to live.
The same list serves the UI pane (Inv §2.4: by line, wrap-aware, oldest
pinned).

**Comm history.** In-memory ring of 1000, not cleared on disconnect. A
live `Char.Name` replaces it with the archive's last 1000 (7 days); a
different character never sees the previous one's history; messages that
arrive during the load are kept and written after it. A replay (its
`conn.state` has `replay`) starts from an empty history at its
`Char.Name` and never reads or writes the archive. The archive is opened
and pruned when the pane is built; without IndexedDB the pane works in
memory. Timestamps are the receive time (a replay shows replay time).
Before any `Comm.Channel.List` the header shows the ten fixed channels.

**Header clicks.** `mousedown` (left toggle, right solo), `contextmenu`
suppressed. Filters are written with a function update (the whole sparse
map). The pane remembers the map it wrote; a settings change with other
filters cancels solo (Inv §2.7.6). Header cells are raised above the
title-row grip (`z-index`), so with the border off the header is
clickable and the pane is dragged by the gaps only.

**Deviations from the inventory.**
- Header widths: natural when the labels fit the budget. Cockpit's rule
  (even share ≥ longest label) truncated `Whispers`/`Questions` at 80
  columns where the full names fit; the regimes are otherwise as ADR 0098.
- Talker cleanup: everything from the first `" the "` is dropped, as in
  Cockpit (owner feedback 2026-09-27: long names are too spammy), plus
  a dangling `of` (`Thrakghash of the Mordor Flame` → `Thrakghash`,
  Cockpit showed `Thrakghash of`). An enemy's stars survive (`*Throzghul the Orc*` →
  `*Throzghul*`, Cockpit gave `*Throzghul`). Action channels: a text that
  starts with `*Name…* ` is split there when the talker field differs
  (MUME sends `*Throzghul the Zaugurz Orc*` with text `*Throzghul the
  Orc* says …`), so the name is not doubled.
- The indicator says `1 newer message` in the singular.
- The talker's ANSI colour (enemy red) is not kept: the talker comes from
  the field in quoted channels and is re-coloured in action channels, as
  in Cockpit; ANSI in the message body is kept.

**UI pane.** Never blanked. Ring of 1000 in `sessionStorage`
(`wc.ui.messages`, JSON array of `UiMessage`), written 250 ms after a
change and on `pagehide`; invalid entries are dropped on load. Prefix and
tag colours from Inv §2.4; unknown `◆` tags use AFFECT. Light pane:
`lightShift` on prefix and value colours, `darkInk` of the pane background
for the base text.

**Emitters** (`uiMsg(kind, 'template with {values}.')`):
- `attachUiMessages(bus)` (App): `Connecting to MUME...` /
  `Reconnecting to MUME...` (after `#reconnect`) / `Replay started.`;
  `<Name> logged in.`; leaving `playing`: `<Name> logged out.`; then
  `Connection to MUME closed.`, `Replay finished.` / `Replay stopped.`, or
  `✖ ERROR: Could not connect to MUME.` when the socket never opened;
  `▶ ACHIEVEMENT: Unlocked.` on `Event.Achieved` (replays too: the UI pane
  is rebuilt from recorded GMCP).
- App: `Profile <p> loaded.` (session start) / `⚠ … loaded with N
  warnings.` / `✖ … not loaded.` / `… could not be read.` / `⚠ … not
  found.`; `Profile <p> applied.` (ESC-menu Apply) / `⚠ … applied with N
  warnings.` / `✖ … not applied.`; capture: `⚠ Run capture is off: no
  IndexedDB. / no Web Locks. / another tab records this character.`,
  `✖ Run capture failed.`; `⚠ Profile variables were not saved.`
  (write-back failure).
- Editor saves (`ChromeServices.onProfileSaved` → `EditOptions.onSaved`,
  ESC menu and start page): `Profile <p> saved.` (only once the cockpit
  exists; the start page before the first Enter MUME has no UI pane).
  The variable write-back does not announce its saves.
- The game output keeps all its `[SYSTEM]` lines: the UI pane can be off,
  and the lines carry detail (reasons, warnings) the short UI sentences
  leave out.

**Options.** Panes gains a `Communication` row above `Reset layout`
(one tail item; the frame's row count follows the tail). The sub-page is
`CommOptionsFrame`: ten `[X]███ Label` rows (swatch in the channel colour,
grey when off), `[X] Show channel header`, Back; ↑↓ Home End Enter, click,
hover moves the cursor. Changes apply live from both the start page and
the ESC menu.
