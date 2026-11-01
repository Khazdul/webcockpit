# 0108 — Popup focus and Tab in the game

- Status: Accepted
- Date: 2026-10-31
- Related: stage 30 (`docs/stages/30-fixed-menu.md` S2, "30c round 1"),
  ADR 0063 (autosuggest), ADR 0099 (menu bar and popups), ADR 0103
  (windows), ADR 0107 (Settings and gear popups)

## Context

After 30c the owner found two things wrong with the keys (30c round 1):

- Tab in the game input moved the focus to the bar's icons and on to the
  browser's own controls, so the game lost its keys without a sign why.
- The Settings and Panes popups took the keys only after a click in them
  (ADR 0099, ADR 0107), while the Profile and Scripts windows take them
  when they open. A popup opened by `#settings` or a macro could not be
  used from the keyboard.

The owner decided that Tab does nothing by default, that popups take the
focus when they open, and that a mouse click on a control in an open popup
keeps the keys there; Esc or a click in the game gives them back.

## Decision

- **Tab in the game input** (`src/ui/input-pane.ts`): Tab and Shift+Tab
  never move the focus (the key is always consumed). A macro bound to the
  key runs first, as for every key; autosuggest's Tab takes the next word
  while a suggestion shows (ADR 0063); otherwise nothing happens. Ctrl, Alt
  and Meta with Tab are left to the browser and the system.
- **Out of the Tab order:** the bar's icons, the Disconnected notice's
  Reconnect button and the phone's corner fullscreen button get
  `tabindex=-1`. They are still clicked and announced. The pane buttons and
  the cross are `div role=button` without a tab stop already. The script
  panes' text fields keep their tab stops: they own their keys.
- **Stray focus:** Tab (or Shift+Tab) with the focus on the page's body, or
  on a control inside the shown App element that is not a text field
  (input, textarea, select, contenteditable) and not inside an element
  marked `data-wc-own-keys` (a popup, a window), only gives the keys back
  to the game input: no macro, no completion. The App passes that scope
  (`InputPaneOptions.scope`, null while the cockpit is hidden), so the
  start page and other views are left alone. A detached input handles no
  keys.
- **Popups take the focus when they open** (Panes, Exit, Settings, the gear
  popups), whatever opened them: a click, a `#` command or a macro.
  `focusPopup` (`src/menubar/popup.ts`) focuses the given element or the
  first tabbable control that is not the close cross: the Panes popup's
  first row, the Settings popup's selected tab, a gear popup's first
  control. The Exit popup focuses its panel, as before, so Y, Esc and 0–5
  answer it.
- **Keys in a popup** (`popupKey`, shared by the bar's `popupPanel` and the
  chrome's `PopupPanel`): Tab and Shift+Tab move through the visible
  tabbable controls and wrap, never leaving it (the panel itself counts as
  before the first). Page Up and Page Down scroll the Settings body (or the
  panel) when it scrolls and are swallowed otherwise, so the game text
  behind never scrolls; a control that takes them (a slider, a dropdown
  list) comes first. Space on the panel itself does nothing. Arrows, Enter
  and Space work the controls as before (Panes rows: ↑↓, Space/Enter).
- **Clicks:** a mouse down in a popup is `preventDefault`ed (no text
  selection) and focuses the control pressed, or the panel; a text field
  takes the focus itself (`pressPopup`). So a click on a Panes switch keeps
  the focus on that row. A click in the game text or the input gives the
  keys to the game and leaves the popup open (the input pane's routing, as
  before); a click in the popup takes them again.
- **Focus rings:** a popup opened by a press, or pressed, sets
  `data-pointer`, which hides its focus rings (`.wc-pop[data-pointer]
  :focus-visible`, and the Panes row highlight) until a key is used in it.
  `watchInput(doc)` tells a press from a key (window listeners in the
  capture phase, so a key a frame stack stops still counts). Opened from
  the keyboard (`#panes`, a macro) the ring shows at once.
- **Closing:** Esc in the popup (after an inner layer such as an open
  dropdown list), its X, or its icon or Gear close it and give the keys to
  the game input when the focus was in it. Another popup opening closes it
  and the new one takes the focus. Esc in the input still closes the open
  popup first (after the scrolled-back rule), then the topmost window
  (ADR 0103). A popup closed because its pane hid, the ESC menu opened or
  the cockpit hid gives the focus to the input when it held it; the ESC
  menu then takes it.
- **Windows** (ADR 0103) are unchanged, with one addition: when the focus
  lands in a popup outside the windows, the focused window lets go of its
  focus (dims, its frame stack stops taking keys), without moving the DOM
  focus. A press on a bar icon or a Gear already took the windows' focus;
  this covers a popup opened by other means. Closing the popup gives the
  keys to the game, not back to the window, as Esc does everywhere else.

## Consequences

- Tab is free for macros and autosuggest; the game never loses its keys to
  the browser's controls by Tab.
- Keys typed while the Settings chunk loads (the first `#settings`) still
  go to the game; the popup takes the focus once it is drawn.
- Keyboard users cannot reach the bar's icons by Tab; the `#` commands and
  macros reach everything the icons do.
- The e2e specs that expected the input to keep the keys after a popup
  opened now click in the game first (`tests/e2e/popup-focus.spec.ts` has
  the new rules).

## Addendum (2026-11-01, stage 30f)

"A popup closed because … the ESC menu opened": no longer a case where
the bar exists, since the ESC menu is gone there (ADR 0112). Esc in the
game input with nothing open does nothing on desktop and tablet.
