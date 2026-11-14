# 0146 — The sync model

- Status: Accepted (owner, 2026-11-13: profiles, scripts and saved runs
  always follow the account; settings follow per device type; runs have
  a storage limit and the player is offered a download when it is
  full; no version history). Not built.
- Date: 2026-11-13
- Related: intent Goal 13, spec §7.4–7.5, ADR 0145, ADR 0006,
  `notes/research/cloud-data-inventory.md`.

## Context

Every device keeps working from its own IndexedDB, with or without a
link to the server. The server cannot read the data (ADR 0145), so it
cannot merge. Today's stores have no revisions, profiles are keyed by
name, and all settings are one record shared by desktop, tablet and
phone layouts.

## Decision

### Owner's decisions

- Synced: profiles, scripts with their data, settings, saved runs.
- **Settings are kept per device type:** one set for desktops, one for
  tablets, one for phones. Two desktops share look and layout; a phone
  never overwrites a desktop's.
- **Runs:** a per-account limit. When a run does not fit, the player
  is offered to download it instead.
- No version history in the cloud.

### Local first

- IndexedDB stays the source the client plays from. Sync copies
  between it and the server in the background. No sync call is ever
  awaited in the path of a key press or a line of game text;
  encryption and compression run in a Web Worker.
- Logged out, the client is exactly today's client.

### Items

The server stores opaque items:

```
item(account, kind, id, rev, seq, deleted, size, updated, blob)
```

- `rev` counts the item's versions; `seq` is the account's change
  counter, set by the server on every write.
- **Pull:** `GET /api/u/sync/changes?since=<seq>` returns the items
  changed since the client's cursor.
- **Push:** `PUT /api/u/sync/items/<kind>/<id>` with the `rev` the change
  is based on. A stale base gets `409` and the current item.
- A delete is a tombstone (`deleted`, no blob), kept for good so a
  device that was away a year still learns of it.

| Kind | One item per | Body | On a conflict |
|---|---|---|---|
| `profile` | profile | name, text, times | keep both |
| `script` | user script | name, source, enabled, times | keep both |
| `scriptData` | script name | settings, store | last writer |
| `settings` | device type (`desktop`, `tablet`, `phone`) | the settings record | last writer |
| `run` | saved run | meta (rating, summary, sizes); the body is in R2 | last writer |
| `exportDoc` | session | cuts and comments | last writer |

- **Keep both:** when the same profile or script changed on two
  devices between syncs, the server's version takes the name and the
  local one is kept beside it as `<name> (from <device>, <date>)`,
  with a notice. Nothing a player wrote is dropped silently. An edit
  beats a delete.
- **Last writer:** the later push wins whole. Accepted for small state
  that one device at a time writes in practice.
- The `settings` item's id is the device type in clear; the server may
  know that a phone was used.

### Local changes for it (IndexedDB version 9)

- `ProfileRecord` gets a stable `id`; a rename keeps it (today a
  rename is delete and create).
- A `sync` store: per local item its server id, the `rev` and content
  hash last synced; plus the account, the cursor and this device's
  label.
- What changed locally is found by comparing content hashes with the
  last synced ones at sync time. Store change events only hasten the
  next sync (5 s after the last change). So a missed event cannot lose
  a change.
- Settings: the device type is the one device detection already
  decides. A tablet that runs "Desktop site" still syncs as a tablet.

### When sync runs

- At login, at page load, when the start page is shown, when the tab
  becomes visible, 5 s after a local change, and every 5 minutes on
  the start page.
- **During play, changes are pushed but not applied.** A pulled change
  to the profile, the scripts or the settings in use waits until the
  player is back on the start page. A profile is never swapped under a
  fight.
- Several tabs: one tab at a time syncs (a Web Lock); the others see
  the result through IndexedDB as they do today.
- Offline or a server error: quiet retry with back-off; a small state
  mark on the start page (in step, syncing, offline, needs attention).

### The first sync on a device that already has data

1. A local safety copy is taken first: the profiles and the scripts
   backup, kept in a `preSync` store and offered as files on the
   Account page. It is replaced at the next first sync, not a history.
2. Local and server items of the same kind and name with identical
   content are linked.
3. Same name, different content: both kept, the local one renamed
   `<name> (this device)`.
4. The seeded `default` and `khazdul` profiles, if untouched, give way
   to the account's.
5. Settings: if the account has settings for this device type, the
   player chooses once: the account's, or this device's.
6. Saved runs: local ones are uploaded while there is room, oldest
   last; the account's are listed (see below).

### Runs

