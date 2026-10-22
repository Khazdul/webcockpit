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
- [x] E2E tests (Chromium + Firefox)
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

### Round 1 (2026-10-22, on 0.1.72)

- **Clear float:** without the glass the game text must not show through a
  floating pane; everything else (weather, panes under it) does.
- **Timers `+`:** the buttons cover it on a borderless Timers pane. Accepted
  for now; not handled in this round.
- **Borderless pane on hover:** the whole top row gets the pane's background
  colour (a title bar). The `×` moves to the far right edge, the other
  buttons with it. The name tag goes to the far left instead of centred.
- **Borderless glass** (added by the coordinator): a borderless glass pane
  gets no glass with weather on; it should get the glass a frame has
  inside (tinted fill over a blur), weather off the opaque fill as now.

Tasks:

- [x] Clear float hides the game text under it, nothing else
- [x] Borderless hover title bar: full-row background, buttons at the right
      edge, name tag at the left
- [x] Borderless glass with weather on (docked, float, Firefox, under a float)
- [x] Key manager `?` and the script manual's top-row note follow the buttons
- [x] Tests (unit, e2e Chromium + Firefox), ADR 0095 addendum, manual

### Round 2 (2026-10-22, on 0.1.73)

- **Weather inside clear panes:** rain (and the like: snow, other falling or
  drifting effects) falls inside a clear floating pane. For consistency the
  same goes for clear docked panes: clear means fully see-through.

Tasks:

- [x] Weather effects fall inside clear panes (floating and docked)
- [x] Tests, ADR 0095 round 2 addendum

### Round 3 (2026-10-22, before release of round 2)

- **Borderless hover:** only the icons (and `×`) show, still at the right
  edge. No background colour at all: no title bar, no boxes behind the icons.
- **Name tag removed:** hovering a pane no longer shows its name.
- **Clear framed pane lit:** the weather lights a clear pane's rim (glints,
  beams) as it does a glass pane's; rain and snow still fall inside it.

Tasks:

- [x] Borderless hover: icons only, no bar or boxes
- [x] Name tag gone (built-in and script panes)
- [x] Weather lights a clear framed pane's rim
- [x] Tests, ADR 0095 round 3 addendum (and ADR 0087 note), manual

### Round 4 (2026-10-22, on 0.1.74)

- **Wider resize edges on framed floats:** the left, right and bottom border
  should grab over a larger area; the top is fine as it is.

Tasks:

- [x] Framed float: the w, e and s handles cover the whole border cell (were
  40 % of it, so the mid-cell line itself missed); top and borderless floats
  unchanged
- [x] e2e check of the band sizes

## Handoff (2026-10-22, after 0.1.74)

State on main: rounds 0–3 released (0.1.72–0.1.74). Owner testing.

Test 0.1.74:

1. Rain or snow, a clear floating pane and a clear docked pane: the weather
   falls inside; no game text shows through the float.
2. A clear framed pane: lightning, moon glints and sun beams light its rim.
   Is it clear enough? (Only lightning was checked by eye.)
3. Hover a borderless pane: only the icons and `×` at the right edge, no
   background, no name. Do they read over text?

Known and accepted for now:

- The Timers `+` (and the almanac `[+ add]`, map search field, mercenaries
  cost link) are covered by the buttons on a borderless pane.
- The `×` lies on a borderless float's top-right resize corner.
- A clear rim casts no sun shadow and takes no splashes (ADR 0095 round 3).

Next session (owner's agenda):

- The details of the buttons and clear panes after testing.
- The fixed menu strip (right of the input prompt): build it or not, and
  what it holds beside showing and hiding panes.
- Whether Options → Panes → Appearance goes away. Today it is the only
  built-in way to show a hidden pane (besides the `panebar` script).
