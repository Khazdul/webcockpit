# Stage 51 — The phone's layout in the game

Status: **In progress** (plan written 2026-11-10; build session 2026-11-10/11). Branch
`stage-51-phone-layout` (from `main`), not to be merged or released by
the build session.

## Goal

Replace the phone's tab strip and ESC menu in the live game with the
layout the owner settled on 2026-11-10: fight card, map lens with three
keys, pane strip, Comm under the fight card, compass and hot keys, a menu
sheet and a small settings page, weather in full width, Paper.

- **What and why:** intent Goal 12 (widened to light play).
- **Every decision:** ADR 0136 (`docs/decisions/0136-phone-game-layout.md`).
  It wins over this file where they differ.
- **How it should look:** the final mockups,
  `notes/research/phone-makeover/final/canvas/*.dc.html` (read the HTML
  and CSS: sizes, colours, gradients for the ring and glass, structure).
  They were written without rendering and wrap the game text by hand;
  the real client does not (ADR 0136 §2, known limit). The owner's
  decisions round by round are in
  `notes/research/phone-makeover/README.md` ("The settled design").

| Mockup | Shows |
|---|---|
| `Main.dc.html` | fighting: fight card, lens, hot keys, compass, command row |
| `P2-walking.dc.html` | no fight card, the lens at the top |
| `P3-strip.dc.html` | pane strip open (Timers), fight card under it |
| `P4-comm.dc.html` | Comm open, the lens hidden, its keys as a row |
| `P5-rebind.dc.html` | holding a hot key: the box |
| `P6-keyboard.dc.html` | keyboard up |
| `P7-menu.dc.html` | the menu sheet |
| `P8-paper.dc.html` | Paper |
| `../round3/canvas/L5-settings.dc.html` | the settings page (drop "Left-handed") |

## Rules for the whole stage

1. **Desktop and tablet do not change.** No edit may alter behaviour with
   the phone flag off. No file under `tests/e2e/` that does not start
   with `phone` is edited, and the `chromium` and `firefox` projects stay
   green. Shared files (`src/layout/cockpit.ts`, `src/panes/*`,
   `src/map/*`, `src/weather/*`, `src/ui/input-pane.ts`,
   `src/app/shell.ts`, `src/app/app.ts`) are changed only behind the
   phone flag or by additive API; each such edit is named in the step's
   notes below.
2. **The player keeps the old phone layout.** `allocatePhone`, the tab
   strip and their tests stay for the run log player and Spotlights
   (`src/app/player-host.ts`). The new layout is turned on only by the
   live game's shell.
3. **No dead controls.** A key or a settings row appears in the step
   that makes it work, never before.
