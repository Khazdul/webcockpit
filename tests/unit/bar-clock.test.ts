// @vitest-environment happy-dom
// The menu bar's clock (stage 31a): the ghost sun in a time-left ring.
import { describe, expect, it } from 'vitest';
import { momentSeconds } from '../../src/gmcp/clock';
import { GameState } from '../../src/gmcp/state';
import { BarClock, CLOCK_APPROX_CELLS, CLOCK_CELLS, GHOST_MOON, GHOST_SUN, barClockView, crescent, ringPath } from '../../src/menubar/bar-clock';

const T = 1_790_449_200_000;

/** The numbers in a path string. */
const nums = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('ringPath', () => {
  it('is a whole circle when the period begins and nothing at the change', () => {
    expect(ringPath(1)).toBe('M12 1A11 11 0 1 1 12 23A11 11 0 1 1 12 1');
    expect(ringPath(0)).toBe('');
    expect(ringPath(-0.1)).toBe('');
    expect(ringPath(Number.NaN)).toBe('');
  });

  it('runs from the current point clockwise up to 12 o’clock', () => {
    // Half left: from 6 o'clock, a small-arc flag of 0 (exactly a half turn).
    expect(ringPath(0.5)).toBe('M12 23A11 11 0 0 1 12 1');
    // A quarter left: from 9 o'clock.
    expect(ringPath(0.25)).toBe('M1 12A11 11 0 0 1 12 1');
    // Three quarters left: from 3 o'clock, the large arc.
    expect(ringPath(0.75)).toBe('M23 12A11 11 0 1 1 12 1');
    // Almost all gone: a short arc just left of 12 o'clock.
    const [x, y] = nums(ringPath(0.02));
    expect(x).toBeLessThan(12);
    expect(x).toBeGreaterThan(10);
    expect(y).toBeLessThan(1.2);
  });
});

describe('glyphs', () => {
  it('the crescent’s two corners lie on both circles', () => {
    const d = crescent(11.4, 12.6, 6.4, 14.6, 9.4, 5.2);
    expect(d).toBe(GHOST_MOON);
    const n = nums(d);
    for (const [x, y] of [
      [n[0]!, n[1]!],
      [n[7]!, n[8]!],
    ] as const) {
      expect(Math.hypot(x - 11.4, y - 12.6)).toBeCloseTo(6.4, 1);
      expect(Math.hypot(x - 14.6, y - 9.4)).toBeCloseTo(5.2, 1);
    }
  });

  it('the sun is a circle and 8 rays from 12 o’clock', () => {
    expect(GHOST_SUN.startsWith('M12 8.6a3.4 3.4 0 1 1 0 6.8')).toBe(true);
    expect(GHOST_SUN.match(/L/g)).toHaveLength(8);
    // The first ray points up: 12 4.1 → 12 6.1.
    expect(GHOST_SUN).toContain('M12 6.1L12 4.1');
  });
});

describe('barClockView', () => {
  it('draws the ring and glyph for the period, nothing while not synced', () => {
    const day = { period: 'day' as const, at: T + 300_000, from: T - 300_000, precision: 'minute' as const };
    expect(barClockView(day, T)).toEqual({ sync: 'minute', period: 'day', ring: ringPath(0.5), glyph: GHOST_SUN });
    const night = { ...day, period: 'night' as const, precision: 'hour' as const };
    expect(barClockView(night, T)).toMatchObject({ sync: 'hour', period: 'night', glyph: GHOST_MOON });
    expect(barClockView(null, T)).toEqual({ sync: 'none', period: '', ring: '', glyph: '' });
  });
});

function setup() {
  let now = T + 300;
  const timers: { fn: () => void; ms: number }[] = [];
  const game = new GameState({ now: () => now });
  const el = document.createElement('span');
  const cells: number[] = [];
  let updates = 0;
  const clock = new BarClock(el, {
    game,
    now: () => now,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => {},
    onUpdate: () => updates++,
    onCells: (n) => cells.push(n),
  });
  const set = (h: number, mi: number, precision: 'day' | 'hour' | 'minute', mo = 3, d = 12) => {
    game.clock.state = { epoch: Math.floor(now / 1000) - momentSeconds(2973, mo, d, h, mi), precision, lastSync: now / 1000, reason: 't' };
    clock.update();
  };
  const arc = () => el.querySelector('.wc-mb-ring-arc')!.getAttribute('d');
  const glyph = () => el.querySelector('.wc-mb-ring-glyph')!.getAttribute('d');
  const tilde = () => el.querySelector<HTMLElement>('.wc-mb-tilde')!;
  const tick = (ms: number) => {
    now += ms;
    timers.splice(0).at(-1)?.fn();
  };
  return { game, el, clock, cells, timers, set, arc, glyph, tilde, tick, updates: () => updates };
}

