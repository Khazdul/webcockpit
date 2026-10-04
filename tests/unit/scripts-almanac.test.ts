// The bundled almanac script (src/scripts/bundled/almanac.lua, stage 18
// part C), run in the real script host with the real game time API, a fake
// pane surface and fake time: the condition text parser, add / export /
// import, the three tabs, the LORE form and reminders.

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

async function setup(opts: { clock?: 'unset' | 'minute' } = {}) {
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
  await lib.setEnabled('almanac', true);
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
    storage: null,
    epoch: now,
    panes,
    setTimer: () => ({}),
    clearTimer: () => {},
  });
  hosts.push(host);
  await host.start();
  const c = () => panes.pane.content;
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
    texts: () => shown.map((d) => d.line.text),
    lastText: () => shown.at(-1)?.line.text ?? '',
    uiText: () => ui.map((m) => `${m.kind === 'event' ? m.name : ''}: ${m.parts.map((p) => (typeof p === 'string' ? p : p.value)).join('')}`),
    errors: () => ui.filter((m) => m.kind === 'error').map((m) => m.parts.map((p) => (typeof p === 'string' ? p : p.value)).join('')),
    rows: () => c().lines.map((_, i) => rowText(c(), i).trimEnd()),
    /** Clicks the link on row `r` (0-based) at the first cell of `text`. */
    click: (r: number, text: string) => {
      const s = rowText(c(), r);
      const col = s.indexOf(text);
      const link = col < 0 ? null : c().linkAt(r, col);
      if (!link) throw new Error(`no link at "${text}" in row ${r}: "${s}"`);
      panes.pane.events.onLink(link.id);
      return link;
    },
    /** The row (0-based) whose text contains `text`, or -1. */
    find: (text: string) => c().lines.findIndex((_, i) => rowText(c(), i).includes(text)),
    fields: () => c().fields,
    field: (row: number) => c().fields.find((f) => f.row === row)!,
    type: (row: number, text: string) => {
      const f = c().fields.find((x) => x.row === row)!;
      panes.pane.events.onField!(f.id, { type: 'change', text });
    },
    enter: (row: number) => {
      const f = c().fields.find((x) => x.row === row)!;
      panes.pane.events.onField!(f.id, { type: 'submit', text: f.value });
    },
  };
  return t;
}

/** What `almanac find <cond>` says, without the ALMANAC tag. */
async function find(t: Awaited<ReturnType<typeof setup>>, cond: string): Promise<string> {
  t.input(`almanac find ${cond}`);
  return t.lastText().replace(/^ALMANAC /, '');
}

