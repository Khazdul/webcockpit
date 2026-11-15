# Stage 63 — Runs in the cloud; then accounts open

Status: **In progress (2026-11-15).** Planned; part A (mockups round 11,
the measurement) and part B (foundations) under way. Nothing released;
production untouched.

## Waiting for the owner

1. ~~Round 11's picks~~: **1a, 2b, 3a, 4 as drawn, 5 Spotlights and
   Diary only** (owner, 2026-11-15; see "For the owner to choose").
2. ~~The limit~~: **50 MB, decided by the owner 2026-11-15** after the
   measurement.
3. Later: **the test on staging** (test guide), and then, separately,
   **the go-ahead to open accounts in production** (part E).

## Goal

Saved runs follow the account (spec §7.5, ADR 0146 "Runs", ADR 0153):
the body in R2, encrypted, the meta as a `run` item; a storage limit
with a "does not fit" dialog that offers the download; History lists
the account's runs that are not on the device and fetches one when it
is opened; export docs sync; Statistics, Spotlights and Diary say what
they leave out. With that the account is whole, and accounts open in
production: the flags `accounts`, `sync` and `runs` in one step, on the
owner's explicit word (spec §7.12).

## What must be true afterwards

- **Save on one device, play on another.** A saved run (Exit popup,
  phone exit sheet, History) uploads in the background off play; on the
  next device it is in History with a cloud mark and its size, and
  opening it fetches it with a progress bar and then plays it. Once
  fetched it is on that device like any run.
