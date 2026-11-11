# Stage 52 — The phone's layout, round 2

Status: **Next** (written 2026-11-11 as the handoff from stage 51; nothing
built, no plan yet).

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

(To be filled in at the start of the session.)

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

- [ ] The owner's list taken in and sorted with A–E into rounds
- [ ] (rounds to be written)

## Owner feedback

(After each round.)
