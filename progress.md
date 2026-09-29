# Progress

Current stage: **8 — Hardening → v1** (part A done; 0.1.13 live at https://mumecockpit.com/ on GitHub Pages, Tailscale site retired, ADRs 0028–0029; next: plan the rest of stage 8).

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

Statuses: Next, In progress, Owner testing, Done.

## Session log

Newest first.

### 2026-09-29 — Timers across export cuts

- **Done:** owner report: an HTML replay with a cut part lost the timers
  running across the cut. The export now replays each run to its cut
  ends and embeds the timers state as a `WebCockpit.Timers` GMCP record
  the replay hub takes (ADR 0033). 1141 unit tests; replay/export e2e
  18/18.
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