4. **Performance is a feature** (intent Goal 1). Nothing new runs per
   frame or per incoming line unless it must (the fight card and the
   unread badge update on their model's change only). Text speed on the
   phone must not drop: run `node bench/browser-bench.ts` before 51a and
   after 51g with the phone flag as far as the bench allows, and record
   both in this file.
5. **Never connect to the real MUME** in this stage. Use the fixtures
   (`?fixture=gmcp-demo.log&speed=0&phone=1`, `tests/fixtures/`) and
   `page.routeWebSocket` mocks.
6. **Nothing under `/home/ole/MUME` is touched.** No code is copied from
   it.
7. Work on the branch only. **No merge to `main`, no tag, no release, no
   push.** Small conventional commits, each with the checks of its step
   green.
8. New code is English; comments say why. Follow the existing patterns:
   settings keys through `types.ts` + `migrate.ts` (additive, no version
   bump), pure logic in its own module with unit tests, DOM in the
   phone layer.

## Structure to build (ADR 0136 §2)

- `src/layout/phone-game.ts`: pure `allocatePhoneGame(input)` → rects in
  cells for strip, fight card, Comm, game, input, and the lens's square;
  unit tests in `tests/unit/layout-phone-game.test.ts`.
- `src/layout/cockpit.ts`: an option (for example `phoneGame: true`,
  passed by the live shell only) that makes `relayoutNow` use
  `allocatePhoneGame` instead of `relayoutPhone`, and public methods the
  phone layer needs (open/close strip, select strip page, open/close
  Comm, set Comm rows, read the rects). The cockpit keeps owning and
  placing every pane shell.
- `src/phone/`: the phone layer. One class that mounts its DOM over the
  cockpit and subscribes to what it shows; one module per part
  (`fight-card.ts`, `compass.ts`, `lens.ts`, `strip.ts`, `comm-chrome.ts`,
  `hotkeys.ts`, `menu-sheet.tsx` or `.ts`, `settings-page.tsx`), pure
  models beside them (`fight-model.ts`, `hotkey-model.ts`,
  `lens-zoom.ts`), and `phone.css` scoped under `html.wc-phone` and the
  cockpit's phone-game marker so it can never match on desktop.
- Commands from keys go through `App.onCommand(text)` (aliases, echo).

## Steps

Each step ends with: `npm run typecheck`, `npm test`,
`npx playwright test --project=phone`, `npx playwright test
--project=chromium`; screenshots (below); a commit. `--project=firefox`
runs after 51a and in 51g.

### 51a Shell: allocator, command row, compass, fight card

- `allocatePhoneGame` and the cockpit option; the live game on a phone
  no longer shows the tab strip; every pane is hidden for now (the game
  and the input only). The player still gets the tab strip.
- Command row: the menu key at the far left (it opens today's ESC menu
  until 51b), the field ending left of the compass, no clock strip, no
  history key. Keyboard up (`html.wc-kbd`): full width.
- Compass (ADR §7): 40 px keys from the bottom edge, all eight keys
  always live, sent through `App.onCommand`, no focus change, hidden
  with the keyboard up.
- Fight card (ADR §3): model from `game.group.fight()` and
  `Char.Vitals`; two names and two bars only; 2 rows while fighting.
- The fixed fullscreen corner button is hidden while this layout is up.
- Tests: allocator and fight model units; `tests/e2e/phone-game-shell.spec.ts`
  (compass sends each command, output tap and key taps do not focus the
  field, fight card shows and hides with the fixture's fight, command
  row geometry, keyboard-up state); `phone-layout.spec.ts` reduced to
  what still holds and its tab strip cases moved to a player spec if
  they are not covered there.

### 51b Menu sheet and the settings page's first group

- The bottom sheet (ADR §10): status line, Reconnect, Profile, Scripts,
  Settings, text size stepper, Black / Paper, Exit session. It replaces
  the ESC menu for the live game: the menu key, Esc, `#menu`, the
  disconnect auto-open and the resume watch all open it; `#profile`,
  `#scripts`, `#settings`, `#panes`, `#exit` route to its entries.
- Settings page with the **Text** group (size, theme, font). Later steps
  add their own groups.
- Tests: rewrite `phone-esc-menu.spec.ts`, `phone-resume.spec.ts`,
  `phone-profile-window.spec.ts`, `phone-scripts-menu.spec.ts` and the
  live-game cases of `phone-touch.spec.ts` / `phone-look-kit.spec.ts`
  for the sheet (keep their player and tablet cases).

### 51c Map lens

- The map pane as the lens (ADR §4): one `MapPane`, borderless square at
  the lens's place, clipped and dressed by the phone layer (ring,
  glass, reflection, pips; Paper counterpart). Shimrod, black
  background, no hover, no pan, no pinch on the phone's game layout.
- `zoomTo` in the map protocol (additive) and the three levels; a tap
  steps them; the default comes from the setting (51c adds the **Map
  lens** settings group: show, size, opens at).
- The fullscreen key on the lens (only where `canFullscreen`).
- Tests: rewrite `phone-map.spec.ts` (the lens follows the player from
  the first room, a tap steps the zoom, no pinch or pan), unit tests for
  the zoom levels.

### 51d Pane strip and Comm

