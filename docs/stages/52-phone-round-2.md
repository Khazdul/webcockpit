# Stage 52 — The phone's layout, round 2

Status: **Owner testing** (plan written 2026-11-11 from the owner's list;
branch `stage-52-phone-round-2`).

## Goal

Improve the phone's game layout iteratively from the owner's use of
0.5.0 on a real phone. The owner brings a list of proposals to the next
session; this file holds what was already known when stage 51 closed, so
nothing is lost. The session starts by asking the owner for the list,
then sorts it together with the items below into small rounds, each
ending with something to test on the phone.

- Design and decisions so far: ADR 0136 and its "as built" addendum.
- What was built and why: `docs/stages/51-phone-layout.md` ("Built").
- Rules of stage 51 still hold: desktop and tablet do not change; the
  chunk rule (`src/phone/*` imports app modules as types only, values
  through `PhoneKit`); settings compared by value; keys send only in
  play; nothing new per frame or per incoming line; never the real MUME
  from tests.
- Tools: `node scripts/phone-shots.ts <step>` (screenshots of every
  state, dark and Paper), `node bench/phone-bench.ts` (text speed; compare
  against `main` in alternating runs on a quiet machine, see
  `bench/results/phone-51-compare.md`).

## The owner's proposals

Given 2026-11-11 after using 0.5.0 on a Samsung S21 (360 × 800 CSS px),
with answers to four follow-up questions. Everything here is the phone's
game layout only.

### Answers to A (decisions)

- A1 theme swatch: OK as built.
- A2 lens in landscape: **changed**, see "Landscape" below.
- A3 defaults: wake lock on is OK. Vibrate is **removed** (see below).
- A4 hot keys: `#3 north` is OK, and **several commands with `;` are
  allowed** on one key. This replaces ADR 0136 §8 "one command per key".
- A5 `rescue`: fine as a quick pick.
- A6 map mark with focus: leave as it is for now.
- A7 fullscreen map: skipped.

### Answers to B (live checks)

- B2: `change wimpy 0` sets wimpy to 0, which is the same as off. The
  specials keep never sending 0.
- B5: weather runs well on the owner's phone.
- B1, B3 (wake lock only), B4, B6: still open; the owner asked what to
  confirm for B3 (answer: that the screen does not dim or lock while
  connected).

### C, D, E

- C (scrap the old phone layout): a separate pass after the fine tuning.
  **Now:** the "are you sure" screen of Exit session is still the old
  look on the phone; give it the new look.
- D and E: no comment; they stay as listed.

### New requests

1. **Keyboard in fullscreen (Android).** Without fullscreen the command
   field sits just above the keyboard. Entering fullscreen with the
   keyboard up leaves the field far above it (stale size). In fullscreen
   the keyboard's top row covers the field (about 44 CSS px too low).
   Wanted: as without fullscreen.
2. **The pane strip is resizable** like Comm.
3. **Live resize.** Dragging Comm's (and the strip's) band redraws while
   dragging, not only on release.
4. **Height limit in portrait.** The strip and Comm together can never
   reach under the quick buttons: the limit is the top of the place of
   three K keys, whether they are shown or not.
5. **Dynamic lens.** Opening Comm no longer hides the lens. With room it
   has its full size; as the strip and Comm take room it shrinks, down
   to the smallest sensible size, and only then hides. The size setting
   goes. Full size is 150 px on the owner's 360 px wide phone and should
   feel the same on other phones (so: a share of the screen's short
   side).
6. **Landscape.** The lens shows at the top right with its three keys,
   moved left so it stands left of the K keys. The strip and Comm open
   from the **left** as one column (strip above, Comm below), full
   height, resized sideways; the menu key and the command field move
   right to make room.
7. **K keys: 1–6**, chosen in settings. Above three, a second column to
   the left of the first.
8. **Settings sub-page for Timers and Group** with the relevant
   settings. Herblores off by default (phone only; the owner's phone is
   set once too).
