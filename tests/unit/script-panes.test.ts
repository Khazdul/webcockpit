// @vitest-environment happy-dom
// Script panes (ADR 0053): the content model, dynamic pane ids in the
// layout and the settings, the drawn pane with links and tooltips, and
// the cockpit surface that places and remembers them.

import { describe, expect, it } from 'vitest';
import { TRUECOLOR } from '../../src/core/types';
import { allocate } from '../../src/layout/allocate';
import { Cockpit } from '../../src/layout/cockpit';
import { findFloat, findPane, placeScriptPane, togglePatch } from '../../src/layout/model';
import { type LayoutModel, defaultLayout, isScriptPaneId, scriptPaneId } from '../../src/layout/types';
import { createPaneContext } from '../../src/panes/context';
import { MAX_LINE_CELLS, PaneContent, plain } from '../../src/panes/script-content';
import { ScriptPane, gaugeFill, paneView, scriptPaneLines } from '../../src/panes/script-pane';
import { CockpitPaneSurface } from '../../src/panes/script-surface';
import { parseCecho } from '../../src/scripts/colors';
import { SettingsStore, migrateLayout, migrateSettings } from '../../src/settings';
import { defaultSettings, paneSettingsOf } from '../../src/settings/types';

const texts = (c: PaneContent): string[] =>
  c.lines.map((l) => ('spans' in l ? l.spans.map((s) => s.text).join('') : `#${l.gauge.label}`));

describe('PaneContent', () => {
  it('append works like Mudlet echo: \\n breaks lines, a trailing \\n waits for the next text', () => {
    const c = new PaneContent('t');
    c.append(plain('a'));
    c.append(plain('b\n'));
    c.append(plain('c\nd'));
    c.append(plain('e\n'));
    c.append(plain('\n'));
    c.append(plain('f'));
    expect(texts(c)).toEqual(['ab', 'c', 'de', '', 'f']);
  });

  it('keeps cecho styles as spans and merges equal neighbours', () => {
    const c = new PaneContent('t');
    c.append(parseCecho('<red>ab<reset>cd<b>e</b>'));
    c.append(parseCecho('<b>f'));
    const l = c.lines[0]!;
    expect('spans' in l && l.spans).toEqual([
      { text: 'ab', fg: TRUECOLOR | 0xff0000 },
      { text: 'cd' },
      { text: 'ef', bold: true },
    ]);
  });

  it('setLine grows the list and drops the row links; setGauge clamps', () => {
    const drops: number[] = [];
    const c = new PaneContent('t', { onDrop: (id) => drops.push(id) });
    c.setLine(2, plain('three\nlines'));
    expect(texts(c)).toEqual(['', '', 'three lines']);
    c.addLink(2, 0, 5, 1, 'hint');
    c.addLink(1, 0, 1, 2, '');
    c.setLine(2, plain('new'));
    expect(drops).toEqual([1]);
    expect(c.links.map((l) => l.id)).toEqual([2]);
    c.setGauge(1, { value: 150, max: 100, label: 'g' });
    expect(drops).toEqual([1, 2]);
    const g = c.lines[1]!;
    expect('gauge' in g && g.gauge).toEqual({ value: 100, max: 100, label: 'g' });
    expect(() => c.setLine(1000, plain('x'))).toThrow(RangeError);
  });

  it('a new link drops the links it overlaps; linkAt finds by cell', () => {
    const drops: number[] = [];
    const c = new PaneContent('t', { onDrop: (id) => drops.push(id) });
    c.addLink(0, 0, 3, 1, 'a');
    c.addLink(0, 5, 1, 2, 'b');
    c.addLink(0, 2, 2, 3, 'c');
    expect(drops).toEqual([1]);
    expect(c.linkAt(0, 5)!.id).toBe(2);
    expect(c.linkAt(0, 3)!.id).toBe(3);
    expect(c.linkAt(0, 4)).toBeNull();
  });

  it('appendLink links the appended text where it lands', () => {
    const c = new PaneContent('t');
    c.append(plain('Order: '));
    c.appendLink(parseCecho('<u>[pay]</u>'), 7, 'Pay him');
    expect(texts(c)).toEqual(['Order: [pay]']);
    expect(c.links).toEqual([{ row: 0, col: 7, len: 5, id: 7, hint: 'Pay him' }]);
  });

  it('drops the oldest lines past the cap and moves links up', () => {
    const drops: number[] = [];
    const c = new PaneContent('t', { maxLines: 3, onDrop: (id) => drops.push(id) });
    c.append(plain('1\n2\n3\n'));
    c.addLink(0, 0, 1, 1, '');
    c.addLink(2, 0, 1, 2, '');
    c.append(plain('4\n'));
    expect(texts(c)).toEqual(['2', '3', '4']);
    expect(drops).toEqual([1]);
    expect(c.links).toEqual([{ row: 1, col: 0, len: 1, id: 2, hint: '' }]);
  });

  it('cleans control characters and caps line length', () => {
    const c = new PaneContent('t');
    c.append(plain('a\tb\u0007c'));
    c.setLine(1, plain('x'.repeat(MAX_LINE_CELLS + 10)));
    expect(texts(c)[0]).toBe('a bc');
    expect(texts(c)[1]!.length).toBe(MAX_LINE_CELLS);
  });

  it('snapshots to plain data without functions or ids, and back', () => {
    const c = new PaneContent('Mercs');
    c.append(parseCecho('<green>ok'));
    c.setGauge(1, { value: 1, max: 2, color: 3, label: 'L' });
    c.addLink(0, 0, 2, 99, 'tip');
    const snap = c.snapshot();
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    expect(snap).toEqual({
      title: 'Mercs',
      lines: [{ spans: [{ text: 'ok', fg: TRUECOLOR | 0x00ff00 }] }, { gauge: { value: 1, max: 2, color: 3, label: 'L' } }],
      links: [{ row: 0, col: 0, len: 2, hint: 'tip' }],
    });
    const back = PaneContent.fromSnapshot(snap);
    expect(back.snapshot()).toEqual(snap);
    expect(back.linkAt(0, 1)!.hint).toBe('tip');
  });
});

