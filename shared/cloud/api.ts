// Request and response types of the cloud API (spec §7.1), used by the
// Worker (worker/) and by the client (src/cloud/). Types and constants
// only: nothing here may import from either side.

/** Errors are `{ error: "<code>" }` with a fitting status. */
export interface ApiError {
  error: string;
}

/**
 * Server flags that open cloud features (spec §7.0 rule 5). A missing flag is off.
 * Stage 65 (ADR 0155): `gallery` opens listing, the Community page, stars,
 * comments, the counter and the reactions mark; `runes` opens Random Runes
 * (and needs `gallery`: the board lives on its page).
 */
export type FlagName = 'stats' | 'accounts' | 'sync' | 'runs' | 'share' | 'gallery' | 'runes';

/**
 * `GET /api/config` (cached 60 s). The Worker always sends every field;
 * all but the flags are optional here because the client's reading of the
 * answer is tolerant (an old or a missing server is "no flags").
 */
export interface Config {
  flags: Partial<Record<FlagName, boolean>>;
  /** The Turnstile widget's site key; empty while there is none. */
  turnstileSiteKey?: string;
  /** The default limits of an account (an account's own are in `Account.limits`). */
  limits?: AccountLimits;
  /** Server time (ms), up to the cache's 60 s old. */
  time?: number;
}

/** `GET /api/health` */
export interface Health {
  ok: true;
  version: string;
  commit: string;
}

// --- Usage statistics (spec §7.6, ADR 0147) ---

export const BEAT_STATES = ['menu', 'playing', 'replay'] as const;
export type BeatState = (typeof BEAT_STATES)[number];

