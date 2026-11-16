# 0157 — The admin panel: accounts, limits, graphs and an audit log that cannot be changed

- Status: Accepted (technical details, the session, 2026-11-16). The
  look and the scope questions are the owner's, in mockup round 14
  (stage file "For the owner to choose"); the addendum after his picks
  records them.
- Date: 2026-11-16
- Related: spec §7.6, §7.9, §7.10, §7.11, §7.12 (66); ADR 0147, 0148
  (the admin page, the admin's identity), 0153 (R2), 0154 (moderation,
  deletion), 0155 (the community's admin).

## Context

`/admin` (stage 59, 64, 65) has today's numbers, a 30-day table, the
flags, the report queue, and one form that suspends, restores or
deletes an account by its name. Stage 66 adds what spec §7.9 lists:
the account list with search and sort, limits per account, graphs of
use, storage and sharing, and the audit log as a view. The owner asked
for an independent check that the Access guard covers every admin
action, that deleting an account removes everything in D1 and R2, and
that the audit log cannot be changed afterwards.

## Decision

### The page

- **Still one small page** outside the client bundle, three files under
  the same CSP (`script-src 'self'`, nothing inline, every text by
  `textContent`). The script is split into string modules
  (`worker/admin/shell.ts`, `accounts.ts`, `graphs.ts`, `log.ts`, and
  the existing moderation code moved to `reports.ts`) that `page.ts`
  joins into `ADMIN_JS`; one IIFE, one shared helper set (`el`, `fmt`,
  `api`, the modal). Reason: the file is 706 lines today and two agents
  will work on it at once.
- **Views by the URL's hash** (`#reports`, `#accounts`,
  `#account/<name>`, `#use`, `#storage`, `#sharing`, `#log`, `#flags`),
  so a view can be linked and reloaded. How the views are reached (tabs,
  a side bar or one long page) is the owner's pick.
- **Graphs are drawn by the page** as inline SVG built with
  `createElementNS` (spec §7.9: plain and readable; no library, which
  the CSP would also have to allow). Lines for series over time, bars
  for counts per day, a horizontal bar list for splits and the largest
  accounts. Hover shows the value of the nearest point; every graph has
  a "Table" toggle with the same numbers, so nothing is only a picture.
  Colours from the page's tokens, in light and dark.
- **Phone width works** (one column, tables scroll in their own box):
  the owner may look at a report from his phone.
- **Refresh:** the Reports view keeps its 60 s reload. The other views
  load when opened and on a Reload button; graphs do not poll.

### The API (contract in `shared/cloud/api.ts`, "The admin panel")

All under `/api/admin/`, so the router's Access check runs before any
of them (ADR 0148 addendum, as built); writes need `X-WC: 1` and the
site's own `Origin`, as the flag switch.

| Endpoint | Does |
|---|---|
| `GET /api/admin/accounts?q=&state=&sort=&dir=&page=` | the account list, 50 a page |
| `GET /api/admin/account/<name>` | one account in full: the row, limits, sessions, community, its log |
| `PUT /api/admin/account/<name>/limits` | `{limits: Partial<AccountLimits> \| null}`; `null` back to the defaults |
| `POST /api/admin/account/<name>` | the stage 64 actions plus `end-sessions` |
| `GET /api/admin/graphs?range=24h\|7d\|30d\|90d\|all` | every series of the graph views for a range, in one answer |
| `GET /api/admin/log?before=<id>&kind=&q=` | the audit log, 100 a page, with the chain's state |

