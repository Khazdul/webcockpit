// "Reconnect automatically" on the phone's game layout (ADR 0136 §10): the
// rule, pure. The shell feeds it what happens and does what it answers.
//
// With the setting on, a dead link FOUND ON RESUME reconnects once, with
// no saved login (MUME asks for the name and password as usual). Found on
// resume is any of:
//
// - the resume check dropped the link (`Session.checkAlive`; the drop's
//   reason is `REASON_BACKGROUND_LOST`);
// - the link closed by itself while that check was waiting for its answer
//   (the socket's close can reach the page just after it is shown again):
//   a drop within `checkMs` of a resume that found the link up;
// - the link dropped by itself while the page was hidden: reconnect at the
//   resume.
//
// Never otherwise:
// - not after the user's own disconnect, reconnect or exit, and not for a
//   replay;
// - not for a link that drops in view outside the check's window (the
//   sheet opens with Reconnect, as before);
// - once per resume: there is no retry and no timer, so no loop.
//
// The automatic connection that never comes up (refused, timed out) must
// not leave the player at a dead screen: while it is on its way the rule
// is `autoPending`, and a drop then answers `sheet`, so the shell opens
// the sheet with Reconnect exactly as with the setting off. Once it is up
// (`login`) it is an ordinary connection: a later drop in view is an
// ordinary drop.
//
// With the setting off the answer is never "reconnect", and the shell does
// what it did before (ADR 0075 §3.4: the sheet with Reconnect).

export interface AutoReconnectState {
  /** The link dropped by itself while the page was hidden, and nothing has connected since. */
  hiddenDrop: boolean;
  /** The automatic connection was started and is not up yet. */
  autoPending: boolean;
  /** A resume found the link up and is checking it: a drop up to this time (ms) is found on resume. Null: no check. */
  checkUntil: number | null;
}

export const AUTO_RECONNECT_IDLE: AutoReconnectState = { hiddenDrop: false, autoPending: false, checkUntil: null };

export type AutoReconnectEvent =
  | {
      type: 'drop';
      /** The session was up (login or playing) on a real connection before it dropped. */
      wasUp: boolean;
      /** The user asked for it (disconnect, reconnect, exit, a replay starting), or the connection was a replay. */
      quiet: boolean;
      /** The resume check dropped it (`REASON_BACKGROUND_LOST`). */
      foundOnResume: boolean;
      /** The page was hidden when it dropped. */
      hidden: boolean;
      /** The time now, ms (any clock; the same as `resume`'s). */
      now: number;
    }
  /**
   * The page is visible again. `link`: `up` (login or playing, a real
   * connection: the shell checks it now), `down` (no connection open or
   * opening), `other` (opening, or a replay).
   */
  | { type: 'resume'; link: 'up' | 'down' | 'other'; now: number; checkMs: number }
  /** A connection is opening (the user's, or the automatic one). */
  | { type: 'connecting' }
  /** A connection is up (the login prompt). */
  | { type: 'up' };

export interface AutoReconnectStep {
  state: AutoReconnectState;
  /** Reconnect now. */
  reconnect: boolean;
  /** The automatic connection failed: open the sheet with Reconnect for this drop, whatever the drop looks like. */
  sheet: boolean;
}

const step = (state: AutoReconnectState, reconnect = false, sheet = false): AutoReconnectStep => ({ state, reconnect, sheet });

/** The rule's next state and answer for `ev`, with the setting `enabled`. */
export function autoReconnectStep(state: AutoReconnectState, ev: AutoReconnectEvent, enabled: boolean): AutoReconnectStep {
  switch (ev.type) {
    case 'connecting':
      // A new connection: nothing remembered of the old one. The automatic one stays pending until it is up.
      return step({ hiddenDrop: false, autoPending: state.autoPending, checkUntil: null });
    case 'up':
      return step({ ...state, autoPending: false });
    case 'drop': {
      // The automatic connection never came up: the sheet, unless the user ended it themselves.
      if (state.autoPending) return step(AUTO_RECONNECT_IDLE, false, !ev.quiet);
      if (!ev.wasUp || ev.quiet) return step(AUTO_RECONNECT_IDLE);
      const found = ev.foundOnResume || (state.checkUntil !== null && ev.now <= state.checkUntil);
      if (found) return step({ ...AUTO_RECONNECT_IDLE, autoPending: enabled }, enabled);
      // Dropped out of view: found at the next resume. In view: an ordinary drop.
      return step({ ...AUTO_RECONNECT_IDLE, hiddenDrop: ev.hidden });
    }
    case 'resume': {
      if (ev.link === 'up') return step({ ...state, hiddenDrop: false, checkUntil: ev.now + ev.checkMs });
      // Whatever the answer, a resume spends the remembered drop: once per resume.
      const go = enabled && state.hiddenDrop && ev.link === 'down';
      return step({ hiddenDrop: false, autoPending: state.autoPending || go, checkUntil: null }, go);
    }
  }
}
