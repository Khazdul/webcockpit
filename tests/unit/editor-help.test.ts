// The HELP manual (src/editor/help.ts, ADR 0037) against the real engine:
// every example loads or runs without a message, examples with a `check`
// do exactly what they claim, and no command the engine runs is missing.
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { Line } from '../../src/core/types';
import {
  CODE_INDENT,
  HELP_MENU_GAP,
  HELP_MIN_W,
  type HelpExample,
  helpCurrent,
  helpFrame,
  helpLayout,
  helpLineText,
  helpLineWidth,
  helpMenu,
  helpMenuRow,
  helpMenuWidth,
  helpSections,
  helpStep,
} from '../../src/editor/help';
import { messageRows, messageText } from '../../src/app/messages';
import { COMMANDS, resolveCommand } from '../../src/script/commands';
import { parseProfile, serialize } from '../../src/script/doc';
import { EVENT_NAMES, FakeScheduler, REPEAT_MAX, ScriptEngine, evalMath } from '../../src/script/engine';
import { normalizeKey } from '../../src/script/keys';

function line(text: string): Line {
  return { text, runs: [], tags: [], prompt: false, raw: text, ts: 0 };
}

function setup() {
  const bus = new Bus();
  const sent: string[] = [];
  const msgs: string[] = [];
  const shown: string[] = [];
  const clients: string[] = [];
  /** Confirmation and listing rows (ADR 0039), as the game window shows them. */
  const said: string[] = [];
  const clock = new FakeScheduler();
  const e = new ScriptEngine({
    send: (t) => sent.push(t),
    message: (m) => msgs.push(m),
    client: (n) => clients.push(n),
    report: (r) => said.push(...messageRows(r, 200).map(messageText)),
    scheduler: clock,
    now: () => 0,
  });
  e.attach(bus);
  bus.on('text.display', (d) => shown.push(d.line.text));
  return { bus, e, sent, msgs, shown, clients, said, clock };
}

/** Runs an example the way the manual says it is used. */
function run(ex: HelpExample) {
  const t = setup();
  let warnings: string[] = [];
  if (ex.via === 'input') t.e.input(ex.code);
  else {
    const res = t.e.loadProfile(ex.code);
    expect(res.ok, ex.code).toBe(true);
    if (res.ok) warnings = res.warnings;
  }
  const c = ex.check ?? {};
  const steps: Array<readonly string[]> = c.steps
    ? [...c.steps]
    : [
        ...(c.type ?? []).map((x) => ['type', x]),
        ...(c.lines ?? []).map((x) => ['line', x]),
        ...(c.keys ?? []).map((x) => ['key', x]),
        ...(c.events ?? []).map((x) => ['event', ...x]),
        ...(c.wait !== undefined ? [['wait', String(c.wait)]] : []),
      ];
  for (const [kind, a, ...rest] of steps) {
    if (kind === 'type') t.e.input(a!);
    else if (kind === 'line') t.bus.emit('text.line', line(a!));
    else if (kind === 'key') {
      const k = normalizeKey(a!);
      expect(k, `key ${a}`).not.toBeNull();
      expect(t.e.runMacro(k!), `macro on ${a}`).toBe(true);
    } else if (kind === 'wait') t.clock.advance(Number(a) * 1000);
    else if (kind === 'event') t.e.fireEvent(a!, rest);
  }
  return { ...t, warnings };
}

const sections = helpSections();
const examples = sections.flatMap((s) => (s.examples ?? []).map((ex) => ({ s, ex })));

