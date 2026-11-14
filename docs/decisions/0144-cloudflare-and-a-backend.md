# 0144 — Cloudflare hosting and a small backend

- Status: Accepted (owner, 2026-11-13: move from GitHub Pages to
  Cloudflare; accounts, sync, statistics and public sharing are wanted).
  The hosting part is built and live: the domain was switched to the
  Worker on 2026-11-14 ("As built" and "The switch as done" below). The
  backend beyond `/api/health` and `/api/config` is not built.
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

Written before the switch (see "The switch as done" at the end);
`pages.yml` is untouched. Versions: `wrangler` 4.162.0, `@cloudflare/workers-types`
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

## The switch as done (stage 58 part C, 2026-11-14)

- Staging: `https://webcockpit-staging.olevong.workers.dev`.
  Production also answers at `https://webcockpit.olevong.workers.dev`.
- **0.9.2 was released by tag first,** to Pages and to the production
  Worker from one commit (3ec8788), so both hosts served the same
  files and an open tab saw no new release at the switch.
- **The domain was attached without a build:** `deploy.yml` has a
  by-hand action `triggers` (`wrangler triggers deploy`: only the
  routes and domains of `wrangler.jsonc`, about half a minute). The
  owner deleted the four A and four AAAA records, the run attached
  `mumecockpit.com`, and the site answered with a valid certificate
  on the first check afterwards. The research note's unverified point
  was not put to the test: nobody tried attaching with the records in
  place.
- `env.staging` sets `"routes": []`: environments inherit `routes`,
  and a staging deploy would otherwise have taken the domain.
- **In the dashboard, not in the repository** (the deploy token cannot
  set them): *Always Use HTTPS* on (a Worker's custom domain answers
  plain http with 200 otherwise; Pages redirected by itself); `www` is
  a proxied AAAA `100::` plus the redirect rule "Redirect from WWW to
  root" (`https://www.*` → `https://${1}`, 301, query string kept).
- The edge sends what `wrangler dev` sent: `test:prod` 12/12 in
  Chromium and Firefox against both `workers.dev` addresses and
  against `https://mumecockpit.com`.
- Way back: remove the custom domain from the Worker, put back the
  apex records of ADR 0029 and the `www` CNAME. Pages holds 0.9.2 and
  is deployed from every tag until `pages.yml` is removed.

## Addendum (2026-11-14, plan of stage 59; not built)

- **Staging gets a host on our zone, `staging.mumecockpit.com`** (a
  custom domain of `webcockpit-staging`), beside its `workers.dev`
  address. Cloudflare Access can guard a single path only on a zone
  of ours; on `workers.dev` it is the whole site or nothing, which
  would shut `test:prod` out. Staging answers carry
  `X-Robots-Tag: noindex`. To be verified against Cloudflare's
  documentation when it is built.
- **D1 and R2 are made by a by-hand workflow** (`provision.yml`) with
  the deploy token, jurisdiction `eu`; the ids go into
  `wrangler.jsonc`. **Migrations** (`worker/migrations/`) are applied
  by `deploy.yml` before `wrangler deploy`.

## As built (stage 59 part A, 2026-11-14)

The plan of the addendum above, as built. Not yet run against
Cloudflare: `provision.yml` and the first staging deploy are the main
session's (stage file, "The night pass").

### Checked against Cloudflare's documentation (2026-11-14)

- **A custom domain for the staging Worker on a subdomain of our zone
  holds.** Custom domains are matched exactly per host name, so the apex
  on `webcockpit` and `staging.mumecockpit.com` on `webcockpit-staging`
  do not conflict; Cloudflare makes the DNS record and the certificate.
  It refuses a host name that already has a **CNAME** record, so none
  may exist for `staging` before the deploy. `routes` is inherited by
  environments, so `env.staging` sets its own.
  <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>,
  <https://developers.cloudflare.com/workers/wrangler/configuration/>
- **Access can guard a path of a Worker on our zone**: a self-hosted
  application on `host/path`; one application can hold several
  host/path destinations. A wildcard in a path does not cover the
  parent path (`/admin/*` does not cover `/admin`), and nothing says
  `/admin*` covers `/admin`, so the application should list `/admin`,
  `/admin/*` and `/api/admin/*` on both hosts (six destinations; a
  bare `/admin` is also inherited by its subpaths per the docs, but the
  explicit list costs nothing).
  <https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/>,
  <https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/>
- **`workers.dev` is not covered by a path application on our zone**
  (Access protects a `workers.dev` address only as a whole, per
  Worker). Both Workers keep `workers_dev: true` for `test:prod`; there
  `/admin` gets no Access token and the Worker's own check answers 403.
  <https://developers.cloudflare.com/workers/configuration/routing/workers-dev/>