- **Only saved runs sync.** Unsaved runs stay on the device and are
  swept after 14 days as today.
- A run body is the run's meta, events and chunks in the backup's
  JSONL form, gzip, encrypted in segments, one R2 object, uploaded
  through the Worker. Limit 20 MB per run body.
- **Limit:** 50 MB per account to begin with (owner, 2026-11-13: keep
  it low at first, with margin), for run bodies and publications
  together, counted as stored (compressed, encrypted). A played hour
  is estimated at about 0.2 MB compressed (not measured; stage 63
  measures it on real runs before the limit is fixed), which would
  make 50 MB some 250 hours of saved runs. 100 accounts filled to the
  limit are 5 GB, half of R2's free 10 GB. The limit is a server
  setting: the owner raises it for everybody or for one account
  without a release.
- **When a save does not fit** (in the Exit popup's save, or Save in
  History): the run is saved on the device as always, and a dialog
  says the cloud is full (`used / limit`) with three choices: Download
  the run as a file, Open History to make room, Keep it on this device
  only. A device-only run carries a mark in History and is retried
  when there is room.
- **On other devices** the run appears in History from its meta. The
  body is fetched when the run is opened (player, export editor,
  statistics that need the log) and is then kept on the device. A
  phone does not download a library by itself.
- Removing the save, or deleting the run, removes it from the cloud
  for every device (after the usual confirmation, which now says so).
- Statistics, Spotlights and Credits read the meta's summary where
  that is enough; where they need events, they count the runs present
  on the device and say when cloud-only runs are left out.

### Not synced

Comm history, timers state, the imported map, unsaved runs, the
conveniences in `localStorage`. They are per device by nature or too
large for their worth.

## Alternatives

- **One settings set for all devices.** Simplest, but a font size
  chosen on a laptop would follow to the large screen, and the phone
  and desktop start from different defaults.
- **Field-level merge of settings and script data.** Fewer lost
  changes in the rare double edit, a great deal more code. Not now.
- **CRDTs or operation logs.** Out of proportion for text files a
  single player edits on one device at a time.
- **Sync every run.** The rolling 14 days of unsaved logs would fill
  the limit with what the player chose not to keep.

## Consequences

- The server needs no knowledge of the data's shape; schema changes
  stay client matters. The settings and backup formats' own version
  fields travel inside the blobs, and an older client must refuse,
  not damage, an item from a newer one (it keeps the item untouched
  and shows the update notice).
- "Keep both" can leave a duplicate profile to tidy up by hand. That
  is the price of never losing an edit without version history.
- The riskiest code of the whole plan is here. Stage 61 ships behind
  the server flag, with property tests of the sync engine against a
  model, and the owner's two-device test before it is opened.

## Addendum (owner, 2026-11-14; not built): two spaces, the move, log out

Decided in the session on the start menu, the account and the
community (`notes/start-menu-decisions.md`, points 1–5 and 12), after
the owner had seen stage 60 on staging. It replaces parts of the
decision above; spec §7.4 and §7.5 carry the full text.

### What changes

The model above was *one set of things on the device, which the
account keeps in step*: a first sync merged, and log out asked whether
the data stayed. The owner's rule is instead:

> Logged out you see the device's things, logged in the account's,
> never a mixture.

- **Two spaces on a device:** the device's space (what a guest has,
  today's data) and, while logged in, the account's space (the
  account's copy). Everything that reads profiles, scripts, script
  data, settings, runs, export docs, Comm history and timers reads the
  current space.
- **The move happens at Create account and only there.** The device's
  own things move into the new, empty account, automatically and
  without a question. Untouched seeds and bundled scripts do not
  move. The device's copy of a thing is removed when the server has
  taken it.
- **A login to an existing account moves nothing and asks nothing.**
  The exception: settings for a device type the account has none for
  start as a copy of the device's.
- **Log out always removes the account's copy.** It syncs first; what
  is not in the account is listed, with Stay logged in, Download and
  Log out anyway; it is refused while a game runs in another tab.
- **A lost session** keeps the account's copy *locked* when it holds
  something that is not in the account, and removes it otherwise. A
  login to the same account unlocks it.
- **Delete account** hands the account's things back to the device it
  is done on.
- **A third, small category is the device's whoever is logged in:**
  the imported map and tilesets, the locator's ids, the statistics
  device id, the update state, the last used account name.
- **Comm history and timers state sync** (they were under "Not
  synced"). Kinds `comm` (pieces per day, merged by record) and
  `timers` (one item per character, last writer), pushed also when
  the game is left, when the tab is hidden and every 5 minutes of
  play. The automatic MUME login and unsaved runs still never leave
  the device; they belong to the space and go at log out.
- **Runs.** Logged in, all runs are in the account's space on the
  device. At Create account all the device's runs move there and the
  saved ones upload newest first. A saved run that does not fit keeps
  a mark "not in the cloud" and is listed at log out. No shelf of
  runs survives a log out. Published runs no longer count against the
  50 MB (ADR 0148, addendum).

### What goes from the decision above

- "The first sync on a device that already has data": all six steps.
  No safety copy (`preSync`), no linking by name, no "<name> (this
  device)", no settings choice, no first-sync page.
- Log out's "keep (default) or remove".
- "Logged out, the client is exactly today's client" still holds, and
  now also in the sense that an account never touches a guest's data.

### What stays

The items, `rev` and `seq`, pull and push, tombstones, hashes, the
sync lock, "pushed but not applied during play", keep both for
profiles and scripts changed on two devices *of one account*, last
writer for the small kinds, settings per device type, only saved runs
in the cloud, the limits.

### Why

- It answers "whose things am I looking at?", which the merge model
  could not, and the start menu's owner row shows the answer (ADR
  0149).
