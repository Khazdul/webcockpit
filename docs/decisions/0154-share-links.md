# 0154 — Share links: publications, the watch page's sandbox, reports and moderation

- Status: Accepted (planned 2026-11-15, stage 64; nothing built yet).
- Date: 2026-11-15
- Related: spec §7.0, §7.7, §7.9, §7.10, §7.12 (64); ADR 0019 (the HTML
  replay and its payload), ADR 0020 (the replay's map), ADR 0144
  (platform, CSP), ADR 0145 (accounts), ADR 0147 (statistics, flags,
  device id), ADR 0148 with its addenda (sharing, watching, rules,
  reports, the admin page), ADR 0153 (R2, reservation of room).

## Context

ADR 0148 decided what sharing is; this records how stage 64 builds the
unlisted link, the watch page, Report and the moderation tools, and the
owner's two answers of 2026-11-15:

- **The rules are ticked once per account at the first Create link**,
  not only at the first listing in stage 65: an unlisted link is still
  content we host and show to strangers.
- **The abuse address** `abuse@mumecockpit.com` is on About and
  `/privacy` from stage 64; the owner's Email Routing forwards it
  already.

## Decision

### What is uploaded

- The payload is the `ReplayPayload` (schema 1) that the HTML export
  builds from the export doc (ADR 0019), **built in the export editor
  exactly as for HTML** (`buildPayload`, the map subset when the doc
  has the map on). It is the only private data that leaves the device,
  and only as cut: no run body, no export doc, no data key, no item. The
  settings in it are the exporter's settings without `phone` (as today)
  and with every field the replay does not read removed by a whitelist
  (below), so a stored login or a future private setting never travels.
- The wire form is the payload's JSON, gzip (the bytes `encodePayload`
  makes before base64), `application/octet-stream`, at most
  `payloadMaxBytes` (5 MiB) compressed.
