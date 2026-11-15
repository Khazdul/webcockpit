# 0152 — Sync of settings, script data, Comm history and timers

- Status: Accepted (technical; stage 62, decided in the night pass of
  2026-11-15 without the owner; the points that touch what a player
  sees are listed for him in `docs/stages/62-sync-settings-comm.md`,
  "Waiting for the owner").
- Date: 2026-11-15
- Related: ADR 0146 and its addendum (the kinds, last writer, Comm and
  timers), ADR 0150 (the spaces), ADR 0151 (the engine), spec §7.4,
  §7.12 (62), `docs/stages/62-sync-settings-comm.md`.

## Context

Stage 61 built the spaces and the engine for `profile` and `script`.
Stage 62 adds the four small kinds of ADR 0146: `settings` (per device
type), `scriptData`, `comm` (pieces per day, merged by record) and
`timers` (per character). Their stores (src/core/db.ts) are unlike the
first two:

- `settings` is one record under the key `main` (src/settings/store.ts),
  phone parts included; the store has no reload and no outside-write
  listener; `webcockpit.appearance` in localStorage mirrors its
  appearance for the first paint.
- `scriptData` is one record per script *name*, bundled and user, written
  at most about once a second by a script's store API.
- `comm` is an autoIncrement store of records (`character, ts, channel,
  talker, talkerType, destination, text`), seven days, written per
  message during play.
- `timers` is one record per character, written up to every 250 ms
  during play.

## Decision

### The kinds

| Kind | Local key | Body (`v` 1) | Policy | In use during play |
|---|---|---|---|---|
| `settings` | the device type (`desktop`, `tablet`, `phone`) | `{type, record}`: the whole `Settings` record | last writer | this device type's item |
| `scriptData` | the script name | the `ScriptDataRecord` | last writer | the enabled scripts' names |
| `timers` | the character | the `TimersRecord` (`character, savedAt, state`) | last writer | the character being played |
| `comm` | the UTC day, `YYYY-MM-DD` | `{day, records}`, records without `seq`, sorted | **merge** | none |

- The device type is `deviceType()` of src/cloud/device-info.ts, the one
  the heartbeat sends: a tablet on "Desktop site" is a tablet.
- **Settings of the other device types** are kept in the account's
  `settings` store under the keys `device:desktop`, `device:tablet`,
  `device:phone` (this device's own type is always `main`). The game
  reads only `main`. Keeping them is what keeps the engine simple: an
  item the adapter would not store would look deleted at the next scan
  and be pushed as a delete.
- **A settings record from a newer client** (`record.version >
  SETTINGS_VERSION`) decodes as `newer` (ADR 0151): left untouched,
  "update the client". An older one is stored as pulled and migrated by
  the settings store when it loads it (`migrateSettings`), as a record
  from disk is. The migrated record is not pushed back until the player
  changes something (the hash is over what is stored).
- **Script data** of bundled and user scripts alike (bundled scripts are
  not items; their data is, ADR 0146). A user script's rename moves its
  data record (library.ts), so it is a delete and a create of two
  `scriptData` items: last writer needs nothing more.
- **Timers:** the hub's record as stored; `state` already holds what a
  tracker needs to go on (`serialize()`), and `savedAt` lets the hub age
  it on load as it does after a reload today.

### Comm: pieces per day, merged by record

- **The piece** is one item per UTC day (two devices in different time
  zones agree on it), all characters together. A record's identity is
  its canonical JSON without `seq` (`character, ts, channel, talker,
  talkerType, destination, text`): two devices never see the same tell
  from the game (one connection per character), so identical records
  come only from the sync itself and are one record.
- **The policy `merge`** is new in the engine (`KindSpec.merge(local,
  remote) → body`): where the table of ADR 0151 says "edited | edited →
  per kind", the union of both record sets (sorted by `ts`, then the
  identity) is written locally and pushed on the remote's rev. Every
  other row of the table stands (an unchanged local takes the remote; an
  edit beats a delete).
