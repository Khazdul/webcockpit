import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { BusEvents } from '../../src/core/types';
import { KeepAlive } from '../../src/net/keepalive';
import { FakeTimers } from './net-helpers';

function make() {
  const bus = new Bus();
  const timers = new FakeTimers();
  const rtts: BusEvents['link.rtt'][] = [];
  bus.on('link.rtt', (p) => rtts.push(p));
  let pings = 0;
  let enabled = true;
  const ka = new KeepAlive({
    bus,
    timers,
    sendPing: () => {
      if (!enabled) return false;
      pings++;
      return true;
    },
  });
  return { ka, timers, rtts, pings: () => pings, setEnabled: (v: boolean) => (enabled = v) };
}

describe('KeepAlive', () => {
  it('pings every 10 s and measures RTT', () => {
    const k = make();
    k.ka.start();
    expect(k.rtts).toEqual([{ ms: null, last: null, ping: null, http: null, suspect: false }]);
    k.timers.advance(9_999);
    expect(k.pings()).toBe(0);
    k.timers.advance(1);
    expect(k.pings()).toBe(1);
    k.timers.advance(42);
    k.ka.notePong();
    expect(k.rtts.at(-1)).toEqual({ ms: 42, last: 42, ping: 42, http: null, suspect: false });
    k.timers.advance(10_000 - 42);
    expect(k.pings()).toBe(2);
    k.timers.advance(7);
    k.ka.notePong();
    expect(k.rtts.at(-1)).toEqual({ ms: 7, last: 7, ping: 7, http: null, suspect: false });
  });

  it('keeps one ping outstanding at a time', () => {
    const k = make();
    k.ka.start();
    k.timers.advance(10_000);
    expect(k.pings()).toBe(1);
    k.timers.advance(30_000); // no reply: ticks at 20, 30, 40 s send nothing
    expect(k.pings()).toBe(1);
    k.ka.notePong();
    expect(k.rtts.at(-1)).toEqual({ ms: 30_000, last: 30_000, ping: 30_000, http: null, suspect: false });
    k.timers.advance(10_000);
    expect(k.pings()).toBe(2);
  });

  it('marks the link suspect after 10 s without a pong, and recovers', () => {
    const k = make();
    k.ka.start();
    k.timers.advance(10_000);
    k.timers.advance(9_999);
    expect(k.rtts.at(-1)!.suspect).toBe(false);
    k.timers.advance(1);
    expect(k.rtts.at(-1)).toEqual({ ms: null, last: null, ping: null, http: null, suspect: true });
    k.timers.advance(5_000);
    k.ka.notePong();
    expect(k.rtts.at(-1)).toEqual({ ms: 15_000, last: 15_000, ping: 15_000, http: null, suspect: false });
  });

  it('gives up a ping unanswered for 60 s and sends a new one', () => {
    const k = make();
    k.ka.start();
    k.timers.advance(10_000); // ping 1
    k.timers.advance(59_999);
    expect(k.pings()).toBe(1);
    k.timers.advance(1); // tick at 70 s: ping 1 is 60 s old
    expect(k.pings()).toBe(2);
    expect(k.rtts.at(-1)!.suspect).toBe(true);
    k.timers.advance(80);
    k.ka.notePong();
    expect(k.rtts.at(-1)).toEqual({ ms: 80, last: 80, ping: 80, http: null, suspect: false });
  });

  it('ignores unsolicited pongs and does nothing when stopped', () => {
    const k = make();
    k.ka.start();
    k.ka.notePong();
    expect(k.rtts.length).toBe(1);
    k.ka.stop();
    k.timers.advance(120_000);
    expect(k.pings()).toBe(0);
  });

  it('reports the minimum RTT over the last 60 s and the raw last sample', () => {
    const k = make();
    k.ka.start();
    // Ping at 10 s, pong after 200 ms (received at 10.2 s).
    k.timers.advance(10_000);
    k.timers.advance(200);
    k.ka.notePong();
    expect(k.rtts.at(-1)).toEqual({ ms: 200, last: 200, ping: 200, http: null, suspect: false });
    // Ping at 20 s, pong after 50 ms: new minimum.
    k.timers.advance(9_800);
    k.timers.advance(50);
    k.ka.notePong();
    expect(k.rtts.at(-1)).toEqual({ ms: 50, last: 50, ping: 50, http: null, suspect: false });
    // Ping at 30 s, pong after 240 ms: minimum holds, last is raw.
    k.timers.advance(9_950);
    k.timers.advance(240);
    k.ka.notePong();
    expect(k.rtts.at(-1)).toEqual({ ms: 50, last: 240, ping: 50, http: null, suspect: false });
    // Pongs at 40.1 .. 70.1 s, 100 ms each. The 50 ms sample (received
    // at 20.05 s) is still in the window at 70.1 s but not at 80.1 s.
    for (let i = 0; i < 4; i++) {
      k.timers.advance(10_000 - (i === 0 ? 240 : 100));
      k.timers.advance(100);
      k.ka.notePong();
    }
    expect(k.timers.now()).toBe(70_100);
    expect(k.rtts.at(-1)).toEqual({ ms: 50, last: 100, ping: 50, http: null, suspect: false });
    k.timers.advance(9_900);
    k.timers.advance(100);
    k.ka.notePong();
    expect(k.rtts.at(-1)).toEqual({ ms: 100, last: 100, ping: 100, http: null, suspect: false });
  });

  it('resets the window on start', () => {
    const k = make();
    k.ka.start();
    k.timers.advance(10_010);
    k.ka.notePong();
    expect(k.ka.rtt).toBe(10);
    k.ka.start();
    expect(k.rtts.at(-1)).toEqual({ ms: null, last: null, ping: null, http: null, suspect: false });
    k.timers.advance(10_300);
    k.ka.notePong();
    expect(k.rtts.at(-1)).toEqual({ ms: 300, last: 300, ping: 300, http: null, suspect: false });
  });

  it('keeps trying when GMCP is not enabled yet', () => {
    const k = make();
    k.setEnabled(false);
    k.ka.start();
    k.timers.advance(60_000);
    expect(k.pings()).toBe(0);
    expect(k.rtts.at(-1)!.suspect).toBe(false);
    k.setEnabled(true);
    k.timers.advance(10_000);
    expect(k.pings()).toBe(1);
  });

  it('shows the link probe value when there is one, else the Core.Ping minimum', () => {
    const k = make();
    k.ka.start();
    k.timers.advance(10_120);
    k.ka.notePong();
    expect(k.rtts.at(-1)).toEqual({ ms: 120, last: 120, ping: 120, http: null, suspect: false });
    k.ka.setHttpRtt(38);
    expect(k.rtts.at(-1)).toEqual({ ms: 38, last: 120, ping: 120, http: 38, suspect: false });
    expect(k.ka.rtt).toBe(38);
    expect(k.ka.pingRtt).toBe(120);
    const n = k.rtts.length;
    k.ka.setHttpRtt(38); // unchanged: no event
    expect(k.rtts).toHaveLength(n);
    k.ka.setHttpRtt(null); // probe failing: fall back
    expect(k.rtts.at(-1)).toEqual({ ms: 120, last: 120, ping: 120, http: null, suspect: false });
  });

  it('keeps the suspect flag from Core.Ping while the probe has a value', () => {
    const k = make();
    k.ka.start();
    k.ka.setHttpRtt(40);
    k.timers.advance(20_000); // ping at 10 s, no pong by 20 s
    expect(k.rtts.at(-1)).toEqual({ ms: 40, last: null, ping: null, http: 40, suspect: true });
  });

  it('ignores probe values while stopped and resets them on start', () => {
    const k = make();
    k.ka.setHttpRtt(40);
    expect(k.rtts).toEqual([]);
    k.ka.start();
    k.ka.setHttpRtt(40);
    k.ka.stop();
    k.ka.setHttpRtt(50);
    expect(k.rtts.at(-1)!.http).toBe(40);
    k.ka.start();
    expect(k.rtts.at(-1)).toEqual({ ms: null, last: null, ping: null, http: null, suspect: false });
  });
});
