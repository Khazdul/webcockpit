
## Owner feedback round 3 (2026-10-03)

The owner asked for a bar that adapts to narrow widths as the Character
pane does: buttons narrower and narrower (at least two characters), the
whole name when there is room, buttons as even as possible, and when even
two characters do not fit, a sideways scroll by two-finger swipe and by
arrows at both ends. Implemented; it amends the round 1 and round 2
sections where they differ (wrapping is gone).

- **One row, always.** Docked anywhere or floating, the bar draws one row;
  docked it asks `wantSize(1)`. Wrapping is replaced by shrinking and
  scrolling.
- **Width tiers** (room = the pane's columns after the grip and its blank
  cell, column 3 on):
  - *Full* while every button at the longest short name + 2, one blank
    apart, fits: exactly as round 1 (no stretching; spare room stays
    empty on the right).
  - *Shrunk* otherwise, while each button can have at least 2 cells: the
    buttons fill the room, one blank apart, widths `floor(cells / n)` or
    one more. The spare cells go to the first and last button, then the
    second and second-last, and so on; a single odd one goes to the
    middle button when the count is odd, and stays empty at the right
    end when it is even (a mirror-even row cannot place it elsewhere
    without an uneven gap). A name that fits is centred (the odd cell
    right, as before); a longer one shows its first `w` characters
    (CHAR → CHA → CH). The tooltip keeps the full title.
  - *Scrolled* when even 2 cells each do not fit: buttons 2 cells wide,
    one blank apart, from column 5; `←` in column 3 (after the grip and
    its blank) and `→` in the last column. The 0–2 cells left over stay
    blank before `→` (steady: the arrow never moves). The offset is in
    whole buttons, clamped on every draw (resize, list change), and reset
    when the bar leaves the scrolled tier.
- **Arrows.** `←` / `→` (U+2190 / U+2192), matching the `↑` / `↓`
  indicators of script panes. In every bundled family that has `↑` they
  have the cell advance (checked in the cmap and hmtx); Anonymous Pro and
  Hermit lack all three and fall back to DejaVu Sans Mono like `↑`.
  `font-glyphs.test.ts` now requires them in DejaVu. An arrow with panes
  beyond it is `<@text>` and a link: a click moves one page (the buttons
  shown), clamped; tooltip "N more panes to the left / right". At the end
  it is `<@dim>` and has no link.
- **Wheel.** The bar uses the new `pane:onWheel` (ADR 0072): in the
  scrolled tier `dx + dy` (the bar is one row, so a mouse wheel's dy
  scrolls it too) accumulates and every 3 cells (a button and its gap)
  move one button, the rest kept and dropped on a turn; it returns true
  (consumed: no native scroll, no history swipe). In the other tiers it
  returns false and the wheel is left alone.
- Unchanged: grip, lighten hover, on/off colours, tooltips, `bar` /
  `bar list`, Options → Panes order, the default place.
- The default right dock (lane size 33) is narrower than six full
  buttons need (43 columns), so the bar starts *shrunk* there, with
  4–5-cell buttons and every built-in name whole.
