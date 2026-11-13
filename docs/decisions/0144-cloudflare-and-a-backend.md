# 0144 — Cloudflare hosting and a small backend

- Status: Accepted (owner, 2026-11-13: move from GitHub Pages to
  Cloudflare; accounts, sync, statistics and public sharing are wanted).
  The hosting part is built in the repository (stage 58 part A, "As
  built" below); nothing is deployed and the domain is not switched:
  GitHub Pages is still the live host. The backend beyond `/api/health`
  and `/api/config` is not built.
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

## As built (stage 58 part A, 2026-11-14)

In the repository only: nothing is deployed, the domain is not
switched, GitHub Pages is still the live host and `pages.yml` is
untouched. Versions: `wrangler` 4.162.0, `@cloudflare/workers-types`
5.20261113.1, `@cloudflare/vitest-plugin` 1.8.2 (dev dependencies,
pinned). What was checked was checked against `wrangler dev` (workerd
1.20261113), not against a deployed Worker.

### `wrangler.jsonc`

- The top level is production (`webcockpit`); `env.staging` is
  `webcockpit-staging`. Both `workers_dev: true`, no routes. `assets`,
  `main` and `compatibility_date` are inherited by the environment
  (`wrangler deploy --dry-run --env staging` shows the binding).
- `compatibility_date` is `2026-11-13`: the newest the installed
  workerd accepts ("2026-11-14 is in the future and unsupported").
- `run_worker_first: ["/api/*"]`. `/api` without a slash is not the
  Worker's and gets the 404 page.
- `not_found_handling: "404-page"` with a small `public/404.html`: an
  unknown path answers 404 with that page, as Pages answers with its
  own. Without a `404.html` the answer would be an empty 404. The
  Pages build (`--pages`) removes `404.html` and `_headers` from its
  output, so the Pages site stays exactly as it was. `wrangler.jsonc`
  sets `send_metrics: false`. Spec
  §7.1's "unknown paths get `index.html`" comes with `/r/<id>` in
  stage 64.
- `html_handling: "auto-trailing-slash"` (the default, written out).
  `"none"` was tried: `/` then answers 404, because only exact file
  paths are served. With the default, `/index.html` is a 307 to `/`
  (Pages answers 200) and `/404.html` a 307 to `/404`. Nothing in the
  app or the tests fetches an `.html` path: the page is opened as `./`,
  and the HTML replay export is a file the browser builds from
  `replay/replay.js`, not a page of the site.

### The Worker

- `worker/router.ts` is the router and uses nothing from the Workers
  runtime but the assets binding (typed by a small interface of its
  own), so `scripts/static-server.ts` imports the same code under Node.
  `worker/index.ts` is the entry. `worker/tsconfig.json` has the
  Workers types and no DOM; `npm run typecheck` runs both projects, and
  `build` and the site build call it. The root project type-checks
  `router.ts` once more through the static server's import, which is
  why that file keeps to what both type sets share.
- `GET /api/health` → `{ok: true, version, commit}`; `GET /api/config`
  → `{flags: {}}`; other `/api/*` → 404 `{error: "not_found"}`; a wrong
  method → 405 `{error: "method_not_allowed"}` with `Allow`; `HEAD` is
  `GET` without a body. Every API answer: `Cache-Control: no-store`,
  `X-Content-Type-Options: nosniff` (`_headers` does not apply to what
  a Worker answers).
- **Version and commit come from `release.json`, read through the
  assets binding** on each health request; `dev`/`dev` when it is
  missing. One source with the client's update check, nothing for the
  workflow to pass, and the same code path locally. `--var`/`--define`
  at deploy was the alternative; it would need the workflow, `wrangler
  dev`, the tests and the static server to pass the same values.
- A request that matches no file and is not a navigation reaches the
  Worker (Cloudflare's routing); the router hands it to the assets
  binding, which answers with the 404 page.

### Tests

- `npm test` runs two Vitest projects (`vitest.config.ts`): `unit` (as
  before) and `worker`, which runs `worker/test/` in workerd through
  `@cloudflare/vitest-plugin` (`cloudflareTest()` as a Vite plugin).
  It works under Vitest 5.0.2. The tests import `exports` and `env`
  from `cloudflare:workers`; `SELF` and `env` of `cloudflare:test` are
  deprecated. The test Worker has its own `worker/test/wrangler.jsonc`
  (the same entry and asset settings, assets from `worker/test/assets`)
  so the unit tests need no site build. `worker/env.d.ts` is written by
  hand in place of `wrangler types`.
- npm did not run the install scripts of `workerd` and `esbuild`
  ("not covered by allowScripts"); both work without them here (the
  platform packages carry the binaries).

### `public/_headers`

As decided above. A rule that replaces `Cache-Control` first detaches
it (`! Cache-Control`): two rules setting one header are joined with a
comma, also onto the default. Observed under `wrangler dev`, which does
apply the file:

- The rules also apply to 404s and redirects. A missing file under
  `/assets/` is therefore a 404 that says `immutable` for a year.
  Hashed names never come back, and the carried assets keep the
  previous release's files in place, so this is accepted; `_headers`
  cannot tell a status.
- Cloudflare sends **no Content-Type for `.mm2`** (Pages:
  `application/octet-stream`); the map is read as bytes either way.
  `.md` is `text/markdown`, `.js` `text/javascript`.

### Site build and release

- `scripts/site-build.ts` (was `pages-build.ts`): `npm run build:site`
  → `dist-site/`, smoke-tested in the `cloudflare` profile.
  `npm run build:pages` is `site-build.ts --pages` → `dist-pages/`,
  smoke-tested in the `pages` profile: what `pages.yml` runs.
  `WEBCOCKPIT_SITE_URL` / `WEBCOCKPIT_SITE_DIR`; the `WEBCOCKPIT_PAGES_*`
  names still work.
- **The version rule changed** (`versionGuard`, ADR 0025): a build is
  refused when the live version is the same **and the live commit is
  another**. The same version and commit is the live release again.
  Both workflows run on one tag and read the same live site, so the
  slower one would otherwise be refused; a failed deploy can also be
  run again. `--target staging` skips the rule (staging is not the live
  site) and still carries the live assets.
- `.github/workflows/deploy.yml`: `v*` tags deploy production, a run by
  hand deploys `staging` (default) or `production`.
  `cloudflare/wrangler-action` is pinned to the commit of v4.1.3 and
  given the `wrangler` version of `package.json`, which `npm ci` has
  already installed, so the action installs nothing. D1 migrations
  come with stage 59.

### Local stand-ins

- `scripts/static-server.ts --profile cloudflare` answers as `wrangler
  dev` does for this configuration (compared header by header: default
  cache header, ETag and 304, the real `_headers` file of the served
  directory, the redirects, the 404 page, 405 for other methods, no
  type for `.mm2`) and runs the real router for `/api/*`. Not emulated:
  compression, `CF-Cache-Status`. `--profile pages` is the earlier
  behaviour, unchanged, and stays the default of the script;
  `playwright.prod.config.ts` defaults to `cloudflare`
  (`WC_PROD_PROFILE`).
- `npm run dev:cloud` (`scripts/dev-cloud.ts`): `wrangler dev` on
  `WC_API_PORT` (default 8787) and Vite with `WEBCOCKPIT_API_PROXY`
  set, which is the only thing that adds the `/api` proxy. The Worker's
  assets there are a directory of the script's own
  (`node_modules/.cache/webcockpit-dev-cloud`) holding only a
  `release.json` with the package version and commit `dev`, so no
  `dist-site/` is needed and health says what the dev client says.

### Still to be seen on a deployed Worker

Whether the edge sends the same headers as `wrangler dev` (the
`_headers` rules on 404s, the missing type for `.mm2`, ETag form under
compression), and the account's `workers.dev` subdomain. `test:prod`
against the staging address answers the first.
