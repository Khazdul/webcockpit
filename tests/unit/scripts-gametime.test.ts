// The game time API (ADR 0074 §2): gameTime, gameTimeFind, localTime and
// sysGameTimeEvent, with the real Lua runtime.

import { afterEach, describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { UiMessage } from '../../src/core/types';
import { momentSeconds } from '../../src/gmcp/clock';
import { nextMoonEvent } from '../../src/gmcp/gametime';
import { CLOCK_KEY, GameState } from '../../src/gmcp/state';
import { loadLuaRuntime } from '../../src/lua';
import { FakeScheduler, ScriptEngine } from '../../src/script/engine';
import { ScriptLibrary } from '../../src/scripts';
import { ScriptHost } from '../../src/scripts/host';

/** The clock anchor: 19 Wedmath 2855, 12:00 is unix NOW. */
const NOW = 1_791_000_000;
const EPOCH = NOW - momentSeconds(2855, 7, 19, 12, 0);

const hosts: ScriptHost[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.dispose();
});

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}

async function setup(body: string, precision: 'unset' | 'day' | 'hour' | 'minute' = 'minute') {
  const bus = new Bus();
  const sent: string[] = [];
  const ui: UiMessage[] = [];
  const now = { s: NOW };
  const timers: Array<{ fn: () => void; ms: number; live: boolean }> = [];
  const engine = new ScriptEngine({ send: (t) => sent.push(t), message: () => {}, scheduler: new FakeScheduler() });
  engine.attach(bus);
  const storage = new MemStorage();
  if (precision !== 'unset') storage.setItem(CLOCK_KEY, JSON.stringify({ epoch: EPOCH, precision, lastSync: NOW, reason: 'test' }));
  const game = new GameState({ now: () => now.s * 1000, storage: storage as unknown as Storage });
  game.attach(bus);
  bus.on('ui.message', (m) => ui.push(m));
  const lib = new ScriptLibrary({ factory: null, bundled: [] });
  await lib.create('s', `-- @api 1\n${body}`);
  await lib.setEnabled('s', true);
  const host = new ScriptHost({
    engine,
    bus,
    library: lib,
    game,
    send: (t) => sent.push(t),
    print: () => {},
    message: () => {},
    loadRuntime: () => loadLuaRuntime(),
    storage: null,
    epoch: () => now.s,
    setTimer: (fn, ms) => {
      const t = { fn, ms, live: true };
      timers.push(t);
      return t;
    },
    clearTimer: (h) => {
      (h as { live: boolean }).live = false;
    },
  });
  hosts.push(host);
  await host.start();
  const live = () => timers.filter((t) => t.live);
  /** Moves the wall clock to the live timer's time and runs it. */
  const tick = () => {
    const [t] = live();
    if (!t) throw new Error('no timer');
    t.live = false;
    now.s += t.ms / 1000;
    t.fn();
  };
  const errors = () => ui.filter((m) => m.kind === 'error').map((m) => m.parts.map((p) => (typeof p === 'string' ? p : p.value)).join(''));
  return { bus, sent, game, host, now, live, tick, errors };
}

describe('gameTime', () => {
  it('gives the game time now and at any real time', async () => {
    const t = await setup(`
      local g = gameTime()
      send(table.concat({g.year, g.month, g.monthName, g.sindarin, g.day, g.hour, g.minute, g.weekday, g.season, g.period, g.precision, g.dawn, g.dusk}, " "))
      send(g.moon.phase .. " " .. g.moon.level .. " " .. tostring(g.moon.waxing) .. " " .. g.moon.position .. " " .. tostring(g.moon.visible) .. " " .. tostring(g.moon.bright))
      send(tostring(g.epoch == getEpoch()))
      local later = gameTime(getEpoch() + 3600 * 24 * 2)
      send(later.year .. " " .. later.month .. " " .. later.day .. " " .. later.hour)
      local past = gameTime(getEpoch() - 61)
      send(past.day .. " " .. past.hour .. ":" .. past.minute)`);
    expect(t.errors()).toEqual([]);
    expect(t.sent[0]).toBe('2855 8 Wedmath Urui 19 12 0 Hevensday summer day minute 4 22');
    expect(t.sent[1]).toMatch(/^(new|waxing crescent|first quarter|waxing gibbous|full|waning gibbous|third quarter|waning crescent) \d+ (true|false) \w+ (true|false) (true|false)$/);
    expect(t.sent[2]).toBe('true');
    // Two real days = 4 game months.
    expect(t.sent[3]).toBe('2855 12 19 12');
    expect(t.sent[4]).toBe('19 10:59');
  });

  it('is nil while the clock is unset', async () => {
    const t = await setup(`send(tostring(gameTime()) .. " " .. tostring(gameTimeFind({season = "winter"})))`, 'unset');
    expect(t.sent).toEqual(['nil nil']);
  });
});

