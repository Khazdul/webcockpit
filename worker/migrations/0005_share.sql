-- Share links (spec §7.7, §7.9, §7.11, ADR 0148, ADR 0154; stage 64): the
-- published runs, their views, the reports, the admin's log, and the
-- account's count and bytes of published runs. Adds tables, indexes and
-- two columns with defaults, so the Worker still running (which knows none
-- of them) is not disturbed.
--
-- Times are milliseconds since the epoch (UTC).

-- A published run: its payload (gzip JSON, unencrypted) is in R2 under
-- `pub/<id>`. `id` is 12 random characters of [A-Za-z0-9]. `account` is
-- the sender's account id. `state`:
--   pending   the count is reserved and the payload is on its way to R2
--             (never shown; the daily cron removes one left behind)
--   active    shown to anyone with the link
--   hidden    hidden by reports (`hidden_reason` 'reports') or by the
--             admin ('admin'); its sender still sees it
--   removed   a tombstone (removed by its sender or the admin, or its
--             account deleted): the text is gone, the link answers 410.
--             `bytes` > 0 on a tombstone means its R2 object may still be
--             there: the daily cron deletes it and sets `bytes` to 0.
-- `bytes` is the payload's size (spec §7.11 calls it `size`). `reviewed`
-- is 1 once the admin has restored the run or dismissed its reports: later
-- reports queue it for the admin but never hide it by themselves.
-- `pub_key` is the client's idempotency key of the POST that made it
-- (`PubMetaIn.key`, unique per account; a tombstone drops it): a repeated
-- POST with it answers this run instead of making another. `listed`
-- (stage 65), `vote_sum`, `vote_count` and `comment_count` (stage 65) are
-- made now so stage 65 adds no columns here.
CREATE TABLE publication (
  id            TEXT    NOT NULL PRIMARY KEY,
  account       TEXT    NOT NULL,
  title         TEXT    NOT NULL DEFAULT '',
  description   TEXT    NOT NULL DEFAULT '',
  character     TEXT    NOT NULL DEFAULT '',
  level         INTEGER,
  length_s      REAL    NOT NULL DEFAULT 0,
  bytes         INTEGER NOT NULL DEFAULT 0,
  listed        INTEGER NOT NULL DEFAULT 0,
  state         TEXT    NOT NULL DEFAULT 'pending',
  hidden_reason TEXT,
  created       INTEGER NOT NULL,
  updated       INTEGER NOT NULL,
  views         INTEGER NOT NULL DEFAULT 0,
  reviewed      INTEGER NOT NULL DEFAULT 0,
  pub_key       TEXT,
  vote_sum      INTEGER NOT NULL DEFAULT 0,
  vote_count    INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

-- The account's published runs, newest first; Delete account's tombstones.
CREATE INDEX publication_account ON publication (account, created);
-- The daily cron: tombstones whose object may still be in R2, pending rows left behind.
CREATE INDEX publication_state ON publication (state, updated);
-- A POST's idempotency key, per account (NULLs are distinct: runs without one).
CREATE UNIQUE INDEX publication_key ON publication (account, pub_key);

-- A view: one per publication, device (the statistics' device id) and UTC
-- day. Pruned by the daily cron after two days.
CREATE TABLE pub_view (
  pub    TEXT NOT NULL,
  device TEXT NOT NULL,
  day    TEXT NOT NULL,
  PRIMARY KEY (pub, device, day)
) WITHOUT ROWID;

CREATE INDEX pub_view_day ON pub_view (day);

-- A report: `kind` 'run' (stage 64; 'comment' and 'note' from stage 65),
-- `target` the item's id, `account` the reporter's account id. `handled`
-- is 0 until the admin acts on the item (then the time). One per account
-- and item. Delete account deletes the account's unhandled reports and
-- keeps its handled ones without text and with `account` NULL.
CREATE TABLE report (
  id      INTEGER PRIMARY KEY,
  kind    TEXT    NOT NULL,
  target  TEXT    NOT NULL,
  account TEXT,
  reason  TEXT    NOT NULL,
  text    TEXT    NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  handled INTEGER NOT NULL DEFAULT 0,
  UNIQUE (kind, target, account)
);

-- The 30 a day per account.
CREATE INDEX report_account ON report (account, created);
-- The admin's queue and the five that hide.
CREATE INDEX report_open ON report (handled, kind, target);

-- What the admin did: `who` is a hash of the Access e-mail, never the address.
CREATE TABLE admin_log (
  id     INTEGER PRIMARY KEY,
  ts     INTEGER NOT NULL,
  who    TEXT    NOT NULL,
  action TEXT    NOT NULL,
  target TEXT    NOT NULL,
  note   TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX admin_log_ts ON admin_log (ts);

-- The account's live published runs (pending, active and hidden) and
-- their bytes: the count is reserved here before a payload goes to R2
-- (worker/pub.ts) and given back when it does not get there. Published
-- bytes do not count against `runBytes`.
ALTER TABLE account ADD COLUMN pub_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE account ADD COLUMN pub_bytes INTEGER NOT NULL DEFAULT 0;
