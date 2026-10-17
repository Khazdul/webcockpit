// @vitest-environment happy-dom
// The weather demo (owner feedback 33, ADR 0091 "Demo"): its script and
// timeline, `#weather` parsing, the runner (pins, events, the end restoring
// the user's state, the abort paths), smooth pins in the director and the
// signal bridge, and `?weather` once the cockpit is built later.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../../src/settings';
import { DEMO_SPEED, DEMO_STEPS, clockText, demoPlan, parseWeatherCommand } from '../../src/weather/demo-script';
import { Demo, type DemoController, demoOf, weatherCommand } from '../../src/weather/demo';
import { Director, DWELL_MS, eventState } from '../../src/weather/director';
import { weatherFromUrl } from '../../src/weather/dev';
import { ALL_CATEGORIES, type Categories, type WeatherEvent, type WeatherState } from '../../src/weather/protocol';
import { WeatherSignals, vitalsState } from '../../src/weather/signals';

describe('the demo script', () => {
  const plan = demoPlan();

  it('runs night → sunrise → day → indoors → body → sunset → night → back, in about a minute and a half', () => {
    const titles = DEMO_STEPS.map((s) => s.title);
    const at = (t: string): number => titles.indexOf(t);
    expect(titles[0]).toMatch(/^Night/);
    expect(at('Sunrise')).toBe(1);
    expect(at('Sunrise')).toBeLessThan(at('Day · heavy rain'));
    expect(at('Fog')).toBeLessThan(at('Indoors'));
    expect(at('Indoors')).toBeLessThan(at('Outdoors again'));
    expect(at('Sleeping')).toBeLessThan(at('On your feet again'));
    expect(at('On your feet again')).toBe(at('Sunset') - 1);
    expect(at('Sunset')).toBeLessThan(at('Night · rain and lightning'));
    expect(at('Darkness spreads')).toBeLessThan(at('Darkness lifts'));
    expect(titles.at(-1)).toBe('Back to the game');
    expect(plan.total).toBeGreaterThan(80_000);
    expect(plan.total).toBeLessThan(100_000);
    expect(plan.speed).toBe(DEMO_SPEED);
    expect(plan.steps).toHaveLength(DEMO_STEPS.length);
  });

  it('touches every effect: each weather, fog, position and event', () => {
    const pins = DEMO_STEPS.flatMap((s) => s.acts.map(([, a]) => a)).filter((a) => 'pin' in a).map((a) => (a as { pin: Partial<WeatherState> }).pin);
    const emits = DEMO_STEPS.flatMap((s) => s.acts.map(([, a]) => a)).filter((a) => 'emit' in a).map((a) => (a as { emit: WeatherEvent }).emit);
    expect(new Set(pins.map((p) => p.weather).filter((w) => w !== undefined))).toEqual(new Set([' ', '~', "'", '"', '*', null]));
    expect(new Set(pins.map((p) => p.fog).filter((f) => f !== undefined))).toEqual(new Set(['', '-', '=']));
    expect(new Set(pins.map((p) => p.position).filter(Boolean))).toEqual(new Set(['standing', 'sleeping', 'stunned', 'incapacitated', 'dying']));
    for (const e of ['sun.rise', 'sun.set', 'strike', 'gust', 'birds', 'glimpse', 'insect', 'shoot', 'darkness.start', 'darkness.end'] as const) expect(emits, e).toContain(e);
    expect(pins.some((p) => p.moonUp === true)).toBe(true);
  });

  it('only the first pin jumps; the last step releases; every action lies inside its step', () => {
    const acts = DEMO_STEPS.flatMap((s) => s.acts.map(([, a]) => a));
    expect(acts.filter((a) => 'instant' in a && a.instant)).toEqual([DEMO_STEPS[0]!.acts[0]![1]]);
    expect(DEMO_STEPS.at(-1)!.acts).toEqual([[0, { release: true }]]);
    for (const s of DEMO_STEPS) for (const [t] of s.acts) expect(t, s.title).toBeLessThan(s.dur);
  });

  it('the sun moments fit their steps at the demo pace and at the game pace', () => {
    const rise = DEMO_STEPS.find((s) => s.title === 'Sunrise')!;
    const set = DEMO_STEPS.find((s) => s.title === 'Sunset')!;
    // sky.ts RISE_S 24, SET_S 26 (owner feedback 29)
    expect(rise.dur).toBeGreaterThanOrEqual(24 / DEMO_SPEED);
    expect(rise.slow).toBeGreaterThanOrEqual(24);
    const at = set.acts.find(([, a]) => 'emit' in a && a.emit === 'sun.set')![0];
    expect(set.dur - at).toBeGreaterThanOrEqual(26 / DEMO_SPEED);
    expect(set.slow! - (at * set.slow!) / set.dur).toBeGreaterThanOrEqual(26);
  });

  it('timeline: steps in order, each before its own actions, the end last; slow and paced variants', () => {
    const steps = plan.events.filter((e) => 'step' in e).map((e) => (e as { step: number }).step);
    expect(steps).toEqual(DEMO_STEPS.map((_, i) => i));
    for (let i = 1; i < plan.events.length; i++) expect(plan.events[i]!.t).toBeGreaterThanOrEqual(plan.events[i - 1]!.t);
    expect(plan.events[0]).toEqual({ t: 0, step: 0 });
    expect(plan.events.at(-1)).toEqual({ t: plan.total, end: true });
    const slow = demoPlan({ slow: true });
    expect(slow.speed).toBe(1);
    expect(slow.total).toBeGreaterThan(plan.total + 50_000);
    const fast = demoPlan({ pace: 20 });
    expect(fast.total).toBeCloseTo(plan.total / 20, 6);
    expect(fast.speed).toBe(DEMO_SPEED);
  });

  it('clock text', () => {
    expect(clockText(94_500)).toBe('1:35');
    expect(clockText(4_000)).toBe('0:04');
    expect(clockText(-5)).toBe('0:00');
  });
});

