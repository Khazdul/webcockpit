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

- [x] Migration 0002: `account`, `reserved_name`, `session`, `attempt`
      (spec §7.11; later stages' tables come with their stages).
- [x] The flag `accounts`; `/api/config` with the site key, limits and
      time.
- [x] `params`, `register`, `login`, `recover`; sessions (cookie,
      renewal, logout, list, end one, end others); `account`,
      `password`, `recovery`, `prefs`, delete.
- [x] Attempt limits (registration per address, login and recovery per
      name), the Turnstile check, the general rate limit, the daily
      pruning of attempts and expired sessions.
- [x] Tests in workerd for every endpoint and limit; the static
      server's `cloudflare` profile keeps working.
- [x] `wrangler.jsonc` (flag, site key, limiter), `test:prod` checks
      that read only; docs "As built".

  Built 2026-11-14 on branch `stage60-server` (ADR 0145 "As built (stage
  60 part A)" has the details and the trade-offs). Checked in workerd
  (44 tests in `worker/test/auth.test.ts`) and once by hand under
  `wrangler dev` with Cloudflare's Turnstile test keys; not yet against
  a deployed Worker. Differences from the plan and additions to the
  contract:

  - `attempt` is `(key, start, count, until)`, not `(key, window,
    count)`; `session` has a public `id` beside `id_hash`; `account.id`
    is random text (spec §7.11 updated).
  - A login or recovery try is counted **before** it is looked at and
    the counter is removed on success, so tries racing each other
    cannot pass the limit. Seen from outside it is the contract: three
    failures, then Turnstile; ten, then 15 minutes.
  - The password questions under `/api/u/` (`password`, `recovery`,
    delete) also answer 429 `locked` while the name is locked (they
    count on the same counter, so they must honour it). They never ask
    for Turnstile.
  - 429 `locked` carries a `Retry-After` header beside `retryAfter`.
  - Unknown fields in a body are 400 `bad_request` (as the flag route).
  - `DELETE /api/u/account/sessions/<id>` answers 404 `not_found` for an
    id that is not a session of the account. Ending the session one is
    in clears the cookie.
  - `PATCH /api/u/account/prefs` takes exactly `{galleryNotice}`.
  - The second recover call also clears the name's login counter (a
    lock on the login goes with the old password).
  - `params` answers 400 only for a missing or over-long (> 64) `name`;
    every other name, possible or not, gets an answer.
  - A new optional var `TURNSTILE_HOSTNAMES` (the host names a passed
    challenge may come from); unset while the test keys are in use.
  - `AUTH_PEPPER` shorter than 16 characters counts as not set.
  - The general limiter counts a request with a session cookie that
    turns out to be unknown against the address as well.
  - `Config` has the new fields as optional (the client's `parseConfig`
    is untouched); `tests/unit/static-server-cloudflare.test.ts` and
    three worker tests changed one expectation each for the new flag.
  - For part B: `npm run dev:cloud` passes the Turnstile test keys and
    a dev pepper to the local Worker; the flag needs a row
    (`INSERT INTO flag VALUES ('accounts', 1)`). The Worker under
    `wrangler dev` builds its URL from the `Host` header, so the CSRF
    rule holds through Vite's proxy as long as the proxy keeps `Host`
    (its default; checked with curl, not through Vite). Not checked:
    whether each browser accepts the `Secure`, `__Secure-` cookie from
    the dev server's plain `http://localhost`.

### Crypto (building agent, worktree `stage60-crypto`)

- [ ] `src/cloud/crypto/`: KDF (PBKDF2 → master → `authKey`, `kek`),
      recovery code (make, format, parse, derive), root key (make,
      wrap, unwrap, derive data and id keys), blob seal and open with
      associated data, segmented bodies, opaque ids, base64url.
- [ ] The KDF in a Web Worker with a promise API.
- [ ] Test vectors for every step, made with an independent
      implementation (`node:crypto`), checked in; an e2e that runs the
      Worker KDF in the real browsers.

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
