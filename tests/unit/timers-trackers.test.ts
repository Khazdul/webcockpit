import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import { GameState } from '../../src/gmcp/state';
import { lazyDb } from '../../src/panes/context';
import { FakeScheduler, ScriptEngine } from '../../src/script/engine';
import { T0, mkLine, plain } from './timers-helpers';

function app(factory: IDBFactory) {
  const bus = new Bus();
  const sched = new FakeScheduler();
  const now = () => T0 + sched.now();
  const game = new GameState({ now, timers: { openDb: lazyDb(factory), scheduler: sched } }).attach(bus);
  const engine = new ScriptEngine({ send: () => {}, message: () => {} });
  engine.attach(bus);
  game.installRules(engine.system);
  game.timers.installRules(engine.system);
  const msgs: string[] = [];
  bus.on('ui.message', (m) => msgs.push(plain(m)));
  const line = (...t: string[]) => t.forEach((s) => engine.processLine(mkLine(s)));
  const send = (text: string) => bus.emit('cmd.sent', { text, ts: 0 });
  const login = () => {
    bus.emit('conn.state', { state: 'connecting', prev: 'idle' });
    bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta', fullname: 'Rasta' } });
  };
  return { bus, sched, game, engine, msgs, line, send, login };
}

describe('timers trackers in the app', () => {
  it('lines and sends reach the trackers; the state survives a reload, silently', async () => {
    const factory = new IDBFactory();
    const a = app(factory);
    a.login();
    await a.game.timers.idle();
    a.line('You start glowing.', 'You are hungry.');
    a.send("cast 'blindness' 2.orc");
    a.line('An orc seems to be blinded!', 'An enslaved shadow starts following you.');
    a.send('store fireball');
    a.line('You stored it.');
    a.game.timers.addHerb('Haste');
    expect(a.msgs).toEqual([
      '◆ SPELL: sanctuary up.',
      '◆ DEBUFF: hunger up.',
      '◆ BLIND: 2.orc up.',
      '◆ CHARM: enslaved shadow up.',
      '◆ STORE: fireball stored.',
      '◆ HERB: Haste up.',
    ]);
    a.sched.advance(30_000);
    a.game.timers.flushSave();
    await a.game.timers.idle();
    a.game.dispose();

    const b = app(factory);
    b.sched.advance(60_000); // the reload comes 60 s after the lines
    b.login();
    await b.game.timers.idle();
    const v = b.game.timers.view();
    expect(v.cells.sanct.map((c) => c.name)).toEqual(['sanctuary']);
    expect(v.cells.debuff).toEqual([]); // hunger is not saved
    expect(v.cells.blind.map((c) => c.name)).toEqual(['2.orc']);
    expect(v.cells.charm.map((c) => c.name)).toEqual(['enslaved shadow']);
    expect(v.cells.stored.map((c) => c.name)).toEqual(['fireball']);
    expect(v.cells.herb.map((c) => c.name)).toEqual(['Haste']);
    expect(v.herbs.find((h) => h.key === 'Haste')?.active).toBe(true);
    expect(b.msgs).toEqual([]);
    // The blind runs out 90 s after it landed.
    b.sched.advance(40_000);
    expect(b.game.timers.view().cells.blind).toEqual([]);
    expect(b.msgs).toEqual(['◆ BLIND: 2.orc down.']);
    b.game.dispose();
  });

  it('the pane × drops a charm', () => {
    const a = app(new IDBFactory());
    a.login();
    a.line('An enslaved shadow starts following you.');
    const id = a.game.timers.view().cells.charm[0]!.id;
    a.game.timers.dropCharm(id);
    expect(a.game.timers.view().cells.charm).toEqual([]);
    expect(a.msgs.at(-1)).toBe('◆ CHARM: enslaved shadow down.');
  });
});