- The meta goes beside it as JSON: `title` (1–100 characters, trimmed,
  required: the dialog fills it from the doc's title or the character
  and date), `description` (0–500), `character` (the payload's), `level`
  (optional), `lengthS` (the cut's played length), `listed: false`
  (stage 65 opens `true`). Text fields: Unicode text, no control
  characters but `\n` in the description, NFC; the Worker refuses
  anything else (`400 bad_request`). Names and text are always shown as
  text (`textContent`), never as markup, on every page.

### The Worker

- Migration `0005_share.sql`: `publication` as spec §7.11 (plus `bytes`
  for the payload's size, `updated`, `hidden_reason`), `pub_view(pub,
  device, day)` PRIMARY KEY, `report(id, kind, target, account, reason,
  text, created, handled)` with UNIQUE `(kind, target, account)`, and
  `admin_log` (spec §7.11). `account.pub_count`, `account.pub_bytes`.
- **Ids:** 12 characters of `[A-Za-z0-9]` from `crypto.getRandomValues`
  (≈ 71 bits), `PUB_ID_PATTERN`; an insert that meets an existing id
  draws again.
- **`POST /api/u/pub`**: `multipart/form-data` would need a parser; the
  request is two parts in one body instead: the meta's JSON length as a
  4-byte big-endian prefix, the meta JSON, then the payload bytes. The
  Worker reads the meta, checks it, checks `Content-Length`, the
  account's state (`403 suspended`), the count (`413 pub_quota` at
  `sharedRuns`, 150), the size (`413 payload_too_large`), the gzip magic
  bytes, the flag `share` (404 off) and `rulesAccepted` (`403 rules`
  until the account has ticked them), **reserves the count in D1 before
  R2** (as ADR 0153 reserves room), puts `pub/<id>` and answers
  `PubWritten`. The Worker never decompresses a payload (CPU on the free
  plan): what it serves it stores byte for byte, and the watch page
  treats it as hostile.
- **Published bytes do not count against `runBytes`** (owner,
  2026-11-14); `account.pub_bytes` and the admin page's total show them.
  `AccountLimits.runBytes`' comment is corrected.
- `PATCH /api/u/pub/<id>` (title, description; `listed` refused until
  stage 65), `DELETE /api/u/pub/<id>` (row and object; the count given
  back), `GET /api/u/pub` (the account's, newest first, with views and
  state). `PATCH /api/u/account/prefs` gains `rulesAccepted: true` (one way).
- `GET /api/pub/<id>` (public, no session): `PubMeta` (title,
  description, sender's account name, character, level, length,
  created, views, bytes); `404 not_found`, `410 gone` (removed by its
  sender or deleted with the account: the row is kept as a tombstone
  without text), `451 hidden` (hidden by reports or the admin). A hidden
  run answers its owner (session) with the meta and `hidden: true`.
- `GET /api/pub/<id>/payload`: the stored bytes, `Content-Type:
  application/octet-stream`, `Cache-Control: private, max-age=604800,
  immutable` (the cut is frozen; private so a hidden run leaves no edge
  copy), `X-Content-Type-Options: nosniff`, `Content-Disposition:
  attachment`, the same state answers as the meta. No CORS headers.
- `POST /api/pub/<id>/view` `{device}`: the stats device id (ADR 0147;
  the page makes one if it has none). `INSERT OR IGNORE` into
  `pub_view` for the UTC day; `views` grows only when the row is new.
  `BEAT_LIMITER` keys it per address. The cron prunes `pub_view` older
  than two days.
- `POST /api/u/report` `{kind: 'run', target, reason, text?}`: reasons
  `harassment`, `real_life`, `rules`, `other`; text ≤ 500; one per
  account and item (`409 already_reported`), 30 a day per account
  (`429`); a run's own sender cannot report it. When an item has
  reports from five different accounts not yet handled, it is hidden
  (`state = 'hidden'`, `hidden_reason = 'reports'`). The kind `comment`
  (and `note`) is in the type for stage 65 and refused now.
- **Delete account** removes its publications (rows to tombstones,
  objects from R2) as it removes its run bodies.
- **The flag `share`** (`FLAG_SHARE`): staging on, production off until
  the owner's go-ahead. Off: every `/api/u/pub*`, `/api/pub/*` and
  `/api/u/report` path answers 404, and `/r/<id>` shows "This link does
  not work yet."

### The watch page `/r/<id>`

- `run_worker_first` gains `/r/*`. The Worker answers `/r/<id>` (an id
  of the pattern, or anything: the app shows the error) with the built
  `index.html` from `ASSETS` (its `_headers` policy comes with it), so
  the app boots and `src/boot` sees the path: no start page animation,
  the watch view straight away. The watch code is a lazy chunk; the
  entry chunk only learns the path's name.
- **The frame document** is a static file of its own, `r/frame.html`,
  built by Vite from the replay runtime (ADR 0019's IIFE, one inline
  script and its CSS as one inline style), with its own `_headers` rule:
  `Content-Security-Policy: default-src 'none'; script-src '<hash>';
  style-src '<hash>' 'unsafe-inline'; img-src data: blob:; font-src
  data:; worker-src blob:; connect-src 'none'; form-action 'none';
  base-uri 'none'; frame-ancestors 'self'` (the player sets computed
  `style` attributes, which no hash covers; scripts, not styles, are the
  danger, and nothing a style could load gets past `img-src` and
  `font-src`). `X-Frame-Options` is not sent (`frame-ancestors` rules).
  The build fills the hashes as `cspHashesPlugin` does.
- **The frame:** `<iframe sandbox="allow-scripts" allow="fullscreen"
  src="/r/frame.html" referrerpolicy="no-referrer">`. No
  `allow-same-origin`: its origin is opaque, so it cannot read the
  app's cookies, IndexedDB, `localStorage`, the data key or the DOM
  around it, and `connect-src 'none'` keeps it off the network. No
  `allow-top-navigation`, `allow-popups`, `allow-forms`,
  `allow-modals`.
- **The handshake** (`postMessage`): the frame posts `{t: 'wc-ready',
  v: 1}`; the page answers once with `{t: 'wc-play', v: 1, payload:
  ArrayBuffer (transferred, the gzip bytes), fonts: [{family, weight,
  range?, data: ArrayBuffer}], prefs}`; the frame posts `wc-error`
  `{text}` or `wc-size` (nothing else). The page accepts a message only
  when `event.source` is the frame's window and `event.origin` is
  `'null'`; the frame accepts only from `parent` and only the first
  `wc-play`. Fonts are fetched by the page from its own origin as the
  exporter fetches them (only families of `FONTS`) and registered in
  the frame with `FontFace` from the bytes.
- **In the frame** the payload is decompressed with a ceiling (64 MiB
  of JSON; past it the stream is cancelled: a gzip bomb) and passed
  through `validatePayload` (below) before `openReplay`. A failure shows
  the replay's one-line notice, never a stack trace or payload text.
- **Around the frame** (the app's own DOM, text only): title, sender,
  character and level, length, date, views, Report, Download as HTML,
  Back (to the start page; the gallery from stage 65). The meta comes
  from `GET /api/pub/<id>`, not from the payload.
- **Download as HTML** builds the same file the exporter makes
  (`buildReplayHtml`) from the validated payload, fetched once.
- **A view** is counted when playing starts, once per page load.
- A phone or tablet gets the same page; the frame fills the width as
  the HTML replay file does in a phone's browser.

### Hardening the replay runtime (spec §7.7, "Payloads are hostile")

- `src/replay/validate.ts`: `validatePayload(unknown): ReplayPayload`,
  pure, used by the frame, Download as HTML and the export editor's own
  check before an upload (so a payload we would refuse to play is never
  uploaded). It checks every field's type and bounds: at most 200 runs,
  the texts together at most 64 MiB, every capture record parseable by
  the player's reader or dropped, 2 000 comments of at most 4 000
  characters, 20 000 markers of a known kind, cuts as ordered pairs of
  finite numbers, `hiddenSys` within `runs`, `startUs` and `level`
  finite and in range; `settings` through `migrateSettings` and a
  whitelist of the sections the replay reads (fonts only from `FONTS`,
  colours `#rrggbb`); `map`: `mm2` base64 ≤ 8 MiB, `files` keys
  `^(pixmaps|fonts)/[A-Za-z0-9._/-]{1,128}$` without `..`, values only
  `data:image/(png|jpeg|gif|webp);base64,` (no SVG) or `data:font/woff2;
  base64,` under `fonts/`, at most 2 000 files. Unknown keys are
  dropped. A payload that fails is refused whole, not repaired.
- **No HTML from the payload:** a review of every path from payload text
  to the DOM in the player (log lines, Comm, panes, script panes'
  records, markers' tips, comments, the header, the map's room names
  and notes): text and ANSI only, no `innerHTML`, no URL from the
  payload in `src`, `href` or CSS. Script panes' records (ADR 0053)
  carry only text and colours; the review confirms it.
- **Fuzz tests** (`tests/unit/replay-fuzz.test.ts`, fixed seeds so a
  failure repeats): mutated real payloads (flipped types, huge numbers,
  NaN, long strings, deep nesting, prototype keys such as `__proto__`
  and `constructor`, broken ANSI and GMCP, cut-up gzip) through
  `validatePayload` and then `openReplay` in the unit DOM: no throw
  escapes, nothing is added to the DOM outside the player's root, no
  timer runs away (bounded wall time). An e2e plays a hostile payload in
  the real frame on the watch page and checks from inside the frame
  that `parent.document`, `localStorage`, `indexedDB`, `fetch` and a top
  navigation all fail, and that the page around it is untouched.

### The export editor and the views

- The format toggle gets **Link** after HTML replay and Plain text
  (letter `L`), shown when the flag `share` is on; Hall of Fame comes in
  stage 65. Logged out it says it needs an account (the mockup's pick).
  EXPORT with Link opens the share dialog: title, description, the
  payload's size against 5 MB, "Anyone with the link can watch this.",
  the rules' tick the first time, Create link; then the link with Copy.
  The payload is built off the game path (the editor is not open while
  playing anyway) and uploaded once; the doc stores no link (a published
  run is a copy of its own, spec §7.7).
- **Published runs** on the Account page: title, link (Copy), views,
  date, size, link only, Edit (title, description), Remove (with a
  confirmation; the link then says it was removed). A hidden run shows
  the note "Hidden after reports". Stars and comments come in stage 65.
- **Report** on the watch page: logged in, a dialog with the four
  reasons and an optional text; logged out, "Log in to report" and the
  abuse address.
- Words and placement are the owner's picks of round 12's mockups.

### Admin

- The admin page grows **Reports** (open reports grouped by item: item,
  title, sender, reasons with counts, the newest text, a link to watch
  it) and **Published runs** totals (count, bytes, today's new), and
  actions: Hide, Restore, Delete for a run; Suspend, Restore, Delete for
  an account (Delete with the account's name typed). Each action marks
  the item's reports handled and writes `admin_log(ts, who, action,
  target, note)`; `who` is the Access e-mail's hash, not the address.
- `GET /api/admin/reports`, `POST /api/admin/pub/<id>` `{action}`,
  `POST /api/admin/account/<name>` `{action}`, `GET /api/admin/log`
  (the newest 100); the `X-WC` and `Origin` rules of the flag switch.
- The admin watches a hidden run on `/r/<id>?admin`: the page asks
  `/api/admin/pub/<id>` and `/api/admin/pub/<id>/payload` instead, which
  only the Access check lets through.
- A suspended account keeps its sync; it cannot create, edit or report
  (`403 suspended`); its published runs stay unless hidden.

### Measurement

Real payloads from the owner's runs backups (as stage 63's A2): the
gzip size of a typical cut and of whole sessions, with and without the
map, against 5 MiB; no text or names kept (`notes/research/payload-sizes.md`).

## Alternatives

- **A separate origin for the frame** (a `usercontent` domain): the
  strongest isolation, but a second domain, certificate and deploy; the
  sandbox without `allow-same-origin` gives an opaque origin already.
- **`srcdoc` or a blob URL for the frame:** both inherit the app page's
  CSP, which allows our scripts and `connect-src 'self'`; a frame
  document with its own header does not.
- **Validate on the server:** decompressing and parsing up to 64 MiB of
  JSON does not fit a free plan Worker's CPU time; the client cannot
  trust the server's check anyway.
- **Encrypt shared runs:** they are meant to be read (ADR 0148).

## Consequences

- Every schema-1 payload ever stored must stay playable: `validatePayload`
  may only become more tolerant for schema 1; a new schema adds a reader.
- The frame's CSP hashes change with every build; the build fills them.
- Moderation is the owner's work from the day `share` opens in
  production.

## As built (stage 64 B1)

The Worker part, as decided above, with these details and deviations
(branch `stage64-worker`; the contract's "As built (stage 64 B1)"
comments in `shared/cloud/api.ts` have the exact answers):

- **The sender's view of a hidden run** is not on the public path: the
  session cookie's path is `/api/u` (ADR 0145), so `GET /api/pub/<id>`
  never knows who asks. The sender asks `GET /api/u/pub/<id>` (`PubMeta`
  with `hidden: true`) and `GET /api/u/pub/<id>/payload` (the bytes,
  `no-store`). The watch page (C2) asks these after a `451` when logged in.
- **The reservation.** One batch inserts a `pending` row under the new id
  only while `account.pub_count < sharedRuns`, and raises `pub_count` and
  `pub_bytes` only when that row exists; an id that is taken fails the
  batch (nothing applied) and a new one is drawn (5 tries). The row claims
  the id before R2, so a collision can never overwrite another run's
  payload. After R2 the row turns `active` only while still `pending`
  (Delete account meanwhile → the object goes again, `401`). R2 down, a
  short body or a stored size that differs → `503`, the count given back;
  an object that may have been stored leaves a tombstone with its bytes.
  An isolate that dies between the steps leaves a `pending` row: the
  daily cron gives its count back after an hour.
- **Tombstones and R2.** Removing a run (the sender, the admin, Delete
  account) turns the row into a tombstone (`state 'removed'`, no text) and
  gives the count back in one batch, then deletes `pub/<id>`; the
  tombstone keeps `bytes` until R2 confirms, and the daily cron deletes
  what is left (`publication.bytes > 0` on a tombstone). So the player's
  and the admin's Delete never fail on R2, and the link says `410` at once.
  The run's open reports are marked handled with it.
- **States in the table**: `pending`, `active`, `hidden`, `removed`
  (`hidden_reason` `reports` or `admin`). `bytes` is spec §7.11's `size`.
  `vote_sum`, `vote_count`, `comment_count` and `listed` are made now
  (stage 65).
- **Text rules** (meta, PATCH, report text, the admin's note): NFC, no
  control characters (C0, DEL, C1) but `\n` in a description, no lone
  surrogates, and also no bidi embeddings, overrides or isolates
  (U+202A–U+202E, U+2066–U+2069), which could make a title read as
  something else around it. Lengths are in code points. `title` and
  `character` must come trimmed (refused, not trimmed). `character` 0–40,
  `level` 0–1000, `lengthS` 0–31 days; the meta JSON at most 8 KiB
  (`PUB_META_MAX_BYTES`). The declared `Content-Length` alone can answer
  `413 payload_too_large` before anything is read.
- **Views**: one batch raises `views` only when no `pub_view` row of the
  device and UTC day exists, and inserts it. `BEAT_LIMITER` (per address)
  and `API_LIMITER` (per address, on every `/api/pub/*` path) limit it.
- **Reports**: the 30 a day are per UTC day and are held in the insert
  (`INSERT … WHERE (count today) < 30`), so parallel reports never pass
  them; the hiding is in the same transaction. `comment` and `note` →
  `400 kind_closed`. A hidden run can still be reported; a removed one is
  `404`.
- **Prefs**: `PATCH /api/u/account/prefs` takes either key or both, each
  set on its own with `json_set`, so a notice change never undoes the
  tick. `AccountPrefs.rulesAccepted` is no longer optional in the
  contract (the client reads a missing one as false).
- **Admin**: the moderation endpoints (`worker/moderation.ts`) are not
  behind the flag `share`, so the owner can clean up after switching it
  off. `who` is HMAC-SHA-256 of the Access e-mail under `AUTH_PEPPER`
  (22 characters; SHA-256 without the secret). The account's Delete is
  the player's transaction (`worker/deletion.ts`), guarded by the
  `auth_hash` read just before (a password changed in between → `409
  conflict`, nothing done), with its log entry under the same guard;
  `confirm` is compared without regard to case. Suspend and Restore do not
  mark reports handled (a run's reports are the run's actions' business).
  The queue lists only items still active or hidden (at most 200).
- **`/r/*`**: an id of `PUB_ID_PATTERN` gets the site root from `ASSETS`
  (with `If-None-Match`, so the root's ETag works); any other path under
  `/r/` goes to `ASSETS` first and becomes the root only on a 404. So
  `/r/frame.html` is the assets' own answer. Seen in Miniflare: the
  assets binding serves `/r/frame.html` as `200` and matches a `_headers`
  rule by the clean path **`/r/frame`**, not by `/r/frame.html` (a rule
  written for `/r/frame.html` did not apply). B2's frame rule should be
  written for `/r/frame` (and checked against `wrangler dev`).
  `scripts/static-server.ts`' `cloudflare` profile routes `/r/*` through
  the router as well (it answers `/r/frame.html` with its 307 to `/r/frame`).
- **Not done here**: no client features (the client's `setPrefs` still
  sends only `galleryNotice`; C1 adds the tick).
- **Tests**: `worker/test/pub.test.ts` (34), `reports.test.ts` (7), the
  moderation part of `admin.test.ts` (9), `auth.test.ts` (prefs, 1 new),
  `tests/unit/static-server-cloudflare.test.ts` (`/r/*`, 1 new). As in
  stage 63, Miniflare's local R2 logs an uncaught "Network connection
  lost" of its own in the short-body test; the test passes.

## As built (stage 64 B2)

The replay runtime against hostile payloads and the sandboxed frame
(branch `stage64-replay`).

- **`validatePayload`** (`src/replay/validate.ts`), pure, refuses a bad
  payload whole (`PayloadError` with the first bad field's path) and copies
  only known fields into new objects (own properties only; no payload key
  is ever assigned, so `__proto__` and `constructor` stay data). Bounds as
  decided, plus: title ≤ 1 000, character ≤ 200, a marker's tip ≤ 2 000
  characters, `holdMs` 0–60 s (the exporter makes at most 10 s), `level`
  0–10 000, every µs value finite within ±8.64e18 (what `Date` takes),
  cuts ≤ 20 000, the map's `rooms`/`visited` 0–1e9, `hiddenSys` integers
  below `runs.length`. A run's meta keeps `startedUs` and `summary`
  (`startUs`, `level`) only. The capture texts are not parsed: the
  player's reader skips any line that is not a record, and the review
  below covers what a well-formed record can do.
- **Map files**: keys as decided (and no `.`, `..` or empty segment);
  images `data:image/(png|jpeg|gif|webp);base64` whose header says at most
  4 096 × 4 096 px (`MAP_IMAGE_PX`; the bundled tiles are at most 313 px):
  a small file cannot decode to a huge bitmap in the worker. **Deviation:**
  under `fonts/` also `data:text/plain;base64,` besides woff2: the map's
  bitmap font descriptions (`Cantarell18.fnt`) have always been embedded
  so, and every schema-1 file must keep playing.
- **Every schema-1 payload passes**: the tests build every session of the
  runs demo backup (whole and cut with a comment), every `.log` fixture, the
  first files' shape (whole `RunMeta`, no tips, all settings), an exported
  map, and read the owner's 32 real exported files when present
  (`$WEBCOCKPIT_REPLAYS`, default `~/Downloads`; skipped elsewhere). The
  HTML replay file (`startReplay`) validates too.
- **The settings whitelist** (`src/share/replay-settings.ts`
  `REPLAY_SETTINGS_KEYS`): `version`, `appearance`, `panes`, `layout`,
  `group`, `comm`, `timers`, `output`, `mapper`, `weather`. Left out:
  `profile` (its name), `input`, `spotlights` (character names), `windows`,
  `phone`. `replaySettings` (what `buildReplayPayload` writes) migrates the
  exporter's settings first and then picks, so an unknown field inside a
  kept section never travels either; `validatePayload` applies
  `migrateSettings` and the same pick. A test puts a login, a password,
  keys, a Comm history and a profile name into the settings and finds none
  of them in the payload.
- **The frame document** `r/frame.html` (`scripts/frame-html.ts`, built by
  vite.config.ts `frameDocumentPlugin` from `src/replay/frame-main.ts`:
  the replay runtime with the map worker inline, its CSS in the one
  `<style>`, about 1.4 MB). `cspHashesPlugin` fills its policy's two
  placeholders (`'sha256-FRAME-SCRIPT'`, `'sha256-FRAME-STYLE'`,
  scripts/csp.ts `fillFrameHashes`, which refuses a document without
  exactly one inline script and one style). **The `_headers` rule is
  `/r/frame`**, the path Cloudflare serves the file at (`/r/frame.html`
  307s there; B1 saw the assets binding match rules by that clean path),
  and the iframe loads `<BASE_URL>r/frame` (no redirect; a subpath deploy
  works; a page-relative `r/frame` would resolve under `/r/<id>`). The
  rule removes the app's two policy lines first (`! Content-Security-
  Policy`, `! …-Report-Only`), so the policies do not combine, and
  `enforceCsp` now rewrites only the `/*` rule's lines. **The policy is
  the one written above, unchanged**: with the document's own style by
  hash, the player's run-time styles (CSSOM `style` properties) raised no
  violation in Chromium or Firefox. The app's policy gets `frame-src
  'self'`. The dev server serves `/r/frame` (and `/r/frame.html`) built
  on demand with the same policy, hashes filled, and — because the dev
  page is cross-origin isolated — COEP and `Cross-Origin-Resource-Policy:
  cross-origin` (Firefox blocks a sandboxed frame's document under COEP
  otherwise); production sends no COEP, so its rule needs neither.
- **Minimal code changes the policy needed** (instead of loosening it):
  the map worker read its data: URIs with `fetch`, which `connect-src
  'none'` blocks; `src/map/assets.ts` now decodes base64 data: URIs
  itself (`dataUriBlob`) and refuses anything else. `crypto.subtle` does
  not exist in the opaque frame (not a secure context), which failed the
  map's load (`mapHash`); it now returns `''` there, which stores and loads
  no learned ids, as in any replay.
- **The handshake** (`src/replay/frame.ts`, `src/watch/frame-host.ts`):
  as decided. The frame accepts only `parent`'s first `wc-play` (`v: 1`);
  fonts are checked (families of `FONTS` and the pane title's, weight,
  `unicode-range` syntax, ≤ 64 fonts of ≤ 8 MiB) and registered with
  `FontFace` from the bytes; the payload goes through `readSharedPayload`
  (`src/replay/shared.ts`: streaming gunzip cancelled past 64 MiB, strict
  UTF-8, JSON, `validatePayload`); errors are one of three fixed lines.
  `prefs` is accepted and not used yet; `wc-size` is not sent (the frame
  fills the box the page gives it). **Addition:** the page reads the
  payload once itself (the same `readSharedPayload`) before it makes the
  frame: it needs the payload's font families and Download as HTML needs
  the validated payload; a payload the page refuses never reaches a frame.
  The page takes messages only from the frame's window with origin
  `'null'`; it posts with `'*'` (an opaque origin cannot be named; nothing
  sent is private). Known limit: a sandboxed frame may still navigate
  itself; it stays sandboxed, and only script could do it, which the
  policy and the review keep out.
- **The review of every path from payload text to the DOM** (an
  independent read of the player, then fixes, each with a test that fails
  without it, `tests/unit/replay-review.test.ts`). No HTML injection was
  found: every `innerHTML` on the path takes constants; log lines, Comm,
  the panes, script panes' records (text and colour numbers only, capped
  by `sanitizeSnapshot`), marker tips, comments, the header, map room
  names and notes all reach the DOM as `textContent`, `title`,
  `aria-label` or `dataset`; no payload value reaches `src`, `href`,
  `action` or a `url()` but the validated map data: URIs. Fixed:
  1. A VIEW record's parts went into the player's raw `base` unmigrated:
     a pane entry that is not an object (`{"panes":{"statistics":1}}`)
     threw on every compose and froze playback, and an `appearance.bg` of
     `url(…)` reached the Display popup's swatch as a CSS background (a
     request when the popup opened). The parts are now migrated as they
     enter `base` (`player-host.ts`).
  2. The map worker fetched any string in `map.files` (closed by the
     validator and by the resolver's own data:-only decoding).
  3. The `.mm2` inflate had no ceiling (a deflate bomb in `map.mm2`): it
     now stops at the qCompress header's length or 256 MiB
     (`MM2_INFLATE_MAX`).
  4. Script pane records with thousands of ids made as many panes: capped
     at `MAX_SCRIPT_PANES` (200).
  5. Map images that decode to huge bitmaps (the 4 096 px check above).
  6. Names from the log used as table keys (`constructor`, `__proto__`
     as a channel or position) read Object.prototype members into the
     Comm and Group text: the lookups take own keys only.
  7. `mergeInto` (the settings store) skips `__proto__`, `constructor`
     and `prototype` (not reachable today; a guard).
- **Fuzzing** (`tests/unit/replay-fuzz.test.ts`, fixed seeds, 100 per base
  payload × 4 fixtures, plus the wire bytes): flipped types, huge numbers,
  long strings, deep nesting, own `__proto__`/`constructor` keys
  throughout, broken ANSI/OSC/DCS, broken and hostile GMCP, VIEW, SIZE and
  SPANE records spliced into the runs, bad maps, cut-up and bit-flipped
  gzip, a 200 MiB gzip bomb (refused at the ceiling in well under a
  second), NaN/Infinity/cyclic objects: through `readSharedPayload` and
  `openReplay` (now with an optional `wall`) on a fake wall in happy-dom.
  No throw but the reader's own refusal, nothing added outside the root,
  no markup element anywhere, no prototype polluted, every case bounded.
- **e2e** (`tests/e2e/watch-sandbox.spec.ts`, Chromium and Firefox): the
  map demo and the runs demo play in the frame (the map worker from a
  blob draws the embedded subset; fonts registered; no CSP violation); a
  hostile payload (markup in the title, character, game text, Comm, room
  name, script pane title/text/hint, comment and tip, a url() colour)
  stays text; script evaluated in the frame finds an opaque origin and is
  refused `parent.document`, the parent's and its own `localStorage`,
  `sessionStorage`, `document.cookie`, `indexedDB`, `fetch` to the origin,
  an image from it, a top navigation and a popup, while the page keeps its
  URL, title, storage, cookie and DOM; a second `wc-play` is ignored; a
  payload the page refuses makes no frame; `/r/frame`'s policy names the
  document's script and style. The prod CSP walk
  (`tests/e2e-prod/csp.spec.ts`) checks the built site's `/r/frame` header
  (and the 307 of `/r/frame.html`), the app's `frame-src 'self'`, and
  plays a payload in the frame inside the app page without a violation,
  report-only and enforced.
- **For C2**: `openFrame({ container, bytes, onError, onPlay })` →
  `{ frame, payload, dispose }` (a `PayloadReadError` with a showable
  `text` when the page refuses the bytes). Download as HTML builds from
  `payload` with `buildReplayHtml(payload, { base: siteBaseUrl() })`
  (the default base, `document.baseURI`, is wrong under `/r/<id>`). Dev:
  `__wc.watchFrame({ session? | logs? | texts? | raw? })` and
  `?watchframe=<backup fixture>[&session=<id>]`.
- **Also fixed**: `worker/pub.ts` used a TypeScript parameter property,
  which Node's type stripping refuses, so `scripts/static-server.ts` (the
  prod smoke and CSP walk) could not start; it is a plain field now.
- **Entry chunk**: 31 193 bytes (31 192 before): the validator and the
  whitelist live in modules of their own so the app's chunk graph is
  unchanged.

## As built (stage 64 C3)

The admin page's moderation view (`worker/admin/page.ts`, branch
`stage64-admin`), round 12's point 6 as drawn, in the same three files
and under the same CSP (`script-src 'self'`, no inline code; every text
from the API set with `textContent`):

- **Two columns** (one under 900 px): Reports on the left; Published
  runs, An account and the Admin log on the right; the stage 59 sections
  follow under both. The page reads `/api/admin/reports` and
  `/api/admin/log` at load, after every action and every 60 s with the
  stats.
- **A queue item**: title, `hidden` / `shown`, sender, id, then from
  `GET /api/admin/pub/<id>` (one request per item, best effort) the
  character and level, size, views and date; the reasons with counts in
  a fixed order; "Reported by N accounts" and the newest report's time;
  the newest text. Watch opens `/r/<id>?admin` in a new tab (`noopener
  noreferrer`); the watch page's side of `?admin` is C2's.
- **Actions**: a shown run has Hide, Delete, Dismiss reports and Suspend
  <sender>; a hidden one Restore, Delete and Suspend. **Dismiss reports
  is `restore`** on a shown run (no change to the run, its reports
  handled, `pub.restore` in the log): the API has no dismiss of its own,
  so on a hidden run Restore is the only way to clear the queue item
  short of Delete. Each asks in a modal of the page with an optional
  note for the log (≤ 500); Delete of a run wants the id typed exactly
  (the page's own check; the API needs none), Delete of an account the
  name in any case (sent as `confirm`). Errors stay in the modal as a
  line of text (the API's code in words); success is one line under the
  header.
- **An account by name** (Suspend / Restore / Delete), with or without
  reports: the owner's only account tool until stage 66.
- **Not shown, since the API does not give them**: the reporters' names
  (only their count), "hidden after reports" vs "by the admin" (only
  `hidden`), the totals' Hidden and Views today, the largest run, and
  the log's `who` (`GET /api/admin/log` leaves it out). Adding any of
  them is a small Worker change if the owner wants it.
- **Tests**: `tests/unit/admin-page.test.ts` (11, happy-dom, a faked
  fetch: hostile titles, senders, characters, texts and notes as text;
  the confirmations, the calls with `X-WC: 1`, the reload, the empty
  state, errors, the log's 20 / all) and one more in
  `worker/test/admin.test.ts` (the three files behind Access, the CSP
  string unchanged, no HTML sinks in the script).
