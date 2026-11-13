# Stage 55 plan: scrap the old phone layout

Read-only investigation; nothing was edited, no e2e and no dev server were run. Line numbers are from the tree at `2663c68c`. The working tree has an uncommitted change in `src/chrome/frames/scripts.tsx` (not mine; I did not read its diff) and the untracked stage file `docs/stages/55-scrap-old-phone-layout.md`.

Three things in the brief turned out different in the code:

- **The old layout is not in `player-host.ts`.** `allocatePhone`, the tab strip and `selectTab` live in `src/layout/cockpit.ts` and `src/layout/phone.ts`. The player gets them because `src/app/app.ts:487` drops `phoneGame` for player Apps (`opts.phoneGame && !player`), so a player cockpit on a phone takes `relayoutPhone` (`cockpit.ts:636`, `:993-995`). `player-host.ts` reads the phone flag once (`:300`, no Fullscreen button).
- **The HTML replay is not affected.** `initDevice` is called only from `src/main.ts:65` and `src/boot/first-paint.ts:90`; `src/replay/main.ts` never calls it, so the exported replay is the desktop cockpit on every device. But `player-host.ts` is bundled into that single-file IIFE, so it must never value-import `src/phone`.
- **A fifth desktop spec uses the old ESC menu:** `tests/e2e/underscores.spec.ts:135`, besides the four named.

---

## 1. Player and Spotlights: today, and the design

### 1.1 Today

**Host and engine**
- `src/app/player-host.ts`: one `PlayerHost` per open. `.wc-player` > `.wc-player-stage` (width `100% - RAIL_W`, `:629-635`) > a player `App`.
- `build(clock)` (`:376-511`) makes a **new App and cockpit on every open and every backward seek**, with a fresh in-memory `SettingsStore`.
- Settings are composed as viewer's settings → VIEW records (`base`) → viewer overrides (`compose()`, `:539-565`). VIEW keys are `appearance, panes, layout, group, comm, timers` (`src/player/fit.ts:35`); `phone` is not among them.
- Font: `playerFontSize` (`src/player/fit.ts:19-33`) shrinks the recorded size until the grid is at least `MIN_VIEW_COLS × MIN_VIEW_ROWS` = 60 × 18 (`src/layout/allocate.ts:146-147`). On a 390 px phone that forces a very small font today.

**Transport UI** (`src/player/view.ts`, `PlayerView`)
- Control box bottom right, one row `.wc-pc-row`: To the start, −10 s, Play/Pause, +10 s, speed ◄ 1× ►, time, Panes, Display, mode buttons, Close. Compact and tight variants for narrow widths (`fitBox`, `:838`; `player.css:532-560`).
- Rail on the right edge (`RAIL_W = 12`, `src/player/strip.ts:15`) with the playhead and kind-icon markers.
- Header chips at the top; kit Back top left (`back` option).
- The chrome hides 6 s after the last activity in play (`HIDE_MS`, `:96`).
- `press(act)` (`:435`) drives it from outside; `bare: true` draws no chrome at all.

**Who opens it**
- Run log: `Shell.openRunLog` / `openPlayer` (`src/app/shell.ts:644-673`) with `RUN_LOG_VIEW = { back, hours }` (`:156`); the host is moved into History's box by `src/chrome/frames/run-log.tsx`.
- Spotlights viewer: `services.embedPlayer(slot)` (`shell.ts:688`), a **bare** view with the page's own head, track and controls (`src/chrome/frames/spotlights-viewer.tsx:391-397`). `src/player/spotlight-mode.ts:157,179` turns every pane off, on desktop too.

**On a phone today**
- Tab strip `GAME COMM CHAR …` in row 0; a pane tab shows that pane full width.
- An invisible input row is kept (`player.css:39-42`).
- Back is pushed under the strip (`player.css:168-170`); a one-tab strip is hidden (`player.css:173-175`, `spotlights-viewer.css:151-155`).
- Comm's search raises the device keyboard, which is why the cockpit holds the `wc-kbd` state (`cockpit.ts:636-638`, `holdDeviceKeyboard`).

### 1.2 How the new layout is mounted (live game)

