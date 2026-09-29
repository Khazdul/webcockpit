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
(Chromium burst frame 39–58 ms), polish, and the carried items in
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
- [ ] Owner test on the Pages URL; later: retire the Tailscale site.

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