- The Access token: header `Cf-Access-Jwt-Assertion`, RS256, keys at
  `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` (a JWK
  `keys` array, found by `kid`; rotated every 6 weeks, the old key valid
  7 days more), `iss` = `https://<team>.cloudflareaccess.com`, `aud` an
  array.
  <https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/>
- `run_worker_first` takes globs and `!` exclusions; `/admin` and
  `/admin/*` are listed separately for the same reason as in Access.
  `_headers` never applies to what the Worker answers.
  <https://developers.cloudflare.com/workers/static-assets/binding/>,
  <https://developers.cloudflare.com/workers/static-assets/headers/>
- D1 and R2 jurisdiction: `wrangler d1 create <name> --jurisdiction eu`,
  `wrangler r2 bucket create <name> --jurisdiction eu`; fixed at
  creation; an R2 binding must name the jurisdiction
  (`"jurisdiction": "eu"`). `wrangler d1 migrations apply` skips its
  confirmation in CI.
  <https://developers.cloudflare.com/d1/configuration/data-location/>,
  <https://developers.cloudflare.com/r2/reference/data-location/>,
  <https://developers.cloudflare.com/workers/wrangler/commands/d1/>

### `wrangler.jsonc`

- Bindings for both Workers (bindings, `vars` and `ratelimits` are not
  inherited, so `env.staging` repeats them): D1 `DB` (`webcockpit` /
  `webcockpit-staging`, `migrations_dir: worker/migrations`), R2 `FILES`
  (same names, `jurisdiction: eu`; unused until stage 63), the rate
  limiter `BEAT_LIMITER` (30 a minute; namespaces 5901 and 5902), the
  crons, and the vars `FLAG_STATS` (staging `true`, production `false`),
  `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (empty until part C) and on staging
  `NOINDEX: true`. The secret `ADMIN_EMAILS` is set in the dashboard.
- **The D1 ids are placeholders** (`00000000-…-0001` and `…-0002`,
  marked `// PROVISION:`) until `provision.yml` has run. Local
  development and the tests do not need real ids: `wrangler dev` keys
  its local database by whatever id is written.
- `run_worker_first: ["/api/*", "/admin", "/admin/*"]`.
- Staging: `routes: [{pattern: "staging.mumecockpit.com", custom_domain:
  true}]`; `wrangler deploy --env staging` (and `triggers deploy`)
  attaches it.

### `X-Robots-Tag: noindex` on staging

- The Worker adds it to every answer it gives when the var `NOINDEX` is
  set (staging only), including what it passes on from the assets
  binding (404s).
- The static files never reach the Worker, so `build:site --target
  staging` appends a rule `/*  X-Robots-Tag: noindex` to the build's
  `_headers`. Chosen over making staging Worker-first for everything,
  which would put every static request of staging through the Worker
  and count it against the account's 100 000 requests a day that
  production shares; the `_headers` rule costs nothing and production's
  file is untouched.

### Workflows

- `provision.yml` (by hand): creates D1 `webcockpit` and
  `webcockpit-staging` (`--jurisdiction eu`) unless they exist (found by
  name in `wrangler d1 list --json`) and writes their ids to the step
  summary; then the R2 buckets the same way. The R2 step never fails
  the run: if R2 is not enabled on the account it says so in the
  summary (and a warning) and the D1 part stands. It uses the wrangler
  of `package.json` after `npm ci`, as `deploy.yml` does.
- `deploy.yml`: a `deploy` applies `wrangler d1 migrations apply DB
  --remote [--env staging]` before `wrangler deploy`. `triggers` is
  unchanged (it now also applies the crons and the staging domain).

### Locally

- The static server's `cloudflare` profile runs the router for
  `/api/*`, `/admin` and `/admin/*` with no database and no Access
  settings: config `{flags: {stats: false}}`, the beat 503, the public
  numbers 404, admin 503 `admin_not_configured`.
- `npm run dev:cloud` applies the migrations to the local D1 before it
  starts `wrangler dev`.
- The Worker tests apply the migrations to their D1 through
  `readD1Migrations` (vitest.config.ts) and `applyD1Migrations`
  (`worker/test/setup.ts`).

## As built (stage 60): the CSP

Stage 60 part B, 2026-11-14. The policy of "Headers" above is written
and sent, **report-only**: it
blocks nothing yet. `frame-ancestors 'none'` stays enforced as before.

### The policy

One line of `public/_headers`, on every static file (`/*`):

