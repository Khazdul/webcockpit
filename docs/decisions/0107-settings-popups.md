# 0107 — Settings popups and the modern control kit

- Status: Accepted
- Date: 2026-10-31
- Related: stage 30 (`docs/stages/30-fixed-menu.md` S5, S6, S10, "30c
  build plan"), ADR 0010 (one settings store, live), ADR 0095 (pane
  buttons), ADR 0099 (menu bar and popups), ADR 0103 (windows)

## Context

Stage 30 lets the user change settings while playing. Step 30c replaces
the bar's interim Settings target (the ESC menu at Options, ADR 0099) with
a Settings popup above the Settings icon, built from modern controls
(dropdowns, sliders, toggles) in the bar's ghost look (mockup 30a-3), and
adds a gear popup on the Mapper, Comm, Timers and Group panes (S6, part 2
of the step). Options → Panes → Appearance goes away where the bar and the
pane buttons hold what it did. The TUI pages on the start page stay; the
double upkeep is accepted (S10).

## Decision

- **Where:** a Preact surface in the chrome chunk
  (`src/chrome/popups/surface.tsx`, `mountSettingsPopups`), like the
  windows: the content needs the chrome's services (map store, settings,
  cells) and helpers (`backgroundPatch`, `colorChoices`, `chooseTileset`,
  map import), which would otherwise grow the cockpit chunk and the HTML
  replay bundle. The chunk is loaded on `/` and prefetched in the offline
  modes. The shell mounts the layer on first use in the App's element,
  beside the bar's own popups (`.wc-popups-host`, no stacking context of
  its own, so the popup stands at the bar popups' z-index 260). Desktop
  and tablet only.
- **One popup at a time, held by the bar:** the surface draws one popup at
  a time and, when it opens, hands it to the menu bar (`MenuBar.adopt({
  key, el, close })`; keys `settings`, `pane:<id>`). The bar closes its
  own Panes or Exit popup then, and from then on closes the adopted one
  for every reason it closes its own: another popup opening, Esc in the
  input (after the scrolled-back rule, before the topmost window), the ESC
  menu opening, the cockpit being hidden, the bar's disposal. That close
  does not report back. When the popup closes itself (its X, Esc in it,
  its toggle) the surface tells the bar (`release(key)`). The Esc order in
  the input is therefore unchanged: scrolled back → bottom; else the open
  popup; else the topmost window; else the Exit popup in fullscreen or the
  ESC menu.