describe('script pane ids in the layout and the settings', () => {
  const id = scriptPaneId('merc', 'main');
  const present = new Set([id]);

  it('ids: <script>/<pane>, validated', () => {
    expect(isScriptPaneId('merc/main')).toBe(true);
    for (const bad of ['merc', '/main', 'merc/', '1x/y', 'a/b/c', 'a/b c', `a/${'x'.repeat(33)}`]) expect(isScriptPaneId(bad), bad).toBe(false);
  });

  it('places a new pane at the end of its dock or as an auto float, once', () => {
    let m = placeScriptPane(defaultLayout(), id, { dock: 'left', rows: 6, cols: 20 });
    expect(m.docks.left.panes).toEqual([{ id, desired: 6 }]);
    expect(placeScriptPane(m, id, { dock: 'top', rows: 1, cols: 1 })).toBe(m);
    m = placeScriptPane(defaultLayout(), id, { dock: 'bottom', rows: 6, cols: 40 });
    expect(m.docks.bottom.panes).toEqual([{ id, desired: 40 }]);
    m = placeScriptPane(defaultLayout(), id, { dock: 'float', rows: 6, cols: 20 });
    expect(m.floating[0]).toEqual({ id, x: 0, y: 0, w: 22, h: 8, auto: true });
  });

  it('allocates a script pane only while it is present', () => {
    const layout = placeScriptPane(defaultLayout(), id, { dock: 'right', rows: 6, cols: 20 });
    const s = defaultSettings();
    const panes = { ...s.panes };
    const base = { layout, panes, cols: 160, rows: 50 };
    expect(allocate(base).panes.some((p) => p.id === id)).toBe(false);
    expect(allocate(base).hidden).not.toContain(id);
    const r = allocate({ ...base, present });
    const box = r.panes.find((p) => p.id === id)!;
    expect(box.dock).toBe('right');
    expect(box.framed).toBe(true);
    // Off in the settings: not shown.
    const off = allocate({ ...base, present, panes: { ...panes, [id]: { on: false, color: 'black', border: true } } });
    expect(off.panes.some((p) => p.id === id)).toBe(false);
  });

  it('drops a script pane right after the map when the dock is too short', () => {
    const layout = placeScriptPane(defaultLayout(), id, { dock: 'right', rows: 6, cols: 20 });
    const r = allocate({ layout, panes: defaultSettings().panes, present, cols: 160, rows: 18 });
    expect(r.hidden[0]).toBe(id);
  });

  it('an auto float sits at the top right of the game, left of the map', () => {
    const layout = placeScriptPane(defaultLayout(), id, { dock: 'float', rows: 6, cols: 20 });
    const r = allocate({ layout, panes: defaultSettings().panes, present, cols: 160, rows: 50 });
    const map = r.panes.find((p) => p.id === 'map')!;
    const me = r.panes.find((p) => p.id === id)!;
    expect(me.rect).toEqual({ x: map.rect.x - 22, y: r.game.y, w: 22, h: 8 });
  });

  it('migrate keeps well-formed script pane entries and repairs the rest', () => {
    const layout: LayoutModel = placeScriptPane(defaultLayout(), id, { dock: 'left', rows: 6, cols: 20 });
    const raw = JSON.parse(JSON.stringify({ ...defaultSettings(), layout }));
    raw.panes[id] = { on: false, color: 'red', border: 'yes' };
    raw.panes['bad id'] = { on: true };
    raw.panes['x/y'] = 'garbage';
    raw.layout.docks.left.panes.push({ id, desired: 3 }, { id: 'nope/', desired: 2 }, { id: 'a/b', desired: 'x' });
    raw.layout.floating.push({ id: 'c/d', x: 1, y: 2, w: 30, h: 9, auto: true });
    const s = migrateSettings(raw);
    expect(s.panes[id]).toEqual({ on: false, color: 'red', border: true });
    expect('bad id' in s.panes).toBe(false);
    expect('x/y' in s.panes).toBe(false);
    expect(s.layout.docks.left.panes).toEqual([
      { id, desired: 6 },
      { id: 'a/b', desired: 8 },
    ]);
    expect(s.layout.floating.find((f) => f.id === 'c/d')).toEqual({ id: 'c/d', x: 1, y: 2, w: 30, h: 9, auto: true });
    // The built-in panes are all still there.
    expect(findPane(s.layout, 'character')).not.toBeNull();
    expect(findFloat(migrateLayout(raw.layout), 'map')).toBeGreaterThanOrEqual(0);
  });

  it('togglePatch writes a whole entry for a script pane without one', () => {
    expect(togglePatch(defaultSettings().panes, id)).toEqual({ panes: { [id]: { on: false, color: 'black', border: true } } });
    expect(paneSettingsOf(defaultSettings().panes, id)).toEqual({ on: true, color: 'black', border: true });
  });
});

