# Stage 30 — Fixed menu

Status: **In progress** (30d done; 30e built, owner test deferred; 30f built, owner test pending). Spec agreed with the owner 2026-10-31 (below); 30a
mockups approved the same day. Build starts with 30a.

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

      CLOCK (link dot) | PROFILE  SCRIPTS  PANES  SETTINGS | FULLSCREEN  EXIT

  Two separators only (owner, 2026-10-31 round 2).

  The MENU button from the 2026-10-22 brief is dropped, because the ESC
  menu goes away.
- **Look:** mockup 2, *Ghost icons*. Thin dark-grey stroke icons
  straight on black, lit on hover. Always visible but quiet; the clock
  is always fully readable. Exit turns red on hover. The popups (S3–S5)
  share this look. The 2026-10-22 icons are placeholders, so the icons
  are drawn anew. Scripts is a scroll, one connected shape (the first
  `{ }` read as two loose characters).
- **Clock:** the clock strip as today (countdown and ☼/☾). Clicking it
  does nothing. The tooltip explains it, e.g. `Night in 4:33`.
- **Status in tooltips** (the ESC menu header today):
  - Profile icon: `Profile: <name>`.
  - **Link dot:** hidden while the link is fine. It appears next to the
    clock only when the link deviates: yellow while lagging or frozen
    (today's suspect state), red when broken or unknown. Its tooltip
    reads e.g. `Link: 1.8s · lagging` plus the capture state when
    recording. With the dot hidden, the capture state goes in the clock's
    tooltip *(Claude)*.
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
  *(Claude)*. **Changed 2026-11-01 (30f round 1, owner):** with nothing
  open, Esc opens the Exit popup, as the Exit icon does. Inside a window, the window's own Esc layers (close search,
  leave Help, the unsaved-changes prompt) come first.
- **Focus follows clicks**, as in a desktop window system. Keys go to
  what was clicked last. A click in the game text or the input field
  gives the keys back to the game. The window with focus has the brighter
  rim; the others are dimmed *(Claude)*. The popups (S3–S6) take the
  keys when they open; Esc gives them back to the game (30c round 1,
  ADR 0108). Tab in the game never moves the focus.
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
- **Window frame:** set apart from the panes on purpose (owner,
  2026-10-31 round 2): a conventional, modern and sparse window, not
  the panes' glass rim. A thin cyan border, almost square corners, a
  slim title bar (title left, **X** right), a small resize grip in the
  bottom right corner. It is movable (drag the title bar) and resizable
  (any edge or corner). The background is opaque terminal background.
  The unfocused window has a dim border and title and dimmed content.
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

## 30a build plan

Scope: S1 (bar, clock, link dot, tooltips, fullscreen, `#` commands),
S3 (Exit popup), S4 (Panes popup, without the Statistics row, which
comes with its pane in 30d), the S2 Disconnected notice, and S2's Esc
rule for the popups. The ESC menu stays.

Technical decisions *(Claude)*, recorded as ADR 0099 (bar and popups)
and ADR 0100 (Disconnected notice):

- **Plain DOM in the cockpit chunk**, like the clock strip and the pane
  buttons, so the bar paints with the cockpit and a click never waits for
  a chunk. A small popup kit (`src/menubar/`) holds the shared ghost look
  that 30c's Settings popup and the pane gear build on.
- **Desktop and tablet only.** The phone keeps today's input row (clock,
  `☰`) and the corner fullscreen button. Tablets keep `☰` beside the bar
  until 30f, since the ESC menu is their only way to Profile and Options
  until then. Where the bar exists the corner fullscreen button is not
  installed.
- **Interim targets until 30b/30c:** Profile, Scripts and Settings (and
  their `#` commands) open the ESC menu straight at the profile editor,
  Options → Scripts and Options. Leaving that first frame closes the menu
  and returns to the game.
- **Keys:** Esc in the input closes the open popup (after the scrolled-back
  rule); with no popup it opens the ESC menu as today. The Exit popup takes
  the keys when it opens (Y, Esc, 0–5, ←→): it is a confirmation, and
  `#exit` from a macro must be answerable without the mouse. The Panes
  popup takes keys only after a click inside it.
- **Link dot:** yellow while the RTT is suspect; red while connected with
  no RTT 10 s after login, or after a live connection dropped. Never in
  the offline modes or during a replay.
- **Disconnected notice:** shown after a live connection drops (any
  reason the input's Enter reconnects from), hidden once connecting. Enter
  keeps today's rule (spec §2.2: the first command reconnects); the notice
  only states it. This keeps `#disconnect` → Enter working as today,
  rather than the spec's tentative "Enter does not reconnect from quiet
  disconnects".

## 30b build plan

Scope: S8 (Profile and Scripts as windows; the window frame; Lite view
width; hints removed) and S2's focus and Esc rules for windows. The ESC
menu stays (30f). Desktop and tablet only: the phone keeps the ESC menu
targets from 30a.

Technical decisions *(Claude)*, recorded as ADR 0103 (windows) and ADR
0104 (Lite view):

- **Where:** the windows are a Preact surface in the chrome chunk
  (`mountWindows`), since their content (profile editor, Scripts page)
  lives there; the chunk is prefetched at idle. Each window holds its own
  `FrameStack` on its own cell grid. The frame itself (border, title bar,
  X, grip, drag and resize) is the window kit, separate from the ESC
  menu's box.
- **Keys and focus:** a window's stack routes keys only while that window
  has focus, and never traps focus. A mouse down in a window focuses and
  raises it; a mouse down anywhere else (game text, input, a pane, the
  bar, a popup, the other window) takes its focus away. With no window
  focused, keys go to the game as before. Opening the ESC menu takes the
  focus from the windows.
- **Open and toggle:** the Profile and Scripts icons and `#profile` /
  `#scripts`: closed → open and focus; open but not focused → raise and
  focus; focused → close (as X). The ESC menu's Profile and Options →
  Scripts open the window too where the bar exists (the menu closes), so
  the same profile is never edited in two places.
- **Closing:** X and Esc on the window's root frame leave through the
  frames' own Esc layers (the editor's Apply / Discard / Keep editing,
  an open script editor's prompt), then close the window. Esc in the input
  field: scrolled back → bottom; else the open popup; else the topmost
  window (its close request focuses it if it prompts); else the ESC menu,
  as today.
- **Exit and leaving the cockpit:** the windows close with the cockpit.
  The Exit popup warns on a line of its own when a window has unsaved
  changes; those changes are discarded on Exit.
- **Geometry:** in whole cells on the cockpit grid. Default: about 80% of
  the screen, centred (Scripts one cell row and column offset when both
  are open for the first time). Minimum 60×18 content cells; a smaller
  screen fills the screen. Kept fully on screen on every viewport change.
  Stored per window in the settings store (global, not per profile).
- **Stacking:** above the panes (floating included), below the bar popups
  and tooltips and the ESC menu.

## 30c build plan

Scope: S5 (Settings popup, four tabs) and S6 (gear on Mapper, Comm,
Timers, Group, and their settings popups). Options → Panes → Appearance
goes away where the bar exists. The rest of the TUI Options (start page
and ESC menu) stays until later steps; the double upkeep is accepted
(S10). Mockups: 30a-3 (Settings) and 30a-5 (pane gear).

Technical decisions *(Claude)*, recorded as ADR 0107:

- **Where:** a Preact surface in the chrome chunk (`mountSettingsPopups`),
  like the windows: the content needs the chrome's services (map store,
  tilesets, font list) and helpers (`backgroundPatch`, `chooseTileset`,
  map import), which would otherwise grow the cockpit chunk and the HTML
  replay bundle. The chunk is prefetched at idle. A small modern control
  kit (toggle, segmented control, slider, dropdown, swatch, ghost button)
  in the bar's ghost look, shared by Settings and every gear popup, and
  built on the `.wc-pop` styles.
