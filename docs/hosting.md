# Hosting and the dev server

WebCockpit is a static site. Running it locally is in the
[README](../README.md#run-it); this page has the rest.

## Host it yourself

Run `npm run build` and serve `dist/` from any static file server that
sends `.js` as JavaScript and `.woff2` as `font/woff2`; no special
headers are needed. The public site is a Cloudflare Worker with static
assets ([ADR 0144](decisions/0144-cloudflare-and-a-backend.md):
`wrangler.jsonc`, `worker/`, `npm run build:site`).

To serve it under a subpath, build with
`WEBCOCKPIT_BASE=/path/ npm run build`
([ADR 0028](decisions/0028-github-pages-deployment.md)).

## The dev server over Tailscale

To open the dev server from another device on your
[Tailscale](https://tailscale.com) network, proxy
`https://<machine>.<tailnet>.ts.net:5173` to `http://127.0.0.1:5173` with
`tailscale serve` and run `npm run dev:tailnet` (or set
`WEBCOCKPIT_DEV_HOSTS` to the proxy's host names;
[ADR 0096](decisions/0096-dev-server-over-tailscale.md)).
