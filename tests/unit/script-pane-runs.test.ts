// @vitest-environment happy-dom
// Script panes in runs (ADR 0053 P1): the SPANE record (full snapshots
// and deltas), the recording surface's per-frame coalescing, the
// recorder (run start, deltas, removal, the pending VIEW first,
// keyframes), the timeline and the export's folding of excluded ranges,
// and the log player rebuilding the panes without Lua (also after seeks).

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import { TRUECOLOR, shadeColor } from '../../src/core/types';
import { formatInbound, formatPaneRecord, formatRecord, parseRecord } from '../../src/capture/format';
import { buildRunBlob } from '../../src/capture/download';
import { type LockManagerLike, Recorder } from '../../src/capture/recorder';
import { RunStore } from '../../src/runs/store';
import { PaneContent, type PaneSnapshot, plain } from '../../src/panes/script-content';
import {
  PANE_KEYFRAME_US,
  applyPaneRecord,
  encodePaneRecord,
  recordState,
  sanitizeSnapshot,
} from '../../src/panes/script-record';
import { PANE_RECORD_MS, RecordingPaneSurface, type ScriptPaneSurface } from '../../src/panes/script-surface';
import { ENTRY_SPANE, buildTimeline, scriptPaneIdsOf } from '../../src/player/timeline';
import { editRunText } from '../../src/share/payload';
import { PlayerHost } from '../../src/app/player-host';
import { SettingsStore } from '../../src/settings';
import { defaultSettings } from '../../src/settings/types';
import { placeScriptPane } from '../../src/layout/model';
import type { ScriptPane } from '../../src/panes/script-pane';
import { applyViewer, noOverrides, withPane } from '../../src/player/viewer';
import type { ViewerControls } from '../../src/player/view';
import { defaultExportDoc } from '../../src/share/edits';
import { BASE_US, FakeWall, makeLog, meta } from './player-helpers';

/** A mercenaries-like pane: a text row and a gauge row per mercenary, one-cell order links. */
function mercPane(secs: number, mercs = 3): PaneContent {
  const c = new PaneContent('Mercenaries');
  let id = 1;
  for (let m = 0; m < mercs; m++) {
    const name = ['Bob', 'Alice', 'Grim'][m]!;
    c.setLine(m * 2, {
      text: `${name.padEnd(8)} fighting   t p r l`,
      runs: [{ start: 0, end: 8, fg: TRUECOLOR | 0xffcc00, bold: true }],
    });
    for (const [k, verb] of ['tap', 'pay', 'renew', 'leave'].entries()) {
      c.addLink(m * 2, 20 + k * 2, 1, id++, `${verb} ${name}: order the mercenary to ${verb}`);
    }
    const left = Math.max(0, 1800 - secs - m * 300);
    c.setGauge(m * 2 + 1, { value: left, max: 1800, label: `${Math.floor(left / 60)}m ${left % 60}s`, color: TRUECOLOR | 0x2060c0 });
  }
  return c;
}

const texts = (s: PaneSnapshot): string[] =>
  s.lines.map((l) => ('spans' in l ? l.spans.map((x) => x.text).join('') : `#${l.gauge.label}`));

