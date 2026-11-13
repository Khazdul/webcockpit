# Stage 58 — Move to Cloudflare

Status: **In progress** (planned 2026-11-13; part A built, merged and
deployed to staging 2026-11-14; part C, the switch, and D remain).

## Goal

<https://mumecockpit.com/> is served by a Cloudflare Worker with
static assets instead of GitHub Pages. Nothing changes for a player:
the same address, the same client, the same data in the browser. The
Worker has an API with nothing in it yet (`/api/config`,
`/api/health`), and the site can now set its own headers. Spec §7.1
and §7.12, ADR 0144. This is the ground for stages 59–66.

## Owner brief (2026-11-13)

The owner wants accounts with sync, usage statistics and public
sharing of cut runs, and for that the site moves to Cloudflare (intent
Goals 13–15). This stage is only the move.

## What must be true afterwards

- The site answers at `https://mumecockpit.com/`; `www` redirects to
  it; `http` redirects to `https`.
- The players' IndexedDB data is untouched (same origin).
- A release is still: bump the version, push a `v*` tag.
- `index.html` and `release.json` are never served stale; hashed
  assets are cached for a year; an open tab from the previous release
  still finds its lazy chunks.
- `test:prod` is green against the live site in Firefox and Chromium.
- The switch can be undone in minutes.

## Tasks

### A. In the repository (building agent, in a worktree)

- [x] `wrangler.jsonc`: Worker `webcockpit`, `main: worker/index.ts`,
      assets directory = the site build, `run_worker_first:
      ["/api/*"]`, `not_found_handling` as Pages behaves today (a 404
      page; `/r/<id>` comes in stage 64), `compatibility_date` of the
      day, environment `staging` (`webcockpit-staging`). No custom
      domain route yet (task C adds it).
- [x] `worker/`: `index.ts` with a small router, `GET /api/health`
      (`{ok, version, commit}`) and `GET /api/config` (`{flags: {}}`),
      JSON 404 for other `/api/*`; its own `tsconfig`; `typecheck`
      covers it.
- [x] Worker tests as a second Vitest project in the Workers runtime
      (check the current package name and Vitest 5 support first;
      `notes/research/cloudflare-platform.md`, "Not verified"). If it
      does not run under Vitest 5, test the router as plain functions
      and record it in ADR 0144.
- [x] `public/_headers`: `/assets/*` immutable for a year; `/` and
      `/index.html` and `/release.json` `no-cache`;
      `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors
      'none'` on everything. No CSP and no COOP/COEP yet (ADR 0144).
      Check that the HTML replay export, the map worker and the fonts
      still load under these headers.
- [x] `scripts/pages-build.ts` → `scripts/site-build.ts`,
      `npm run build:site`, output `dist-site/`; `build:pages` stays
      as an alias until Pages is retired. The carried assets of the
      live release stay. The live URL stays `https://mumecockpit.com/`.
- [x] `scripts/static-server.ts`: profile `cloudflare` (the headers
      above, ETag, `max-age=0, must-revalidate` by default);
      `playwright.prod.config.ts` takes it; `tests/e2e-prod` expects
      the new cache headers and `/api/health` under that profile.
- [x] `npm run dev:cloud`: Vite plus `wrangler dev` on a second port
      (`WC_API_PORT`, a worktree picks its own), `/api` proxied.
      `npm run dev` alone is unchanged.
- [x] `.github/workflows/deploy.yml`: on `v*` tags and by hand:
      `npm ci`, Chromium, `build:site`, `wrangler deploy`
      (`cloudflare/wrangler-action`, pinned). An input chooses
      `staging` or `production`. `pages.yml` is left as it is.
- [x] Docs: spec §1.5; ADR 0144 "As built"; README's hosting line;
      comments that name GitHub Pages (`vite.config.ts`,
      `update-check.ts`, `playwright.prod.config.ts`).

### B. Owner's part before the switch (about 15 minutes)

Done 2026-11-13: token `webcockpit-deploy` (Workers Routes on the zone
`mumecockpit.com`; Workers Scripts, R2 and D1 edit on the account; no
expiry), and both repository secrets are in place (`gh secret list`).
The token itself has not been used yet.

- [x] Cloudflare dashboard → My Profile → API Tokens → Create Token →
      template "Edit Cloudflare Workers", limited to the account and
      the zone `mumecockpit.com`; add permission **D1: Edit** (used
      from stage 59).
- [x] GitHub → the repository → Settings → Secrets and variables →
      Actions: `CLOUDFLARE_API_TOKEN` (the token) and
      `CLOUDFLARE_ACCOUNT_ID` (dashboard, Workers & Pages, right
      column).
- [x] After part A: the session runs the workflow by hand
      against `staging` and reports the `workers.dev` address.
      Done 2026-11-14 (run 43526498453):
      <https://webcockpit-staging.olevong.workers.dev>, 0.9.1 f9925fd;
      `test:prod` there 12/12 (Chromium and Firefox); the live Pages
      site untouched (`WC_PROD_PROFILE=pages`, 10 passed, 2 skipped).

### C. The switch (session and owner together, a quiet hour)

- [ ] `test:prod` green against the staging and the production
      Worker's `workers.dev` addresses. Staging: green 2026-11-14.
      The production Worker `webcockpit` is not deployed yet: a build
      by hand of 0.9.1 from `main` is refused by the version rule
      (0.9.1 is live from another commit), so its first deploy comes
      with the next `v*` tag (which also releases to Pages as usual),
      before the switch.
- [ ] Owner: note the current DNS records (they are in ADR 0029),
      then delete the four A and four AAAA records of
      `mumecockpit.com`.
- [ ] At once: deploy with the custom domain route
      (`{pattern: "mumecockpit.com", custom_domain: true}`); wait for
      the certificate.
- [ ] `www`: a proxied placeholder record and a redirect rule to the
      apex.
- [ ] `WC_PROD_URL=https://mumecockpit.com npm run test:prod`.
- [ ] Owner: open the site, see the profiles and History as before,
      log in to MUME and play a minute.
- [ ] Release a patch version through the new workflow; an old tab
      shows the update notice within a minute.

### D. Afterwards

- [ ] Two releases later: remove `pages.yml`, the `pages` profile and
      the Pages custom domain setting; ADR 0028 marked superseded.

## Rollback

1. Remove the custom domain from the Worker (dashboard or a deploy
   without the route).
2. Put back the A, AAAA and `www` records of ADR 0029.
3. GitHub Pages still has the last release and the domain setting, so
   the site is back when DNS has spread (minutes).

## Risks

- **Minutes without the site** between deleting the records and the
  domain being attached. A session already playing is not affected:
  the game socket goes to MUME.
- **Attaching the domain fails** over a leftover record. Then roll
  back, read the error, try again another day.
- **A header breaks something** (replay export, map worker). Caught
  by `test:prod` on `workers.dev` before the switch.

## Test guide (owner)

1. Open <https://mumecockpit.com/>. The start page comes up as
   always, and it is your profile in the menu.
2. Profile, Scripts and History show what they showed before.
3. Enter MUME, log in, walk around. Nothing should feel different.
4. Export a short run as HTML and open the file.
5. Open the site on the phone.

Feedback wanted: anything at all that differs from yesterday.

## Owner feedback

(none yet)
