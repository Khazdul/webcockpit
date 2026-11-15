# 0153 — Runs in the cloud

- Status: Accepted (technical; stage 63). Built; released in 0.12.0 (2026-11-15), when accounts opened in production. The points a player sees
  (the "does not fit" dialog, History's marks and storage line, Log
  out's runs, the confirmation, the counts in Statistics, Spotlights
  and Diary) follow the owner's picks of mockup round 11; the limit
  follows the owner after the measurement (stage file).
- Date: 2026-11-15
- Related: ADR 0146 and its addendum ("Runs"), ADR 0145 (keys,
  segmented bodies), ADR 0150 (the spaces), ADR 0151 (the engine),
  ADR 0152 (the small kinds), ADR 0018 / 0019 (run storage, export
  docs), spec §7.5, §7.11, §7.12 (63),
  `docs/stages/63-runs-in-the-cloud.md`.

## Context

Stages 61–62 sync everything of an account but its runs. A run is
large (its capture text in `runChunks`, its `runEvents`), so it cannot
be a small item: ADR 0146 puts the body in R2 and a small `run` item
(the meta) in the item log. Saved runs only; a saved run is never
"unsaved", the only way out is Delete (src/runs/library.ts), so a
tombstone of a run always means "deleted on every device".

What is there already: segmented encryption of a body
(`src/cloud/crypto/segments.ts`, `encryptBody` / `decryptBody`, 1 MB
segments, kind and id in each segment's associated data), the R2
bucket `FILES` (EU) bound in both environments, `runBytes` and
`runMaxBytes` in `AccountLimits`, and `exportDoc` and `run` in
`SYNC_KINDS`, closed.

## Decision

### The body

- **One body per sealed run** (not per session): the backup's JSONL
  lines of that run (`{"type":"run","run":…}` as `backup()` writes it, its chunks, its events;
  src/runs/library.ts, `BACKUP_SCHEMA`), preceded by a header line
  `{"type":"webcockpit-run-body","v":1}`. Gzip (`CompressionStream`),
  then `encryptBody(dataKey, "run", serverId, …)`. An export doc is not
  in the body; it is an item of its own (below).
- **Built and opened in a Web Worker** (`src/cloud/runs/body.worker.ts`),
  given the data key (a `CryptoKey` is structured-cloneable) and the
  rows; the page never gzips or encrypts a run on its own thread
  (§7.0 rule 1). The worker returns a `Blob` of known size, so the
  upload has a `Content-Length` and the quota is checked before a byte
  is stored.
- **The server id** is `opaqueId(idKey, "run", runId)`, as for any
  item; the R2 key is `u/<account id>/<serverId>`.

### The `run` item

- Kind `run`, local key the `runId`, policy **last writer**, body `v` 1:
  `{runId, meta, size}`: `meta` the `RunMeta` as stored (character,
  times, sealed, bytes, lines, saved, rating, savedUs, summary), `size`
  the stored body's bytes. History, the storage line and the counts read
  from it without the body.
- **The body goes first.** The adapter lists a run as an item only once
  its body is in R2 (`runCloud.state = "up"`), so no device ever pulls a
  meta whose body is missing. Rating changes are item writes; the body
  of a sealed run never changes.
- **A tombstone deletes the run** on every device (body, chunks, events,
  its `runCloud` row; the export doc of its session when no run of the
  session is left), as Delete does locally. The engine's "an edit beats
  a delete" holds: a device that changed the rating of a run deleted
  elsewhere pushes it back; the adapter then puts the run back in the
  upload queue first (the device has the body), and the item follows
  once it is up.
- **Only saved, sealed runs** are items. An unsaved run never leaves the
  device (ADR 0146).

### The `exportDoc` item

- Kind `exportDoc`, local key the session id (the chain's first run id),
  last writer, body `v` 1: the `ExportDoc` as stored. Listed only for a
  session with a saved run; small (cuts and comments).
- **The sweep keeps a doc whose session is in the cloud:** today it
  removes every export doc whose session's run is gone from the device;
  it now also keeps one whose first run has a `runCloud` row.

### Local state: the `runCloud` store (database version 10)

One row per run the cloud knows or should know, keyed by `runId`, in
every space's database (one schema, ADR 0150; empty in the device's):

| `state` | Meaning |
|---|---|
| `queued` | saved and sealed here, not uploaded yet |
| `up` | uploaded; the body is in R2 and here |
| `full` | refused for room (`quota`); retried when there is room |
| `tooLarge` | over `runMaxBytes`; never tried again |
| `remote` | in the account, not on this device: the row holds the item's `meta` and `size` |
| `fetching` | being fetched (cleared to `up` or back to `remote`) |

plus `serverId`, `size`, `tries`, `at`. History stitches sessions from
the `runs` store and the `remote` rows together (`stitchSessions` takes
metas), so a cloud-only session lists like any other and is fetched when
opened.

### The upload queue

`src/cloud/runs/queue.ts`, pure, with ports like the engine (ADR 0151):

- **What it uploads:** every `queued` row, newest first (`startedUs`),
  and every `full` row while the account has room for it
  (`limits.runBytes − usage.runBytes ≥ size`).
- **When:** after a save (Exit popup, phone exit sheet, History), after
  every sync that ends `synced`, at load, and after a delete frees room.
  **Never while playing** (`isPlaying()`, src/core/playing.ts, or the
  game lock of this space held elsewhere): the queue checks before each
  run and stops; an upload in flight finishes (it is network and the
  worker's crypto).
- **One tab** uploads: the Web Lock `webcockpit-runs@<space id>`.
- **After a run is up** the queue asks for a sync, which pushes its item.
- Errors as the engine's table: offline and `5xx` back off (same
  `backoffMs`), `401` goes the way of a lost session, `413 quota` makes
  the row `full` and reports the numbers once (the "does not fit"
  dialog), `413 run_too_large` makes it `tooLarge`.

### Fetching on open

`fetchRuns(runIds, onProgress)`: `GET /api/u/runs/<serverId>` per run,
the response streamed through the worker (decrypt, gunzip, parse),
written in one transaction per run with the code that `restore()` uses
(src/runs/library.ts), then `runCloud.state = "up"`. Progress is bytes
of the bodies over their sizes, on stage 24's bar. A fetch is only ever
asked for: on opening a session (player, export editor, Statistics of a
session) and by "Fetch all" (desktop). A phone never fetches a library by
itself.

### The move at Create account

- **All the device's runs move** into the new account's space
  (spec §7.5): runs, chunks, events and export docs, one transaction per
  run, with the move's fingerprint rule of ADR 0150 (as built, review
  fixes): a run the device changed after the copy stays the device's.
  The device's copy is removed when the account's space holds it (runs
  are moved locally; the upload is the account space's concern).
- The saved ones then get `runCloud` rows `queued` and upload in the
  background, newest first; those that do not fit end `full` and carry
  "not in the cloud". The move's line names the runs; a `quota` during
  the move's uploads shows no dialog (one line on the start menu says how
  many runs are not in the cloud), since the player asked for no save.

