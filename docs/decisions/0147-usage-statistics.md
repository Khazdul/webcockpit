# 0147 — Anonymous usage statistics

- Status: Accepted (owner, 2026-11-13: count every user, anonymously,
  per device; who is online is not shown). The server side is built
  (stage 59 part A, "As built" below); the client is part B.
- Date: 2026-11-13
- Related: intent Goal 14, spec §7.6, ADR 0144, ADR 0148.

## Context

The client talks only to MUME, so nobody knows how many people use it.
The owner wants to see how many are online and how use develops.

## Decision

### Owner's decisions

- Everybody is counted, logged in or not. There is no switch.
- Counting is anonymous and per device. Names of players, accounts or
  characters are never shown or collected.

### The heartbeat

- `POST /api/beat` at page load and then every 5 minutes while the
  page is visible; once more when the state changes between the start
  page and play.
- Body: a random device id (made once, kept in `localStorage`), the
  client version, the device type (desktop, tablet, phone), the
  browser family, and the state (`menu`, `playing`, `replay`).
- **Never sent or stored:** character, profile or account names, the
  IP address, anything typed. The session cookie is not sent (its path
  is `/api/u`, and the beat is fetched with `credentials: 'omit'`), so
  the device id cannot be tied to an account.
- A failed beat is dropped silently. It is sent with `keepalive` and
  never awaited.

### On the server (D1)

- `presence(device, first_seen, last_seen, state, type, browser,
  version)`: one row per device, upserted.
- **Online now** = rows seen in the last 6 minutes, split by state.
- A Cron trigger every 5 minutes writes a sample (online, playing) and
  once a day rolls up: devices that day, new devices, the peak, play
  minutes (beats × 5), and the split by device type, browser and
  version. Weekly and monthly unique devices come from a
  `device_day(device, day)` table.
- Kept: daily figures for good; samples 90 days; `device_day` and idle
  `presence` rows 35 days. After that a device that returns counts as
  new.
- `GET /api/stats/public` returns only the two numbers online and
  playing, cached 60 s.

### Where it is shown

- The admin page (ADR 0148): a plain table from stage 59, graphs in
  stage 66.
- The start page may show "N online" (stage 59 builds it small and
  discreet; the owner keeps or removes it after seeing it).
- The About page gets a "What the site knows" section, and the privacy
  text names the heartbeat.

## Alternatives

- **Cloudflare Web Analytics.** Page views only, a third-party script,
  6 months.
- **Analytics Engine.** Sampled, 3 months, no local simulation.
- **A WebSocket to a Durable Object** for an exact live count. A
  second permanent connection per tab for a number that is as good
  5 minutes old.
- **Asking first.** The owner chose to count everybody; the data is a
  random number per device and nothing else.

## Consequences

- A 5-minute beat keeps 200 concurrent players at about 58 000 D1
  writes a day, inside the free 100 000. Above some 300 concurrent,
  the paid plan is due (ADR 0144).
- A cleared browser counts as a new device, so "new devices" runs a
  little high.
- The random device id is still an online identifier in the eyes of
  the GDPR. It is described in the privacy text and dropped after 35
  idle days.

## Addendum (2026-11-14, plan of stage 59; not built)

Taken by the session when the stage was planned
(`docs/stages/59-usage-statistics.md`); the owner may change them.

- **The flag `stats`** opens the beat and "N online" (spec §7.0 rule
  5). Its default per environment is a `vars` entry in
  `wrangler.jsonc` (staging on, production off); a row in the D1 table
  `flag(name, value)` overrides it and is set from the admin page, so
  production opens without a release.
- **Use against the plan's limits** on the admin page is our own
  estimate: beats are counted in the presence upsert itself (no extra
  row), plus the cron samples and the roll-up rows. It is marked as an
  estimate and links to the Cloudflare dashboard. No analytics token
  is kept.
- **An ordinary beat writes at most one row.** `device_day` is written
  only on a device's first beat of a day, and the tables carry only
  the indexes the queries need (index rows count as writes).
- **Automated browsers send no beat** (`navigator.webdriver`), so our
  own tests against the live site are not counted. Nor does the dev
  server.
- **`/api/beat` is rate limited** by the Workers rate limiting
  binding, keyed by address. The address is used in passing and never
  stored.

## As built (stage 59 part A, server, 2026-11-14)

Checked in workerd (`@cloudflare/vitest-plugin`) and under `wrangler dev`
4.162.0, not yet against a deployed Worker. Code: `worker/stats.ts`,
`worker/flags.ts`, `worker/router.ts`; tables:
`worker/migrations/0001_usage_statistics.sql`; tests:
`worker/test/stats.test.ts`.

### Tables and the write budget

- Every table has its primary key as its only index (`WITHOUT ROWID`
  where the key is text) and no secondary index: D1 counts a written
  index row as a row written.
