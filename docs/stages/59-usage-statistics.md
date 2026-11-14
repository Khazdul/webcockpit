# Stage 59 — Usage statistics

Status: **Released 0.10.0** (2026-11-14), dark in production until the owner turns `stats` on at `/admin`.

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

## Decisions taken at the start (ADR 0144, 0147 and 0148, addenda of 2026-11-14)

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

## The night pass (owner, 2026-11-14)

The owner starts the next session and goes to bed. It works as far as
it can alone, and in the morning the owner meets a short list of what
is his to decide or do.

**The session may, without asking:** build parts A and B with agents
in worktrees; review and merge to `main`; push `main`; run
`provision.yml`; deploy to **staging** with `deploy.yml` (deploy and
triggers), which includes attaching `staging.mumecockpit.com`; run
`test:prod` against staging and against the live site (read-only);
run the full e2e alone on the machine.

**The session must not:** push a `v*` tag or release; deploy or run
anything against **production** (the Worker `webcockpit`, its D1, its
flags); change DNS records by hand or anything in the dashboard;
change `intent.md`; remove `pages.yml`. If a step is refused by a
permission check, it is written down for the morning and the work
goes on with what does not depend on it.

**Where it stops by itself:** part C is the owner's (Access, the
secret, Email Routing, perhaps R2). Until then `/admin` answers 503 on
staging; the admin page and the Access check are tested in workerd
with a test key, and the numbers are checked with `wrangler d1
execute` against staging.