- **One popup at a time:** the Settings popup and the gear popups join the
  bar's popup rule: opening any of them closes the open Panes / Exit /
  Settings / gear popup. Esc order unchanged: the open popup is the first
  thing Esc in the input closes (after the scrolled-back rule).
- **Keys:** like the Panes popup, a Settings or gear popup takes the keys
  only after a click inside it; a click in the game text or the input
  gives them back without closing it. It closes on Esc (inside it, or in
  the input), its X, a click on its icon (Settings icon, the pane's gear),
  when the ESC menu opens, when the cockpit is hidden, and a gear popup
  also when its pane is hidden.
- **Size:** fits its content; the Settings popup keeps one width for all
  four tabs and the height of its tallest tab, so switching tabs does not
  move it. Text size follows the terminal font, like the bar; while a
  slider is held, the popup keeps its scale and refits on release (a Size
  drag would otherwise move the thumb from under the pointer). Kept inside
  the viewport, with an inner scroll when the screen is short.
- **Appearance tab:** as the TUI page: font, size, padding, font colour,
  background (with `backgroundPatch`), input colour, bold brightens,
  scrollback, the 16-colour ANSI palette (click a swatch: the browser's
  colour picker plus a hex field), Reset palette, Reset appearance, and a
  small live preview (the TUI page's sample lines).
- **Gear:** the leftmost pane hover button (Gear, Colour, Border,
  Background, ×) on `map`, `comm`, `timers`, `group`. ADR 0095's rules:
  not on the phone, dropped first when the pane is narrow. Its tooltip
  names the pane (`Comm settings`). The popup opens beside the pane, on the
  side with room (the game side first), top-aligned with the pane, kept
  inside the viewport, re-placed on relayout.
- **Mapper:** one component in Settings → Mapper and in the map pane's
  gear popup: show map pane, room notes, room info on hover, hover text
  size, tileset (with its credit), background colour, the map file (name,
  rooms, size), Import map file…, Use bundled map.
- **Comm, Timers, Group:** what Options → Panes holds today, as modern
  controls. Comm: the ten channels (swatch, label, toggle), Show channel
  header. Timers: per group its colour (or off), columns, Clock, Bar;
  Display headers, Compact layout. Group: Show players, NPC visibility.
- **Options → Panes → Appearance:** removed on desktop and tablet (start
  page and ESC menu), since the Panes popup and the pane buttons hold it.
  The phone keeps it until its own stage: it has neither, and `#panes`
  there still opens it.
- **`#settings`** and the Settings icon toggle the popup; the phone keeps
  the interim target (the ESC menu at Options).

## 30d build plan

Scope: S7 (Statistics pane) and its row in the Panes popup (S4). ESC →
Statistics and History → STATS stay as they are (S10: the ESC menu goes in
30f). Desktop and tablet; the phone keeps ESC → Statistics until its own
stage.

Technical decisions *(Claude)*, recorded as ADR 0109:

- **Pane id:** a new built-in pane `statistics` (label `Statistics`),
  last among the built-ins (`PANE_IDS`, Panes popup rows). Off by default
  (`on: false` for new and existing users; settings migration adds it
  without turning it on). Not on the phone (its tab layout and its
  Options → Panes grid leave it out) and not in the log player or the
  HTML replay bundle, which have no live runs.
- **Where it appears:** switched on without a place of its own, it opens
  as a floating pane, auto-placed in the game area (as the map's first
  float, ADR 0020), large enough for the wide layout when the screen
  allows (about 80×24 cells, clamped). The user can move, resize and dock
  it like any pane; that place is kept. Reset layout forgets it.
- **Rendering:** the pane (cockpit chunk) is the frame and a content
  host; the view is a Preact component in the chrome chunk (like the
  popups, ADR 0107), mounted into that host on first show through a
  mount hook the shell hands in. The cockpit chunk and the replay bundle
  do not grow with the stats view. The frame and the pane share one
  renderer: `StatsView`'s pieces (title rows, tables, totals, sparklines,
  ruler) are factored so both surfaces use them, with the same classes and
  colours. Pane buttons: Colour, Border, Background, × (no gear: nothing
  to set).
- **Keys:** none. A pane never takes the game's keys (S2). Mouse only: a
  click on a column title sorts (as today), the wheel and the scrollbar
  thumbs scroll the tables; in the narrow layout the wheel scrolls the
  pane. No footer and no `R` (the pane refreshes itself).
- **Adaptive layout** by the pane's cells:
  - **Wide** (room for the two columns at today's minimum table width):
    today's layout. KILLS / PvPs fit the height; the sparklines and then
    the ruler drop when the height is short, as in the frame.
  - **Narrow:** one column, in order ALLIES, ACHIEVEMENTS, KILLS, PvPs,
    each table full width with all its rows, then the sparklines (XP/h
    above TP/h) at the pane's width, then the ruler. The whole content
    scrolls. The sparklines drop below a minimum width, then the ruler.
  - The header shortens to fit (`◆ STATISTICS — Rasta · Lvl 42 · Run 1h
    10m`, then fewer parts).
- **Data:** the live run chain (`app.runs`), as the ESC frame: rebuilt on
  run events at most once a second, plus a 1 Hz tick for the running clock
  while a run is in progress. Nothing runs while the pane is hidden or
  not mounted. The rating stars as in the frame.
- **No run in progress:** the latest run of this tab (the run anchor,
  `LiveRuns.anchor()`), with `Run ended` in the header; kept in memory
  when the run is not recorded, so it does not blank when the run ends.
  Before any run in this tab: `No run yet`, centred.

## 30e build plan

Scope: S9 (Spotlights settings in the reel: kinds, characters, period;
Credits follows; the filtered empty states offer the settings; Options →
Spotlights removed). The start page's other Options stay (S10). This
reverses ADR 0032's "no gear" for the reel, for these settings only: the
viewer settings (panes, font, colours) stay out of the reel.

Technical decisions *(Claude)*, recorded as ADR 0110:

- **Settings shape:** `SpotlightSettings` gains `allCharacters: boolean`
  (default true), `characters: string[]` (the checked subset, kept while
  All is on, so turning All off brings it back) and `period: 'all' |
  'year' | '3months' | 'month' | 'week'` (default `'all'`). Global, not per
  profile. The migration fills the defaults (additive, no version bump);
  `characters` keeps non-empty strings only, without duplicates.
- **Filter** (pure, `src/share/spotlights.ts`): one predicate over kind ×
  character × moment (`logUs ?? us`), used by the reel's selection and by
  the Credits chronicle, with `now` passed in. Period: a rolling window back
  from now in local calendar terms (the same clock time one year, three
  months or one month ago; seven days for a week). Characters: all, or the
  checked names; a character not checked (a new one included) is left out
  while All is off.
- **Characters list:** `RunLibrary.characters()` (sealed runs,
  alphabetical; empty names dropped), read when the popup opens. A checked
  name no longer in the runs is not shown; the next character change
  writes only listed names. Turning All off when none of the remembered
  names is listed checks every listed character, so the reel does not go
  empty by surprise.
- **Popup:** a `spotlights` target in the settings popups' surface (ADR
  0107), the same `PopupPanel` and control kit in the ghost look: Kinds
  (four toggles), Characters (`All characters` toggle, then a list of
  checkboxes, dimmed and disabled while All is on, scrolling past about
  eight names; ↑↓ move in it), Period (a dropdown: All time, Last year,
  Last 3 months, Last month, Last week). A small `Check` control
  (`role=checkbox`) joins the kit. It follows ADR 0107/0108's rules: it
  takes the focus on open (the first toggle), Tab cycles inside, Esc, its X
  or the gear close it. Every change goes to the settings store at once.
- **Gear in the reel:** the control box gets the viewer's `⚙` cell at the
  end of its first row (ADR 0021's place and glyph rules), titled
  `Spotlights settings`; it toggles the popup, placed above the control
  box with their right edges aligned (the bar's `placePopup` with the box
  as the bar). The gear glows while the popup is open, and the chrome does
  not auto-hide then. The popup lives beside the player element, not in it
  (the player's pointer and wheel handlers and its recorded font size stay
  out of it); it closes with the player. The player leaves keys inside a
  `data-wc-own-keys` element to it; Esc with the popup open
  closes it first, then the reel. Closing gives the keys back to the reel.
- **Rebuild:** the reel subscribes to the store's `spotlights`; a change
  selects again over the runs read at open and reads only the windows not
  read yet (cached by spotlight id), then reopens the chain on the same
  player host (the old engine, App and view disposed). The current
  spotlight is kept, at the same offset into it, when it still passes;
  otherwise the reel starts from the first. Paused stays paused; parked at
  the end plays again. Changes in flight: the latest wins.
- **Empty while in the reel:** a change that leaves nothing stops the reel
  and the stage shows `No spotlights match your settings.`, a `Settings…`
  control and `ESC Back`; the popup stays open, and the next change that
  lets something through starts the reel again.
- **Empty states on the start page:** `no_data` (no event of any kind in
  any run) stays as it is. `filtered` (events exist, none passes) reads
  `No spotlights match your settings.` (Credits: `No chronicle entries
  match your settings.`) with a `Settings…` row (Enter, Space or a click)
  that opens the same popup, drawn inside the page so the start page's
  focus trap keeps it; the frame stack leaves keys whose target is inside
  a `data-wc-own-keys` element within the stack to that element. Footer
  `Enter Settings · ESC Back`; Esc closes the popup first. When the popup
  closes after a change, Spotlights tries again (the reel opens, or the
  page stays) and Credits builds the chronicle again (it rolls, or the page
  stays).
- **Credits** follows all three filters (`buildChronicle` takes the
  settings and `now`); no settings of its own.
- **Options → Spotlights** removed from the Options hub (start page and
  ESC menu) and its frame deleted, on every device where the reel's gear
  works by touch (checked on the phone in the build).

## 30f build plan

Scope: S10's first point and S2's Esc rule. Where the menu bar exists
(desktop and tablet, `ui.bar`), the ESC menu is gone: nothing opens it,
the shell never mounts it. The phone keeps `☰`, the ESC menu, its
auto-open on disconnect and the corner fullscreen button, unchanged. The
start page's Options stays as it is (S10). Every ESC menu entry already
has its replacement (30a–30d): Continue → nothing; Reconnect → the
Disconnected notice (ADR 0100); Statistics → the Statistics pane (ADR
0109); Profile → the Profile window; Options → Panes popup, Settings
popup, pane gears, Scripts window; Exit → the Exit popup.

Technical decisions *(Claude)*, recorded as ADR 0112:

- **Esc in the input** (desktop, tablet): scrolled back → bottom; else the
  bar's open popup closes; else the topmost window's close request; else,
  in the cockpit's fullscreen, the Exit popup (the owner's 30b request,
  ADR 0103, kept); else nothing. A focused popup or window handles its
  own Esc as today (ADR 0108). The phone's Esc still opens the ESC menu.
- **`#menu`** with the bar prints one system line naming the new ways:
  `The ESC menu is gone: use the menu bar, or #profile, #scripts, #panes,
  #settings, #fullscreen, #exit.` On the phone it opens the menu as
  today. `#help menu` and `#help` say the same.
- **Tablet `☰`:** removed. Only the phone (`device().phone`) gets the
  menu button; a tablet uses the bar by touch.
- **Disconnect:** unchanged from ADR 0100 (the notice on bar devices, the
  auto-open on the phone).
- **Dead paths removed** where they only served the ESC menu beside the
  bar: the ESC menu's `openWindow` (Profile and Options → Scripts opening
  the windows), the windows' blur and the bar's popup reset when the menu
  opens, `ui.openMenuAt` on bar devices (the bar never calls it), and
  their comments. Where the code is shared with the phone or the start
  page, it stays.
