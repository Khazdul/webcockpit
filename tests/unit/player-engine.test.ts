// Log player engine (ADR 0018): play at every speed on the wall clock,
// gap collapse, pause, forward seek (fast-forward without painting),
// backward seek (rebuild), chain boundaries, records, the replay clock.
import { describe, expect, it, vi } from 'vitest';
import { PlayerEngine, SPEEDS, browserWall } from '../../src/player/engine';
import { buildTimeline } from '../../src/player/timeline';
import { BASE_US, FakeWall, RecordingTarget, makeLog, meta, twoRunChain } from './player-helpers';

function setup(speed?: number) {
  const wall = new FakeWall();
  const target = new RecordingTarget();
  const tl = buildTimeline(twoRunChain());
  const engine = new PlayerEngine({ timeline: tl, build: target.build, wall, ...(speed ? { speed } : {}) });
  return { wall, target, tl, engine };
}

const kinds = (t: RecordingTarget) => t.calls.map((c) => c.t);

describe('PlayerEngine play', () => {
  it('delivers entries at their playback time on the wall clock', () => {
    const { wall, target, engine } = setup();
    engine.play();
    wall.flush();
    // At 00:00: the run connects; the lead-in (Char.Name with the GMCP
    // announce, SIZE, VIEW) and the first line arrive at once, on their log times.
    expect(kinds(target)).toEqual(['connect', 'data', 'size', 'view', 'data']);
    expect(target.text()).toBe('{GMCP Char.Name {"name":"Rasta","fullname":"Rasta the Ranger"}}Hello.\r\n');
    expect(target.clocks[0]!.nowUs()).toBe(BASE_US + 1e6);
    wall.advance(1);
    expect(target.text()).toContain('Hello.\r\nWorld.\r\n');
    wall.advance(998);
    expect(target.text()).not.toContain('oO>');
    wall.advance(2); // 1 s: the prompt with GA
    expect(target.text()).toContain('oO><GA>');
    wall.advance(500); // 1.5 s: the command
    expect(target.calls.at(-1)).toMatchObject({ t: 'sent', text: 'look', clockUs: BASE_US + 2.5e6 });
    expect(engine.position).toBeCloseTo(1501, 0);
    expect(engine.playing).toBe(true);
  });

  it('collapses a long gap to no wall time while the log time jumps', () => {
    const { wall, target, engine } = setup();
    engine.play();
    wall.advance(2000);
    // 2 s: `A room.` and, across the collapsed 60 s gap, `Much later.`
    expect(target.text()).toContain('A room.\r\nMuch later.');
    const late = target.calls.find((c) => c.t === 'data' && c.text.includes('Much later.'));
    expect(late).toMatchObject({ clockUs: BASE_US + 63e6 });
    expect(target.clocks[0]!.nowUs()).toBe(BASE_US + 63e6);
    wall.advance(3500); // a kept gap: the clock moves with the wall
    expect(target.clocks[0]!.nowUs()).toBe(BASE_US + 66.5e6);
  });

  it('plays at every speed', () => {
    for (const s of SPEEDS) {
      const { wall, target, engine } = setup(s);
      engine.play();
      wall.advance(1999 / s);
      expect(target.text()).not.toContain('A room.');
      wall.advance(2 / s);
      expect(target.text()).toContain('A room.');
      engine.dispose();
    }
  });

  it('shows the first text of a recorded login at once (no wall time for the lead-in)', () => {
    // As the recorder writes a run: login GMCP 8 s before Char.Name, then the view and the first text.
    const text = makeLog(BASE_US, [
      { at: 0, gmcp: 'Comm.Channel.List', json: [] },
      { at: 8, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 8.00005, view: { appearance: { size: 14 } } },
      { at: 8.00005, size: { cols: 200, rows: 60 } },
      { at: 8.0001, out: 'change width all 500' },
      { at: 8.0002, gmcp: 'Char.Vitals', json: { hp: 1 } },
      { at: 8.4, in: 'Welcome to MUME!' },
      { at: 9.4, in: 'Later.' },
    ]);
    const wall = new FakeWall();
    const target = new RecordingTarget();
    const engine = new PlayerEngine({ timeline: buildTimeline([{ meta: meta('Rasta/a', BASE_US), text }]), build: target.build, wall });
    expect(engine.duration).toBeCloseTo(1000, 6);
    engine.play();
    wall.flush();
    expect(wall.t).toBe(0);
    expect(target.text()).toContain('Comm.Channel.List');
    expect(target.text()).toContain('Welcome to MUME!');
    expect(target.calls.filter((c) => c.t === 'view' || c.t === 'size')).toHaveLength(2);
    expect(target.clocks[0]!.nowUs()).toBe(BASE_US + 8.4e6);
    expect(engine.position).toBe(0);
    wall.advance(1000);
    expect(target.text()).toContain('Later.');
  });

  it('changes speed keeping the position', () => {
    const { wall, engine } = setup();
    engine.play();
    wall.advance(1000);
    engine.setSpeed(4);
    wall.flush();
    expect(engine.position).toBeCloseTo(1000, 3);
    wall.advance(500);
    expect(engine.position).toBeCloseTo(3000, 3);
    expect(engine.speed).toBe(4);
  });

  it('passes through disconnected between runs, and ends and pauses at the end', () => {
    const { wall, target, engine } = setup();
    const states: boolean[] = [];
    engine.subscribe((c) => c === 'state' && states.push(engine.playing));
    engine.play();
    wall.advance(10_000);
    const calls = target.calls;
    const close = calls.findIndex((c) => c.t === 'close');
    expect(close).toBeGreaterThan(0);
    expect(calls[close + 1]).toEqual({ t: 'connect', run: 1 });
    // The new connection announces GMCP again.
    expect(calls[close + 2]).toMatchObject({ t: 'data', text: '{GMCP Char.Name {"name":"Rasta","fullname":"Rasta the Ranger"}}' });
    expect(engine.run).toBe(1);
    wall.advance(5_001);
    expect(calls.at(-1)).toEqual({ t: 'close', reason: 'replay finished' });
    expect(engine.playing).toBe(false);
    expect(engine.atEnd).toBe(true);
    expect(engine.position).toBe(engine.duration);
    expect(states.at(-1)).toBe(false);
  });

  it('pauses and resumes where it was', () => {
    const { wall, target, engine } = setup();
    engine.play();
    wall.advance(500);
    engine.pause();
    const n = target.calls.length;
    wall.advance(60_000);
    expect(target.calls.length).toBe(n);
    expect(engine.position).toBeCloseTo(500, 3);
    expect(target.clocks[0]!.nowUs()).toBeCloseTo(BASE_US + 1.5e6, -2);
    expect(target.text()).not.toContain('oO>');
    engine.play();
    wall.advance(501);
    expect(target.text()).toContain('oO>');
  });

  it('plays again from the start after the end', () => {
    const { wall, target, engine } = setup();
    engine.play();
    wall.advance(20_000);
    expect(engine.atEnd).toBe(true);
    engine.play();
    wall.flush();
    expect(target.builds).toHaveLength(2);
    expect(engine.position).toBeLessThan(10);
    expect(engine.playing).toBe(true);
  });
});

