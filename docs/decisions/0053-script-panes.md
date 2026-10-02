# 0053 — Script panes

- Status: Accepted
- Date: 2026-10-02
- Builds on spec §2.10 ("Panes", "Runs"), ADR 0051 (runtime, host),
  ADR 0010/0012/0014 (docking, floats), ADR 0016 (pane shell), ADR 0020
  (auto float)

## Context

Stage 11 lets a Lua script draw its own TUI pane: text, gauges and
clickable spans down to one cell, with tooltips. The pane must dock,
float, toggle and take the pane colours like the built-in panes, and the
player's placement must be remembered per script and pane id. Pane
content is recorded in runs and drawn in the log player and the HTML
replay without Lua (P1). The bundled mercenaries script uses it (P2).

Until now `PaneId` was a closed union of six built-in panes, used for
exhaustive tables in the layout, the settings, Options and the player.

## Decision

### Pane ids

- `PaneId = BuiltinPaneId | ScriptPaneId`, where `ScriptPaneId` is the
  template type `` `${string}/${string}` ``: `<script>/<pane id>`. Script
  names never contain `/`, so the two cannot clash. A pane id is 1–32
  letters, digits, `_` or `-` (`SCRIPT_PANE_NAME`); `isScriptPaneId`
  checks the whole id (a valid script name, `/`, a pane id).
- Tables that must stay exhaustive (`PANE_IDS`, `PANE_LABELS`,
  `DEFAULT_PANE_DESIRED`, `MIN_ROWS`, `BLANK_WHEN_INACTIVE`,
  `LEFTOVER_PRIORITY`, `DROP_ORDER`, the pane factories) stay keyed by
  `BuiltinPaneId`. Code that takes any pane goes through helpers:
  `defaultPaneRows(id)`, `minRows(id)`, `paneSettingsOf(panes, id)`.
- `Settings.panes` is `PaneSettingsMap`: every built-in pane plus
  optional script pane entries. A script pane without an entry has the
  defaults: on, colour black ("None"), border on. Writes always store a
  whole entry (`togglePatch`, the close cross, Options), since a deep
  partial would create an incomplete one.

### Present, placed, shown

- A script pane is **placed** from its first creation on: it has a
  layout entry (a dock or `floating`) and a `panes` entry. Both stay
  when the script stops, is disabled or the page reloads, so the pane
  comes back where it was, with the player's colour, border and on/off.
- It is **present** while its script runs and has created it: the
  cockpit's `addPane`/`removePane` keep a set that `allocate` takes as
  `present`. A script pane that is not present takes no space and is
  not in `hidden`.
- It is **shown** when present, on, and allocation finds room.
- First creation places it per `dock`: at the end of that dock with
  `rows` (left/right) or `cols` (top/bottom) as `desired`, or as an
  `auto` float of `rows × cols` content cells. An auto script float sits
  at the top-right of the game pane, just left of the map's auto float
  when that is shown (`scriptAutoFloatRect`); moving or resizing it
  stores a real rectangle, as for the map.
- While a pane is open, a layout that loses it (Reset layout, repaired
  data) gets it placed again the same way (`CockpitPaneSurface`).
- Allocation: script panes get the leftover after the built-in panes
  (in stack order), and are dropped right after the map, the last in the
  stack first. Their minimum is one row (`SCRIPT_MIN_ROWS`); a script
  pane entering a side dock without a size gets 8 rows.
- Migration keeps well-formed script pane entries in `panes` and in the
  layout (at most `MAX_SCRIPT_PANES` = 200 each) and drops ill-formed
  ids as before; built-in panes are still repaired to appear once.

### The pane

- `ScriptPane` (`src/panes/script-pane.ts`) is a `PaneShell` drawing a
  `PaneContent` with the cell grid (`CellLine`, `RowList`), coalesced to
  one render per frame by `markDirty`. It does not blank while the
  connection is not `playing` (like UI): a script's pane is its own
  state. The frame label is the title (default: the pane id);
  `PaneShell.setLabel` redraws the frame.
- **Content model** (`src/panes/script-content.ts`, pure): lines of
  styled spans (fg, bg, bold, italic, underline from `parseCecho`) or
  gauges `{ value, max, color?, label }`, and link ranges
  `{ row, col, len, hint, id }`, all 0-based. `snapshot()` is plain data
  (no ids, no functions); `PaneContent.fromSnapshot` rebuilds it.
- **Write rules.** `append` is Mudlet's echo: text goes on the end of the
  last line, `\n` breaks lines, and a trailing `\n` is remembered (no
  empty line until more text comes). A gauge row is never written into;
  appended text after it starts a new line. `setLine` and `setGauge`
  replace a row (the list grows with empty lines) and drop that row's
  links. A new link drops the links it overlaps on its row.
- **Caps.** 500 lines (`MAX_LINES`; appending past it drops the oldest
  lines and their links and moves the others up), 500 cells per line,
  500 characters per hint, 60 per title. Tabs become a space; other
  control characters are dropped.
