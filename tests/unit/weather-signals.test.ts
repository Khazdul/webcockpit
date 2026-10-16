import { describe, expect, it } from 'vitest';
import type { XmlSpan } from '../../src/core/types';
import { CharModel } from '../../src/gmcp/char';
import { type ClockState, momentSeconds } from '../../src/gmcp/clock';
import { moonAt } from '../../src/gmcp/gametime';
import { migrateSettings, defaultSettings } from '../../src/settings';
import { ALL_CATEGORIES, type WeatherEvent, type WeatherState } from '../../src/weather/protocol';
import { DWELL_MS, Director, mixTargets } from '../../src/weather/director';
import { WeatherSignals, almanacState, gmcpEvent, lineEvent, vitalsState } from '../../src/weather/signals';

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
    sig.gmcp('event.sun', { what: 'set' });
    sig.gmcp('event.moon', { what: 'rise' });
    sig.gmcp('event.darkness', { what: 'start' });
    sig.gmcp('char.vitals', { weather: '*' });
    expect(s.events).toEqual(['sun.set', 'moon.rise', 'darkness.start']);
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

  it('the login packet: outdoors in sunlight, no darkness', () => {
    const { sig } = run();
    expect(sig.state()).toMatchObject({ weather: ' ', fog: '', light: '*' });
    expect(mixTargets(sig.state(), ALL_CATEGORIES).evil).toBe(0);
  });

  it('walking down into a dark tunnel (prompt "o=": light o, weather null) settles to the darkness sky', () => {
    // "Limestone Tunnel" → "Darkness" in the owner's logs: the prompt's light goes from "*" to "o" underground.
    const { d, feed } = run();
    feed({ light: 'o', weather: null });
    d.settle(1);
    expect(d.settled.light).toBe('*');
    d.settle(1 + DWELL_MS);
    expect([d.settled.light, d.settled.weather]).toEqual(['o', null]);
    const m = mixTargets(d.settled, ALL_CATEGORIES);
    expect([m.outdoors, m.evil, m.sun]).toEqual([0, 1, 0]);
    // and stays red as long as the room is dark: another dark room changes nothing
    feed({ hp: 150 });
    d.settle(1 + DWELL_MS * 3);
    expect(mixTargets(d.settled, ALL_CATEGORIES).evil).toBe(1);
    // a lit room again ("!" indoors): the darkness sky goes
    feed({ light: '!' });
    d.settle(2 + DWELL_MS * 3);
    d.settle(2 + DWELL_MS * 4);
    expect(mixTargets(d.settled, ALL_CATEGORIES).evil).toBe(0);
  });

  it('a magical darkness on a road by day (prompt "o+", weather still sent) gives the darkness sky outdoors', () => {
    const { d, feed } = run();
    feed({ light: 'o' });
    d.settle(1);
    d.settle(1 + DWELL_MS);
    const m = mixTargets(d.settled, ALL_CATEGORIES);
    expect([m.outdoors, m.evil, m.sun, m.clouds]).toEqual([1, 1, 0, 0]);
  });

  it('Event.Darkness payloads are {what}; unknown ones are ignored', () => {
    expect(gmcpEvent('event.darkness', { what: 'start' })).toBe('darkness.start');
    expect(gmcpEvent('event.darkness', { what: 'end' })).toBe('darkness.end');
    expect(gmcpEvent('event.darkness', 'start')).toBeNull();
    expect(gmcpEvent('event.darkness', { what: 'deepen' })).toBeNull();
  });
});

describe('almanac', () => {
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

  it('starts from the almanac and applies only its predicted changes; an event wins in between', () => {
    const s = sink();
    // 1 Forelithe (month 5): dusk at 20. Start at 19:00, day.
    const clock = clockAt(5, 19);
    const sig = new WeatherSignals(s, empty, clock, NOW_MS);
    expect(sig.state().clock).toBe('day');
    // An Event.Sun set arrives early: night.
    sig.gmcp('event.sun', { what: 'set' });
    // The almanac still says day: no change pushed.
    sig.almanac(clock, NOW_MS + 30_000);
    expect(s.states.filter((x) => 'clock' in x.s)).toHaveLength(0);
    expect(sig.state().clock).toBe('night');
    // The almanac's dusk (an hour later = 60 s): its change to night is a no-op.
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
  it('defaults weather effects off with every category on, and migrates junk', () => {
    expect(defaultSettings().weather).toEqual({ enabled: false, sky: true, precipitation: true, lightning: true, fog: true, darkness: true, body: true });
    const old = defaultSettings() as unknown as Record<string, unknown>;
    delete old.weather;
    expect(migrateSettings(old).weather.enabled).toBe(false);
    const m = migrateSettings({ ...defaultSettings(), weather: { enabled: true, fog: false, sky: 'yes' } });
    expect(m.weather).toEqual({ enabled: true, sky: true, precipitation: true, lightning: true, fog: false, darkness: true, body: true });
  });
});

describe('installWeather (the app hook)', () => {
  it('loads nothing while off and tells the user once where the browser cannot run it', async () => {
    const { installWeather } = await import('../../src/weather/hook');
    const { SettingsStore } = await import('../../src/settings');
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
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
});
