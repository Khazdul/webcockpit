// The HELP manual (src/editor/help.ts, ADR 0037) against the real engine:
// every example loads or runs without a message, examples with a `check`
// do exactly what they claim, and no command the engine runs is missing.
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { Line } from '../../src/core/types';
import { CODE_INDENT, type HelpExample, helpJump, helpLayout, helpLineText, helpLineWidth, helpSections } from '../../src/editor/help';
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
  const clock = new FakeScheduler();
  const e = new ScriptEngine({
    send: (t) => sent.push(t),
    message: (m) => msgs.push(m),
    client: (n) => clients.push(n),
    scheduler: clock,
    now: () => 0,
  });
  e.attach(bus);
  bus.on('text.display', (d) => shown.push(d.line.text));
  return { bus, e, sent, msgs, shown, clients, clock };
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

  it('has a section for every command the engine runs', () => {
    const runs = COMMANDS.filter((c) => c.tier === 'must' || c.tier === 'should' || c.tier === 'client').map((c) => c.name);
    expect(runs.filter((n) => !covered.has(n))).toEqual([]);
    // … and documents nothing the engine does not run.
    expect([...covered].filter((n) => !runs.includes(n))).toEqual([]);
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
    expect(t.msgs).toEqual([
      '#ALIAS {k} {kill %1}',
      '#VARIABLE {target} {orc}',
      '#VARIABLE {target} {orc}',
      'No tickers running.',
      'No delays running.',
    ]);
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

  it('jumps between headings', () => {
    const h = [0, 10, 25];
    expect(helpJump(h, 0, 1)).toBe(10);
    expect(helpJump(h, 12, 1)).toBe(25);
    expect(helpJump(h, 25, 1)).toBe(25);
    expect(helpJump(h, 12, -1)).toBe(10);
    expect(helpJump(h, 10, -1)).toBe(0);
    expect(helpJump(h, 0, -1)).toBe(0);
  });
});
