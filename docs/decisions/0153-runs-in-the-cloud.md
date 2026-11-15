# 0153 — Runs in the cloud

- Status: Accepted (technical; stage 63). The points a player sees
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
