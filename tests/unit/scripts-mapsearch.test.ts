// The bundled Map search script (src/scripts/bundled/mapsearch.lua, stage 21
// part C, ADR 0077 §C), run in the real script host with a fake pane
// surface and a map hub whose port records the searches and marks.

import { afterEach, describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import { GameState } from '../../src/gmcp/state';
import { loadLuaRuntime } from '../../src/lua';
import { MapMarkHub } from '../../src/map/marks';
import type { PaneContent } from '../../src/panes/script-content';
import type { ScriptPaneEvents, ScriptPaneSpec, ScriptPaneSurface, ScriptPaneView } from '../../src/panes/script-surface';
import { FakeScheduler, ScriptEngine } from '../../src/script/engine';
import { resetScriptKeys } from '../../src/script/script-keys';
import { ScriptLibrary } from '../../src/scripts';
import type { StoreValue } from '../../src/scripts/library';
import { BUNDLED_SCRIPTS } from '../../src/scripts/bundled';
import { ScriptHost } from '../../src/scripts/host';

const hosts: ScriptHost[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.dispose();
  resetScriptKeys();
});

class FakeView implements ScriptPaneView {
  on = true;
  closed = false;
  changed(): void {}
  setOn(on: boolean): void {
    this.on = on;
  }
  isOn(): boolean {
    return this.on;
  }
  size() {
    return { cols: 0, rows: 0 };
  }
  close(): void {
    this.closed = true;
  }
}
class FakeSurface implements ScriptPaneSurface {
  readonly opened: Array<{ spec: ScriptPaneSpec; content: PaneContent; events: ScriptPaneEvents; view: FakeView }> = [];
  open(spec: ScriptPaneSpec, content: PaneContent, events: ScriptPaneEvents): ScriptPaneView {
    const view = new FakeView();
    this.opened.push({ spec, content, events, view });
    return view;
  }
  get pane() {
    return this.opened.find((o) => !o.view.closed)!;
  }
}

interface Op {
  op: string;
  id: number;
  arg?: unknown;
}

const room = (id: number, name: string, steps: number | null, dirs: string | null, area = 'Bree', note = '') => ({ id, name, area, note, steps, dirs });

async function setup(opts: { map?: boolean; store?: Record<string, StoreValue> } = {}) {
  const bus = new Bus();
  const clock = new FakeScheduler();
  const sent: string[] = [];
  let host: ScriptHost | null = null;
  const engine = new ScriptEngine({
    send: (t) => sent.push(t),
    message: () => {},
    scheduler: clock,
    scriptCommand: (n, a) => host!.command(n, a),
  });
  engine.attach(bus);
  const game = new GameState();
  game.attach(bus);
  const lib = new ScriptLibrary({ factory: null, bundled: BUNDLED_SCRIPTS });
  await lib.init();
  for (const [k, v] of Object.entries(opts.store ?? {})) await lib.storeSet('mapsearch', k, v);
  await lib.setEnabled('mapsearch', true);
  const hub = new MapMarkHub();
  const ops: Op[] = [];
  if (opts.map !== false) {
    hub.attach({
      find: (req, query) => void ops.push({ op: 'find', id: req, arg: query }),
      mark: (id, target, style, ms, focus) => void ops.push({ op: 'mark', id, arg: { target, style, ms, focus } }),
      unmark: (id) => void ops.push({ op: 'unmark', id }),
      ask: (req, q) => void ops.push({ op: 'ask', id: req, arg: q }),
      shown: () => true,
    });
  }
  const panes = new FakeSurface();
  host = new ScriptHost({
    engine,
    bus,
    library: lib,
    game,
    send: (t) => sent.push(t),
    print: () => {},
    message: () => {},
    loadRuntime: () => loadLuaRuntime(),
    panes,
    map: hub,
  });
  hosts.push(host);
  await host.start();
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    await host!.sync();
  };
  const content = () => panes.pane.content;
  const rowText = (r: number) => {
    const l = content().lines[r];
    return l && 'spans' in l ? l.spans.map((s) => s.text).join('') : '';
  };
  const rows = () => content().lines.map((_, i) => rowText(i).trimEnd());
  const clickText = (r: number, text: string) => {
    const s = rowText(r);
    const col = s.indexOf(text);
    const link = col < 0 ? null : content().linkAt(r, col);
    if (!link) throw new Error(`no link at "${text}" in row ${r}: "${s}"`);
    panes.pane.events.onLink(link.id);
    return link;
  };
  const field = () => content().fields.find((f) => f.row === 0)!;
  const type = (text: string) => panes.pane.events.onField!(field().id, { type: 'change', text });
  const enter = () => panes.pane.events.onField!(field().id, { type: 'submit', text: field().value });
  const resize = (cols: number, rows_ = 24) => panes.pane.events.onResize(cols, rows_);
  const lastAsk = () => ops.filter((o) => o.op === 'ask').at(-1)!;
  const answer = (results: ReturnType<typeof room>[], total = results.length, here: number | null = 1) =>
    hub.answered(lastAsk().id, { k: 'search', results, total, here });
  const marks = () => ops.filter((o) => o.op === 'mark' || o.op === 'unmark');
  return { bus, engine, clock, sent, lib, host, hub, ops, panes, settle, rows, rowText, clickText, field, type, enter, resize, lastAsk, answer, marks, content };
}

