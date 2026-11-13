# Stage 56 — Phone and tablet: loose ends

Status: **Owner testing** (built 2026-11-13; on `main`, not released).

## Goal

The second and last of the stages that finish phone and tablet (order
agreed 2026-11-13, `docs/stages/55-scrap-old-phone-layout.md`): what
stage 52 left as loose ends (its D list), the menu pages at tablet
width, which nobody has reviewed, and what stage 55 left on purpose.

## Scope

Fixed (decided 2026-11-13):

1. **The menu's status line carries the update and storage notice**
   (stage 52 D7; today it shows only in the command row).
2. **Contrast of disabled controls** (D9): "A−" at the smallest size
   and "Not connected" in Comm's reply are under 4.5:1.
3. **A refused hold on a K key still folds the keyboard** with our
   keyboard and Comm both open in portrait (stage 53e, left). Check
   what the lower box of stage 55 changed first.
4. **The menu pages at tablet width** (820 × 1180 and 1180 × 820, the
   phone's layout by ADR 0140): start page, Profile (Lite, Editor,
   Help), Import, Export, Scripts (page, editor, manual), History, run
   log, Spotlights, Credits, About, and the game's menu sheet and
   settings pages. Screenshots, obvious faults fixed, questions of
   taste listed for the owner.
5. **MUME's `opponent-hits` words** (stage 52 B1): from the owner's
   Cockpit logs under `/home/ole/MUME` (read-only), against
   `src/gmcp/bands.ts`.

Looked at, to decide in the stage:

6. The password field swap in `src/ui/input-pane.ts` (ADR 0142 §5):
   removable only if the phone's input is built with our keyboard from
   the start. A behaviour change in password handling: investigate,
   build only if clearly safe.
7. `MapPane.forwardHidden` (ADR 0142 §5).

Closed without work (2026-11-13): stage 52 D1–D4, D8, D11, D12
(accepted limits), D5 and D6 (the owner: not needed), D10 (went with
stage 55).

## Tasks

- [x] 56a small fixes: 1, 2, 3
- [x] 56b tablet-width review of the menu pages: 4
- [x] 5 `opponent-hits` words (not confirmable from logs; see Built)
- [x] 6 and 7 looked at (both built)
- [x] 56c the questions of taste, T1–T6
- [x] Closing test guide for phone and iPad, session log
- [x] The owner's test and answers to T1–T8; then the release of stages 55 and 56

## Built

### 56a (merged d5afa6c1)

1. **Notices in the menu sheet's status line.** The shell hands the
   sheet the same notice indicators the command row uses; they sit
   right-aligned in the status line and move no row. The update notice
   is a key ("Update: 0.8.4 · reload") only while the link is down; in
   a live session it is plain text, because a reload disconnects
   (ADR 0025). At 360 px the status text drops the profile name while
   a notice shows; with both notices the storage one reads "Not saved".
2. **Disabled text at 4.5:1.** "A−", "Not connected" and "Reset place
   and size" were 2.4 to 3.1 and are 4.7 to 5.5 on Black and Paper
   (tokens `--ph-off-text`, `--ph-off-page`); they still read as off
   (dashed edge, no fill). `phone-game-contrast.spec.ts` now fails on
   disabled text under its ratio. Dimmed icon keys are still only
   reported.
3. **The refused K key hold.** Not reproduced any more; since 53j the
   answer is worked out before anything changes. A second judgement
   after the keyboard had folded was still there and is removed. In
   landscape a refused hold can still fold the keyboard (its room is
   read from the laid-out box).
6. **The password field swap is gone**: a phone's line is marked for
   our keyboard from its construction (ADR 0142, first addendum).
   Until the phone chunk has loaded only a physical keyboard types.
7. **`MapPane.forwardHidden` is gone** (dead).

Also, on the owner's word: on a touch device with the desktop cockpit
(`?tablet=desktop`, Desktop site) the line is a password field while a
password is asked for (d3c8eb86; ADR 0142, second addendum).

Pictures: `docs/stages/img/56-menu-notice-*.png`,
`56-disabled-*.png`.

### 56b (merged 98b1ad8c): the menu pages at tablet width

Nothing was broken at 820 × 1180 or 1180 × 820: no sideways scroll,
nothing cut off, no hover-only control, no field under our keyboard.
The pages lay themselves out by their own width and already took their
desktop arrangement; on top of that came the phone's compact buttons.

