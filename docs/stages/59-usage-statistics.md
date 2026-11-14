# Stage 59 — Usage statistics

Status: **In progress** (started 2026-11-14).

## Goal

The owner can see how many use WebCockpit: online now, per day, and
how it develops (intent Goal 14, spec §7.6 and §7.9, ADR 0147, ADR
0148 "The admin page"). Counting is anonymous and per device. A player
sees at most one quiet line, "N online", on the start page, and can
read what the site knows about him.

## What must be true afterwards

- Spec §7.0 holds: the game path is untouched (the beat is never
  awaited), logged out is today's client, and everything is dark in
  production until the flag `stats` is on.
- A device is counted once however many tabs it has; nothing but the
  five fields of `Beat` (`shared/cloud/api.ts`) is sent or stored; no
  IP address is stored.
- Automated browsers (our e2e, `test:prod`, anything with
  `navigator.webdriver`) and the dev server send no beat.
- With the service down or the flag off, the start page looks as it
  does today.
- `/admin` answers only the owner (Cloudflare Access, checked again by
  the Worker).
- An ordinary beat writes at most one D1 row (ADR 0147's budget).

## Decisions taken at the start (to ADR 0147 / 0144 "As built")

- **Flags:** `GET /api/config` gives `{flags: {stats}}`. The default
  per environment is a `vars` entry in `wrangler.jsonc` (staging on,
  production off); a row in the D1 table `flag(name, value)` overrides
  it, set from the admin page. So staging works before Access exists,
  and production opens without a release.
- **Databases:** D1 `webcockpit` and `webcockpit-staging`, R2 buckets
  of the same names, all with jurisdiction `eu`, made once by a
  by-hand workflow (`provision.yml`) with the deploy token; the ids go
  into `wrangler.jsonc`. R2 is only created now (used from stage 63).
  If R2 is not enabled on the account the workflow says so and the
  owner enables it (dashboard, R2, needs a card on file).
- **Migrations:** `worker/migrations/NNNN_name.sql`, applied by
  `deploy.yml` (`wrangler d1 migrations apply --remote`) before
  `wrangler deploy`.
- **Staging gets a host on our zone,** `staging.mumecockpit.com` (a
  custom domain of `webcockpit-staging`), because Cloudflare Access
  can guard a path only on a zone of ours: on `workers.dev` it is the
  whole site or nothing, and that would shut `test:prod` out. All
  staging answers carry `X-Robots-Tag: noindex`.
- **Admin identity:** the Worker verifies the Access JWT (signature
  against the team's certs, issuer, audience) and that its e-mail is
  in the secret `ADMIN_EMAILS`. Team domain and audience are `vars`
  (not secret); the e-mail is a Worker secret set in the dashboard,
  never in the repository. Without them `/admin` answers 503
  `admin_not_configured`.
- **Use against the limits** on the admin page is our own estimate
  (beats counted in the presence upsert, cron samples, roll-up rows),
  marked as an estimate, with a link to the Cloudflare dashboard for
  the exact figures. No analytics token.
- **Rate limit:** the Workers rate limiting binding on `/api/beat`,
  keyed by address (used in passing, not stored).

## API (contract; types in `shared/cloud/api.ts`)

| Endpoint | Does |
|---|---|
| `GET /api/config` | `{flags: {stats: boolean}}`, `Cache-Control: max-age=60` |
| `POST /api/beat` | body `Beat`; 204. 400 `bad_request` on any invalid field, 404 `not_found` when `stats` is off, 429 `rate_limited`, 503 `unavailable` without a database |
| `GET /api/stats/public` | `{online, playing}`, `Cache-Control: public, max-age=60`; 404 when `stats` is off |
| `GET /admin` | the admin page (Access) |
| `GET /api/admin/stats` | the admin page's numbers (Access) |
| `PUT /api/admin/flags/<name>` | `{value: boolean}` (Access, `X-WC: 1`, matching `Origin`) |

`playing` counts devices in state `playing`; `online` all states.
Online = seen in the last 6 minutes.

## Tasks

### A. Server (building agent, worktree)

- [ ] `provision.yml`; D1 and R2 bindings in `wrangler.jsonc` for
      both environments; `staging.mumecockpit.com`; flags default var.
- [ ] Migration 0001: `presence`, `device_day`, `stat_sample`,
      `stat_daily`, `flag` (spec §7.11), with the indexes the queries
      need and no others (index rows count as writes).
- [ ] `POST /api/beat`, `GET /api/stats/public`, `/api/config` with
      flags; validation; the rate limit.
- [ ] Cron: every 5 minutes a sample; 00:10 UTC roll-up (devices of
      the day, new devices, peak, play minutes, split by type, browser
      and version) and pruning (samples 90 days, `device_day` and idle
      `presence` 35 days).
- [ ] Access verification; `/admin` (its own small page in
      `worker/admin/`, plain and readable, nothing from the app) with
      online now, today, the last 30 days as a table, weekly and
      monthly devices, the estimate against the plan's limits, and the
      flag switch; `GET /api/admin/stats`, `PUT /api/admin/flags/…`.
- [ ] Tests in workerd (beat, validation, dedupe per device, online
      window, roll-up, pruning, flags, Access checks with a test key);
      `deploy.yml` applies migrations; the static server's `cloudflare`
      profile keeps working without a database (503 `unavailable`).
- [ ] Docs: ADR 0147 and 0144 "As built", spec where it differs.

### B. Client (building agent, worktree)

- [ ] `src/cloud/`: config fetch (flags), `beat.ts` per spec §7.6
      (load, every 5 minutes while visible, on a state change; never
      awaited; off in dev, under `navigator.webdriver`, and when the
      flag is off).
- [ ] Start page: one quiet line "N online" by the almanac; absent
      when the flag is off or the request fails. Desktop, tablet and
      phone.
- [ ] About: a "What the site knows" section; the `/privacy` leaf in
      the About look with the full text (the heartbeat; later the
      account and shared runs, named as not existing yet; Cloudflare
      as processor; `abuse@mumecockpit.com`; how to clear the device
      id); `https://mumecockpit.com/privacy` opens it.
- [ ] Unit and e2e tests (a test Worker stub behind the dev server's
      `/api`); the benchmarks of spec §1.3 not moved.

### C. Owner's part (guided by the session, about 15 minutes)

- [ ] Cloudflare Zero Trust: an Access application for
      `mumecockpit.com/admin*`, `mumecockpit.com/api/admin/*` and the
      same two on `staging.mumecockpit.com`; policy: the owner's
      e-mail, one-time PIN. Give the session the team domain and the
      application's audience tag.
- [ ] The secret `ADMIN_EMAILS` on both Workers (dashboard).
- [ ] Email Routing: `abuse@mumecockpit.com` forwarded to the owner.
- [ ] If asked: enable R2.

### D. Release

- [ ] Review of both parts; merge; full e2e alone on the machine.
- [ ] Staging: deploy, `test:prod`, a real browser sends beats, the
      admin page shows them.
- [ ] Owner test on staging (test guide), then release and the flag
      on in production from `/admin`.

## Test guide (owner)

Written when the build is on staging.

## Owner feedback

(none yet)