### Log out and the locked copy

- `unsynced()` gains the runs: `queued`, `full` and `tooLarge` saved runs
  are "saved runs not in the cloud"; unsaved runs of the last 14 days
  keep their row. Download offers the runs backup of exactly those runs.
- The locked copy (ADR 0150): a saved run not `up` keeps the copy
  locked, as a change does; unsaved runs do not.

### Statistics, Spotlights, Diary

They read what is on the device. A view that counts sessions says how
many sessions of the account are cloud-only (`remote`) and so not
counted, with **Fetch all** on desktop (not on a phone or tablet).

### The Worker

- **Migration `0004_runs.sql`** (adds only): `run_body(account, id,
  size, created)` PRIMARY KEY (account, id); `account.run_bytes`
  (default 0).
- **`PUT /api/u/runs/<id>`**: `Content-Length` required (`411`), at most
  `runMaxBytes` (`413 run_too_large`), `application/octet-stream`. The
  room is **reserved first** in D1 (one conditional `UPDATE account SET
  run_bytes = run_bytes + ?delta WHERE run_bytes + ?delta <= ?limit`,
  delta = new size − the old body's size), then the body is streamed to
  R2, then `run_body` is written; an R2 failure gives the reservation
  back. No room: `413 {error: "quota", used, limit}`. A PUT over an
  existing body replaces it (delta may be negative; never refused).
- **`GET /api/u/runs/<id>`** streams the body (`404 not_found` when
  there is none); **`DELETE`** removes it and gives its bytes back.
- **`GET /api/u/runs`** lists `{id, size}` of the account's bodies, for
  the storage line and for dropping orphans: a body with no live `run`
  item older than a day is deleted by the client that finds it (a body
  uploaded whose item push never came).
- `usage.runBytes` is real now in `SyncChanges.usage`, `SyncWritten` and
  the account's answer.
- **Delete account** deletes the account's R2 prefix (listed and deleted
  in batches of 1000, after the D1 rows) and its `run_body` rows.
- **The flag `runs`** (`FLAG_RUNS`, staging on, production off): off,
  the run endpoints answer `404 not_found` and `run` / `exportDoc` stay
  `kind_closed`. The client with `runs` off keeps runs in the space as
  stages 61–62 did.
- The limit stays a server value (`DEFAULT_ACCOUNT_LIMITS.runBytes`,
  overridable by the var `RUN_BYTES_LIMIT`), so the owner can change it
  without a client release; per account in stage 66.

### Tests

- Unit: the body round trip (worker code run in Node), the queue against
  the in-memory model grown with R2 (`quota`, `run_too_large`, a lost
  PUT, an orphan), the `run` and `exportDoc` kinds in the generated runs
  (a run is listed only when up; a tombstone deletes; an edit beats a
  delete re-uploads; every device ends with the same set of saved runs,
  local or `remote`).
- Worker: the endpoints, the reservation under two parallel PUTs, the
  orphan list, Delete account empties the prefix.
- e2e (fake API, two contexts): save on A, see the run on B with its
  cloud mark and open it; fill the limit and see the dialog; Log out
  with a run not in the cloud; Create account with runs.
- `test:sync-worker` uploads and fetches a run against the local Worker.

## Alternatives

- **One body per session.** A session grows by a run at every
  reconnect; the body would be uploaded again each time. Runs are the
  unit the store already has.
- **The body inside the item log (D1).** 1 MB per item and 2 MB in all;
  runs are megabytes.
- **Upload from the page's thread.** Gzip and AES of 20 MB block a
  frame; the worker keeps the game path clean.
