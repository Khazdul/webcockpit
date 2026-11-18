# Stage 72 — Hall of Fame logs in MUME's Discord #log-status

Not a spec §5 row: the owner's request of 2026-11-17, after Nazgum (MUME's
Discord admin) made a webhook for `#log-status` on 2026-11-17. Background:
`notes/research/discord-log-status.md`.

## The owner's direction (2026-11-18)

1. Every log **listed in the Hall of Fame** is posted in `#log-status`
   (not only those with five votes). Unlisted share links never are.
2. The posts show the name **MUME Cockpit** and **our logo** as the avatar
   (set in each message; Nazgum need not change the webhook).
3. **Only new logs** once it is turned on; no backfill. The one log listed
   today is posted by hand once it is live, so the owner sees a real post.
4. A log that leaves the Hall of Fame (removed by the sender or the admin,
   hidden after a report, Delete account, the cron) has its **Discord post
   deleted** too.
5. **Testing against a fake Discord only.** Staging never posts anywhere;
   the first real post is the hand-posted one in production.

## Technical plan (decided in session; ADR 0161)

- The webhook URL is the Worker secret `DISCORD_WEBHOOK_URL` (production
  only, set with `wrangler secret put`), never in the repository. Without
  it nothing is posted.
- A server flag `discord` (FLAG_DISCORD; off in production and staging) is
  the kill switch, from /admin.
- The `*/5` cron posts listed active logs not yet posted, listed after the
  cut-off and at least ~2 minutes old (the preview PNG is uploaded first,
  Discord caches the unfurl), a few per tick; `?wait=true` gives the
  message id, kept in D1. The same tick deletes the post of every posted
  log no longer listed and active.
- Message: "The log **<title>** has been posted by **<sender>**
  (<character>) on MUME Cockpit" and the link `https://mumecockpit.com/r/<id>`
  (Discord unfurls it into the ADR 0158 card). Markdown escaped,
  `allowed_mentions: { parse: [] }`. No excerpt (the Worker never reads a
  payload).

## Tasks

- [x] ADR 0161
- [x] Migration, flag, secret type, cron poster and deleter, logo URL
- [x] Unit tests against a fake Discord (post, wait id, delete, 429/5xx
      retry next tick, escape, no mentions, no secret → nothing)
- [ ] Review, merge, staging
- [ ] Release; secret set in production; the existing log posted by hand;
      flag on (the owner's word)

## Test guide

Nothing on staging posts to Discord: staging has no `DISCORD_WEBHOOK_URL`,
and the flag `discord` is off in both environments. The poster itself was
tested against a fake Discord (`worker/test/discord.test.ts`, 29 tests).
What you can check on staging:

1. Open `/admin` → Flags and limits. The table has a new last row
   `discord`, "off", default "off". Turning it on and off works and goes
   to the admin log, but posts nothing (no secret).
2. Everything else as before: list and unlist a log in the Hall of Fame,
   remove one; nothing changes for the player.

In production, after the release (your word on each step):

1. Set the secret: `npx wrangler secret put DISCORD_WEBHOOK_URL` (paste
   Nazgum's webhook URL; it never goes in the repository).
2. Turn `discord` on in `/admin`. From that moment only logs newly listed
   in the Hall of Fame are posted, 2–7 minutes after listing, as
   "MUME Cockpit" with our logo.
3. Post today's log by hand (it was listed before the switch):
   `npx wrangler d1 execute webcockpit --remote --command "INSERT INTO
   discord_post (pub) VALUES ('<id>') ON CONFLICT DO NOTHING"`; it appears
   in #log-status within 5 minutes.
4. Check the post: the name and avatar, the text "The log **…** has been
   posted by **…** (…) on MUME Cockpit:", and the link unfurled into the
   preview card.
5. Unlist (or remove) a test log that was posted: its Discord post goes
   within 5 minutes.

Feedback wanted: the wording of the post, and whether the avatar looks
right in the channel.
