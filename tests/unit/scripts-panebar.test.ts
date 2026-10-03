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

const ON = { fg: shadeColor('vtext'), bg: shadeColor('dim') };
const OFF = { fg: shadeColor('mid'), bg: shadeColor('track') };

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

  it('opens a borderless one-row bar in its own bottom lane, one button per pane, never itself', async () => {
    const t = await setup();
    expect(t.panes.bar.spec).toEqual({
      id: 'panebar/bar',
      place: { dock: 'bottom', rows: 1, cols: 80, border: false, lane: 'own' },
    });
    expect(t.panes.bar.content.title).toBe('Pane bar');
    await t.resize(80);
    expect(t.rows()).toEqual(['CHAR TIME GRP COMM UI MAP']);
    expect(t.rows().join(' ')).not.toContain('BAR');
    expect(t.panes.wants.at(-1)).toEqual([1, undefined]);
    expect(t.button('COMM').link.hint).toBe('Comm: on (click to hide)');
    expect(t.colours(0, 0)).toEqual(ON);
    // The gap between buttons is plain.
    expect(t.colours(0, 4)).toEqual({ fg: undefined, bg: undefined });
    expect(t.lib.get('panebar')!.lastError).toBeNull();
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

  it('wraps in a narrow bottom dock, keeping the close cross cells free on the first row, and asks for the rows', async () => {
    const t = await setup();
    await t.resize(16);
    // Row 1 ends at column 12 (16 - 4): CHAR TIME is 9 cells, GRP would end at 13.
    expect(t.rows()).toEqual(['CHAR TIME', 'GRP COMM UI MAP']);
    expect(t.panes.wants.at(-1)).toEqual([2, undefined]);
    await t.resize(10);
    expect(t.rows()).toEqual(['CHAR TIME', 'GRP COMM', 'UI MAP']);
    expect(t.panes.wants.at(-1)).toEqual([3, undefined]);
  });

  it('stacks one button per row from column 2 in a side dock and asks for one row each', async () => {
    const t = await setup();
    t.panes.docks.set('panebar/bar', 'right');
    t.panes.notify();
    await t.resize(10, 6);
    expect(t.rows()).toEqual([' CHAR', ' TIME', ' GRP', ' COMM', ' UI', ' MAP']);
    expect(t.panes.wants.at(-1)).toEqual([6, undefined]);
  });

  it('floats: flows from column 2 to one before the edge, no size request', async () => {
    const t = await setup();
    t.panes.docks.set('panebar/bar', 'float');
    const before = t.panes.wants.length;
    await t.resize(20, 3);
    expect(t.rows()).toEqual([' CHAR TIME GRP', ' COMM UI MAP']);
    expect(t.panes.wants.length).toBe(before);
  });

  it('lists other scripts\' panes by their short names, and drops them when the script stops', async () => {
    const t = await setup(['mercenaries']);
    await t.resize(80);
    expect(t.rows()).toEqual(['CHAR TIME GRP COMM UI MAP MERC']);
    expect(t.button('MERC').link.hint).toBe('Mercenaries: on (click to hide)');
    await t.lib.setEnabled('mercenaries', false);
    await t.settle();
    expect(t.rows()).toEqual(['CHAR TIME GRP COMM UI MAP']);
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