- **Chrome loading:** `?bench` and the offline modes load the chrome
  chunk on the first window, popup or Statistics pane instead of the
  first ESC; the prefetch rules stay.
- **Tests:** e2e and unit tests that reached a frame through the ESC menu
  on desktop go through the bar, its popups and windows, or a `#`
  command; tests of the ESC menu itself run on the phone (or are dropped
  where a phone spec already covers the same). New checks: Esc on desktop
  with nothing open opens nothing; `#menu` prints the hint; a tablet has
  no `☰`; a disconnect on desktop opens no menu. The screenshot script's
  `ESC → Options → Appearance` scene uses the Settings popup.
- **Docs:** spec §2.6 (the ESC menu is the phone's; desktop and tablet
  have the menu bar), spec §2.2/§2.8 lines that send the user to the ESC
  menu, the manual and `#help` texts, README, the Scripts page note
  ("Scripts sits under Profile on the start page and in the ESC menu"),
  and comments naming the ESC menu as the desktop's way in.

## Owner feedback

### 30a round 1 (2026-10-31)

1. **Pane bar script off for new users.** `panebar` is no longer enabled
   by default; the Panes popup does its job. It will probably be removed
   altogether later. Existing installs keep whatever they have.
2. **Right dock above the menu bar.** The bar must not sit left of a
   right-docked pane. New dock structure:
   - The top dock stays between the left and right docks (as today).
   - The right dock ends just above the input row.
   - The input row (input field, notices, clock, menu bar) fills today's
     width plus the gap and the area under the right dock, out to the
     screen's right edge. The bar sits at the right end.
   - The left dock runs from the top down to the bottom dock, beside the
     input row (the input row does not extend under it).
   - The bottom dock fills the whole screen width, under the left dock and
     under the input row (with the gap row above it).

         +------+--+-------------------+--+-------+
         | left |g |    top dock       |g | right |
         | dock |a +-------------------+a | dock  |
         |      |p |      game         |p |       |
         |      |  +-------------------+--+-------+
         |      |  | > input        clock … exit  |
         +------+--+-----------------------------+
         |  (gap row)                            |
         |  bottom dock, full screen width       |
         +---------------------------------------+