describe('BarClock', () => {
  it('not synced: no icon, the slot keeps its width, no timer', () => {
    const t = setup();
    expect(t.el.dataset.sync).toBe('none');
    expect(t.arc()).toBe('');
    expect(t.glyph()).toBe('');
    expect(t.tilde().hidden).toBe(true);
    expect(t.el.querySelector('svg.wc-mb-ring')).not.toBeNull();
    expect(t.el.style.width).toBe(`calc(${CLOCK_CELLS} * var(--cell-w))`);
    expect(t.clock.cells).toBe(CLOCK_CELLS);
    expect(t.timers).toHaveLength(0);
    expect(t.el.getAttribute('aria-label')).toBe('Game clock');
    // `day` precision has no countdown either.
    t.set(14, 0, 'day');
    expect(t.el.dataset.sync).toBe('none');
    expect(t.timers).toHaveLength(0);
    expect(t.cells).toEqual([]);
  });

  it('minute precision: the sun in a ring of the part of the day left, ticking each second', () => {
    const t = setup();
    // Astron: day 7:00 (the dawn hour) → 20:00; at 13:30 half of it is left.
    t.set(13, 30, 'minute');
    expect(t.el.dataset.sync).toBe('minute');
    expect(t.el.dataset.period).toBe('day');
    expect(t.glyph()).toBe(GHOST_SUN);
    // (300 ms into the second.)
    expect(t.arc()).toBe(ringPath((390_000 - 300) / 780_000));
    expect(t.tilde().hidden).toBe(true);
    expect(t.clock.cells).toBe(CLOCK_CELLS);
    expect(t.timers.at(-1)!.ms).toBe(705);
    t.tick(705);
    expect(t.arc()).toBe(ringPath((389_000 - 5) / 780_000));
    expect(t.cells).toEqual([]);
  });

  it('turns to the moon at the change with a full ring', () => {
    const t = setup();
    t.set(19, 59, 'minute');
    expect(t.el.dataset.period).toBe('day');
    t.tick(705);
    expect(t.el.dataset.period).toBe('night');
    expect(t.glyph()).toBe(GHOST_MOON);
    expect(t.arc()).toBe(ringPath((720_000 - 5) / 720_000));
  });

  it('hour precision: the ring and a grey ~, one cell wider; back to minute narrows it', () => {
    const t = setup();
    t.set(23, 0, 'hour');
    expect(t.el.dataset.sync).toBe('hour');
    expect(t.el.dataset.period).toBe('night');
    // Night 20:00 → 7:00 (the dawn hour): 3 of 11 game hours gone.
    expect(t.arc()).toBe(ringPath((480_000 - 300) / 660_000));
    expect(t.tilde().hidden).toBe(false);
    expect(t.tilde().textContent).toBe('~');
    expect(t.clock.cells).toBe(CLOCK_APPROX_CELLS);
    expect(t.el.style.width).toBe(`calc(${CLOCK_APPROX_CELLS} * var(--cell-w))`);
    expect(t.cells).toEqual([CLOCK_APPROX_CELLS]);
    t.set(23, 0, 'minute');
    expect(t.tilde().hidden).toBe(true);
    expect(t.cells).toEqual([CLOCK_APPROX_CELLS, CLOCK_CELLS]);
  });

  it('follows a sync and stops after dispose', () => {
    const t = setup();
    const before = t.updates();
    t.game.timeLine('4 pm on Sterday, the 12th of Astron, year 2973 of the Third Age.');
    expect(t.el.dataset.sync).toBe('hour');
    expect(t.updates()).toBeGreaterThan(before);
    t.clock.dispose();
    t.game.timeLine('Sterday, the 12th of Astron, year 2973 of the Third Age.');
    expect(t.updates()).toBe(before + 1);
  });
});
