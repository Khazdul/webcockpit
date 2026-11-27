-- Looks (stage 80): the own images' budget of their own (part D, ADR 0172)
-- and the directory of shared looks (part E, spec §7.14). One migration
-- for both, so staging and production get one. Two columns with a default
-- and a new table, so the Worker still running (which knows none of them)
-- is not disturbed.
--
-- Times are milliseconds since the epoch (UTC).

-- Live own images (items of kind `lookImage`) and their blobs' bytes, kept
-- by worker/sync.ts with every write as `item_count` and `item_bytes` are
-- for the other kinds; own images count against these only (the limits
-- `lookImages`, `lookBytes`; one blob at most `lookImageMaxBytes`).
-- Tombstones count against neither.
ALTER TABLE account ADD COLUMN look_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE account ADD COLUMN look_bytes INTEGER NOT NULL DEFAULT 0;

-- The directory (part E): one row per character name, what a client
-- reported for it. No free text: every field is a known kind or a library
-- id, checked by the Worker.
--
--   name     the character's name in lower case, as MUME writes it (2–20 letters)
--   race     a race kind of src/gmcp/race.ts, or NULL
--   subrace  a subrace kind of src/gmcp/race.ts, or NULL
--   sex      'male' | 'female' | NULL
--   token    a library id (public/tokens/tokens.json), or NULL: an
--            automatic look or an own image (an own image is never sent)
--   owner    HMAC(AUTH_PEPPER, "wc-look|a|" + account id) logged in, or
--            HMAC(AUTH_PEPPER, "wc-look|d|" + look key) logged out,
--            base64url; the first reporter owns a name
--   updated  the last report's time; a row not refreshed for 180 days is
--            removed by the daily cron
CREATE TABLE look_dir (
  name    TEXT    NOT NULL PRIMARY KEY,
  race    TEXT,
  subrace TEXT,
  sex     TEXT,
  token   TEXT,
  owner   TEXT    NOT NULL,
  updated INTEGER NOT NULL
) WITHOUT ROWID;

-- An owner's rows (its 20 names at most, the DELETE of a switch turned off
-- or a login's take-over, an account's deletion).
CREATE INDEX look_dir_owner ON look_dir (owner);
-- The cron's pruning of rows not refreshed for 180 days.
CREATE INDEX look_dir_updated ON look_dir (updated);
