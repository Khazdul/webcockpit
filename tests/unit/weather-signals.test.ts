import { describe, expect, it } from 'vitest';
import type { XmlSpan } from '../../src/core/types';
import { CharModel } from '../../src/gmcp/char';
import { type ClockState, momentSeconds } from '../../src/gmcp/clock';
import { moonAt, nextMoonEvent } from '../../src/gmcp/gametime';
import { migrateSettings, defaultSettings, phoneDefaultSettings } from '../../src/settings';
import { ALL_CATEGORIES, type WeatherEvent, type WeatherState } from '../../src/weather/protocol';
import { DWELL_MS, Director, mixTargets } from '../../src/weather/director';
import { MOON_AFTER_SET, SUN_U_STEP, WeatherSignals, almanacState, moonTimes, gmcpEvent, lineEvent, sunUpFraction, vitalsState } from '../../src/weather/signals';
import { categoriesOf } from '../../src/weather/controller';

const NOW_MS = 1_800_000_000_000;
const NOW_S = NOW_MS / 1000;

/** A clock synced so that NOW is the given game moment. */
function clockAt(month: number, hour: number, day = 10, precision: ClockState['precision'] = 'minute'): ClockState {
  return { epoch: NOW_S - momentSeconds(2855, month, day, hour, 0), precision, lastSync: NOW_S, reason: 'test' };
}

function sink() {
  const states: Array<{ s: Partial<WeatherState>; instant: boolean }> = [];
  const events: WeatherEvent[] = [];
  return {
    states,
    events,
    setState: (s: Partial<WeatherState>, o?: { instant?: boolean }) => states.push({ s, instant: !!o?.instant }),
    emit: (e: WeatherEvent) => events.push(e),
  };
}

const empty = vitalsState(() => undefined);
const line = (text: string, tags: XmlSpan[] = [], prompt = false) => ({ text, tags, prompt });
const wtag = (text: string, start = 0, end = text.length): XmlSpan[] => [{ tag: 'weather', start, end }];

describe('vitalsState', () => {
  it('maps the GMCP values and defaults absent ones to indoors, no fog, standing', () => {
    expect(empty).toEqual({ weather: null, fog: '', light: '', position: 'standing' });
    const m = new Map<string, unknown>([['weather', '"'], ['fog', '='], ['light', 'o'], ['position', 'Dying']]);
    expect(vitalsState((k) => m.get(k))).toEqual({ weather: '"', fog: '=', light: 'o', position: 'dying' });
    const bad = new Map<string, unknown>([['weather', 'x'], ['fog', null], ['light', null], ['position', '']]);
    expect(vitalsState((k) => bad.get(k))).toEqual(empty);
  });

  it('follows Char.Vitals deltas through the character model', () => {
    const char = new CharModel();
    const s = sink();
    const sig = new WeatherSignals(s, vitalsState((k) => char.vitals.get(k)), clockAt(5, 12), NOW_MS);
    const feed = (data: unknown) => {
      char.apply('Char.Vitals', data);
      sig.vitals(vitalsState((k) => char.vitals.get(k)));
    };
    feed({ hp: 100, weather: "'", fog: '-', position: 'standing' });
    expect(s.states.at(-1)!.s).toEqual({ weather: "'", fog: '-' });
    // A delta without the weather keys: nothing forwarded, the values kept.
    feed({ hp: 90 });
    expect(s.states).toHaveLength(1);
    feed({ position: 'sleeping' });
    expect(s.states.at(-1)!.s).toEqual({ position: 'sleeping' });
    // null = indoors.
    feed({ weather: null });
    expect(s.states.at(-1)!.s).toEqual({ weather: null });
    expect(sig.state()).toMatchObject({ weather: null, fog: '-', position: 'sleeping' });
    // A new connection clears the model: indoors, no fog, standing.
    char.reset();
    sig.vitals(vitalsState((k) => char.vitals.get(k)));
    expect(s.states.at(-1)!.s).toEqual({ fog: '', position: 'standing' });
  });
});

