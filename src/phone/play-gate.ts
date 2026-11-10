// When a key of the phone layer may send its command (ADR 0136 §7, §8):
// the compass now, the hot keys from stage 51e. Pure: no DOM.
//
// A key sends only in play. It never types into a login or password
// prompt (a key's command goes the non-secret, echoed path) and it never
// opens a connection: a typed line may reconnect, a stray tap must not.
//
// The signal is the session's state (`ConnState`): `playing` is reached
// when MUME names the character (GMCP `Char.Name`), so the name and
// password prompts (`login`) are outside it. A replay or fixture run counts
// as play whenever it is not connecting: nothing there reaches MUME, and
// after it has ended a key gets the App's "not connected" answer as a
// typed line would.

import type { ConnState } from '../core/types';

export interface PlayState {
  /** The session's state. */
  conn: ConnState;
  /** The current (or last) connection is a replay, not MUME. */
  replay: boolean;
  /** The command line is in password mode (the server echoes). */
  password: boolean;
}

/** True when a key's command may be sent now. */
export function keysLive(s: PlayState): boolean {
  if (s.password) return false;
  if (s.conn === 'playing') return true;
  return s.replay && (s.conn === 'disconnected' || s.conn === 'idle');
}
