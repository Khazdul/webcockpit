// Real-play round (stage 28 items 90–92): the storm window after a game
// flash line (ADR 0094), the snow's fade-out, the cloud cover table.

import { describe, expect, it } from 'vitest';
import { CLOUD_COVER, Director, STORM_GRACE_MS, STORM_QUIET_S, STORM_WINDOW_S, mixTargets } from '../../src/weather/director';
import { ALL_CATEGORIES, type WeatherEvent, type WeatherState } from '../../src/weather/protocol';
import { GAME_FLASH, WeatherSignals, vitalsState } from '../../src/weather/signals';
import { SNOW_BACK_S, SNOW_FADE_S, snowFadeAlpha, snowFadeStep } from '../../src/weather/worker/weather';
import type { ClockState } from '../../src/gmcp/clock';

/** Runs the director's storm check every 250 ms (the idle tick) from `t0` to `t1`; returns the strike times. */
function strikes(d: Director, t0: number, t1: number, during?: (t: number) => void): number[] {
  const out: number[] = [];
  for (let t = t0; t <= t1; t += 250) {
    during?.(t);
    if (d.stormStrike(t)) out.push(t);
  }
  return out;
}

describe('storm window after a game flash (item 90, ADR 0094)', () => {
  it('2–3 more strikes, none in the first 5 s, all within 30 s, spread out', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const d = new Director({ weather: '*' });
      d.rand = () => r;
      d.stormFlash(0);
      const s = strikes(d, 0, 40_000);
      expect(s.length).toBeGreaterThanOrEqual(2);
      expect(s.length).toBeLessThanOrEqual(3);
      expect(s[0]!).toBeGreaterThanOrEqual(STORM_QUIET_S * 1000);
      expect(s.at(-1)!).toBeLessThanOrEqual(STORM_WINDOW_S * 1000);
      for (let i = 1; i < s.length; i++) expect(s[i]! - s[i - 1]!).toBeGreaterThan(0);
    }
    const two = new Director({ weather: '"' });
    two.rand = () => 0;
    two.stormFlash(0);
    expect(two.stormAt.length).toBe(2);
    const three = new Director({ weather: "'" });
    three.rand = () => 0.99;
    three.stormFlash(0);
    expect(three.stormAt.length).toBe(3);
  });

  it('nothing without a flash, and nothing after the window', () => {
    const d = new Director({ weather: '*' });
    expect(strikes(d, 0, 120_000)).toEqual([]);
    d.stormFlash(0);
    strikes(d, 0, 31_000);
    expect(strikes(d, 31_000, 120_000)).toEqual([]);
  });

  it('goes on through other rain or snow rooms; a room without rain or snow ends it at once, for good', () => {
    const d = new Director({ weather: '*' });
    d.rand = () => 0.5;
    d.stormFlash(0);
    // another snowy room, then a rainy one: it keeps going
    const s = strikes(d, 0, 30_000, (t) => {
      if (t === 6_000) d.set({ weather: '"' });
    });
    expect(s.length).toBeGreaterThanOrEqual(2);

    const e = new Director({ weather: '*' });
    e.rand = () => 0.5;
    e.stormFlash(0);
    const s2 = strikes(e, 0, 60_000, (t) => {
      if (t === 4_000) e.set({ weather: '~' }); // raw: no dwell
      if (t === 4_500) e.set({ weather: '*' }); // back in snow: does not come back
    });
    expect(s2).toEqual([]);
    expect(e.stormAt).toEqual([]);
  });

  it("ignores the previous room's weather just after the flash (its vitals come after the text)", () => {
    const d = new Director({ weather: '~' });
    d.rand = () => 0.5;
    d.stormFlash(0);
    expect(d.stormStrike(STORM_GRACE_MS - 250)).toBe(false);
    d.set({ weather: '*' }); // Char.Vitals of the snowy room
    expect(strikes(d, STORM_GRACE_MS, 30_000).length).toBeGreaterThanOrEqual(2);
  });

  it('strikes are not emitted with Lightning off; a new flash restarts the window; storm.off ends it', () => {
    const d = new Director({ weather: '*' }, { ...ALL_CATEGORIES, lightning: false });
    d.stormFlash(0);
    expect(strikes(d, 0, 30_000)).toEqual([]);
    const e = new Director({ weather: '*' });
    e.rand = () => 0.5;
    e.stormFlash(0);
    const first = e.stormAt[0]!;
    e.stormFlash(20_000);
    expect(e.stormAt[0]!).toBeCloseTo(first + 20_000, 6);
    expect(strikes(e, 20_000, 50_000).length).toBeGreaterThanOrEqual(2);
    e.stormFlash(60_000);
    e.stormOff();
    expect(strikes(e, 60_000, 100_000)).toEqual([]);
  });

  it('several overdue strikes (a hidden tab) give one', () => {
    const d = new Director({ weather: '*' });
    d.rand = () => 0.99;
    d.stormFlash(0);
    expect(d.stormStrike(30_000)).toBe(true);
    expect(d.stormAt).toEqual([]);
  });
});