```
Content-Security-Policy-Report-Only: default-src 'none';
  script-src 'self' 'wasm-unsafe-eval' 'sha256-…' 'sha256-…' https://challenges.cloudflare.com 'report-sample';
  style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';
  connect-src 'self' wss://mume.org https://mume.org; worker-src 'self';
  frame-src https://challenges.cloudflare.com;
  object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

Made from an inventory of the code and the built site, then checked in
browsers (below). Source by source:

- **`default-src 'none'`**: nothing that is not named. No `media-src`,
  `manifest-src` or `child-src`: the app has no audio or video, no web
  manifest, and `worker-src` and `frame-src` are both set.
- **`script-src`**
  - `'self'`: our files, the workers' included.
  - `'wasm-unsafe-eval'`: Lua is WebAssembly (wasmoon, ADR 0051).
    Without it both browsers refuse to compile the module (seen).
    Nothing uses `eval` or `new Function` (the built files were
    searched; CodeMirror does not), so no `'unsafe-eval'`.
  - Two hashes: the inline scripts of `index.html` (the first paint
    and its call, ADR 0083). The first changes with every build (it
    carries the hashed file names), so `_headers` holds a placeholder,
    `'sha256-INLINE-SCRIPTS'`, and `vite build` writes the hashes into
    the built `_headers` (`cspHashesPlugin` in `vite.config.ts`,
    `scripts/csp.ts`). `privacy.html` is a copy of the page with the
    same scripts. No `'unsafe-inline'` for scripts.
  - `https://challenges.cloudflare.com`: Turnstile's `api.js`, loaded
    only on the account pages (ADR 0145). Cloudflare's documentation
    (read 2026-11-14) asks for this host in `script-src` and
    `frame-src` and nothing more; its nonce alternative needs a header
    made per answer, which static files do not have. `connect-src
    'self'` is needed only for pre-clearance, which is not used.
  - `'report-sample'`: a violation's event carries its first 40
    characters, which the walk prints.
- **`style-src 'self' 'unsafe-inline'`**, the one loose source. It is
  needed three ways: the first paint and the wordmark write markup
  with computed `style=""` attributes; three `<style>` elements exist
  at run time (the one in `index.html`, the first paint's geometry,
  the `@font-face` rules of `src/theme/fonts.ts`); and CodeMirror
  mounts its themes in a `<style>` whose text is made at run time
  (style-mod uses a constructable stylesheet only inside a shadow
  root; its other way is a nonce). Hashing the three fixed ones would
  still leave CodeMirror and the attributes. What is given up is
  small: what the accounts need is that no foreign script runs
  (ADR 0145, Consequences), and a style can load nothing from outside
  the origin (`img-src`, `font-src`).
- **`img-src 'self' data:`**: `data:` for the SVG grain and masks in
  the stylesheets. No `blob:`: object URLs are only used for downloads
  (a link's `href`, which no directive governs), and tiles are decoded
  from fetched bytes, not `<img>`.
- **`font-src 'self'`**: `public/fonts`.
- **`connect-src`**: `'self'` (`/api`, `release.json`, the map and its
  tiles, the replay bundle and fonts the export reads, the `.wasm`
  file), `wss://mume.org` (the game, `wss://mume.org/ws-play/`; there
  is no fallback address) and `https://mume.org` (the link probe's
  `HEAD` of `favicon.ico`, `src/net/link-probe.ts`). No address is
  taken from the user.
- **`worker-src 'self'`**: the map, map tools, weather and KDF workers
  are module workers by URL. Only the exported HTML replay starts a
  worker from `blob:`, and that file is not served by us.
- **`frame-src https://challenges.cloudflare.com`**: Turnstile's
  frame. The app has no other frame today. The watch page's sandboxed
  replay frame (ADR 0148, stage 64) and an MMapper frame (ADR 0003)
  will each need a source added here when they are built; the replay
  frame's own document has its own policy (spec §7.7).
- **`object-src 'none'`, `base-uri 'none'`, `form-action 'none'`**: no
  plugins, no `<base>`, and no form is sent anywhere. A `<form>` on
  the account pages must be handled in script (`preventDefault`), or
  this becomes `'self'`.
- **`frame-ancestors 'none'`**: as before.

The line is about 520 characters with its hashes; Cloudflare's limit
is 2,000 a line.

### Report-only, and the switch

`scripts/csp.ts` holds the switch:

```ts
export const CSP_ENFORCED: Record<CspTarget, boolean> = { staging: false, production: false };
```

`npm run build:site` reads it for its `--target`. `false`: `_headers`
goes out as written (report-only beside the enforced
`frame-ancestors`). `true`: the report-only line becomes the one
`Content-Security-Policy` of the rule and the old `frame-ancestors`
line goes (the policy has that directive; two lines of one name would
be joined with a comma). Enforcing is therefore a one-word change per
target, reviewed like any other, and the build's smoke test then runs
with the policy enforced. Order: staging, the walk and the account
pages there, then production.

There is no `report-uri` or `report-to`: an endpoint would cost a
Worker request for every violation of every visitor (browser
extensions cause most of them). Violations are found by a test
instead.

### The walk (`tests/e2e-prod/csp.spec.ts`)

Part of the prod-profile tests, so it runs in every build's smoke
test and with `test:prod` against a deployed site (read-only: the
game's socket, the link probe and the usage beat are answered by the
test). A collector (`tests/e2e-prod/csp.ts`) records every
`securitypolicyviolation` event and every console message of the
browser about the policy, and each test fails on any. It walks: the
policy's header and hashes on the page, the privacy page, a script
and the 404 page; the start page with Profiles and its editor,
Credits, About; the privacy and 404 pages; Scripts with the code
editor and the manual; History with a restored backup, the log
player, the export editor with both downloads and a backup download;
Spotlights' viewer; the game against a mocked MUME (login, the map,
two Lua scripts, `#help`, the weather demo, the menu bar's windows,
Settings → Mapper with a map file through the map tools worker); the
phone profile (start page, game, a key, the menu). One test checks
the collector itself (another host, an inline script) and, offline,
that a real `WebSocket` to `wss://mume.org/ws-play/` and the link
probe's request raise nothing.