describe('GMCP events', () => {
  it('maps Event.Sun / Moon / Darkness and ignores anything else', () => {
    expect(gmcpEvent('event.sun', { what: 'rise' })).toBe('sun.rise');
    expect(gmcpEvent('event.sun', { what: 'dark' })).toBe('sun.dark');
    expect(gmcpEvent('event.moon', { what: 'set' })).toBe('moon.set');
    expect(gmcpEvent('event.darkness', { what: 'end-soon' })).toBe('darkness.end-soon');
    expect(gmcpEvent('event.darkness', { what: 'grow' })).toBe('darkness.grow');
    expect(gmcpEvent('event.sun', { what: 'noon' })).toBeNull();
    expect(gmcpEvent('event.moon', undefined)).toBeNull();
    expect(gmcpEvent('event.moved', { what: 'rise' })).toBeNull();
  });

  it('emits them and keeps the sky state for a restart', () => {
    const s = sink();
    const sig = new WeatherSignals(s, empty, clockAt(5, 12), NOW_MS);
    sig.gmcp('event.sun', { what: 'dark' });
    sig.gmcp('event.moon', { what: 'rise' });
    sig.gmcp('event.darkness', { what: 'start' });
    sig.gmcp('char.vitals', { weather: '*' });
    expect(s.events).toEqual(['sun.dark', 'moon.rise', 'darkness.start']);
    expect(sig.state()).toMatchObject({ clock: 'night', moonUp: true });
  });
});

describe('darkness from real Char.Vitals shapes (owner feedback 7)', () => {
  // The login packet as MUME sends it (tests/fixtures/gmcp-demo.log): a flat
  // object, `light` one of "*" | "!" | ")" | "o" (MUME docs, Cockpit
  // docs/gmcp.md), `fog` null, `weather` " " outdoors.
  const login = {
    hp: 172, maxhp: 172, mana: 40, maxmana: 40, mp: 131, maxmp: 131, xp: 5770000, tp: 41500, carrying: 'light',
    ride: null, ridden: null, climb: null, sneak: null, hidden: false, swim: false,
    light: '*', fog: null, weather: ' ', alertness: 'normal', mood: 'brave', 'spell-effort': 'normal', position: 'standing',
    'mount-moves': null, wimpy: 30, opponent: null, buffer: null, 'opponent-hits': null, 'buffer-hits': null,
  };

  function run() {
    const char = new CharModel();
    const s = sink();
    char.apply('Char.Vitals', login);
    const sig = new WeatherSignals(s, vitalsState((k) => char.vitals.get(k)), clockAt(5, 12), NOW_MS);
    const d = new Director(sig.state());
    const feed = (data: unknown): void => {
      char.apply('Char.Vitals', data);
      sig.vitals(vitalsState((k) => char.vitals.get(k)));
      for (const x of s.states.splice(0)) d.set(x.s);
    };
    return { sig, d, feed };
  }

  it('the login packet: outdoors in sunlight; no mix value is a darkness sky (owner feedback 26)', () => {
    const { sig } = run();
    expect(sig.state()).toMatchObject({ weather: ' ', fog: '', light: '*' });
    expect(Object.keys(mixTargets(sig.state(), ALL_CATEGORIES))).not.toContain('evil');
  });

  it('walking down into a dark tunnel (prompt "o=": light o, weather null) is just indoors', () => {
    // "Limestone Tunnel" → "Darkness" in the owner's logs: the prompt's light goes from "*" to "o" underground.
    const { d, feed } = run();
    feed({ light: 'o', weather: null });
    d.settle(1);
    d.settle(1 + DWELL_MS);
    expect([d.settled.light, d.settled.weather]).toEqual(['o', null]);
    const m = mixTargets(d.settled, ALL_CATEGORIES);
    // the time of day stays (sun 1); outdoors 0 gates the whole sky
    expect([m.outdoors, m.sun]).toEqual([0, 1]);
  });

  it('light alone never changes the sky: "o+" on a road by day is the day sky', () => {
    const { d, feed } = run();
    feed({ light: 'o' });
    d.settle(1);
    d.settle(1 + DWELL_MS);
    const m = mixTargets(d.settled, ALL_CATEGORIES);
    expect([m.outdoors, m.sun]).toEqual([1, 1]);
  });
  it('Event.Darkness payloads are {what}; unknown ones are ignored', () => {
    expect(gmcpEvent('event.darkness', { what: 'start' })).toBe('darkness.start');
    expect(gmcpEvent('event.darkness', { what: 'end' })).toBe('darkness.end');
    expect(gmcpEvent('event.darkness', 'start')).toBeNull();
    expect(gmcpEvent('event.darkness', { what: 'deepen' })).toBeNull();
  });
});

