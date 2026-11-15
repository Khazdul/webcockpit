# Stage 64 — Share links

Status: **In progress (2026-11-15).** Planned; mockups round 12 for the
owner; foundations being built.

## Waiting for the owner

- Round 12's picks (the mockups; link below once published).

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

- [ ] `notes/research/start-menu-mockups/round12/` in round 11's manner
      (its README and `build/`): the real DOM captured from a dev server
      on its own port with the e2e fake (flags on), new content in
      `mk-*` classes, a picture per state, a review page, one
      self-contained file published as an artifact.
- [ ] Points 1–6 above, desktop and phone (6 desktop only); the
      recommendation.

#### A2. The measurement (no worktree; writes "Measurements" here)

- [ ] Payload sizes (`buildPayload` + gzip, with and without the map)
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

- [ ] `src/replay/validate.ts` `validatePayload` (ADR 0154's bounds and
      whitelists) with unit tests; the settings whitelist also used by
      `buildPayload` (what is uploaded is what the replay reads).
- [ ] The frame document `r/frame.html` (Vite build, one inline script
      and style), its `_headers` rule with the hashes filled at build
      (as `cspHashesPlugin`), the frame's side of the handshake
      (`wc-ready`, `wc-play`, `wc-error`), the bounded decompression,
      `FontFace` from bytes, the map worker from a blob.
- [ ] `src/watch/frame-host.ts`: the page's side (the iframe's
      attributes, the checks on `source` and `origin`, the fonts, the
      transfer), with a dev route to play a local payload in it.
- [ ] A review of every path from payload text to the DOM in the
      player (ADR 0154 "No HTML from the payload"), fixes with tests;
      the findings written in ADR 0154 "As built (B2)".
- [ ] Fuzz tests (`tests/unit/replay-fuzz.test.ts`, fixed seeds).
- [ ] e2e `watch-sandbox.spec.ts`: a hostile payload's script in the
      frame cannot reach storage, cookies, the parent's DOM, the network
      or the top navigation; the frame's CSP header is the one in the
      ADR.
- [ ] The main page's CSP gets `frame-src 'self'`; the CSP walk
      (tests/e2e-prod/csp.spec.ts) covers `/r/frame.html`.

### C. Flows and views (after B merged and round 12's picks)

#### C1. Share and Published runs (worktree `stage64-share`, port 5464)

- [ ] `src/cloud/pub/api.ts`: the client of the pub and report
      endpoints, against the contract and the e2e fake
      (`tests/e2e/cloud-account-fake.ts` grows them).
- [ ] The export editor's Link (pick 1), the share dialog (pick 2), the
      rules' tick, the refusals; the upload test (nothing but payload and
      meta).
- [ ] Published runs on the Account page (pick 4): list, Copy, Edit,
      Remove, hidden.
- [ ] e2e for each, desktop and phone.

#### C2. The watch page (worktree `stage64-watch`, port 5465)

- [ ] `src/boot`: `/r/<id>` straight to the watch view (a lazy chunk).
- [ ] The watch page (pick 3) with B2's frame host; the states; Back;
      Download as HTML from the validated payload; the view counted once.
- [ ] Report (pick 5), logged in and out.
- [ ] About and `/privacy`: the abuse address; `/privacy`'s words on
      share links (for the owner).
- [ ] e2e: a link made on A watched on B as a guest, desktop and phone;
      each state; Report; Download.

#### C3. Admin (worktree `stage64-admin`, port 5466)

- [ ] `worker/admin/page.ts`: Reports (pick 6), the actions with their
      confirmations, the totals, the log; text only, the page's CSP
      unchanged.
- [ ] Watching a hidden run from the queue (`/r/<id>?admin`).
- [ ] Tests (worker and the page's script in the unit DOM).

### D. Checks

- [ ] An independent security review by a second agent with only the
      code and ADR 0148 / 0154: the sandboxed playback against hostile
      payloads (its own fuzzing, its own attack payloads), the frame's
      CSP and handshake, that the server can read only what was shared,
      the Worker's checks (auth, suspended, limits, races, states, the
      admin's guard). `/code-review` high of the stage. Fixes with tests
      that fail before them; ADR 0154 "As built (review fixes)".
- [ ] Unit; worker; the full e2e alone at 5 workers (a failure rerun
      alone before it is called one); the benchmark; the entry chunk;
      `npm run test:sync-worker` (grows: a run shared, watched and
      removed against the local Worker and R2).

### E. Staging

- [ ] Push `main`; `deploy.yml` to staging with migration 0005;
      `test:prod` against <https://staging.mumecockpit.com> (grows: a
      watch page's state with `share` on); production's `/api/config`
      unchanged (`share` off). No tag, no release.

### F. Share open in production (only on the owner's go-ahead)

- [ ] The owner has tested on staging and said yes.
- [ ] The release: version, tag, migration 0005 in production,
      `FLAG_SHARE` on in production's vars; `/api/config`; `test:prod`
      against mumecockpit.com.

## Measurements

(Part A2.)

## Test guide (owner)

(Written when part E is done.)

## Owner feedback

(After the test.)
