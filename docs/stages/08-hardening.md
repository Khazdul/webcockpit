# Stage 8 — Hardening → v1

> Status: In progress (part A done 2026-09-28; part B, the performance
> review, done 2026-09-30; part C, the performance fixes, next).
> Source: spec §5 row 8; owner brief 2026-09-28 (part A, viewer
> settings in RUN LOG and the HTML replay). ADR 0021. Owner brief
> 2026-09-30 (parts B and C, performance). ADR 0044.

## Goal

v1: fixes from PvP testing, a performance pass and polish. The owner
plays several live PvP sessions and gives the v1 verdict.

Part A (owner request, built first): whoever watches a log — in RUN LOG
or in an exported HTML replay — starts from exactly what the player saw,
and can then make it their own: turn panes on and off, move and resize
them, pick a font size and a colour theme. The settings live behind a
gear in the player's control box, so the rest of the screen stays clean.

## Scope

Part A — in:

- A gear in the control box (bottom right). Clicking it folds a settings
  section into the box; clicking again folds it away. The chrome does not
  auto-hide while it is open.
- Panes: one on/off toggle per pane (character, timers, group, comm, ui,
  map).
- Layout: the viewer drags panes to other docks and resizes docks and
  panes the way the live client does. Reset returns to the recorded
  layout.
- Font size: Default (as recorded) → Small → Medium → Large.
- Colours: Default (as recorded) → Dark → Teal → Paper → Sepia → Slate,
  with BG/FG black/silver, teal/silver, paper/ink, sepia/silver, slate/silver
  (the existing presets). Any theme but Default sets every pane's colour
  to None (the terminal background, as None works in Options → Panes).
- The timers pane's `+` corner (herblore add-view) is gone in the
  player and in the HTML replay; no pane in a player lets the viewer
  change game state.
- Same behaviour in the in-app RUN LOG, the HTML replay and (settings
  only where they make sense) the Spotlights reel.

Part A — out: saving the viewer's choices between opens (see ADR 0021),
per-pane colour editing, custom palettes.

