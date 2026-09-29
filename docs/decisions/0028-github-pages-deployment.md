# 0028 — GitHub Pages deployment

- Status: Accepted
- Date: 2026-09-29
- Amends: ADR 0022 (a second deployment beside it)

## Context

ADR 0022 serves WebCockpit from the owner's machine through Tailscale
Funnel. That site is only up while the owner's machine is, and its
address is shared privately. The repository is public
(`Khazdul/webcockpit`), and GitHub Pages can serve it from GitHub's
servers at no cost. Pages serves static files only and does not let a
site set its own response headers.

## Decision

### Hosting (owner's decision, 2026-09-29)

- WebCockpit is also served from GitHub Pages at
  <https://khazdul.github.io/webcockpit/>. There is no custom domain.
- It runs in parallel with the Tailscale/Caddy site (ADR 0022), which is
  unchanged: base `/`, the same headers, `npm run publish`, the same
  smoke test. The Tailscale site may be retired later.
- A release goes to Pages when a version tag is pushed.

### Base path

The app lives under `/webcockpit/`, not at the site root.
`vite.config.ts` reads `$WEBCOCKPIT_BASE` (default `/`; normalised to a
leading and a trailing slash) into Vite's `base`. Every URL the app
builds already follows `import.meta.env.BASE_URL`, or is relative to the
document: the fonts (Vite rewrites `url("/fonts/…")` in CSS with the
base), `map/`, the map worker, `LICENSE.txt`, `release.json` (the update
check's default now follows the base as well), and `replay/replay.js` and
`map/` in the HTML replay export (resolved against `document.baseURI`).
`/__fixtures` stays dev only.

### Build: `npm run build:pages`

`scripts/pages-build.ts`, run by CI and by hand:

1. Refuses a `package.json` version equal to the live Pages release's
   (`<live>/release.json`; unreachable or 404 counts as no live release),
   and in a tag build (`GITHUB_REF_TYPE=tag`) a tag other than
   `v<version>`.
2. `tsc --noEmit`, `vitest run`.
3. `vite build` with `WEBCOCKPIT_BASE=/webcockpit/` into `dist-pages/`.
4. The smoke test with the `pages` profile under the base.
5. Carries the live release's own `assets/` (listed in its
   `release.json`, fetched from the live site; failures are skipped and
   counted), then writes the full `release.json` (`scripts/release.ts`,
   shared with `npm run publish`).

`$WEBCOCKPIT_PAGES_URL` overrides the live URL (its path is the base),
`$WEBCOCKPIT_PAGES_DIR` the output directory; `--skip-live` makes no
request to the live site (offline runs: no version check against it,
nothing carried).

### Workflow: `.github/workflows/pages.yml`

On `push` of a `v*` tag and on `workflow_dispatch`: `npm ci`, Playwright's
Chromium, `npm run build:pages` with `WC_PROD_BROWSERS=chromium`, then
`actions/configure-pages`, `actions/upload-pages-artifact` (`dist-pages`)
and `actions/deploy-pages` in the `github-pages` environment. One
deployment at a time (`concurrency: pages`, never cancelled).

Repository setup (done once, 2026-09-29): Pages source "GitHub Actions",
and the `github-pages` environment's deployment rules allow tags `v*`
besides `main` (by default only the default branch may deploy, so a tag
run's deploy job is rejected).

The runners have no GPU: in headless Firefox the map worker gets no
WebGL and the pane reports `unsupported` (first run, 2026-09-29), while
Chromium falls back to software rendering. CI therefore gates on
Chromium only; Firefox is covered by the local `build:pages` run and by
the live smoke test after each deploy.

### Smoke test

`scripts/static-server.ts` takes `--base <path>` (only paths under it are
served; the base without its trailing slash redirects to it, as Pages
does) and `--profile site|pages`. `pages` emulates GitHub Pages: no
COOP/COEP, `Cache-Control: max-age=600` on everything, MIME by
extension. `playwright.prod.config.ts` takes `WC_PROD_BASE` and
`WC_PROD_PROFILE`; the tests use paths relative to the base. Under
`pages` they expect `crossOriginIsolated === false`, accept
`application/javascript` for `.js` (what Pages sends), and skip the
COOP/COEP and cache header checks; every other check stays.

### Releasing

1. Bump the version (`npm version patch --no-git-tag-version`) and commit.
2. `git tag vX.Y.Z` (the new version) and `git push origin vX.Y.Z`.
3. Check the live site:
   `WC_PROD_URL=https://khazdul.github.io/webcockpit WC_PROD_PROFILE=pages npm run test:prod`.

The Tailscale site is published separately with `npm run publish`, as
before; the same version may go to both.

## Consequences

- **Not cross-origin isolated.** Pages sends no COOP/COEP, so
  `crossOriginIsolated` is false there. Nothing uses `SharedArrayBuffer`
  today. If the MMapper iframe or WASM route (ADR 0003) ever needs it,
  `coi-serviceworker` is the way on Pages. The spec §1.5 goal is kept
  for the Caddy site.
- **10-minute cache.** Pages sends `max-age=600` on every file,
  `index.html` and `release.json` included. A new release can take up to
  ten minutes to reach a visitor, and the update notice (ADR 0025) can
  lag by as much (its `cache: 'no-store'` bypasses the browser cache, not
  GitHub's CDN).
- **No atomic swap.** A deployment is not one rename; for a short time a
  visitor may see a mix. The carried assets keep the previous release's
  lazy chunks loadable for one release, as on the Caddy site.
- **Separate storage.** The Pages origin (`https://khazdul.github.io`) is
  not the Tailscale origin: profiles, runs, settings and imported maps do
  not carry over (use the profile and runs export/import). That origin is
  also shared with every other Pages project of the `khazdul` account:
  the IndexedDB database `webcockpit`, the localStorage keys
  (`webcockpit.appearance`, `wc.*`) and the Web Locks all live there, beside theirs. Only one such
  project should use these names.
- **Limits.** Pages sites are limited to 1 GB and about 100 GB of traffic
  a month (a soft limit). A release is under 10 MB, most of it the map.

## Amendment 2026-09-29 — custom domain (ADR 0029)

- The site is at <https://mumecockpit.com/>, and the app at its root:
  `npm run build:pages` builds with base `/`.
  `https://khazdul.github.io/webcockpit/` redirects there.
- The parallel run with the Tailscale/Caddy site has ended; that site and
  `npm run publish` are gone. `versionGuard` is in `scripts/release.ts`.
- The static server and the smoke test have no profiles any more: they
  always emulate Pages (`WC_PROD_PROFILE` is gone). Live check:
  `WC_PROD_URL=https://mumecockpit.com npm run test:prod`.
- The shared-origin concern under "Separate storage" no longer applies:
  the origin is `https://mumecockpit.com`.