- Strip (ADR §5): the panes key on the lens, one pane at a time, hood
  and dots, swipe and Ctrl/Alt+1…9, Statistics on the phone
  (`statsView` supplied by the phone shell), script panes as further
  pages; the **Panes** settings group (which panes, order).
- Comm (ADR §6): the Comm key with the unread count (a change
  notification on `CommChats`), Comm under the fight card in rail mode,
  the reply line as a textarea with "Type a message", the resize band,
  no writes to `comm.folded` / `comm.listWidth` on the phone; the
  **Comm** settings group (count unread, NPCs in Public).
- The lens's hide rule and the key row (ADR §4).
- Tests: `tests/e2e/phone-game-panes.spec.ts` (strip opens, swipes,
  shows each pane with content from the fixture, fight card under it;
  Comm opens, a typed reply sends `tell <name> …` / `tell group …`,
  Public has no field, resize persists, unread count rises and clears,
  the lens hides and returns).

### 51e Hot keys

- Settings keys and migration (ADR §8 and §13); the column, the K key,
  tap sends, a 500 ms hold opens the box; quick picks, Custom, the two
  specials; hidden with the keyboard up; the lens hides while the box
  would collide.
- Tests: units for the model, migration and the wimpy value;
  `tests/e2e/phone-game-hotkeys.spec.ts` (defaults, tap sends, the
  special sends `change wimpy <half of the fixture's hp>`, hold and
  save persist over a reload, Shown off removes a key, the K key hides
  the column).

### 51f Weather, connection settings

- Weather over the whole width on the phone's game layout (ADR §11): no
  left band there; the prompt mask stays; desktop's band is unchanged.
- The **Compass** group (key size, vibrate) and the **Connection** group
  (keep screen on, reconnect automatically, weather effects). Wake lock
  and the one automatic reconnect on resume (ADR §10).
- Tests: a phone weather e2e that checks effects reach the left edge
  with the setting on and that the default is off; units for the
  reconnect rule (once per resume, never after a user disconnect).

### 51g Paper, polish, full verification

- Every phone surface on Paper; contrast 4.5:1 for text.
- Landscape and a 360 px wide phone: nothing unreachable, nothing
  overlapping that should not.
- The full suite: typecheck, unit, all three e2e projects; the
  benchmark comparison (rule 4); a review of the whole branch diff for
  desktop impact (`git diff main --stat` and every shared file).
- Docs: tick the tasks here, write "Built" notes (numbers, deviations,
  what was not finished and why), an ADR 0136 "Built" addendum, the
  test guide below made exact, `progress.md` (stage table and session
  log).

## Screenshots

A script (for example `scripts/phone-shots.ts`, modelled on
`scripts/screenshots.ts`) takes the states of the mockup table at
390×844, device scale 3, from fixtures, dark and Paper, into
`docs/stages/img/51-<step>-<state>.png`. After each step the main session
looks at the new screenshots beside the matching mockup's source and
fixes what is clearly off (at most two fix rounds per step; then note the
deviation here and go on).

## How the build session works (unattended)

The owner starts the session and is away until morning. So:

- Read `CLAUDE.md`, `progress.md`, this file, ADR 0136, spec §2.12 and
  §2.6, then the mockups. Create the branch.
- One step at a time, in order. For each step: brief one building
  subagent with this file, the ADR, the mockup files of the step and the
  exact files it may touch; when it reports, run the step's checks
  yourself, take and view the screenshots, send fixes back to the same
  subagent; then a second, fresh subagent reviews the step's diff for
  bugs and for desktop impact (rule 1) and its confirmed findings are
  fixed before the commit. Independent work inside a step (for example
  rewriting e2e specs while the feature is built) may run in parallel
  subagents only when they touch different files.
- **Do not stop to ask.** Technical choices are yours: decide, and
  record anything that departs from ADR 0136 in "Built" below (and as an
  addendum to the ADR). If a step cannot be finished, leave the branch
  working (revert or hide the unfinished part, no dead controls), write
  down exactly what is missing and why, and continue with the next step
  that does not depend on it.
