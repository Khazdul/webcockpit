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

### Owner feedback round 2

- [x] Hover style API: `pane:setHover(style)`, `{hover = …}` on
      `setLink` / `cechoLink` ("band" default, "lighten", "none"); in
      snapshots; round 1 inverted rule removed
- [x] Lighten: text and fill a step lighter (HSL L + 8), dark and paper
- [x] panebar: `setHover("lighten")`, off text `<@mid:@track>` (~2.8:1)
- [x] Sticky hover fixed (pointer-position tracking, document listeners,
      `elementFromPoint` on leave and render); regression unit + e2e
- [x] panebar wraps only when a button does not fit; no close-cross
      reservation, no float margin
- [x] No close cross on a borderless script pane
- [x] Editor reference and manual (setHover, link opts, no cross)
- [x] Unit and e2e (Chromium + Firefox)
- [x] ADR 0065 amendment "Owner feedback round 2"

### Owner feedback round 3

Owner request: the bar adapts to narrow widths like the Character pane:
buttons get narrower (at least two characters), the whole name when
there is room, buttons as even as possible; when even two characters do
not fit, a two-finger sideways scroll and arrows at both ends.

- [x] Host: `pane:onWheel(fn)` / `pane:onWheel(nil)`, whole-cell steps
      (pixels by cell size, lines, pages; rest kept; Shift = sideways;
      Ctrl never), true consumes; ref released (ADR 0072)
- [x] Surface / pane: `view.wheel(on)`, `events.onWheel`, non-passive
      listener only while a handler is set; `forwardWheel` skips a
      consumed event; Recording forwards
- [x] panebar: always one row (`wantSize(1)`), no wrap; full → shrunk
      (mirror-even spare cells, names cut to CHA / CH) → scrolled
      (`←` / `→` arrows that page, dim at the end, tooltips; wheel a
      button per 3 cells)
- [x] `←` / `→` checked in the bundled fonts (`font-glyphs.test.ts`)
- [x] Editor reference and manual (`pane:onWheel`, panebar help text)
- [x] Unit tests (layouts at many widths, arrows, offset clamping, wheel;
      host `onWheel`; `wheelSteps`; pane listener) and e2e (Chromium +
      Firefox: shrink, arrows, click, sideways and vertical wheel, no
      wrap; `pane:onWheel` consume vs native scroll)
- [x] ADR 0072 (`pane:onWheel`), ADR 0065 amendment "Owner feedback
      round 3"

### Owner feedback round 4 (stage 21 feedback round 1, item 8, 2026-10-05)

Owner request: a gear next to the grip while the pointer is over the
bar; it opens a small menu to choose which panes get a button; kept.

- [x] Host: `pane:onHover(fn)` (touch: press on / elsewhere; `(hover:
      none)` reports inside once), `createPane{near, popup}` (opens next
      to an own pane; a press outside or Esc closes it)
- [x] panebar: gear cell reserved (buttons from column 4), `⚙` while
      hovered or the menu is open; "Bar buttons" pop-up with a checkbox
      per pane; `hidden` set in the store; `bar menu`; `bar list` marks
      ", no button"; gear always shown on touch-only devices
- [x] Editor reference, script manual, spec §2.10
- [x] Unit (host, pane, cockpit, `tempNearRect`, panebar) and e2e
      (Chromium + Firefox)
- [x] ADR 0065 amendment "Owner feedback round 4"

## Test guide (round 4)

1. Point at the pane bar: a gear `⚙` appears after the dots at its left
   end; nothing else moves. Move away: it goes.
2. Click the gear: a small "Bar buttons" menu opens just above the bar
   with a box per pane. Untick COMM: its button leaves the bar, the Comm
   pane stays. Tick it again: it is back.
3. Click outside the menu, press Esc, or use its cross: it closes.
4. Untick a pane, reload: the button is still gone. Turn on a script with
   a pane (for example mercenaries): it gets a button.
5. On a phone or tablet the gear is always shown.

Feedback wanted: the gear's look and place, the menu's place and size.

## Test guide (round 3)

Open https://mumecockpit.com/ (hard reload so the new version loads).
Turn on **panebar** (Esc → Scripts) if it is not on.

1. The bar is one row at the bottom of the right dock. The right dock is
   a little too narrow for six full buttons, so they share the row: all
   names whole, the buttons nearly equal, the row even from both ends.
2. Drag the right dock's edge to make it narrower, step by step: the
   buttons get narrower and the names are cut (CHAR → CHA → CH). The bar
   never gets a second row. Make it wider again: full names come back,
   and once there is room for all at full width they stop growing.
3. Narrower still (or drag the bar into a narrow left dock): arrows
   appear at both ends, `←` after the grip and `→` at the right edge.
   Point at an arrow: "N more panes to the right". Click it: the other
   buttons show. At the end the arrow is dim and does nothing.
4. With the pointer over the bar, swipe sideways with two fingers on the
   touchpad (or turn the mouse wheel): the buttons scroll. The page
   behind does not scroll and the browser does not go back.
5. Click a button while scrolled: its pane toggles and the bar stays
   where it was scrolled to.

Feedback wanted: are the narrow names (CHA, CH) readable enough, do the
arrows look right (glyph, brightness, dim at the end), and does the
swipe scroll at a good speed (one button per about three cells of
movement)?

## Test guide (round 2)

Open https://mumecockpit.com/ (hard reload so the new version loads).
Turn on **panebar** (Esc → Scripts) if it is not on.

1. Point at a lit button, then at a dark one: each turns a little
   lighter, text and fill, and goes back when the pointer leaves.
2. Dark buttons: the name is now readable (grey on dark grey), still
   clearly off next to the lit ones.
3. Move the pointer quickly off a button in every direction (up into the
   Map, out of the window at the screen edge, over a floating pane): no
   button stays lit.
4. Make the right dock narrower and wider: a button moves to the next
   row only when it really does not fit; the last one may touch the
   right edge. The bar has no × of its own (`bar` or Options → Panes
   hide it).
5. Esc → Options → Appearance: paper. Repeat 1 and 2.

Feedback wanted: is the hover lift right (more, less), and are the off
buttons readable enough on dark and paper?

## Test guide (round 1)

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

2026-10-03: overview test OK, approved.
