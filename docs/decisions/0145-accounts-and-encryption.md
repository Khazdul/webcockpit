# 0145 — Accounts without e-mail, data encrypted in the browser

- Status: Accepted (owner, 2026-11-13: user name and password, no
  e-mail; data is encrypted in the browser; no automatic deletion of
  accounts; no MUME password is ever stored). Not built.
- Date: 2026-11-13
- Related: intent Goal 13, spec §7.2–7.3, ADR 0144, ADR 0146.

## Context

Players are wary of handing their profiles and logs to somebody
else's server, and the repository is public, so the design is open to
everybody. The owner wants registration to be simple, no personal
data, and an honest explanation at registration of what happens to
the data.

## Decision

### Owner's decisions

- **User name and password. No e-mail address, ever.**
- **End-to-end encryption:** private data is encrypted in the browser
  with a key the server never sees.
- **Accounts are never deleted for inactivity.** The owner removes
  accounts by hand (ADR 0148).
- The user name is public: it is the sender's name on published runs
  and comments (ADR 0148). Registration says so.

### The account

- **User name:** 3–20 characters of `a-z 0-9 _ -`, unique without
  regard to case. It cannot be changed. A deleted account's name is
  never given out again (no impersonation of a known publisher).
- **Password:** at least 10 characters, no composition rules, a
  strength hint. The page warns against reusing the MUME password.
- **Recovery code:** shown once at registration, 24 characters in
  groups, with a download as a text file. The player confirms having
  kept it. It is the only way back after a forgotten password. A new
  one can be made on the Account page.
- **Forgotten password and lost code:** the cloud copy cannot be
  opened by anybody, us included. The data still on the player's
  devices is untouched and can go into a new account.

### Keys

All in the browser, with WebCrypto only (no new dependency):

```
password ─ PBKDF2-HMAC-SHA-256, 600 000 rounds, per-account salt ─► master (256 bit)
master ─ HKDF "wc-auth" ─► authKey   (sent to the server at login)
master ─ HKDF "wc-kek"  ─► kek       (never leaves the browser)
data key DK: random AES-256-GCM key, made at registration
server keeps: wrap(DK, kek), wrap(DK, recoveryKek), SHA-256(authKey),
              SHA-256(recoveryAuth), salt, KDF parameters
recovery code ─ HKDF ─► recoveryAuth, recoveryKek
```

- The server stores only `SHA-256(authKey)`. The expensive step is in
  the browser, so the Worker stays inside the free plan's 10 ms and is
  not affected by the Workers PBKDF2 cap. A leaked database gives an
  attacker one PBKDF2 run of 600 000 rounds per password guess.
- KDF name and parameters are stored per account, so they can be
  raised later at a login.
- `GET /api/auth/params?name=` returns the salt. For an unknown name
  it returns a stable fake salt (HMAC of the name with the server
  pepper), so names cannot be listed this way.
- **Changing the password** re-wraps DK; no data is re-encrypted.
  **Recovery** proves `recoveryAuth`, fetches `wrap(DK, recoveryKek)`,
  sets a new password and ends every session.
- **Each item** is AES-256-GCM under DK with a fresh 96-bit nonce and
  the item's kind and id as associated data, so the server cannot swap
  one item's blob for another's. Format byte first, for later changes.
- **Item ids are opaque.** Where the local key holds a name (profile
  name, `Character/time` run ids), the id sent to the server is an
  HMAC under a key derived from DK. The server sees kinds, sizes,
  counts and times, never names or contents.

### Sessions and the device

- A session is a random 256-bit token in a cookie: `HttpOnly`,
  `Secure`, `SameSite=Strict`, path `/api/u` (everything that needs a
  login lives there; the heartbeat and the public endpoints do not, so
  they never receive it), 180 days, renewed on use.
  The server stores its SHA-256, a device label ("Firefox on Linux")
  and the last use. State-changing requests must also carry our own
  header and a matching `Origin`.
- DK is kept on the device as a **non-extractable** `CryptoKey` in
  IndexedDB, so the player is not asked for the password on every
  visit and script code cannot read the key's bytes.
- Lua scripts stay sandboxed with no network (intent Goal 10); they
  cannot reach the account.
- The Account page lists the sessions and can end one or all.
- Log out asks whether the data stays on this device (default) or is
  removed from it.

### Abuse limits

- Turnstile on registration, on recovery, and on login after three
  failures.
- Registration: 3 per address an hour, 10 a day. Addresses are counted
  as an HMAC with a pepper that changes daily; no IP address is
  stored.
- Login: 10 failures per name in 15 minutes, then a 15-minute wait.
- The Workers rate limiting binding as a coarse net over `/api/*`.
- Per account: 2 MB of small items, 1 MB per item, 50 MB of run
  bodies and publications (ADR 0146); the owner can change an
  account's limits.

### What the player is told at registration

