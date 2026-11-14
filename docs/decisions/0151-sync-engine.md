# 0151 — The sync engine

- Status: Accepted (technical; stage 61). Built in part B3; the
  adapters and triggers are part C.
- Date: 2026-11-14
- Related: ADR 0146 and its addendum (the sync model), ADR 0145 (keys,
  blob format, opaque ids), ADR 0150 (the spaces), spec §7.3–7.4,
  `shared/cloud/api.ts` ("// --- Sync"),
  `docs/stages/61-sync-profiles-scripts.md`.

## Context

ADR 0146 decided what syncs and how conflicts end; spec §7.4 lists the
engine's steps; `shared/cloud/api.ts` is the server's contract. Left
open for stage 61: the bodies inside the blobs, the hash that finds
local changes, the device label and the keep-both name, the back-off,
the states, and how the engine reaches IndexedDB and the network
without being tied to either.

## Decision

### The module

`src/cloud/sync/`, loaded with `import()` like `src/cloud/crypto`:

| File | What |
|---|---|
| `types.ts` | the items, the ports, the events, the status |
| `items.ts` | bodies, canonical encoding, hashes, names, device label, copy keys (pure) |
| `codec.ts` | blob in and out (`seal`/`open` of ADR 0145), opaque ids |
| `engine.ts` | `SyncEngine`: steps 2–7 of spec §7.4 |
| `status.ts` | `Observable`, `backoffMs` |
| `lock.ts` | `webSyncLock()` (Web Lock `webcockpit-sync`), `noLock` |

No DOM, no IndexedDB, no fetch: all through the ports below.

### Items

- **Bodies.** A profile is `{id, name, text, created, modified}`, a
  script `{id, name, source, enabled, created, updated}`: the stores'
  records (the profile with its v9 `id`). The blob's plaintext is the
  UTF-8 of the canonical JSON (keys sorted, no whitespace) of the
  record with `v`, the body's format version per kind (1 for both).
- **A newer `v`** (or a blob version this client does not know, or a
  kind it has no format for) is refused, never damaged: the version is
  kept as its blob in the item's record (`state: "newer"`), the local
  item is left untouched and not pushed, the state says "update the
  client". Every sync tries such blobs again, so an updated client
  reads them without a full pull. A field is never added without
  raising `v` (an older reader drops what it does not know).
- **Unreadable:** a blob that does not open (wrong key, kind or id,
  changed bytes), a body that is not the kind's shape, or a body whose
  key does not give the item's server id (an item written under
  another's id). Kept and left alone like `newer`, with an event.
- **Hashes.** `hash = base64url(SHA-256(kind | "\n" | canonicalJson(record)))`
  (without `v`, so raising a version does not make every item look
  edited), and `bare`, the same over the record without its name. The
  record keeps both for the version last agreed with the server. A
  local change is found by comparing hashes at sync time (ADR 0146): a
  missed store event cannot lose one.
- **Opaque ids.** `opaqueId(idKey, kind, localKey)`, the local key
  being the profile or script `id`, so a rename keeps the item and its
  server id. The blob's associated data is `kind | serverId`.

### What "changed" means

- *Dirty:* the local hash differs from the record's (or there is no
  record).
- *Edited:* dirty in more than the name (`bare` differs). A player's
  rename is an edit, since the stores move `modified`/`updated` on a
  rename. The engine's own renames (the names pass, below) move only
  the name; such a rename gives way to an edit or a delete from
  elsewhere instead of making a keep-both copy of old content or
  reviving a deleted item (the generated tests found this).

### Resolving one item

| Local | Remote (pulled) | Result |
|---|---|---|
| any | nothing new | push if dirty (base: the record's rev) |
| unchanged | changed | take the remote |
| unchanged or renamed by the engine | deleted | delete locally |
| edited | deleted | **an edit beats a delete:** push the local version on the tombstone's rev (it comes back to life) |
| deleted | edited | **an edit beats a delete:** take the remote (event `restored`) |
| deleted | renamed by the engine | the delete wins: push it |
| equal to the remote | changed | adopt (no write) |
| renamed by the engine | edited | the remote, with the local name |
| edited | renamed by the engine | the local, with the remote name; push |
| edited | edited | per kind (below) |

**Per kind:** `KindSpec.policy`. `keepBoth` for `profile` and
`script`: the server's version keeps the id and the name; the local
version becomes a new item, its times kept, named as below, with the
event `keptBoth` naming both. `lastWriter` (for the small kinds of
stages 62–63): the local version is pushed on the remote's rev and wins
whole.

**The copy's key** is a UUID made from SHA-256 of (kind, key, the rev
it lost to, the local hash): a sync cut off after its local batch and
run again makes the same copy, not a second one.

### Names