### 30a round 2 (2026-10-31)

The owner likes round 1 but prefers the bar left of the right dock in
most cases. The input row picks its extent by the room left to type:

- **Wide** (the typing field has at least ~50 cells with the clock and
  the bar beside it, in the game column's width): the right dock runs
  down to the bottom dock, like the left dock, and the bar sits at the
  input row's right end, left of the right dock (as in the first 30a
  build).
- **Narrow** (fewer than ~50 cells): as round 1. The right dock ends
  above the input row, which reaches the screen's right edge with the
  bar under the right dock.
- The bottom dock spans the full width in both cases. Transient notices
  (Update, Disconnected) do not count, so a notice never moves the docks
  *(Claude)*.

### 30a approved (2026-10-31)

The owner tested round 2: "Feels good now." 30a is done; 30b is next.

### 30b round 1 (2026-10-31)

Profile changes should take effect while the window stays open, since
you now play with it open. First choice: changes apply at once (or
shortly after) without closing the window. Second choice: a "modified"
notice and Ctrl+S to save and apply, as the script editor has.

Decided *(Claude)*, ADR 0105:

- **Lite applies by itself** at the points where an edit is finished:
  leaving a field, moving to another entry or kind, Enter in Pattern, a
  new or deleted entry, a captured macro key, a highlight style or
  colour. Not on every keystroke: a half-typed action pattern (`^%1`
  on the way to `^%1 tells you`) would match every line and fire.
- **Ctrl+S** applies at once, in Lite and in Editor. Editor (the whole
  text) applies only on Ctrl+S and when you go back to Lite, with a
  "modified" mark until then.
- An entry that does not validate, or a text that does not load, is not
  applied; the editor says why. The close prompt only asks when changes
  are still unapplied.
- No `Profile applied` line in the game text for these quiet applies;
  failures and warnings show in the editor.
- Changes made outside the window while it is open (typed `#alias`,
  variables written back by scripts) are kept and show in the editor.

### 30b approved (2026-10-31)

The owner tested 30b with round 1: "Seems to work." 30b is done; 30c is
next. Open: each applied profile change restarts profile tickers and
drops pending `#delay`s; revisit if it bites in play.

### 30c round 1 (2026-10-31)

Items 1–4 of the test guide seem OK. Feedback:

1. Switching a pane on or off in the Panes popup takes the keys from the
   game.
2. **Tab does nothing by default.** Today Tab in the game moves the focus
   to the bar's icons and on to the browser's own controls; you lose the
   game without knowing why. Tab only does something when a macro binds it
   or autosuggest has a word to complete.
3. **Popups take the focus when they open**, as the Profile and Scripts
   windows do: Settings, Panes and Exit. While one is open, Tab, Enter,
   Space, the arrows and Page Up/Down work in it. Esc closes it and gives
   the keys back to the game.
4. Asked: after a mouse click on a control in an open popup, the keys stay
   in the popup (owner's choice); Esc or a click in the game gives them
   back.

Decided *(Claude)*, ADR 0108:

- **Tab and Shift+Tab in the game input** never move the focus. A macro
  bound to the key runs; autosuggest completes a word when it has one;
  otherwise nothing. Nothing in the cockpit outside a popup or a window is
  in the Tab order (bar icons, the Disconnected notice's button, pane
  buttons), so no stray focus can land there; Tab with the focus on such a
  spot gives the keys back to the game.
- **Every bar popup and gear popup takes the focus when it opens**, by
  click, `#` command or macro (the gear popups follow S6: the same rules
  as Settings). Tab and Shift+Tab cycle inside it and never leave it;
  ↑↓, ←→, Enter, Space work on its controls; Page Up/Down scroll it when
  it scrolls. A mouse click on a control keeps the focus in it.
- **Closing** by Esc, its X or its icon gives the keys to the game. A
  click in the game text or the input gives the keys to the game and
  leaves the popup open; a click in it takes them back. Esc in the game
  input still closes the open popup first (after the scrolled-back rule).
- Windows unchanged (ADR 0103).

### 30c approved (2026-10-31)

The owner tested round 1: "Feels OK now." 30c is done; 30d is next.

### 30d approved (2026-11-01)

The owner tested 30d: feedback questions 1–4 are OK (first size and place,
where narrow starts, the shortened headers); details may be polished
later, not a priority. "It works as wanted." ESC → Statistics can go in
30f, with this pane as its replacement. 30d is done. The owner removed
the pane bar script instead (ADR 0111).

### Pane bar script removed (2026-11-01)

The owner decided to remove the bundled `panebar` script entirely: the
menu bar's Panes popup does its job. The script, its default slot and its
toggle are gone; existing installs drop its data and its pane once
(settings version 3). The pane API stays. ADR 0111.

### 30e test deferred (2026-11-01)

The owner moves on to 30f without testing 30e; they will test it later
and bring any feedback then. The 30e test guide stands.

### 30f round 1 (2026-11-01)

Answers to the 30f guide's questions, before testing in the browser:

1. The `#menu` hint reads right.
2. Nothing from the old ESC menu is missed.
3. **Esc with nothing open** should do what the bar's Exit icon does:
   open the Exit popup, in and out of fullscreen. Done (ADR 0112
   addendum, ADR 0103 addendum, help texts, spec §2.6, tests).

The 30e test is moved further ahead.

### 30f approved on desktop (2026-11-01)

The owner tested the 30f guide on desktop (Firefox): items 1–4 and 6–8
OK (Esc with nothing open → Exit popup, the Esc order, two windows, the
unsaved prompt, `#menu`, the Disconnected notice, the Statistics pane).
Item 5 (Esc in Chrome/Edge fullscreen) not tested: no Chrome at hand;
covered by unit tests. Items 9 (tablet) and 10 (phone) are tested later,
together with 30e.

## Open questions

- 30a: icon designs and the popups' exact look. They are settled on the
  refined mockups.
- Later stage: the phone's version of the bar, and the start page's
  Options → Scripts.

## Tasks

- [x] Five aesthetic mockups (2026-10-22).
- [x] Spec and decisions with the owner (2026-10-31).
- [x] 30a refined mockups (ghost look), six artboards (2026-10-31).
- [x] 30a round 2 (2026-10-31): link dot only on a bad link; conventional
  window frame; one separator less; scroll icon for Scripts.
- [x] 30a mockups approved by the owner (2026-10-31, after round 2).
- [x] 30a build (2026-10-31):
  - [x] Menu bar in the input row (desktop, tablet): clock with SVG
    sun/moon, link dot, icons, two separators, whole cells (ADR 0099).
  - [x] Live tooltips (clock, link, profile, buttons).
  - [x] Link dot rules; Disconnected notice; ESC menu auto-open on the
    phone only (ADR 0100).
  - [x] Fullscreen in the bar; corner button phone only.
  - [x] Panes popup (toggles, script panes, Reset layout with confirm).
  - [x] Exit popup (rating as ExitConfirm, keys Y/Esc/0–5/←→).
  - [x] Popup rules: one at a time, toggle on icon, Esc order, own keys.
  - [x] Profile, Scripts, Settings open the ESC menu at their frame;
    leaving it closes the menu.
  - [x] `#profile`, `#scripts`, `#panes`, `#settings`, `#fullscreen`,
    `#exit` (exact names), `#help` sections, phone fallbacks.
  - [x] Unit tests, e2e `menubar.spec.ts`, phone check, ADRs 0099, 0100.
- [x] 30a round 1 (2026-10-31):
  - [x] Pane bar script off for new users (`NEW_USER_SCRIPTS` =
    `['mapsearch']`; ADR 0078 and 0092 addenda).
  - [x] New dock structure (ADR 0101): right dock down to the input row,
    the input row (and the bar) under it to the screen edge, left dock
    down to the bottom dock, bottom dock across the screen.
  - [x] Edge drop zones, their bars and the dock handles follow the new
    extents; game text width unchanged.
  - [x] The input slot paints before the panes, so the wider row is not
    promoted to its own layer (accent tops at pixel ratio 1.5).
  - [x] Unit tests (allocate, cockpit, new-user defaults), e2e (layout,
    panebar, new-user), screenshots checked.
- [x] 30a round 2 (2026-10-31):
  - [x] The input row's case by the room to type (ADR 0102): wide (at
    least 50 cells beside the bar in the game column) keeps the input row
    in the game column, the bar left of the right dock, the right dock
    down to the bottom dock; narrow is round 1's geometry. Decided from
    the wide geometry (columns only), after narrow collapse.
  - [x] The bar's width (26 / 24 cells, ADR 0099) reaches `allocate` from
    the menu bar through the cockpit (`setBarCells`); without the bar the
    clock strip counts (8). Notices and the tablet's `☰` do not.
  - [x] The right edge zone, its open bar and the right gap handle follow
    both cases; a hidden right dock's bar the case it would open in.
  - [x] Unit tests (allocate: both cases, the 49/50 threshold, 24 vs 26,
    no right dock, collapse, with/without a bottom dock; cockpit; menu
    bar; new-user defaults), e2e (layout wide and narrow, new-user,
    panebar), screenshots checked.
