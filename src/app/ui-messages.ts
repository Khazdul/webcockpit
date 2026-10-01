// UI pane lines from the app (Inv §2.4 "What core emits", ADR 0016).
//
// `uiMsg` builds a `ui.message` from a template: `{…}` marks a dynamic
// value (bold yellow), e.g. `uiMsg('system', '{Rasta} logged in.')`.
// Every message is a short sentence ending in `.`.
//
// `attachUiMessages(bus)` emits the connection and GMCP lines:
//
//   connecting        ● SYSTEM: Connecting to MUME...   (Reconnecting… after
//                     #reconnect; Replay started. for a replay)
//   playing           ● SYSTEM: <Name> logged in.
//   leaving playing   ● SYSTEM: <Name> logged out.
//   disconnected      ● SYSTEM: Connection to MUME closed. (Replay finished. /
//                     Replay stopped. for a replay); a connection that never
//                     opened: ✖ ERROR: Could not connect to MUME.
//   Event.Achieved    ▶ ACHIEVEMENT: Unlocked.
//
// Profile and capture lines are emitted by App (src/app/app.ts) and the
// shell (editor saves). The game output keeps its own `[SYSTEM]` lines.

import type { Bus } from '../core/bus';
import { type UiMessage, type UiMessageKind, type UiMessagePart, gmcpKey } from '../core/types';
import { REASON_USER_RECONNECT } from '../net/session';

/** Reason ReplaySocket gives when the log is exhausted. */
const REPLAY_DONE = 'replay finished';

/** Parts from a template: `{x}` → a value part. */
export function uiParts(template: string): UiMessagePart[] {
  const out: UiMessagePart[] = [];
  const re = /\{([^}]*)\}/g;
  let last = 0;
  for (let m = re.exec(template); m; m = re.exec(template)) {
    if (m.index > last) out.push(template.slice(last, m.index));
    out.push({ value: m[1]! });
    last = m.index + m[0].length;
  }
  if (last < template.length) out.push(template.slice(last));
  return out;
}

/** A `ui.message` from a template (see the file header). */
export function uiMsg(kind: UiMessageKind, template: string, label?: string): UiMessage {
  const m: UiMessage = { kind, parts: uiParts(template) };
  if (label !== undefined && kind === 'event') m.name = label;
  if (label !== undefined && kind === 'state') m.tag = label;
  return m;
}

/** A value for a template: braces in it are dropped so it stays one value. */
export const uiValue = (s: string): string => s.replace(/[{}]/g, '');

/** Emits the connection and GMCP lines on `bus`; returns the unsubscribe. */
export function attachUiMessages(bus: Bus): () => void {
  let name = '';
  let reconnecting = false;
  const emit = (m: UiMessage): void => bus.emit('ui.message', m);
  const offs = [
    bus.on('gmcp', (g) => {
      const pkg = gmcpKey(g);
      if (pkg === 'char.name') {
        const n = (g.data as { name?: unknown } | undefined)?.name;
        if (typeof n === 'string' && n) name = n;
      } else if (pkg === 'event.achieved') {
        emit(uiMsg('event', 'Unlocked.', 'ACHIEVEMENT'));
      }
    }),
    bus.on('conn.state', (s) => {
      const who = uiValue(name || 'Character');
      switch (s.state) {
        case 'connecting':
          if (s.replay) emit(uiMsg('system', 'Replay started.'));
          else emit(uiMsg('system', reconnecting ? 'Reconnecting to MUME...' : 'Connecting to MUME...'));
          reconnecting = false;
          break;
        case 'playing':
          emit(uiMsg('system', `{${who}} logged in.`));
          break;
        case 'disconnected':
          if (s.prev === 'playing') emit(uiMsg('system', `{${who}} logged out.`));
          if (s.replay) {
            emit(uiMsg('system', s.reason === REPLAY_DONE ? 'Replay finished.' : 'Replay stopped.'));
          } else if (s.prev === 'connecting') {
            emit(uiMsg('error', 'Could not connect to MUME.'));
          } else {
            emit(uiMsg('system', 'Connection to MUME closed.'));
          }
          reconnecting = s.reason === REASON_USER_RECONNECT;
          break;
      }
    }),
  ];
  return () => {
    for (const off of offs) off();
  };
}