Result, 2026-11-14, Playwright 1.63's Chromium and Firefox, local
build in the `cloudflare` profile: no violation, report-only and
enforced.

Two things about it that are not obvious:

- **Workers are only tried when the policy is enforced.** A worker
  takes its policy from its own script's answer (the same rule). In
  report-only mode a violation inside a worker reached neither the
  page's events nor any console message, in either browser (tried
  with a policy without `connect-src 'self'`: silent in report-only;
  enforced, the map failed to load). So `WC_PROD_CSP=enforce` makes
  the local server send the built policy enforced, whatever the
  switch says, and the walk's own assertions (the map draws, Lua
  runs) are the check. Run it before each flip:
  `WC_PROD_CSP=enforce WC_PROD_DIR=dist-site npx playwright test -c playwright.prod.config.ts`.
- **The page test hashes what is served.** It computes the hashes of
  the inline scripts in the answer and looks for them in the header,
  so a deployed site whose HTML is changed on the way (a Cloudflare
  feature that injects a script) fails it.

Not covered: the account pages, which did not exist; Safari and iOS;
a real Turnstile widget (below); the KDF worker (a module worker by
URL like the others, but no page starts it yet).

### The Worker's own answers

`_headers` does not apply to them.

- `/admin` (the Worker's page) already sends its own, stricter policy
  (`worker/admin/page.ts`: `default-src 'none'`, scripts, styles,
  images and connections from `'self'`, no inline, `frame-ancestors
  'none'`). Nothing to add.
- `/api/*` answers are JSON with `nosniff`, never a document, so a
  policy has nothing to govern there. A `default-src 'none';
  frame-ancestors 'none'` on them would be harmless tidiness and is
  left out.

### The dev server, COEP and Turnstile

`vite` and `vite preview` send no policy: `_headers` is Cloudflare's
file, and HMR needs inline scripts and styles. They do send COOP and
COEP `require-corp`, as before.

"Headers" above says `require-corp` would block Turnstile's frame.
Measured 2026-11-14 with Cloudflare's test site key
(`1x00000000000000000000AA`, the one `npm run dev:cloud` uses), a
page on `localhost`, Chromium and Firefox: **it does not.** `api.js`
is answered with `Cross-Origin-Resource-Policy: cross-origin` and the
frame's document with that and `Cross-Origin-Embedder-Policy:
require-corp`, so the widget loads and gives its token on a
cross-origin isolated page, with `require-corp` and with
`credentialless` alike, and also under this policy enforced. The dev
server is therefore left as it is. Dropping COEP there would also
have switched the link probe on (it is off on an isolated page), and
with it requests to mume.org from every e2e run.

Production still sends no COEP: nothing needs it. That it would break
Turnstile is no longer the reason. A widget with the real site key
(a Managed challenge, on the real host names) has not been seen under
either header; staging will show it under this policy.

### Still to be seen on the deployed site

- Whether anything Cloudflare adds to the page violates the policy
  (the walk against staging: `WC_PROD_URL=https://staging.mumecockpit.com
  npm run test:prod -- csp`).
- The real Turnstile widget on the account pages, in report-only
  first.
- Safari and iOS, by hand, before production is enforced.

### Enforced on staging (2026-11-14)

`CSP_ENFORCED.staging` is true. Before the switch the account flows
were walked on staging under the report-only policy, in a headed
browser with the real Turnstile widget (Managed): no violation of our
policy (Turnstile's own frame logs violations of Cloudflare's policy
in the console; they are not ours). After it: `test:prod` with the CSP
walk, 30/30, and the account walk again, which runs the KDF worker
(invisible to a report-only policy) and Turnstile's script and frame
under the enforced policy. Production stays report-only until the
owner has tested staging; `production: true` goes with the release
that turns the flag `accounts` on, never after it (ADR 0145, "After
the review of the client").

