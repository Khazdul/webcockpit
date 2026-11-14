// Request and response types of the cloud API (spec §7.1), used by the
// Worker (worker/) and by the client (src/cloud/). Types and constants
// only: nothing here may import from either side.

/** Errors are `{ error: "<code>" }` with a fitting status. */
export interface ApiError {
  error: string;
}

/** Server flags that open cloud features (spec §7.0 rule 5). A missing flag is off. */
export type FlagName = 'stats' | 'accounts';

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
export const FLAG_NAMES = ['stats', 'accounts'] as const satisfies readonly FlagName[];

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
  /** Run bodies and shared payloads together, bytes. */
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