**In the morning** the section "For the owner" below holds: what is
on staging and how to look at it, the decisions that are his (each
with the session's recommendation), part C step by step, and anything
that was refused or failed.

## For the owner (written by the night pass)

### What is on staging (main at 1d9ed905, the night of 2026-11-14)

Parts A and B are built, reviewed, merged to `main` and deployed to
staging. Nothing was released and nothing ran against production
except `provision.yml`, which made the production database too
(empty; no Worker uses it until a release).

- **<https://staging.mumecockpit.com>** (also
  <https://webcockpit-staging.olevong.workers.dev>). Every answer
  carries `X-Robots-Tag: noindex`. The flag `stats` is on there.
- **Start page:** "N online" sits quietly above the almanac's date
  (top right). It is hidden when the count is 0, so you may need a
  second device, or wait: the number comes from the cron's sample every
  5 minutes, so your own visit shows up within 5 minutes and drops out
  6 minutes after your last beat. Look on desktop, phone and tablet.
- **About:** a new section "What the site knows" (key K), with a link
  to the privacy page. **<https://staging.mumecockpit.com/privacy>**
  opens the privacy page directly. Please read the text once.
- **`/admin`** answers 503 `admin_not_configured` until part C is
  done. The page and the Access check are tested in workerd with a
  test key.

Checked tonight: unit 4333 passed; full e2e alone, 5 workers: 1457
passed, 2 failed under load (`loading.spec.ts:238`,
`new-user.spec.ts:21`), both pass alone; `test:prod` 14/14 against
`staging.mumecockpit.com` and against workers.dev. A real Chromium
(without the webdriver flag) sent `config → stats/public → beat`; a
controlled beat in state `playing` showed up as `{online:1,
playing:1}` in the next cron sample, and older beats fell out after
6 minutes as they should. The benchmarks did not move (ADR 0147, "As
built (stage 59 part B)").

### Your decisions (with my recommendation)

1. **Keep "N online" on the start page?** (spec §7.6: you keep or
   remove it after stage 59.) Placement above the date was chosen
   because nothing else on the page moves. The alternative is the
   version line ("WebCockpit 0.9.3 · 12 online"). *Recommendation:
   keep it where it is.*
2. **A game in a background tab.** As specified, a hidden tab sends no
   beats, so someone playing with the tab in the background drops out
   of "online" after about 6 minutes. *Recommendation: let a tab in
   state `playing` keep beating every 5 minutes while hidden* (a few
   more D1 writes; the figures get truer). A small change; say yes and
   the next session makes it.
3. **The privacy text** (`/privacy`): it names "legitimate interest"
   as the ground for counting, and promises that accounts and shared
   runs will be explained before they can be used and will be the
   player's choice. *Recommendation: read it and approve or mark
   changes.*
4. **"Playing" on the start page** is not shown, only "N online".
   *Recommendation: keep it so.*
5. **Release.** After your test on staging (and part C if you want to
   see `/admin` first): a minor release (0.10.0). It applies the
   migration to the production database; the flag is off in
   production, so nothing shows until you turn `stats` on at
   `https://mumecockpit.com/admin`. *Recommendation: part C first, then
   release, then the flag on from `/admin`.*

### Part C, step by step (about 15 minutes, all in the Cloudflare dashboard)

1. **Access** (Zero Trust → Access → Applications → Add an
   application → Self-hosted). Name `WebCockpit admin`. Add six
   destinations (public hostnames with a path): on `mumecockpit.com`
   the paths `admin`, `admin/*`, `api/admin/*`, and the same three on
   `staging.mumecockpit.com` (a path wildcard does not cover its
   parent, so `admin` and `admin/*` both). Policy: Allow, Include →
   Emails → your e-mail. Login method: One-time PIN. Save.
2. Send the session two values: the **team domain**
   (`<team>.cloudflareaccess.com`, Zero Trust → Settings) and the
   application's **Audience (AUD) tag** (the application → Overview /
   Additional settings). They are not secret; they go into
   `wrangler.jsonc` and staging is deployed again.
3. **The secret `ADMIN_EMAILS`**: Workers & Pages → `webcockpit` →
   Settings → Variables and Secrets → Add → type Secret, name
   `ADMIN_EMAILS`, value your e-mail. The same on
   `webcockpit-staging`. (The production Worker only uses it after the
   release; setting it now is fine.)
4. **Email Routing**: mumecockpit.com → Email → Email Routing → enable
   (it adds its MX and TXT records itself), then a custom address
   `abuse@mumecockpit.com` → forward to your address, and confirm the
   mail Cloudflare sends.
5. **R2** (can wait until stage 63): R2 Object Storage → enable (it
   asks for a payment method; the free tier costs nothing). Tell the
   session, which runs `provision.yml` again and puts the two R2
   bindings back into `wrangler.jsonc`.
6. **Check the D1 jurisdiction**: Storage & Databases → D1 →
   `webcockpit` and `webcockpit-staging` should both say jurisdiction
   **EU**. Wrangler printed "region EEUR" when it made them, which does
   not say whether the jurisdiction took.

### Refused or failed tonight

- Nothing was refused by a permission check.
- **R2 is not enabled on the account** (`provision.yml`, run
  43537875273). Both R2 bindings are left out of `wrangler.jsonc` with a
  note, so the deploys work; nothing uses R2 before stage 63.
- **`test:prod` against the live site: 10 passed, 4 failed**, all four
  are the new checks of this stage (`/api/config` caching and the flag,
  `/privacy`), which the live 0.9.3 does not have yet. They pass after
  the release.
- `staging.mumecockpit.com` did not resolve on this machine for the
  first minutes after it was attached (a cached negative answer); it
  works now.
- The client agent's worktree (`.claude/worktrees/agent-af203e…`,
  branch `stage59-client`, merged) could not be removed while its lock
  was held; remove it next session.

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

- [x] `provision.yml`; D1 and R2 bindings in `wrangler.jsonc` for
      both environments; `staging.mumecockpit.com`; flags default var.
- [x] Migration 0001: `presence`, `device_day`, `stat_sample`,
      `stat_daily`, `flag` (spec §7.11), with the indexes the queries
      need and no others (index rows count as writes).
- [x] `POST /api/beat`, `GET /api/stats/public`, `/api/config` with
      flags; validation; the rate limit.
- [x] Cron: every 5 minutes a sample; 00:10 UTC roll-up (devices of
      the day, new devices, peak, play minutes, split by type, browser
      and version) and pruning (samples 90 days, `device_day` and idle
      `presence` 35 days).
- [x] Access verification; `/admin` (its own small page in
      `worker/admin/`, plain and readable, nothing from the app) with
      online now, today, the last 30 days as a table, weekly and
      monthly devices, the estimate against the plan's limits, and the
      flag switch; `GET /api/admin/stats`, `PUT /api/admin/flags/…`.