- **The adapter's write is additive.** A `put` of a day adds the
  piece's records the store does not have and removes none; only a
  `remove` (a whole day) deletes. So a message that the game writes
  between the engine's scan and its write is never lost; the store then
  differs from the record and is pushed at the next sync.
- **Seven days.** `list` returns only days of the last seven (by the
  records' `ts`, as `prune()` does); a pulled piece of an older day is
  not stored. Such a day then has a record and no local item, so the
  engine pushes its delete: the account's pieces go with the device's
  retention. The cloud keeps Comm history 7 days, as the device (owner,
  2026-11-15). Tombstones of days are one a day: no cap needed.
- **Compression.** A `comm` body is gzip (`CompressionStream`) of the
  canonical JSON, then sealed; the other kinds are not compressed (a
  few KB). The kind's spec says so (`compress: true`), and `encodeBody`
  / `decodeBody` become async for it.
- **Size.** 1 MB per item and 2 MB of small items per account (spec
  §7.4) stand. A day over 1 MB compressed (some 5 MB of text) is split
  into `YYYY-MM-DD.2` …, newest records in the last piece. Stage 62
  measures real Comm days from the owner's session logs and reports the
  figure (stage file); if seven days of a heavy player do not fit beside
  profiles and scripts, raising the small-item limit is the owner's
  call.

### When the small kinds push

ADR 0146's addendum: Comm and timers are also pushed when the game is
left, when the tab is hidden and every 5 minutes of play.

- **During play** a store write of `comm`, `timers` or `scriptData` does
  not start the 5 s sync (they write per message, per tick, per second).
  They ride the play schedule: every 5 minutes, on `visibilitychange` to
  hidden, and when the game is left (the start page shows). A `settings`
  write notes the change as a profile or script does (5 s): a player's
  own change, rare during play.
- **A sync during play is cheap.** The Comm adapter keeps each day's
  body and hashes cached under (record count, highest `seq`), so a day
  that got no message is neither read in full nor hashed again; in
  practice only today's piece is encoded. The engine's local work
  yields to the game between items (`setTimeout(0)` between kinds and
  between pushes), and the §1.3 benchmark must not move.
- **Closing the tab** in a game: the flushes on `pagehide` stay local; the
  sync of what was not pushed happens at the next load. `visibilitychange`
  to hidden comes before a close on phones and on most desktops, so in
  practice the last minutes are pushed.

### In use and held

`InUse` of ADR 0151 grows: this device type's settings, the enabled
scripts' data, the character in play's timers. Their pulled changes
wait for the start page (spec §7.4 step 5). Comm is never held: the
write is additive, and the pane reads the store only when it opens.

### Applying a pulled change

- **Settings:** `SettingsStore.reload()` (new) reads `main` again,
  migrates it and tells its subscribers, as a change made in the store
  does, without writing it back; it then rewrites the
  `webcockpit.appearance` mirror. The sync's BroadcastChannel
  (`webcockpit-sync@<space>`, ADR 0151 as built) carries `settings` too,
  so every tab of the space reloads it.
- **Script data:** `ScriptLibrary.reload()` already keeps records with
  unflushed store data.
- **Timers:** the hub loads at `Char.Name`; a pulled record is read then.
- **Comm:** the pane reads at open.

### The first copy of the settings

Spec §7.4: at a login, when the account has no settings for this device
type, they start as a copy of the device's. Stage 61 copies the
device's `settings` store when the account's space is made. That copy
must give way to the account's settings if it has them: it is marked as
a **seed** in `syncMeta` (`settingsSeed`: the hash of the copied
record), and like an untouched seed profile (ADR 0151 as built) it is
not an item while its hash is still the seed's and it has no agreed
sync record. A pulled `settings` item of this type then replaces it. If
the first full pull finds none, the seed becomes an item and is pushed.
A copy the player changed before that is an item like any change (last
writer).

### Create account

The move (ADR 0150, `move.ts`) stays profiles and scripts (and the runs
of stage 63). The new kinds are **copied** into the new account's space
when it is made, not moved: the device's settings (as today, all its
keys), its `scriptData`, its Comm history and its timers. They are then
pushed as the account's first items. The device keeps its own: its
look, its scripts' settings and its history stay as they were for the
next guest of the device, which is the device's owner. (A moved user
script's data stays behind on the device unused, as it does today.)