describe('SPANE records', () => {
  it('formats as a client record with the pane id first', () => {
    const line = formatPaneRecord(BASE_US, 'merc/main', '{"n":1}');
    expect(line).toBe(`${BASE_US} \x1bSPANE merc/main {"n":1}\n`);
    expect(parseRecord(line.slice(17, -1))).toEqual({ type: 'SPANE', payload: 'merc/main {"n":1}' });
  });

  it('writes a full snapshot first, then the changed rows only, and nothing when unchanged', () => {
    const a = mercPane(0).snapshot();
    const first = encodePaneRecord(null, a)!;
    expect(first.full).toBe(true);
    expect(JSON.parse(first.payload)).toEqual(a);
    const b = mercPane(1).snapshot();
    const second = encodePaneRecord(first.state, b)!;
    expect(second.full).toBe(false);
    const d = JSON.parse(second.payload) as { n: number; set: Record<string, unknown>; links?: unknown; title?: unknown };
    expect(d.n).toBe(6);
    expect(Object.keys(d.set)).toEqual(['1', '3', '5']);
    // A countdown gauge sends its value and label only.
    expect(d.set['1']).toEqual({ v: 1799, l: '29m 59s' });
    expect(d.links).toBeUndefined();
    expect(d.title).toBeUndefined();
    expect(second.payload.length).toBeLessThan(first.payload.length / 3);
    expect(applyPaneRecord(a, second.payload)).toEqual(b);
    expect(encodePaneRecord(second.state, mercPane(1).snapshot())).toBeNull();
    // Forced: a full one even though a delta would do.
    const forced = encodePaneRecord(second.state, mercPane(2).snapshot(), true)!;
    expect(forced.full).toBe(true);
    expect(applyPaneRecord(null, forced.payload)).toEqual(mercPane(2).snapshot());
  });

  it('round-trips title, link and length changes, growth and shrinking', () => {
    const c = new PaneContent('T');
    let prevState = null as ReturnType<typeof recordState> | null;
    let played: PaneSnapshot | null = null;
    const step = (edit: () => void): void => {
      edit();
      const s = c.snapshot();
      const r = encodePaneRecord(prevState, s);
      if (!r) return;
      prevState = r.state;
      played = applyPaneRecord(played, r.payload);
      expect(played).toEqual(s);
    };
    step(() => c.append(plain('one\ntwo\n')));
    step(() => c.setLine(5, plain('six')));
    step(() => c.addLink(5, 0, 3, 1, 'hint'));
    step(() => c.setTitle('New'));
    step(() => c.setGauge(0, { value: 3, max: 10, label: 'g' }));
    step(() => c.setGauge(0, { value: 4, max: 10, label: 'g' }));
    step(() => c.setGauge(0, { value: 4, max: 10, label: 'h' }));
    step(() => c.setGauge(0, { value: 4, max: 20, label: 'h', color: 3 }));
    step(() => c.clear());
    step(() => c.append(plain('again')));
    for (let i = 0; i < 40; i++) step(() => c.append(plain(`line ${i}\n`)));
  });

  it('reads back defensively: malformed JSON, bad lines and links, caps', () => {
    const prev = mercPane(0).snapshot();
    expect(applyPaneRecord(prev, '{oops')).toBe(prev);
    expect(applyPaneRecord(null, '42')).toEqual({ title: '', lines: [], links: [] });
    expect(applyPaneRecord(prev, 'null')).toBeNull();
    // A delta with no record before it starts from an empty pane.
    const d = applyPaneRecord(null, '{"n":2,"set":{"1":{"spans":[{"text":"x"}]}}}')!;
    expect(texts(d)).toEqual(['', 'x']);
    const s = sanitizeSnapshot({
      title: 'x'.repeat(100),
      lines: [{ spans: [{ text: 'a', fg: -1, bold: 'yes' }, { nope: 1 }] }, 'junk', { gauge: { value: 9, max: 0, label: 3 } }],
      links: [{ row: 0, col: 0, len: 2, hint: 'h' }, { row: 9, col: 0, len: 1 }, { row: 0, col: 1, len: 0 }],
    });
    expect(s.title.length).toBe(60);
    expect(s.lines).toEqual([{ spans: [{ text: 'a' }] }, { spans: [] }, { gauge: { value: 1, max: 1, label: '' } }]);
    expect(s.links).toEqual([{ row: 0, col: 0, len: 2, hint: 'h' }]);
    // Shade-role colours (ADR 0065) survive; past them is junk.
    const t = sanitizeSnapshot({ title: 't', lines: [{ spans: [{ text: 'a', fg: shadeColor('vtext'), bg: shadeColor('dim') }, { text: 'b', fg: 0x2000100 }] }], links: [] });
    expect(t.lines).toEqual([{ spans: [{ text: 'a', fg: shadeColor('vtext'), bg: shadeColor('dim') }, { text: 'b' }] }]);
  });
});

