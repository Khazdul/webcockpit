// The bundled mercenaries script (src/scripts/bundled/mercenaries.lua,
// stage 11 P2), run in the real script host with MUME game text and GMCP,
// a fake pane surface and fake time.
//
// Game text: the hire, tap, pay and leave lines are the ones Cockpit's
// script matches (no session log has a hire); the label replies, the
// labelled death line, the "waiting for a job" room line and the fight
// line with an unhired mercenary are from real logs.

import { afterEach, describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { BusEvents, Line, UiMessage } from '../../src/core/types';
import { GameState } from '../../src/gmcp/state';
import { loadLuaRuntime } from '../../src/lua';
import type { PaneContent } from '../../src/panes/script-content';
import type { ScriptPaneEvents, ScriptPaneSpec, ScriptPaneSurface, ScriptPaneView } from '../../src/panes/script-surface';
import { FakeScheduler, ScriptEngine } from '../../src/script/engine';
import { resetScriptKeys } from '../../src/script/script-keys';
import { ScriptLibrary } from '../../src/scripts';
import { BUNDLED_SCRIPTS } from '../../src/scripts/bundled';
import { ScriptHost } from '../../src/scripts/host';

const HIRE = 'A citizen mercenary starts following you.';
const tap = (n: string) => `A citizen mercenary (${n}) taps you on the shoulder.`;
const thanks = (n: string) => `A citizen mercenary (${n}) says 'Thank you. I am at your service.'`;
const leaves = (n: string) => `A citizen mercenary (${n}) leaves and goes to seek another employer.`;
const dead = (n: string) => `A citizen mercenary (${n}) is dead! R.I.P.`;
// Real lines that must not count as a hire, a payment or a death of ours.
const NOISE = [
  'A citizen-mercenary is here, waiting for a job.',
  'A citizen mercenary tries to crush you, but your parry is successful.',
  'A hungry warg (MIN) is dead! R.I.P.',
  'A hungry warg (MIN) starts following you.',
];
const EPOCH0 = 1_790_000_000;

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

function line(text: string): Line {
  return { text, runs: [], tags: [], prompt: false, raw: text, ts: 0 };
}

async function setup() {
  const bus = new Bus();
  const clock = new FakeScheduler();
  const sent: string[] = [];
  const ui: UiMessage[] = [];
  const shown: BusEvents['text.display'][] = [];
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
  bus.on('text.display', (d) => shown.push(d));
  bus.on('ui.message', (m) => ui.push(m));
  const lib = new ScriptLibrary({ factory: null, bundled: BUNDLED_SCRIPTS });
  await lib.init();
  await lib.setEnabled('mercenaries', true);
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
    epoch: () => EPOCH0 + clock.now() / 1000,
    panes,
  });
  hosts.push(host);
  await host.start();
  const recv = (...texts: string[]) => {
    for (const t of texts) bus.emit('text.line', line(t));
  };
  const gmcp = (pkg: string, data: unknown) => {
    bus.emit('gmcp.raw', { pkg, json: JSON.stringify(data) });
    bus.emit('gmcp', { pkg, key: pkg.toLowerCase(), data });
  };
  const texts = () => shown.map((d) => d.line.text);
  const uiText = () => ui.map((m) => `${m.kind === 'event' ? m.name : ''}: ${m.parts.map((p) => (typeof p === 'string' ? p : p.value)).join('')}`);
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    await host!.sync();
  };
  /** The pane's rows as text (gauges as `[label value/max]`). */
  const rows = () =>
    panes.pane.content.lines.map((l) =>
      'spans' in l ? l.spans.map((s) => s.text).join('').trimEnd() : `[${l.gauge.label} ${Math.round(l.gauge.value)}/${l.gauge.max}]`,
    );
  /** Clicks the link on `row` (0-based) whose text starts at the first cell holding `ch` after the name. */
  const click = (row: number, ch: string) => {
    const c = panes.pane.content;
    const l = c.lines[row]!;
    const text = 'spans' in l ? l.spans.map((s) => s.text).join('') : '';
    const col = text.lastIndexOf(` ${ch}`) + 1;
    const link = c.linkAt(row, col);
    if (!link) throw new Error(`no link at ${row}:${col} in ${text}`);
    panes.pane.events.onLink(link.id);
    return link;
  };
  const resize = (cols: number, rows_: number) => panes.pane.events.onResize(cols, rows_);
  /** Hires one mercenary and answers the label command; returns its name. */
  const hire = () => {
    const before = sent.length;
    recv(HIRE);
    const cmd = sent.slice(before).find((s) => s.startsWith('label mercenary '));
    if (!cmd) throw new Error(`no label command in ${sent.slice(before).join(' | ')}`);
    recv('Ok.');
    return cmd.slice('label mercenary '.length);
  };
  return { bus, engine, clock, sent, ui, uiText, texts, lib, host, panes, recv, gmcp, settle, rows, click, resize, hire };
}

