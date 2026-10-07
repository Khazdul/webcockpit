# Stage 25 — Polish round

Owner feedback 2026-10-07, a batch of small fixes and changes.

## Plan

### A. Panes (src/panes)

1. Bug: panes created by scripts (almanac, key manager) get no grab
   cursor near their top edge and no close `x` in the top-right corner on
   hover. They should behave like built-in panes.
2. Hovering a pane that has no border shows a thin, discreet outline
   around it so the user can see where it is. Same colour as the hover
   `x`, for consistency. No layout shift (outline/inset shadow, not a
   border).

### B. Start page and options (src/chrome, src/map)

3. Profile list: Enter (or a click) on the already selected profile opens
   it for editing, same as the EDIT action. First click selects, second
   click edits.
4. Options → Panes → "General" is renamed "Appearance" (menu label and
   page title).
5. Options → Mapper: map background colour. Default is today's colour.
   The user can pick from a list of common named colours or type an exact
   colour code (`#rrggbb`). Saved with the other map settings, applied
   live.

### C. Profile manual (src/editor/help.ts)

6. Remove the "What is different from tt++ here" paragraph and its three
   bullets.
7. Remove the sentence with the link to the TinTin++ manual site.
8. Remove "Ctrl+F finds and Ctrl+H replaces there; in LITE they switch to
   EDITOR first."
9. `#lua` example: `#alias {h} {#lua {healer} {heal} {%0}}` (braced
   argument, more instructive). Keep the example check true.
10. Remove the "Not supported" section.

## Tasks

- [x] A1 script panes get grab cursor and close `x`
- [x] A2 hover outline on borderless panes
- [x] B3 Enter/click on selected profile = edit
- [x] B4 General → Appearance
- [x] B5 map background colour option
- [x] C6–C10 manual edits

## Result

- A: root cause was deliberate (ADR 0065 round 2): borderless script
  panes had no grab cursor on the soft-grip top row and the x was hidden
  so it would not cover the pane bar's buttons. Now: grab cursor on the
  top row (pointer over links), x on hover unless a link or text field
  lies under it (then hidden, e.g. pane bar). Hover outline: 1 px inset
  in `--pane-border` on every borderless pane, hover devices only.
  ADR 0084.
- B3: Enter/click on the selected profile = EDIT. A click on another
  profile now makes it active (before it only moved the cursor).
- B4: the Panes hub entry is "Appearance"; its page title is "Pane
  appearance", since Options already has an "Appearance" page.
- B5: `mapper.background`, default `#2e3436`, 12 dark named colours or a
  `#rrggbb` code; live, also the pane bg before the first frame. No
  auto-contrast: a light colour hides white lines. ADR 0085.
- C: manual trimmed. `{%0}` example: an empty `#lua` argument now gives
  nil (was ""), ADR 0051 addendum.

## Test guide

Open the dev build (or the next release) and try:

1. Almanac and key manager panes without border: hover the top row
   (hand cursor, drag), hover the pane (x top right, thin grey outline).
   Pane bar: x should not cover its last button.
2. Map pane / other borderless panes: outline on hover visible enough?
3. Start page → Profile: click another profile (it becomes active),
   click it again or press Enter (editor opens).
4. Options → Panes → Appearance (page titled "Pane appearance").
5. Options → Mapper → Background: cycle with ←→, Enter for the list,
   "Colour code…" for e.g. `#1c1c1c`. Reload: kept.
6. Profile → EDITOR → HELP: intro without the tt++ differences, no Not
   supported section, `#lua` example with `{%0}`.

Feedback wanted: outline colour/strength, the "Pane appearance" title,
the colour list.

## Owner feedback

### Round 1 (2026-10-08)

1. Key manager pane shows no x; probably its `?` link sits under it.
   The hover outline should follow the main window background: grey on
   black as now, bluish on blue, and so on.
4. Mapper: "Background" → "Background colour". Add "Dark paper", a
   shade just darker than the paper background. Choosing via Enter is
   not intuitive: pick the named colour or the colour code directly in
   the Mapper menu, a check box before each of the two rows; choosing
   one unchecks the other.
5. Manual: assumed fine.
- Pane appearance title is fine. The "None" column in Pane appearance is
  not clear to a new user: it means "same colour as the background".
- Follow-up (owner): the x should sit on top, so script authors need not
  reserve cells for it.

Done (round 2): the x shows on every non-temporary script pane on hover,
over its content; `createPane{cross = false}` opts out (pane bar).
Bundled scripts keep their links clear of it (key manager `?` follows
the count). Outline colour `--pane-outline` derived from the main
background (black → #292929, lighter on blue, darker on paper). Mapper:
`[X] Background colour: <name>` / `[ ] Background colour code: <code>`
check-box rows, remembered code (`mapper.backgroundCode`), Dark paper
`#e8dfc8` with dark map lines on light backgrounds. Pane appearance:
"None" → "Plain" with the hint "Plain: the main window background."
ADR 0084 and 0085 addenda.

Test guide (round 2):

1. Key manager without border: hover → x top right; `?` next to the
   key count still clickable. Change the main background (Options →
   Appearance) and hover a borderless pane: outline follows it.
2. Options → Mapper: tick between the two Background rows; ←→ on the
   colour row, Enter on the code row. Try Dark paper on the map.
3. Options → Panes → Appearance: "Plain" column and its hint.

### Round 2 (2026-10-08)

- Remove the colour code row again (did not look good); named colours
  only. Add Black and White if missing.

Done (round 3): one `Background colour: <name>` row, ←→ cycles; code row,
prompt and `mapper.backgroundCode` removed (a typed colour falls back to
Default). White `#ffffff` added after Dark paper, drawn with dark lines.
ADR 0085 addendum.