describe('SPANE records: temporary panes', () => {
  const snap = (temp: PaneSnapshot['temp'], text = 'pick'): PaneSnapshot => ({ ...new PaneContent('Pick').snapshot(), lines: [{ spans: [{ text }] }], temp });

  it('a full record carries temp; a delta only when it changed; read back and kept across deltas', () => {
    const a = encodePaneRecord(null, snap({ rows: 3, cols: 20 }))!;
    expect(JSON.parse(a.payload).temp).toEqual({ rows: 3, cols: 20 });
    const b = encodePaneRecord(a.state, snap({ rows: 3, cols: 20 }, 'other'))!;
    expect(b.full).toBe(false);
    expect(JSON.parse(b.payload).temp).toBeUndefined();
    // Moved by the user: only the place changes.
    const moved = { rows: 3, cols: 20, rect: { x: 4, y: 5, w: 30, h: 7 } };
    const c = encodePaneRecord(b.state, snap(moved, 'other'))!;
    expect(c).not.toBeNull();
    expect(JSON.parse(c.payload)).toEqual({ n: 1, temp: moved });
    const hidden = { ...moved, off: true as const };
    const d = encodePaneRecord(c.state, snap(hidden, 'other'))!;
    let s = applyPaneRecord(null, a.payload);
    expect(s!.temp).toEqual({ rows: 3, cols: 20 });
    s = applyPaneRecord(s, b.payload);
    expect(s!.temp).toEqual({ rows: 3, cols: 20 });
    s = applyPaneRecord(s, c.payload);
    expect(s!.temp).toEqual(moved);
    s = applyPaneRecord(s, d.payload);
    expect(s).toEqual(snap(hidden, 'other'));
    // An ordinary pane has no temp, in either form.
    const o = encodePaneRecord(null, new PaneContent('O').snapshot())!;
    expect(o.payload).not.toContain('temp');
    expect(applyPaneRecord(null, o.payload)!.temp).toBeUndefined();
  });

  it('reads temp back defensively', () => {
    const bad = (temp: unknown) => applyPaneRecord(null, JSON.stringify({ title: 'T', lines: [], links: [], temp }))!.temp;
    expect(bad('x')).toBeUndefined();
    expect(bad({ rows: 'a', cols: 3 })).toBeUndefined();
    expect(bad({ rows: 1e9, cols: -5, rect: { x: -3, y: 2, w: 0, h: 'h' }, off: 'yes' })).toEqual({ rows: 1000, cols: 1 });
    expect(bad({ rows: 2, cols: 3, rect: { x: -3, y: 2, w: 0, h: 9 }, off: true })).toEqual({
      rows: 2,
      cols: 3,
      rect: { x: 0, y: 2, w: 1, h: 9 },
      off: true,
    });
  });
});

describe('SPANE records: anchor (ADR 0053 addendum)', () => {
  it('a top-anchored pane says so in full records; deltas and the player keep it', () => {
    const c = new PaneContent('Keys', { anchor: 'top' });
    c.setLine(0, plain('a'));
    const a = encodePaneRecord(null, c.snapshot())!;
    expect(JSON.parse(a.payload).anchor).toBe('top');
    c.setLine(1, plain('b'));
    const b = encodePaneRecord(a.state, c.snapshot())!;
    expect(b.full).toBe(false);
    expect(JSON.parse(b.payload).anchor).toBeUndefined();
    let s = applyPaneRecord(null, a.payload)!;
    s = applyPaneRecord(s, b.payload)!;
    expect(s.anchor).toBe('top');
    expect(PaneContent.fromSnapshot(s).anchor).toBe('top');
    // A console (the default) has none, and reads back as bottom.
    const o = encodePaneRecord(null, new PaneContent('O').snapshot())!;
    expect(o.payload).not.toContain('anchor');
    expect(PaneContent.fromSnapshot(applyPaneRecord(null, o.payload)!).anchor).toBe('bottom');
    expect(applyPaneRecord(null, '{"title":"x","lines":[],"links":[],"anchor":"sideways"}')!.anchor).toBeUndefined();
  });
});

