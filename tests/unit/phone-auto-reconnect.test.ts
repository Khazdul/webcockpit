// Stage 51f (ADR 0136 §10): "Reconnect automatically" on the phone's game
// layout: the rule. A dead link found on resume reconnects once; never
// after the user's own disconnect or exit; with the setting off, never; an
// automatic connection that never comes up ends in the sheet.
import { describe, expect, it } from 'vitest';
import { AUTO_RECONNECT_IDLE, type AutoReconnectEvent, type AutoReconnectState, autoReconnectStep } from '../../src/app/auto-reconnect';

const CHECK = 5000;
const drop = (over: Partial<Extract<AutoReconnectEvent, { type: 'drop' }>> = {}): AutoReconnectEvent => ({
  type: 'drop',
  wasUp: true,
  quiet: false,
  foundOnResume: false,
  hidden: false,
  now: 0,
  ...over,
});
const resume = (link: 'up' | 'down' | 'other' = 'down', now = 0): AutoReconnectEvent => ({ type: 'resume', link, now, checkMs: CHECK });
const connecting: AutoReconnectEvent = { type: 'connecting' };
const up: AutoReconnectEvent = { type: 'up' };

/** Runs the events; returns how many reconnects and sheets were asked for and the last state. */
function run(events: AutoReconnectEvent[], enabled: boolean, from: AutoReconnectState = AUTO_RECONNECT_IDLE): { reconnects: number; sheets: number; state: AutoReconnectState } {
  let state = from;
  let reconnects = 0;
  let sheets = 0;
  for (const ev of events) {
    const step = autoReconnectStep(state, ev, enabled);
    state = step.state;
    if (step.reconnect) reconnects++;
    if (step.sheet) sheets++;
  }
  return { reconnects, sheets, state };
}