- `Shell.phoneGame = phoneGameWanted(device(), window)` (`shell.ts:207-212`, `:276`).
- `ensureApp` passes `phoneGame: true` to `App` (`:881`) → `Cockpit` option (`cockpit.ts:353`, `:633-635`): marks `data-phone-game`, uses `relayoutPhoneGame` (`:1420-1480`) and `allocatePhoneGame` (`src/layout/phone-game.ts:358`).
- The shell then loads `src/phone/index.ts` and the chrome chunk and calls `mountPhoneLayer(deps)` (`shell.ts:908-967`; `index.ts:2043`).
- `PhoneLayer` is one 2047-line class. It reads `cockpit.phoneGameLayout` after each layout and steers the cockpit through `setPhoneLens/Strip/Comm/Fight/Limit/Bottom/Hide/SideCols/…` (`cockpit.ts:1149-1397`).
- Chunk rule (ADR 0136 §2, `src/phone/kit.ts`): `src/phone/*` imports app modules as types only; values come in as `PHONE_KIT` (`src/app/phone-kit.ts`) and `controls`.

**What in `PhoneLayerDeps` (`index.ts:131-176`) assumes a live session**

| Part | Where | In a replay |
|---|---|---|
| Compass, hot keys, K key, `send` | `:334`, `:410-453`, `:597` | not mounted |
| Own keyboard | `mountOwnKeyboard`, `:556`, `:632` | not mounted |
| Menu sheet, menu key, rescue key | `:456-482` | not mounted |
| `placeholder()` on the command field | `:483` | skipped |
| Wake lock | `:538-555` | skipped |
| One-time phone defaults (a settings write) | `:569-575` | skipped |
| Auto-login | `:584-588` | skipped |
| Comm reply line | `comm.setPhoneMode(true, { live })`, `:383` | read-only |
| Band and lens drags write `settings.update({ phone: … })` | `:378`, `:399`, `:408`, `dropLens` | go to a host-owned memory store |

Read-only already, driven by replayed GMCP: fight card, lens, strip, bands, plates, unread badge.

### 1.3 Design: the replay phone layout

Decided (technical): **one `PhoneLayer` class with a `replay` dependency**, not a second class and not an extraction. The placement code (`place`, `syncLens`, `askLens`, `syncPages`, `placePlates`) is some 600 interleaved lines guarded by more than 440 phone e2e tests; a mode flag touches about 15 sites, an extraction touches all of it.

**Reused as is**
- `allocatePhoneGame`, `relayoutPhoneGame`.
- `LensView`, `StripView`, `ResizeBand`, `FightCardView`, swipes and the fling guard.
- `phone.css` tokens: they are declared on `.wc-cockpit[data-phone-game]` (`phone.css:19`), so they resolve inside the player's themed element.

**Needs a flag or small change**

1. `phone-game.ts:368,373`: the command row is forced to at least one row. Allow `inputRows: 0`.
2. `Cockpit`: new option `phoneReplay?: { bar: boolean }`, used with `phoneGame`. `relayoutPhoneGame` takes `inputRows = bar ? commandRows(cell.h) : 0` (`cockpit.ts:1422`).
3. `app.ts:487`: pass `phoneGame` and `phoneReplay` through for player Apps.
4. `PhoneLayerDeps.replay?: { … }`:
   - skip everything in the table above;
   - `hot.set(…, 0, false, …)` so no column takes room;
   - lens `fullscreen: null`;
   - `setPhoneLimit(null)`, `lensClear = 0`;
   - strip pages filtered by an `omitPages` list handed in (`LIVE_ONLY`, i.e. `statistics`; the phone chunk cannot import the value);
   - initial state `{ stripOpen, stripPage, commOpen, lensLevel }` plus `onState`, because the layer is remounted on every backward seek.
   - Make `PhoneLayer.menu` nullable, or split the type, for the shell.
5. `CommPane.setPhoneMode` (`src/panes/comm.ts:624`): add `readOnly`, which hides the reply line and the search key. No keyboard exists in a replay, and a focused search field would raise the device's.
6. `PlayerHostOptions.phone?: { mount(deps), kit, controls }`, injected by the shell after `loadPhone()` (`makeHost`, `shell.ts:702-716`).
   - The host owns one in-memory store for the layer's `phone.*` settings, seeded from the viewer's and kept across rebuilds.
   - Band heights and a moved lens last for the open player only; nothing is written to the user's settings (ADR 0021 invariant, `PlayerHostOptions.settings`: "read, never written").
