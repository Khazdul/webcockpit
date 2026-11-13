# 0144 — Cloudflare hosting and a small backend

- Status: Accepted (owner, 2026-11-13: move from GitHub Pages to
  Cloudflare; accounts, sync, statistics and public sharing are wanted).
  Not built.
- Date: 2026-11-13
- Supersedes: ADR 0028 (GitHub Pages) once stage 58 has switched the
  domain. Amends: ADR 0029 (DNS records), ADR 0006 (storage).
- Related: intent Goals 13–15, spec §7, ADR 0145–0148,
  `notes/research/cloudflare-platform.md`.

## Context

WebCockpit is static files on GitHub Pages; the browser holds all data
and talks only to MUME. The owner wants accounts that keep a player's
profiles, scripts, settings and runs in step between devices, usage
statistics, and public sharing of cut runs. That needs code that runs
on a server, a database and file storage. The domain is already
registered and served by Cloudflare DNS.

## Decision

### Owner's decisions (2026-11-13)

- The site moves to Cloudflare. It gets a backend.
- Playing without an account stays possible and loses nothing.
- GDPR is handled "as well as we can": no e-mail, as little personal
  data as possible, a plain privacy text, self-service deletion.

### Platform

- **One Cloudflare Worker, `webcockpit`,** serves the static build
  (Workers static assets) and the API under `/api/*`
  (`run_worker_first`). Same origin, `https://mumecockpit.com`, so the
  players' IndexedDB data is untouched by the move and no CORS is
  needed.
- **D1** (`webcockpit`, jurisdiction `eu`) holds accounts, sessions,
  sync items, statistics, publications, ratings, comments, reports.
- **R2** (`webcockpit`, jurisdiction `eu`) holds run bodies and
  published payloads.
- **No Durable Objects, KV, Analytics Engine or Web Analytics.**
  Presence is a heartbeat in D1 (ADR 0147).
- **Cloudflare Access** guards `/admin` and `/api/admin/*`; the Worker
  verifies the Access token itself as well (ADR 0148).
- **Turnstile** guards registration and repeated login failures
  (ADR 0145). It is the only third-party script, loaded only on the
  account pages.
- **Plan.** Everything is designed to fit the free plan (no heavy
  password hashing on the server, a 5-minute heartbeat). Workers Paid
  ($5 a month) is bought when a limit comes near; the admin page shows
  the day's use against the limits. R2 beyond 10 GB costs $0.015 per
  GB-month.
- **A staging Worker,** `webcockpit-staging` on its `workers.dev`
  address with its own D1 and R2, is where the owner tests a cloud
  stage before it is released.

### Repository

- `worker/`: the Worker (TypeScript, its own `tsconfig`), D1
  migrations in `worker/migrations/`, `wrangler.jsonc` at the root.
- `src/cloud/`: the client side (API client, crypto, sync engine,
  account pages).
- `shared/cloud/`: request and response types used by both.
- The client build is unchanged. The Cloudflare Vite plugin is **not**
  adopted: it moves the build output, and the replay bundle, the
  release manifest and `pages-build.ts` depend on today's layout. In
  development Vite proxies `/api` to `wrangler dev` on a second port.
- Worker tests run in the Workers runtime through Cloudflare's Vitest
  integration, as a second Vitest project. E2E tests start a local
  `wrangler dev` with local D1 and R2 on a port of the worktree's own
  (CLAUDE.md, "Tests and worktrees").
- Licence: the Worker is GPL-2.0-or-later like the rest (ADR 0027).
  Secrets (Turnstile secret, the server pepper, the Access audience)
  live in Cloudflare, never in the repository.

### Headers

Pages could not set headers; the Worker can (`public/_headers`):

- Hashed files under `/assets/`: `immutable`, one year.
- `index.html` and `release.json`: `no-cache`. The 10-minute lag of
  ADR 0028 is gone.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `frame-ancestors 'none'`.
- A **Content-Security-Policy** is enforced from stage 60, before the
  first account exists: scripts and styles from our own origin, WASM
  allowed, Turnstile's origin on the account pages, `connect-src` our
  origin and `wss://mume.org`.
- **No COEP in production.** `require-corp` would block Turnstile's
  frame, and nothing uses `SharedArrayBuffer`. Spec §1.5's "stays
  possible" is kept: the header can be added if the map ever needs it.

### Release flow

Unchanged for the owner: bump the version, push a `v*` tag. The
workflow builds as before (`build:pages` becomes `build:site`), applies
D1 migrations, and runs `wrangler deploy`. Carrying the live release's
hashed assets stays, because a Worker version does not keep the last
one's files. `test:prod` runs against the live site after each deploy.
A cloud feature is switched on in production by a server flag
(`/api/config`), not by a release, so half-built cloud stages can ship
dark.

### The switch (stage 58)

1. Deploy to `workers.dev`; run `test:prod` there.
2. Delete the four A and four AAAA apex records, attach
   `mumecockpit.com` as the Worker's custom domain, redirect `www`.
3. Run `test:prod` live; the owner checks that his profiles and runs
   are still there.
4. Rollback: detach the domain and put back the records of ADR 0029.
   The Pages site and `pages.yml` are kept deployable for two releases
   after the switch, then removed.

## Alternatives

- **Keep Pages, add only an API Worker on a route.** Possible, but two
  release paths again (ADR 0029 removed that), no headers, no CSP.
- **Supabase or Firebase.** Ready-made accounts and sync, but accounts
  there are built around e-mail, the end-to-end encryption would still
  be ours to build, and it is a second provider beside the domain's.
- **A server of our own.** Operations work the owner does not want.

## Consequences

- The project now runs a service with accounts. There is an attack
  surface and an operator's responsibility that did not exist.
- Intent's "No application server" is replaced (intent Constraints).
- The game connection is untouched: still one WebSocket from the
  browser to MUME. Nothing the backend does is in the path of a key
  press or a line of game text.
- Data safety does not rest on the cloud: every device still holds a
  full local copy, and the export files still exist. D1 Time Travel
  (7 days on Free) is the server-side undo.
- Cloudflare is our processor (its DPA applies on the free plan). Data
  rests in the EU; requests are handled where the visitor is.