- **A row of the list:** name, created, last seen, state, small items
  (count, bytes), runs (count, bytes), published runs (count, bytes),
  total bytes, live sessions, and whether the account has limits of its
  own. Read by one query over `account` with `run_body` and `session`
  counted by grouped subqueries; at hundreds of accounts a full scan is
  a few thousand rows read. `q` is a case-insensitive part of the name
  (`name_key LIKE`, with `%`, `_` and `\` escaped). Sort keys: `name`,
  `created`, `seen`, `items`, `bytes`, `runs`, `pubs`, `state`; default
  `seen` descending.
- **One account** adds: limits as `{defaults, own, effective}`;
  sessions as count and newest use (not their labels: the admin does not
  need to know the player's devices); votes cast, comments, notes,
  reports made, open reports on its things; the newest 20 log entries
  whose target is the account or one of its runs, comments or notes.
  No private data exists to show (ADR 0145).
- **Limits per account.** Every field of `AccountLimits`, integers from
  0 to 20 × the default (a typo of a zero cannot hand out 50 GB); an
  unknown key or a bad value is `400 bad_request`, nothing written.
  Fields equal to the default are not stored, so a later change of a
  default reaches the account; `{}` or `null` stores `NULL`. A limit
  below what the account uses deletes nothing: the next write that
  grows past it is refused (`storage_full`, `quota`), and the page says
  so before saving. Logged as `account.limits` with the changes in the
  note (`runBytes 50 MB → 200 MB`).
- **`end-sessions`** ends every session of the account (reason
  `ended`, the player's own "End all"), for a lost device or a shared
  password. Logged.
- **Flag switches are logged** (`flag.on`, `flag.off`, the flag's name),
  in the same batch as the write. They were not before.

### Graph data

`GET /api/admin/graphs` answers from tables that already exist plus new
metrics of the daily roll-up (`stat_daily`, migration 0007):

| Graph | From |
|---|---|
| Online and playing, 24 h | `stat_sample` as is (5 min) |
| Online and playing, 7 / 30 / 90 days | `stat_sample`, the max per 30 min / 1 h / 3 h |
| Online, all time | `stat_daily` `peak_online`, `peak_playing` |
| Devices a day, a week, a month | `devices`; new `devices_7d`, `devices_30d` (from `device_day` at roll-up) |
| New devices, new accounts | `new_devices`; new `new_accounts` |
| Device types, browsers, versions | the `type`, `browser`, `version` splits per day |
| Storage in total | new `item_bytes`, `run_bytes`, `pub_bytes`, `accounts` (totals at roll-up), today live |
| Largest accounts | live, the ten largest by total bytes |
| Shares, votes, comments a day | new `pubs_new`, `listed_new`, `votes`, `comments`, `notes`, `reports`, `views` |

- Today is read live and marked as such; the rest is rolled up.
- **Migration 0007 backfills** what the tables still know: `devices_7d`
  and `devices_30d` from `device_day` (35 days kept), `new_accounts`
  from `account.created`, the sharing counts from `created` of
  `publication`, `comment`, `note`, `report` (deleted ones are gone, so
  the past is a floor), `votes` from `vote.updated`. Storage history
  begins with stage 66; the graph says so.
- An "all" range reads at most one row per day and metric; the 90-day
  online graph reads at most 25 920 samples. Within the read budget
  (ADR 0147) with room; the page does not poll.

### The audit log cannot be changed afterwards

1. **No code path changes it.** The Worker has no `UPDATE` or `DELETE`
   on `admin_log`, and no endpoint for it; account deletion and the
   crons leave it alone (a test greps the Worker for it).
2. **The database refuses it.** Migration 0007 adds triggers `BEFORE
   UPDATE` and `BEFORE DELETE ON admin_log` that `RAISE(ABORT)`. A
   statement in an action's batch that tried would roll the whole
   action back.
3. **A changed or removed row is detected.** New columns `prev` and
   `mac`: `mac = HMAC-SHA-256(logKey, prev | ts | who | action | target
   | note)`, base64url, and `prev` is the `mac` of the row before. A
   `BEFORE INSERT` trigger aborts unless `NEW.prev` is the newest row's
   `mac`, so the chain is one line even when two actions race (the
   batch rolls back and the Worker retries with the new head, three
   times). `logKey` is derived from the secret `AUTH_PEPPER` (label
   `wc-admin-log`), which nobody can read back from the dashboard, so a
   row cannot be rewritten with a valid `mac` from the D1 console.
   `GET /api/admin/log` verifies the whole chain and says `intact`, or
   the first entry that does not match; the page shows it in the log's
   header.
4. **What remains:** someone with the owner's Cloudflare login can drop
   the triggers and cut the tail of the log; the head's `mac` and count
   are shown on the page, and D1 Time Travel keeps 30 days of history.
   Entries written before stage 66 have no `mac` and are shown as "not
   sealed" (the chain starts after them).
- The log's `who` is shown as its short hash; with one admin it is the
  same on every row.

### Deleting an account removes everything

The deletion transaction (`worker/deletion.ts`) is the player's and the
admin's. Stage 66 adds a guard test: after a delete of an account that
has every kind of row (items, runs, published runs of both kinds, votes,
comments, notes, reports made and received, sessions, ended sessions),
every table with a column that holds an account id is queried for
it (the list of tables is read from
`sqlite_master`, so a new table with such a column fails the test until
it is handled), and R2 has nothing under `u/<id>/` and no `pub/<id>` of
its runs. What stays on purpose, and is named in the test: the name in
`reserved_name`, the tombstones of its published runs (no text, no
title, the account id kept for the cron's R2 sweep), handled reports
without text or reporter, and `admin_log` entries naming it.

### Access

Unchanged in kind: `worker/access.ts` before routing, for every path
under `/admin` and `/api/admin` known or not. Stage 66 adds a test that
walks every admin route and method of the router's table (and a few
unknown ones) without the token, with a token of another e-mail, with a
service token, with a wrong audience, and expects `403`; and every
write without `X-WC` or with another `Origin`, expecting `403`.

## Alternatives

- **A chart library** (uPlot, Chart.js): less code, but a dependency in
  a page that is meant to be tiny, an extra CSP allowance or a vendored
  copy, and a look that is not the page's. The graphs needed are lines
  and bars.
- **Cloudflare's own analytics** (GraphQL) for use: exact, but needs an
  API token in the Worker and says nothing about devices or accounts.
- **Logging to R2 or Workers Logs** for the audit trail: harder to
  query, and not in the same transaction as the action it records.
- **No `mac`, triggers only:** stops the code but says nothing about a
  change made from the console.

## Consequences

- Migration 0007 is additive (columns, triggers, backfilled metric
  rows); the running Worker of 0.14.0 keeps working with it, except that
  its `admin_log` inserts carry no `prev`: the trigger lets a row with
  `prev` NULL in only while the newest row's `mac` is also NULL, so the
  old Worker's actions still work between the migration and the deploy
  (seconds) and the chain starts at the first new Worker's entry.
- The roll-up writes about 15 more rows a day.
- `AUTH_PEPPER` now also keys the audit log; rotating it would break
  the chain's check for older rows (it is not rotated today).

## Addendum (owner, round 14, 2026-11-16): the picks

Mockups: <https://claude.ai/artifact/9yMSTQ4zgef5q1deSduTFC>.

- **1b, a side bar** of grouped links (Look after: Reports, Accounts,
  Log; Numbers: Use, Storage, Sharing; Site: Flags and limits). Under
  900 px it becomes a row of links over the view.
- **2b, a grid of small graphs**: a card per graph with the latest
  figure large and the range small; a click opens the graph large with
  hover and Table. The range buttons are once over the view.
- **3a, clean-up per account only**: End all sessions, Suspend /
  Restore, Delete on the account's page. No list of abandoned accounts.
- **4b, the default limits are edited from /admin too.** A new table
  `limit_default(name, value)` (migration 0007) overrides
  `DEFAULT_ACCOUNT_LIMITS` (and `RUN_BYTES_LIMIT`) field by field; it is
  read like the flags, kept 30 s per isolate, loaded before any handler
  that checks a limit, so `limitsOf` stays synchronous. `/api/config`'s
  `limits` are the defaults with the overrides. An account's own value
  that equals the default at the time it is saved is not stored, so it
  follows later default changes. `GET`/`PUT /api/admin/limits`, logged
  as `limits.default`. Same value rules (0 … 20 × the built-in value).

## As built (stage 66 C1, the page)

- **Modules.** `worker/admin/shell.ts` (helpers, the modal, the router,
  the side bar; its boot part runs last), `reports.ts` (the stage 64/65
  moderation moved without a change in behaviour), `limits.ts` (the
  limit fields, units and checks shared by one account and the
  defaults), `accounts.ts`, `log.ts`, `flags.ts`, and C2's `graphs.ts`;
  `page.ts` joins them into one IIFE and exports `ADMIN_JS_MODULES` so
  the unit and Worker tests check every module for HTML sinks.
- **Router.** `#<view>[/<rest>]`, the rest URI-decoded; an unknown view
  falls back to Reports. Reports' element stays in the page (hidden off
  its view) so the side bar's count can be updated; the other views
  render into a fresh element each time they open. Stats and the queue
  are read once at the start (for the header and the count), then every
  60 s only while Reports is open.