7. `playerFontSize`: take the minimum as a parameter; on the phone layout use `PHONE_MIN_COLS × PHONE_MIN_ROWS` (30 × 8). A visible improvement: recorded text sizes are kept.
8. `phone.css`: the 9 cockpit-scoped Paper rules use `html.wc-phone[data-light] .wc-cockpit[data-phone-game]` (e.g. `:153`, `:249-251`, `:720`, `:794`, `:876`, `:1038`). In the player the recorded theme is on `.wc-player`, not `<html>`, so a Paper recording would get dark chrome and the reverse. Mark the cockpit itself (`data-ph-light` from its own settings) and switch those selectors. The two page-level ones (`:1814`, `:2066`) stay.
9. `view.ts` `onStageClick` (`:1217`, with the `.wc-pane` exemption at `:1201`): also exempt `.wc-ph-layer`, or a tap on a lens key moves the pause cursor.

**New UI (proposed default; see open questions 1 and 2)**

- **Transport: today's control row, docked in the command row's rectangle.** The phone layout already reserves that row and the player today leaves it empty.
  - `PlayerView` gets a `dock: () => rect | null` option; the box is placed there, marked `data-docked`, and is exempt from auto-hide.
  - The Display popup opens above it. Pass `viewerSettings: 'display'` on a phone: font size and theme stay, the Panes popup (pane toggles, Reset layout) goes because it means nothing in this layout.
  - Portrait: bottom edge, full width less the rail.
  - Landscape: the same row, right of the strip/Comm column, as the command row is.
- **Rail and markers:** unchanged at the right edge. The stage is already `100% - RAIL_W`, so nothing of the layer lies under it.
- **Header chips:** unchanged, auto-hiding.
- **Exit:** the bar's first key, where the menu key is in the game (the existing Close, `closeTitle`). No top-left Back on a phone, since it would lie on an open strip or Comm.
- **Panes and Comm:** the lens's own key row; the lens has the whole right side (no compass to clear).
- **Spotlights viewer:** `phoneReplay: { bar: false }` and no layer. Text only, as on desktop, with the page's own controls. The two wasted rows of today go.

**Risks**

- **Chunk rule.** `player-host.ts` must not value-import `src/phone`; `src/phone` must not value-import `src/player`. The phone chunk grows by an estimated 1–2 kB (baseline 125.1 kB in the stage file).
- **Remount on seek.** State must round-trip through the host; test a backward seek with the strip and Comm open.
- **Not verified:** whether the Map pane draws when `settings.panes.map.on` is false in the phone game layout. A VIEW recorded before the map existed forces it off (`fit.ts:61-66`). If it does not draw, the host must force `panes.map.on` for the lens.
- **Not verified:** whether strip panes depend on `panes[id].on`.
- **Not verified:** what Comm's reply line looks like with `live: () => false`; hence the explicit `readOnly`.
- **Not verified:** how `Shell.openMenu` behaves when called before the layer has mounted, once `EscMain` is gone (`shell.ts:467-491` falls through to the ESC overlay today). It should wait for the layer.

---

## 2. Dead code once uses 1–4 are replaced

### Eager code

