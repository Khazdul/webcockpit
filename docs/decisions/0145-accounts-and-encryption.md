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
- **The account name is bound in.** Lowercased, it is the id in the
  wraps' associated data and the HKDF salt of the recovery code's
  keys. A wrap or a code of one account is worth nothing on another.
  The name can never change (decided above), and the module refuses a
  name that is not 3–20 of `a-z 0-9 _ -` after lowercasing, so there
  is one spelling.

### Derivations

`field(x)` = the length of `UTF-8(x)` as 16 bits big-endian, then the
bytes. HKDF is HKDF-SHA-256 (RFC 5869) with 32 bytes out. Every `info`
is the ASCII label shown.

```
master       = PBKDF2-HMAC-SHA-256(UTF-8(NFKC(password)), salt (16 random bytes), rounds, 32 bytes)
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
body    = 0x01 | S (segment size, 32 bits big-endian) | segment 0 | … | segment n-1
segment = nonce (12 random bytes) | AES-256-GCM ciphertext | tag (16)
associated data of segment i =
          0x01 | 0x53 "S" | field(kind) | field(id) | S (32 bits) | i (32 bits) | final (0x00 or 0x01)
```

The plaintext is cut into pieces of exactly S bytes (1 048 576 by
default); the last has 1 to S bytes and is the only one with
`final = 1`; an empty body is one final segment of no bytes. Every
segment but the last is therefore exactly `S + 28` bytes and there are
no length fields: a full frame followed by more bytes is not final,
what is left at the end is. A body costs `5 + 28 × segments` bytes
over its plaintext.

A body cut at a segment boundary fails because its last frame was
sealed with `final = 0`; a cut inside a segment or a changed byte
fails on the tag; reordered, duplicated and dropped segments fail on
the index; a segment of another body on kind and id; a changed header
because the version and S are in every segment's associated data. The
writer and the reader are async generators (and `ReadableStream`
wrappers) that hold one segment at a time. A streaming reader hands
out earlier segments before a cut is seen: each is authentic and in
its place, but only the stream's end without an error says the body
is whole, so a caller that writes as it reads must discard on error.
The reader accepts S up to 16 MiB.

### Nonces

Random, 96 bits, one per blob and one per segment, all under the data
key (wraps: under their kek, twice in an account's life per password
or code). NIST SP 800-38D asks for at most 2^32 encryptions under one
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
cancels by terminating it (PBKDF2 cannot be interrupted). A worker
that fails is reported (`worker_failed`), not silently replaced; the
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
  what makes the final marker sound, and the empty final segment rule.
- `bytes.ts`: `field` (lengths, ill-formed text) and `accountLabel`.
- JavaScript cannot promise that wiped bytes were never copied by the
  engine, and strings (the password, the recovery code) cannot be
  wiped at all. The wipes shorten exposure; they are not a guarantee.
- The vectors' generator against this section: it is the independent
  reading of the format.
