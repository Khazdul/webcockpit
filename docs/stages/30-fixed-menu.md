# Stage 30 — Fixed menu

Status: **In progress** (30b). Spec agreed with the owner 2026-10-31 (below); 30a
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
- [ ] 30c.
- [ ] 30d.
- [ ] 30e.
- [ ] 30f.

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