9. **Character off by default** in the strip (phone only, set once on
   the owner's phone too).
10. **Unread on the lens's Comm key:** asked whether it shows missed
    private messages; it must.
11. **Menu sheet:** no grab handle look above MENU (it is not
    draggable); a "close" key left of EXIT SESSION.
12. **Settings names:** "Compass" becomes "Quick buttons". The vibrate
    row and feature are removed.

## Plan

Rules of stage 51 hold (see Goal). Each round: one building subagent,
checks and screenshots by the main session, a fresh reviewer, fixes,
commit. Decisions of this stage go in ADR 0137.

### 52a Menu, settings, hot keys, defaults

- Sheet: handle removed, close key left of Exit session (11).
- Exit session's confirmation in the phone's look (C).
- Settings: Compass → Quick buttons; vibrate removed with
  `phone.vibrate` and `haptics.ts` (12); number of K keys 1–6
  (`phone.hotkeyCount`, default 3), second column left of the first, K4
  lowest (7); lens size row removed (5, the sizing itself is 52b).
- Timers and Group sub-page (8), writing the same keys the desktop gears
  write.
- Phone defaults: Herblores off, Character off in the strip; applied
  once to an existing phone (a `phone.defaults` mark) (8, 9).
- Hot keys accept `;` (A4).
- Unread badge: verify with a test that a private tell counts (10).

### 52b Portrait: resize, limit, dynamic lens

- Strip resizable by a band at its lower edge (`phone.stripRows`).
- Live resize for both bands: relayout while dragging, at most once per
  frame and only when the row count changes; one NAWS on release.
- Limit: strip + fight card + Comm end above the place of three K keys.
- Lens: full size `round(short side × 150 / 360)` clamped to 130–190 px;
  shrinks in whole cells to 96 px; hides below that (its keys then show
  as the row, as today). Comm open no longer hides it.

### 52c Landscape

- Left column for the strip (above) and Comm (below), full height
  including the command row's rows; a band at its right edge is dragged
  sideways (`phone.sideCols`), live. Both open: the strip takes about
  40 % of the rows. The game, fight card, menu key and command field use
  what is left.
- Lens at the top right, left of the K columns, with its three keys;
  same shrink and hide rule.

### 52d Keyboard in fullscreen

- Re-measure on `fullscreenchange` (fixes the stale size).
- In fullscreen, where the VirtualKeyboard API exists, take the
  keyboard's own rectangle into account (Chrome's visual viewport seems
  to be short by the system bar there). Cannot be verified without the
  device: a readout (`?vv=1`) shows the numbers so the owner can report
  them if the field is still covered.

## Carried over from stage 51

### A. Decisions waiting for the owner

1. **Theme swatch.** Black / Paper in the menu replace font colour and
   the 16-colour palette, as the desktop's Background cycle does. Fine
   for a one-tap swatch when the palette was hand-tuned on a computer?
2. **Lens in landscape.** With three hot keys shown the lens gives way
   to its key row; K brings it back. Keep, or place the lens left of the
   column when there is no room above it?
3. **Defaults.** Keep the screen on: on. Vibrate on tap: off.
4. **Hot keys.** A line with `;` is refused (one command per key), but
   `#3 north` is accepted and sends three. Refuse repeats too?
5. **`rescue`.** It is already a quick pick. The owner asked to add it:
   did he mean a default on one of the three keys, or another command?
6. **Map marks.** A script's map mark with `focus` makes the worker fit
   the view and can override the lens's three zoom levels until it ends
   (seen in the code, not in a run). Ignore focus on the lens?
7. **Fullscreen map** (owner's idea, 2026-11-11): not built. If wanted,
   a new key at the lens's bottom left. The existing key at the top
   right is the page's fullscreen and stays.

### B. To confirm in the live game or on a device

1. MUME's exact `opponent-hits` words (the fight card's right bar uses
   the list in `src/gmcp/bands.ts`; the fixture is synthetic).
2. That `change wimpy 0` turns wimpy off (the specials never send 0).
3. Wake lock held and vibration felt on the owner's phone; behaviour
   under battery saver.
4. Automatic reconnect on a really suspended tab: the order of the
   socket close and `visibilitychange` decides which case fires.
5. Weather on a phone's GPU: frame cost and how readable the top is.
6. iPhone Safari: no fullscreen key and no vibrate row (by design);
   the swipe and its fling guard; the keyboard-up states; a 16 px field
   not zooming the page. Only emulated Chromium was used in stage 51.
7. The owner's quick test of 0.5.0 on 2026-11-11 found nothing broken.

### C. Cleanup: scrap the old phone layout

The owner wants it gone. It still serves:

- the run log player and Spotlights on a phone (`src/app/player-host.ts`:
  `allocatePhone`, the tab strip, the ESC menu) — they need a layout of
  their own first;
- a phone flag forced in a desktop-size window (`?phone=1`): several
  desktop e2e specs open `/?replay&phone=1` and expect the old ESC menu
  (`chrome.spec.ts`, `comm-ui.spec.ts`, `gmcp-panes.spec.ts`,
  `timers.spec.ts`); they must be rewritten or moved, and
  `phoneSizeWindow()` in `shell.ts` can then go;
- a phone in "Desktop site" mode (wide layout viewport): gets the old
  layout today;
- the fallback when the phone chunk fails to load (old `☰` + ESC menu).

Dead or nearly dead once that is done: `EscMain` and the Options hub on
a phone, `App.phoneTabKey`, `Cockpit.selectTabAt`'s old path,
`NOT_ON_PHONE`, the old phone CSS, `tests/e2e/phone-player-tabs.spec.ts`
and `phone-player-map.spec.ts`.

