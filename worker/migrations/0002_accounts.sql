-- Accounts (spec §7.2, §7.10 and §7.11, ADR 0145): the account, the names
-- of deleted accounts, the sessions and the attempt counters. Adds tables
-- only, so the Worker still running is not disturbed.
--
-- Times are milliseconds since the epoch (UTC). Binary values (salt,
-- hashes, wraps, ids) are base64url text without padding. The server never
-- holds a password, a key that opens data, or an address: `auth_hash` and
-- `recovery_hash` are SHA-256 of keys the browser derived, the wraps are
-- the root key encrypted in the browser (worker/auth.ts).

-- `id` is random (128 bits): it will name the account's objects in R2
-- (stage 63), and a deleted account's id must never come back.
-- `name` is as typed, `name_key` its lowercase: the UNIQUE index is what
-- makes two registrations of one name race-safe.
-- `kdf`, `limits` and `prefs` are JSON; `limits` NULL means the defaults.
-- `gallery_seen` and `seq` are for stages 65 and 61.
CREATE TABLE account (
  id            TEXT    NOT NULL PRIMARY KEY,
  name          TEXT    NOT NULL,
  name_key      TEXT    NOT NULL UNIQUE,
  created       INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL,
  state         TEXT    NOT NULL DEFAULT 'active',
  salt          TEXT    NOT NULL,
  kdf           TEXT    NOT NULL,
  auth_hash     TEXT    NOT NULL,
  recovery_hash TEXT    NOT NULL,
  wrap_pw       TEXT    NOT NULL,
  wrap_rc       TEXT    NOT NULL,
  limits        TEXT,
  prefs         TEXT    NOT NULL DEFAULT '{}',
  gallery_seen  INTEGER NOT NULL DEFAULT 0,
  seq           INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

-- The names of deleted accounts: never given out again.
CREATE TABLE reserved_name (
  name_key TEXT NOT NULL PRIMARY KEY
) WITHOUT ROWID;

-- A session: `id_hash` is SHA-256 of the cookie's token, `id` a public
-- random id the Account page names a session by. `last_used` and `expires`
-- move at most once a day (an ordinary request writes nothing).
CREATE TABLE session (
  id_hash   TEXT    NOT NULL PRIMARY KEY,
  id        TEXT    NOT NULL,
  account   TEXT    NOT NULL,
  label     TEXT    NOT NULL,
  created   INTEGER NOT NULL,
  last_used INTEGER NOT NULL,
  expires   INTEGER NOT NULL
) WITHOUT ROWID;

-- An account's sessions: the Account page's list, "end the others", and
-- the removal of all of them at recovery and deletion.
CREATE INDEX session_account ON session (account);

-- Counters of worker/attempts.ts. `key` is a kind and an HMAC (of a name
-- or of an address with the day's pepper), never a name or an address
-- itself. `start` is when the counter's window began, `count` the tries
-- in it, `until` the end of a lock (0: none).
CREATE TABLE attempt (
  key   TEXT    NOT NULL PRIMARY KEY,
  start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  until INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