describe('magical darkness: only its Event.Darkness events (owner feedback 26)', () => {
  it('the room text of a darkened room and the spell taking hold give nothing', () => {
    const s = sink();
    const sig = new WeatherSignals(s, empty, clockAt(5, 12), NOW_MS);
    for (const t of ['Hollin Road', 'A deep, wavering darkness lingers here.', 'Exits: *east*, south, *west*.', 'The light decreases.', 'A deep, impenetrable darkness lingers here.', 'Exits: north.'])
      sig.line(line(t));
    expect(s.states).toEqual([]);
    expect(s.events).toEqual([]);
    expect(sig.state()).not.toHaveProperty('magic');
  });
});

describe('almanac', () => {
  it("gives how far the sun is through the day (sunU) for the glimpses: 0 when the day begins, 1 when the night begins, -1 at night (owner feedback 52, items 59, 61)", () => {
    // month 5 (Forelithe): dawn hour 6 (still night), the day 7 → 21 (the dusk hour 20 still day)
    expect(sunUpFraction(5, 7, 0)).toBe(0);
    expect(sunUpFraction(5, 14, 0)).toBeCloseTo(0.5, 6);
    expect(sunUpFraction(5, 20, 59)).toBeLessThan(1);
    expect(sunUpFraction(5, 21, 0)).toBe(1);
    // month 0 (Afteryule): dawn hour 8, the day 9 → 19
    expect(sunUpFraction(0, 14, 0)).toBeCloseTo(0.5, 6);
    expect(almanacState(clockAt(5, 13), NOW_MS).sunU).toBeCloseTo(6 / 14, 6);
    expect(almanacState(clockAt(5, 20), NOW_MS).sunU).toBeCloseTo(13 / 14, 6);
    expect(almanacState(clockAt(5, 21), NOW_MS).sunU).toBe(-1);
    expect(almanacState(clockAt(5, 6), NOW_MS).sunU).toBe(-1);
    expect(almanacState(clockAt(5, 2), NOW_MS).sunU).toBe(-1);
    expect(almanacState(clockAt(5, 13, 10, 'unset'), NOW_MS).sunU).toBe(-1);
  });

  it('sends sunU at start, on a sync and once it has moved on by SUN_U_STEP, not on every re-read', () => {
    const c = clockAt(5, 9);
    const s = sink();
    const sig = new WeatherSignals(s, empty, c, NOW_MS);
    expect(sig.state().sunU).toBeCloseTo(2 / 14, 6);
    sig.almanac(c, NOW_MS + 30_000);
    expect(s.states.filter((x) => 'sunU' in x.s)).toHaveLength(0);
    // the day is 14 game hours = 840 real s; SUN_U_STEP of it later, sent
    sig.almanac(c, NOW_MS + (Math.ceil(SUN_U_STEP * 840) + 1) * 1000);
    expect(s.states.filter((x) => 'sunU' in x.s)).toHaveLength(1);
    sig.almanac(c, NOW_MS + 60_000, true);
    expect(s.states.filter((x) => 'sunU' in x.s)).toHaveLength(2);
  });

  it('gives the sun, the moon and its phase from the clock', () => {
    const day = almanacState(clockAt(5, 12), NOW_MS);
    expect(day.sky?.clock).toBe('day');
    const night = almanacState(clockAt(5, 2), NOW_MS);
    expect(night.sky?.clock).toBe('night');
    const c = clockAt(5, 2);
    const moon = moonAt(NOW_S - c.epoch);
    expect(night.sky?.moonUp).toBe(moon.position !== 'below');
    expect(night.moonPhase).toBeCloseTo(moon.level / 12);
    // Never synced: no sun or moon, the phase anyway.
    const unset = almanacState(clockAt(5, 2, 10, 'unset'), NOW_MS);
    expect(unset.sky).toBeNull();
    expect(unset.moonPhase).toBeGreaterThanOrEqual(0);
  });

  it("gives the moon's place on its way (moonU) at start and on a clock sync, not every re-read", () => {
    // an hour of the night with the moon well up
    let c = clockAt(5, 0);
    search: for (let day = 1; day <= 30; day++) {
      for (let h = 0; h < 24; h++) {
        c = clockAt(5, h, day);
        if (moonAt(NOW_S - c.epoch).position === 'south' && almanacState(c, NOW_MS).sky?.clock === 'night') break search;
      }
    }
    const s = sink();
    const sig = new WeatherSignals(s, empty, c, NOW_MS);
    expect(sig.state().moonUp).toBe(true);
    expect(sig.state().moonU).toBeGreaterThan(0.2);
    expect(sig.state().moonU).toBeLessThan(0.8);
    sig.almanac(c, NOW_MS + 30_000);
    expect(s.states.filter((x) => 'moonU' in x.s)).toHaveLength(0);
    sig.almanac(c, NOW_MS + 30_000, true);
    expect(s.states.filter((x) => 'moonU' in x.s)).toHaveLength(1);
    // Event.Moon: a rise puts it at the start, a set takes it away
    sig.gmcp('event.moon', { what: 'rise' });
    expect(sig.state()).toMatchObject({ moonUp: true, moonU: 0 });
    sig.gmcp('event.moon', { what: 'set' });
    expect(sig.state()).toMatchObject({ moonUp: false, moonU: -1 });
    // unsynced: unknown
    expect(new WeatherSignals(sink(), empty, clockAt(5, 2, 10, 'unset'), NOW_MS).state().moonU).toBe(-1);
  });

  it('the dawn hour is night; the day and dayAt come at dawn + 1 (items 59, 60)', () => {
    // Forelithe (5): dawn hour 6, the day from 7:00.
    const c = clockAt(5, 6);
    const a = almanacState(c, NOW_MS);
    expect(a.sky?.clock).toBe('night');
    expect(a.dayAt).toBe(NOW_MS + 60_000);
    // mid-rise: the same second
    expect(almanacState(c, NOW_MS + 30_400).dayAt).toBe(NOW_MS + 60_000);
    // the day has begun: dayAt is its start, until nightfall gives tomorrow's
    const d = almanacState(c, NOW_MS + 60_000);
    expect([d.sky?.clock, d.dayAt, d.sunU]).toEqual(['day', NOW_MS + 60_000, 0]);
    expect(almanacState(c, NOW_MS + 15 * 60_000).dayAt).toBe(NOW_MS + 60_000 + 1440_000);
    // below minute precision: no time-driven sunrise
    expect(almanacState(clockAt(5, 6, 10, 'hour'), NOW_MS).dayAt).toBe(-1);
    expect(almanacState(clockAt(5, 6, 10, 'unset'), NOW_MS).dayAt).toBe(-1);
  });

  it('the dusk hour is day; the night and nightAt come at dusk + 1 (item 61)', () => {
    // Forelithe (5): dusk hour 20, the night from 21:00.
    const c = clockAt(5, 20);
    const a = almanacState(c, NOW_MS);
    expect(a.sky?.clock).toBe('day');
    expect(a.nightAt).toBe(NOW_MS + 60_000);
    expect(almanacState(c, NOW_MS + 30_400).nightAt).toBe(NOW_MS + 60_000);
    // the night has begun: nightAt is its start, until daybreak gives the next
    const n = almanacState(c, NOW_MS + 60_000);
    expect([n.sky?.clock, n.nightAt, n.sunU]).toEqual(['night', NOW_MS + 60_000, -1]);
    expect(almanacState(c, NOW_MS + 9 * 60_000).nightAt).toBe(NOW_MS + 60_000);
    expect(almanacState(c, NOW_MS + 11 * 60_000).nightAt).toBe(NOW_MS + 60_000 + 1440_000);
    expect(almanacState(clockAt(5, 20, 10, 'hour'), NOW_MS).nightAt).toBe(-1);
  });

  it('sends nightAt when it changes; Event.Sun set keeps the day, dark brings the night', () => {
    const s = sink();
    const c = clockAt(5, 20);
    const sig = new WeatherSignals(s, empty, c, NOW_MS);
    expect(sig.state()).toMatchObject({ clock: 'day', nightAt: NOW_MS + 60_000 });
    sig.almanac({ ...c, epoch: c.epoch - 3 }, NOW_MS + 10_000, true);
    expect(s.states.at(-1)!.s).toMatchObject({ nightAt: NOW_MS + 57_000 });
    sig.gmcp('event.sun', { what: 'set' });
    expect(s.events.at(-1)).toBe('sun.set');
    expect(sig.state().clock).toBe('day');
    sig.gmcp('event.sun', { what: 'dark' });
    expect(sig.state()).toMatchObject({ clock: 'night', sunU: -1 });
  });

  it('sends dayAt at start and when it changes; Event.Sun rise keeps the night, light brings the day', () => {
    const s = sink();
    const c = clockAt(5, 6);
    const sig = new WeatherSignals(s, empty, c, NOW_MS);
    expect(sig.state()).toMatchObject({ clock: 'night', dayAt: NOW_MS + 60_000 });
    sig.almanac(c, NOW_MS + 30_000);
    expect(s.states.filter((x) => 'dayAt' in x.s)).toHaveLength(0);
    // a resync that moves the clock 2 s: the new second goes out
    const c2 = { ...c, epoch: c.epoch + 2 };
    sig.almanac(c2, NOW_MS + 31_000, true);
    expect(s.states.at(-1)!.s).toMatchObject({ dayAt: NOW_MS + 62_000 });
    sig.gmcp('event.sun', { what: 'rise' });
    expect(s.events.at(-1)).toBe('sun.rise');
    expect(sig.state().clock).toBe('night');
    sig.gmcp('event.sun', { what: 'light' });
    expect(sig.state()).toMatchObject({ clock: 'day', sunU: 0 });
  });

  it("gives the moon's rise and set (moonRiseAt / moonSetAt): its time up now, else the next, at minute precision (items 63, 69)", () => {
    const c = clockAt(5, 2);
    const g0 = NOW_S - c.epoch;
    // over a game day and a half, minute by minute (every 7th): the times are the moon's own
    let changes = 0, last = -1;
    for (let g = g0; g < g0 + 2200; g += 7) {
      const m = moonTimes(c.epoch, g);
      const rise = m.moonRiseAt / 1000 - c.epoch, set = m.moonSetAt / 1000 - c.epoch;
      expect(nextMoonEvent(rise, 'rise')).toBe(rise);
      expect(nextMoonEvent(rise, 'set')).toBe(set);
      expect(set - rise).toBeGreaterThan(700);
      expect(set - rise).toBeLessThan(800);
      if (moonAt(g).position !== 'below') expect([rise <= g, g < set]).toEqual([true, true]);
      else expect(g < rise || g < set + MOON_AFTER_SET).toBe(true);
      if (m.moonRiseAt !== last) (changes++, (last = m.moonRiseAt));
    }
    expect(changes).toBeGreaterThanOrEqual(2);
    const a = almanacState(c, NOW_MS);
    expect(a).toMatchObject(moonTimes(c.epoch, g0));
    expect(almanacState(clockAt(5, 2, 10, 'hour'), NOW_MS)).toMatchObject({ moonRiseAt: -1, moonSetAt: -1 });
    // sent when they move on: MOON_AFTER_SET after the set
    const s = sink();
    const sig = new WeatherSignals(s, empty, c, NOW_MS);
    expect(sig.state()).toMatchObject({ moonRiseAt: a.moonRiseAt, moonSetAt: a.moonSetAt });
    sig.almanac(c, a.moonSetAt + (MOON_AFTER_SET - 1) * 1000);
    expect(s.states.filter((x) => 'moonRiseAt' in x.s)).toHaveLength(0);
    sig.almanac(c, a.moonSetAt + MOON_AFTER_SET * 1000);
    expect(s.states.at(-1)!.s.moonRiseAt).toBeGreaterThan(a.moonSetAt);
    expect(s.states.at(-1)!.s.moonSetAt).toBeGreaterThan(s.states.at(-1)!.s.moonRiseAt!);
  });

  it('starts from the almanac and applies only its predicted changes; an event wins in between', () => {
    const s = sink();
    // 1 Forelithe (month 5): dusk hour 20, night from 21. Start at 20:00, day.
    const clock = clockAt(5, 20);
    const sig = new WeatherSignals(s, empty, clock, NOW_MS);
    expect(sig.state().clock).toBe('day');
    // An Event.Sun dark arrives early: night.
    sig.gmcp('event.sun', { what: 'dark' });
    // The almanac still says day: no change pushed.
    sig.almanac(clock, NOW_MS + 30_000);
    expect(s.states.filter((x) => 'clock' in x.s)).toHaveLength(0);
    expect(sig.state().clock).toBe('night');
    // The almanac's night (an hour later = 60 s): its change to night is a no-op.
    sig.almanac(clock, NOW_MS + 61_000);
    expect(s.states.filter((x) => 'clock' in x.s)).toHaveLength(0);
    // Forced (the clock was synced): the almanac decides.
    const dayClock = clockAt(5, 12);
    sig.almanac(dayClock, NOW_MS, true);
    expect(s.states.at(-1)!.s).toMatchObject({ clock: 'day' });
  });
});