describe('PlayerEngine seek', () => {
  it('delivers lines less than 1 ms apart as one frame', () => {
    const { wall, target, engine } = setup();
    engine.seek(1500);
    wall.flush();
    const frames = target.calls.filter((c) => c.t === 'data');
    expect(frames[1]).toMatchObject({ t: 'data', text: 'Hello.\r\nWorld.\r\n', clockUs: BASE_US + 1e6 });
  });

  it('fast-forwards without painting, then paints', () => {
    const { wall, target, engine } = setup();
    engine.play();
    engine.pause();
    wall.flush();
    engine.seek(11_000);
    expect(engine.seeking).toBe(true);
    expect(engine.position).toBe(11_000);
    wall.flush();
    expect(engine.seeking).toBe(false);
    expect(target.builds).toHaveLength(1);
    const paints = target.calls.filter((c) => c.t === 'paint');
    expect(paints).toEqual([
      { t: 'paint', on: false },
      { t: 'paint', on: true },
    ]);
    expect(target.text()).toContain('Again.');
    expect(target.text()).not.toContain('End.');
    // Every timer-relevant step saw its own log time.
    const again = target.calls.find((c) => c.t === 'data' && c.text.includes('Again.'));
    expect(again).toMatchObject({ clockUs: BASE_US + 3601e6 });
    expect(engine.playing).toBe(false);
  });

  it('rebuilds on a backward seek and replays from the chain start', () => {
    const { wall, target, engine } = setup();
    engine.play();
    wall.advance(11_000);
    engine.seek(1_000);
    expect(target.builds[0]!.at(-1)).toEqual({ t: 'dispose' });
    wall.flush();
    expect(engine.buildCount).toBe(2);
    expect(target.builds).toHaveLength(2);
    expect(target.text()).toContain('oO>');
    expect(target.text()).not.toContain('A room.');
    expect(target.clocks[1]!.nowUs()).toBe(BASE_US + 2e6);
    expect(target.clocks[0]!.size).toBe(0);
    // Still playing: it continues from the new place.
    expect(engine.playing).toBe(true);
    wall.advance(1001);
    expect(target.text()).toContain('A room.');
  });

  it('retargets a seek in progress, rebuilding when it goes back', () => {
    const { wall, target, engine } = setup();
    engine.seek(11_000);
    engine.seek(12_000);
    wall.flush();
    expect(target.builds).toHaveLength(1);
    engine.seek(1_000); // back: a new build
    engine.seek(500); // the new build has delivered nothing yet: a retarget
    wall.flush();
    expect(target.builds).toHaveLength(2);
    expect(target.text()).toContain('Hello.');
    expect(target.text()).not.toContain('oO>');
    engine.seek(0);
    wall.flush();
    expect(target.builds).toHaveLength(3);
    // The new build was not painting while it fast-forwarded.
    expect(target.calls.filter((c) => c.t === 'paint')).toEqual([
      { t: 'paint', on: false },
      { t: 'paint', on: true },
    ]);
  });

  it('seeks to the end: ends and pauses', () => {
    const { wall, target, engine } = setup();
    engine.play();
    engine.seek(engine.duration);
    wall.flush();
    expect(engine.atEnd).toBe(true);
    expect(engine.playing).toBe(false);
    expect(target.calls.at(-1)).toEqual({ t: 'close', reason: 'replay finished' });
  });

  it('fires replay-clock timers at their log time through a fast-forward', () => {
    const wall = new FakeWall();
    const fired: number[] = [];
    const base = new RecordingTarget();
    const engine = new PlayerEngine({
      timeline: buildTimeline(twoRunChain()),
      wall,
      build: (clock) => {
        // A 500 ms fold armed at every inbound frame, as the kill fold is.
        const t = base.build(clock);
        return {
          ...t,
          connect: (sock, run) => {
            t.connect(sock, run);
            const onData = sock.onData!;
            sock.onData = (b) => {
              onData(b);
              clock.set(() => fired.push(clock.nowUs() - BASE_US), 500);
            };
          },
        };
      },
    });
    engine.seek(2_000);
    wall.flush();
    // Frames at 0, 1, 2, 3 (A room.) and 63 s: folds at +0.5 s each, the last still pending.
    expect(fired).toEqual([0.5e6, 1.5e6, 2.5e6, 3.5e6]);
  });
});

describe('player wall release', () => {
  it('the engine releases its wall on dispose, once', () => {
    let released = 0;
    const wall = Object.assign(new FakeWall(), { dispose: () => void released++ });
    const engine = new PlayerEngine({ timeline: buildTimeline(twoRunChain()), build: new RecordingTarget().build, wall });
    engine.play();
    wall.advance(1500);
    engine.dispose();
    engine.dispose();
    expect(released).toBe(1);
  });

  it('the browser wall closes its MessageChannel and runs no task after dispose', async () => {
    const closed: string[] = [];
    class FakeChannel {
      port1 = { onmessage: null as (() => void) | null, close: () => void closed.push('port1') };
      port2 = { postMessage: () => void queueMicrotask(() => this.port1.onmessage?.()), close: () => void closed.push('port2') };
    }
    vi.stubGlobal('MessageChannel', FakeChannel);
    try {
      const wall = browserWall();
      const ran: number[] = [];
      wall.task(() => ran.push(1));
      await Promise.resolve();
      expect(ran).toEqual([1]);
      wall.dispose!();
      expect(closed).toEqual(['port1', 'port2']);
      wall.task(() => ran.push(2));
      await Promise.resolve();
      expect(ran).toEqual([1]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
