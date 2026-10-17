// The weather engine's frame loop (owner feedback 4, "Heat", ADR 0091):
// the loop runs at the fastest module's rate, slower modules draw into a
// cache at their own rate, a scaled module always draws through its cache,
// and without window focus the loop drops to the slow rate.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WeatherEngine } from '../../src/weather/worker/engine';
import { type Ctx, type Env, FPS_FAST, FPS_SLOW, FPS_STILL, type Module } from '../../src/weather/worker/env';
import { Glints } from '../../src/weather/worker/glint';
import { themeInfo } from '../../src/weather/palette';
import { ALL_CATEGORIES, DEFAULT_STATE, type Geometry, type MainToWorker } from '../../src/weather/protocol';

/** A 2d context that accepts every call and records drawImage sources. */
function fakeCtx(canvas: FakeCanvas): Record<string, unknown> {
  const drawn: unknown[] = [];
  const args: unknown[][] = [];
  const grad = { addColorStop() {} };
  return new Proxy(
    { canvas, drawn, args },
    {
      get(t, k) {
        if (k in t) return (t as Record<string | symbol, unknown>)[k];
        if (k === 'drawImage')
          return (...a: unknown[]) => {
            drawn.push(a[0]);
            args.push(a);
          };
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
        return () => {};
      },
      set(t, k, v) {
        (t as Record<string | symbol, unknown>)[k] = v;
        return true;
      },
    },
  );
}
class FakeCanvas {
  ctx: Record<string, unknown>;
  constructor(
    public width: number,
    public height: number,
  ) {
    this.ctx = fakeCtx(this);
  }
  getContext() {
    return this.ctx;
  }
}

const geom: Geometry = {
  W: 800,
  H: 600,
  dpr: 1,
  out: { x: 0, y: 0, w: 800, h: 600 },
  panes: [],
  protect: { solidTop: 560, fadeTop: 520, left: 20 },
  cell: { w: 8, h: 16, size: 14, font: '14px monospace' },
};

/** A test module: counts its frames, fills a rect on the back layer only and remembers that context. */
function mod(id: string, fps: number, scale?: number) {
  const m = {
    id,
    frames: 0,
    backs: [] as unknown[],
    dts: [] as number[],
    init() {},
    resize() {},
    frame(env: Env, dt: number) {
      m.frames++;
      m.backs.push(env.back);
      m.dts.push(dt);
      env.back.fillRect(0, 0, 10, 10);
      return true;
    },
    fps: () => fps,
    scale,
  };
  return m satisfies Module;
}

/** A 60 Hz host with a manual clock: timers and animation frames run in time order. */
function harness(modules: Module[]) {
  let now = 1000;
  let raf: ((t: number) => void)[] = [];
  let timers: { at: number; cb: () => void }[] = [];
  const engine = new WeatherEngine(
    {
      post: () => {},
      requestFrame: (cb) => void raf.push(cb),
      setTimeout: (cb, ms) => void timers.push({ at: now + ms, cb }),
      now: () => now,
    },
    modules,
  );
  const back = new FakeCanvas(800, 600), front = new FakeCanvas(800, 600);
  engine.handle({
    t: 'init',
    back: back as unknown as OffscreenCanvas,
    front: front as unknown as OffscreenCanvas,
    geom,
    theme: { bg: '#000000', fg: '#c0c0c0' },
    cats: { ...ALL_CATEGORIES },
    state: { ...DEFAULT_STATE },
    moonSpeed: 1,
  } as MainToWorker);
  /** Advances `ms` in 60 Hz vsyncs. */
  const run = (ms: number): void => {
    const end = now + ms;
    while (now < end) {
      const vsync = now + 1000 / 60;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const t = timers[0];
        if (!t || t.at > vsync) break;
        timers.shift();
        now = Math.max(now, t.at);
        t.cb();
      }
      now = vsync;
      const cbs = raf;
      raf = [];
      for (const cb of cbs) cb(now);
    }
  };
  return { engine, run, back: back.ctx, front: front.ctx, send: (m: MainToWorker) => engine.handle(m) };
}

let saved: unknown;
beforeEach(() => {
  saved = (globalThis as Record<string, unknown>).OffscreenCanvas;
  (globalThis as Record<string, unknown>).OffscreenCanvas = FakeCanvas;
});
afterEach(() => {
  (globalThis as Record<string, unknown>).OffscreenCanvas = saved;
});