- **The stage 59 numbers.** Online now, today's figures, the 7 and 30
  day devices and the use estimate sit at the top of Reports; the 30-day
  table and the splits are below the queue in a folded `<details>`
  until C2's Use view takes them over. Flags moved to "Flags and
  limits".
- **The environment hint** comes from the host name (`staging.*`,
  localhost, otherwise production); the API does not send one.
- **Units.** Limits are shown and typed in binary MB (the Worker's
  defaults are `50 × 1024 × 1024`); a bare number in a byte field means
  MB, and B/KB/GB are understood. The rest of the page keeps decimal
  sizes (`size()`). The page checks 0 … 20 × built in before sending.
- **Every limit change asks first** in the modal, which lists the
  changes ("Runs, bytes 50 MB → 200 MB"), warns for a value under use,
  and carries the optional note for the log. A value equal to the
  default is left out of `own` (as the Worker does); an empty `own` is
  sent as `limits: null`, an empty override set as `defaults: null`.
- **Not shown:** the mockup's "Accounts with their own" count per
  default limit; the contract has no such figure.

## As built (stage 66 C2): the graph views

- `worker/admin/graphs.ts` registers `use`, `storage` and `sharing`
  (group `numbers`) through the shell's `registerView` and uses only the
  shell names in its header. The range is the hash's first parameter
  (`#use/90d`, default 30d); a range button writes it with
  `history.replaceState` (no `hashchange`, so the shell does not render
  twice) and reads `GET /api/admin/graphs?range=` once; Reload reads it
  again; nothing polls.