| File | What goes |
|---|---|
| `src/layout/phone.ts` | `allocatePhone` and its types (`:53-140`), `GAME_TAB`, `PhoneTab`, `STRIP_ROWS`, `shownToggle`, `places`. **Keep** `PHONE_MIN_COLS/ROWS`, `PHONE_MIN_NAWS_COLS`, `phoneNawsCols`. Best moved into `phone-game.ts` and the file deleted. |
| `src/layout/types.ts:25-30` | `NOT_ON_PHONE` (its only users are `phone.ts` and `options.tsx`) |
| `src/layout/cockpit.ts` | imports `:202`, `:204` (`holdDeviceKeyboard`, `keyboardUp`); fields `:550-557`; constructor branch `:636-643` and `:656`; `phoneTab` / `selectTab` `:1059-1069`; `onTabClick` (about `:1080-1086`); `relayoutPhone` `:1088-1136`; `tabLabel` / `renderStrip` `:1564-1608`; the `kbd` handling in `relayoutPhoneGame` `:1423-1435` and in `phoneGameLayoutIf` `:1561`; the `else` at `:995`; header comment `:107-116`. `selectTabAt` `:1072-1076` keeps only its `pgPageKey` line (rename it). `data-phone-tab` at `:1120` and `:1458` goes with `layout.css:806`. |
| `src/layout/phone-game.ts` | the `guard` input (`:244`, `:398`) once nothing passes `false` |
| `src/app/app.ts` | `phoneTabKey` `:1056-1060` (keep the call into the renamed cockpit method for Ctrl/Alt+1…9 on the strip); the `phoneGame` option `:247-251` folds into the phone flag |
| `src/app/shell.ts` | `phoneSizeWindow` / `phoneGameWanted` `:190-212` (moved, see §4); `phoneLayerFailed` `:237-238`; `menuButton` `:494-513`; `syncDeviceKeyboard` `:821-830` and its calls `:810`, `:970`, `:974`; import `:118`; the old-layout branch `:900` and the temporary `☰` `:902-906`, `:968`; the non-`phoneGame` half of `:858-868`; the `preselect` argument of `openMenu` `:467`, `:1039` |
| `src/layout/phone-viewport.ts` | `KEYBOARD_SHARE` `:63`; `kbd` / `watched` / `holds` `:78-80`; `watchDeviceKeyboard` `:88`; `holdDeviceKeyboard` `:100`; `dropUnwatched` `:113`; `keyboardUp` `:119`; `isKeyboardUp` `:160`; `Baseline` / `NO_BASELINE` / `nextBaseline` `:169-190`; `tallest` and `keyboardUp` in `visibleArea` `:192-214`; the `wc-kbd` toggle `:248-249`. **Keep** the meta, `installPhoneViewport` publishing `--wc-vv-h/top`, the fullscreen re-measure, `screenLandscape`, `landscapeLayout`, the readout. `phone-viewport-debug.ts:14` reads `keyboardUp`: drop that field from the readout. |
| `src/ui/input-pane.ts` | `passField` / `swapField` and the `phone && !ownKeyboard` branches (`:316`, `:486`, `:615-617`, `:677-689`), **if** the shell builds the phone's input with the own keyboard on from the start. Medium risk (password handling); do it last, with the password e2e. |

### Chrome chunk

| File | What goes |
|---|---|
| `src/chrome/index.tsx` | `EscMain`, `ExitConfirm`, `OptionsHub`, `PanesFrame` imports `:24-25`; `menuRoot` cases `settings` / `panes` / `exit` / default `:204-218`; `EscMenuTarget` shrinks to `'profile' \| 'scripts'` (`:183`); `preselect`. **Keep** `mountEscMenu` and the overlay: the phone sheet opens Profile and Scripts in it (`shell.ts:487-491`). |
| `src/chrome/frames/esc-main.tsx` | `EscMain` `:95-171`, `headerParts`, `linkClass`, `ExitConfirm` `:215-281`, `useRunOn`. **Keep** `EscActions` (used by `windows.tsx:41`) and `ProfileEntry` `:183`; move them. |
| `src/chrome/frames/statistics.tsx` | the whole file (591 lines); its only importer is `esc-main.tsx:45`. `stats-layout.ts` stays. |
| `src/chrome/frames/options.tsx` | `OptionsHub`, `PanesHub`, `PanesFrame`, `AppearanceFrame`, `PaletteRow`, `FontPicker`, `HexFrame`, `gridToggle`, `scriptPaneLabel`, `PLAIN_HINT`. **Keep, in a model file:** `PREVIEW*`, `PreviewLine`, `colorChoices`, `groupDigits`, `parseHex`, the `backgroundPatch` re-export (`popups/settings-popup.tsx:60-70`). |
| `options-group.tsx`, `options-input.tsx`, `options-mapper.tsx`, `options-timers.tsx`, `comm-options.tsx` | whole files. Unit tests import `fmtBytes`, `fmtCount`, `mapInfoRows`, `tilesetCredit` through `options-mapper`: repoint them to `src/chrome/mapper-model.ts`. |
| `options-weather.tsx` | `WeatherOptionsFrame`. **Keep** `WEATHER_ROWS`, `DAY_SKY_HELP`, `MASTER_HELP`, `WEATHER_UNSUPPORTED` (`settings-popup.tsx:71`). |
| `src/chrome/kit/widgets.tsx` | the phone textarea branch of `TextField` `:648-…`. Check what else in the TUI kit loses its last user; `banner.tsx` and `start-main.tsx` still import it. |

### CSS