- Things that are the owner's and must wait: anything that would change
  desktop behaviour, a change to the settled design, merging, releasing,
  pushing.
- Before ending: 51g's docs, the session log in `progress.md`, a final
  commit. The last message to the owner (in Swedish) says what is built,
  what is not, what deviates, and how to test.

## Tasks

- [x] Branch, baseline benchmark recorded here
- [x] 51a shell: allocator, command row, compass, fight card
- [x] 51b menu sheet, Text settings
- [x] 51c map lens
- [x] 51d pane strip and Comm
- [x] 51e hot keys
- [ ] 51f weather, compass and connection settings
- [ ] 51g Paper, polish, full verification, docs

## Test guide (for the owner; the build session makes it exact)

On the computer: `git switch stage-51-phone-layout`, start the dev server
so the phone can reach it (README, "dev server over Tailscale", ADR
0096), and open it on the phone in the normal browser. Without a phone:
desktop Chrome at 390×844 with `?phone=1`.

1. **Walk.** Log in. No fight card; the lens at the top right follows
   you. Tap N, S, E, W, U, D, the eye and F. Tap a direction with no
   exit several times: every tap is sent.
2. **Lens.** Tap it: near, middle, far. Tap the fullscreen key.
3. **Fight.** Attack something: the fight card shows your name and the
   opponent's with two bars, and goes away after the fight.
4. **Panes.** Tap the lens's top left key; swipe through Timers, Group,
   Character, Statistics. Close it.
5. **Comm.** Have someone tell you: only the count on the lens's Comm
   key changes. Open Comm, answer, drag its lower edge, close it.
6. **Hot keys.** Tap `asst`, `bash`, `wimp` (check the wimpy it set).
   Hold one, change it to Custom, save. Hide the column with K.
7. **Typing.** Tap the command field: compass and hot keys step aside.
8. **Menu.** Text size, Paper and back, Settings, Reconnect, Exit.
9. **Weather** on in Settings: effects over the whole width.
10. **Desktop:** open the same branch on the computer: nothing changed.

Feedback wanted: reach and size of the keys, whether the lens and keys
cover too much text, Comm's height, anything that feels slow.

## Built

### Baseline (before 51a)

- e2e on the untouched branch: `phone` green; `chromium` green except two
  load-sensitive cases (`message.spec.ts:37`, `scripts-settings.spec.ts:411`)
  that pass when run alone. They are not touched by this stage.
- Text speed on the phone: `bench/browser-bench.ts` has no phone mode, so
  `bench/phone-bench.ts` was added (Chromium, 390 × 844, ratio 3, mobile +
  touch, `?bench&phone=1`, the biggest fixture). Before 51a
  (`bench/results/phone-51-before.md`, commit fb744906): frame → paint
  3.8 / 17.4 / 22.2 ms (median / p95 / max), flush script 0.9 / 1.7 / 2.7 ms,
  burst 938 ms for 79 447 lines (84 666 lines/s, longest frame 18.5 ms, no
  long animation frame), key → send 0.050 / 0.080 / 0.115 ms.

### 51a Shell (built)

- `allocatePhoneGame` (`src/layout/phone-game.ts`), the cockpit option
  `phoneGame` (passed by the live shell only; marker `data-phone-game`),
  the phone layer `src/phone/` (loaded by a dynamic import on a phone
  only), command row, compass, fight card, `scripts/phone-shots.ts`.
- Shared files: `cockpit.ts` (the option, `relayoutPhoneGame` inside the
  phone branch, additive `isPhoneGame` / `phoneGameLayout` /
  `setPhoneFight`), `app.ts` (passes the option, never for a player),
  `shell.ts` (inside `device().phone` only). `input-pane.ts` not edited.