Short, on the page itself, before the button:

1. What is stored: your profiles, scripts, settings and saved runs,
   encrypted on this device before they are sent.
2. What we can see: your user name, when you were last here, how much
   you store. Not the contents.
3. What is never stored: your MUME name and password.
4. Your user name is public if you publish or comment.
5. There is no e-mail and so no "forgot password" mail: keep the
   recovery code.
6. You can delete the account and everything in it at any time.

### Deleting an account

On the Account page, after the password: everything is removed at once
(items, run bodies, sessions, publications, ratings and comments made
by the account). Only the reserved name remains.

## Alternatives

- **E-mail and a reset link.** Personal data, a mail provider, and it
  cannot be combined with end-to-end encryption without key escrow.
- **Passkeys only.** No password at all, but tying one account to a
  phone and a desktop from different vendors is where passkeys are
  still awkward, and the data key would need the PRF extension.
  Passkeys can be added later as a second way in.
- **Argon2id.** Stronger per second than PBKDF2 but needs a WASM
  dependency. The parameters are stored per account, so a move is
  open.
- **Server-readable data.** Simpler (search, server-side merge), but
  it makes us a target and makes the players' fear reasonable.

## Consequences

- The server cannot read, search, merge or repair private data. All
  conflict handling is in the client (ADR 0146). The admin tools show
  sizes and dates only.
- A cross-site scripting hole in the app would reach the data key's
  use (not its bytes) and the open data. Hence the CSP of ADR 0144,
  and the sandboxed frame for other people's replays (ADR 0148).
- Players must trust that the site serves the code in the repository.
  The About page links the commit of the running version (it already
  shows it).
- No account can be handed back to a player who lost both password
  and code. The registration page says this plainly.

## As built (stage 60, crypto)

2026-11-14. The module is `src/cloud/crypto/` (WebCrypto only). This
section is the format's description; its contract is
`tests/fixtures/cloud-crypto-vectors.json`, made with `node:crypto` by
`scripts/gen-cloud-crypto-vectors.ts`, a second implementation that
imports nothing from the module. A failing vector means the format
changed and stored data no longer opens: the file is never regenerated
to make a test pass.

### What differs from "Keys" above

- **A root key, not a wrapped data key.** What the two wraps hold is a
  random 32-byte *root*. The data key and the id key are both derived
  from it. A non-extractable AES key cannot be the input of a
  derivation, and the id key must be the same on every device, so
  something above both has to be wrapped. The root's bytes exist in
  script only between unwrap and derive and are then overwritten; no
  function of the module returns them to a flow's caller.
- **The account name is bound in.** Lowercased, it is part of the
  PBKDF2 salt, the id in the wraps' associated data and the HKDF salt
  of the recovery code's keys. A password guess, a wrap or a code of
  one account is worth nothing on another. The name can never change
  (decided above). The module refuses a typed name that is not 3–20
  of `A-Z a-z 0-9 _ -` and tests it before lowercasing (U+212A KELVIN
  SIGN lowercases to `k`), so there is one spelling.

### Derivations

`field(x)` = the length of `UTF-8(x)` as 16 bits big-endian, then the
bytes. HKDF is HKDF-SHA-256 (RFC 5869) with 32 bytes out. Every `info`
is the ASCII label shown.

```
master       = PBKDF2-HMAC-SHA-256(UTF-8(NFKC(password)), salt (16 random bytes) | field(name), rounds, 32 bytes)
authKey      = HKDF(master, salt = empty, info = "wc-auth")            → the server
kek          = HKDF(master, salt = empty, info = "wc-kek")             AES-256-GCM
code bytes   = the 15 bytes the recovery code spells
recoveryAuth = HKDF(code bytes, salt = UTF-8(name), info = "wc-recovery-auth")   → the server
recoveryKek  = HKDF(code bytes, salt = UTF-8(name), info = "wc-recovery-kek")    AES-256-GCM
root         = 32 random bytes
dataKey      = HKDF(root, salt = empty, info = "wc-data")              AES-256-GCM
idKey        = HKDF(root, salt = empty, info = "wc-id")                HMAC-SHA-256, sign only
wrapPw       = blob(kek,         kind = "wrap-pw", id = name, root)    61 bytes
wrapRc       = blob(recoveryKek, kind = "wrap-rc", id = name, root)    61 bytes
opaque id    = base64url(first 16 bytes of HMAC-SHA-256(idKey, field(kind) | field(localKey)))   22 characters
```

- `kek`, `recoveryKek`, `dataKey` and `idKey` are made with
  `deriveKey`, non-extractable: their bytes never exist in script.
- **Password normalisation: NFKC**, then UTF-8. A password typed with
  composed characters on one device and decomposed ones on another
  gives the same key, and so do full-width and ligature forms. Nothing
  else is done: no trimming, no case folding. (NFKC of characters a
  browser's Unicode tables do not know yet can differ between browser
  versions; that touches only passwords with brand-new characters.)
