// The bundled pane bar (src/scripts/bundled/panebar.lua, stage 14, ADR
// 0065), run in the real script host with a fake pane surface that has
// the pane list: built-in panes, then the open script panes.

import { afterEach, describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import { shadeColor } from '../../src/core/types';
import { GameState } from '../../src/gmcp/state';
import { type DockId, PANE_IDS } from '../../src/layout/types';
import { loadLuaRuntime } from '../../src/lua';
import type { PaneContent } from '../../src/panes/script-content';
import type { PaneState, ScriptPaneEvents, ScriptPaneSpec, ScriptPaneSurface, ScriptPaneView } from '../../src/panes/script-surface';
import { FakeScheduler, ScriptEngine } from '../../src/script/engine';
import { resetScriptKeys } from '../../src/script/script-keys';
import { ScriptLibrary } from '../../src/scripts';
import { BUNDLED_SCRIPTS } from '../../src/scripts/bundled';
import { ScriptHost } from '../../src/scripts/host';

const hosts: ScriptHost[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.dispose();
  resetScriptKeys();
});

interface Opened {
  spec: ScriptPaneSpec;
  content: PaneContent;
  events: ScriptPaneEvents;
  view: ScriptPaneView & { on: boolean; closed: boolean };
}

/** A surface with the pane list; docks per pane, wantSize requests recorded. */
class Surface implements ScriptPaneSurface {
  readonly opened: Opened[] = [];
  readonly builtinOn = new Map<string, boolean>();
  readonly docks = new Map<string, DockId | 'float'>();
  readonly wants: Array<[number, number | undefined]> = [];
  private readonly fns = new Set<() => void>();

  open(spec: ScriptPaneSpec, content: PaneContent, events: ScriptPaneEvents): ScriptPaneView {
    const view = {
      on: true,
      closed: false,
      changed: () => {},
      setOn: (on: boolean) => {
        view.on = on;
        this.notify();
      },
      isOn: () => view.on,
      size: () => ({ cols: 0, rows: 0 }),
      close: () => {
        view.closed = true;
        this.notify();
      },
      dock: () => this.docks.get(spec.id) ?? (spec.temporary ? 'float' : spec.place.dock),
      want: (rows: number, cols?: number) => {
        if (spec.id === 'panebar/bar') this.wants.push([rows, cols]);
        return view.dock() !== 'float';
      },
    };
    this.opened.push({ spec, content, events, view });
    this.notify();
    return view;
  }

  states(): PaneState[] {
    const open = this.opened.filter((o) => !o.view.closed && !o.spec.temporary);
    return [
      ...PANE_IDS.map((id) => ({ id, on: this.builtinOn.get(id) ?? true, shown: true, dock: 'right' as const })),
      ...open.map((o) => ({ id: o.spec.id, on: o.view.on, shown: o.view.on, dock: o.view.dock!() })),
    ];
  }

  setOn(id: string, on: boolean): boolean {
    if (!this.states().some((s) => s.id === id)) return false;
    const o = this.opened.find((x) => x.spec.id === id && !x.view.closed);
    if (o) o.view.on = on;
    else this.builtinOn.set(id, on);
    this.notify();
    return true;
  }

  onStates(fn: () => void): () => void {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }

  notify(): void {
    for (const f of [...this.fns]) f();
  }

  get bar(): Opened {
    return this.opened.find((o) => o.spec.id === 'panebar/bar' && !o.view.closed)!;
  }
}

async function setup(also: string[] = []) {
  const bus = new Bus();
  const clock = new FakeScheduler();
  const sent: string[] = [];
  const shown: string[] = [];
  let host: ScriptHost | null = null;
  const engine = new ScriptEngine({ send: (t) => sent.push(t), message: () => {}, scheduler: clock, scriptCommand: (n, a) => host!.command(n, a) });
  engine.attach(bus);
  const game = new GameState();
  game.attach(bus);
  bus.on('text.display', (d) => shown.push(d.line.text));
  const lib = new ScriptLibrary({ factory: null, bundled: BUNDLED_SCRIPTS });
  await lib.init();
  for (const name of ['panebar', ...also]) await lib.setEnabled(name, true);
  const panes = new Surface();
  host = new ScriptHost({ engine, bus, library: lib, game, send: (t) => sent.push(t), print: () => {}, message: () => {}, loadRuntime: () => loadLuaRuntime(), panes });
  hosts.push(host);
  await host.start();
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    await host!.sync();
  };
  const rows = () => panes.bar.content.lines.map((l) => ('spans' in l ? l.spans.map((s) => s.text).join('') : ''));
  const resize = async (cols: number, rows_ = 1) => {
    panes.bar.events.onResize(cols, rows_);
    await settle();
  };
  /** The link over the button labelled `label`. */
  const button = (label: string) => {
    const c = panes.bar.content;
    for (let r = 0; r < c.lines.length; r++) {
      const l = c.lines[r]!;
      const text = 'spans' in l ? l.spans.map((s) => s.text).join('') : '';
      const at = ` ${text} `.indexOf(` ${label} `);
      if (at >= 0) return { row: r, col: at, link: c.linkAt(r, at)! };
    }
    throw new Error(`no button ${label} in ${rows().join(' / ')}`);
  };
  /** The colours of the cell at `row`, `col`. */
  const colours = (row: number, col: number) => {
    const l = panes.bar.content.lines[row]!;
    let x = 0;
    for (const s of 'spans' in l ? l.spans : []) {
      if (col < x + s.text.length) return { fg: s.fg, bg: s.bg };
      x += s.text.length;
    }
    return null;
  };
  return { bus, engine, sent, shown, lib, host, panes, settle, rows, resize, button, colours };
}

