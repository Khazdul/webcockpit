// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { momentSeconds } from '../../src/gmcp/clock';
import { GameState } from '../../src/gmcp/state';
import { SettingsStore } from '../../src/settings';
import { CLOCK_DAY_FG, CLOCK_NIGHT_FG, ClockStrip } from '../../src/ui/clock-strip';

const T = 1_790_449_200_000;

function setup() {
  let now = T + 300; // mid-second
  const timers: { fn: () => void; ms: number }[] = [];
  const game = new GameState({ now: () => now });
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const el = document.createElement('span');
  const strip = new ClockStrip(el, {
    game,
    settings,
    now: () => now,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimer: () => {},
  });
  const text = () => el.textContent;
  const tick = (ms: number) => {
    now += ms;
    const t = timers.splice(0);
    t.at(-1)?.fn();
  };
  return { game, settings, el, strip, text, timers, tick, setNow: (n: number) => (now = n) };
}

describe('ClockStrip', () => {
  it('is blank (8 cells) below hour precision and runs no timer', () => {
    const t = setup();
    expect(t.text()).toBe('        ');
    expect(t.timers).toHaveLength(0);
    t.game.timeLine('Sterday, the 12th of Astron, year 2973 of the Third Age.');
    expect(t.text()).toBe('        ');
  });

  it('counts down at minute precision, re-rendering after each second boundary', () => {
    const t = setup();
    // 18:55 in Astron: 5 game minutes (real seconds) to dusk.
    t.game.clock.state = { epoch: Math.floor(T / 1000) - momentSeconds(2973, 3, 12, 18, 55), precision: 'minute', lastSync: T / 1000, reason: 't' };
    t.strip.update();
    expect(t.text()).toBe('  0:04 ☼');
    expect(t.timers.at(-1)!.ms).toBe(705); // to the next boundary (+5 ms)
    t.tick(705);
    expect(t.text()).toBe('  0:03 ☼');
    const icon = t.el.querySelector('.wc-clock-icon') as HTMLElement;
    expect(icon.style.color).not.toBe('');
    expect(t.el.dataset.period).toBe('day');
    t.tick(4000);
    expect(t.el.dataset.period).toBe('night');
    expect(t.text()!.endsWith('☾')).toBe(true);
    expect(CLOCK_DAY_FG).not.toBe(CLOCK_NIGHT_FG);
  });

  it('shows ~N at hour precision and updates on a sync', () => {
    const t = setup();
    t.game.timeLine('4 pm on Sterday, the 12th of Astron, year 2973 of the Third Age.');
    expect(t.text()).toBe('    ~3 ☼');
    t.strip.dispose();
  });

  it('uses dark ink on a light terminal', () => {
    const t = setup();
    const time = t.el.querySelector('.wc-clock-time') as HTMLElement;
    const dark = time.style.color;
    t.settings.update({ appearance: { bg: '#f4ecd8' } });
    expect(time.style.color).not.toBe(dark);
  });
});