- **The limit.** The server refuses a body that would pass the
  account's run storage (`413 quota` with the numbers) or 20 MB (`413
  run_too_large`). Two parallel uploads never pass the limit together.
  The number is the owner's, after the measurement; it can be changed
  without a client release.
- **"Does not fit".** When a save does not fit: the run is saved on the
  device as always; the dialog (round 11's pick) says the cloud is full
  with the numbers and offers Download the run, Open History, Keep on
  this device. Shown where the save was asked for; after an Exit on the
  start page. Such a run carries "not in the cloud" and is retried when
  there is room.
- **History** shows cloud-only runs and device-only ("not in the cloud")
  runs as round 11's pick says; the storage line shows the cloud's use
  beside the device's.
- **Delete** of a saved run removes it on every device and from the
  cloud, after a confirmation that says so (logged in only).
- **Export docs** sync: a cut begun on one device goes on on another.
- **Statistics, Spotlights, Diary** count what is on the device and say
  how many cloud-only sessions are not counted, with Fetch all on
  desktop.
- **Create account** moves all the device's runs into the account;
  the saved ones upload newest first; those that do not fit keep "not
  in the cloud" (no dialog, a line). History looks the same before and
  after.
- **Log out** lists saved runs not in the cloud (and unsaved runs, as
  today) and offers their download; such runs keep a lost session's
  copy locked.
- **Delete account** removes every body from R2.
- **The game path is untouched** (§7.0 rule 1): gzip and encryption in a
  Web Worker, no upload while playing, the §1.3 benchmark does not move.
- **Guests notice nothing.** The entry chunk grows only by what the
  start page must know (31 119 bytes after stage 62). Database version 10
  (one empty store) for everybody with the next release.
- **The flag `runs`** gates all of it (staging on, production off until
  part E).

## Not in this stage

- Share links and published runs (stage 64), the community (65), the
  admin panel's per-account limits (66).
- Any release before part E, and part E without the owner's go-ahead.

## Decided already

- Spec §7.5 and ADR 0146 (with its addendum): only saved runs, the body
  in R2 and the meta as an item, the limit with the download offer, fetch
  on open, a phone never downloads a library by itself, the move at
  Create account, the runs in Log out.
- Technical, this session: **ADR 0153** (one body per sealed run, the
  worker, the `run` and `exportDoc` items, the `runCloud` store in
  database version 10, the upload queue off play, fetch on open, the
  move of runs, the Worker's reservation of room, orphan bodies, the
  flag `runs`, the limit as a server value). The contract is in
  `shared/cloud/api.ts`, "Runs in the cloud" (on `main` before part B).
- A saved run cannot be unsaved, only deleted (today's History): a `run`
  tombstone always means deleted on every device.

## For the owner to choose (round 11)

Mockups in round 9–10's manner (`notes/research/start-menu-mockups/
round11/`), published as an artifact; the recommendation is in its
README.

1. **The "does not fit" dialog**: (a) the look kit's dialog over the
   page where the save was asked (Exit popup, History, the start page
   after an Exit), (b) the same words inline in the Exit popup / phone
   exit sheet, a dialog elsewhere.
2. **History's marks and storage line**: how a cloud-only run (cloud
   mark, size, fetched on open), a device-only run ("not in the cloud")
   and a run in step look; the storage line ("This device 1.2 MB · Cloud
   12 of 50 MB"); the fetch's progress; desktop and phone.
3. **Log out with runs not in the cloud**: round 9's runs row with the
   reason ("cloud full", "too large") in its second line, or one row per
   reason.
4. **The delete confirmation** logged in ("Deletes it on all your
   devices and in the cloud.").
5. **The counts** in Statistics, Spotlights and Diary ("3 sessions in
   the cloud are not counted · Fetch all") and where they sit.

**Owner's picks (2026-11-15)**, all as recommended in round 11's README
(<https://claude.ai/artifact/RTA5x1WwBouwWkSC8hWaZ6>): **1a** the look
kit's dialog "Cloud storage full" where the save was asked (after an
Exit on the start page; Open History left out when over History);
**2b** text tags in History ("in the cloud · 2.1 MB", "not in the
cloud"; runs in step and unsaved runs show nothing); **3a** one runs row
with the reason in its second line; **4** the delete dialog with the new
warning line as drawn (a guest keeps today's words); **5** the count in
the foot of Spotlights and Diary, Fetch all on desktop only, none in
Statistics (a session is fetched when it is opened).

## Tasks

Rules for every building agent (CLAUDE.md, "Tests and worktrees"): a
worktree branched from `main` by name; `node_modules` linked from the
main checkout and never `git add`ed; its own dev server port by
`WC_E2E_PORT`, never 5173; only its own spec files in the worktree;
the full e2e runs once, alone, in part D; nothing is deployed, nothing
touches staging or production.

### A. Mockups and the measurement

#### A1. Mockups, round 11 (worktree `stage63-mockups`, port 5441)

- [x] `notes/research/start-menu-mockups/round11/` in round 10's manner
      (its README and `build/`): the real DOM captured from a dev server
      on its own port with the e2e fake (flags `accounts`, `sync`, `runs`
      on), new content in `mk-*` classes, a picture per state, a review
      page, one self-contained file published as an artifact.
- [x] Points 1–5 above, desktop and phone; the recommendation (artifact <https://claude.ai/artifact/RTA5x1WwBouwWkSC8hWaZ6>).

#### A2. The measurement (no worktree; writes "Measurements" here)

- [x] Stored size of real saved runs: Cockpit's session logs
      (`/home/ole/MUME/logs`, read only) turned into run bodies as ADR
      0153 says (JSONL of meta, chunks, events, gzip, segment overhead):
      bytes per played hour, the spread, the largest; the `run` item's
      size (meta with summary) against the 2 MB small-item limit and the
      2 000 items. No text or names kept.
- [x] A proposal for the limit with the reasons (R2's free 10 GB, a
      hundred accounts).

### B. Foundations (two agents in worktrees side by side)

#### B1. Worker (worktree `stage63-worker`, port 5442)

- [x] Migration `0004_runs.sql`: `run_body`, `account.run_bytes`.
- [x] `worker/runs.ts`: `PUT`, `GET`, `DELETE /api/u/runs/<id>`, `GET
      /api/u/runs`; the reservation of room before R2, given back on a
      failure; `411`, `413 run_too_large`, `413 quota` with the numbers;
      the flag `runs` (404 off); `run` and `exportDoc` open with it.
- [x] `usage.runBytes` real everywhere it is answered; the limit from
      `RUN_BYTES_LIMIT` when set.
- [x] Delete account empties the R2 prefix and `run_body`.
- [x] Worker tests (two parallel PUTs at the limit, a replace, an R2
      failure, the list, Delete account); the contract's comments.
- [x] ADR 0153 "As built (B1)".

#### B2. The client's core (worktree `stage63-core`, port 5443)

- [x] Database version 10: the `runCloud` store (both spaces); upgrade
      test from version 9.
- [x] `src/cloud/runs/body.ts` + `body.worker.ts`: encode a run's rows
      to a sealed body (header line, JSONL, gzip, `encryptBody`) and
      decode a stream back to rows; Node round-trip tests; a body of
      another kind or id, a newer `v`, a gzip bomb are refused.
- [x] `src/cloud/sync/items.ts`: kinds `run` and `exportDoc` (bodies,
      decode, `v` 1, last writer).
- [x] `src/cloud/runs/queue.ts` (pure, ports): newest first, `full`
      retried when there is room, stops when playing, back-off,
      `quota` / `run_too_large` / `401`; `fetchRuns` with progress.
- [x] The model (`tests/unit/cloud-sync-model.ts`) grows R2 and the
      generated runs grow `run` and `exportDoc` (ADR 0153, "Tests").
- [x] The remote adapter for the run endpoints (`src/cloud/space/
      remote.ts`), against the contract.
- [x] ADR 0153 "As built (B2)".

### C. Flows and views (after B merged; C2 also after round 11's picks)

#### C1. Flows (worktree `stage63-flows`, port 5444)

- [ ] The IndexedDB adapters for `run` and `exportDoc` (`local.ts`): a
      run listed only when `up`; a pulled item → a `remote` row (or the
      meta of a run that is here); a tombstone deletes; an edit that
      beats a delete puts the run back in the queue.
- [ ] The queue wired: triggers (after a save, after a sync, at load,
      after a delete), the lock `webcockpit-runs@<space>`, not while
      playing; orphans dropped.
- [ ] `RunLibrary.save` / `remove` queue and delete; the sweep keeps
      export docs of cloud sessions; `listSessions` with `remote` rows.
- [ ] The move of runs at Create account (with fingerprints); then the
      uploads; the move's line.
- [ ] `unsynced()` with runs; the locked copy; Delete account's
      hand-back of `remote` rows (none: they are the account's).
- [ ] `src/cloud/runs-view.ts`: what the views read (a session's cloud
      state, the storage figures, `fetchSession(id, onProgress)`,
      `fetchAll`, the "does not fit" event).
- [ ] e2e (fake API, two contexts): save on A, open on B; Create account
      with runs; a run over the limit stays "not in the cloud".
- [ ] `npm run test:sync-worker`: a run uploaded, listed and fetched
      against the local Worker.

#### C2. Views (worktree `stage63-views`, port 5445)

- [ ] History: the marks, the storage line, fetch on open with stage
      24's bar, offline on a cloud-only row (round 11's pick, desktop and
      phone).
- [ ] The "does not fit" dialog (pick 1), with Download the run (the
      runs backup of that session), Open History, Keep on this device.
- [ ] Log out's runs (pick 3); the delete confirmation (pick 4).
- [ ] Statistics, Spotlights, Diary: the counts and Fetch all on desktop
      (pick 5).
- [ ] e2e for each, desktop and phone.

### D. Checks and staging

- [ ] A review of the runs' sync by a second agent with only the code and
      ADR 0146, 0150, 0151, 0152, 0153; `/code-review` high of the stage;
      fixes with tests.
- [ ] Unit; the full e2e alone at 5 workers (a failure rerun alone
      before it is called one); the benchmark; the entry chunk; `npm run
      test:sync-worker`.
- [ ] Push `main`; `deploy.yml` to staging; migration 0004 there;
      `test:prod` against <https://staging.mumecockpit.com>. Nothing
      released, no tag, nothing to production.

### E. Accounts open in production (only on the owner's go-ahead)

- [ ] The owner has tested on staging and said yes.
- [ ] The release: version, `CHANGELOG`, the tag; `deploy.yml` applies
      migrations 0003–0004 in production; `FLAG_ACCOUNTS`, `FLAG_SYNC`,
      `FLAG_RUNS` on in production (vars, or the admin page's overrides:
      the owner's choice); `test:prod` against mumecockpit.com.

## Measurements

Part A2, 2026-11-15; the full note is `notes/research/run-sizes.md`
(no game text, no names). Material: 72 WebCockpit runs (11.8 h, 23
saved) from the owner's own runs backups, and 12 Cockpit runs (10.6 h,
two of 2.4 h and 5 h) converted to WebCockpit's form, their GMCP
estimated from the WebCockpit runs (factor 1.42, upper bound 2.81).
The encryption is the real code (`encryptBody`, `seal`): 21 bytes of
header and 28 per started 1 MiB segment.

| Figure | Value |
|---|---|
| Stored (encrypted) bytes per played hour, runs ≥ 0.25 h | median 149 KB, quartiles 46 / 388 KB; active play 270–445 KB/h; worst 820 KB/h |
| All 84 runs, 22.5 h | raw 42 MB, stored 5.8 MB (8.2 MB at the upper bound) |
| Largest body | 1.4 MB (5 h run; at most 2.7 MB): 7–14 % of the 20 MB per body |
| A `run` item, sealed | 241–490 bytes |
| 50 MiB holds | about 120–200 played hours (about 64 h at the worst rate), about 760 runs |
| Their items | about 0.3 MiB and 760 of the 2 000 items |
| R2 | 100 full accounts 5.2 GB, half the free 10 GB |

**Owner (2026-11-15): 50 MB**, as proposed.

**Proposal:** keep 50 MiB; the small-item limits (2 MB, 2 000) stand at
that size and should rise with the run limit if it goes past about
100 MiB (e.g. 5 000 items, 4 MB).

## Test guide (owner)

(Written when part D is done.)

## Owner feedback

(After the test.)
