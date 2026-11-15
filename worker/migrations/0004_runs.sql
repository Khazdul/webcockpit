-- Runs in the cloud (spec §7.5, ADR 0153; stage 63): what the Worker knows
-- of the account's run bodies in R2, the account's run bytes, and the R2
-- prefixes of deleted accounts still to be emptied. Adds two tables and a
-- column with a default, so the Worker still running (which knows none of
-- them) is not disturbed.
--
-- Times are milliseconds since the epoch (UTC).

-- A run body: an encrypted blob in R2 under `u/<account>/<id>` (`id` the
-- `run` item's server id). `size` is the stored object's bytes, `created`
-- the time of its last write (a replace moves it), which is what a client
-- reads when it drops a body no live `run` item names (ADR 0153).
CREATE TABLE run_body (
  account TEXT    NOT NULL,
  id      TEXT    NOT NULL,
  size    INTEGER NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (account, id)
) WITHOUT ROWID;

-- The bytes of the account's run bodies, kept with every write: room is
-- reserved here before a body goes to R2 (worker/runs.ts), and given back
-- when it does not get there.
ALTER TABLE account ADD COLUMN run_bytes INTEGER NOT NULL DEFAULT 0;

-- A deleted account's R2 prefix (`u/<account>/`). Delete account writes the
-- row in its transaction and empties the prefix at once; the daily cron
-- empties it again a while later (an upload that raced the delete, or an
-- R2 failure half-way) and only then removes the row.
CREATE TABLE r2_sweep (
  prefix TEXT    NOT NULL PRIMARY KEY,
  at     INTEGER NOT NULL
) WITHOUT ROWID;
