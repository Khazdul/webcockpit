# Stage 60 — Accounts

Status: **In progress.** Part A (server) and the crypto module are being
built; the pages a player sees wait for the owner's choice of mockup.

## Goal

A player can make an account with a user name and a password, log in on
another device, get back in with the recovery code, and delete the
account (intent Goal 13, spec §7.2, §7.3, §7.10, §7.11, ADR 0145).
Nothing is synced yet: stage 60 makes the account, the keys and the
sessions that stages 61–65 stand on.

## What must be true afterwards

- Spec §7.0 holds: no account call is awaited on the game path; logged
  out is today's client; everything is dark in production until the
  flag `accounts` is on; nothing new shows on the start page before the
  owner has picked the mockup (rule 6).
- The server never sees the password, the master key, the key that
  wraps the data key, or the data key. It stores `SHA-256(authKey)`,
  `SHA-256(recoveryAuth)`, the salt, the KDF parameters and two wrapped
  copies of the root key.
- "No such name" and "wrong password" cannot be told apart, by answer,
  by status or by the Turnstile and lock behaviour.
- No IP address is stored: addresses are counted as an HMAC with a
  pepper that changes daily.
- Every format the crypto module writes has a checked-in test vector.

## Decisions taken at the start (ADR 0145, addendum of 2026-11-14)

- **Flag:** `accounts` (`FLAG_ACCOUNTS`: staging on, production off).
  Off: `/api/auth/*` and `/api/u/*` answer 404 `not_found`.
- **Root key.** What is wrapped is a random 32-byte *root*. On unwrap
  the browser derives from it, with HKDF, the data key (AES-256-GCM)
  and the id key (HMAC-SHA-256), both non-extractable `CryptoKey`s, and
  drops the root's bytes. (A non-extractable AES key cannot itself be
  the input of a derivation, and spec §7.3 wants `idKey` derived.)
- **Wire format:** binary values are base64url without padding.
  `salt` 16 bytes, `authKey` and `recoveryAuth` 32 bytes, a wrap is a
  blob of spec §7.3 (`version | nonce | ciphertext`, 61 bytes today).
- **Recovery code:** 24 characters of a 32-letter alphabet without
  look-alikes (120 bits), shown in six groups of four.
- **Secrets on the Worker** (dashboard, never in the repository):
  `AUTH_PEPPER` (random; the fake salts and the daily address pepper
  are derived from it) and `TURNSTILE_SECRET`. The site key is a var
  (`TURNSTILE_SITE_KEY`). Without them the account endpoints answer 503
  `accounts_not_configured`. Staging runs on Cloudflare's published
  Turnstile test keys until the owner has made the widget (part C).
- **Session cookie:** `__Secure-wc_s`, `HttpOnly`, `Secure`,
  `SameSite=Strict`, `Path=/api/u`, 180 days, renewed at most once a
  day (one D1 write). The server keeps the token's SHA-256.
- **State-changing requests** under `/api/auth/` and `/api/u/` need
  `X-WC: 1` and an `Origin` equal to the site's, else 403 `forbidden`.