describe('lightning and gusts from text lines', () => {
  const bolt = 'A bright streak of lightning flashes over the snow-covered mountains.';

  it('strikes on a lightning flash in a weather tag', () => {
    expect(lineEvent(line(bolt, wtag(bolt)))).toBe('strike');
    expect(lineEvent(line('A bright streak of lightning flashes over the wet mountains.', wtag('x', 0, 60)))).toBe('strike');
    expect(lineEvent(line('Suddenly lightning strikes the tower!', wtag('Suddenly lightning strikes the tower!')))).toBe('strike');
  });

  it('falls back to the exact flash message without a weather tag', () => {
    expect(lineEvent(line(bolt))).toBe('strike');
    expect(lineEvent(line('A bright streak of lightning flashes over the wet mountains.', [{ tag: 'room', start: 0, end: 10 }]))).toBe('strike');
  });

  it('does not strike on other lightning mentions', () => {
    const sky = 'The sky is dark and stormy, lit by some flashes of lightning.';
    expect(lineEvent(line(sky, wtag(sky)))).toBeNull();
    expect(lineEvent(line(sky))).toBeNull();
    expect(lineEvent(line('The lightning has stopped.', wtag('The lightning has stopped.')))).toBeNull();
    expect(lineEvent(line('The lightning has stopped.'))).toBeNull();
    expect(lineEvent(line('*Indomie the Half-Elf* sends a powerful lightning bolt at you!'))).toBeNull();
    expect(lineEvent(line("Rasta narrates 'A bright streak of lightning flashes over us'"))).toBeNull();
    expect(lineEvent(line(`  ${bolt}`))).toBeNull();
    // A weather tag on the line that is not a flash: no fallback either.
    const rain = 'It starts to rain.';
    expect(lineEvent(line(`${rain} ${bolt}`, wtag(rain)))).toBeNull();
    // Prompts never.
    expect(lineEvent(line(bolt, [], true))).toBeNull();
  });

  it('gusts on a wind message', () => {
    const wind = 'You can feel a tempestuous wind coming from the north.';
    expect(lineEvent(line(wind, wtag(wind)))).toBe('gust');
    expect(lineEvent(line(wind))).toBe('gust');
    expect(lineEvent(line('Gandalf says the wind coming from the north is cold.'))).toBeNull();
  });

  it('emits through the bridge', () => {
    const s = sink();
    const sig = new WeatherSignals(s, empty, clockAt(5, 12), NOW_MS);
    sig.line(line(bolt));
    sig.line(line('Nothing here.'));
    expect(s.events).toEqual(['strike']);
  });
});

