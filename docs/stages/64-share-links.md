# Stage 64 — Share links

Status: **Done, released 0.13.0 (2026-11-15): share links open in
production** on the owner's word after his test on staging.

## Waiting for the owner

Nothing. Share links opened in production with 0.13.0. Not yet seen by
the owner: the report mail arriving (the secret is set on both Workers;
the first real report will show it; if none comes, the Worker's log says
why, likely Email Service → Email Sending for the domain), and the
iPhone's fullscreen fallback (no iPhone to test on). Next is stage 65
(the community) in a session of its own.

## Goal

A cut run leaves the export editor as a link that anyone can watch
without an account (spec §7.7, ADR 0148, ADR 0154): **cut a fight, send
the link to a friend.** The watch page plays it in a sandboxed frame
that a hostile payload cannot get out of; the sender sees and manages
their links under Published runs on the Account page; a watcher can
report a run; the owner hides, restores and deletes runs and suspends
accounts from `/admin`. Everything is behind the flag `share`: on in
staging, off in production until the owner says yes.

## What must be true afterwards

- **Share.** In the export editor, logged in with `share` on, the format
  toggle has Link (after HTML replay and Plain text). EXPORT with Link
  opens the share dialog: title, description, size against 5 MB, "Anyone
  with the link can watch this.", the rules' tick the first time per
  account, Create link; the answer shows the link with Copy. Logged out,
  Link says it needs an account (round 12's pick).
- **Watch.** `/r/<id>` boots straight into the watch page (no start page
  animation), on desktop, tablet and phone, logged in or not: title,
  sender, character and level, length, date, views, the replay in its
  frame, Report, Download as HTML, Back. A removed link says it was
  removed; a hidden one says it is hidden (its sender sees it with a
  note); an unknown id says so; with `share` off, "This link does not
  work yet."
- **The sandbox holds.** The frame is `sandbox="allow-scripts"` (opaque
  origin), its document `/r/frame.html` has its own CSP (`default-src
  'none'`, the script and style by hash, `connect-src 'none'`); the
  payload comes by `postMessage` and passes `validatePayload` before it
  plays. An e2e proves that a hostile payload's script in the frame
  cannot read the app's storage, cookies or DOM, fetch, or navigate the
  top page; the fuzz tests find no throw that escapes and no runaway.
- **The server reads only what was shared.** What leaves the device is
  the cut payload (the export's, settings whitelisted, `phone` out) and
  the meta. A test inspects the upload: no run body, no export doc, no
  key, no item.
- **Published runs** on the Account page: title, link with Copy, views,
  date, size, Edit (title, description), Remove with a confirmation;
  "Hidden after reports" on a hidden one. Not reached from History; a
  published run is a copy of its own (deleting the session does not
  touch it).
- **Report.** Logged in: a reason (harassment, real life, MUME's rules,
  other) and an optional text; one per account and run; 30 a day. Five
  accounts hide a run until the admin has looked. Logged out: "Log in to
  report" and `abuse@mumecockpit.com`.
- **Limits.** 150 published runs per account, 5 MB each (gzip), not
  counted against the 50 MB; refused with the numbers, and the dialog
  says so. Two parallel posts never pass 150.
- **Admin.** `/admin` has the report queue (item, title, sender, reasons
  with counts, reporters, newest text, Watch), Hide / Restore / Delete
  for a run, Suspend / Restore / Delete for an account (Delete with the
  name typed), the total of published runs and bytes, and the latest
  `admin_log` entries. A suspended account syncs but cannot share or
  report.
- **Delete account** removes its published runs (the links say removed).
- **About and `/privacy`** carry the abuse address; `/privacy` says
  what a share link makes public (owner approves the words).
- **The game path is untouched** (§7.0 rule 1); the §1.3 benchmark does
  not move; the entry chunk grows only by the path's name (31 192 bytes
  after stage 63). Guests and players who never share notice nothing.

## Not in this stage

- Hall of Fame, listing, stars, comments, the community page, Random
  Runes, the reactions mark (stage 65); the admin's account list, graphs
  and per-account limits (stage 66).
- Any release, and `share` on in production, without the owner's
  explicit go-ahead (part F).

## Decided already

- Spec §7.7, §7.9, §7.10; ADR 0148 with its addenda (the link, the
  sandboxed frame, a copy of its own, 150 / 5 MB outside the 50 MB,
  rules, Report, five reports hide, the admin's tools).
- **Owner, 2026-11-15:** the rules' tick comes at the first Create link
  (not first in stage 65); the abuse address goes on About and
  `/privacy` now (Email Routing already forwards it).
- Technical, this session: **ADR 0154** (the wire form, ids, the
  Worker's endpoints and states, the reservation of the count, views,
  reports, `/r/*` through the Worker, the frame document and its CSP,
  the handshake, `validatePayload`, the fuzzing, the admin's API, the
  flag `share`). The contract is in `shared/cloud/api.ts`, "Share links"
  (on `main` before part B).

## For the owner to choose (round 12)

Mockups in round 9–11's manner (`notes/research/start-menu-mockups/
round12/`), published as an artifact; the recommendation in its README.

Artifact: https://claude.ai/artifact/BFgBssf8Qq4RFm5z5u9q11

**Owner's picks (2026-11-15)**, all as recommended in round 12's README:
**1a** a guest sees Link greyed with "Log in to share"; **2a** the rules'
tick inside the share dialog the first time; **3a** a header band over
the frame; **4a** Published runs as a section on the Account page (a view
of its own in stage 65 with stars and comments); **5** and **6** as drawn.

1. **Link in the export editor**: where Link sits in the format toggle,
   what a guest sees (Link greyed with "Log in to share", or Link hidden
   with a line under the toggle).
2. **The share dialog**: the form (title, description, size, the
   "readable by anyone" line), the rules' tick the first time (in the
   dialog, or a step before it), the result with the link and Copy, and
   the refusals (too large, 150 reached, offline); desktop and phone.
3. **The watch page**: (a) a header band over the frame with the
   details and actions, (b) the frame first with the details and actions
   in a strip under it; the states (loading, removed, hidden, unknown,
   not yet open); desktop and phone.
4. **Published runs** on the Account page: a list in the Account page's
   look (a section, or a view of its own behind a row); Edit, Remove and
   its confirmation; a hidden run; empty.
5. **Report**: the dialog (reasons as a list of four, optional text),
   the thanks, "already reported"; logged out with the abuse address.
6. **The admin's report queue** (plain tool look, ADR 0148): the queue,
   an action's confirmation, the totals and the log.

## Tasks

Rules for every building agent (CLAUDE.md, "Tests and worktrees"): a
worktree branched from `main` by name; `node_modules` linked from the
main checkout and never `git add`ed; its own dev server port by
`WC_E2E_PORT`, never 5173; only its own spec files in the worktree;
the full e2e runs once, alone, in part D; nothing is deployed, nothing
touches staging or production.

### A. Mockups and the measurement

#### A1. Mockups, round 12 (worktree `stage64-mockups`, port 5461)

- [x] `notes/research/start-menu-mockups/round12/` in round 11's manner
      (its README and `build/`): the real DOM captured from a dev server
      on its own port with the e2e fake (flags on), new content in
      `mk-*` classes, a picture per state, a review page, one
      self-contained file published as an artifact.
- [x] Points 1–6 above, desktop and phone (6 desktop only); the
      recommendation.

#### A2. The measurement (no worktree; writes "Measurements" here)

- [x] Payload sizes (`buildPayload` + gzip, with and without the map)
      of real runs from the owner's runs backups and stage 63's material
      (`notes/research/run-sizes.md`): a typical fight cut, a whole
      session, the largest; against 5 MiB; 150 × the median per account;
      R2's free 10 GB. No text or names kept
      (`notes/research/payload-sizes.md`).

### B. Foundations (two agents in worktrees side by side)

#### B1. Worker (worktree `stage64-worker`, port 5462)

- [x] Migration `0005_share.sql`: `publication`, `pub_view`, `report`,
      `admin_log`, `account.pub_count`, `account.pub_bytes`.
- [x] `worker/pub.ts`: `POST /api/u/pub` (the two-part body, checks,
      the count reserved before R2, given back on failure), `PATCH`,
      `DELETE`, `GET /api/u/pub`; `GET /api/pub/<id>`, `/payload`,
      `POST …/view`; the states 404 / 410 / 451 and the owner's view of a
      hidden run; the flag `share` (`FLAG_SHARE`: staging on, production
      off in `wrangler.jsonc`).
- [x] `worker/reports.ts`: `POST /api/u/report`, one per account and
      item, 30 a day, not one's own, five accounts hide.
- [x] `PATCH /api/u/account/prefs` takes `rulesAccepted: true`; `403
      rules` before it; `403 suspended` for a suspended account.
- [x] Admin API: `GET /api/admin/reports`, `POST /api/admin/pub/<id>`,
      `POST /api/admin/account/<name>`, `GET /api/admin/log`,
      `/api/admin/pub/<id>` and its payload for a hidden run;
      `admin_log`.
- [x] Delete account (the player's and the admin's) removes its
      publications: tombstones, R2 objects.
- [x] `run_worker_first` `/r/*`: `/r/<id>` answers `index.html` from
      `ASSETS`; `/r/frame.html` is a static file (B2 builds it) and is
      not taken over.
- [x] The cron prunes `pub_view` older than two days.
- [x] Worker tests (parallel posts at 150, a too-large payload, not
      gzip, bad meta, states, views once a day, reports to five, the
      admin's actions and log, Delete account); the contract's comments
      ("As built").
- [x] ADR 0154 "As built (B1)".

#### B2. The replay runtime against hostile payloads (worktree `stage64-replay`, port 5463)

- [x] `src/replay/validate.ts` `validatePayload` (ADR 0154's bounds and
      whitelists) with unit tests; the settings whitelist also used by
      `buildPayload` (what is uploaded is what the replay reads).
- [x] The frame document `r/frame.html` (Vite build, one inline script
      and style), its `_headers` rule with the hashes filled at build
      (as `cspHashesPlugin`), the frame's side of the handshake
      (`wc-ready`, `wc-play`, `wc-error`), the bounded decompression,
      `FontFace` from bytes, the map worker from a blob.
- [x] `src/watch/frame-host.ts`: the page's side (the iframe's
      attributes, the checks on `source` and `origin`, the fonts, the
      transfer), with a dev route to play a local payload in it.
- [x] A review of every path from payload text to the DOM in the
      player (ADR 0154 "No HTML from the payload"), fixes with tests;
      the findings written in ADR 0154 "As built (B2)".
- [x] Fuzz tests (`tests/unit/replay-fuzz.test.ts`, fixed seeds).
- [x] e2e `watch-sandbox.spec.ts`: a hostile payload's script in the
      frame cannot reach storage, cookies, the parent's DOM, the network
      or the top navigation; the frame's CSP header is the one in the
      ADR.
- [x] The main page's CSP gets `frame-src 'self'`; the CSP walk
      (tests/e2e-prod/csp.spec.ts) covers `/r/frame.html`.

### C. Flows and views (after B merged and round 12's picks)

#### C1. Share and Published runs (worktree `stage64-share`, port 5464)

- [x] `src/cloud/pub/api.ts`: the client of the pub and report
      endpoints, against the contract and the e2e fake
      (`tests/e2e/cloud-account-fake.ts` grows them). (Report's client
      is C2's, with the watch page.)
- [x] The export editor's Link (pick 1), the share dialog (pick 2), the
      rules' tick, the refusals; the upload test (nothing but payload and
      meta).
- [x] Published runs on the Account page (pick 4): list, Copy, Edit,
      Remove, hidden.
- [x] e2e for each, desktop and phone.

#### C2. The watch page (worktree `stage64-watch`, port 5465)

- [x] `src/boot`: `/r/<id>` straight to the watch view (in the lazy
      chrome chunk, not a chunk of its own: ADR 0154 "As built (C2)").
- [x] The watch page (pick 3) with B2's frame host; the states; Back;
      Download as HTML from the validated payload; the view counted once.
- [x] Report (pick 5), logged in and out.
- [x] About and `/privacy`: the abuse address; `/privacy`'s words on
      share links (for the owner).
- [x] e2e: a seeded run watched as a guest, desktop and phone; each
      state; Report; Download. (A link made on A: once C1's share dialog
      is merged, part D.)

#### C3. Admin (worktree `stage64-admin`, port 5466)

- [x] `worker/admin/page.ts`: Reports (pick 6), the actions with their
      confirmations, the totals, the log; text only, the page's CSP
      unchanged.
- [x] Watching a hidden run from the queue (`/r/<id>?admin`): the link; the
      watch page's side of `?admin` is C2's.
- [x] Tests (worker and the page's script in the unit DOM).

### D. Checks

- [x] An independent security review by a second agent with only the
      code and ADR 0148 / 0154: the sandboxed playback against hostile
      payloads (its own fuzzing, its own attack payloads), the frame's
      CSP and handshake, that the server can read only what was shared,
      the Worker's checks (auth, suspended, limits, races, states, the
      admin's guard). `/code-review` high of the stage. Fixes with tests
      that fail before them; ADR 0154 "As built (review fixes)".
      The security review found no script execution, network access or
      escape from the frame and no HTML injection; its worst finding (S1,
      a 61 KB payload whose map tiles took 4.5–7.6 GB in the frame) and
      S2–S7, and `/code-review` high's CR1–CR10, are fixed with tests that
      failed before them (ADR 0154 "As built (stage 64, review fixes)").
      S1's fix decoded the tiles one at a time and also fetched them one
      at a time, which the full e2e caught (the map's loading overlay and
      the tileset swap); fixed in c9453b0c: fetched together, decoded in
      turn.
- [x] Unit; worker; the full e2e alone at 5 workers (a failure rerun
      alone before it is called one); the benchmark; the entry chunk;
      `npm run test:sync-worker` (grows: a run shared, watched and
      removed against the local Worker and R2).

Checks (2026-11-15): unit and worker 5157 passed, 2 skipped; full e2e
alone at 5 workers (port 5450) 1733 passed, 2 failed under load, 1
skipped: the two (Chromium account-pages:739, Firefox
script-code-editor:312) passed alone 12/12, neither in this stage's
code; the benchmark as stage 63 (GPU: key → send playing 0.8 / 1.3 /
3.4 ms; burst 84 159 lines/s, no frame over 50 ms); entry chunk 31 192
(stage 63) → 31 366 bytes (+174: the watch path in the boot, ADR 0154
"As built (C2)"); `npm run test:sync-worker` 2/2 (a run shared on the
local Worker and R2, watched by a guest, counted once, removed).

### E. Staging

- [x] Push `main`; `deploy.yml` to staging with migration 0005;
      `test:prod` against <https://staging.mumecockpit.com> (grows: a
      watch page's state with `share` on); production's `/api/config`
      unchanged (`share` off). No tag, no release.
      (Run 43746447651, commit 00a2af8f, `0005_share.sql` applied; the
      first run, 43746008691, stopped in `build:site`'s smoke test, which
      did not know the flag `share`: fixed, nothing had been deployed.
      Staging's flags `stats`, `accounts`, `sync`, `runs`, `share` on;
      `/r/frame` answers with its own policy ending `sandbox
      allow-scripts`; `test:prod` 36/36 against staging; production's
      `/api/config` is 0.12.0's, without `share`.)

### F. Share open in production (only on the owner's go-ahead)

- [x] The owner has tested on staging and said yes (2026-11-15:
      "Fullscreen fungerade fint på desktop och såg bra ut. Share links
      texten är ok. Öppna i produktionen."; no iPhone to test on; the
      report mail not confirmed by him).
- [x] The release: version, tag, migration 0005 in production,
      `FLAG_SHARE` on in production's vars; `/api/config`; `test:prod`
      against mumecockpit.com. (Version 0.13.0, tag `v0.13.0`, commit
      f90d93c1; `deploy.yml` run 43757380385 applied `0005_share.sql`
      in production; `FLAG_SHARE` true in production's vars (in git);
      `/api/config` has `share` on and `sharedRuns` 150; `/api/health`
      0.13.0; `/api/u/pub` 401 without a session; `/r/frame` with its own
      policy; `test:prod` 36/36 against mumecockpit.com.)

## Measurements

Part A2, 2026-11-15 (`notes/research/payload-sizes.md`): the real
`buildReplayPayload` + `embedReplayMap` on the owner's runs (stage 63's
material), JSON gzip as `encodePayload` makes it. KB = 1 000 bytes;
5 MiB = 5 243 KB.

| Payload | Without map, median (max) | With map, median (q1–q3) | With map, max |
|---|---|---|---|
| Fight cut, 3 min (56) | 61 KB (131) | **563 KB** (410–781) | 1 161 KB |
| Fight cut, 10 min (56) | 102 KB (175) | 860 KB (686–1 189) | 1 960 KB |
| Whole session ≥ 0.25 h (14) | 92 KB (600) | 632 KB (476–1 470) | **3 614 KB** (69 % of 5 MiB) |
| Estimated worst (5 h, wide travel) | 1.2–2.4 MB | — | 4.2–6.4 MB |

- The map is about 90 % of a cut (tiles and fonts ≈ 330 KB, the `.mm2`
  ≈ 120 KB); its ceiling is 4.0 MB (a saturated subset).
- 150 × the median cut = **84 MB per account**; R2's free 10 GB holds
  about 118 such accounts, **73 beside full run storage** (50 MiB);
  at the 5 MiB ceiling for every link only 11.

**Verdict: keep 5 MiB.** Every measured cut and session fits (the
largest 69 %); only an uncut multi-hour session with wide travel may
pass it, and the dialog's refusal covers that. (A later saving if
needed: the frame host hands the map's tiles and fonts over like the
fonts, ≈ 0.2 MB per cut.)

## Test guide (owner)

On staging (<https://staging.mumecockpit.com>, not the `workers.dev`
address), with your test account. A second account helps for Report;
a private window is a guest.

1. **Share a cut.** Log in, History → a session (one with the map on is
   best) → Export. The format row has Link (L) after HTML replay and
   Plain text. Choose it and EXPORT: the share dialog with the title
   filled in, a description, the size against 5 MB, "Anyone with the
   link can watch this." and, the first time only, the rules with a
   tick. Create link → a bar, then the link with Copy.
2. **Watch as a guest.** Open the link in a private window: no start
   page animation; the band with title, character and level, length,
   date, views, "shared by <you>"; the replay plays in its frame (keys,
   fullscreen, the map). Download as HTML gives a file that plays.
   Reload: the views went up once, not twice. Do the same on the phone.
3. **Guest in the export editor.** Logged out, Export: Link is greyed;
   pressing it says to log in.
4. **Report.** As a guest on the link: Report says "Log in to report" and
   gives `abuse@mumecockpit.com`. Logged in with another account: the
   four reasons and a text; thanks; a second report says already
   reported. On your own run there is no Report.
5. **Published runs.** Account page → Published runs: the run with its
   views, Copy, Edit (change the title; the watch page shows the new
   one), Remove → the link says it was removed.
6. **The admin.** `/admin` on staging: Reports lists the reported run
   (reasons, how many accounts, the text). Watch opens it; Hide → the
   guest's link says hidden, your own account sees it with "Hidden after
   reports"/the admin note; Restore brings it back; Dismiss reports
   clears the queue. The totals and the log at the right. Suspend your
   second account: it can no longer share or report, its sync goes on;
   Restore it.
7. **Five reports** hiding a run needs five accounts: covered by the
   tests; say if you want to see it live.
8. **About and `/privacy`.** About names the abuse address. `/privacy`
   has a "Share links" section (letter L): read it and say whether the
   words are right.
9. **Size and refusals** (optional): an uncut multi-hour session with
   much travel may pass 5 MB; the dialog then says so before anything is
   sent.

**Second look (after the owner's feedback, 2026-11-15; deploy run
43756501555, commit 80274c3a; `test:prod` 36/36 against staging):**

10. **Fullscreen.** On a link, the replay's Fullscreen button (or F):
    the replay alone fills the screen, no band; Esc, F or the button
    leave it. Desktop (Chrome and Firefox) and the iPad: real
    fullscreen. **iPhone:** Safari allows element fullscreen only for
    video, so the replay fills the page over the band and Safari's bars
    stay; worth a look on the real phone (not tested on one here).
11. **The mail.** Report a run on staging (another account than the
    sender's): within a minute a mail "[staging] WebCockpit report:
    <title>" arrives with the reason, the text, how many have reported it
    and links to `/admin` and the run. If none comes, say so: the Worker's
    log then says why (the likely cause would be that the domain must
    also be added under Email Service → Email Sending).

**Feedback wanted:** does share → send → watch feel right on desktop
and phone; the band and the dialog in real use; the `/privacy` words;
anything that looked wrong. Then the yes or no to opening `share` in
production.

## Owner feedback

2026-11-15, second look: "Fullscreen fungerade fint på desktop och såg
bra ut. Share links texten är ok. Öppna i produktionen." (No iPhone to
test on.) Taken as the go-ahead for part F: released 0.13.0.

2026-11-15, after the test on staging: "I övrigt verkar det fungera bra."

- **Fullscreen** from the link did not go fullscreen; wanted: real
  fullscreen of the replay alone, without the band above. Fixed:
  Firefox refused the sandboxed frame fullscreen (`allow="fullscreen"`
  did not match its opaque origin); now `allow="fullscreen *"` and the
  frame alone goes fullscreen; on an iPhone (no element fullscreen) the
  frame fills the window over the band (ADR 0154 "As built (stage 64,
  owner's test: fullscreen)").
- **A mail on every report** to the abuse address's owner (picked: one
  mail per report with the run, reason, text, count and links to
  `/admin`; at most 20 an hour, then one collected mail; "[staging]" in a
  staging mail's subject). Built (ADR 0154 "As built … mail on
  reports"); waits for the secret `REPORT_MAIL_TO` on both Workers.
- **The account list in `/admin`** (all accounts, search, Suspend /
  Restore / Delete): stays in stage 66 as planned (owner's pick); the
  "An account" form beside the queue serves until then.
- **Five reports** (asked and answered): nothing is deleted by reports;
  five accounts hide a run until the owner has looked, as built (ADR
  0154 review fixes S3). The owner expects most cases to be his own
  review of a run with fewer than five reports, hiding it by hand: the
  queue lists every run with at least one report, and Hide works on any
  run at any time.
