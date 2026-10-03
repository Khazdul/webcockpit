# 0065 — Pane bar and the pane list API

- Status: Accepted
- Date: 2026-10-03
- Amends: ADR 0053 (script panes: the top-row grip of a borderless pane),
  ADR 0064 (dock lanes: lane minimum, screen-edge zones)

## Context

The owner asked for a bar of buttons, one per pane, that turns the panes
on and off with one click (stage 14). It is built as a bundled Lua script
(`panebar`) on an API every script can use. Owner decisions: just the
short name on its own background with one empty cell between buttons, on
lighter than off, working on the paper backgrounds too; no frame, exactly
one row, in a lane of its own at the bottom screen edge; button order =
Options → Panes order; bundled but disabled by default; the API is open
to all scripts.

## Decision

### Lua API (API 1, additions only)

- `createPane{short, border, lane}`:
  - `short`: 1–8 characters after trimming, else an error. Applied again
    by a repeated `createPane` (like `title`).
  - `border = false`: the first placement writes the pane's settings entry
    unframed; Options → Panes can turn the frame on later.
  - `lane = "own"`: the first placement opens a new lane 0 (at the dock's
    screen edge) holding only this pane, `rows` (top/bottom) or `cols`
    (left/right) plus the frame, never below the pane's cross minimum. An
    error with `dock = "float"` or a temporary pane. Options → Reset layout
    places it the same way again (the surface re-places open panes).
- `getPanes()` → list in **Options → Panes order**: the built-in panes in
  `PANE_IDS` order, then the running scripts' panes in the order the
  cockpit lists them (`Cockpit.scriptPanes()`). Temporary panes are never
  listed. An entry is `{id, title, short, on, shown, dock, script, own}`:
  `on` is `settings.panes[id].on`; `shown` means the pane has a box in the
  last layout; `dock` is where the settings place it (`left`, `right`,
  `top`, `bottom` or `float`); `script` the owner (nil for a built-in);
  `own` true for the caller's own panes. Built-in short names: CHAR, TIME,
  GRP, COMM, UI, MAP (`PANE_SHORT`). A script pane without `short` derives
  one: the title's letters and digits, the first four, upper case; empty →
  the same from the pane's own id.
- `setPaneOn(id, on)` → boolean: writes `togglePatch` for a built-in pane
  or a running script's ordinary pane; false for an unknown id, a
  temporary pane or a pane of a script that is not running. Wrong types
  are a bad-argument error.
- `pane:dock()` → the placement name, `"float"` for a temporary pane, nil
  after `pane:close()`.
- `pane:wantSize(rows[, cols])` → boolean (see below).
- Event `sysPanesChanged` (no arguments), for every script.

### Shade-role colours in pane text