- **Toggle:** the Settings icon's click and `#settings` call the App's
  `ui.toggleSettings` (the shell's `toggleSettings`), which loads the layer
  and toggles the popup; the icon no longer closes the open popup first,
  since the adoption does that. The icon is marked `is-open` and its
  tooltip is off while the popup is open, as for Panes and Exit. Nothing
  opens while the ESC menu is open. Without `toggleSettings` (the phone,
  tests) the old target stays: the ESC menu at Options.
- **Placement:** the caller's `place(panel)`; for Settings the bar's
  `placePopup` over `MenuBar.anchor('settings')` (right edge on the bar's
  end, moved left to cover the icon, inside the viewport, `max-height` and
  an inner scroll of the body when the room above the bar is short). The
  panel places itself again on a window resize, a resize of itself
  (ResizeObserver, in the next animation frame) and every settings or cell
  change (the font moves the bar). Not movable or resizable.
- **Size:** `.wc-pop` font (13/15 of the terminal font), so it scales like
  the bar. The Settings popup has one width (the mockup's 452 px at a 15 px
  font, 34.77 em) and draws all four tab pages in one grid cell, only the
  chosen one visible (`visibility: hidden`, `aria-hidden`): its height is
  the tallest page's, and a tab switch never moves it. The palette's hex
  row keeps its room while no colour is chosen, so choosing one does not
  move it either. The last tab chosen is kept while the page lives (not
  stored).
- **Slider hold:** while a slider is pressed, the panel pins its computed
  font size and skips placement; on release it drops the pin and refits.
  A Size drag would otherwise rescale the slider under the pointer.
- **Keys and focus** (`src/chrome/popups/panel.tsx`): the panel carries
  `data-wc-own-keys` (ADR 0099), so the input pane leaves its keys and
  clicks alone. It never takes the focus when it opens. A mouse down in it
  is `preventDefault`ed (no text selection, no native focus) and focuses
  the control pressed, or the panel; a text field (the hex field) takes
  the focus itself. A press sets `data-pointer`, which hides focus rings
  until a key is used. A click in the game text or the input gives the
  keys back without closing it (the input pane's routing, as for Panes).
  Esc in it closes it and gives the input the focus; a control's own Esc
  comes first (an open dropdown list). Tab and Shift+Tab wrap inside it;
  hidden pages' controls are not tabbable.
- **Control kit** (`src/chrome/popups/controls.tsx`, `popups.css` on top
  of `.wc-pop`): `Row` (label, help line, dim), `Toggle` (`role=switch`),
  `Segmented` (radiogroup, roving tab stop, ←→), `Slider` (drawn, not
  `<input type=range>`: pointer capture and `touch-action: none`, ←→↑↓,
  PageUp/PageDown, Home/End, `onHold`), `Dropdown` (a button and a
  `listbox` with `aria-activedescendant`; the list is `position: fixed`
  inside the panel's DOM, below the button or above when there is more
  room, not clipped by the inner scroll, closed by a press outside, a
  scroll outside the list or a resize; swatches in options), `SwatchGrid`
  (eight a row, arrow keys), `GhostButton` and `Tabs` (tablist, ←→). Dark
  panels on every terminal background, as the bar's popups.
- **Appearance tab:** the TUI page's settings and behaviour: font
  (`fontChoices`, shown as `effectiveFont`), size and padding sliders with
  the existing bounds and step, font colour and background (`colorChoices`
  order with names capitalised; an off-palette value is the first option,
  shown by its hex, and stays until another is chosen), background through
  `backgroundPatch`, input colour (swatch from `inputColor`), bold
  brightens, scrollback (`SCROLLBACK_CHOICES`, a stored value outside them
  kept), the 16-colour ANSI palette, Reset palette (the background theme's
  palette or DOS) and Reset appearance (the defaults, no confirmation, as
  the TUI page), with a short note after each reset. A swatch click opens
  the browser's colour picker (a hidden `<input type=color>` laid over the
  swatch, `showPicker()` or `click()`; its `input` events apply live) and
  shows a hex field for that colour: a full `#rrggbb` applies as typed,
  `#rgb` on Enter or when the field is left, anything else marks the field
  and keeps the colour. A small preview draws the TUI page's sample lines
  in the terminal's font, colours and background, the bold orc through the
  renderer's classes so Bold brightens shows.
- **Text input tab:** auto-clear, autosuggest, cursor style (Block, Bar,
  Underline for `block`, `beam`, `underline`) and cursor blink.
- **Mapper:** one component (`src/chrome/popups/mapper-settings.tsx`) for
  Settings → Mapper and the map pane's gear popup: show map pane, room
  notes, room info on hover and hover text size (segmented), tileset (its
  credit and season under the label), background colour (a checkerboard
  swatch for Transparent), the map file line (name, rooms, size, imported
  date), Import map file… and Use bundled map, with a note line for the
  result. Its logic lives in `src/chrome/mapper-model.ts`, shared with the
  TUI page.
- **Weather effects tab:** the master switch (its help says when the
  browser lacks OffscreenCanvas), the categories with their help texts
  (`WEATHER_ROWS`) and Blue day sky indented under Sky. Rows dim while the
  master switch (or, for Blue day sky, Sky) is off, and still work, as on
  the TUI page.
- **Live:** every control writes the settings store at once (ADR 0010);
  the popups follow the store, so a change made elsewhere shows.
- **Gear popups (the hook for part 2):** `toggle({ pane }, place)` opens a
  pane's gear popup from `GEAR_POPUPS` (title and content by pane id; only
  `map`, the Mapper component, is there now) through the same surface and
  rules; a pane without an entry opens nothing. The shell's
  `togglePopup(target, place)` loads the layer and toggles; the gear
  button, the placement beside the pane, the Comm, Timers and Group
  contents and the close when the pane is hidden come with part 2.
- **Options → Panes → Appearance** is phone only (`device().phone`) on the
  start page and in the ESC menu: on desktop and tablet the Panes popup
  (show and hide, Reset layout) and the pane buttons (colour, border,
  background, ADR 0095) hold what it did, and the Panes hub starts at
  Timers. The phone keeps it, and `#panes` there still opens it.