describe('bundled mercenaries', () => {
  it('is listed with its header, settings and help', async () => {
    const lib = new ScriptLibrary({ factory: null, bundled: BUNDLED_SCRIPTS });
    await lib.init();
    const s = lib.get('mercenaries')!;
    expect(s).toMatchObject({ bundled: true, readonly: true, problems: [], loadProblem: null, enabled: false });
    expect(s.header.api).toBe(1);
    expect(s.header.aliases.map((a) => a.name)).toEqual(['merc']);
    expect(s.settings).toEqual({ autopay: false, group: true, minutes: 25, warn: 5 });
    expect(s.header.help.join('\n')).toMatch(/taps you on the shoulder/);
  });

  it('opens a pane on the right with the empty state and an autopay toggle', async () => {
    const t = await setup();
    expect(t.host.isRunning('mercenaries')).toBe(true);
    expect(t.panes.pane.spec).toEqual({ id: 'mercenaries/main', place: { dock: 'right', rows: 9, cols: 36 } });
    expect(t.panes.pane.content.title).toBe('Mercenaries');
    expect(t.rows()).toEqual([' Autopay [off]', '', ' No mercenaries hired.', ' Hire one: give 10 silver mercenary']);
    const link = t.click(0, '[off]');
    expect(link.hint).toMatch(/Autopay is off/);
    await t.settle();
    t.clock.advance(200);
    expect(t.lib.settingsOf('mercenaries').autopay).toBe(true);
    expect(t.rows()[0]).toBe(' Autopay [on]');
    expect(t.lib.get('mercenaries')!.lastError).toBeNull();
  });

  it('a hire labels the mercenary, groups it once labelled, and shows a full contract', async () => {
    const t = await setup();
    t.recv(...NOISE);
    expect(t.sent).toEqual([]);
    t.recv(HIRE);
    const name = t.sent[0]!.replace('label mercenary ', '');
    expect(name).toMatch(/^[A-Z][a-z]+$/);
    expect(name.length).toBeLessThanOrEqual(8);
    expect(t.sent).toEqual([`label mercenary ${name}`]);
    t.recv('Ok.');
    expect(t.sent).toEqual([`label mercenary ${name}`, `group ${name}`]);
    t.recv('Ok.'); // a later, unrelated Ok. groups nothing
    expect(t.sent).toHaveLength(2);
    expect(t.uiText()).toContain(`MERC: ${name} hired for 25 min.`);

    const rows = t.rows();
    expect(rows[0]).toMatch(/^ Autopay \[off\] +1 hired$/);
    expect(rows[1]).toMatch(new RegExp(`^ ${name} +○ away +\\$ a f s$`));
    expect(rows[1]).toHaveLength(35);
    expect(rows[2]).toBe('[25:00 left 1500/1500]');

    // GMCP: it is in the room, under its label; with Char.Name the orders to protect you appear.
    t.gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta the Orc' });
    t.gmcp('Group.Add', { id: 7, type: 'npc', name: 'a citizen mercenary', label: name, hp: 140, maxhp: 140 });
    t.clock.advance(1);
    expect(t.rows()[1]).toMatch(new RegExp(`^ ${name} +● here +\\$ a r p f s$`));
    t.gmcp('Group.Remove', 7);
    t.clock.advance(1);
    expect(t.rows()[1]).toMatch(/○ away/);
    expect(t.lib.get('mercenaries')!.lastError).toBeNull();
  });

  it('the time runs down; the gauge shifts from green to red; a warning before the end', async () => {
    const t = await setup();
    const name = t.hire();
    const gauge = () => {
      const l = t.panes.pane.content.lines[2]!;
      if (!('gauge' in l)) throw new Error('not a gauge');
      return l.gauge;
    };
    const green = gauge().color;
    t.clock.advance(10 * 60_000);
    expect(t.rows()[2]).toBe('[15:00 left 900/1500]');
    expect(gauge().color).toBe(green);
    t.clock.advance(9 * 60_000 + 30_000);
    expect(t.rows()[2]).toBe('[5:30 left 330/1500]');
    expect(gauge().color).not.toBe(green);
    expect(t.uiText().filter((x) => x.includes('contract ends'))).toEqual([]);
    t.clock.advance(31_000);
    expect(t.uiText()).toContain(`MERC: ${name}'s contract ends in 5 min.`);
    t.clock.advance(4 * 60_000 + 50_000);
    const late = gauge().color;
    expect(late).not.toBe(green);
    expect(t.rows()[2]).toBe('[0:09 left 9/1500]');
  });

  it('a tap makes pay due; $ pays; the thanks renews the contract', async () => {
    const t = await setup();
    const name = t.hire();
    t.clock.advance(24 * 60_000);
    t.recv(tap(name));
    expect(t.uiText().at(-1)).toBe(`MERC: ${name} asks for pay: 10 silver within a minute (click $ or merc pay).`);
    expect(t.rows()[2]).toBe('[PAY DUE 1:00 60/60]');
    t.clock.advance(20_000);
    expect(t.rows()[2]).toBe('[PAY DUE 0:40 40/60]');

    const before = t.sent.length;
    const link = t.click(1, '$');
    expect(link.hint).toBe(`Pay ${name} 10 silver now:\ngive 10 silver ${name}`);
    expect(t.sent.slice(before)).toEqual([`give 10 silver ${name}`]);
    t.recv(thanks(name));
    expect(t.uiText().at(-1)).toBe(`MERC: ${name} is paid for 25 more min.`);
    expect(t.rows()[2]).toBe('[25:00 left 1500/1500]');
    t.engine.input('merc list');
    expect(t.texts().at(-1)).toMatch(new RegExp(`^MERC ${name} +away  25:00 left  paid 20 silver$`));
  });

  it('autopay pays on the tap, once per tap', async () => {
    const t = await setup();
    const name = t.hire();
    t.engine.input('merc autopay on');
    await t.settle();
    expect(t.lib.settingsOf('mercenaries').autopay).toBe(true);
    const before = t.sent.length;
    t.recv(tap(name), tap(name));
    expect(t.sent.slice(before)).toEqual([`give 10 silver ${name}`]);
    expect(t.uiText().at(-1)).toBe(`MERC: ${name} asks for pay; paying 10 silver.`);
    t.recv(thanks(name));
    t.clock.advance(25 * 60_000);
    t.recv(tap(name));
    expect(t.sent.slice(before)).toEqual([`give 10 silver ${name}`, `give 10 silver ${name}`]);
  });

  it('the orders send order <label> …; tooltips explain them', async () => {
    const t = await setup();
    t.gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta the Orc' });
    const name = t.hire();
    const before = t.sent.length;
    const hints = ['a', 'r', 'p', 'f', 's'].map((ch) => t.click(1, ch).hint);
    expect(t.sent.slice(before)).toEqual([
      `order ${name} assist`,
      `order ${name} rescue Rasta`,
      `order ${name} protect Rasta`,
      `order ${name} flee`,
      `order ${name} stand`,
    ]);
    expect(hints[0]).toBe(`Assist: ${name} joins your fight\norder ${name} assist`);
    expect(hints[1]).toMatch(/^Rescue: /);
  });

  it('fits the width: fewer orders on a narrow pane, more room on a wide one', async () => {
    const t = await setup();
    t.gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta the Orc' });
    const name = t.hire();
    t.resize(22, 9);
    expect(t.rows()[1]).toMatch(new RegExp(`^ ${name} +○ away +\\$ a$`));
    expect(t.rows()[1]!.length).toBeLessThanOrEqual(22);
    t.resize(16, 9);
    expect(t.rows()[1]).toBe(` ${name.padEnd(8)} ○ away`);
    t.resize(50, 9);
    expect(t.rows()[1]).toMatch(/\$ a r p f s$/);
    expect(t.rows()[1]).toHaveLength(49);
    expect(t.rows()[0]).toMatch(/^ Autopay \[off\] {28}1 hired$/);
  });

  it('two mercenaries: two rows each, sorted by name; leave and death remove them', async () => {
    const t = await setup();
    const a = t.hire();
    const b = t.hire();
    expect(a).not.toBe(b);
    const [first, second] = [a, b].sort();
    const rows = t.rows();
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatch(/2 hired$/);
    expect(rows[1]!.startsWith(` ${first}`)).toBe(true);
    expect(rows[3]!.startsWith(` ${second}`)).toBe(true);
    t.recv(leaves(a));
    expect(t.uiText().at(-1)).toBe(`MERC: ${a} has left you.`);
    expect(t.rows()).toHaveLength(3);
    t.recv(dead(b));
    expect(t.uiText().at(-1)).toBe(`MERC: ${b} is dead.`);
    expect(t.rows()[2]).toBe(' No mercenaries hired.');
  });

  it('an unpaid mercenary is dropped after the grace; a silent one after its contract', async () => {
    const t = await setup();
    const a = t.hire();
    t.clock.advance(24 * 60_000);
    t.recv(tap(a));
    t.clock.advance(60_000 + 89_000);
    expect(t.rows()[2]).toBe('[PAY DUE 0:00 0/60]');
    t.clock.advance(2000);
    expect(t.uiText().at(-1)).toBe(`MERC: ${a} was not paid and is gone.`);
    const b = t.hire();
    t.clock.advance(25 * 60_000 + 92_000);
    expect(t.uiText().at(-1)).toBe(`MERC: ${b} has ended its contract.`);
    expect(t.rows()[2]).toBe(' No mercenaries hired.');
  });

  it('a second hire in the same room relabels the first: the label is put back', async () => {
    const t = await setup();
    const a = t.hire();
    const before = t.sent.length;
    t.recv(HIRE);
    const b = t.sent[before]!.replace('label mercenary ', '');
    t.recv(`Ok. Replaced label "${a.toLowerCase()}".`);
    expect(t.sent.slice(before)).toEqual([`label mercenary ${b}`, `label ${b} ${a}`]);
    expect(t.uiText().at(-1)).toMatch(/Label the new one with: merc label 2\.mercenary$/);
    expect(t.rows()[0]).toMatch(/1 hired$/);
    // The player labels the new one by hand.
    t.engine.input('merc label 2.mercenary');
    const c = t.sent.at(-1)!.split(' ')[2]!;
    expect(t.sent.at(-1)).toBe(`label 2.mercenary ${c}`);
    t.recv('Ok.');
    expect(t.sent.at(-1)).toBe(`group ${c}`);
    expect(t.rows()[0]).toMatch(/2 hired$/);
  });

  it('keeps the contracts over a reload', async () => {
    const t = await setup();
    const name = t.hire();
    t.clock.advance(5 * 60_000);
    await t.host.command('script', ['reload', 'mercenaries']);
    await t.settle();
    expect(t.host.isRunning('mercenaries')).toBe(true);
    expect(t.rows()[1]!.startsWith(` ${name}`)).toBe(true);
    expect(t.rows()[2]).toBe('[20:00 left 1200/1500]');
    t.clock.advance(1000);
    expect(t.rows()[2]).toBe('[19:59 left 1199/1500]');
    expect(t.lib.get('mercenaries')!.lastError).toBeNull();
  });

  it('merc toggles the pane; merc pay, forget and help', async () => {
    const t = await setup();
    t.engine.input('merc');
    expect(t.panes.pane.view.on).toBe(false);
    t.engine.input('merc');
    expect(t.panes.pane.view.on).toBe(true);
    const name = t.hire();
    t.engine.input('merc pay');
    expect(t.texts().at(-1)).toBe('MERC No mercenary asks for pay. merc pay <name> pays one anyway.');
    t.engine.input(`merc pay ${name.toLowerCase()}`);
    expect(t.sent.at(-1)).toBe(`give 10 silver ${name}`);
    t.recv(tap(name));
    t.engine.input('merc pay');
    expect(t.sent.at(-1)).toBe(`give 10 silver ${name}`);
    t.engine.input(`merc forget ${name}`);
    expect(t.uiText().at(-1)).toBe(`MERC: ${name} is no longer tracked.`);
    t.engine.input('merc what');
    expect(t.texts().at(-1)).toMatch(/^MERC merc, merc autopay/);
    t.engine.input('mercy');
    expect(t.sent.at(-1)).toBe('mercy');
    expect(t.lib.get('mercenaries')!.lastError).toBeNull();
  });

  it('follows the minutes and group settings', async () => {
    const t = await setup();
    expect(await t.lib.setSetting('mercenaries', 'minutes', '30')).toMatchObject({ ok: true });
    expect(await t.lib.setSetting('mercenaries', 'group', 'off')).toMatchObject({ ok: true });
    await t.host.sync();
    const name = t.hire();
    expect(t.sent).toEqual([`label mercenary ${name}`]);
    expect(t.rows()[2]).toBe('[30:00 left 1800/1800]');
  });
});