describe('WeatherEngine frame rate', () => {
  it('runs a slow-only scene at the slow rate, drawing straight on the canvas', () => {
    const sky = mod('sky', FPS_SLOW);
    const h = harness([sky]);
    h.run(200);
    const f0 = h.engine.stats().frames;
    h.run(2000);
    const fps = (h.engine.stats().frames - f0) / 2;
    expect(fps).toBeGreaterThanOrEqual(FPS_SLOW - 1);
    expect(fps).toBeLessThanOrEqual(FPS_SLOW + 1);
    expect(sky.backs.at(-1)).toBe(h.back);
  });

  it('runs at the fastest module rate; a slower module draws into its cache at its own rate', () => {
    const sky = mod('sky', FPS_SLOW), rain = mod('weather', FPS_FAST);
    const h = harness([sky, rain]);
    h.run(500);
    const s0 = sky.frames, r0 = rain.frames;
    h.run(2000);
    expect((rain.frames - r0) / 2).toBeGreaterThanOrEqual(FPS_FAST - 2);
    expect((rain.frames - r0) / 2).toBeLessThanOrEqual(FPS_FAST + 1);
    expect((sky.frames - s0) / 2).toBeLessThanOrEqual(FPS_SLOW + 1);
    expect((sky.frames - s0) / 2).toBeGreaterThanOrEqual(FPS_SLOW - 2);
    expect(sky.backs.at(-1)).not.toBe(h.back); // its cache
    expect(rain.backs.at(-1)).toBe(h.back);
    // the cache is copied onto the canvas every frame
    const drawn = (h.back as unknown as { drawn: unknown[] }).drawn;
    const cache = (sky.backs.at(-1) as { canvas: unknown }).canvas;
    expect(drawn.filter((d) => d === cache).length).toBeGreaterThanOrEqual(2 * (FPS_FAST - 2));
    // its front layer stayed empty, so it is never copied
    expect((h.front as unknown as { drawn: unknown[] }).drawn.length).toBe(0);
    // a cached module still advances by real time
    expect(sky.dts.at(-1)).toBeGreaterThan(0.07);
  });

  it('draws a scaled module through a cache at its resolution', () => {
    const fog = mod('fog', FPS_SLOW, 0.5);
    const h = harness([fog]);
    h.run(300);
    const c = fog.backs.at(-1) as { canvas: FakeCanvas };
    expect(c).not.toBe(h.back);
    expect([c.canvas.width, c.canvas.height]).toEqual([400, 300]);
  });

  it('crawls at FPS_STILL for still content while the mix rests; a message brings back the slow rate at once', () => {
    const sky = mod('sky', FPS_STILL);
    const h = harness([sky]);
    h.run(1000);
    const f0 = sky.frames;
    h.run(3000);
    expect((sky.frames - f0) / 3).toBeLessThanOrEqual(FPS_STILL + 1);
    expect((sky.frames - f0) / 3).toBeGreaterThanOrEqual(FPS_STILL - 1);
    // an event: the next frame comes within one slow frame, not one still frame
    const f1 = sky.frames;
    h.send({ t: 'event', name: 'darkness.start' });
    h.run(1000 / FPS_SLOW + 20);
    expect(sky.frames).toBeGreaterThan(f1);
    // a moving mix (a new weather value easing in) keeps the floor at FPS_SLOW
    h.send({ t: 'state', s: { weather: '~' }, instant: false });
    h.run(3500);
    const f2 = sky.frames;
    h.run(1000);
    expect(sky.frames - f2).toBeGreaterThanOrEqual(FPS_SLOW - 1);
    // still content draws straight on the canvas (a copy of a full-size cache would cost more)
    expect(sky.backs.at(-1)).toBe(h.back);
  });

  it('drops to the slow rate without window focus', () => {
    const rain = mod('weather', FPS_FAST);
    const h = harness([rain]);
    h.send({ t: 'focus', on: false });
    h.run(300);
    const r0 = rain.frames;
    h.run(2000);
    expect((rain.frames - r0) / 2).toBeLessThanOrEqual(FPS_SLOW + 1);
    h.send({ t: 'focus', on: true });
    h.run(300);
    const r1 = rain.frames;
    h.run(1000);
    expect(rain.frames - r1).toBeGreaterThanOrEqual(FPS_FAST - 2);
  });
});