- **Recovery is one endpoint in two calls:** the first proves
  `recoveryAuth` with Turnstile and gets the wrap; the second proves it
  again and sets the new password (a Turnstile token works once, and
  the code's 120 bits cannot be guessed; failures count toward the
  name's lock).
- **Password again** for: change password, new recovery code, delete
  account. (A new recovery code needs the root's bytes, which the
  device does not keep, so the password is needed anyway.)
- **Changing the password ends the other sessions.**
- **Where the client keeps the account and the keys** is part B's
  (IndexedDB; spec §7.4 puts them in `syncMeta` of version 9, which is
  stage 61's).

## API (contract; types in `shared/cloud/api.ts`)

All bodies JSON. Errors `{error}`; every account endpoint can also
answer 404 `not_found` (flag off), 429 `rate_limited`, 503
`unavailable` / `accounts_not_configured`, 400 `bad_request`, 403
`forbidden`; under `/api/u/` 401 `unauthorized`.

| Endpoint | Body → answer |
|---|---|
| `GET /api/config` | `{flags, turnstileSiteKey, limits, time}` (max-age 60) |
| `GET /api/auth/params?name=` | `{salt, kdf: {name: "pbkdf2-sha256", rounds}}`; a stable fake for an unknown name |
| `POST /api/auth/register` | `{name, salt, kdf, authKey, recoveryAuth, wrapPw, wrapRc, label, turnstile}` → 201 `{account}` and the cookie. 409 `name_taken`, 403 `turnstile`, 429 `rate_limited` |
| `POST /api/auth/login` | `{name, authKey, label, turnstile?}` → `{account, wrapPw}` and the cookie. 401 `invalid_login`, 403 `turnstile_required`, 429 `locked` with `retryAfter` (s) |
| `POST /api/auth/recover` | `{name, recoveryAuth, turnstile}` → `{wrapRc}`; with `set: {salt, kdf, authKey, wrapPw}` and `label` (no Turnstile) → `{account}`, the cookie, every older session ended. 401 `invalid_recovery`, 429 `locked` |
| `POST /api/u/auth/logout` | 204, the cookie cleared |
| `GET /api/u/account` | `{account}`: name, created, state, usage, limits, sessions (id, label, created, lastUsed, current), prefs |
| `POST /api/u/account/password` | `{authKey, set: {salt, kdf, authKey, wrapPw}}` → 204; other sessions ended. 401 `invalid_login` |
| `POST /api/u/account/recovery` | `{authKey, recoveryAuth, wrapRc}` → 204 |
| `DELETE /api/u/account/sessions/<id>` | 204; `<id>` = `others` ends all but this one |
| `PATCH /api/u/account/prefs` | `{galleryNotice: boolean}` → `{prefs}` |
| `DELETE /api/u/account` | `{authKey}` → 204; everything the account owns removed, the name reserved |

Limits (spec §7.10): registration 3 an hour and 10 a day per address;
login 10 failures per name in 15 minutes → 15 minutes' wait, Turnstile
from the fourth try; 120 requests a minute per session or address on
`/api/auth/*` and `/api/u/*`.

## Tasks

### A. Server (building agent, worktree `stage60-server`)

- [ ] Migration 0002: `account`, `reserved_name`, `session`, `attempt`
      (spec §7.11; later stages' tables come with their stages).
- [ ] The flag `accounts`; `/api/config` with the site key, limits and
      time.
- [ ] `params`, `register`, `login`, `recover`; sessions (cookie,
      renewal, logout, list, end one, end others); `account`,
      `password`, `recovery`, `prefs`, delete.
- [ ] Attempt limits (registration per address, login and recovery per
      name), the Turnstile check, the general rate limit, the daily
      pruning of attempts and expired sessions.
- [ ] Tests in workerd for every endpoint and limit; the static
      server's `cloudflare` profile keeps working.
- [ ] `wrangler.jsonc` (flag, site key, limiter), `test:prod` checks
      that read only; docs "As built".

### Crypto (building agent, worktree `stage60-crypto`)

- [x] `src/cloud/crypto/`: KDF (PBKDF2 → master → `authKey`, `kek`),
      recovery code (make, format, parse, derive), root key (make,
      wrap, unwrap, derive data and id keys), blob seal and open with
      associated data, segmented bodies, opaque ids, base64url.
- [x] The KDF in a Web Worker with a promise API.
- [x] Test vectors for every step, made with an independent
      implementation (`node:crypto`), checked in; an e2e that runs the
      Worker KDF in the real browsers.

Built 2026-11-14 (branch `stage60-crypto`); the formats are in ADR
0145, "As built (stage 60, crypto)". Differences from the plan:

- The account name (lowercased) is bound into both wraps and into the
  recovery code's keys, so every flow takes the name, and the module
  refuses a name that is not 3–20 of `a-z 0-9 _ -`.
- Passwords are normalised with NFKC. Rounds are accepted from
  600 000 to 10 000 000 only.
- The recovery code uses Crockford's base32 (no I, L, O, U); the
  parser reads O as 0 and I or L as 1. No check character.
- The flows (`account.ts`) are split where the server answers in
  between: `derivePasswordLogin` then `unlockWithPassword`;
  `deriveRecoveryLogin` then `recoverAccount`. Change password and a
  new recovery code need the account's `wrapPw` (the login answer has
  it; part B keeps it or the server hands it out again).
- The worker returns `authKey` and the `kek` itself; the master stays
  in the worker. A failed worker is reported, with an `inline` option
  for the caller, not silently replaced.
- Nothing imports the module yet: the production bundle is unchanged.
  The e2e loads it from the dev server's module URL (desktop and
  phone specs). WebKit is not among the installed browsers and was
  not tested.
- Tests: 98 unit tests in three files (49 on the vectors), 3 e2e.

### B. Client pages (after the owner's choice of mockup)

- [ ] Mockups: the Account entry on the start page, Log in, Create
      account with the six points, the recovery code page, Recovery,
      the Account page; desktop and phone. **The owner picks.**
- [ ] `src/cloud/account`: the API client, the stored account and
      keys, log in / out / register / recover flows.
- [ ] The pages in the look kit; phone and tablet with our keyboard.
- [ ] The CSP: report-only on staging, then enforced (Turnstile's
      script and frame included).

### C. Owner's part (guided by the session)

- [ ] A Turnstile widget for `mumecockpit.com` and
      `staging.mumecockpit.com`; the site key to the session, the
      secret as `TURNSTILE_SECRET` on both Workers.
- [ ] The secret `AUTH_PEPPER` on the production Worker.

### D. Review and release

- [ ] Review of crypto and auth by a second agent with only the code
      and ADR 0145; fixes.
- [ ] Full e2e alone; staging; owner test; release; the flag on.

## Test guide (owner)

Nothing to see in the browser yet. The mockups come first ("For the
owner" below); the test guide of the pages is written with part B.

## For the owner

(Written at the end of the session.)

## Owner feedback
