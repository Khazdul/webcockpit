import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { UiMessage } from '../../src/core/types';
import { GameState, type GamePart } from '../../src/gmcp/state';
import { lazyDb } from '../../src/panes/context';
import { uiPlain } from '../../src/panes/ui';
import { FakeScheduler } from '../../src/script/engine';
import { TimersArchive } from '../../src/timers/archive';
import type { TimerCell } from '../../src/timers/entry';
import { TimersHub } from '../../src/timers/hub';
import { ManualTracker, type Tracker, type TrackerHost, stateMessage } from '../../src/timers/tracker';

const T = 1_790_000_000_000;

function cell(id: string, extra: Partial<TimerCell> = {}): TimerCell {
  return { id, name: id, group: 'spell', startedAt: T, expiresAt: T + 60_000, expected: 60_000, tracked: true, ...extra };
}

/** A tracker that records what the hub calls. */
class Probe implements Tracker {
  readonly key = 'probe';
  sent: string[] = [];
  ticks: number[] = [];
  host!: TrackerHost;
  cells(): TimerCell[] {
    return [];
  }
  tick(now: number): void {
    this.ticks.push(now);
  }
  serialize(): unknown {
    return undefined;
  }
  restore(): void {}
  reset(): void {}
  onSent(text: string): void {
    this.sent.push(text);
  }
}

function setup(opts: { factory?: IDBFactory | null; win?: EventTarget } = {}) {
  const factory = opts.factory === undefined ? new IDBFactory() : opts.factory;
  const bus = new Bus();
  const sched = new FakeScheduler();
  const now = () => T + sched.now();
  let manual!: ManualTracker;
  const probe = new Probe();
  const hub = new TimersHub({
    now,
    scheduler: sched,
    ...(factory ? { openDb: lazyDb(factory) } : {}),
    win: (opts.win as Window | undefined) ?? null,
    trackers: (host) => {
      manual = new ManualTracker('manual', host, { persist: true });
      probe.host = host;
      return [manual, probe];
    },
  }).attach(bus);
  const msgs: UiMessage[] = [];
  bus.on('ui.message', (m) => msgs.push(m));
  let notified = 0;
  hub.subscribe(() => notified++);
  const connect = (replay = false) =>
    bus.emit('conn.state', { state: 'connecting', prev: 'idle', ...(replay ? { replay: true as const } : {}) });
  const login = (name: string) => bus.emit('gmcp', { pkg: 'Char.Name', data: { name, fullname: name } });
  const stored = async (name: string) => {
    await hub.idle();
    const a = new TimersArchive(await lazyDb(factory)());
    return a.load(name);
  };
  return { factory, bus, sched, now, hub, manual: () => manual, probe, msgs, connect, login, stored, notified: () => notified };
}