const ON = { fg: shadeColor('paneBg'), bg: shadeColor('glow') };
/** Off: the mid shade on the track, faded but readable (ADR 0065 round 2). */
const OFF = { fg: shadeColor('mid'), bg: shadeColor('track') };
/** The grip glyph and the blank after it. */
const G = '\u2237 ';
/** A row of buttons `w` wide (names centred), as the bar draws it; `grip` for row 1. */
const bar = (names: string[], grip: boolean, w = 6): string =>
  (grip ? G : '  ') +
  names
    .map((n) => {
      const left = Math.floor((w - n.length) / 2);
      return ' '.repeat(left) + n + ' '.repeat(w - n.length - left);
    })
    .join(' ');
const ALL = ['CHAR', 'TIME', 'GRP', 'COMM', 'UI', 'MAP'];

describe('bundled panebar', () => {
  it('is listed with its header and is off by default', async () => {
    const lib = new ScriptLibrary({ factory: null, bundled: BUNDLED_SCRIPTS });
    await lib.init();
    const s = lib.get('panebar')!;
    expect(s).toMatchObject({ bundled: true, readonly: true, problems: [], loadProblem: null, enabled: false });
    expect(s.header.api).toBe(1);
    expect(s.header.summary).toBe('A bar of buttons that turn the panes on and off');
    expect(s.header.aliases.map((a) => a.name)).toEqual(['bar']);
    expect(s.settings).toEqual({});
  });

  it('opens a borderless bar at the bottom of the right dock, one button per pane, never itself', async () => {
    const t = await setup();
    expect(t.panes.bar.spec).toEqual({
      id: 'panebar/bar',
      place: { dock: 'right', rows: 1, cols: 30, border: false },
    });
    expect(t.panes.bar.content.title).toBe('Pane bar');
    await t.resize(80);
    expect(t.rows()).toEqual([bar(ALL, true)]);
    expect(t.rows().join(' ')).not.toContain('BAR');
    expect(t.panes.wants.at(-1)).toEqual([1, undefined]);
    expect(t.button('COMM').link.hint).toBe('Comm: on (click to hide)');
    expect(t.colours(0, 2)).toEqual(ON);
    // A hovered button lightens (ADR 0065 round 2): the pane's style, no link of its own.
    expect(t.panes.bar.content.hover).toBe('lighten');
    expect(t.panes.bar.content.links.every((l) => l.hover === undefined)).toBe(true);
    // The grip is dim, the gap between buttons is plain.
    expect(t.colours(0, 0)).toEqual({ fg: shadeColor('mid'), bg: undefined });
    expect(t.colours(0, 8)).toEqual({ fg: undefined, bg: undefined });
    expect(t.lib.get('panebar')!.lastError).toBeNull();
  });

  it('pads every button by one cell and makes them all as wide as the longest name', async () => {
    const t = await setup();
    await t.resize(80);
    const links = t.panes.bar.content.links.filter((l) => l.row === 0);
    expect(links.map((l) => [l.col, l.len])).toEqual([
      [2, 6],
      [9, 6],
      [16, 6],
      [23, 6],
      [30, 6],
      [37, 6],
    ]);
    // GRP is centred: one blank before, two after (the odd cell goes right).
    expect(t.rows()[0]!.slice(16, 22)).toBe(' GRP  ');
    for (const l of links) for (let c = l.col; c < l.col + l.len; c++) expect(t.colours(0, c)).toEqual(ON);
  });

  it('puts the grip on the first two cells of row 1', async () => {
    const t = await setup();
    await t.resize(80);
    expect(t.panes.bar.content.grip).toEqual({ row: 0, col: 0, len: 2 });
    expect(t.panes.bar.content.linkAt(0, 0)).toBeNull();
    expect(t.panes.bar.content.linkAt(0, 1)).toBeNull();
  });

  it('a click toggles the pane; the button turns dark and back', async () => {
    const t = await setup();
    await t.resize(80);
    t.panes.bar.events.onLink(t.button('COMM').link.id);
    await t.settle();
    expect(t.panes.builtinOn.get('comm')).toBe(false);
    const b = t.button('COMM');
    expect(t.colours(b.row, b.col)).toEqual(OFF);
    expect(b.link.hint).toBe('Comm: off (click to show)');
    t.panes.bar.events.onLink(b.link.id);
    await t.settle();
    expect(t.panes.builtinOn.get('comm')).toBe(true);
    expect(t.colours(b.row, b.col)).toEqual(ON);
  });

  for (const dock of ['right', 'left', 'bottom', 'top'] as const) {
    it(`flows left to right and wraps under the first button in the ${dock} dock, asking for the rows`, async () => {
      const t = await setup();
      t.panes.docks.set('panebar/bar', dock);
      t.panes.notify();
      // Buttons at columns 3-8, 10-15, 17-22, 24-29: four fit in 29 columns
      // (the last ends in the last column; no gap after it, no margin).
      await t.resize(29, 4);
      expect(t.rows()).toEqual([bar(['CHAR', 'TIME', 'GRP', 'COMM'], true), bar(['UI', 'MAP'], false)]);
      expect(t.panes.bar.content.links.filter((l) => l.row === 0).map((l) => l.col + l.len)).toEqual([8, 15, 22, 29]);
      expect(t.panes.wants.at(-1)).toEqual([2, undefined]);
      // One cell short: the fourth wraps.
      await t.resize(28, 4);
      expect(t.rows()).toEqual([bar(['CHAR', 'TIME', 'GRP'], true), bar(['COMM', 'UI', 'MAP'], false)]);
      expect(t.panes.bar.content.links.filter((l) => l.row === 1).map((l) => l.col)).toEqual([2, 9, 16]);
      expect(t.panes.wants.at(-1)).toEqual([2, undefined]);
      // All six in exactly 43 columns, not in 42.
      await t.resize(43, 4);
      expect(t.rows()).toEqual([bar(ALL, true)]);
      await t.resize(42, 4);
      expect(t.rows()).toEqual([bar(ALL.slice(0, 5), true), bar(['MAP'], false)]);
      await t.resize(12, 6);
      expect(t.rows()).toEqual([bar(['CHAR'], true), ...ALL.slice(1).map((n) => bar([n], false))]);
      expect(t.panes.wants.at(-1)).toEqual([6, undefined]);
    });
  }

  it('floats: the same flow up to the last column, no size request', async () => {
    const t = await setup();
    t.panes.docks.set('panebar/bar', 'float');
    t.panes.notify();
    const before = t.panes.wants.length;
    await t.resize(22, 3);
    expect(t.rows()).toEqual([bar(['CHAR', 'TIME', 'GRP'], true), bar(['COMM', 'UI', 'MAP'], false)]);
    await t.resize(21, 3);
    expect(t.rows()).toEqual([bar(['CHAR', 'TIME'], true), bar(['GRP', 'COMM'], false), bar(['UI', 'MAP'], false)]);
    expect(t.panes.wants.length).toBe(before);
  });

  it('lists other scripts\' panes by their short names, and drops them when the script stops', async () => {
    const t = await setup(['mercenaries']);
    await t.resize(80);
    expect(t.rows()).toEqual([bar([...ALL, 'MERC'], true)]);
    expect(t.button('MERC').link.hint).toBe('Mercenaries: on (click to hide)');
    await t.lib.setEnabled('mercenaries', false);
    await t.settle();
    expect(t.rows()).toEqual([bar(ALL, true)]);
  });

  it('bar toggles the pane; bar list prints the panes', async () => {
    const t = await setup();
    t.engine.input('bar');
    expect(t.panes.bar.view.on).toBe(false);
    t.engine.input('bar');
    expect(t.panes.bar.view.on).toBe(true);
    t.panes.builtinOn.set('map', false);
    t.engine.input('bar list');
    expect(t.shown).toContain('BAR COMM     on   Comm');
    expect(t.shown).toContain('BAR MAP      off  Map');
    expect(t.sent).toEqual([]);
  });
});
