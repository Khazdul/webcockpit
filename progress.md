# Progress

Current stage: 14 Pane bar, built, awaiting release and owner test (latest release 0.1.35). Stage 8 stays open: owner test of part D (fonts), then the v1 verdict.

## Stages

| # | Stage | Status | Stage file |
|---|---|---|---|
| 1 | Connect and play | Done | `docs/stages/01-connect-and-play.md` |
| 2 | Look and layout | Done | `docs/stages/02-look-and-layout.md` |
| 3 | Script engine and profile editor | Done | `docs/stages/03-script-engine-and-editor.md` |
| 4 | GMCP panes | Done | `docs/stages/04-gmcp-panes.md` |
| 5 | Timers and trackers | Done | `docs/stages/05-timers-and-trackers.md` |
| 6 | Runs | Done | `docs/stages/06-runs.md` |
| 7 | Sharing | Done | `docs/stages/07-sharing.md` |
| 8 | Hardening → v1 | In progress | `docs/stages/08-hardening.md` |
| 9 | Map | Done | `docs/stages/09-map.md` |
| 10 | Scripts | Done | `docs/stages/10-scripts.md` |
| 11 | Script panes | Done | `docs/stages/11-script-panes.md` |
| 12 | Key manager | Done | `docs/stages/12-key-manager.md` |
| 13 | Dock lanes | Done | `docs/stages/13-dock-lanes.md` |
| 14 | Pane bar | Owner testing | `docs/stages/14-panebar.md` |

Statuses: Next, In progress, Owner testing, Done.

## Session log

Newest first.

### 2026-10-03 — Stage 14: pane bar; Options → Text input (not released)

- **Owner request:** a bundled menu bar script with short-name toggle
  buttons for every pane; mockup approved in a simplified form (no
  per-pane colours, light = on, dark = off). Owner: no frame, off by
  default, bottom dock. Options: new Text input menu, Elrond narrate
  line (palette 3) in the Appearance preview.
- **Done:** pane list Lua API (`getPanes`, `setPaneOn`, `pane:dock`,
  `pane:wantSize`, `sysPanesChanged`, `createPane{short,border,lane}`),
  shade tags in pane text, per-lane minimum (1-row bar lane), soft grip
  for borderless script panes, `panebar.lua`. ADR 0065. Text input menu
  and preview line, ADR 0066 (built in a worktree, merged).
- **Verified:** typecheck clean, unit 1963 green, e2e 400 green
  (Chromium + Firefox) on the merged main.
- **Not released:** the version bump and tag push were blocked by the
  session's permission check; the owner releases per ADR 0028.
- **Next:** release 0.1.36, owner test per `docs/stages/14-panebar.md`.
- **Commits:** 356bd14, f6f5010, 68810aa, df84aa4, 231baf5, 128eefb,
  8595aed, 18d6620, 70acc51, dd7368b, c2b43f2, 083c32f, plus this one.

### 2026-10-03 — Stage 13: dock lanes, release 0.1.35

- **Player request (via owner):** several columns in a side dock, several
  rows in the top/bottom dock.
- **Done:** `DockState = { lanes }`, lane 0 at the screen edge, empty
  lanes removed; old layouts migrate. A lane's cross-axis edge band
  (1–3 cells) makes a new lane; lane boundaries resize; the gap resizes
  the innermost lane. ADR 0064 (with implementation notes).
- **Verified:** typecheck clean, unit 1930 green, e2e 390 green
  (Chromium + Firefox). The Firefox float-corner cursor check in
  `layout.spec.ts:246` is flaky, also before this change.
- **Released:** 0.1.35 (tag v0.1.35), build:pages smoke green, Pages
  deploy green, live release.json shows 0.1.35.
- **Owner test:** overview test OK, approved; stage 13 closed.
- **Commits:** 6f1e22e, 36b3767, 4f5aa18, 0c8dc25, d692b2a, 98a38dd,
  plus this one.

### 2026-10-03 — Input options: auto-clear and autosuggest, release 0.1.34