- [x] Tests in workerd (beat, validation, dedupe per device, online
      window, roll-up, pruning, flags, Access checks with a test key);
      `deploy.yml` applies migrations; the static server's `cloudflare`
      profile keeps working without a database (503 `unavailable`).
- [x] Docs: ADR 0147 and 0144 "As built", spec where it differs.

  Built 2026-11-14 on branch `stage59-server` (ADR 0144, 0147, 0148 "As
  built"). Differences from the plan: `run_worker_first` and the Access
  application list `/admin` and `/admin/*` separately (the docs do not
  promise that `/admin*` matches `/admin`); `/api/stats/public` answers
  from the newest 5-minute sample (one row read) and counts live only
  when there is none; the D1 ids in `wrangler.jsonc` are placeholders
  (`PROVISION:`) until `provision.yml` has run.

### B. Client (building agent, worktree)

- [x] `src/cloud/`: config fetch (flags), `beat.ts` per spec §7.6
      (load, every 5 minutes while visible, on a state change; never
      awaited; off in dev, under `navigator.webdriver`, and when the
      flag is off).
- [x] Start page: one quiet line "N online" by the almanac; absent
      when the flag is off or the request fails. Desktop, tablet and
      phone.
- [x] About: a "What the site knows" section; the `/privacy` leaf in
      the About look with the full text (the heartbeat; later the
      account and shared runs, named as not existing yet; Cloudflare
      as processor; `abuse@mumecockpit.com`; how to clear the device
      id); `https://mumecockpit.com/privacy` opens it.
- [x] Unit and e2e tests (a test Worker stub behind the dev server's
      `/api`); the benchmarks of spec §1.3 not moved. (Built with
      Playwright route stubs and the dev-only `?cloudtest` instead of
      a test Worker: ADR 0147 "As built (stage 59 part B)".)

### C. Owner's part (guided by the session, about 15 minutes)

- [x] Cloudflare Zero Trust: an Access application for
      `mumecockpit.com/admin`, `mumecockpit.com/admin/*`,
      `mumecockpit.com/api/admin/*` and the same three on
      `staging.mumecockpit.com` (part A: a path wildcard does not cover
      its parent); policy: the owner's
      e-mail, one-time PIN. Give the session the team domain and the
      application's audience tag.
- [x] The secret `ADMIN_EMAILS` on both Workers (dashboard).
- [ ] (later, owner) Email Routing: `abuse@mumecockpit.com` forwarded to the owner.
- [ ] If asked: enable R2.

### D. Release

- [x] Review of both parts; merge; full e2e alone on the machine.
- [x] Staging: deploy, `test:prod`, a real browser sends beats, the
      admin page shows them. (Done but the admin page: it waits for
      part C.)
- [x] Owner test on staging (test guide 1–5), release 0.10.0.
- [ ] The flag on in production from `/admin` (the owner).

## Test guide (owner)

On <https://staging.mumecockpit.com> (desktop, then phone and tablet):

1. Open the start page on two devices. Within 5 minutes "2 online"
   (or "1 online" on the other one) appears above the almanac's date.
   Is it quiet enough, and in the right place?
2. About → "What the site knows": does it read well? Follow the link
   to the privacy page; Back returns to the menu.
3. Open `https://staging.mumecockpit.com/privacy` directly: the
   privacy page, over the start menu.
4. Play a while on staging: nothing in the game should feel
   different.
5. After part C: `https://staging.mumecockpit.com/admin` asks for the
   PIN, then shows online now, today, the last 30 days, weekly and
   monthly devices, the estimate against the limits, and the `stats`
   switch.

Feedback wanted: decisions 1–5 above, and anything that looks off.

## Owner feedback

- **2026-11-14:** decisions 1–5 approved as recommended ("N online"
  stays above the date; a playing tab beats while hidden; the privacy
  text is fine; no "playing" on the start page; part C, release, then
  the flag). Test guide 1–4 done on staging: looks good. Next: part C,
  then test guide step 5.
- **2026-11-14, later:** part C done (Zero Trust Free, one Access
  application with the six destinations, policy `Owner`, login with
  the Cloudflare identity and instant authentication, so no PIN is
  asked; `ADMIN_EMAILS` on both Workers). `/admin` on staging seen and
  fine (test guide 5). The flag switch not tried and Email Routing
  later. "Run on": released 0.10.0.