- **Fixed:** in a tablet-size window (`html.wc-phone` and both sides
  600 px or more, as 54a judges it) the kit's buttons are the
  desktop's (12 px type, icons) with a 44 px floor; options, tabs,
  toggles, rows and inputs go from 40 to 44 px; the targets under
  44 px on Profile, the manual, the script editor's Find, About's
  rail, Export's title, Scripts' settings and the Spotlights viewer's
  controls are 44 px. Phone and desktop were compared pixel by pixel
  before and after: identical.
- Side effect: Export's foot wraps to two lines in portrait.
- New `tests/e2e/phone-tablet-pages.spec.ts` (14 tests). Pictures
  `docs/stages/img/56-tablet-*.png`.
- **Left:** L1 the start menu's rows are 38 px (the first paint and the
  morph share that measure); L2 in the game layer the settings'
  segments and the rating's Clear are 36 px (ADR 0140: kept as the
  phone's); L3 the event markers on the Spotlights track (32 px) and
  the run log's rail (about 20 px) cannot grow without overlapping;
  inline links in About's text.

### For the owner: questions of taste at tablet width

Pictures in `notes/research/tablet-pages/`.

- **T1** Start page upright (`start-portrait.png`): the menu box is in
  the upper half, the lower 45 % empty sky. Centre it, or give a
  tablet the desktop's row sizes (which also settles L1)?
- **T2** Help and the manual (`profile-help-portrait.png`,
  `script-manual-landscape.png`): the text column stops at about
  600 px with 180 to 230 px empty beside it. Let the text take the
  width, or keep the rail in portrait?
- **T3** Script editor (`script-editor-kbd-landscape.png`): the tools
  float as icon keys over the code's corner, as on a phone; a row with
  labels on a tablet? With the keyboard up in landscape the completion
  list covers the code.
- **T4** Run log upright (`run-log-portrait.png`): the hood plate
  covers part of the header line. Shorten the header or start it right
  of the plate?
- **T5** Menu sheet and settings on its side
  (`game-sheet-landscape.png`, `game-settings-landscape.png`): full
  width, label and control about 1100 px apart. Cap the column at
  about 720 px, centred?
- **T6** Dialogs with the keyboard, upright
  (`profile-new-portrait.png`): the dialog stays at the top, 370 px of
  empty room above the keyboard. Nearer the keyboard?
- **T7** Profile list upright (`profile-list-portrait.png`): the box
  is as high as its content. Fine, or a taller list?
- **T8** Icons on the buttons came back on a tablet with the desktop
  buttons. Keep, or the phone's icon-less ones?

### 5. `opponent-hits` words (2026-11-13): not confirmed from logs

`/home/ole/MUME` holds no session log with GMCP payloads (`logs/` has
only `debug.log` and `ui.log`; no file but docs and Lua mentions the
field). What it does show: Cockpit's `lua/core/group_collector.lua`
applies `opponent-hits` and `buffer-hits` straight onto a group
member's `hp_string`, and `docs/gmcp.md` gives them as `"healthy"`,
`"fine"`, …: the same words as `hp-string`, which is what
`src/gmcp/bands.ts` has (dying, awful, bad, wounded, hurt, fine,
healthy). That has worked in the owner's own play in Cockpit. So the
list is very likely right, but no raw packet was seen. Left as it is;
a wrong word would show as a fight card bar that does not move.

### 56c (merged d3128ebc): the questions of taste, as built

All scoped to a tablet-size window (as 56b), but T4, which is a
phone's too. Pictures `docs/stages/img/56-tablet-t1…t6-*.png`.

- **T1** The start menu is centred in portrait (about 275 px of sky
  above the mark and below the quote at 820 × 1180) and has the
  desktop's rows (42 px, Enter 56 px). One variable,
  `--wc-start-drop` in `src/start/geometry.css`, feeds the first paint
  and the page, so they agree. In landscape the group nearly fills the
  height and is not centred (118 px above, 80 px below). Over a
  sub-page the wordmark goes back to its old top.
- **T2** Help in portrait has its rail (228 px) beside the text. The
  manual's text column is centred in its room, not widened: its cap
  already gives 85 to 95 characters a line.
