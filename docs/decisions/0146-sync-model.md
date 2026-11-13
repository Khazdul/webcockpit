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
