import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { UiMessage } from '../../src/core/types';
import { xpForLevel } from '../../src/gmcp/levels';
import { GameState } from '../../src/gmcp/state';
import { type RunEvent, RunEventDeriver, fmtXp, parseDeathLine, stripLabel } from '../../src/runs/events';
import { ScriptEngine } from '../../src/script/engine';
import { FakeScheduler } from '../../src/script/engine/timers';

const T0 = 1_790_000_000_000; // ms

function plain(m: UiMessage): string {
  return `◆ ${m.tag}: ` + m.parts.map((p) => (typeof p === 'string' ? p : p.value)).join('');
}

/** `own`: the deriver keeps its group model; `shared-*`: it reads GameState's, subscribed before or after it. */
type GroupMode = 'own' | 'shared-before' | 'shared-after';

function setup(mode: GroupMode = 'own') {
  const bus = new Bus();
  const sched = new FakeScheduler();
  let t = T0;
  const game = mode === 'shared-after' ? new GameState({ storage: null }).attach(bus) : null;
  const d = new RunEventDeriver({ now: () => t, scheduler: sched }).attach(bus);
  if (mode !== 'own') d.shareGroup(game ?? new GameState({ storage: null }).attach(bus));
  const engine = new ScriptEngine({ send: () => {}, message: () => {}, scheduler: sched });
  engine.attach(bus);
  d.installRules(engine.system);
  const events: RunEvent[] = [];
  d.subscribe((e) => events.push(e));
  const ui: string[] = [];
  bus.on('ui.message', (m) => ui.push(plain(m)));
  const us = () => t * 1000;
  const conn = (state: 'connecting' | 'login' | 'playing' | 'disconnected', prev: string, replay = false) =>
    bus.emit('conn.state', { state, prev: prev as never, ...(replay ? { replay: true as const } : {}) });
  const gmcp = (pkg: string, data: unknown) => {
    bus.emit('gmcp.raw', { pkg, json: JSON.stringify(data), ts: us() });
    bus.emit('gmcp', { pkg, data });
  };
  const play = (name = 'Rasta', replay = false) => {
    conn('connecting', 'idle', replay);
    conn('login', 'connecting', replay);
    gmcp('Char.Name', { name, fullname: name + ' the Wanderer' });
    conn('playing', 'login', replay);
  };
  const line = (text: string) =>
    bus.emit('text.line', { text, raw: text, runs: [], tags: [], prompt: false, ts: us() });
  const advance = (ms: number) => {
    t += ms;
    sched.advance(ms);
  };
  const types = () => events.map((e) => e.type);
  return { bus, d, events, ui, us, conn, gmcp, play, line, advance, types };
}

describe('death lines', () => {
  it('classifies mob, pc and own deaths, pc form first', () => {
    expect(parseDeathLine('A guard is dead! R.I.P.')).toEqual({ kind: 'mob', name: 'A guard' });
    expect(parseDeathLine('The orkish bodyguard has drawn his last breath! R.I.P.')).toEqual({
      kind: 'mob',
      name: 'The orkish bodyguard',
    });
    expect(parseDeathLine('A wight-noble disappears into nothing.')).toEqual({ kind: 'mob', name: 'A wight-noble' });
    expect(parseDeathLine('A pack horse (MIN) is dead! R.I.P.')).toEqual({ kind: 'mob', name: 'A pack horse' });
    expect(parseDeathLine('*Ibuki the Half-Elf* has drawn her last breath! R.I.P.')).toEqual({
      kind: 'pc',
      name: 'Ibuki',
      race: 'the Half-Elf',
    });
    expect(parseDeathLine('*Uzbâd the Broadbeam Dwarf* is dead! R.I.P.')).toEqual({
      kind: 'pc',
      name: 'Uzbâd',
      race: 'the Broadbeam Dwarf',
    });
    // MUME's label sits after the stars.
    expect(parseDeathLine('*a Dwarf* (m) has drawn his last breath! R.I.P.')).toEqual({ kind: 'pc', name: 'a Dwarf', race: '' });
    expect(parseDeathLine('You are dead! Sorry...')).toEqual({ kind: 'char' });
    expect(parseDeathLine("A village guard says 'I'll defend my home with my last breath!' in Beorning.")).toBeNull();
    expect(parseDeathLine('You hit the orc.')).toBeNull();
    expect(parseDeathLine(' is dead! R.I.P.')).toBeNull();
  });

  it('strips only a trailing label and formats XP as Cockpit', () => {
    expect(stripLabel('A pack horse (MIN)')).toBe('A pack horse');
    expect(stripLabel('A (weird) horse')).toBe('A (weird) horse');
    expect(stripLabel('(x)')).toBe('(x)');
    expect([fmtXp(950), fmtXp(5424), fmtXp(48210), fmtXp(0)]).toEqual(['950', '5.4k', '48k', '0']);
  });
});

