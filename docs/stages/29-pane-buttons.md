# Stage 29 — Pane buttons

Owner request 2026-10-21: showing panes, changing their colour and choosing
it is too roundabout today, and there is no choice between the blurred
glass background and a fully transparent one. Change a pane's look right on
the pane: hovering shows more buttons to the left of the close cross.

Later (not this stage): a fixed, always-present menu strip in the client,
probably one row right of the input prompt, built-in like the `panebar`
script, to show and hide panes and maybe more. When it exists,
Options → Panes → Appearance goes away.

## Owner decisions

- Hovering a pane shows, left of the `×`, three buttons:
  1. **Border** (outline of a rectangle): toggles the border on/off.
  2. **Colour** (a rainbow circle or square): steps to the next tint
     (Plain → Red → Green → Blue → Grey → Orange → Purple → Plain).
  3. **Background** (glass/blur vs transparent; an icon related to the
     border icon, e.g. its inverse).
  Border and Background sit next to each other.
- The icons fit the panes' look; the `×` may change if needed for the four
  to read as one set, but the owner likes it as it is.
- The changes are per pane and saved like the other pane settings.

## Technical decisions (session)

- New pane setting `glass: boolean`, default `true` (today's look). Off =
  **clear**: no fill inside the pane and no blur, weather on or off. A
  framed pane keeps its rim (the tint shows there); a borderless pane has
  no background at all. Migration fills `true`.
- Order from the left: Colour, Border, Background, `×`.
- No buttons where there is no close cross (phone, `cross = false` script
  panes such as the pane bar) and none on temporary script panes (they
  have no settings). Too narrow a pane drops the buttons before the title
  plate would be covered (Colour first); the `×` always stays.
- Options → Panes → Appearance stays for now: until the fixed menu exists
  it is the only built-in way to show a hidden pane.
- Tooltips name the action and state, e.g. "Border: on", "Colour: Red",
  "Background: glass".
- ADR 0095.

## Tasks

- [x] Stage file and status table
- [x] Setting `glass` (types, defaults, migration, script pane defaults)
- [x] Clear background (framed and borderless, weather on and off, floating)
- [x] Hover buttons: Colour, Border, Background beside `×`; icons; narrow panes
- [x] Unit tests
- [ ] E2E tests (Chromium + Firefox)
- [x] Manual (pane section) and ADR 0095

## Test guide

Open the client (desktop), weather on.

1. Hover a pane: three icons left of `×`. Do they look like they belong
   with the pane and the `×`?
2. Click the colour icon a few times: the pane steps through the tints and
   back to Plain.
3. Click the border icon: the frame goes away and comes back.
4. Click the background icon: the pane goes clear (weather sharp behind
   the text), click again for the glass. Try it on a borderless pane and a
   floating pane, and with the weather off.
5. Reload: the choices are kept.

Feedback wanted: the icons (shape, size, placement, colour), what clear
looks like, and whether anything is missing before the fixed menu.

## Owner feedback
