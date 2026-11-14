// Request and response types of the cloud API (spec §7.1), used by the
// Worker (worker/) and by the client (src/cloud/). Types and constants
// only: nothing here may import from either side.

/** Errors are `{ error: "<code>" }` with a fitting status. */
export interface ApiError {
  error: string;
}

/** Server flags that open cloud features (spec §7.0 rule 5). A missing flag is off. */
export type FlagName = 'stats';

/** `GET /api/config` */
export interface Config {
  flags: Partial<Record<FlagName, boolean>>;
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
export const FLAG_NAMES = ['stats'] as const satisfies readonly FlagName[];

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