describe('manual examples', () => {
  it.each(examples.map(({ s, ex }) => [`${s.heading}: ${ex.code.split('\n')[0]}`, ex] as const))('%s', (_name, ex) => {
    const r = run(ex);
    expect(r.warnings).toEqual([]);
    expect(r.msgs).toEqual([]);
    const c = ex.check;
    // Nothing is confirmed or listed unless the example says so.
    expect(r.said).toEqual(c?.says ?? []);
    if (!c) return;
    if (c.sends || c.type || c.lines || c.keys || c.steps) expect(r.sent).toEqual(c.sends ?? []);
    if (c.shows) expect(r.shown).toEqual(c.shows);
    for (const [k, v] of Object.entries(c.vars ?? {})) expect(r.e.getVariable(k), `$${k}`).toBe(v);
  });

  it('every command section has a syntax line and an example', () => {
    for (const s of sections.filter((x) => x.group === 'commands')) {
      expect(s.syntax?.length, s.heading).toBeGreaterThan(0);
      expect(s.examples?.length, s.heading).toBeGreaterThan(0);
      for (const syn of s.syntax!) {
        const e = resolveCommand(syn.split(/[\s{]/)[0]!);
        expect(e && e !== 'ambiguous' && s.covers!.includes(e.name), syn).toBe(true);
      }
    }
  });

  it('profile examples are lossless in the document model and typed in LITE where that applies', () => {
    for (const { ex } of examples) {
      if (ex.via === 'input') continue;
      expect(serialize(parseProfile(ex.code))).toBe(ex.code);
      for (const n of parseProfile(ex.code).nodes) {
        if (n.type === 'passthrough') expect(['command', 'text'].includes(n.reason) && !/^#(alias|action|macro|highlight|substitute|variable)\b/i.test(n.text), n.text).toBe(true);
      }
    }
  });

  it('client commands reach the client', () => {
    for (const { s, ex } of examples) {
      if (ex.via !== 'input' || !s.covers?.some((c) => resolveCommand(c) !== null && (resolveCommand(c) as { tier: string }).tier === 'client')) continue;
      expect(run(ex).clients).toEqual(s.covers);
    }
  });

  it('never mentions _send', () => {
    expect(JSON.stringify(sections)).not.toContain('_send');
  });
});

describe('manual coverage (no drift from the command table)', () => {
  const covered = new Set(sections.flatMap((s) => s.covers ?? []));

  it('has a section for every command the engine runs, except the ones the menus cover', () => {
    const runs = [...COMMANDS.filter((c) => c.tier === 'must' || c.tier === 'should').map((c) => c.name), 'help'];
    expect(runs.filter((n) => !covered.has(n))).toEqual([]);
    // … and documents nothing beyond those.
    expect([...covered].filter((n) => !runs.includes(n))).toEqual([]);
  });

  it('leaves out the client commands that the menus cover, everywhere', () => {
    const hidden = ['connect', 'reconnect', 'replay', 'runlog', 'disconnect'];
    // They are still commands: only the manual is silent about them.
    expect(COMMANDS.filter((c) => c.tier === 'client').map((c) => c.name).sort()).toEqual([...hidden, 'help'].sort());
    const all = JSON.stringify(sections);
    for (const h of hidden) {
      expect(covered.has(h), h).toBe(false);
      expect(sections.some((s) => s.heading === '#' + h), h).toBe(false);
      expect(helpMenu().some((r) => r.label === '#' + h), h).toBe(false);
      expect(all, h).not.toContain('#' + h);
    }
  });

  it('command headings are alphabetical, starting with #action', () => {
    const heads = sections.filter((s) => s.group === 'commands').map((s) => s.heading);
    expect(heads[0]).toBe('#action');
    expect(heads).toEqual([...heads].sort());
    for (const s of sections.filter((x) => x.group === 'commands')) expect(s.covers).toContain(s.heading.slice(1));
  });

  it('lists every unsupported and inert command at the end, from the table', () => {
    const end = sections.filter((s) => s.group === 'end').flatMap((s) => s.text).join('\n');
    const words = new Set(end.match(/#[a-z]+/g));
    for (const c of COMMANDS) {
      expect(words.has('#' + c.name), c.name).toBe(c.tier === 'unsupported' || c.tier === 'inert');
    }
  });

  it('names every event the engine fires', () => {
    const text = sections.find((s) => s.heading === '#event')!.text.join('\n');
    for (const n of EVENT_NAMES) expect(text).toContain(n);
  });
});

describe('statements checked against the engine', () => {
  it('#math: comparisons give 1 or 0, whole numbers stay whole', () => {
    expect(evalMath('3 > 2')).toBe('1');
    expect(evalMath('3 < 2')).toBe('0');
    expect(evalMath('7 / 2')).toBe('3');
    expect(evalMath('7.0 / 2')).toBe('3.5');
    expect(evalMath('2 ** 3 + 7 % 4')).toBe('11');
  });

  it('#N repeats at most REPEAT_MAX times, the number the manual gives', () => {
    const text = sections.find((s) => s.heading === 'Typing commands')!.text.join('\n');
    expect(text).toContain(`at most ${REPEAT_MAX} times`);
    const t = setup();
    t.e.input(`#${REPEAT_MAX + 50} north`);
    expect(t.sent).toHaveLength(REPEAT_MAX);
  });

  it('an unknown variable stays as written; a profile only defines while loading', () => {
    const t = setup();
    const res = t.e.loadProfile('north\n#connect\n#alias {a} {b}\n');
    expect(res.ok && res.warnings.length).toBe(2);
    expect(t.sent).toEqual([]);
    expect(t.clients).toEqual([]);
    t.e.input('say $nope');
    expect(t.sent).toEqual(['say $nope']);
  });

  it('typed define commands list; typed entries are gone after the next load', () => {
    const t = setup();
    t.e.loadProfile('#alias {k} {kill %1}\n#alias {x} {y}\n#variable {target} {orc}\n');
    t.e.input('#alias {k*};#variable {target};#variable;#ticker;#delay');
    expect(t.msgs).toEqual([]);
    expect(t.said).toEqual(['#alias {k} {kill %1}', '#variable {target} {orc}', '#variable {target} {orc}', '#ticker none', '#delay none']);
    t.e.input('#alias {typed} {say hi}');
    t.e.loadProfile('#alias {k} {kill %1}\n');
    t.e.input('typed');
    expect(t.sent).toEqual(['typed']);
  });

  it('only open, close and kill for #class; other events never fire', () => {
    const t = setup();
    t.e.input('#class {x} {write}');
    expect(t.msgs).toEqual(['#class {x} {write}: only open, close and kill are supported.']);
    t.e.input('#event {RECEIVED LINE} {say no}');
    t.bus.emit('text.line', line('anything'));
    expect(t.sent).toEqual([]);
  });

  it('a ticker at the top level starts with the profile; the shortest interval is 0.05 s', () => {
    const t = setup();
    t.e.loadProfile('#ticker {a} {tick} {0.01}\n');
    t.clock.advance(100);
    expect(t.sent).toEqual(['tick', 'tick']);
  });

  it('where two highlights overlap, the later one wins', () => {
    const t = setup();
    const runs: unknown[] = [];
    t.bus.on('text.display', (d) => runs.push(d.line.runs));
    t.e.loadProfile('#highlight {orc} {red} {7}\n#highlight {grim orc} {green} {2}\n');
    t.bus.emit('text.line', line('A grim orc.'));
    expect(runs).toEqual([
      [
        { start: 2, end: 7, fg: 2 },
        { start: 7, end: 10, fg: 1 },
      ],
    ]);
  });
});

describe('layout', () => {
  it('fits every row to the width, at the widths the editor supports', () => {
    for (const w of [24, 37, 38, 60, 75, 120]) {
      const { lines } = helpLayout(w);
      for (const l of lines) expect(helpLineWidth(l), `${w}: ${helpLineText(l)}`).toBeLessThanOrEqual(w);
    }
  });

  it('keeps every character of an example, tokens included, when it wraps', () => {
    const src = "#action {^%1 tells you '%2'} {#showme {<Fffcc00>## TELL from %1<099>}}";
    const { lines } = helpLayout(30, [{ group: 'commands', heading: '#x', text: [], examples: [{ code: src }] }]);
    const code = lines.filter((l) => l.kind === 'code');
    expect(code.length).toBeGreaterThan(1);
    expect(code.every((l) => l.indent === CODE_INDENT)).toBe(true);
    // Continuation rows start with two cells of their own.
    expect(code.map((l, i) => l.segs.map((s) => s.text).join('').slice(i === 0 ? 0 : 2)).join('')).toBe(src);
    expect(code[0]!.segs[0]).toEqual({ text: '#action', cls: 'cmd' });
  });

  it('starts with the introduction, then Basics, then #action first among the commands', () => {
    const { lines, headings } = helpLayout(75);
    const text = lines.map(helpLineText);
    expect(text[0]).toBe('Writing a profile');
    const basics = text.indexOf('─── Basics ───');
    const commands = text.indexOf('─── Commands ───');
    expect(basics).toBeGreaterThan(0);
    expect(commands).toBeGreaterThan(basics);
    expect(text[commands + 2]).toBe('#action');
    expect(text[commands + 3]).toBe('    #action {pattern} {commands} {priority}');
    expect(headings.map((h) => text[h])).toEqual(sections.map((s) => s.heading));
    expect(text.at(-1)).not.toBe('');
  });

  it('steps between sections with n and p', () => {
    const h = [0, 10, 25];
    expect(helpStep(h, 0, 0, 1)).toBe(1);
    expect(helpStep(h, 12, 1, 1)).toBe(2);
    expect(helpStep(h, 25, 2, 1)).toBe(2);
    // p: back to the heading of the section being read, then to the one before.
    expect(helpStep(h, 12, 1, -1)).toBe(1);
    expect(helpStep(h, 10, 1, -1)).toBe(0);
    expect(helpStep(h, 0, 0, -1)).toBe(0);
    // A last section that cannot reach the top row (top is clamped above its heading).
    expect(helpStep(h, 20, 2, -1)).toBe(1);
  });

  it('lists every section in the menu, in order, under its group label', () => {
    const menu = helpMenu();
    const entries = menu.filter((r) => r.kind === 'entry');
    expect(entries.map((r) => r.label)).toEqual(sections.map((s) => s.heading));
    expect(entries.map((r) => r.section)).toEqual(sections.map((_, i) => i));
    expect(menu.filter((r) => r.kind === 'group').map((r) => r.label)).toEqual(['Basics', 'Commands']);
    const labels = menu.map((r) => r.label);
    expect(labels.slice(0, 4)).toEqual(['Writing a profile', '', 'Basics', 'Braces and ;']);
    expect(labels[labels.indexOf('Commands') + 1]).toBe('#action');
    expect(labels.slice(-3)).toEqual(['#variable', '', 'Not supported']);
    expect(menu.every((r) => (r.kind === 'entry') === (r.section >= 0))).toBe(true);
    expect(helpMenuWidth(menu)).toBe(Math.max(...sections.map((s) => [...s.heading].length)) + 2);
    expect(helpMenuRow(menu, 0)).toBe(0);
    expect(menu[helpMenuRow(menu, sections.findIndex((s) => s.heading === '#highlight'))]!.label).toBe('#highlight');
    expect(helpMenuRow(menu, 999)).toBe(0);
  });

  it('follows a custom section list in the menu', () => {
    const menu = helpMenu([
      { group: 'commands', heading: '#a', text: [] },
      { group: 'commands', heading: '#b', text: [] },
      { group: 'end', heading: 'Z', text: [] },
    ]);
    expect(menu.map((r) => `${r.kind}:${r.label}:${r.section}`)).toEqual([
      'group:Commands:-1',
      'entry:#a:0',
      'entry:#b:1',
      'blank::-1',
      'entry:Z:2',
    ]);
  });

  it('finds the section at the top row', () => {
    const h = [0, 10, 25];
    expect(helpCurrent(h, 0)).toBe(0);
    expect(helpCurrent(h, 9)).toBe(0);
    expect(helpCurrent(h, 10)).toBe(1);
    expect(helpCurrent(h, 24)).toBe(1);
    expect(helpCurrent(h, 400)).toBe(2);
    expect(helpCurrent([], 3)).toBe(0);
    const { headings } = helpLayout(75);
    headings.forEach((row, i) => expect(helpCurrent(headings, row)).toBe(i));
  });

  it('places the menu in the left margin, moves and narrows the manual, then hides the menu', () => {
    const frame = (cols: number) => {
      const W = Math.max(40, Math.min(77, cols - 2));
      return helpFrame(cols, W, Math.floor((cols - W) / 2), 19);
    };
    // Wide: the manual is the centred column, untouched.
    expect(frame(140)).toEqual({ menu: true, menuAt: 8, at: 31, width: 77 });
    expect(frame(125)).toEqual({ menu: true, menuAt: 1, at: 24, width: 77 });
    // Less margin: the manual moves right and keeps its width …
    expect(frame(110)).toEqual({ menu: true, menuAt: 1, at: 24, width: 77 });
    expect(frame(102)).toEqual({ menu: true, menuAt: 1, at: 24, width: 77 });
    // … then narrows …
    expect(frame(101)).toEqual({ menu: true, menuAt: 1, at: 24, width: 76 });
    expect(frame(77)).toEqual({ menu: true, menuAt: 1, at: 24, width: HELP_MIN_W });
    // … and under the minimum the menu goes and the manual is as before.
    expect(frame(76)).toEqual({ menu: false, menuAt: 0, at: 1, width: 74 });
    expect(frame(60)).toEqual({ menu: false, menuAt: 0, at: 1, width: 58 });
    for (let cols = 42; cols < 200; cols++) {
      const f = frame(cols);
      expect(f.at + f.width).toBeLessThanOrEqual(cols - 1);
      if (f.menu) expect(f.at - f.menuAt).toBe(19 + 1 + HELP_MENU_GAP);
    }
  });

  it('fill: the same left edges, the manual runs to the last cell of the grid', () => {
    const at = (cols: number) => Math.floor((cols - 77) / 2);
    for (let cols = 79; cols < 260; cols++) {
      const plain = helpFrame(cols, 77, at(cols), 19);
      const fill = helpFrame(cols, 77, at(cols), 19, true);
      expect(fill.menu).toBe(true);
      expect(fill.menuAt).toBe(plain.menuAt);
      expect(fill.at).toBe(plain.at);
      expect(fill.at + fill.width).toBe(cols);
      expect(fill.width).toBeGreaterThanOrEqual(HELP_MIN_W);
    }
    expect(helpFrame(79, 77, 1, 19, true)).toEqual({ menu: true, menuAt: 1, at: 24, width: 55 });
    expect(helpFrame(140, 77, 31, 19, true)).toEqual({ menu: true, menuAt: 8, at: 31, width: 109 });
    // A menu too wide for the frame is dropped; the manual still fills from the column's left edge.
    expect(helpFrame(79, 77, 1, 40, true)).toEqual({ menu: false, menuAt: 0, at: 1, width: 78 });
  });
});