const RESULTS = [
  room(1, 'Hill Road', 0, ''),
  room(7, 'A Glade', 4, '2e n u', 'Chetwood', 'Herb: athelas'),
  room(9, 'Far Away Place With A Very Long Name', null, null, ''),
];

describe('bundled mapsearch', () => {
  it('is listed with its header, alias and help', async () => {
    const lib = new ScriptLibrary({ factory: null, bundled: BUNDLED_SCRIPTS });
    await lib.init();
    const s = lib.get('mapsearch')!;
    expect(s).toMatchObject({ bundled: true, readonly: true, problems: [], loadProblem: null, enabled: false });
    expect(s.header.aliases.map((a) => a.name)).toEqual(['mapsearch']);
    expect(s.header.help.join('\n')).toMatch(/Find\s+Rooms/);
  });

  it('draws the dialog: query, Find / Close, the Search radios in two columns and the Options', async () => {
    const t = await setup();
    expect(t.panes.pane.spec).toEqual({ id: 'mapsearch/main', place: { dock: 'right', rows: 24, cols: 60, lane: 'own' } });
    expect(t.content().title).toBe('Map search');
    t.resize(60);
    const r = t.rows();
    expect(r[0]).toMatch(/^ Query: +\[Find\] \[Close\]$/);
    expect(r[0]).toHaveLength(59);
    expect(r.slice(1, 7)).toEqual([
      ' Search                       Options',
      ' (•) Name         ( ) Exits   [ ] Case sensitive',
      ' ( ) Description  ( ) Notes   [ ] Regular expression',
      ' ( ) Contents     ( ) Flags',
      ' ( ) Area         ( ) All',
      ' Type a query and press Enter.',
    ]);
    expect(r[7]).toBe('─'.repeat(60));
    // No room in the list has an area: no Area column.
    expect(r[8]).toMatch(/^ {3}Steps  Room name {17}Way$/);
    expect(t.field()).toMatchObject({ row: 0, col: 8, value: '' });
    // Narrow: the Options go under the radio buttons.
    t.resize(40);
    expect(t.rows().slice(6, 10)).toEqual([' Options', ' [ ] Case sensitive', ' [ ] Regular expression', ' Type a query and press Enter.']);
    expect(t.host.isRunning('mapsearch')).toBe(true);
  });

  it('Enter searches; rows nearest first; clicks mark one live mark with focus "move"; Mark all; Clear', async () => {
    const t = await setup();
    t.resize(60);
    t.type('  hill ');
    t.enter();
    expect(t.lastAsk().arg).toEqual({ k: 'search', query: { text: 'hill', field: 'name', case: false, regex: false, max: 200 } });
    expect(t.rows()[6]).toBe(' Searching …');
    t.answer(RESULTS, 3);
    const r = t.rows();
    expect(r[6]).toMatch(/^ 3 rooms +\[Mark all\]$/);
    expect(r[8]).toMatch(/^ {3}Steps  Room name +Area +Way$/);
    expect(r[9]).toMatch(/^ {7}0  Hill Road +Bree +here$/);
    expect(r[10]).toMatch(/^ {7}4  A Glade +Chetwood +2e n u$/);
    expect(r[11]).toMatch(/^ {7}—  Far Away Place Wi… +no path$/);
    // The hint: the whole way and the note.
    const link = t.content().linkAt(10, 3)!;
    expect(link.hint).toBe('A Glade (Chetwood)\n4 steps:\n2e n u\nNote: Herb: athelas\nClick to mark it on the map.');

    t.clickText(10, 'A Glade');
    expect(t.marks()).toEqual([{ op: 'mark', id: expect.any(Number), arg: expect.objectContaining({ target: { rooms: [7] }, ms: Infinity, focus: 'move' }) }]);
    expect(t.rows()[10]).toMatch(/^ ● {5}4  A Glade/);
    expect(t.rows()[6]).toMatch(/^ 3 rooms · 1 marked +\[Mark all\] \[Clear\]$/);
    const first = t.marks()[0]!.id;
    // A second click on another row: the old mark goes, one mark with both.
    t.clickText(9, 'Hill Road');
    expect(t.marks().slice(1)).toEqual([
      { op: 'unmark', id: first },
      { op: 'mark', id: expect.any(Number), arg: expect.objectContaining({ target: { rooms: [1, 7] } }) },
    ]);
    // Clicking a marked row unmarks it.
    t.clickText(10, 'A Glade');
    expect((t.marks().at(-1)!.arg as { target: { rooms: number[] } }).target.rooms).toEqual([1]);
    expect(t.rows()[10]).toMatch(/^ {7}4  A Glade/);
    t.clickText(6, '[Mark all]');
    expect((t.marks().at(-1)!.arg as { target: { rooms: number[] } }).target.rooms).toEqual([1, 7, 9]);
    expect(t.rows()[6]).toMatch(/^ 3 rooms · 3 marked/);

    // A new search keeps the marks.
    t.type('glade');
    t.enter();
    t.answer([RESULTS[1]!], 1);
    expect(t.rows()[6]).toMatch(/^ 1 room · 3 marked +\[Mark all\] \[Clear\]$/);
    expect(t.rows()).toHaveLength(10);
    expect(t.rows()[9]).toMatch(/^ ● {5}4  A Glade/);
    const live = t.marks().at(-1)!.id;
    t.clickText(6, '[Clear]');
    expect(t.marks().at(-1)).toEqual({ op: 'unmark', id: live });
    expect(t.rows()[6]).toBe(' 1 room                                          [Mark all]');
    expect(t.lib.get('mapsearch')!.lastError).toBeNull();
  });

  it('a radio or a checkbox searches again when there is a query; the choice is kept in the store', async () => {
    const t = await setup();
    t.resize(60);
    t.clickText(3, 'Notes');
    expect(t.ops.filter((o) => o.op === 'ask')).toEqual([]);
    t.type('Herb');
    t.enter();
    expect(t.lastAsk().arg).toMatchObject({ query: { text: 'Herb', field: 'note', case: false } });
    t.clickText(2, 'Case sensitive');
    expect(t.lastAsk().arg).toMatchObject({ query: { text: 'Herb', field: 'note', case: true, regex: false } });
    t.clickText(4, 'Flags');
    expect(t.lastAsk().arg).toMatchObject({ query: { field: 'flags', case: true } });
    // An old answer after a newer search is dropped.
    const asks = t.ops.filter((o) => o.op === 'ask');
    t.hub.answered(asks[0]!.id, { k: 'search', results: [RESULTS[0]!], total: 1, here: 1 });
    expect(t.rows()[6]).toBe(' Searching …');
    await t.settle();
    expect(t.lib.storeGet('mapsearch', 'query')).toEqual({ text: 'Herb', field: 'flags', case: true, regex: false });

    const t2 = await setup({ store: { query: { text: 'rent', field: 'flags', case: false, regex: true } } });
    t2.resize(60);
    expect(t2.field().value).toBe('rent');
    expect(t2.rows()[3]).toMatch(/\[x\] Regular expression$/);
    expect(t2.rows()[4]).toBe(' ( ) Contents     (•) Flags');
  });

  it('says why: empty query, no rooms, bad regex, map off', async () => {
    const t = await setup();
    t.resize(60);
    t.enter();
    expect(t.rows()[6]).toBe(' Type something to find.');
    t.type('zzz');
    t.enter();
    t.answer([], 0, 1);
    expect(t.rows()[6]).toBe(' No rooms found.');
    expect(t.rows()).toHaveLength(9);
    // The player's room unknown: no ways, and the status says why.
    t.enter();
    t.answer([RESULTS[2]!], 1, null);
    expect(t.rows()[6]).toMatch(/^ 1 room · your room is unknown +\[Mark all\]$/);
    t.clickText(3, 'Regular expression');
    t.type('(');
    t.enter();
    expect(t.rows()[6]).toMatch(/^ Bad regex: /);

    const off = await setup({ map: false });
    off.resize(60);
    off.type('hill');
    off.enter();
    expect(off.rows()[6]).toBe(' Map off: turn the Map pane on (with a map) to search.');
    expect(off.lib.get('mapsearch')!.lastError).toBeNull();
  });

  it('narrow panes drop the Area column, then the Way; long ways are cut with …', async () => {
    const t = await setup();
    t.resize(60);
    t.type('x');
    t.enter();
    const long = Array.from({ length: 300 }, (_, i) => ['n', '2e', 's', 'w'][i % 4]).join(' ');
    t.answer([room(3, 'Somewhere', 700, long)], 1);
    expect(t.rows()[9]).toMatch(/^ {5}700  Somewhere +Bree +n 2e s w n 2e s w…$/);
    expect(t.rows()[9]!.length).toBeLessThanOrEqual(59);
    const hint = t.content().linkAt(9, 3)!.hint!;
    expect(hint.split('\n').length).toBeLessThan(20);
    expect(hint).toMatch(/700 steps:\nn 2e s w/);
    t.resize(44);
    expect(t.rows()[11]).toMatch(/^ {3}Steps  Room name +Way$/);
    expect(t.rows()[12]).toMatch(/^ {5}700  Somewhere +n 2e/);
    t.resize(34);
    expect(t.rows()[t.rows().length - 1]).toBe('     700  Somewhere');
  });

  it('the alias searches with the pane\'s options, toggles the pane, and closing clears the marks', async () => {
    const t = await setup();
    t.resize(60);
    t.engine.input('mapsearch hill road');
    expect(t.lastAsk().arg).toMatchObject({ query: { text: 'hill road', field: 'name' } });
    expect(t.field().value).toBe('hill road');
    t.answer(RESULTS, 3);
    t.clickText(9, 'Hill Road');
    const live = t.marks().at(-1)!.id;
    t.engine.input('mapsearch');
    expect(t.panes.pane.view.on).toBe(false);
    expect(t.marks().at(-1)).toEqual({ op: 'unmark', id: live });
    t.engine.input('mapsearch');
    expect(t.panes.pane.view.on).toBe(true);
    // [Close] hides it too.
    t.clickText(0, '[Close]');
    expect(t.panes.pane.view.on).toBe(false);
  });
});
