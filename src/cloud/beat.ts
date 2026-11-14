// The usage heartbeat (spec §7.6, ADR 0147): `POST /api/beat` with the
// five fields of `Beat` and nothing else.
//
// When: once the page is shown (at load, or when a tab opened in the
// background is first looked at), then every BEAT_MINUTES while the page
// is visible (the timer stops while it is hidden; when it shows again a
// beat that is due goes at once), and when what the page shows changes
// between `menu`, `playing` and `replay` (a short settle first, so a
// passing state is not sent). A hidden page sends nothing; a change of
// state while hidden goes when it shows again.
//
// How: `fetch` with `credentials: 'omit'` (the session cookie is never
// sent, so the device id cannot be tied to an account) and `keepalive`,
// never awaited; any failure is dropped. Nothing here runs on the game
// path: the timers are the page's own, and a state change only arms a
// timer (spec §7.0 rule 1).
//
// The device id is a random UUID made once and kept in `localStorage`
// (`wc.device`). If storage is unavailable, the page uses an id of its own
// for its life (it then counts as a new device next time).
//
// Several tabs of one browser are one device: the server keeps one row
// per device id. To spare it needless beats, the tabs share a note of the
// last beat (`wc.beat`: tab, time, state): a tab skips a beat when another
// tab has sent one since this tab's last, recently enough, with a state
// that counts at least as much (playing > replay > menu). So a tab on the
// start page does not overwrite a tab in the game, and two tabs in the
// game send about one beat per period between them.
//
// Started by src/cloud/start.ts, which decides whether it runs at all (the
// flag, dev, webdriver).

import { BEAT_MINUTES, type Beat, type BeatState, type Browser, type DeviceType } from '../../shared/cloud/api.ts';

/** The beat's period (ms). */
export const BEAT_MS = BEAT_MINUTES * 60_000;
/** A state change is sent once it has held this long (ms). */
export const BEAT_SETTLE_MS = 1500;
/** Another tab's beat stands for this tab's for the period less this (ms), so a beat is never missed by timer jitter. */
export const BEAT_SLACK_MS = 30_000;

export const DEVICE_KEY = 'wc.device';
export const SHARED_KEY = 'wc.beat';

