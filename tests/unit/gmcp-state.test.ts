import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import { type Line } from '../../src/core/types';
import type { InfoAnswer } from '../../src/gmcp/info-answer';
import { SEX_KEY } from '../../src/gmcp/sex';
import { CLOCK_KEY, GameState, type GamePart } from '../../src/gmcp/state';
import { ScriptEngine } from '../../src/script/engine';

const T = 1_790_449_200_000;

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}

const line = (text: string): Line => ({ text, runs: [], tags: [], prompt: false, raw: text, ts: 0 });

function setup(storage: MemStorage | null = new MemStorage(), now = () => T) {
  const bus = new Bus();
  const game = new GameState({ now, storage: storage as unknown as Storage }).attach(bus);
  const parts: GamePart[] = [];
  game.subscribe((p) => parts.push(p));
  const engine = new ScriptEngine({ send: () => {}, message: () => {} });
  engine.attach(bus);
  game.installRules(engine.system);
  return { bus, game, parts, engine, storage };
}

describe('GameState', () => {
  it('routes GMCP to the models and tells listeners what changed', () => {
    const t = setup();
    t.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
    t.bus.emit('gmcp', { pkg: 'Group.Set', data: [{ id: 2, type: 'ally', name: 'Gibur' }] });
    t.bus.emit('gmcp', { pkg: 'Comm.Channel.Text', data: {} });
    expect(t.parts).toEqual(['char', 'group']);
    expect(t.game.char.name).toBe('Rasta');
    expect(t.game.group.list()).toHaveLength(1);
  });

  it('the info answer: kept with its time, sets a readable wimpy, reset with the character', () => {
    const t = setup();
    const answer = (wimpy: number | null) => ({ wimpy }) as InfoAnswer;
    t.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
    t.parts.length = 0;
    t.game.applyInfo(answer(33));
    expect(t.parts).toEqual(['char', 'info']);
    expect(t.game.info.at).toBe(T);
    expect(t.game.char.view().wimpy).toBe(33);
    t.game.applyInfo(answer(null));
    expect(t.game.char.view().wimpy).toBe(33);
    t.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'rasta' } });
    expect(t.game.info.answer).not.toBeNull();
    t.parts.length = 0;
    t.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Gibur' } });
    expect(t.game.info.answer).toBeNull();
    // ('timers': the hub takes up the other character.)
    expect(t.parts).toEqual(['char', 'info', 'timers']);
    t.game.applyInfo(answer(5));
    t.bus.emit('conn.state', { state: 'connecting', prev: 'disconnected' });
    expect(t.game.info.answer).toBeNull();
    expect(t.game.info.at).toBeNull();
  });

  it('Char.Vitals fight fields reach the group', () => {
    const t = setup();
    t.bus.emit('gmcp', { pkg: 'Group.Set', data: [{ id: 2, type: 'ally', name: 'Gibur', hp: 100, maxhp: 100 }] });
    t.parts.length = 0;
    t.bus.emit('gmcp', { pkg: 'Char.Vitals', data: { buffer: 'Gibur', 'buffer-hits': 'bad' } });
    expect(t.parts).toEqual(['char', 'group']);
    expect(t.game.group.get(2)!.hp.word).toBe('bad');
  });

  it('resets on a new connection and a live disconnect, not after a replay', () => {
    const t = setup();
    const named = () => t.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
    named();
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing', replay: true });
    expect(t.game.char.name).toBe('Rasta');
    t.bus.emit('conn.state', { state: 'connecting', prev: 'disconnected' });
    expect(t.game.char.name).toBeNull();
    named();
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing', reason: 'closed' });
    expect(t.game.char.name).toBeNull();
  });

  it('wimpy lines are system rules', () => {
    const t = setup();
    t.engine.processLine(line('Wimpy set to: 50'));
    expect(t.game.char.view().wimpy).toBe(50);
    t.engine.processLine(line('Wimpy removed.'));
    expect(t.game.char.view().wimpy).toBe(0);
    t.engine.processLine(line('Wimpy set to: lots'));
    expect(t.game.char.view().wimpy).toBe(0);
    // Not in the profile.
    expect(t.engine.user.count('action')).toBe(0);
  });

  it('clock lines and Event.Sun sync the clock, which is saved', () => {
    const t = setup();
    t.engine.processLine(line('8 am on Sterday, the 12th of Astron, year 2973 of the Third Age.'));
    expect(t.game.clock.precision).toBe('hour');
    expect(t.parts).toContain('clock');
    t.bus.emit('gmcp', { pkg: 'Event.Sun', data: { what: 'rise' } });
    expect(t.game.clock.now(T)).toMatchObject({ hour: 7, minute: 0 });
    t.engine.processLine(line('The current time is 8:05am.'));
    expect(t.game.clock.now(T)).toMatchObject({ hour: 8, minute: 5 });
    const saved = JSON.parse(t.storage!.getItem(CLOCK_KEY)!);
    expect(saved).toMatchObject({ precision: 'minute', reason: 'room_clock', lastSync: T / 1000 });
    // A new page loads it.
    const again = new GameState({ now: () => T + 1000, storage: t.storage as unknown as Storage });
    expect(again.clock.now(T + 1000)).toMatchObject({ hour: 8, minute: 6 });
    // The clock survives a disconnect.
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
    expect(t.game.clock.precision).toBe('minute');
  });

  it('Event.Moon is checked against the moon model, never synced (stage 18)', () => {
    // Gittan 2026-10-03: Event.Moon set at unix 1791056163 under Cockpit's anchor.
    const nowMs = 1_791_056_163_580;
    const storage = new MemStorage();
    storage.setItem(CLOCK_KEY, JSON.stringify({ epoch: 310_694_465, precision: 'minute', lastSync: 1_791_050_765, reason: 'sun_light' }));
    const t = setup(storage, () => nowMs);
    t.parts.length = 0;
    t.bus.emit('gmcp', { pkg: 'Event.Moon', data: { what: 'set' } });
    expect(t.game.clock.state).toMatchObject({ epoch: 310_694_465, reason: 'sun_light', moonCheck: 'set +0' });
    expect(JSON.parse(storage.getItem(CLOCK_KEY)!).moonCheck).toBe('set +0');
    expect(t.parts).toEqual([]);
    // Two minutes later: +2. Unset clocks record nothing.
    const late = setup(storage, () => nowMs + 2000);
    late.bus.emit('gmcp', { pkg: 'Event.Moon', data: { what: 'set' } });
    expect(late.game.clock.state.moonCheck).toBe('set +2');
    const unset = setup(new MemStorage());
    unset.bus.emit('gmcp', { pkg: 'Event.Moon', data: { what: 'rise' } });
    expect(unset.game.clock.state.moonCheck).toBeUndefined();
  });

  it('MSSP time syncs the clock', () => {
    const t = setup();
    t.game.mssp(new Map([
      ['GAME YEAR', ['2973']],
      ['GAME MONTH', ['Astron']],
      ['GAME DAY', ['0']],
      ['GAME HOUR', ['9']],
    ]));
    expect(t.game.clock.now(T)).toMatchObject({ day: 1, hour: 9 });
  });

  it('works without storage', () => {
    const t = setup(null);
    t.engine.processLine(line('Sterday, the 12th of Astron, year 2973 of the Third Age.'));
    expect(t.game.clock.precision).toBe('day');
  });
});

