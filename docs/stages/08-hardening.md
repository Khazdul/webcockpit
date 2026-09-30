# Stage 8 — Hardening → v1

> Status: In progress (part A done 2026-09-28; later parts not planned yet).
> Source: spec §5 row 8; owner brief 2026-09-28 (part A, viewer
> settings in RUN LOG and the HTML replay). ADR 0021.

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

Later parts (not planned yet): fixes from PvP testing, performance pass
(Chromium burst frame 39–58 ms; see the owner brief 2026-09-30 under
"Owner feedback"), polish, and the carried items in
`progress.md` (map pane default height, replay font subsetting, player
paint after a long seek, JetBrains Mono exports without DejaVu fallback
glyphs, reel load time on a large library, live checks of stage 7,
`look` → Room.Info).

## Owner decisions

- 2026-09-28 (brief): settings behind a gear in the player box; start
  from the recorded layout and panes; viewer can rearrange, resize and
  toggle panes; font size small/medium/large; six colour themes as
  listed above; non-default theme → all pane colours None; no timers `+`
  in players.

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
