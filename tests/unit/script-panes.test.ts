// @vitest-environment happy-dom
// Script panes (ADR 0053): the content model, dynamic pane ids in the
// layout and the settings, the drawn pane with links and tooltips, and
// the cockpit surface that places and remembers them.

import { legacyLayout, legacySettings } from './legacy-defaults';
import { describe, expect, it } from 'vitest';
import { TRUECOLOR, shadeColor } from '../../src/core/types';
import { allocate } from '../../src/layout/allocate';
import { Cockpit } from '../../src/layout/cockpit';
import { findFloat, findPane, floatPane, movePane, moveToNewLane, placeScriptPane, setLaneSize, togglePatch } from '../../src/layout/model';
import { type LayoutModel, PANE_COLORS, defaultLayout, dockPanes, isScriptPaneId, isTempPaneId, scriptPaneId, tempPaneId } from '../../src/layout/types';
import { createPaneContext } from '../../src/panes/context';
import { MAX_LINE_CELLS, MAX_ROW_GAUGES, PaneContent, overlay, plain } from '../../src/panes/script-content';
import { paneTheme, themeFill, themeKey } from '../../src/panes/pane-theme';
import { applyPaneRecord, encodePaneRecord, recordState } from '../../src/panes/script-record';
import { washout } from '../../src/theme/color';
import { type FieldEvent, ScriptPane, gaugeFill, paneIndicator, paneInk, scriptPaneRows, wheelSteps } from '../../src/panes/script-pane';
import { contrast, hoverLift, lightness, paneShades } from '../../src/theme/color';
import { CockpitPaneSurface, RecordingPaneSurface } from '../../src/panes/script-surface';
import { TEMP_PLACES_KEY, forgetTempPlaces, saveTempPlace, tempPlace } from '../../src/layout/temp-places';
import { parseCecho } from '../../src/scripts/colors';
import { SettingsStore, migrateLayout, migrateSettings } from '../../src/settings';
import { paneSettingsOf } from '../../src/settings/types';

/** The dock entry of `id` in `m`. */
const findPaneEntry = (m: LayoutModel, id: string) =>
  Object.values(m.docks).flatMap(dockPanes).find((p) => p.id === id);

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

describe('PaneContent text fields (ADR 0055)', () => {
  it('adds, edits and removes fields; overlapping and redrawn rows drop them', () => {
    const dropped: number[] = [];
    const c = new PaneContent('t', { onDropField: (id) => dropped.push(id) });
    c.setLine(0, plain('Name: '));
    c.addField(0, 6, 10, 1, { value: 'home\nx', placeholder: 'name', maxLength: 6 });
    expect(c.fields).toEqual([{ row: 0, col: 6, len: 10, id: 1, value: 'home x', placeholder: 'name', maxLength: 6 }]);
    expect(c.setFieldValue(1, 'abcdefgh')).toBe(true);
    expect(c.field(1)!.value).toBe('abcdef');
    expect(c.setFieldValue(1, 'abcdef')).toBe(false);
    expect(c.setFieldValue(9, 'x')).toBe(false);
    // An overlapping field replaces it.
    c.addField(0, 10, 3, 2);
    expect(dropped).toEqual([1]);
    // Another row keeps its field; setLine, setGauge and clear drop theirs.
    c.addField(2, 0, 4, 3);
    c.setLine(0, plain('x'));
    expect(dropped).toEqual([1, 2]);
    c.setGauge(2, { value: 1, max: 2, label: '' });
    expect(dropped).toEqual([1, 2, 3]);
    c.addField(1, 0, 4, 4);
    c.removeField(4);
    c.addField(1, 0, 4, 5);
    c.clear();
    expect(dropped).toEqual([1, 2, 3, 4, 5]);
    expect(c.fields).toEqual([]);
  });

  it('a snapshot bakes the value into its line as underlined text; load drops fields', () => {
    const c = new PaneContent('t');
    c.setLine(0, parseCecho('<red>Name:<reset> [          ] ok'));
    c.addField(0, 7, 10, 1, { value: 'home' });
    c.addField(3, 2, 3, 2, { value: 'abcdef' });
    const s = c.snapshot();
    expect(texts(PaneContent.fromSnapshot(s))).toEqual(['Name: [home      ] ok', '', '', '  abc']);
    const l = s.lines[0]!;
    expect('spans' in l && l.spans.find((x) => x.text === 'home      ')!.underline).toBe(true);
    expect('spans' in l && l.spans[0]!.fg).toBeDefined();
    expect(c.fields).toHaveLength(2);
    const d = PaneContent.fromSnapshot(s);
    expect(d.fields).toEqual([]);
    expect(overlay([{ text: 'abcdef' }], 2, { text: 'XY' }).map((x) => x.text).join('')).toBe('abXYef');
  });
});

describe('PaneContent partial updates (ADR 0056)', () => {
  it('setText writes over cells and keeps the row\'s links and fields; identical writes change nothing', () => {
    const dropped: number[] = [];
    const c = new PaneContent('t', { onDrop: (id) => dropped.push(id) });
    c.setLine(0, plain(' home  12h t'));
    c.addLink(0, 11, 1, 1, 'Teleport');
    c.addField(0, 1, 4, 2);
    const v = c.version;
    c.setText(0, 7, parseCecho('<orange>11h'));
    expect(texts(c)[0]).toBe(' home  11h t');
    expect(c.links).toHaveLength(1);
    expect(c.fields).toHaveLength(1);
    expect(c.version).toBe(v + 1);
    c.setText(0, 7, parseCecho('<orange>11h'));
    expect(c.version).toBe(v + 1);
    // Past the end: padded.
    c.setText(2, 3, plain('x'));
    expect(texts(c)[2]).toBe('   x');
    c.setGauge(3, { value: 1, max: 2, label: '' });
    expect(() => c.setText(3, 0, plain('x'))).toThrow(/gauge/);
    // setLine with the same text and no links: no change.
    const w = c.version;
    c.setLine(2, plain('   x'));
    expect(c.version).toBe(w);
    expect(dropped).toEqual([]);
  });

  it('a link without a function is a tooltip only, also in a snapshot', () => {
    const c = new PaneContent('t');
    c.setLine(0, plain('12h'));
    c.addLink(0, 0, 3, 1, 'Time left', true);
    expect(c.links[0]!.tip).toBe(true);
    expect(c.snapshot().links).toEqual([{ row: 0, col: 0, len: 3, hint: 'Time left', tip: true }]);
    expect(PaneContent.fromSnapshot(c.snapshot()).links[0]!.tip).toBe(true);
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
    let m = placeScriptPane(legacyLayout(), id, { dock: 'left', rows: 6, cols: 20 });
    expect(m.docks.left.lanes).toEqual([{ size: 33, panes: [{ id, desired: 6 }] }]);
    expect(placeScriptPane(m, id, { dock: 'top', rows: 1, cols: 1 })).toBe(m);
    m = placeScriptPane(legacyLayout(), id, { dock: 'bottom', rows: 6, cols: 40 });
    expect(m.docks.bottom.lanes).toEqual([{ size: 10, panes: [{ id, desired: 40 }] }]);
    // A dock with lanes: the end of lane 0.
    const two = moveToNewLane(legacyLayout(), 'ui', 'right', 1, 20);
    expect(placeScriptPane(two, id, { dock: 'right', rows: 4, cols: 9 }).docks.right.lanes.map((l) => l.panes.map((p) => p.id))).toEqual([
      ['character', 'timers', 'group', 'comm', id],
      ['ui'],
    ]);
    m = placeScriptPane(legacyLayout(), id, { dock: 'float', rows: 6, cols: 20 });
    expect(m.floating[0]).toEqual({ id, x: 0, y: 0, w: 22, h: 8, auto: true });
  });

  it('allocates a script pane only while it is present', () => {
    const layout = placeScriptPane(legacyLayout(), id, { dock: 'right', rows: 6, cols: 20 });
    const s = legacySettings();
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
    const layout = placeScriptPane(legacyLayout(), id, { dock: 'right', rows: 6, cols: 20 });
    const r = allocate({ layout, panes: legacySettings().panes, present, cols: 160, rows: 18 });
    expect(r.hidden[0]).toBe(id);
  });

  it('an auto float sits at the top right of the game, left of the map', () => {
    const layout = placeScriptPane(legacyLayout(), id, { dock: 'float', rows: 6, cols: 20 });
    const r = allocate({ layout, panes: legacySettings().panes, present, cols: 160, rows: 50 });
    const map = r.panes.find((p) => p.id === 'map')!;
    const me = r.panes.find((p) => p.id === id)!;
    expect(me.rect).toEqual({ x: map.rect.x - 22, y: r.game.y, w: 22, h: 8 });
  });

  it('migrate keeps well-formed script pane entries and repairs the rest', () => {
    const layout: LayoutModel = placeScriptPane(legacyLayout(), id, { dock: 'left', rows: 6, cols: 20 });
    const raw = JSON.parse(JSON.stringify({ ...legacySettings(), layout }));
    raw.panes[id] = { on: false, color: 'red', border: 'yes' };
    raw.panes['bad id'] = { on: true };
    raw.panes['x/y'] = 'garbage';
    raw.layout.docks.left.lanes[0].panes.push({ id, desired: 3 }, { id: 'nope/', desired: 2 }, { id: 'a/b', desired: 'x' });
    raw.layout.floating.push({ id: 'c/d', x: 1, y: 2, w: 30, h: 9, auto: true });
    const s = migrateSettings(raw);
    expect(s.panes[id]).toEqual({ on: false, color: 'red', border: true });
    expect('bad id' in s.panes).toBe(false);
    expect('x/y' in s.panes).toBe(false);
    expect(s.layout.docks.left.lanes[0]!.panes).toEqual([
      { id, desired: 6 },
      { id: 'a/b', desired: 8 },
    ]);
    expect(s.layout.floating.find((f) => f.id === 'c/d')).toEqual({ id: 'c/d', x: 1, y: 2, w: 30, h: 9, auto: true });
    // The built-in panes are all still there.
    expect(findPane(s.layout, 'character')).not.toBeNull();
    expect(findFloat(migrateLayout(raw.layout), 'map')).toBeGreaterThanOrEqual(0);
  });

  it('togglePatch writes a whole entry for a script pane without one', () => {
    expect(togglePatch(legacySettings().panes, id)).toEqual({ panes: { [id]: { on: false, color: 'black', border: true } } });
    expect(paneSettingsOf(legacySettings().panes, id)).toEqual({ on: true, color: 'black', border: true });
  });
});