- Each answer becomes graph models (title, kind line / bars / stack /
  hbar / top, x points, series of `number | null`). A card draws one
  small (latest figure, legend for two series or more, a 440×140 SVG);
  Open or a click on the card draws it large in place over the whole row
  (one open card a view), its width measured at opening and scaled by
  `viewBox`: legend, direct end labels for up to four lines, a crosshair
  (lines) or band (bars) with a tooltip of every series, moved by the
  pointer or by the arrow keys, Home and End on the focused graph, and a
  Table toggle with the same numbers, newest first.
- A metric absent from a day is a gap (a broken line, no bar, `–`), and
  the online line also breaks where samples are missing for more than
  1.5 buckets. Today (`final: false`) is labelled "so far", its bars
  paler and its line segment dashed; the big figure is the newest whole
  day with today's so far beside it.
- **Published a day:** stacked, Link = `pubs_new − listed_new` (at least
  0) and Hall of Fame = `listed_new`, on the reading that `pubs_new`
  counts every new publication and `listed_new` those of them listed.
  If the Worker counts a later listing of an older link run in
  `listed_new`, Link is a floor for that day.
- Splits fold past seven keys into the six largest and Other (the table
  lists every key). The ten largest accounts are segmented bars (runs,
  published, small items) linking to `#account/<name>`.
- Colours: three categorical tokens `--gr1…3` (light `#2a78d6`,
  `#eb6834`, `#1baf7a`; dark `#3987e5`, `#d95926`, `#199e70`, checked
  with the dataviz validator) under the page's `prefers-color-scheme`
  rule; a series keeps its colour across cards (7 days is always the
  second). Sizes are set through CSSOM (`style.width`), never a style
  string; text by `textContent` only.
- Tests: `tests/unit/admin-graphs.test.ts` (happy-dom, the shell's
  helpers faked).
## As built (stage 66 B)

The Worker's part, branch `stage66-worker`. The contract in
`shared/cloud/api.ts` is unchanged in shape; only the comment of
`AdminDailyMetric` was extended with the exact meaning of each metric.

### Files