- **Owner request:** two `[X]`/`[ ]` toggles directly in the Options hub,
  both default off: "Auto-clear input" (empty line after Enter) and
  "Input autosuggest" (Cockpit's inline history suggestion).
- **Done:** `Settings.input { autoClear, autosuggest }` (not in the VIEW
  snapshot); grey ghost text after a space, Right/End take all, Tab takes
  a word, macros still win; no suggestion while browsing history. ADR 0063.
- **Verified:** typecheck clean, unit 1913 green, chrome e2e green
  (Chromium + Firefox).
- **Released:** 0.1.34 (tag v0.1.34), build:pages smoke green, Pages
  deploy green, live release.json shows 0.1.34.
- **Next:** owner feedback on the two input options.
- **Commits:** fe26104, 1de3111, 537ee5b, cbc3b7f, f04589a, bce0c50,
  5e8c162, plus this one.

### 2026-10-03 — Themes for the dark backgrounds, release 0.1.33

- **Owner request:** tune the palette for every non-black background as
  for paper. Owner chose: a distinct theme per background, ≥ 4.5:1,
  black stays DOS, matching font colour.
- **Done:** `BACKGROUND_THEMES` (Kanagawa, Everforest, Tokyo Night,
  Tomorrow Night, Ayu, Dracula, Solarized, Gruvbox, Nord), lifted to
  4.5:1; `backgroundPatch` sets fg + palette on every preset; "Reset
  palette" follows the background. ADR 0061.
- **Verified:** typecheck clean, unit 1901 green, Appearance e2e green.
- **Preview:** room description one line shorter; three coloured lines
  added under the prompt (cyan, magenta, red); box 52 wide; the blanks
  around the flash row dropped so it fits at 800 px.
- **Font colours:** named presets sage, silver, mist, wheat, lavender,
  frost, ink (ash/stone/shadow removed); themes use them. ADR 0062.
- **Released:** 0.1.33 (tag v0.1.33), build:pages smoke green, Pages
  deploy green, live release.json shows 0.1.33.
- **Next:** owner feedback on the themes.
- **Commits:** d1904e8, a8f4484, cbb45e7, 9cec3d2, 7ed81a4, 6fa713c,
  0a4f8fb, plus this one.

### 2026-10-03 — Appearance option "Bold brightens colours", release 0.1.32

- **User report (Discord):** bold mob names (MUME `change colour`, bold
  in default colour) barely visible in DejaVu Sans Mono.
- **Owner decision:** add an option, default off (Cockpit look).
- **Done:** `boldBright` setting; bold colours via CSS tokens
  (`--bold-0..7`, `--bold-fg`), live without redraw; default silver →
  white; paper keeps black ink. Inverse runs not brightened. ADR 0060.
- **Verified:** typecheck clean, unit 1879 green, e2e green (one
  Firefox `scripts.spec` flake passed on rerun).
- **Released:** 0.1.32 (tag v0.1.32), build:pages smoke green.
- **Commits:** a98afac, 19279be, f62c659, 1edbffa, plus this one.

### 2026-10-03 — Map wheel always zooms, release 0.1.31

- **User report (Discord):** on a laptop trackpad, pinch / two-finger
  swipe changed map layer instead of zooming (arrives as Ctrl+wheel).
- **Owner decision:** drop manual layer change; every wheel zooms.
- **Done:** Ctrl branch and the `layer` message path removed; pinch
  (Ctrl, |deltaY| < 50 px) uses 40 px per notch. ADR 0059.
- **Verified:** typecheck clean, unit 1872 green, map e2e 16 green.
  Not tested on a real trackpad.
- **Released:** 0.1.31 (tag v0.1.31), build:pages smoke green.
- **Next:** ask the reporter to retest (pinch and two-finger swipe).
- **Commits:** f0ee7b5, 9c8fef2, c1560ba, 44f1659, plus this one.

### 2026-10-03 — Paper background sets ink and a paper palette, release 0.1.30

- **Owner request:** choosing paper sets ink as font colour and an ANSI
  palette tuned for paper; leaving paper restores the defaults.
- **Done:** `backgroundPatch` + `PAPER_PALETTE` (all ≥ 4.5:1), ADR 0058.
- **Verified:** unit 1872 green, typecheck clean, Appearance e2e green.
- **Released:** 0.1.30 (tag v0.1.30), build:pages smoke green.
- **Commits:** cf64ec1, 4a36598, 572708f, plus this one.

### 2026-10-03 — #showme self-loop fix, release 0.1.29

- **Owner report:** locate life printed "#showme → action loop deeper
  than 8" per row. Cause: the owner's stored khazdul profile still has
  `#action {^%1key: '%2'$} {#showme %0}` (dropped from the bundled
  profile in db28171); the owner removes it by hand.
- **Fix:** an action never fires on its own #showme line (like aliases);
  the depth guard stays for long chains of distinct actions.
- **Verified:** unit 1868 green, typecheck clean, build:pages smoke green.
- **Released:** 0.1.29 (tag v0.1.29).
- **Commits:** a8d4b4d, 5d8dc3e, plus this one.

### 2026-10-02 — About: Lua scripts, release 0.1.28

- **Owner request:** a short LUA SCRIPTS section in About after SETTINGS:
  Lua with its own API, and the editor that completes commands and shows
  syntax and help. A first, bulleted version was too long; cut to one
  paragraph.
- **Verified:** unit 1866 green, typecheck clean.
- **Released:** 0.1.28 (tag v0.1.28).
- **Next:** unchanged (stage 11 in a new session).
- **Commits:** 6aba300, c081e76, 4f1a27b, plus this one.

### 2026-10-02 — Stage 12 done

- **Owner:** satisfied after round 8; close the stage, no release yet.
- **Docs:** stage file marked done with carried-over items; spec §2.10
  key manager bullet follows what shipped (Port keys, TV, map marks).
- **Carried over:** scry/watch/failure line formats unverified in MUME;
  map marks not in runs; KEYS lines not light-theme adjusted.
- **Next:** release 0.1.28 when the owner says so; stage 8 part D owner
  test and the v1 verdict.
- **Commits:** this one.

### 2026-10-02 — Stage 12 round 8 feedback built

- **Owner:** `◻` stayed grey after its TV closed (bug: no redraw on
  close); open TV in light green; no cyan: names gold, buttons grey;
  mercenaries the same.
- **Built:** every TV open/close path redraws Port keys; bundled-script
  colour convention in ADR 0054 (gold names, grey buttons, colour only
  for meaning) used by key manager and mercenaries.
- **Verified:** typecheck, unit 1866, build; full e2e 376/382 under heavy
  load (Firefox output/replay specs), those specs green when rerun.
- **Next:** owner test round 9; release 0.1.28 when asked.
- **Commits:** 41f0c66, b6acb77, f6c4975, plus this one.

### 2026-10-02 — Stage 12 round 7 feedback built

- **Owner:** TVs open scattered; they should tile from the top left
  (1, right of 1, below 1, below 2) and close up without holes; a TV
  closes when its watch ends.
- **Built:** tiled groups of temporary panes (`group`, `grid`; group
  drag/resize kept per device; ADR 0053 addendum); TVs one per key,
  `tvclose` 0, closed only on the real drop.
- **Verified:** typecheck, unit 1864, build; full e2e 377/380 under load,
  each failure passes alone; keymanager and map e2e rerun green.
- **Next:** owner test round 8; release 0.1.28 when asked.
- **Commits:** a3855f1, 7259cd1, 74ea44f, 9478e27, plus this one.

### 2026-10-02 — Stage 12 round 6 feedback built

- **Owner:** a scry TV lives as long as the map blink (15 s) unless the
  key is watched; `◻` blinks cyan/red during a watch; a TV closed itself
  every second during a watch (bug); marks linger 3 min after the blink.
- **Built:** `mapMark{linger}` (steady, no ticker; ADR 0057); TVs know
  whether an event or the player opened them (the bug's fix); `◻` blink
  via `setText`.
- **Verified:** typecheck, unit 1859, build; full e2e 377/378 rerun by the
  main session (Firefox caret test flakes under load, 5/5 alone).
- **Next:** owner test round 7; release 0.1.28 when asked.
- **Commits:** 49ca986, 5173b67, 742ca65, 09f7079, plus this one.

### 2026-10-02 — Stage 12 round 6 built: scry marks on the map

- **Owner:** a scried room blinks magenta on the map for 15 s, with
  arrows when off view and a zoom-out to fit; a touched view stays put;
  map off does nothing; live only (no replay yet).
- **Built:** ADR 0057; worker room query, marks, focus, `drawMark`;
  `mapMark`/`mapUnmark`/`mapFind`; key manager marks each scry.
- **Verified:** typecheck, unit 1855, full e2e 378/378, build, map bench
  gate within budgets.
- **Open:** scry format unverified in MUME; XML room-name tags unused;
  marks not recorded in runs.
- **Next:** owner test rounds 5 and 6; release 0.1.28 when asked.
- **Commits:** ea27279, e1da999, 2655f60, c25111e, 1bd7135, 0f4aa8c,
  38285f7, 6690e41, plus this one.

### 2026-10-02 — Stage 12 round 4 feedback built

- **Owner:** gag the blank line and prompt after watch lines; learn
  watch length per character (last 3); steady hover while panes tick;
  `◻` TV button, no red dot, countdown with a tooltip; TV lost colours.
- **Built:** ADR 0056 (hover follows the pointer, `pane:setText`,
  tooltip-only links), `isPrompt()`; key manager fixes (dimming kept
  colours wrongly, now only default text dims).
- **Verified:** typecheck, unit 1842, e2e 375/376 (layout flake, passes
  rerun), build green.
- **Next:** owner test round 5; scry map marks designed in parallel
  (round 6).
- **Commits:** 78711cc, f1f719e, be460fd, b8139bb, a676148, plus this one.

### 2026-10-02 — Stage 12 round 4 built: TV for watch room and scry

- **Owner:** round 3 approved; `cast q 'teleport'` and long names
  verified in MUME.
- **Built:** `copy2cecho()`, more temporary pane places; TV panes
  (`tv1`–`tv4`, corners) with coloured lines, status in the title,
  learnt watch length, `tvgag`/`tvclose`, `tv`, `kecho` (ADR 0054).
- **Verified:** typecheck, unit 1837, e2e 375/376 (new scroll test flaked
  once under load, 36/36 repeated), build green.
- **Open:** TV line formats from the Mudlet script, unverified in MUME;
  failure lines unverified; TV history is memory only.
- **Next:** owner test round 4; release 0.1.28 when the owner says so.
- **Commits:** 54b3537, 9e6fc4d, 2b81d59, d349d9d, 928e952, plus this one.

### 2026-10-02 — Stage 12 feedback round 2 built

- **Owner:** the rename field showed the old name through it; a click
  outside left the row stuck (and undeletable); `skey` goes (star only);
  safe key messages name only the key.
- **Built:** opaque, readable pane text fields and `onBlur` (ADR 0055);
  key manager cancels a rename on blur or any row action.
- **Verified:** typecheck, unit 1832, e2e 373/374 (a different spec
  flakes in each full run, passes alone), build green.
- **Next:** owner test round 3 (stage file test guide).
- **Commits:** 01b775e, c98df8f, 4238fb3, 6f3e0ca, plus this one.

### 2026-10-02 — Stage 12 feedback round 1 built

- **Owner:** UI messages for library changes; pane "Port keys" without
  the character name; click a name to rename; no `dkey`/`rkey`; settings
  apply at once; panes scroll; temporary panes remember their place.
- **Built:** `sysSettingChanged` (mercenaries uses it too); script pane
  scrolling with `createPane{anchor}`; temporary panes `at` + per-device
  rectangles, forgotten by Reset layout (ADR 0053 addendum, ADR 0054).
- **Verified:** typecheck, unit 1830, e2e 373/374 (underscores flake in
  full runs, passes alone), build green.
- **Next:** owner test round 2 (stage file test guide).
- **Commits:** e0bb9c6, a6e88e2, 0cea8d4, dc6127c, ce8e646, plus this one.

### 2026-10-02 — Stage 12 round 1 built: key manager and pane text fields

- **Owner:** Mudlet Port Key Library is the reference
  (`notes/research/mudlet-portkeys/`); keys per character (12 h);
  Ctrl+S/Alt+S safe teleport; every locate is caught however it is cast;
  the key name is typed in the pick window; TV (scry/watch) a later round.
- **Built:** bundled `keymanager.lua` (Keys pane, pick window, safe key,
  `$name`, casts; ADR 0054); `pane:setInput` text fields (ADR 0055).
- **Verified:** typecheck, unit 1823, e2e 371/372 (one Chromium
  screenshot error in underscores, passes alone), build green.
- **Open:** failure lines, `cast q 'teleport'` and long names unverified
  in MUME; field uses a thin caret, not the block cursor.
- **Next:** owner test round 1 (stage file test guide); release on request.
- **Commits:** 733ac09, e82ca40, bed9c07, 308b34d, 534b79e, 31e3f9e, plus this one.

### 2026-10-02 — Stage 11 done

- **Owner:** round 1 tested and approved.
- **Docs:** spec §2.10 brought up to date (pane methods, temporary
  panes, `getEpoch`, scripts backup, mercenaries); API docs and the
  script manual already covered everything.
- **Next:** release 0.1.28 when the owner says so; stage 12 waits for
  the key manager reference script; stage 8 part D still open.
- **Commits:** this one.

### 2026-10-02 — Stage 11 feedback round 1

- **Owner:** overview tests OK. Mercenaries cost 10 silver or 1 gold
  (setting `cost`, header toggle, learnt from a mercenary's speech);
  orders are `ask <name> lead/ride/flee`; pay by clicking the PAY DUE
  bar. Temporary panes: `createPane{temporary = true}`, `pane:close()`,
  `pane:onClose(fn)`; not in menus, nothing persisted, recorded in runs.
- **Verified:** unit 1800, e2e 368 (both browsers), build green.
- **Open:** real price line and `ask` orders unverified in MUME.
- **Next:** owner test of round 1; release when the owner says so.
- **Commits:** 93a208a, 86f0b67, 0f46b4c, f22b289, plus this one.

### 2026-10-02 — Stage 11 built: script panes and mercenaries

- **P0:** dynamic pane ids (`<script>/<pane>`), `ScriptPane` on the
  frame/grid code, `createPane` and pane methods (+ `show/hide/visible/
  setTitle/onResize`), Options → Panes lists script panes. ADR 0053.
- **P1:** `ESC SPANE` records (full + change records, 0.6 MB/h for a
  busy pane); log player and HTML replay draw them without Lua.
- **P2:** bundled `mercenaries.lua` with a pane, orders and autopay;
  `getEpoch()` added; side docks reserve a script pane's rows.
- **P3:** EXPORT → all scripts backup, restore via IMPORT; contrast fix
  on tinted panes; test guide. Unit 1784, e2e 366, prod e2e 10, bench OK.
- **Open:** mercenary lines and 25 min/10 silver unverified against real
  MUME; bundled script sources in the cold-start chunk (+18 kB).
- **Next:** owner test (stage file test guide); release when the owner
  says so. Stage 12 waits for the key manager reference script.
- **Commits:** 1d42806 … 1d9be46, plus this one.

### 2026-10-02 — Scripts moves under Options

- **Owner feedback round 7:** Scripts leaves the start page and ESC
  menus and becomes Options → Scripts in both (last in the Options hub,
  only with a script library). Help topic and script manual updated.
- **Verified:** unit 1721 green; e2e 358 passed in both browsers.
- **Not released:** the owner holds it; it goes out with the next
  release (0.1.28 or later).
- **Next:** stage 11 (script panes) in a new session.
- **Commits:** 29657b4, feb3c6d, plus this one.

### 2026-10-02 — Session close

- **Owner:** coin looter tested in live play and approved; the note
  about mentioning scripts to the Valar is dropped.
- **Next (new session):** stage 11, script panes and mercenaries. Stage
  12 waits for the owner's Mudlet key manager script. Stage 8 part D
  (fonts) owner test and the v1 verdict are still open.
- **Commits:** this one.

### 2026-10-02 — Completion follows deletes, release 0.1.27

- **Owner feedback round 6:** the completion list lost track after
  Backspace (e.g. `gmcp.comm.channel.li` back to `gmcp.`). Fixed: a list
  stays valid only while the word grows, and a plugin reopens it after
  delete, Ctrl+Backspace, undo, redo, cut and paste when there are
  candidates. Cursor moves and ESC-closed lists don't reopen.
- **Verified:** unit 1721 green; editor e2e 64 passed in both browsers.
- **Released:** 0.1.27 (tag v0.1.27).
- **Next:** unchanged (stage 11 in a new session).
- **Commits:** aebe38f, 36d9dc2, 5fcb57c, plus this one.

### 2026-10-02 — Completion after a dot, release 0.1.26

- **Owner feedback round 5:**
  - no "F1 Manual" line in the pop-ups;
  - the member list opens right after `.` or `:`, for the libraries,
    `gmcp`, `state`, `settings`, `store` and string methods;
  - the list shows 10 rows and scrolls; the info panel is capped.
- **Verified:** unit 1716 green; editor e2e 44 passed in both browsers.
- **Released:** 0.1.26 (tag v0.1.26), deploy OK, live `release.json`
  reports 0.1.26 at 11d5d09, prod smoke 10/10.
- **Next:** unchanged (stage 11 in a new session).
- **Commits:** fbecb9e, d1f274c, 23ed424, 11d5d09, plus this one.

### 2026-10-02 — Script editor as a code editor, release 0.1.25

- **Owner feedback round 4:**
  - SAVE and MANUAL buttons removed (Ctrl+S, F1);
  - Tab indents and accepts completions;
  - live errors held back while typing on their line or on unfinished
    code (released by leaving the line, 1.5 s idle, or save);
  - Enter auto-closes blocks (`end`, `end)`, `until`);
  - case auto-correct of API and Lua names (undo once and it stays).
- **Verified:** unit 1712 green; editor e2e 38/38; full e2e flakes only
  in the replay file:// test (fails on base too) and the Statistics
  scroll test, both of which pass alone.
- **Released:** 0.1.25 (tag v0.1.25), deploy OK, live `release.json`
  reports 0.1.25 at ca48c68, prod smoke 10/10.
- **Next:** unchanged (stage 11 in a new session).
- **Commits:** 36d703e..cfb8653, ca48c68, plus this one.

### 2026-10-02 — Lua help, stage 10 done, release 0.1.24

- **Lua help (owner feedback):**
  - the editor shows pop-ups for every sandbox Lua function and keyword
    (`lua-ref.ts`, checked against the live sandbox);
  - signature help with the current parameter marked;
  - snippets for keywords;
  - the manual gains "Lua basics", "Lua patterns" and a generated Lua
    library index, but not the whole Lua manual (owner agreed).
- **Stage 10:** done. Coin looter feedback from live play becomes fixes.
- **Released:** 0.1.24 (tag v0.1.24). Local `build:pages` green, Pages
  deploy OK, live `release.json` reports 0.1.24 at 994191b, prod smoke
  10/10.
- **Next (new session):** stage 11, script panes and mercenaries
  (`docs/stages/11-script-panes.md`, starting points listed). Stage 12
  waits for the owner's Mudlet key manager script. Stage 8 part D owner
  test is still open.
- **Commits:** 6cc16b5, f9d0e07, bd8b5c9, 8fd80c2, c2edd38, 994191b,
  242447a, plus this one.

### 2026-10-02 — Script GMCP fixes, pixel scrolling in panes

- **Script API:**
  - parent GMCP events (`gmcp.Char` catches `Char.Vitals`);
  - only `Char.Vitals` and `Char.StatusVars` merge, every other
    message replaces;
  - a GMCP cache from app start seeds `gmcp`;
  - `cecho` accepts `<b>`, `<i>`, `<u>` and `#rrggbb`; `highlight`
    accepts cecho tags.
- **Owner decision:** the Comm, UI and Timers panes scroll by pixels;
  the log player's wheel cursor is unchanged (ADR 0052).
- **Verified:** unit 1671 green; full e2e 312 passed; text bench
  unchanged.
- **Next:** owner retest of stage 10, then stage 11.
- **Commits:** 792c721, b946bba, 8a1df9a, 8f8b7a4, dda9d3c, fb702a1,
  plus this one.

### 2026-10-02 — Stage 10 owner feedback round 1

- **Done:**
  - the `#script help` note is gone from the Scripts page;
  - new `#help script` topic;
  - Ctrl+F opens a TUI find/replace panel in both editors;
  - live syntax and header errors with line marks, and runtime errors
    marked on their line (code still applies on save only);
  - CLOSE is replaced by MANUAL: a script manual with 14 sections and
    an A–Z API reference from `lua-api.ts`, opened with F1 at the name
    under the cursor;
  - native pixel scrolling on chrome surfaces (`kit/scroll.tsx`).
- **Verified:** typecheck; unit 1664 green; affected e2e in Chromium and
  Firefox. Editor chunk is 156 KB gz (+29).
- **Open:** owner decision on pixel scrolling in the Comm, UI and
  Timers panes and in the log player's wheel cursor (Inv §2.7.5, §7.5).
  GMCP API fixes are running: parent events, merge vs replace, seeding,
  colour forms.
- **Commits:** dcf331d..0fb7508, plus this one.

### 2026-10-02 — Stage 10 built: Scripts page, editor, coin looter

- **Built:** P2 Scripts page (under Profile, start page and ESC menu)
  with list, help view, import/export, rename/delete, and a full-screen
  Lua editor with completion and hover. P3 bundled coin looter. API 1
  gained `setSetting` and `scriptName`, so `cl on/off` persists.
- **Verified:** typecheck; unit 1641 green; e2e scripts, scripts-page
  and chrome 34/34 (Chromium; P2 also ran Firefox); build. Editor chunk
  is 127 KB gz (+28); cold start unchanged.
- **Open:** the help view hides below about 70 columns; a disabled
  script gets no syntax check; the in-call hang marker is untested in
  Firefox.
- **Next:** owner test (stage 10 test guide), then stage 11.
- **Commits:** 89806f3..1755f55 (P2), 2a71500, 307614c (P3), d3c10f2,
  c8dec43, plus this one.

### 2026-10-02 — Stage 10 P1: script API

- **Built:** header parser, DB v8 (`scripts`, `scriptData`), the library
  service, a lazy script host with per-script owner registries, the
  `scripts` rule store, API v1 without panes, `#script` and `#lua`, and
  a hang guard (marker plus a pattern guard). ADR 0051 package notes.
- **Verified:** typecheck; unit 1611 green; e2e `scripts.spec.ts` in
  Chromium and Firefox. Bench: 15.4 µs per line with a Lua script, 14.5
  without (budget 200).
- **Open:** in Firefox the in-call hang marker is untested with a real
  hang.
- **Next:** P2 Scripts page and editor, and P3 coin looter (both running).
- **Commits:** 8aff713..fefaabf, plus this one.

### 2026-10-01 — Stage 10 P0: Lua runtime

- **Owner decisions:** scripts move ahead of v1; split into stages 10
  (engine, API, page, coin looter), 11 (script panes, mercenaries) and
  12 (key manager).
- **Built:** `src/lua/` with wasmoon 1.16.0, loaded lazily with
  self-hosted wasm. It has a sandbox with read-only libraries and no
  `load`, an instruction budget with poison, and a memory cap. The raw C
  API bridge costs 1.35 µs per line call. 39 unit tests; the bench is in
  `npm run bench`.
- **Open:** a single pathological Lua pattern search is not interrupted
  by the budget. P1 adds a safe-mode hang guard.
- **Next:** P1 script API (running), then P2 page and editor, then P3
  coin looter.
- **Commits:** 777d177..860b682, 4bebbbd, d96db38, 7ffd2c5, plus this one.

### 2026-10-01 — Scripts brainstorm and spec (stage 10)

- **Owner decisions:** user scripts are in scope as intent Goal 10
  (approved). They are written in Lua and kept in a separate library under
  *Profile*: a list with toggles, a help view, and a full-screen editor.
  Panes have gauges and clickable cells. Bundled scripts: coin looter,
  mercenaries and key manager. Full list in `notes/research/scripting.md`.
- **Spike:** wasmoon 1.16.0 fits. It is about 125 KB brotli, lazy, with
  1–1.5 µs per raw line call; the sandbox, instruction budget and memory
  cap work. ADR 0051.
- **Docs:** spec §2.10, stage file `10-scripts.md`.
- **Next:** stage 8 continues. Stage 10 starts after v1. The key manager
  waits for the owner's Mudlet reference script.
- **Commits:** ff7566e, 966b41d, plus this one.

### 2026-10-01 — Release 0.1.23

- **Released:** 0.1.23 (tag v0.1.23) with the player close-cross fix.
  Local `build:pages` green, Pages deploy OK, live `release.json`
  reports 0.1.23 at c0eefb6, prod smoke 10/10.
- **Open:** owner has not yet tested the fix in the browser.
- **Commits:** c0eefb6, plus this one.

### 2026-10-01 — Player: close cross sticks

- **Fix (owner report):** a pane hidden with its close cross in RUN LOG
  or the HTML replay came back after a seek; the player host now records
  it as a pane override, same as the gear's pane toggle.
- **Verified:** typecheck, unit 1497 green (new test fails without the
  fix), e2e viewer/replay/player 26/26.
- **Next:** unchanged (owner test of part D, then release).
- **Commits:** d1e5ff6, plus this one.

### 2026-10-01 — More fonts (stage 8 part D)

- **Fonts:** 13 more bundled families (Agave, Anonymous Pro, Cascadia
  Mono, Fantasque, Fira Code, Go Mono, Hack, Hermit, IBM 3270, IBM Plex
  Mono, Inconsolata, mononoki, Noto Sans Mono) plus Lucida Console, shown
  only when installed, never shipped or embedded in exports (ADR 0049).
- **Owner decisions:** Noto Sans Mono replaces the deprecated Noto Mono;
  own "WebCockpit Fill" faces draw the box/block glyphs Anonymous Pro,
  Hermit, Go Mono and Lucida lack. Ligatures off everywhere.
- **Credits:** licence texts in `public/fonts/`, THIRD_PARTY_NOTICES,
  About, and the export notice lists the fonts it embeds.
- **Verified:** typecheck, unit 1481 green, build; e2e 269/270 (replay
  file:// timing flake, green on rerun); seam sweep 6–32 px in Chromium
  and Firefox on Linux.
- **Open:** missing symbols (✦★⚠…) still come from DejaVu at its width;
  small-size underscore clipping in a few fonts;
  Windows/macOS untested.
- **Next:** owner test (part D test guide, D9), then release.
- **JetBrains Mono seams (owner OK'd):** `halfUpPx` + `cellMargin` 0.1
  instead of `wholePx` (which made 13 sizes taller); widths unchanged,
  rows 1 px lower at 16–17 and 25, 1 px taller at 8–9; no seams 6–32 in
  either browser.
- **Row clipping:** kit and pane rows clipped each glyph to its cell, so
  █/│ could stop a device px short (owner: JetBrains 18, Firefox 2x).
  Rows now clip sideways only; Firefox 1x/2x clean for all 16 fonts.
- **Device-pixel cells (owner OK'd, ADR 0050):** cells fit to device px
  at DPR != 1; DPR 1 cells identical (fixture test); re-measure on DPR
  change. Firefox clean at 100/125/150/200 %; Chromium clean at 100/200 %
  (except Lucida │ at 200 %), partial at 125/150 %; Firefox 175 % kit rows
  seam. Windows/macOS untested.
- **Commits:** 1851ae1, 1c7debd, 8fd1b98, 13d5ae5, c2e19de, 5669a3b,
  9344592, f0656a5, 7373890, plus this one.

### 2026-10-01 — Wheel speed, About, spotlight hint

- **Output:** the game text scrolls at half the browser's wheel and
  trackpad speed (`WHEEL_SCALE` in `src/ui/output-pane.ts`); the log
  player keeps the wheel for its cursor. Ctrl+wheel still zooms.
- **About:** the profile paragraph ends at "TinTin++ syntax." and points
  to HELP and #help; TinTin++ moved to CREDITS.
- **Spotlights:** header hints add `1–6 Speed`.
- **Menus:** chrome and editor frames moved 1–3 rows per wheel event, so
  a trackpad swipe ran away. They now sum the deltas
  (`src/chrome/kit/wheel.ts`): about 3 rows per mouse notch, one per
  40 px of swipe; tables one row per notch.
- **Owner:** tried the trackpad in the dev server; the speed feels right.
- **Next:** release (0.1.23) when the owner says so.
- **Commits:** 4bc0ddf, a18d97e, plus this one.

### 2026-10-01 — Release 0.1.22

- **Profile:** khazdul trimmed on owner request: sm/$mees, F8/F9, bb, rr,
  obk, oht and the `key:` action removed; s1, s2 ... is now a pattern
  alias like b1 (`cast $ss 'sleep' %1.$target`); char comment explains
  it names who followers protect and rescue.
- **Released:** 0.1.22 (tag v0.1.22). Local `build:pages` green, Pages
  deploy OK, live `release.json` reports 0.1.22 at a24e0ec, prod smoke
  10/10.
- **Open:** stored copies of khazdul are not reseeded; existing users
  keep the old profile.
- **Commits:** db28171, a24e0ec, plus this one.

### 2026-10-01 — Release 0.1.21

- **Released:** 0.1.21 (tag v0.1.21): top dock zone half a row, close
  cross on pane hover. Local `build:pages` green, Pages deploy OK, live
  `release.json` reports 0.1.21 at f49d6cd. Prod smoke against
  mumecockpit.com: first run 9/10 (Firefox site-root, right after the
  deploy), rerun 10/10.
- **Owner:** tested both changes and asked to publish.
- **Next:** the later parts of stage 8 (PvP fixes, polish).
- **Commits:** f49d6cd, plus this one.

### 2026-10-01 — Top dock zone

- **Fix:** the top screen-edge dock zone is now the upper half of row 0
  (was 2 rows), so a dragged floating pane can sit at row 0. Owner
  tested: OK.
- **Feature:** hovering a pane shows " × " in its title row; clicking it
  switches the pane off. ADR 0014 amended for both; unit and e2e tests.
- **Open issue:** e2e "a drag shows its cursor on a shield…" failed once
  in a single-file run, passed in the full run (270/270): flaky.
- **Next:** owner test of the cross, then release; later parts of stage 8.
- **Commits:** 7b02809, 5551a51, plus the close-cross commits.

### 2026-10-01 — Release 0.1.20

- **Released:** 0.1.20 (tag v0.1.20): stage 8 part C performance fixes
  and edge-to-edge EDITOR/HELP. Local `build:pages` green (Chromium and
  Firefox smoke), Pages deploy OK, live `release.json` reports 0.1.20 at
  c3a8d3f, prod smoke against mumecockpit.com 10/10.
- **Owner:** asked to publish directly; the full part C test guide was
  not run first.
- **Next:** the later parts of stage 8 (PvP fixes, polish).
- **Commits:** c3a8d3f, plus this one.

### 2026-10-01 — Editor edge to edge

- **Done:** EDITOR and HELP in the profile editor span the frame from
  cell 0 to the last cell at every width; the left margin is gone
  (ADR 0037, "Edge to edge"). LITE and the title row stay centred.
- **Tests:** unit all green, e2e 268/268.
- **Next:** unchanged: C17 release 0.1.20 when the owner asks.
- **Commits:** this one.

### 2026-10-01 — Stage 8 part C: performance fixes

- **Done:** C0–C16, built by parallel subagents in worktrees, merged.
  Caret timer blink, send first, scroll-mode and drag restyles gone,
  background rows, `content-visibility` chunks with the pane's own
  anchor (ADR 0045), 500-row catch-up, scrollback setting (ADR 0046),
  `#perf` (ADR 0047), ingest and recorder fixes (ADR 0048), pane row
  diff, small fixes. Benchmark at the owner's geometry (C15).
- **Measured** (quiet machine, base 26cf8e8): caret latency Firefox
  10–12 → 2.7–2.9 ms; scroll mode at 20k rows 118 → 17 ms (Chromium);
  colour page −74/−83 %; width change 45/57 → 6 ms; drag 89 → 0.3 ms;
  recorder task 12 → 4 ms. A Firefox flush regression from C8 was found
  and fixed. `notes/research/perf-review/part-c-results.md`.
- **Tests:** unit 1412 + 1 skipped, e2e 268/268, bench 19/19.
- **Owner:** played briefly on the local build: works well. Do not
  publish yet.
- **Next:** C17: release 0.1.20 when the owner asks; the full part C
  test guide; then the later parts of stage 8 (PvP fixes, polish).
- **Open issues:** C-P8 (Firefox ingest slices) not built: stress-only
  gain; Firefox may log a harmless ResizeObserver loop message while
  scrolled back (ADR 0045).
- **Commits:** c448d41…3832812, plus this one.

### 2026-09-30 — Stage 8 part B: performance review

- **Done:** five parallel subagent reviews, measured in headless Firefox
  and Chromium at pixel ratio 2, the owner's geometry (this machine has
  only Firefox): rendering, ingest, input latency, long sessions (12.9 h
  soak), panes and frames. The key comparisons were re-run on a quiet
  machine. Report with ranked proposals: `notes/research/performance-review.md`.
  Reports, patches and harnesses: `notes/research/perf-review/`. ADR 0044
  holds the outcome and the performance rules.
- **Found:** normal play is fast and nothing grows over the soak. The
  repro is one span per colour cell. The caret's CSS blink adds ~8 ms
  to every received line while the caret shows. Full-scrollback stalls
  of 85–171 ms come from scroll mode, width change and drag. Recorder
  chunk tasks reach 30–95 ms in bursts.
- **Owner decisions:** build all four groups (small fixes, medium fixes,
  `#perf`, the benchmark); caret blink by a timer; catch-up capped at 500
  rows per frame; scrollback depth becomes a setting (default 20 000).
- **Next:** stage 8 part C: C0–C17 in the stage file, in order.
- **Open issues:** `timers-replay.test.ts` still fails (C0). The bench's
  published frame → paint medians include the caret-blink wait. Its
  "map off" columns have the map on.
- **Commits:** 2cf02cb, plus this one.

### 2026-09-30 — Release 0.1.19

- **Released:** 0.1.19 (tag v0.1.19): clock-strip blank, light UI
  colours on paper (ADR 0041), full-width EDITOR/HELP, underscore glyph
  face (ADR 0043), `_send` removed (ADR 0040). Pages deploy OK; live
  `release.json` reports 0.1.19 at cca2bb8; the underscore face is
  served; prod smoke 10/10. A second Pages run for the same tag started
  and was refused by the version guard (already live), harmless.
- **Owner:** accepts the changes without further testing now and will
  watch for problems in use.
- **Next:** plan the rest of stage 8 (performance brief first).
- **Commits:** cca2bb8, plus this one.

### 2026-09-30 — Underscore glyph face

- **Done:** owner rejected ADR 0042's 1 px lift (it cut accent marks).
  Lift removed (also the editor's own rules from ADR 0037); a one-glyph
  face "WebCockpit Underscore" (U+5F raised 278/2048 units, built by
  `scripts/build-underscore-font.py`) sits ahead of DejaVu, also in the
  HTML replay (ADR 0043). Accents pixel-identical to before the lift;
  `_` whole at 256/256 settings; cell sizes unchanged. Firefox e2e now
  really sets the pixel ratio (`tests/e2e/dpr.ts`). Unit 1326/1327
  (known `timers-replay`), e2e 245–246/246 (flaky reruns pass).
- **Next:** owner tests; release 0.1.19; plan the rest of stage 8.
- **Open issues:** Windows/macOS rendering unmeasured (thin margin at
  Firefox DejaVu 10); pane frames and titles faint on paper; other
  Firefox specs using `deviceScaleFactor` still run at ratio 1; bench
  Chromium software-render scrollback/burst fails on HEAD too
  (environment).
- **Commits:** 2966d48, plus this one.

### 2026-09-30 — Clock blank, light chrome, full-width editor, underscores

- **Done:** owner request, four items. Clock strip is 8 cells with the
  time right-aligned and one blank before the icon. UI roles are
  light-aware on a light terminal background (ADR 0041). EDITOR and HELP
  fill the frame to its last cell at ≥ 79 cols (ADR 0037, "Full width").
  Underscore clipping fixed in the kit, input line, panes and player
  (ADR 0042). Unit 1323/1324 (known `timers-replay`), e2e 232/232,
  browser bench within its usual range. Not released (live is 0.1.18).
- **Next:** owner tests (guide in `docs/stages/08-hardening.md`, Owner
  feedback); release 0.1.19; plan the rest of stage 8.
- **Open issues:** pane frames and titles faint on paper; `_` on an
  output row above a background-coloured row still lost; the 1 px lift
  cuts capital accents at more sizes; editor.css line-height rules now
  duplicate the kit; the full e2e run sometimes times out launching a
  browser under load (passes on rerun); `timers-replay.test.ts`.
- **Commits:** ee45018, 820820b, 6b78ba1, eb873a6, plus this one.

### 2026-09-30 — `_send` removed, session wrap-up

- **Done:** owner decision: `_send` is gone from the engine; stored
  profiles are cleaned at `init()` and imported files on import
  (`stripSend`, ADR 0040, amends 0036). Unit 1312/1313 (known
  `timers-replay`), e2e 218/218, script bench passes. Not released:
  live is 0.1.18, which still honours `_send`.
- **Owner decisions:** `khazdul` is good as it is (candidate list
  closed). Paper-theme readability of `[SYSTEM]` and `#help` rows goes
  to a later session.
- **Next:** release 0.1.19 when the owner asks; paper-theme readability;
  plan the rest of stage 8 (performance brief first).
- **Open issues:** "alias missing in EDITOR" never reproduced (EDITOR
  has no search); underscore clipping may remain in chrome text outside
  the editor; `timers-replay.test.ts` fails on the new Cockpit log.
- **Commits:** this one.

### 2026-09-30 — Release 0.1.18

- **Released:** 0.1.18 (tag v0.1.18): reference `khazdul` profile,
  `_send` deprecated, editor HELP with navigation menu, `#help` from the
  manual, typed settings saved at once, `#message` with confirmation
  rows (ADRs 0036–0039). Pages deploy OK; live `release.json` reports
  0.1.18 at 0248453. Prod smoke against the live site not run.
- **Next:** owner tests live; khazdul candidate list; plan the rest of
  stage 8.
- **Commits:** 0248453, plus this one.

### 2026-09-30 — Reference profile and editor HELP

- **Done:** owner request. `khazdul.tin` rewritten as a reference
  profile (no `_send`, topic sections, `F1`–`F9`, helper aliases);
  `_send` deprecated but still honoured; plain commands are trimmed
  (ADR 0036). Profile editor gets a HELP view with a per-command manual
  kept as data and checked against the engine; underscores clipped in
  LITE fixed (ADR 0037). Unit 1226/1227 (known `timers-replay`), e2e
  204/204.
- **Owner feedback 1:** intro wording changed; HELP gets a navigation
  menu on the left (click or ↑/↓ jumps to a section; hidden below 77
  cols). Unit 1230/1231, e2e 210/210.
- **Owner feedback 2:** the five menu-covered client commands left the
  manual; `#help` lists commands and topics, `#help <command|topic>`
  prints the manual section in the HELP colours (ADR 0037). Definitions
  and `#un…` typed on the input line are written to the profile at once;
  script-made rules stay session-only (ADR 0038, amends 0015). Unit
  1283/1284, e2e 214/214.
- **Owner feedback 3:** system lines no longer name `#connect`,
  `#reconnect` or `#replay`.
- **Owner feedback 4:** `#message` (all on by default, per class
  on/off, saved in the profile) and confirmation rows for typed
  definitions, shown as the profile line with `#` and braces, lower
  case, lexer colours (ADR 0039). Unit 1309/1310, e2e 218/218.
- **Next:** owner tests (guide in `docs/stages/08-hardening.md`, Owner
  feedback); release; then plan the rest of stage 8.
- **Open issues:** "alias missing in EDITOR" not reproduced; underscore
  clipping may remain in chrome text outside the editor; EDITOR has no
  search; owner to decide on the khazdul candidate list.
- **Commits:** see `git log` for this date (feat/fix/docs), plus this one.

### 2026-09-30 — Release 0.1.17

- **Released:** 0.1.17 (tag v0.1.17): About cleanup (no COMMANDS/KEYS,
  TinTin++ note in GETTING STARTED). Pages deploy OK; live `release.json`
  reports 0.1.17 at 157923a. Prod smoke against the live site not run.
- **Next:** plan the rest of stage 8.
- **Commits:** 157923a, plus this one.

### 2026-09-30 — About without commands

- **Done:** removed the COMMANDS and KEYS sections from About at the
  owner's request (menus cover the commands; ESC is the one key to know).
  GETTING STARTED now says ESC opens the menu and explains in brief that
  a profile is TinTin++ syntax, with a link to the TinTin++ manual. The
  commands themselves and `#help` are unchanged.
- **Open issue:** `timers-replay.test.ts` fails on the new Cockpit log
  `Rasta/2026-09-30T00-11-08.log` (355 timer lines, test wants > 1000);
  not caused by this change. Check in stage 8.
- **Commits:** d919acb, 13890c6, plus this one.

### 2026-09-30 — Performance brief recorded

- **Done:** owner brief for a stage 8 performance part recorded in
  `docs/stages/08-hardening.md` (Owner feedback): `help 24-bit colours`
  stalls more than in Cockpit; deep subagent review of the output path,
  proposals first. Nothing investigated yet.
- **Next:** plan the rest of stage 8, starting with that review.
- **Commits:** this one.

### 2026-09-30 — Release 0.1.16

- **Released:** 0.1.16 (tag v0.1.16): Input color setting (ADR 0035).
  Pages deploy OK; live `release.json` reports 0.1.16 at 55158de. Prod
  smoke against the live site not run from the session.
- **Next:** owner tests live; then plan the rest of stage 8.
- **Commits:** 55158de, plus this one.

### 2026-09-30 — Input color setting

- **Done:** owner request: Options → Appearance → `Input color` (None,
  Steel default, Bright, Sand, Sage, Cyan, Amber) colours the command
  echo and the input line incl. `>`. Logs replay with the recorded
  choice (VIEW appearance); logs without it play Steel (ADR 0035,
  amends 0034). Unit 1150/1150, e2e 192/192.
- **Next:** owner tests locally or we release 0.1.16; then plan the rest
  of stage 8.
- **Commits:** b0b8f0a, 98d8e68, 34a17ed, d672531, plus this one.

### 2026-09-29 — Release 0.1.15

- **Released:** 0.1.15 (tag v0.1.15): steel command echo (ADR 0034).
  Pages deploy OK; live `release.json` reports 0.1.15 at d2c53c8. Prod
  smoke against the live site not run from the session.
- **Next:** owner tests live; then plan the rest of stage 8.
- **Commits:** d2c53c8, plus this one.

### 2026-09-29 — Steel command echo

- **Done:** owner request: own commands stand out a little. Five colours
  previewed in an artifact; owner picked "Stål" (steel). `.wc-echo` now
  uses the root token `--term-echo`: term fg 55 % mixed with a cool blue
  (darker blue on a light bg). Applies live, in the log player / run log,
  Spotlights and new HTML replays (ADR 0034). Unit 1144/1144, e2e 190/190.
- **Next:** owner tests live play and a replay; release with the next
  version; then plan the rest of stage 8.
- **Commits:** 15b9821, 12ee14f, fcdbb70, plus this one.

### 2026-09-29 — Release 0.1.14

- **Released:** 0.1.14 (tag v0.1.14): timers across export cuts, player
  `Font-size` label. e2e 188/188 locally; Pages deploy OK (build:pages
  smoke passed in CI). Prod smoke 10/10 (run by the owner).
- **Next:** owner tests live; then plan the rest of stage 8.
- **Commits:** 7919704, plus this one.

### 2026-09-29 — Timers across export cuts

- **Done:** owner report: an HTML replay with a cut part lost the timers
  running across the cut. The export now replays each run to its cut
  ends and embeds the timers state as a `WebCockpit.Timers` GMCP record
  the replay hub takes (ADR 0033). 1141 unit tests; replay/export e2e
  18/18.
- **Also:** the player's settings box says `Font-size` instead of `Font`
  (owner request).
- **Next:** owner tests an export with a cut; release with the next batch.
- **Open issues:** timers active at a run's start (from the live archive)
  are still not in replays (not captured).
- **Commits:** see `git log` (fix: timers across export cuts).

### 2026-09-29 — Tips without letters, release 0.1.13

- **Done:** owner reviewed the tips: lines drop the `L  ` prefix
  (ADR 0032 amendment). Released with the start-page update notice and
  the no-xp kill tips. 1137 unit tests; e2e 188/188.
- **Released:** 0.1.13 (tag v0.1.13), Pages deploy OK, prod smoke 10/10.
- **Next:** owner tests live; then plan the rest of stage 8.
- **Open issues:** `replay.spec.ts` "plays from file://" is flaky at the
  comment check (passed in the full run).
- **Commits:** 9da8eb4…45a3760, plus this one.

### 2026-09-29 — No xp in kill tips

- **Done:** owner feedback: kill marker tips read `Killed *Name the Race*`
  without the xp (ADR 0032 amendment). Review page of every tip kind with
  screenshots shared with the owner. 1137 unit tests; player/spotlights
  e2e pass.
- **Next:** owner reviews the tips; then release (with the start-page
  update notice).
- **Open issues:** `replay.spec.ts` "plays from file://" fails 2 of 3 runs
  at the `## Watch the tank here.` comment check, also without this
  change (pre-existing, to investigate). Old HTML replays keep the xp.
- **Commits:** see `git log` (fix: no xp in kill marker tips).

### 2026-09-29 — Update notice on every start frame

- **Done:** owner feedback: no update notice until Enter MUME (the start
  footer token was dim and on the main frame only). The notices now sit
  on the start surface's top row, right-aligned, over every start frame:
  `Update x.y.z available: reload` (C_YELLOW, click reloads) and
  `Storage: not saved` (ADR 0025 amendment). 1137 unit tests; chrome e2e
  13/13; checked in a production build with a faked newer release.json.
- **Next:** release with the next version bump; owner checks live.
- **Open issues:** none new.
- **Commits:** see `git log` (fix: update notice on every start frame).

### 2026-09-29 — Marker tips, bare Spotlights

- **Done:** owner feedback (ADR 0032). Spotlights reel shows no panes
  and no gear. Hovering a K/D/A/L marker shows what happened (`Killed
  *Name the Race* (60k xp)`, `Died (level 42)` …) left of the marker, in
  RUN LOG, Spotlights (with the character) and the HTML replay (tip in
  the payload; older files show the letter's name). 1137 unit tests;
  player/replay/spotlights/viewer e2e 28/28.
- **Released:** 0.1.12 (tag v0.1.12), Pages deploy OK, prod smoke 10/10.
- **Next:** owner tests live; then plan the rest of stage 8.
- **Open issues:** no tip on touch devices.
- **Commits:** see `git log` (feat: marker tips, bare reel).

### 2026-09-29 — Replay polish

- **Done:** owner feedback on the HTML replay (ADR 0031). Comment holds
  halved (`clamp(1 + len/30, 2.5, 10)` s, new exports only); a leading
  comment gets a blank row above it so the header row does not cover
  it; the chrome auto-hides in play with the settings section open too.
  1137 unit tests; e2e 187/188 (Firefox inline-map-worker test flaked
  under full load, passes 3/3 alone).
- **Released:** 0.1.11 (tag v0.1.11), Pages deploy OK, prod smoke 10/10.
- **Next:** owner checks a fresh export live.
- **Open issues:** none new.
- **Commits:** see `git log` (fix: replay polish, docs: ADR 0031).

### 2026-09-29 — Link readout matches ICMP ping

- **Done:** owner saw `Link:` ~115–160 ms vs Cockpit ~38 ms. Cause: the
  readout was the GMCP `Core.Ping` RTT, which waits on MUME's ~250 ms
  pulse; WebSocket vs telnet floors measured equal (55 vs 58 ms). `Link:`
  now shows an HTTPS HEAD round trip to mume.org over a warmed keep-alive
  connection (median of 3), Core.Ping as fallback and for `?` (ADR 0030).
  Chromium 35–44 ms, Firefox 40–49 ms vs ICMP ~38 ms. Probe is off where
  the page is cross-origin isolated (dev server), so dev shows Core.Ping.
- **Released:** 0.1.10 (tag v0.1.10), Pages deploy OK, prod smoke 10/10.
- **Next:** owner checks `Link:` live; then plan the rest of stage 8.
- **Open issues:** load on mume.org (~12 HEAD/min per player).
- **Commits:** a67f358, d33f9b2, d8c451c, plus this one.

### 2026-09-29 — Custom domain, Tailscale retired

- **Done:** owner bought `mumecockpit.com` (Cloudflare Registrar), set
  the DNS (A/AAAA to GitHub, www CNAME, proxy off) and verified the
  domain on GitHub. Repo Pages cname set, HTTPS enforced. App at the
  root; `npm run publish` and the Caddy smoke profile removed; ADR 0029
  (supersedes 0022, amends 0025 and 0028).
- **Published:** 0.1.9 (dddc671) by tag; live smoke test 10/10; http,
  www and khazdul.github.io/webcockpit/ redirect to the domain.
- **Next:** plan the rest of stage 8.
- **Open issues:** the owner switches off the Tailscale site (`tailweb`).
- **Commits:** dc5a113, eb9f8ca, dddc671, plus this one.

### 2026-09-29 — GitHub Pages deployment

- **Done:** owner decision: host on GitHub Pages at
  `khazdul.github.io/webcockpit/` (no custom domain), in parallel with
  Tailscale, publish on version tags. ADR 0028: `WEBCOCKPIT_BASE`,
  subpath audit, static-server `--base`/`--profile pages`, `build:pages`,
  `.github/workflows/pages.yml`. CI smoke test Chromium only (no GPU on
  runners). Environment rule for `v*` tags added by the owner.
- **Published:** 0.1.8 (5fa661f) to Pages and to Tailscale; live smoke
  test on Pages 10/10 (Chromium, Firefox). Tag `v0.1.7` points at an
  undeployed commit (harmless).
- **Next:** owner test on the Pages URL; plan the rest of stage 8;
  retire Tailscale later (warn users to export first: new origin).
- **Commits:** c8bec58…5fa661f, plus this one.

### 2026-09-29 — Bundled map data: decision

- **Done:** one of the MMapper authors replied: the MMapper authors hold no
  rights in the map; MUME's zone builders own the texts, no licence exists
  (`MUME/arda` declares none either). Owner decision: keep the owner's
  `arda.mm2` bundled, do not contact MUME separately (WebCockpit does what
  MMapper does). `public/map/README` and `THIRD_PARTY_NOTICES.md` now say
  the GPL does not cover the file; ADR 0020 amended.
- **Next:** plan the rest of stage 8.
- **Open issues:** none. README screenshots showing other players' names
  are fine (owner, 2026-09-29).
- **Commits:** 337455a.

### 2026-09-29 — PR #1: licence text on the site

- **Done:** reviewed and merged PR #1 (KasparMetsa): the build ships
  `LICENSE` as `LICENSE.txt` at the site root, About links it (GPL-2 §1),
  ADR 0027 amended, site-root smoke test checks it. Typecheck, 1114 unit
  tests and the prod smoke test (10/10) pass.
- **Published:** bedea9d (0.1.6); smoke test passes, `LICENSE.txt` live.
  Pushed to GitHub.
- **Next:** plan the rest of stage 8.
- **Commits:** 7ec10ec, 839abe0, bedea9d.

### 2026-09-29 — Source link, licence review

- **Done:** licence and etiquette review. About and the replay file notice
  now link the source (GPL-2 §3, ADR 0027). Published 1847920 (0.1.5).
- **Next:** plan the rest of stage 8.
- **Open issues (owner):** bundled `arda.mm2` is the owner's own map, not
  MUME's official `MUME/arda` (MMapper's author asked 2026-09-29, awaiting reply);
  README screenshots show other players' names; MUME not yet informed.
- **Commits:** see git log for 2026-09-29.

### 2026-09-29 — Licence: GPL-2.0-or-later, MMapper notices

- **Done:** MMapper's author reminded us of the GPL terms. Relicensed to
  GPL-2.0-or-later (owner decision, ADR 0027): LICENSE, package.json,
  README, About, replay notice. 15 MMapper-derived files under `src/map/`
  got SPDX, MMapper copyright and dated modification headers;
  THIRD_PARTY_NOTICES lists each with its MMapper sources and changes.
- **Published:** 6d2bfb4 (0.1.4); smoke test passes. Pushed to GitHub.
  The owner replies to MMapper's author.
- **Next:** plan the rest of stage 8.
- **Open issues:** none.
- **Commits:** see git log for 2026-09-29.

### 2026-09-28 — Public repository

- **Done:** repository published at https://github.com/Khazdul/webcockpit
  (public, full history, GPL-3.0 detected). Added README with six
  screenshots (`docs/img/`, browser bar cropped), LICENSE, map assets in
  THIRD_PARTY_NOTICES. The deployment host name is removed from current
  files (still in old commits, by owner choice). `arda.mm2` stays public
  (owner decision, noted in `public/map/README`). Remote is HTTPS.
- **Next:** plan the rest of stage 8. Optional: topics, a v0.1.3 release.
- **Open issues:** none.
- **Commits:** a41e1c6, plus this one.

### 2026-09-28 — Stage 8: dead-key macros

- **Done:** owner report (Firefox, Swedish): a macro on `´` left the accent
  in the input, and `¨` after it did not fire (open composition). Dead
  keys now reach macros during a composition, fire once per press, and
  the composition is cancelled (blur/refocus, value and caret restored).
  1114 unit, 188 e2e pass. Version 0.1.3.
- **Published:** 631bcf2 (0.1.3); smoke test passes against the live URL.
- **Owner test:** approved live in Firefox (0.1.3).
- **Next:** plan the rest of stage 8.
- **Open issues:** Chrome with a real Swedish layout not tested (Firefox
  verified by the owner).
- **Commits:** 97eed28…0452ab5, plus the version and this one.

### 2026-09-28 — Stage 8: printable key macros

- **Done:** ADR 0026. Macros can bind bare and Shift+ printable keys
  (letters, digits, punctuation, Space); the editor warns "overrides the
  input line (types text)" instead of refusing. Key labels follow the
  keyboard layout (Keyboard Map API, else learned from unshifted
  keydowns), so a Swedish keyboard shows `§`, `+`. Names stay code-based.
  1107 unit, 186 e2e pass.
- **Published:** 1399d1e (0.1.2); smoke test passes against the live URL.
- **Next:** owner tests on a Swedish keyboard (guide in the stage file).
- **Open issues:** dead key `´` untested in real browsers; Firefox shows
  US labels until a key is pressed once unshifted.
- **Commits:** 47129e4…0efc4d5, plus this one.

### 2026-09-28 — Stage 8: versioning and update notices

- **Done:** ADR 0025. Version 0.1.0 (public release) with the commit in
  About; publish refuses a version already live. Production tabs check
  `release.json` on focus/visibility and every 10 min; a newer release
  shows `Update: x.y.z` in the input row and one `[SYSTEM]` output line.
  Never reloads by itself. Lost lazy chunks and a DB upgraded by a newer
  tab ("Storage: not saved") are reported instead of failing silently.
  1097 unit, 182 e2e, 10 prod e2e pass.
- **Published:** 87eb347 (0.1.0), then 75db548 (0.1.1, test publish of the
  update notice); smoke test passes against the live URL.
- **Owner test:** approved live (0.1.1 notice shown, F5 loaded it).
- **Next:** owner shares on Discord; every later publish bumps the version
  first (`npm version patch --no-git-tag-version`, commit).
- **Open issues:** a failed map-worker load has no update hint (the Map
  pane reports it); after `--rollback` tabs are told the older build "is
  available".
- **Commits:** 6ff8322…87eb347, plus this one.

### 2026-09-28 — Stage 8: About page

- **Done:** About text grows sections on MUME, the PvP focus, website and
  Discord, and CREDITS (MMapper first, Cockpit, MUME, fonts, libraries).
  Web addresses are clickable links. 1080 unit tests pass.
- **Published:** 35bfa90; smoke test passes against the live URL.
- **Next:** owner reads the About page; plan the rest of stage 8.
- **Open issues:** none new.
- **Commits:** 8b11597.

### 2026-09-28 — Stage 8: bundled khazdul profile

- **Done:** ADR 0024. First run seeds `khazdul` (the owner's PvP profile,
  bundled as `src/profiles/khazdul.tin`) beside `default`; existing users
  unchanged, a deleted copy stays deleted. Owner-profile tests now read
  the bundled copy and always run. 1080 unit, 182 e2e pass.
- **Published:** 221b15c; smoke test passes against the live URL.
- **Next:** plan the rest of stage 8.
- **Open issues:** none new.
- **Commits:** (this commit).

### 2026-09-28 — Stage 8: new-user defaults

- **Done:** ADR 0023. Fresh settings: every pane tinted None; right dock
  keeps Character at 9 rows and shares the rest evenly between Timers,
  Group, Comm and UI (`EVEN_SHARE_DESIRED`). Black background, borders
  and the floating map were already default. Stored settings unchanged.
  Tests that need Cockpit's fixed heights pin them. 1078 unit, 182 e2e pass.
- **Map size:** default map float 25 % × 27 % of the window (was 50 % ×
  35 %), owner feedback after the first publish.
- **Published:** f9c6080, then 99981b7; smoke test passes against the live URL.
- **Next:** plan the rest of stage 8.
- **Open issues:** none new.
- **Commits:** (this commit).

### 2026-09-28 — Stage 8: private deployment

- **Done:** ADR 0022 (Tailscale Funnel at `:8443/`, Caddy serves
  `~/.local/share/tailweb/sajter/webcockpit/`, per-origin storage, headers).
  `npm run publish`: clean tree, typecheck + unit, build to a staging
  sibling, site-root smoke test (`tests/e2e-prod`, plain static server,
  Chromium + Firefox), carry the live hashed assets one release, swap with
  `mv --exchange`; `--dry-run`, `--rollback`. Tested against a scratch dir.
- **Published:** b7649b1 is live on the private deployment (ADR 0022);
  headers/MIME checked with curl, smoke test passes against the live URL
  (`WC_PROD_URL`).
- **Next:** plan the rest of stage 8.
- **Open issues:** `replay/replay.js` is unhashed (ADR 0022 consequences).
- **Commits:** (this commit).

### 2026-09-28 — Stage 8 part A (player viewer settings)

- **Done:** owner brief → stage 8 part A. Stage file, ADR 0021. Gear in
  the player control box folds out pane toggles, font (Default/S/M/L),
  colours (Default/Dark/Teal/Paper/Sepia/Slate; non-default → panes
  None), Reset layout. Drag/resize live in the player, sticky over VIEW
  records and seeks. Timers `+`/charm `×` and Comm filter clicks off in
  players. RUN LOG, HTML replay and reel. 1078 unit, 182 e2e.
- **Next:** owner tests (guide in the stage file); then stage 8 rest.
- **Open issues:** Sepia/ink and Slate/ink are black text on dark bg
  (owner asked); overrides not saved between opens (ADR 0021); gear
  glyph from the system font in JetBrains-only replays.
- **Owner test 1:** approved ("seems to work well"); Sepia and Slate
  get FG silver instead of ink. Part A done. Next session: plan the
  rest of stage 8 (PvP fixes, perf, polish, carried items).
- **Commits:** 146ca7f, ba8376a, 9a1a204, 360af71, f446b89, e122f63,
  8f620df, (this commit).

### 2026-09-28 — Stage 9 build (map)

- **Done:** owner moved the map before stage 8 and changed it to tiles
  (MMapper look, default tileset), arda.mm2 bundled, read-only, map in
  HTML replays. Research (`mmapper-rendering.md`), ADR 0020, stage file.
  P0 mm2 v42 reader, DB v7, pane `map`, worker + OffscreenCanvas; P1
  WebGL2 renderer (side-by-side with the owner's screenshot matches);
  P2 locator (id → direction+name → name+desc, learned ids persisted),
  prespam path, group mates by `mapid`; P3 Options → Panes → Mapper,
  log player map, replay map subset (+~0.5 MB for 30 rooms); P4 bench
  map on/off (all budgets pass on GPU Chromium and Firefox), e2e race
  fix in export/player specs. 1049 unit, 178 e2e.
- **Next:** owner tests (guide in the stage file), then stage 8.
- **Open issues:** group `mapid` for mates outside the room and Room.Info
  on `look` unverified live; headless SwiftShader Chromium misses the
  burst budget with the map on (not a user path); pane default height.
- **Owner test 1:** "everything seems to work"; a group mate shown on
  the map live (Group `mapid` confirmed). Older map import failed (v36);
  the reader now reads `.mm2` versions 17–42 like MMapper 26.06
  (`arda(1).mm2` renders identically to the bundled map). 1069 unit.
  Owner retests the import.
- **Owner test 2:** import works; Mapper page moved to Options → Mapper,
  map pane on by default (old VIEW records keep it off). 178 e2e.
- **Owner test 3:** approved ("looks good"). Stage 9 closed. Next
  session: write `docs/stages/08-…md` from spec §5 (fixes from PvP
  testing, perf pass, polish). Carry: map pane default height, replay
  font subsetting (~0.3 MB/file), player paint after a long seek, JetBrains
  Mono exports without DejaVu fallback glyphs, reel load time on a large
  library, live checks of stage 7, `look` → Room.Info unverified.
- **Commits:** c852dc3…(this commit).

### 2026-09-28 — Stage 7 build

- **Done:** stage file, ADR 0019. P0 DB v6 export docs, edits model,
  timeline cuts/comments/holds/spotlight windows, `PlayerView` modes,
  text export, replay payload, spotlight selection, chronicle. P1 export
  editor (History → EXPORT). P2 self-contained HTML replay (same player
  App, offline from `file://`, 0.7 MB demo / 2 MB for 5 h). P3 Spotlights
  reel, Credits, Options → Spotlights. Review fixes: info box over the
  game text; reel reads the login stretch for pane state. Owner fix
  during the build: output scrollbar only while scrolled back. 959 unit,
  158 e2e; bench as before.
- **Next:** owner tests (guide in the stage file), then stage 8.
- **Open issues:** Chromium burst max frame borderline (39–58 ms, stage
  8); replay fonts not subset (~0.3 MB); JetBrains Mono exports lack
  DejaVu fallback glyphs; a comment before the first line holds on a
  near-blank screen; reel load time on a large real library unmeasured.
- **Owner test 1:** login system line now an editor row (comment before
  it, exclude it; `hiddenSys` in the payload). Commands on the prompt
  line in the replay vs a new line in RUN LOG: not reproduced (identical
  rows in both players, e2e parity test added); asked the owner where.
  968 unit.
- **Owner test 2:** approved ("seems to work well"); item 2 dropped.
  Stage 7 closed. Next session: write `docs/stages/08-…md` from spec §5
  (fixes from PvP testing, perf pass, polish). Carry: Chromium burst
  frame (39–58 ms), player paint after a long seek, replay font
  subsetting (~0.3 MB/file), JetBrains Mono exports without DejaVu
  fallback glyphs, reel load time on a large library, live checks of
  stage 7 (Spotlights/Credits after real PvP, replay on another machine).
- **Commits:** 5dca49e…(this commit).

### 2026-09-28 — Stage 6 owner test 1 fixes

- **Done:** three player fixes from the owner's first test (stage file
  "Owner feedback"): the run lead-in (login GMCP, VIEW/SIZE up to the
  first text) plays instantly, also between runs, fixing existing
  recordings; the player fills the window with the recorded layout (no
  letterbox); header key hints. ADR 0018 amended + package note. 882
  unit, 140 e2e.
- **Next:** owner retest of the player, then stage 7.
- **Open issues:** as before (Chromium burst frame margin, post-seek
  paint).
- **Owner test 2:** approved ("looks good"). Stage 6 closed. Next
  session: write `docs/stages/07-…md` from spec §5 (export editor, HTML
  replay, Spotlights, Credits). The HTML replay reuses the player core
  (`src/player/{timeline,clock,socket,engine}.ts`, ADR 0018 P2 notes);
  Spotlights/Credits read `RunLibrary` events (`logUs` on deaths).
  Carried open issues: Chromium burst max frame ~49 ms (stage 8 perf
  pass); the player's output needs ~1 s to paint 20 000 rows after a
  long seek (owner did not mind); the player's header and control box
  float over the text by design (Cockpit).
- **Commits:** fad5cc4…(this commit).

### 2026-09-27 — Stage 6 build

- **Done:** stage file, ADR 0018. P0 run events (kill fold, pkill,
  death, level-up, achievement, group), `◆ KILL/PKILL/DEATH` lines, DB v5,
  run library (stitch, save/rate, delete, 14-day sweep, gzip JSONL
  backup/restore), stats model, `app.runs`, demo backup. P1 History,
  Statistics (ESC + History), Exit with rating, recorder buffer race
  fixed. P2 log player (replay clock, speeds, seek by rebuild, recorded
  layout, strip/markers/control box, echo of replayed commands).
  Sparklines smoothed (owner request). 874 unit, 138 e2e; bench passes.
- **Next:** owner tests (guide in the stage file), then stage 7.
- **Open issues:** Chromium burst max frame 48.9 ms (limit 50; stage 8);
  output needs ~1 s to paint after a long seek; runs from stages 1–5
  have no events.
- **Commits:** c875710…(this commit).

### 2026-09-27 — Stage 5 build

- **Done:** stage file, ADR 0017. P0 timers settings, IndexedDB v4
  `timers` store (per character, survives reloads), `TimersHub`, replays
  re-emit recorded commands. P1 game data (47 affects, 36 spells, 6
  herblores), six trackers behind one line router, `◆` UI lines,
  `timers-demo.log`. P2 Timers pane and Options → Panes → Timers.
  Merge slowed the replay burst; fixed (regex pre-checks, speed-0
  command frames). 781 unit, 124 e2e; bench passes.
- **Next:** owner tests (guide in the stage file), then stage 6.
- **Open issues:** a reconnect during the few-ms state load can drop
  that moment's lines; replays do not echo sent commands (stage 6);
  replay burst still ~15 % slower than stage 4 (real tracker work).
- **Owner test 1:** approved ("seems to work well"). Stage 5 closed.
  Next session: write `docs/stages/06-…md` from spec §5; the log player
  should echo replayed commands and drive trackers with the injected
  clock (ADR 0017).
- **Commits:** da5b76d…(this commit).

### 2026-09-27 — Stage 4 build

- **Done:** stage file, ADR 0016. Owner decision: the log player and
  HTML replay show every pane in the player's layout, so runs now
  record GMCP, layout snapshots and window size. P0 pane context,
  comm store, capture records, demo fixture. P1 Character, Group,
  clock (+MSSP), Options → Panes hub with Group. P2 Comm (archive per
  character, filters, solo), UI pane and its messages, Communication
  options. 696 unit, 114 e2e; bench passes.
- **Owner feedback during build:** the demo lacked MUME's blank lines
  (fixture only); fixed.
- **Next:** owner tests (guide in the stage file), then stage 5.
- **Open issues:** live checks 1–2 still open; MSSP day base unchecked;
  Comm header over the drag grip when borderless.
- **Owner test 1:** group pane follows the fight; carried live checks
  (idle timeout, ESC auto-open) pass; `[SYSTEM]` lines stay in both
  places. Comm talker names shortened as in Cockpit (fixed). Stage 4
  approved and closed. Next session: write `docs/stages/05-…md` from
  spec §5; timers state per character must survive sessions (owner
  wish); the Timers pane plugs into `PaneContext`/`GameState`.
- **Commits:** e93638a…(this commit).

### 2026-09-27 — Stage 3 build

- **Done:** stage file, ADR 0015. Owner decision: only profile-defined
  variables are written back at runtime. P1 lossless document model,
  command table, key table. P2 script engine (tt++ Must + Should),
  display pipeline (`text.display`), macros, `_send`, live profile and
  variable write-back, benchmarks. P3 profile editor (LITE + CodeMirror
  EDITOR), EDIT and ESC → Profile with live Apply. 540 unit, 88 e2e;
  all §1.3 budgets pass (500 rules 17–26 µs/line); cold start 418 ms.
- **Next:** owner tests with the PvP profile (test guide in the stage
  file); then stage 4.
- **Open issues:** idle-timeout and auto-open live checks still open;
  Chromium burst worst frame borderline (49.8 ms); the owner wants
  per-character state (timers, comm) to survive sessions (stages 4–5);
  Firefox e2e flaked once on a cold Vite dep cache.
- **Owner test 1:** approved ("seems to work well"); echo of all sent
  commands kept. Stage 3 closed. Next session: write
  `docs/stages/04-…md` from spec §5, carry the two live checks and the
  per-character persistence wish.
- **Commits:** a95ac8c…(this commit).

### 2026-09-27 — Stage 2 build

- **Done:** stage file, ADRs 0010–0013. Owner chose the MUME/COCKPIT
  wordmark. A: settings store, theme tokens, colour toolkit, bundled
  fonts, whole-pixel cell grid, custom caret, status line removed.
  B: docking engine (left/right/bottom), glyph pane frames, drag/resize/
  toggle, narrow collapse, size gate. C: Preact TUI kit, start page,
  profiles (import/export), Options (Panes, Appearance), About, ESC menu
  with auto-open. 334 unit, 60 e2e tests; bench passes; cold start
  ~0.3 s throttled.
- **Next:** start stage 3. Write `docs/stages/03-…md` from spec §5 and
  carry over the live checks (idle timeout, auto-open on a real
  disconnect).
- **Open issues:** idle-timeout live check still open; Chromium burst
  worst frame borderline (39–57 ms vs 50 ms); chrome not light-themed
  on "paper"; Panes grid clipped near 60 cols.
- **Owner test 1:** fonts OK, quotes OK. Asked for: corners always
  quadrant (setting removed), a top dock, and floating panes (per pane,
  free position and size). Done in ADR 0014; 348 unit, 66 e2e, bench
  passes. Owner retests the docking.
- **Owner test 2:** input line always directly under the game pane
  (side docks full height, bottom dock under the input); a docked pane
  dragged out floats at 36 × 14. Done (ADR 0014 amendment); 350 unit,
  70 e2e, bench passes.
- **Owner test 3:** approved; stage 2 closed.
- **Commits:** c815295…(this commit).

### 2026-09-27 — Stage 1 build

- **Done:** stage file, ADRs 0007–0009. Scaffold (Vite 8, TS 7, Vitest,
  Playwright). Event bus and types; telnet/GMCP/keep-alive/session;
  line layer (ANSI + MUME XML, ~100 MB/s); output and input panes;
  raw capture in IndexedDB; replay mode; browser benchmark (all §1.3
  budgets pass in Chromium and Firefox, `bench/results/latest.md`).
  193 unit tests, 16 e2e tests.
- **Next:** start stage 2. Write `docs/stages/02-look-and-layout.md` from
  spec §5 and carry over live check 5 (idle timeout ≥ 5 min).
- **Open issues:** idle-timeout check not done (carried to stage 2);
  Ctrl+W cannot be intercepted in a normal tab.
- **Owner live test 1:** speed and echo OK, XML confirmed on, `#runlog`
  OK. Fixed after: `Core.Ping` every 10 s so `Link:` shows during play;
  monotonic capture timestamps; `Link:` shows the 60 s minimum (MUME
  answers on a ~250 ms pulse). Idle timeout still untested.
- **Commits:** 1336f54…(this commit).

### 2026-09-27 — Intent and spec

- **Done:**
  - Grilling rounds 1–3.
  - `intent.md` approved.
  - Research: MUME WebSocket (direct connection verified), MMapper
    integration, Cockpit inventory.
  - `spec.md` approved.
  - ADRs 0001–0006.
- **Next:** start stage 1. Write `docs/stages/01-connect-and-play.md` from
  spec §5, then build.
- **Open issues to check live in stage 1:**
  - XML mode after login.
  - Idle timeout.
  - Echo form of sent commands.
  - Password ECHO signal.
  - Whether the raw capture is taken before substitution.
- **Commits:** 3f1a3be…4016cdd, plus this one.
