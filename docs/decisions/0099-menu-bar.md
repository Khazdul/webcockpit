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