### D. Known limits and loose ends in what was built

1. The lens, hot keys and compass cover the ends of the text lines they
   pass (accepted in ADR 0136 §2; no per-line wrapping).
2. Landscape: Comm's resize band passes under the hot key column at the
   right edge (the keys win; drag left of them).
3. The lens's season swap of tiles waits 5 s after a clock change; it
   can still overlap a login burst longer than that, and its work
   (about 120 files) is unchanged.
4. The single longest frame in a text burst is 31–35 ms against 27–30 ms
   on `main` (p95 equal); not attributed.
5. Statistics in the strip is the desktop view unchanged; little fits in
   the strip's height.
6. Comm has no send button (Enter sends). The reply line is disabled
   outside play.
7. The menu's status line does not carry the update / storage notice
   (it still shows in the command row).
8. The lens's place is quantised to whole cells; the reflection has no
   blur; the Paper box and sheet are derived (no mockup).
9. Disabled controls are below 4.5:1 (reported by the contrast spec, not
   failed): "A−" at the smallest size, "Not connected" in the reply.
10. The `☰` fallback look (mount throws) has no permanent test.
11. Preact is now its own small lazy chunk for every device (same
    bytes, one more request); eager JS grew by about 15 kB raw.
12. Released versions before 0.5.0 drop the `phone` settings section
    when they write settings (only matters when going back).

### E. Tests and tooling

1. `tests/e2e/scripts-settings.spec.ts:411` (chromium) fails when run
   alone, on `main` before stage 51 too: a double click on a script's
   switch flips once instead of twice. Not a phone matter; needs its own
   look.
2. `tests/e2e/script-panes.spec.ts:177` is order-dependent (fails alone,
   passes with its file).
3. Load-sensitive in full parallel runs on the owner's machine (pass
   alone): `look-kit-box:182`, `editor:370`, `appearance:34`,
   `map-tilesets:169`, `message:37`, `statistics-pane:128`,
   `player:143`; in firefox `loading:203`, `player:687`,
   `menubar:140`, `pane-buttons:257`. Consider fewer workers for the
   desktop projects.
4. `bench/phone-bench.ts`: after about 8 s of idle before the burst the
   first frame takes about 1.5 s, on `main` as well (a bench artefact,
   not investigated).
5. The local branch `stage-51-phone-layout` is merged and can be
   deleted.

## Tasks

- [x] The owner's list taken in and sorted with A–E into rounds
- [x] 52a menu, settings, hot keys, defaults, exit confirmation
- [x] 52b portrait: strip resize, live resize, limit, dynamic lens
- [x] 52c landscape: left column, lens left of the K keys
- [x] 52d keyboard in fullscreen
- [x] ADR 0137, test guide, session log
- [ ] Later pass: C (scrap the old phone layout), D, E

## Built

Decisions: ADR 0137. Commits on `stage-52-phone-round-2`: 52d 377dd86f,
52a 1e86eaf3, 52b e2d95904, 52c ce707234, 52e (the commit after it). Each round was built by a
subagent, its screenshots looked at, and its commit read by a fresh
reviewer whose confirmed findings were fixed in the next round.

- **52a:** sheet without grip and with a close key; `exit-sheet.tsx`;
  Quick buttons group, vibrate gone, lens size row gone; 1–6 K keys in
  two columns; the Timers and Group sub-page; once-only phone defaults
  (`phone-defaults.ts`); `;` on a hot key; fields blur when the keyboard
  goes down (`watchKeyboard` in `src/phone/index.ts`). The unread count
  on the Comm key already worked; two tests added. Hot key raising the
  keyboard: nothing on the key's path calls `focus()`; the likely cause
  is Chrome re-showing the keyboard while the field keeps focus, hence
  the blur. Unverified on the device.
- **52b:** strip band; live relayout with one NAWS on release
  (`holdPhoneSize`, `phoneSizeGate` in the cockpit); `maxTop` in
  `allocatePhoneGame`; the dynamic lens. Live cost at 4× CPU throttle:
  5–7 ms per row step. The limit is portrait only and off with the
  keyboard up.
- **52c:** the landscape branch of the allocator and the sideways band;
  lens left of the K columns; see-through keys and fixed sizes; time
  text off. A live sideways drag re-wraps only on-screen rows
  (16.7 ms frames at 4× throttle with 20 000 rows of scrollback).
- **52e** (owner requests and the 52c review): timer signal Pulse on a
  phone; Comm's hood and an iron divider in the landscape column; 36 px
  keys in landscape under 300 px of height (tested at 800 × 280 and
  800 × 270); orientation from the screen, so a keyboard-shrunk portrait
  window is not taken for landscape; key label outlines from
  `text-shadow` only; the lens's landscape gaps 12 px instead of 16.
