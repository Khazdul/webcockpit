# Stage 60 — Accounts

Status: **In progress.** Part A (server) and the crypto module are
built, reviewed and on staging (2026-11-14). The pages a player sees
wait for the owner's choice of mockup; the account endpoints on staging
wait for the two secrets of part C.

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

## Decisions taken at the start (ADR 0145, the "As built" addenda of 2026-11-14)

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
  `accounts_not_configured`. Staging has Cloudflare's published
  Turnstile test site key until the owner has made the widget (part C).
- **Session cookie:** `__Secure-wc_s`, `HttpOnly`, `Secure`,
  `SameSite=Strict`, `Path=/api/u`, 180 days, renewed at most once a
  day (one D1 write). The server keeps the token's SHA-256.
- **State-changing requests** under `/api/auth/` and `/api/u/` need
  `X-WC: 1` and an `Origin` equal to the site's, else 403 `forbidden`.
- **Recovery is one endpoint in two calls:** the first proves
  `recoveryAuth` with Turnstile and gets the wrap and a ticket good for
  15 minutes; the second shows the ticket, proves `recoveryAuth` again
  and sets the new password (a Turnstile token works once; without the
  ticket the second call is refused before anything is counted).
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
| `POST /api/auth/recover` | `{name, recoveryAuth, turnstile}` → `{wrapRc, ticket}`; then `{name, recoveryAuth, ticket, set: {salt, kdf, authKey, wrapPw}, label}` (no Turnstile; the ticket of the first call, good for 15 minutes) → `{account}`, the cookie, every older session ended. 401 `invalid_recovery` (also for an invalid, expired or foreign ticket, which counts nothing; a missing one is 400), 429 `locked` |
| `POST /api/u/auth/logout` | 204, the cookie cleared |
| `GET /api/u/account` | `{account, wrapPw}` (the current password wrap, for a password change or a new recovery code): name, created, state, usage, limits, sessions (id, label, created, lastUsed, current), prefs |
| `POST /api/u/account/password` | `{authKey, set: {salt, kdf, authKey, wrapPw}}` → 204; other sessions ended. 401 `invalid_login` |
| `POST /api/u/account/recovery` | `{authKey, recoveryAuth, wrapRc}` → 204 |
| `DELETE /api/u/account/sessions/<id>` | 204; `<id>` = `others` ends all but this one |
| `PATCH /api/u/account/prefs` | `{galleryNotice: boolean}` → `{prefs}` |
| `DELETE /api/u/account` | `{authKey}` → 204; everything the account owns removed, the name reserved |

Limits (spec §7.10): registration 3 an hour and 10 a day per address;
login 10 failures per name in 15 minutes → 15 minutes' wait, Turnstile
from the fourth try; 120 requests a minute per address, and per session
as well, on `/api/auth/*` and `/api/u/*` (`API_LIMITER`); 10 a minute
per address on `POST /api/auth/login`, `/recover` and `/register`
(`AUTH_LIMITER`). An address is an IPv4 address or the /64 of an IPv6
address.

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
  - (Changed by the review, below: the second recover call no longer
    clears the login counter.)
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

  After the independent review (same branch; ADR 0145 "After the
  review" has the list): addresses are keyed by IPv4 address or IPv6
  /64; a second, tight limiter `AUTH_LIMITER` on login, recover and
  register; the recover ticket; a success takes back only its own try
  (counters are never cleared, they run out); the password questions
  change nothing when the password changed meanwhile; a 401 clears the
  cookie only for a request that sent one; a failing limiter is 503;
  a made-up cookie is bounded by its address before any database read;
  `tests/unit/cloud-contract.test.ts` ties the server's KDF and size
  constants to the crypto module's.

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

- The account name (lowercased) is bound into the PBKDF2 salt, both
  wraps and the recovery code's keys, so every flow takes the name,
  and the module refuses a name that is not 3–20 of
  `A-Z a-z 0-9 _ -`.
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
- Tests: 104 unit tests in three files (50 on the vectors), 3 e2e.
- After the review (ADR 0145, "Changed after the review"): a body id
  in segmented bodies; the account name in the PBKDF2 salt, so
  `derivePasswordKeys` and `derivePasswordLogin` take the name first;
  the name is tested before lowercasing; a 120 s timeout on the KDF
  worker; a unit test runs the vector generator's `--check`.

### B. Client pages (after the owner's choice of mockup)

- [x] Mockups: the Account entry on the start page, Log in, Create
      account with the six points, the recovery code page, Recovery,
      the Account page; desktop and phone
      (`notes/research/account-mockups/`, 56 states). **The owner
      picks** ("For the owner" below).
- [x] `src/cloud/account`: the API client, the stored account and
      keys, log in / out / register / recover flows.

      Built 2026-11-14 on branch `stage60-account-core` (ADR 0145 "As
      built (stage 60 part B, the client core)"; the guide for the
      pages is the header of `src/cloud/account/index.ts`). No page
      imports it yet: the entry chunk is byte for byte the size it was
      (30 005 bytes). When the start menu imports `state.ts` it costs
      about 1.2 kB; the flows are a chunk of about 18 kB and the crypto
      9 kB more, both loaded on demand. Tests: 75 unit tests in three
      files, 5 e2e (desktop twice in two browsers, the phone once),
      and `tests/e2e/cloud-account-fake.ts`, the account API in memory
      for the page specs. Differences from the brief:

      - The start page's state is a hint in localStorage (`wc.account`,
        `wc.account.last`), written by the flows after the keys are
        stored or removed; the keys and the record are in the database
        `webcockpit-account`. Tabs keep in step through the `storage`
        event (no BroadcastChannel).
      - Register, log in and recover are objects (`startRegister`,
        `startLogin`, `startRecover`) with `submit({ turnstile })`, so
        any of them can be submitted again without a second derivation.
      - A failed KDF worker is followed by one derivation on the
        page's thread; the page is told (`inline`).
      - A wrong old password in change password and new recovery code
        is found on the device and reported as `invalid_login`.
      - Added: a check before the slow step that the device can keep
        keys (`storage_failed`); a register flow whose answer was lost
        finds its own account again; ending a session that is already
        gone counts as ended.
      - Not verified: the real `__Secure-` cookie on plain
        `http://localhost` (the fake simulates the cookie), anything
        against a real Worker, and WebKit (not installed).
