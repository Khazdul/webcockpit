# 0161 — Hall of Fame logs in MUME's Discord #log-status

Date: 2026-11-18. Status: accepted (built on `feat/discord-log-status`,
stage 72).

## Context

MUME's Discord has a channel `#log-status` where Elvenrunes posts each new
log. Nazgum (MUME's Discord admin) made a webhook in it for us on
2026-11-17 (`notes/research/discord-log-status.md`). The owner's direction
(stage 72): every log **listed in the Hall of Fame** is posted, as "MUME
Cockpit" with our logo; only new logs once it is on (the one listed today
is posted by hand); a log that leaves the Hall of Fame has its post
deleted; tested against a fake Discord only, so staging never posts.

## Decision

- **The webhook** is the Worker secret `DISCORD_WEBHOOK_URL`, set in
  production only (`wrangler secret put DISCORD_WEBHOOK_URL`), never in the
  repository. Before use it must be `https://discord.com/api/webhooks/<id>/
  <token>` (or `discordapp.com`; an `/api/vN/` path is accepted): https,
  no port, credentials, query or fragment, a numeric id; the requests go to
  that base rebuilt from its parts. Missing or invalid: the poster does
  nothing at all (no request, no state written). The URL and token never
  reach a log line: errors are swallowed, nothing is printed.
- **The flag `discord`** (`FLAG_DISCORD`, off in production and staging,
  last in `FLAG_NAMES`, listed in /admin → Flags like the others) is the
  kill switch for **posting**. Deletions run whenever the secret is valid,
  whatever the flag, so a removal is honoured while posting is off.
- **Where:** `worker/discord.ts`, `discordTick`, called by the existing
  `*/5` cron (`runCron` in worker/stats.ts) after the MUME part, in its
  own `finally`. It never throws: a missing table (the migration not yet
  applied) or a failing database is a tick without effect.
- **Data** (migration `0008_discord.sql`): `discord_post(pub, message,
  posted)`: one row per posted log (Discord's message id, NULL if Discord
  gave none) or per log asked for by hand (`posted` NULL);
  `discord_state(key, value)` with the row `cutoff`.
- **Only new (the cut-off).** The first tick that runs with the secret
  valid and the flag on stores `cutoff = now`. A log is posted by itself
  only if `listed_at >= cutoff` (`listed_at` is the *first* listing, so a
  log first listed earlier and listed again later is not). While the flag
  is off (secret valid) the cut-off row is deleted, so every turn-on is a
  new cut-off: logs listed while it was off are never posted, and a kill
  switch flipped back on posts no backlog.
- **Posting.** Each tick, after the deletions: the listed active logs
  (`state = 'active' AND listed = 1`, the Hall of Fame's own rule) with
  `listed_at` and `updated` both at least **2 minutes** old (the preview
  PNG of ADR 0158 is uploaded by then; Discord caches the unfurl; a log
  edited or listed again waits too), either after the cut-off and with no
  row, or with a row whose `posted` is NULL; oldest `listed_at` first, at
  most **5** a tick. `POST <base>?wait=true` with:
  `username: "MUME Cockpit"`, `avatar_url: <SITE_ORIGIN>/apple-touch-icon.png`
  (our logo, a 180 x 180 PNG already served), `content`: `The log **<title>**
  has been posted by **<sender>** (<character>) on MUME Cockpit:` and the
  link `<SITE_ORIGIN>/r/<id>` on the next line (without a character:
  `by **<sender>** on`), `allowed_mentions: { parse: [] }`. Title, sender
  and character are made one line (controls and line breaks to spaces),
  capped (100 / 40 / 40 code points, "…"), and every Discord markdown
  character gets a backslash (`\ * _ ~ \` | > # - [ ] ( ) < : @ !`: no
  formatting, heading, quote, masked link, mention or emoji; `https\://`
  is not autolinked, so a title cannot add an embed). No excerpt: the
  Worker never reads a payload. The origin is `SITE_ORIGIN`
  (`https://mumecockpit.com` in production), as the report mail's links;
  without it nothing is posted. The answer's `id` (a snowflake) is kept.
- **Deleting.** Each tick first: every row whose log is gone, not active
  (hidden by reports or the admin, removed by its sender, the admin,
  Delete account or the cron) or not listed, at most **5** a tick: `DELETE
  <base>/messages/<id>`; the row goes on a 2xx, a 404 (deleted by hand in
  Discord already) or another 4xx (asking again would not help). A row
  without a message id (asked for by hand, not yet posted) just goes.
- **Failures.** A 429, a 5xx, a 401/403 (and a 404 on a post: the
  webhook is gone) or a network error/timeout (10 s) **stops the tick**;
  nothing is recorded and the next tick tries again. Another 4xx on a post
  (Discord refused that one message) is recorded without an id, so one bad
  log never blocks the queue.
- **Posting one log by hand** (the one listed before the cut-off): no
  endpoint or button; the operator queues it in D1 and the next tick
  (flag on, secret set) posts it if it is listed and active:

  ```sh
  npx wrangler d1 execute webcockpit --remote \
    --command "INSERT INTO discord_post (pub) VALUES ('<id>') ON CONFLICT DO NOTHING"
  ```

  Least code and as safe as the database itself (only someone with the
  Cloudflare account can do it); a row for a log that is not listed is
  dropped by the next tick without a request.

## Alternatives

- **Post at listing time from the PATCH/POST handler** (`waitUntil`): no
  delay for the preview, a request to Discord on a user's path, and the
  deletion paths (moderation, reports, Delete account, the cron) would
  each need their own hook. One reconciling tick covers every path.
- **An admin endpoint or /admin button for the hand post.** More code
  (CSRF, Access, the log) for a one-off; the D1 command does it.
- **Keep the cut-off when the flag is turned off.** Turning the kill
  switch back on would post the backlog of the off period; a new cut-off
  is the conservative choice.
- **Edit the post when the title changes.** Not asked for; the link's
  unfurl shows the current title.

## Consequences

- At most 5 posts and 5 deletions (10 requests) per tick, within the
  Worker's subrequest limit beside the cron's other fetches; a burst of
  listings is posted over a few ticks.
- A post appears 2–7 minutes after listing; a removal leaves Discord within
  5 minutes (longer during a Discord outage or rate limit).
- A log unlisted and listed again (after the cut-off) is posted again
  after its post was deleted; the 2-minute wait on `updated` bounds how
  fast a sender can make that happen (one post per ~5 minutes per log).
- Editing a posted log's title does not change the Discord message.
- Staging has no secret and never posts; the tests use a stubbed fetch
  (`worker/test/discord.test.ts`).
