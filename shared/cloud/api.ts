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