- Deviations and choices:
  - **Command row is 3 cell rows** (`ceil(50 px / cell)`), not ADR §2's
    "1 input row": the field and the menu key are 44 px as in the mockup.
  - The opponent word `dying` (in `src/gmcp/bands.ts`) gives 0 %; a fight
    starts at 100 % until a word arrives. A tank outside the group shows
    its name over an empty track (the group model has no HP for it).
  - **Keys send only in play** (`src/phone/play-gate.ts`): a compass tap
    is dropped at the name or password prompt and while the link is
    down, so a stray tap never types into the login or reconnects. A
    typed line reconnects as before.
  - Keys send on `pointerdown` (a sliding thumb does not lose the tap).
  - No fading ground under the command row (it ended at the last whole
    cell and showed on Paper).
  - Ctrl/Alt+1…9 do nothing in the live game until the strip (51d).
  - No fullscreen control in the game on a phone until the lens (51c).
- To verify live (ADR "To verify"): `Char.Vitals` `hp`/`maxhp` are numeric
  in the fixture; the fixture is synthetic, so MUME's real
  `opponent-hits` words are **not confirmed** (the code uses the list in
  `src/gmcp/bands.ts`).
- Tests: 3615 unit; phone 77 passed, 5 fixme (`phone-map.spec.ts`, back
  in 51c); firefox 434 passed; chromium green except load-sensitive cases
  that change from run to run and pass alone.
- Screenshots: `docs/stages/img/51-a-*.png`.

### 51b Menu sheet and Text settings (built)

- `src/phone/menu-sheet.tsx` (the sheet and its host), `settings-page.tsx`
  (groups as data; only **Text** so far), `text-settings.ts`, `kit.ts`.
  The menu key, Esc, `#menu`, the disconnect auto-open and the resume
  watch open the sheet; `#profile`, `#scripts`, `#exit` open the existing
  pages straight at their frame; `#settings` (and `#panes` until 51d) the
  phone settings page. A link drop while the settings page is up switches
  to the sheet with Reconnect lit.
- Shared files: `shell.ts` (phone-only paths: `phoneLayer`, `openMenu` /
  `closeMenu` / `menuOpen` / `exitSession` through `phoneLayer?.`,
  `onConn`); `src/theme/presets.ts` gets `backgroundPatch` (moved, pure;
  `chrome/frames/options.tsx` re-exports it); `chrome/index.tsx` re-exports
  `Seg` and `Toggle`; new eager `src/app/phone-kit.ts` (about 0.5 kB,
  values the phone chunk needs from modules desktop already loads).
- **Chunk rule found in review:** a value import of an eager module from
  `src/phone` re-cuts the eager chunk graph for every device (desktop got
  four extra preloads). The phone chunk therefore imports app modules as
  types only and gets values through `PhoneKit`. Checked by building the
  branch and `main`: the `index.html` preload list and stylesheet links
  are identical (34 entries); eager JS 850 256 → 855 502 bytes. Left: one
  small lazy chunk with Preact's JSX runtime, shared by chrome and phone.
- Choices and deviations:
  - Leaving Profile, Scripts or Exit returns to the game, not the sheet.
  - While the menu is open it swallows keys (no typing, macros or sends
    behind the scrim) and drops the on-screen keyboard.
  - A+ stops before "Window too small"; if a stored size is too large a
    rescue menu key shows over the notice.
  - Black / Paper are the terminal presets and replace font colour and the
    16-colour palette, as the desktop's Background cycle does (**owner
    question:** fine for a one-tap swatch when the palette was hand-tuned
    on a computer?).
  - The status line does not carry the update / storage notice.
  - The old `☰` and ESC menu remain as the fallback when the phone chunk
    fails to load (tested).
  - Between 51b and 51d Statistics is not reachable on a phone (it moves
    to the strip); its e2e case is `fixme` until 51d.
  - `phone-profile-window.spec.ts` needed no rewrite (`#profile` and Back
    behave as before).
