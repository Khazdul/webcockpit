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

- [ ] A1 script panes get grab cursor and close `x`
- [ ] A2 hover outline on borderless panes
- [ ] B3 Enter/click on selected profile = edit
- [ ] B4 General → Appearance
- [ ] B5 map background colour option
- [ ] C6–C10 manual edits

## Test guide

(written when the stage is built)

## Owner feedback
