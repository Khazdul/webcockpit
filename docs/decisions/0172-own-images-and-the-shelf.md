# 0172 — Own images and the shelf

Date: 2026-11-27. Status: accepted (stage 80 part D). Related: ADR 0145
(the blob format), ADR 0146 and its addendum (the kinds), ADR 0150 (the
spaces), ADR 0151 (the engine), ADR 0152 (the small kinds, `merge`, gzip),
ADR 0157 (the admin's limits), ADR 0169 (looks), ADR 0171 (map tokens),
`docs/stages/80-character-tokens.md` §3, §4, §5, Build notes N1, N5, N6.

## Context

A player with an account may use pictures of their own as looks (the
owner's decisions 2 and 14): a shelf of at most 50 per account, kept in
the account so they follow the player to other devices, shown only to the
player. The sync carried only small items (2 MB and 2 000 items per
account, one counter pair checked in `write()` for every kind); fifty
images would eat that. The looks themselves (ADR 0169) lived only on the
device.

## Decision

### The two kinds

| Kind | Local key | Body (`v` 1) | Policy | Counted against |
|---|---|---|---|---|
| `lookImage` | a random id (base64url of 16 bytes) | `{id, label, webp, created}`, `webp` the picture's bytes in base64; gzipped | last writer | `lookImages`, `lookImageMaxBytes`, `lookBytes` |
| `looks` | the constant `looks` | `{names: {[name]: {look, at, own?}}}` | `merge`: per name the newest `at` (`mergeLooks`), `own` sticks; prune deterministic (ADR 0169) | the small items |

- Both are in `SYNC_KINDS` and `SYNC_KINDS_OPEN` (no flag), and the client
  syncs them last: `… comm, lookImage, looks`, an image before the looks
  that name it.
- **Stores** (DB_VERSION 11, part A): `lookImages` (keyPath `id`, the body
  as it is) and `looks` (one record). The `looks` adapter's put is merged
  into what is stored, and the looks store's own save merges into what is
  stored in the same transaction, so neither a pull nor a choice made in
  between is overwritten.
- **Applied at once**, also during play: the sync's write tells the page
  (`noteSynced` in `src/core/store-events.ts`, through `applyWritten` and
  the space's BroadcastChannel for the other tabs) and the looks store and
  the shelf read their stores again. Nothing of either is "in use".
- **Pushed soon**: a look chosen and an image added or removed are the
  player's own acts and start the 5 s sync during play too, as a profile's
  edit does (the small kinds ride the play schedule, ADR 0152).
- **Create account** copies the device's `looks` (`COPIED`); a login copies
  nothing. The device's space has no own images to copy.
- `LOCKING_SPECS` keeps both: an image or a look not in the account keeps a
  locked copy, and Log out names them ("looks", "own images").

### A budget of their own

- New account limits (`AccountLimits`, admin-editable per account and as
  defaults, ADR 0157): `lookImages` = 50, `lookImageMaxBytes` = 32 768,
  `lookBytes` = 1 638 400 (50 × 32 768).
- New counters `account.look_count` and `look_bytes` (migration
  `0009_looks.sql`, additive). `worker/sync.ts` `budgetOf(kind)` picks the
  counters and limits for a write: `lookImage` counts against the look
  budget only, every other kind (`looks` too) against the small items only.
  The same 413 codes: `too_many_items`, `item_too_large`, `storage_full`;
  tombstones count against neither; a write that does not grow is never
  refused. The body is capped by the kind's own max before it is read.
- `AccountUsage` and `SyncUsage` carry `lookImages` and `lookBytes`
  (optional in the contract: an older Worker leaves them out); the admin's
  account list and its total bytes include them.
- The same migration creates part E's `look_dir` table (spec §9), so
  staging and production get one migration.

### The measured blob

The server sees blob bytes, not WebP bytes: the base64 inside canonical
JSON, gzipped (`compress: true`, the path Comm uses), sealed (29 bytes).
Measured in `worker/test/looks.test.ts` with a real 256 × 256 WebP of
30 686 bytes (noisy, as hard to compress as a photo):

| WebP | JSON | gzip | blob |
|---|---|---|---|
| 30 686 B | 41 030 B | 30 957 B | **30 986 B** |

The blob is 1.0 % over the picture, well under 32 768: **gzip stays and
the limits are 32 768 and 1 638 400** (not the fallback 42 000 / 2 100 000).
A 30 720-byte WebP gives about 31 020.

### The shelf and the crop (the client)

- **Account only.** The shelf (`src/looks/images.ts` `OwnImages`) is on
  only in an account's space; in the device's space it loads, lists and
  shows nothing, an add is refused, and the resolver gets no `ownImages`,
  so an own look falls to the drawing (row 3). The picker's My images tab
  is then the login card, whose Log in goes to the start page's Log in
  (`?account=login`; while a game is connected it asks to leave the game
  first).
- **The crop step** (`src/looks/crop.ts`, `src/looks/mine.tsx`): the
  picked file is decoded with `createImageBitmap` (the first frame of an
  animated one; a very large one made 2048 px on its long side once), drawn
  on a canvas in a 240 px square (no `blob:` or `data:` URL of the
  original); pan by drag and the arrow keys (Shift: 32 px), zoom 1–4 by
  the wheel (about the pointer), a slider, + and −, a two-finger pinch
  (basic; part F polishes touch); the dashed circle is the token's cut.
  Save encodes 256 × 256 WebP, quality stepped down from 0.92 to 0.12 until
  the file is at most 30 720 bytes; a browser whose `toBlob` gives no WebP
  gets JPEG on the token's dark ground the same way; too large even at the
  lowest quality, or not decodable: a plain line in the dialog. The
  original never leaves the browser.
- **Shown** from a `data:` URL of the stored base64 (the CSP has no
  `blob:`), made once per image and page; the type is read from the bytes
  (`RIFF` → WebP, JPEG, PNG). The Character portrait (`object-fit: cover`,
  no backing), the Group token (`is-own`), the picker's previews; the map
  worker gets the bytes once, transferred (`TokenFeed.ownBytes`), and keeps
  the decoded picture (ADR 0171).
- **Remove** says how many characters use the image (their names) and puts
  them back on automatic: a reset is an entry with a new `at` (ADR 0169),
  so it wins on the other devices. A removal on one device while another
  assigns the image (N6) is covered by the resolver's silent fallback.
- **A full shelf** (the account's `lookImages`, as the last sync heard
  it, else 50): Add image asks to remove an image first. **A refused push**
  (413) leaves the image on the device, marked on the shelf with a plain
  line of why (the engine's `full` record of the item); the engine retries
  it at every sync as it does for every kind.
- **Never sent to anyone else.** Nothing of an own image leaves the device
  but in the account's encrypted sync; part E's directory reports `null`
  for an own look (`LookRef.src === 'own'`).

## Consequences

- An account on staging or production needs migration 0009 before this
  Worker runs (the deploy applies it).
- N5: a 0.23.2 tab treats `lookImage` and `looks` as newer kinds and
  leaves them alone; it loses its stores when a new tab upgrades the
  database to 11 (existing behaviour); an old client that rewrites the
  settings drops `character.shareLook`.
- The engine's `full` state of a refused image shows the account as
  "needs attention" on the start page, as for any refused item.
- The images' bytes are 1.6 MB per account at most in D1, beside the small
  items' 2 MB.