describe('#weather arguments', () => {
  it('parses demo, slow, stop and the hidden test pace', () => {
    expect(parseWeatherCommand('demo')).toEqual({ kind: 'demo', slow: false, pace: 1 });
    expect(parseWeatherCommand('  DEMO  slow ')).toEqual({ kind: 'demo', slow: true, pace: 1 });
    expect(parseWeatherCommand('demo x20')).toEqual({ kind: 'demo', slow: false, pace: 20 });
    expect(parseWeatherCommand('demo slow x2.5')).toEqual({ kind: 'demo', slow: true, pace: 2.5 });
    expect(parseWeatherCommand('stop')).toEqual({ kind: 'stop' });
    expect(parseWeatherCommand('demo stop')).toEqual({ kind: 'stop' });
    for (const a of ['', 'on', 'demo fast', 'demo slow slow', 'demo x0', 'stop now', 'demo stop x2']) expect(parseWeatherCommand(a), a).toEqual({ kind: 'usage' });
  });
});

/** A fake running effects controller that logs what the demo does. */
function fakeHost() {
  const log: string[] = [];
  const pins: Array<{ p: Partial<WeatherState> | null; smooth: boolean }> = [];
  let cats: Categories = { ...ALL_CATEGORIES };
  const ctl: DemoController = {
    engine: {
      emit: (e) => log.push(`emit ${e}`),
      setSpeed: (s) => log.push(`speed ${s}`),
      setCategories: (c) => {
        cats = { ...c };
        log.push(`cats ${Object.values(c).filter(Boolean).length}`);
      },
    },
    pin: (p, o) => {
      pins.push({ p: p && { ...p }, smooth: !!o?.smooth });
      log.push(p ? 'pin' : 'unpin');
    },
  };
  const host: { controller: DemoController | null; disposed: boolean; settled(): Promise<DemoController | null> } = {
    controller: ctl,
    disposed: false,
    settled: async () => host.controller,
  };
  return { host, ctl, log, pins, cats: () => cats };
}