- **Full e2e run after 52c:** 1116 passed, 5 failed: three firefox cases
  that pass alone (`comm-ui:35`, `layout:432`, `windows:199`) and
  `scripts-settings:411` in chromium and firefox (E1). After 52e only
  typecheck, unit (3849), the phone project (256) and the chromium specs
  near the shared edits (74) were run.
- **52d:** `phone-viewport.ts` (fullscreen re-measure, VirtualKeyboard
  rectangle in fullscreen) and the `?vv=1` readout.
- Added during the session by the owner: the keyboard raised by a hot
  key (52a), see-through keys and fixed key sizes (52c), time text off
  (52c). The `#lua` notice on his phone came from an old copy of the
  bundled `khazdul` profile (a `#TICKER {clock}` line); he removed the
  line, nothing changed in the client.
- Shared files touched (all behind the phone game path or additive):
  `layout/cockpit.ts`, `layout/phone-game.ts`, `layout/phone-viewport.ts`,
  `app/app.ts` (`onResize` through `phoneSizeGate`), `app/shell.ts`,
  `app/phone-kit.ts`, `settings/types.ts`, `settings/migrate.ts`.
- Review finding left as it is: the once-only patch got the time text
  and the signal under the same mark 1, so a phone that ran a 52a or 52b
  build keeps them (nothing with the mark was released).
- Limits left: at 800 × 270 with a fight card the lens hides (key row
  instead); the start page's Enter item could not be tapped at 800 × 280
  in a mocked session (not looked into); with the column at its widest on 844 px the command field
  is about 105 px; on a very low landscape screen (568 × 320) three K
  keys reach a fight card's rows; at the lens's smallest sizes its keys
  cover part of the map's exit label; a K key hidden by its own Shown
  switch is hard to bring back; `phone-game-panes.spec.ts` "a sideways
  swipe changes the page" is flaky under heavy load (on HEAD before this
  stage too).
- Screenshots: `docs/stages/img/52-a-*`, `52-b-*`, `52-c-*`.

## Test guide (for the owner)

On the phone, on the released version or `npm run dev:tailnet` on this
branch.

1. **Keyboard.** Type a command, fold the keyboard down: the field is no
   longer marked. Tap a hot key and a compass key: no keyboard.
2. **Fullscreen.** With the keyboard up, tap the lens's fullscreen key:
   the field stays just above the keyboard. Fold it down and up again:
   same. If the field is covered, open the page with `?vv=1` and send
   three screenshots with the keyboard up (no fullscreen; right after
   entering fullscreen; in fullscreen after down and up).
3. **Keys.** Compass and K keys are see-through; is the text behind them
   readable, and the labels too? Small in portrait, large in landscape.
4. **Lens.** Open Comm: the lens stays under it. Drag Comm's band down:
   the lens shrinks, then gives way to a row of keys; drag up: it
   returns. Any hitch while it changes size?
5. **Bands.** Drag Comm's band and the strip's band: everything follows
   the finger. Neither can go under the K keys' place.
6. **Landscape.** Turn the phone. Lens at the top right, left of the K
   keys. Open the strip and Comm: one column from the left, full height;
   drag its right edge sideways.
7. **Settings.** Quick buttons: number of K keys 1–6 (try 6 in both
   orientations). Panes → Timers and Group. Herblores, Character and the
   timers' time text are off after the first start.
8. **Menu.** No grip above MENU; the close key left of Exit session;
   Exit session's confirmation in the new look.
9. **Hot key.** Hold a key, set a command with `;` (for example
   `stand;bash`): both are sent.

Feedback wanted: transparency of the keys, the lens's smallest size
(96 px), the column's default width in landscape, anything that jumps or
lags while dragging.

## Owner feedback

- 2026-11-11: automatic reconnect and keep the screen on both confirmed
  working on the owner's phone (B3 and B4 closed).

- 2026-11-11, first use of 0.6.0 on the S21 (given at the start of
  stage 53; keyboard items only, the rest of the test guide "is OK"):
  - Folding the keyboard down unmarks the field. **But in landscape**,
    after the keyboard has been up and something was sent, every hot
    key raises the keyboard again.
  - **Portrait with the keyboard up: the whole layout disappears** and
    what is typed shows at the very top of the screen. Landscape: the
    keyboard and the layout land right. Not yet known whether portrait
    fails outside fullscreen too (asked; `?vv=1` numbers wanted).
  - The jumping he reacted to before was the rearranging running
    choppily during the keyboard's animation; hardly noticed in
    landscape.
  - Landscape with the keyboard up is usable but shows about one row of
    text; in fullscreen a few more, still cramped.

(After each round.)
- 2026-11-11, after the build summary: merge and release (0.6.0), before
  his own test on the phone. Cleanup of merged branches later. Next he
  wants a pass on a keyboard of our own (`docs/stages/53-own-keyboard.md`),
  ahead of pass C.
