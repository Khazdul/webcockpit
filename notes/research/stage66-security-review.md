# Stage 66 security review (the admin panel)

Independent review of `git diff f18a4453..HEAD` (stage 66: the admin
panel, its API, the audit log's seal, the per-account and default limits,
the deletion guard). Date 2026-11-16. Review only: no source was changed.

Method: read `worker/access.ts`, `router.ts`, `panel.ts`, `moderation.ts`,
`auditlog.ts`, `limits.ts`, `accounts.ts`, `deletion.ts`, `stats.ts`
(graphs), migration 0007, the admin page (`worker/admin/*.ts`) and the
write paths that race with deletion (`sync.ts`, `runs.ts`, `pub.ts`,
`community.ts`, `reports.ts`, `sessions.ts`). Probes ran as a throwaway
worker test (`worker/test/zz-secreview-probe.test.ts`, run and deleted;
the tree is clean) and a Node micro-benchmark of the chain check's HMAC
cost. `npx vitest run --project worker`: 22 files, 358 tests pass.

No high or medium finding. Nothing reaches admin data or actions without
a valid Access token for an allowed e-mail, the page renders API text
safely, and deletion is complete apart from one race (S5).

## Findings

### S1 (low, defence in depth): the admin API shares an origin with the app that shows hostile content

`/admin` and `/api/admin/*` are on the site's own origin
(`mumecockpit.com`, `staging.…`). The CSRF rule (`X-WC: 1` + same
`Origin`, `auth.ts:534`) stops only *cross*-origin requests. Any script
that runs on the app's origin in the admin's browser can call every admin
write: Access's `CF_Authorization` cookie goes with it, and the script
sets `X-WC` itself. The admin opens the content most likely to be hostile
on that origin: the report queue's "Watch" link is
`/r/<id>?admin` (`worker/admin/reports.ts:283`, `:321`), which loads a
reported run's payload into the app (`src/watch/api.ts:36`).

