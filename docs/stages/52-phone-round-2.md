# Stage 52 — The phone's layout, round 2

Status: **In progress** (plan written 2026-11-11 from the owner's list;
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
- [ ] 52a menu, settings, hot keys, defaults, exit confirmation
- [ ] 52b portrait: strip resize, live resize, limit, dynamic lens
- [ ] 52c landscape: left column, lens left of the K keys
- [ ] 52d keyboard in fullscreen
- [ ] ADR 0137, test guide, session log
- [ ] Later pass: C (scrap the old phone layout), D, E

## Owner feedback

- 2026-11-11: automatic reconnect and keep the screen on both confirmed
  working on the owner's phone (B3 and B4 closed).

(After each round.)