- A shared or borrowed computer is clean by construction: nothing of
  the account is left behind, and nothing of the device's owner is
  taken along.
- Moving only into an empty account removes every merge case of a
  first sync: no name can exist on both sides.

### Alternatives turned down

- **A question at login** ("move this device's things to <name>?")
  when the device has own things. The session's proposal; the owner
  chose no move at all at login. Simpler, and a borrowed computer
  cannot go wrong.
- **A "this device" shelf** for runs that are not in the cloud,
  surviving log out. It is the mixture the rule forbids.
- **Opening accounts after stage 61.** With only profiles and scripts
  synced, runs and settings would be a mixture or be lost at log out.

### Consequences

- Stage 61 grows: the spaces come before the engine. The intended
  form is a database per space in the browser (the device's is
  today's; an account's is made at login and deleted at log out), so
  log out is a database delete and a guest's data is never opened by
  account code. Stage 61 confirms it in an ADR of its own.
- A player with things on two devices brings the second device's into
  the account by hand (export logged out, import logged in). A "move
  this device's things" row on the Account page can be added later
  without changing the model (spec §7.13).
- An account holds less than a device does (50 MB of runs). A
  long-time player can hit the limit at Create account; nothing is
  lost, the runs stay on the device with the mark, and the owner sets
  the limit after stage 63's measurement.
- Other players' tells are stored in the cloud, encrypted. The
  registration's points and `/privacy` say so.
- Accounts open in production after stage 63, in one step.

## As built (stage 61 B2, the Worker, 2026-11-14)

- **Tables** (migration `0003_sync.sql`, adds only): `item` as above
  (a rowid table, PRIMARY KEY (account, kind, id), INDEX (account,
  seq)); `account.item_count` and `account.item_bytes`, kept in the
  same transaction as every write so no answer counts rows;
  `session_end(id_hash, account, reason, at)`.
- **A write** (`worker/sync.ts`) is one D1 batch: the item upsert takes
  `account.seq + 1` only while its rev is still the `If-Match` and the
  counters leave room; the account's seq and counters move only when
  the item then holds exactly that write. So seq rises by one per write
  of the account, strictly; a lost race is decided again from a fresh
  read (three rounds, then 503).
- **Limits:** tombstones count against neither `items` nor
  `itemBytes`; a write that does not grow the usage (a shrink, a
  delete) always goes through, even over a lowered limit. Bringing a
  tombstone back counts as a new item. Tombstones themselves are not
  capped (only by the rate limit): an open issue if abuse shows.
- **`changes`** is one statement (one snapshot); it stops at `limit`
  (≤ 500) items or before the blobs pass 4 MB, never before the first.
- **Why a session ended:** every path that removes sessions writes the
  reason first: `logout`; `password` (the others at a password
  change); `recovered` (every older session); `ended` (one, or all the
  others, from the Account page); `deleted` (account deleted); and
  `expired` (a session past its end answers so at once; the daily cron
  writes the row when it prunes it). A row is pruned SESSION_SECONDS
  after `at`. A cookie the server never knew stays `401 unauthorized`.
- **The flag `sync`** (`FLAG_SYNC`; on in staging's vars only): off,
  the sync paths answer 404 `not_found`, as the flag `accounts` does.
- Until part C reads the reason, the client takes `session_ended` for
  `unauthorized` (`src/cloud/account/api.ts`).