- `worker/migrations/0007_admin_panel.sql`: `admin_log.prev`, `mac`;
  triggers `admin_log_no_update`, `admin_log_no_delete` (`RAISE(ABORT,
  'admin_log_append_only')`) and `admin_log_chain` (BEFORE INSERT, aborts
  `admin_log_chain` when `NEW.prev IS NOT` the newest row's `mac`, or when
  `NEW.mac` is NULL once the newest `mac` is not); `limit_default(name,
  value) WITHOUT ROWID`; the backfill (below). Works in workerd's D1
  (checked in the tests).
- `worker/auditlog.ts`: `sealedBatch(env, db, line, build, guard?)` is the
  only `INSERT INTO admin_log` in the Worker. It reads the head `mac`,
  seals, and runs `build(entry)` as one batch; on `admin_log_chain` it
  builds again on the new head, up to `RETRIES` = 3 more times, then
  throws (nothing of the action is written). `guard` keeps the account
  delete's `EXISTS (… auth_hash …)` condition (placeholders from `?8`).
  `logKey` = HMAC(AUTH_PEPPER, `wc-admin-log`); with a pepper under 16
  characters SHA-256 of the label (as `whoOf`). **Deviation:** the sealed
  text is `JSON.stringify([prev ?? '', ts, who, action, target, note])`,
  not the fields joined with `|`, so a `|` in a note cannot shift fields.
  `mac` is base64url (43 characters).
- `verifyChain`: rows by id; rows before the first sealed one are
  `unsealed`; from it on, each row must be sealed, have `prev` equal to the
  previous row's `mac` and a matching seal; the first that does not is
  `brokenAt` (a changed row at its own id, a removed row at the next one).
  `head` is the newest row's `mac`, 12 characters ('' when none).
- `worker/limits.ts`: `builtInLimits(env)` (DEFAULT_ACCOUNT_LIMITS with
  RUN_BYTES_LIMIT), `loadLimitDefaults(env, now)` (30 s per isolate per
  D1 binding, as the flags; never throws), `currentDefaults(env)` (sync).
  `defaultLimits`/`limitsOf` in `accounts.ts` now include the overrides.
  Loaded in `accountApi` after its rate limit (an address over its limit
  still costs no database read), in `/api/config`, and after the Access
  check on admin paths. `limitsInput` (known keys, whole numbers 0 … 20 ×
  built-in), `differing`, `changeNote` (`runBytes 50 MB → 200 MB, items
  2000 → 3000`, bytes in B/KB/MB/GB of 1024, `no change` when none; the
  admin's note follows after ` — `).
- `worker/panel.ts`: the panel's routes; `router.ts` merges them with
  moderation's (`/api/admin/account/<name>`: GET in panel, POST in
  moderation). `GET /api/admin/log` moved here from moderation.ts.
- `worker/stats.ts`: `PANEL_METRICS` in the roll-up; `adminGraphs`.
- `worker/flags.ts`: `setFlag` replaced by `flagStatement` (the router
  batches it with the log entry).

### Exact behaviour

- **Accounts:** `q` trimmed, lowercased, at most 20 characters, matched
  with `name_key LIKE %q% ESCAPE '\'`; `state` all|active|suspended; sort
  `runs` is by run-body count, `items` by item count, `pubs` by published
  count, `bytes` by the total; ties by name; a bad parameter is 400; a
  page past the end is empty. `total` is the filter's count, `totals`
  every account's. Sessions are live ones (`expires > now`).
- **One account:** `community.comments`/`notes` count active and hidden
  ones; `reportsMade` every report it made; `reportsOpen` open report rows
  on its runs, comments and notes. `log`: the newest 20 entries whose
  target is the name (any case) or one of its runs, comments or notes,
  never `flag.*` or `limits.default`.
- **PUT …/limits** replaces the account's own set (fields not sent are
  not its own any more); fields equal to the current default are dropped;
  nothing left stores NULL. `{limits, note?}` only; otherwise 400. The
  answer is `AdminLimits` with `own` and `effective`.
- **PUT /api/admin/limits** replaces the overrides the same way against
  the built-in values; logged `limits.default`, target `defaults`.
- **end-sessions**: `ended(… 'ended' …)` for every session of the account
  and `account.end-sessions` in one batch; 204.
- **Flags:** `flag.on` / `flag.off`, target the flag, note ''; every PUT
  is logged, also one that sets the value it had.
