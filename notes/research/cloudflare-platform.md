# Cloudflare platform facts

Research for spec §7 and ADR 0144, read from Cloudflare's documentation
on 2026-11-13 through a summarising fetch tool. **Re-open the page
before a number decides a design.** Items under "Not verified" must be
tried on a deployed Worker in the stage that depends on them.

## Will bite this project

- **PBKDF2 in Workers is capped** (workerd issue 1346: 100 000
  iterations in production; not in the official docs). **Free CPU is
  10 ms per request.** So the heavy password work is done in the
  browser, and the server only does one SHA-256 (ADR 0145).
- **Request bodies are at most 100 MB** on Free and Pro zones.
- **Presigned R2 URLs** work only on
  `<account>.r2.cloudflarestorage.com`, not on our domain. We upload
  through the Worker instead.
- **Static assets ignore Range requests** (200 with the whole file).
- **Old hashed chunks are not kept between versions.** An open tab can
  404 on a lazy chunk after a deploy unless the new release ships the
  old files too. `scripts/pages-build.ts` already carries the live
  release's assets; keep that step.
- **`@cloudflare/vitest-pool-workers` is now `@cloudflare/vitest-plugin`**
  (Vitest ≥ 4.1).
- **Analytics Engine keeps 3 months, Web Analytics 6 months.** Our own
  statistics go to D1.

## Static hosting: Workers with static assets

- Cloudflare's own advice: start new projects on Workers, not Pages
  (<https://developers.cloudflare.com/pages/>).
- Requests to static assets are free and unlimited; only Worker
  invocations count
  (<https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/>).
- 20 000 files per version on Free, 25 MiB per file.
- `run_worker_first = ["/api/*"]` sends those paths to the Worker;
  needs Wrangler ≥ 4.20
  (<https://developers.cloudflare.com/workers/static-assets/binding/>).
- `assets.not_found_handling = "single-page-application"` serves
  `index.html` for unknown paths.
- Default asset header: `Cache-Control: public, max-age=0,
  must-revalidate` plus an ETag. Hashed assets get a long cache through
  a `_headers` rule (max 100 rules; not applied to Worker responses)
  (<https://developers.cloudflare.com/workers/static-assets/headers/>).
- `_redirects`: static and dynamic redirects, no rewrites.
- **Custom domain:** `routes: [{ pattern: "mumecockpit.com",
  custom_domain: true }]`. Cloudflare makes the DNS record and the
  certificate. The existing apex A and AAAA records (GitHub Pages) must
  be deleted first; reports say attaching fails while they exist
  (error 100117). `www` is a separate hostname: a redirect rule plus a
  proxied placeholder record
  (<https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>).
- Expected downtime at the switch (an inference): seconds to minutes
  between deleting the records and attaching, plus resolver TTL.

## Deploy

- `cloudflare/wrangler-action@v4`, Wrangler 4. Token template "Edit
  Cloudflare Workers"; add **D1 Edit** when CI applies migrations.
- `wrangler rollback` to any of the last 100 versions (code only, not
  data; blocked across a Durable Object class migration).
- Previews per branch (`wrangler preview`, Wrangler ≥ 4.135) exist; not
  used now.

## Workers limits

| | Free | Paid ($5 a month) |
|---|---|---|
| Requests | 100 000 a day | 10 M a month, then $0.30/M |
| CPU per request | 10 ms | 30 s default |
| Subrequests | 50 | 10 000 |
| Cron triggers | 5 | 250 |

Over the free quota: error 1027 on Worker paths; static assets still
serve. <https://developers.cloudflare.com/workers/platform/limits/>

## D1

| | Free | Paid |
|---|---|---|
| Database size | 500 MB | 10 GB |
| Rows read | 5 M a day | 25 B a month |
| Rows written | 100 000 a day | 50 M a month |
| Queries per invocation | 50 | 1 000 |
| Time Travel | 7 days | 30 days |

- Row and BLOB at most 2 MB; statement 100 KB; 100 bound parameters.
- `db.batch([...])` is one transaction and one query toward the limit.
- Rows read counts rows scanned: index every filter.
- `--jurisdiction=eu` only at creation, never changed later
  (<https://developers.cloudflare.com/d1/configuration/data-location/>).
- Time Travel restores in place to any minute; no clone.

## R2

- Free each month: 10 GB, 1 M Class A (writes, lists), 10 M Class B
  (reads). Then $0.015 per GB-month. Egress and deletes are free.
- Jurisdiction `eu` at creation, immutable.
- Lifecycle rules can expire objects by prefix and abort unfinished
  multipart uploads.
- Scale: 100 accounts at the 50 MB limit (ADR 0146) are 5 GB, inside
  the free 10 GB. 300 accounts at 250 MB would be 75 GB, about $1 a
  month.

## Presence and statistics

- A Durable Object is not needed for "online now": a heartbeat that
  upserts `last_seen` in D1 is enough at hundreds of users.
- Write budget: 200 concurrent users with a 5-minute heartbeat are
  about 58 000 writes a day, inside D1 Free. A 1-minute heartbeat is
  not.
- KV (1 000 writes a day on Free) and Analytics Engine (sampled, 3
  months) do not fit.

## Turnstile and rate limiting

- Turnstile is free and unlimited (20 widgets). The token must be
  checked server-side at
  `https://challenges.cloudflare.com/turnstile/v0/siteverify`; valid
  300 s, single use.
- Workers Rate Limiting binding (GA 2025-09): `env.RL.limit({key})`,
  period 10 or 60 s, per location and approximate. Good as a coarse
  net; strict counts (login attempts per name) go in D1.
- WAF on a Free zone: one rate limiting rule.

## Cloudflare Access for `/admin`

- A self-hosted Access application can cover a path. Login by one-time
  PIN to an email address or by GitHub.
- The Worker must still verify the `Cf-Access-Jwt-Assertion` header
  (`jose`, the team's `/cdn-cgi/access/certs`, the application's AUD).
- Free seats: 50 (from second-hand sources; confirm in the dashboard).

## Web Analytics

Free, no cookies, a JS beacon from `static.cloudflareinsights.com`.
Not used: our own heartbeat gives what we want without a third-party
script (spec §1.5, self-hosted assets only).

## Local development and tests

- `wrangler dev` runs the Worker in workerd with local D1, R2 and the
  rate limiting binding.
- The Cloudflare Vite plugin fits "SPA plus API" but changes the build
  layout (`dist/client`). Not adopted: the client build stays as it is
  (ADR 0144).
- Secrets: `wrangler secret put`; `.dev.vars` locally (git-ignored).

## Terms and GDPR

- The Developer Platform may host content; we are solely responsible
  for what our users upload, and Cloudflare may remove illegal content.
  A report and takedown path and an abuse contact are ours to provide
  (<https://www.cloudflare.com/service-specific-terms-developer-platform/>).
- The DPA is part of the self-serve agreement, also on the free plan
  (<https://www.cloudflare.com/cloudflare-customer-dpa/>).
- EU storage jurisdiction covers data at rest. Requests are still
  handled at the visitor's nearest location.

## Not verified

- The PBKDF2 cap (we do not depend on it).
- Attaching a custom domain over existing A/AAAA records.
- EU jurisdiction on the Free plan (try at creation in stage 59).
- Access free seats.
- The current name and API of the Workers Vitest integration.
