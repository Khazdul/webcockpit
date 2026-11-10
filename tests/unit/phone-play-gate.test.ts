import { describe, expect, it } from 'vitest';
import type { ConnState } from '../../src/core/types';
import { keysLive } from '../../src/phone/play-gate';

const live = (conn: ConnState, o: { replay?: boolean; password?: boolean } = {}) =>
  keysLive({ conn, replay: o.replay ?? false, password: o.password ?? false });

describe('keysLive', () => {
  it('a live session: only while playing', () => {
    expect(live('playing')).toBe(true);
    expect(live('idle')).toBe(false);
    expect(live('connecting')).toBe(false);
    expect(live('login')).toBe(false);
    expect(live('disconnected')).toBe(false);
  });

  it('never in password mode', () => {
    expect(live('playing', { password: true })).toBe(false);
    expect(live('login', { password: true })).toBe(false);
    expect(live('disconnected', { replay: true, password: true })).toBe(false);
  });

  it('a replay: while it plays and after it ended, not while it connects', () => {
    expect(live('playing', { replay: true })).toBe(true);
    expect(live('disconnected', { replay: true })).toBe(true);
    expect(live('idle', { replay: true })).toBe(true);
    expect(live('connecting', { replay: true })).toBe(false);
    expect(live('login', { replay: true })).toBe(false);
  });
});