describe('drawing', () => {
  const ramp = { track: '#111', dim: '#222', mid: '#333', paneBg: '#000', vtext: '#eee', label: '#ddd', glow: '#fc0' };
  const ansi = defaultSettings().appearance.ansi;

  it('shows the newest lines with an indicator when the content is taller', () => {
    expect(paneView(3, 5)).toEqual({ first: 0, top: 0 });
    expect(paneView(10, 4)).toEqual({ first: 7, top: 1 });
    const c = new PaneContent('t');
    c.append(plain('1\n2\n3\n4\n5'));
    const rows = scriptPaneLines(c, 10, 3, ramp, false, ansi).map((l) => l.text());
    expect(rows).toEqual(['↑ 3 more r', '4         ', '5         ']);
  });

  it('draws a gauge with its fill, track and centred label; the hovered link glows', () => {
    expect(gaugeFill(30, 60, 10)).toBe(5);
    expect(gaugeFill(5, 0, 10)).toBe(0);
    const c = new PaneContent('t');
    c.setGauge(0, { value: 30, max: 60, label: 'half' });
    c.setLine(1, plain('[a]'));
    c.addLink(1, 0, 3, 1, '');
    const [g, l] = scriptPaneLines(c, 10, 2, ramp, false, ansi, c.links[0]!);
    expect(g!.text()).toBe('   half   ');
    expect(g!.bg.slice(0, 5).every((b) => b === '#005a18')).toBe(true);
    expect(g!.bg.slice(5).every((b) => b === '#111')).toBe(true);
    expect(l!.bg.slice(0, 3)).toEqual(['#fc0', '#fc0', '#fc0']);
    expect(l!.fg[0]).toBe('#000');
  });

  it('palette colours come from the user ANSI palette', () => {
    const c = new PaneContent('t');
    c.append(parseCecho('<ansi_red>x'));
    const [l] = scriptPaneLines(c, 3, 1, ramp, false, ['#000', '#123456', ...ansi.slice(2)]);
    expect(l!.fg[0]).toBe('#123456');
  });
});