export const DEVICE_TYPES = ['desktop', 'tablet', 'phone'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const BROWSERS = ['firefox', 'chrome', 'safari', 'edge', 'samsung', 'other'] as const;
export type Browser = (typeof BROWSERS)[number];

/** Minutes between two beats of a visible page. */
export const BEAT_MINUTES = 5;

/**
 * `POST /api/beat` (JSON, `credentials: 'omit'`, `keepalive`). Answers
 * 204. Nothing else is sent: no names, nothing typed (ADR 0147).
 */
export interface Beat {
  /** A random UUID made once per browser (`localStorage` `wc.device`). */
  device: string;
  /** The client's package version, e.g. `0.9.3`. */
  version: string;
  type: DeviceType;
  browser: Browser;
  state: BeatState;
}

/** `GET /api/stats/public` (cached 60 s). */
export interface PublicStats {
  online: number;
  playing: number;
  /**
   * Stage 65 (ADR 0155, the guests' counter): the `listed_at` (ms) of the
   * `COUNTER_RUNS` newest active listed runs, newest first. Only with the
   * flag `gallery` on (absent otherwise, and from an older Worker).
   * As built (stage 65 B): the answer is also given with `stats` off when
   * `gallery` is on; `online` and `playing` are 0 then.
   */
  listed?: number[];
}

// --- Flags and the admin page (spec §7.9, ADR 0147 and 0148) ---

/** Every server flag, in the order the admin page lists them. */
export const FLAG_NAMES = ['stats', 'accounts', 'sync', 'runs', 'share', 'gallery', 'runes'] as const satisfies readonly FlagName[];

/** How long a device counts as online after its last beat (ADR 0147). */
export const ONLINE_MINUTES = 6;

/** A flag as the admin page sees it: the effective value and where it comes from. */
export interface AdminFlag {
  value: boolean;
  /** The Worker's `FLAG_<NAME>` var (the environment's default). */
  default: boolean;
  /** The D1 `flag` row, or null when the default holds. */
  override: boolean | null;
}

/** `PUT /api/admin/flags/<name>` (`X-WC: 1`, matching `Origin`); answered with the `AdminFlag`. */
export interface AdminFlagPut {
  value: boolean;
}

/** One day as the admin page's table shows it. */
export interface AdminDay {
  day: string;
  devices: number;
  newDevices: number;
  peakOnline: number;
  peakPlaying: number;
  playMinutes: number;
  beats: number;
}

/** A split by device type, browser or version: key → devices. */
export type AdminSplit = Record<string, number>;

/** `GET /api/admin/stats` */
export interface AdminStats {
  /** Server time (ms) the numbers were read at. */
  now: number;
  online: { total: number } & Record<BeatState, number>;
  /** Today (UTC) so far, read live. */
  today: AdminDay;
  /** The last 30 rolled-up days, newest first. */
  days: AdminDay[];
  /** Unique devices of the last 7 and 30 days, today included. */
  weekly: number;
  monthly: number;
  /** The newest rolled-up day's splits, or null before the first roll-up. */
  split: { day: string; type: AdminSplit; browser: AdminSplit; version: AdminSplit } | null;
  /**
   * Today's use against the free plan's daily limits: an estimate from our
   * own counters, not Cloudflare's figures (ADR 0147, addendum).
   */
  usage: {
    requests: number;
    rowsWritten: number;
    rowsRead: number;
    limits: { requests: number; rowsWritten: number; rowsRead: number };
  };
  flags: Record<FlagName, AdminFlag>;
}

// --- Accounts (spec §7.2, §7.10, ADR 0145) ---
//
// Binary values travel as base64url without padding. The server treats
// `authKey`, `recoveryAuth` and the wraps as opaque bytes: it keeps
// SHA-256 of the two keys and the wraps as they came.

/** A user name: 3–20 of `a-z 0-9 _ -`, in any case; unique without regard to case. */
export const NAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
export const NAME_MIN_LENGTH = 3;
export const NAME_MAX_LENGTH = 20;

/** Bytes of a salt: exactly 16 (the client refuses any other length too). */
export const SALT_MIN_BYTES = 16;
export const SALT_MAX_BYTES = 16;
/** Bytes of `authKey` and of `recoveryAuth`. */
export const AUTH_KEY_BYTES = 32;
/** Bytes of a wrapped root key (61 today: version, nonce, ciphertext and tag). */
export const WRAP_MIN_BYTES = 40;
export const WRAP_MAX_BYTES = 200;
/** A session's label ("Firefox on Linux"): printable ASCII, cut to this length. */
export const LABEL_MAX_LENGTH = 40;
/** The longest Turnstile token (Cloudflare's own limit). */
export const TURNSTILE_MAX_LENGTH = 2048;

export const KDF_NAME = 'pbkdf2-sha256';
export const KDF_MIN_ROUNDS = 600_000;
export const KDF_MAX_ROUNDS = 10_000_000;

/** How the password becomes the master key; stored per account. */
export interface Kdf {
  name: typeof KDF_NAME;
  rounds: number;
}

/** What a new account uses (and what the answer for an unknown name says). */
export const DEFAULT_KDF: Kdf = { name: KDF_NAME, rounds: 600_000 };

/** The session cookie (`HttpOnly; Secure; SameSite=Strict; Path=/api/u`). */
export const SESSION_COOKIE = '__Secure-wc_s';
/** A session lasts this long after its last renewal (180 days). */
export const SESSION_SECONDS = 15_552_000;

/** Login: failures per name before Turnstile is asked for, and before the wait. */
export const LOGIN_TURNSTILE_AFTER = 3;
export const LOGIN_LOCK_AFTER = 10;
/** The window the failures are counted in, and the wait after the tenth (15 minutes). */
export const LOGIN_WINDOW_SECONDS = 900;
/** How long the first recover call's ticket lets the second one through (15 minutes). */
export const RECOVER_TICKET_SECONDS = 900;
/** Registrations per address. */
export const REGISTER_PER_HOUR = 3;
export const REGISTER_PER_DAY = 10;

/** The error codes of the account endpoints. */
export const ACCOUNT_ERRORS = [
  'bad_request',
  'forbidden',
  'unauthorized',
  'not_found',
  'method_not_allowed',
  'name_taken',
  'invalid_login',
  'invalid_recovery',
  'turnstile_required',
  'turnstile',
  'locked',
  'rate_limited',
  'unavailable',
  'accounts_not_configured',
] as const;
export type AccountError = (typeof ACCOUNT_ERRORS)[number];

/** 429 `locked`: too many failures for the name; try again in `retryAfter` seconds. */
export interface LockedError {
  error: 'locked';
  retryAfter: number;
}

/**
 * An account's limits (spec §7.10). `items`, `itemBytes` and `runBytes`
 * are the ceilings of the same-named figures of `AccountUsage`.
 */
export interface AccountLimits {
  /** Small items (profiles, scripts, settings…), count. */
  items: number;
  /** All small items together, bytes. */
  itemBytes: number;
  /** One small item, bytes. */
  itemMaxBytes: number;
  /** Run bodies, bytes (published payloads are not counted: ADR 0148 addendum, ADR 0154). The default is the Worker's var `RUN_BYTES_LIMIT` when set (stage 63). */
  runBytes: number;
  /** One run body, bytes. */
  runMaxBytes: number;
  /** One published payload (gzip), bytes. */
  payloadMaxBytes: number;
  /** Published runs (links and listed together), count. */
  sharedRuns: number;
  /** Stage 65 (ADR 0155): comments an account writes in a rolling hour. */
  commentsPerHour: number;
  /** Stage 65: votes an account casts or changes in a rolling hour (counted on the vote's last change). */
  votesPerHour: number;
  /** Stage 65: notes on Random Runes an account writes in a UTC day. */
  notesPerDay: number;
  /** Stage 65: runs an account lists for the first time in a UTC day (listing one again is free). */
  listingsPerDay: number;
}

export const DEFAULT_ACCOUNT_LIMITS: AccountLimits = {
  items: 2000,
  itemBytes: 2 * 1024 * 1024,
  itemMaxBytes: 1024 * 1024,
  runBytes: 50 * 1024 * 1024,
  runMaxBytes: 20 * 1024 * 1024,
  payloadMaxBytes: 5 * 1024 * 1024,
  sharedRuns: 150,
  commentsPerHour: 20,
  votesPerHour: 60,
  notesPerDay: 5,
  listingsPerDay: 10,
};

export interface AccountUsage {
  items: number;
  itemBytes: number;
  runBytes: number;
}

export interface AccountSession {
  /** A public id (not the cookie's token): what `DELETE …/sessions/<id>` takes. */
  id: string;
  label: string;
  created: number;
  /** Renewed at most once a day, so up to a day old. */
  lastUsed: number;
  /** The session this answer was made for. */
  current: boolean;
}

/**
 * Stage 65 (ADR 0155): `galleryNotice` is gone from the contract. As built
 * (stage 65 B): the Worker still sends `galleryNotice: true` beside these
 * keys, because the 0.13 client refuses prefs without it (a cached old
 * client must keep working); a new client must not read it.
 */
export interface AccountPrefs {
  /**
   * The sharing rules were ticked once (ADR 0154); `POST /api/u/pub` answers `403 rules` until then.
   * As built (stage 64 B1): always sent by the Worker (false until ticked); a client reads it as
   * false when an older Worker leaves it out.
   */
  rulesAccepted: boolean;
}

export type AccountState = 'active' | 'suspended';

/** The account as its owner sees it. */
export interface Account {
  /** As typed at registration. */
  name: string;
  created: number;
  state: AccountState;
  usage: AccountUsage;
  limits: AccountLimits;
  /** Newest use first. */
  sessions: AccountSession[];
  prefs: AccountPrefs;
}

/** `GET /api/auth/params?name=`: a stable fake for a name that has no account. */
export interface AuthParams {
  salt: string;
  kdf: Kdf;
}

/** The password's side of an account: what registration, a password change and recovery set. */
export interface PasswordSet {
  salt: string;
  kdf: Kdf;
  authKey: string;
  wrapPw: string;
}

/** `POST /api/auth/register` → 201 `AccountAnswer` and the cookie. */
export interface RegisterRequest extends PasswordSet {
  name: string;
  recoveryAuth: string;
  wrapRc: string;
  label: string;
  turnstile: string;
}

/** `POST /api/auth/login` → `LoginAnswer` and the cookie. */
export interface LoginRequest {
  name: string;
  authKey: string;
  label: string;
  /** Needed after `LOGIN_TURNSTILE_AFTER` failures (403 `turnstile_required` asks for it). */
  turnstile?: string;
}

/** `POST /api/auth/recover`, first call → `RecoverAnswer`. */
export interface RecoverRequest {
  name: string;
  recoveryAuth: string;
  turnstile: string;
}

/** `POST /api/auth/recover`, second call → `AccountAnswer` and the cookie; every older session ended. */
export interface RecoverSetRequest {
  name: string;
  recoveryAuth: string;
  /** What the first call answered. Without a valid one: 401 `invalid_recovery`, and nothing is counted. */
  ticket: string;
  set: PasswordSet;
  label: string;
}

/** `POST /api/u/account/password` → 204; the other sessions ended. */
export interface PasswordRequest {
  /** The current password's key. */
  authKey: string;
  set: PasswordSet;
}

/** `POST /api/u/account/recovery` → 204: a new recovery code. */
export interface RecoveryRequest {
  authKey: string;
  recoveryAuth: string;
  wrapRc: string;
}

/** `DELETE /api/u/account` → 204. */
export interface DeleteAccountRequest {
  authKey: string;
}

/**
 * `PATCH /api/u/account/prefs` → `PrefsAnswer`.
 * As built (stage 64 B1): at least one of the two keys, no others (else
 * `400 bad_request`); `rulesAccepted: false` is `400`; each key is set on
 * its own in the stored prefs, so two changes at once never undo each other.
 * Stage 65: `galleryNotice` (a boolean) is still accepted from an old
 * client and ignored; a body of only it answers the prefs unchanged.
 */
export interface PrefsRequest {
  /** One way: only `true` is accepted (ADR 0154). */
  rulesAccepted?: true;
}

/** What register and the second recover call answer. */
export interface AccountAnswer {
  account: Account;
}

/**
 * What login and `GET /api/u/account` answer: the account and its current
 * password wrap (useless without the password; the device keeps only keys
 * it cannot export, so a password change or a new recovery code needs it
 * again).
 */
export interface LoginAnswer extends AccountAnswer {
  wrapPw: string;
}

export interface RecoverAnswer {
  wrapRc: string;
  /** Opaque; lets the second call through for `RECOVER_TICKET_SECONDS`. */
  ticket: string;
}

export interface PrefsAnswer {
  prefs: AccountPrefs;
}

/** `DELETE /api/u/account/sessions/<id>`: this id ends every session but the asking one. */
export const OTHER_SESSIONS = 'others';

// --- Sync (spec §7.4, ADR 0146 and its addendum; stage 61) ---
//
// The contract between the Worker (stage 61 part B2) and the client's
// sync engine (B3). Bodies are encrypted blobs (`application/octet-stream`,
// ADR 0145's blob format); the server never reads them.

/**
 * The kinds of item. Stage 61 opened `profile` and `script`; stage 62
 * (ADR 0152) `settings` (one per device type), `scriptData` (per script
 * name), `comm` (per UTC day, gzipped before it is sealed) and `timers`
 * (per character). Stage 63 (ADR 0153) `run` and `exportDoc`, open only
 * while the flag `runs` is on (off: `kind_closed`). The server reads none
 * of them: the limits and the endpoints are the same for every kind.
 */
export const SYNC_KINDS = ['profile', 'script', 'scriptData', 'settings', 'run', 'exportDoc', 'comm', 'timers'] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];
/**
 * The kinds the server accepts whatever the flags. With the flag `runs` on
 * it accepts `run` and `exportDoc` as well (worker/sync.ts `openKinds`).
 */
export const SYNC_KINDS_OPEN: readonly SyncKind[] = ['profile', 'script', 'settings', 'scriptData', 'comm', 'timers'];