- Tests: 3640 unit; phone 93 passed, 6 fixme; chromium green except
  load-sensitive cases. `script-panes.spec.ts:177` fails when run alone on
  untouched `main` too (order-dependent, not this stage).
- Screenshots: `docs/stages/img/51-b-*.png`.

### 51c Map lens (built)

- `src/phone/lens.ts` (ring, glass, reflection, pips, tap target, the
  fullscreen key and the key row), `lens-zoom.ts`, `changed.ts` (settings
  compared by value: the store clones on every write). The **Map lens**
  settings group (show, size, opens at); `phone.lens` in the settings.
- **One `MapPane` clipped to a circle: confirmed** (`clip-path: circle()`
  on the cockpit's one map pane; one canvas, one worker, nothing
  re-parented; asserted in e2e).
- Shared files (all additive or behind a null lens): `map/protocol.ts`
  and `map/client.ts` (`zoomTo`), `map/worker/core.ts` (the `zoomTo`
  case), `panes/map.ts` (`setLens`, `zoomTo`, `keepsForwarding()`; every
  guard is `if (this.lens)`), `layout/cockpit.ts` (`setPhoneLens`, inside
  the phone-game path), `settings/types.ts` + `migrate.ts` (the `phone`
  section, no version bump).
- Numbers: the worker's zoom is a factor (one room = 44 CSS px at zoom 1
  on layer 0), so `zoom = lens px / (rooms × 44)`: near 3 rooms (1.136 at
  150 px), middle 5 (0.682), far 10 (0.341). "About": other layers show
  somewhat fewer or more rooms. Sizes S 120, M 150, L 180 px.
- Choices and deviations:
  - The lens sits in a rectangle of whole cells, so its place is
    quantised: about one row under the fight card (or the top edge) and
    two columns from the right edge, not the mockup's exact 16 / 12 px.
  - Shimrod, black, no hover, no pan, no pinch are applied at run time
    only; `mapper`, `panes.map` and `layout` are never written. The lens
    shows whatever the desktop's `panes.map.on` says.
  - Lens off: no map worker and no map load; off mid-session stops the
    forwarding to the worker.
  - No blur on the reflection (no filter over the scrolling text).
  - A long press on the lens released without moving is a tap (one zoom
    step).
  - Only the fullscreen key in 51c (where `canFullscreen`); removed for
    good after a refusal.
- Tests: 3670 unit; phone 110 passed, 1 fixme (Statistics, 51d);
  `phone-player-map.spec.ts` keeps the player's MAP tab touch cases.
  Preload list still identical to `main`.
- Screenshots: `docs/stages/img/51-c-*.png`.

### 51d Pane strip and Comm (built)

- `src/phone/strip.ts`, `strip-model.ts`, `swipe.ts`, `comm-chrome.ts`,
  `unread.ts`; the lens's three keys and the key row; the **Panes** and
  **Comm** settings groups; `phone.strip`, `phone.commRows`,
  `phone.unread`. `#panes` opens the settings page at Panes.