- **Signed R2 URLs, upload straight to R2.** Fewer Worker CPU
  milliseconds, but the quota could not be checked against the bytes
  that arrive, and R2's CORS would need opening. Streaming through the
  Worker costs no CPU to speak of (it is I/O).
- **Remote runs as rows in `runs` with no chunks.** Every reader of
  `runs` (player, stats, spotlights, sweep) would need to know a run may
  have no text; a separate store keeps them out until fetched.
- **Upload on every save at once, during play too.** The phone exit
  sheet saves as the game ends; the queue's "not while playing" costs
  nothing there and protects a reconnect.

## Consequences

- The device's and every account's database get version 10 (one empty
  store) with the first release after stage 63, whatever the flags.
- A body uploaded and then never named by an item costs room until a
  client drops it (a day later).
- Opening a cloud-only session needs the network; offline, History says
  so on the row and the session cannot be opened.
- Accounts open in production after this stage, with `accounts`, `sync`
  and `runs` in one step (spec §7.12), and only on the owner's word.

## As built (stage 63 B1)

The Worker part, as decided above, with these additions and details:

- **The reservation, exactly.** `grow = max(new size − stored size, 0)` is
  reserved with the one conditional `UPDATE` (skipped when 0, so a PUT
  that does not grow is never refused). A shrink frees its room only once
  the new body is stored, so a parallel PUT cannot borrow room a failing
  shrink would take back. After R2, one batch takes the reservation back,
  adds the new size less what `run_body` holds *at that moment*, and
  upserts `run_body`: `account.run_bytes` always ends at `SUM(run_body.size)`,
  also when two PUTs of one id race (the R2 object is then the last put's,
  the row the last batch's; one tab uploads under the Web Lock, so this is
  theory).
- **The body to R2** goes through a `FixedLengthStream` of the declared
  `Content-Length`: a body shorter or longer fails the put, and the stored
  size is checked against it. A failure gives the reservation back and
  answers `503 unavailable`; R2's put is atomic, so an old body of the id
  stays as it was. A stored size that differs (it should not happen) is
  not trusted: the object and its row go.
- **Account deleted during an upload**: the `run_body` upsert holds only
  while the account exists; when it does not, the object is deleted again
  and the answer is `401`.
- **`DELETE`** removes the R2 object first, then the row and its bytes:
  when R2 fails nothing has changed (`503`). It answers `size: 0`.
- **`run_body.created`** is the time of the body's last write (a replace
  moves it), so the clients' orphan rule ("no live item, older than a day")
  never drops a body that was just uploaded again. The list is oldest
  first.
- **The open kinds.** `SYNC_KINDS_OPEN` (the contract) keeps meaning "open
  whatever the flags"; `worker/sync.ts` `openKinds()` adds `run` and
  `exportDoc` (`RUN_KINDS`) while `runs` is on. The run paths need only
  `runs` (and `accounts`), not `sync`.
- **The limit.** `defaultLimits(env)` (worker/accounts.ts) is
  `DEFAULT_ACCOUNT_LIMITS` with `runBytes` from `RUN_BYTES_LIMIT` (a whole
  number of bytes, as a number or a string; anything else is ignored).
  `/api/config` answers it, and an account's own `limits` column still
  wins over it.
- **Delete account and R2.** The transaction deletes the `run_body` rows
  and writes a row `r2_sweep(prefix, at)` for `u/<account id>/` (migration
  0004, a third table besides the two decided). After it, the request
  empties the prefix (list ≤ 1000, delete those keys, again until empty),
  ignoring an R2 failure. The daily cron (`sweepPrefixes`, after the
  session prune) empties every prefix whose row is at least an hour old
  once more and only then removes the row; a prefix R2 fails on stays for
  the next day. This covers an R2 failure half-way and an upload that
  raced the delete, at one R2 list per deleted account.
- **Without the `FILES` binding** the run endpoints answer `503`.
- **What can still leak**: an isolate killed between the reservation and
  the final batch leaves reserved bytes with no row (`run_bytes` above the
  sum of `run_body`). Rare, and in the player's disfavour only (less room);
  a reconciliation (`run_bytes = SUM(size)` for accounts with no PUT in the
  last hour) can be added to the daily cron if it is ever seen.
- **Tests** (`worker/test/runs.test.ts`, local R2 of Miniflare): the
  endpoints, 400/411/413s, quota numbers, two and eight parallel PUTs at
  the limit, replace (shrink/grow, limit lowered), R2 failures
  (`faultyBucket` in the helpers), a short body, the race with Delete
  account, the list, the flag, `RUN_BYTES_LIMIT`, `runBytes` in every
  usage, Delete account and the cron sweep, `emptyPrefix` over 1003 keys.
  Miniflare's local R2 logs an uncaught "Network connection lost" of its
  own in the short-body test; the test passes.

## As built (stage 63 B2)

The client's core, on branch `stage63-core`; nothing of it is wired into
the app yet (part C1) and nothing lands in the entry chunk.

