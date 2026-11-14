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
  salt 16–32 bytes, `authKey` and `recoveryAuth` 32, a wrap 40–200; KDF
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