- Shared files: `layout/cockpit.ts` (additive `setPhoneStrip`,
  `setPhoneComm`, `setPhonePageKey`; placing inside `relayoutPhoneGame`;
  `selectTabAt` hands Ctrl/Alt+digits to the strip in the phone game
  layout only), `layout/phone-game.ts`, `gmcp/comm-chats.ts` (additive
  `unreadCounts()` / `onUnread()`, nothing computed without a listener),
  `panes/comm.ts` (phone mode behind `this.phone`; on a phone the reply
  is a one-row textarea; `sendReply` flattens line breaks, a no-op for
  the desktop's `<input>`), `panes/comm.css` (`textarea.wc-cm-rinput`),
  `settings/types.ts` + `migrate.ts`, `app/shell.ts`.
- **Deviation from ADR §1 (found by Firefox):** the phone game layout is
  used when the phone flag is on **and the window's short side is under
  600 CSS px** (`phoneSizeWindow()`, decided once at startup). Several
  desktop e2e specs open `?replay&phone=1` in a desktop-size window and
  expect the old phone menu; since 51b they passed only by winning a race
  against the phone layer's mount. A real phone is always under 600 px.
  **So `?phone=1` in a wide desktop window shows the old phone layout;
  test in a 390 × 844 window or with device emulation.**
- Choices and deviations:
  - Strip: the first row holds the hood and the last the dots, so a pane
    gets the strip's rows minus two. A strip that would get fewer than 4
    rows is not shown (`STRIP_MIN_ROWS`, not in the ADR).
  - Swipe: at least 48 px sideways and 1.5 × the vertical travel within
    800 ms; no wrap at the ends. Ctrl/Alt+1…9 select the page and open the
    strip when it is closed.
  - Unread: while Comm is closed no chat counts as read. "All" counts
    each message once (a group member's tell stops counting when Group
    or the chat is read). The badge is hidden while Comm is open.
  - Comm resize: only the band moves while dragging; one relayout and at
    most one NAWS on release. Opening or closing the strip or Comm sends
    exactly one window size (rows only; the width never changes).
  - Keyboard up: Comm keeps the short screen (the game keeps 2 rows);
    under about 11 rows in all Comm cannot fit and closes (the stored
    height is kept).
  - The reply line follows the keys' gate: disabled with "Not connected"
    outside play, and a failed send keeps the text.
  - Not built from the mockup: the send button in the compose field
    (Enter sends, `enterkeyhint="send"`); the mockup's own Timers chips
    (the real Timers pane is shown).
  - Statistics uses the desktop view unchanged in the small strip.
- Tests: 3709 unit; phone 131 passed, none skipped; firefox green except
  load-sensitive cases that pass alone. Preload list identical to `main`.
- Screenshots: `docs/stages/img/51-d-*.png` (the Comm shots predate the
  last grip and margin tweak; 51g re-shoots everything).

### 51e Hot keys (built)

- `src/phone/hotkeys.ts` (column, K key, the box), `hotkey-model.ts`
  (pure); `phone.hotkeys` and `phone.hotkeysOpen` in the settings.
- Shared files: `layout/cockpit.ts` (`PhoneLensPx.clearAlways`, phone
  game lens path only), `app/shell.ts` (a `notice` dep at the phone
  mount), `app/phone-kit.ts` (`splitCommands`), `settings/types.ts` +
  `migrate.ts`.
- Choices and deviations:
  - A tap sends on release (so a hold can be told apart); a 500 ms hold
    opens the box and sends nothing; sliding more than 12 px off does
    neither.
  - **One command per key:** Save refuses a line the engine would split
    (`;`), and a stored one sends nothing and prints a notice. Aliases
    and a `#` command behave as typed (so `#3 north` still sends three,
    as on the command line).
  - **Wimpy is never 0** (hp 1 at 50 % sends `change wimpy 1`); hp unknown
    or ≤ 0 sends nothing and prints `[SYSTEM] Hot key: …` in the game
    text. **Not verified against MUME** that `change wimpy 0` turns wimpy
    off; that is the assumption.
  - With no key shown, K stays (unlit) and opens the box for K1.
  - A press outside the box closes it without saving and still does its
    own work. The box closes when the menu opens, when the layout is too
    small, or when the strip, fight card or Comm reaches it.
  - The box's fields use 16 px text (iOS zooms the page under that). The
    labels have a slightly stronger halo than the mockup. The Paper box
    is derived from the Paper tokens (no mockup).
  - Labels are cut at four graphemes.
  - **Landscape (owner question):** three hot keys reach the lens's place
    on a 390 px high screen, so the lens hides and its keys show as a
    row; K (hiding the column) brings it back. Follows ADR §4, but the
    lens is off by default in landscape.
- Tests: 3734 unit; phone 146 passed. Preload list identical to `main`.
- Screenshots: `docs/stages/img/51-e-*.png` (the rebind shot still says
  "Sends now"; 51g re-shoots).

## Owner feedback

(After the owner's test.)