- **T3** The script editor has Save, Find and Manual as named 44 px
  buttons: in the box head in landscape, in a strip of their own under
  the head in portrait (54 px of height; beside the plate a long
  script name ran over Save). Desktop keeps its icon pill. With our
  keyboard up in landscape the completion list is four rows and opens
  under the caret's line; near the bottom it still flips above.
- **T4** The player's header chip ends left of the hood plate, with an
  ellipsis. On a 360 px phone that leaves "Rasta (…": little of the
  chip. The owner (2026-11-13): nothing needs doing about it.
- **T5** The sheet, Exit session, the settings pages and pick lists
  are a centred 720 px column; the grounds stay full width.
- **T6** With the page keyboard up a kit dialog stands in the middle
  of the room above the keys.
- T7 and T8: no change.
- Unverified: a real iPad (the centring uses `100vh`; a tall safe area
  shifts it); the wordmark's slide between menu and sub-page seen as
  one still only; T3 in Paper and for a read-only script.

### The whole stage on `main`

Typecheck clean, unit 4229. Full e2e: see the session log in
`progress.md`. Bundle against 0.8.3: `chrome` JS 280.0 → 235.0 kB,
`app` 228.6 → 224.9 kB, phone JS 125.1 → 130.2 kB, phone CSS 59.1 →
68.0 kB, `chrome` CSS 117.0 → 118.0 kB.

Flaky, not from these stages: `phone-script-editor.spec.ts:76` (the
signature pop-up's place) failed 6 of 30 on an untouched `main` at
3 workers. Open.

**The owner, 2026-11-13: do as recommended** on the questions of
taste. Read as: T1 centre the start menu on a tablet (the desktop's
row size too if the first paint allows it); T2 the rail beside Help in
portrait, the text column not lopsided; T3 a tools row with labels and
a completion list that leaves the typed line in view; T4 the header
ends left of the hood plate (phone too); T5 the sheet's and settings'
column capped at about 720 px, centred; T6 a dialog in the middle of
the room above the keyboard; T7 as it is; T8 the icons stay. Round 56c.

## Test guide (for the owner): phone and iPad, closing

On `main`, not released: stages 55 and 56 together. The dev server
over the tailnet (ADR 0096; `npm run dev:tailnet` if it is not up):
`https://<machine>.<tailnet>.ts.net:5173/`. This guide replaces the
older open device tests.

**Phone**

1. The game, a quick round: nothing should have changed. The screen
   stays on while connected.
2. Hold a K key: the box is low. Custom empties both fields, the caret
   is in Label, Save is in view with the keyboard up. With the browser
   outside fullscreen too. Does it read well?
3. Menu sheet: A− at the smallest text size and "Not connected" in
   Comm's reply are readable but clearly off.
4. Log in and reach the password prompt: only our keyboard, the
   password as bullets. (New: until the phone layout has loaded nothing
   can be typed. Do you ever notice the wait?)
5. History → a run: the bar, the small lens in the top right corner,
   the strip and Comm from the lens, seeking back with them open. On
   its side too.
6. Spotlights: a card as text.
7. "Desktop site" in the browser's menu: the desktop cockpit; at the
   password prompt the device's keyboard offers no suggestions. Off
   again: the phone layout, settings as they were.

**iPad**, both orientations

8. Opens in the phone's layout with no flag in the address.
9. The same round as 1, 2 and 5 (the bar has To start, the speed
   arrows and the length).
10. The start page upright: the menu centred, larger rows. Does the
    page come up without a jump?
11. The start menu's pages: Profile (New: the dialog above the
    keyboard), Help (the rail beside the text), Scripts and its editor
    (Save, Find, Manual as named buttons; type with the keyboard up on
    its side: is the typed line in view under the suggestions?),
    History, Spotlights, About. Buttons are the desktop's with icons,
    thumb-size.
12. In the game on its side: the menu and Settings as a centred column.

Not possible here, only on your devices: all of it in Safari, the
home indicator's edge, the window's real height on its side.

## Owner feedback

**2026-11-13, the closing test on phone and iPad** (stages 55 and 56
together, the dev server over the tailnet): the owner went through the
guide in broad strokes and has no comments. Go for the release of both
stages as one version. Nothing was asked to be changed; T1–T8 stand as
built in 56c.