Pane text (the pane methods `cecho`, `setLine`, `setText`, `cechoLink`)
accepts the pane's shade roles as colour names: `<@track> <@dim> <@mid>
<@bg> <@text> <@label> <@glow>` (`@bg` = ramp `paneBg`, `@text` = ramp
`vtext`), as foreground, `<@a:@b>` and `<:@b>` as background. Elsewhere
(the game output's `cecho`, `replaceLine`, `highlight`) they stay text.

Encoding: a new colour range `SHADE_COLOR = 0x2000000` + the role's index
in `SHADE_ROLE_ORDER` (core/types.ts; theme/color.ts `SHADE_ROLES` is the
same list). `isTrueColor` excludes the range, `shadeRoleOf(c)` reads it
back, run records accept it (`isColor`). `paneLine` resolves a shade role
from the pane's ramp at every render, as is (no light shift, no contrast
lift: the ramp is already made for the pane's light or dark background),
so the colours follow the pane tint and the theme.

### Layout

- **Per-lane minimum** (amends ADR 0064): a lane's minimum across the
  dock is the largest `paneCrossMin` of its shown panes: `SIDE_DOCK_MIN`
  in a side dock; in the top/bottom dock the dock minimum (3) for a
  built-in pane and `SCRIPT_MIN_ROWS + frame` for a script pane (1 without
  a border). It floors the lane in allocation, the dock's collapse sum
  (`minOf`), `shrinkLanes`, `shiftLanes` and the gap drag (`LaneBox.min`).
  Layouts of built-in panes allocate exactly as before.
- **Lane boundary handles** beside a 1-row lane: the handle that would sit
  on the 1-row lane's only row goes on the upper part of the neighbour
  lane's first row instead; between two 1-row lanes there is none.
- **Soft grip** (amends ADR 0053's note that the top content row of a
  borderless pane lies under the grip): for a borderless, ordinary script
  pane the title-row grip takes no pointer events. A press on the pane's
  top content row (not on a text field, the scroll indicator, the close
  cross or a float handle) starts a pending move without
  `preventDefault` or pointer capture, so a release without movement is
  a normal click on the pane (its links work). Past `DRAG_THRESHOLD` the
  cockpit captures the pointer, clears any text selection, shows the drag
  shield and eats the click that ends the drag (a capture-phase listener),
  so no link fires on a drop.
- **Borderless floats** get thin edge bands (3 px) and small corners
  (6 px), so a one-row float stays clickable.
- **Edge-zone drops** (amends ADR 0064): a screen-edge zone whose dock's
  outermost shown lane holds only borderless script panes (a bar) does not
  put the pane into that lane: it goes into the next lane inward, or, when
  there is none, into a new lane just inside the bar (dock default size,
  shrunk to the room). Dragging a docked pane over a bar lane itself
  follows the lane band rule: a 1-row lane is all band, so the pane opens
  a new lane inside it.
- `wantPaneSize(m, id, rows, cols, framed)`: in a side dock `rows` becomes
  the pane's desired rows; in the top/bottom dock `rows` sets the lane's
  size (plus frame, at least the cross minimum) only when the pane is
  alone in its lane, and `cols` (when given) its desired columns; a float
  or unknown pane is unchanged. Returns the input when nothing changes.

### Surface and cockpit hooks

- `Cockpit.dragging` (a move past the threshold, or a resize) and
  `Cockpit.onLayout(fn)` (after every relayout).
- `ScriptPaneSurface` gains optional `states()`, `setOn(id, on)` and
  `onStates(fn)`; `ScriptPaneView` gains optional `dock()` and
  `want(rows, cols?)`. Fakes without them keep working. The cockpit
  surface computes `states()` from the settings, the last layout and
  `scriptPanes()`; `onStates` follows `onLayout` (skipped while
  `dragging`) and `onScriptPanes`. `RecordingPaneSurface` (App wraps the
  cockpit surface in it) forwards all of them.
- `want` semantics ("player drag wins"): the view remembers the last
  request with the place it was made at (dock, lane, alone, rows, cols).
  The same request at the same place writes nothing, so a size the player
  dragged stays until the script asks for a different value or the pane
  moves. It returns true when the request applies where the pane is (a
  side dock, alone in its top/bottom lane, or `cols` given), false for a
  float or a temporary pane.

### Event loop guards

`sysPanesChanged` is queued per microtask (`queueMicrotask`) and fired
only when the list's signature (JSON of `getPanes()` without `own`)
differs from the one last fired. Nothing is computed while no script has
a handler. It is triggered by the surface's `onStates` (so it is held
during a drag and comes after the drop's settings write), `createPane`,
`pane:close`, `setTitle`, a new `short`, and a script unloading with
panes. At most `PANES_EVENT_MAX` (20) fires per second per host: past
that one warning goes to the UI messages and the next fire waits for the
window. A handler that calls `wantSize` does not loop (sizes are not in
the list).

### panebar.lua

Bundled, disabled by default (the library's default for bundled scripts).
`createPane{id = "bar", title = "Pane bar", short = "BAR", dock =
"bottom", lane = "own", rows = 1, cols = 80, border = false}`. Buttons
are the other panes' short names, on `<@text:@dim>`, off `<@mid:@track>`,
one empty cell apart, each a link (tooltip `<title>: on (click to hide)`,
`off (click to show)` or `on, no room now`); a click calls `setPaneOn`.
Side dock: one per row from column 2, `wantSize(#buttons)`. Top/bottom:
flow from column 1 with wrap, the first row keeping its last four cells
free for the close cross when the pane is at least 12 wide,
`wantSize(lines)`. Float: the same flow from column 2 to one before the
right edge, no `wantSize`. Redraws on `sysLoadEvent`, `sysPanesChanged`
and resize. Alias `bar` (toggle) and `bar list`. The key manager's pane
is `short = "KEYS"`.

## Deviations from the plan

- The float layout also keeps the first row's last four cells free (the
  close cross sits there on a float too).
- panebar calls `wantSize` on every draw, not only when its request
  changes: the surface already ignores a repeated request at the same
  place, and a call per draw also resizes the lane after the bar moved to
  another lane of the same dock.
- An edge-zone drop next to a bar joins the next lane inward when there
  is one, instead of always opening a new lane.
- The shade-tag parser tests are in `scripts-parts.test.ts` (where the
  other `parseCecho` tests are), not `script-color.test.ts`.
- On the light ramps "off" (`@mid` on `@track`) is about 2.7:1, "on"
  (`@text` on `@dim`) above 3:1; on paper "on" reads as the darker,
  filled button. Left for the owner's feedback.

## Consequences

- Any script can build its own pane switcher or react to panes coming
  and going. Built-in panes stay unaffected unless a script switches them.
- A borderless script pane in the top/bottom dock is a single row; its
  top row is clickable and still drags the pane.
