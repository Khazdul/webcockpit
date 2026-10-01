// Literal gates on rule lists (src/script/engine/gate.ts): a gated engine
// must behave exactly like an ungated one.

import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { BusEvents, Line, StyleRun } from '../../src/core/types';
import { FakeScheduler, ScriptEngine } from '../../src/script/engine';
import { GATE_MIN_USES, buildGate } from '../../src/script/engine/gate';
import { RuleStore } from '../../src/script/engine/store';

function line(text: string, runs: StyleRun[] = []): Line {
  return { text, runs, tags: [], prompt: false, raw: text, ts: 0 };
}

function setup(literalGates = true) {
  const bus = new Bus();
  const sent: string[] = [];
  const shown: BusEvents['text.display'][] = [];
  const partials: BusEvents['text.displayPartial'][] = [];
  const e = new ScriptEngine({
    send: (t) => sent.push(t),
    message: (m) => sent.push('[msg] ' + m),
    scheduler: new FakeScheduler(),
    now: () => 0,
    literalGates,
  });
  e.attach(bus);
  bus.on('text.display', (d) => shown.push(d));
  bus.on('text.displayPartial', (d) => partials.push(d));
  const recv = (text: string, runs: StyleRun[] = []) => bus.emit('text.line', line(text, runs));
  const partial = (text: string) => bus.emit('text.partial', line(text));
  /** Lines that contain no literal of any rule here, so the gates are built and fail. */
  const warm = () => {
    for (let k = 0; k <= GATE_MIN_USES; k++) recv('~ nothing to see ~');
  };
  const last = () => shown[shown.length - 1]!.line;
  return { bus, e, sent, shown, partials, recv, partial, warm, last };
}

/** Rules with literals that never occur in the test lines (so every list is gated). */
const FILLERS =
  '#action {zzfill1} {x};#action {zzfill2} {x};#action {zzfill3} {x};#action {zzfill4} {x};' +
  '#sub {qqfill1} {x};#sub {qqfill2} {x};#sub {qqfill3} {x};#sub {qqfill4} {x};' +
  '#gag {ggfill1};#gag {ggfill2};#gag {ggfill3};#gag {ggfill4};' +
  '#highlight {hhfill1} {red};#highlight {hhfill2} {red};#highlight {hhfill3} {red};#highlight {hhfill4} {red}';

describe('literal gate: building', () => {
  it('jumps between the rules without a literal and escapes literals', () => {
    const s = new RuleStore('user', new FakeScheduler(), () => {});
    for (const p of ['a.b', '%*', 'c(d', '$foe here', '%ix', 'e']) s.define('action', p, '');
    const list = s.rules('action');
    const g = buildGate(list)!;
    const open = list.map((r, i) => (r.compiled?.literal ? -1 : i)).filter((i) => i >= 0);
    expect(open.map((i) => list[i]!.pattern).sort()).toEqual(['$foe here', '%*', '%ix']);
    expect(Array.from(g.next)).toEqual(
      Array.from({ length: list.length + 1 }, (_, i) => open.find((o) => o >= i) ?? list.length),
    );
    expect(g.re.test('xx c(d')).toBe(true);
    expect(g.re.test('axb')).toBe(false); // `.` is literal
    expect(g.re.test('a.b')).toBe(true);
  });

  it('has no gate when no rule has a literal', () => {
    const s = new RuleStore('user', new FakeScheduler(), () => {});
    for (const p of ['%*', '%1', '%ifoo', '$x']) s.define('action', p, '');
    expect(buildGate(s.rules('action'))).toBeNull();
  });
});