describe('the bridge: flash lines open the window, a pin or a new character ends it', () => {
  const NOW_MS = 1_800_000_000_000;
  const unsynced: ClockState = { epoch: 0, precision: 'unset', lastSync: 0, reason: 'test' };
  const bolt = 'A bright streak of lightning flashes over the snow-covered mountains.';
  const line = (text: string) => ({ text, tags: [], prompt: false });
  function rec() {
    const events: Array<{ e: WeatherEvent; data?: unknown }> = [];
    return {
      events,
      setState: (_s: Partial<WeatherState>) => {},
      emit: (e: WeatherEvent, data?: unknown) => events.push(data === undefined ? { e } : { e, data }),
    };
  }

  it('a flash line strikes as a game flash; the weather command line does nothing', () => {
    const s = rec();
    const sig = new WeatherSignals(s, vitalsState(() => undefined), unsynced, NOW_MS, () => NOW_MS);
    sig.line(line(bolt));
    sig.line(line("It's a freezing night, the sky is snowy and lit by some flashes of lightning, and a strong wind blows."));
    sig.line(line('The lightning has stopped.'));
    expect(s.events).toEqual([{ e: 'strike', data: GAME_FLASH }]);
  });

  it('a new character or connection ends a window that may be open', () => {
    const s = rec();
    let now = NOW_MS;
    const sig = new WeatherSignals(s, vitalsState(() => undefined), unsynced, NOW_MS, () => now);
    sig.character('Gittan');
    sig.line(line(bolt));
    now += 10_000;
    sig.character(null); // reset: a new connection
    expect(s.events.at(-1)).toEqual({ e: 'storm.off' });
    // no window open: nothing to end
    s.events.length = 0;
    sig.character('Rasta');
    expect(s.events).toEqual([]);
  });

  it('a pin ends a window that may be open, and drops flashes while it holds', () => {
    const s = rec();
    let now = NOW_MS;
    const sig = new WeatherSignals(s, vitalsState(() => undefined), unsynced, NOW_MS, () => now);
    sig.line(line(bolt));
    now += 5_000;
    sig.pin({ weather: '"' });
    expect(s.events.at(-1)).toEqual({ e: 'storm.off' });
    s.events.length = 0;
    sig.line(line(bolt));
    expect(s.events).toEqual([]);
    sig.pin(null);
    // long after a flash: a pin sends nothing
    now += 60_000;
    sig.line(line(bolt));
    now += STORM_WINDOW_S * 1000 + 1;
    s.events.length = 0;
    sig.pin({ weather: '"' });
    expect(s.events).toEqual([]);
  });
});

describe('snow fades out over ~10 s (item 91)', () => {
  it('eases 1 → 0 over SNOW_FADE_S while it does not snow', () => {
    let v = 1;
    const at: number[] = [];
    for (let t = 0; t < SNOW_FADE_S + 0.5; t += 0.05) {
      at.push(snowFadeAlpha(v));
      v = snowFadeStep(v, false, 0.05);
    }
    expect(at[0]).toBe(1);
    expect(snowFadeAlpha(snowFadeStep(1, false, SNOW_FADE_S / 2))).toBeCloseTo(0.5, 5);
    expect(snowFadeStep(1, false, SNOW_FADE_S)).toBe(0);
    // soft at both ends
    expect(snowFadeAlpha(snowFadeStep(1, false, 0.5))).toBeGreaterThan(0.99);
    expect(snowFadeAlpha(snowFadeStep(1, false, SNOW_FADE_S - 0.5))).toBeLessThan(0.01);
    for (let i = 1; i < at.length; i++) expect(at[i]!).toBeLessThanOrEqual(at[i - 1]!);
  });

  it('comes back quickly when it snows again mid-fade', () => {
    const half = snowFadeStep(1, false, SNOW_FADE_S / 2);
    expect(snowFadeStep(half, true, SNOW_BACK_S / 2)).toBe(1);
    expect(SNOW_BACK_S).toBeLessThan(2);
  });
});

describe('cloud cover (item 92)', () => {
  const cover = (weather: WeatherState['weather']) => mixTargets({ ...new Director().raw, weather }, ALL_CATEGORIES).clouds;

  it('heavy rain and snow are fully overcast, light rain mostly, `~` partly', () => {
    expect(cover('*')).toBe(1);
    expect(cover('"')).toBe(1);
    expect(cover("'")).toBeGreaterThanOrEqual(0.85);
    expect(cover("'")).toBeLessThanOrEqual(0.9);
    expect(cover('~')).toBe(0.6);
    expect(cover(' ')).toBe(0);
    expect(cover(null)).toBe(0);
    expect(CLOUD_COVER['~']).toBeLessThan(CLOUD_COVER["'"]!);
  });
});
