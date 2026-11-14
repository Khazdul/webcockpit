-- Sync (spec §7.4, §7.11, ADR 0146 and its addendum; stage 61): the
-- account's items, the account's usage counters, and why a session ended.
-- Adds a table, an index and two columns with defaults, so the Worker still
-- running (which knows none of them) is not disturbed.
--
-- Times are milliseconds since the epoch (UTC).

-- An item: an encrypted blob the server never reads (ADR 0145's blob
-- format). `rev` is the item's version (1 for the first write, +1 on every
-- write and on the delete), `seq` the account's change counter at the
-- write (account.seq), the cursor of GET /api/u/sync/changes. A delete is
-- a tombstone (`deleted` 1, `blob` NULL, `size` 0), kept for good.
-- A rowid table, not WITHOUT ROWID: a blob may be up to 1 MB.
CREATE TABLE item (
  account TEXT    NOT NULL,
  kind    TEXT    NOT NULL,
  id      TEXT    NOT NULL,
  rev     INTEGER NOT NULL,
  seq     INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  size    INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  blob    BLOB,
  PRIMARY KEY (account, kind, id)
);

-- The pull: an account's items after a cursor, oldest first.
CREATE INDEX item_seq ON item (account, seq);

-- The account's usage, kept with every write in the same transaction, so
-- no answer has to count the items: live items (tombstones are not
-- counted) and the bytes of their blobs. `account.seq` (0002) is the
-- change counter.
ALTER TABLE account ADD COLUMN item_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE account ADD COLUMN item_bytes INTEGER NOT NULL DEFAULT 0;

-- Why a session ended, so a request on it can say so (`401 session_ended`
-- with the reason): logout, password, recovered, ended, expired, deleted.
-- `id_hash` is the session's (SHA-256 of its token). `at` is when it ended;
-- the daily cron removes a row SESSION_SECONDS after it, the longest a
-- cookie of the session could still be sent.
CREATE TABLE session_end (
  id_hash TEXT    NOT NULL PRIMARY KEY,
  account TEXT    NOT NULL,
  reason  TEXT    NOT NULL,
  at      INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX session_end_at ON session_end (at);
