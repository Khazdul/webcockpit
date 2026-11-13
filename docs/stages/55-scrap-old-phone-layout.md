# Stage 55 — Scrap the old phone layout

Status: **Owner testing** (built 2026-11-13; on `main`, not released).

## Goal

One phone layout in the code. The old one (ADR 0075: tab strip, `☰`,
ESC menu, the Options hub in the cell-grid look) goes, with the
device-keyboard code kept from before stage 53. This is stage 52's
pass C (`docs/stages/52-phone-round-2.md`, C) and the first of the two
stages that finish phone and tablet (handoff of 2026-11-13 in
`progress.md`).

The old layout still serves four things; each gets a replacement first:

1. The run log player and Spotlights on a phone or tablet.
2. `?phone=1` in a desktop-size window (desktop e2e specs).
3. A phone in the browser's "Desktop site" mode.
4. The fallback when the phone chunk fails to load.

## The order agreed with the owner (2026-11-13)

1. Test baseline: the full e2e, the flaky cases, the bundle size.
2. **Stage 55** (this file): scrap the old phone layout.
3. **Stage 56**: loose ends (stage 52 D) and the menu pages at tablet
   width.
4. One test guide for phone and iPad together, then a release.

## Owner decisions (2026-11-13)

- **Player and Spotlights on a phone or tablet:** reuse the game's
  phone layout. No mockup. Keep the theme; phone mode does not need
  needlessly many options. "Fairly like today, but freshened up from
  our phone / tablet layout."
- **"Desktop site" chosen on a phone:** the player asked for the
  desktop version and gets the desktop cockpit; they manage as best
  they can.
- **Comm gets no send button** (stage 52 D6: closed).
- **No compact Statistics for the strip** (stage 52 D5: closed; the
  owner comes back to it if needed).