- **`#settings`:** toggles the popup where the bar exists; on the phone it
  opens the ESC menu at Options. Its `#help` text says both.

## Consequences

- Settings can be changed while playing without covering the game; the
  ESC menu's Options is no longer the bar's target.
- Two ways to the same settings remain (the popup and the start page's
  TUI pages) until the start page's Options is replaced (S10).
- The chrome chunk carries the control kit; the cockpit chunk only gained
  `adopt`, `release` and `anchor` on the bar.
- The native colour picker is a browser window: while it is open it takes
  the keys, so the hex field is used after it is closed.
- The script manual names the Panes box and the pane buttons where it
  pointed to Options → Panes → Appearance.

## Addendum: the gear popups (30c part 2, 2026-10-31)

- **Opening:** the pane's Gear (ADR 0095 addendum) calls the App's
  `ui.togglePaneSettings(id)`, the shell's `togglePaneSettings`, which
  toggles `{ pane: id }` through `togglePopup` (nothing while the ESC menu
  is open). The menu bar adopts it as `pane:<id>`, so the one-popup rule
  with Panes, Exit and Settings, Esc in the input, the ESC menu and
  hiding the cockpit close it like the others. The surface's
  `onChange(key)` reports every open and close, whoever closed it; the
  shell marks the Gear with it (`Cockpit.markGear`).
- **Placement** (`besidePlace` / `placeBeside`, `src/menubar/popup.ts`):
  beside the pane's box, top-aligned with it, 6 px from it, on the side
  toward the game column (the side the game pane's centre is on) when the
  popup fits there, else on the other side. With room on neither side (a
  wide pane in the top or bottom dock) it lies over the pane, one row
  below its top edge (the title row and its Gear stay free), on the game
  side. Always inside the viewport (4 px margin): moved up when the pane
  is low, capped in height (`max-height`, the body scrolls) when the
  screen is short. A floating pane is treated the same. Placed again on
  every cockpit layout (pane moves, dock resizes, a float dragged or
  dropped, the window resized) and on the panel's own triggers.
- **Close when the pane is gone:** after every cockpit layout the shell
  runs `followPane`: an open gear popup whose pane is no longer shown
  (`Cockpit.isShown`: hidden by its cross, the Panes popup, a setting,
  Reset layout, the Map popup's own Show map pane, a script; removed; the
  window too small) closes, reported to the bar; the input gets the focus
  back when it was in the popup. Hiding the cockpit closes it through the
  bar.
- **Contents** (`src/chrome/popups/pane-settings.tsx`; semantics shared
  with the TUI pages in `src/chrome/pane-options-model.ts`, which those
  pages now use too):
  - **Map:** the Mapper component (as Settings → Mapper).
  - **Comm:** a `Channels` subheading, the ten channels in the fixed
    order, each a row with a swatch in the channel colour (grey when
    off), the label and a toggle; a click anywhere in the row toggles it.
    Then a hairline and Show channel header. The filters stay sparse; the
    Comm pane cancels its solo when they change from outside it, as for
    the TUI page. 250 px at a 15 px font (mockup 30a-5).
  - **Timers:** a grid, one row per group (`TIMER_GROUPS`) under the
    headings Colour, Cols, Clock, Bar: a colour dropdown with Off first
    and the seven colours with their swatches (Off hides the group and
    keeps its colour, as unchecking the TUI grid's swatch; the row dims,
    its controls still work), a `Stepper` for the column cap within
    `TIMER_COLS_MIN`..`timerColsMax(group)` (Charmies 1–2), and Clock and
    Bar toggles (none for Charmies). Then Display headers and Compact
    layout.
  - **Group:** Show players, NPC visibility (segmented Off, Labeled,
    All).
- **Stepper** (control kit): `‹ N ›`, `role=spinbutton` with its value
  and range, one tab stop; ←↓ and ‹ step down, →↑ and › up, Home/End
  jump; the arrow at an end is dimmed.
- **Sizes:** each gear popup has its own width (Map 31 em, Comm 19.23 em,
  Group 25 em, Timers 29.5 em at the popup font) and fits its content's
  height.