describe('automatic reconnect', () => {
  it('the resume check found the link dead: reconnect, once', () => {
    expect(run([resume('up'), drop({ foundOnResume: true, now: CHECK })], true)).toMatchObject({ reconnects: 1, sheets: 0 });
  });

  it('the link dropped while hidden: nothing then, reconnect at the resume, once', () => {
    const hidden = autoReconnectStep(AUTO_RECONNECT_IDLE, drop({ hidden: true }), true);
    expect(hidden).toEqual({ state: { hiddenDrop: true, autoPending: false, checkUntil: null }, reconnect: false, sheet: false });
    expect(run([drop({ hidden: true }), resume()], true).reconnects).toBe(1);
    // A second resume finds nothing new.
    expect(run([drop({ hidden: true }), resume(), connecting, up, resume('up', 10), resume('up', 20)], true).reconnects).toBe(1);
  });

  it('a close that arrives while the resume check waits counts as found on resume', () => {
    // The socket's close reaches the page right after it is shown again: not BACKGROUND_LOST, in view.
    expect(run([resume('up', 1000), drop({ now: 1200 })], true)).toMatchObject({ reconnects: 1, sheets: 0 });
    // At the window's end still; after it, an ordinary drop.
    expect(run([resume('up', 1000), drop({ now: 1000 + CHECK })], true).reconnects).toBe(1);
    expect(run([resume('up', 1000), drop({ now: 1001 + CHECK })], true).reconnects).toBe(0);
    // The user's own disconnect inside the window is theirs.
    expect(run([resume('up', 1000), drop({ now: 1200, quiet: true })], true).reconnects).toBe(0);
    // A connection opened in between ends the window (the drop is of the new connection).
    expect(run([resume('up', 1000), connecting, up, drop({ now: 1200 })], true).reconnects).toBe(0);
    // Setting off: the window answers nothing.
    expect(run([resume('up', 1000), drop({ now: 1200 })], false)).toMatchObject({ reconnects: 0, sheets: 0 });
    // A resume with nothing up starts no window.
    expect(run([resume('other', 1000), drop({ now: 1200 })], true).reconnects).toBe(0);
  });

  it('the automatic connection that never comes up ends in the sheet, once', () => {
    // Found dead, reconnected; refused before it is up.
    const refused: AutoReconnectEvent[] = [resume('up'), drop({ foundOnResume: true }), connecting, drop({ wasUp: false })];
    expect(run(refused, true)).toMatchObject({ reconnects: 1, sheets: 1, state: AUTO_RECONNECT_IDLE });
    // The same after a hidden drop.
    expect(run([drop({ hidden: true }), resume(), connecting, drop({ wasUp: false })], true)).toMatchObject({ reconnects: 1, sheets: 1 });
    // Nothing more afterwards: no retry at later resumes.
    expect(run([...refused, resume(), resume()], true)).toMatchObject({ reconnects: 1, sheets: 1 });
    // The user ended the attempt themselves: no sheet.
    expect(run([resume('up'), drop({ foundOnResume: true }), connecting, drop({ wasUp: false, quiet: true })], true)).toMatchObject({ reconnects: 1, sheets: 0 });
  });

  it('pending is kept through connecting and cleared when the connection is up', () => {
    const { state } = run([resume('up'), drop({ foundOnResume: true }), connecting], true);
    expect(state.autoPending).toBe(true);
    expect(run([up], true, state).state.autoPending).toBe(false);
    // Up, then a drop in view outside any window: an ordinary drop (the shell's own sheet), not the rule's.
    expect(run([resume('up'), drop({ foundOnResume: true }), connecting, up, drop({ now: 99_999 })], true)).toMatchObject({ reconnects: 1, sheets: 0 });
  });

  it('with the setting off: never, whatever happens, and never a sheet of its own', () => {
    expect(run([resume('up'), drop({ foundOnResume: true })], false)).toMatchObject({ reconnects: 0, sheets: 0, state: AUTO_RECONNECT_IDLE });
    expect(run([drop({ hidden: true }), resume()], false)).toMatchObject({ reconnects: 0, sheets: 0 });
    // Switched on after the resume that spent the drop: still nothing.
    const { state } = run([drop({ hidden: true }), resume()], false);
    expect(run([resume()], true, state).reconnects).toBe(0);
  });

  it('never after the user\'s own disconnect, reconnect or exit, nor for a replay', () => {
    expect(run([drop({ quiet: true }), resume()], true).reconnects).toBe(0);
    expect(run([drop({ quiet: true, hidden: true }), resume()], true).reconnects).toBe(0);
    expect(run([drop({ quiet: true, foundOnResume: true })], true).reconnects).toBe(0);
    // A user disconnect after a hidden drop forgets it.
    expect(run([drop({ hidden: true }), connecting, up, drop({ quiet: true }), resume()], true).reconnects).toBe(0);
  });

  it('a link that drops in view is an ordinary drop: no reconnect, also at a later resume', () => {
    expect(run([drop()], true)).toEqual({ reconnects: 0, sheets: 0, state: AUTO_RECONNECT_IDLE });
    expect(run([drop(), resume()], true).reconnects).toBe(0);
  });

  it('a connection that was never up does not count', () => {
    expect(run([drop({ wasUp: false, hidden: true }), resume()], true)).toMatchObject({ reconnects: 0, sheets: 0 });
    expect(run([drop({ wasUp: false, foundOnResume: true })], true)).toMatchObject({ reconnects: 0, sheets: 0 });
  });

  it('once per resume: a later resume with a dead link again gets its own one attempt', () => {
    const twice: AutoReconnectEvent[] = [resume('up'), drop({ foundOnResume: true }), connecting, up, resume('up', 60_000), drop({ foundOnResume: true, now: 65_000 })];
    expect(run(twice, true)).toMatchObject({ reconnects: 2, sheets: 0 });
  });

  it('a resume while a connection is opening does nothing, and spends a remembered drop', () => {
    expect(run([drop({ hidden: true }), resume('other')], true).reconnects).toBe(0);
    expect(run([drop({ hidden: true }), resume('other'), resume('down')], true).reconnects).toBe(0);
  });

  it('a connection opening forgets a remembered drop (the user reconnected first)', () => {
    expect(run([drop({ hidden: true }), connecting, drop({ wasUp: false }), resume()], true)).toMatchObject({ reconnects: 0, sheets: 0 });
  });
});