describe('pin', () => {
  it('holds pinned values over the game until released', () => {
    const s = sink();
    const sig = new WeatherSignals(s, empty, clockAt(5, 12), NOW_MS);
    sig.pin({ weather: '"', fog: '=' });
    expect(s.states.at(-1)).toMatchObject({ s: { weather: '"', fog: '=' }, instant: true });
    sig.vitals({ ...empty, weather: ' ', position: 'sleeping' });
    expect(s.states.at(-1)!.s).toEqual({ position: 'sleeping' });
    sig.pin(null);
    expect(s.states.at(-1)).toMatchObject({ s: { weather: ' ', fog: '' }, instant: true });
  });
});

describe('settings', () => {
  it('defaults weather effects on with every category on (ADR 0092), off on a phone, and migrates junk', () => {
    expect(defaultSettings().weather).toEqual({ enabled: true, sky: true, daySky: true, precipitation: true, lightning: true, fog: true, darkness: true, body: true });
    expect(phoneDefaultSettings().weather.enabled).toBe(false);
    const old = defaultSettings() as unknown as Record<string, unknown>;
    delete old.weather;
    expect(migrateSettings(old).weather.enabled).toBe(true);
    expect(migrateSettings(old, { phone: true }).weather.enabled).toBe(false);
    const m = migrateSettings({ ...defaultSettings(), weather: { enabled: true, fog: false, sky: 'yes' } });
    expect(m.weather).toEqual({ enabled: true, sky: true, daySky: true, precipitation: true, lightning: true, fog: false, darkness: true, body: true });
  });

  it('keeps the blue day sky switch on its own (owner feedback 36)', () => {
    // absent (settings saved before the switch) = on, as before
    expect(migrateSettings({ ...defaultSettings(), weather: { enabled: true, sky: false } }).weather).toMatchObject({ sky: false, daySky: true });
    const off = migrateSettings({ ...defaultSettings(), weather: { enabled: true, daySky: false } }).weather;
    expect(off).toMatchObject({ enabled: true, sky: true, daySky: false });
    expect(migrateSettings({ weather: { daySky: 0 } }).weather.daySky).toBe(true);
    expect(categoriesOf({ ...defaultSettings(), weather: off })).toEqual({ ...ALL_CATEGORIES, daySky: false });
    expect(categoriesOf(defaultSettings())).toEqual(ALL_CATEGORIES);
  });
});

