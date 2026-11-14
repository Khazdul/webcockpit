# 0150 — The two spaces in the browser

- Status: Accepted (technical; stage 61). Part B1 built (see "As built (stage 61 B1)").
- Date: 2026-11-14
- Related: ADR 0146 and its addendum (the two spaces, the owner's
  rule), ADR 0145 (keys, `webcockpit-account`), ADR 0006 (IndexedDB),
  ADR 0025 (superseded database), spec §7.0 rule 7, §7.4,
  `docs/stages/61-sync-profiles-scripts.md`.

## Context

The owner's rule (2026-11-14): logged out the player sees the device's
things, logged in the account's, never a mixture. ADR 0146's addendum
asked stage 61 to confirm how the spaces are laid out in the browser.

Today every store of the player's things is in one IndexedDB database,
`webcockpit` (version 8), and every module opens it through one
function, `openWebcockpitDb` (`src/core/db.ts`): the capture and run
stores, settings, profiles, scripts, the panes' context and the map
worker's id table. Several of them cache their connection and their
records for the page's life (the profile store, the script library,
the settings store).

## Decision

### A database per space

- **The device's space** is today's database, `webcockpit`, untouched
  by account code.
- **An account's space** is a database of its own,
  `webcockpit-u-<nameKey>` (`nameKey`: the account name in lower case,
  as the server's `name_key`; names are fixed and never reused, ADR
  0145). It is made at login or Create account and deleted at log out.
- **One schema for both.** The upgrade chain of `src/core/db.ts`
  builds every space's database; version 9 adds `id` to profile
  records (filled at the upgrade, kept on rename) and the stores
  `sync` and `syncMeta`. In the device's database `sync` and
  `syncMeta` stay empty. One chain means one set of upgrade tests and
  no store that exists in one space and not the other.
- **"This device, always"** (ADR 0146 addendum: the imported map,
  uploaded tilesets, the locator's ids) is read from the device's
  database whatever space is current: the map module and the map
  worker open `webcockpit` by name, never the current space. Their
  stores exist, empty, in an account's database.
- The keys stay where stage 60 put them (`webcockpit-account`).

### The current space

- `src/core/space.ts` decides the current space once, when the page
  loads, from the account hint (`wc.account`, ADR 0145 as built) and a
  space record in `localStorage` (`wc.space`: the account's `nameKey`
  and its state, `open` or `locked`). `openWebcockpitDb()` opens the
  current space's database; `openDeviceDb()` opens `webcockpit`.
- **Every reader asks `openWebcockpitDb()`,** as today, so no store
  module learns about accounts. A test checks that nothing else in
  `src/` calls `indexedDB.open`.
- `localStorage` keys that belong to a space (the automatic MUME login,
  ADR 0141) are prefixed per space by a helper; the device's keep
  their names. `webcockpit.appearance` (first paint) stays one key:
  it is rewritten when the space changes (stage 62 syncs settings).

### A change of space reloads the page

Login, Create account, log out, a lost session and Delete account
change the space by writing `wc.space` and reloading the page to the
start menu, with the message to show carried in `sessionStorage`
(read once, then removed). The start page skips its opening (the
wordmark and the morph) on such a load.

- Every cached connection, profile, script and setting is then read
  from the new space by construction. Switching in place would need
  every store, the panes and the editors to drop their caches in the
  right order, and one missed cache is a mixture.
- The cost is a reload of about a second on the start page. The game
  is never running in the tab that changes space (the account pages
  are reached from the start menu).

### Other tabs

- A tab follows the space through the `storage` event of `wc.space`:
  on the start page or a menu page it reloads; in a game it plays on
  and reloads when it is back on the start page.
- A tab in a game holds the Web Lock `webcockpit-game@<space>`. Log
  out and Delete account ask `navigator.locks.query()` and are
  refused while another tab holds the lock of the account's space
  (spec §7.4, Log out 5). Deleting a database closes every connection
  to it (`versionchange`), so a game must never be running on it.
- A login while another tab plays as a guest is allowed: the guest's
  game writes to `webcockpit`, which the login does not touch.

### The locked copy

A lost session with something not in the account (ADR 0146 addendum)
keeps `webcockpit-u-<nameKey>` and sets `wc.space` to `locked`; the
page is then in the device's space. A login to the same account opens
the database again and syncs; a login to another account makes its own
database and leaves the locked one alone (one locked copy at a time is
kept in `wc.space`; a second lost session while one is locked keeps
both databases, the record lists both). Remove deletes the database.
The data key is gone with the session, so nothing is encrypted at rest
(said to the owner, 2026-11-14).

### Superseded

ADR 0025's superseded state holds per database: a newer tab that
upgrades the account's database supersedes an older tab on it as it
does on `webcockpit` today.

## Alternatives

- **One database with a space column or key prefix in every store.**
  Every query and index would need the space, and a forgotten filter
  shows a mixture. Log out would be a scan and delete instead of one
  `deleteDatabase`.
- **Switching space in place,** without a reload: see above.
- **The account's space only for synced kinds,** the rest shared.
  That is the mixture the rule forbids (runs, Comm history).

## Consequences

- Every store is per space from stage 61, also the kinds that start
  to sync in stages 62 and 63. Until then, on staging, settings in an
  account's space start as a copy of the device's at login, and runs,
  Comm history and timers played while logged in stay in the
  account's space and go at log out (the Log out dialog lists the
  runs). Accounts are off in production until stage 63, so no player
  meets that.
- The device's database gets version 9 with the first release after
  stage 61 is merged, whatever the flags: profile ids and two empty
  stores. Upgrade tests cover a version 8 database with profiles.
