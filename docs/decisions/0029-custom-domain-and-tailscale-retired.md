# 0029 — Custom domain; Tailscale site retired

- Status: Accepted
- Date: 2026-09-29
- Amends: ADR 0028 (domain, base `/`)
- Supersedes: ADR 0022 (the Tailscale/Caddy site)

## Context

ADR 0028 put WebCockpit on GitHub Pages at
`https://khazdul.github.io/webcockpit/`, in parallel with the
Tailscale/Caddy site (ADR 0022). That address is long, lives under a
subpath, and shares its origin with every other Pages project of the
account. Running two production sites also means two release paths
(`npm run publish` and a version tag) and two header sets to test.

## Decision

### Owner's decisions (2026-09-29)

- The site is served at **<https://mumecockpit.com/>**. The domain is
  registered at Cloudflare Registrar (renewal at about cost, auto-renew
  on). `https://khazdul.github.io/webcockpit/` redirects there (GitHub
  does this for a Pages site with a custom domain).
- The Tailscale/Caddy site is **retired now**. Nobody used it beyond the
  owner, so no move notice is given. The owner switches it off in the
  system project (`tailweb`); this repository does not touch it.

### DNS (Cloudflare, all records "DNS only")

| Name | Type | Value |
|---|---|---|
| `mumecockpit.com` | A | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` |
| `mumecockpit.com` | AAAA | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` |
| `www` | CNAME | `khazdul.github.io` |
| `_github-pages-challenge-Khazdul` | TXT | GitHub's verification code |

- Cloudflare's proxy stays **off**: with it on, GitHub cannot issue the
  site's certificate.
- The TXT record verifies the domain on the GitHub account, so no other
  account's Pages site can claim `mumecockpit.com` (domain takeover).
- The repository's Pages setting has the custom domain
  `mumecockpit.com` and "Enforce HTTPS". The deployment is by Actions
  (ADR 0028), so no `CNAME` file is committed; the setting holds it.

### The app at the root

- `scripts/pages-build.ts` defaults to `https://mumecockpit.com/`; the
  base follows from its path, so it is `/`, Vite's default.
  `$WEBCOCKPIT_BASE` and `$WEBCOCKPIT_PAGES_URL` stay as general knobs
  (a subpath still builds and passes the smoke test; the static server's
  `--base` keeps its unit tests).

### One release path

- `npm run publish` and `scripts/publish.ts` are removed. The version
  rule (ADR 0025) lives on as `versionGuard` in `scripts/release.ts`,
  used by `npm run build:pages`.
- Releasing is unchanged from ADR 0028: bump the version and commit,
  `git tag vX.Y.Z`, `git push origin vX.Y.Z`, then check the live site
  with `WC_PROD_URL=https://mumecockpit.com npm run test:prod`.

### Smoke test: one profile

The `site` header profile (COOP/COEP, immutable hashed assets,
`no-cache` elsewhere) described the Caddy site only. Nothing else needs
it: `vite dev` and `vite preview` set their own headers in
`vite.config.ts`, and no test runs against `vite preview`. It is
removed. `scripts/static-server.ts` always sends what Pages sends
(no COOP/COEP, `Cache-Control: max-age=600`), `WC_PROD_PROFILE` is gone,
and `tests/e2e-prod/` always expects `crossOriginIsolated === false`,
accepts `text/` or `application/javascript`, and checks that
`release.json` is never immutable. `npm run build && npm run test:prod`
tests `dist` at `/`.

## Consequences

- **New origin.** The origin is now `https://mumecockpit.com`.
  Storage (IndexedDB, `localStorage`, Web Locks) from
  `https://khazdul.github.io` and from the Tailscale origin does not
  carry over. Acceptable: the Pages address was in use for one day. The
  ADR 0028 concern of sharing the `khazdul.github.io` origin with other
  Pages projects is gone.
- **Not cross-origin isolated** in production, as in ADR 0028. The
  COOP/COEP goal of spec §1.5 holds in dev only; `coi-serviceworker` is
  the way if isolation is ever needed.
- **The domain must be renewed.** If it lapses, `mumecockpit.com` stops
  resolving to GitHub and the site is gone from that address (and the
  users' data with its origin). Renewal is the owner's responsibility;
  auto-renew is on. Changing the domain later is another origin change
  and needs an export-first warning.
- One release path, one header set, one smoke test profile.