describe('RecordingPaneSurface', () => {
  function setup() {
    const timers: Array<() => void> = [];
    const emitted: Array<[string, PaneSnapshot | null]> = [];
    const views: string[] = [];
    const inner: ScriptPaneSurface = {
      open: (spec) => ({
        changed: () => views.push(`changed ${spec.id}`),
        setOn: () => {},
        isOn: () => true,
        size: () => ({ cols: 0, rows: 0 }),
        close: () => views.push(`close ${spec.id}`),
      }),
    };
    const ms: number[] = [];
    const surface = new RecordingPaneSurface(
      inner,
      (id, snap) => emitted.push([id, snap]),
      (fn, t) => {
        ms.push(t);
        timers.push(fn);
        return timers.length;
      },
    );
    const run = (): void => {
      while (timers.length) timers.shift()!();
    };
    const events = { onLink: () => {}, onResize: () => {} };
    return { surface, emitted, views, run, ms, events };
  }

  it('reports each changed pane at most once per frame, and its closing', () => {
    const t = setup();
    const a = new PaneContent('A');
    const b = new PaneContent('B');
    const va = t.surface.open({ id: 's/a', place: { dock: 'right', rows: 5, cols: 20 } }, a, t.events);
    const vb = t.surface.open({ id: 's/b', place: { dock: 'right', rows: 5, cols: 20 } }, b, t.events);
    for (let i = 0; i < 10; i++) {
      a.setLine(0, plain(`a${i}`));
      va.changed();
    }
    expect(t.views.filter((v) => v === 'changed s/a')).toHaveLength(10);
    expect(t.ms).toEqual([PANE_RECORD_MS]);
    t.run();
    expect(t.emitted.map(([id, s]) => [id, s && texts(s)])).toEqual([
      ['s/a', ['a9']],
      ['s/b', []],
    ]);
    b.setLine(0, plain('b'));
    vb.changed();
    vb.close();
    vb.close();
    t.run();
    expect(t.emitted.slice(2)).toEqual([['s/b', null]]);
    expect(t.views.filter((v) => v === 'close s/b')).toHaveLength(2);
  });

  it('adds a temporary pane\'s placement to its snapshot and records a move', () => {
    const timers: Array<() => void> = [];
    const emitted: Array<[string, PaneSnapshot | null]> = [];
    let place: PaneSnapshot['temp'] = { rows: 3, cols: 20 };
    let onPlace: (() => void) | undefined;
    const placed: string[] = [];
    const inner: ScriptPaneSurface = {
      open: (_spec, _c, events) => {
        onPlace = events.onPlace;
        return { changed: () => {}, setOn: () => {}, isOn: () => true, size: () => ({ cols: 0, rows: 0 }), close: () => {}, placement: () => place };
      },
    };
    const surface = new RecordingPaneSurface(inner, (id, snap) => emitted.push([id, snap]), (fn) => timers.push(fn));
    const run = (): void => {
      while (timers.length) timers.shift()!();
    };
    surface.open({ id: 's/~t', place: { dock: 'right', rows: 3, cols: 20 }, temporary: { rows: 3, cols: 20 } }, new PaneContent('T'), {
      onLink: () => {},
      onResize: () => {},
      onPlace: () => placed.push('x'),
    });
    run();
    expect(emitted.at(-1)![1]!.temp).toEqual({ rows: 3, cols: 20 });
    place = { rows: 3, cols: 20, rect: { x: 1, y: 2, w: 22, h: 5 } };
    onPlace!();
    expect(placed).toEqual(['x']);
    run();
    expect(emitted.at(-1)![1]!.temp).toEqual(place);
    expect(emitted).toHaveLength(2);
  });
});

class FakeLocks implements LockManagerLike {
  request(_n: string, _o: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void> | void) {
    return Promise.resolve(cb({}));
  }
}