describe('literal gate: behaviour', () => {
  it('a substitute creates a later highlight literal', () => {
    const t = setup();
    t.e.input(FILLERS + ';#sub {foo} {bar};#highlight {bar} {red}');
    t.warm();
    t.recv('a foo here');
    expect(t.last().text).toBe('a bar here');
    expect(t.last().runs).toEqual([{ start: 2, end: 5, fg: 1 }]);
  });

  it('a substitute creates a later substitute literal and a gag literal', () => {
    const t = setup();
    t.e.input(FILLERS + ';#sub {a1} {b2} {4};#sub {b2} {c3} {6};#sub {zap} {GAGME};#gag {GAGME}');
    t.warm();
    t.recv('x a1 y');
    expect(t.last().text).toBe('x c3 y');
    const n = t.shown.length;
    t.recv('zap');
    expect(t.shown.length).toBe(n);
  });

  it('a substitute earlier in the list creates the literal of a substitute that comes after it', () => {
    const t = setup();
    // A substitute without a literal (%i) comes first and writes the second one's literal.
    t.e.input(FILLERS + ';#sub {%ihey} {hey MARK} {1};#sub {MARK} {done} {9}');
    t.warm();
    t.recv('HEY');
    expect(t.last().text).toBe('hey done');
  });

  it('$var patterns follow the variable at match time', () => {
    const t = setup();
    t.e.input(FILLERS + ';#var foe Bob;#action {$foe arrives} {kill $foe};#highlight {$foe} {green};#sub {$foe!} {$foe?}');
    t.warm();
    t.recv('Bob arrives.');
    t.e.input('#var foe Tim');
    t.warm();
    t.recv('Bob arrives.');
    t.recv('Tim arrives.');
    expect(t.sent).toEqual(['kill Bob', 'kill Tim']);
    t.recv('Tim!');
    expect(t.last().text).toBe('Tim?');
    expect(t.last().runs).toEqual([{ start: 0, end: 3, fg: 2 }]);
  });

  it('%i patterns match case-insensitively', () => {
    const t = setup();
    t.e.input(FILLERS + ';#action {%iorc arrives} {kill orc};#highlight {%idragon} {red}');
    t.warm();
    t.recv('An ORC ARRIVES.');
    t.recv('A Dragon.');
    expect(t.sent).toEqual(['kill orc']);
    expect(t.last().runs).toEqual([{ start: 2, end: 8, fg: 1 }]);
  });

  it('catch-alls see every line, user and system, in priority order', () => {
    const t = setup();
    const seen: string[] = [];
    t.e.input(FILLERS + ';#action {%*} {#nop} {2};#action {^%1 hits} {hit %1} {6}');
    t.e.system.define('action', '%*', '', { priority: 1, fn: (m) => seen.push('sys ' + m.args[0]) });
    t.e.system.define('action', '%0', '', { priority: 7, fn: (m) => seen.push('death ' + m.args.length + ' ' + m.line!.text) });
    t.warm();
    seen.length = 0;
    t.recv('Bob hits');
    t.recv('quiet');
    expect(seen).toEqual(['sys Bob hits', 'death 1 Bob hits', 'sys quiet', 'death 1 quiet']);
    expect(t.sent).toEqual(['hit Bob']);
  });

  it('a system %* catch-all gets the whole line in %0 and %1', () => {
    const t = setup();
    const seen: string[][] = [];
    t.e.input(FILLERS);
    t.e.system.define('action', '%*', '', { fn: (m) => seen.push(m.args) });
    t.warm();
    seen.length = 0;
    t.recv('one line');
    expect(seen).toEqual([['one line', 'one line']]);
  });

  it('native catch-alls called directly get the same arguments as through the regex', () => {
    const t = setup();
    const seen: string[][] = [];
    t.e.system.define('action', '%3', '', { fn: (m) => seen.push(m.args) });
    t.e.system.define('action', '%!*', '', { priority: 9, fn: (m) => seen.push(m.args) });
    t.recv('a b');
    t.e.input('#showme {two\nlines}');
    expect(seen[0]).toEqual(['a b', '', '', 'a b']);
    expect(seen[1]).toEqual(['a b']);
    expect(seen.length).toBe(4);
  });

  it('^ anchors and $ ends', () => {
    const t = setup();
    t.e.input(FILLERS + ';#action {^You hit} {a};#action {flees.$} {b};#highlight {^Exits:} {red}');
    t.warm();
    t.recv('You hit the orc');
    t.recv('Then You hit');
    t.recv('The orc flees.');
    t.recv('The orc flees. Again');
    t.recv('Exits: north');
    expect(t.last().runs).toEqual([{ start: 0, end: 6, fg: 1 }]);
    t.recv('No Exits:');
    expect(t.last().runs).toEqual([]);
    expect(t.sent).toEqual(['a', 'b']);
  });

  it('rules added and removed at runtime, also by actions on the same line', () => {
    const t = setup();
    t.e.input(FILLERS);
    t.warm();
    t.e.input('#action {newlit} {one}');
    t.recv('newlit');
    t.warm();
    t.e.input('#unaction {newlit}');
    t.recv('newlit');
    // An action that defines another: the new one fires from the next line on.
    t.e.input('#action {arm} {#action {fire} {boom}}');
    t.warm();
    t.recv('arm fire');
    t.recv('fire');
    t.e.input('#unaction {fire}');
    t.recv('fire');
    expect(t.sent).toEqual(['one', 'boom']);
  });

  it('classes killed and loaded again', () => {
    const t = setup();
    t.e.input(FILLERS + ';#class {pvp} {open};#action {enemy} {bash};#highlight {enemy} {red};#class {pvp} {close}');
    t.warm();
    t.recv('enemy');
    t.e.input('#class {pvp} {kill}');
    t.warm();
    t.recv('enemy');
    expect(t.last().runs).toEqual([]);
    t.e.input('#class {pvp} {open};#action {enemy} {bash2};#class {pvp} {close}');
    t.recv('enemy');
    expect(t.sent).toEqual(['bash', 'bash2']);
  });

  it('partials get gated substitutes and highlights', () => {
    const t = setup();
    t.e.input(FILLERS + ';#sub {hp:} {HP:};#highlight {HP} {red}');
    for (let k = 0; k <= GATE_MIN_USES; k++) t.partial('~ prompt ~');
    t.partial('hp: 10>');
    const p = t.partials[t.partials.length - 1]!.line;
    expect(p.text).toBe('HP: 10>');
    expect(p.runs).toEqual([{ start: 0, end: 2, fg: 1 }]);
  });
});