- **Old-look pages:** the profile prompts were moved to the look kit
  in stage 53 (checked: `docs/stages/53-own-keyboard.md`, "Profile
  prompts in the new look"). What is left in the old look on a phone
  (the ESC menu, its Options, Statistics, Exit) is reached only in the
  old layout and goes with this stage.
- **Old owner device tests are struck** (30e; 30f items 5, 9, 10; the
  stage 52 and 53 guides; stage 52 B3 and B4). The closing test guide
  replaces them. Only the owner can see: the iPad taking the tablet
  path with no flag on the live site, and the screen staying on while
  connected. A real Android tablet stays untested.
- Fullscreen on iPhone and iPad is not touched (decided in stage 54).

Decided by the session (technical): the chunk-failed fallback becomes a
plain notice with a reload; stage 52 D1–D4, D8, D11, D12 are closed as
accepted limits; D7 and D9 are fixed in stage 56; D10 goes with this
stage.

## Risks looked at: "Desktop site" gives the desktop cockpit

- Detection is "a phone's screen, but a window that is not a phone's"
  (`phoneGameWanted` in `src/app/shell.ts`). A phone in its normal mode
  never has such a window, and a split screen only makes it smaller, so
  a phone should not land on the desktop by mistake.
- On the desktop cockpit a phone has the device's keyboard, small text
  and no automatic login. Taken as the player's own choice.
- A tablet is not affected: iPadOS asks for the desktop site by
  default, so there the request says nothing; `?tablet=desktop` stays
  the way to the desktop cockpit (ADR 0140).

## Test baseline (2026-11-13)

- Bundle (production build, `main` at 0.8.3): phone chunk 125.1 kB
  (gzip 40.5), phone CSS about 59 kB. For comparison, built from the
  tags: 0.7.0 112.7 kB, 0.8.0 124.7 kB. Stage 54 added 12 kB; the
  0.8.1–0.8.3 fixes 0.4 kB. `app` chunk unchanged at 228.6 kB.
- Full e2e at 5 workers (2026-11-13, `main` at 0.8.3): the run was cut
  off at 1249 of about 1370 with one failure, the known
  `scripts-settings.spec.ts:411` on Chromium. The phone project was run
  again whole: 465 passed, 5 failed in one clump, at the moment a
  source file was edited under the running dev server; the two files
  alone afterwards 42/42. So: nothing failing but the known case.
- `scripts-settings.spec.ts:411` (stage 52 E1) was a real defect: two
  fast clicks on a script's switch flipped it once, because the second
  click read the row's stale state. Fixed (abb9d15e).
- `script-panes.spec.ts:177` (E2) was not order-dependent: alone on
  Chromium it failed about two times in five, clicking the temporary
  pane's link before the pane had drawn its row. The spec waits for
  the row now; 10/10 (d091a44f).
- `phone-auto-login.spec.ts` six times over at 5 workers: 132/132. The
  single failure at 0.8.3 did not come back; left.
- Unit: 4221 passed.
- Not done: E3 (load-sensitive desktop cases in full parallel runs).
  The rule that holds: full runs at 5 workers, and no source edits
  under the dev server while one runs.

## Plan

The investigation is `notes/research/stage-55-plan.md` (file and line
references, the dead code list, the specs affected). In short:

- The old layout lives in `src/layout/cockpit.ts` and
  `src/layout/phone.ts`; the player gets it because `src/app/app.ts`
  drops `phoneGame` for player Apps. The exported HTML replay never
  runs phone code and is not affected, but `player-host.ts` is bundled
  into it and must never value-import `src/phone`.
- The player on a phone or tablet: the same `PhoneLayer` with a
  `replay` dependency (no compass, hot keys, keyboard, menu, wake lock,
  automatic login or defaults patch; Comm read-only without search;
  no Statistics page). The host keeps the layer's state over the
  rebuild a backward seek makes. Nothing is written to the viewer's
  settings.
- Spotlights' viewer stays text only, as on desktop, without the two
  empty rows of today.

Decided by the session, in the owner's direction ("fairly like today,
freshened up"; he sees them in the test and can turn them):

- **Transport:** today's control row, docked where the command row is
  in the game, always shown; the rail stays at the right edge.
- **The way out:** the bar's first key, where the menu key is in the
  game; no Back at the top left on a phone (it would lie on an open
  strip or Comm).
- In the phone player the Panes popup goes; Display (text size, theme)
  stays. Band heights and a moved lens last while the player is open.
- `?phone=1` stays and means "a phone at any window size" (the phone
  specs, shot scripts and benches use it); it never makes a tablet.
- Desktop site: a touch device found on a phone's screen in a window
  that is not a phone's is `touch` only. New-user defaults follow the
  device, not the mode.
- Chunk failed: one plain cover with a Reload button.

### Rounds

| Round | What | Ends in |
|---|---|---|
| 55a | Replay plumbing, nothing switched: allocator without a command row, `Cockpit.phoneReplay`, the layer's `replay` mode and state hand-over, Comm read-only, the theme mark on the cockpit, the player's font minimum | unit green, e2e unchanged |
| 55b | Device and shell: Desktop site, `?phone=1`, defaults, the chunk-failed cover; the desktop specs on the old ESC Options deleted | Desktop site gives the desktop cockpit |
| 55c | The player switched over: docked transport, exit key, Spotlights, new phone player specs | run log and Spotlights in the new layout |
| 55d | Deletion, eager side (layout, shell, viewport, CSS) | full e2e green, bundle measured |
| 55e | Deletion, chrome side (ESC main, Options frames, old Statistics page) | the same |
| 55f | ADR, test guide, session log | owner test |

55a and 55b run side by side; 55c after both; 55d and 55e side by
side after 55c. The password field swap in `src/ui/input-pane.ts` is
the riskiest deletion and goes last or to stage 56.

To verify on a device (the owner's test): Android Chrome's Desktop
site keeps `screen.width` at the phone's width while the window grows
to about 980 px; iPhone Safari's desktop request; page zoom below
100 % on a phone.

## Tasks

- [x] Owner decisions taken in; stage file
- [x] Test baseline: full e2e, flaky cases
- [x] Investigation and plan
- [x] 55a replay plumbing
- [x] 55b device and shell switch-over
- [x] 55c the player switched over
- [x] 55d deletion, eager side
- [x] 55e deletion, chrome side
- [x] ADR 0142, test guide, session log
- [x] The owner's test; then the release

## Built

### 55a — replay plumbing (merged 4885d374; nothing uses it yet)

- `allocatePhoneGame({ inputRows: 0 })`: no command row.
- `CockpitOptions.phoneReplay?: { bar: boolean }` with `phoneGame`:
  `bar` keeps the command row's rows for the player's transport bar.
  The cockpit marks its own theme (`data-ph-light`) and `phone.css`
  reads that, so a Paper recording is Paper inside the player.
- `AppOptions.phoneReplay`; a player App passes `phoneGame` through.
- `mountPhoneLayer(deps)` takes `PhoneLiveDeps` or `PhoneReplayDeps`
  (`replay: { omitPages, state?, onState? }`; `settings` is the host's
  in-memory store, where band heights and the lens place go). A replay
  layer has no compass, hot keys, keyboard, menu, wake lock, defaults
  patch or automatic login.
- `CommPane.setPhoneMode(on, { readOnly })`: no reply line, no search.
- `playerFontSize(…, min)`: the minimum grid as a parameter.
- Found: the lens and the strip's panes draw whatever `panes[id].on`
  says in this layout; the host forces nothing.
- Unit 4258 (+37). Phone chunk 126.6 kB (+1.5), `app` 229.5 kB (+0.9).
  Not seen in a browser: no caller yet (55c).

### 55b — device and shell (merged)

- `DeviceFlags.desktopSite`: a touch device found on a phone's screen
  in a window that is not a phone's is `touch` only and gets the
  desktop cockpit. `phoneSizeWindow` is in `src/core/device.ts`;
  `phoneGameWanted` is gone, `Shell.phoneGame` is `device().phone`.
- `?phone=1` forces `phone` and `touch` at any window size, never
  `tablet`.
- New-user defaults (settings, first paint, bundled scripts) follow
  the device: `phone || desktopSite`.
- `src/app/phone-failed.ts`: the cover with Reload when the phone chunk
  does not load or its mount throws. The `☰` fallback is gone.
  `Shell.openMenu` on a phone waits for the layer.
- Specs: `esc-options.ts` and the nine desktop tests on the old Options
  frames deleted; Paper palette, cursor blink, Reset appearance and the
  preview ported to `settings-popup.spec.ts`. Seven phone tests of
  "`?phone=1&tablet=desktop` in a wide window keeps the old layout"
  converted to `?tablet=desktop` or deleted (each had such a sibling).
  New: Desktop-site cases in `phone-tablet.spec.ts` and
  `phone-new-user.spec.ts`, `tests/e2e/phone-screen.ts`.
- `index` chunk 29.2 kB (+0.9).
- Left for 55d: `syncDeviceKeyboard`, `openMenu`'s `preselect`. Left
  for 55f: ADR 0075 and 0140 still describe the old rules.

### 55c — the player switched over (merged d67480a6)

The run log player on a phone or tablet is the game's phone layout
over the recording (lens, strip, read-only Comm, bands, unread badge);
pictures `docs/stages/img/55-player-*.png`, made by
`scripts/player-shots.ts`.

- **Bar**, docked where the command row is, never hidden. Under
  600 px: Exit · −10 s · Play/Pause · +10 s · Speed · position ·
  Display. From 600 px (tablet): also To start, the `‹ 1× ›` stepper
  and `position / length`.
- Choices made in the build, the owner's to turn: speed on a narrow
  bar is one key that steps and wraps (8× → 0.25×); the keys go from
  44 to 40 px wide in History's box at 360 px; the header (identity
  chip only, no key hints, left-aligned) hides after 6 s in pause too;
  the lens stands 24 px lower and 32 px further left than in the game;
  no Fullscreen and no Panes popup; Exit is a Back chevron.
- Spotlights' viewer: `phoneReplay: { bar: false }`, no layer, text at
  the recorded size (it wraps instead of shrinking to 60 columns).
- The host owns an in-memory settings store and the layer's state over
  rebuilds; `PhoneReplay.clear` (what the host's chrome covers) was
  added to 55a's API. A phone chunk that fails makes `makeHost` return
  an error under the Reload cover. Nothing reaches the old layout on a
  phone any more.
- Specs: `phone-player-tabs` and `phone-player-map` deleted; new
  `phone-player-layout.spec.ts`; `phone-player.spec.ts` rewritten.
- Unit 4262. Phone 476/476, Chromium 440/441 (`appearance.spec.ts:34`,
  4/4 alone), Firefox player and Spotlights specs 35/35, all with
  `TMPDIR` moved.
- Bundle: phone JS 126.9 kB, phone CSS 63.9 kB (+4.8), `player-host`
  33.7 kB (+3.5), `replay.js` +3.4 kB with no phone code in it.
- Open: the header chip lies over the first text line while shown
  (as on desktop); a moved lens can be dragged under the rail's touch
  area; script panes open in the strip are not restored over a
  backward seek if their record has not replayed yet; the browser's
  back gesture and a recording over an hour are not tested; nothing
  seen on a device.

**A committed `node_modules` link destroyed the main checkout's
`node_modules`** at this merge: `.gitignore` had `node_modules/`, which
does not cover a symbolic link, the worktree's link was committed, and
the merge replaced the ignored directory with it. Untracked again,
`.gitignore` now says `node_modules`, `npm ci` restored the directory.
Worktree agents must never `git add` the link.

### 55d — deletion, eager side (merged 854b328b)

- Gone: `src/layout/phone.ts` (its three constants and `phoneNawsCols`
  moved to `phone-game.ts`); the cockpit's tab strip path and device
  keyboard handling; the allocator's `guard` input; the device keyboard
  state in `phone-viewport.ts` (`wc-kbd`, `keyboardUp`, the baseline
  logic; the `?vv=1` readout lost `kbd`); `Shell.syncDeviceKeyboard`
  and `openMenu`'s `preselect`; the old CSS in `layout.css`, `ui.css`
  and `phone.css`.
- **The `phoneGame` option is gone** from the cockpit and the App: with
  the phone flag on, the cockpit is the phone layout.
- `Cockpit.selectTabAt` / `App.phoneTabKey` are `phonePageKey`. The
  phone's menu key no longer carries the class `wc-menu-btn`.
- Left on purpose: the password field swap in `src/ui/input-pane.ts`
  (not dead: it covers a password prompt reached before the phone layer
  is up; ADR 0142 §5); `MapPane.forwardHidden`.
- 19 unit tests went with the code.

### 55e — deletion, chrome side (merged fa7e331d)

- Gone: `esc-main.tsx` (`EscMain`, `ExitConfirm`), `options.tsx` and
  the five `options-*.tsx` / `comm-options.tsx` frames, the old
  Statistics page (`frames/statistics.tsx`), `banner.tsx`,
  `kit/scroll.tsx`, most of `kit/widgets.tsx`, `kit/nav.ts` and
  `kit/kit.css`. What the Settings popup and the windows still use
  moved to the model files (`pane-options-model.ts`, `mapper-model.ts`,
  `weather-model.ts`). The overlay opens only Profile and Scripts.
- The building agent was cut off in its test phase and gave no report;
  the round was verified on `main` after the merge instead.
- Merge conflict in `Shell.openMenu` (both rounds changed it): 55d's
  signature with 55e's narrowing. After both: `NOT_ON_PHONE` and the
  start page's `wc-kbd` rule removed (6f8f3d5c).

### The whole stage on `main` (6f8f3d5c)

- Typecheck clean. Unit 4205.
- **Full e2e at 5 workers, `TMPDIR` moved, a quiet machine: 1354
  passed, none failed.**
- Bundle against 0.8.3: `chrome` 280.0 → 235.0 kB, `app` 228.6 →
  224.9 kB, phone JS 125.1 → 126.9 kB, phone CSS 59.1 → 63.7 kB,
  `player-host` 30.2 → 33.8 kB, `index` 28.3 → 29.2 kB.
- 7 400 lines removed and 3 700 added in source, tests and scripts.
- ADR 0142.

### After 55a + 55b on `main`

Unit 4261. Full e2e at 5 workers: 1347 passed, 6 failed; five passed
alone, `phone-own-keyboard.spec.ts:191` crashed the page every time.

**The crash is the machine, not the code** (found 2026-11-13): it
crashes the same on the commit before both merges, and passes with
`TMPDIR` moved off `/tmp`. `/tmp` is a 16 GB tmpfs that stood at 87 %
(old session scratch directories); Playwright's Chromium keeps its
shared memory there, and the renderer's compositor thread dies
(`coredumpctl`: 57 `chrome-headless-shell` SIGTRAPs that day). Much of
the "Target crashed under load" of this and earlier sessions is likely
this. **Run e2e with `TMPDIR=/var/tmp/wc-pw`** until `/tmp` is cleared.

## Test guide (for the owner)

On `main`, not released. The dev server over the tailnet (ADR 0096):
`https://<machine>.<tailnet>.ts.net:5173/` on the phone and the iPad.
The game itself should be exactly as in 0.8.3; what is new is the
player, Spotlights and the edges.

1. **Nothing changed in the game.** Enter MUME on the phone: layout,
   keyboard, menu sheet, Profile and Scripts from the menu, Exit
   session. One quick round is enough.
2. **Run log player** (start page → History → a run → play), phone,
   upright. Wanted: is the bar right (Back, −10 s, Play/Pause, +10 s,
   speed, time, Display)? The speed key steps 1× → 2× → … → 8× → 0.25×
   on each tap: good enough, or do you miss the two arrows? Are the
   keys large enough in History's box? Open the strip and Comm from the
   lens while it plays; drag the rail at the right edge to seek.
3. **The same on its side**, and on the iPad in both orientations (the
   iPad has To start, the speed arrows and the length too).
4. **Seek backwards** with the strip and Comm open: they should stay
   open on the same page.
5. **Display** (the last key): text size and theme. A run recorded in
   Paper should be Paper inside the dark page, and the reverse.
6. **The way out:** the Back key at the bar's left. Does it feel right
   there, with no Back at the top left? The browser's back gesture: say
   what it does.
7. **Spotlights** on the phone: a card plays as text only, at the
   recorded text size, lines wrapping. Better or worse than the small
   text of before?
8. **"Desktop site"** in the phone's browser menu (Android Chrome, and
   the iPhone if at hand): the page should reload as the desktop
   cockpit. Say what you get. Switch it off again: the phone layout,
   your settings as they were.
9. The pictures of what was built: `docs/stages/img/55-player-*.png`.

Not for you to test: the cover with Reload when the phone layout cannot
be loaded (it needs a broken connection at the right moment).

## Owner feedback

### 2026-11-13, the phone, on the dev server

"Otherwise it works well." Two things:

1. **The K key's settings box** (not from this stage, found now): after
   Custom the Save row is sometimes hidden, because the keyboard comes
   up and the box no longer fits. Wanted: the box reworked to take much
   less room, above all in height; clearer that it scrolls when not
   everything fits; and Custom clears the label and the command fields
   and puts the caret in the label field.
2. **The lens in the run log player:** smaller, and as high up to the
   right as it goes. Its outer width no more than about 33 % of the
   player's width upright and about 50 % of the height on its side; a
   default size relative to the player, not fixed in pixels.

Both built the same day and merged; the owner said go on both
("kör på detta") after reading what was built.

**The lens in the player** (merged 32c9fa0f):

- `lensReplayPx` (`src/phone/lens-zoom.ts`): the outer measure (glass
  and the 8 px ring) is 33 % of the player's box width upright and
  50 % of its height on its side, rounded down; the glass never under
  96 px nor over 190 px. Measured: 114 px at 360 × 800 (31.7 %), 180 px
  at 800 × 360, 206 px on the tablet.
- In History's box on a 360 px phone the box is 330 px wide and the
  minimum wins: 112 px, 33.9 %. Under 96 px the Comm key reaches the
  zoom pips.
- Place: the ring 40 px from the player's right edge (the Comm key
  clear of the rail's touch area and a marker icon) and 4 px from the
  top; the header chip is cut left of the lens. In History's box on a
  phone it stands under the hood plate, as before, because its panes
  key would lie under the plate. Accepted by the owner as built; 14 px
  further right is one constant (`PHONE_CLEAR_RIGHT`) if wanted.
- The player no longer takes over a lens moved or resized in the game
  (`phoneReplaySettings` in `player-host.ts`). The game's lens is
  untouched.
- `PhoneReplay.clear` is `{ right, plate }` now; the host finds the
  hood through `.wc-lk-box > .wc-lk-hood` (a class-name coupling).

**The hot key box** (merged b042375f):

- Cause: the box was 416 px tall and scrolled as one piece with Save
  last and no scrollbar; in a window under about 746 px high with our
  keyboard up Save was out of sight. Not reproduced at exactly
  360 × 800; taken to be the S21 with the browser's bars showing.
- Now 268 px at 360 × 800 (312 px with six keys): Label and Command
  side by side with captions cut into their frames, the picks and
  Custom as chips, the two specials side by side, the key's name a
  plate on the top edge. The foot (would-send line, Shown, Cancel,
  Save) is pinned and never scrolls. In landscape the box is up to
  420 px wide and the foot one row.
- Overflow: a fading edge with a small arrow on the side that has
  more, and a thin scrollbar, only when it overflows.
- Custom empties both fields and puts the caret in Label; Enter in
  Label goes to Command while that is empty, Enter in Command saves.
- Side effect: the lower box hides fewer panes on a hold (neither the
  strip nor Comm when only one is open at its default height).
- Known: at about 780 × 290 the chip row is half cut under the arrow;
  the would-send line is cut with an ellipsis in the landscape foot;
  "wimpy 50 % HP" for "wimpy 50 % of current HP"; the headings
  "Commands" and "Specials" are gone. Pictures
  `docs/stages/img/55-kbox-*.png`.
- New spec `phone-hotkey-box.spec.ts` (12 tests).

After both on `main` (b042375f): typecheck clean, unit 4227. Phone JS
129.5 kB, phone CSS 66.4 kB, `player-host` 34.7 kB.


## Owner feedback, closing test (2026-11-13)

Tested together with stage 56 on phone and iPad, in broad strokes
(guide in `docs/stages/56-phone-tablet-loose-ends.md`): no comments.
Go for the release.