describe('GameState: the sex (stage 77 part E2)', () => {
  const named = (t: ReturnType<typeof setup>, name: string, statusVars: Record<string, string> = { race: 'Orc', subrace: 'Tarkhnarb Orc' }): void => {
    t.bus.emit('gmcp', { pkg: 'Char.Name', data: { name } });
    t.bus.emit('gmcp', { pkg: 'Char.StatusVars', data: statusVars });
  };

  it('remembered per name: loaded at Char.Name, at once', () => {
    const storage = new MemStorage();
    storage.setItem(SEX_KEY, JSON.stringify({ rasta: 'female' }));
    const t = setup(storage);
    expect(t.game.sex).toBeNull();
    t.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
    expect(t.game.sex).toBe('female');
    expect(t.game.sexNeeded()).toBe(false);
    expect(t.parts).toEqual(['char']);
  });

  it('not remembered: needed, and the probe stores it', () => {
    const t = setup();
    expect(t.game.sexNeeded()).toBe(false);
    named(t, 'Rasta');
    expect(t.game.sex).toBeNull();
    expect(t.game.sexNeeded()).toBe(true);
    t.parts.length = 0;
    t.game.applySex('female');
    expect(t.parts).toEqual(['char']);
    expect(t.game.sex).toBe('female');
    expect(JSON.parse(t.storage!.getItem(SEX_KEY)!)).toEqual({ rasta: 'female' });
    expect(setup(t.storage).game.sex).toBeNull();
  });

  it('another character, a new connection: forgotten and loaded again', () => {
    const storage = new MemStorage();
    storage.setItem(SEX_KEY, JSON.stringify({ rasta: 'female' }));
    const t = setup(storage);
    named(t, 'Rasta');
    expect(t.game.sex).toBe('female');
    named(t, 'Gibur');
    expect(t.game.sex).toBeNull();
    named(t, 'Rasta');
    expect(t.game.sex).toBe('female');
    t.bus.emit('conn.state', { state: 'connecting', prev: 'disconnected' });
    expect(t.game.sex).toBeNull();
    named(t, 'Rasta');
    expect(t.game.sex).toBe('female');
  });

  it('read from a plain info the player typed: only with the own race', () => {
    const t = setup();
    named(t, 'Rasta');
    t.bus.emit('text.line', line("Bob says 'You are a female Tarkhnarb Orc.'"));
    t.bus.emit('text.line', line('You are a female Silvan Elf.'));
    expect(t.game.sex).toBeNull();
    t.bus.emit('text.line', line('You are a female Tarkhnarb Orc.'));
    expect(t.game.sex).toBe('female');
    expect(JSON.parse(t.storage!.getItem(SEX_KEY)!)).toEqual({ rasta: 'female' });
    t.bus.emit('text.line', line('You are a male Tarkhnarb Orc.'));
    expect(t.game.sex).toBe('male');
  });

  it('the race not known yet: the line is not read', () => {
    const t = setup();
    t.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
    t.bus.emit('text.line', line('You are a female Tarkhnarb Orc.'));
    expect(t.game.sex).toBeNull();
  });

  it('in a replay: read, not remembered', () => {
    const t = setup();
    t.bus.emit('conn.state', { state: 'playing', prev: 'login', replay: true });
    named(t, 'Rasta');
    t.bus.emit('text.line', line('You are a female Tarkhnarb Orc.'));
    expect(t.game.sex).toBe('female');
    expect(t.storage!.getItem(SEX_KEY)).toBeNull();
  });

  it('without storage: known for the page only', () => {
    const t = setup(null);
    named(t, 'Rasta');
    t.game.applySex('female');
    expect(t.game.sex).toBe('female');
    expect(t.game.sexNeeded()).toBe(false);
  });
});