describe('ScriptPane and the cockpit surface', () => {
  function rig() {
    const frames: Array<() => void> = [];
    const flush = (): void => {
      while (frames.length) frames.shift()!();
    };
    const root = document.createElement('div');
    document.body.append(root);
    Object.defineProperty(root, 'clientWidth', { value: 1600 });
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    const cells = { get: () => ({ w: 10, h: 20 }), subscribe: () => () => {} };
    const ctx = createPaneContext({ doc: document, settings, cells, requestFrame: (cb) => frames.push(cb) });
    const cockpit = new Cockpit({ root, settings, cells, requestFrame: (cb) => frames.push(cb), paneContext: ctx });
    // happy-dom has no layout: give the cockpit a size.
    Object.defineProperty(cockpit.el, 'clientWidth', { value: 1600 });
    Object.defineProperty(cockpit.el, 'clientHeight', { value: 1000 });
    cockpit.relayoutNow();
    const surface = new CockpitPaneSurface(cockpit, settings, ctx);
    return { settings, cockpit, surface, flush, ctx };
  }

  it('places a new pane, shows it while open and keeps its place after close', () => {
    const { settings, cockpit, surface, flush } = rig();
    const id = scriptPaneId('merc', 'main');
    const content = new PaneContent('Mercs');
    const sizes: string[] = [];
    const view = surface.open({ id, place: { dock: 'left', rows: 5, cols: 20 } }, content, {
      onLink: () => {},
      onResize: (c, r) => sizes.push(`${c}x${r}`),
    });
    expect(findPane(settings.get().layout, id)).toEqual({ dock: 'left', index: 0 });
    expect(settings.get().panes[id]).toEqual({ on: true, color: 'black', border: true });
    flush();
    const el = cockpit.el.querySelector<HTMLElement>(`.wc-pane[data-pane="${id}"]`)!;
    expect(el.hidden).toBe(false);
    expect(el.querySelector('.wc-pane-frame')!.textContent).toContain('Mercs');
    expect(cockpit.scriptPanes()).toEqual([{ id, script: 'merc', title: 'Mercs' }]);
    expect(sizes.length).toBeGreaterThan(0);
    content.append(plain('hello'));
    view.changed();
    flush();
    expect(el.querySelector('.wc-pane-content')!.textContent).toContain('hello');
    // The user moves it; close; open again: it is where the user put it.
    settings.update((d) => {
      d.layout.docks.left.panes = [];
      d.layout.docks.bottom.panes.push({ id, desired: 40 });
    });
    view.setOn(false);
    expect(view.isOn()).toBe(false);
    view.close();
    flush();
    expect(cockpit.el.querySelector(`.wc-pane[data-pane="${id}"]`)).toBeNull();
    expect(cockpit.scriptPanes()).toEqual([]);
    expect(findPane(settings.get().layout, id)).toEqual({ dock: 'bottom', index: 0 });
    expect(settings.get().panes[id]!.on).toBe(false);
    surface.open({ id, place: { dock: 'left', rows: 5, cols: 20 } }, new PaneContent('Mercs'), { onLink: () => {}, onResize: () => {} });
    expect(findPane(settings.get().layout, id)).toEqual({ dock: 'bottom', index: 0 });
    // A reset layout places an open pane again.
    settings.update({ layout: defaultLayout() });
    expect(findPane(settings.get().layout, id)).toEqual({ dock: 'left', index: 0 });
  });

  it('a click on a link calls onLink; hovering shows the hint and a pointer', () => {
    const { cockpit, surface, flush, ctx } = rig();
    const id = scriptPaneId('s', 'p');
    const content = new PaneContent('P');
    content.setLine(0, plain('[a] [b]'));
    content.addLink(0, 4, 3, 42, 'Order B\nsecond line');
    const clicks: number[] = [];
    surface.open({ id, place: { dock: 'right', rows: 3, cols: 20 } }, content, { onLink: (n) => clicks.push(n), onResize: () => {} });
    flush();
    const pane = cockpit.pane(id) as ScriptPane;
    expect(pane).toBeInstanceOf(ScriptPane);
    // happy-dom: the content's client rect is at 0, 0; cells are 10 × 20 px.
    const at = (col: number, row: number) => ({ clientX: col * 10 + 5, clientY: row * 20 + 5, bubbles: true });
    pane.content.dispatchEvent(new PointerEvent('pointermove', at(5, 0)));
    expect(pane.hovered?.id).toBe(42);
    expect(pane.content.style.cursor).toBe('pointer');
    const tip = cockpit.el.querySelector<HTMLElement>('.wc-spane-tip')!;
    expect(tip.hidden).toBe(false);
    expect([...tip.children].map((c) => c.textContent)).toEqual([' Order B ', ' second line ']);
    pane.content.dispatchEvent(new MouseEvent('click', at(5, 0)));
    pane.content.dispatchEvent(new MouseEvent('click', at(1, 0)));
    expect(clicks).toEqual([42]);
    pane.content.dispatchEvent(new PointerEvent('pointermove', at(1, 0)));
    expect(pane.hovered).toBeNull();
    expect(tip.hidden).toBe(true);
    void ctx;
  });

  it('the close cross switches a script pane off with a whole settings entry', () => {
    const { settings, cockpit, surface, flush } = rig();
    const id = scriptPaneId('s', 'q');
    surface.open({ id, place: { dock: 'right', rows: 3, cols: 20 } }, new PaneContent('Q'), { onLink: () => {}, onResize: () => {} });
    flush();
    const close = cockpit.el.querySelector<HTMLElement>(`.wc-pane[data-pane="${id}"] .wc-pane-close`)!;
    expect(close.title).toBe('Hide Q');
    close.click();
    expect(settings.get().panes[id]).toEqual({ on: false, color: 'black', border: true });
  });
});
