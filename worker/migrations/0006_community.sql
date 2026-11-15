-- The community (spec §7.8, §7.10, §7.11, ADR 0155; stage 65): listing,
-- the two vote sums, votes, comments, Random Runes' notes and the
-- account's reactions time. Adds tables, indexes and columns with
-- defaults, so the 0.13 Worker still running (which knows none of them)
-- is not disturbed: it never lists a run, and its tombstones leave votes
-- and comments that no one reads (there are none before stage 65).
--
-- Times are milliseconds since the epoch (UTC).

-- `listed_at`: the first time the run was listed (set once; kept when it
-- is unlisted and listed again, so toggling never brings an old run back to
-- the top of New or the counter). `top_sum` and `top_count` are the votes
-- that rank (Top's order only): a vote whose account was at least 7 days
-- old when it was cast or last changed (`vote.ranks`). `vote_sum` and
-- `vote_count` (every live vote) and `comment_count` (visible comments)
-- exist since 0005.
ALTER TABLE publication ADD COLUMN listed_at INTEGER;
ALTER TABLE publication ADD COLUMN top_sum INTEGER NOT NULL DEFAULT 0;
ALTER TABLE publication ADD COLUMN top_count INTEGER NOT NULL DEFAULT 0;

-- The lists (New, Top, Most watched, the counter) read active listed runs by `listed_at`.
CREATE INDEX publication_listed ON publication (state, listed, listed_at);

-- A vote: 1–5 stars of an account on a run. `ranks` is 1 when the
-- account was at least 7 days old at the write (fixed then, so the sums
-- stay incremental). The sums of a suspended account's votes are taken
-- out (and put back on Restore); the rows stay.
CREATE TABLE vote (
  publication TEXT    NOT NULL,
  account     TEXT    NOT NULL,
  stars       INTEGER NOT NULL,
  created     INTEGER NOT NULL,
  updated     INTEGER NOT NULL,
  ranks       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (publication, account)
) WITHOUT ROWID;

-- Deletion and suspension; the hourly limit (counted on `updated`).
CREATE INDEX vote_account ON vote (account, updated);
-- The reactions on one's own runs.
CREATE INDEX vote_publication ON vote (publication, updated);

-- A comment on a run. `id` 12 characters as a run's. `state`:
--   active    shown under the run
--   hidden    hidden by reports (`hidden_reason` 'reports') or by the
--             admin ('admin'); shown to no one but the admin
--   removed   removed by its writer or the run's sender: the text is gone;
--             the row stays an hour for the hourly limit, then the daily
--             cron deletes it
-- `reviewed` as a run's: the admin restored it or dismissed its reports.
CREATE TABLE comment (
  id            TEXT    NOT NULL PRIMARY KEY,
  publication   TEXT    NOT NULL,
  account       TEXT    NOT NULL,
  text          TEXT    NOT NULL,
  created       INTEGER NOT NULL,
  state         TEXT    NOT NULL DEFAULT 'active',
  hidden_reason TEXT,
  reviewed      INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

CREATE INDEX comment_publication ON comment (publication, created);
CREATE INDEX comment_account ON comment (account, created);

-- A note on Random Runes (one line). The states as a comment's; a removed
-- note's row stays until its day's limit has passed. The daily cron
-- deletes notes older than 30 days, except hidden ones with open reports.
CREATE TABLE note (
  id            TEXT    NOT NULL PRIMARY KEY,
  account       TEXT    NOT NULL,
  text          TEXT    NOT NULL,
  created       INTEGER NOT NULL,
  state         TEXT    NOT NULL DEFAULT 'active',
  hidden_reason TEXT,
  reviewed      INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

CREATE INDEX note_state ON note (state, created);
CREATE INDEX note_account ON note (account, created);

-- MUME's war point lists and player count (ADR 0155, "MUME's lists and
-- player count"; written by the cron of part C5): the last good answer per
-- `key` ('war': JSON {west, dark}; 'players': a JSON number) and when it
-- was fetched. `GET /api/community` shows a row only while it is under
-- 24 hours old.
CREATE TABLE mume_cache (
  key     TEXT    NOT NULL PRIMARY KEY,
  value   TEXT    NOT NULL,
  fetched INTEGER NOT NULL
) WITHOUT ROWID;

-- The account's last look at the reactions on its own runs (Published
-- runs); `gallery_seen` (0002) is its last look at the Community page.
ALTER TABLE account ADD COLUMN reactions_seen INTEGER NOT NULL DEFAULT 0;
