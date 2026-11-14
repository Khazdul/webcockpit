-- Usage statistics (spec §7.6 and §7.11, ADR 0147) and the server flags
-- (ADR 0147, addendum of 2026-11-14).
--
-- Write budget: every row an index holds is a row written, so the tables
-- have their primary key as the only index (WITHOUT ROWID where the key
-- is not an integer) and no secondary indexes. An ordinary beat is one
-- UPSERT of one `presence` row; a device's first beat of a UTC day also
-- inserts one `device_day` row (worker/stats.ts). Times are milliseconds
-- since the epoch, days are 'YYYY-MM-DD', both UTC.

-- One row per device, upserted by every beat. The counters serve the play
-- minutes of the daily roll-up and the admin page's estimate of the day's
-- use: `beats` and `play_beats` count the beats of `day` (the UTC day of
-- `last_seen`); a device's first beat of a new day moves them to the
-- `prev_*` columns, so the roll-up at 00:10 still finds yesterday's counts
-- of a device that has beaten again after midnight.
-- Online now is a scan of this table (last_seen within 6 minutes) by the
-- 5-minute cron and the admin page: an index on last_seen would cost every
-- beat a second row written.
CREATE TABLE presence (
  device          TEXT    NOT NULL PRIMARY KEY,
  first_seen      INTEGER NOT NULL,
  last_seen       INTEGER NOT NULL,
  state           TEXT    NOT NULL,
  type            TEXT    NOT NULL,
  browser         TEXT    NOT NULL,
  version         TEXT    NOT NULL,
  day             TEXT    NOT NULL,
  beats           INTEGER NOT NULL,
  play_beats      INTEGER NOT NULL,
  prev_day        TEXT,
  prev_beats      INTEGER NOT NULL DEFAULT 0,
  prev_play_beats INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

-- The days a device was seen: daily, weekly and monthly unique devices.
-- Keyed by day first, so a day or a range of days is a range of the key.
CREATE TABLE device_day (
  day    TEXT NOT NULL,
  device TEXT NOT NULL,
  PRIMARY KEY (day, device)
) WITHOUT ROWID;

-- The 5-minute samples of online now (cron): the day's peak, and the
-- public count.
CREATE TABLE stat_sample (
  ts      INTEGER NOT NULL PRIMARY KEY,
  online  INTEGER NOT NULL,
  playing INTEGER NOT NULL
);

-- The daily roll-up, kept for good: one row per day, metric and key (''
-- for a plain number; the device type, browser or version for a split).
CREATE TABLE stat_daily (
  day    TEXT    NOT NULL,
  metric TEXT    NOT NULL,
  key    TEXT    NOT NULL,
  value  INTEGER NOT NULL,
  PRIMARY KEY (day, metric, key)
) WITHOUT ROWID;

-- Server flags set from the admin page; a row overrides the Worker's
-- `FLAG_<NAME>` var. value is 0 or 1.
CREATE TABLE flag (
  name  TEXT    NOT NULL PRIMARY KEY,
  value INTEGER NOT NULL
) WITHOUT ROWID;
