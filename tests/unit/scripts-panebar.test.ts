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
  view: ScriptPaneView & { on: boolean; closed: boolean; wheels: boolean[] };
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
      wheels: [] as boolean[],
      wheel: (on: boolean) => view.wheels.push(on),
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
    // No close cross, no hover outline (ADR 0084 addenda).
    expect(t.panes.bar.content.cross).toBe(false);
    expect(t.panes.bar.content.outline).toBe(false);
    await t.resize(80);
    expect(t.rows()).toEqual([bar(ALL, true)]);
    expect(t.rows().join(' ')).not.toContain('BAR');
    expect(t.panes.wants.at(-1)).toEqual([1, undefined]);
    // No tooltips (stage 21): a button's link has no hint.
    expect(t.button('COMM').link.hint).toBe('');
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
    expect(b.link.hint).toBe('');
    t.panes.bar.events.onLink(b.link.id);
    await t.settle();
    expect(t.panes.builtinOn.get('comm')).toBe(true);
    expect(t.colours(b.row, b.col)).toEqual(ON);
  });

  for (const dock of ['right', 'left', 'bottom', 'top', 'float'] as const) {
    it(`is one row in the ${dock} dock at every width${dock === 'float' ? ', no size request' : ', asking for one row'}`, async () => {
      const t = await setup();
      t.panes.docks.set('panebar/bar', dock);
      t.panes.notify();
      const before = t.panes.wants.length;
      for (const cols of [80, 43, 42, 30, 19, 18, 12, 6]) {
        await t.resize(cols, 4);
        expect(t.rows().length).toBe(1);
        expect(t.rows()[0]!.length).toBeLessThanOrEqual(cols);
      }
      if (dock === 'float') expect(t.panes.wants.length).toBe(before);
      else expect(t.panes.wants.slice(before).every((w) => w[0] === 1 && w[1] === undefined)).toBe(true);
    });
  }

  /** [col, len] of the buttons on row 1 (0-based columns). */
  const spans = (t: Awaited<ReturnType<typeof setup>>) =>
    t.panes.bar.content.links.filter((l) => l.row === 0).map((l) => [l.col, l.len]);

  it('full width while all fit, never stretched', async () => {
    const t = await setup();
    // All six in exactly 43 columns.
    await t.resize(43);
    expect(t.rows()).toEqual([bar(ALL, true)]);
    await t.resize(120);
    expect(t.rows()).toEqual([bar(ALL, true)]);
  });

  it('shrinks to fill the row, the spare cells mirror-even, names centred or cut', async () => {
    const t = await setup();
    // One cell short of full: 35 button cells for six, 5 each and 5 spare:
    // the first and last two get one each, the odd one stays empty at the end.
    await t.resize(42);
    expect(spans(t)).toEqual([
      [2, 6],
      [9, 6],
      [16, 5],
      [22, 5],
      [28, 6],
      [35, 6],
    ]);
    expect(t.rows()).toEqual([G + ' CHAR   TIME   GRP  COMM    UI    MAP  ']);
    // 4 each, no spare.
    await t.resize(31);
    expect(t.rows()).toEqual([G + 'CHAR TIME GRP  COMM  UI  MAP ']);
    expect(spans(t).at(-1)).toEqual([27, 4]);
    // 3 each and 2 spare: the first and the last.
    await t.resize(27);
    expect(spans(t).map((s) => s[1])).toEqual([4, 3, 3, 3, 3, 4]);
    expect(t.rows()).toEqual([G + 'CHAR TIM GRP COM UI  MAP ']);
    // Two each: the narrowest.
    await t.resize(19);
    expect(t.rows()).toEqual([G + 'CH TI GR CO UI MA']);
    expect(spans(t).at(-1)).toEqual([17, 2]);
    // Colours stay whole.
    expect(t.colours(0, 2)).toEqual(ON);
  });

  it('an odd spare cell goes to the middle button when there is one', async () => {
    const t = await setup(['mercenaries']);
    // Seven buttons in 37 room cells: 31 button cells, 4 each and 3 spare.
    await t.resize(39);
    expect(spans(t).map((s) => s[1])).toEqual([5, 4, 4, 5, 4, 4, 5]);
    expect(spans(t).at(-1)).toEqual([34, 5]);
    expect(t.rows()[0]!.length).toBe(39);
  });

  it('scrolls when two cells each do not fit: arrows at both ends, a click moves a page', async () => {
    const t = await setup();
    await t.resize(18);
    // Four two-cell buttons between ← (column 3) and → (the last column).
    expect(t.rows()).toEqual([G + '← CH TI GR CO  →']);
    const c = t.panes.bar.content;
    expect(c.linkAt(0, 2)).toBeNull();
    expect(t.colours(0, 2)).toEqual({ fg: shadeColor('dim'), bg: undefined });
    expect(t.colours(0, 17)).toEqual({ fg: shadeColor('vtext'), bg: undefined });
    expect(c.linkAt(0, 17)!.hint).toBe('');
    expect(spans(t).filter((s) => s[1] === 2).map((s) => s[0])).toEqual([4, 7, 10, 13]);
    // A page right: as far as it goes (two more).
    t.panes.bar.events.onLink(c.linkAt(0, 17)!.id);
    await t.settle();
    expect(t.rows()).toEqual([G + '← GR CO UI MA  →']);
    expect(t.panes.bar.content.linkAt(0, 17)).toBeNull();
    expect(t.colours(0, 17)).toEqual({ fg: shadeColor('dim'), bg: undefined });
    expect(t.panes.bar.content.linkAt(0, 2)).not.toBeNull();
    // A click on a button still toggles its pane; the offset stays.
    t.panes.bar.events.onLink(t.button('MA').link.id);
    await t.settle();
    expect(t.panes.builtinOn.get('map')).toBe(false);
    expect(t.rows()).toEqual([G + '← GR CO UI MA  →']);
    // Wider: shrunk, the offset gone (17 cells for six: 2 each, 5 spare).
    await t.resize(24);
    expect(t.rows()).toEqual([G + 'CHA TIM GR CO UI  MAP']);
    // Narrow again: from the first; a page right and back.
    await t.resize(18);
    expect(t.rows()).toEqual([G + '← CH TI GR CO  →']);
    t.panes.bar.events.onLink(t.panes.bar.content.linkAt(0, 17)!.id);
    await t.settle();
    t.panes.bar.events.onLink(t.panes.bar.content.linkAt(0, 2)!.id);
    await t.settle();
    expect(t.rows()).toEqual([G + '← CH TI GR CO  →']);
    // Wide enough to shrink: no arrows, no offset.
    await t.resize(19);
    expect(t.rows()).toEqual([G + 'CH TI GR CO UI MA']);
  });

  it('the list shrinking clamps the offset', async () => {
    const t = await setup(['mercenaries']);
    await t.resize(18);
    t.panes.bar.events.onLink(t.panes.bar.content.linkAt(0, 17)!.id);
    await t.settle();
    // Seven panes, four shown: the last page starts at the fourth.
    expect(t.rows()).toEqual([G + '← CO UI MA ME  →']);
    await t.lib.setEnabled('mercenaries', false);
    await t.settle();
    expect(t.rows()).toEqual([G + '← GR CO UI MA  →']);
    expect(t.panes.bar.content.linkAt(0, 2)).not.toBeNull();
  });

  it('the wheel scrolls a button per three cells, only when scrolled', async () => {
    const t = await setup();
    const wheel = (dx: number, dy: number) => t.panes.bar.events.onWheel!(dx, dy);
    expect(t.panes.bar.view.wheels).toEqual([true]);
    await t.resize(43);
    expect(wheel(3, 0)).toBe(false);
    expect(t.rows()).toEqual([bar(ALL, true)]);
    await t.resize(18);
    expect(wheel(2, 0)).toBe(true);
    expect(t.rows()).toEqual([G + '← CH TI GR CO  →']);
    expect(wheel(1, 0)).toBe(true);
    expect(t.rows()).toEqual([G + '← TI GR CO UI  →']);
    // Up and down too (a mouse wheel), past the end clamped.
    expect(wheel(0, 9)).toBe(true);
    expect(t.rows()).toEqual([G + '← GR CO UI MA  →']);
    // Turning back drops the part of a step not used.
    wheel(0, 2);
    expect(wheel(-3, 0)).toBe(true);
    expect(t.rows()).toEqual([G + '← TI GR CO UI  →']);
    wheel(-6, 0);
    expect(t.rows()).toEqual([G + '← CH TI GR CO  →']);
    expect(t.lib.get('panebar')!.lastError).toBeNull();
  });

  it('lists other scripts\' panes by their short names, and drops them when the script stops', async () => {
    const t = await setup(['mercenaries']);
    await t.resize(80);
    expect(t.rows()).toEqual([bar([...ALL, 'MERC'], true)]);
    expect(t.button('MERC').link).toBeDefined();
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
