# 0099 — Menu bar and bar popups

- Status: Accepted
- Date: 2026-10-31
- Related: stage 30 (`docs/stages/30-fixed-menu.md` S1–S4, "30a build
  plan"), ADR 0025 (notices), ADR 0075 (touch and phone), ADR 0095 (pane
  buttons), ADR 0097 (fullscreen button), ADR 0100 (Disconnected notice)

## Context

Stage 30 replaces the in-play ESC menu with a fixed menu bar at the right
end of the input row (owner, 2026-10-22 and 2026-10-31; mockups 30a-1,
30a-2 and 30a-4 approved the same day). Step 30a builds the bar, the
Panes and Exit popups, the `#` commands and the Disconnected notice; the
ESC menu stays until 30f.

## Decision

- **Where:** `src/menubar/`, plain DOM in the cockpit chunk (no Preact),
  so the bar paints with the cockpit and a click never waits for a chunk.
  The App builds it (`AppOptions.ui.bar`) in place of the clock strip: the
  bar takes the input pane's `clockEl` and holds it.
- **Devices:** desktop and tablet. The phone keeps today's row (clock
  strip, `☰`) and the corner fullscreen button. A tablet keeps `☰` after
  the bar until 30f. The corner button (ADR 0097) is now phone only.
- **Layout on the cell grid:** clock 8 cells (gutter, 5-cell time, a
  2-cell SVG sun or moon in the clock's colours), link dot 1, separators 1,
  icons 2.5 cells each. The bar's width is rounded up to whole cells
  (26 with fullscreen, 24 without), so the input field stays on the grid.
  Two separators: `CLOCK | PROFILE SCRIPTS PANES SETTINGS | FULLSCREEN
  EXIT`. Sizes scale with the terminal font.
- **Look:** the mockups' ghost look (`src/menubar/menubar.css`): grey
  stroke icons lit on hover, Exit red. On a light terminal (`isLight`)
  the bar sets `data-light` and its greys and hover tint flip. Popups and
  tooltips stay dark panels on every background.
- **Tooltips** are drawn by the bar (`tooltip.ts`), not `title`: they show
  after 350 ms, hide on leave or press, and re-read their text on every
  clock render and status change, so the countdown and the RTT are live.
  A popup button's tooltip is off while its popup is open.
- **Link dot** (`status-text.ts`): off on a good link; yellow while the RTT
  is suspect; red while connected with no RTT 10 s after login, or after a
  live connection dropped; never for a replay or the offline modes. With
  the dot hidden the capture state (not `idle`) goes in the clock's
  tooltip.
- **Popups** (`popup.ts`): one at a time, `position: fixed` in the cockpit
  element at z-index 260 (above floating panes), right edge on the bar's
  end (as the mockups) and moved left to cover their icon, kept inside the
  viewport, re-placed on resize. A click on the icon toggles; Esc in the
  popup, the Panes X, and Esc in the input (after the scrolled-back rule)
  close. They close when the ESC menu opens and when the cockpit is
  hidden. A popup carries `data-wc-own-keys`: the input pane's document
  key and click routing leaves everything inside it alone, as for another
  text field. A mouse down in a popup gives the popup the focus. The Exit
  popup takes the focus when it opens (so `#exit` from a macro can be
  answered by key); the Panes popup only after a click in it.
- **Panes popup:** built-in panes in `PANE_IDS` order, then the running
  script panes under "Script panes"; a row flips `settings.panes[id].on`;
  Reset layout confirms inline and does what Options → Reset layout does.
  Rows update in place while open, keeping the focused row.
- **Exit popup:** ExitConfirm's rating rules re-implemented in plain DOM
  (`anchor()`, `chain()` prefill unless already touched, `saveChain`
  before the exit, a failed save still exits). Keys: Y, Esc, 0–5, ←→.
- **Interim targets:** Profile, Scripts and Settings open the ESC menu at
  the profile editor, Options → Scripts and Options
  (`EscMenuHandle.open({ target })`). `nav.pop()` on a root frame now
  calls the stack's `onRootBack`, so Esc or Back on that frame closes the
  menu. `ProfileEntry` is the root frame that loads the editor and closes
  the menu once the editor is left.
- **Commands:** `#profile`, `#scripts`, `#panes`, `#settings`,
  `#fullscreen`, `#exit` are client commands in `EXACT_ONLY`, so no tt++
  abbreviation changes (checked over every prefix of every command). They
  have `#help` sections, since a macro may bind them. Without the bar
  (the phone) `#panes` and `#exit` open the ESC menu at Options → Panes →
  Appearance and Exit session; `#fullscreen` toggles or says the browser
  has none.

## Consequences

- The input field loses 16–18 cells to the bar on desktop.
- Until 30f there are two ways to most things (bar and ESC menu); the ESC
  menu's frames are reused as the interim targets.
- 30c's Settings popup and the pane gear build on `popup.ts` and the
  `.wc-pop` styles.

## Addendum (2026-10-31, stage 30b)

The interim targets for Profile and Scripts are replaced by windows (ADR
0103) where the bar exists: the bar's icons and `#profile` / `#scripts`
toggle the Profile and Scripts windows, and the ESC menu's Profile and
Options → Scripts open them and close the menu. The phone keeps the
interim targets (`openMenuAt('profile' | 'scripts')`). Settings keeps its
interim target until 30c. Esc in the input now reaches the topmost window
after the open popup, and in the cockpit's fullscreen it ends at the Exit
popup instead of the ESC menu (ADR 0103). The Exit popup can show a
warning line about unsaved changes in a window.

## Addendum (2026-10-31, stage 30c)

Settings is no longer an interim target where the bar exists: the
Settings icon and `#settings` toggle the Settings popup (ADR 0107). The
popup is drawn by the chrome chunk and adopted by the bar as its open
popup (`MenuBar.adopt` / `release`), so the one-popup rule, Esc in the
input, the ESC menu and hiding the cockpit close it like Panes and Exit;
the Settings icon is marked and its tooltip off while it is open. The
phone keeps the interim target (the ESC menu at Options), and Options →
Panes → Appearance is phone only, so `#panes` without the bar still opens
it.

## Addendum (2026-10-31, stage 30c round 1)

ADR 0108 changes the popups' focus rule: every bar popup takes the focus
when it opens (Panes on its first row, Exit on its panel, as before), by a
click, a `#` command or a macro; Tab wraps inside it, Page Up/Down never
reach the game, and a click on a control keeps the keys in it. The bar's
icons and the Reconnect button are out of the Tab order, and Tab in the
game input never moves the focus.

## Addendum (2026-11-01, stage 30f)

The ESC menu is gone where the bar exists (ADR 0112). "A tablet keeps `☰`
after the bar until 30f" is over: `☰` is phone only. The popups no longer
close "when the ESC menu opens", since it never opens beside the bar; they
close on another popup, Esc in the input, the cockpit being hidden and the
bar's disposal (`MenuBar.reset` is private). Esc in the input ends after
the Exit popup in fullscreen, with nothing. The interim targets
(`openMenuAt`) are the phone's only: the shell no longer hands
`ui.openMenuAt` to an App with the bar.

## Addendum 2026-11-01: the clock as a ghost sun in a time-left ring (stage 31a)

The owner picked mockup I2 "Spöksol" (`notes/research/clock-mockups/`,
`Clock31a-ghostsun.dc.html`). The bar's clock is now
`src/menubar/bar-clock.ts` (`BarClock`); the text strip
(`src/ui/clock-strip.ts`) stays on the phone and wherever there is no bar,
unchanged, and loses its `svg` mode.

- **No countdown text in the bar.** An icon only: by day a line-drawn sun
  like the bar's other icons (circle r 3.4 and 8 rays 5.9–7.9 from 12
  o'clock, stroke 1.5), by night a filled crescent (circle (11.4, 12.6) r
  6.4 minus circle (14.6, 9.4) r 5.2, one path), inside a time-left ring
  (r 11, stroke 1.35, round caps) in a 24-unit box. The svg is as tall as
  the cell in a 2-cell slot, centred on the bar.
