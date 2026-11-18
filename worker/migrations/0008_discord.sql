-- Hall of Fame logs in MUME's Discord #log-status (stage 72, ADR 0161):
-- the posts the Worker made through the webhook (secret
-- DISCORD_WEBHOOK_URL) and the poster's cut-off. Two new tables, so the
-- Worker still running (which knows neither) is not disturbed.
--
-- Times are milliseconds since the epoch (UTC).

-- One row per log the poster has posted, or is asked to post. `pub` is
-- the publication's id. `posted` is when it was posted (NULL: not yet).
-- `message` is Discord's message id (a snowflake), NULL when Discord gave
-- none (the post cannot be deleted then) or not posted yet. The 5-minute
-- cron deletes the Discord message of every row whose log is no longer
-- listed and active, then the row.
--
-- Posting one log by hand (e.g. one listed before the cut-off): a row
-- with `posted` NULL is posted by the next tick (with the flag `discord`
-- on and the secret set) if the log is listed and active:
--   wrangler d1 execute webcockpit --remote \
--     --command "INSERT INTO discord_post (pub) VALUES ('<id>') ON CONFLICT DO NOTHING"
CREATE TABLE discord_post (
  pub     TEXT NOT NULL PRIMARY KEY,
  message TEXT,
  posted  INTEGER
) WITHOUT ROWID;

-- The poster's state: key 'cutoff' (value: ms) is when the poster last
-- began to run with the flag on and the secret set; only logs first
-- listed after it are posted by themselves. Cleared while the flag is
-- off, so turning it on again posts no backlog.
CREATE TABLE discord_state (
  key   TEXT    NOT NULL PRIMARY KEY,
  value INTEGER NOT NULL
) WITHOUT ROWID;
