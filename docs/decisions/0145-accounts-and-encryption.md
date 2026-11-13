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
- Per account: 5 MB of small items, 1 MB per item, 250 MB of run
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
