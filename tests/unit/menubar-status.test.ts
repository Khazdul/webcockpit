import { describe, expect, it } from 'vitest';
import type { Transition } from '../../src/gmcp/clock';
import {
  type LinkInput,
  captureNote,
  clockTip,
  formatRtt,
  linkDot,
  linkTip,
  showDisconnected,
} from '../../src/menubar/status-text';

const link = (p: Partial<LinkInput> = {}): LinkInput => ({
  conn: 'playing',
  live: true,
  linkMs: 38,
  linkSuspect: false,
  rttOverdue: false,
  capture: '',
  ...p,
});

describe('link dot', () => {
  it('is hidden while the link is fine, and while connecting', () => {
    expect(linkDot(link())).toBe('off');
    expect(linkDot(link({ conn: 'login' }))).toBe('off');
    expect(linkDot(link({ conn: 'connecting', linkMs: null }))).toBe('off');
    expect(linkDot(link({ conn: 'idle', linkMs: null }))).toBe('off');
  });

  it('is yellow while the RTT is suspect', () => {
    expect(linkDot(link({ linkSuspect: true }))).toBe('lagging');
    expect(linkDot(link({ linkSuspect: true, linkMs: null }))).toBe('lagging');
  });

  it('is red with no RTT 10 s after login, or after a live drop', () => {
    expect(linkDot(link({ linkMs: null }))).toBe('off');
    expect(linkDot(link({ linkMs: null, rttOverdue: true }))).toBe('broken');
    expect(linkDot(link({ linkMs: 40, rttOverdue: true }))).toBe('off');
    expect(linkDot(link({ conn: 'disconnected', linkMs: null }))).toBe('broken');
  });

  it('never shows for a replay or the offline modes', () => {
    expect(linkDot(link({ live: false, linkSuspect: true }))).toBe('off');
    expect(linkDot(link({ live: false, conn: 'disconnected' }))).toBe('off');
    expect(linkDot(link({ live: false, linkMs: null, rttOverdue: true }))).toBe('off');
  });
});

describe('tooltip texts', () => {
  it('formats the RTT in ms under a second, in seconds above', () => {
    expect(formatRtt(38.4)).toBe('38ms');
    expect(formatRtt(999)).toBe('999ms');
    expect(formatRtt(1800)).toBe('1.8s');
    expect(formatRtt(12_345)).toBe('12.3s');
  });

  it('names the link state, with the capture state', () => {
    expect(linkTip(link({ linkSuspect: true }))).toBe('Link: 38ms · lagging');
    expect(linkTip(link({ linkSuspect: true, linkMs: 1800, capture: 'capture: recording' }))).toBe(
      'Link: 1.8s · lagging · capture: recording',
    );
    expect(linkTip(link({ linkMs: null, rttOverdue: true }))).toBe('Link: — · unknown');
    expect(linkTip(link({ conn: 'disconnected', linkMs: null }))).toBe('Link: broken');
    expect(linkTip(link())).toBe('Link: 38ms');
  });

  it('leaves out an idle or absent capture state', () => {
    expect(captureNote('')).toBe('');
    expect(captureNote('capture: idle')).toBe('');
    expect(captureNote('capture: recording')).toBe('capture: recording');
    expect(captureNote('capture: off (no IndexedDB)')).toBe('capture: off (no IndexedDB)');
  });

  it('counts the clock down to the next change', () => {
    const now = 1_000_000;
    const day: Transition = { period: 'day', at: now + 273_000, precision: 'minute' };
    expect(clockTip(day, now)).toBe('Night in 4:33');
    const night: Transition = { period: 'night', at: now + 61_000, precision: 'minute' };
    expect(clockTip(night, now)).toBe('Day in 1:01');
    expect(clockTip({ period: 'night', at: now + 150_000, precision: 'hour' }, now)).toBe('Day in ~3 game hours');
    expect(clockTip({ period: 'day', at: now + 30_000, precision: 'hour' }, now)).toBe('Night in ~1 game hour');
  });

  it('says how to set an unknown clock, and adds the capture state', () => {
    expect(clockTip(null, 0)).toBe('Game clock unknown: type time');
    expect(clockTip(null, 0, 'capture: recording')).toBe('Game clock unknown: type time · capture: recording');
    expect(clockTip({ period: 'day', at: 273_000, precision: 'minute' }, 0, 'capture: idle')).toBe('Night in 4:33');
  });
});

describe('Disconnected notice', () => {
  it('shows after a live connection closed, never after a replay', () => {
    expect(showDisconnected('disconnected', true)).toBe(true);
    expect(showDisconnected('disconnected', false)).toBe(false);
    for (const c of ['idle', 'connecting', 'login', 'playing'] as const) expect(showDisconnected(c, true)).toBe(false);
  });
});