/** An item id: the opaque id of ADR 0145 (base64url of 16 bytes, 22 characters). */
export const SYNC_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** One item in `GET /api/u/sync/changes`. */
export interface SyncItem {
  kind: SyncKind;
  id: string;
  /** The item's version: 1 for the first write, +1 on every write and on the delete. */
  rev: number;
  /** The account's change counter at this write (the cursor's unit). */
  seq: number;
  /** A tombstone: no blob. */
  deleted: boolean;
  /** The blob's size in bytes (0 for a tombstone). */
  size: number;
  /** Server time of the write, ms. */
  updated: number;
  /** The blob, base64url; absent for a tombstone. */
  blob?: string;
}

/** Storage in use, as the server counts it. */
export interface SyncUsage {
  items: number;
  itemBytes: number;
  /** Run bodies stored (and reserved by a PUT in flight), bytes (stage 63; absent from a Worker before it). */
  runBytes?: number;
}

/**
 * `GET /api/u/sync/changes?since=<seq>&limit=<n>`: the items written after
 * `since`, oldest first, at most `limit` (default and max 500). `more`:
 * call again with `since = cursor`.
 */
export interface SyncChanges {
  items: SyncItem[];
  /** The highest `seq` in `items`, or `since` when there are none. */
  cursor: number;
  more: boolean;
  usage: SyncUsage;
  limits: AccountLimits;
}

/**
 * `PUT /api/u/sync/items/<kind>/<id>`: body = the blob. Header
 * `If-Match: <rev>`, the rev the change is based on; `0` for a new item.
 * `200` → `SyncWritten`. `409` → `SyncConflict`. `413` → `{error:
 * "item_too_large" | "storage_full" | "too_many_items"}`.
 *
 * `DELETE /api/u/sync/items/<kind>/<id>`, `If-Match: <rev>`: writes a
 * tombstone; `200` → `SyncWritten`, `409` → `SyncConflict`. A delete on a
 * tombstone's own rev writes nothing and answers its rev and seq.
 *
 * Both (as built, stage 61 B2): no `If-Match` → `428 if_match_required`;
 * a base rev > 0 for an item the account does not have, or a delete of
 * one it never had → `409` with a tombstone of rev 0 as `current`
 * (stage 61 C); a conflict is answered before a `413`; a kind not open yet → `403
 * kind_closed`; an unknown kind, an id not of `SYNC_ID_PATTERN`, an
 * If-Match that is not a whole number, a PUT body that is empty or not
 * `application/octet-stream` → `400 bad_request`. The flag `sync` off →
 * `404 not_found`. Tombstones count against neither `items` nor
 * `itemBytes`; a write that does not grow the usage is never refused.
 * `changes` also stops before its blobs pass 4 MB (at least one item).
 */
export interface SyncWritten {
  rev: number;
  seq: number;
  usage: SyncUsage;
}

/** `409`: the current item (a tombstone too), so the client can resolve without a pull. */
export interface SyncConflict {
  error: 'conflict';
  current: SyncItem;
}

/**
 * Why a session ended, sent with `401 {error: "session_ended", reason}`
 * on any `/api/u/` request on that session (ADR 0145 addendum, stage 61).
 * A cookie the server never knew (or none) answers `401 {error: "unauthorized"}`,
 * as every `/api/u/` request without a live session did before.
 */
export const SESSION_END_REASONS = ['logout', 'password', 'recovered', 'ended', 'expired', 'deleted'] as const;
export type SessionEndReason = (typeof SESSION_END_REASONS)[number];
export interface SessionEnded {
  error: 'session_ended';
  reason: SessionEndReason;
}

// --- Runs in the cloud (stage 63, spec §7.5, ADR 0153) ---
//
// A run body is an encrypted, segmented blob (`encryptBody` of
// src/cloud/crypto/segments.ts, kind "run", the item's server id), kept in
// R2 under `u/<account id>/<id>`. The meta is the sync item of kind `run`
// with the same id, pushed only once the body is stored. Behind the flag
// `runs`: off, every path below answers `404 not_found`.

/**
 * `PUT /api/u/runs/<id>` (`<id>` of `SYNC_ID_PATTERN`): body = the blob,
 * `application/octet-stream`, `Content-Length` required (`411
 * length_required`), `X-WC: 1`. Replaces a body of the same id.
 * `200` → `RunBodyWritten`. `413` → `RunTooLarge` (over `runMaxBytes`) or
 * `RunQuota` (the account's run bodies would pass `runBytes`). The room is
 * reserved before the body is stored, so two parallel PUTs never pass the
 * limit together. A PUT that does not grow the usage is never refused.
 *
 * `GET /api/u/runs/<id>`: the blob (`Content-Length` set), `404
 * not_found` when there is none.
 *
 * `DELETE /api/u/runs/<id>` (`X-WC: 1`): removes it; `200` →
 * `RunBodyWritten` (also when there was none).
 *
 * `GET /api/u/runs`: `RunBodyList`, every body of the account.
 *
 * As built (stage 63 B1): an id not of `SYNC_ID_PATTERN`, a PUT that is
 * not `application/octet-stream`, a `Content-Length` that is not a whole
 * number or is 0 → `400 bad_request`; `run_too_large` is answered before
 * `quota`; a body that does not reach R2 whole (R2 down, a body shorter
 * or longer than its `Content-Length`) → `503 unavailable`, the room given
 * back and an old body of the id kept as it was; the account deleted
 * while the body was uploaded → `401`. A DELETE that R2 fails changes
 * nothing (`503`). `RunBodyWritten.size` of a DELETE is 0. HEAD is GET
 * without the body. The session, `X-WC` and `Origin` rules are those of
 * the sync endpoints.
 */
export interface RunBodyWritten {
  size: number;
  usage: SyncUsage;
}

export interface RunTooLarge {
  error: 'run_too_large';
  limit: number;
}

/** No room: `used` and `limit` are the account's run bytes and its `runBytes`. */
export interface RunQuota {
  error: 'quota';
  used: number;
  limit: number;
  /** The size of the body that was refused. */
  size: number;
}

export interface RunBodyList {
  /** Oldest first; `created` is the time of the body's last write (a replace moves it). */
  bodies: Array<{ id: string; size: number; created: number }>;
  usage: SyncUsage;
  limits: AccountLimits;
}

/** The header line of a run body's plaintext (ADR 0153, "The body"). */
export const RUN_BODY_TYPE = 'webcockpit-run-body';
export const RUN_BODY_VERSION = 1;

// --- Share links (stage 64, spec §7.7, §7.9, ADR 0148, ADR 0154) ---
//
// A published run is a copy of its own: the export editor's
// `ReplayPayload` (schema 1) as gzip JSON, unencrypted, in R2 under
// `pub/<id>`, and a `publication` row. Behind the flag `share`: off, every
// path below answers `404 not_found`. The Worker never decompresses a
// payload; the watch page treats it as hostile (ADR 0154).

/** A publication's id: 12 random characters. */
export const PUB_ID_PATTERN = /^[A-Za-z0-9]{12}$/;
export const PUB_TITLE_MAX = 100;
export const PUB_DESCRIPTION_MAX = 500;
export const REPORT_TEXT_MAX = 500;
export const REPORTS_PER_DAY = 30;
/** Reports from this many different accounts hide an item until the admin has looked. */
export const REPORTS_TO_HIDE = 5;

/** The meta the client sends with a payload. */
export interface PubMetaIn {
  /** 1–`PUB_TITLE_MAX` characters, no control characters. */
  title: string;
  /** 0–`PUB_DESCRIPTION_MAX` characters; `\n` is the only control character allowed. */
  description: string;
  character: string;
  level?: number;
  /** The cut's played length, whole seconds (review fix CR4: a fraction is `400`). */
  lengthS: number;
  /**
   * Hall of Fame (stage 65, ADR 0155): `true` lists the run in the Community
   * (only with the flag `gallery` on, else `400 bad_request`). The first
   * listing of a run sets its `listedAt`; at most `listingsPerDay` first
   * listings per account and UTC day (`429 too_many`, held in the insert).
   */
  listed: boolean;
  /**
   * The share dialog's idempotency key (review fix CR3), `PUB_KEY_PATTERN`,
   * drawn once per dialog: a POST whose key already made a run of this
   * account answers `200` with that run (also at the limit) instead of
   * making another; `503 unavailable` while that run's upload is still
   * running. A removed run's key is free again. Optional: a POST without
   * one always makes a new run.
   */
  key?: string;
}