- **Log:** every row is read (the chain needs them all); `kind` and `q`
  (part of the target, any case, ≤ 64) filter in the Worker; `total` is
  the filtered count; `next` the last id of the page when more remain.
  Bad `before`/`kind`/`q` is 400. `by` is `who`'s first 8 characters.
- **Graphs:** online for 24h/7d/30d/90d from `stat_sample` (`ts > now −
  range`), the highest per bucket, bucket start as `ts`; for `all` the
  rolled-up days' `peak_online`/`peak_playing` plus today's samples' peak.
  `days`: `stat_daily` rows (key '') from the range's first day (24h: two
  days, 7d: 7, …) to yesterday, `final: true`, plus today live (`final:
  false`) with every metric. `split`: the range's rolled-up splits plus
  today's. `largest`: accounts with any bytes, by total. `sharing.pubs`
  active and hidden runs, `listed` active listed, `votes` every vote row,
  `comments`/`notes` active ones, `openReports` open report rows. Five
  batches, no query per row.
- **Daily metrics** (roll-up and backfill alike, per UTC day):
  `devices_7d`/`devices_30d` distinct devices in the 7/30 days ending with
  the day; `new_accounts` accounts created; `accounts`, `item_bytes`,
  `run_bytes`, `pub_bytes` totals when rolled up (no backfill: storage
  history starts with the deploy); `pubs_new` publications created that
  day, link or listed, not `pending` (removed ones count); `listed_new`
  runs whose `listed_at` (first listing) falls on the day; `votes` by
  `vote.updated`; `comments`, `notes`, `reports` by `created`; `views`
  rows of `pub_view`. The backfill covers days before `date('now')`.

### Deletion gaps found and closed (`worker/deletion.ts`)

- `session_end` kept the account's id on every ended session (the new
  `deleted` ones and older `logout` ones): now set to `''` in the same
  transaction; the reasons stay for the cookies still out there.
- `pub_view` kept the views of its runs (by run id) until the two-day
  prune: now deleted with the account.

### Tests

- `worker/test/admin-access.test.ts`: "every admin route and method, and
  unknown admin paths: 403 without the token, for another e-mail, a
  service token, a wrong audience" (17 route samples + 9 unknown paths × 7
  methods × 4 credentials; asserts nothing written); "every admin write
  without X-WC, or from another Origin, is 403 and writes nothing" (the 7
  write routes read from `adminRoute`, 6 header variants).
- `worker/test/deletion-guard.test.ts`: "every column that may hold an
  account id is one deletion handles" (column names from
  `pragma_table_info` over `sqlite_master` against a named list: a new
  account column fails it); "an account with every kind of row, deleted by
  the admin…" (searches every column of every table for the account's id,
  name and its things' ids; allowed: tombstones, `r2_sweep`,
  `reserved_name`, `admin_log.target`, handled reports without text or
  reporter; R2 empty under `u/<id>/` and no `pub/<id>`).
- `worker/test/audit-log.test.ts`: UPDATE/DELETE/REPLACE refused (and a
  batch rolled back); out-of-line inserts refused; the 0.14.0 inserts
  before the first seal; a changed row `broken` at its id; a removed row
  at the next; a re-seal with another key found; the head; racing
  batches retried (and failing after 3 retries with nothing written);
  every router action sealed; "the Worker's source has no UPDATE, DELETE,
  REPLACE or DROP on admin_log" (Vite `import.meta.glob` over `worker/**`
  and the migrations; also only one `INSERT INTO admin_log`, in
  auditlog.ts).
- `worker/test/admin-panel.test.ts`: accounts (search, `_`/`%` escaped,
  filter, sort, pages of 50, 400s), one account, limits per account and
  defaults (stored only when differing, 400s writing nothing, below use
  deletes nothing then `413 pub_quota`, `/api/config`, 30 s per isolate),
  end-sessions, flags logged, the log's paging/kind/q, graphs per range,
  and the migration's backfill run on fixture rows.
- Test support: `helpers.ts` `emptyAdminLog`/`withoutLogTriggers` (drop
  and restore the triggers, as the D1 console could); `access-helpers.ts`;
  `admin-call.ts` now goes through the router's `adminRoute`.