describe('gameTimeFind', () => {
  it('returns the next window as real times', async () => {
    const t = await setup(`
      local s, e = gameTimeFind({season = "autumn"})
      send((s - getEpoch()) .. " " .. (e - s))
      local r = gameTimeFind({at = "moonrise"})
      send(tostring(r))
      local a, b = gameTimeFind({hours = {from = 23, to = 1}})
      send((a - getEpoch()) .. " " .. (b - a))
      send(tostring(gameTimeFind({month = 1}, nil, 3600)))
      local w = gameTimeFind({moon = {"waxing gibbous", "full"}, at = "moonrise"}, getEpoch() + 100)
      send(tostring(w >= getEpoch() + 100))`);
    expect(t.errors()).toEqual([]);
    // Autumn starts on 1 Winterfilth: 1 month 11 days 12 h of game time ahead.
    const autumn = momentSeconds(2855, 9, 1, 0, 0) - momentSeconds(2855, 7, 19, 12, 0);
    expect(t.sent[0]).toBe(`${autumn} ${3 * 43_200}`);
    expect(Number(t.sent[1])).toBe(EPOCH + nextMoonEvent(NOW - EPOCH, 'rise'));
    expect(t.sent[2]).toBe(`${11 * 60} 120`);
    expect(t.sent[3]).toBe('nil');
    expect(t.sent[4]).toBe('true');
  });

  it('refuses bad conditions with clear errors', async () => {
    const t = await setup(`
      local function try(f) local ok, err = pcall(f) send(tostring(err)) end
      try(function() gameTimeFind({seasn = "winter"}) end)
      try(function() gameTimeFind({moon = "half"}) end)
      try(function() gameTimeFind("winter") end)
      try(function() gameTimeFind({}, nil, 0) end)`);
    expect(t.sent[0]).toMatch(/bad argument #1 to 'gameTimeFind' \(unknown key 'seasn' \(season, notSeason, month, hours, period, moon, moonVisible, at\)\)/);
    expect(t.sent[1]).toMatch(/moon: unknown value "half"/);
    expect(t.sent[2]).toMatch(/table expected, got string/);
    expect(t.sent[3]).toMatch(/bad argument #3 to 'gameTimeFind' \(horizon must be/);
  });
});

describe('localTime', () => {
  it('gives the local date like os.date("*t")', async () => {
    const t = await setup(`
      local l = localTime(getEpoch())
      send(table.concat({l.year, l.month, l.day, l.hour, l.min, l.sec, l.wday, l.yday}, " "))
      send(tostring(localTime().year == l.year))`);
    const d = new Date(NOW * 1000);
    const yday = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86_400_000) + 1;
    expect(t.sent[0]).toBe(
      [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getDay() + 1, yday].join(' '),
    );
    expect(t.sent[1]).toBe('true');
  });
});

describe('sysGameTimeEvent', () => {
  it('has no timer while no script listens', async () => {
    const t = await setup(`x = 1`);
    expect(t.live()).toEqual([]);
  });

  it('fires hour, dawn, dusk and moon kinds, one timer at a time', async () => {
    const t = await setup(`
      registerAnonymousEventHandler("sysGameTimeEvent", function(event, kind)
        local g = gameTime()
        send(kind .. " " .. g.hour .. ":" .. g.minute)
      end)`);
    expect(t.live()).toHaveLength(1);
    // From 12:00 to past dusk (22:00): ten hours, plus whatever the moon does.
    for (let i = 0; i < 40 && !t.sent.includes('dusk 22:0'); i++) t.tick();
    expect(t.sent.filter((s) => s.startsWith('hour '))).toEqual(
      ['13', '14', '15', '16', '17', '18', '19', '20', '21', '22'].map((h) => `hour ${h}:0`),
    );
    expect(t.sent).toContain('dusk 22:0');
    expect(t.sent.indexOf('dusk 22:0')).toBe(t.sent.indexOf('hour 22:0') + 1);
    expect(t.live()).toHaveLength(1);
  });

  it('fires sync when the clock syncs, and stops with the handler', async () => {
    const t = await setup(`
      h = registerAnonymousEventHandler("sysGameTimeEvent", function(event, kind)
        send(kind)
        if kind == "sync" then killAnonymousEventHandler(h) end
      end)`);
    t.bus.emit('gmcp', { pkg: 'Event.Sun', data: { what: 'dark' } });
    expect(t.sent).toEqual(['sync']);
    expect(t.live()).toEqual([]);
  });

  it('waits below hour precision', async () => {
    const t = await setup(`registerAnonymousEventHandler("sysGameTimeEvent", function(e, kind) send(kind) end)`, 'day');
    expect(t.live()).toEqual([]);
  });
});