Part B — performance review (owner brief 2026-09-30, see "Owner
feedback"). In: a review of the whole input → socket → parse → render
path, measured against the spec §1.3 budgets, widened by the owner on
2026-09-30 to three goals: text drawn as fast as possible, no slowdown
over long sessions, the lowest possible input latency. The owner's
repro is `help 24-bit colours`. The review ends in ranked proposals;
nothing is fixed before the owner has picked from them. Measured where
the owner plays: this machine has only Firefox installed (156, Wayland
/ Hyprland, 60 Hz, device pixel ratio 2, ~1728 × 1050 CSS px), while
the bench measures headless at ratio 1 in 1280 × 720. Firefox is the
primary target, Chromium second.

Part B — out: building the fixes (part C, from the owner's pick).

Part C — performance fixes (owner decision 2026-09-30, after part B).
In: the list in `notes/research/performance-review.md` §4, in its
order: group 1 (seven small fixes), group 2 (medium fixes, including a
scrollback-depth setting), `#perf` (a latency monitor for real
sessions), the benchmark extension, and the small fixes listed there.
Rules for the new code: ADR 0044. Out: the deferred and "not
recommended" items of §4.

Later parts (not planned yet): fixes from PvP testing, polish, and the
carried items in
`progress.md` (map pane default height, replay font subsetting, player
paint after a long seek, JetBrains Mono exports without DejaVu fallback
glyphs, reel load time on a large library, `look` → Room.Info; the
live checks of stage 7 passed 2026-09-30).

## Owner decisions

- 2026-09-28 (brief): settings behind a gear in the player box; start
  from the recorded layout and panes; viewer can rearrange, resize and
  toggle panes; font size small/medium/large; six colour themes as
  listed above; non-default theme → all pane colours None; no timers `+`
  in players.
- 2026-09-30 (part B → C): build all four groups of the performance
  report (small fixes, medium fixes, `#perf`, the benchmark); the caret
  keeps blinking, by a timer; catch-up after a hidden tab is a simple
  cap of 500 rows per frame; the scrollback depth becomes a setting in
  Options (default 20 000). Not objected to: input history capped at
  1000; a `[SYSTEM]` line for a command that could not be sent; `#perf`
  as a command that prints a summary (no status readout, no run record).

## Tasks

Part A:

- [x] Stage file, ADR 0021.
- [x] A1. Viewer overrides model (pure) + tests: font, theme, panes,
      layout; applied over every VIEW record and on every App rebuild
      (backward seek).
- [x] A2. PlayerHost applies the overrides; the viewer's drag/resize in
      the player cockpit becomes a sticky layout override.
- [x] A3. Gear and the fold-out settings section in the control box
      (PlayerView), keyboard/pointer handling, chrome stays while open.
- [x] A4. Timers `+` corner and herblore add-view off in player Apps;
      audit the other panes for state-changing clicks in players.
- [x] A5. HTML replay and Spotlights reel wiring; e2e for RUN LOG and
      the replay; unit + e2e green; build.
- [x] A6. Owner test.

Deployment (owner brief 2026-09-28, spec §1.5):

- [x] ADR 0022 private deployment (Tailscale Funnel, Caddy site dir).
- [x] `npm run publish` (gate, staging build, site-root smoke test,
      atomic swap, `--dry-run`, `--rollback`); `npm run test:prod`.
- [x] First publish (b7649b1); live site checked: headers, MIME types
      and the smoke test via `WC_PROD_URL` all pass.

Defaults (owner brief 2026-09-28):

- [x] New-user defaults (ADR 0023): all panes None, right dock shared
      evenly with Character at 9 rows.
- [x] Default map float 25 % × 27 % of the window (owner feedback).
- [x] Bundled `khazdul` profile for new users (ADR 0024).

Public release (owner brief 2026-09-28):

- [x] Versioning and update notices (ADR 0025): version 0.1.0 and the
      build commit in About; publish refuses an unchanged version; update
      check on focus/visibility and every 10 min; `Update: x.y.z`
      indicator and a `[SYSTEM]` line; lazy chunk and superseded-storage
      notices; unit + e2e-prod tests.

Printable key macros (owner request 2026-09-28):

- [x] Printable key macros (ADR 0026): bare and Shift+ letters, digits,
      punctuation and Space bindable; the editor warns "types text";
      the input line consumes a bound key; key labels follow the
      keyboard layout (`§`, `+`); unit + e2e tests.
- [x] Dead keys as macros (ADR 0026 "Dead keys"): a bound `´`/`¨` fires
      once, also inside an open composition, and leaves no accent in the
      input line; unbound dead keys compose as before; unit + e2e tests.
- [x] Owner test (Firefox, Swedish keyboard).

GitHub Pages (owner brief 2026-09-29):

- [x] ADR 0028 (Pages at khazdul.github.io/webcockpit/, parallel with
      Tailscale; amendment in ADR 0022, note in spec §1.5, README).
- [x] Configurable base (`WEBCOCKPIT_BASE`); subpath audit of the build
      (fonts, map, worker, LICENSE.txt, release.json, replay export).
- [x] `static-server.ts` `--base` and `--profile site|pages`; prod smoke
      test with `WC_PROD_BASE`/`WC_PROD_PROFILE` and base-relative paths.
- [x] `npm run build:pages` (version and tag checks, gate, build under
      `/webcockpit/`, pages smoke test, carried live assets, release.json).
- [x] `.github/workflows/pages.yml` (tag `v*` and manual; build, upload,
      deploy).
- [x] Enable Pages (source: GitHub Actions), first deploy, live smoke
      test via `WC_PROD_URL=https://khazdul.github.io/webcockpit
      WC_PROD_PROFILE=pages npm run test:prod` (0.1.8, 10/10 in Chromium
      and Firefox). CI smoke test in Chromium only (no GPU on runners);
      `github-pages` environment allows `v*` tags.
- [x] Owner test on the Pages URL (owner, 2026-09-29: works).

Custom domain (owner brief 2026-09-29):

- [x] ADR 0029 (mumecockpit.com via Cloudflare Registrar, DNS only;
      Tailscale site retired; amendments in ADR 0022, 0025, 0028; spec
      §1.5, README).
- [x] `build:pages` defaults to `https://mumecockpit.com/` (base `/`).
- [x] `npm run publish` and `scripts/publish.ts` removed; `versionGuard`
      in `scripts/release.ts`.
- [x] Smoke test and static server: `site` profile removed, always
      Pages headers; `npm run test:prod` tests `dist` at `/`.
- [x] HTTPS enforced, release on the domain, live smoke test
      (`WC_PROD_URL=https://mumecockpit.com npm run test:prod`): 0.1.9,
      10/10; http, www and khazdul.github.io/webcockpit/ redirect.

Link readout (owner brief 2026-09-29):

- [x] ADR 0030: `Link:` from an HTTPS probe (`HEAD` mume.org/favicon.ico
      on a warm keep-alive connection, every 10 s, lower median of 3),
      Core.Ping minimum as fallback; not in dev (COEP), replay or player.
      Chromium 39 ms / Firefox 46 ms median vs ICMP avg 38 ms.

Replay polish (owner brief 2026-09-29):

- [x] ADR 0031: comment holds halved (`clamp(1 + len/30, 2.5, 10)` s);
      a blank row before a comment on an empty output (the header row
      covered it); the chrome auto-hides with the settings section open.

Steel command echo (owner request 2026-09-29):

- [x] ADR 0034: the command echo in "Stål", the fg mixed 55 % with
      #7fb2e6 (dark bg) or #1f5f9e (light bg) via a `--term-echo` root
      token; live, log player, Spotlights and HTML replay.

Input color (owner request 2026-09-30):

- [x] ADR 0035: Appearance → `Input color` (None, Steel, Bright, Sand,
      Sage, Cyan, Amber; Steel default) colours the command echo and the
      input line (`>` included); recorded in VIEW, so RUN LOG, Spotlights
      and the HTML replay use the player's choice (Steel for older logs).

Part B — performance review (owner brief 2026-09-30):

- [x] B1. Five parallel subagent reviews with measurements in Firefox
      and Chromium at pixel ratio 2: A output rendering (incl. the
      `help 24-bit colours` repro), B ingest CPU path, C input latency,
      D long sessions (soak), E side panes and frame composition.
      Reports, patches, harnesses: `notes/research/perf-review/`.
- [x] B2. Verify the key claims in the code; re-measure the top items
      on a quiet machine (`notes/research/perf-review/rerun.md`).
- [x] B3. Report with ranked proposals
      (`notes/research/performance-review.md`); ADR 0044.
- [x] B4. Owner picks the proposals to build: all four groups.

Part C — performance fixes (numbers refer to the report's §4; each item
verified with the review's harness before/after, Firefox first, ratio
2; patches in `notes/research/perf-review/patches/` are measured
experiments to rework, not finished code):

- [x] C0. Housekeeping: `tests/unit/timers-replay.test.ts` skips logs
      shorter than its minimum (fails on the owner's 364-line log).
- [x] C1. (#1) Caret blink by a 500 ms timer; no infinite CSS
      animation; restart on caret move and on the blink setting
      (`E-exp-blinkjs.patch`).
- [x] C2. (#2) `scrollbar-color` stops at `.wc-rows` / `.wc-partial`
      (`C-exp-scrollbar-color.patch`); browser test of PgUp/Esc at
      20 000 rows.
- [x] C3. (#3) Background rows for colour charts
      (`A-exp-background-rows.patch`); check
      `tests/e2e/underscores.spec.ts` (row above a background row).
- [x] C4. (#4) Assembler: raw as one slice, SGR params keep capacity
      (`B-exp-assembler-raw-params.patch`).
- [x] C5. (#5) Drag cursor on a shield element
      (`E-exp-dragshield.patch`).
- [x] C6. (#6) Send first: `toTail()` after the send and only when
      scrolled; macro lookup before the refocus
      (`C-exp-send-first.patch` as a start).
- [x] C7. (#7) Recorder: incremental byte count, writes bounded by size
      (≤ 256 KB per task).
- [x] C8. (#8) `content-visibility: auto` on chunks with an intrinsic
      size estimate and scroll anchoring while scrolled back; e2e for
      PgUp/PgDn, trims while scrolled, resize.
- [x] C9. (#9) Pane row diff for Character, Group, Timers; Character
      skips unchanged renders (`E-exp-rowdiff.patch`).
- [x] C10. (#10) Telnet `indexOf` scan (`B-exp-telnet-scan.patch`).
- [x] C11. (#11) Rule literal gate with the extra engine tests
      (`B-exp-engine-literal-gate.patch`).
- [x] C12. (#12) `MAX_ROWS_PER_FRAME` 500 (`A-exp-row-cap-500.patch`).
- [x] C13. (#13) Scrollback depth setting in Options, default 20 000
      (ADR; spec §1.3 note).
- [x] C14. (#14) `#perf` latency monitor (ADR; `#help` manual entry).
- [ ] C15. (#15) Benchmark: owner geometry, visible-caret latency and
      idle, active panes, map on/off explicit, colour page, real keys
      under load, loopback WebSocket with the recorder, full-scrollback
      actions, soak; new `bench/results/latest.md`.
- [x] C16. Small fixes: input history cap 1000; `[SYSTEM]` line for a
      command that could not be sent; player MessageChannel closed;
      comm archive pruned on `Char.Name`; XML tag stack cap; GMCP trims;
      map move regex; catch-all fast path and `formatTs` cache.
      Notes: the caret follows the blink setting through an observer on
      `<html data-cursor-blink>`; `Socketish.isOpen` is new (optional);
      the "Not connected: command not sent." line comes from `Session`,
      so pane and script sends get it too. Ingest choices: ADR 0048.
- [ ] C17. Owner test (guide below), release.

## Test guide (part A)

Open: History → a session with panes → RUN LOG. Then EXPORT the same
session to HTML and open the file.

Try:

1. The layout at the start matches what you had when you played.
2. Click the gear in the control box (bottom right). The box grows with
   the settings. Turn a pane off and on.
3. Drag a pane to another dock, resize a dock. Seek backwards and
   forwards: your layout stays. Reset: back to the recorded layout.
4. Cycle font size Default → Small → Medium → Large.
5. Cycle the colours. Every theme but Default shows the panes without
   colour tints. Paper (light) — is everything readable?
6. The timers pane has no `+` in the corner.
7. Do 2–6 in the HTML file too.

Feedback wanted: the gear's place and the fold-out's look; whether the
theme and font choices are right; anything in a pane that still reacts
to clicks in a way it should not.

## Test guide (printable key macros)

Open: Profile → EDIT → Macros (Swedish keyboard; Chrome and Firefox if
you can).

Try:

1. `n`, then press `§`: the key cell shows `[ § ]` and the hint area says
   "§ overrides the input line (types text)." Give it a body such as
   `#showme paragraph`.
2. Bind `Shift+1` (shows `Shift+1`), `+` (shows `+`) and `a` the same
   way. In Firefox a punctuation key bound with Shift may show its US
   name (`` Shift+` ``) until the key has been pressed once without
   Shift (Chrome knows the layout from the start).
3. Save, Enter MUME (or `?replay`), and press the keys in the input line:
   each runs its macro and types nothing. An unbound key (`b`, `2`) still
   types. `Shift+a` types `A` unless you bound it.
4. In the password prompt at login, bound keys type normally.
5. Dead keys: bind `´` and `¨` (the keys right of `+` and `Å`). With
   text in the input line press `´`, then `¨`, then `´` `¨` in quick
   succession: each press runs its macro once and the line keeps its text
   and caret. Unbind `´`: `´` then `e` types `é` again.

Feedback wanted: whether the labels match your keyboard; whether losing
the character in the input line is ever a problem in play.

## Test guide (part C, draft — finish when built)

Before the build, optional, no code: Options → Appearance → cursor blink
off, then play a while with a command half typed. The review predicts
output that feels a little snappier (report §3.3).

After the build, in Firefox, on the release:

1. Type `help 24-bit colours` and page through it with Enter: no stall,
   and the combat lines after it are as quick as before it.
2. After an hour of play (full scrollback): PgUp, then Esc; drag a dock
   gap; open or close another window on the same Hyprland workspace
   (the browser is resized). None of them should freeze the output.
3. Leave the tab for a few minutes while connected, then return: the
   backlog is drawn without a stutter (after minutes of backlog the
   newest line may take a fraction of a second).
4. Options → the new scrollback setting.
5. `#perf` after a session, and `#perf worst` right after something felt
   slow.

Feedback wanted: whether anything still feels slower than Cockpit, and
the `#perf` output at such a moment.

## Owner feedback

- 2026-09-28, test 1: "seems to work well". Sepia and Slate get FG
  silver instead of ink (black text was unreadable on the dark
  backgrounds); the other themes are fine. Part A approved.
- 2026-09-28, defaults: new users start with black background, all panes
  None, borders on, map floating, the other panes shared evenly on the
  right. After the first publish: the map float was too large; now
  25 % × 27 % of the window. Published as 99981b7.
- 2026-09-28, profiles: new users get `khazdul` (the owner's PvP
  profile) as a selectable profile beside `default`. Published as
  221b15c.
- 2026-09-28, update notice: tested live while logged in. Test publish
  0.1.1 showed the indicator and the output line; F5 loaded 0.1.1.
  Approved; the client is ready to share on Discord.
- 2026-09-28, printable key macros: requested Shift+letters and § 1–0 +
  ´ ' - (with and without Shift). In 0.1.2 a bound `´` left the accent
  and `¨` after it did not fire (Firefox composition); fixed in 0.1.3.
  Tested live in Firefox: "works well". Approved.
- 2026-09-29, players: Spotlights without panes and without the gear;
  hover tips on the K/D/A/L markers in RUN LOG, Spotlights and the HTML
  replay (ADR 0032).
- 2026-09-30, performance (brief for the next part, not started): in
  play WebCockpit sometimes feels a little laggier than Cockpit in the
  terminal. Repro: `help 24-bit colours` fills the screen with colour
  code examples; the paint stalls noticeably (Cockpit stalls too, but
  less). Output responsiveness is a key feature for PvP. Wanted: a very
  thorough review of the whole input → socket → parse → render path
  by subagents (consider a higher effort level), measured against the
  spec §1.3 budgets, ending in ranked improvement proposals before any
  fixes are built.
- 2026-09-30, profile syntax: `_send` is not needed (everything sent is
  echoed); `khazdul` becomes a reference profile without it and without
  the autobash, `e1`/`e2` and accented aliases; a HELP view beside LITE
  and EDITOR with a manual per command; `_show_class` lost its
  underscore in LITE. Done in ADRs 0036–0037. Not reproduced: the alias
  "missing" in EDITOR (buffer equals the stored text; EDITOR has no
  search). Open: the same underscore clipping can hit chrome text
  outside the editor (e.g. profile names); owner to pick from the
  candidate list of odd or duplicate khazdul aliases.
  Test guide: open the site in a private window (the new `khazdul` is
  seeded only on a first run). Start page → Profiles → khazdul → edit:
  check LITE shows `_show_class` with its underscore, EDITOR shows the
  sectioned profile, HELP opens the manual (arrows, PgUp/PgDn, n/p).
  Connect with khazdul and try `z orc`, `bh`, F1–F4, `sd gate`, `o`.
  Feedback wanted: manual tone and length, profile layout, and whether
  `_send` should be removed from the engine too.
- 2026-09-30, HELP: intro wording changed (no "from the ESC menu"; LITE
  and EDITOR described in the owner's words); a navigation menu on the
  left jumps to a section (ADR 0037, "Navigation menu").
- 2026-09-30, help and saving: `#connect`, `#reconnect`, `#replay`,
  `#runlog`, `#disconnect` are not shown in help (menus cover them);
  `#help` lists commands, `#help alias` / `#help al` shows the section
  with syntax and examples in colour; settings typed in the game window
  are saved to the profile at once so the game and ESC → Profile always
  agree. Done in ADRs 0037 (amended) and 0038. Open for the owner:
  script-made rules are not saved; nothing is saved in offline replay
  mode; two system lines outside the manual still name `#connect` /
  `#replay`.
  Test guide: type `#help`, `#help al`, `#help patterns`. Type
  `#alias {zz} {say hi}`, open ESC → Profile: `zz` is in LITE and
  EDITOR. Type `#unalias zz`, reopen: gone. Type `#var target orc`,
  reload the page: still set.
- 2026-09-30, messages: `#message` added, on for everything by default;
  a typed definition is confirmed with one row; `#message var` turns a
  class off. Owner: no capitals, short, uniform, our colours, keep `#`
  and braces. Done in ADR 0039. Open: `[SYSTEM]` and `#help` rows are
  hard to read on the paper theme (older issue).
  Test guide: type `#alias zz smile`, `#unalias zz`, `#var target orc`,
  `#var target`, `#alias`, `#message`, `#message var`, then
  `#var target elf` (no row). Reload: variables are still off.
- 2026-09-30, wrap-up: 0.1.18 approved and released. `khazdul` is good
  as it is. `_send` removed from the engine entirely (ADR 0040, not yet
  released). Paper-theme readability: a later session.
- 2026-09-30, four fixes: (1) the clock strip always has one blank
  between the time and the icon (8 cells, time right-aligned); (2) light
  UI colours on a light background such as paper: menus, `[SYSTEM]`,
  `#help`, `#message` rows (ADR 0041); (3) EDITOR and HELP run to the
  frame's right edge, left edge unchanged (ADR 0037, "Full width");
  (4) underscores no longer clipped in the chrome, the input line and
  the panes (ADR 0042). Open for the owner: pane frames and titles are
  faint on paper; the HELP text has no maximum line length; in the game
  "far right" is the ESC menu's box, not the window; text sits 1 px
  higher, so marks on `Å`/`É` are cut at more font sizes; `_` on a game
  line directly above a line with a background colour is still lost.
  Test guide: watch the clock pass 10:00. Options → Appearance →
  Background paper: walk the menus, type `#help`, `#help alias`,
  `#alias zz smile`. Profile → EDITOR and HELP, from the start page and
  from ESC, in a wide window. Create a profile `a_b_c`, look at the
  Profiles list, rename it, type `a_b_c` on the input line (Firefox
  too).
- 2026-09-30, underscores again: the owner rejected the 1 px text lift
  (accented capitals cut more often). Replaced by a one-glyph face for
  `_` ahead of DejaVu Sans Mono (ADR 0043); text is back where it was,
  accent marks exactly as before the lift, `_` whole at every measured
  setting, including the row above a background-coloured row and the
  EDITOR view. Open: measured on Linux only; Windows/macOS not checked.
  Test guide: as above, and type `Åsa_Öberg ÄÉ` on the input line and
  as a profile name.
- 2026-09-30, marker tips on touch: no tip on touch devices is accepted
  (won't fix). Timers active at a run's start stay open (ADR 0033 "Not
  covered"; the cut fix does not cover them).
- 2026-09-30, stage 7 live checks: Spotlights and Credits after real
  PvP, and an HTML replay on another machine, verified live by the
  owner: "looks good". Carried item closed.
- 2026-09-30, performance review started (part B): wider than the
  `help 24-bit colours` example. The owner wants the code and the
  architecture to be optimal for drawing text fast, for not slowing
  down after long sessions, and for the lowest possible input latency.
- 2026-09-30, performance review done: the owner asked to wrap up with
  everything documented and the choices made, and to build the fixes in
  a new session. Decisions under "Owner decisions"; plan under part C;
  report `notes/research/performance-review.md`, ADR 0044.
