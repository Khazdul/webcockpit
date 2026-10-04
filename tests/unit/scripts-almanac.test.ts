// The bundled almanac script (src/scripts/bundled/almanac.lua, stage 18
// part C and owner round 1), run in the real script host with the real
// game time API, a fake pane surface and fake time: the three tabs in MUME
// time, the event editor, reminders, the condition text (the advanced
// path), add / export / import.

import { afterEach, describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { BusEvents, UiMessage } from '../../src/core/types';
import { momentSeconds } from '../../src/gmcp/clock';
import { CLOCK_KEY, GameState } from '../../src/gmcp/state';
import { loadLuaRuntime } from '../../src/lua';
import type { PaneContent } from '../../src/panes/script-content';
import type { ScriptPaneEvents, ScriptPaneSpec, ScriptPaneSurface, ScriptPaneView } from '../../src/panes/script-surface';
import { FakeScheduler, ScriptEngine } from '../../src/script/engine';
import { resetScriptKeys } from '../../src/script/script-keys';
import { ScriptLibrary } from '../../src/scripts';
import { BUNDLED_SCRIPTS } from '../../src/scripts/bundled';
import { ScriptHost } from '../../src/scripts/host';

/** 19 Wedmath 2855, 12:00 is unix NOW (summer, the day after the logged moonset). */
const NOW = 1_791_000_000;
const EPOCH = NOW - momentSeconds(2855, 7, 19, 12, 0);

const hosts: ScriptHost[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.dispose();
  resetScriptKeys();
});

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}

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
    return { cols: 50, rows: 27 };
  }
  close(): void {
    this.closed = true;
  }
  focused: Array<[number, boolean]> = [];
  focusField(id: number, select: boolean): void {
    this.focused.push([id, select]);
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

function rowText(c: PaneContent, r: number): string {
  const l = c.lines[r];
  if (!l) return '';
  return 'spans' in l ? l.spans.map((s) => s.text).join('') : '';
}

async function setup(opts: { clock?: 'unset' | 'minute'; store?: Record<string, unknown> } = {}) {
  const bus = new Bus();
  const sched = new FakeScheduler();
  const now = () => NOW + sched.now() / 1000;
  const sent: string[] = [];
  const ui: UiMessage[] = [];
  const shown: BusEvents['text.display'][] = [];
  let host: ScriptHost | null = null;
  const engine = new ScriptEngine({
    send: (t) => sent.push(t),
    message: () => {},
    scheduler: sched,
    scriptCommand: (n, a) => host!.command(n, a),
  });
  engine.attach(bus);
  const storage = new MemStorage();
  if (opts.clock !== 'unset') {
    storage.setItem(CLOCK_KEY, JSON.stringify({ epoch: EPOCH, precision: 'minute', lastSync: NOW, reason: 'test' }));
  }
  const game = new GameState({ now: () => now() * 1000, storage: storage as unknown as Storage });
  game.attach(bus);
  bus.on('text.display', (d) => shown.push(d));
  bus.on('ui.message', (m) => ui.push(m));
  const lib = new ScriptLibrary({ factory: null, bundled: BUNDLED_SCRIPTS });
  await lib.init();
  for (const [k, v] of Object.entries(opts.store ?? {})) lib.storeSet('almanac', k, v as never);
  await lib.setEnabled('almanac', true);
  const panes = new FakeSurface();
  // The host's own timer (sysGameTimeEvent), run by advance() on fake time.
  const timers: Array<{ fn: () => void; at: number; live: boolean }> = [];
  host = new ScriptHost({
    engine,
    bus,
    library: lib,
    game,
    send: (t) => sent.push(t),
    print: () => {},
    message: () => {},
    loadRuntime: () => loadLuaRuntime(),
    storage: null,
    epoch: now,
    panes,
    setTimer: (fn, ms) => {
      const h = { fn, at: sched.now() + ms, live: true };
      timers.push(h);
      return h;
    },
    clearTimer: (h) => {
      (h as { live: boolean }).live = false;
    },
  });
  hosts.push(host);
  await host.start();
  const c = () => panes.pane.content;
  const editor = () => panes.opened.find((o) => o.spec.id === 'almanac/~edit' && !o.view.closed) ?? null;
  const ed = () => editor()!.content;
  const fieldAt = (con: PaneContent, row: number) => con.fields.find((x) => x.row === row)!;
  const linkClick = (o: { content: PaneContent; events: ScriptPaneEvents }, r: number, text: string) => {
    const s = rowText(o.content, r);
    const col = s.indexOf(text);
    const link = col < 0 ? null : o.content.linkAt(r, col);
    if (!link) throw new Error(`no link at "${text}" in row ${r}: "${s}"`);
    o.events.onLink(link.id);
    return link;
  };
  const t = {
    bus,
    engine,
    sched,
    game,
    host,
    lib,
    panes,
    sent,
    ui,
    input: (cmd: string) => engine.input(cmd),
    /** Moves fake time on by `ms`, running the host's and the scripts' timers in order. */
    advance: (ms: number) => {
      const end = sched.now() + ms;
      for (;;) {
        const due = timers.filter((x) => x.live && x.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        if (due.at > sched.now()) sched.advance(due.at - sched.now());
        due.live = false;
        due.fn();
      }
      if (end > sched.now()) sched.advance(end - sched.now());
    },
    texts: () => shown.map((d) => d.line.text),
    lastText: () => shown.at(-1)?.line.text ?? '',
    uiText: () => ui.map((m) => `${m.kind === 'event' ? m.name : ''}: ${m.parts.map((p) => (typeof p === 'string' ? p : p.value)).join('')}`),
    errors: () => ui.filter((m) => m.kind === 'error').map((m) => m.parts.map((p) => (typeof p === 'string' ? p : p.value)).join('')),
    rows: () => c().lines.map((_, i) => rowText(c(), i).trimEnd()),
    /** Clicks the main pane's link on row `r` (0-based) at the first cell of `text`. */
    click: (r: number, text: string) => linkClick(panes.pane, r, text),
    /** The row (0-based) whose text contains `text`, or -1. */
    find: (text: string) => c().lines.findIndex((_, i) => rowText(c(), i).includes(text)),
    editor,
    edRows: () => ed().lines.map((_, i) => rowText(ed(), i).trimEnd()),
    edClick: (r: number, text: string) => linkClick(editor()!, r, text),
    edType: (row: number, text: string) => editor()!.events.onField!(fieldAt(ed(), row).id, { type: 'change', text }),
    edEnter: (row: number) => editor()!.events.onField!(fieldAt(ed(), row).id, { type: 'submit', text: fieldAt(ed(), row).value }),
    edEsc: (row: number) => editor()!.events.onField!(fieldAt(ed(), row).id, { type: 'cancel' }),
  };
  return t;
}

type T = Awaited<ReturnType<typeof setup>>;

/** What `almanac find <cond>` says, without the ALMANAC tag. */
async function find(t: T, cond: string): Promise<string> {
  t.input(`almanac find ${cond}`);
  return t.lastText().replace(/^ALMANAC /, '');
}

// The editor's rows (0-based).
const ED = { name: 0, place: 1, note: 2, season: 4, month: 5, time: 9, hours: 10, moon: 11, waxing: 12, waning: 13, sky: 14,
  moment: 15, icon: 17, colour: 19, said: 21, buttons: 24 };

describe('bundled almanac', () => {
  it('is listed with its header, alias, setting and help', async () => {
    const lib = new ScriptLibrary({ factory: null, bundled: BUNDLED_SCRIPTS });
    await lib.init();
    const s = lib.get('almanac')!;
    expect(s).toMatchObject({ bundled: true, readonly: true, problems: [], loadProblem: null, enabled: false });
    expect(s.header.aliases.map((a) => a.name)).toEqual(['almanac']);
    expect(s.settings).toEqual({ remind: 2 });
    expect(s.header.settings[0]!.label).toMatch(/Game hours before an event/);
    expect(s.header.help.join('\n')).toMatch(/first draft/);
    expect(s.header.help.join('\n')).toMatch(/event editor/);
  });

  it('only uses glyphs of one UTF-16 unit (BMP)', () => {
    const src = BUNDLED_SCRIPTS.find((b) => b.name === 'almanac')!.source;
    for (const ch of src) expect(ch.length, `U+${ch.codePointAt(0)!.toString(16)}`).toBe(1);
  });

  it('says how to sync while the clock is unset, and fills in after a time line', async () => {
    const t = await setup({ clock: 'unset' });
    expect(t.panes.pane.spec).toMatchObject({ id: 'almanac/main', place: { dock: 'right', lane: 'own', rows: 27, cols: 50 } });
    expect(t.panes.pane.content.title).toBe('Almanac');
    expect(t.rows()[0]).toMatch(/^ {2}NOW {3}PLAN {3}LORE/);
    expect(t.rows().join('\n')).toMatch(/does not know the hour/);
    expect(t.rows().join('\n')).toMatch(/Type time in the game/);
    t.game.timeLine('12 pm on Sterday, the 19th of Wedmath, year 2855 of the Third Age.');
    expect(t.rows()[2]).toContain('19 Wedmath 2855');
    expect(t.rows().join('\n')).toContain('COMING UP');
    expect(t.errors()).toEqual([]);
  });

  it('NOW: date, game hour, moon, bands and COMING UP, all in MUME time', async () => {
    const t = await setup();
    const rows = t.rows();
    expect(rows[0]).toBe('  NOW   PLAN   LORE');
    expect(rows[2]).toMatch(/19 Wedmath 2855$/);
    expect(rows[3]).toMatch(/Urui · Summer · \w+day$/);
    expect(rows[5]).toMatch(/ {3}12 pm ☼ day$/);
    expect(rows[7]).toMatch(/☽ Waxing crescent +37% lit$/);
    expect(rows[8]).toMatch(/full in 8d 12h +(rises|sets) in \d+(d \d+)?h$/);
    expect(rows[10]).toMatch(/^ DAYLIGHT +dawn 04 · dusk 22 · 18h light$/);
    expect(rows[12]!.indexOf('▲')).toBe(1 + 12 * 2);
    expect(rows[13]).toBe(' ☾ Sunset 10 pm  in 10h');
    expect(rows[15]).toBe(' YEAR                           Autumn in 41d 12h');
    expect(rows[16]).toBe(' Aft Sol Ret Ast Thr For Aft Wed Hal Win Blo For');
    expect(rows[19]).toMatch(/^ COMING UP +click = remind$/);
    const list = rows.slice(20);
    expect(list).toHaveLength(15);
    expect(t.find('Sundeath')).toBe(-1);
    expect(list.find((r) => r.includes('Black Ice open'))).toMatch(/now$/);
    expect(list.find((r) => r.includes('Spirit Knight door'))).toMatch(/no winter 00–… +in 12h$/);
    expect(list.find((r) => r.includes('Ingrove warg pack'))).toMatch(/in 156d 4h$/);
    // No seconds anywhere, and nothing ticks within a game hour.
    expect(rows.join('\n')).not.toMatch(/\d+s\b|\d+m \d/);
    t.advance(30_000);
    expect(t.rows()).toEqual(rows);
    // The next game hour (a real minute) redraws.
    t.advance(31_000);
    expect(t.rows()[5]).toMatch(/ {3}1 pm ☼ day$/);
    expect(t.rows().find((r) => r.includes('Spirit Knight door'))).toMatch(/in 11h$/);
    expect(t.errors()).toEqual([]);
  });

  it('no work while the pane is off; shown again it is up to date', async () => {
    const t = await setup();
    t.input('almanac');
    expect(t.panes.pane.view.on).toBe(false);
    const rows = t.rows();
    t.advance(90_000);
    expect(t.rows()).toEqual(rows);
    t.input('almanac');
    expect(t.panes.pane.view.on).toBe(true);
    expect(t.rows()[5]).toMatch(/ {3}1 pm ☼ day$/);
  });

  it('a click on an event turns its reminder on; it comes N game hours before', async () => {
    const t = await setup();
    const r = t.find('Overseer slab');
    const link = t.click(r, 'Overseer slab');
    expect(link.hint).toMatch(/Click: remind me 2 game hours before/);
    expect(t.lastText()).toBe('ALMANAC Reminder 2 game hours before Overseer slab.');
    expect(t.rows()[r]).toMatch(/^ ♪ Overseer slab/);
    // Sunrise is at 4 am the next game day: 16 game hours away; the reminder 2 game hours before.
    t.advance((16 - 2) * 60_000 - 1000);
    expect(t.uiText().filter((x) => x.startsWith('ALMANAC:'))).toEqual([]);
    t.advance(2000);
    expect(t.uiText().filter((x) => x.startsWith('ALMANAC:'))).toEqual([
      expect.stringMatching(/^ALMANAC: Overseer slab in 2h \(\d\d:\d\d local time\), Wyrdda ford/),
    ]);
    t.click(t.find('Overseer slab'), 'Overseer slab');
    expect(t.lastText()).toBe('ALMANAC No reminder for Overseer slab.');
  });

  it('PLAN: a month grid, Monday first; ◂ ▸ and the wheel change the month; a click shows a day', async () => {
    const t = await setup();
    t.click(0, 'PLAN');
    const rows = t.rows();
    const d = new Date(NOW * 1000);
    const title = `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()]} ${d.getFullYear()}`;
    expect(rows[2]).toContain(title);
    expect(rows[2]).toMatch(/^ {2}◂ /);
    expect(rows[3]).toBe('   Mo     Tu     We     Th     Fr     Sa     Su');
    expect(rows[10]).toBe(' ❄ Ingrove pack  ◆ season starts  • today');
    expect(rows.slice(4, 10).join('\n')).toContain('•');
    expect(rows[12]).toMatch(new RegExp(`^ \\w+day ${d.getDate()} `));
    expect(rows[13]).toMatch(/^ (Winter|Spring|Summer|Autumn) (all day|→ \w+ at \d\d:\d\d)$/);
    expect(rows[14]).toMatch(/^ Daylight \d+h( → \d+h)* · night \d+h( → \d+h)*$/);
    const r1 = rows.findIndex((x, i) => i >= 4 && / 1 /.test(x));
    t.click(r1, ' 1 ');
    expect(t.rows()[12]).toMatch(/^ \w+day 1 /);
    t.click(2, '▸');
    expect(t.rows()[2]).not.toContain(title);
    expect(t.panes.pane.events.onWheel!(0, -1)).toBe(true);
    expect(t.rows()[2]).toContain(title);
    let ingrove = 0;
    let starts = 0;
    for (let i = 0; i < 12; i++) {
      t.panes.pane.events.onWheel!(0, 1);
      const grid = t.rows().slice(4, 10).join('');
      ingrove += [...grid].filter((ch) => ch === '❄').length;
      starts += [...grid].filter((ch) => ch === '◆').length;
    }
    expect(starts).toBeGreaterThan(50);
    expect(ingrove).toBeGreaterThan(20);
    expect(t.errors()).toEqual([]);
  });

  it('LORE: every event with its condition and place', async () => {
    const t = await setup();
    t.click(0, 'LORE');
    const rows = t.rows();
    expect(rows[0]).toMatch(/\[\+ add\]$/);
    const dk = t.find('Dead Knight slab');
    expect(rows[dk]).toMatch(/Dead Knight slab +moonrise waxing gibbous\|full$/);
    expect(rows[dk + 1]).toBe('   Barrow by Nen-i-Sul');
    expect(t.panes.pane.content.linkAt(dk, 4)!.hint).toMatch(/Source: Faine, strategy\.txt \(Dead Knight\)/);
    expect(rows[t.find('Juniper')]).toMatch(/season unknown$/);
    expect(t.find('Sundeath')).toBe(-1);
    expect(rows.at(-1)).toMatch(/19 bundled, 0 your own/);
  });
});

describe('the event editor', () => {
  it('opens from LORE; clicks choose; it says what was chosen and when it comes; Save adds the event', async () => {
    const t = await setup();
    t.click(0, 'LORE');
    t.click(0, '[+ add]');
    const e = t.editor()!;
    expect(e.spec).toMatchObject({ id: 'almanac/~edit', temporary: { rows: 25, cols: 56 } });
    expect(e.content.title).toBe('New event');
    const rows = t.edRows();
    expect(rows.slice(0, 3).map((r) => r.trim())).toEqual(['Name', 'Place', 'Note']);
    expect(e.content.fields.map((f) => [f.row, f.col])).toEqual([[0, 9], [1, 9], [2, 9]]);
    expect(e.view.focused.at(-1)).toEqual([e.content.fields[0]!.id, false]);
    expect(rows[ED.season]).toBe(' Season   any   winter   spring   summer   autumn');
    expect(rows[ED.month]).toMatch(/^ Month    Afteryule   Solmath   Rethe +any$/);
    expect(rows[ED.month + 3]).toBe('          Winterfilth   Blotmath   Foreyule');
    expect(rows[ED.time]).toBe(' Time     any   dawn   day   dusk   night');
    expect(rows[ED.hours]).toBe(' Hours    any   from ◂ 00 ▸  to ◂ 03 ▸');
    expect(rows[ED.moon]).toBe(' Moon     any   ○ new   ● full');
    expect(rows[ED.waxing]).toBe('  waxing  ☽ crescent   ◐ quarter   ◕ gibbous');
    expect(rows[ED.waning]).toBe('  waning  ◕ gibbous   ◑ quarter   ☾ crescent');
    expect(rows[ED.sky]).toBe(' Sky      any   moon up   moon down');
    expect(rows[ED.moment]).toBe(' Moment   none   sunrise   sunset   midnight');
    expect(rows[ED.moment + 1]).toBe('          moonrise   moonset   season start');
    expect(rows[ED.icon]).toBe(' Icon     ✧  ★  ◆  ◊  ♦  ☾  ☽  ☼  ☉  ❄  ✿  ☘');
    expect(rows[ED.colour]).toBe(' Colour  [✧]  ✧   ✧   ✧   ✧   ✧   ✧   ✧');
    expect(rows[ED.said]).toBe(' Choose a season, a time of day, the moon or a moment.');
    expect(rows[ED.buttons]).toBe('  Save    Cancel');
    // A chosen chip is lit (the glow shade behind it).
    const winterLink = e.content.linkAt(ED.season, rows[ED.season]!.indexOf('winter'))!;
    expect(winterLink.hint).toBe('Toggle winter');

    t.edType(ED.name, 'Troll pack');
    t.edType(ED.place, 'Wolf Glade');
    t.edClick(ED.season, 'winter');
    t.edClick(ED.moon, '● full');
    expect(t.edRows()[ED.said]).toBe(' Winter, full moon. Next: in 156d 4h.');
    t.edClick(ED.icon, '❄');
    expect(t.edRows()[ED.colour]).toBe(' Colour  [❄]  ❄   ❄   ❄   ❄   ❄   ❄   ❄');
    t.edClick(ED.colour, ' ❄   ❄   ❄   ❄   ❄   ❄'); // the second colour (gold)
    expect(t.edRows()[ED.colour]).toBe(' Colour   ❄  [❄]  ❄   ❄   ❄   ❄   ❄   ❄');
    // Toggling a chip twice takes it back; "any" clears the kind.
    t.edClick(ED.season, 'spring');
    expect(t.edRows()[ED.said]).toMatch(/^ Winter or spring, full moon\./);
    t.edClick(ED.season, 'spring');
    t.edClick(ED.time, 'night');
    expect(t.edRows()[ED.said]).toMatch(/^ Winter, at night, full moon\. Next: /);
    t.edClick(ED.time, 'any');
    t.edClick(ED.buttons, 'Save');
    expect(t.editor()).toBeNull();
    expect(t.lastText()).toBe('ALMANAC Added Troll pack: Winter, full moon.');
    const r = t.find('Troll pack');
    expect(t.rows()[r]).toMatch(/^ ❄ Troll pack +full winter$/);
    expect(t.rows()[r + 1]).toMatch(/^ {3}Wolf Glade +edit ✖$/);
    expect(t.rows().at(-1)).toMatch(/19 bundled, 1 your own/);
    // On NOW too.
    t.click(0, 'NOW');
    expect(t.find('Troll pack')).toBeGreaterThan(19);
    expect(t.errors()).toEqual([]);
  });

  it('edits an event of yours: the choices come back; Save replaces it, its reminder kept', async () => {
    const t = await setup();
    t.input('almanac add Bridge = night not winter @ Bree');
    t.input('almanac remind Bridge');
    t.input('almanac lore');
    const r = t.find('Bridge');
    t.click(r + 1, 'edit');
    expect(t.editor()!.content.title).toBe('Edit: Bridge');
    expect(t.editor()!.content.fields.map((f) => f.value)).toEqual(['Bridge', 'Bree', '']);
    // not winter is the other three seasons.
    expect(t.edRows()[ED.said]).toMatch(/^ Spring, summer or autumn, at night\. Next: /);
    t.edType(ED.name, 'Troll bridge');
    t.edClick(ED.hours, '▸');
    expect(t.edRows()[ED.hours]).toBe(' Hours    any   from ◂ 01 ▸  to ◂ 03 ▸');
    t.edEnter(ED.name);
    expect(t.lastText()).toBe('ALMANAC Saved Troll bridge: Spring, summer or autumn, at night, from 01:00 to 03:00.');
    expect(t.find('Bridge')).toBe(-1);
    expect(t.rows()[t.find('Troll bridge')]).toContain('spring|summer|autumn hours 1-');
    t.click(0, 'NOW');
    expect(t.rows()[t.find('Troll bridge')]).toMatch(/^ ♪ Troll bridge/);
    // almanac edit opens it too; Esc closes without saving.
    t.input('almanac edit troll bridge');
    t.edType(ED.name, 'Nothing');
    t.edEsc(ED.name);
    expect(t.editor()).toBeNull();
    expect(t.find('Troll bridge')).toBeGreaterThan(0);
    t.input('almanac edit Black Ice open');
    expect(t.lastText()).toBe('ALMANAC Black Ice open is bundled: only your own events can be changed.');
    // Delete from LORE.
    t.input('almanac lore');
    t.click(t.find('Troll bridge') + 1, '✖');
    expect(t.find('Troll bridge')).toBe(-1);
  });

  it('says what is missing: a name, a choice, a free name, two different hours', async () => {
    const t = await setup();
    t.input('almanac add');
    t.edClick(ED.buttons, 'Save');
    expect(t.edRows()[ED.buttons - 1]).toBe(' Give the event a name.');
    t.edType(ED.name, 'Black Ice open');
    t.edClick(ED.buttons, 'Save');
    expect(t.edRows()[ED.buttons - 1]).toBe(' Choose when: a season, a time, the moon or a moment.');
    t.edClick(ED.moment, 'sunrise');
    t.edClick(ED.buttons, 'Save');
    expect(t.edRows()[ED.buttons - 1]).toBe(' "Black Ice open" is already in the list.');
    t.edType(ED.name, 'Dawn walk');
    t.edClick(ED.hours, '◂ 03'.slice(0, 1)); // from ◂: 00 → 23
    expect(t.edRows()[ED.hours]).toBe(' Hours    any   from ◂ 23 ▸  to ◂ 03 ▸');
    t.edClick(ED.buttons, 'Cancel');
    expect(t.editor()).toBeNull();
    expect(t.find('Dawn walk')).toBe(-1);
  });
});

describe('almanac condition text (the advanced path)', () => {
  it('reads the short syntax into a gameTimeFind condition (shown in its canonical form)', async () => {
    const t = await setup();
    const cases: Array<[string, string]> = [
      ['winter full', 'full winter'],
      ['full moon in winter', 'full winter'],
      ['moonrise waxing gibbous|full', 'moonrise waxing gibbous|full'],
      ['moonrise while waxing gibbous or full', 'moonrise waxing gibbous|full'],
      ['hours 0-3 not winter', 'not winter hours 0-3'],
      ['00:00–03:00 no winter', 'not winter hours 0-3'],
      ['hours 22 - 2', 'hours 22-2'],
      ['hour 5', 'hours 5-6'],
      ['night', 'night'],
      ['sunrise', 'sunrise'],
      ['at dusk', 'sunset'],
      ['dusk', 'dusk'],
      ['daylight', 'dawn|day'],
      ['dark', 'dusk|night'],
      ['autumn|winter', 'autumn|winter'],
      ['not winter|spring', 'not winter|spring'],
      ['Afteryule or Gwaeron', 'Afteryule|Rethe'],
      ['night moon up', 'moon up night'],
      ['moonless night', 'moon down night'],
      ['waxing', 'waxing crescent|first quarter|waxing gibbous'],
      ['last quarter', 'third quarter'],
      ['season start', 'season start'],
      ['midnight not winter', 'midnight not winter'],
      ['WINTER  FULL', 'full winter'],
    ];
    for (const [input, want] of cases) {
      expect(await find(t, input), input).toMatch(new RegExp(`^${want.replace(/[|]/g, '\\|')}: `));
    }
    expect(t.errors()).toEqual([]);
  });

  it('gives clear errors', async () => {
    const t = await setup();
    const cases: Array<[string, RegExp]> = [
      ['', /^say when: seasons/],
      ['in the', /^say when/],
      ['wintr', /^unknown word "wintr": use seasons/],
      ['sunrise moonrise', /^one moment per event: sunrise and moonrise both given$/],
      ['winter or night', /^"or" joins choices of one kind \(seasons\), not seasons and day parts$/],
      ['or winter', /^"or" needs a choice before it$/],
      ['winter or', /^"or" needs a choice after it$/],
      ['not night', /^"not" works with seasons: not winter$/],
      ['night not', /^"not" needs a season after it/],
      ['hours 3-3', /^hours: from and to must differ/],
      ['hours 5-30', /^hours: 0 to 24/],
      ['hours 1-2 hours 3-4', /^one hour range per event$/],
      ['moon up moon down', /^moon up and moon down both given$/],
      ['winter not winter', /^winter and not winter both given$/],
    ];
    for (const [input, want] of cases) expect(await find(t, input), input).toMatch(want);
    expect(t.errors()).toEqual([]);
  });

  it('find tells when a condition comes next, in game time', async () => {
    const t = await setup();
    expect(await find(t, 'day')).toBe('day: now, for 10h.');
    expect(await find(t, 'sunset')).toBe('sunset: in 10h (19 Wedmath, 10 pm).');
    expect(await find(t, 'winter')).toBe('winter: in 131d 12h (1 Afteryule, 12 am), for 90d.');
  });
});

describe('almanac add, export and import', () => {
  it('almanac add with text takes a name, a condition, a place and a note; without, it opens the editor', async () => {
    const t = await setup();
    t.input('almanac add Bree market = day not winter @ Bree // buy rope');
    expect(t.lastText()).toBe('ALMANAC Added Bree market: Not in winter, by day. @ Bree');
    t.input('almanac add Bree market = night');
    expect(t.lastText()).toBe('ALMANAC "Bree market" is already in the list');
    t.input('almanac add Nothing = blue moon');
    expect(t.lastText()).toMatch(/^ALMANAC unknown word "blue"/);
    expect(t.editor()).toBeNull();
    t.input('almanac add');
    expect(t.editor()).not.toBeNull();
    t.input('almanac remove Black Ice open');
    expect(t.lastText()).toBe('ALMANAC Black Ice open is bundled: only your own events can be removed.');
    t.input('almanac remove bree market');
    expect(t.lastText()).toBe('ALMANAC Removed Bree market.');
  });

  it('keeps events stored before round 1 (no icon) and gives them the default icon', async () => {
    const t = await setup({ store: { events: [{ name: 'Old one', when: 'night', where: 'Bree', note: '' }] } });
    t.input('almanac lore');
    expect(t.rows()[t.find('Old one')]).toMatch(/^ ✧ Old one +night$/);
  });

  it('export and import round-trip, with escapes, icon and colour; import adds only what is missing', async () => {
    const t = await setup();
    t.input('almanac export');
    expect(t.lastText()).toMatch(/no events of your own/);
    // The editor takes any text; the alias line would split at ; (the input line's separator).
    t.input('almanac add');
    t.edType(ED.name, 'Troll bridge');
    t.edType(ED.place, 'Bree; west gate');
    t.edType(ED.note, 'say {open} $now & 100% ~ ^ = \\ #x');
    t.edClick(ED.time, 'night');
    t.edClick(ED.season, 'spring');
    t.edClick(ED.icon + 1, '⚓');
    t.edClick(ED.colour, ' ⚓   ⚓   ⚓   ⚓   ⚓   ⚓');
    t.edClick(ED.buttons, 'Save');
    t.input('almanac add Spring dawn = sunrise spring');
    t.input('almanac add Full = moonrise waxing gibbous|full @ Barrow');
    t.input('almanac export');
    const line = t.lastText();
    expect(line).toMatch(/^ALM1:/);
    expect(line).not.toMatch(/[;$&{}\\%]/);
    expect(line.split('~')).toHaveLength(3);
    hosts.splice(0).forEach((h) => h.dispose());
    const u = await setup();
    u.input(`almanac import ${line}`);
    expect(u.lastText()).toBe('ALMANAC Imported 3 events, 0 already there.');
    u.input('almanac export');
    expect(u.lastText()).toBe(line);
    u.input('almanac lore');
    const r = u.find('Troll bridge');
    expect(u.rows()[r]).toMatch(/^ ⚓ Troll bridge +spring night$/);
    expect(u.rows()[r + 1]).toMatch(/^ {3}Bree; west gate/);
    expect(u.panes.pane.content.linkAt(r, 4)!.hint).toMatch(/^say \{open\} \$now & 100% ~ \^ = \\ #x\n/);
    u.input(`almanac import ${line}`);
    expect(u.lastText()).toBe('ALMANAC Imported 0 events, 3 already there.');
    // A line from before round 1 (four fields) still imports.
    u.input('almanac import ALM1:A^winter~B^blue~Black Ice open^day');
    expect(u.texts().slice(-2)).toEqual(['ALMANAC Imported 1 event, 1 already there, 1 skipped.', 'ALMANAC Skipped B: unknown word "blue": use seasons (winter …), months, dawn, day, dusk, night, hours 0-3, moon phases (new … full), moon up, moon down, or one moment: sunrise, sunset, midnight, moonrise, moonset, season start']);
    u.input('almanac import ALM2:X^day');
    expect(u.lastText()).toMatch(/newer almanac \(ALM2\)/);
    u.input('almanac import hello');
    expect(u.lastText()).toMatch(/no ALM1: line found/);
    expect(u.errors()).toEqual([]);
  });
});