- **An ordinary beat is one statement and one row written**: an UPSERT
  of `presence` with `RETURNING beats`. The row carries the day's beat
  counters (`day`, `beats`, `play_beats`); a device's first beat of a
  new UTC day moves them to `prev_day`, `prev_beats`, `prev_play_beats`
  and starts at 1 (SQLite evaluates every `SET` against the old row).
  When `RETURNING` says `beats = 1` it was the first beat of the day,
  and only then a second statement, `INSERT OR IGNORE` into
  `device_day(day, device)`, follows (two tabs racing at midnight still
  make one row). So no read before the write, and no extra row for the
  estimate. Measured with `meta.rows_written`: 1 for an ordinary beat, 2
  for a device's first beat of a day (a test asserts both).
- `device_day` is keyed `(day, device)`: a day or a range of days is a
  range of the key (daily, weekly and monthly uniques, pruning).
- Times are milliseconds, days `YYYY-MM-DD`, all UTC.
- **Online now** is a scan of `presence` (`last_seen` within 6 minutes,
  boundary included). An index on `last_seen` would make every beat two
  rows written; reads are the cheaper budget (5 M a day against 100 k
  writes). The scan runs every 5 minutes in the cron and on the admin
  page.
- **`GET /api/stats/public` answers from the newest `stat_sample`** when
  it is at most 10 minutes old (one row read, however many devices
  there are), else counts live (local development, or a stopped cron).
  It is cached 60 s by the browser anyway.

### The beat

- Order of checks: no database → 503 `unavailable`; flag `stats` off →
  404 `not_found`; the rate limit → 429 `rate_limited`; the body → 400
  `bad_request`; a failing write → 503. 204 with no body.
- The body is read with a cap of 512 bytes (a real beat is about 150),
  must be UTF-8 JSON, an object with exactly the five keys of `Beat`:
  `device` a lowercase UUID (as `crypto.randomUUID()` makes it),
  `version` three numbers with an optional pre-release tag of at most 16
  characters and 32 in all, `type`, `browser` and `state` from the
  lists of `shared/cloud/api.ts`. Anything else, an extra key included,
  is 400.
- **Rate limit:** the Workers rate limiting binding `BEAT_LIMITER`, 30 a
  minute per address (`CF-Connecting-IP`; a page beats every 5 minutes,
  so this leaves room for many devices behind one address). The address
  is the limiter's key and is neither stored nor logged. Cloudflare's
  docs call the limit per location, approximate and eventually
  consistent, and advise against keying by address alone because many
  share one; for a heartbeat with nothing to protect but the write
  budget that is acceptable. Simulated by Miniflare locally and in the
  tests (limit 5 in `worker/test/wrangler.jsonc`).
  <https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/>

### Flags

- `GET /api/config` → `{flags: {stats}}`, `Cache-Control: max-age=60`.
  The default is the var `FLAG_STATS` (`true` on staging, `false` in
  production; `true`, `"true"`, `"on"`, `"1"` count as on, a missing var
  is off). A row in `flag(name, value)` overrides it. The rows are kept
  30 s per isolate, so a beat does not read D1 for its flag every time;
  a change from `/admin` reaches all isolates within 30 s (and the
  clients within the 60 s cache on top).