describe('TimersHub view', () => {
  it('groups and sorts the trackers’ cells, with the herblore catalogue', () => {
    const t = setup({ factory: null });
    t.manual().put(cell('bless', { expiresAt: T + 10_000 }));
    t.manual().put(cell('shield', { expiresAt: T + 50_000 }));
    t.manual().put(cell('hunger', { group: 'debuff', expiresAt: null, expected: null }));
    t.hub.debugAdd(cell('2.orc', { group: 'blind' }));
    t.manual().setHerbs([{ key: 'Haste', name: 'Haste' }]);
    const v = t.hub.view(T);
    expect(v.cells.spell.map((c) => c.name)).toEqual(['shield', 'bless']);
    expect(v.cells.debuff.map((c) => c.name)).toEqual(['hunger']);
    expect(v.cells.blind.map((c) => c.name)).toEqual(['2.orc']);
    expect(v.cells.charm).toEqual([]);
    expect(v.herbs).toEqual([{ key: 'Haste', name: 'Haste', active: false }]);
    t.hub.addHerb('Haste');
    expect(t.hub.view(T).herbs[0]!.active).toBe(true);
    t.hub.removeHerb('Haste');
    expect(t.hub.view(T).herbs[0]!.active).toBe(false);
    t.manual().put(cell('troll', { group: 'charm' }));
    t.hub.dropCharm('troll');
    expect(t.hub.view(T).cells.charm).toEqual([]);
    t.hub.debugClear();
    expect(t.hub.view(T).cells.blind).toEqual([]);
    expect(t.notified()).toBeGreaterThan(0);
  });

  it('announces ◆ lines and notifies GameState listeners as part `timers`', () => {
    const game = new GameState({ timers: { trackers: (h) => [new ManualTracker('m', h)] } });
    const bus = new Bus();
    game.attach(bus);
    const parts: GamePart[] = [];
    game.subscribe((p) => parts.push(p));
    const msgs: UiMessage[] = [];
    bus.on('ui.message', (m) => msgs.push(m));
    game.timers.debugAdd(cell('armour'));
    expect(parts).toContain('timers');
    expect(uiPlain(stateMessage('SPELL', 'armour', 'up'))).toBe('◆ SPELL: armour up.');
    expect(uiPlain(stateMessage('STORE', 'fireball', 'decayed', 'untracked'))).toBe(
      '◆ STORE: fireball decayed (untracked).',
    );
    expect(stateMessage('BLIND', '2.orc', 'down').parts[0]).toEqual({ value: '2.orc' });
    game.dispose();
  });
});

describe('TimersHub input and tick', () => {
  it('passes live sends (empty Enter included) to trackers, never passwords or replayed ones', () => {
    const t = setup({ factory: null });
    t.connect();
    t.bus.emit('cmd.sent', { text: "cast 'store' fireball", ts: 1 });
    t.bus.emit('cmd.sent', { text: '', ts: 2 });
    t.bus.emit('cmd.sent', { text: '', ts: 3, secret: true });
    t.bus.emit('cmd.sent', { text: 'from log', ts: 4, replay: true });
    expect(t.probe.sent).toEqual(["cast 'store' fireball", '']);
  });

  it('during a replay takes only the replayed log’s sends', () => {
    const t = setup({ factory: null });
    t.connect(true);
    t.bus.emit('cmd.sent', { text: 'typed', ts: 1 });
    t.bus.emit('cmd.sent', { text: 'cast bli orc', ts: 2, replay: true });
    t.bus.emit('cmd.sent', { text: '', ts: 3, replay: true });
    expect(t.probe.sent).toEqual(['cast bli orc', '']);
  });

  it('ticks every second with the injected clock', () => {
    const t = setup({ factory: null });
    t.sched.advance(3500);
    expect(t.probe.ticks).toEqual([T + 1000, T + 2000, T + 3000]);
    t.hub.dispose();
    t.sched.advance(3000);
    expect(t.probe.ticks).toHaveLength(3);
  });

  it('host.announce emits a ◆ ui.message', () => {
    const t = setup({ factory: null });
    t.probe.host.announce('CHARM', 'Huge stone troll', 'up');
    expect(t.msgs.map(uiPlain)).toEqual(['◆ CHARM: Huge stone troll up.']);
    expect(t.msgs[0]).toMatchObject({ kind: 'state', tag: 'CHARM' });
  });
});

