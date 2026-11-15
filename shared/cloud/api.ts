// Request and response types of the cloud API (spec §7.1), used by the
// Worker (worker/) and by the client (src/cloud/). Types and constants
// only: nothing here may import from either side.

/** Errors are `{ error: "<code>" }` with a fitting status. */
export interface ApiError {
  error: string;
}

/** Server flags that open cloud features (spec §7.0 rule 5). A missing flag is off. */
export type FlagName = 'stats' | 'accounts' | 'sync' | 'runs';

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
}

// --- Flags and the admin page (spec §7.9, ADR 0147 and 0148) ---

/** Every server flag, in the order the admin page lists them. */
export const FLAG_NAMES = ['stats', 'accounts', 'sync', 'runs'] as const satisfies readonly FlagName[];

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
  /** Run bodies and shared payloads together, bytes. The default is the Worker's var `RUN_BYTES_LIMIT` when set (stage 63). */
  runBytes: number;
  /** One run body, bytes. */
  runMaxBytes: number;
  /** One shared payload, bytes. */
  payloadMaxBytes: number;
  /** Shared runs, count. */
  sharedRuns: number;
}

export const DEFAULT_ACCOUNT_LIMITS: AccountLimits = {
  items: 2000,
  itemBytes: 2 * 1024 * 1024,
  itemMaxBytes: 1024 * 1024,
  runBytes: 50 * 1024 * 1024,
  runMaxBytes: 20 * 1024 * 1024,
  payloadMaxBytes: 5 * 1024 * 1024,
  sharedRuns: 50,
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

export interface AccountPrefs {
  /** The notice of new runs in the gallery (stage 65). */
  galleryNotice: boolean;
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

/** `PATCH /api/u/account/prefs` → `PrefsAnswer`. */
export interface PrefsRequest {
  galleryNotice: boolean;
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
