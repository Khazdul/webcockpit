// Phone resume check (ADR 0075 §3.4): KeepAlive.probe, Session.checkAlive
// and watchResume.
import { describe, expect, it } from 'vitest';
import { watchResume } from '../../src/app/resume-watch';
import { Bus } from '../../src/core/bus';
import type { BusEvents } from '../../src/core/types';
import { KeepAlive } from '../../src/net/keepalive';
import { REASON_BACKGROUND_LOST, RESUME_PING_TIMEOUT_MS, Session } from '../../src/net/session';
import { OPT_GMCP, WILL } from '../../src/net/telnet';
import { FakeSocket, FakeTimers, IAC, RecSink, gmcpOut, sb, utf8 } from './net-helpers';

describe('KeepAlive.probe', () => {
  function make() {
    const timers = new FakeTimers();
    let pings = 0;
    let enabled = true;
    const ka = new KeepAlive({ bus: new Bus(), timers, sendPing: () => enabled && (pings++, true) });
    let dead = 0;
    const probe = () => ka.probe(3_000, () => dead++);
    return { ka, timers, probe, pings: () => pings, dead: () => dead, setEnabled: (v: boolean) => (enabled = v) };
  }

  it('pings now and reports dead after the timeout without a pong', () => {
    const k = make();
    k.ka.start();
    expect(k.probe()).toBe(true);
    expect(k.pings()).toBe(1);
    k.timers.advance(2_999);
    expect(k.dead()).toBe(0);
    k.timers.advance(1);
    expect(k.dead()).toBe(1);
  });

  it('a pong in time cancels it and measures the probe ping', () => {
    const k = make();
    k.ka.start();
    k.timers.advance(10_000); // keep-alive ping outstanding
    k.timers.advance(5_000);
    k.probe();
    k.timers.advance(80);
    k.ka.notePong();
    expect(k.ka.lastSample).toBe(80);
    k.timers.advance(10_000);
    expect(k.dead()).toBe(0);
  });

  it('runs one probe at a time; does nothing stopped or when the ping cannot go out', () => {
    const k = make();
    expect(k.probe()).toBe(false);
    k.ka.start();
    k.setEnabled(false);
    expect(k.probe()).toBe(false);
    k.setEnabled(true);
    k.probe();
    k.probe();
    expect(k.pings()).toBe(1);
    k.ka.stop();
    k.timers.advance(5_000);
    expect(k.dead()).toBe(0);
  });
});

describe('Session.checkAlive', () => {
  function make() {
    const bus = new Bus();
    const timers = new FakeTimers();
    const states: BusEvents['conn.state'][] = [];
    bus.on('conn.state', (p) => states.push(p));
    const sock = new FakeSocket() as FakeSocket & { isOpen: boolean };
    sock.isOpen = true;
    const s = new Session({ bus, sink: new RecSink(), timers, socketFactory: () => sock });
    const play = () => {
      s.connect();
      sock.open();
      sock.data([IAC, WILL, OPT_GMCP]);
      sock.data(Uint8Array.from(sb(OPT_GMCP, utf8('Char.Name {"name":"Tester"}'))));
    };
    const pings = () => gmcpOut(sock.sentBytes()).filter((p) => p === 'Core.Ping').length;
    const last = () => states.at(-1)!;
    return { s, sock, timers, states, play, pings, last };
  }

  it('does nothing when not connected', () => {
    const m = make();
    m.s.checkAlive();
    m.timers.advance(10_000);
    expect(m.states).toEqual([]);
    m.s.connect(); // connecting: not checked
    m.s.checkAlive();
    expect(m.last().state).toBe('connecting');
  });

  it('drops at once when the socket can no longer write', () => {
    const m = make();
    m.play();
    m.sock.isOpen = false;
    m.s.checkAlive();
    expect(m.last()).toEqual({ state: 'disconnected', prev: 'playing', reason: REASON_BACKGROUND_LOST });
    expect(m.sock.closed).toBe(1);
  });

  it('half-open: pings now and drops when no pong comes in time', () => {
    const m = make();
    m.play();
    m.s.checkAlive();
    expect(m.pings()).toBe(1);
    m.timers.advance(RESUME_PING_TIMEOUT_MS - 1);
    expect(m.last().state).toBe('playing');
    m.timers.advance(1);
    expect(m.last()).toEqual({ state: 'disconnected', prev: 'playing', reason: REASON_BACKGROUND_LOST });
  });

  it('alive: a pong keeps the session', () => {
    const m = make();
    m.play();
    m.s.checkAlive();
    m.timers.advance(200);
    m.sock.data(Uint8Array.from(sb(OPT_GMCP, utf8('Core.Ping'))));
    m.timers.advance(10_000);
    expect(m.last().state).toBe('playing');
  });

  it('a real close during the probe wins; the probe adds nothing', () => {
    const m = make();
    m.play();
    m.s.checkAlive();
    m.sock.drop();
    m.timers.advance(10_000);
    expect(m.states.filter((s) => s.state === 'disconnected')).toEqual([
      { state: 'disconnected', prev: 'playing', reason: 'closed by server' },
    ]);
  });
});

describe('watchResume', () => {
  function make() {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
    const win = new EventTarget();
    let n = 0;
    const off = watchResume(doc as never, win as never, () => n++);
    const pageshow = (persisted: boolean) => win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted }));
    return { doc, win, off, pageshow, count: () => n };
  }

  it('fires on visible and on a bfcache pageshow only', () => {
    const m = make();
    m.doc.visibilityState = 'hidden';
    m.doc.dispatchEvent(new Event('visibilitychange'));
    expect(m.count()).toBe(0);
    m.doc.visibilityState = 'visible';
    m.doc.dispatchEvent(new Event('visibilitychange'));
    expect(m.count()).toBe(1);
    m.pageshow(false);
    expect(m.count()).toBe(1);
    m.pageshow(true);
    expect(m.count()).toBe(2);
    m.off();
    m.doc.dispatchEvent(new Event('visibilitychange'));
    m.pageshow(true);
    expect(m.count()).toBe(2);
  });
});