### What is not in the account (Log out, the locked copy)

`unsynced()` (ADR 0151) covers every kind. Log out's list names them
per kind in words ("2 profiles, settings, Comm history of today"); the
layout follows the owner's pick (stage file). For the locked copy's
decision **timers do not count** (state the game writes, not the
player, and stale within hours); settings, script data and Comm history
do.

### The Worker

`SYNC_KINDS_OPEN` gains `settings`, `scriptData`, `comm` and `timers`
behind the flag `sync`; the limits and the endpoints are unchanged.

## Alternatives

- **One settings item for all types, with per-type parts inside.** The
  record would need a merge of parts, and a phone's edit would rewrite
  the desktop's item. Three items, last writer each, is what ADR 0146
  says.
- **Comm as one item per character, or one for everything.** Every push
  would rewrite a week of messages; per day, only today changes.
- **Comm records with a new `uid` field.** Needs a store upgrade and
  says nothing the content does not; identity by content is enough.
- **Moving Comm, timers and script data at Create account.** "Back to
  the starting set" would then also wipe the device's look and history,
  and a moved thing's removal needs the move's fingerprints for each
  record. Copying loses nothing and keeps the move as it is.
- **A sync on every small write during play.** A D1 write per tell and
  per tick; the play schedule is what the addendum decided.

## Consequences

- An account's database on a desktop holds the account's phone and
  tablet settings too (a few KB).
- The engine gets a third policy and async bodies; the generated tests grow to the four kinds (merge: after every
  device has synced, every record any device wrote within seven days is
  in every device's store exactly once).
- Comm history of other players (their tells) is stored in the account,
  encrypted, for seven days. The registration's first point and
  `/privacy` say so (owner, 2026-11-15).

## As built (stage 62 B2)

- **`SettingsStore.reload(): Promise<'applied'|'same'|'local'|'none'>`**
  (src/settings/store.ts). A local change not flushed yet **wins**: it
  is flushed over the pulled record (the next scan pushes it, last
  writer) and the result is `local`; the same for a change made while
  the record is read. A write in flight is awaited before the read.
  `applied` tells the subscribers and rewrites the mirror; nothing is
  written back. Safe mode before its first change keeps the default
  appearance. A flush that committed notes `settings`.
- **store-events**: `StoredKind` adds `settings`, `scriptData`, `comm`,
  `timers`. The stores note only their own writes (the settings flush,
  a library write touching `scriptData`, a committed Comm append
  transaction, a timers `save`); the adapter-facing helpers below do
  not. The sync runtime still starts its 5 s sync only for `profile`
  and `script` (part C wires the rest).
- **CommArchive** (src/gmcp/comm-archive.ts): `commDays(now?)` →
  `{day, count, maxSeq}[]`, oldest first, within retention (`ts ≥ now −
  7 d`, as `loadRecent`); `dayRecords(day)` → records without `seq`,
  clipped to retention, sorted by `ts` then identity;
  `addDayRecords(records)` → count added, in one transaction (identity
  against the day's stored records, duplicates in the input are one;
  non-records and records outside retention skipped);
  `removeDay(day)` → count. Pure exports: `utcDay`, `dayBounds` (throws
  `RangeError` on anything but a real `YYYY-MM-DD`, so a split key
  `YYYY-MM-DD.2` is the adapter's to strip), `commFields`,
  `commIdentity` (canonicalJson of src/cloud/sync/items.ts),
  `sortCommRecords`.
- **TimersArchive**: `list()`, `put(record)` (as given, `savedAt` kept),
  `remove(character)`. The hub already reads a record put from outside
  at the next `Char.Name` (a test).
- **Measured** (stage file, "Measurements"): the owner's heaviest real
  day is 1 472 records, 267 KB of canonical JSON, 30 KB gzip; a heavy
  week is some 3 % of the 2 MB small-item limit.
