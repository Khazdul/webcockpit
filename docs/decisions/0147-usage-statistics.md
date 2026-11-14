# 0147 — Anonymous usage statistics

- Status: Accepted (owner, 2026-11-13: count every user, anonymously,
  per device; who is online is not shown). Not built.
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
