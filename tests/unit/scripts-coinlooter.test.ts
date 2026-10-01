// The bundled coin looter (src/scripts/bundled/coinlooter.lua, stage 10
// P3), run in the real script host with excerpts of MUME game text.

import { afterEach, describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { BusEvents, Line } from '../../src/core/types';
import { GameState } from '../../src/gmcp/state';
import { loadLuaRuntime } from '../../src/lua';
import { FakeScheduler, ScriptEngine } from '../../src/script/engine';
import { resetScriptKeys } from '../../src/script/script-keys';
import { ScriptLibrary } from '../../src/scripts';
import { BUNDLED_SCRIPTS } from '../../src/scripts/bundled';
import { ScriptHost } from '../../src/scripts/host';

// Game text (MUME): a solo kill, a group kill of an undead, a kill by
// someone else's earthquake (no experience line), and a player's death.
const MY_KILL = [
  'You slash an albino salamander\'s right hindleg extremely hard and shatter it.',
  'You receive your share of experience.',
  'This is really a genocide...',
  "You hear an albino salamander's death cry as it collapses.",
  'An albino salamander is dead! R.I.P.',
];
const GROUP_UNDEAD = [
  'Taube (t) slashes a wight-noble\'s left leg extremely hard and shatters it.',
  'You receive your share of experience.',
  'It begins to be automatic...',
  "You hear a wight-noble's death cry as he collapses.",
  'A wight-noble disappears into nothing.',
];
const OTHERS_KILL = [
  '*Maddy the Silvan Elf* makes the earth tremble and shiver.',
  'A tiny spider is dead! R.I.P.',
  'A small termite is dead! R.I.P.',
];
const PC_DEATH = ['You receive your share of experience.', '*Ibuki the Half-Elf* has drawn her last breath! R.I.P.'];
const HER_KILL = ['You receive your share of experience.', 'A she-wolf has drawn her last breath! R.I.P.'];
const NO_COINS = "You can't find any coins in any corpse.";
const NO_FLOOR_COINS = "You can't find any coins.";

const hosts: ScriptHost[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.dispose();
  resetScriptKeys();
});

function line(text: string): Line {
  return { text, runs: [], tags: [], prompt: false, raw: text, ts: 0 };
}

async function setup(enabled = true) {
  const bus = new Bus();
  const clock = new FakeScheduler();
  const sent: string[] = [];
  const msgs: string[] = [];
  const shown: BusEvents['text.display'][] = [];
  let host: ScriptHost | null = null;
  const engine = new ScriptEngine({
    send: (t) => sent.push(t),
    message: (m) => msgs.push(m),
    scheduler: clock,
    scriptCommand: (n, a) => host!.command(n, a),
  });
  engine.attach(bus);
  const game = new GameState();
  game.attach(bus);
  bus.on('text.display', (d) => shown.push(d));
  const lib = new ScriptLibrary({ factory: null, bundled: BUNDLED_SCRIPTS });
  await lib.init();
  if (enabled) await lib.setEnabled('coinlooter', true);
  host = new ScriptHost({
    engine,
    bus,
    library: lib,
    game,
    send: (t) => sent.push(t),
    print: () => {},
    message: (m) => msgs.push(m),
    loadRuntime: () => loadLuaRuntime(),
  });
  hosts.push(host);
  await host.start();
  const recv = (...texts: string[]) => {
    for (const t of texts) bus.emit('text.line', line(t));
  };
  const texts = () => shown.map((d) => d.line.text);
  return { engine, clock, sent, msgs, shown, texts, lib, host, recv };
}