- [x] 30a approved by the owner after round 2 (2026-10-31).
- [x] 30b (2026-10-31):
  - [x] Window kit: frame, drag, resize, grip, snap to cells, minimum
    size, kept on screen, z-order, focus and dimming (ADR 0103).
  - [x] `FrameStack` without focus trap; keys only while focused; one key
    owner per browser window.
  - [x] Profile and Scripts windows; bar icons, `#profile`, `#scripts`,
    ESC menu entries open them; toggle rules; `#help` texts.
  - [x] Close via X / Esc through the frames' unsaved prompts; Esc order
    in the input; Exit popup warning.
  - [x] Position and size remembered across reloads.
  - [x] Owner request during the build: Esc in fullscreen opens the Exit
    popup instead of leaving fullscreen (Keyboard Lock, Chromium; ADR
    0103).
  - [x] Lite view fills the width; Commands takes the height; hints panel
    removed, warnings kept (ADR 0104).
  - [x] Unit tests, e2e, ADRs, test guide.
    - [x] Windows: unit (geometry, stack, settings, keyboard lock, bar,
      App), e2e `windows.spec.ts` and the specs that went through the ESC
      menu, ADR 0103, ADR 0099 addendum, test guide below.
- [x] 30b round 1 (2026-10-31): profile changes apply while the window
  stays open (ADR 0105).
- [x] Owner report during round 1 (2026-10-31): drag the thumb of every
  TUI scrollbar; the LITE Commands box wraps and scrolls again (ADR
  0106).
  - [x] LITE applies at commit points (field left, window left, entry or
    kind changed, new or deleted entry, captured key, highlight); a new
    entry waits for its Commands.
  - [x] Ctrl+S in LITE, EDITOR and HELP; EDITOR applies on Ctrl+S and the
    flip back, `Modified` in its footer.
  - [x] Invalid entries and texts that do not load are held back with the
    reason; the close prompt only while something is unapplied.
  - [x] Quiet applies (no UI pane lines), `Applied` flash, new warnings.
  - [x] Typed settings and script variables saved while open are rebased
    under the edits (document-model rebase, `ProfileStore.subscribe`,
    saves on the write-back queue); session variables survive an apply.
  - [x] Unit tests, e2e `profile-apply.spec.ts`, ADR 0105, ADR 0015
    addendum, manual text, test guide.
- [x] 30c (2026-10-31):
  - [x] Control kit (toggle, segmented, slider, dropdown, swatch, button)
    in the ghost look; popup surface in the chrome chunk; one-popup rule
    with the bar's popups; keys after a click; Esc order.
  - [x] Settings popup: Appearance (with preview and palette picker), Text
    input, Mapper, Weather effects; `#settings` and the icon toggle it.
  - [x] Gear button on Mapper, Comm, Timers, Group (not phone, dropped
    first when narrow); gear popups beside the pane.
  - [x] Options → Panes → Appearance removed on desktop and tablet.
  - [x] Unit tests, e2e, ADR 0107, ADR 0095/0099 addenda, test guide.
    - [x] Part 1 (Settings popup): unit `chrome-popups.test.tsx`, menu bar
      and App tests, e2e `settings-popup.spec.ts` and the specs that went
      through the pane grid, ADR 0107, ADR 0099 addendum.
    - [x] Part 2 (pane Gear): unit `pane-gear.test.tsx`, e2e
      `pane-gear.spec.ts` and `pane-buttons.spec.ts`, ADR 0095 and ADR 0107
      addenda.
- [x] 30c round 1 (2026-10-31): keys and focus (ADR 0108):
  - [x] Tab / Shift+Tab in the game input do nothing unless a macro or
    autosuggest uses them; cockpit chrome out of the Tab order.
  - [x] Bar and gear popups take the focus on open; Tab cycles inside;
    keys work; clicks keep the focus; Esc / X / icon give it to the game.
  - [x] Unit tests, e2e, ADR 0108, ADR 0099/0107 addenda, test guide.
    - [x] Unit (input pane Tab, menu bar, App, surface), e2e
      `popup-focus.spec.ts` and the specs that assumed keys after a click,
      ADR 0108, ADR 0099/0107 addenda, `#panes` / `#settings` help.
    - [x] Test guide.
- [x] 30d (build plan above, 2026-10-31):
  - [x] `statistics` built-in pane id, off by default, migration, not on
    the phone or in the log player / replay bundle.
  - [x] Default float when switched on; Reset layout forgets it.
  - [x] Shared renderer for the frame and the pane; chrome-chunk mount.
  - [x] Adaptive layout (wide, narrow), header shortening.
  - [x] Live data (run events ≤1 Hz, 1 Hz clock tick, idle when hidden);
    `Run ended`; `No run yet`.
  - [x] Statistics row in the Panes popup; the pane bar leaves it out.
  - [x] Unit tests (`statistics-pane.test.tsx`, layout, settings, Panes
    popup, LiveRuns), e2e `statistics-pane.spec.ts`, ADR 0109, ADR
    0018/0065 addenda, `#panes` help, manual, README, test guide.