- Without a database (the static server's `cloudflare` profile) the
  flags are the vars, there none: `stats` off, the beat 503, the public
  numbers 404.

### Cron

- `triggers.crons`: `*/5 * * * *` (sample) and `10 0 * * *` (roll-up of
  the previous UTC day, then pruning), set for both Workers: four crons
  on the account, the free plan allows five
  (<https://developers.cloudflare.com/workers/platform/limits/>). The
  handler switches on `controller.cron`, which matches the configured
  string character for character.
- **Sample:** `INSERT OR REPLACE INTO stat_sample(ts, online, playing)`.
- **Roll-up** into `stat_daily(day, metric, key, value)`: `devices`
  (device_day rows of the day), `new_devices` (presence `first_seen` in
  the day), `peak_online`, `peak_playing` (max of the day's samples),
  `play_minutes` (playing beats × 5), `beats`, and with a key the split
  of the day's devices by `type`, `browser` and `version` (as their
  presence rows say at roll-up time). The day's rows are deleted and
  written in one batch (a transaction), so it is idempotent.
- **Pruning:** samples older than 90 days, `device_day` older than 35
  days, `presence` idle for 35 days.

### The estimate on the admin page

Our own count of today, labelled as an estimate with a link to the
dashboard:

- requests ≈ 2 × beats + samples (+1 for the roll-up): every beat, and
  at most about one `/api/config` or `/api/stats/public` per beat (both
  come once per page load, and every load beats);
- rows written ≈ beats + device days + samples + yesterday's roll-up
  rows;
- rows read ≈ 2 × beats + samples × presence rows (the sample's scan).

Pruning and the admin page's own reads are not counted.

## As built (stage 59 part B, the client, 2026-11-14)

- **Modules.** `src/cloud/config.ts` (the flags: `GET /api/config`
  once per page load, 4 s timeout, any failure is all flags off; when
  the client may call the API at all), `beat.ts` (the heartbeat),
  `device-info.ts` (type and browser family), `online.ts` (`GET
  /api/stats/public`), `start.ts` (starts the beat). Types and
  constants come from `shared/cloud/api.ts`.
- **Nothing on the cold start or the game path.** `src/main.ts`
  imports `cloud/start` in a `requestIdleCallback` (3 s timeout) after
  the shell has booted; only then are the flags asked. "N online"
  loads `cloud/online` the same way from the almanac. The beat is a
  timer of its own and `fetch` without `await`; a change of view only
  re-arms a timer. The shell's `view` (`menu`, `playing`, `replay`)
  and `onView` are a getter and a set of listeners called where the
  view already changes. The cloud chunks are about 4 kB together.
- **When no request is made at all:** in an automated browser
  (`navigator.webdriver`), on the plain dev server (`__WC_DEV_API__`
  is true only when `npm run dev:cloud` proxies `/api`), in `?bench`.
  The beat is also off on any dev server, as the stage file says; it
  can be seen against `dev:cloud` only with the test hook below.
- **The beat.** At load if visible (a tab opened in the background
  waits until it is shown), every 5 minutes while visible, paused
  while hidden (a due beat goes at once when shown again), and on a
  change of view once it has held 1.5 s. A hidden page sends nothing;
  a change while hidden goes when it shows. `playing` is the cockpit
  being the view (connected or not), `replay` the offline cockpit or
  any open log player (History's run log, Spotlights, the whole-window
  player), `menu` the rest.
- **Several tabs.** One device is one row on the server anyway; to
  spare beats, the tabs share a note in `localStorage` `wc.beat`
  (`{tab, at, state}`): a tab skips its beat when another tab has sent
  one since this tab's last, less than 4.5 minutes ago, with a state
  that ranks at least as high (playing > replay > menu). A menu tab
  thus never overwrites a game tab, and two game tabs send about one
  beat per period between them.
- **The device id** is `crypto.randomUUID()` (a `getRandomValues` v4
  where there is none: plain-http hosts), kept in `wc.device`; a value
  that is not a UUID is replaced. With storage blocked the page uses
  an id of its own for its life.
- **Device type** is the device, not its mode: `tablet` for the tablet
  flag (ADR 0140), `phone` for the phone flag or a phone in "Desktop
  site" mode, else `desktop`. **Browser family** from the user agent,
  in this order: Samsung Internet, Edge (`Edg`, `EdgA`, `EdgiOS`),
  Opera / Yandex / UC as `other`, Firefox (`FxiOS` too), Chrome
  (`CriOS` too), Safari (with `Version/` or `Mobile/`), else `other`.
  Brave and Vivaldi send Chrome's agent and count as `chrome`.
- **"N online"** sits above the almanac's date, in its top padding
  (absolutely placed, so the date, time and version never move when it
  comes or goes), in the version line's quiet mono face; it fades in.
  Same rule on desktop, tablet and phone (smaller padding and type on
  the phone layout). Shown only when the flag is on, the request
  succeeds and `online` is at least 1; refreshed every minute while the
  almanac is shown. `playing` is not shown.
- **About** has a new section, "What the site knows" (letter K), and
  its intro no longer says "nothing kept anywhere but this browser".
  Its "privacy page" opens the privacy leaf in the stack.
- **The privacy page** is About's leaf with its own text
  (`src/chrome/frames/privacy-text.ts`, letters P E Y K A C W R). The
  build emits `privacy.html`, the built `index.html` with its own
  title (`privacyPagePlugin`, vite.config.ts). Workers static assets
  with `html_handling: auto-trailing-slash` and GitHub Pages both
  answer `/privacy` with it (200), so no Worker route and no
  `not_found_handling` change were needed; the page's asset URLs are
  absolute. The app sees the path and pushes the leaf over the start
  menu; Back goes to the menu and puts the address back to the base.
  `public/_headers` gives `/privacy` `no-cache` like the page. The
  static server's `pages` profile now serves `/x` from `x.html` as
  Pages does; `tests/e2e-prod` checks `/privacy` in both profiles.
- **Tests.** Unit: `tests/unit/cloud-beat.test.ts` (fake timers),
  `cloud-config.test.ts`, the privacy page in `about-leaf.test.tsx`.
  E2E: `tests/e2e/cloud-stats.spec.ts`, `phone-cloud-stats.spec.ts`.
  The e2e use Playwright's `page.route('**/api/**')` stubs
  (`tests/e2e/cloud-stats.ts`) and `?cloudtest`, a query honoured only
  when `import.meta.env.DEV` (a production build folds it away), which
  lets the client call the API under webdriver. A test Worker behind
  the dev server was the stage file's suggestion; the stubs let each
  test choose its answer (flag off, 404, 500, a refused connection)
  and see every request, with no second server per worktree.