describe('TimersHub persistence', () => {
  it('saves coalesced ≤ 250 ms after a change, per character', async () => {
    const t = setup();
    t.connect();
    t.login('Rasta');
    await t.hub.idle();
    expect(t.hub.persistent).toBe(true);
    t.manual().put(cell('armour'));
    t.sched.advance(100);
    t.manual().put(cell('bless'));
    t.sched.advance(149);
    expect(await t.stored('Rasta')).toBeNull();
    t.sched.advance(1);
    const rec = await t.stored('Rasta');
    expect(rec?.savedAt).toBe(T + 250);
    expect(rec?.state).toEqual({ v: 1, trackers: { manual: [cell('armour'), cell('bless')] } });
  });

  it('a reload restores the character minus what expired; lines during the load are merged', async () => {
    const a = setup();
    a.connect();
    a.login('Rasta');
    await a.hub.idle();
    a.manual().put(cell('armour', { expiresAt: T + 600_000 }));
    a.manual().put(cell('bless', { expiresAt: T + 5_000 }));
    a.hub.debugAdd(cell('debug-only'));
    a.sched.advance(250);
    await a.hub.idle();

    const b = setup({ factory: a.factory });
    b.sched.advance(10_000); // the downtime: bless expired
    b.connect();
    b.login('Rasta');
    b.manual().put(cell('sanctuary')); // arrives while the record loads
    expect(b.hub.view().cells.spell.map((c) => c.id)).toEqual(['sanctuary']);
    await b.hub.idle();
    expect(b.hub.view().cells.spell.map((c) => c.id).sort()).toEqual(['armour', 'sanctuary']);
    b.sched.advance(250);
    const rec = await b.stored('Rasta');
    expect((rec?.state as { trackers: { manual: TimerCell[] } }).trackers.manual.map((c) => c.id).sort()).toEqual([
      'armour',
      'sanctuary',
    ]);
  });

  it('reads a record put from outside (the sync, ADR 0152) at the next Char.Name', async () => {
    const t = setup();
    t.connect();
    t.login('Gibur');
    await t.hub.idle();
    const outside = new TimersArchive(await lazyDb(t.factory)());
    await outside.put({ character: 'Rasta', savedAt: T, state: { v: 1, trackers: { manual: [cell('armour', { expiresAt: T + 600_000 })] } } });
    expect(t.hub.view().cells.spell).toEqual([]);
    t.login('Rasta');
    await t.hub.idle();
    expect(t.hub.view().cells.spell.map((c) => c.id)).toEqual(['armour']);
  });

  it('keeps the record on disconnect; a reconnect reloads it; characters are separate', async () => {
    const t = setup();
    t.connect();
    t.login('Rasta');
    await t.hub.idle();
    t.manual().put(cell('armour'));
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
    expect(t.hub.view().cells.spell).toHaveLength(1);
    t.connect(); // saves the pending change, then forgets memory
    expect(t.hub.view().cells.spell).toHaveLength(0);
    t.login('Rasta');
    await t.hub.idle();
    expect(t.hub.view().cells.spell.map((c) => c.id)).toEqual(['armour']);
    t.connect();
    t.login('Gibur');
    await t.hub.idle();
    expect(t.hub.view().cells.spell).toEqual([]);
    expect(await t.stored('Gibur')).toBeNull();
  });

  it('a replay starts empty at its Char.Name and never reads or writes', async () => {
    const t = setup();
    t.connect();
    t.login('Rasta');
    t.manual().put(cell('armour'));
    t.sched.advance(250);
    await t.hub.idle();
    t.connect(true);
    t.login('Rasta');
    await t.hub.idle();
    expect(t.hub.view().cells.spell).toEqual([]);
    expect(t.hub.persistent).toBe(false);
    t.manual().put(cell('bless'));
    t.sched.advance(1000);
    const rec = await t.stored('Rasta');
    expect((rec?.state as { trackers: { manual: TimerCell[] } }).trackers.manual.map((c) => c.id)).toEqual(['armour']);
  });

  it('flushes on pagehide', async () => {
    const win = new EventTarget();
    const t = setup({ win });
    t.connect();
    t.login('Rasta');
    await t.hub.idle();
    t.manual().put(cell('armour'));
    win.dispatchEvent(new Event('pagehide'));
    expect((await t.stored('Rasta'))?.savedAt).toBe(T);
  });

  it('works in memory without IndexedDB', async () => {
    const t = setup({ factory: null });
    t.connect();
    t.login('Rasta');
    t.manual().put(cell('armour'));
    t.sched.advance(1000);
    await t.hub.idle();
    expect(t.hub.view().cells.spell.map((c) => c.id)).toEqual(['armour']);
  });
});