The profile and script stores require unique names. After resolving,
the engine checks the kind's planned state: of items with one name, an
item in use (or unreadable) keeps it, then one equal to its server
version (a pulled name beats a local new or renamed one), then the
lowest server id, so every device settles a collision the same way.
The others get `freeName`: `_2`, `_3` … (the stores' own rule), event
`renamed`, pushed like any change.

### Device label and keep-both name

- **Label** (`syncDeviceLabel(type, browser)`, stored in `syncMeta`
  at login): `phone`, `tablet` (a player rarely has two), or
  `desktop, Firefox` (desktops told apart by browser; `desktop` when
  the browser has no name).
- **Keep-both name:** spec §7.4 says `<name> (from <device>, <date>)`,
  but today's name rules allow no spaces, brackets or commas
  (profiles: a letter, then `A-Z a-z 0-9 _`, at most 32; scripts also
  `-`). The engine writes the same words under the rules:
  `warrior_from_phone_14Nov`, `warrior_from_Firefox_14Nov` (the
  label's last word; the local date, `14 Nov`). The name is cut to
  make room, never the device or the date; then `freeName`. The
  notice's text can still say "warrior (from phone, 14 Nov)" from the
  event. One function (`keepBothName`) changes if the owner wants the
  spec's form and the name rules are widened.

### In use

`InUse.keys(kind)` is asked once per round. Nothing is written into an
item in use: a pulled change or delete, a keep-both conflict, and a
rename of the names pass all wait (`state: "held"`, the pulled version
kept in the record) and are taken in at the first sync where the item
is free. Local changes to an item in use are pushed as usual.

### One sync

Under the lock, up to three rounds of: pull every page
(`changes?since=<cursor>`, the cursor stored after each page, after
the records of that page); scan and resolve every kind; the local
batch per kind (one atomic write), then the records, then the pushes,
one at a time with the base rev. A `409` stores the current item as
the record's remote version and makes another round. After three
rounds with a `409`: outcome `busy`, back-off. A sync asked for while
one runs in the tab runs once more when it ends.

The order makes every cut-off safe: a local batch without its records
is found again as "equal to the remote" (adopt); records without a
push are dirty again; a push without its record answers `409` with
this device's own content (adopt).

### Errors and back-off

| What | Outcome | State |
|---|---|---|
| no answer | `offline`, `retryAt` | `offline` |
| `5xx`, `429` | `server`, `retryAt` | `offline` |
| another `4xx`, a body not the contract's | `refused`, `retryAt` | `offline` |
| `413` on a push | the item stays local, record `full`, retried every sync; event `full` once | `full` |
| `401 session_ended` / `not_logged_in` | `session_ended` with the reason (null for `not_logged_in`) | `offline` |
| a local port fails | the promise rejects | `offline` |

Back-off: 5 s, 15 s, 30 s, 1 min, 2 min, then every 5 min, ±20 %
jitter, reset by a sync that ends. The engine only says when
(`retryAt`); the caller keeps the timer.

### State

`SyncStatus` on `engine.status` (an `Observable`):
`state` (`synced | syncing | offline | full | update`; `full` and
`update` are spec's "needs attention"), `waiting` (local changes not in
the account), `held` (pulled changes waiting for the game), 
`lastSynced`, `retryAt`, `full` (the 413 code), `usage`, `limits`.
`engine.unsynced()` lists the local changes not in the account from the
stores alone (Log out's list, the locked copy's decision).

### Ports

```ts
LocalItems  { list(kind): Promise<{key, body}[]>;
              write(kind, {put: Body[], remove: key[]}): Promise<void> }   // atomic; names unique after, not per step
SyncRecords { list(): Promise<SyncRecord[]>;
              write({put: SyncRecord[], remove: {kind, serverId}[]}): Promise<void>;
              meta(): Promise<{cursor, deviceLabel, lastSynced}>;
              setMeta({cursor?, lastSynced?}): Promise<void> }
Remote      { changes(since, limit?): Promise<SyncChanges>;
              put(kind, id, baseRev, blob): Promise<WriteResult>;
              remove(kind, id, baseRev): Promise<WriteResult> }             // 200/409/413 are results; the rest throws RemoteError
Clock       { now(): number }
InUse       { keys(kind): ReadonlySet<key> | Promise<…> }
EventSink   { emit(event: SyncEvent): void }
SyncLock    { run(fn): Promise<T> }
SyncKeys    { dataKey, idKey }
```

`SyncRecord` (one row of the `sync` store, keyed by `kind` +
`serverId`): `kind, serverId, key, name, rev, hash, bare, state,
remote?, full?`. `state`: `synced | held | newer | unreadable | full`.

### What part C provides

- The IndexedDB adapters of `LocalItems` and `SyncRecords` on the
  current space. `write` applies the whole batch in one transaction and
  removes before it puts, so two items swapping names never trip a
  unique key or index on the way. Scripts: user scripts only. The adapter tells the
  profile store and the script library to drop their caches.
- The fetch adapter of `Remote`: `If-Match`, the blob as
  `application/octet-stream`, base64url in `changes`; map `401`
  bodies to `session_ended`/`not_logged_in`, `5xx`/`429` to `server`,
  a network failure to `offline`.
- `InUse` from the game (the active profile's id, the enabled scripts'
  ids, while a session plays), `webSyncLock()`, the triggers and the
  `retryAt` timer, the notices from the events, the device label in
  `syncMeta` at login.
- **Seeds in an account's space:** `default` and `khazdul` must not be
  seeded with a random id and the time of seeding on every device: each
  device would then hold its own `default`, and the names pass would
  make `default_2`. Seed nothing in an account's space before its first
  sync, and only what the account then lacks; or seed with fixed ids
  and times.

### Tests

`tests/unit/cloud-sync-model.ts` is an in-memory model of the contract
(rev, seq, tombstones, `409` with `current`, a missing item as a
tombstone of rev 0, limits, paging, `401`), with in-memory ports that
refuse a batch leaving two names alike or a name against the rules.
Unit tests per step (`cloud-sync-engine.test.ts`,
`cloud-sync-items.test.ts`); generated runs
(`cloud-sync-property.test.ts`, seeded mulberry32, `SYNC_SEED`,
`SYNC_SCALE`): two and three devices, random creates, edits, renames,
deletes, toggles, offline, play, 5xx, a storage limit, small pages and
another device's sync slipped in between a pull and a push. After two
passes everybody is `synced`, a third writes nothing, all devices and
the server hold the same items, every version a player wrote that no
player overwrote or deleted after seeing it is there exactly once, and
nothing else is. 420 runs (36 000 steps) in about 6 s; longer hunts
passed at `SYNC_SCALE=25` (10 000 runs, 700 000 steps) and, with the
small pages, at 10 (4 200 runs, 360 000 steps). A changed rule (a
delete beating an edit, no keep-both copy) fails them at once.

## Alternatives

- **Keep pulled changes out of the records and not move the cursor
  past them** while an item is in use: one waiting item would make
  every sync pull everything after it again.
- **Store the base body** instead of two hashes, to merge field by
  field: more storage and more code for a case (both sides editing one
  profile) ADR 0146 settles with keep both.
- **Let the stores rename on a name collision:** each device would
  rename differently, and the renames would conflict with each other.
- **The adapters refuse unknown kinds** instead of the engine keeping
  their blobs: an older client would lose them on its next sync.

## Consequences

- The keep-both name differs from spec §7.4's wording until the owner
  decides (the name rules or the wording).
- A name collision (two devices make a profile of one name offline)
  renames the later one to `_2` with a notice; rare, and nothing is
  lost.
- The contract needs to say what `409` carries for a missing item
  (here: a tombstone of rev 0), that a `PUT` on a tombstone with its
  rev brings the item back, whether tombstones count against the
  2 000 items (here: no), and which of `409` and `413` comes first
  (here: `409`). Part B2 and the contract agree on these before part C.

## As built (stage 61 C)

Branch `stage61-flows`. Part C's code is `src/cloud/space/` (loaded with
`import()`), `src/cloud/sync-view.ts` (what the start menu and the
Account page read; in the chrome chunk) and `src/core/store-events.ts`.

- **The `sync` store's rows** are `{kind, key: serverId, rec}`: the
  store's keyPath `['kind', 'key']` (B1) is filled with the server id,
  since the engine keys its records by server id and a record's local key
  may be null.
- **Seeds:** `default` and `khazdul` are seeded with fixed ids
  (`seed-default`, `seed-khazdul`) and a fixed time (`SEED_TIME`) on every
  device and in every account's space; the version 9 upgrade gives the
  existing seeds those ids (unreleased, so no device has random ones but
  dev and staging). An *untouched* seed (a seed's name and its text,
  `src/profiles/seeds.ts`) is no item until it has a sync record:
  `LocalItems.list` leaves it out, the move leaves it on the device, and a
  pulled item of its name replaces it (the profile store is keyed by
  name). An edited seed is one item for the whole account.
- **Script names:** when the sync gives a script another name (keep both,
  a collision), the adapter rewrites the header's `@name` too, so a later
  save does not rename it back; the rewrite is pushed by the next sync as
  an edit (one extra write).
- **Keep both's mark** ("kept both", profiles only) is a list of profile
  ids in localStorage per space (`wc.keptBoth`), cleared when the copy is
  opened or renamed. The notice's text uses `keepBothName` as it is.
- **In use** during play: the selected profile's id (by its name in the
  settings) and the enabled user scripts' ids; "playing" is the start
  page hidden (`setPlaying`, src/chrome/index.tsx).
- **Triggers** as the decision says; the 5 s after a change come from
  `noteStored` (the profile store after a write, the script library after
  a write of the `scripts` store); the runtime's own writes do not note.
  After a failed sync the runtime counts what waits (`unsynced()`) for the
  Account page and Log out, since the engine stops before it counts.
- **`session_ended`** (sync or any account call): the account client's
  `ApiFailure` carries the reason; the flows log the device out and hand
  the reason to the space flows (`sessionLost`), and the pages still get
  `unauthorized`. A lost session during play waits for the start page.
- **The Remote over fetch** gives up after 20 s (`offline`).
- **The contract's missing item** is now the Worker's too: `409` with a
  tombstone of rev 0, a conflict before a `413` (ADR 0146 as built C).