Mitigation in place: the app's enforced CSP (`script-src 'self'
'wasm-unsafe-eval'` + hashes, `scripts/csp.ts:32` `CSP_ENFORCED` both
true). So an exploit needs script execution despite that CSP, which keeps
this at low.

Fix (when convenient): serve the admin on its own host (e.g.
`admin.mumecockpit.com`, one Access application over the whole host,
`/api/admin/*` only there), so the app's origin holds no admin power; or
open reported runs from the admin page on another origin.

### S2 (low): the chain reads "intact" after every seal is removed (no key needed)

`verifyChain` (`worker/auditlog.ts:130`) counts rows with `mac` NULL
before the first sealed row as legacy "not sealed" and never as broken.
Someone with D1 console access (triggers dropped, no `AUTH_PEPPER`) can
set `prev` and `mac` to NULL on every row and then edit any row freely.
Probe (a): four sealed rows, `UPDATE admin_log SET prev = NULL, mac =
NULL`, the first row's note changed → `{"state":"intact","sealed":0,
"unsealed":4,"brokenAt":null,"head":""}`.

ADR 0157 §3 says a row "cannot be rewritten with a valid `mac` from the
D1 console". That holds, but *un*sealing needs no key, and the verdict
stays `intact`. The only signs are `sealed` dropping to 0, the empty
head, and the "not sealed" tag on each row. Probe (b), a cut tail
followed by new entries, also reads `intact`. ADR 0157 §4 accepts that
case, and it is listed here only for completeness.

The same applies when `AUTH_PEPPER` is shorter than 16 characters:
`logKey` falls back to SHA-256 of a public label (`auditlog.ts:48`), so
anyone can forge the seals, and the page still says `intact`. In
production accounts refuse to run without a 16-character pepper
(`auth.ts:91`), so this matters only for an admin-only deployment.

Fix: anchor where the chain starts outside D1. Set a constant or var
(e.g. `LOG_SEALED_FROM_ID`, or the ts of the deploy) and treat any
unsealed row after it as `broken`. Optionally, have the daily cron write
`(count, head)` to R2, or mail it, so a cut tail is seen. Report the
state as `unkeyed`, not `intact`, when the pepper is missing.

### S3 (low): after the first break the check stops, so later tampering is invisible

`verifyChain` only sets `brokenAt` while it is null
(`auditlog.ts:146`). Because the log is append-only, a break can never be
repaired or acknowledged. From then on, every later change or removal
reads exactly the same. Probe (d): row 2 changed gives
`brokenAt: 2`; row 5 changed afterwards gives the identical chain state.

Fix: keep checking after a break, re-anchored on the stored `prev`/`mac`
of each row. Return every broken id, or their count and the newest, so a
new break shows even when an old one exists.

### S4 (low, cost/availability): the whole chain is read and HMAC'd on every log request, and the Reports view polls it every minute

`logPage` reads every `admin_log` row and verifies all of them
(`auditlog.ts:174–176`). The Reports view calls `GET /api/admin/log`
inside `loadModeration` (`worker/admin/reports.ts:192`), and `loadAll`
runs that every 60 s while Reports is open (`shell.ts` boot,
`setInterval(…, 60000)`). The cost per request is N rows read plus N
HMACs. Measured at about 10–20 µs CPU per row (Node WebCrypto; 1,000
rows ≈ 21 ms CPU, 5,000 ≈ 52 ms):

- At about 500–1,000 entries a call passes the Workers free plan's 10 ms
  CPU budget. The log endpoint then starts failing, and the integrity
  check with it.
- With one tab left open all day (1,440 calls), D1's 5 M rows-read/day
  free cap is reached at about 3,500 entries.

Bulk moderation (a spam wave) brings either point closer.

Fix: the Reports card needs only the last 20 entries, so give it a
`LIMIT` read without the check. Verify only in the Log view. Keep a
"verified through (id, mac)" checkpoint per isolate, or in a row, and
check only newer rows.

### S5 (low): a report sent while its author's account is being deleted outlives the account

The report insert has no account-exists guard (`worker/reports.ts:77–78`:
`INSERT OR IGNORE INTO report … SELECT … WHERE (SELECT COUNT(*) …) <
?8`). If the deletion batch commits between `authenticate` and this
batch, an open report stays with the deleted account's id and its free
text. That breaks "removes everything" (ADR 0157), and the deletion guard
test cannot see it because it does not race. Every other write that
races a delete is guarded:

- `item` (`sync.ts`: `FROM account a WHERE a.id = ?1`)
- `run_body` (`runs.ts:170`, and the object is deleted on a miss)
- `publication` (`pub.ts:634`: a NULL `pub_count` fails the comparison)
- `vote`, `comment`, `note` (`community.ts` `EXISTS … state = 'active'`)
- `session` (`sessions.ts:76`)

The code predates stage 66, but it falls within the deletion promise.

Fix: add `AND EXISTS (SELECT 1 FROM account WHERE id = ?3)` to the
report insert. The `hiding` statements then also do nothing, because
they count only reporters that exist.

### S6 (low/info): one account's page shows log entries about runs or comments whose id equals its name

`accountGet` matches `target = ?2 COLLATE NOCASE` for every action except
flags and defaults (`worker/panel.ts:199–201`). Names
(`/^[A-Za-z0-9_-]{3,20}$/`) overlap the 12-character
`[A-Za-z0-9]` id space of runs, comments and notes, and those ids are
public. A player can register a name equal to another user's run or
comment id. Moderation entries about that item (`pub.delete`,
`comment.hide`, …) then show on the player's account page, and NOCASE
widens the match to case variants. Nothing leaks; the risk is that it
misleads the admin.

Fix: match the name only for `action LIKE 'account.%'` (and
`account.limits`), and match ids case-sensitively.

### S7 (info): a hostile hash breaks the admin page (no injection)

`var views = {}` (`worker/admin/shell.ts`). `parseHash` accepts any
truthy `views[name]`, so `/admin#constructor`, `#__proto__` or
`#toString` select an inherited property. `v.render` is then undefined,
and `route()` throws. At boot this aborts the IIFE before `loadAll()` and
the minute timer, which leaves a blank view. Nothing is parsed as HTML,
so this is only a link that breaks the page.

Fix: `Object.create(null)` for `views`, or `Object.hasOwn(views, name)`.

### S8 (info): staging and production accept each other's Access tokens

Both environments have the same `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`
(`wrangler.jsonc`), so a token minted for one is valid on the other,
including on each Worker's `workers.dev` host, where no Access session
revocation applies before the token expires. `ADMIN_EMAILS` is checked
per environment, so this grants no one new access. It does widen where
a leaked staging token works.

Fix: one Access application (AUD) per environment. Optionally set
`workers_dev: false` in production; the Worker already refuses there.

### S9 (info): a failing certs endpoint is fetched on every admin request, and stale keys never expire

In `keyFor` (`access.ts:100–114`), a failed fetch leaves `hit.at`
unchanged. After the 1-hour TTL, while
`<team>/cdn-cgi/access/certs` fails, every request to an admin path
starts an outbound fetch, unauthenticated ones included. The old keys
are also kept with no upper age.

Fix: record the attempt time on failure (back off for
`CERTS_REFETCH_MS`) and refuse keys older than, say, 7 days.

### S10 (info): the default limits fail open to the built-in values on a fresh isolate's read error

`loadLimitDefaults` returns `{}` when the first read in an isolate fails
(`limits.ts:54–57`). If the admin has lowered a default below the
built-in value, for example to slow abuse, that request then sees the
higher built-in limit. In practice the request's own writes likely fail
too, and staleness of up to 30 s per isolate is documented. Noted for
when a lowered default is used as an abuse brake.

### S11 (info): the flag switch is not wrapped in `guarded`

`adminFlagRoute` (`router.ts:349`) calls `sealedBatch` without the
try/catch that `guarded` gives the other admin writes. If the chain's
retries run out, or D1 fails, the exception is uncaught: a 500 from the
runtime instead of `503 unavailable`. Nothing is applied (the batch rolls
back), so this is cosmetic.

## Checked and found sound

**Access**
- `verifyAccess` runs before any admin routing, for every path where
  `isAdmin` holds, known or not (`router.ts:420–426`).
- No admin handler is reachable from another branch. `ROUTES`, the
  account API, the pub and community routes and `/r/*` hold no admin
  handler.
- Probed without a token, every path variant got 403 or 404, never 200,
  for GET, HEAD and OPTIONS alike:
  - `/api//admin/stats`, `//api/admin/stats`, `/API/…`, `/api/ADMIN/…`
  - `/api/admin/stats/`, `/api/admin/stats.`, `/api/%61dmin/stats`,
    `/api/admin%2Fstats`
  - `/api/admin/./stats`, `/admin/../api/admin/log`,
    `/api/admin/%2e%2e/admin/log`, `/api/u/../admin/log`
  - `/Admin`, `/admin.`, `/admin%2F`, `/admin;x`, `/api/admin;/log`
- Why path tricks don't matter: WHATWG URL normalisation resolves dot
  segments before `isAdmin`, and anything that doesn't normalise to an
  admin path reaches no admin handler. Differences from Cloudflare
  Access's own path rule therefore cannot bypass anything; the Worker's
  check is the boundary, and it also covers `workers.dev`.
- JWT checks:
  - `alg` is pinned to RS256, and the key is imported as
    RSASSA-PKCS1-v1_5/SHA-256, so the token cannot choose the algorithm.
  - `kid` must name a fetched key; an unknown `kid` refetches at most
    once a minute.
  - `iss` must equal exactly `https://<team>` (a trailing slash is
    refused).
  - `aud` may be an array or a string.
  - `exp` is required and must be a number; `nbf` is optional, and a
    non-number is refused. Both get 30 s of leeway.
  - Tokens without an e-mail (service tokens) are refused.
  - The e-mail is lowercased on both sides.
  - Probes: upper-case e-mail 200; string `aud` 200; string `nbf` 403;
    string `exp` 403; `iss` with a slash 403; no e-mail 403.
- CSRF:
  - Every non-GET/HEAD admin method goes through `guarded` or
    `sameSite`, and needs `X-WC: 1` and `Origin === url.origin`.
  - The admin GETs have no side effects; `defaultsGet` only drops a
    cache.
- No non-admin route exposes admin-only data.
  - `/api/config` gives the default limits, which are public by design.
  - Sessions' labels, item contents and e-mails are never in admin
    answers. The admin's identity in the log is a peppered hash, and the
    API shows 8 characters of it.

**Admin page**
- Every API string goes in through `textContent`, `el()`, or
  `setAttribute` with numeric values; no `innerHTML` or similar sinks.
- Every URL is built with `encodeURIComponent`; hrefs are `#…` or
  `/r/<encoded id>?admin`; there are no `location` writes other than
  hashes. So there is no open redirect.
- The CSP (`default-src 'none'; script-src 'self'; style-src 'self';
  base-uri 'none'; form-action 'none'; frame-ancestors 'none'`) is sent
  with all three files, together with `nosniff` and `no-store`.
  `.style.width` is CSSOM, which `style-src` permits.
- Account names (server pattern), split keys, titles, notes and log
  targets all render as text. A name containing `/` or `%` reaches the
  API encoded, and the server rejects it.

**Deletion**
- `deletionBatch` covers every account-id column in `sqlite_master`,
  and the guard test proves it with every kind of row. R2 `u/<id>/` and
  `pub/<id>` are emptied after the transaction.
- A failed or raced upload is covered by the `r2_sweep` row (swept
  after 1 h by the daily cron) and by the tombstones' bytes.
- A pending publish becomes a tombstone, and its upload then fails.
- Sync, runs, publish, vote, comment, note and session writes are all
  guarded against a concurrent delete (only reports are not, S5).
- The `auth_hash` guard makes a delete that races a password change a
  no-op. The log entry shares the same guard, so there is no log entry
  without a delete.
- Names stay reserved, so log entries by name never move to a new owner.

**Audit log**
- `sealedBatch` is the only insert into `admin_log`, and no Worker code
  updates or deletes it.
- The triggers are `BEFORE UPDATE`/`BEFORE DELETE` `RAISE(ABORT)`, and
  `REPLACE` is refused too.
- The chain trigger rejects a wrong `prev`, an unsealed insert once the
  chain has begun, and the 0.14.0 Worker's inserts after the first
  seal. Two actions that race serialise through rollback and retry
  (3 retries).
- An action never applies without its entry, because the entry is in
  the same batch.
- Every admin write is logged: flags, both limits PUTs, pub, comment and
  note actions, and every account action including `end-sessions`.
- The seal input is `JSON.stringify([prev, ts, who, action, target,
  note])`, which is unambiguous. Lone surrogates, which would break the
  round-trip, are refused by `isCleanText` (`\p{Cs}`).
- The key is HMAC(pepper, label), domain-separated from `whoOf`.

**Limits**
- `limitsInput` accepts only known names (`__proto__`, `constructor`
  and unknown names are refused) with safe integers from 0 to 20 × the
  built-in value. Floats, strings, negatives, `1e300`, arrays and extra
  body keys get 400 (10 probes, all 400).
- `ownLimitsOf` and `loadLimitDefaults` read only known names.
- Every limit check (`sync`, `runs`, `pub`, `community`) is under
  `accountApi`, which loads the defaults first (`auth.ts:592`).
  `/api/config` and the admin paths load them too, and the cron checks
  no limits.
- The admin's own writes reload the defaults from D1 before computing.

**Read endpoints**
- No user value reaches SQL text:
  - `sort`, `dir` and `state` come from allowlists.
  - `page` is `^[1-9]\d{0,5}$`; `before` is digits only.
  - `kind` and `range` come from allowlists.
  - `q` is bound, and the LIKE pattern is escaped with `ESCAPE '\'`.
- The log's `q` filter runs in JS.
- Read amplification: the graphs read at most about 26 k samples plus
  full scans of small tables. The account list scans `account` with two
  indexed subqueries per row. These are admin-only and fine at hundreds
  of users; the log (S4) is the exception.