- **Overflow.** More lines than rows: the pane shows the newest lines
  (console-like, as Mudlet's miniconsoles) with `↑ N more rows` in the
  indicator style on the first row. One rule for log panes and status
  panes; a status pane sizes itself with `:size()`/`:onResize`.
- **Colours.** Span colours: palette 0–15 from the user's ANSI palette,
  the rest as their RGB. Gauges fill with their colour (default the
  Group pane's HP green), washed to a pastel on a light pane like the
  Group bars, over the pane's `track` shade; the label is in the `vtext`
  shade, so a gauge follows the pane tint.
- **Links.** The pointer's cell is looked up in the content, never in
  the DOM. A hovered link is drawn in the `glow` band (text in the pane
  background shade) and the content gets `cursor: pointer` when the link
  is clickable. A click calls the host. Without a click handler (the log
  player) links are inert but keep their tooltips. Firefox sends a
  `pointerleave` when the row under the pointer is redrawn (the hover
  band replaces its element); a leave whose point is still inside the
  content is ignored.
- **Tooltip.** No reusable tooltip existed (ADR 0032's marker tip is the
  player's own), so the pane has a small TUI one in the same style:
  `.wc-spane-tip`, body colour on the `--c-line-hl` band, one cell row
  per hint line, under the link (above it near the bottom), kept inside
  the cockpit. It is a child of the cockpit element, since `.wc-pane`
  has `contain: strict` and would clip it.
- With the border off the top content row lies under the title-row grip
  (as for the other panes), so a link there is not clickable; the pane
  is dragged by that row.

### Options and the close cross

- Options → Panes → General lists the running script panes under the
  built-in ones, labelled `Title (script)` (the label column widens to
  at most 28 cells; longer labels are cut with `…`), with the same
  on/off, tint and border cells. `ChromeServices.scriptPanes` gives the
  list and a change subscription (`Cockpit.scriptPanes()`,
  `onScriptPanes`). A pane that goes away while listed simply leaves
  the grid.
- Script panes get the close cross like any pane; its tooltip follows
  the title.

### The Lua API (host)

- `createPane{id, title, dock, rows, cols}` returns a `Pane` object.
  Defaults: `dock = "right"`, `rows = 8`, `cols = 30`, title = id; rows
  and cols are clamped to 1–200 and 1–300. A bad table is a `bad
  argument` error. Calling it again with an id the script already has
  returns the **same** pane (the same Lua value), applying a new title;
  `dock`, `rows`, `cols` only matter for the first placement.
- Methods (spec §2.10 plus the main session's additions):
  `:clear()`, `:echo(text)`, `:cecho(text)`, `:setLine(row, text)`
  (cecho tags; `\n` becomes a space), `:gauge(row, {value, max, color,
  label})` (max default 100; colour as `highlight` takes it: a Mudlet
  name, `<tags>`, `r,g,b`, `#rrggbb`; unknown is an error),
  `:cechoLink(text, fn, hint)` (appends to the last line, as `:cecho`),
  `:setLink(row, col, len, fn, hint)` (1-based; the cells need no text),
  `:size()` → `rows, cols` (0, 0 while not shown), `:onResize(fn)`,
  `:show()`, `:hide()`, `:visible()`, `:setTitle(text)`. Rows are 1–500.
- **Resize** is `pane:onResize(fn)`: one handler per pane (a new one
  replaces it, `nil` removes it), called `fn(rows, cols)` when the shown
  size changes, also on the first layout after creation (the script
  can draw from it). Not called while hidden, nor twice for the same
  size.
- `:show()`/`:hide()` switch the pane's settings `on`, as the close cross
  and Options do (kept across sessions); `:visible()` is that `on`
  (the pane may still lack room).
- **Link calls** go through the host's `call` with the usual budget and
  error policy, with no arguments. A click after the script stopped
  does nothing (the pane is gone; a stale event is ignored).
- **Object shape.** A pane is userdata, not a table: it cannot be
  modified, and `pane.echo("x")` (a dot instead of a colon) fails with
  `bad argument #1 to 'pane:echo' (pane expected, got string; call it as
  pane:echo(…))`. See the runtime notes below.
- **Ownership.** Each `Owner` keeps `panes` (by pane id). `release()`
  closes them (the pane leaves the cockpit; its place stays) and drops
  the handles; link and resize functions are released with the script
  (`LuaScript.unload`), or one by one when a link is replaced, cleared,
  redrawn or scrolled out (`PaneContent` reports dropped links).
- Method calls only edit the content and mark the pane dirty: no DOM
  work inside a call.

## Consequences

- Settings grow by one entry per script pane ever created (bounded by
  migration). Renaming a script orphans its old entries; they are
  harmless and capped.
- Built-in code that iterates `PANE_IDS` (the player's viewer
  overrides, Spotlights, the bench hook) still sees built-in panes only;
  P1 adds script panes to the player.
- A script pane is not in the VIEW snapshot's present set: in a run,
  P1 must record which script panes were present.

## Package notes — P0 (2026-10-02)

**Modules.**

- `src/layout/types.ts`: `BuiltinPaneId`, `ScriptPaneId`, `PaneId`,
  `isBuiltinPaneId`, `isScriptPaneId`, `isPaneId`, `scriptPaneId`,
  `paneScript`, `SCRIPT_PANE_NAME`, `defaultPaneRows`.
- `src/layout/allocate.ts`: `AllocateInput.present`, `minRows`,
  `SCRIPT_MIN_ROWS`, `scriptAutoFloatRect`.
- `src/layout/model.ts`: `placeScriptPane(m, id, place)`,
  `ScriptPanePlace`, `togglePatch(panes, id, on?)` (whole entry).
- `src/layout/cockpit.ts`: `addPane(shell)`, `removePane(id)`,
  `scriptPanes()`, `onScriptPanes(fn)`, `paneRetitled(id)`,
  `ScriptPaneInfo`.
- `src/settings/types.ts`: `PaneSettingsMap`, `SCRIPT_PANE_DEFAULTS`,
  `paneSettingsOf`; `migrate.ts`: `MAX_SCRIPT_PANES`.
- `src/panes/script-content.ts` (pure): `PaneContent`, `PaneLine`,
  `PaneSpan`, `PaneGauge`, `PaneLink`, `PaneSnapshot`, `StyledText`,
  `plain`, `toSpans`, `splitLines`, caps.
- `src/panes/script-pane.ts`: `ScriptPane` and the pure drawing
  functions `scriptPaneLines`, `paneLine`, `paneView`, `gaugeFill`,
  `paneColor`, `DEFAULT_GAUGE_COLOR`.
- `src/panes/script-surface.ts`: `ScriptPaneSurface`, `ScriptPaneView`,
  `ScriptPaneSpec`, `ScriptPaneEvents`, `CockpitPaneSurface`. App
  imports it lazily together with the host; `ScriptHostOptions.panes`
  takes the surface (absent: a headless pane that keeps content and
  reports 0 × 0, used by tests and the bench).
- `src/lua/runtime.ts`: `defineClass(name, methods) → LuaClass`,
  `rt.object(cls, id)` (`LuaObject`), `rt.multi(...values)`
  (`LuaMulti`), `args.object(i, cls)`.
- `src/scripts/host.ts`: `createPane`, the `Pane` class, `Owner.panes`.
- Editor: `lua-api.ts` (`createPane`, `pane:…` entries, `methodDoc`
  falls back to pane methods, completion after a receiver whose name
  contains `pane`), `script-manual.ts` (*Panes* section).

**Runtime decisions.**

- *Objects are userdata.* `defineClass` builds a metatable
  `{ __index = <read-only table of C closures>, __name, __metatable =
  false }`. An object is a 4-byte userdata holding its handle; a
  weak-valued registry table maps handle → userdata, so the same handle
  pushes the same Lua value while a script holds it (`a == b` for
  `createPane` of the same id). No `__gc` (finalizers would run outside
  the budget, ADR 0051). Five more C API functions are used
  (`lua_newuserdatauv`, `lua_touserdata`, `lua_getmetatable`,
  `lua_rawequal`, `lua_copy`).
- *Several results.* A host function may return `rt.multi(a, b)`.
- *No static import of the runtime from the host.* `rt.object` and
  `rt.multi` are methods, so the host chunk stays free of `src/lua`.

**Measured.**

- `node bench/script-bench.ts` (93 883 lines, 500 rules + system rules,
  i7-12700H): a Lua trigger on every line 8.86 µs per line (+1.53 over no
  script); the same trigger updating a pane with three calls (`setLine`
  with cecho tags, `gauge` with a table, `cecho` of the line) 15.54 µs
  per line, so about 2.2 µs per pane call; budget 200 µs. The existing
  Lua scenario is unchanged (8.17 µs, +0.84).
- One frame of a 40 × 20 pane with 200 lines (build the visible rows and
  their keys; happy-dom, Node): 37 µs; the DOM patch then rebuilds only
  the rows whose key changed.
- Production build: cold-start JS 388.3 → 392.7 kB raw (pane ids in
  layout, cockpit, settings and Options); host chunk 23.2 → 31.7 kB
  (content model and the pane API); new lazy `script-surface` chunk
  5.3 kB (2.4 kB gzip; `ScriptPane`); `lua` chunk 20.8 → 22.9 kB.

**For P1 (runs).**

- Record `PaneContent.snapshot()` per pane (plain JSON; colours are
  line-model `Color` numbers, rows and columns 0-based), coalesced per
  frame: `ScriptPaneView.changed()` is the one place the host signals a
  change, so a recorder can hook the surface (a wrapping
  `ScriptPaneSurface`) rather than the host.
- Record which script panes are present (open/close of a view), with
  the title; placement and toggles are already in the VIEW snapshot
  (`panes`, `layout`).
- The player builds `ScriptPane(ctx, id, { content:
  PaneContent.fromSnapshot(s) })` with no `onLink`: links inert, hints
  kept. It must add script panes with `Cockpit.addPane` and include them
  in the viewer's pane toggles (`PANE_IDS` there is built-ins only).
- The HTML replay needs the same pane code in its bundle.

**For P2 (mercenaries).**

- A row-per-mercenary status pane: `setLine` + `gauge` per row,
  `setLink` for single-character orders, redraw from `onResize`.
  `createPane` is reload-safe; nothing needs cleaning up.
- Link functions take no arguments: close over the mercenary in the
  function.

**Open.**

- Completion after `x:` offers pane methods only when the receiver's
  name contains `pane`; other receivers get the string methods.
- Touch devices see no tooltips (no hover); a tap still clicks.
- With the border off, links on the first content row sit under the
  drag grip.

## Package notes — P2 (2026-10-02)

**What it does.** `src/scripts/bundled/mercenaries.lua` (bundled, off by
default; the `bundled/*.lua` glob registers it). A hire (`A citizen
mercenary starts following you.`, anchored, so a labelled mercenary that
follows again does not match) gets a free random short name from a pool
of 30 (at most 8 letters), `label mercenary <Name>`, and `group <Name>`
once MUME answers the label with `Ok.`. A contract is wall-clock based:
`ends = getEpoch() + minutes * 60`. A tap (`… (<Name>) taps you on the
shoulder.`) makes pay due with a 60 s grace; the thanks (`… says 'Thank
you. I am at your service.'`) renews to `now + minutes`. The leave line,
the labelled death lines (`is dead! R.I.P.`, `has drawn his/her/its last
breath! R.I.P.`) and, failing those, 90 s past the end remove a
mercenary, each with a UI message (`▶ MERC: …`). Presence comes from
`state.group` after any `gmcp.Group` message (a `type = npc` member with
our label, case-insensitive); a disconnect marks all away. Records
(`name, ends, state, paid, warned`) are in the store, so they survive a
reload, a reconnect and a page restart; ended ones are dropped on load.

**Pane.** `createPane{id = "main", title = "Mercenaries", dock = "right",
rows = 9, cols = 36}`, redrawn whole (`clear` + rows) on every change,
on resize and once a second while any mercenary is tracked.

```
▛▀ Mercenaries ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜
▌ Autopay [off]          2 hired ▐   [off]/[on] toggles autopay
▌ Bubba    ● here    $ a r p f s ▐   name, here/away, orders
▌██████████ 21:40 left ░░░░░░░░░░▐   time gauge, green → orange → red
▌ Zeke     ○ away    $ a r p f s ▐
▌███ PAY DUE 0:42 ░░░░░░░░░░░░░░░▐   grace gauge (60 s), red
▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟
```

Orders, each a one-cell link with a two-line tooltip (what it does, the
command): `$` `give 10 silver <Name>`, `a` `order <Name> assist`, `r`
`order <Name> rescue <you>`, `p` `order <Name> protect <you>`, `f`
`order <Name> flee`, `s` `order <Name> stand`. `r` and `p` need the
character's name (`state.char.name`) and are left out until it is known.
On a narrow pane the orders drop from the right (`$` stays longest);
below 18 columns only name and presence are left. The gauge fills by the
time left of a whole contract (by the grace while pay is due); its
colour is the Group pane's HP green from half the contract down, then
blends to the Group orange at 20 % and to red at 0. Empty state: the
header, `No mercenaries hired.` and `Hire one: give 10 silver
mercenary`.

**Settings and alias.** `autopay` (false), `group` (true), `minutes`
(25, what one payment buys), `warn` (5 minutes before the end; 0 never).
`merc` shows or hides the pane (`pane:show()`/`hide()`); `merc autopay
[on|off]`, `merc pay [name]` (all that ask, or one), `merc list` (text),
`merc label <who>` (label, group and track by hand, e.g.
`2.mercenary`), `merc forget <name>`.

**What the logs taught.** No session log (Cockpit's runs, MMapper logs)
has a hire, tap, payment or leave, so those lines are Cockpit's script's
patterns and the tests use them as such; a real hire log should be
checked when one exists. What the logs do show:

- A mercenary waiting for work is `A citizen-mercenary is here, waiting
  for a job.` (a hyphen) and attacks are `A citizen mercenary tries to
  crush you …`; neither matches.
- A labelled mob's lines carry the label in brackets, also its death:
  `A hungry warg (MIN) is dead! R.I.P.`. Cockpit only caught deaths in
  the room through its `mob_death` event; here the death line itself is
  matched.
- `label <target> <label>` answers `Ok.`, or `Ok. Replaced label "aa".`
  (the old label in lower case) when the target already had one. Cockpit
  labels `mercenary`, the first mercenary in the room: on a second hire
  in the same room that relabels the first one and loses it. Here the
  `Replaced label` answer to our own label command puts the old label
  back and asks the player to `merc label 2.mercenary`.
- Cockpit sent `group <Name>` right after `label`, before MUME had set
  the label; here the group waits for the label's `Ok.`.
- Orders in play are `order followers …` and `order <label> …`
  (`assist`, `rescue <me>`, `protect <me>`, `f`(lee), `st`(and), `hit`).
- GMCP: Group membership is room-scoped and ids change on each re-add
  (Cockpit ADR 0096); the script does not keep ids at all, it reads
  `state.group` by label.

Other changes from Cockpit's script: the contract survives a reload
(Cockpit kept it in memory only); autopay pays once per tap (a second
tap within 30 s is not paid again); renewal counts from the payment
(`now + minutes`), where Cockpit added the minutes to the grace end; the
contract length is a setting.

**API gaps found and fixed.**

- *No wall-clock time.* The sandbox has no `os`, so a script could not
  keep an end time across a reload. Added `getEpoch()` (Mudlet's name:
  seconds since 1970 with a fraction; `ScriptHostOptions.epoch` for
  tests), in `lua-api.ts` and the manual's Timers section.
- *Script panes starved in a full side dock.* The built-in panes in the
  default right dock want `EVEN_SHARE_DESIRED` (200) each, so a script
  pane's `rows` scaled down to one row. `allocateAxis` now reserves a
  script pane's desired size after Character, in stack order, when the
  others still get their minimums; otherwise it scales as before.

**Open.**

- The hire, tap, thanks and leave lines and the 25 minutes per payment
  are unverified against a real log.
- A mercenary hired before the script was on is not tracked until `merc
  label <who>` (which assumes a full contract).
- Whether `order <label> stand` and `flee` are accepted for a
  mercenary is not in the logs (they are for charmed followers).

## Package notes — P1 (2026-10-02)

**Record format.** `<ts> ESC SPANE <id> <json>` (src/capture/format.ts,
`formatPaneRecord`; payload rules in `src/panes/script-record.ts`):

- `null`: the pane went away (script stopped, pane closed);
- `{"title","lines","links"}`: a full `PaneSnapshot`;
- `{"n":N,"set":{"<row>":line|{"v"?,"l"?}},"title"?,"links"?}`: a delta
  against the pane's previous record in the same run. `n` is the line
  count; rows not in `set` are kept (new rows past the old end are
  empty); `{"v","l"}` patches a gauge row's value and/or label (same max
  and colour); `title` and `links` (the whole list) only when changed.

**Recording.**

- `RecordingPaneSurface` (script-surface.ts) wraps `CockpitPaneSurface`
  in App and emits `view.pane {id, snap}` (bus) at most once per
  `PANE_RECORD_MS` = 16 ms per changed pane (`snapshot()` taken then),
  and `{id, null}` on close. A timer, not `requestAnimationFrame`: frames
  stop in a hidden tab while the run goes on (a hidden tab's 1 s timer
  clamp only delays a record).
- The recorder keeps the latest snapshot of every present pane. At run
  start it writes them in full after VIEW / SIZE (as for VIEW, the run's
  start carries the state). During the run: the first record of a pane
  is full, later ones a delta when shorter, a full one again when the
  last full is `PANE_KEYFRAME_US` = 60 s old, nothing when unchanged; a
  removal only for a pane written in the run. A pane's first record is
  preceded by the pending VIEW, so the placement its creation stored is
  in the log before it shows (VIEW is otherwise debounced 500 ms).
- Each run starts with full records, so stitched sessions need nothing.

**Cuts and exports.** Timeline cuts and spotlight windows keep every
non-text entry, so SPANE records play in no time there. The HTML
export's `editRunText` folds the records inside an excluded range: one
full record (or `null`) per pane changed in it, at the range's last
entry, so the file has the state at the cut's end but not what the pane
showed inside (ADR 0019's privacy rule for removed text). Deltas after
the range apply to that state. A spotlight's state prefix starts
mid-run, so deltas there apply to an empty pane until the next full
record (≤ 60 s); Spotlights hide script panes anyway.

**Player.** `ENTRY_SPANE` in the timeline; the engine hands the body to
`PlayerTarget.spane`. PlayerHost keeps a snapshot per pane, applies
records (`applyPaneRecord`, defensive: malformed JSON keeps the pane,
everything is capped by `sanitizeSnapshot`), creates a `ScriptPane` with
no `onLink` (links inert, tooltips kept; `PaneContent.load` replaces
content in place) and adds it with `cockpit.addPane`. A run's `connect`
drops the previous run's panes. Seeking needs nothing new: forward
delivers records, backward rebuilds the App and replays from the start.
Placement and on/off come from the VIEW records. The viewer's gear lists
the script panes of the whole log (`scriptPaneIdsOf`, no JSON parse) on
rows of their own (`wide`), labelled `Title (script)`; `applyViewer`
and the close-cross override now cover every pane id; the Spotlights
reel switches script panes off too (`PlayerHost.scriptPaneIds`). Older
logs and Cockpit logs have no SPANE records: unchanged.

**Measured.**

- A mercenaries-like pane (3 mercenaries: a text row with four 1-cell
  links with ~35-character hints and a countdown gauge row each),
  updated every second: full record 1 462 B, a delta 144 B (three gauge
  patches); one hour 0.60 MB with the 60 s keyframes (5.26 MB if every
  record were full). For scale, a 5.4 h Cockpit log is 4.7 MB
  (0.87 MB/h). Snapshot + encode ≈ 3.6 µs per record (Node, i7-12700H).
- Production build: cold-start JS 392.7 → 397.0 kB raw (the recorder's
  encoder and the content caps it imports); the HTML replay bundle
  1 016 214 → 1 022 352 B (+6.1 kB raw, +2.4 kB gzip): ScriptPane, the
  content model and the record decoder. Lazy chunks: player-host 26.7 →
  27.8 kB; `ScriptPane` and `PaneContent` are now shared chunks (4.2 kB
  and 4.3 kB) used by the host and the player, so `script-surface`
  5.3 → 1.9 kB and `host` 31.7 → 27.5 kB.
- e2e: the live-mock run in the test writes a 263 B full record at run
  start and an 83 B delta for one changed row.

**Open.**

- A busy pane can add as much to a run as its text; if that matters,
  the next step is coarser coalescing (e.g. 250 ms) for gauges only.
- A pane that only changes inside a spotlight's state prefix shows a
  partial state until its next full record (hidden in Spotlights now).

## Package notes — P3 (2026-10-02)

**Export all scripts** (carried over from stage 10: user scripts live
only in IndexedDB).

- *Where.* On the Scripts page, not in the runs backup. The runs backup
  (History → BACKUP) is a gzip of runs that its restore adds by
  `runId`; scripts there would be hard to find, would tie a small file
  to a large one, and would restore code without the Scripts page's
  warning. A new button would widen the button row by 9 cells and hide
  the help panel on narrower windows, so EXPORT asks instead: *This
  script (name.lua)* (the default row, one Enter more than before) or
  *All scripts and their data (backup)*. IMPORT takes either file: a
  backup is recognised by its content (`looksLikeScriptBackup`), not by
  its extension.
- *Format* (`src/scripts/backup.ts`): `webcockpit-scripts-YYYY-MM-DD.json`,
  plain JSON (readable, diffable): `{type: "webcockpit-scripts", schema:
  1, exported, scripts: [{name, source, enabled, created, updated}],
  data: [{name, enabled?, settings, store}]}`. `scripts` is the user
  scripts (bundled ones come with the release); `data` is every
  `scriptData` record of a known script, bundled ones included, with
  pending `store` writes (memory is current). `parseScriptBackup` checks
  the whole file first (types, store values, at most 500 scripts, 1 MB
  per source) and throws `BadScriptBackupError` with a user-facing
  message; nothing is written for a bad file.
- *Restore* (`ScriptLibrary.restore`, one transaction) adds what is
  missing and replaces nothing: a user script identical to a stored one
  of the same name is skipped; a taken name gets `_2` (the `@name` line
  rewritten); data goes with its script when the script is added, and
  to a stored script only when that has no data yet; data of unknown
  scripts is dropped. Everything restored is **off**, bundled scripts'
  enabled state included: the confirmation page cannot show all the
  code, so the import rule (code reaches the game only after the player
  turns it on) holds. The page shows the warning, the script names and
  the data count; Y restores, any other key cancels.
- *Chunks.* `backup.ts` (format, checks) is imported only by the Scripts
  page, so it rides in the lazy chrome chunk; the library keeps
  `backupRecords()` and `restore()`.

**Review across P0–P2.** Layout reset, `#script reload` and disable /
enable during a recorded run (a `null` record, then a full one), a
reconnect (the pane stays, the run restarts with a full record), the
Mercenaries pane in the log player, the light theme, tints, a 600 px
window, Chromium and Firefox. One bug: uncoloured text took the
terminal fg, so on a dark tint over a light terminal it was dark on
dark, and span colours on a light pane were not adjusted. Now
`paneInk`: uncoloured text is the terminal fg held to 4.5:1 against the
pane's background, and on a light pane span colours go through
`lightShift` and the same floor (ADR 0041, as the UI and Comm panes).

**Measured** (2026-10-02, i7-12700H).

- `npm run bench`: within spec §1.3 in both browsers. Key → send median
  0.04–0.05 ms (p99 ≤ 0.24); frame → paint median 10–11 ms, p95 ≤ 20.2,
  no late frames except one 1.8 s stall in Chromium (map off, script
  0.4 ms: a system pause, not the page); 1 MB burst max frame 18.7–23.7
  ms, none > 50 ms; 500 rules 4.5–6.4 µs per line in the browser;
  scrollback 0 → 20 000 rows +0.9 ms per frame. Node: 500 rules +
  system 7.17 µs per line, a Lua trigger on every line 8.99 µs, with
  three pane calls per line 14.94 µs (budget 200 µs).
- Production build: cold-start JS 415.5 → 416.9 kB raw (restore in the
  library); the 397.0 → 415.5 kB step before it is P2's bundled
  `mercenaries.lua` source (18.4 kB), which is in the cold-start
  chunk like every bundled script. Lazy chrome chunk 108.9 → 113.6 kB.
  Stage 11 in all: cold-start JS 388.3 → 416.9 kB raw (+28.6 kB); HTML
  replay bundle 1 016 214 → 1 022 662 B.

**Open.**

- Bundled script sources ship in the cold-start chunk; with more
  bundled scripts they could be loaded with the host instead.
- A one-row script pane shows only `↑ N more rows` (the built-in rule).

## Feedback round 1 (2026-10-02)

The owner's first test round (stage file, "Owner feedback → Round 1"):
a mercenary costs 1 gold (20 silver) at a higher level; the wanted orders
are `ask <name> lead`, `ride` and `flee`; scripts want short-lived panes
that stay out of the menus.

**Mercenaries.**

- *Cost.* A `cost` setting (number, default 10; anything above 15 counts
  as 20). 10 is paid as `give 10 silver <Name>`, 20 as `give 1 gold
  <Name>`; autopay, the PAY DUE bar, `merc pay`, the hints, the empty
  state's `Hire one: give … mercenary`, `merc list` (which also prints the
  cost) and the paid total (in silver) follow it. Renewal is unchanged:
  the thanks line renews whatever was paid.
- *Toggle.* `Cost [10s]` / `Cost [1g]` in the header after the autopay
  toggle, a link with a tooltip that says what a payment is and what a
  click switches to; `merc cost [10|20]` does the same. The pane draws
  the new cost at once (a local value until `setSetting` has saved it,
  as for autopay).
- *Learning.* No log (Cockpit's runs, MMapper logs, the owner's session
  files) has a mercenary naming its price; searched again for this
  round. The trigger is therefore loose but scoped: only a line spoken by
  a citizen mercenary (`A citizen mercenary`, `A citizen-mercenary`, with
  or without a `(Label)`, `says|asks|exclaims|tells you|asks you|whispers
  to you`, the text in single quotes), and only when the text names one
  price: `10 silver`/`ten silver` → 10, `1 gold`/`one gold`/`20
  silver`/`twenty silver` → 20 (word-start anchored, so `110 silver` does
  not count). A line naming both is ignored. A change posts `▶ MERC: A
  mercenary asks 1 gold (20 silver); payments are now 1 gold (20
  silver).`; the same price again posts nothing.
- *Orders.* Exactly three one-cell links: `l` `ask <Name> lead`, `r`
  `ask <Name> ride`, `f` `ask <Name> flee`, tooltip `Lead: ask <Name>
  lead` etc. They no longer need the character's name. Pay is not an
  order: while pay is due the whole PAY DUE gauge row is one link (tooltip
  `Pay <Name> 1 gold now:` and the command); otherwise the gauge has no
  link.
- *Width.* Name and presence take 16 cells; the orders need 1 + 2 per
  letter and drop from the right (`f` first), so all three need 23
  columns and none are left below 19. The header keeps `Autopay [x]`,
  then `  Cost [..]` when 12 more cells fit, then the `N hired` count
  right-aligned when it fits with a space before it. In the default right
  dock (31 content columns) the count is dropped; the rows show the
  mercenaries anyway.

```
▛▀ Mercenaries ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜
▌ Autopay [off]  Cost [10s]       ▐   both toggle on a click
▌ Bubba    ● here          l r f  ▐   lead, ride, flee
▌██████████ 21:40 left ░░░░░░░░░░░▐
▌ Zeke     ○ away          l r f  ▐
▌███ PAY DUE 0:42 ░░░░░░░░░░░░░░░░▐   the whole bar pays
▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟
```

**Temporary panes.**

- *Id.* `createPane{…, temporary = true}` opens `<script>/~<id>`. The
  `~` keeps it apart from an ordinary pane of the same name (a script may
  have both), and `isScriptPaneId` is false for it (`isTempPaneId`,
  `tempPaneId` are separate), so settings migration drops one that
  somehow got there and Options, the viewer's gear and the player's
  viewer toggles never list it. `createPane` with an id the script
  already has returns that pane, whatever `temporary` says; `temporary`
  must be a boolean.
- *Placement.* The cockpit keeps temporary panes outside `allocate`, in
  memory (`addPane(shell, temp)`, `tempPane(id)`, `setTempPane(id,
  {on, rect})`): a framed float above every other float (z-order after
  `layout.floating`; a press brings one to the front of the temporary
  ones), centred over the game pane at `rows × cols` content cells
  (`cols + 2` × `rows + 2` outer), clamped to the window. `dock` is
  ignored. The user can move it and resize it by its edges; it never
  docks (no dock or edge zone takes it) and the rectangle stays in memory
  for its lifetime. Colour and border are the defaults (black, framed):
  there is no settings entry to change them.
- *Close.* `pane:close()` works for any pane: the pane leaves the screen,
  its link, resize and close functions are released, and method calls
  on the object become no-ops (`size()` → 0, 0, `visible()` → false); a
  new `createPane` with the id makes a new pane. For an ordinary pane
  this is not hide: its place, colour and on/off stay in the settings,
  untouched, for the next `createPane`. A temporary pane's close cross
  (tooltip `Close <title>`, not `Hide`) closes it the same way and then
  calls `pane:onClose(fn)`; the handler is called only for that, not by
  `close()` and not when the script stops, and an ordinary pane's cross
  still hides it without calling it. Calling a method of another
  script's pane is still an error.
- *Show, hide, visible* switch the cockpit's in-memory on/off; nothing
  is written.
- *Runs.* A temporary pane's SPANE records carry `"temp": {rows, cols,
  rect?, off?}` (the wanted size, the user's rectangle once moved, `off`
  while hidden): in every full record, and in a delta when it changed
  (a move alone writes `{"n":N,"temp":…}`). `RecordingPaneSurface` adds
  it from `ScriptPaneView.placement()` at flush time, and a move marks
  the pane dirty through `ScriptPaneEvents.onPlace`. Read back it is
  checked and capped (`sanitizeTemp`, cells ≤ 1000); the export's folded
  records keep it. The log player adds the pane as a temporary pane of
  its cockpit at the recorded place and follows moves and hides; the
  viewer's close cross hides it until it goes away. Spotlights hide
  temporary panes (`PlayerHost.hideTempPanes`).
- *Release.* A disable or reload closes temporary panes like the others
  (nothing of them remains anywhere).

**Tests.** Unit: mercenaries (cost toggle, gold payment by bar, autopay
and `merc pay`, learning and its false positives, orders, width), host
(temporary spec, cross → close → onClose, no-ops after close, release,
`close()` of an ordinary pane), cockpit surface (centred, above floats,
clamped, nothing in the settings, show/hide, cross, same name apart,
migration), records (temp in full and delta, defensive read, export
fold), log player (placement, move, hide, viewer cross, Spotlights).
e2e: the mercenaries flow with the new orders, cost toggle and PAY DUE
click; a temporary pane centred, dragged, absent from Options and the
settings, closed by its cross, by a link calling `close()` and from an
alias.

**Open.**

- The price lines are a guess; a real one should replace the loose
  trigger's test lines.
- Whether `ask <name> lead/ride/flee` is accepted by a mercenary is not
  in any log.
- A temporary pane cannot be docked; if a script wants a dockable
  short-lived pane it uses an ordinary one and `close()`.

## Addendum — stage 12 feedback round 1 (2026-10-02)

Owner feedback on the key manager (stage 12, round 1) found two gaps in
script panes. Supersedes *Overflow* under "The pane" and the temporary
pane *Placement* sentence that the rectangle stays in memory only.

**Scrolling.** A pane whose lines do not fit scrolls like ADR 0052's
panes, instead of showing only the newest lines.

- Every line is in a native scroller (`.wc-spane-scroll`, browser bar
  hidden, `overscroll-behavior: contain`, no scroll anchoring) inside the
  content; the wheel and the touchpad move it in pixels, also over the
  frame and title row (`forwardWheel`), and touch drags it. No keys, as
  the built-in panes (they never take the focus).
- `createPane{anchor}`: `"bottom"` (default, the old console behaviour)
  or `"top"` (a list). On overflow one pane row is an indicator: on top
  for `bottom` (`↑ N more rows`), at the bottom for `top` (`↓ N more
  rows`). Scrolled away from the anchor it reads `↓ N rows below` /
  `↑ N rows above` and a click returns to the anchor. A bottom-anchored
  pane follows new lines while it is at the end (within 2 px, from
  `scroll` events) and stays put when scrolled back; a top-anchored pane
  keeps its position.
- Links are looked up at the content row under the pointer
  (`scrollTop` included); a scroll hides the tooltip. Text fields (ADR
  0055) sit in the scroller and scroll with their rows.
- Every content line is drawn (up to 500), not only the visible ones;
  `RowList` still rebuilds only the rows whose key changed.
- **Runs.** The snapshot carries `anchor: "top"` (absent: bottom); a
  full record writes it, a delta keeps the pane's (it never changes).
  The log player and the HTML replay draw the same scroller; the scroll
  position is the viewer's own.

**Temporary pane placement.**

- `createPane{temporary = true, at}`: `"center"` (default), `"top"`
  (centred sideways at the top of the game pane), `"top-right"`, or
  `"bottom"` (centred, just above the input line). It is the place until
  the user moves the pane.
- A rectangle the user gives a temporary pane (move or resize) is saved
  per device in `localStorage` (`webcockpit.tempPanes`, outer rectangle
  in cells per pane id, at most 200, `src/layout/temp-places.ts`), and the
  next `createPane{temporary = true}` with that id opens there, clamped to
  the cockpit. Not in the settings: they are synced into runs (VIEW) and
  exported, and a popup's place belongs to the screen it was set on
  (ADR 0006 keeps data in IndexedDB; this is a small per-device
  preference like the appearance mirror). Options → Panes → Reset
  layout forgets every saved rectangle (open panes keep theirs until
  they close).
- Runs record `temp.at` when it is not `center`; a saved rectangle is in
  `temp.rect` already.
- **Still never docked.** A temporary pane appears and disappears with
  the script's choice; docking it would reflow every other pane each
  time it opened and closed. A script that wants a dockable pane uses an
  ordinary one and `close()`.

The key manager's Keys pane uses `anchor = "top"`; its pick window opens
at `"top"`, clear of the text the locate just printed below it.

## Addendum — stage 12 round 4 (2026-10-02)

- **More `at` places.** `createPane{temporary = true, at}` also takes
  `"left"`, `"right"` (vertically centred against that edge) and the four
  corners `"top-left"`, `"top-right"`, `"bottom-left"`, `"bottom-right"`
  of the game pane, so several temporary panes (the key manager's TVs)
  open side by side instead of on top of each other. A cascade was
  considered: corners are predictable and match where a player would put
  four views; a fifth pane is the script's choice. Records carry any
  non-centre `at`; the list lives in `src/layout/temp-places.ts`
  (`TEMP_PANE_AT`), so the host does not import the cockpit.

## Addendum — stage 12 round 8: tiled groups (2026-10-02)

Four key manager TVs opened one after another landed one per corner, at
remembered per-slot rectangles: scattered. The owner wants them side by
side in a logical order, the first at the game pane's top left, the
second right of it, the third below the first, the fourth below the
second, with no holes as they open and close. Supersedes the "one
temporary pane, one remembered rectangle" rule for grouped panes;
ungrouped temporary panes are unchanged.

- **API.** `createPane{temporary = true, group = "tv", grid = {cols =
  2}, at = "top-left", rows, cols}`. `group` (a pane-id-like name) is per
  script (key `<script>/<group>`); `grid.cols` 1–8, default 2; `at` gives
  the corner (an edge or the centre counts as top-left). `group` without
  `temporary` is an error.
- **Tiling** (`src/layout/tiles.ts`, pure). Members tile row-major in
  opening order from the corner, growing away from it (`top-right` grows
  left and down, the bottom corners grow up). Tiles abut: no gutter, the
  frames make the seams and a gap of one cell looked like a mistake.
  Fitting: fewer columns when a row does not fit the game pane (down to
  one), then shorter tiles (down to 5 rows: frame and 3 lines) when the
  rows do not fit; the cockpit clamps each tile to the window, so the
  rest overlaps at the edge.
- **Closing: reflow, not "last into the hole".** The members after the
  closed one each move one place back. It moves more panes than moving
  the last one into the gap, but the order on screen stays the opening
  order, which is what the owner asked for ("logical order"); moving the
  last one would put the newest TV first after one close.
- **The player's placement.** Dropping a moved member moves the group's
  origin so that the dropped member lands where it was dropped; every
  member follows (on the drop, not during the drag). A resize sets the
  group's tile size and the origin from the resized member. Both are kept
  per device in `localStorage` (`webcockpit.tempPanes`, entry
  `group:<script>/<group>`); Reset layout forgets them (`forgetTempPlaces`
  tells the cockpit, which puts open groups back to their corner and first
  size).
- **Runs.** A grouped pane's recorded `temp.rect` is its tile, updated
  when the tiling moves it (the cockpit tells the surface after each
  layout that changed a tile), so the log player and the HTML replay draw
  each pane where it was without knowing about groups.
- The cockpit keeps the opening order apart from the z-order (a press
  still brings a pane to the front without changing its tile).