describe('WeatherEngine floating panes', () => {
  it("copies the back layer under a float into the float's own canvas; a moved float is drawn at the next frame, whatever the rate", () => {
    const sky = mod('sky', FPS_STILL);
    const h = harness([sky]);
    const box = { x: 100, y: 50, w: 200, h: 100 };
    const pane = { id: 'group', x: 103, y: 53, w: 194, h: 94, border: 3, label: 'Group', floating: true, z: 10, bg: null, box };
    h.send({ t: 'geom', g: { ...geom, panes: [pane] } });
    const fc = new FakeCanvas(1, 1);
    h.send({ t: 'float', key: 1, pane: 'group', canvas: fc as unknown as OffscreenCanvas });
    // the size of the whole pane (device px)
    expect([fc.width, fc.height]).toEqual([200, 100]);
    h.run(1500);
    const backCanvas = (h.back as unknown as { canvas: unknown }).canvas;
    const calls = (fc.ctx as unknown as { args: unknown[][] }).args;
    expect(calls.length).toBeGreaterThan(0);
    // one copy of the back layer's pixels under the pane, to the canvas origin
    expect(calls.at(-1)).toEqual([backCanvas, 100, 50, 200, 100, 0, 0, 200, 100]);
    // at FPS_STILL, a move is drawn at the next animation frame
    const f0 = sky.frames;
    h.send({ t: 'geom', g: { ...geom, panes: [{ ...pane, x: 143, box: { ...box, x: 140 } }] } });
    h.run(1000 / 60 + 1);
    expect(sky.frames).toBe(f0 + 1);
    expect(calls.at(-1)).toEqual([backCanvas, 140, 50, 200, 100, 0, 0, 200, 100]);
    // gone: no more copies
    h.send({ t: 'floatGone', key: 1 });
    const n = calls.length;
    h.run(1000);
    expect(calls.length).toBe(n);
  });

  it('clips the copy to the back canvas when the float hangs over its edge', () => {
    const h = harness([mod('weather', FPS_FAST)]);
    const box = { x: 700, y: -10, w: 200, h: 100 };
    h.send({ t: 'geom', g: { ...geom, panes: [{ id: 'map', x: 703, y: -7, w: 194, h: 94, border: 3, label: 'Map', floating: true, z: 10, bg: null, box }] } });
    const fc = new FakeCanvas(1, 1);
    h.send({ t: 'float', key: 7, pane: 'map', canvas: fc as unknown as OffscreenCanvas });
    h.run(100);
    const calls = (fc.ctx as unknown as { args: unknown[][] }).args;
    expect(calls.at(-1)!.slice(1)).toEqual([700, 0, 100, 90, 0, 10, 100, 90]);
  });
});

describe('frame glints', () => {
  let g: Glints;
  beforeEach(() => {
    g = new Glints(themeInfo('#000000'));
  });
  const p = { x: 100, y: 50, w: 400, h: 200, border: 6, plate: { x: 134, w: 52, y1: 66, lip: 2, r: 4 } };
  /** [x0, x1, y0, y1] of every image copy but the sparkle. */
  const boxes = (args: unknown[][]) => args.filter((a) => a[0] !== g.spark).map((a) => [a[5], (a[5] as number) + (a[7] as number), a[6], (a[6] as number) + (a[8] as number)] as number[]);
  const covers = (bs: number[][], x: number, y: number) => bs.some(([x0, x1, y0, y1]) => x >= x0! && x <= x1! && y >= y0! && y <= y1!);

  it('light the whole nameplate with the top rim, no sparkle over the title (owner item 49, ADR 0091 addendum)', () => {
    const f = new FakeCanvas(800, 600).ctx as unknown as Ctx & { args: unknown[][] };
    g.dpr = 1;
    g.line(f, p, 't', 160, 200, 1, 1);
    const top = f.args.splice(0);
    expect(top.every((a) => a[0] !== g.spark)).toBe(true);
    const bs = boxes(top);
    // the plate's body down to its bottom, the fillets' glass, the rim beside it
    expect(covers(bs, 160, 65.5)).toBe(true);
    expect(covers(bs, 133.2, 57.5)).toBe(true);
    expect(covers(bs, 120, 55)).toBe(true);
    // not the pane beside the plate, not below the plate's rounded corners
    expect(covers(bs, 125, 60)).toBe(false);
    expect(covers(bs, 134.4, 65.8)).toBe(false);
    // the copies never overlap (an additive glint would show seams)
    for (let i = 0; i < bs.length; i++)
      for (let j = i + 1; j < bs.length; j++) {
        const [a0, a1, b0, b1] = bs[i]!, [c0, c1, d0, d1] = bs[j]!;
        expect(Math.min(a1!, c1!) - Math.max(a0!, c0!) <= 1e-9 || Math.min(b1!, d1!) - Math.max(b0!, d0!) <= 1e-9).toBe(true);
      }
    g.line(f, p, 'b', 160, 200, 1, 1);
    expect(f.args.some((a) => a[0] === g.spark)).toBe(true);
  });

  it('keep inside the rim\'s rounded corners (owner item 45)', () => {
    for (const d of [1, 2]) {
      const f = new FakeCanvas(800, 600).ctx as unknown as Ctx & { args: unknown[][] };
      g.dpr = d;
      for (const side of ['t', 'b'] as const) g.line(f, p, side, 120, 80, 1);
      for (const side of ['l', 'r'] as const) g.line(f, p, side, 60, 80, 1);
      const bs = boxes(f.args);
      // the box's very corners are outside the 4 px rounding; the rim next to them is lit
      for (const [x, y] of [[100.2, 50.2], [499.8, 50.2], [100.2, 249.8], [499.8, 249.8]] as const) expect(covers(bs, x, y)).toBe(false);
      for (const [x, y] of [[104.5, 50.5], [100.5, 54.5], [104.5, 249.5], [499.5, 54.5]] as const) expect(covers(bs, x, y)).toBe(true);
    }
    g.dpr = 1;
  });
});