**Database version 10** (src/core/db.ts): `runCloud`, keyPath `runId`,
index `state`, in every space's database. The row
(src/cloud/runs/types.ts, `RunCloudRow`): `runId, state, serverId, size,
tries, at`, plus `startedUs` (the queue goes newest first without
reading `runs`), `meta` (remote and fetching rows) and `full` (`quota`,
or the item's 413 code when the item was refused after the body).

**The lines** of a run moved out of src/runs/library.ts into
src/runs/lines.ts (`checkRecord`, `runMetaProblem`, `toRunMeta`,
`toEvent`, `toChunk`, `runLines`, `streamLines`, `BadBackupError`), used
by `backup()`/`restore()` and by the body alike.

**The body** (src/cloud/runs/body.ts): `encodeRunBody(dataKey, serverId,
rows) → Blob`, `decodeRunBody(dataKey, serverId, runId, Blob | stream)
→ RunRows`, refusals as `RunBodyError` with `code` `newer` (segment
version or header `v`), `unreadable` (does not open, cut, changed, not
gzip, not a run body, an export or second run line), `too_large` (the
plaintext passes `RUN_PLAIN_MAX_BYTES`, 256 MB: a gzip bomb stops there),
`wrong_run`. **The body's meta leaves out `rating`**: the rating is the
one thing of a saved run that changes and lives in the item (whose meta
wins at a fetch), so a body sealed again from the same run is the same
plaintext and the same size the item names (the generated runs found the
item's size and a re-uploaded body's apart otherwise).
src/cloud/runs/body.worker.ts and body-client.ts (`runBodyCodec()`, the
worker with an inline fallback where there are no workers;
`inlineRunBodyCodec()`; `runBodyPort(dataKey, codec)`;
`stopRunBodyWorker()`), as the KDF worker: started on demand, ended 30 s
after its last answer, five minutes without an answer is a dead worker.
**A fetched body is collected into a Blob** on the page while it streams
in (that is where the progress is counted) and opened in the worker from
the Blob, rather than the response stream being handed to the worker
(transferable streams are not in every browser).

**The kinds** (src/cloud/sync/items.ts): `runSpec` (`{runId, meta,
size}`, meta by `runItemMeta`: the backup's rules, sealed and saved,
rating 0–5, only `RunMeta`'s fields) and `exportDocSpec`
(`normalizeExportDoc`), both `v` 1, last writer. **`SYNC_SPECS` is left as
it was**; `RUN_SPECS` and `SYNC_SPECS_WITH_RUNS` (the six, then run and
exportDoc) are new. The runtime passes `SYNC_SPECS` today: with the run
kinds in it before C1's adapter lists them, a pulled run item would be
taken (a write the adapter ignores) and then pushed back as a delete.
C1 passes `SYNC_SPECS_WITH_RUNS` when the flag `runs` is on and the
adapters store the kinds.

**The engine** says `{type: 'revived', kind, key}` when an edit here beat
a delete pulled (the local version is pushed onto the tombstone); no
words for the player. It is how the space learns that a run's body may
be gone while its item is live again.

**The queue** (src/cloud/runs/queue.ts), `new RunQueue({store, body,
remote, isPlaying, requestSync, clock?, lock?, events?, random?})`:
`run()` (coalescing like `sync()`), `setRoom(usage, limits)`, `room`,
`fits(row)`, `itemRefused(runId, error)`, `removeBody(serverId)`,
`checkBodies(liveIds)`, `recover()`, `fetchRuns(runIds, onProgress(done,
total))`, `retryAt`; `orphanBodies(bodies, keep, now)`,
`runsLockName(space)`. As decided, with these details:

- A `full` row is retried only while the room *known* holds it (none
  known: it waits); a row refused as an item also needs room for one more
  item. A body over `runMaxBytes`, or one the known room cannot hold, is
  settled without a request.
- **The item refused after the body** (`413 too_many_items` /
  `storage_full`, the addendum of c32c8868): the space calls
  `itemRefused(runId, error)` on the engine's `full` event of a `run`
  whose sync record has rev 0 (new to the account; a rating edit of a
  live item never gives its body back). The row goes `full`, the same
  `full` event (with `reason`), and the body is deleted at once.
- A run deleted while its body went up has the body deleted again; a row
  whose run is gone is dropped.
- `checkBodies(liveIds)` (one list request): orphans go (older than a
  day, named by no live item and no own `up` row), and **an own `up` row
  whose body is not there goes back to `queued`**. The generated runs
  found the case: an edit beat a delete on one device while the device
  holding the body still had it as `up`.
- `fetchRuns` writes with the item's meta, the row `up` with the body's
  size; stops the rest on offline, server or a lost session; a `404` is
  `missing`, a bad body `unreadable` or `newer`; a run deleted meanwhile
  is not written.

**The fetch adapter** (src/cloud/space/run-remote.ts, `fetchRunRemote(fetch?,
timeoutMs?)`): PUT of the Blob (the browser sets `Content-Length`), GET
read as a stream with `onBytes`, DELETE, list; errors as `fetchRemote`
(a `404` is `refused` 404); 20 s for the small calls, a transfer
20 s + its size at 50 kB/s.

**What C1's adapters must do** (the model, `MemoryRunSpace` in
tests/unit/cloud-sync-model.ts, is the reference):

- `run` lists a run here once its row is `up`, or while it is `queued`
  and the account has its item (a live sync record: put back in the queue
  after `revived`); `remote`/`fetching` rows with their meta. A pulled
  item for a run here takes the meta, and an `up` row the item's size; for
  one not here, a `remote` row. A tombstone deletes the run, its row and
  its session's doc.
- On `revived` of a run: a run here goes back to `queued`; a row with no
  run here (a remote one) is dropped, so the next sync deletes the item
  again (nobody has its body).
- `exportDoc` lists a doc whose session has a run (here or `remote`), or
  that the account has.
- **Delete's body goes after its tombstone**: the player's Delete removes
  the run here and keeps its server id; after the next sync that ends
  `synced`, the body is deleted unless the run is listed again (an edit
  elsewhere beat the delete, and then the body is still needed). Deleting
  the body at once lost bodies in the generated runs.

**Tests.** tests/unit/cloud-runs-body.test.ts (round trip, sizes, the
refusals, the bomb), cloud-runs-queue.test.ts (the queue and the fetch
against the model grown with R2: reservation under two parallel PUTs, a
lost R2 write, quota, too large, 401, the item refused, the check of the
bodies), cloud-runs-remote.test.ts (the adapter against the contract and
the model), cloud-runs-property.test.ts (the generated runs: two and
three devices, 90 seeds, about 2 s; `RUNS_SEED`, `RUNS_SCALE`; 2 700
seeds clean at `RUNS_SCALE=30`), the version 10 upgrade in spaces.test.ts.

## As built (stage 63 C1)

The flows, on branch `stage63-flows`. With the flag `runs` off nothing
changes from stage 62 (the engine gets `SYNC_SPECS`, no queue, the runs
stay in the space, Create account leaves them on the device).

**The adapters** (src/cloud/space/local.ts), as `MemoryRunSpace`: `run`
lists a run here whose row is `up` (or `queued` with an agreed record),
and `remote`/`fetching` rows with their meta, the meta always through
`runItemMeta`; a put takes the item's meta into a run here (an `up` row
its size, no row an `up` one) or makes a `remote` row (a `fetching` one
stays `fetching`); a remove deletes the run, its chunks, events, row and
the export doc keyed by it (a session is deleted whole, so the doc of the
session it began). `exportDoc` lists a doc whose session's first run is
saved here or `remote`/`fetching`, or that has an agreed record. The run
server ids are computed before the write's transaction (`runServerId`,
the engine's `ItemCodec`). `idbRunCloudStore` is the queue's store;
`putFetched` writes nothing when a tombstone took the row meanwhile.

