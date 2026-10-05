
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

## Owner feedback round 4 (2026-10-05)

Stage 21 feedback round 1, item 8: the owner asked for a gear next to the
grip, shown while the pointer is over the bar, opening a small menu where
the player chooses which panes the bar has buttons for. Implemented.

- **Row.** Grip (column 1), gear cell (column 2), blank, buttons from
  column 4 (scrolled: `←` in 4, buttons from 6). The gear cell is always
  reserved, so the tiers (full / shrunk / scrolled) and every button stay
  put when the gear comes and goes; full width for the six built-ins is
  now 44 columns. The grip is column 1 only.
- **Gear.** `⚙` (U+2699): in DejaVu Sans Mono (regular and bold) at the
  cell advance, the fallback of every other family, like `∷`
  (`font-glyphs.test.ts` requires it there). `<@mid>`, `<@text>` while the
  menu is open; a link ("Choose the panes on the bar" / "Close the
  menu"). Drawn while the pointer is over the bar or the menu is open.
- **Menu.** A temporary pane "Bar buttons", `near = "bar"`, `popup =
  true`: one `pane:setCheckbox` row per pane in `getPanes()` order
  (` [x] SHORT  Title`, the bar itself left out). Unticked panes lose
  their button only; their on/off is untouched. A press outside the menu
  and the bar, Esc (aimed at the cockpit) or its cross closes it; the
  gear and `bar menu` toggle it; `bar` hiding the bar closes it. A list
  change while it is open redraws it, or reopens it when the number of
  panes changed (a temporary pane keeps its size).
- **Kept.** `store.set("hidden", {[id] = true})`: the set of panes taken
  off, so a pane that appears later gets a button. The store is per
  script (the same scope as the layout and toggles, which are not per
  profile either). `bar list` marks them ", no button".
- **Touch.** A device whose main pointer cannot hover (`(hover: none)`:
  phones, tablets) shows the gear all the time: `pane:onHover` reports
  inside once there. On a hybrid device a touch press on the bar counts
  as over it and one elsewhere as gone.

API (API 1, additions only; editor reference, script manual, spec §2.10):

- `pane:onHover(fn)` / `pane:onHover(nil)`: `fn(true)` when the pointer
  comes over the pane's box (frame included), `fn(false)` when it leaves.
  Mouse and pen by `pointerenter` / `pointerleave` on the pane element; a
  leave whose point is still over the pane (and `elementFromPoint` there
  is in it) is ignored (the Firefox redraw case); while inside, a
  document `pointermove` / `pointerdown` outside the pane, window blur or
  the tab going hidden also end it, and so does the pane being hidden.
  Touch: `pointerdown` on the pane is inside, one elsewhere is outside.
  `(hover: none)`: `fn(true)` once, in a microtask after the call, never
  `false`. Surface: `view.hover(on)`, `events.onHover(inside)`; the
  function is released on replace, `nil`, close and script stop. Not in
  runs.
- `createPane{temporary = true, near = "<own pane id>", popup = true}`:
  `near` must name an open pane of the same script (else an error) and
  places the pane with `tempNearRect`: above that pane's box when it
  fits, else below when it fits, else on the side with more room; left
  edge on the pane's, moved left to stay on screen; again on every layout
  until the player moves it; `at` while the near pane has no box. Never
  saved per device; runs record where it went. `popup`: while one is
  open the cockpit listens to `pointerdown` (capture) on the document —
  a press outside the pop-up and its near pane calls its `onClose`, as
  the cross — and to `keydown` (capture) on the window: a plain Esc not
  already handled and aimed at the cockpit (or nothing) closes the newest
  pop-up and goes no further (so the input line does not open the ESC
  menu); one aimed at an overlay is left alone. Both keys are errors on
  a pane that is not temporary.

Considered: drawing the menu inside the bar (it is one row; growing it
would move the panes around it), a centred temporary pane (`at` from the
bar's dock; far from the gear on a wide screen), and the script binding
Esc with `tempKey` (no click-outside; it would take Esc from the whole
client).
