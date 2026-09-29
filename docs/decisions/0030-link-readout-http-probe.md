# 0030 — Link readout from an HTTPS probe

- Status: Accepted
- Date: 2026-09-29
- Amends: ADR 0007 (the `Link:` readout part of "Keep-alive")

## Context

The ESC menu header shows `Link: NNms`. Until now it was the minimum
GMCP `Core.Ping` round trip over 60 s (ADR 0007, amendment 2). MUME
answers `Core.Ping` only on its ~250 ms game pulse, so every sample is
the network RTT plus a pulse wait, and even the 60 s minimum reads
~60–160 ms. The owner's terminal client (Cockpit) shows ICMP
`ping mume.org` once per second, ~35–40 ms. The owner wants `Link:` to
show the same thing: the network link to the game server.

A browser cannot send ICMP, and every in-band option (Core.Ping over
the WebSocket, a telnet round trip) waits for the pulse. The web server
on mume.org runs on the same host as the game (193.134.218.98), so an
HTTP round trip to it measures the same path.

Measured from the owner's machine, 2026-09-29:

| Method | Round trip |
| --- | --- |
| ICMP `ping mume.org` | 33–41 ms (110 pings: min 32.8, avg 38.1, max 49.4) |
| HTTPS `HEAD /favicon.ico` on an already open keep-alive connection (curl) | 33–42 ms |
| The same, first request on a new connection (TCP + TLS) | ~115–200 ms |
| `Core.Ping` over the WebSocket or telnet | 55–290 ms, spread over the pulse |

mume.org is Apache 2.4.52 over HTTP/1.1 (it offers an h2 upgrade), so
assume Apache's default `KeepAliveTimeout` of 5 s: an idle connection is
closed after ~5 s, and a probe every 10 s always finds it closed.

Browser runs (Playwright, the exact fetch sequence below, one tick every
10 s, ten ticks, run concurrently with `ping`, on a page without COEP):

| Browser | Warm-up (reopens the connection) | Timed request, sorted | Median |
| --- | --- | --- | --- |
| Chromium | 113–199 ms | 35 36 38 38 38 39 40 41 42 44 | 39 ms |
| Firefox | 121–213 ms | 42 44 45 45 46 46 46 47 49 107 | 46 ms |
| ICMP, same 110 s | | min 32.8, avg 38.1, max 49.4 | |

Chromium matches ICMP. Firefox reads ~7 ms above it. Firefox's first
tick was slow (107 ms): in a fresh profile its second request to a new
host is slow too (five back-to-back requests: 174, 98, 44, 44, 44 ms),
so the first tick needs a second warm-up.

The built app (production bundle, no COEP), connected to MUME and left
at the login prompt for 65 s, showed `Link: 41–44ms` in Chromium and
`Link: 40–47ms` in Firefox, against ICMP min 33.1 / avg 39.3 ms over the
same time.

A page with COEP `require-corp` (the Vite dev server, ADR 0028 keeps
cross-origin isolation for dev only) cannot use the probe: mume.org
sends no `Cross-Origin-Resource-Policy`, so the opaque response is
blocked (`TypeError: Failed to fetch` in Chromium, `NetworkError` in
Firefox). The production site on GitHub Pages sends no COEP.

## Decision

- **Probe** (`src/net/link-probe.ts`): every 10 s while connected (the
  same login/disconnect edges as the keep-alive; the first tick right
  away) send a warm-up request and then a timed one:
  `fetch('https://mume.org/favicon.ico?lp=<unique>', { method: 'HEAD',
  mode: 'no-cors', cache: 'no-store', credentials: 'omit',
  referrerPolicy: 'no-referrer' })`. The warm-up reopens the keep-alive
  connection; only the timed request is measured (`performance.now()`
  from the call to the promise resolving). The first tick of a
  connection sends two warm-ups (the Firefox finding above).
  `favicon.ico` is static and has been there for years; `HEAD` returns
  no body; the unique query string and `no-store` make every request
  reach the server.
- **Readout:** the lower median of the last 3 timed samples, so one
  slow sample (a GC pause, a busy server) does not move the readout.
  The latest sample alone was tried in the table above and is mostly
  steady, but the median costs nothing and hides the odd spike.
- **Timeouts:** each request has its own 5 s timeout (AbortController).
  One tick at a time: the next is armed when the current one ends.
- **Fallback:** a failed tick (network error, timeout, blocked by an
  extension or a firewall) clears the samples and reports null;
  `link.rtt.ms` then falls back to the Core.Ping 60 s minimum, so
  `Link:` never goes blank where it used to have a value.
- **Event:** `link.rtt` carries `ms` (the readout: probe, else
  Core.Ping), `http` (probe readout or null), `ping` (Core.Ping minimum)
  and `last` (latest raw Core.Ping). `KeepAlive.setHttpRtt` feeds the
  probe value in.
- **Unchanged:** `Core.Ping` every 10 s stays, for the keep-alive and
  for the `suspect` flag (`Link: 38ms?`).
- **Where it does not run:** replay connections, log player Apps, pages
  that never connect live (`?replay`, `?fixture=`, `?bench`), and
  cross-origin isolated pages (`crossOriginIsolated === true`, i.e. the
  dev server), where it could only fail. There `Link:` shows the
  Core.Ping minimum as before. This also keeps the e2e suite, which runs
  against the dev server, off the network.

## Consequences

- `Link:` shows the network RTT to the game host, within a few ms of
  what Cockpit shows (Firefox reads ~5–8 ms higher than Chromium).
- Load on mume.org: two `HEAD` requests (three on the first tick) and
  one new TLS connection per 10 s per connected player: about 12
  requests a minute per player, a few hundred bytes each. For hundreds
  of players that is tens of requests per second, all tiny and static.
  They show in mume.org's access log with no referrer and no cookies.
- It relies on mume.org's web server staying on the same host (or at
  least the same network) as the game. If the web site moves to a CDN
  or another host, `Link:` would silently measure the wrong path; the
  URL is one constant (`LINK_PROBE_URL`) to change then.
- During development (`npm run dev`) the readout is still the Core.Ping
  minimum. To see the probe locally, serve a production build (for
  example `node scripts/static-server.ts dist`), which sends no COEP.
- If a CSP is ever added (ADR 0022 lists `connect-src 'self'
  wss://mume.org`), it must also allow `https://mume.org`.