- [x] 30e (build plan above; 2026-10-31):
  - [x] `SpotlightSettings`: `allCharacters`, `characters`, `period`;
    migration.
  - [x] Filter (kinds × characters × period) for the reel and Credits;
    empty states by "any event at all".
  - [x] Spotlights popup (Kinds, Characters, Period; `Check` control) in
    the settings popups' surface.
  - [x] Gear in the reel's control box; popup above the box, beside the
    player element; keys left to the popup; Esc order; chrome kept while
    open.
  - [x] Live rebuild (cached windows, current spotlight kept, latest
    change wins); empty stage in the reel.
  - [x] Filtered empty states on the start page offer `Settings…`; retry
    on close (Spotlights, Credits).
  - [x] Options → Spotlights removed on every device (the gear works by
    touch: `phone-spotlights.spec.ts`); About, spec §2.5 texts.
  - [x] Unit tests (`share-spotlights`, `settings`, `spotlights-settings`,
    `spotlight-mode`), e2e `spotlights-settings.spec.ts`,
    `phone-spotlights.spec.ts`, ADR 0110, ADR 0032 addendum, test guide.
- [x] 30f (build plan above, 2026-11-01):
  - [x] Esc on desktop and tablet ends without the ESC menu; the shell
    never mounts it where the bar exists.
  - [x] `#menu` hint with the bar; `#help` texts.
  - [x] Tablet `☰` removed; phone unchanged.
  - [x] Dead ESC-menu-beside-the-bar paths removed; chrome loading notes.
  - [x] Unit and e2e tests moved off the desktop ESC menu; new checks;
    screenshot script.
    - [x] ESC menu specs on the phone (`phone-esc-menu.spec.ts`); the
      tablet in `phone-touch.spec.ts`; desktop checks in `esc-click`,
      `chrome`, `menubar`, `windows`, `settings-popup`.
  - [x] Docs: spec §2.6 and others, manual, `#help`, README, Scripts note;
    ADR 0112 and addenda; test guide.
- [x] 30f round 1 (2026-11-01): Esc with nothing open opens the Exit
  popup, in and out of fullscreen (ADR 0112 and 0103 addenda; help, spec,
  unit and e2e tests).

## Test guide

Written per step when it is built.

### 30a

Open the local dev server (`npm run dev`, then http://localhost:5173/),
Enter MUME, and play as usual. `?replay` shows the cockpit offline.

Try:

1. **The bar** at the right end of the input line: clock, then Profile,
   Scripts, Panes, Settings, then Fullscreen and Exit. Hover each: the
   icon lights and a small tooltip names it (`Profile: <name>`,
   `Night in 4:33` on the clock, counting live). Clicking an icon never
   takes the keys from the game.
2. **Panes:** click it. Switch panes off and on, also a script pane.
   Try Reset layout (it asks first). Close it with the icon, its X, or
   Esc (Esc in the input closes it; a second Esc opens the old menu).
3. **Exit:** click it. With a run in progress you can rate it with the
   stars or 0–5. Esc cancels, Y or Exit goes to the main menu.
4. **Profile, Scripts, Settings:** for now they open the old menu at the
   profile editor, Scripts and Options. Esc out of them goes straight
   back to the game.
5. **Commands:** type `#panes`, `#exit`, `#profile`, `#scripts`,
   `#settings`, `#fullscreen`. Bind one to a key with `#macro`.
6. **Disconnect:** `#disconnect`, or lose the connection. The menu no
   longer opens by itself; `Disconnected  Reconnect Enter` appears left
   of the clock and the link dot turns red. Click Reconnect or press
   Enter.
7. A light background (Options → Appearance) and a tablet, if you have
   one (the bar plus `☰`). A phone has no bar yet.

Feedback wanted: icon size and spacing against the mockups, tooltip
size and delay, the popups' position, whether the Disconnected notice is
clear enough, and anything that takes keys from the game when it should
not.

#### Round 1

Use a private window (or clear the site data) to see the new-user
start; your own browser keeps its layout.

1. **New user:** no pane bar; the right dock is the map, Timers | Group
   and Comm, and Comm ends right above the input row.
2. **The bar under the right dock:** the input row now runs under the
   right dock to the screen's right edge, with the bar at its end. The
   game text keeps its width; only the input line is wider.
3. **Docks:** drag a pane to the left edge, another to the bottom edge
   (anywhere along it, also under the right dock). The left dock stops
   at the gap row above the bottom dock; the bottom dock fills the whole
   width under the left dock and the input row. Try two rows and a
   spanning pane in the bottom dock, and the top dock (unchanged).
4. **Resize:** the gap beside each dock and the gap row above the bottom
   dock (now the full width) still resize. A tall bottom dock makes the
   right dock shorter; its panes drop when they no longer fit.
5. **Narrow window:** make it narrow until a side dock collapses: the
   input row takes the freed width, the bottom dock stays full width.

Feedback wanted: whether the bar under the right dock reads well, and
whether the bottom dock should rather stay out from under the right
dock's column (it now runs under it, as the diagram showed).

#### Round 2

1. **Wide window** (your usual one): the input row ends at the game
   text's right edge with the bar there, left of the right dock; the
   right dock runs down to the bottom (or to the gap row above a bottom
   dock), like the left dock. The bottom dock still spans the whole
   width.
2. **Narrow it:** make the window narrower (or the right dock wider by
   its gap, or open a wide left dock) until fewer than 50 cells are left
   to type beside the bar: the right dock stops above the input row and
   the input row with the bar runs under it to the screen edge (round 1).
   Widen again and it switches back, at one exact width.
3. A notice (Disconnected, Update) never moves the docks.

Feedback wanted: whether 50 cells is the right switch point, and
whether the switch feels abrupt when resizing.

### 30b

Open the dev server (`npm run dev`, then http://localhost:5173/), Enter
MUME (or `?replay` offline). The windows exist on desktop and tablet; a
phone is unchanged.

1. **Open:** click Profile in the bar. A window opens over the game with
   the profile editor, about 80% of the screen. Type `#scripts` (or click
   Scripts): a second window, one cell right and down. Both can be open.
2. **Focus:** click in the game text or the input line: the windows dim
   and your keys go to the game. Click in a window: it lights up, comes to
   the front and takes the keys. Click the other window: it does.
3. **Move and resize:** drag the title bar; drag any edge or corner, or
   the small grip bottom right. It moves in whole cells, stops at the
   screen edges and at a minimum size. Make the browser smaller: the
   windows stay fully on screen. Reload: they open where you left them.
4. **Toggle:** click Profile again while its window has the keys: it
   closes. While it is dimmed, the click brings it forward instead.
5. **Unsaved changes:** while connected, add an alias in the editor and
   click X: Apply / Discard / Keep editing, as Esc asks. Esc in the game
   input closes a bar popup first, then reaches the topmost window (it
   lights up and asks), then opens the old menu.
6. **Exit** with an unsaved change in a window: the Exit popup warns on a
   line of its own; Exit discards the change. The windows close with the
   cockpit.
7. **The old menu:** Esc → Profile and Esc → Options → Scripts now open
   the windows and close the menu.
8. **Fullscreen** (Chrome or Edge): enter fullscreen from the bar and
   press Esc with nothing open: the Exit popup instead of leaving
   fullscreen (Esc again cancels it). Holding Esc still leaves fullscreen.
   Firefox and Safari always leave fullscreen on Esc.
9. A light background (Options → Appearance): the windows' title bars
   turn pale; the cyan border stays.
10. **Lite view** (owner round during the build: tabs centred, halves):
    the kind tabs are centred; the entry list and the detail panel share
    the width in halves, and so do the list's Pattern and Commands
    columns. The Commands box fills the height. The hints panel is gone;
    an entry's warning shows under the box. Resize the window: narrow,
    it falls back to today's layout.

Feedback wanted: the frame's look against the mockup (border, title bar,
grip), the dimming without focus, the default size and place, whether
focus following clicks feels right, the Lite halves and the tall
Commands box, and anything that takes keys from the
game when it should not.

#### Round 1

Changes now take effect while the Profile window stays open. Enter MUME
(connected, so the changes go into the running game) and open Profile.

1. **LITE applies by itself:** add an alias (`n`, a pattern, Tab, its
   commands) and click in the game. `Applied` shows briefly in the
   window's footer, and the alias works at once; the window stays open.
   It also applies when you move to another entry or kind, delete an
   entry, bind a macro key or pick a highlight colour. It does not apply
   while you type, and a new entry waits until it has commands.
2. **No spam:** the game text and the UI pane get no `Profile applied` or
   `saved` lines for these.
3. **EDITOR:** switch to EDITOR and change the text. `Modified` shows
   left of the cursor position; a click in the game does not apply.
   Ctrl+S applies (no browser Save dialog), and so does going back to
   LITE.
4. **Mistakes:** give an entry an unbalanced brace (`say {hi`) and click
   the game: the footer says `Not applied: …` in red, and the game keeps
   the old version. In EDITOR, an unbalanced text is not applied either.
5. **Closing:** with everything applied, X or Esc closes at once. With
   something unapplied, it asks Apply / Discard / Keep editing; when what
   is left cannot be applied, it says why and offers Discard / Keep
   editing.
6. **Typed settings:** with the window open, type `#alias {zz} {say hi}`
   in the game input: it appears in the window's list (and in EDITOR's
   text). Edit another alias and apply: `zz` is still there and still
   works. Variables your scripts set are kept too.