describe('literal gate: same results as without gates', () => {
  /** Deterministic PRNG. */
  function prng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  const WORDS = ['orc', 'Bob', 'hits', 'flees', 'you', 'ORC', 'mark', 'x', '!', 'tells', 'MARK', 'gold'];
  const PATTERNS = [
    'orc',
    '^Bob',
    'flees$',
    '%1 hits %2',
    '%iorc',
    '%*',
    '$foe',
    '^$foe %*',
    'tells you',
    'mark',
    'MARK gold',
    '{o+r}c',
    '%+1..d gold',
    'x !',
    'hits',
  ];

  it('matches an ungated engine on random rules and lines', () => {
    const rnd = prng(7);
    const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
    for (let round = 0; round < 20; round++) {
      const a = setup(true);
      const b = setup(false);
      const cmds: string[] = ['#var foe Bob'];
      for (let k = 0; k < 24; k++) {
        const p = pick(PATTERNS);
        const prio = 1 + Math.floor(rnd() * 9);
        const kind = pick(['action', 'sub', 'gag', 'highlight'] as const);
        if (kind === 'action') cmds.push(`#action {${p}} {said ${k} %0} {${prio}}`);
        else if (kind === 'sub') cmds.push(`#sub {${p}} {${pick(WORDS)} ${pick(WORDS)}} {${prio}}`);
        else if (kind === 'gag' && rnd() < 0.3) cmds.push(`#gag {${p}}`);
        else cmds.push(`#highlight {${p}} {${pick(['red', 'green', 'blue', 'bold'])}} {${prio}}`);
      }
      for (const t of [a, b]) for (const c of cmds) t.e.input(c);
      for (let n = 0; n < 200; n++) {
        if (rnd() < 0.03) {
          const c = pick(['#var foe Tim', '#var foe orc', '#var foe Bob', `#unaction {${pick(PATTERNS)}}`, `#action {${pick(PATTERNS)}} {late %0}`]);
          a.e.input(c);
          b.e.input(c);
        }
        const len = 1 + Math.floor(rnd() * 6);
        const text = Array.from({ length: len }, () => (rnd() < 0.15 ? String(Math.floor(rnd() * 100)) : pick(WORDS))).join(' ');
        a.recv(text);
        b.recv(text);
        a.partial(text);
        b.partial(text);
      }
      expect(a.sent).toEqual(b.sent);
      expect(a.shown.map((d) => d.line)).toEqual(b.shown.map((d) => d.line));
      expect(a.partials.map((d) => d.line)).toEqual(b.partials.map((d) => d.line));
    }
  });
});
