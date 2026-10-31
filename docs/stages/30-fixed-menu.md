# Stage 30 — Fixed menu

Status: **Next**. Spec agreed with the owner 2026-10-31 (below); build
starts with 30a.

## Goal

Play and change settings at the same time. A fixed menu bar right of the
input field replaces the ESC menu in play. Every in-game setting is
reachable from the bar or from the pane it belongs to, and changes apply
live while the game keeps its keys. In the end the ESC menu goes away on
desktop and tablet.

Later, outside this stage: the start page's Options goes away except
Scripts, and the start menu gets **Scripts** in Options' place. The
phone gets its own follow-up stage.

## History

- 2026-10-22: owner request (bar in the clock's place: clock, Profile,
  Panes, Settings, Menu, Exit) and five aesthetic mockups on the owner's
  canvas https://claude.ai/artifact/Bap2VJPNro2qcKTDrXXmaj. The source is
  in `notes/research/fixed-menu-mockups/`.
- 2026-10-31: owner brief (remove the ESC menu; settings on the panes;
  movable windows; Statistics pane; Spotlights settings), and a question
  session. Everything below comes from that session. Items marked
  *(Claude)* are technical defaults chosen without the owner. Each one
  becomes an ADR when it is built.

## Spec

### S1 Menu bar

- **Place:** the right end of the input row, where the clock strip is
  today, left of any right-docked panes. One cell high.
- **Contents, left to right:**

      CLOCK · link dot | PROFILE  SCRIPTS | PANES  SETTINGS | FULLSCREEN  EXIT

  The MENU button from the 2026-10-22 brief is dropped, because the ESC
  menu goes away.
- **Look:** mockup 2, *Ghost icons*. Thin dark-grey stroke icons
  straight on black, lit on hover. Always visible but quiet; the clock
  is always fully readable. Exit turns red on hover. The popups (S3–S5)
  share this look. The 2026-10-22 icons are placeholders, so the icons
  are drawn anew.
- **Clock:** the clock strip as today (countdown and ☼/☾). Clicking it
  does nothing. The tooltip explains it, e.g. `Night in 4:33`.
- **Status in tooltips** (the ESC menu header today):
  - Profile icon: `Profile: <name>`.
  - **Link dot:** a small dot next to the clock, coloured as today's
    `Link:` text (dim when fine, yellow when suspect, red when unknown).
    Its tooltip reads `Link: 38ms` plus the capture state when recording.
- **Notices** (`Update: …`, `Storage: not saved`) stay in the input row,
  left of the bar, as today.
- **Fullscreen:** on every device that has page fullscreen. Where the bar
  exists, it replaces the corner button from ADR 0097. The corner button
  stays on the phone until the phone stage.
- **Keyboard:** no default keys, because they would clash with macros.
  The client commands `#profile`, `#scripts`, `#panes`, `#settings`,
  `#fullscreen` and `#exit` open or toggle the same things, and a macro
  can bind any of them. `#menu` keeps working while the phone still has
  the ESC menu. On desktop it only prints a hint naming the new commands
  *(Claude)*.

### S2 Esc, focus and disconnects

- **Esc** closes the topmost open popup or window. With nothing open, Esc
  does nothing beyond what it already does in the input: jump to the
  bottom of scrolled-back text. Order, when the input has focus: scrolled
  back → bottom; else the topmost popup; else the topmost window
  *(Claude)*. Inside a window, the window's own Esc layers (close search,
  leave Help, the unsaved-changes prompt) come first.
- **Focus follows clicks**, as in a desktop window system. Keys go to
  what was clicked last. A click in the game text or the input field
  gives the keys back to the game. The window with focus has the brighter
  rim; the others are dimmed *(Claude)*. The popups (S3–S5) take keys
  only after a click inside them.
- **Disconnected:** a clear, clickable notice in the input row, left of
  the bar: `Disconnected — Reconnect (Enter)`. Enter in an empty input
  field reconnects. The notice disappears once connected. The rule that
  some disconnects never auto-open the menu (shell.ts) becomes: those
  disconnects still show the notice, but Enter does not reconnect from
  them *(Claude)*.

### S3 Exit

- A small popup rises above the Exit icon, in the bar's look:
  `Exit to main menu?`, then the star row `Rate & save this run` (only
  when there is a run to rate), then `Y Exit · Esc Cancel`. Buttons and
  stars are clickable.
- Same rating behaviour as today's ExitConfirm (Inv §4.6, ADR 0018).

### S4 Panes popup

- Rises above the Panes icon. One row per pane with a show/hide control.
  The built-in panes come first (Statistics included, S7), then the
  running script panes.
- **Reset layout** at the bottom, with a confirmation.
- No tint, border or background controls; the pane's hover buttons have
  those (ADR 0095). Options → Panes → Appearance (the grid) goes away.

### S5 Settings popup

- Rises above the Settings icon, anchored to it. It cannot be moved or
  resized; its size fits its content. It stays open while you play, and
  closes on Esc, its X, or a click on the icon. Only one bar popup is open
  at a time.
- **Modern controls** (dropdowns, sliders, toggles) in the bar's ghost
  look, not TUI rows. Live: every change goes straight to the settings
  store (ADR 0010).
- **Tabs:**
  - **Appearance:** font, size, padding, font colour, background, input
    colour, bold brightens, scrollback, ANSI palette, reset palette, and
    reset appearance, with a live preview.
  - **Text input:** auto-clear, autosuggest, cursor style, cursor blink.
  - **Mapper:** the same component as the map pane's gear (S6).
  - **Weather effects:** the master switch, the categories, and blue day
    sky.