- **The ring** is the part of the period left, `(at − now) / (at − from)`
  (`periodLeft`): full as the period begins, it vanishes clockwise from 12
  o'clock; the arc left is an explicit path (`ringPath`) from the current
  point clockwise to 12 o'clock, a full circle as two arcs. `Transition`
  gained `from`, the start of the current period, computed in
  `nextTransition` at the same precision as `at` (after midnight the night
  began the evening before, in the month before on the 1st). Re-rendered
  just after each second boundary while a ring is shown, as before.
- **Synced to the minute:** the ring as above; tooltip unchanged
  (`Night in 4:33`).
- **Synced to the hour only:** the same ring, counted from the start of
  the game hour (it steps once a game hour, as `~N` does), and a grey `~`
  after it (T1) in the bar's icon grey, the terminal font at 0.87 of its
  size, nudged 0.1 cell left and 0.04 cell up so it sits optically on the
  ring's centre line. Tooltip unchanged (`Night in ~6 game hours`).
- **Not synced** (`unset` or `day`: no countdown exists): no icon; the slot
  keeps its width and the tooltip `Game clock unknown: type time` (U2).
  Hovered, a faint dashed circle (`#333` on dark) shows where the clock is.
  No timer runs. Nothing else lights on hover; a click does nothing.
- **Widths:** the clock is 3 cells (a one-cell gutter to the input text
  and the 2-cell ring), 4 with the `~`. The bar is therefore 21 cells with
  fullscreen and 19 without (22 and 20 while approximate); `barCells`
  takes the approximate flag, and `BarClock` reports a width change
  (`onCells`) so the bar re-sizes and tells the cockpit. The link dot stays
  a cell right after the clock: the mockups left it out, so the gap from
  the ring to the separator is the dot cell plus half a separator (about
  1.5 cells), as with the stage 30 clock.
- **A narrower bar moves the input row's case** (ADR 0102): 5 cells fewer
  for the bar leave 5 more to type, so a game column 5 cells narrower than
  before still keeps the input row (the wide case).
- **Colours** (`--mb-clk-*` in `menubar.css`). Dark terminal: day ring
  `#d9a54a`, sun `#e0a336`, night ring and moon `#5b93d6`, the not-synced
  circle `#333`. Light terminal (`data-light`): day ring `#8f5f0c`, sun
  `#94600a`, night ring and moon `#2a64a8`, the circle `rgba(0, 0, 0,
  0.22)`. On `#f4ecd8` they reach about 4.7:1 (day) and 5.1:1 (night),
  about 5.5:1 and 6.0:1 on white; the dark ones are 9.4:1 and 6.6:1 on
  black. The light shades are the dark ones' hues, darkened until they
  clear 4.5:1 on `#f4ecd8` and white.