describe('installWeather (the app hook)', () => {
  it('loads nothing while off and tells the user once where the browser cannot run it', async () => {
    const { installWeather } = await import('../../src/weather/hook');
    const { SettingsStore } = await import('../../src/settings');
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    settings.update({ weather: { enabled: false } });
    const notes: string[] = [];
    const hook = installWeather({ bus: {} as never, game: {} as never, cockpit: {} as never, settings, notify: (t) => notes.push(t) });
    expect(hook.controller).toBeNull();
    expect(notes).toEqual([]);
    // jsdom has no OffscreenCanvas: enabling reports it and stays off.
    settings.update({ weather: { enabled: true } });
    expect(await hook.settled()).toBeNull();
    expect(notes).toHaveLength(1);
    settings.update({ weather: { fog: false } });
    expect(notes).toHaveLength(1);
    settings.update({ weather: { enabled: false } });
    settings.update({ weather: { enabled: true } });
    expect(notes).toHaveLength(2);
    hook.dispose();
  });

  it('a new player has the weather on (ADR 0092): where the browser cannot run it, the user is told at once', async () => {
    const { installWeather } = await import('../../src/weather/hook');
    const { SettingsStore } = await import('../../src/settings');
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    const notes: string[] = [];
    const hook = installWeather({ bus: {} as never, game: {} as never, cockpit: {} as never, settings, notify: (t) => notes.push(t) });
    expect(await hook.settled()).toBeNull();
    expect(notes).toHaveLength(1);
    hook.dispose();
  });
});