- `src/layout/layout.css:976-1016` (`.wc-phone-tabs`, `.wc-phone-sep`, `.wc-phone-tab`, `[data-phone-tab="pane"]`) and the `:not([data-phone-tab])` at `:806`.
- `src/ui/ui.css:446-…` (`.wc-touch .wc-menu-btn`), `:565-570`, `:589-593` (`wc-kbd`).
- `src/chrome/start.css:542`.
- `src/player/player.css:159-175` (the Back-under-strip rule and the one-tab rule).
- `src/chrome/frames/spotlights-viewer.css:151-155`.
- `src/phone/phone.css:2163` (hides the old `☰`).
- `src/chrome/kit/kit.css:459-479` (`.wc-phone .wc-body …`): check per rule; some may still serve the banner.

### Settings keys

None found. The selected tab is memory only (`cockpit.ts:552`).

### Unit tests to delete or trim

- `tests/unit/layout-phone.test.ts`.
- `tests/unit/phone-size-window.test.ts`: fold into `device.test.ts`.
- `tests/unit/phone-viewport.test.ts`: the baseline and keyboard cases.
- `tests/unit/chrome-esc.test.tsx`: not opened; check.
- `tests/unit/chrome-frames.test.tsx:8-9,37-70`: `headerParts`, `linkClass`, `OptionsHub`, `gridToggle`.
- `tests/unit/update-notices.test.ts:7,157`: `headerParts`.
- `tests/unit/statistics-pane.test.tsx`: it matched my grep for old symbols; check which.

### What must stay of the device-keyboard code