- The account name appears in a database name on the device, as it
  already does in `localStorage`.

## As built (stage 61 B1)

Branch `stage61-spaces`. What differs from, or adds to, the decision:

- **`src/core/space.ts`** decides the space from `wc.space` alone
  (`{nameKey, state}`; absent, unreadable or `locked`: the device's).
  The account hint `wc.account` is not read: part C writes both and
  reconciles a hint without a record. `nameKey` must match
  `^[a-z0-9_-]{3,20}$`, so a record can never name the device's
  database. The record may carry `locked: [nameKey…]`, the further
  locked copies kept (`lockedCopies()` lists all of them).
- **`openDeviceDb` lives in `src/core/db.ts`**, beside
  `openWebcockpitDb(factory, name = the current space's)`, not in
  `space.ts`: `db.ts` imports `space.ts`, and the other way round would
  be a cycle. `space.ts` imports nothing; `deleteSpaceDb(nameKey)`
  refuses anything that is not a name key.
- **Version 9** fills `id` (`crypto.randomUUID`) with a cursor in the
  upgrade; `profiles` keeps its keyPath `name`. A rename was already a
  put of the same record under the new name and a delete of the old,
  so the id moves with it; it now says so and gives an id to a record
  that somehow has none. `sync` has keyPath `['kind', 'key']`,
  `syncMeta` out-of-line keys.
- **The map** (`maps` through the shell's `MapStore`, `lazyDb(_, {
  device: true })`) and the worker's `mapIds` open `webcockpit`. There
  are no uploaded tilesets today (the tileset choice is a setting;
  `map-tile-upload` is the GPU upload), so nothing else moved.
- **The automatic MUME login** (ADR 0141) is held in the page's memory
  only, never in storage, so there is nothing to key per space: a
  change of space reloads the page and wipes it. `spaceStorageKey(key)`
  (`key@u-<nameKey>` in an account's space) is there for the first key
  that needs it.
- **The game lock** is `webcockpit-game@device` or
  `webcockpit-game@u-<nameKey>`, requested in `shared` mode (two game
  tabs of one space both hold it) from the live cockpit becoming the
  view until the start page shows again (`Shell.showCockpit` /
  `showStart`; not in the offline modes). `gameRunningElsewhere(space)`
  counts the holders minus this page's own; false without Web Locks.
- **Other tabs:** the shell listens (`followSpace`) and reloads to the
  start menu (`location.replace(pathname)`) when the record now puts
  the page in another space; a write that keeps the space (a copy
  locked) is ignored. In the cockpit it waits and reloads when the
  start page would show. A log player or History page over the start
  page counts as the start page (it reloads).
- **The opening skipped:** `switchSpace(record, message)` puts the
  message in `sessionStorage` `wc.space.message`; on a load that
  carries one, the first boot's reveal runs without its fade
  (`revealStart(…, { instant })`). `takeSpaceMessage()` reads it once;
  showing it on the start menu's message line is part C.
- **Tests:** `tests/unit/spaces.test.ts` (the record, the switch and
  the message, following another tab, the lock, a database per space,
  the version 8 → 9 upgrade with profiles, ids kept by a rename, and a
  scan of `src/` that only `src/core/db.ts` opens and only
  `src/core/space.ts` deletes a database; `src/cloud/account/store.ts`
  is allowed both for the keys' own database `webcockpit-account`, ADR
  0145, which is not a space). e2e `tests/e2e/spaces.spec.ts`; the test
  hook is `wc.space` set before the load.
- Entry chunk 30 201 → 30 513 bytes (the shell's follow, lock and
  instant reveal; `space.ts` itself lands in the shared `db` chunk).

## As built (stage 61 C)

Branch `stage61-flows`. The flows that change space are
`src/cloud/space/flows.ts`; what differs from, or adds to, the decision:

- **The spaces follow the flag `sync`.** With it on, Log in, Recovery and
  Create account change space; with it off the account pages are stage
  60's (nothing moves, nobody changes space), except that a page already
  in an account's space still leaves it at Log out and Delete account.
- **A login never reuses a database it did not lock.** Log in to an
  account whose copy is not in the record's locked list deletes any
  `webcockpit-u-<nameKey>` left over (a log out whose delete was blocked)
  before it makes the space: stale sync records over an empty space would
  push deletes. A locked copy of the same account is opened as it is.
- **Making the space** seeds it as a new device (the seeds' fixed ids,
  ADR 0151 as built C), copies the device's `settings` store when the
  space has none, and writes `syncMeta.account` (`{name, nameKey}`: the
  name as the server spells it, for the messages after the keys are
  gone) and `syncMeta.deviceLabel`.
- **Reconcile (B1's note):** at load, keys stored while the page is in
  the device's space (a login whose change of space did not happen, or an
  account made here and reloaded before its recovery code was confirmed:
  `wc.space.created` in localStorage) are put in their space then.
- **The locked copy** is decided from the stores without the keys (they
  go with the session): a local item by local key against its sync
  record (the engine's `unsynced()` rules), plus every saved run (no run
  is in the cloud before stage 63). The notice's counts are read from the
  locked database when the start menu shows. Remove deletes it and
  writes the record without it; the page stays where it is.
- **`reloadToStart`** keeps `?cloudtest` on the dev server, so the e2e
  specs' pages may still call the API after a change of space.
- Dropping a space closes this page's connection first and gives up
  waiting for `deleteDatabase` after 4 s (a connection that never closes;
  the next login deletes the leftover).