describe('bundled almanac', () => {
  it('is listed with its header, alias, setting and help', async () => {
    const lib = new ScriptLibrary({ factory: null, bundled: BUNDLED_SCRIPTS });
    await lib.init();
    const s = lib.get('almanac')!;
    expect(s).toMatchObject({ bundled: true, readonly: true, problems: [], loadProblem: null, enabled: false });
    expect(s.header.aliases.map((a) => a.name)).toEqual(['almanac']);
    expect(s.settings).toEqual({ remind: 2 });
    expect(s.header.help.join('\n')).toMatch(/first draft/);
    expect(s.header.help.join('\n')).toMatch(/almanac export/);
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

  it('NOW: date, time, moon, daylight and year bands, and COMING UP with countdowns', async () => {
    const t = await setup();
    const rows = t.rows();
    expect(rows[2]).toMatch(/19 Wedmath 2855$/);
    expect(rows[3]).toMatch(/Urui · Summer · \w+day$/);
    expect(rows[5]).toMatch(/12:00 ☼ day$/);
    expect(rows[7]).toMatch(/(○|☽|◐|◕|●|◑|☾) [A-Z][a-z]+/);
    expect(rows[7]).toMatch(/\d+% lit$/);
    expect(rows[10]).toMatch(/^ DAYLIGHT +dawn 04 · dusk 22 · 18h light$/);
    // 12:00: the marker under hour 12 (2 cells an hour from column 2).
    expect(rows[12]!.indexOf('▲')).toBe(1 + 12 * 2);
    expect(rows[13]).toMatch(/^ ☾ Sunset 22:00 {2}in 10m 00s +real \d\d:\d\d$/);
    expect(rows[15]).toBe(" YEAR                           Autumn in 16h 36m");
    expect(rows[16]).toMatch(/^ Aft Sol Ret Ast Thr For Aft Wed Hal Win Blo For$/);
    expect(rows[19]).toMatch(/^ COMING UP +click = remind$/);
    // Every event with a condition, "now" ones first.
    const list = rows.slice(20);
    expect(list).toHaveLength(16);
    expect(list.find((r) => r.includes('Sundeath'))).toMatch(/now$/);
    expect(list.find((r) => r.includes('Black Ice open'))).toMatch(/now$/);
    expect(list.find((r) => r.includes('Spirit Knight door'))).toMatch(/no winter 00–03 +12m 00s$/);
    expect(list.find((r) => r.includes('Dead Knight slab'))).toMatch(/moonrise ◕\|●/);
    const firstLater = list.findIndex((r) => !r.endsWith('now'));
    expect(list.slice(firstLater).every((r) => !r.endsWith('now'))).toBe(true);
    // The countdowns tick.
    const before = list.find((r) => r.includes('Spirit Knight door'));
    // A game minute is a real second.
    t.sched.advance(61_000);
    expect(t.rows().find((r) => r.includes('Spirit Knight door'))).not.toBe(before);
    expect(t.rows()[5]).toMatch(/13:01 ☼ day$/);
    expect(t.errors()).toEqual([]);
  });

  it('no work while the pane is off: the ticker stops, and the rows stay', async () => {
    const t = await setup();
    t.input('almanac');
    expect(t.panes.pane.view.on).toBe(false);
    const rows = t.rows();
    t.sched.advance(30_000);
    expect(t.rows()).toEqual(rows);
    t.input('almanac');
    expect(t.panes.pane.view.on).toBe(true);
    expect(t.rows()[5]).toMatch(/12:30 ☼ day$/);
  });

  it('a click on an event turns its reminder on; it comes N minutes before', async () => {
    const t = await setup();
    const r = t.find('Overseer slab');
    const link = t.click(r, 'Overseer slab');
    expect(link.hint).toMatch(/Click: remind me 2 min before/);
    expect(t.lastText()).toBe('ALMANAC Reminder 2 min before Overseer slab.');
    expect(t.rows()[r]).toMatch(/^ ♪ Overseer slab/);
    // Sunrise is at 04:00 the next game day: 16 game hours (960 real seconds)
    // away; the reminder comes 2 real minutes before.
    t.sched.advance((960 - 120 - 1) * 1000);
    expect(t.uiText().filter((x) => x.startsWith('ALMANAC:'))).toEqual([]);
    t.sched.advance(2000);
    expect(t.uiText().filter((x) => x.startsWith('ALMANAC:'))).toEqual([
      expect.stringMatching(/^ALMANAC: Overseer slab in 1m 5\ds \(\d\d:\d\d local\), Wyrdda ford/),
    ]);
    // Off again.
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
    // Today's cell has the dot; the selected day is today.
    expect(rows.slice(4, 10).join('\n')).toContain('•');
    expect(rows[12]).toMatch(new RegExp(`^ \\w+day ${d.getDate()} `));
    expect(rows[13]).toMatch(/^ (Winter|Spring|Summer|Autumn) (all day|→ \w+ at \d\d:\d\d)$/);
    expect(rows[14]).toMatch(/^ Daylight \d+h( → \d+h)* · night \d+h( → \d+h)*$/);
    // A day: its details.
    const r1 = rows.findIndex((x, i) => i >= 4 && / 1 /.test(x));
    t.click(r1, ' 1 ');
    expect(t.rows()[12]).toMatch(/^ \w+day 1 /);
    // Next month by ▸, back by the wheel.
    t.click(2, '▸');
    expect(t.rows()[2]).not.toContain(title);
    expect(t.panes.pane.events.onWheel!(0, -1)).toBe(true);
    expect(t.rows()[2]).toContain(title);
    // Every day of a year: Ingrove marks and season starts come from the API.
    let ingrove = 0;
    let starts = 0;
    for (let i = 0; i < 12; i++) {
      t.panes.pane.events.onWheel!(0, 1);
      const grid = t.rows().slice(4, 10).join('');
      ingrove += [...grid].filter((ch) => ch === '❄').length;
      starts += [...grid].filter((ch) => ch === '◆').length;
    }
    // A game year is six real days: about 60 seasons a real year, a quarter of them winter.
    expect(starts).toBeGreaterThan(50);
    expect(ingrove).toBeGreaterThan(20);
    expect(t.errors()).toEqual([]);
  });

  it('LORE: every event with its condition and place; the form adds one', async () => {
    const t = await setup();
    t.click(0, 'LORE');
    let rows = t.rows();
    expect(rows[0]).toMatch(/\[\+ add\]$/);
    const dk = t.find('Dead Knight slab');
    expect(rows[dk]).toMatch(/Dead Knight slab +moonrise waxing gibbous\|full$/);
    expect(rows[dk + 1]).toBe('   Barrow by Nen-i-Sul');
    expect(t.panes.pane.content.linkAt(dk, 4)!.hint).toMatch(/Source: Faine, strategy\.txt \(Dead Knight\)/);
    expect(rows[t.find('Juniper')]).toMatch(/season unknown$/);
    expect(rows.at(-1)).toMatch(/20 bundled, 0 your own/);

    // The form.
    t.click(0, '[+ add]');
    rows = t.rows();
    expect(rows.slice(2, 6).map((r) => r.trim())).toEqual(['Name', 'When', 'Place', 'Note']);
    expect(t.fields().map((f) => f.row)).toEqual([2, 3, 4, 5]);
    expect(t.panes.pane.view.focused.at(-1)).toEqual([t.field(2).id, false]);
    t.type(2, 'Troll bridge');
    t.type(3, 'night not wintr');
    expect(t.rows()[6]).toMatch(/^ unknown word "wintr"/);
    t.type(3, 'night not winter');
    expect(t.rows()[6]).toBe(' → not winter night');
    t.type(4, 'Bree, west gate');
    // The fields stay while the status line changes.
    expect(t.fields()).toHaveLength(4);
    t.enter(4);
    expect(t.lastText()).toBe('ALMANAC Added Troll bridge: not winter night.');
    rows = t.rows();
    expect(rows[0]).toMatch(/\[\+ add\]$/);
    const tb = t.find('Troll bridge');
    expect(rows[tb]).toMatch(/✧ Troll bridge +not winter night$/);
    expect(rows[tb + 1]).toMatch(/^ {3}Bree, west gate +✖$/);
    expect(rows.at(-1)).toMatch(/20 bundled, 1 your own/);
    // On NOW too.
    t.click(0, 'NOW');
    expect(t.find('Troll bridge')).toBeGreaterThan(20);
    // Delete from LORE.
    t.click(0, 'LORE');
    t.click(t.find('Troll bridge') + 1, '✖');
    expect(t.find('Troll bridge')).toBe(-1);
    expect(t.errors()).toEqual([]);
  });

  it('the form says what is wrong: no name, a taken name, a bad condition', async () => {
    const t = await setup();
    t.input('almanac lore');
    t.click(0, '[+ add]');
    t.type(3, 'winter');
    t.enter(3);
    expect(t.rows()[6]).toBe(' give the event a name');
    t.type(2, 'Sundeath');
    t.enter(2);
    expect(t.rows()[6]).toBe(' "Sundeath" is already in the list');
    t.type(2, 'Mine');
    t.type(3, 'sunrise or moonrise');
    t.enter(3);
    expect(t.rows()[6]).toBe(' "or" does not work with moments: give one');
  });
});

describe('almanac condition text', () => {
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

  it('find tells when a condition comes next', async () => {
    const t = await setup();
    expect(await find(t, 'day')).toMatch(/^day: now, until \d\d:\d\d \(10m 00s\)\.$/);
    expect(await find(t, 'sunset')).toMatch(/^sunset: in 10m 00s, at \d\d:\d\d local \(19 Wedmath 22:00\)\.$/);
    expect(await find(t, 'winter')).toMatch(/^winter: in 2d 04h, at .* local \(1 Afteryule 00:00\) for 1d 12h\.$/);
  });
});

describe('almanac add, export and import', () => {
  it('almanac add takes a name, a condition, a place and a note', async () => {
    const t = await setup();
    t.input('almanac add Bree market = day not winter @ Bree // buy rope');
    expect(t.lastText()).toBe('ALMANAC Added Bree market: not winter day @ Bree.');
    t.input('almanac add Bree market = night');
    expect(t.lastText()).toBe('ALMANAC "Bree market" is already in the list');
    t.input('almanac add Nothing = blue moon');
    expect(t.lastText()).toMatch(/^ALMANAC unknown word "blue"/);
    t.input('almanac add no equals sign');
    expect(t.lastText()).toMatch(/^ALMANAC Usage: almanac add/);
    t.input('almanac remove Sundeath');
    expect(t.lastText()).toBe('ALMANAC Sundeath is bundled: only your own events can be removed.');
    t.input('almanac remove bree market');
    expect(t.lastText()).toBe('ALMANAC Removed Bree market.');
  });

  it('export and import round-trip, with escapes, and import adds only what is missing', async () => {
    const t = await setup();
    t.input('almanac export');
    expect(t.lastText()).toMatch(/no events of your own/);
    // The form takes any text; the alias line would split at ; (the input line's separator).
    t.input('almanac lore');
    t.click(0, '[+ add]');
    t.type(2, 'Troll bridge');
    t.type(3, 'night not winter');
    t.type(4, 'Bree; west gate');
    t.type(5, 'say {open} $now & 100% ~ ^ = \\ #x');
    t.enter(5);
    t.input('almanac add Spring dawn = sunrise spring');
    t.input('almanac add Full = moonrise waxing gibbous|full @ Barrow');
    t.input('almanac export');
    const line = t.lastText();
    expect(line).toMatch(/^ALM1:/);
    // Nothing the input line would take: no ; $ & { } \ or %.
    expect(line).not.toMatch(/[;$&{}\\%]/);
    expect(line.split('~')).toHaveLength(3);
    // Import into a fresh almanac.
    hosts.splice(0).forEach((h) => h.dispose());
    const u = await setup();
    u.input(`almanac import ${line}`);
    expect(u.lastText()).toBe('ALMANAC Imported 3 events, 0 already there.');
    u.input('almanac export');
    expect(u.lastText()).toBe(line);
    u.input('almanac lore');
    const r = u.find('Troll bridge');
    expect(u.rows()[r + 1]).toMatch(/^ {3}Bree; west gate/);
    expect(u.panes.pane.content.linkAt(r, 4)!.hint).toMatch(/^say \{open\} \$now & 100% ~ \^ = \\ #x\n/);
    // Again: all there.
    u.input(`almanac import ${line}`);
    expect(u.lastText()).toBe('ALMANAC Imported 0 events, 3 already there.');
    // Bad rows are reported, good ones added.
    u.input('almanac import ALM1:A^winter~B^blue~Sundeath^day');
    expect(u.texts().slice(-2)).toEqual(['ALMANAC Imported 1 event, 1 already there, 1 skipped.', 'ALMANAC Skipped B: unknown word "blue": use seasons (winter …), months, dawn, day, dusk, night, hours 0-3, moon phases (new … full), moon up, moon down, or one moment: sunrise, sunset, midnight, moonrise, moonset, season start']);
    u.input('almanac import ALM2:X^day');
    expect(u.lastText()).toMatch(/newer almanac \(ALM2\)/);
    u.input('almanac import hello');
    expect(u.lastText()).toMatch(/no ALM1: line found/);
    expect(u.errors()).toEqual([]);
  });
});
