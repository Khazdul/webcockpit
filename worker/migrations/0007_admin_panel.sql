-- The admin panel (spec §7.9, ADR 0157; stage 66): the audit log's seal
-- and the triggers that keep it append-only, the default limits edited
-- from /admin (owner's pick 4b), and a backfill of the roll-up's new
-- metrics. Additive for the reads and writes of the 0.14.0 Worker still
-- running, except its admin_log inserts (no seal): from this migration on
-- every entry must be sealed, so an admin action of the old Worker in the
-- seconds before the new one is deployed fails whole (nothing applied) and
-- can be done again (review fix S2, ADR 0157).
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

-- Where the chain starts (review fix S2): the highest id of an entry
-- written before this migration (0 for none). Those entries are the only
-- ones that may be unsealed; any later entry without a seal is a broken
-- chain, so removing every seal from the console reads broken, not intact.
-- One row, written here once: the database refuses a second, a change and
-- a removal, as for admin_log.
CREATE TABLE admin_log_meta (
  legacy_max INTEGER NOT NULL
);

INSERT INTO admin_log_meta (legacy_max) SELECT COALESCE(MAX(id), 0) FROM admin_log;

CREATE TRIGGER admin_log_meta_one BEFORE INSERT ON admin_log_meta
WHEN (SELECT COUNT(*) FROM admin_log_meta) > 0
BEGIN
  SELECT RAISE(ABORT, 'admin_log_append_only');
END;

CREATE TRIGGER admin_log_meta_no_update BEFORE UPDATE ON admin_log_meta
BEGIN
  SELECT RAISE(ABORT, 'admin_log_append_only');
END;

CREATE TRIGGER admin_log_meta_no_delete BEFORE DELETE ON admin_log_meta
BEGIN
  SELECT RAISE(ABORT, 'admin_log_append_only');
END;

-- An entry goes only at the end of the chain: it is sealed, and its `prev`
-- is the newest entry's `mac` (NULL for the first sealed entry, after the
-- unsealed ones of before). Two actions racing: the later batch rolls back
-- and the Worker tries again with the new head.
CREATE TRIGGER admin_log_chain BEFORE INSERT ON admin_log
WHEN NEW.mac IS NULL
  OR NEW.prev IS NOT (SELECT mac FROM admin_log ORDER BY id DESC LIMIT 1)
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
-- worker/stats.ts). Deleted rows are gone, so the past is a floor. The
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
