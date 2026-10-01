// @vitest-environment happy-dom
// ADR 0044 rule 4: the cell-grid panes patch their rows. A row whose content
// did not change keeps its element, and a render that changes nothing
// touches no DOM.
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import { GameState } from '../../src/gmcp/state';
import { CharacterPane } from '../../src/panes/character';
import { createPaneContext } from '../../src/panes/context';
import { CellLine, RowList } from '../../src/panes/grid';
import { GroupPane } from '../../src/panes/group';
import type { PaneShell } from '../../src/panes/pane';
import { TimersPane } from '../../src/panes/timers';
import { SettingsStore } from '../../src/settings';

/** Records every DOM mutation under `el` until `take()`. */
function watch(el: Node): { take: () => MutationRecord[]; stop: () => void } {
  const mo = new MutationObserver(() => {});
  mo.observe(el, { subtree: true, childList: true, attributes: true, characterData: true });
  return { take: () => mo.takeRecords(), stop: () => mo.disconnect() };
}

const rowEls = (p: PaneShell): Element[] => [...p.content.querySelectorAll('.wc-prow')];

describe('RowList', () => {
  const line = (text: string, fg = '') => new CellLine(8).put(0, text, { fg });

  it('keeps unchanged rows, replaces changed ones, touches nothing when nothing changed', () => {
    const host = document.createElement('div');
    const list = new RowList(host);
    expect(list.update(document, [line('a'), line('b'), line('c')])).toBe(3);
    const first = [...host.children];
    const w = watch(host);
    expect(list.update(document, [line('a'), line('b'), line('c')])).toBe(0);
    expect(w.take()).toEqual([]);
    // A colour change alone is a change.
    expect(list.update(document, [line('a'), line('b', '#ff0000'), line('c')])).toBe(1);
    const next = [...host.children];
    expect(next[0]).toBe(first[0]);
    expect(next[1]).not.toBe(first[1]);
    expect(next[2]).toBe(first[2]);
    expect(host.textContent).toBe('a       b       c       ');
    w.stop();
  });

  it('keeps the tail after the rows and rebuilds when the host was emptied', () => {
    const host = document.createElement('div');
    const tail = document.createElement('i');
    const list = new RowList(host);
    list.update(document, [line('a'), line('b')], tail);
    expect(host.lastChild).toBe(tail);
    host.replaceChildren(); // as a blank() does
    expect(list.update(document, [line('a'), line('b')], tail)).toBe(2);
    expect(host.children).toHaveLength(3);
    expect(host.lastChild).toBe(tail);
    // A different row count rebuilds all.
    expect(list.update(document, [line('a')], tail)).toBe(1);
    expect(host.children).toHaveLength(2);
  });
});

describe('panes patch their rows', () => {
  function setup() {
    const bus = new Bus();
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    let t = 1_790_000_000_000;
    const now = () => t;
    const game = new GameState({ now }).attach(bus);
    const frames: (() => void)[] = [];
    const ctx = createPaneContext({
      doc: document,
      bus,
      settings,
      game,
      now,
      requestFrame: (cb) => frames.push(cb),
      connState: () => 'playing',
    });
    const flush = () => {
      while (frames.length) frames.shift()!();
    };
    return { bus, game, ctx, flush, advance: (ms: number) => void (t += ms), now };
  }
  const place = (p: PaneShell, w: number, h: number) =>
    p.place({ rect: { x: 0, y: 0, w, h }, content: { x: 0, y: 0, w, h }, framed: false }, { w: 8, h: 16 });

  it('Character: vitals it does not show touch no DOM; a mood change replaces one row', () => {
    const t = setup();
    const p = new CharacterPane(t.ctx);
    place(p, 31, 9);
    t.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'rasta' } });
    t.bus.emit('gmcp', { pkg: 'Char.Vitals', data: { hp: 100, maxhp: 200, mood: 'brave', position: 'standing' } });
    t.flush();
    const before = rowEls(p);
    expect(before).toHaveLength(9);
    const w = watch(p.content);
    t.bus.emit('gmcp', { pkg: 'Char.Vitals', data: { hp: 90, mana: 10, moves: 50 } });
    t.flush();
    expect(w.take()).toEqual([]);
    t.bus.emit('gmcp', { pkg: 'Char.Vitals', data: { mood: 'wimpy' } });
    t.flush();
    const after = rowEls(p);
    const changed = after.map((el, i) => el !== before[i]);
    expect(changed).toEqual([false, false, false, false, true, true, false, false, false]);
    expect(after[4]!.textContent).toContain('wimpy');
    w.stop();
    p.dispose();
  });

  it('Character: a blank and the next connection draw the board again', () => {
    const t = setup();
    let state: 'playing' | 'disconnected' = 'playing';
    const p = new CharacterPane(createPaneContext({ ...t.ctx, connState: () => state }));
    place(p, 31, 9);
    t.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'rasta' } });
    t.flush();
    expect(p.content.textContent).toContain('Rasta');
    state = 'disconnected';
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
    t.flush();
    expect(p.content.textContent).toBe('');
    state = 'playing';
    t.bus.emit('conn.state', { state: 'playing', prev: 'connecting' });
    t.flush();
    expect(rowEls(p)).toHaveLength(9);
    t.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'rasta' } });
    t.flush();
    expect(p.content.textContent).toContain('Rasta');
    p.dispose();
  });

  it('Group: one member’s change replaces only that row', () => {
    const t = setup();
    const p = new GroupPane(t.ctx);
    place(p, 31, 6);
    t.bus.emit('gmcp', {
      pkg: 'Group.Set',
      data: [
        { id: 2, type: 'ally', name: 'Gibur', hp: 140, maxhp: 140 },
        { id: 3, type: 'ally', name: 'Mora', hp: 100, maxhp: 100 },
      ],
    });
    t.flush();
    const before = rowEls(p);
    expect(before).toHaveLength(2);
    const w = watch(p.content);
    p.markDirty();
    t.flush();
    expect(w.take()).toEqual([]);
    t.bus.emit('gmcp', { pkg: 'Group.Update', data: { id: 3, hp: 20 } });
    t.flush();
    const after = rowEls(p);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    w.stop();
    p.dispose();
  });

  it('Timers: a tick that shows the same cells touches no DOM; hit boxes stay', () => {
    const t = setup();
    const p = new TimersPane(t.ctx);
    place(p, 20, 6);
    const now = t.now();
    const cell = (id: string, group: 'spell' | 'charm', secs: number) =>
      ({ id, name: id, group, startedAt: now, expiresAt: now + secs * 1000, expected: secs * 1000, tracked: true }) as const;
    t.game.timers.debugAdd({ ...cell('armour', 'spell', 3600) });
    t.game.timers.debugAdd({ ...cell('troll', 'charm', 3600) });
    t.flush();
    const before = rowEls(p);
    const hits = [...p.content.querySelectorAll('.wc-timers-hit')];
    expect(hits.length).toBeGreaterThan(0);
    const w = watch(p.content);
    t.advance(1000);
    p.markDirty();
    t.flush();
    expect(w.take()).toEqual([]);
    expect(rowEls(p)).toEqual(before);
    expect([...p.content.querySelectorAll('.wc-timers-hit')]).toEqual(hits);
    // A new cell changes the rows below the spells header and keeps the header.
    t.game.timers.debugAdd({ ...cell('bless', 'spell', 3600) });
    t.flush();
    const after = rowEls(p);
    expect(after[0]).toBe(before[0]);
    expect(p.content.lastElementChild!.className).toBe('wc-timers-hits');
    w.stop();
    p.dispose();
  });
});