- [ ] The pages in the look kit; phone and tablet with our keyboard.

      First half built 2026-11-14 on branch `stage60-account-pages`:
      the Account row on the start menu, Turnstile, Log in, Create
      account, the recovery code page and Recovery
      (`src/chrome/frames/account/`, a lazy chunk; its `index.tsx`
      lists the files, and each shared module's header says how the
      Account page uses it). The Account page is a placeholder
      (`account-page.tsx`: the name, "Account since", Log out); it and
      its dialogs are the second half, so the box stays open. Tests: 14
      unit tests in `tests/unit/account-words.test.ts` (words, the
      Turnstile mount), `tests/e2e/account-pages.spec.ts` (14 cases,
      two browsers) and `phone-account-pages.spec.ts` (6 cases), on
      `cloud-account-fake.ts` and the new `turnstile-stub.ts`. Pictures
      of every state: `notes/research/account-mockups/built/`
      (`WC_ACCOUNT_SHOTS=1`). Differences from the brief and the
      mockups:

      - **The pages are siblings.** One account page stands on the
        start menu at a time, and going from one to another replaces
        it (`go` in `form.tsx`). So Back on Create account and Recovery
        is Log in, Back on Log in is the menu, and nothing in the frame
        stack leads back to the recovery code. The code page has no
        Back (`Box noBack`, new in the kit) and takes Esc itself; a
        reload asks first while the last group is not typed.
      - **How the row comes in.** The flag is asked on idle time. The
        row is inserted at once unless a mouse rests on what would
        move (the rows below it, the panel's foot) or a finger is
        down; then it waits for the pointer to leave. The cursor is
        kept by key. No animation.
      - **Keys on a page with fields.** The frame stack swallows Tab,
        so the pages have a ring of their own (`useFormKeys`): the
        fields, then the buttons and links (a drawn cursor, Enter or
        Space presses). With our own keyboard the ring is the fields
        only, so the keyboard stays up. Copy and Download on the code
        page have no key letters (the mockup drew C and D; the page
        has a field).
      - **Turnstile and the keyboard.** Cloudflare draws the widget in
        a closed shadow tree, so the page cannot focus it. The Tab
        ring stops at a "door" before it; the next Tab is the
        browser's own and goes in. Size `normal` (300 × 65), `compact`
        where the box is under 300 px wide.
      - **Kit additions** (gallery, Controls): `Field` takes `type`
        (`password`), `autocomplete`, `name`, `disabled` and a hint
        that is not only text; `Plate`, `TextLink`, `TimeBar`; the
        icon `key`; `Box noBack`.
      - **Texts.** As approved, but: the name's format error is "Only
        a–z, 0–9, _ and -. No spaces." (the mockup's "or capitals" was
        wrong: capitals are allowed); the lock's sentence on Recovery
        speaks of the recovery code; during the wait the name field
        stays open (the lock is the name's).
      - **`stored: false`** shows the code with a line that this
        browser is not logged in, then goes to Log in. Not covered by
        a test (the fake cannot make the store fail after its check).
      - **The dev server and the local Worker** (`npm run dev:cloud`)
        could not take a single account POST before this part: Vite's
        string form of `proxy` sends the Worker's `Host`, so the CSRF
        rule answered 403 `forbidden`; and since part C
        `TURNSTILE_HOSTNAMES` names the real hosts, which the test
        keys (`example.com`) fail. Fixed in `vite.config.ts`
        (`changeOrigin: false`) and `scripts/dev-cloud.ts`.
      - **The cookie on plain http** (the owner's question). Walked by
        a hand-driven Playwright against the real local Worker
        (`dev:cloud`, Cloudflare's Turnstile test keys, the real
        script from the network): register, reload, log out, log in,
        recover. `__Secure-wc_s` (`Secure`, `HttpOnly`,
        `SameSite=Strict`, `Path=/api/u`) is **accepted and sent
        back** from `http://localhost:5321` in Chromium and in Firefox,
        and from `http://127.0.0.1:5321` in both (the dev server must
        be started with `--host 127.0.0.1` to answer there at all; on
        that host Firefox was seen logging in and reloading, not
        registering: the address had used its three registrations).
        Both are loopback hosts, which the browsers treat as secure.
        Not tried: a LAN address or a host name over plain http (a
        phone against the dev machine), where a `Secure` cookie is
        refused by rule; those need https (the Tailscale name).
        Playwright's builds, headless; not Safari.
      - Not done: password managers were not seen saving or filling
        (the fields have `name` and `autocomplete` in one `<form>`
        that is handled in script); the real Managed widget and the
        enforced CSP are staging's; WebKit and iOS are not installed
        here.
- [ ] The CSP: report-only on staging, then enforced (Turnstile's
      script and frame included).
      - Done 2026-11-14 (ADR 0144, "As built (stage 60): the
        CSP"): the policy in `public/_headers`, sent **report-only** by
        both targets; the inline scripts by hash, written by `vite
        build`; the CSP walk (`tests/e2e-prod/csp.spec.ts`) in the
        build's smoke test, clean in Chromium and Firefox on the local
        build, report-only and enforced (`WC_PROD_CSP=enforce`).
      - Left, in this order: (1) the account pages get their steps in
        the walk (Turnstile's script and frame); (2) the walk against
        staging, `WC_PROD_URL=https://staging.mumecockpit.com npm run
        test:prod -- csp`, and the pages by hand there; (3) the switch:
        `staging: true` in `CSP_ENFORCED` (`scripts/csp.ts`), deploy
        staging, the same checks, Safari and iOS by hand; (4)
        `production: true`.
      - For the pages: a `<form>` must be handled in script
        (`form-action 'none'`); no inline `<script>`, no `eval`; inline
        styles are allowed. Turnstile works on the dev server as it is
        (COEP `require-corp` does not block it; measured, same ADR
        section), so `npm run dev:cloud` needs no change.

### C. Owner's part (guided by the session)

- [x] (owner, 2026-11-14) The Turnstile widget `WebCockpit`
      (`mumecockpit.com`, `staging.mumecockpit.com`, Managed); the site
      key and `TURNSTILE_HOSTNAMES` in `wrangler.jsonc` for both
      environments; `TURNSTILE_SECRET` on both Workers.
- [x] (owner, 2026-11-14) `AUTH_PEPPER` on both Workers, a value of
      its own on each (`wrangler secret put`, the value seen by nobody).

### D. Review and release

- [x] Review of crypto and auth by a second agent with only the code
      and ADR 0145 (2026-11-14): nothing critical or high; eleven
      findings of medium and lower weight, all fixed or written down
      (ADR 0145, "After the review", "Changed after the review" and
      "Known limits"). The review is repeated on part B's client code
      before the release.
- [x] Full e2e alone; staging deployed; `test:prod` 14/14 on
      staging (2026-11-14: unit 4496; e2e 1459 passed, 3 failed under
      load and pass alone; the live site 12/14, the two being the new
      `/api/config` check that waits for the release).
- [ ] Owner test of the pages on staging; release; the flag on.

## Test guide (owner)

Nothing to see in the browser yet. The mockups come first ("For the
owner" below); the test guide of the pages is written with part B.

## For the owner

### What is on staging (2026-11-14)

Part A and the crypto module are built, reviewed, merged to `main` and
deployed to staging (migration 0002 applied there). Nothing was
released and nothing ran against production. Nothing new shows in the
browser: no page uses the account yet, and the crypto module is not in
the bundle.

- `https://staging.mumecockpit.com/api/config` shows the flag
  `accounts` on, the Turnstile test site key and the limits.
- The account endpoints answer 503 `accounts_not_configured` there
  until the two secrets of part C are set. (The session tried to set
  them on staging with `wrangler secret put`; the permission check
  refused it, so they are yours.)

### Your decisions (with my recommendation)

The mockups: <https://claude.ai/artifact/F135H6tVZcX9zkdnxt3ZDL> (tabs
per page and state, Desktop / Phone), or
`notes/research/account-mockups/index.html` with every state as a
picture. With the flag off nothing shows in any variant.

1. **The entry on the start page:** A, a menu row `ACCOUNT (log in)` /
   `ACCOUNT (olev) ●` between Spotlights and Credits, key U (the box
   grows one row); B, a quiet line in the corner opposite the almanac,
   no menu row; C, nothing on the start page, a strip at the foot of
   Profiles. *Recommendation: A.* It is what spec §7.2 says, it is
   found by key, mouse and finger alike, and the sync mark of stage 61
   has a home. B if the menu must not grow.
2. **An Account row in the phone's in-game menu sheet too?**
   *Recommendation: no;* the start page is enough until sync shows
   that it is missed.
3. **Create account as one page** (form and the six points side by
   side on desktop) **or two steps?** *Recommendation: one page.*
4. **The Account page's grouping:** head with sync state; storage;
   devices; password and recovery; notices; your data on this device;
   leaving (Log out, then Delete account, last and quiet).
   *Recommendation: as mocked.*
5. **After a recovery the code stays the same** (a new one can be made
   on the Account page). *Recommendation: keep it so.*
6. **Device labels** are "Firefox on Linux", not nameable.
   *Recommendation: enough.*
7. **The words:** Account, Log in / Log out, user name. And anything in
   the texts, above all the six points on Create account and the "this
   is the only way back" line on the recovery code page.

Two things that are as the spec says, for you to know:

- Anybody can lock a known user name's login for 15 minutes by ten
  wrong passwords (and repeat it). Sessions already open keep working.
  It is the price of the lock; the alternative is no lock.
- A user name's existence can be learnt by trying to register it (one
  Turnstile pass each). Names are public anyway once a player
  publishes.

### Part C, step by step (about 10 minutes)

1. **The Turnstile widget.** Cloudflare dashboard → **Turnstile** (in
   the account's left menu; under "Application security" in the newer
   menu) → **Add widget**. Name `WebCockpit`. Hostnames:
   `mumecockpit.com` and `staging.mumecockpit.com`. Widget mode
   **Managed**. Pre-clearance: no. Create. The page then shows a **Site
   Key** and a **Secret Key**.
2. Send the session the **site key** (it is public; it goes into
   `wrangler.jsonc` for both environments together with
   `TURNSTILE_HOSTNAMES`).
3. **`TURNSTILE_SECRET`**: Workers & Pages → `webcockpit-staging` →
   Settings → Variables and Secrets → Add → type **Secret**, name
   `TURNSTILE_SECRET`, value the widget's secret key. The same on
   `webcockpit`. (Until the real site key is deployed, staging shows
   the test widget and a real secret refuses its tokens; that is
   expected.)
4. **`AUTH_PEPPER`**: on both Workers a Secret named `AUTH_PEPPER`
   with a random value, a different one on each. Make a value with
   `openssl rand -base64 32` in a terminal and paste it; it need not be
   kept anywhere else. (Or, in the session: `! openssl rand -base64 32
   | npx wrangler secret put AUTH_PEPPER --env staging`, and without
   `--env staging` for production.)
5. Tell the session; it deploys staging with the real site key and
   checks registration, login, recovery and deletion there.

### Refused or failed

- `wrangler secret put` against staging was refused by the permission
  check (above). Nothing else.

## Owner feedback

- **2026-11-14:** decisions 1–7 as recommended: entry A (a menu row,
  key U, between Spotlights and Credits); no Account row in the
  phone's in-game sheet ("I think"); Create account as one page; the
  Account page's grouping as mocked; the recovery code stays after a
  recovery; device labels as they are; the words and texts look good.
  Part C begun (the Turnstile widget).
- **2026-11-14, later:** part C done. On staging `/api/auth/params`
  answers (a stable fake salt for an unknown name, the same in any
  case), `/api/u/account` 401 without a session, a POST without `X-WC`
  403. Registration, login, recovery and deletion are not yet run
  against the deployed Worker: with the real widget they need a
  Turnstile token from a real browser, so they are checked with part
  B's pages.