describe('the demo runner', () => {
  let settings: SettingsStore;
  let root: HTMLElement;
  let game: HTMLElement;
  const said: string[] = [];
  const say = (t: string): void => void said.push(t);

  beforeEach(() => {
    vi.useFakeTimers();
    settings = new SettingsStore({ factory: null, storage: null, win: null });
    root = document.createElement('div');
    game = document.createElement('div');
    root.append(game);
    document.body.append(root);
    said.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
    root.remove();
  });

  const start = async (h: ReturnType<typeof fakeHost>, pace = 1): Promise<Demo> => {
    const demo = new Demo(h.host, { settings, cockpit: { el: root, gameEl: game } as never }, demoPlan({ pace }), say, () => {});
    await demo.start();
    return demo;
  };

  it('plays the script with smooth pins, shows a caption per step, and ends unpinned with the effects off again', async () => {
    settings.update({ weather: { fog: false } });
    const h = fakeHost();
    expect(settings.get().weather.enabled).toBe(false);
    const demo = await start(h);
    // on for the demo; every category; the demo pace
    expect(settings.get().weather.enabled).toBe(true);
    expect(h.log.slice(0, 2)).toEqual(['speed 3', 'cats 6']);
    expect(said[0]).toMatch(/^Weather demo: about 1:3\d\. #weather stop ends it\.$/);
    // the first pin jumps, the rest ease
    expect(h.pins[0]).toMatchObject({ smooth: false, p: { clock: 'night', weather: ' ', moonUp: true } });
    const box = root.querySelector('.wc-wdemo')!;
    expect(box.querySelector('.wc-wdemo-step')!.textContent).toBe('Night · moon and stars');
    expect(box.querySelector('.wc-wdemo-count')!.textContent).toBe(`1/${DEMO_STEPS.length}`);
    expect(box.querySelector('.wc-wdemo-hint')!.textContent).toBe('#weather stop to end');
    await vi.advanceTimersByTimeAsync(5_000 + 300);
    expect(demo.step).toBe(1);
    expect(box.querySelector('.wc-wdemo-step')!.textContent).toBe('Sunrise');
    expect(box.querySelector('.wc-wdemo-signal')!.textContent).toBe('Event.Sun rise');
    expect(h.log).toContain('emit sun.rise');
    expect(h.pins.at(-1)).toMatchObject({ smooth: true, p: { clock: 'day' } });
    // pins accumulate
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.pins.at(-1)!.p).toMatchObject({ clock: 'day', moonUp: false });
    await vi.advanceTimersByTimeAsync(demoPlan().total);
    expect(demo.ended).toBe('done');
    // released: the game's pace, the user's categories, unpinned smoothly; then off again
    const rel = h.log.lastIndexOf('unpin');
    expect(h.log.slice(rel - 2, rel + 1)).toEqual(['speed 1', 'cats 5', 'unpin']);
    expect(h.pins.at(-1)).toEqual({ p: null, smooth: true });
    expect(h.cats().fog).toBe(false);
    expect(settings.get().weather).toMatchObject({ enabled: false, fog: false });
    expect(said.at(-1)).toBe('Weather demo done; the effects are off again.');
    await vi.advanceTimersByTimeAsync(500);
    expect(root.querySelector('.wc-wdemo')).toBeNull();
  });

  it('keeps the effects on when they were on', async () => {
    settings.update({ weather: { enabled: true } });
    const h = fakeHost();
    const demo = await start(h, 50);
    await vi.advanceTimersByTimeAsync(demoPlan().total / 50 + 10);
    expect(demo.ended).toBe('done');
    expect(settings.get().weather.enabled).toBe(true);
    expect(said.at(-1)).toBe('Weather demo done; the effects follow the game again.');
  });

  it('#weather stop: unpins at once, restores, and removes the box', async () => {
    const h = fakeHost();
    await weatherCommandWith(h, 'demo');
    const demo = demoOf(h.host)!;
    await vi.advanceTimersByTimeAsync(12_000);
    await weatherCommandWith(h, 'demo');
    expect(said.at(-1)).toBe('The weather demo is already running; #weather stop ends it.');
    await weatherCommandWith(h, 'stop');
    expect(demo.ended).toBe('stopped');
    expect(demoOf(h.host)).toBeUndefined();
    expect(h.pins.at(-1)).toEqual({ p: null, smooth: true });
    expect(settings.get().weather.enabled).toBe(false);
    expect(said.at(-1)).toBe('Weather demo stopped.');
    const n = h.log.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.log.length).toBe(n);
    expect(root.querySelector('.wc-wdemo')).toBeNull();
    await weatherCommandWith(h, 'stop');
    expect(said.at(-1)).toBe('No weather demo is running.');
  });

  it('switching the effects off ends it without touching anything else', async () => {
    const h = fakeHost();
    const demo = await start(h);
    await vi.advanceTimersByTimeAsync(8_000);
    const n = h.log.length;
    settings.update({ weather: { enabled: false } });
    expect(demo.ended).toBe('off');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.log.length).toBe(n);
    expect(settings.get().weather.enabled).toBe(false);
  });

  it('ends when the effects go away under it', async () => {
    settings.update({ weather: { enabled: true } });
    const h = fakeHost();
    const demo = await start(h);
    h.host.controller = null;
    await vi.advanceTimersByTimeAsync(6_000);
    expect(demo.ended).toBe('gone');
  });

  it('prints the usage for anything else', async () => {
    const h = fakeHost();
    await weatherCommandWith(h, 'sunny');
    expect(said.at(-1)).toMatch(/^#weather demo plays every weather effect/);
  });

  /** `weatherCommand` with OffscreenCanvas pretended (happy-dom has none). */
  async function weatherCommandWith(h: ReturnType<typeof fakeHost>, args: string): Promise<void> {
    const g = globalThis as Record<string, unknown>;
    const had = 'OffscreenCanvas' in g, hadW = 'Worker' in g;
    g.OffscreenCanvas ??= class {};
    g.Worker ??= class {};
    const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
    proto.transferControlToOffscreen ??= () => null;
    try {
      await weatherCommand(h.host, { settings, cockpit: { el: root, gameEl: game } as never }, args, say);
    } finally {
      if (!had) delete g.OffscreenCanvas;
      if (!hadW) delete g.Worker;
      delete proto.transferControlToOffscreen;
    }
  }
});