7. On the start page (Profile → EDIT) the same rules save instead of
   apply; `Saved` shows in the footer.

Feedback wanted: whether applying on leaving a field feels right (or
should it be even sooner, or only with Ctrl+S), whether the `Applied`
flash is enough feedback, the wording of the `Not applied` messages, and
whether the close prompt still asks too often or too seldom.

Known side effect: every applied change reloads the whole profile, so
tickers defined in the profile restart their countdown and pending
`#delay`s are dropped (as Apply did before, but now more often). Say if
that bites in play.

8. **Scrollbars** (owner report during round 1, ADR 0106): drag the `█`
   thumb of any TUI scrollbar: the profile EDITOR, the LITE Commands box,
   the script editor, the script manual and Help, the Scripts page help,
   About. The content follows, also when the pointer leaves the bar. A
   press on the track pages; holding it keeps paging. The LITE Commands
   box wraps and scrolls again (it had stopped since a phone CSS rule).

### 30c

Open the dev server (`npm run dev`, then http://localhost:5173/), Enter
MUME (or `?replay` offline). Desktop and tablet; a phone is unchanged.

1. **Settings:** click the Settings icon (sliders) in the bar, or type
   `#settings`. A popup rises above the icon with four tabs: Appearance,
   Text input, Mapper, Weather effects. Switching tabs does not move or
   resize it.
2. **Live while you play:** change font, size, padding, colours,
   scrollback, a palette colour (click a swatch: colour picker and a hex
   field), cursor style, a weather category. The game text follows at
   once; the small preview in Appearance too. The font list shows each
   name in its own font (owner request during the build). Click in the game text or
   the input and keep typing: the popup stays open, the keys go to the
   game. Click in the popup again to use its keys.
3. **Closing:** its X, Esc (in the popup, or in the input once the text
   is scrolled to the bottom), or the Settings icon again. Opening Panes
   or Exit closes it, and the other way round: only one popup at a time.
4. **Gear on the panes:** hover Map, Comm, Timers or Group: a gear is the
   first of the buttons left of `×`. It opens that pane's settings beside
   the pane (toward the game text): Comm channels and channel header;
   Timers colour (or Off), columns, Clock, Bar per group, headers,
   compact; Group players and NPC visibility; Map the same as Settings →
   Mapper. Changes show in the pane at once. The gear glows while its
   popup is open. A narrow pane drops the gear first (as the other
   buttons drop), so a narrow Timers | Group lane may show none.
5. **Pane hidden:** with a gear popup open, close its pane (`×`, or the
   Panes popup): the popup closes too. Move or resize the dock: it
   follows the pane.
6. **Old menu:** Esc → Options → Panes now starts at Timers; the
   Appearance grid is gone there and on the start page (the Panes popup
   and the pane buttons do its job). The phone keeps it.
7. A light background (Paper): the popups stay dark panels.

Feedback wanted: the controls' look and size against the mockups, the
popup's place above the bar and beside the panes, whether Settings
should remember its last tab across reloads (now only until reload),
the Timers layout (colour as a dropdown with Off), and anything that
takes keys from the game when it should not.

Known: while the browser's colour picker is open, the hex field cannot
be typed in until the picker closes. The Mapper tab has some empty room
at the bottom, since every tab keeps the tallest tab's height.

#### Round 1

Keys and focus (ADR 0108). Enter MUME or `?replay`.

1. **Tab in the game:** press Tab and Shift+Tab a few times while typing:
   nothing happens, the cursor stays in the input. With autosuggest on
   and a suggestion shown, Tab still takes the next word. Bind Tab with
   `#macro {Tab} {...}`: the macro runs.
2. **Popups take the keys:** click Panes (or type `#panes`): the first
   row has the keys. ↑↓ move, Space or Enter switches a pane, Tab and
   Shift+Tab go round inside the popup and never leave it. Click a row
   with the mouse: the keys stay in the popup. Esc closes it and you type
   in the game again.
3. **Settings and the gears:** the same. Tab goes round the controls,
   arrows step sliders and switches, Page Up/Down scroll the popup when
   the screen is short. Esc in an open dropdown closes only the list.
4. **Click in the game** with a popup open: you type in the game, the
   popup stays open; click in it to use its keys again. Esc in the input
   still closes it.
5. **Over a window:** with Profile focused, open Settings: the window
   dims and the popup has the keys; Esc returns the keys to the game.
6. **Exit:** as before, it takes the keys when it opens.

Feedback wanted: whether you can still lose the game's keys by accident
anywhere, and whether the first focus in each popup is the right spot
(Panes: first row; Settings: the selected tab; a gear: its first
control).

### 30d

Open the dev server (`npm run dev`, then http://localhost:5173/), Enter
MUME (or `?replay`, or `?fixture=gmcp-demo.log` for a replayed run).
Desktop and tablet; the phone is unchanged (ESC → Statistics).

1. **Switch it on:** Panes in the bar (or `#panes`): the last built-in
   row is Statistics, off. Switch it on: the pane opens as a float in the
   middle of the game text, about 80 × 24 cells (smaller in a small
   window).
2. **Before a run:** it says `No run yet` in the middle. Log in (or start
   a replay): the run shows, as on ESC → Statistics, and follows the game
   about once a second (kills, the running clock in the header).
3. **Wide:** the two sides as in the ESC frame: ALLIES / ACHIEVEMENTS,
   KILLS / PvPs with Totals, XP/h and TP/h, the XP ruler. Make it shorter:
   the sparklines go first, then the ruler; the tables take the rest.
4. **Narrow:** make it narrower than about 66 cells (drag its right
   edge): one column, ALLIES, ACHIEVEMENTS, KILLS, PvPs with all their
   rows, then the sparklines and the ruler. The wheel scrolls the whole
   pane; the bar on the right shows where you are. Narrower still: the
   sparklines drop, then the ruler. The header shortens to fit.
5. **No keys:** click anywhere in it, also a column title (it sorts: the
   arrow moves), a table or its scrollbar: keep typing, the keys stay in
   the game input. The wheel scrolls the tables.
6. **Run ended:** disconnect (or let a replay finish): the header says
   `Run ended` and the run stays. Log in again: the new run shows.
7. **Like any pane:** move, resize, dock it; it comes back where you put
   it after a reload. Its hover buttons are Colour, Border, Background and
   ×; no gear. Reset layout in the Panes popup puts it back in the middle.
8. **Unchanged:** ESC → Statistics and History → STATS look and work as
   before (keys, footer, R). The log player and an HTML replay never show
   the pane. The pane bar script has no STAT button.

Feedback wanted: the first size and place (centred over the game text),
where narrow starts (64 columns), the shortened headers, whether the pane
bar should get a STAT button after all, and whether ESC → Statistics can
go in 30f with this as its replacement.

Known: a pane switched on after a page reload shows `No run yet` until a
run starts (the latest run is remembered per tab, not across reloads).
In the narrow layout the tables show every row, so a long kill list makes
a long page to scroll. The header's run time of a replay is log time.

### 30e

Open the dev server (`npm run dev`, then http://localhost:5173/). You need
some recorded runs with kills, deaths, level-ups or achievements (your own,
or a backup through History → RESTORE). Desktop, tablet and phone alike.

1. **The gear:** Start page → Spotlights. Move the mouse (on a phone, tap
   the screen): the control box at the bottom right now ends in a gear
   `⚙`. Click it: a SPOTLIGHTS popup rises above the box, with Kinds,
   Characters and Period. The gear glows, and the controls do not hide
   while the popup is open.
2. **Kinds:** switch Deaths off. The reel rebuilds at once (the header's
   `SPOTLIGHT n / N` changes). If the spotlight on screen is still in the
   reel it keeps playing where it was; otherwise the reel starts from the
   first.
3. **Characters:** the list shows the characters in your recorded runs,
   dimmed while `All characters` is on. Switch All off: every character is
   checked; uncheck one and its spotlights go. Switch All on and off
   again: your choice comes back. A character you play for the first time
   later is left out while All is off.
4. **Period:** All time, Last year, Last 3 months, Last month, Last week,
   counted back from today. A period with nothing in it shows `No
   spotlights match your settings.` on the reel, with `Settings…` and
   `ESC Back`; widen the period and the reel plays again.
5. **Keys:** with the popup open, Tab goes round its controls, Space flips
   a switch, ↑↓ move in the character list; ←→ and Space do not reach the
   reel. Click in the reel: the keys go back to it, the popup stays. Esc
   closes the popup first, a second Esc leaves the reel.
6. **Start page:** narrow the settings until nothing passes, leave the
   reel, and choose Spotlights again: the page says `No spotlights match
   your settings.` with `Settings…` (Enter or a click opens the same
   popup). Change something and close the popup: the reel opens if
   something passes now.
7. **Credits** follows the same three settings. When nothing passes, its
   page offers `Settings…` too; close the popup after a change and the
   credits roll.
8. **Options:** the Spotlights row is gone (start page, the old ESC menu,
   the phone).

Feedback wanted: the gear and the popup's place above the control box,
the checkbox list (look, and whether `All characters` should start from
everyone checked when switched off), whether the periods are the right
ones, and whether the start page should rather open the reel at once
while the popup is still open (now it waits until the popup closes).

Known: the characters are those with a finished (sealed) run; a character
whose only run is still recording shows up once that run is sealed.

### 30f

Open the dev server (`npm run dev`, then http://localhost:5173/), Enter
MUME (or `?replay` to try it offline). Desktop first, then a tablet (or
`?touch=1` on desktop) and a phone.

**Desktop**

1. **Esc with nothing open:** click in the game input and press Esc. The
   Exit popup rises above the Exit icon, as a click on the icon does (no
   menu covers the game). Esc again closes it and you keep typing; Y
   exits. (Changed after the build, owner round 1.)
2. **Esc order:** scroll the game text back (Page Up), open the Panes
   popup and the Profile window. Esc: the text jumps to the bottom. Esc:
   the popup closes. Esc: the window closes (it asks first if a change is
   not applied). Esc: the Exit popup. With the Scripts window open on top of
   the Profile window, Esc closes Scripts first, then Profile.
3. **Fullscreen (Chrome or Edge):** the bar's Fullscreen, then Esc with
   nothing open: the Exit popup rises, as outside fullscreen; Esc again
   closes it.
   Holding Esc still leaves fullscreen. Firefox leaves fullscreen on Esc.
4. **`#menu`:** type it. One line: `The ESC menu is gone: use the menu bar,
   or #profile, #scripts, #panes, #settings, #fullscreen, #exit.` Nothing
   opens. `#help menu` says the same.
5. **Disconnect:** `#disconnect` (or drop the network while logged in):
   `Disconnected  Reconnect Enter` shows left of the clock, no menu
   opens. Enter, or a click on Reconnect, connects again.
6. **What the old ESC menu held:** Statistics is the Statistics pane
   (Panes → Statistics); Profile and Scripts are the bar's windows;
   Options is Panes, Settings and the pane gears; Exit session is the
   bar's Exit. The start page's Options is unchanged.

**Tablet** (an iPad, or `?touch=1` on desktop)

7. No `☰` after the bar. The bar's icons, popups and windows work by
   touch; Esc on a keyboard acts as on desktop.

**Phone**

8. Unchanged: `☰`, Esc and `#menu` open the ESC menu; a dropped
   connection opens it with Reconnect selected; Profile, Statistics,
   Options (Scripts included) and Exit session work as before.

Feedback wanted: whether the `#menu` hint reads right (or should name
something else, or `#menu` should be dropped later); whether anything
from the old ESC menu is missed on desktop (for example its status
header: profile, link time and capture are now in the bar's tooltips);
and whether Esc with nothing open should do something after all.