- **The PBKDF2 salt is the server's 16 bytes followed by
  `field(name)`.** The salt comes from the server (`/api/auth/params`),
  and a hostile or broken server could answer every name with one
  salt, so that one guessed password is tested against all accounts
  at the price of one. With the name in the salt, each account's
  derivation is its own whatever the server says.
- **KDF parameters are checked in the browser:** the name must be
  `pbkdf2-sha256`, the rounds a whole number from 600 000 to
  10 000 000, the salt 16 bytes. Anything else is refused before any
  work (`bad_kdf`), in the client and again in the worker, so a
  hostile answer can neither weaken the key nor hang the device.
  Moving to another KDF later means a new name that newer clients
  accept.

### Recovery code

15 bytes from `getRandomValues` (120 bits) as 24 characters of
Crockford's base32, `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (no I, L, O,
U), five bits a character from the most significant end: a one-to-one
mapping with no modulo, so no bias. Canonical form: upper case in six
groups of four with hyphens. The parser ignores case, spaces, hyphens,
dashes, dots and underscores and reads O as 0 and I or L as 1;
anything else gives no code. There is no check character: a mistyped
code is a failed recovery attempt at the server.

### Blob (items and wraps)

```
blob            = 0x01 | nonce (12 random bytes) | AES-256-GCM ciphertext | tag (16)
associated data = 0x01 | 0x42 "B" | field(kind) | field(id)
```

The length prefixes make `kind | id` unambiguous; the version byte is
authenticated with them. Opening reports three different failures: an
unknown version byte (a newer client wrote it: the caller keeps the
item untouched and asks for an update; checked before the length), a
malformed blob (empty or under 29 bytes), and a failed authentication
(the wrong key, kind or id, or changed bytes). In the login and
recovery flows a failed authentication of a wrap is reported as
`wrong_password` or `wrong_code`.

### Segmented body (run bodies)

```
body    = 0x01 | S (segment size, 32 bits big-endian) | body id (16 random bytes) | segment 0 | … | segment n-1
segment = nonce (12 random bytes) | AES-256-GCM ciphertext | tag (16)
associated data of segment i =
          0x01 | 0x53 "S" | field(kind) | field(id) | S (32 bits) | body id (16) | i (32 bits) | final (0x00 or 0x01)
```

The body id is drawn anew every time a body is written and is in every
segment's associated data. Kind and id name the run; the body id names
one writing of it. Without it, two bodies stored under the same kind
and id (a run saved again, an upload retried) could be spliced: segment
i of the one opened at position i of the other.

The plaintext is cut into pieces of exactly S bytes (1 048 576 by
default); the last has 1 to S bytes and is the only one with
`final = 1`; an empty body is one final segment of no bytes. Every
segment but the last is therefore exactly `S + 28` bytes and there are
no length fields: a full frame followed by more bytes is not final,
what is left at the end is. A body costs `21 + 28 × segments` bytes
over its plaintext.

A body cut at a segment boundary fails because its last frame was
sealed with `final = 0`; a cut inside a segment or a changed byte
fails on the tag; reordered, duplicated and dropped segments fail on
the index; a segment of another body on the body id (and on kind and
id when those differ); a changed header because the version, S and
the body id are in every segment's associated data. The
writer and the reader are async generators (and `ReadableStream`
wrappers) that hold one segment at a time. A streaming reader hands
out earlier segments before a cut is seen: each is authentic and in
its place, but only the stream's end without an error says the body
is whole, so a caller that writes as it reads must discard on error.
The reader accepts S up to 16 MiB.

### Nonces

Random, 96 bits, one per blob and one per segment, all under the data
key (wraps: under their kek, twice in an account's life per password
or code). A body's 16-byte id is random too. NIST SP 800-38D asks for at most 2^32 encryptions under one
key with random nonces, for a collision chance under 2^-32. An item
written every second reaches that in 136 years; a full 20 MB body is
20 encryptions. A counter-based scheme was not taken because several
devices write under the same key without knowing of each other.

### The KDF worker

`kdf.worker.ts` runs PBKDF2 and the two HKDF steps and posts back the
`authKey` bytes and the `kek` as a non-extractable `CryptoKey`
(structured clone). The master never reaches the page's thread and is
overwritten in the worker. `kdf-client.ts` starts the worker on the
first request, shares it, ends it 30 s after the last answer, and
cancels by terminating it (PBKDF2 cannot be interrupted). A request
the worker has not answered after 120 s fails with `worker_failed`
and the worker is terminated, so the page never waits for ever. A
worker that fails is reported (`worker_failed`), not silently replaced; the
caller may ask for the same derivation on its own thread (`inline`).
Measured by `tests/e2e/cloud-crypto.spec.ts` on the development
machine at 600 000 rounds: about 85 ms in Firefox, 60 ms in Chromium
and in the phone profile, 110–180 ms with the worker's start; the
page's 5 ms timer never waited more than 50 ms. A phone will take
several times longer; the pages show "Working…" (spec §7.3).

