// The menu bar's status logic (ADR 0099, ADR 0100), pure and unit tested:
// the link dot's state, the tooltip texts of the clock and the dot, and
// whether the Disconnected notice shows.
//
// Link dot (stage 30 S1): hidden while the link is fine. Yellow while the
// RTT is suspect (a pong is overdue: lagging or frozen). Red while
// connected with no RTT sample 10 s after login, or after a live
// connection dropped. Never in the offline modes or during a replay.

import type { ConnState } from '../core/types';
import { type Transition, countdownText } from '../gmcp/clock';

/** No RTT this long after login turns the dot red. */
export const NO_RTT_MS = 10_000;

export type LinkDot = 'off' | 'lagging' | 'broken';

export interface LinkInput {
  conn: ConnState;
  /** The current or last connection is a live MUME connection (not a replay). */
  live: boolean;
  linkMs: number | null;
  linkSuspect: boolean;
  /** Connected for `NO_RTT_MS` since login without an RTT sample. */
  rttOverdue: boolean;
  /** The recorder's text (`capture: recording` …); '' when none. */
  capture: string;
}

/** `38ms` under a second, `1.8s` from a second on. */
export function formatRtt(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** The link dot for `i`. */
export function linkDot(i: Readonly<LinkInput>): LinkDot {
  if (!i.live) return 'off';
  if (i.conn === 'disconnected') return 'broken';
  if (i.conn !== 'login' && i.conn !== 'playing') return 'off';
  if (i.linkSuspect) return 'lagging';
  if (i.linkMs === null && i.rttOverdue) return 'broken';
  return 'off';
}

/** The capture state worth a tooltip: '' for none and for idle. */
export function captureNote(capture: string): string {
  return capture === '' || capture === 'capture: idle' ? '' : capture;
}

const withCapture = (text: string, capture: string): string => {
  const c = captureNote(capture);
  return c ? `${text} · ${c}` : text;
};

/**
 * The dot's tooltip: `Link: 1.8s · lagging`, `Link: — · unknown`,
 * `Link: broken`, plus the capture state.
 */
export function linkTip(i: Readonly<LinkInput>): string {
  const rtt = i.linkMs === null ? '—' : formatRtt(i.linkMs);
  let text: string;
  if (i.live && i.conn === 'disconnected') text = 'Link: broken';
  else if (i.linkSuspect) text = `Link: ${rtt} · lagging`;
  else if (i.linkMs === null) text = 'Link: — · unknown';
  else text = `Link: ${rtt}`;
  return withCapture(text, i.capture);
}

/**
 * The clock's tooltip: `Night in 4:33` (minute precision), `Day in ~3
 * game hours` (hour precision), or how to set the clock. With the link dot
 * hidden, the capture state is added here.
 */
export function clockTip(t: Transition | null, nowMs: number, capture = ''): string {
  let text: string;
  if (!t) {
    text = 'Game clock unknown: type time';
  } else {
    const next = t.period === 'day' ? 'Night' : 'Day';
    const c = countdownText(t, nowMs);
    if (t.precision === 'minute') {
      text = `${next} in ${c}`;
    } else {
      const n = Number(c.slice(1));
      text = `${next} in ~${n} game hour${n === 1 ? '' : 's'}`;
    }
  }
  return withCapture(text, capture);
}

/**
 * The Disconnected notice (ADR 0100): after a live connection closed, until
 * the next one starts. Never after a replay or in the offline modes.
 */
export function showDisconnected(conn: ConnState, live: boolean): boolean {
  return live && conn === 'disconnected';
}