### S6 Pane settings (gear)

- Mapper, Communication, Timers and Group get a **gear** as the leftmost
  hover button: Gear, Colour, Border, Background, ×. It follows ADR
  0095's hover rules: it is dropped first when the pane is narrow, and it
  is not shown on the phone.
- The gear opens the pane's settings in a popup beside the pane. It is
  anchored there and cannot be moved or resized. It uses the same modern
  controls and the same open/close rules as S5.
- Contents: what Options → Panes → Timers / Communication / Group and
  Options → Mapper hold today.
- Mapper is reachable both here and in Settings → Mapper. Communication,
  Timers and Group are reachable only from their pane. To change them,
  show the pane first with Panes (S4).

### S7 Statistics pane

- The live Statistics view becomes a built-in pane, like Comm or Char.
  It is hidden by default and shown from Panes (S4).
- **Adaptive layout:** a wide pane looks like today. A narrow pane stacks
  the tables and scrolls; the sparklines and the XP ruler shrink or drop.
- **No run in progress:** the latest run of this tab, marked
  `Run ended`. Before any run it shows `No run yet`.
- History → STATS (the archived chain) stays a full-page frame on the
  start page.

### S8 Windows: Profile and Scripts

- **Profile** opens the active profile's editor (Lite / Editor / Help),
  with live apply, as ESC → Profile does today. You switch and manage
  profiles on the start page, as today.
- **Scripts** opens what Options → Scripts holds today.
- **Window frame:** a rim in the panes' look (framed pane borders), cyan
  tint kept, with the title in the nameplate and an **X** at the top
  right. It is movable (drag the title bar) and resizable (the whole
  border cell, as framed panes, stage 29 round 4). The background is
  opaque terminal background, not glass.
- Both windows can be open at once; a click raises one above the other.
- **Remembered:** position and size per window, across reloads, always
  kept fully on screen. This is global, not per profile *(Claude)*.
  Moves and resizes snap to whole cells, there is a minimum size, and a
  screen too small for the window makes it fill the screen *(Claude)*.
- **Closing with unsaved changes:** X and Esc ask Apply / Discard /
  Keep editing, as Esc does today.
- **Lite view:**
  - It fills the window width. The entry list keeps a moderate width;
    the detail panel takes the rest, so the Pattern and Commands boxes
    grow wider, and Commands also takes the remaining height.
  - The hints panel goes away (Help explains). The short key row at the
    bottom stays.
- The windows' content stays TUI (cell grid), as today.

### S9 Spotlights (start page)

- **Options → Spotlights goes away.** Its settings move into the reel: a
  **gear in the reel's control box** (shown when the pointer moves). It
  opens a settings popup, and a change rebuilds the reel at once. This
  reverses the 2026-09-29 "no gear" decision for this purpose only.
- **Settings:**
  - **Kinds:** Achievements, Deaths, Level-ups, PvP kills (as today).
  - **Characters:** `All characters` (on by default) or a checked
    subset. The list comes from the characters in recorded runs. A new
    character is included automatically only while `All` is on.
  - **Period:** All time, Last year, Last 3 months, Last month, Last
    week.
- **Credits** follows all three filters and has no settings of its own.
- **Empty states:** when the filters leave nothing to show, the
  "filtered" page offers the settings directly instead of pointing to
  Options → Spotlights. The texts change to match *(Claude)*.

### S10 What goes away, and when

- **ESC menu (in play), on desktop and tablet:** removed in the last
  step, once S1–S8 exist. Continue → gone (nothing blocks play).
  Reconnect → S2. Statistics → S7. Profile → S8. Options → S4–S6 and
  Scripts → S8. Exit → S3.
- **Start page Options:** unchanged in this stage, apart from Spotlights
  (S9). Until it is replaced, the old TUI frames and the new popups both
  exist; that double upkeep is accepted.
- **Phone:** keeps `☰`, the ESC menu and the corner fullscreen button
  until its own stage. iPads and tablets get the bar like desktop.

## Steps

Each step ends with a test in the browser.

| Step | Contents |
|---|---|
| 30a | Refined mockups in the ghost look: bar, Panes, Settings, the window frame. Owner approves. Then build the bar with clock, link dot and tooltips; Panes popup; Exit popup; Disconnected notice; fullscreen; `#` commands. The ESC menu still exists. |
| 30b | Window frame (move, resize, focus, z-order, memory). Profile and Scripts as windows; Lite view width; hints removed. |
| 30c | Settings popup (modern controls, four tabs); gear on Mapper, Comm, Timers, Group. Options → Panes → Appearance removed. |
| 30d | Statistics pane (adaptive layout, latest run). |
| 30e | Spotlights settings in the reel (kinds, characters, period); Credits follows; Options → Spotlights removed. |
| 30f | ESC menu removed on desktop and tablet; Esc behaviour per S2; `#menu` hint; docs (spec §2.6, manual). |

## Open questions

- 30a: icon designs and the popups' exact look. They are settled on the
  refined mockups.
- Later stage: the phone's version of the bar, and the start page's
  Options → Scripts.

## Tasks

- [x] Five aesthetic mockups (2026-10-22).
- [x] Spec and decisions with the owner (2026-10-31).
- [x] 30a refined mockups (ghost look), six artboards (2026-10-31).
- [ ] 30a owner approval of the mockups.
- [ ] 30a build.
- [ ] 30b.
- [ ] 30c.
- [ ] 30d.
- [ ] 30e.
- [ ] 30f.

## Test guide

Written per step when it is built.