describe('Recorder: SPANE', () => {
  function setup() {
    const bus = new Bus();
    let clock = BASE_US;
    const rec = new Recorder(bus, {
      openStore: () => RunStore.open(new IDBFactory()),
      locks: new FakeLocks(),
      flushMs: 60000,
      win: null,
      now: () => (clock += 1000),
    });
    const play = (): void => {
      bus.emit('conn.state', { state: 'login', prev: 'connecting' });
      bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
      bus.emit('conn.state', { state: 'playing', prev: 'login' });
    };
    const bodies = async (): Promise<string[]> => {
      bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
      await rec.idle();
      const store = (await rec.getStore())!;
      const runs = await store.listRuns();
      const text = await (await buildRunBlob(store, runs[runs.length - 1]!.runId)).text();
      return text
        .trimEnd()
        .split('\n')
        .map((r) => r.slice(17));
    };
    return { bus, rec, play, bodies, skip: (us: number) => (clock += us) };
  }

  it('writes present panes at run start after the view, then deltas, skips unchanged, and the removal', async () => {
    {
      const t = setup();
      t.bus.emit('view.settings', { json: '{"v":1}' });
      const a = new PaneContent('A');
      a.setLine(0, plain('hello'));
      t.bus.emit('view.pane', { id: 's/a', snap: a.snapshot() });
      t.play();
      a.setLine(1, plain('more'));
      t.bus.emit('view.pane', { id: 's/a', snap: a.snapshot() });
      t.bus.emit('view.pane', { id: 's/a', snap: a.snapshot() }); // unchanged
      // A new pane: its pending placement (VIEW) goes first.
      t.bus.emit('view.settings', { json: '{"v":2}' });
      t.bus.emit('view.pane', { id: 's/b', snap: new PaneContent('B').snapshot() });
      t.bus.emit('view.pane', { id: 's/a', snap: null });
      // A pane that never got written leaves no removal.
      t.bus.emit('view.pane', { id: 's/c', snap: null });
      expect(await t.bodies()).toEqual([
        '\x1bVIEW {"v":1}',
        '\x1bSPANE s/a {"title":"A","lines":[{"spans":[{"text":"hello"}]}],"links":[]}',
        '\x1bSPANE s/a {"n":2,"set":{"1":{"spans":[{"text":"more"}]}}}',
        '\x1bVIEW {"v":2}',
        '\x1bSPANE s/b {"title":"B","lines":[],"links":[]}',
        '\x1bSPANE s/a null',
      ]);
    }
  });

  it('writes a full record again after PANE_KEYFRAME_US of deltas, and each run starts in full', async () => {
    const t = setup();
    t.play();
    let s = 0;
    const tick = (): void => {
      t.bus.emit('view.pane', { id: 's/m', snap: mercPane(s++).snapshot() });
    };
    tick();
    tick();
    t.skip(PANE_KEYFRAME_US);
    tick();
    tick();
    const b = await t.bodies();
    expect(b.map((x) => (x.includes('"lines"') ? 'full' : 'delta'))).toEqual(['full', 'delta', 'full', 'delta']);
    // The next run writes the present pane in full.
    t.play();
    expect(await t.bodies()).toEqual([`\x1bSPANE s/m ${JSON.stringify(mercPane(s - 1).snapshot())}`]);
  });
});