describe('smooth pins (the demo eases, a dev jump does not)', () => {
  it('the director settles a smooth set at once but eases toward it', () => {
    const d = new Director({ weather: ' ', clock: 'day' });
    d.set({ weather: '"', fog: '=' }, true);
    expect(d.settled.weather).toBe('"');
    expect(d.settled.fog).toBe('=');
    expect(d.pending()).toBe(false);
    expect(d.mix.rain).toBe(0);
    d.tick(100, 0.1);
    expect(d.mix.rain).toBeGreaterThan(0);
    expect(d.mix.rain).toBeLessThan(0.2);
    // without settle: the dwell as before
    d.set({ weather: '*' });
    d.settle(200);
    expect(d.settled.weather).toBe('"');
    d.settle(200 + DWELL_MS);
    expect(d.settled.weather).toBe('*');
  });

  it('speed runs the sky hold and change and the fog faster', () => {
    const d = new Director({ weather: ' ', clock: 'day' });
    d.speed = 3;
    d.set(eventState('sun.set')!);
    d.set({ fog: '-' }, true);
    let t = 0;
    for (let i = 0; i < 80; i++) d.tick((t += 100), 0.1);
    // 8 s at 3×: the 11 s hold and the 12 s change are done; fog 0.5 takes 20 / 3 s
    expect(d.mix.sun).toBe(0);
    expect(d.mix.dark).toBe(1);
    expect(d.mix.fog).toBeCloseTo(0.5, 5);
  });

  it('the bridge pins smoothly, and releases to the game values smoothly', () => {
    const states: Array<{ s: Partial<WeatherState>; o: unknown }> = [];
    const sig = new WeatherSignals(
      { setState: (s, o) => states.push({ s, o }), emit: () => {} },
      vitalsState(() => undefined),
      { epoch: 0, precision: 'unset', lastSync: 0, reason: 'test' },
      0,
    );
    sig.pin({ weather: '*' }, true);
    expect(states.at(-1)).toMatchObject({ s: { weather: '*' }, o: { settle: true } });
    sig.pin(null, true);
    expect(states.at(-1)).toMatchObject({ s: { weather: null }, o: { settle: true } });
    sig.pin({ weather: '*' });
    expect(states.at(-1)!.o).toEqual({ instant: true });
  });
});

describe('?weather with the cockpit built later (the start page)', () => {
  it('waits for the cockpit, then starts once, with the pinned state', () => {
    let later: (() => void) | null = null;
    const started: unknown[] = [];
    const ok = weatherFromUrl(new URLSearchParams('?weather={"weather":"*"}'), (fn) => (later = fn), (o) => started.push(o));
    expect(ok).toBe(true);
    expect(started).toEqual([]);
    later!();
    expect(started).toEqual([{ state: { weather: '*' } }]);
  });

  it('plain ?weather starts without a state; junk JSON is ignored; no parameter does nothing', () => {
    const started: unknown[] = [];
    weatherFromUrl(new URLSearchParams('?weather'), (fn) => fn(), (o) => started.push(o));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    weatherFromUrl(new URLSearchParams('?weather={bad'), (fn) => fn(), (o) => started.push(o));
    warn.mockRestore();
    expect(started).toEqual([undefined, undefined]);
    expect(weatherFromUrl(new URLSearchParams('?replay'), () => started.push('x'), () => {})).toBe(false);
    expect(started).toHaveLength(2);
  });
});
