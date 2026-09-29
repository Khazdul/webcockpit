// App status: a small read-only observable of what the stage-1 status line
// showed (connection state, character, Link RTT, capture, XML). The ESC
// menu header (stage 2, package C) shows `Profile · Link: 38ms · capture`
// from it. Fed by the bus and by the app (capture text, replay flag).

import type { Bus } from '../core/bus';
import type { ConnState } from '../core/types';

export interface AppStatusState {
  /** Session state. */
  conn: ConnState;
  /** A replay (not a live MUME connection) is the current or last connection. */
  replay: boolean;
  /** Character name from GMCP Char.Name, '' until known. */
  character: string;
  /** Link round-trip time in ms (`link.rtt.ms`: link probe, else Core.Ping minimum), null before either. */
  linkMs: number | null;
  /** The RTT is suspect (a pong is overdue). */
  linkSuspect: boolean;
  /** Capture state text from the recorder, e.g. `capture: recording`; '' = none yet. */
  capture: string;
  /** MUME XML tags seen on this connection. */
  xml: boolean;
}

export type AppStatusListener = (s: Readonly<AppStatusState>) => void;

/** The read-only view consumers get (`app.status`). */
export interface AppStatusView {
  get(): Readonly<AppStatusState>;
  subscribe(fn: AppStatusListener): () => void;
}

/** `Link: 38ms`, `Link: 38ms?` when suspect, `Link: —` before the first sample. */
export function formatLink(ms: number | null, suspect: boolean): string {
  if (ms === null) return 'Link: —';
  return `Link: ${Math.round(ms)}ms${suspect ? '?' : ''}`;
}

/** True while a connection is open or opening. */
export function isLive(s: Readonly<AppStatusState>): boolean {
  return s.conn === 'connecting' || s.conn === 'login' || s.conn === 'playing';
}

/**
 * The stage-1 status line text, e.g.
 * `playing · Rasta · Link: 38ms · XML: on · capture: recording`.
 * The state reads `replay` while a replay is connected.
 */
export function formatStatus(s: Readonly<AppStatusState>): string {
  const parts: string[] = [s.replay && isLive(s) ? 'replay' : s.conn];
  if (s.character) parts.push(s.character);
  parts.push(formatLink(s.linkMs, s.linkSuspect), s.xml ? 'XML: on' : 'XML: off');
  if (s.capture) parts.push(s.capture);
  return parts.join(' · ');
}

export class AppStatus implements AppStatusView {
  private state: Readonly<AppStatusState> = Object.freeze({
    conn: 'idle',
    replay: false,
    character: '',
    linkMs: null,
    linkSuspect: false,
    capture: '',
    xml: false,
  });
  private readonly listeners = new Set<AppStatusListener>();
  private readonly unsubs: Array<() => void> = [];

  constructor(bus: Bus) {
    this.unsubs.push(
      bus.on('conn.state', (s) => {
        if (s.state === 'connecting') this.set({ conn: s.state, xml: false, linkMs: null, linkSuspect: false });
        else this.set({ conn: s.state });
      }),
      bus.on('gmcp', (m) => {
        if (m.pkg.toLowerCase() !== 'char.name') return;
        const n = (m.data as { name?: unknown } | undefined)?.name;
        if (typeof n === 'string' && n) this.set({ character: n });
      }),
      bus.on('link.rtt', (r) => this.set({ linkMs: r.ms, linkSuspect: r.suspect })),
      bus.on('xml.seen', () => this.set({ xml: true })),
    );
  }

  /** The current state (frozen; a new object after every change). */
  get(): Readonly<AppStatusState> {
    return this.state;
  }

  /** Calls `fn` after every change; returns the unsubscribe function. */
  subscribe(fn: AppStatusListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Merges `patch` (app-internal: capture text, replay flag). */
  set(patch: Partial<AppStatusState>): void {
    const cur = this.state;
    let changed = false;
    for (const k of Object.keys(patch) as Array<keyof AppStatusState>) {
      if (patch[k] !== cur[k]) changed = true;
    }
    if (!changed) return;
    this.state = Object.freeze({ ...cur, ...patch });
    for (const fn of [...this.listeners]) fn(this.state);
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    this.listeners.clear();
  }
}
