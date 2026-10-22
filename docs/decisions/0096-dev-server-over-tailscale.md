# 0096 — Dev server over a Tailscale serve proxy

- Status: Accepted
- Date: 2026-10-22
- Related: ADR 0029 (custom domain, Tailscale hosting retired)

## Context

The owner wants to open the dev server (`npm run dev`) on an iPad. A
Tailscale `serve` proxy, set up outside this repository and reachable only
inside the owner's tailnet, forwards `https://<machine>.<tailnet>.ts.net:5173`
to `http://127.0.0.1:5173`. Vite rejects unknown `Host` headers, and by
default moves to the next port when 5173 is busy, which would leave the
proxy pointing at the wrong server. The repository is public, so the
tailnet name must not be in it.

## Decision

- `$WEBCOCKPIT_DEV_HOSTS` (comma-separated host names) is read by
  `vite.config.ts` (`devHosts`). Unset or empty: the dev server is exactly
  as before.
- When set, the dev server gets `allowedHosts` = those names, `host:
  '127.0.0.1'` (loopback only, never `0.0.0.0`; Tailscale is the only way
  in) and `port: 5173` with `strictPort`, so a busy port is an error
  instead of a silent move. Strict only in this mode: plain `npm run dev`
  keeps Vite's port fallback.
- `npm run dev:tailnet` (`scripts/dev-tailnet.ts`) sets the variable to
  this machine's Tailscale name from `tailscale status --json` unless it
  is already set, then runs `vite`.
- HMR is left at Vite's defaults: the client connects to the page's own
  host and port (5173 outside and inside), as `wss:` on an HTTPS page, and
  the proxy forwards the WebSocket upgrade. Verified: `101 Switching
  Protocols` for `vite-hmr` through the proxy.
- The COOP/COEP headers are unchanged and pass through the proxy; HTTPS
  gives a secure context, so `crossOriginIsolated` holds on the iPad.

## Consequences

- Vite logs "Port 5173 is in use on a wildcard address" at start:
  `tailscale serve` listens on the tailnet addresses' 5173. Harmless; the
  two sockets do not overlap.
- Anyone on the owner's tailnet can reach the dev server, including the
  read-only `/__fixtures` endpoint (ADR 0007). That is the owner's own
  network and their own logs.