describe('drawing', () => {
  const ramp = { track: '#111', dim: '#222', mid: '#333', paneBg: '#000', vtext: '#eee', label: '#ddd', glow: '#fc0' };
  const ansi = legacySettings().appearance.ansi;

  it('draws every line for the scroller; the indicator counts the rows away from the anchor', () => {
    const c = new PaneContent('t');
    c.append(plain('1\n2\n3\n4\n5'));
    expect(scriptPaneRows(c, 3, ramp, false, ansi).map((l) => l.text())).toEqual(['1  ', '2  ', '3  ', '4  ', '5  ']);
    // 10 lines in a 4-row pane: 3 rows of list and the indicator.
    expect(paneIndicator(3, 5, 0, 'bottom')).toBeNull();
    expect(paneIndicator(10, 4, 7, 'bottom')).toEqual({ text: '↑ 7 more rows', away: false });
    expect(paneIndicator(10, 4, 2, 'bottom')).toEqual({ text: '↓ 5 rows below', away: true });
    expect(paneIndicator(10, 4, 0, 'top')).toEqual({ text: '↓ 7 more rows', away: false });
    expect(paneIndicator(10, 4, 1, 'top')).toEqual({ text: '↑ 1 row above', away: true });
    expect(paneIndicator(10, 4, 99, 'top')).toEqual({ text: '↑ 7 rows above', away: true });
  });

  it("a field's text (vtext) is readable on its band (track) for every pane colour, dark and light", () => {
    for (const bg of ['#000000', '#f4f0e6']) {
      for (const color of PANE_COLORS) {
        const r = paneShades(color, bg);
        expect(contrast(r.vtext, r.track), `${color} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('hides the text under a text field: its cells are blank on the band', () => {
    const c = new PaneContent('t');
    c.setLine(0, plain(' ★ $deer  12h t'));
    c.addField(0, 4, 6, 1, { value: 'deerpopop' });
    const [l] = scriptPaneRows(c, 16, ramp, false, ansi);
    expect(l!.text()).toBe(' ★ $      12h t ');
    expect(l!.bg.slice(4, 10).every((b) => b === '#111')).toBe(true);
    expect(l!.bg[3]).toBe('');
    // A field past the line's end still gets its band.
    c.addField(0, 14, 4, 2);
    const [m] = scriptPaneRows(c, 16, ramp, false, ansi);
    expect(m!.text()).toBe(' ★ $      12h   ');
  });

  it('draws a gauge with its fill, track and centred label; the hovered link glows', () => {
    expect(gaugeFill(30, 60, 10)).toBe(5);
    expect(gaugeFill(5, 0, 10)).toBe(0);
    const c = new PaneContent('t');
    c.setGauge(0, { value: 30, max: 60, label: 'half' });
    c.setLine(1, plain('[a]'));
    c.addLink(1, 0, 3, 1, '');
    const [g, l] = scriptPaneRows(c, 10, ramp, false, ansi, c.links[0]!);
    expect(g!.text()).toBe('   half   ');
    expect(g!.bg.slice(0, 5).every((b) => b === '#005a18')).toBe(true);
    expect(g!.bg.slice(5).every((b) => b === '#111')).toBe(true);
    expect(l!.bg.slice(0, 3)).toEqual(['#fc0', '#fc0', '#fc0']);
    expect(l!.fg[0]).toBe('#000');
  });

  it('gauges over part of a row: several per row, each from its column, the fill whole cells (ADR 0090)', () => {
    const c = new PaneContent('t');
    // A Group-like row: three bars, no gaps, and a name over them.
    c.addGauge(0, { value: 10, max: 10, label: '', col: 0, width: 4, color: TRUECOLOR | 0x005a18 });
    c.addGauge(0, { value: 1, max: 2, label: '', col: 4, width: 4, color: TRUECOLOR | 0x0000aa });
    c.addGauge(0, { value: 0, max: 5, label: '', col: 8, color: TRUECOLOR | 0x5a3c1e, track: false });
    c.setText(0, 0, plain('Gimli'));
    const l = c.lines[0]!;
    expect('spans' in l && l.gauges!.map((g) => [g.col, g.width])).toEqual([[0, 4], [4, 4], [8, undefined]]);
    const [row] = scriptPaneRows(c, 12, ramp, false, ansi);
    expect(row!.text()).toBe('Gimli       ');
    expect(row!.bg).toEqual([...Array(4).fill('#005a18'), '#0000aa', '#0000aa', ramp.track, ramp.track, ...Array(4).fill('')]);
    // The text over a bar keeps the bar's background; its own colour is the ink.
    expect(row!.fg[0]).toBe('');
    // The last bar runs to the pane's edge, whatever the width.
    c.lines[0] = { spans: [], gauges: [{ value: 3, max: 4, label: '', col: 8 }] };
    const [wide] = scriptPaneRows(c, 16, ramp, false, ansi);
    expect(wide!.bg.slice(8).filter((b) => b === '#005a18')).toHaveLength(6);
  });

  it('gauge labels: centred, left or right in their own bar; a plain space over a bar shows it through', () => {
    const c = new PaneContent('t');
    c.addGauge(0, { value: 0, max: 1, label: 'ab', col: 0, width: 6 });
    c.addGauge(0, { value: 0, max: 1, label: 'cd', col: 6, width: 6, align: 'left' });
    c.addGauge(0, { value: 0, max: 1, label: 'ef', col: 12, width: 6, align: 'right' });
    expect(scriptPaneRows(c, 18, ramp, false, ansi)[0]!.text()).toBe('  ab  cd        ef');
    // setText pads with spaces: they do not hide a label; other characters do.
    c.setText(0, 16, plain('X'));
    const [r] = scriptPaneRows(c, 18, ramp, false, ansi);
    expect(r!.text()).toBe('  ab  cd        Xf');
    expect(r!.fg[2]).toBe(ramp.vtext);
    // A space with its own background is drawn.
    c.setText(0, 2, { text: ' ', runs: [{ start: 0, end: 1, bg: shadeColor('glow') }] });
    expect(scriptPaneRows(c, 18, ramp, false, ansi)[0]!.text()).toBe('   b  cd        Xf');
    // A full-width gauge aligns too, and its own track colour or none.
    const f = new PaneContent('t');
    f.setGauge(0, { value: 1, max: 4, label: '12m', align: 'right', track: TRUECOLOR | 0x333333 });
    f.setGauge(1, { value: 1, max: 4, label: 'x', align: 'left', track: false });
    const [a, b] = scriptPaneRows(f, 8, ramp, false, ansi);
    expect(a!.text()).toBe('     12m');
    expect(a!.bg).toEqual(['#005a18', '#005a18', ...Array(6).fill('#333333')]);
    expect(b!.text()).toBe('x       ');
    expect(b!.bg).toEqual(['#005a18', '#005a18', ...Array(6).fill('')]);
  });

  it('gauge fills are washed on a light pane, as the Group bars', () => {
    const c = new PaneContent('t');
    c.addGauge(0, { value: 1, max: 1, label: '', col: 2, width: 3, color: TRUECOLOR | 0x0000aa });
    const [l] = scriptPaneRows(c, 6, ramp, true, ansi);
    expect(l!.bg.slice(2, 5)).toEqual(Array(3).fill(washout('#0000aa')));
  });

  it('addGauge drops the gauges it overlaps and keeps text, links and fields; setLine and clear drop gauges', () => {
    const dropped: number[] = [];
    const c = new PaneContent('t', { onDrop: (id) => dropped.push(id) });
    c.setLine(0, plain('name'));
    c.addLink(0, 0, 4, 7, 'hint');
    c.addField(0, 10, 3, 8);
    c.addGauge(0, { value: 1, max: 2, label: '', col: 0, width: 5 });
    c.addGauge(0, { value: 1, max: 2, label: '', col: 5, width: 5 });
    const v = c.version;
    // The same gauge again: no change.
    c.addGauge(0, { value: 1, max: 2, label: '', col: 5, width: 5 });
    expect(c.version).toBe(v);
    c.addGauge(0, { value: 2, max: 2, label: '', col: 3, width: 4 });
    const l = c.lines[0]!;
    expect('spans' in l && l.gauges!.map((g) => g.col)).toEqual([3]);
    expect(texts(c)).toEqual(['name']);
    expect(c.links).toHaveLength(1);
    expect(c.fields).toHaveLength(1);
    expect(dropped).toEqual([]);
    // No width: to the edge, so it overlaps everything to its right.
    c.addGauge(0, { value: 0, max: 1, label: '', col: 8 });
    c.addGauge(0, { value: 0, max: 1, label: '', col: 20, width: 2 });
    expect('spans' in c.lines[0]! && c.lines[0].gauges!.map((g) => g.col)).toEqual([3, 20]);
    // setText keeps them; setLine drops them with the links.
    c.setText(0, 0, plain('NAME'));
    expect('spans' in c.lines[0]! && c.lines[0].gauges).toHaveLength(2);
    c.setLine(0, plain('name'));
    expect(c.lines[0]).toEqual({ spans: [{ text: 'name' }] });
    expect(dropped).toEqual([7]);
    // On a full-width gauge row the full gauge goes; on a new row the list grows.
    c.setGauge(1, { value: 1, max: 1, label: 'full' });
    c.addGauge(1, { value: 1, max: 1, label: 'part', col: 2, width: 3 });
    expect(c.lines[1]).toEqual({ spans: [], gauges: [{ value: 1, max: 1, label: 'part', col: 2, width: 3 }] });
    c.addGauge(4, { value: 1, max: 1, label: '', col: 0, width: 1 });
    expect(c.lines).toHaveLength(5);
    // A full gauge replaces the row's partial ones.
    c.setGauge(1, { value: 0, max: 1, label: 'full', col: 4, width: 2 });
    expect(c.lines[1]).toEqual({ gauge: { value: 0, max: 1, label: 'full' } });
    expect(() => c.addGauge(0, { value: 0, max: 1, label: '', col: MAX_LINE_CELLS })).toThrow(RangeError);
    for (let i = 0; i < MAX_ROW_GAUGES; i++) c.addGauge(2, { value: 0, max: 1, label: '', col: i, width: 1 });
    expect(() => c.addGauge(2, { value: 0, max: 1, label: '', col: MAX_ROW_GAUGES, width: 1 })).toThrow(/gauges already/);
    c.clear();
    expect(c.lines).toEqual([]);
  });

  it('partial gauges survive a snapshot, a run record and its sanitizer', () => {
    const c = new PaneContent('t');
    c.setLine(0, plain('ab'));
    c.addGauge(0, { value: 2, max: 4, label: 'x', col: 1, width: 3, align: 'right', track: false, color: shadeColor('mid') });
    const snap = c.snapshot();
    expect(snap.lines[0]).toEqual({ spans: [{ text: 'ab' }], gauges: [{ value: 2, max: 4, label: 'x', col: 1, width: 3, align: 'right', track: false, color: shadeColor('mid') }] });
    const copy = PaneContent.fromSnapshot(snap);
    expect(copy.lines).toEqual(c.lines);
    (snap.lines[0] as { gauges: unknown[] }).gauges.length = 0;
    expect('spans' in c.lines[0]! && c.lines[0].gauges).toHaveLength(1);
    const enc = encodePaneRecord(null, c.snapshot())!;
    expect(applyPaneRecord(null, enc.payload)!.lines).toEqual(c.lines);
    // A changed value goes as the whole line (no gauge patch for partial gauges).
    c.addGauge(0, { value: 3, max: 4, label: 'x', col: 1, width: 3, align: 'right', track: false, color: shadeColor('mid') });
    const d = encodePaneRecord(recordState(snap), c.snapshot())!;
    expect(applyPaneRecord(applyPaneRecord(null, enc.payload), d.payload)!.lines).toEqual(c.lines);
    // A shared file is checked: bad gauges go, good ones are capped.
    const bad = applyPaneRecord(null, JSON.stringify({ title: 't', links: [], lines: [{ spans: [], gauges: [{ value: 1, max: 2 }, { col: 2, width: 9999, value: 9, max: 2, align: 'up', track: 'red' }, 'junk'] }] }))!;
    expect(bad.lines[0]).toEqual({ spans: [], gauges: [{ value: 2, max: 2, label: '', col: 2, width: MAX_LINE_CELLS - 2 }] });
  });

  it('hover styles: band (the default), lighten (text and background a step lighter), none; per link or per pane (ADR 0065 round 2)', () => {
    const c = new PaneContent('t');
    c.setLine(0, { text: 'ON OFF x', runs: [{ start: 0, end: 2, bg: shadeColor('glow'), fg: shadeColor('paneBg') }, { start: 3, end: 6, bg: shadeColor('track'), fg: shadeColor('mid') }] });
    c.addLink(0, 0, 2, 1, '');
    c.addLink(0, 3, 3, 2, '', false, 'lighten');
    c.addLink(0, 7, 1, 3, '', false, 'none');
    // The pane default is the band, also on a lit (glow) cell: no inverted rule any more.
    const [band] = scriptPaneRows(c, 8, ramp, false, ansi, c.links[0]!);
    expect(band!.bg.slice(0, 2)).toEqual([ramp.glow, ramp.glow]);
    expect(band!.fg[0]).toBe(ramp.paneBg);
    // Lighten: each colour a step lighter (HSL L + HOVER_LIFT), both text and background.
    const [lit] = scriptPaneRows(c, 8, ramp, false, ansi, c.links[1]!);
    expect(lit!.bg.slice(3, 6)).toEqual(Array(3).fill(hoverLift(ramp.track)));
    expect(lit!.fg.slice(3, 6)).toEqual(Array(3).fill(hoverLift(ramp.mid)));
    expect(lightness(lit!.bg[3]!)).toBeGreaterThan(lightness(ramp.track));
    expect(lightness(lit!.fg[3]!)).toBeGreaterThan(lightness(ramp.mid));
    // Cells in the pane's own colours lift the ink and the pane background.
    const ink = paneInk('#c0c0c0', '#000000', false);
    c.addLink(0, 7, 1, 4, '', false, 'lighten');
    const [own] = scriptPaneRows(c, 8, ramp, false, ansi, c.links[2]!, ink, '#000000');
    expect(own!.fg[7]).toBe(hoverLift('#c0c0c0'));
    expect(own!.bg[7]).toBe(hoverLift('#000000'));
    // None: as at rest.
    c.addLink(0, 7, 1, 5, '', false, 'none');
    const [rest] = scriptPaneRows(c, 8, ramp, false, ansi);
    const [none] = scriptPaneRows(c, 8, ramp, false, ansi, c.links[2]!);
    expect(none!.key()).toBe(rest!.key());
    // The pane's style applies to links without their own, including existing ones.
    c.setHover('lighten');
    const [paneLit] = scriptPaneRows(c, 8, ramp, false, ansi, c.links[0]!);
    expect(paneLit!.bg[0]).toBe(hoverLift(ramp.glow));
    expect(paneLit!.fg[0]).toBe(hoverLift(ramp.paneBg));
    expect(c.hoverOf(c.links[2]!)).toBe('none');
    // A snapshot records each link's effective style when not the band; load restores it.
    c.addLink(0, 3, 3, 6, '', false, 'band');
    const snap = c.snapshot();
    expect(snap.links.map((l) => l.hover)).toEqual(['lighten', 'none', undefined]);
    const back = PaneContent.fromSnapshot(snap);
    expect(back.links.map((l) => back.hoverOf(l))).toEqual(['lighten', 'none', 'band']);
  });

  it("the pane bar's off text (@mid on @track) reads at about 3:1 on dark and paper, far lighter than @bg on dark (ADR 0065 round 2)", () => {
    for (const bg of ['#000000', '#f4ecd8']) {
      const r = paneShades('black', bg);
      const c = contrast(r.mid, r.track);
      expect(c, bg).toBeGreaterThanOrEqual(2.6);
      expect(c, bg).toBeLessThanOrEqual(3.5);
    }
    const dark = paneShades('black', '#000000');
    expect(contrast(dark.paneBg, dark.track)).toBeLessThan(1.5);
  });

  it('lighten lifts both colours on the real ramps, dark and paper, for on and off buttons (ADR 0065 round 2)', () => {
    for (const bg of ['#000000', '#f4ecd8']) {
      const r = paneShades('black', bg);
      for (const [fg, fill] of [[r.paneBg, r.glow], [r.mid, r.track]] as const) {
        const f2 = hoverLift(fg);
        const b2 = hoverLift(fill);
        expect(lightness(f2), `${bg} fg`).toBeGreaterThan(lightness(fg) + 5);
        expect(lightness(b2), `${bg} bg`).toBeGreaterThan(lightness(fill) + 5);
        // Subtle: the hovered button keeps its contrast within a third.
        expect(contrast(f2, b2) / contrast(fg, fill), bg).toBeGreaterThan(0.66);
      }
    }
  });

  it('palette colours come from the user ANSI palette', () => {
    const c = new PaneContent('t');
    c.append(parseCecho('<ansi_red>x'));
    const [l] = scriptPaneRows(c, 3, ramp, false, ['#000', '#123456', ...ansi.slice(2)]);
    expect(l!.fg[0]).toBe('#123456');
  });

  it('shade-role colours come from the pane ramp, as is, on dark and light panes (ADR 0065)', () => {
    const c = new PaneContent('t');
    c.append(parseCecho('<@text:@dim>a<@mid:@track>b<:@glow>c<@bg>d', { shades: true }));
    for (const light of [false, true]) {
      const ink = paneInk('#202020', light ? '#f4ecd8' : '#000000', light);
      const [l] = scriptPaneRows(c, 4, ramp, light, ansi, null, ink);
      expect(l!.fg.slice(0, 2)).toEqual(['#eee', '#333']);
      expect(l!.bg.slice(0, 3)).toEqual(['#222', '#111', '#fc0']);
      expect(l!.fg[3]).toBe('#000');
    }
    // The real ramps: on (@text on @dim) reads, and is lighter than off (@mid on @track) on dark.
    for (const bg of ['#000000', '#f4f0e6']) {
      const r = paneShades('black', bg);
      expect(contrast(r.vtext, r.dim), bg).toBeGreaterThanOrEqual(3);
    }
  });

  it('text meets the pane: light ink on a dark tint over a light terminal, 4.5:1 colours on a light pane', () => {
    const c = new PaneContent('t');
    c.append(parseCecho('a<yellow>b'));
    // A dark tint (blue fill) on the paper preset: the dark terminal fg turns light.
    const dark = paneInk('#202020', '#0e1621', false);
    const [d] = scriptPaneRows(c, 2, ramp, false, ansi, null, dark);
    expect(contrast(d!.fg[0]!, '#0e1621')).toBeGreaterThanOrEqual(4.5);
    expect(d!.fg[1]).toBe(ansi[11]);
    // A light pane: yellow is shifted and darkened until it reads.
    const light = paneInk('#202020', '#f4ecd8', true);
    const [l] = scriptPaneRows(c, 2, ramp, true, ansi, null, light);
    expect(l!.fg[0]).toBe('#202020');
    expect(contrast(l!.fg[1]!, '#f4ecd8')).toBeGreaterThanOrEqual(4.5);
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
    // The layout these tests were written for (before ADR 0078).
    settings.update((d) => {
      Object.assign(d, legacySettings());
    });
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

  it('view.theme() is the pane colours now; onTheme follows a change of them only, once, after the update (ADR 0090)', async () => {
    const { settings, surface } = rig();
    const id = scriptPaneId('th', 'main');
    let calls = 0;
    const view = surface.open({ id, place: { dock: 'left', rows: 5, cols: 20 } }, new PaneContent('T'), {
      onLink: () => {},
      onResize: () => {},
      onTheme: () => calls++,
    });
    const t0 = view.theme!();
    expect(t0).toEqual(paneTheme(settings.get(), id));
    expect(t0.light).toBe(false);
    // Not a colour change: no call.
    settings.update((d) => {
      d.layout.docks.left.lanes[0]!.size += 1;
    });
    await Promise.resolve();
    expect(calls).toBe(0);
    // The pane colour, twice in one go: one call, in a microtask.
    settings.update((d) => {
      d.panes[id] = { ...paneSettingsOf(d.panes, id), color: 'blue' };
    });
    settings.update((d) => {
      d.panes[id] = { ...paneSettingsOf(d.panes, id), color: 'green' };
    });
    expect(calls).toBe(0);
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(themeKey(view.theme!())).not.toBe(themeKey(t0));
    // A light terminal (paper): the pane goes light, fills are washed.
    settings.update((d) => {
      d.panes[id] = { ...paneSettingsOf(d.panes, id), color: 'black' };
      d.appearance.bg = '#f4ecd8';
    });
    await Promise.resolve();
    expect(calls).toBe(2);
    const t1 = view.theme!();
    expect(t1.light).toBe(true);
    expect(themeFill(t1, TRUECOLOR | 0x0000aa)).toBe(washout('#0000aa'));
    expect(themeFill(t0, undefined)).toBe('#005a18');
    // Closed: no more calls.
    view.close();
    settings.update((d) => {
      d.appearance.bg = '#000000';
    });
    await Promise.resolve();
    expect(calls).toBe(2);
  });

  it('places a new pane, shows it while open and keeps its place after close', () => {
    const { settings, cockpit, surface, flush } = rig();
    const id = scriptPaneId('merc', 'main');
    const content = new PaneContent('Mercs');
    const sizes: string[] = [];
    const view = surface.open({ id, place: { dock: 'left', rows: 5, cols: 20 } }, content, {
      onLink: () => {},
      onResize: (c, r) => sizes.push(`${c}x${r}`),
    });
    expect(findPane(settings.get().layout, id)).toEqual({ dock: 'left', lane: 0, index: 0 });
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
      d.layout.docks.left.lanes = [];
      d.layout.docks.bottom.lanes = [{ size: 10, panes: [{ id, desired: 40 }] }];
    });
    view.setOn(false);
    expect(view.isOn()).toBe(false);
    view.close();
    flush();
    expect(cockpit.el.querySelector(`.wc-pane[data-pane="${id}"]`)).toBeNull();
    expect(cockpit.scriptPanes()).toEqual([]);
    expect(findPane(settings.get().layout, id)).toEqual({ dock: 'bottom', lane: 0, index: 0 });
    expect(settings.get().panes[id]!.on).toBe(false);
    surface.open({ id, place: { dock: 'left', rows: 5, cols: 20 } }, new PaneContent('Mercs'), { onLink: () => {}, onResize: () => {} });
    expect(findPane(settings.get().layout, id)).toEqual({ dock: 'bottom', lane: 0, index: 0 });
    // A reset layout places an open pane again.
    settings.update({ layout: legacyLayout() });
    expect(findPane(settings.get().layout, id)).toEqual({ dock: 'left', lane: 0, index: 0 });
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
    // A click is a press and a release on the same link (pointer events, not
    // the DOM click, which a redraw between them would lose).
    const press = (a: ReturnType<typeof at>, b = a) => {
      pane.content.dispatchEvent(new PointerEvent('pointerdown', { ...a, button: 0, isPrimary: true }));
      pane.content.dispatchEvent(new PointerEvent('pointerup', { ...b, button: 0, isPrimary: true }));
    };
    press(at(5, 0));
    press(at(1, 0));
    expect(clicks).toEqual([42]);
    // The DOM click alone does nothing; a release off the link neither.
    pane.content.dispatchEvent(new MouseEvent('click', at(5, 0)));
    press(at(5, 0), at(1, 0));
    expect(clicks).toEqual([42]);
    // The row redrawn (a new link id) between press and release: still a click, with the new id.
    pane.content.dispatchEvent(new PointerEvent('pointerdown', { ...at(5, 0), button: 0, isPrimary: true }));
    content.setLine(0, plain('[a] [b]'));
    content.addLink(0, 4, 3, 43, 'Order B');
    pane.changed();
    flush();
    pane.content.dispatchEvent(new PointerEvent('pointerup', { ...at(5, 0), button: 0, isPrimary: true }));
    expect(clicks).toEqual([42, 43]);
    pane.content.dispatchEvent(new PointerEvent('pointermove', at(1, 0)));
    expect(pane.hovered).toBeNull();
    expect(tip.hidden).toBe(true);
    void ctx;
  });

  it('the hover ends when the pointer leaves over an element on top of the content (sticky hover, ADR 0065 round 2)', () => {
    const { cockpit, surface, flush } = rig();
    const id = scriptPaneId('s', 'p');
    const content = new PaneContent('P');
    content.setLine(0, plain('[a] [b]'));
    content.addLink(0, 4, 3, 42, 'B');
    surface.open({ id, place: { dock: 'right', rows: 3, cols: 20 } }, content, { onLink: () => {}, onResize: () => {} });
    flush();
    const pane = cockpit.pane(id) as ScriptPane;
    // happy-dom has no layout: the content is 20 × 3 cells at 0, 0.
    pane.content.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 60, width: 200, height: 60, x: 0, y: 0, toJSON: () => ({}) });
    const at = (col: number, row: number) => ({ clientX: col * 10 + 5, clientY: row * 20 + 5, bubbles: true });
    const glowing = (): boolean => [...pane.content.querySelectorAll<HTMLElement>('.wc-prow span')].some((s) => s.style.backgroundColor !== '');
    const hoverB = (): void => {
      pane.content.dispatchEvent(new PointerEvent('pointermove', at(5, 0)));
      expect(pane.hovered?.id).toBe(42);
    };
    // Onto the close cross: the leave's point is still inside the content.
    hoverB();
    const cross = pane.el.parentElement!.querySelector<HTMLElement>(`.wc-pane[data-pane="${id}"] > .wc-pane-close`)!;
    pane.content.dispatchEvent(new PointerEvent('pointerleave', at(17, 0)));
    cross.dispatchEvent(new PointerEvent('pointermove', at(17, 0)));
    expect(pane.hovered).toBeNull();
    flush();
    expect(glowing()).toBe(false);
    expect(cockpit.el.querySelector<HTMLElement>('.wc-spane-tip')!.hidden).toBe(true);
    // A redraw with the pointer gone does not bring it back.
    content.setLine(0, plain('[a] [b] '));
    content.addLink(0, 4, 3, 42, 'B');
    pane.changed();
    flush();
    expect(pane.hovered).toBeNull();
    // The pointer leaves the window, the window loses the focus, the tab is hidden.
    for (const leave of [
      () => document.documentElement.dispatchEvent(new PointerEvent('pointerleave', { clientX: -1, clientY: -1 })),
      () => window.dispatchEvent(new Event('blur')),
      () => pane.content.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })),
    ]) {
      hoverB();
      leave();
      expect(pane.hovered).toBeNull();
    }
    // A pointermove inside the content (a redrawn row) keeps it.
    hoverB();
    pane.content.querySelector('.wc-prow')!.dispatchEvent(new PointerEvent('pointermove', at(6, 0)));
    expect(pane.hovered?.id).toBe(42);
  });

  it('a text field: an input over its cells; typing, keys, Enter and Esc report and give the focus back', () => {
    const r = rig();
    let refocused = 0;
    const input = document.createElement('input');
    document.body.append(input);
    (r.cockpit as unknown as { onFocusInput: () => void }).onFocusInput = () => {
      refocused++;
      input.focus();
    };
    const id = scriptPaneId('s', 'f');
    const content = new PaneContent('F');
    content.setLine(0, plain('Name: '));
    content.addField(0, 6, 8, 7, { value: 'home', placeholder: 'a name' });
    const events: Array<[number, FieldEvent]> = [];
    const view = r.surface.open({ id, place: { dock: 'right', rows: 3, cols: 20 } }, content, {
      onLink: () => {},
      onResize: () => {},
      onField: (n, e) => events.push([n, e]),
    });
    // Asked before it is drawn: focused once it is.
    view.focusField!(7, true);
    r.flush();
    const pane = r.cockpit.pane(id) as ScriptPane;
    const el = pane.fieldInput(7)!;
    expect(el).not.toBeNull();
    expect(el.className).toBe('wc-spane-field');
    expect(el.value).toBe('home');
    expect(el.placeholder).toBe('a name');
    // In the scroller, at its cells.
    expect(el.style.left).toBe('60px');
    expect(el.parentElement!.parentElement).toBe(pane.scrollEl);
    expect(el.style.width).toBe('80px');
    expect(document.activeElement).toBe(el);
    // The band is drawn in the cells under it.
    const row = pane.content.querySelector('.wc-prow')!;
    expect(row.textContent).toContain('Name: ');
    // Typing reports the text.
    el.value = 'hom';
    el.dispatchEvent(new Event('input'));
    const key = (k: string, code: string, mods: Partial<KeyboardEventInit> = {}) => {
      const e = new KeyboardEvent('keydown', { key: k, code, bubbles: true, cancelable: true, ...mods });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(key('ArrowDown', 'ArrowDown')).toBe(true);
    expect(key('Tab', 'Tab', { shiftKey: true })).toBe(true);
    // Browser shortcuts are consumed, editing keys are not.
    expect(key('s', 'KeyS', { ctrlKey: true })).toBe(true);
    expect(key('a', 'KeyA', { ctrlKey: true })).toBe(false);
    expect(key('x', 'KeyX')).toBe(false);
    expect(key('Enter', 'Enter')).toBe(true);
    expect(refocused).toBe(1);
    el.focus();
    expect(key('Escape', 'Escape')).toBe(true);
    expect(refocused).toBe(2);
    expect(events).toEqual([
      [7, { type: 'change', text: 'hom' }],
      [7, { type: 'key', key: 'ArrowDown' }],
      [7, { type: 'key', key: 'Shift+Tab' }],
      [7, { type: 'submit', text: 'hom' }],
      [7, { type: 'cancel' }],
    ]);
    // Opaque on the band, in the value shade (readable on any tint).
    expect(el.style.background).not.toBe('');
    expect(el.style.color).not.toBe('');
    expect(el.style.caretColor).toBe(el.style.color);
    // A blur by a click elsewhere is reported; Enter and Esc report no blur.
    el.focus();
    el.blur();
    expect(events.at(-1)).toEqual([7, { type: 'blur', text: 'hom' }]);
    const n = events.length;
    el.focus();
    key('Enter', 'Enter');
    expect(events.slice(n).map((e) => e[1].type)).toEqual(['submit']);
    // A value set by the script reaches the input; setLine on the row drops it, giving the focus back.
    content.setFieldValue(7, 'cave');
    view.changed();
    r.flush();
    expect(el.value).toBe('cave');
    el.focus();
    content.setLine(0, plain('gone'));
    view.changed();
    r.flush();
    expect(pane.fieldInput(7)).toBeNull();
    expect(el.isConnected).toBe(false);
    expect(refocused).toBe(4);
    input.remove();
  });

  it('an overflowing pane scrolls: a console follows new lines at its end, a list stays at the top', () => {
    const r = rig();
    const open = (name: string, anchor: 'top' | 'bottom') => {
      const id = scriptPaneId('s', name);
      const content = new PaneContent(name, { anchor });
      const view = r.surface.open({ id, place: { dock: 'float', rows: 4, cols: 20 } }, content, { onLink: () => {}, onResize: () => {} });
      r.flush();
      const pane = r.cockpit.pane(id) as ScriptPane;
      return { content, view, pane, more: () => pane.content.querySelector<HTMLElement>('.wc-spane-more')! };
    };
    const con = open('con', 'bottom');
    const list = open('list', 'top');
    const fill = (p: typeof con, n: number) => {
      for (let i = 1; i <= n; i++) p.content.setLine(i - 1, plain(`line ${i}`));
      p.view.changed();
      r.flush();
    };
    const rows = con.pane.rows;
    expect(rows).toBeGreaterThan(2);
    const n = rows + 6;
    fill(con, n);
    fill(list, n);
    // Every line is in the scroller; one row is the indicator.
    expect(con.pane.content.querySelectorAll('.wc-spane-rows > .wc-prow')).toHaveLength(n);
    const listH = rows - 1;
    // The console sits at its end, its indicator on top.
    expect(con.pane.scrollEl.scrollTop).toBe((n - listH) * 20);
    expect(con.more().textContent).toContain(`↑ ${n - listH} more rows`);
    expect(con.more().style.top).toBe('0px');
    // The list sits at the top, its indicator at the bottom.
    expect(list.pane.scrollEl.scrollTop).toBe(0);
    expect(list.more().textContent).toContain(`↓ ${n - listH} more rows`);
    // A new line: the console follows it at its end.
    fill(con, n + 1);
    expect(con.pane.scrollEl.scrollTop).toBe((n + 1 - listH) * 20);
    // Scrolled back, it stays put and says how much is below.
    con.pane.scrollEl.scrollTop = 40;
    con.pane.scrollEl.dispatchEvent(new Event('scroll'));
    expect(con.more().textContent).toContain(`↓ ${n + 1 - listH - 2} rows below`);
    fill(con, n + 2);
    expect(con.pane.scrollEl.scrollTop).toBe(40);
    // A click on the indicator goes back to the end.
    con.more().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(con.pane.scrollEl.scrollTop).toBe((n + 2 - listH) * 20);
    // The list: scrolled down, a click goes back to the top.
    list.pane.scrollEl.scrollTop = 60;
    list.pane.scrollEl.dispatchEvent(new Event('scroll'));
    expect(list.more().textContent).toContain('↑ 3 rows above');
    fill(list, n + 1);
    expect(list.pane.scrollEl.scrollTop).toBe(60);
    list.more().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(list.pane.scrollEl.scrollTop).toBe(0);
    // A link in a scrolled list is found at its content row.
    list.content.addLink(5, 0, 4, 9, 'six');
    list.view.changed();
    r.flush();
    list.pane.scrollEl.scrollTop = 40;
    expect(list.pane.cellAt(5, 20 * 1 + 5)!.row).toBe(3);
    expect(list.pane.linkAt(5, 20 * 2 + 5)?.hint).toBeUndefined();
    list.pane.scrollEl.scrollTop = 60;
    expect(list.pane.linkAt(5, 20 * 2 + 5)!.hint).toBe('six');
  });

  it('hover is steady: a redraw keeps the band and the tooltip of a link at the same place, its text updated (ADR 0056)', () => {
    const { cockpit, surface, flush } = rig();
    const id = scriptPaneId('s', 'hover');
    const content = new PaneContent('H');
    const draw = (hint: string, at = 4) => {
      content.clear();
      content.setLine(0, plain('[a] [b]   '));
      content.addLink(0, at, 3, Math.floor(Math.random() * 1e9), hint);
      content.addLink(0, 8, 2, Math.floor(Math.random() * 1e9), 'tip only', true);
    };
    draw('B 2:31');
    const clicks: number[] = [];
    surface.open({ id, place: { dock: 'right', rows: 3, cols: 20 } }, content, { onLink: (n) => clicks.push(n), onResize: () => {} });
    flush();
    const pane = cockpit.pane(id) as ScriptPane;
    const at = (col: number) => ({ clientX: col * 10 + 5, clientY: 5, bubbles: true });
    pane.content.dispatchEvent(new PointerEvent('pointermove', at(5)));
    const tip = cockpit.el.querySelector<HTMLElement>('.wc-spane-tip')!;
    expect(tip.hidden).toBe(false);
    const tipEl = tip;
    // Three redraws (new link ids each time), the pointer still: the tooltip stays and shows the new hint.
    for (const h of ['B 2:30', 'B 2:29', 'B 2:28']) {
      draw(h);
      pane.changed();
      flush();
      expect(pane.hovered?.hint).toBe(h);
      expect(tip.hidden).toBe(false);
      expect(cockpit.el.querySelector('.wc-spane-tip')).toBe(tipEl);
      expect([...tip.children].map((c) => c.textContent)).toEqual([` ${h} `]);
      const band = pane.content.querySelector('.wc-prow')!;
      expect(band.innerHTML).toContain('#'); // the glow band's colours are inline styles
    }
    // The link moves away: the hover ends.
    draw('gone', 0);
    pane.changed();
    flush();
    expect(pane.hovered).toBeNull();
    expect(tip.hidden).toBe(true);
    // A tooltip-only link: tooltip, no pointer, no click.
    pane.content.dispatchEvent(new PointerEvent('pointermove', at(8)));
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toContain('tip only');
    expect(pane.content.style.cursor).toBe('');
    pane.content.dispatchEvent(new PointerEvent('pointerdown', { ...at(8), button: 0, isPrimary: true }));
    pane.content.dispatchEvent(new PointerEvent('pointerup', { ...at(8), button: 0, isPrimary: true }));
    expect(clicks).toEqual([]);
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

  describe('temporary panes', () => {
    const spec = (id = tempPaneId('s', 'pick')) => ({
      id,
      place: { dock: 'right' as const, rows: 4, cols: 20 },
      temporary: { rows: 4, cols: 20 },
    });

    it('ids: <script>/~<pane>, never an ordinary script pane id', () => {
      expect(tempPaneId('s', 'pick')).toBe('s/~pick');
      expect(isTempPaneId('s/~pick')).toBe(true);
      expect(isScriptPaneId('s/~pick')).toBe(false);
      expect(isTempPaneId('s/pick')).toBe(false);
      expect(isTempPaneId('s/~')).toBe(false);
      // Migration drops one that somehow reached the settings.
      const m = migrateSettings({
        panes: { 's/~pick': { on: true, color: 'red', border: true } },
        layout: { ...legacyLayout(), floating: [...legacyLayout().floating, { id: 's/~pick', x: 1, y: 1, w: 20, h: 6 }] },
      });
      expect(m.panes['s/~pick' as never]).toBeUndefined();
      expect(m.layout.floating.some((f) => f.id === 's/~pick')).toBe(false);
    });

    it('floats centred over the game above the other floats, framed, with nothing in the settings', () => {
      const { settings, cockpit, surface, flush } = rig();
      const before = JSON.stringify(settings.get());
      const sizes: string[] = [];
      const view = surface.open(spec(), new PaneContent('Pick'), { onLink: () => {}, onResize: (c, r) => sizes.push(`${c}x${r}`) });
      flush();
      expect(JSON.stringify(settings.get())).toBe(before);
      expect(cockpit.scriptPanes()).toEqual([]);
      const r = cockpit.layout!;
      const box = r.panes.find((p) => p.id === 's/~pick')!;
      const g = r.game;
      expect(box).toMatchObject({ dock: 'float', framed: true, rect: { w: 22, h: 6 } });
      expect(box.rect.x).toBe(g.x + Math.floor((g.w - 22) / 2));
      expect(box.rect.y).toBe(g.y + Math.floor((g.h - 6) / 2));
      expect(sizes.at(-1)).toBe('20x4');
      const el = cockpit.el.querySelector<HTMLElement>('.wc-pane[data-pane="s/~pick"]')!;
      const z = Number(el.style.zIndex);
      for (const other of cockpit.el.querySelectorAll<HTMLElement>('.wc-pane[data-floating]')) {
        if (other !== el) expect(Number(other.style.zIndex)).toBeLessThan(z);
      }
      expect(view.placement!()).toEqual({ rows: 4, cols: 20 });
      // show / hide in memory only.
      view.setOn(false);
      flush();
      expect(view.isOn()).toBe(false);
      expect(el.hidden).toBe(true);
      expect(view.placement!()).toEqual({ rows: 4, cols: 20, off: true });
      view.setOn(true);
      flush();
      expect(el.hidden).toBe(false);
      expect(JSON.stringify(settings.get())).toBe(before);
      view.close();
      flush();
      expect(cockpit.el.querySelector('.wc-pane[data-pane="s/~pick"]')).toBeNull();
      expect(cockpit.layout!.panes.some((p) => p.id === 's/~pick')).toBe(false);
    });

    it('a size larger than the window is clamped to it; a moved rectangle is used and clamped', () => {
      const { cockpit, surface, flush } = rig();
      surface.open({ ...spec(), temporary: { rows: 200, cols: 300 } }, new PaneContent('Big'), { onLink: () => {}, onResize: () => {} });
      flush();
      const r = cockpit.layout!;
      expect(r.panes.find((p) => p.id === 's/~pick')!.rect).toEqual({ x: 0, y: 0, w: r.cols, h: r.rows });
      cockpit.setTempPane('s/~pick', { rect: { x: 150, y: 3, w: 30, h: 8 } });
      flush();
      expect(cockpit.layout!.panes.find((p) => p.id === 's/~pick')!.rect).toEqual({ x: r.cols - 30, y: 3, w: 30, h: 8 });
    });

    it('its close cross reports onClose (and closes it without a handler); not "Hide"', () => {
      const { cockpit, surface, flush, settings } = rig();
      const before = JSON.stringify(settings.get());
      let closes = 0;
      surface.open(spec(), new PaneContent('Pick'), { onLink: () => {}, onResize: () => {}, onClose: () => closes++ });
      flush();
      const close = cockpit.el.querySelector<HTMLElement>('.wc-pane[data-pane="s/~pick"] .wc-pane-close')!;
      expect(close.title).toBe('Close Pick');
      close.click();
      expect(closes).toBe(1);
      expect(JSON.stringify(settings.get())).toBe(before);
      // No handler: the surface closes it itself.
      const id2 = tempPaneId('s', 'other');
      surface.open(spec(id2), new PaneContent('Other'), { onLink: () => {}, onResize: () => {} });
      flush();
      cockpit.el.querySelector<HTMLElement>(`.wc-pane[data-pane="${id2}"] .wc-pane-close`)!.click();
      flush();
      expect(cockpit.el.querySelector(`.wc-pane[data-pane="${id2}"]`)).toBeNull();
    });

    it('opens where `at` says; a rectangle the user gave it is kept per device and used next time', () => {
      localStorage.clear();
      const { cockpit, surface, flush } = rig();
      const place = (id: string) => cockpit.layout!.panes.find((p) => p.id === id)!.rect;
      const g = () => cockpit.layout!.game;
      const open = (at?: 'top' | 'top-right' | 'bottom' | 'top-left' | 'bottom-right' | 'left') =>
        surface.open({ ...spec(), temporary: at ? { rows: 4, cols: 20, at } : { rows: 4, cols: 20 } }, new PaneContent('Pick'), { onLink: () => {}, onResize: () => {} });
      for (const [at, want] of [
        ['top', () => ({ x: g().x + Math.floor((g().w - 22) / 2), y: g().y })],
        ['top-right', () => ({ x: g().x + g().w - 22, y: g().y })],
        ['bottom', () => ({ x: g().x + Math.floor((g().w - 22) / 2), y: g().y + g().h - 6 })],
        ['top-left', () => ({ x: g().x, y: g().y })],
        ['bottom-right', () => ({ x: g().x + g().w - 22, y: g().y + g().h - 6 })],
        ['left', () => ({ x: g().x, y: g().y + Math.floor((g().h - 6) / 2) })],
      ] as const) {
        const v = open(at);
        flush();
        expect(place('s/~pick'), at).toMatchObject(want());
        expect(v.placement!()!.at).toBe(at);
        v.close();
      }
      // The user moves it: the rectangle is saved (not in the settings) and used when it opens again.
      const v = open('top');
      flush();
      cockpit.setTempPane('s/~pick', { rect: { x: 5, y: 6, w: 22, h: 6 } });
      (cockpit as unknown as { temps: Map<string, { onPlace(): void }> }).temps.get('s/~pick')!.onPlace();
      expect(tempPlace('s/~pick')).toEqual({ x: 5, y: 6, w: 22, h: 6 });
      v.close();
      open('top');
      flush();
      expect(place('s/~pick')).toEqual({ x: 5, y: 6, w: 22, h: 6 });
      // Reset layout forgets it (Options calls forgetTempPlaces).
      forgetTempPlaces();
      expect(tempPlace('s/~pick')).toBeNull();
      saveTempPlace('s/~x', { x: 1, y: 1, w: 3, h: 3 });
      saveTempPlace('s/~x', null);
      expect(localStorage.getItem(TEMP_PLACES_KEY)).toBeNull();
      localStorage.setItem(TEMP_PLACES_KEY, '{"s/~bad":{"x":-1,"y":0,"w":2,"h":2},"s/~ok":{"x":1,"y":2,"w":3,"h":4}}');
      expect(tempPlace('s/~bad')).toBeNull();
      expect(tempPlace('s/~ok')).toEqual({ x: 1, y: 2, w: 3, h: 4 });
      localStorage.clear();
    });

    it('a group tiles from its corner in opening order, closes gaps, moves and resizes as one, remembered per device', async () => {
      localStorage.clear();
      const make = () => {
        const r = rig();
        const views = new Map<string, ReturnType<typeof r.surface.open>>();
        const open = (name: string) => {
          const id = tempPaneId('s', name);
          views.set(name, r.surface.open({ id, place: { dock: 'right', rows: 4, cols: 20 }, temporary: { rows: 4, cols: 20, at: 'top-left', group: { key: 's/tv', cols: 2 } } }, new PaneContent(name), { onLink: () => {}, onResize: () => {} }));
        };
        const rect = (name: string) => r.cockpit.layout!.panes.find((p) => p.id === tempPaneId('s', name))!.rect;
        return { ...r, views, open, rect };
      };
      const a = make();
      for (const n of ['a', 'b', 'c', 'd']) a.open(n);
      a.flush();
      const g = a.cockpit.layout!.game;
      expect([a.rect('a'), a.rect('b'), a.rect('c'), a.rect('d')]).toEqual([
        { x: g.x, y: g.y, w: 22, h: 6 },
        { x: g.x + 22, y: g.y, w: 22, h: 6 },
        { x: g.x, y: g.y + 6, w: 22, h: 6 },
        { x: g.x + 22, y: g.y + 6, w: 22, h: 6 },
      ]);
      // The recorded place is the tile.
      expect(a.views.get('d')!.placement!()!.rect).toEqual(a.rect('d'));
      // Closing the second: the others close the gap in order.
      a.views.get('b')!.close();
      a.flush();
      expect([a.rect('a'), a.rect('c'), a.rect('d')].map((r) => [r.x - g.x, r.y - g.y])).toEqual([
        [0, 0],
        [22, 0],
        [0, 6],
      ]);
      // Dragging one moves the whole group (the drop of member d at +10, +4).
      const drop = (id: string, rect: { x: number; y: number; w: number; h: number }, resize: boolean) => {
        const c = a.cockpit as unknown as { temps: Map<string, unknown>; dropGrouped(id: string, t: unknown, r: unknown, resize: boolean): void };
        c.dropGrouped(id, c.temps.get(id), rect, resize);
      };
      drop(tempPaneId('s', 'd'), { x: g.x + 10, y: g.y + 10, w: 22, h: 6 }, false);
      a.flush();
      expect(a.rect('a')).toEqual({ x: g.x + 10, y: g.y + 4, w: 22, h: 6 });
      expect(a.rect('c')).toEqual({ x: g.x + 32, y: g.y + 4, w: 22, h: 6 });
      // A resize sets the group's tile size.
      drop(tempPaneId('s', 'a'), { x: g.x + 10, y: g.y + 4, w: 30, h: 8 }, true);
      a.flush();
      expect(a.rect('c')).toEqual({ x: g.x + 40, y: g.y + 4, w: 30, h: 8 });
      // Remembered after a reload (a new cockpit on the same storage).
      const b = make();
      b.open('x');
      b.open('y');
      b.flush();
      expect(b.rect('y')).toEqual({ x: g.x + 40, y: g.y + 4, w: 30, h: 8 });
      // Reset layout forgets it.
      forgetTempPlaces();
      b.flush();
      expect(b.rect('x')).toEqual({ x: g.x, y: g.y, w: 22, h: 6 });
      localStorage.clear();
    });

    it('a temporary and an ordinary pane of the same name are apart', () => {
      const { cockpit, surface, flush, settings } = rig();
      surface.open({ id: scriptPaneId('s', 'pick'), place: { dock: 'left', rows: 3, cols: 20 } }, new PaneContent('A'), { onLink: () => {}, onResize: () => {} });
      surface.open(spec(), new PaneContent('B'), { onLink: () => {}, onResize: () => {} });
      flush();
      expect(cockpit.scriptPanes().map((p) => p.id)).toEqual(['s/pick']);
      expect(Object.keys(settings.get().panes).filter((k) => k.startsWith('s/'))).toEqual(['s/pick']);
      expect(cockpit.layout!.panes.filter((p) => p.id.startsWith('s/')).map((p) => p.id)).toEqual(['s/pick', 's/~pick']);
    });
  });

  describe('pane bar support (ADR 0065)', () => {
    const BAR = scriptPaneId('panebar', 'bar');
    const barPlace = { dock: 'bottom' as const, rows: 1, cols: 80, border: false, lane: 'own' as const };

    function openBar(r: ReturnType<typeof rig>, place: Parameters<CockpitPaneSurface['open']>[0]['place'] = barPlace) {
      const content = new PaneContent('Pane bar');
      content.setLine(0, plain('CHAR TIME'));
      content.addLink(0, 0, 4, 7, 'Character');
      const clicks: number[] = [];
      const view = r.surface.open({ id: BAR, place }, content, { onLink: (n) => clicks.push(n), onResize: () => {} });
      r.flush();
      return { content, clicks, view, pane: r.cockpit.pane(BAR) as ScriptPane };
    }

    it('places a borderless bar in its own 1-row lane at the bottom edge', () => {
      const r = rig();
      openBar(r);
      expect(r.settings.get().panes[BAR]).toEqual({ on: true, color: 'black', border: false });
      expect(r.settings.get().layout.docks.bottom.lanes).toEqual([{ size: 1, panes: [{ id: BAR, desired: 80 }] }]);
      const box = r.cockpit.layout!.panes.find((p) => p.id === BAR)!;
      expect(box).toMatchObject({ dock: 'bottom', framed: false, rect: { y: 49, h: 1 } });
      // Reset layout: placed again the same way.
      r.settings.update({ layout: legacyLayout() });
      expect(r.settings.get().layout.docks.bottom.lanes).toEqual([{ size: 1, panes: [{ id: BAR, desired: 80 }] }]);
    });

    it("panebar's default place: the bottom of the right dock (lane 0, the last pane), again after Reset layout", () => {
      const r = rig();
      openBar(r, { dock: 'right', rows: 1, cols: 30, border: false });
      const ids = (): string[] => r.settings.get().layout.docks.right.lanes[0]!.panes.map((p) => p.id);
      expect(ids().at(-1)).toBe(BAR);
      expect(ids().length).toBeGreaterThan(1);
      const box = r.cockpit.layout!.panes.find((p) => p.id === BAR)!;
      const below = r.cockpit.layout!.panes.filter((p) => p.dock === 'right' && p.rect.y > box.rect.y);
      expect(below).toEqual([]);
      r.settings.update({ layout: legacyLayout() });
      expect(ids().at(-1)).toBe(BAR);
    });

    it('soft grip: a click on the top row reaches the link; a drag past the threshold moves the pane and eats the click', () => {
      const r = rig();
      const { clicks, pane } = openBar(r);
      const at = { clientX: 15, clientY: 49 * 20 + 5, bubbles: true, button: 0, isPrimary: true };
      // happy-dom has no layout: put the content's rect where the cockpit has the bar (row 49).
      pane.content.getBoundingClientRect = () => ({ left: 0, top: 980, right: 800, bottom: 1000, width: 800, height: 20, x: 0, y: 980 }) as DOMRect;
      pane.content.dispatchEvent(new PointerEvent('pointerdown', at));
      expect(r.cockpit.dragging).toBe(false);
      r.cockpit.el.dispatchEvent(new PointerEvent('pointerup', at));
      expect(clicks).toEqual([7]);
      // Press, move over the game, release: it floats; the click is eaten.
      pane.content.dispatchEvent(new PointerEvent('pointerdown', at));
      r.cockpit.el.dispatchEvent(new PointerEvent('pointermove', { ...at, clientX: 400, clientY: 400 }));
      expect(r.cockpit.dragging).toBe(true);
      r.cockpit.el.dispatchEvent(new PointerEvent('pointerup', { ...at, clientX: 400, clientY: 400 }));
      expect(clicks).toEqual([7]);
      expect(findFloat(r.settings.get().layout, BAR)).toBeGreaterThanOrEqual(0);
      expect(r.cockpit.dragging).toBe(false);
      // A framed pane's top content row is not a grip.
      r.settings.update((d) => {
        d.panes[BAR] = { ...d.panes[BAR]!, border: true };
      });
      r.flush();
      const box = r.cockpit.layout!.panes.find((p) => p.id === BAR)!;
      pane.content.dispatchEvent(new PointerEvent('pointerdown', { ...at, clientX: (box.content.x + 1) * 10, clientY: box.content.y * 20 + 5 }));
      r.cockpit.el.dispatchEvent(new PointerEvent('pointermove', { ...at, clientX: 900, clientY: 300 }));
      expect(r.cockpit.dragging).toBe(false);
    });

    it('soft grip row: a grab cursor off links on a borderless pane, none framed; the cross unless cross = false (ADR 0084)', () => {
      const r = rig();
      const { pane, content } = openBar(r, { dock: 'right', rows: 4, cols: 30, border: false });
      expect(pane.el.hasAttribute('data-framed')).toBe(false);
      expect(pane.el.hasAttribute('data-no-cross')).toBe(false);
      // happy-dom has no layout: the content's rect is at 0, 0 (cells 10 × 20).
      const at = (x: number, y: number) => ({ clientX: x, clientY: y, bubbles: true, pointerId: 1, isPrimary: true });
      pane.content.dispatchEvent(new PointerEvent('pointermove', at(65, 5)));
      expect(pane.content.style.cursor).toBe('grab');
      pane.content.dispatchEvent(new PointerEvent('pointermove', at(15, 5)));
      expect(pane.content.style.cursor).toBe('pointer');
      pane.content.dispatchEvent(new PointerEvent('pointermove', at(65, 25)));
      expect(pane.content.style.cursor).toBe('');
      // Framed: the frame's title row is the grip; the top content row is not.
      r.settings.update((d) => {
        d.panes[BAR] = { ...d.panes[BAR]!, border: true };
      });
      r.flush();
      expect(pane.el.hasAttribute('data-framed')).toBe(true);
      pane.content.dispatchEvent(new PointerEvent('pointermove', at(65, 5)));
      expect(pane.content.style.cursor).toBe('');
      expect(pane.el.hasAttribute('data-no-cross')).toBe(false);
      // Borderless again, a link under the cross: the cross still shows
      // (ADR 0084 addendum: it covers the top row like a built-in pane's).
      r.settings.update((d) => {
        d.panes[BAR] = { ...d.panes[BAR]!, border: false };
      });
      r.flush();
      const cols = pane.cols;
      content.setLine(0, plain(`CHAR${' '.repeat(cols - 8)}MAP `));
      content.addLink(0, cols - 4, 3, 8, 'Map');
      pane.changed();
      r.flush();
      expect(pane.el.hasAttribute('data-no-cross')).toBe(false);
      // cross = false turns it off, framed or not.
      content.cross = false;
      content.version++;
      pane.changed();
      r.flush();
      expect(pane.el.hasAttribute('data-no-cross')).toBe(true);
      r.settings.update((d) => {
        d.panes[BAR] = { ...d.panes[BAR]!, border: true };
      });
      r.flush();
      expect(pane.el.hasAttribute('data-no-cross')).toBe(true);
      // outline = false marks the pane, so the CSS draws no hover outline (ADR 0084 addendum 2).
      expect(pane.el.hasAttribute('data-no-outline')).toBe(false);
      content.outline = false;
      content.version++;
      pane.changed();
      r.flush();
      expect(pane.el.hasAttribute('data-no-outline')).toBe(true);
    });

    it('grip cells (pane:setGrip): a grab cursor, a press moves the pane at once, no click; any row, framed too', () => {
      const r = rig();
      const { content, clicks, pane } = openBar(r);
      content.setLine(0, plain('\u2237 CHAR TIME'));
      content.addLink(0, 2, 4, 7, 'Character');
      content.setGrip({ row: 0, col: 0, len: 2 });
      r.flush();
      const shield = r.cockpit.el.querySelector<HTMLElement>('.wc-drag-shield')!;
      // happy-dom has no layout: the content's rect is at 0, 0.
      const at = { clientX: 5, clientY: 5, bubbles: true, button: 0, pointerId: 1, isPrimary: true };
      pane.content.dispatchEvent(new PointerEvent('pointermove', at));
      expect(pane.content.style.cursor).toBe('grab');
      pane.content.dispatchEvent(new PointerEvent('pointermove', { ...at, clientX: 25 }));
      expect(pane.content.style.cursor).toBe('pointer');
      // A press on the grip shows the grabbing cursor at once; a release
      // without a move delivers no click.
      pane.content.dispatchEvent(new PointerEvent('pointerdown', at));
      expect(shield.hidden).toBe(false);
      expect(shield.dataset.drag).toBe('move');
      r.cockpit.el.dispatchEvent(new PointerEvent('pointerup', at));
      expect(shield.hidden).toBe(true);
      const click = new MouseEvent('click', { ...at, clientX: 25, cancelable: true });
      pane.content.dispatchEvent(click);
      expect(clicks).toEqual([]);
      // A press and a move over the game: it floats.
      pane.content.dispatchEvent(new PointerEvent('pointerdown', at));
      r.cockpit.el.dispatchEvent(new PointerEvent('pointermove', { ...at, clientX: 400, clientY: 400 }));
      expect(r.cockpit.dragging).toBe(true);
      r.cockpit.el.dispatchEvent(new PointerEvent('pointerup', { ...at, clientX: 400, clientY: 400 }));
      expect(findFloat(r.settings.get().layout, BAR)).toBeGreaterThanOrEqual(0);
      // Framed, a grip on row 2: still a move.
      r.settings.update((d) => {
        d.panes[BAR] = { ...d.panes[BAR]!, border: true };
      });
      content.setLine(1, plain('\u2237'));
      content.setGrip({ row: 1, col: 0, len: 1 });
      r.flush();
      const before = JSON.stringify(r.settings.get().layout);
      pane.content.dispatchEvent(new PointerEvent('pointerdown', { ...at, clientY: 25 }));
      r.cockpit.el.dispatchEvent(new PointerEvent('pointermove', { ...at, clientX: 800, clientY: 300 }));
      expect(r.cockpit.dragging).toBe(true);
      r.cockpit.el.dispatchEvent(new PointerEvent('pointerup', { ...at, clientX: 800, clientY: 300 }));
      expect(JSON.stringify(r.settings.get().layout)).not.toBe(before);
      // Not on the grip: the link still clicks.
      pane.content.dispatchEvent(new PointerEvent('pointerdown', { ...at, clientX: 25 }));
      r.cockpit.el.dispatchEvent(new PointerEvent('pointerup', { ...at, clientX: 25 }));
      expect(clicks).toEqual([7]);
      // No grip: an ordinary press.
      content.setGrip(null);
      r.flush();
      pane.content.dispatchEvent(new PointerEvent('pointerdown', { ...at, clientY: 25 }));
      expect(shield.hidden).toBe(true);
      r.cockpit.el.dispatchEvent(new PointerEvent('pointerup', { ...at, clientY: 25 }));
    });

    it('a 1-row lane keeps its row: the lane handle goes on the neighbour, none between two 1-row lanes', () => {
      const r = rig();
      openBar(r, { ...barPlace, dock: 'top' });
      r.settings.update((d) => {
        d.layout = moveToNewLane(d.layout, 'comm', 'top', 1, 6);
      });
      r.flush();
      const handle = r.cockpit.el.querySelector<HTMLElement>('.wc-handle[data-outer]')!;
      // Lane 0 is row 0 (the bar), lane 1 starts at row 1: the handle is on row 1's upper part.
      expect(handle.style.top).toBe('20px');
      const second = scriptPaneId('other', 'bar');
      r.surface.open({ id: second, place: { ...barPlace, dock: 'top' } }, new PaneContent('x'), { onLink: () => {}, onResize: () => {} });
      r.settings.update((d) => {
        d.layout = movePane(d.layout, 'comm', 'right', 0, 0);
      });
      r.flush();
      expect(r.settings.get().layout.docks.top.lanes.map((l) => l.size)).toEqual([1, 1]);
      expect(r.cockpit.el.querySelector('.wc-handle[data-outer]')).toBeNull();
    });

    it('an edge-zone drop does not join a bar lane: the next lane in, else a new lane inside the bar', () => {
      const r = rig();
      openBar(r);
      expect(r.cockpit.dropTarget(400, 995, 'map')).toMatchObject({ kind: 'lane', dock: 'bottom', at: 1 });
      r.settings.update((d) => {
        d.layout = moveToNewLane(d.layout, 'comm', 'bottom', 1, 6);
      });
      r.flush();
      expect(r.cockpit.dropTarget(400, 995, 'map')).toMatchObject({ kind: 'dock', dock: 'bottom', lane: 1 });
    });

    it('states() lists the panes in Options order; setOn switches them; onLayout and onStates follow', () => {
      const r = rig();
      const { view } = openBar(r);
      let layouts = 0;
      const off = r.cockpit.onLayout(() => layouts++);
      let changes = 0;
      const unsub = r.surface.onStates(() => changes++);
      r.cockpit.relayoutNow();
      expect(layouts).toBe(1);
      expect(changes).toBe(1);
      off();
      const st = r.surface.states();
      expect(st.map((p) => p.id)).toEqual(['character', 'timers', 'group', 'comm', 'ui', 'map', BAR]);
      expect(st.find((p) => p.id === 'comm')).toEqual({ id: 'comm', on: true, shown: true, dock: 'right' });
      expect(st.find((p) => p.id === 'map')).toMatchObject({ dock: 'float' });
      expect(st.find((p) => p.id === BAR)).toEqual({ id: BAR, on: true, shown: true, dock: 'bottom' });
      expect(r.surface.setOn('comm', false)).toBe(true);
      expect(r.settings.get().panes.comm.on).toBe(false);
      expect(r.surface.setOn('nope/x' as never, false)).toBe(false);
      expect(view.dock!()).toBe('bottom');
      unsub();
    });

    it('want(): the lane follows a lone pane, a repeated request leaves a dragged size alone', () => {
      const r = rig();
      const { view } = openBar(r);
      expect(view.want!(2)).toBe(true);
      expect(r.settings.get().layout.docks.bottom.lanes[0]!.size).toBe(2);
      r.settings.update((d) => {
        d.layout = setLaneSize(d.layout, 'bottom', 0, 4);
      });
      expect(view.want!(2)).toBe(true);
      expect(r.settings.get().layout.docks.bottom.lanes[0]!.size).toBe(4);
      expect(view.want!(1)).toBe(true);
      expect(r.settings.get().layout.docks.bottom.lanes[0]!.size).toBe(1);
      r.settings.update((d) => {
        d.layout = movePane(d.layout, BAR, 'right', 0, 0);
      });
      expect(view.dock!()).toBe('right');
      expect(view.want!(7)).toBe(true);
      expect(findPaneEntry(r.settings.get().layout, BAR)!.desired).toBe(7);
      r.settings.update((d) => {
        d.layout = floatPane(d.layout, BAR, { x: 2, y: 2, w: 30, h: 3 });
      });
      expect(view.dock!()).toBe('float');
      expect(view.want!(3)).toBe(false);
    });

    it('want(): a spanning pane is never alone in a lane; only cols apply in the bottom dock (ADR 0067)', () => {
      const r = rig();
      const { view } = openBar(r);
      r.settings.update((d) => {
        let m = moveToNewLane(d.layout, 'comm', 'bottom', 1, 6);
        m = moveToNewLane(m, 'ui', 'bottom', 2, 6);
        d.layout = movePane(m, BAR, 'bottom', 'head', 0);
      });
      const lanes = () => r.settings.get().layout.docks.bottom.lanes.map((l) => l.size);
      const before = lanes();
      expect(r.settings.get().layout.docks.bottom.head.map((p) => p.id)).toEqual([BAR]);
      expect(view.dock!()).toBe('bottom');
      expect(view.want!(3)).toBe(false);
      expect(lanes()).toEqual(before);
      expect(view.want!(3, 44)).toBe(true);
      expect(lanes()).toEqual(before);
      expect(findPaneEntry(r.settings.get().layout, BAR)!.desired).toBe(44);
    });

    it('RecordingPaneSurface forwards the pane list and the view hooks', async () => {
      const r = rig();
      const { RecordingPaneSurface } = await import('../../src/panes/script-surface');
      const rec = new RecordingPaneSurface(r.surface, () => {}, () => 0);
      expect(rec.states!().map((p) => p.id)).toEqual(['character', 'timers', 'group', 'comm', 'ui', 'map']);
      expect(rec.setOn!('ui', false)).toBe(true);
      let n = 0;
      const unsub = rec.onStates!(() => n++);
      r.cockpit.relayoutNow();
      expect(n).toBe(1);
      unsub();
      const view = rec.open({ id: BAR, place: barPlace }, new PaneContent('b'), { onLink: () => {}, onResize: () => {} });
      expect(view.dock!()).toBe('bottom');
      expect(view.want!(1)).toBe(true);
    });
  });

  describe('the wheel for the script (ADR 0072)', () => {
    const ID = scriptPaneId('w', 'p');
    const wheel = (el: Element, init: WheelEventInit): WheelEvent => {
      const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
      // happy-dom drops the modifier keys of a WheelEvent init.
      for (const k of ['shiftKey', 'ctrlKey'] as const) if (init[k]) Object.defineProperty(e, k, { value: true });
      el.dispatchEvent(e);
      return e;
    };

    function open(rec = false) {
      const r = rig();
      const calls: Array<[number, number]> = [];
      let take = true;
      const surface = rec ? new RecordingPaneSurface(r.surface, () => {}, () => 0) : r.surface;
      const view = surface.open({ id: ID, place: { dock: 'right', rows: 3, cols: 20 } }, new PaneContent('P'), {
        onLink: () => {},
        onResize: () => {},
        onWheel: (dx, dy) => {
          calls.push([dx, dy]);
          return take;
        },
      });
      r.flush();
      const el = r.cockpit.el.querySelector<HTMLElement>(`.wc-pane[data-pane="${ID}"] .wc-pane-content`)!;
      return { ...r, view, calls, el, setTake: (v: boolean) => (take = v) };
    }

    it('reports nothing and prevents nothing until the script asks', () => {
      const t = open();
      const e = wheel(t.el, { deltaX: 50 });
      expect(t.calls).toEqual([]);
      expect(e.defaultPrevented).toBe(false);
    });

    it('reports whole cells with the rest kept, consumes only on true, stops on wheel(false)', () => {
      const t = open();
      t.view.wheel!(true);
      // Cells are 10 × 20 px: 25 px across is 2 cells, the half kept.
      expect(wheel(t.el, { deltaX: 25 }).defaultPrevented).toBe(true);
      expect(t.calls).toEqual([[2, 0]]);
      wheel(t.el, { deltaX: 5 });
      expect(t.calls.at(-1)).toEqual([1, 0]);
      // Down 30 px is 1 row and a half; Shift turns a vertical wheel sideways.
      wheel(t.el, { deltaY: 30 });
      expect(t.calls.at(-1)).toEqual([0, 1]);
      wheel(t.el, { deltaY: 20, shiftKey: true });
      expect(t.calls.at(-1)).toEqual([2, 0]);
      // Lines are cells.
      wheel(t.el, { deltaY: -3, deltaMode: 1 });
      expect(t.calls.at(-1)).toEqual([0, -3]);
      // Ctrl+wheel (zoom) is never the script's.
      const n = t.calls.length;
      expect(wheel(t.el, { deltaY: 100, ctrlKey: true }).defaultPrevented).toBe(false);
      expect(t.calls.length).toBe(n);
      // false: the event goes on (native scroll); an event under a cell follows that answer.
      t.setTake(false);
      expect(wheel(t.el, { deltaX: 10 }).defaultPrevented).toBe(false);
      expect(wheel(t.el, { deltaX: 3 }).defaultPrevented).toBe(false);
      t.setTake(true);
      expect(wheel(t.el, { deltaX: 10 }).defaultPrevented).toBe(true);
      expect(wheel(t.el, { deltaX: 3 }).defaultPrevented).toBe(true);
      t.view.wheel!(false);
      const m = t.calls.length;
      expect(wheel(t.el, { deltaX: 50 }).defaultPrevented).toBe(false);
      expect(t.calls.length).toBe(m);
    });

    it('the recording surface forwards wheel and onWheel', () => {
      const t = open(true);
      t.view.wheel!(true);
      wheel(t.el, { deltaX: 10 });
      expect(t.calls).toEqual([[1, 0]]);
    });
  });
});

describe('wheelSteps (ADR 0072)', () => {
  const cell = { w: 10, h: 20 };
  const size = { cols: 30, rows: 4 };
  const ev = (deltaX: number, deltaY: number, deltaMode = 0, shiftKey = false) => ({ deltaX, deltaY, deltaMode, shiftKey });

  it('pixels by the cell size, lines as cells, pages as the pane', () => {
    expect(wheelSteps(ev(30, 40), cell, size, { x: 0, y: 0 })).toEqual({ dx: 3, dy: 2 });
    expect(wheelSteps(ev(2, -1, 1), cell, size, { x: 0, y: 0 })).toEqual({ dx: 2, dy: -1 });
    expect(wheelSteps(ev(1, 1, 2), cell, size, { x: 0, y: 0 })).toEqual({ dx: 30, dy: 4 });
  });

  it('keeps the fraction, drops it when the direction turns', () => {
    const rest = { x: 0, y: 0 };
    expect(wheelSteps(ev(4, 0), cell, size, rest)).toEqual({ dx: 0, dy: 0 });
    expect(wheelSteps(ev(4, 0), cell, size, rest)).toEqual({ dx: 0, dy: 0 });
    expect(wheelSteps(ev(4, 0), cell, size, rest)).toEqual({ dx: 1, dy: 0 });
    expect(rest.x).toBeCloseTo(0.2);
    expect(wheelSteps(ev(-9, 0), cell, size, rest)).toEqual({ dx: 0, dy: 0 });
    expect(rest.x).toBeCloseTo(-0.9);
    // 0.1 + 0.2 + 0.7 is a whole cell, not 0.9999…
    const r2 = { x: 0, y: 0 };
    for (const d of [1, 2, 7]) wheelSteps(ev(d, 0), cell, size, r2);
    expect(r2.x).toBeCloseTo(0);
  });

  it('Shift turns a vertical-only wheel sideways', () => {
    expect(wheelSteps(ev(0, 20, 0, true), cell, size, { x: 0, y: 0 })).toEqual({ dx: 2, dy: 0 });
    expect(wheelSteps(ev(10, 20, 0, true), cell, size, { x: 0, y: 0 })).toEqual({ dx: 1, dy: 1 });
  });
});

