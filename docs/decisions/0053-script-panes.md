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