**The queue on the page** (src/cloud/space/runtime.ts, `PageRuns`):

- **Queued rows are made by the page, not by `save`:** before each queue
  run every saved, sealed run here without a `runCloud` row gets a
  `queued` one (`enqueue`). So the Exit popup's save (the live run is
  sealed only when the game ends), a restore, the move and a run saved
  before the flag was on all queue the same way. `RunLibrary.save` tells
  the hook (src/runs/cloud-hook.ts) which runs and where, and the hook
  starts the queue.
- Triggers: the hook's save and delete, every sync that ends `synced`
  (the engine's `usage`/`limits` given to `setRoom` first), at load
  (`recover()` then the queue), the queue's own `retryAt`, and a recheck a
  minute later while a game runs in another tab. Never while
  `isPlaying()`/`holdingGameLock()` or `gameRunningElsewhere()`; the game's
  end starts a sync and with it the queue. `requestSync` is a sync 300 ms
  later (one for a few uploads in a row). The body port is loaded with
  `import()` on the first upload or fetch.
- After each sync: `revived` runs back to `queued` (or the row of one not
  here dropped), a `full` of a `run` whose record is missing or rev 0 →
  `itemRefused`; on `synced` the bodies of runs the player deleted
  (`syncMeta.runBodyDeletes`, run id → server id, written by
  `RunStore.deleteSavedRuns` in the Delete's transaction) are deleted
  unless the run is listed again, and once per page load `checkBodies`.
- A `session_ended` of the queue or a fetch goes `sessionLost`.

**The library** (src/runs/library.ts, store.ts): `listSessions(now,
{remote: true})` (History) stitches the `remote`/`fetching` metas in;
`cloudRows()`; `ensureLocal(session, onProgress)` fetches a session's
cloud-only runs through the hook, called by the player host's `open`
(History's Run log, the gallery), the export editor and History's
Statistics before they read (`PlayerOpenOptions.onFetch` for C2's bar);
a rating of a cloud-only session is written into its rows' meta (the item
follows); `remove` deletes in one transaction with the rows; the sweep
keeps the doc of a first run with a `runCloud` row; `backup(now, {only})`.
`saveExportDoc` notes `exportDoc` (store-events), a sync 5 s later.

**Runs not in the account** (spaces.ts `runCounts`): a saved run is in the
cloud only when its row is `up` **and** its `run` record is agreed (rev >
0, a hash): a body up whose item was never pushed is still lost at a Log
out. `runCounts` gives the ids too; Log out's Download is the runs backup
of exactly the saved runs not in the cloud and the unsaved runs.
`PageSync.unsynced()` replaces the engine's `run`/`new` entries by one per
saved run not in the cloud. The locked copy: `notInAccount` counts the
same saved runs (unsaved ones and export docs do not lock; an export doc
changed alone is not worth a locked copy). Delete account's hand-back is
unchanged: `remote` rows are not runs, so nothing of them comes back.

**The move** (move.ts `moveRuns`), only with the flag `runs`: after
`beginMove`, before the change of space, each run is copied into the
account's space in one transaction (skipped when it is there), then
deleted on the device in one transaction if its meta's fingerprint is as
copied; otherwise it stays the device's and its copy leaves the account's
space again. The export docs follow (the account's own doc of a session
wins). `MoveState.runs` keeps `pending` (finished at the next load if cut
off) and the saved ids moved; `total.runs` names them in the move's line
("Moved into X: 4 runs.") and the Account page's. A `full` or `tooLarge`
of a moved run that no save of this page asked for fires no "does not
fit"; `runsView().notInCloudAfterMove` counts them.

**src/cloud/runs-view.ts** is C2's API (documented at its top): the view
(`on`, `cloud` used/limit, `queued`, `notInCloudAfterMove`),
`sessionCloud(session, rows)`, `storageFigures(lib)`,
`cloudOnlySessions(lib)`, `fetchSession(id, p)`, `fetchAll(p)`,
`onDoesNotFit` / `takeDoesNotFit` (`{runId, sessionId, used, limit, size,
reason, where}`; `where` `history`, or `start` for a save asked in play or
for a run no save of this page asked for). It imports only types; the
runtime sets its fetcher.

**Where it differs from the decision above**: the queued rows come from
the page's scan, not from `save` (above); `where` is `start` also for a
run that no save of this page asked for (a run saved before, queued at
load); an export doc changed alone does not keep a copy locked; the move
of runs happens only with the flag `runs` (off, runs stay on the device
as in stage 62, where Log out keeps them).

**The entry chunk**: 31 122 → 31 188 bytes, all of it the preload map's
names of two more chunks (src/runs/cloud-hook.ts, shared by the library
and the runtime, and a split of the run modules): no code. The runtime
chunk (src/cloud/space/runtime.ts, lazy) grew from 19 to 36 kB with the
queue and the fetch adapter; the body's codec is its own 2 kB chunk,
loaded on the first upload or fetch.

**Tests.** tests/unit/cloud-space-runs.test.ts (the adapters, the store,
the library, runCounts and the backup of some runs, the move with a run
changed between copy and removal, and `PageSync` with runs on two devices
over the model: save, remote, fetch, delete everywhere; a run over the
limit saved in play, told once at the game's end, retried with room; the
moved runs newest first, the one that does not fit counted, not told).
e2e on the fake (tests/e2e/cloud-account-fake.ts grew `/api/u/runs`, the
flag `runs`, the model's quota): tests/e2e/sync-runs.spec.ts and
phone-sync-runs.spec.ts. `npm run test:sync-worker` turns `runs` on and
uploads, lists, fetches and deletes a run against the local Worker and R2.

## As built (stage 63 C2)

The views, on branch `stage63-views`, after round 11's picks (1a, 2b,
3a, 4 as drawn, 5 Spotlights and Diary only). Guests and the flag `runs`
off see every view as before (e2e asserts it); the words are one pure
module, src/cloud/runs-words.ts (unit tested), shared by the chrome and
the locked copy's flow.

**History (2b)** (src/chrome/frames/history.tsx): with `runsView().on`
the page reads `cloudRows()` beside the list and gives each session a
mark (`sessionMark`, runs-view.ts): `remote` (some run only in the
cloud; the bytes to fetch), `local` (a saved run `full`, `tooLarge`, or
`queued` after a failed upload or more than 10 minutes, `QUEUED_QUIET_MS`:
a run queued just after its save says nothing), or none (in step,
unsaved). The tag sits in the name's cell on a desktop and ends the first
line of a phone's two-line row; offline it says "in the cloud · needs the
network" (a phone "· offline"), the cloud-only rows go quieter, Run log,
Stats and Export are off, and the flash says "Offline: sessions in the
cloud cannot be opened." (cleared when the network is back). The card
says it under Kept ("not in the cloud: the cloud is full" / "too large
for the cloud" / "not uploaded yet") or Log ("In the cloud · 2.4 MB",
"Fetched when opened" / "Needs the network to open"). The storage line
reads "This device 6.1 MB · Cloud 48 of 50 MB" once the cloud's figures
are known (else today's line). Run log, Stats and Export of a session in
the cloud call `ensureLocal` first from History, with stage 24's bar in
the card (the kit's new `LoadBar`, index.html's 2 px bar and italic line)
and every action held; a failure flashes `notFetchedWords` (now one
sentence per reason). A local session opens as before (no extra tick:
Stats and Export push at once). The page reads the list again on each
change of the view (a sync, the queue).

**"Does not fit" (1a)** (src/chrome/frames/runs-cloud.tsx):
`useDoesNotFit`, mounted once by the start menu (the stack's bottom
frame), drains `takeDoesNotFit` at mount and on each `onDoesNotFit`,
waits while `isPlaying()` (a game or a run log; `onPlaying(false)`
drains again), and pushes the kit's dialog over the page on top, one at
a time, at most once per session per page. "Cloud storage full", "Your
cloud storage is full (49 of 50 MB).", "The run is saved on this
device.", the run's line (name, day, length, body size); Download the
run (the runs backup of that session's runs, `backup(now, {only})`),
Open History (left out while a History frame is in the stack and not
leaving), Keep on this device (primary: Enter; Esc too). Over the start
menu the dialog centres in the screen (a CSS rule on the overlay's slot
when the page under it is the start menu). Other reasons: `storage_full`
"Your account’s storage is full.", `too_many_items` "Your account holds
as many things as it can." (both titled "Cloud storage full"),
`item_too_large` and `tooLarge` titled "Run too large" ("This run is too
large for the cloud (23 MB; at most 20 MB)."). Sizes in the cloud are MiB
written "MB", as the limit (50 MiB is "50 MB"); under 0.1 MB in KB.

**The move's line**: `useMoveLine` flashes "N runs are not in the cloud:
it is full." on the start menu when `notInCloudAfterMove` rises above
the number told before; that number is kept per space in localStorage
(`webcockpit-runs-move-told`), never set back on 0 (the view says 0 until
the queue has looked after a load), so a reload does not say it again.

**Log out (3a)**: `runCounts` also gives `why` ({full, tooLarge,
waiting}) and `cloud` (the space has `runCloud` rows). With runs in the
cloud on (or rows in the space) the runs row is "**N saved runs** not in
the cloud" with "2 cloud full · 1 too large for the cloud · 1 not
uploaded yet" in the changes row's quieter second line; otherwise
today's "on this device only". Download is unchanged (exactly those
runs). The locked copy's Remove list says "N saved runs not in the
cloud" when the copy has `runCloud` rows (`notInAccount().runsCloud`).

**Delete (4)**: `deleteWarning(saved, runsView().on)`: a saved session,
logged in with runs on, "Delete this session? It is deleted on all your
devices and in the cloud."; otherwise today's line.

**The counts (5)**: `CloudCount` in Spotlights' foot (after the summary)
and Diary's (between Previous and Next): the kit's new `cloud` icon,
"N sessions in the cloud are not counted" (`cloudOnlySessions`, counted
again on each view change), and on a desktop (`!device().phone`) a small
Fetch all: `fetchAll` with the bar in the line's place, then the tab
loads again. A phone and a tablet get the line without the button, on a
line of its own. Hidden when N is 0 or runs are off. Nothing in
Statistics. Fetch all has no letter: F is Spotlights' Filter.

**The Exit's run (C1's gap)**: `CaptureStore.sealRun` notes
`runSealed` (src/core/store-events.ts) when the sealed run is saved; the
runtime's listener kicks the upload queue (not a sync). The Exit popup's
run, saved before the game ended and sealed after the game's sync, goes
up at once instead of at the next period sync (unit:
cloud-space-runs.test.ts, which fails without the kick; e2e: the Exit
popup's run is on the fake server within 8 s).

**The kit**: `LoadBar` (look-controls.tsx/css) and the icons `cloud`
and `cloudOff` (round 11's glyph, 16 × 16).

**The entry chunk**: 31 188 → 31 192 bytes (`npx vite build`,
`assets/index-*.js`): the preload map names the small runs-view and
runs-words chunks; no code.

**Tests.** Unit: tests/unit/runs-words.test.ts (every word, the tag's
states, the seal's note), the icon list, cloud-space-runs (the seal).
e2e on the fake: tests/e2e/runs-views.spec.ts (desktop: two devices'
History, offline, the fetch's bar, the delete warning, Diary and
Spotlights with Fetch all, Statistics without; "does not fit" over
History and after an Exit; Log out; the move's line once; a guest and
the flag off as before) and phone-runs-views.spec.ts (the phone's rows,
offline, the counts without Fetch all, "does not fit", Log out, a guest).
`WC_C2_SHOTS=<dir>` saves the pictures compared with round 11's.

## As built (stage 63, review fixes)

Part D's review (an independent one, findings 1–9, and `/code-review`
high, CR1–CR9; CR1 is finding 3, CR3 covers finding 8), on branch
`stage63-fixes`. Each fix has a test that failed before it
(tests/unit/cloud-runs-fixes63.test.ts, one `describe` per finding;
worker/test/runs.test.ts for 7 and CR5). The views and their words are
the owner's picks, unchanged; where a fix shows otherwise it is the
defect going: after finding 4 the move's line names the runs again, after
finding 9 History with runs in the cloud off is stage 62's again, after
finding 2 a restored session is no longer marked as only in the cloud.

- **1. An export doc deleted everywhere while its session was not in the
  account.** A doc is listed once its session's first run is saved here,
  also while that run is `queued`/`full`/`tooLarge`; a device that pulled
  the doc had no run and no row, its sweep dropped the doc, and the
  engine pushed the delete. The sweep now also keeps a doc the account has
  (an agreed `exportDoc` record, `RunStore.syncedDocKeys`). The listing is
  unchanged (a doc goes up with its saved session, as before).
- **2. A restore deleted a run of the account.** A run this device had as
  `remote`, restored from a backup, was listed by neither branch (here,
  but its row not `up`), so the engine pushed its delete. The listing now
  keeps a run here with an agreed record whatever its row (below), and
  `putWholeRun` makes such a run as a fetch does: the item's meta, the row
  `up` (its body is in the cloud), so History does not mark it cloud-only
  and Log out counts it in the cloud.
- **3 (CR1). A run of the account whose upload again ended `full` or
  `tooLarge` was deleted everywhere.** A row put back in the queue
  (`revived`, or its body found gone by the check of the bodies) and then
  refused for room left the list. Now `run` lists a run here once its row
  is `up` **or whenever the account has its item** (an agreed record),
  whatever the row; the model (`MemoryRunSpace`) has the same rule, and
  the generated runs check at every step that no run is deleted in the
  account that no player deleted, with a new step: a run of the account
  whose body is lost, or that is queued again with its body there,
  uploads into an account full to the byte (the old rule fails at once).
  The client's room check before a PUT counts only what a queued row
  grows over the size its body had (`row.size`), as the server counts a
  replace, so a re-upload of the same body is never refused here. A run
  of the account that cannot go up again (`tooLarge` after the body limit
  was lowered) stays the account's item: other devices keep it, a remote
  row of it says "no longer in the cloud" when opened (the generated runs'
  end checks allow just that).
- **4. The move's state lost its runs.** `continueMove` rebuilt the state
  from profiles and scripts: `total.runs`, `runs.saved` and `pending`
  went, so the move's lines lost the runs and a moved run that did not fit
  got the dialog. It keeps the rest of the state now. The line "Moved into
  X: 2 profiles, 4 runs." names the runs again after a move with profiles
  (as decided; before the fix it said only "2 profiles").
- **5. Uploads went on while a game started in another tab.** The game
  lock held elsewhere was looked at once before the queue ran. The
  queue's `isPlaying` may now answer with a promise and is asked before
  each upload; the page asks `gameRunningElsewhere` there.
- **6 (judged real). The move took an unsealed run.** A guest game in
  another tab that was quiet between the copy and the removal passed the
  fingerprint check; its next append found no meta on the device (text
  with no run) and the account held the run cut short. Only sealed runs
  move now; an unsealed one stays the device's (the device's sweep seals
  an orphan). The move's line counts the runs that moved, so it stays
  true.
- **7 (judged real). A DELETE racing a PUT of the same id** (a device's
  Delete of a run whose rating an edit on another device brought back)
  could leave a `run_body` row with no object. After its batch the PUT
  looks for the object (`head`); when it is gone the row and its bytes go
  too and the answer is `503`, so the client puts again. `run_bytes`
  stays the sum of `run_body`, and B1's reservation is unchanged.
- **8 (CR3, judged real).** `checkBodies` now runs under the queue's Web
  Lock (an upload of another tab is never seen half done: it re-queued a
  body that had just gone up). A fetch that finds its row `up` meanwhile
  (another tab fetched it) is fetched, not `not_remote`; a fetch of a run
  this tab is fetching already waits for that one (Fetch all, then the
  open of one of its sessions). `recover()` at load puts back only
  `fetching` rows older than `FETCH_STALE_MS` (15 minutes, longer than
  the longest transfer the adapter allows).
- **9 (judged real). Runs in the cloud turned off after rows were made**
  left cloud-only sessions in History that could not be opened.
  `listSessions(now, {remote: true})` stitches the remote rows in only
  while the run library's hook is set (runs in the cloud on in the page);
  off, History is stage 62's.
- **CR2. Limits assumed.** An upload's or a `quota` answer with no room
  known filled in `DEFAULT_ACCOUNT_LIMITS`, so a server limit above it
  (`RUN_BYTES_LIMIT`, an account's own) was refused here, and a body
  above the default `runMaxBytes` made `tooLarge`. The queue's room is now
  only ever the server's (`setRoom` from a sync's answer or the list's);
  answers update it once it is known; without it the server decides.
- **CR4.** A row refused as an item for its size (`item_too_large`) is
  not uploaded again when there is room (it went up again after each
  sync); it waits as `tooLarge` does.
- **CR5.** When R2's put ended but the request's stream failed, the PUT
  gave the reservation back while R2 held the new object (an old body's
  row then named the wrong size, or an object had no row). That object is
  not trusted now: it goes with its row and bytes, as one of the wrong
  size (`503`).
- **CR6.** The deleted runs' bodies (`RUN_BODY_DELETES`) were taken off in
  a read and a write of two transactions: a Delete stored between them
  was lost and its body stayed. One transaction now (`updateMeta`), and
  only the entries that were done go.
- **CR7.** The sync awaited the runs' network part (body deletes, the
  list of the bodies) and so did Log out's `syncNow`. Now `afterSync`
  awaits only this device's rows (the `revived` runs back in the queue,
  the room), so Log out still counts exactly what is not in the account;
  an item refused for room (`itemRefused`, which deletes a body), the
  bodies of deleted runs, the check of the bodies and the queue go on
  behind it, one after the other (`PageRuns.later`), and not once the
  page stops or Log out pauses it. The scan for new saved runs before
  each queue run (`enqueue`) is left: it is one read of the `runs` store
  off the game path and awaited by nobody.
- **CR8.** One each: the Worker's usage of an account row
  (`accounts.ts usageOf`, used by runs.ts and sync.ts), the agreed keys
  (`agreedIn`, local.ts, used by `runCounts`), and the key range of a
  run's chunks and events (`runRange`, local.ts, used by move.ts and
  spaces.ts; src/runs/store.ts keeps its own, as the run library does not
  import the cloud's space code).
- **CR9.** `DoesNotFit.where`, the page's `where` map and the hook's
  `SaveWhere` went (the dialog never read them; it shows over the page on
  top, as round 11's pick 1a was accepted); the page keeps the set of runs
  it was asked to save (a moved run saved again is told). The unused
  `PageRuns.offs` and `RunQueue.dropBody` went.

**The entry chunk**: 31 192 bytes, unchanged.
