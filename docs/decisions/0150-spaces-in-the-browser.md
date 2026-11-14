# 0150 — The two spaces in the browser

- Status: Accepted (technical; stage 61). Not built.
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
