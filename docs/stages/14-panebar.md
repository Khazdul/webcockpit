# Stage 14 — Pane bar

Owner request 2026-10-03: a bar of buttons, one per pane, that turns the
panes on and off with one click. Built as a bundled Lua script
(`panebar`) on a new pane-list API that every script can use. Design:
ADR 0065.

## Owner decisions

- A bundled script `panebar`, **disabled by default** (the default for
  bundled scripts). Its pane has one button per pane (built-in panes and
  other scripts' panes, never itself), labelled with a short name; the
  full title is the tooltip. A click toggles the pane (as the close cross
  and Options → Panes do).
- Look: just the short name on its own background, one empty cell
  between buttons, no per-pane colours. On = lighter text on a lighter
  background, off = darker text on a darker background; it must work on
  the light (paper) backgrounds too.
- Top/bottom dock: rows of buttons (wrap when narrow). Left/right dock:
  one button per row. Floating: the buttons flow and wrap to the float's
  size.
- No frame by default: exactly one row, in a lane of its own at the
  bottom screen edge.
- Button order = Options → Panes order (built-ins, then running scripts'
  panes), so buttons do not jump when panes are dragged around.
- The new Lua pane API is open to all scripts.

## Plan

1. **Shade colours** in pane text: `<@role>` / `<@role:@role>` /
   `<:@role>` tags in the pane methods resolve to the pane's shade ramp
   every frame (follow tint and theme).
2. **Layout:** per-lane minimum (a borderless script pane in the
   top/bottom dock can be 1 row), `lane = "own"` placement (a new lane at
   the dock's screen edge), `wantPaneSize`, lane handles beside 1-row
   lanes, soft grip for borderless script panes (top-row links work),
   thin float handles, edge-zone drops do not join a bar lane, cockpit
   `dragging` / `onLayout` hooks.
3. **Lua API:** `createPane{short, border, lane}`, `getPanes()`,
   `setPaneOn(id, on)`, `pane:dock()`, `pane:wantSize(rows[, cols])`,
   event `sysPanesChanged` (coalesced, signature diff, held during a
   drag, rate capped).
4. **panebar.lua** (bundled, disabled by default), `short = "KEYS"` for
   the key manager.
5. Editor reference and script manual.
6. Tests: unit and e2e (Chromium + Firefox).
7. ADR 0065.

## Tasks

- [x] Stage file and status table
- [x] Shade colours in pane text
- [x] Layout: per-lane minimum, own lane, wantPaneSize
- [x] Cockpit: 1-row lane handles, soft grip, float handles, edge-zone rule, hooks
- [x] Surface: pane states, setOn, onStates, dock, want (Recording forwards)
- [x] Host: createPane short/border/lane, getPanes, setPaneOn, pane:dock, pane:wantSize, sysPanesChanged
- [x] panebar.lua, keymanager short name
- [x] Editor reference and manual
- [x] Unit tests
- [x] E2E tests (Chromium + Firefox)
- [x] ADR 0065

### Owner feedback round 1

- [x] Host: `pane:setGrip(row, col, len)` / `pane:setGrip(nil)`; content
      grip, grab cursor, cockpit press-to-move on grip cells
- [x] Hover on a lit (glow) link cell is inverted
- [x] panebar: grip `∷` at row 1, equal-width padded buttons, horizontal
      flow with wrap everywhere, Character-pane colours, default place
      at the bottom of the right dock
- [x] Editor reference and manual for setGrip
- [x] Unit tests (layouts, grip, setGrip, cockpit grip drag, hover)
- [x] E2E (Chromium + Firefox): grip drags, wrap, equal widths, placement
- [x] ADR 0065 amendment "Owner feedback round 1"

## Test guide

Open https://mumecockpit.com/ (hard reload so the new version loads).

1. Esc → Scripts: turn on **panebar**. The bar appears at the bottom of
   the right dock, under the Map, with a dotted grip `∷` at its left end
   and one button per pane (CHAR, TIME, GRP, COMM, UI, MAP, and script
   panes such as KEYS or MERC when those scripts run). All buttons are
   equally wide, with a blank cell on each side of the name; they wrap
   onto the next row when the dock is narrow, and the pane is as high as
   its rows.
2. Click a button: that pane hides and the button turns dark. Click again:
   it comes back. Point at a button to see the pane's full name; a lit
   button changes look under the pointer too.
3. Point at the grip: the pointer is a hand. Drag the bar by the grip to
   the bottom edge of the screen, to the left dock and over the game
   (floats). Wherever it is, the buttons run left to right and wrap.
   Resize a float or a dock: the buttons rewrap.
4. Esc → Options → Appearance: pick a paper background and check that
   on and off buttons are still easy to tell apart (they use the same
   colours as the SNEAK/RIDE/CLIMB/SWIM boxes in the Character pane).
5. Esc → Options → Reset layout: the bar goes back to the bottom of the
   right dock.
6. Type `bar` to hide or show the bar, `bar list` for the list as text.

Feedback wanted: the grip (glyph and size), the button colours and hover
(dark and paper), and the default place.

## Owner feedback round 1

- [x] Host: `pane:setGrip(row, col, len)` / `pane:setGrip(nil)`; content
      grip, grab cursor, cockpit press-to-move on grip cells
- [x] Hover on a lit (glow) link cell is inverted
- [x] panebar: grip `∷` at row 1, equal-width padded buttons, horizontal
      flow with wrap everywhere, Character-pane colours, default place
      at the bottom of the right dock
- [x] Editor reference and manual for setGrip
- [x] Unit tests (layouts, grip, setGrip, cockpit grip drag, hover)
- [x] E2E (Chromium + Firefox): grip drags, wrap, equal widths, placement
- [x] ADR 0065 amendment "Owner feedback round 1"

## Test guide

Open https://mumecockpit.com/ (hard reload so the new version loads).

1. Esc → Scripts: turn on **panebar**. A one-row bar appears at the very
   bottom of the screen, under the input line, with one button per pane
   (CHAR, TIME, GRP, COMM, UI, MAP, and script panes such as KEYS or
   MERC when those scripts run).
2. Click a button: that pane hides and the button turns dark. Click again:
   it comes back. Point at a button to see the pane's full name.
3. Drag the bar by a button (press and move a little) to the left or right
   dock: the buttons stack one per row and the pane is as high as the
   list.
4. Drag it over the game area: it floats. Resize it: the buttons rewrap.
5. Esc → Options → Appearance: pick a paper background and check that
   on and off buttons are still easy to tell apart.
6. Type `bar` to hide or show the bar, `bar list` for the list as text.

Feedback wanted: the on/off button colours (dark and paper), the button
order, and whether the short names should be shorter or longer.

## Owner feedback

(none yet)