const RANK: Record<BeatState, number> = { menu: 0, replay: 1, playing: 2 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The part of `fetch` the beat uses. */
export type BeatFetch = (url: string, init: RequestInit) => Promise<unknown>;

/** The part of `localStorage` the beat uses (any call may throw). */
export type BeatStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The part of `document` the beat uses. */
export interface BeatDocument {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', fn: () => void): void;
  removeEventListener(type: 'visibilitychange', fn: () => void): void;
}

export interface BeatOptions {
  /** What the page shows now. */
  state: () => BeatState;
  version: string;
  type: DeviceType;
  browser: Browser;
  /** Defaults: the page's own. */
  fetch?: BeatFetch | undefined;
  storage?: BeatStorage | null | undefined;
  doc?: BeatDocument | undefined;
  now?: (() => number) | undefined;
  uuid?: (() => string) | undefined;
  url?: string | undefined;
}

export interface BeatHandle {
  /** What the page shows may have changed: a beat follows if it has, once it has settled. */
  stateChanged(): void;
  stop(): void;
}

/** A random UUID (v4): `crypto.randomUUID` where there is one (secure contexts), else from `getRandomValues`. */
export function randomUuid(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let pageDevice: string | null = null;

/** This browser's device id: kept in `wc.device`, made on first use; the page's own when storage fails. */
export function deviceId(storage: BeatStorage | null, uuid: () => string = randomUuid): string {
  try {
    const kept = storage?.getItem(DEVICE_KEY);
    if (kept && UUID.test(kept)) return kept.toLowerCase();
  } catch {
    // Storage blocked: the page's own id below.
  }
  const id = (pageDevice ??= uuid().toLowerCase());
  try {
    storage?.setItem(DEVICE_KEY, id);
  } catch {
    // Not kept: a new device next time.
  }
  return id;
}

/** Tests: forget the page's own id. */
export function resetDeviceForTest(): void {
  pageDevice = null;
}

interface SharedNote {
  tab: string;
  at: number;
  state: BeatState;
}

function readNote(storage: BeatStorage | null): SharedNote | null {
  try {
    const raw = storage?.getItem(SHARED_KEY);
    if (!raw) return null;
    const n = JSON.parse(raw) as Partial<SharedNote> | null;
    if (!n || typeof n.tab !== 'string' || typeof n.at !== 'number' || !(n.state === 'menu' || n.state === 'replay' || n.state === 'playing')) return null;
    return { tab: n.tab, at: n.at, state: n.state };
  } catch {
    return null;
  }
}

function writeNote(storage: BeatStorage | null, note: SharedNote): void {
  try {
    storage?.setItem(SHARED_KEY, JSON.stringify(note));
  } catch {
    // Only a saving: every tab then beats on its own.
  }
}

function pageStorage(): BeatStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Starts the heartbeat. Never throws; nothing it does is awaited. */
export function startBeat(o: BeatOptions): BeatHandle {
  const fetchFn: BeatFetch | undefined = o.fetch ?? globalThis.fetch?.bind(globalThis);
  const storage = o.storage === undefined ? pageStorage() : o.storage;
  const doc = o.doc ?? (globalThis.document as BeatDocument | undefined);
  const now = o.now ?? Date.now;
  const url = o.url ?? '/api/beat';
  const tab = (o.uuid ?? randomUuid)();
  let device: string | null = null;

  /** When this tab last sent a beat, or let another tab's stand for it. */
  let covered = -Infinity;
  /** When this tab itself last sent one. */
  let sentAt = -Infinity;
  let sentState: BeatState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settle: ReturnType<typeof setTimeout> | null = null;
  let started = false;
  let stopped = false;

  const visible = (): boolean => !doc || doc.visibilityState !== 'hidden';
  const clear = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = (): void => {
    clear();
    if (stopped || !visible()) return;
    timer = setTimeout(() => {
      timer = null;
      beat();
    }, Math.max(0, covered + BEAT_MS - now()));
  };

  const send = (state: BeatState): void => {
    device ??= deviceId(storage, o.uuid);
    const body: Beat = { device, version: o.version, type: o.type, browser: o.browser, state };
    try {
      void Promise.resolve(
        fetchFn?.(url, {
          method: 'POST',
          credentials: 'omit',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      ).catch(() => {});
    } catch {
      // Dropped, as any failed beat.
    }
  };

  /** Sends a beat of the state now, unless another tab's recent beat stands for it. */
  const beat = (): void => {
    if (stopped) return;
    try {
      const state = o.state();
      const t = now();
      const note = readNote(storage);
      const standsIn =
        note !== null && note.tab !== tab && note.at > sentAt && t - note.at < BEAT_MS - BEAT_SLACK_MS && RANK[note.state] >= RANK[state];
      if (standsIn) {
        // Due again a little after the other tab's next beat, which then stands in once more.
        covered = note.at + BEAT_SLACK_MS / 2;
      } else {
        send(state);
        covered = sentAt = t;
        sentState = state;
        writeNote(storage, { tab, at: t, state });
      }
    } catch {
      // Never let a beat break the page.
    }
    schedule();
  };

  const onVisibility = (): void => {
    if (stopped) return;
    if (!visible()) return clear();
    let due = !started || now() - covered >= BEAT_MS;
    try {
      // A change of state while hidden goes now.
      due ||= o.state() !== sentState;
    } catch {
      // As below.
    }
    if (due) {
      started = true;
      beat();
    } else schedule();
  };

  try {
    doc?.addEventListener('visibilitychange', onVisibility);
  } catch {
    // No visibility events: the timer runs as if always visible.
  }
  if (visible()) {
    started = true;
    beat();
  }

  return {
    stateChanged() {
      if (stopped || !started) return;
      if (settle !== null) clearTimeout(settle);
      settle = setTimeout(() => {
        settle = null;
        try {
          // Hidden: sent when the page shows again (onVisibility).
          if (visible() && o.state() !== sentState) beat();
        } catch {
          // As above.
        }
      }, BEAT_SETTLE_MS);
    },
    stop() {
      stopped = true;
      clear();
      if (settle !== null) clearTimeout(settle);
      settle = null;
      try {
        doc?.removeEventListener('visibilitychange', onVisibility);
      } catch {
        // Nothing to remove.
      }
    },
  };
}