/** `PubMetaIn.key`: 16–32 characters of `[A-Za-z0-9_-]`. */
export const PUB_KEY_PATTERN = /^[A-Za-z0-9_-]{16,32}$/;

/**
 * `POST /api/u/pub` (`X-WC: 1`, `application/octet-stream`,
 * `Content-Length` required): the body is a 4-byte big-endian length of
 * the meta's UTF-8 JSON (`PubMetaIn`), that JSON, then the payload's gzip
 * bytes. `200` → `PubWritten`. `400 bad_request` (meta, not gzip), `403
 * suspended`, `403 rules` (not ticked), `413 payload_too_large`
 * (`PayloadTooLarge`), `413 pub_quota` (`PubQuota`). The count is
 * reserved before R2, so two parallel posts never pass `sharedRuns`.
 *
 * As built (stage 64 B1): no `Content-Length` → `411 length_required`; a
 * type other than `application/octet-stream`, a length that is not a whole
 * number, a meta length of 0 or past `PUB_META_MAX_BYTES` or the body, meta
 * that is not UTF-8 JSON of exactly the `PubMetaIn` keys, a payload that
 * does not start with the gzip magic `1f 8b` → `400 bad_request`. The
 * order: 411/400 for the framing, `403 suspended`, `403 rules`, `413
 * payload_too_large` (also from the declared length alone, before anything
 * is read), 400 for the meta and the magic, `413 pub_quota`. The text rules
 * of `PubMetaIn` and `PubPatch`: NFC, no C0/C1 control characters, no lone
 * surrogates, no bidi embeddings, overrides or isolates (U+202A–U+202E,
 * U+2066–U+2069); `\n` only in a description; lengths in code points;
 * `title` and `character` must already be trimmed. `character` 0–40,
 * `level` a whole number 0–1000, `lengthS` 0–31 days. A payload that does
 * not reach R2 whole (R2 down, a body shorter than its length) → `503
 * unavailable` with the count given back; the account deleted meanwhile →
 * `401`. A published run does not change `AccountUsage`.
 */
export interface PubWritten {
  pub: MyPub;
}

export interface PayloadTooLarge {
  error: 'payload_too_large';
  limit: number;
}

export interface PubQuota {
  error: 'pub_quota';
  limit: number;
}

export type PubState = 'active' | 'hidden';

/** The longest meta JSON a `POST /api/u/pub` may carry, bytes (as built, stage 64 B1). */
export const PUB_META_MAX_BYTES = 8192;

/**
 * One of the account's published runs (`GET /api/u/pub` → `{pubs: MyPub[]}`, newest first).
 * As built (stage 64 B1): the list has the active and hidden runs, never a removed one.
 */
export interface MyPub {
  id: string;
  title: string;
  description: string;
  character: string;
  level?: number;
  lengthS: number;
  listed: boolean;
  state: PubState;
  created: number;
  updated: number;
  views: number;
  /** The payload, bytes. */
  bytes: number;
  /** Stage 65: the first time the run was listed (ms); absent when it never was. */
  listedAt?: number;
  /** Stage 65: every live vote (always sent by a stage 65 Worker; absent from an older one). */
  stars?: Stars;
  /** Stage 65: visible comments (always sent by a stage 65 Worker). */
  comments?: number;
  /**
   * Stage 65: votes changed and comments written by other accounts after
   * the account's `reactions` seen time (`POST /api/u/community/seen`):
   * what is new on this run. Each capped at `NEWS_MAX`.
   */
  news?: { votes: number; comments: number };
}

/**
 * `PATCH /api/u/pub/<id>` (`X-WC: 1`) → `PubWritten`.
 * Stage 65: `listed` lists (`true`, flag `gallery` on, else `400`) or unlists
 * (`false`) the run; a first listing counts against `listingsPerDay` (`429
 * too_many`); listing again keeps the first `listedAt`.
 * Review fix S7: a hidden run → `403 hidden` (its words stay what was reported).
 * As built (stage 64 B1): at least one key, no others;
 * the text rules of `POST`; `403 suspended`; another account's run, a
 * removed one or an unknown id → `404`. `updated` moves.
 */
export interface PubPatch {
  title?: string;
  description?: string;
  listed?: boolean;
}

/**
 * `DELETE /api/u/pub/<id>` (`X-WC: 1`) → 204; the link then answers `410 gone`.
 * As built (stage 64 B1): a suspended account may remove; the row becomes
 * a tombstone without text and the count goes back in one transaction,
 * then the object is deleted (an R2 failure is left to the daily cron, the
 * answer is still 204); its open reports are marked handled; a DELETE of
 * one's own tombstone is 204 again; another account's run → `404`.
 *
 * As built (stage 64 B1), the sender's own view: the session cookie's path
 * is `/api/u`, so `GET /api/pub/<id>` never knows who asks. The sender asks
 * `GET /api/u/pub/<id>` (→ `PubMeta`, with `hidden: true` for a hidden run)
 * and `GET /api/u/pub/<id>/payload` (the bytes, `no-store`) instead; both
 * `404` for another account's run or a removed one.
 */

/**
 * `GET /api/pub/<id>` (public): `PubMeta`. `404 not_found`, `410 gone`
 * (removed), `451 hidden` (`{error: 'hidden'}`; the owner's session gets
 * the meta with `hidden: true`).
 * `GET /api/pub/<id>/payload`: the stored bytes, `application/octet-stream`,
 * `Cache-Control: private, max-age=604800, immutable`; the same state
 * answers.
 *
 * As built (stage 64 B1): an id not of `PUB_ID_PATTERN`, or a run whose
 * upload has not finished → `404`; the payload also has `Content-Length`,
 * `X-Content-Type-Options: nosniff` and `Content-Disposition: attachment`,
 * and no CORS headers; HEAD is GET without the body; a wrong method →
 * `405`; `API_LIMITER` keys the public paths by address (`429
 * rate_limited`); the meta is `no-store`.
 */
export interface PubMeta {
  id: string;
  title: string;
  description: string;
  /** The sender's account name. */
  sender: string;
  character: string;
  level?: number;
  lengthS: number;
  created: number;
  views: number;
  bytes: number;
  /** Only for the sender of a hidden run. */
  hidden?: true;
  /** Stage 65, only with the flag `gallery` on: listed in the Community. */
  listed?: boolean;
  /** Stage 65, only with `gallery` on: every live vote. */
  stars?: Stars;
  /** Stage 65, only with `gallery` on: visible comments. */
  comments?: number;
}

/**
 * `POST /api/pub/<id>/view` → 204: counted once per device and UTC day.
 * Stage 65 (ADR 0155): and once per hashed address (an IPv6 /64 is one)
 * and UTC day: a view counts only when neither has viewed the run that day.
 * As built (stage 64 B1): no session; `device` is a lowercase
 * UUID (`400 bad_request` otherwise); the states answer as the meta does
 * and count nothing; `BEAT_LIMITER` and `API_LIMITER` key it by address.
 * Review fix S5: `Content-Type: application/json`, `X-WC: 1` and the site's
 * own `Origin` are required (`403 forbidden` otherwise), so another site's
 * page cannot count views with a simple POST.
 */
export interface PubView {
  /** The usage statistics' device id (ADR 0147). */
  device: string;
}

