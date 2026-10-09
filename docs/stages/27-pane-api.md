# Stage 27 — Pane API

Owner request 2026-10-09: scripts should be able to rebuild advanced
panes like the built-in Timers, Character and Group panes as script
panes, with the scripts collecting their own data. The gap review
(session log 2026-10-09) found the gaps below; the owner approved
building them. ADR 0090.

## Plan

### A. Bars over part of a row

`pane:gauge(row, {value, max, color, label, col, width, align, track})`:
with `col`/`width`, a bar over part of a row, under the row's text, so a
row can hold several bars and text (the Group pane's three bars with the
name over them, the Timers pane's short bars). Without them, the
full-row gauge as before. The same light-pane wash as today's gauges.
Whole-cell fills, as the built-in panes (no sub-cell blocks).

### B. Pane theme

`pane:theme()` (light, bg, fg, shades by tag name), `pane:fillColor(color)`
(the washed gauge fill) and `pane:onTheme(fn)` (called when Options change
the pane's colours).

### C. GMCP state guarantee

Make it deliberate that `state.group` and `state.char` are current inside
a `gmcp.*` handler (it relied on bus subscription order), test it, and
say so in the manual's GMCP section.

### D. Key manager `?`

Move the help `?` in the key list's top row as far right as possible
without colliding with the hover close cross: one empty cell before the
cross's three cells, following the width; framed and borderless.

## Tasks

- [x] A. Model (`gauges` on a text line, `addGauge`), drawing (bars under
  text, see-through spaces, align, track), run records and sanitizer,
  host options and errors; unit and Lua tests
- [x] B. `pane-theme.ts`, `view.theme()`, `events.onTheme` from the
  surface, `pane:theme`, `pane:fillColor`, `pane:onTheme`; unit and Lua
  tests
- [x] C. `GameState.take`, the cache hands messages over first (App and
  host); test with the game state attached last; manual sentence
- [x] D. `?` at column width−5; unit and e2e tests updated
- [x] API reference (`lua-api.ts`) and manual (Panes: Bars, Theme, a
  Group example that the unit tests run)
- [x] e2e: partial gauges and onTheme in `script-panes.spec.ts`;
  `keymanager.spec.ts` updated
- [x] ADR 0090, this file, progress table

## Test guide

Open the client (local dev), enter MUME (or the offline demo), and open
the script editor (ESC → Scripts). Make a new script and paste:

```lua
local pane = createPane{id = "bars", title = "Bars", dock = "right", rows = 4}
local function draw()
  local _, cols = pane:size()
  if cols < 6 then return end
  local w = cols // 3
  pane:setLine(1, "<@text>Gimli")
  pane:gauge(1, {col = 1, width = cols - 2 * w, value = 18, max = 20, color = "#005a18", track = false})
  pane:gauge(1, {col = cols - 2 * w + 1, width = w, value = 5, max = 20, color = "#0000aa", track = false})
  pane:gauge(1, {col = cols - w + 1, value = 2, max = 20, color = "red", track = false})
  pane:setLine(2, "SHIELD")
  pane:gauge(2, {col = 8, width = 10, value = 7, max = 10, color = "orange", label = "7m", align = "right"})
  local th = pane:theme()
  pane:setLine(3, (th.light and "light " or "dark ") .. th.bg .. "  fill " .. pane:fillColor("#0000aa"))
end
pane:onResize(draw)
pane:onTheme(draw)
```

1. **Three bars on one row.** Row 1 looks like a Group pane row: green,
   blue and red bars side by side, no gaps, the name over the first.
   Resize the pane: the bars keep a third each.
2. **A short bar after a label.** Row 2: `SHIELD`, then a 10-cell orange
   bar with `7m` at its right end.
3. **Theme.** Change the pane's colour (ESC → Options → Panes →
   Appearance) or switch to a paper theme: row 3 updates by itself (new
   background; on paper the fill is a pale blue) and the bars wash to
   pastels on paper.
4. **Group rows from GMCP.** Optional: the manual (Scripts → Manual →
   Panes) has a "Group rows with three bars each" example built on
   `state.group`; run it with a group.
5. **Key manager `?`.** Turn on the key manager (`keys`). The `?` in its
   top row now sits near the right edge. Make the pane borderless
   (Options → Panes → Appearance) and hover it: the close cross appears
   to the right of the `?` with one empty cell between them; the `?`
   stays clickable (it opens the help). Make the pane narrow: the `?`
   moves left with the edge, and on a very narrow pane follows the count.

Feedback wanted: is anything still missing to rebuild the Group, Timers
or Character pane as a script? Is the `?` placement right?

## Owner feedback