describe('game events held back while a pin holds (owner item 85)', () => {
  function rec() {
    const states: Array<Partial<WeatherState>> = [];
    const events: Array<{ e: WeatherEvent; data?: unknown }> = [];
    return {
      states,
      events,
      setState: (s: Partial<WeatherState>) => states.push(s),
      emit: (e: WeatherEvent, data?: unknown) => events.push(data === undefined ? { e } : { e, data }),
    };
  }
  const unsynced: ClockState = { epoch: 0, precision: 'unset', lastSync: 0, reason: 'test' };
  const DEMO_PIN: Partial<WeatherState> = { clock: 'night', moonUp: false, dayAt: -1, nightAt: -1, moonRiseAt: -1, moonSetAt: -1 };

  it('a real Event.Sun dark / set and Event.Moon rise during a pin do not reach the engine; the release applies them', () => {
    const s = rec();
    const sig = new WeatherSignals(s, empty, clockAt(5, 12), NOW_MS, () => NOW_MS);
    sig.pin({ ...DEMO_PIN, clock: 'day' }, true);
    s.states.length = 0;
    sig.gmcp('event.sun', { what: 'set' });
    sig.gmcp('event.sun', { what: 'dark' });
    sig.gmcp('event.moon', { what: 'rise' });
    expect(s.events).toEqual([]);
    expect(s.states).toEqual([]);
    expect(sig.state()).toMatchObject({ clock: 'day', moonUp: false });
    sig.pin(null, true);
    expect(s.states.at(-1)).toMatchObject({ clock: 'night', moonUp: true, moonU: 0, sunU: -1 });
    // the night already began: no sunset is replayed
    expect(s.events).toEqual([]);
  });

  it('lightning and gusts are dropped while a pin holds, and pass again after', () => {
    const s = rec();
    const sig = new WeatherSignals(s, empty, clockAt(5, 12), NOW_MS);
    sig.pin(DEMO_PIN, true);
    sig.line(line('A bright streak of lightning flashes over the wet mountains.'));
    sig.line(line('You can feel a tempestuous wind coming from the north.'));
    sig.pin(null, true);
    expect(s.events).toEqual([]);
    sig.line(line('A bright streak of lightning flashes over the wet mountains.'));
    expect(s.events).toEqual([{ e: 'strike' }]);
  });

  it('a sunset the game opened during the pin joins at its place on release when the clock does not time it', () => {
    const s = rec();
    let now = NOW_MS;
    const sig = new WeatherSignals(s, empty, unsynced, NOW_MS, () => now);
    sig.pin({ ...DEMO_PIN, clock: 'day' }, true);
    sig.gmcp('event.sun', { what: 'set' });
    now += 20_000;
    sig.pin(null, true);
    expect(s.events).toEqual([{ e: 'sun.set', data: { from: -40 } }]);
  });

  it('no replay when the clock times the turn, or once its minute is over', () => {
    const s = rec();
    let now = NOW_MS;
    const timed = new WeatherSignals(s, empty, clockAt(5, 12), NOW_MS, () => now);
    timed.pin(DEMO_PIN, true);
    timed.gmcp('event.sun', { what: 'set' });
    timed.pin(null, true);
    const late = new WeatherSignals(s, empty, unsynced, NOW_MS, () => now);
    late.pin(DEMO_PIN, true);
    late.gmcp('event.sun', { what: 'rise' });
    now += 61_000;
    late.pin(null, true);
    expect(s.events).toEqual([]);
  });

  it('a darkness begun during the pin and not ended starts on release; one that ended does not', () => {
    const s = rec();
    const sig = new WeatherSignals(s, empty, clockAt(5, 12), NOW_MS);
    sig.pin(DEMO_PIN, true);
    sig.gmcp('event.darkness', { what: 'start' });
    sig.pin(null, true);
    expect(s.events).toEqual([{ e: 'darkness.start' }]);
    s.events.length = 0;
    sig.pin(DEMO_PIN, true);
    sig.gmcp('event.darkness', { what: 'start' });
    sig.gmcp('event.darkness', { what: 'end' });
    sig.pin(null, true);
    expect(s.events).toEqual([]);
  });

  it('a pin that only changes keeps holding; events pass without a pin', () => {
    const s = rec();
    const sig = new WeatherSignals(s, empty, clockAt(5, 12), NOW_MS);
    sig.pin(DEMO_PIN, true);
    sig.pin({ ...DEMO_PIN, dayAt: NOW_MS + 60_000 }, true);
    sig.gmcp('event.sun', { what: 'dark' });
    expect(s.events).toEqual([]);
    sig.pin(null);
    sig.gmcp('event.sun', { what: 'light' });
    expect(s.events).toEqual([{ e: 'sun.light' }]);
  });
});