describe('bundled coin looter', () => {
  it('is listed with its header, settings and help', async () => {
    const t = await setup(false);
    const s = t.lib.get('coinlooter')!;
    expect(s).toMatchObject({ bundled: true, readonly: true, problems: [], loadProblem: null });
    expect(s.header.api).toBe(1);
    expect(s.header.aliases.map((a) => a.name)).toEqual(['cl']);
    expect(s.settings).toEqual({ auto: true, delay: 0, others: false, quiet: true });
    expect(s.header.help.join('\n')).toMatch(/cl on and cl off are remembered/);
  });

  it('loots a corpse after your kill, and the floor after an undead', async () => {
    const t = await setup();
    expect(t.host.isRunning('coinlooter')).toBe(true);
    t.recv(...MY_KILL);
    expect(t.sent).toEqual(['get coins all.corpse']);
    t.clock.advance(1500);
    t.recv(...GROUP_UNDEAD);
    expect(t.sent).toEqual(['get coins all.corpse', 'get all.coins']);
    t.clock.advance(1500);
    t.recv(...HER_KILL);
    expect(t.sent).toHaveLength(3);
  });

  it('leaves kills without experience and player corpses alone', async () => {
    const t = await setup();
    t.recv(...OTHERS_KILL);
    t.clock.advance(3000);
    t.recv(...PC_DEATH);
    expect(t.sent).toEqual([]);
  });

  it('the experience line arms it only for a short while', async () => {
    const t = await setup();
    t.recv('You receive your share of experience.');
    t.clock.advance(2500);
    t.recv('An albino salamander is dead! R.I.P.');
    expect(t.sent).toEqual([]);
  });

  it('sends each command at most once a second', async () => {
    const t = await setup();
    t.recv(...MY_KILL, ...MY_KILL);
    expect(t.sent).toEqual(['get coins all.corpse']);
    t.clock.advance(1000);
    t.recv(...MY_KILL);
    expect(t.sent).toEqual(['get coins all.corpse', 'get coins all.corpse']);
  });

  it('hides the "no coins" reply to its own command only', async () => {
    const t = await setup();
    t.recv(...MY_KILL, NO_COINS);
    expect(t.texts()).not.toContain(NO_COINS);
    t.recv(NO_COINS, NO_FLOOR_COINS);
    expect(t.texts().filter((x) => x.startsWith("You can't find"))).toEqual([NO_COINS, NO_FLOOR_COINS]);
  });

  it('cl toggles; cl on, cl off and cl now', async () => {
    const t = await setup();
    t.engine.input('cl');
    expect(t.texts()).toContain('Coin looter off. Type cl to turn it on again.');
    t.recv(...MY_KILL);
    expect(t.sent).toEqual([]);
    t.engine.input('cl');
    expect(t.texts()).toContain('Coin looter on.');
    t.clock.advance(3000);
    t.recv(...MY_KILL);
    expect(t.sent).toEqual(['get coins all.corpse']);
    t.engine.input('cl off');
    t.clock.advance(3000);
    t.recv(...MY_KILL);
    expect(t.sent).toHaveLength(1);
    t.engine.input('cl on');
    t.engine.input('cl now');
    expect(t.sent).toEqual(['get coins all.corpse', 'get all.coins', 'get coins all.corpse']);
    t.engine.input('clan');
    expect(t.sent.at(-1)).toBe('clan');
    expect(t.lib.get('coinlooter')!.lastError).toBeNull();
  });

  it('remembers cl on and cl off in the auto setting', async () => {
    const t = await setup();
    t.engine.input('cl off');
    await new Promise((r) => setTimeout(r, 0));
    expect(t.lib.settingsOf('coinlooter').auto).toBe(false);
    t.engine.input('cl on');
    await new Promise((r) => setTimeout(r, 0));
    expect(t.lib.settingsOf('coinlooter').auto).toBe(true);
    expect(t.lib.get('coinlooter')!.lastError).toBeNull();
  });

  it('follows settings changed in the library', async () => {
    const t = await setup();
    expect(await t.lib.setSetting('coinlooter', 'others', 'on')).toMatchObject({ ok: true });
    expect(await t.lib.setSetting('coinlooter', 'delay', '0.5')).toMatchObject({ ok: true });
    expect(await t.lib.setSetting('coinlooter', 'quiet', 'off')).toMatchObject({ ok: true });
    await t.host.sync();
    t.recv(...OTHERS_KILL);
    expect(t.sent).toEqual([]);
    t.clock.advance(500);
    expect(t.sent).toEqual(['get coins all.corpse']);
    t.recv(NO_COINS);
    expect(t.texts()).toContain(NO_COINS);

    // `auto off` turns it off while it runs, even after a `cl on`.
    t.engine.input('cl on');
    expect(await t.lib.setSetting('coinlooter', 'auto', 'off')).toMatchObject({ ok: true });
    await t.host.sync();
    t.clock.advance(3000);
    t.recv(...MY_KILL);
    t.clock.advance(3000);
    expect(t.sent).toHaveLength(1);
    expect(t.lib.get('coinlooter')!.lastError).toBeNull();
    expect(t.host.isRunning('coinlooter')).toBe(true);
  });

  it('sends nothing when the script is off', async () => {
    const t = await setup(false);
    expect(t.host.isRunning('coinlooter')).toBe(false);
    t.recv(...MY_KILL, ...GROUP_UNDEAD);
    t.engine.input('cl');
    expect(t.sent).toEqual(['cl']);
  });
});