export const REPORT_KINDS = ['run', 'comment', 'note'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
/** Stage 65 opens all three (stage 64 accepted only `run`). */
export const REPORT_KINDS_OPEN: readonly ReportKind[] = ['run', 'comment', 'note'];
export const REPORT_REASONS = ['harassment', 'real_life', 'rules', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * `POST /api/u/report` (`X-WC: 1`) → 204. `409 already_reported`, `429
 * too_many` (`REPORTS_PER_DAY`), `403 suspended`, `403 own` (one's own run),
 * `404 not_found`.
 *
 * Stage 65: `comment` (a comment's id) and `note` (a note's id) as a run;
 * one's own comment or note is `403 own`; a removed one `404`; the flag
 * `gallery` off → `comment` is `400 kind_closed`, `runes` off → `note` too.
 * As built (stage 64 B1): a bad
 * body (an unknown reason, a `text` over `REPORT_TEXT_MAX` or with control
 * characters but `\n`, other keys) → `400 bad_request`; a target that is
 * not an id, unknown, still uploading or removed → `404`; a hidden run can
 * still be reported. The 30 count per UTC day (not a rolling 24 hours) and
 * are held in the insert itself, so parallel reports never pass them; the
 * fifth account's report hides the run in the same transaction.
 */
export interface ReportRequest {
  kind: ReportKind;
  target: string;
  reason: ReportReason;
  text?: string;
}

// The admin's side (behind Access, `X-WC: 1` and a matching `Origin` on writes).

/**
 * `GET /api/admin/reports`: open reports, one entry per item, most reports first.
 * As built (stage 64 B1): only items that are still active or hidden (at
 * most 200, ties by the newest report); `pubs.count` and `pubs.bytes` are
 * the active and hidden runs, `pubs.today` the runs made since midnight
 * UTC (removed ones too). The moderation endpoints are not behind the flag
 * `share`: the admin can clean up with it off.
 */
export interface AdminReports {
  items: AdminReportItem[];
  /** Published runs in total. */
  pubs: { count: number; bytes: number; today: number };
  /**
   * Stage 65 C4: the community's totals for the admin page, read from
   * columns already kept (no scan of the vote or comment rows): `listed`
   * the active listed runs, `comments` and `votes` the sums of
   * `comment_count` (visible comments) and `vote_count` (live votes) over
   * the active and hidden runs, `notes` the active notes on Random Runes.
   */
  community?: { listed: number; comments: number; notes: number; votes: number };
}

export interface AdminReportItem {
  kind: ReportKind;
  target: string;
  /** A run's title; for a comment its run's title; '' for a note. */
  title: string;
  /** A run's sender; the writer of a comment or a note ('' when the account is gone). */
  sender: string;
  /** The item's state (a comment's and a note's are `active` or `hidden` too). */
  state: PubState;
  /** Stage 65: the reported comment's or note's text, in full. */
  content?: string;
  /** Stage 65: a comment's run (its id). */
  pub?: string;
  reasons: Partial<Record<ReportReason, number>>;
  /** Different accounts. */
  reporters: number;
  newest: number;
  /** The newest report's text, if any. */
  text?: string;
  /** A hidden run's why (review fixes): `reports` (five accounts) or `admin` (the admin's Hide). */
  hiddenReason?: 'reports' | 'admin';
}

/**
 * Review fixes (S3, CR6): `dismiss` marks the run's reports handled and the
 * run reviewed without changing its state (a hidden run stays hidden);
 * `restore` shows it and marks it reviewed. A reviewed run is never hidden
 * by reports again (they still queue). The five that hide count only
 * reporters whose account still exists and is not suspended.
 */
export const ADMIN_PUB_ACTIONS = ['hide', 'restore', 'dismiss', 'delete'] as const;
/** Stage 66 (ADR 0157): `end-sessions` ends every session of the account (reason `ended`). */
export const ADMIN_ACCOUNT_ACTIONS = ['suspend', 'restore', 'delete', 'end-sessions'] as const;
/**
 * Stage 65: the actions on a comment and on a note, with a run's meaning:
 * `hide` (by the admin), `restore` (shown and reviewed), `dismiss` (reports
 * handled, reviewed, state kept), `delete` (the row goes).
 */
export const ADMIN_ITEM_ACTIONS = ['hide', 'restore', 'dismiss', 'delete'] as const;

/**
 * `POST /api/admin/pub/<id>` → 204. Marks the item's reports handled; writes `admin_log`.
 * As built (stage 64 B1): `note` is text of at most `REPORT_TEXT_MAX`; an
 * unknown action or key → `400`; an unknown run `404`, a removed one
 * `410`. `delete` is the sender's DELETE (a tombstone, the count back, the
 * object). `GET /api/admin/pub/<id>` (→ `PubMeta`, `hidden: true` for a
 * hidden run) and `GET /api/admin/pub/<id>/payload` (the bytes, `no-store`)
 * answer for active and hidden runs. The log's `action` is `pub.<action>`
 * or `account.<action>`, its `target` the run's id or the account's name.
 */
export interface AdminPubAction {
  action: (typeof ADMIN_PUB_ACTIONS)[number];
  note?: string;
}

/**
 * Stage 65: `suspend` also takes the account's votes out of both sums of
 * every run it voted on; `restore` puts them back (each only on a change of
 * state, so a repeat does nothing).
 *
 * `POST /api/admin/account/<name>` → 204. `delete` needs `confirm` equal to the name.
 * As built (stage 64 B1): the name in any case; `confirm` compared without
 * regard to case (missing or another → `400 confirm_required`); an unknown
 * account `404`. `delete` is the player's Delete account (the same
 * transaction: items, run bodies, published runs to tombstones, sessions
 * ended with the reason `deleted`, the name reserved), `409 conflict` when
 * the account's password changed between the read and the delete (nothing
 * done). `suspend` and `restore` set `Account.state`; no reports are marked
 * handled by them. Stage 65: `delete` (and the player's own) also deletes
 * the account's votes (both sums of their runs adjusted, unless the
 * account was suspended: then they are out already), its comments
 * (`comment_count` adjusted) and its notes, and marks the reports on them
 * handled.
 */
export interface AdminAccountAction {
  action: (typeof ADMIN_ACCOUNT_ACTIONS)[number];
  confirm?: string;
  note?: string;
}

/** `GET /api/admin/log` → `{entries: AdminLogEntry[]}`, newest 100. */
export interface AdminLogEntry {
  ts: number;
  action: string;
  target: string;
  note: string;
}

// --- The community (stage 65, spec §7.8, ADR 0155) ---
//
// Hall of Fame (listed runs), the Community page's list and boxes, stars,
// comments, the counters and Random Runes. Behind the flag `gallery`
// (Random Runes behind `runes` as well): off, every path below answers
// `404 not_found`. Common answers of the `/api/u/` paths: `401` without a
// live session, `403 forbidden` without `X-WC: 1` and the site's own
// `Origin` on a write, `403 suspended` on a write that adds something
// (a vote, a comment, a note) from a suspended account. The public paths
// (`/api/gallery`, `/api/community`, `/api/runes`, `/api/pub/<id>/comments`)
// need no session; `API_LIMITER` keys them by address (`429 rate_limited`).
// Times are ms.

/** Free public text (comments, notes): what `shared/cloud/text.ts` `isPublicText` checks. */
export const COMMENT_MAX = 1000;
/** Line breaks a comment may have. */
export const COMMENT_NEWLINES_MAX = 20;
/** A note's longest text (owner, round 13: 250, was 500). */
export const NOTE_MAX = 250;
/** Visible comments a run can have (`409 full`). */
export const COMMENTS_PER_RUN = 1000;
/** Comments per page of `GET /api/pub/<id>/comments`. */
export const COMMENTS_PAGE_SIZE = 50;
/** Notes the board shows. */
export const RUNES_SHOWN = 50;
/** A note goes after this many days (the daily cron). */
export const NOTE_DAYS = 30;
/** Rows per page of `GET /api/gallery`, and the deepest page (round 13: pages of 10, 1 000 runs deep). */
export const GALLERY_PAGE_SIZE = 10;
export const GALLERY_PAGES_MAX = 100;
/**
 * A search of the list (`GET /api/gallery?q=`, stage 65 owner's feedback):
 * its text in code points after `shared/cloud/text.ts` `searchText`.
 */
export const GALLERY_Q_MIN = 2;
export const GALLERY_Q_MAX = 60;
/** A search's deepest page (review fix 2 R2-1: a search reads every listed run; 100 rows are plenty). */
export const GALLERY_Q_PAGES_MAX = 10;
/** Top's prior (ADR 0148): `(C·m + top_sum) / (C + top_count)`. */
export const TOP_PRIOR_VOTES = 5;
/** Top's prior mean when no ranking vote exists. */
export const TOP_PRIOR_MEAN = 3;
/** A vote moves Top only when its account was this old when it was cast or last changed. */
export const RANKING_AGE_DAYS = 7;
/** The counters' cap: the client shows "99+" beyond it. */
export const NEWS_MAX = 99;
/** `PublicStats.listed` carries this many times. */
export const COUNTER_RUNS = 99;
/** The longest time `GET /api/gallery`, `/api/community` and `/api/runes` are cached (s). */
export const COMMUNITY_CACHE_SECONDS = 60;

/** The list's orders (round 13: `new` the default; `comments` and `length` added for the column headings). */
export const GALLERY_SORTS = ['new', 'top', 'watched', 'comments', 'length'] as const;
export type GallerySort = (typeof GALLERY_SORTS)[number];
export const GALLERY_PERIODS = ['week', 'month', 'all'] as const;
export type GalleryPeriod = (typeof GALLERY_PERIODS)[number];
/** The days of a period (`all`: no bound); the period filters on `listedAt`. */
export const GALLERY_PERIOD_DAYS: Record<GalleryPeriod, number | null> = { week: 7, month: 30, all: null };

/** A run's stars: every live vote (`sum` of 1–5 stars over `count` votes; the mean is `sum / count`). */
export interface Stars {
  sum: number;
  count: number;
}

/** One row of the list and of the boxes. */
export interface GalleryRow {
  id: string;
  title: string;
  /** The sender's account name. */
  sender: string;
  character: string;
  level?: number;
  lengthS: number;
  listedAt: number;
  views: number;
  stars: Stars;
  comments: number;
}

/**
 * `GET /api/gallery?sort=new|top|watched|comments|length&period=week|month|all&page=N&by=<name>&q=<text>`
 * (public) → `GalleryPage`. Defaults: `new`, `all`, `1`. Only active,
 * listed runs. **Top**: `(C·m + top_sum) / (C + top_count)` with `C =
 * TOP_PRIOR_VOTES` and `m` the mean of all ranking votes on listed active
 * runs (`TOP_PRIOR_MEAN` without any), then more ranking votes, then the
 * newer `listedAt`. **New**: `listedAt`, newest first. **Most watched**:
 * `views`, then the newer `listedAt`. **Comments**: `comments`, then the
 * newer `listedAt`. **Length**: `lengthS` (longest first), then the newer
 * `listedAt`. `period` keeps the runs listed in the last 7 or 30 days. A
 * page past the end is empty (`more: false`).
 *
 * `by=<name>` (round 13, a sender's runs): only that account's listed
 * active runs, in `sort`'s order (the client asks `new`). A name that is
 * unknown, deleted or not a valid name gives an empty list, never an
 * error, so the answer never tells whether a name exists. The name is
 * matched without regard to case; the cache keeps its lowercase.
 *
 * `q=<text>` (stage 65, the owner's feedback: search): only the runs whose
 * title, character or sender holds the text, without regard to case
 * (SQLite's `lower()`: ASCII letters; other letters as written), in
 * `sort`'s order, pages as above; combines with `by`. The text is taken as
 * `searchText` gives it (the public text rules' cleaning on one line,
 * spaces collapsed, trimmed); `GALLERY_Q_MIN`–`GALLERY_Q_MAX` code points
 * then, or `400 bad_request`. Matched as a plain substring (`instr`): `%`,
 * `_` and a backslash are themselves. The answer carries `q` (the text searched:
 * cleaned, its ASCII letters in lower case). Pages 1–`GALLERY_Q_PAGES_MAX`
 * only (a deeper `page` → `400 bad_request`). A search is kept in the
 * Worker's Cache API as the list is (under that text), and has its own
 * limit by address (20 a minute, `429 rate_limited`) besides the public one.
 *
 * As built (stage 65 B): a value outside its list, or a `page` that is
 * not a whole number 1–`GALLERY_PAGES_MAX` → `400 bad_request` (`by`
 * is never refused); unknown
 * parameters are ignored. `Cache-Control: public, max-age=60`; the Worker
 * keeps each normalised variant in the Cache API for 60 s, so an answer can
 * be up to a minute old (`time` is when it was made). Ties end on the id.
 */
export interface GalleryPage {
  sort: GallerySort;
  period: GalleryPeriod;
  page: number;
  rows: GalleryRow[];
  /** Another page has rows (and `page < GALLERY_PAGES_MAX`). */
  more: boolean;
  /**
   * The runs of this list over every page (round 13: the pager's "Page 1
   * of N"), at most `GALLERY_PAGE_SIZE × GALLERY_PAGES_MAX`.
   */
  total: number;
  /** The text searched (`q`, as cleaned), only on a search. */
  q?: string;
  time: number;
}

/** The run of the day: its row and its description, cut to `DAY_RUN_DESCRIPTION_MAX` code points. */
export interface DayRun extends GalleryRow {
  description: string;
}

/** The run of the day's description is cut to this many code points. */
export const DAY_RUN_DESCRIPTION_MAX = 300;

/**
 * `GET /api/community` (public, cached 60 s as the list) → the Hall of
 * Fame boxes (round 13: no top posters, no yesterday). `today`: the
 * random run of the UTC day, with its description cut, fixed for the day (among the runs listed before the day began, the one
 * whose id has the smallest HMAC-SHA-256 under the server's secret and the
 * day); null when there is none. `mume` (ADR 0155, "MUME's lists and
 * player count"; fetched by part C5's cron into `mume_cache`) is present
 * only while the lists were fetched less than `MUME_KEEP_HOURS` ago;
 * `players` beside them only while its probe is under 35 minutes old
 * (worker/mume.ts `readMume`, stage 65 C5).
 */
export interface CommunityBoxes {
  /** Top's first `HALL_OF_FAME_SIZE` over all time. */
  hallOfFame: GalleryRow[];
  today: DayRun | null;
  mume?: MumeBoxes;
  time: number;
}

/** One warlord of MUME's war page: plain text, each at most 40 code points. */
export interface Warlord {
  name: string;
  race: string;
  class: string;
}

/** MUME's war point lists (the west, the dark side) and the players online. */
export interface MumeBoxes {
  west: Warlord[];
  dark: Warlord[];
  players?: number;
}

/**
 * `mume_cache` rows (migration 0006), written by part C5: key `war` with
 * the value `{"west": Warlord[], "dark": Warlord[]}` (JSON), key `players`
 * with a whole number (JSON); `fetched` the time of the last good fetch.
 */
export const MUME_CACHE_KEYS = ['war', 'players'] as const;
/** A `mume_cache` row older than this is not shown. */
export const MUME_KEEP_HOURS = 24;

export const HALL_OF_FAME_SIZE = 8;

/**
 * `PUT /api/u/pub/<id>/vote` `{stars: 1–5}` → `VoteAnswer`; `DELETE` takes
 * one's vote back (→ `VoteAnswer`, `mine: null`; also when there was none);
 * `GET` → `VoteAnswer` (one's own, or null). `403 own` (one's own run),
 * `404 not_found` (unknown, removed, hidden or still uploading; a DELETE
 * also works on a hidden run), `403 suspended` (PUT and DELETE), `429
 * too_many` (`votesPerHour`, counted on each of the account's votes' last
 * change, held in the statement), `400 bad_request` (not a whole 1–5, other
 * keys). A vote ranks (moves Top) only when the account is at least
 * `RANKING_AGE_DAYS` old at the write; the player never sees the difference.
 * A PUT of the same stars again changes nothing but the time.
 */
export interface VoteRequest {
  stars: number;
}

export interface VoteAnswer {
  /** The run's stars after this request. */
  stars: Stars;
  /** One's own vote, or null. */
  mine: number | null;
}

/** A comment as everyone sees it. */
export interface Comment {
  id: string;
  /** The writer's account name. */
  writer: string;
  text: string;
  created: number;
}

/** A comment's (and a note's) id: 12 characters as a run's. */
export const COMMUNITY_ID_PATTERN = /^[A-Za-z0-9]{12}$/;

/**
 * `GET /api/pub/<id>/comments[?before=<cursor>]` (public, `no-store`) →
 * `CommentPage`: the newest `COMMENTS_PAGE_SIZE` comments (older than the
 * cursor when given), oldest first ("newest last"). `more` when older ones
 * are left; `before` is then the cursor that asks for them (review fix
 * CR1: a cursor, so a comment removed meanwhile skips none). Hidden
 * comments and those of a suspended writer are in no one's list. The
 * run's states answer as its meta (`404`, `410`, `451`). `400
 * bad_request` for a cursor that is not one.
 *
 * Kept for clients of before the fix: `?page=N|last` answers pages counted
 * from the newest end (`last`, the same as `pages`, is the newest 50; page
 * 1 the oldest, maybe short) with `page` and `pages` added. A page past the
 * end is empty; `400` for a page that is not a whole number ≥ 1 or `last`.
 */
export interface CommentPage {
  comments: Comment[];
  /** Visible comments of the run. */
  total: number;
  /** Older comments are left (ask with `before`). */
  more: boolean;
  /** The cursor of the next older page (`<created>.<id>` of the oldest comment here); only with `more`. */
  before?: string;
  /** Only for `?page=`: the page answered. */
  page?: number;
  /** Only for `?page=`: the pages, at least 1. */
  pages?: number;
}

/** A comments cursor (`CommentPage.before`): `<created>.<id>`. */
export const COMMENT_CURSOR_PATTERN = /^(\d{1,15})\.([A-Za-z0-9]{12})$/;

/**
 * `POST /api/u/pub/<id>/comments` `{text}` → `{comment: Comment}`. The text:
 * 1–`COMMENT_MAX` code points, already trimmed, at most
 * `COMMENT_NEWLINES_MAX` line breaks, the rules of `isPublicText` (`400
 * bad_text`; never changed by the Worker). `429 too_many`
 * (`commentsPerHour`), `409 full` (`COMMENTS_PER_RUN` visible), `404` (not
 * an active run: also a hidden one), `403 suspended`. One's own run is
 * allowed; a link-only run too.
 *
 * `DELETE /api/u/comments/<id>` → 204: by the writer or the run's sender
 * (else `404`); its text is gone at once (As built: a row without text
 * stays an hour for the hourly limit, then the cron deletes it), its
 * reports are handled, `comment_count` follows. A suspended account may
 * remove.
 */
export interface CommentRequest {
  text: string;
}

export interface CommentWritten {
  comment: Comment;
}

/** A note on Random Runes. */
export interface Note {
  id: string;
  writer: string;
  text: string;
  created: number;
}

/**
 * `GET /api/runes` (public, flags `gallery` and `runes`, cached 60 s) →
 * `RunesBoard`: the latest `RUNES_SHOWN` visible notes, newest first.
 *
 * `POST /api/u/runes` `{text}` → `{note: Note}`: one line, 1–`NOTE_MAX`
 * code points, trimmed, `isPublicText` (`400 bad_text`); `429 too_many`
 * (`notesPerDay`, a UTC day, held in the insert); `403 suspended`. The
 * board's cache does not have it for up to a minute: the client puts the
 * answer in at once.
 *
 * `DELETE /api/u/runes/<id>` → 204: the writer's own (else `404`); the text
 * is gone at once (As built: a row without text stays until the day's limit
 * has passed, then the cron deletes it). A note goes after `NOTE_DAYS` days
 * (a hidden one still waiting for the admin stays until he acts).
 */
export interface RunesBoard {
  notes: Note[];
  time: number;
}

export interface NoteRequest {
  text: string;
}

export interface NoteWritten {
  note: Note;
}

/**
 * `GET /api/u/community/news` → `CommunityNews` (`no-store`): `runs` are
 * active listed runs of other accounts listed after the account's
 * `gallery` seen time; `reactions` are votes (by their last change) and
 * visible comments by other accounts on the account's own active runs after
 * its `reactions` seen time. Each capped at `NEWS_MAX`; `newestRun` and
 * `newestReaction` are the newest of those times (null when none). Asked
 * with the sync's cadence, never in the game path.
 */
export interface CommunityNews {
  runs: number;
  reactions: number;
  newestRun: number | null;
  newestReaction: number | null;
}

/**
 * `POST /api/u/community/seen` `{gallery?: t, reactions?: t}` (at least
 * one, whole ms) → `CommunitySeen` with both times now stored: each is set
 * to `max(old, min(t, now))`, so a time from the future or an older one
 * never moves it wrongly. The client sends the newest time it showed.
 * Allowed while suspended.
 */
export interface CommunitySeenRequest {
  gallery?: number;
  reactions?: number;
}

export interface CommunitySeen {
  gallery: number;
  reactions: number;
}

/**
 * `POST /api/admin/comment/<id>` and `POST /api/admin/note/<id>` (Access,
 * `X-WC: 1`, the same Origin) `AdminItemAction` → 204; marks the item's
 * reports handled and writes `admin_log` (`comment.<action>` /
 * `note.<action>`, the target the item's id). `404` for an unknown or
 * removed item; `400` for an unknown action or key. Not behind the flags.
 */
export interface AdminItemAction {
  action: (typeof ADMIN_ITEM_ACTIONS)[number];
  note?: string;
}

// --- The admin panel (stage 66, spec §7.9, ADR 0157) ---
//
// All under /api/admin/: the router's Access check runs first; writes need
// `X-WC: 1` and the site's own `Origin`. Errors as elsewhere
// (`{error}`): 400 bad_request, 404 not_found, 403 forbidden.

/** Sort keys of `GET /api/admin/accounts`. */
export const ADMIN_ACCOUNT_SORTS = ['name', 'created', 'seen', 'items', 'bytes', 'runs', 'pubs', 'state'] as const;
export type AdminAccountSort = (typeof ADMIN_ACCOUNT_SORTS)[number];
export const ADMIN_ACCOUNTS_PAGE = 50;

/** One row of the account list. Times in ms; bytes as bytes. */
export interface AdminAccountRow {
  name: string;
  created: number;
  lastSeen: number;
  state: 'active' | 'suspended';
  items: number;
  itemBytes: number;
  runs: number;
  runBytes: number;
  pubs: number;
  pubBytes: number;
  /** itemBytes + runBytes + pubBytes. */
  bytes: number;
  /** Live sessions. */
  sessions: number;
  /** Whether the account has limits of its own (`account.limits` not NULL). */
  ownLimits: boolean;
}

/**
 * `GET /api/admin/accounts?q=&state=all|active|suspended&sort=<AdminAccountSort>&dir=asc|desc&page=N`
 * (page from 1; defaults: all, `seen`, desc, 1). `q`: a part of the name,
 * without regard to case (at most 20 characters; LIKE wildcards escaped).
 */
export interface AdminAccounts {
  total: number;
  page: number;
  pageSize: number;
  accounts: AdminAccountRow[];
  /** Totals over every account (not only the page). */
  totals: { accounts: number; bytes: number };
}

/** Limits as the admin sees them: what holds, where each value comes from. */
export interface AdminLimits {
  /** Built into the Worker (DEFAULT_ACCOUNT_LIMITS with `RUN_BYTES_LIMIT`). */
  builtIn: AccountLimits;
  /** The defaults now: built-in with the admin's default overrides (owner's pick 4b). */
  defaults: AccountLimits;
  /** The account's own values (only the fields it overrides); absent on `GET /api/admin/limits`. */
  own?: Partial<AccountLimits>;
  /** What holds for the account; absent on `GET /api/admin/limits`. */
  effective?: AccountLimits;
}

/** `GET /api/admin/account/<name>` */
export interface AdminAccountDetail {
  account: AdminAccountRow;
  limits: AdminLimits & { own: Partial<AccountLimits>; effective: AccountLimits };
  /** Sessions: count and the newest use (ms, 0 when none); never their labels. */
  sessions: { count: number; lastUsed: number };
  community: {
    listed: number;
    votes: number;
    comments: number;
    notes: number;
    reportsMade: number;
    /** Open reports on the account's runs, comments and notes. */
    reportsOpen: number;
  };
  /** The newest 20 log entries whose target is the account or one of its things. */
  log: AdminLogRow[];
}

/**
 * `PUT /api/admin/account/<name>/limits` `{limits, note?}` → `AdminLimits`
 * (with `own` and `effective`). `limits`: some fields of `AccountLimits`
 * (whole numbers 0 … 20 × the built-in value) or null for none of its own.
 * A field equal to the current default is not stored. Logged
 * `account.limits`, the changes in the note.
 */
export interface AdminLimitsPut {
  limits: Partial<AccountLimits> | null;
  note?: string;
}

/**
 * `GET /api/admin/limits` → `AdminLimits` (builtIn, defaults).
 * `PUT /api/admin/limits` `{defaults, note?}` → `AdminLimits`: the default
 * overrides for every account (owner's pick 4b); a field equal to the
 * built-in value is not stored, `null` clears them all. Same value rules as
 * per account. Logged `limits.default`. Reaches every isolate within 30 s
 * and `/api/config`'s `limits` with it.
 */
export interface AdminDefaultsPut {
  defaults: Partial<AccountLimits> | null;
  note?: string;
}

export const ADMIN_GRAPH_RANGES = ['24h', '7d', '30d', '90d', 'all'] as const;
export type AdminGraphRange = (typeof ADMIN_GRAPH_RANGES)[number];

/** A point of the online graph: time (ms, the bucket's start) and the highest of its samples. */
export interface AdminOnlinePoint {
  ts: number;
  online: number;
  playing: number;
}

/** A day's figures for the graphs: metric → value (absent metric: not known for that day). */
export interface AdminGraphDay {
  day: string;
  /** Rolled up (false only for today, read live). */
  final: boolean;
  m: Partial<Record<AdminDailyMetric, number>>;
}

/**
 * Daily metrics of `stat_daily` the graphs use (ADR 0147 and ADR 0157).
 * Stage 66 adds devices_7d … views; storage metrics exist from stage 66's
 * deploy on, the others are backfilled where the tables still know them.
 * As built (stage 66 B), per UTC day:
 *   devices_7d / devices_30d  distinct devices of `device_day` in the 7 / 30 days ending with the day
 *   new_accounts              accounts created that day (still existing)
 *   accounts, item_bytes, run_bytes, pub_bytes  totals over `account` when rolled up (00:10 the day after)
 *   pubs_new    every publication created that day, link or listed (`created`; only `pending` ones,
 *               an upload never finished, are left out; removed ones count)
 *   listed_new  runs whose first listing (`listed_at`, set once) falls on that day; so
 *               max(0, pubs_new − listed_new) approximates the link-only runs of the day
 *   votes       votes cast or changed that day (`vote.updated`)
 *   comments, notes, reports  rows created that day (still existing at the roll-up)
 *   views       rows of `pub_view` of the day (one per run, device and day)
 */
export type AdminDailyMetric =
  | 'devices'
  | 'new_devices'
  | 'peak_online'
  | 'peak_playing'
  | 'play_minutes'
  | 'beats'
  | 'devices_7d'
  | 'devices_30d'
  | 'new_accounts'
  | 'accounts'
  | 'item_bytes'
  | 'run_bytes'
  | 'pub_bytes'
  | 'pubs_new'
  | 'listed_new'
  | 'votes'
  | 'comments'
  | 'notes'
  | 'reports'
  | 'views';

/** `GET /api/admin/graphs?range=<AdminGraphRange>` (default 30d). */
export interface AdminGraphs {
  range: AdminGraphRange;
  now: number;
  /** Bucket of `online` in minutes: 5 (24h), 30 (7d), 60 (30d), 180 (90d), 1440 (all: the days' peaks). */
  bucketMinutes: number;
  online: AdminOnlinePoint[];
  /** Oldest first; for 24h the last two days. */
  days: AdminGraphDay[];
  /** Device splits over the range: devices summed per key over the range's days. */
  split: { type: AdminSplit; browser: AdminSplit; version: AdminSplit };
  /** Storage now (live). */
  storage: { accounts: number; itemBytes: number; runBytes: number; pubBytes: number };
  /** The ten largest accounts by total bytes, now. */
  largest: { name: string; itemBytes: number; runBytes: number; pubBytes: number }[];
  /** Sharing now (live). */
  sharing: { pubs: number; listed: number; hidden: number; votes: number; comments: number; notes: number; openReports: number };
}

export const ADMIN_LOG_KINDS = ['moderation', 'accounts', 'limits', 'flags'] as const;
export type AdminLogKind = (typeof ADMIN_LOG_KINDS)[number];
export const ADMIN_LOG_PAGE = 100;

/** An entry of the audit log as the Log view shows it. */
export interface AdminLogRow extends AdminLogEntry {
  id: number;
  /** A short hash of the Access e-mail (8 characters of `who`). */
  by: string;
  /** False for entries written before stage 66 (no seal). */
  sealed: boolean;
}

/** The most ids of broken entries a chain's check lists (`AdminLogChain.broken`). */
export const ADMIN_LOG_BROKEN_SHOWN = 20;
/** The most entries of `GET /api/admin/log?chain=0&limit=`. */
export const ADMIN_LOG_LIMIT_MAX = ADMIN_LOG_PAGE;

/**
 * The audit log's check over every entry (ADR 0157; review fixes S2, S3).
 * `intact`: every entry after the ones written before migration 0007 is
 * sealed and matches. `broken`: some entry does not (a changed one at its
 * own id, a removed one at the next, an unsealed one at its id); the check
 * goes on past a break, so a later change shows too. `unkeyed`: nothing
 * broken found, but the Worker has no AUTH_PEPPER of 16 characters, so the
 * seals prove only order (anyone could have made them).
 */
export interface AdminLogChain {
  state: 'intact' | 'broken' | 'unkeyed';
  sealed: number;
  /** Entries written before migration 0007 (no seal, and none needed). */
  unsealed: number;
  /** The first entry that does not match (the oldest), null for none. */
  brokenAt: number | null;
  /** The entries that do not match, oldest first, at most ADMIN_LOG_BROKEN_SHOWN. */
  broken: number[];
  /** How many entries do not match in all. */
  brokenCount: number;
  /** The newest entry's seal, shortened to 12 ('' for none). */
  head: string;
}

/**
 * `GET /api/admin/log?before=<id>&kind=<AdminLogKind>&q=` → newest first,
 * 100 a page; `q` a part of the target; `chain` checks every entry (not
 * only the page). The Log view's read.
 *
 * `GET /api/admin/log?chain=0&limit=<1…100>[&before=<id>]` → the newest
 * `limit` entries without the check (`chain` null), reading only those
 * rows: the Reports view's card, which reloads every minute (review fix
 * S4). `kind` and `q` are refused with it (400). `total` is then every
 * entry.
 */
export interface AdminLogPage {
  entries: AdminLogRow[];
  /** The id to pass as `before` for the next page, null at the end. */
  next: number | null;
  total: number;
  chain: AdminLogChain | null;
}