describe('RunEventDeriver', () => {
  it('starts at the first Char.Vitals of a playing connection with the baseline', () => {
    const t = setup();
    t.gmcp('Char.Vitals', { xp: 5 }); // not playing
    t.play();
    t.line('A guard is dead! R.I.P.'); // before run_start: ignored
    t.gmcp('Char.StatusVars', { level: 25 });
    expect(t.d.started).toBe(false);
    const xp = xpForLevel(26) + 100;
    t.gmcp('Char.Vitals', { hp: 100, xp, tp: 40_000 });
    expect(t.events).toEqual([{ type: 'run_start', us: t.us(), character: 'Rasta', level: 26, xp, tp: 40_000, schema: 1 }]);
    expect(t.d.started).toBe(true);
    t.advance(1000);
    expect(t.types()).toEqual(['run_start']);
  });

  it('folds kills 500 ms after the last death line and splits the XP evenly', () => {
    const t = setup();
    t.play();
    t.gmcp('Char.Vitals', { xp: 1_000_000, tp: 10 });
    t.gmcp('Char.Vitals', { xp: 1_000_500 });
    const first = t.us();
    t.line('A guard is dead! R.I.P.');
    t.advance(300);
    t.gmcp('Char.Vitals', { xp: 1_001_001 });
    const second = t.us();
    t.line('A large bat is dead! R.I.P.');
    t.advance(499);
    expect(t.types()).toEqual(['run_start']);
    t.advance(1);
    const foldUs = t.us();
    expect(t.events.slice(1)).toEqual([
      { type: 'kill', us: foldUs, logUs: first, mobName: 'A guard', xpDelta: 500 },
      { type: 'kill', us: foldUs, logUs: second, mobName: 'A large bat', xpDelta: 501 },
    ]);
    expect(t.ui).toEqual(['◆ KILL: A guard, 500 xp.', '◆ KILL: A large bat, 501 xp.']);
    // The next fold starts from the new anchor.
    t.gmcp('Char.Vitals', { xp: 1_001_101 });
    t.line('A white rat disappears into nothing.');
    t.advance(500);
    expect(t.events.at(-1)).toMatchObject({ type: 'kill', mobName: 'A white rat', xpDelta: 100 });
  });

  it('splits a mixed fold over kills and pkills in arrival order, remainder to the last', () => {
    const t = setup();
    t.play();
    t.gmcp('Char.Vitals', { xp: 2_000_000 });
    t.gmcp('Char.Vitals', { xp: 2_000_010 });
    t.line('*Ibuki the Half-Elf* has drawn her last breath! R.I.P.');
    t.line('A guard (MERC) is dead! R.I.P.');
    t.line('*a Dwarf* is dead! R.I.P.');
    t.advance(500);
    expect(t.events.slice(1).map((e) => ({ ...e, us: 0, logUs: 0 }))).toEqual([
      { type: 'pkill', us: 0, logUs: 0, name: 'Ibuki', race: 'the Half-Elf', xpDelta: 3 },
      { type: 'kill', us: 0, logUs: 0, mobName: 'A guard', xpDelta: 3 },
      { type: 'pkill', us: 0, logUs: 0, name: 'a Dwarf', race: '', xpDelta: 4 },
    ]);
    expect(t.ui).toEqual(['◆ PKILL: Ibuki, 3 xp.', '◆ KILL: A guard, 3 xp.', '◆ PKILL: a Dwarf, 4 xp.']);
  });

  it('turns an XP drop into xp_loss and moves the fold anchor', () => {
    const t = setup();
    t.play();
    t.gmcp('Char.Vitals', { xp: 3_000_000 });
    t.gmcp('Char.Vitals', { xp: 3_000_400 });
    t.gmcp('Char.Vitals', { xp: 2_990_000 });
    expect(t.events.at(-1)).toEqual({ type: 'xp_loss', us: t.us(), xpDelta: -10_000 });
    t.gmcp('Char.Vitals', { xp: 2_990_050 });
    t.line('A guard is dead! R.I.P.');
    t.advance(500);
    expect(t.events.at(-1)).toMatchObject({ type: 'kill', xpDelta: 50 });
  });

  it('logs level-ups from XP, only upwards, and char_death with the level', () => {
    const t = setup();
    t.play();
    t.gmcp('Char.Vitals', { xp: xpForLevel(30) - 10 });
    t.gmcp('Char.Vitals', { xp: xpForLevel(30) + 5 });
    expect(t.events.at(-1)).toEqual({ type: 'level_up', us: t.us(), level: 30 });
    t.line('You are dead! Sorry...');
    expect(t.events.at(-1)).toEqual({ type: 'char_death', us: t.us(), logUs: t.us(), level: 30 });
    expect(t.ui.at(-1)).toBe('◆ DEATH: You died.');
    t.gmcp('Char.Vitals', { xp: xpForLevel(30) - 1000 }); // death penalty: level 29, not logged
    expect(t.types().filter((x) => x === 'level_up')).toHaveLength(1);
    t.gmcp('Char.Vitals', { xp: xpForLevel(30) + 1 }); // regained: logged again (Cockpit)
    expect(t.types().filter((x) => x === 'level_up')).toHaveLength(2);
  });

  it('logs TP gains and losses per Vitals', () => {
    const t = setup();
    t.play();
    t.gmcp('Char.Vitals', { xp: 10, tp: 100 });
    t.gmcp('Char.Vitals', { tp: 103 });
    t.gmcp('Char.Vitals', { tp: 103 });
    t.gmcp('Char.Vitals', { tp: 90 });
    expect(t.events.slice(1).map((e) => [e.type, 'tpDelta' in e ? e.tpDelta : null])).toEqual([
      ['tp_gained', 3],
      ['tp_loss', -13],
    ]);
  });

  it.each(['own', 'shared-before', 'shared-after'] as const)('writes group_changed for ally changes only, the login group once after run_start (%s)', (mode) => {
    const t = setup(mode);
    t.play();
    t.gmcp('Group.Set', [
      { id: 1, type: 'you', name: 'Rasta' },
      { id: 2, type: 'ally', name: 'Norsy' },
      { id: 3, type: 'npc', name: 'a mercenary', label: 'MERC' },
    ]);
    expect(t.events).toEqual([]);
    t.gmcp('Char.Vitals', { xp: 1 });
    expect(t.types()).toEqual(['run_start', 'group_changed']);
    expect(t.events[1]).toMatchObject({ members: ['Norsy'] });
    t.gmcp('Group.Update', { id: 2, hp: 50 }); // vitals only
    t.gmcp('Group.Remove', 3); // NPC churn
    t.gmcp('Group.Add', { id: 5, type: 'npc', name: 'a pony', label: 0 });
    expect(t.types()).toEqual(['run_start', 'group_changed']);
    t.gmcp('Group.Add', { id: 7, type: 'ally', name: 'Kuzzim' });
    t.gmcp('Group.Remove', 2);
    t.gmcp('Group.Add', { id: 8, type: 'ally', name: 'Norsy' });
    expect(t.events.slice(2).map((e) => (e.type === 'group_changed' ? e.members : e.type))).toEqual([
      ['Norsy', 'Kuzzim'],
      ['Kuzzim'],
      ['Kuzzim', 'Norsy'],
    ]);
  });

  it('logs achievements and ends the run on leaving playing, folding what is pending', () => {
    const t = setup();
    t.play();
    t.gmcp('Char.Vitals', { xp: 100 });
    t.gmcp('Event.Achieved', { what: 'That was a quick trip!' });
    t.gmcp('Char.Vitals', { xp: 150 });
    t.line('A guard is dead! R.I.P.');
    t.conn('disconnected', 'playing');
    expect(t.types()).toEqual(['run_start', 'achievement', 'kill', 'run_end']);
    expect(t.events[1]).toEqual({ type: 'achievement', us: expect.any(Number), name: 'That was a quick trip!' });
    expect(t.events[2]).toMatchObject({ xpDelta: 50 });
    expect(t.d.started).toBe(false);
    t.advance(1000);
    expect(t.events).toHaveLength(4);
    // A new connection starts a new run with a fresh event list.
    t.play();
    t.gmcp('Char.Vitals', { xp: 150 });
    expect(t.d.events.map((e) => e.type)).toEqual(['run_start']);
  });

  it('shares the line with other catch-all system actions', () => {
    const bus = new Bus();
    const d = new RunEventDeriver({ scheduler: new FakeScheduler() }).attach(bus);
    const engine = new ScriptEngine({ send: () => {}, message: () => {} });
    const seen: string[] = [];
    engine.system.define('action', '%*', '', { priority: 3, fn: (m) => seen.push(m.line!.text) });
    d.installRules(engine.system);
    expect(engine.system.count('action')).toBe(2);
    bus.emit('conn.state', { state: 'playing', prev: 'login' });
    d.onGmcp('Char.Vitals', { xp: 1 }, 1);
    engine.processLine({ text: 'You are dead! Sorry...', raw: '', runs: [], tags: [], prompt: false, ts: 5 });
    expect(seen).toEqual(['You are dead! Sorry...']);
    expect(d.events.map((e) => e.type)).toEqual(['run_start', 'char_death']);
  });

  it('runs in replays too', () => {
    const t = setup();
    t.play('Gittan', true);
    t.gmcp('Char.Vitals', { xp: 10 });
    t.line('You are dead! Sorry...');
    t.conn('disconnected', 'playing', true);
    expect(t.types()).toEqual(['run_start', 'char_death', 'run_end']);
    expect(t.events[0]).toMatchObject({ character: 'Gittan' });
  });

  it('a new connection forgets a run that never ended', () => {
    const t = setup();
    t.play();
    t.gmcp('Char.Vitals', { xp: 10 });
    t.line('A guard is dead! R.I.P.');
    t.conn('connecting', 'login');
    t.advance(1000);
    expect(t.types()).toEqual(['run_start']);
    expect(t.d.started).toBe(false);
  });
});
