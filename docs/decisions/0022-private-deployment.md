# 0022 — Private deployment

- Status: Superseded by ADR 0029
- Date: 2026-09-28

## Context

Spec §1.5: "Before anyone else tests: a private deployment is decided in
an ADR." The owner (2026-09-28) has decided the hosting; this ADR records
it and what the project does to publish.

## Decision

### Hosting (owner's decision)

- WebCockpit is served publicly through Tailscale Funnel at
  a `*.ts.net` host on port 8443 (the address is shared privately and
  kept out of this repository), shared only with close
  friends for now. The owner switches it on and off from their system
  (`tailweb`, a waybar menu; `~/proj/system`). This project does not touch
  Tailscale or the web server configuration.
- Tailscale proxies `:8443/` to a Caddy site bound to 127.0.0.1 (set up
  by the system project) that serves static files from
  `~/.local/share/tailweb/sajter/webcockpit/`.
- Its own port is its own origin, isolated from the owner's other web app
  (port 443). The app lives at the site root, so Vite's default base `/`
  stays.

### What follows

- **No server-side part.** The site is static files only. The browser
  still connects directly to `wss://mume.org/ws-play/` (ADR 0002); the
  host never sees game traffic or passwords.
- **Storage is per origin.** IndexedDB, Web Locks and `localStorage`
  belong to the deployment's origin (`https://<host>:8443`). The dev server
  (`http://localhost:5173`) and production are separate: profiles, runs,
  settings and imported maps do not carry over (move them with the
  profile and runs export/import). If the host name or port ever changes,
  users lose access to their data the same way, so a change of origin
  needs a warning to export first.
- **Dev fixtures are dev only.** `/__fixtures` exists only in `vite`
  (`apply: 'serve'`), and every fixture path in `src/main.ts` and
  `src/replay/dev.ts` is behind `import.meta.env.DEV`. The build never
  requests it.

### Publishing: `npm run publish`

`scripts/publish.ts`. Publishing is a deliberate command; `build`, `dev`
and `preview` never write to the site directory.

1. Refuses a dirty working tree (`--allow-dirty` overrides), so a release
   maps to a commit.
2. Gate: `tsc --noEmit`, `vitest run`.
3. `vite build` into `.webcockpit.staging`, a sibling of the site
   directory (same filesystem, and outside the served tree).
4. The site-root smoke test (below) against the staging directory.
5. Carries the live release's own hashed files under `assets/` into
   staging, so a tab loaded before the swap still finds its lazy chunks
   (editor, player, map worker) for one more release. `release.json`
   (version, commit, time, the build's own asset names) is written at the
   root; it is how the next publish knows what to carry.
6. Swaps staging and the live directory with one `rename(2)` using
   `RENAME_EXCHANGE` (`mv --exchange`, GNU coreutils ≥ 9.5): the site path
   always holds a complete release. The old release is kept as
   `.webcockpit.prev`. A symlink flip was rejected because the site path is
   the system project's contract and may be sandboxed; the exchange keeps
   it a plain directory.

Any failure stops before the swap and leaves the live site untouched.
`--dry-run` stops before the swap; `--rollback` exchanges the live and
the previous release (again to undo). `$WEBCOCKPIT_PUBLISH_DIR` overrides
the site directory (used for testing the script).

### Site-root smoke test

`scripts/static-server.ts` is a plain file server that stands in for
Caddy: one directory at the root, the headers below, MIME by extension,
no fallback. `playwright.prod.config.ts` runs `tests/e2e-prod/` against it
(Chromium and Firefox): `/?replay` loads with no failed request and no
page error, `crossOriginIsolated` is true, the map worker loads
`map/arda.mm2` and draws tiles, the fonts load, `replay/replay.js`,
`map/arda.mm2` and the fonts have the right types and headers, and
`/__fixtures/list` is 404. `npm run build && npm run test:prod` runs it
by hand; `WC_PROD_URL=<site> npm run test:prod` runs it against a
deployed site.

### Headers

The same as `vite dev`/`vite preview`, on every response (not only
`index.html`: a module worker under `require-corp` needs COEP on its own
script response):

| Header | Value |
|---|---|
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Embedder-Policy` | `require-corp` |
| `Cache-Control`, `/assets/*` (hashed) | `public, max-age=31536000, immutable` |
| `Cache-Control`, everything else | `no-cache` |
| `X-Content-Type-Options` | `nosniff` (recommended, not required) |

"Everything else" includes `index.html` and also the unhashed public
files (`fonts/`, `map/`, `replay/replay.js`, `release.json`): they keep
their names across releases, so they must revalidate, never be
immutable. All assets are same-origin, so no
`Cross-Origin-Resource-Policy` is needed. No CSP is sent for now (as in
dev); if one is added later it must allow `wasm-unsafe-eval`,
`worker-src 'self'` and `connect-src 'self' wss://mume.org`
(spec §1.5).

MIME types the app depends on: `.js` as `text/javascript` (module
scripts and the module worker are refused otherwise), `.css`,
`.html`, `.woff2` as `font/woff2`, `.png`. `.mm2`, `.fnt` and
`README` are fetched as bytes or text, so any type works
(`application/octet-stream` is fine). No SPA fallback: unknown paths are
404.

## Consequences

- One command publishes; a visitor gets either the old or the new
  release, never a mix of files.
- A tab open across two publishes can miss a lazy chunk (only one
  generation is carried). Reloading fixes it.
- `replay/replay.js` is not hashed: an old tab that exports an HTML
  replay after a publish embeds the new runtime with its old payload.
  Acceptable while releases are few; hashing it is the fix if it bites.
- The smoke test adds a few seconds to each publish and needs Playwright's
  browsers, which the e2e suite already needs.

## Amendment 2026-09-28 — version guard and release.json (ADR 0025)

- `npm run publish` refuses to publish when `package.json`'s version
  equals the live release's (`--dry-run` only warns; `--rollback` is
  unaffected). Bump the version and commit before every publish.
- `vite build` itself emits a minimal `release.json`
  (`{ version, commit }`); publish overwrites it with the full manifest
  above. The running app fetches it (`cache: 'no-store'`) to tell the
  user that a newer release is live. The site-root smoke test checks its
  type and `no-cache`.

## Amendment 2026-09-29 — GitHub Pages (ADR 0028)

A second deployment runs in parallel: GitHub Pages at
<https://khazdul.github.io/webcockpit/>, published by a version tag
(`npm run build:pages`, `.github/workflows/pages.yml`). This site is
unchanged: base `/`, the headers above, `npm run publish`. The smoke test
now takes a base and a header profile (`site`, the default, is this
site); see ADR 0028.

## Note 2026-09-29 — superseded (ADR 0029)

The Tailscale/Caddy site is retired. `npm run publish` and
`scripts/publish.ts` are removed, and the smoke test's `site` header
profile with them. The only production host is GitHub Pages at
<https://mumecockpit.com/> (ADR 0028, ADR 0029). The body above is kept
as history.