- `setPageKeyboard(false)` when the phone chunk is absent (`shell.ts:814-817`, `src/core/own-keyboard.ts:40`). It is the same path that gives a desktop, a `?tablet=desktop` tablet and a Desktop-site phone the device's own keyboard.
- The keyboard inset hooks, Comm's reply textarea, and the "not ours closes ours" guard (stage 53 file, "Kept on purpose").
- Everything for a physical keyboard (`OwnKey`, the input pane's key handling).

---

## 3. e2e specs

### Phone project

| Spec | Tests | Action |
|---|---|---|
| `phone-player-tabs.spec.ts` | 2 | Delete. Replace with `phone-player-layout.spec.ts`: no tab strip; lens, strip, Comm read-only, no compass / keyboard / menu key; state kept over a backward seek. |
| `phone-player-map.spec.ts` | 2 | Delete. Pinch, pan and long-press hover were the MAP tab's and are not in the lens. One new case: the lens follows the replayed room. |
| `phone-player.spec.ts` | 1 | Rewrite: the way out by tap (bar key or Back, per open question 2). |
| `phone-look-kit.spec.ts` | 3 | Test at `:107`: drop the "Back is clear of the pane tabs" half (`:137-142`). |
| `phone-spotlights.spec.ts` | 2 | Keep; re-check sizes (the viewer gains two rows). |
| `phone-esc-menu.spec.ts` | 12 | Test at `:163` (old `☰` on a failed chunk) → the notice with Reload. The rest already asserts the sheet. |
| `phone-layout.spec.ts` | 5 | Keep. `:57` passes via `.wc-ph-menu`; tighten the selector. |
| `phone-touch.spec.ts` | 4 | Keep. |
| `phone-tablet.spec.ts` | 8 | Keep. Add: a phone-screen device in a wide window gets the desktop cockpit; `?phone=1` in a wide window gets the phone layout. |
| `phone-viewport-fullscreen.spec.ts` | 6 | Keep; the `wc-kbd` assertions (`:75-145`) become trivially true: remove them. |
| `phone-own-keyboard.spec.ts` | 52 | `:243`: remove the `wc-kbd` assertion. |
| `phone-new-user.spec.ts` | 1 | `:29`: remove the `.wc-phone-tab` count. |
| `phone-own-keyboard-multiline.spec.ts` | 14 | `:491` routes the phone chunk (a delayed load, as far as I read): re-check against the new failure path. |

All other phone specs use `?phone=1` on a phone-size window and are unaffected by the recommendation in §4.

### Desktop projects (Chromium and Firefox)

All of these test the TUI Options frames through `tests/e2e/esc-options.ts`.

| Spec | Tests using it | Of | Action |
|---|---|---|---|
| `chrome.spec.ts` | 5 (`:237`, `:296`, `:410`, `:479`, `:506`) | 20 | Delete. Port one assertion to `settings-popup.spec.ts` only where the popup has no counterpart. I did not compare case by case; `settings-popup.spec.ts:214` and `pane-gear.spec.ts:166` cover the store writes. |
| `comm-ui.spec.ts` | 1 (`:207`) | — | Delete; covered by `pane-gear.spec.ts:78`. |
| `gmcp-panes.spec.ts` | 1 (`:92`) | — | Delete; covered by `pane-gear.spec.ts:166`. |
| `timers.spec.ts` | 1 (`:224`) | — | Delete; same. |
| `underscores.spec.ts` | 1 per device pixel ratio (`:133`, two ratios) | — | Delete: the old-look text field it tests is gone. |
| `esc-options.ts` | helper | — | Delete. |
| `menubar.spec.ts:51`, `esc-click.spec.ts:59` | — | — | Keep (they assert there is no `☰`). |

Also uses `?phone=1` outside the specs: `scripts/phone-shots.ts`, `scripts/login-shots.ts`, `bench/phone-bench.ts`, `bench/phone-keyboard-bench.ts`, `bench/look-box-bench.ts`, `bench/start-page-bench.ts`. Unchanged under §4 if they run at phone size; I did not check each viewport.

---

## 4. Desktop-site detection

**Today.** `decideDevice` (`src/core/device.ts:74-86`) looks only at the screen. `phoneGameWanted` (`shell.ts:207-212`) then looks at the window, and "phone flag + wide window" falls into the old layout.

**Change**

- Add `innerWidth` / `innerHeight` to `DeviceInputs`; move `phoneSizeWindow` into `device.ts` (pure; an unknown or 0 × 0 window still counts as a phone's).
- New rule: a touch device **found** on a phone-size screen, in a window that is not phone-size, is `{ touch: true, phone: false, tablet: false, desktopSite: true }`. That is the same shape `?tablet=desktop` gives a tablet.
- `Shell.phoneGame` becomes `device().phone`; `phoneGameWanted` goes.
- Tablets are untouched: `tablet` already wins at any window size, and iPadOS asks for the desktop site by default.

**`?phone=1`: recommendation.** Keep it, meaning "a phone at any window size": it forces `phone` and `touch`, never `tablet`, and skips the Desktop-site rule.
- Not an alias of `?tablet=phone`: that would switch off the one-time phone defaults and turn on the tablet key sizes, breaking `phone-tablet.spec.ts:282` and every spec that relies on phone defaults.
- Not dropped: about 40 phone specs, the shot scripts and the benches use it.
- At desktop size it then gives the new phone layout, stretched; development only.

**Settings a Desktop-site phone sees**

- Stored phone settings as they are: font 14, UI pane off, weather off (`src/settings/types.ts:755-771`), with the default desktop dock layout. A phone never writes `layout`.
- `phone-defaults.ts` is not involved: only the phone layer applies the one-time patch (`src/phone/index.ts:569-575`).

**Traps**

1. **A first visit in Desktop-site mode.** `main.ts:81` would build the store with `phone: false`: desktop defaults (font 16, weather on), and `newUserScripts` (`shell.ts:1146`) would enable the bundled scripts. Both are stored and follow the phone back to its normal mode (weather then runs on the phone's GPU). Decided: defaults follow the device, not the mode. Pass `device.phone || device.desktopSite` at `main.ts:81`, `first-paint.ts:93` and `shell.ts:1146`. Three lines.
2. **No `wc-phone` class and no `installPhoneViewport`** (`main.ts:67-70`): the device keyboard covers the input line unless the browser pans, as on a `?tablet=desktop` tablet. Accepted per the owner decision.
3. **Decided once at startup.** A page loaded hidden with a 0 × 0 window counts as a phone; a reload fixes it.
4. **Not verified on a device (inferred):**
   - That Android Chrome's Desktop site leaves `screen.width` at the device's CSS width while `innerWidth` becomes about 980. If the screen value were scaled too, the phone would count as a tablet and get the phone layout with tablet keys, never the desktop.
   - That iPhone Safari's "Request Desktop Website" keeps the layout viewport at device width, in which case nothing changes there.
   - That browser page zoom below 100 % on Android does not push `innerWidth` past 600 on a real phone.
   - All three belong in the owner's device test.

**Chunk-failed fallback (decided).** One eager, dependency-free cover over `#app`, built by the shell: "The phone layout could not be loaded. Check the connection and reload." with a Reload button (`location.reload()`).
- Shown when `loadPhone()` rejects (`shell.ts:323`, `:908-978`) or `mountPhoneLayer` throws (`:971-975`).
- It shows at boot already, because the chunk is prefetched there.
- No retry logic, no fallback menu.

---

## 5. Rounds

| Round | Content | Ends in | Size | Parallel |
|---|---|---|---|---|
| **55a** | Replay plumbing, nothing switched: allocator `inputRows: 0`; `Cockpit.phoneReplay`; `app.ts:487`; `PhoneLayer` `replay` mode and state hand-over; Comm `readOnly`; `data-ph-light`; `playerFontSize` minimum; unit tests | Unit tests green; all e2e unchanged (the shell does not pass it yet) | M–L | with 55b |
| **55b** | Device and shell switch-over: `device.ts` (`desktopSite`, window inputs, `?phone=1` rule), `phoneGame ≡ phone`, settings-defaults fix, chunk-failed notice; delete the 9 desktop Options tests and `esc-options.ts`; rewrite `phone-esc-menu.spec.ts:163`; new device unit and e2e cases | Desktop site → desktop cockpit; notice on a failed chunk; the player still on the old strip | M | with 55a (touches `shell.ts` constructor / `ensureApp`; 55a does not touch `shell.ts`) |
| **55c** | Player switch-over: shell injects the phone module into `PlayerHost`; `PlayerView` dock and exit key; stage-click exemption; Spotlights bare path; player CSS; replace `phone-player-tabs` / `-map`, rewrite `phone-player`, adjust `phone-look-kit`, `phone-spotlights` | Run log and Spotlights on phone and tablet in the new layout; screenshots for the owner | M | after 55a; merge after 55b (`shell.ts`) |
| **55d** | Deletion, eager side: §2 "Eager code" and CSS; unit tests | Full e2e green; bundle measured against the baseline | M | with 55e, after 55b and 55c |
| **55e** | Deletion, chrome side: §2 "Chrome chunk"; model extraction for the popup constants; unit tests. The `EscMenuTarget` change touches `shell.ts` / `app.ts` types: give that one edit to 55d. | Same | M | with 55d |
| **55f** | ADR (supersedes ADR 0075 §3 and ADR 0098; amends 0109, 0112, 0136 §1, 0140), stage file, test guide, session log | Owner test | S | last |

The `input-pane.ts` `passField` removal is the riskiest single deletion: put it at the end of 55d or defer it to stage 56.

---

## 6. Open questions for the owner

1. **Transport placement on a phone.** Proposed: today's control row docked where the command row is, always visible, with the rail kept at the right edge. Alternative: today's floating, auto-hiding box over the text (the command row's rows then go to the text). The docked bar costs about three text rows and never covers text.
2. **The way out.** Proposed: the bar's first key, where the menu key is in the game, and no top-left Back on a phone. Stage 45 feedback asked for Back top left on the run log page; it would now lie on an open strip or Comm.
3. **`?phone=1`.** Confirm it stays as "a phone at any window size" (§4).

Decided by me, say if you disagree:
- Spotlights stays text only on a phone, as on desktop.
- Comm in a replay is read-only without search.
- Band heights and a moved lens in the player are not saved.
- The Panes popup is dropped in the phone player; Display (font, theme) is kept.
- Settings defaults follow the device, not Desktop-site mode.

### Critical Files for Implementation
- /home/ole/proj/webcockpit/src/phone/index.ts
- /home/ole/proj/webcockpit/src/layout/cockpit.ts
- /home/ole/proj/webcockpit/src/app/shell.ts
- /home/ole/proj/webcockpit/src/app/player-host.ts
- /home/ole/proj/webcockpit/src/core/device.ts

Also central: /home/ole/proj/webcockpit/src/layout/phone-game.ts, /home/ole/proj/webcockpit/src/player/view.ts, /home/ole/proj/webcockpit/src/chrome/index.tsx, /home/ole/proj/webcockpit/src/layout/phone-viewport.ts, /home/ole/proj/webcockpit/tests/e2e/esc-options.ts, /home/ole/proj/webcockpit/docs/stages/55-scrap-old-phone-layout.md