describe('timeline and export', () => {
  const rec = (at: number, id: string, json: string): string => formatPaneRecord(BASE_US + at * 1e6, id, json);
  const full = (s: PaneSnapshot): string => JSON.stringify(s);

  it('a temporary pane keeps its temp through an excluded range', () => {
    const t = { rows: 3, cols: 20, rect: { x: 1, y: 2, w: 22, h: 5 } };
    const a = encodePaneRecord(null, { title: 'T', lines: [], links: [], temp: t })!;
    const text = formatInbound(BASE_US, 'before') + rec(1, 's/~t', a.payload) + formatInbound(BASE_US + 2e6, 'after');
    const edited = editRunText(text, { ...defaultExportDoc('R/a'), excludes: [[BASE_US + 0.5e6, BASE_US + 1.5e6]] });
    const line = edited.split('\n').find((l) => l.includes('SPANE'))!;
    expect(JSON.parse(line.slice(line.indexOf('{'))).temp).toEqual(t);
  });

  it('the timeline has SPANE entries and lists the pane ids', () => {
    const text =
      formatInbound(BASE_US, 'Hi') + rec(1, 's/a', '{"title":"A","lines":[],"links":[]}') + rec(2, 'x/b', 'null') + rec(3, 's/a', 'null');
    const tl = buildTimeline([{ meta: meta('R/a', BASE_US), text }]);
    expect([...tl.kind]).toEqual([0, ENTRY_SPANE, ENTRY_SPANE, ENTRY_SPANE]);
    expect(scriptPaneIdsOf(tl)).toEqual(['s/a', 'x/b']);
  });

  it('an excluded range keeps one full record per pane changed in it, after its last entry', () => {
    const p = (secs: number): PaneSnapshot => mercPane(secs).snapshot();
    let state = encodePaneRecord(null, p(0))!;
    let text = formatInbound(BASE_US, 'before') + rec(0.5, 's/m', state.payload);
    for (let k = 1; k <= 3; k++) {
      const r = encodePaneRecord(state.state, p(k))!;
      state = r;
      text += rec(10 + k, 's/m', r.payload);
    }
    text += formatInbound(BASE_US + 14e6, 'secret') + rec(14.5, 's/x', full(p(9))) + rec(14.6, 's/x', 'null');
    const after = encodePaneRecord(state.state, p(4))!;
    text += formatInbound(BASE_US + 20e6, 'after') + rec(21, 's/m', after.payload);
    const edited = editRunText(text, { ...defaultExportDoc('R/a'), excludes: [[BASE_US + 10e6, BASE_US + 15e6]] });
    const lines = edited.trimEnd().split('\n');
    expect(lines.map((l) => l.slice(17, 39))).toEqual([
      'before',
      '\x1bSPANE s/m {"title":"M',
      '\x1bSPANE s/m {"title":"M',
      '\x1bSPANE s/x null',
      'after',
      '\x1bSPANE s/m {"n":6,"set',
    ]);
    // Folded at the range's last entry; the state is the one at the cut's end.
    expect(lines[2]!.slice(0, 16)).toBe(String(BASE_US + 14.6e6));
    expect(JSON.parse(lines[2]!.slice(17 + 11))).toEqual(p(3));
    // The delta after the range applies to it.
    let s: PaneSnapshot | null = null;
    for (const l of lines) {
      const r = parseRecord(l.slice(17));
      if (r?.type === 'SPANE' && r.payload.startsWith('s/m ')) s = applyPaneRecord(s, r.payload.slice(4));
    }
    expect(s).toEqual(p(4));
  });
});