### What a reviewer should look at

- `kdf.ts`: the bounds (`checkKdf`), and that the unchecked derivation
  is reachable only from tests (it is not exported by `index.ts`).
- `account.ts`: every flow wipes the root in a `finally`; the wrong
  password and wrong code mapping; the order of random draws.
- `segments.ts`: the two "only when more follows" loops, which are
  what makes the final marker sound, the empty final segment rule,
  and the body id in every segment's associated data.
- `bytes.ts`: `field` (lengths, ill-formed text) and `accountLabel`.
- JavaScript cannot promise that wiped bytes were never copied by the
  engine, and strings (the password, the recovery code) cannot be
  wiped at all. The wipes shorten exposure; they are not a guarantee.
- The vectors' generator against this section: it is the independent
  reading of the format.

### Changed after the review (2026-11-14)

The independent review of stage 60 found the following; all are fixed
and the text above describes the result. Nothing was stored anywhere
yet, so the formats changed without a new version byte and the vectors
were regenerated this once.

- **Segments of two bodies under one kind and id could be mixed.** A
  random 16-byte body id is now in the header and in every segment's
  associated data.
- **The PBKDF2 salt was whatever the server said.** It is now the
  server's salt followed by `field(lowercased name)`. The name is an
  argument of `derivePasswordKeys(name, password, salt, kdf)`, of the
  worker's message and of `derivePasswordLogin(name, password,
  params)`.
- **`accountLabel` tested the name after lowercasing**, which let
  U+212A through as `k`. It tests the typed name first.
- **A worker that never answered left the page waiting.** A 120 s
  timeout per request.
- **Generator and fixture could drift apart unseen.** A unit test runs
  the generator's `--check`.

### Known limits

- **Changing the password or recovering re-wraps the same root.**
  Whoever once held an old password (or code) and an old wrap can
  still open what is written later. Rotating the root would mean
  encrypting every item and body again from a device; it is not built.
- **Item blobs carry no freshness.** A hostile server can hand back an
  older blob of the same kind and id and it opens. Whether the client
  guards against that (the item's `rev` inside the blob, for one) is
  stage 61's decision.
- **The version byte is not authenticated on the `unknown_version`
  path.** Anyone who can change a blob can make it read as "written
  by a newer client". The item is kept untouched and nothing is
  decrypted, so the cost is an update notice that is not true; stage
  61 decides what the client shows and how often.
- **`wrong_password` from `unlockWithPassword` after the server
  accepted the `authKey`** is not a typing mistake: the wrap is
  corrupt or belongs to something else. The page should say so
  instead of asking for the password again.

## As built (stage 60 part A, server, 2026-11-14)

Checked in workerd (`worker/test/auth.test.ts`) and once by hand under
`wrangler dev` 4.162.0 with Cloudflare's Turnstile test keys (a real
siteverify call); not yet against a deployed Worker. The browser's
crypto and the pages are other parts of the stage. Code:
`worker/auth.ts` (routes and handlers), `accounts.ts` (the row, the
checks on input), `sessions.ts`, `attempts.ts`, `turnstile.ts`,
`bytes.ts`; tables: `worker/migrations/0002_accounts.sql`; types and
constants: `shared/cloud/api.ts`. The API table is in
`docs/stages/60-accounts.md`.

### What a request passes

In this order: the flag `accounts` (off: 404 `not_found` for every path
under `/api/auth/` and `/api/u/`); the general rate limit; route and
method; for anything but GET and HEAD, `X-WC: 1` and an `Origin` equal
to the request URL's origin (403 `forbidden`); the secrets (503
`accounts_not_configured`); the database (503 `unavailable`, also when
a statement fails); under `/api/u/`, the session (401 `unauthorized`
with the cookie cleared). Nothing is logged: no body, name, token or
address.

### What is stored

- `account.id` is 128 random bits (it will name R2 objects, and a
  deleted account's id must not come back). `name` is as typed,
  `name_key` its lowercase with the UNIQUE index.
- Binary values are stored as they travel, base64url text without
  padding, and are accepted only in their one canonical spelling. Sizes:
  salt exactly 16 bytes, `authKey` and `recoveryAuth` 32, a wrap 40–200; KDF
  `pbkdf2-sha256` with 600 000 to 10 000 000 rounds. A body is at most
  4096 bytes and may hold no unknown field.
- `auth_hash` and `recovery_hash` are SHA-256 of the 32 bytes, compared
  in constant time. No salt of the server's own: the keys are 256 bits
  from a KDF, not passwords.
- A session row is keyed by SHA-256 of the cookie's token and has a
  public random `id` (96 bits) for the Account page. A label is cut to
  what is printable ASCII, 40 characters.
- Names nobody can register: those of deleted accounts
  (`reserved_name`) and a built-in list (`BUILTIN_RESERVED` in
  `accounts.ts`: admin, moderator, webcockpit, mume, …).

### Sessions

- `__Secure-wc_s=<43 characters>; HttpOnly; Secure; SameSite=Strict;
  Path=/api/u; Max-Age=15552000`. It is not sent to `/api/auth/*`, so a
  login from a logged-in browser makes one more session and leaves the
  old one to the Account page or its expiry.
- Renewal: when the last renewal is 24 hours old, one batch moves
  `last_used` and `expires` and the account's `last_seen`, and the
  cookie is sent again. Every other authenticated request reads and
  writes nothing but what it is for. `lastUsed` on the Account page is
  therefore up to a day old.
- Expired sessions answer 401 at once and are removed by the daily
  cron.

### Counters and limits

`attempt(key, start, count, until)`: a fixed window that starts with
its first try.

- **Per name** (`login|…` and `recover|…`): the key is
  `HMAC-SHA-256(AUTH_PEPPER, "wc-name|" + name_key)`, never the name
  (people type passwords into name fields; a login with a name that is
  not of the allowed form is 400 and counts nowhere). A try is counted
  in one atomic statement *before* it is looked at, and a success
  removes the row; tries that race each other are therefore all
  counted. With three in the window, a login asks for Turnstile first
  (missing: 403 `turnstile_required`; failed: 403 `turnstile`; neither
  counts). The tenth try sets `until` = now + 15 minutes and is itself
  still looked at; after it everything for that name answers 429
  `locked` with `retryAfter`, the right password included, without a
  write or a Turnstile call.
- **An unknown name and a wrong key are the same code path**: the same
  statements, the same counter, a compare against a constant when there
  is no row. A test compares status, body and headers of the two
  through every stage.
- **Recovery** has its own counter with the same lock. The first call
  always needs Turnstile; the second none. A success clears it; the
  second call also clears the login counter.
- **The password asked again** (`password`, `recovery`, delete) counts
  on the login counter and honours its lock, without Turnstile.
- **Per address** (`reg-h|…`, `reg-d|…`): the key is
  `HMAC-SHA-256(dailyPepper, address)` with `dailyPepper =
  HMAC-SHA-256(AUTH_PEPPER, "wc-addr|" + UTC day)`. Only a registration
  that made an account counts (in the same transaction). Over the
  limit is 429 `rate_limited` before Turnstile is asked.
- **The general limit** (`API_LIMITER`, 120 a minute): keyed by the
  hash of the session token when a request under `/api/u/` carries a
  well-formed one, else by the address. The address is a key in passing
  and stored nowhere.
- **Pruning** at 00:10 UTC: counters whose window began more than a day
  ago and that hold no running lock; sessions past their end.

### Turnstile

`POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with
`{secret, response}` as JSON and a 5 s timeout, no retry, no `remoteip`
(the address is not sent on). `success: true` passes. `success: false`
is 403 `turnstile`, except with an error code that says our request or
secret is wrong (`invalid-input-secret`, `missing-input-secret`,
`bad-request`, `internal-error`): those, a status that is not 200, a
body that is not JSON and a network failure are 503 `unavailable`,
never a pass. `TURNSTILE_HOSTNAMES` (optional, comma separated) is
checked against the answer's `hostname`; Cloudflare's test keys answer
`example.com`, so it stays unset while they are in use.

### Fake parameters

For a name without an account, possible or not, `params` answers the
first 16 bytes of `HMAC-SHA-256(AUTH_PEPPER, "wc-fake-salt|" +
lowercase name)` and the default KDF, with the same keys in the same
order and the same headers as a real answer. Both the lookup and the
HMAC are done for every name.

### Trade-offs and what is not covered

- **Anybody can lock a known name out for 15 minutes** with ten wrong
  logins, again and again, and the lock also stops that account's
  password change, new recovery code and deletion (its sessions and,
  later, its sync go on working). The alternative, counting per name
  and address, lets a spread-out attacker guess without limit. Recovery
  can be locked the same way, on its own counter.
- **Counting unknown names costs writes**: each failed login or
  recovery is one row written (a locked name none). One address can
  cause at most 120 a minute through the general limit; many addresses
  could eat into D1's daily write budget. The admin page's estimate
  does not count these writes yet.
- **Names can be listed anyway**, through registration (409
  `name_taken`), at the price of a Turnstile pass per name. Names are
  public by design (they sign published runs); the fake parameters
  only keep the cheap, unauthenticated way closed.
- **The fakes are not perfect over time.** When the default KDF is
  raised, fakes say the new default and old real accounts their old
  rounds, until those accounts are moved at a login. A real salt
  changes with the password and a fake never does. A deleted account's
  name answers a fake that is not its old salt.
- **Changing `AUTH_PEPPER`** changes every fake salt (so names made
  after and before can be told apart by somebody who kept old answers)
  and forgets the running counters and locks. Nothing else depends on
  it: no account is lost.
- **The registration limit is per address as Cloudflare reports it**: a
  whole IPv6 address, not its /64, and the hour and the day both start
  afresh at midnight UTC with the new pepper (so six in a row are
  possible across midnight). Turnstile is the real gate. Registrations
  racing each other from one address can pass the count by the number
  that race.
- **Timing.** The known and the unknown name run the same statements,
  but a successful login does more (a batch, the session list); only
  the holder of the right key sees that.
- **The cookie is `__Secure-`, not `__Host-`**, because its path is
  `/api/u`. A page on another host under `mumecockpit.com` (staging is
  one) could therefore set a cookie of the same name for the whole
  domain, and so put a visitor into a session of the attacker's own
  account on production. Staging is ours; no other subdomain should
  ever serve untrusted pages. When two cookies of the name arrive, the
  first is used.
- **`Origin` is compared with the request URL's origin**, so the rule
  holds on every host the Worker answers on (the domain, staging,
  workers.dev) without a list.
- **Deleting an account** leaves its attempt counters to the cron and
  removes everything else in one transaction; later stages add their
  tables there (the places are marked in `auth.ts`), and R2 objects,
  which are outside the transaction, will need a sweep.

### What a deploy needs

- Migration `0002_accounts.sql` (adds tables only).
- Secrets on each Worker: `AUTH_PEPPER` (random, at least 16
  characters) and `TURNSTILE_SECRET`. Staging uses Cloudflare's test
  secret `1x0000000000000000000000000000000AA` with the test site key
  until the owner has made the widget.
- Vars (in `wrangler.jsonc`): `FLAG_ACCOUNTS` (staging on, production
  off), `TURNSTILE_SITE_KEY` (production empty until the widget
  exists), later `TURNSTILE_HOSTNAMES`.
- The rate limiting binding `API_LIMITER` (namespaces 5903 and 5904).

### After the review (2026-11-14)

Changes made after the independent review of the server. Where they
differ from the text above, this list holds.

- **An address as a key is its IPv4 address or the /64 of its IPv6
  address** (`worker/address.ts`; IPv4-mapped addresses count as the
  IPv4 address, anything unparsable as the one key `unknown`). Used by
  both limiters and, hashed, by the registration counters. One IPv6
  customer can no longer walk through 2^64 keys.
- **A second, tight limiter `AUTH_LIMITER`**: 10 a minute per address
  on `POST /api/auth/login`, `/recover` and `/register`, checked after
  the method and the CSRF rule and before any database work or
  Turnstile call. It bounds what one address can cost in D1 writes
  (failed tries for made-up names) to 10 a minute instead of 120.
- **The general limiter counts the address first, always, and the
  session as well** when a request under `/api/u/` carries a token;
  both before the session is looked up. A made-up cookie therefore
  costs no database read once its address is over the limit. (Players
  behind one address now share its 120 a minute.)
- **The recovery ticket.** The first recover call answers `{wrapRc,
  ticket}`; the second must carry the ticket. It is stateless: 8 bytes
  of expiry and `HMAC-SHA-256(AUTH_PEPPER, "wc-recover-ticket|" +
  name_key + "|" + expiry + "|" + recovery_hash)`, base64url, good for
  15 minutes, compared in constant time. A second call without a valid
  ticket for that name is 401 `invalid_recovery` and neither counts
  nor writes, for a real and an unknown name alike; so the call that
  needs no Turnstile can no longer be used to lock a name's recovery
  or to guess. With a valid ticket the call is as before: counted, and
  `recoveryAuth` is checked again. A ticket dies when the recovery
  code is replaced; it is not single-use within its 15 minutes (it is
  only ever given to somebody who proved the code).
- **A success takes back only its own try.** Before, a success removed
  the name's counter, so an outsider who had made three failures could
  see the owner's next login as `turnstile_required` going away. Now a
  success lowers the count by the one it added (and undoes the lock
  only if that very try had set it); failures stay until their window
  ends, and the cron removes the rows. This holds for login, the
  password questions and recovery. The second recover call no longer
  clears the login counter: after a recovery, a login lock made by
  somebody else's failures runs its 15 minutes (the session the
  recovery made works meanwhile). A lock is also set by any try that
  finds the count at ten or more with no lock running.
- **The password questions change nothing when the password changed
  meanwhile.** `password`, `recovery` and delete compare `authKey` with
  the row read at the start of the request; their statements now also
  require `auth_hash` to be that same value still (the other sessions
  end only when the row holds the new password; the delete's statements
  are each guarded, the account row last). Otherwise 401
  `invalid_login`, with nothing changed and no session ended.
- **A 401 under `/api/u/` clears the cookie only when the request
  carried a cookie of our name** (of any value).
- **Everything after the flag check is inside the catch-all**: a
  limiter binding that throws is 503 `unavailable`, as a failing
  database is. (`flags()` itself falls back to the defaults.)
- **`tests/unit/cloud-contract.test.ts`** ties the KDF name, default
  rounds, bounds, salt size and key size of `shared/cloud/api.ts` to
  those of `src/cloud/crypto/kdf.ts`.

Two notes:

- **`state = 'suspended'` does not affect login or sessions.** A
  suspended account logs in, keeps its sessions and syncs (spec §7.2);
  sharing, voting and commenting will check the state where they are
  built. The Account page is told the state.
- **A session's label is untrusted text.** The server cuts it to 40
  printable ASCII characters and nothing more (`<`, `&` and quotes are
  printable): the Account page must write it as text, never as markup.

A deploy now also needs the rate limiting binding `AUTH_LIMITER`
(namespaces 5905 production, 5906 staging; in `wrangler.jsonc`).

## As built (stage 60 part B, the client core, 2026-11-14)

`src/cloud/account/`: the API client, the device's store, the flows the
pages drive, the checks, and the start page's state. No page yet;
nothing imports the module, so the production bundle is unchanged. The
guide for the pages' author is the header of `index.ts`.

| File | Holds |
|---|---|
| `state.ts` | is the feature on, who is logged in here; the one file the start page imports |
| `api.ts` | one function per endpoint, typed results, the answers checked |
| `store.ts` | the account record and the two keys in IndexedDB |
| `flows.ts` | register, log in, recover, log out and the logged-in flows |
| `checks.ts` | name, password, strength hint, recovery code |
| `kdf-time.ts` | the remembered time of the slow step, for the Working bar |

### Where the account lives on the device

- **A database of its own, `webcockpit-account` (version 1)**, one
  record: the name as the server spells it, `created`, this device's
  label, when it logged in, and the two non-extractable `CryptoKey`s
  (`dataKey`, `idKey`) stored as objects. Not version 9 of the main
  database, where spec §7.4 puts the sync state: that version is stage
  61's, stage 60 must not migrate anybody's main database, and with the
  flag off nothing on a device may change. "Remove the account from
  this device" is one operation: the database is deleted. No connection
  is kept open (open, one transaction, close), and a read where there
  is no account leaves no database behind.
- **Nothing else secret is stored.** No password, recovery code, root
  or wrap. `wrapPw` is fetched with `GET /api/u/account` when a
  password question needs it (change password, new recovery code). The
  session is the HttpOnly cookie; the page never sees it.
- **A hint in localStorage** for the start page: `wc.account`
  (`{"name":"Olev"}` while logged in) and `wc.account.last` (the last
  name, the Log in page's prefill). Read synchronously, so the start
  page needs neither IndexedDB nor a request to draw its entry, and the
  `storage` event keeps other tabs in step. The name is public; the
  hint is not the truth. A hint without stored keys, or a session the
  server no longer knows, ends as logged out when a flow notices.
  `wc.kdfMs` remembers the last derivation's time (per 600 000 rounds).
- **What enumerates storage:** nothing in `src/` lists IndexedDB
  databases or localStorage keys; the exports ("Download everything",
  the script and run backups) read named stores of the main database
  only, so no export can meet the keys (which could not be serialised
  anyway). `tests/e2e/phone-auto-login.spec.ts` walks every database,
  and is unaffected (the account database does not exist there).

### The rules of the flows

- **Gate.** No account request unless the page may call the API and
  the flag `accounts` is on (`accountsEnabled`); otherwise `disabled`,
  and nothing is sent or stored.
- **Results, not exceptions.** Every call resolves to `ok` or a code.
  An answer is checked against the contract before it is used
  (`bad_answer` otherwise); a bare 401 without the server's
  `unauthorized` is not taken for one.
- **A 401 `unauthorized` from `/api/u/*`** means the session is gone
  (ended elsewhere, the password changed, the account deleted): the
  device is logged out locally (the database deleted, the hint cleared,
  the last name kept) and the flow answers `unauthorized`. Nothing of
  the player's own data is touched by anything in stage 60.
- **Log out** asks the server and then always removes the keys. When
  the server cannot be reached the device is logged out all the same
  and the result says `unreached`: the session stays valid on the
  server until it is ended from another device or runs out, and the
  page says so. No keep-or-remove choice for local data yet (stage 61).
- **The KDF worker failing** (`worker_failed`: it could not start,
  died, or was silent for two minutes): the flow runs the same
  derivation once on the page's thread (`inline`) and tells the page.
  A player must not be locked out of an account because a worker could
  not start, and WebCrypto's PBKDF2 is asynchronous on the page's
  thread too; it is the guarantee of a free thread that is lost, not
  correctness. If that fails too, `worker_failed`. (The CSP of part B
  must allow the worker: `worker-src 'self'`.)
- **A wrap that does not open after the server accepted the key**
  (login, recovery) is `corrupt_wrap`, not a wrong password ("Known
  limits"). The session the server made for a login is ended again: no
  keys, no login.
- **A wrong old password in change password and new recovery code** is
  found on the device (the key does not open the wrap) before the
  server is asked, and is reported as `invalid_login`, the server's
  own word for it. Such a miss is not counted by the server; it is not
  an online guess either (whoever holds the session already holds the
  wrap).
- **Turnstile retries do not derive again.** Register, log in and
  recover are objects that keep what was derived (never the password)
  between submits, so a submit with a token after
  `turnstile_required`, or after a network failure, costs no second
  run of the KDF. Recovery keeps the ticket and resends only its
  second call.
- **Cancel** reaches as far as the derivation. From the request that
  changes the account on, a flow is not cancelled.
- **Before the slow step** the flows check that the device can keep a
  non-extractable key in IndexedDB (a throwaway key in a throwaway
  database), so an account is not made on a device that cannot hold
  it. If the store fails after registration all the same, the result
  still carries the recovery code and says the device is not logged
  in.
- **A lost answer at registration.** When a register request may have
  reached the server (`timeout`, `offline`, `bad_answer`) and the next
  submit of the same flow is told `name_taken`, the flow tries a login
  with its own `authKey`: only its own account opens, and the code it
  returns is then the one the server holds.

### Known limits (client)

- **A lost answer elsewhere is not repaired.** After a `timeout` on a
  password change the password may or may not be changed; on a new
  recovery code the old code may already be dead and the new one was
  not shown. The pages must say so (the guide lists it); the player
  can always make another code with the password.
- **Logging in over another account** on the same device replaces the
  stored keys and the cookie; the old session stays on the server
  until it runs out. The pages do not offer Log in while logged in.
- **The `Secure`, `__Secure-` cookie on the dev server's plain
  `http://localhost`** was not tried: the e2e fake simulates the
  cookie. The real cookie is first exercised on staging.
- **The strength hint** knows length and variety only (its rule is in
  `checks.ts`); it is a hint, and says so.

### What a reviewer should look at

- `flows.ts`: that no password, code or key outlives its flow (the
  closures of `startRegister`, `startLogin`, `startRecover` and their
  `drop`), the mapping of crypto errors (`failureOf`, `unwrapFailure`,
  `wrongPassword`), `deriver` (the inline rule), `authed` (the 401
  rule), and the register flow's login-with-its-own-key.
- `api.ts`: `failureOf` and the parsers (what is passed on from an
  answer), `credentials: 'same-origin'`, `X-WC`.
- `store.ts`: `isStoredAccount` (only non-extractable keys of the right
  kinds are written or read back), and that nothing else is written.
- `state.ts`: that it imports no crypto and makes no request beyond the
  shared `/api/config`.
- `tests/e2e/cloud-account-fake.ts` against `worker/auth.ts`: the fake
  is the contract the page specs will be written against.

## As built (stage 60 part B, the pages, first half, 2026-11-14)

The Account row on the start menu, Log in, Create account, the
recovery code page and Recovery (`src/chrome/frames/account/`, one lazy
chunk; `docs/stages/60-accounts.md` has the list of differences). What
was decided while building:

- **The account pages replace each other** on the frame stack instead
  of stacking (`go` in `form.tsx`). The recovery code is then never
  under another frame and never reachable by Back; it lives in the
  props of the one frame that shows it and nowhere else.
- **A password stays in a field's state while the form shows it**, so
  that a try that failed on the network or was asked for Turnstile can
  be sent again without typing; it is cleared on `invalid_login` and
  goes with the page. The flow object is dropped when the name or the
  password is edited and when the page leaves.
- **Turnstile** is loaded by one `<script src>` element made when a
  form needs a check (never at start, never for Log in before
  `turnstile_required`), rendered explicitly, and removed with its
  page. A token is taken out of the widget once and the widget reset
  at once. Cloudflare draws it in a closed shadow tree: the page
  cannot focus it, so the Tab ring stops at an element before it and
  the browser's own Tab goes in; when it passes, the page takes the
  keyboard back.
- **The forms are real `<form>` elements handled in script**
  (`form-action 'none'` holds), with `name` and `autocomplete` on the
  fields for the browsers' password managers. Not seen working with
  one.
- **Corrections to what was written above.** "Part A": the CSRF rule
  did *not* hold through Vite's proxy: its string form sends the
  Worker's own `Host`, so every POST from the dev page was 403. The
  proxy now keeps the page's `Host`. "Known limits (client)": the
  `__Secure-` cookie on plain `http://localhost` and
  `http://127.0.0.1` is accepted and sent back by Chromium and Firefox
  (loopback counts as secure); any other plain-http host will refuse
  it.
