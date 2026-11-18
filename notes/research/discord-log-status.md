# Hall of Fame logs in MUME's Discord #log-status

2026-11-17. Investigation. Built as stage 72 (webhook, ADR 0161), live 2026-11-18.

## What we know

- `#log-status` on MUME's Discord shows posts from "Elvenrunes" (APP badge,
  own avatar): "The log **<title>** has been posted by **<author>** on
  Elvenrunes:", the log's first lines, "[…]", and a "Read more on
  Elvenrunes…" link.
- Halls of Mandos is a separate, newer bot: players run `/mandos` with a
  txt file; it hosts the log (colours, timeline, auto-read) and posts it.
- elvenrunes.com has no RSS, Atom or JSON API (`/rss`, `/feed`,
  `/logs/rss`, `/rss.xml` are 404). Logs are listed at
  `/cgi-bin/logs/logs.m`, newest first, with rising numeric ids.

## Guesses (unconfirmed)

- The Elvenrunes posts come from a Discord webhook called by elvenrunes
  when a log is posted: APP badge with a custom name and avatar, and the
  Discord time (6:11 CET) matches the listing's "5:11 GMT" to the minute.
  Polling of `logs.m` is the alternative.

## Options for us

- **Webhook** (preferred if that is how it works): a server admin creates a
  webhook in `#log-status`; the Worker keeps the URL as a secret and posts
  one message per newly listed log (name "MUME Cockpit", our logo,
  "The log **<title>** has been posted by **<sender>** (<character>) on
  MUME Cockpit" and `https://mumecockpit.com/r/<id>`). Discord unfurls the
  link into the ADR 0158 preview card. Post only after the preview PNG is
  uploaded (Discord caches the unfurl). No text excerpt: the Worker never
  reads a payload. No real button: components need a bot.
- **Feed** (if Nazgum polls): `GET /api/gallery?sort=new` already works
  in production (id, title, sender, character, level, lengthS, listedAt;
  link `/r/<id>`). A stable `/api/feed.json` and `/feed.xml` would decouple
  it from the Community page's API.

## Scope decided by the owner

- Every log listed in the Hall of Fame goes in the flow (not only those
  with five votes). Unlisted share links never do.

## Status (done: stage 72, ADR 0161)

- The owner sent Nazgum a DM (2026-11-17) asking how it works and whether
  we may join. Next: act on the answer.