describe('log player', () => {
  const ID = 'merc/main';
  function chain() {
    const s = defaultSettings();
    const layout = placeScriptPane(s.layout, ID, { dock: 'right', rows: 6, cols: 30 });
    const view = { appearance: { size: 14 }, panes: s.panes, layout };
    let r1 = makeLog(BASE_US, [
      { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 0.0002, view },
      { at: 1, in: 'Hello.' },
    ]);
    let st = encodePaneRecord(null, mercPane(0).snapshot())!;
    r1 += formatPaneRecord(BASE_US + 1.1e6, ID, st.payload);
    for (let k = 1; k <= 5; k++) {
      const r = encodePaneRecord(st.state, mercPane(k).snapshot())!;
      st = r;
      r1 += formatPaneRecord(BASE_US + (1 + k) * 1e6, ID, r.payload) + formatInbound(BASE_US + (1 + k) * 1e6 + 1, `tick ${k}`);
    }
    r1 += formatPaneRecord(BASE_US + 8e6, ID, 'null') + formatInbound(BASE_US + 9e6, 'Gone.');
    const b2 = BASE_US + 3600e6;
    const r2 =
      makeLog(b2, [
        { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
        { at: 1, in: 'Again.' },
      ]) + formatRecord(b2 + 2e6, 'SPANE', `${ID} ${JSON.stringify(mercPane(100).snapshot())}`) + formatInbound(b2 + 3e6, 'End.');
    return [
      { meta: meta('Rasta/a', BASE_US), text: r1 },
      { meta: meta('Rasta/b', b2), text: r2 },
    ];
  }

  function open() {
    const root = document.createElement('div');
    root.style.cssText = 'width:1200px;height:800px';
    document.body.appendChild(root);
    const wall = new FakeWall();
    const viewer = new SettingsStore({ factory: null, storage: null, win: null });
    void viewer.load();
    const host = new PlayerHost({ root, settings: viewer, wall, onClose: () => {} });
    host.openChain(chain(), [], { character: 'Rasta' });
    host.engine!.pause();
    const pane = (): ScriptPane | null =>
      ((host.app!.cockpit as unknown as { shells: Map<string, ScriptPane> }).shells.get(ID) as ScriptPane | undefined) ?? null;
    const seekLog = (us: number): void => {
      const eng = host.engine!;
      const tl = eng.timeline;
      let i = 0;
      while (i < tl.n && tl.ts[i]! <= us) i++;
      eng.seek(tl.play[i - 1]!);
      wall.flush();
    };
    return { root, host, pane, seekLog };
  }

  const gaugeLabel = (p: ScriptPane | null): string | undefined => {
    const l = p?.model.lines[1];
    return l && 'gauge' in l ? l.gauge.label : undefined;
  };

  it('builds the pane from the records, follows seeks both ways, and drops it at removal and run end', () => {
    const { host, pane, seekLog } = open();
    seekLog(BASE_US + 1.2e6);
    expect(host.app!.cockpit.scriptPanes().map((p) => p.id)).toEqual([ID]);
    expect(gaugeLabel(pane())).toBe('30m 0s');
    expect(pane()!.model.links).toHaveLength(12);
    seekLog(BASE_US + 5.5e6);
    expect(gaugeLabel(pane())).toBe('29m 56s');
    // Back: a new App, the records replayed from the start.
    seekLog(BASE_US + 3.5e6);
    expect(host.engine!.buildCount).toBe(2);
    expect(gaugeLabel(pane())).toBe('29m 58s');
    expect(pane()!.model.snapshot()).toEqual(mercPane(2).snapshot());
    seekLog(BASE_US + 8.5e6);
    expect(pane()).toBeNull();
    expect(host.app!.cockpit.scriptPanes()).toEqual([]);
    seekLog(BASE_US + 3600e6 + 1.5e6);
    expect(pane()).toBeNull();
    seekLog(BASE_US + 3600e6 + 2.5e6);
    expect(gaugeLabel(pane())).toBe('28m 20s');
    host.dispose();
  });

  it('is placed from the VIEW, has inert links, and the viewer can toggle it', () => {
    const { root, host, pane, seekLog } = open();
    seekLog(BASE_US + 2.5e6);
    const p = pane()!;
    expect(p.el.isConnected).toBe(true);
    expect(p.el.classList.contains('wc-pane-script')).toBe(true);
    // No click handler: a click on a link does nothing (and throws nothing).
    expect((p as unknown as { onLink: unknown }).onLink).toBeNull();
    const controls = (host.playerView as unknown as { o: { settings: ViewerControls } }).o.settings;
    expect(controls.panes().at(-1)).toEqual({ id: ID, label: 'Mercenaries (merc)', on: true, wide: true });
    controls.togglePane(ID);
    const store = () => (host.app as unknown as { settings: SettingsStore }).settings;
    expect(store().get().panes[ID]?.on).toBe(false);
    expect(host.viewerOverrides.panes).toEqual({ [ID]: false });
    root.remove();
    host.dispose();
  });

  it('draws a temporary pane where the player saw it, keeps it out of the gear, and its cross hides it', () => {
    const TID = 'merc/~pick';
    const s0 = defaultSettings();
    const view = { appearance: { size: 14 }, panes: s0.panes, layout: s0.layout };
    const pick = (text: string, temp: PaneSnapshot['temp']): string => {
      const c = new PaneContent('Pick');
      c.setLine(0, plain(text));
      return JSON.stringify({ ...c.snapshot(), temp });
    };
    let r1 = makeLog(BASE_US, [
      { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 0.0002, view },
      { at: 1, in: 'Hello.' },
    ]);
    r1 += formatPaneRecord(BASE_US + 1.1e6, TID, pick('a or b?', { rows: 2, cols: 20 }));
    r1 += formatPaneRecord(BASE_US + 2e6, TID, JSON.stringify({ n: 1, temp: { rows: 2, cols: 20, rect: { x: 3, y: 4, w: 24, h: 6 } } }));
    r1 += formatInbound(BASE_US + 2.5e6, 'moved');
    r1 += formatPaneRecord(BASE_US + 3e6, TID, JSON.stringify({ n: 1, temp: { rows: 2, cols: 20, rect: { x: 3, y: 4, w: 24, h: 6 }, off: true } }));
    r1 += formatInbound(BASE_US + 3.5e6, 'hidden');
    r1 += formatPaneRecord(BASE_US + 4e6, TID, JSON.stringify({ n: 1, set: { 0: { spans: [{ text: 'again' }] } }, temp: { rows: 2, cols: 20, rect: { x: 3, y: 4, w: 24, h: 6 } } }));
    r1 += formatInbound(BASE_US + 4.5e6, 'shown');
    r1 += formatPaneRecord(BASE_US + 5e6, TID, 'null') + formatInbound(BASE_US + 6e6, 'Gone.');
    const root = document.createElement('div');
    root.style.cssText = 'width:1200px;height:800px';
    document.body.appendChild(root);
    const wall = new FakeWall();
    const viewer = new SettingsStore({ factory: null, storage: null, win: null });
    void viewer.load();
    const host = new PlayerHost({ root, settings: viewer, wall, onClose: () => {} });
    host.openChain([{ meta: meta('Rasta/a', BASE_US), text: r1 }], [], { character: 'Rasta' });
    host.engine!.pause();
    const seekLog = (us: number): void => {
      const eng = host.engine!;
      const tl = eng.timeline;
      let i = 0;
      while (i < tl.n && tl.ts[i]! <= us) i++;
      eng.seek(tl.play[i - 1]!);
      wall.flush();
    };
    const cockpit = () => host.app!.cockpit;
    seekLog(BASE_US + 1.5e6);
    expect(cockpit().tempPane(TID)).toEqual({ rows: 2, cols: 20, at: 'center', rect: null, on: true });
    expect(cockpit().scriptPanes()).toEqual([]);
    expect(host.scriptPaneIds).toEqual([]);
    const controls = (host.playerView as unknown as { o: { settings: ViewerControls } }).o.settings;
    expect(controls.panes().some((p) => p.id === TID)).toBe(false);
    seekLog(BASE_US + 2.5e6);
    expect(cockpit().tempPane(TID)!.rect).toEqual({ x: 3, y: 4, w: 24, h: 6 });
    seekLog(BASE_US + 3.5e6);
    expect(cockpit().tempPane(TID)!.on).toBe(false);
    seekLog(BASE_US + 4.5e6);
    expect(cockpit().tempPane(TID)!.on).toBe(true);
    const shell = (cockpit() as unknown as { shells: Map<string, ScriptPane> }).shells.get(TID)!;
    expect(shell.model.lines[0]).toEqual({ spans: [{ text: 'again' }] });
    // The viewer closes it with its cross: hidden, not in the viewer's settings.
    const before = JSON.stringify((host.app as unknown as { settings: SettingsStore }).settings.get());
    shell.el.querySelector<HTMLElement>('.wc-pane-close')!.click();
    expect(cockpit().tempPane(TID)!.on).toBe(false);
    expect(JSON.stringify((host.app as unknown as { settings: SettingsStore }).settings.get())).toBe(before);
    seekLog(BASE_US + 5.5e6);
    expect(cockpit().tempPane(TID)).toBeNull();
    // Spotlights hide temporary panes.
    host.hideTempPanes();
    seekLog(BASE_US + 1.5e6);
    expect(cockpit().tempPane(TID)).toBeNull();
    root.remove();
    host.dispose();
  });

  it('applyViewer switches a script pane with no entry and tints every pane for a theme', () => {
    const d = defaultSettings();
    applyViewer(d, withPane(noOverrides(), ID, false));
    expect(d.panes[ID]).toEqual({ on: false, color: 'black', border: true });
    d.panes['s/x'] = { on: true, color: 'red', border: true };
    applyViewer(d, { ...noOverrides(), theme: 'paper' });
    expect(d.panes['s/x']!.color).toBe('black');
  });
});
