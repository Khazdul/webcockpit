-- The admin panel (spec §7.9, ADR 0157; stage 66): the audit log's seal
-- and the triggers that keep it append-only, the default limits edited
-- from /admin (owner's pick 4b), and a backfill of the roll-up's new
-- metrics. Additive: the 0.14.0 Worker still running knows none of it and
-- keeps working (its admin_log inserts carry no `prev`, which the chain
-- trigger lets in only while the newest row's `mac` is NULL, so they work
-- until the first sealed entry of the new Worker).
--
-- Times are milliseconds since the epoch, days 'YYYY-MM-DD', both UTC.

-- The seal: `mac` is HMAC-SHA-256 under a key derived from the secret
-- AUTH_PEPPER of the entry's fields with `prev`, the `mac` of the entry
-- before it (worker/auditlog.ts). Entries from before stage 66 have
-- neither ("not sealed").
ALTER TABLE admin_log ADD COLUMN prev TEXT;
ALTER TABLE admin_log ADD COLUMN mac TEXT;

-- Nothing changes or removes an entry: the database refuses it, and a
-- statement in an action's batch that tried would roll the action back.
CREATE TRIGGER admin_log_no_update BEFORE UPDATE ON admin_log
BEGIN
  SELECT RAISE(ABORT, 'admin_log_append_only');
END;

CREATE TRIGGER admin_log_no_delete BEFORE DELETE ON admin_log
BEGIN
  SELECT RAISE(ABORT, 'admin_log_append_only');
END;

-- An entry goes only at the end of the chain: its `prev` is the newest
-- entry's `mac` (NULL while that is NULL: the old Worker's inserts), and
-- once the chain has begun every entry is sealed. Two actions racing: the
-- later batch rolls back and the Worker tries again with the new head.
CREATE TRIGGER admin_log_chain BEFORE INSERT ON admin_log
WHEN NEW.prev IS NOT (SELECT mac FROM admin_log ORDER BY id DESC LIMIT 1)
  OR (NEW.mac IS NULL AND (SELECT mac FROM admin_log ORDER BY id DESC LIMIT 1) IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'admin_log_chain');
END;

-- The default limits for every account, field by field over the Worker's
-- built-in DEFAULT_ACCOUNT_LIMITS (and RUN_BYTES_LIMIT): `name` a field of
-- AccountLimits, `value` a whole number. Only fields that differ are kept.
CREATE TABLE limit_default (
  name  TEXT    NOT NULL PRIMARY KEY,
  value INTEGER NOT NULL
) WITHOUT ROWID;

-- The backfill of the new daily metrics, for the days before today, from
-- what the tables still know (the daily roll-up writes them from now on,
-- worker/stats.ts). Deleted rows are gone, so the past is a floor; the
-- device windows reach back only as far as device_day (35 days).
INSERT OR IGNORE INTO stat_daily (day, metric, key, value)
SELECT d.day, 'devices_7d', '', (SELECT COUNT(DISTINCT x.device) FROM device_day x WHERE x.day > date(d.day, '-7 days') AND x.day <= d.day)
FROM (SELECT DISTINCT day FROM device_day WHERE day < date('now')) d;

INSERT OR IGNORE INTO stat_daily (day, metric, key, value)
SELECT d.day, 'devices_30d', '', (SELECT COUNT(DISTINCT x.device) FROM device_day x WHERE x.day > date(d.day, '-30 days') AND x.day <= d.day)
FROM (SELECT DISTINCT day FROM device_day WHERE day < date('now')) d;

INSERT OR IGNORE INTO stat_daily (day, metric, key, value)
SELECT date(created / 1000, 'unixepoch') AS day, 'new_accounts', '', COUNT(*) FROM account
WHERE date(created / 1000, 'unixepoch') < date('now') GROUP BY day;

INSERT OR IGNORE INTO stat_daily (day, metric, key, value)
SELECT date(created / 1000, 'unixepoch') AS day, 'pubs_new', '', COUNT(*) FROM publication
WHERE state <> 'pending' AND date(created / 1000, 'unixepoch') < date('now') GROUP BY day;

INSERT OR IGNORE INTO stat_daily (day, metric, key, value)
SELECT date(listed_at / 1000, 'unixepoch') AS day, 'listed_new', '', COUNT(*) FROM publication
WHERE listed_at IS NOT NULL AND date(listed_at / 1000, 'unixepoch') < date('now') GROUP BY day;

INSERT OR IGNORE INTO stat_daily (day, metric, key, value)
SELECT date(updated / 1000, 'unixepoch') AS day, 'votes', '', COUNT(*) FROM vote
WHERE date(updated / 1000, 'unixepoch') < date('now') GROUP BY day;

INSERT OR IGNORE INTO stat_daily (day, metric, key, value)
SELECT date(created / 1000, 'unixepoch') AS day, 'comments', '', COUNT(*) FROM comment
WHERE date(created / 1000, 'unixepoch') < date('now') GROUP BY day;

INSERT OR IGNORE INTO stat_daily (day, metric, key, value)
SELECT date(created / 1000, 'unixepoch') AS day, 'notes', '', COUNT(*) FROM note
WHERE date(created / 1000, 'unixepoch') < date('now') GROUP BY day;

INSERT OR IGNORE INTO stat_daily (day, metric, key, value)
SELECT date(created / 1000, 'unixepoch') AS day, 'reports', '', COUNT(*) FROM report
WHERE date(created / 1000, 'unixepoch') < date('now') GROUP BY day;

INSERT OR IGNORE INTO stat_daily (day, metric, key, value)
SELECT day, 'views', '', COUNT(*) FROM pub_view WHERE day < date('now') GROUP BY day;
