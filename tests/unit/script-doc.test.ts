import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type EntryNode,
  addEntry,
  braceDepth,
  checkBraces,
  displayBody,
  editEntry,
  findVariable,
  isBraceBalanced,
  isSafeArgument,
  listEntries,
  nodeLine,
  parseProfile,
  removeEntry,
  serialize,
  setVariable,
  storeBody,
  validateEntry,
} from '../../src/script/doc';
import { PROFILE_TEMPLATE } from '../../src/profiles';

const CORPUS = readFileSync(new URL('./fixtures/pvp-shapes.tin', import.meta.url), 'utf8');
const OWNER_PROFILE = new URL('../../src/profiles/khazdul.tin', import.meta.url);

const rt = (t: string): string => serialize(parseProfile(t));

describe('round trip', () => {
  const cases: Record<string, string> = {
    empty: '',
    'one newline': '\n',
    'no final newline': '#alias {a} {b}',
    'only spaces': '   \t  ',
    crlf: '#alias {a} {b}\r\n\r\n#nop hi\r\n',
    'lone cr': '#alias {a}\r{b}\r',
    unbalanced: '#alias {a} {b\n#action {x} {y}\n',
    'stray close': '#alias {a} {b}}\n}}}\n',
    escapes: '#action {\\{x\\}} {say \\}\n#nop \\\n#alias {b} {c}\n',
    'trailing text': '#alias {a} {b} junk\n#alias {c} {d};\n',
    'non-ascii': '#alias {é} {north}\n#alias {ś} {south}\n#nop ẃ ń ú 😀\n',
    'multi-line nop': '#nop {\n  a comment\n  over lines\n}\n#alias {a} {b}\n',
    'free text': 'hello there\n  {not a group\n}\n',
    'blank variety': '\n \n\t\n  \r\n',
    'class write layout': '#ALIAS {x}\n{\n    a;\n    b\n}\n\n#ALIAS {y}\n  {\n    c\n  }\n',
  };
  for (const [name, text] of Object.entries(cases)) {
    it(`is byte-exact: ${name}`, () => {
      expect(rt(text)).toBe(text);
    });
  }

  it('is byte-exact on the synthetic PvP corpus and the template', () => {
    expect(rt(CORPUS)).toBe(CORPUS);
    expect(rt(PROFILE_TEMPLATE)).toBe(PROFILE_TEMPLATE);
  });

  it('is byte-exact on random text (fuzz)', () => {
    let seed = 12345;
    const rand = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const atoms = [
      '{', '}', '\\', '\\{', '\\}', '\n', '\r\n', '\r', ' ', '\t', '#', ';', 'é', 'ś', '😀',
      '#alias', '#ACTION', '#var', '#nop', '#macro', '#highlight', '#sub', '#lua', '#if', '#x',
      '{5}', '{a}', '{b c}', '%1', '$v', 'text', '\u001b',
    ];
    for (let n = 0; n < 3000; n++) {
      let s = '';
      const len = rand(40);
      for (let i = 0; i < len; i++) s += atoms[rand(atoms.length)];
      expect(rt(s)).toBe(s);
      // Every node is a whole-lines slice and ids are unique.
      const doc = parseProfile(s);
      expect(new Set(doc.nodes.map((x) => x.id)).size).toBe(doc.nodes.length);
      for (const node of doc.nodes) expect(node.text.length).toBeGreaterThan(0);
    }
  });

  it('is byte-exact on the bundled reference profile', () => {
    const text = readFileSync(OWNER_PROFILE, 'utf8');
    const doc = parseProfile(text);
    expect(serialize(doc)).toBe(text);
    // Every definition in that file is a typed entry (ADR 0036).
    expect(doc.nodes.filter((n) => n.type === 'passthrough')).toEqual([]);
    expect(listEntries(doc, 'alias').length).toBeGreaterThan(150);
  });

  it('parses a 600-line profile quickly', () => {
    const big = CORPUS.repeat(Math.ceil(600 / CORPUS.split('\n').length));
    parseProfile(big);
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) parseProfile(big);
    expect((performance.now() - t0) / 10).toBeLessThan(10);
  });
});

describe('node classification', () => {
  it('types the six entry kinds with word, pattern, body and priority as written', () => {
    const doc = parseProfile(CORPUS);
    const counts = Object.fromEntries(
      (['action', 'alias', 'highlight', 'macro', 'substitute', 'variable'] as const).map((k) => [k, listEntries(doc, k).length]),
    );
    expect(counts).toEqual({ action: 4, alias: 8, highlight: 6, macro: 5, substitute: 2, variable: 8 });
    const hl = listEntries(doc, 'highlight')[0]!;
    expect(hl).toMatchObject({ word: 'HIGHLIGHT', pattern: '- armour', body: 'Cyan', priority: '5' });
    const k = listEntries(doc, 'alias').find((e) => e.pattern === '^k%+1..d$')!;
    expect(k.body).toBe("\n    cast $mode 'sleep' %1.$foe\n");
    expect(k.priority).toBeNull();
    const m = listEntries(doc, 'macro')[2]!;
    expect(m.pattern).toBe('\\e[15~');
    const v = listEntries(doc, 'variable').find((e) => e.pattern === 'blade')!;
    expect(v.body).toBe('sabre ');
    expect(listEntries(doc, 'alias').some((e) => e.pattern === 'é')).toBe(true);
  });

  it('keeps the nested #if alias as one entry', () => {
    const doc = parseProfile(CORPUS);
    const e = listEntries(doc, 'alias').find((x) => x.pattern === '_swap_cloak')!;
    expect(e.body).toContain('#elseif');
    expect(isBraceBalanced(e.body)).toBe(true);
    expect(e.text.startsWith('#ALIAS {_swap_cloak}\n{\n')).toBe(true);
    expect(e.text.endsWith('}\n')).toBe(true);
  });

  it('keeps the leaked ticker and other commands as passthrough', () => {
    const doc = parseProfile(CORPUS);
    const t = doc.nodes.find((n) => n.type === 'passthrough' && n.word === 'TICKER');
    expect(t).toMatchObject({ reason: 'command', command: { name: 'ticker' } });
    const d = parseProfile('#lua {x}\n#gag {spam}\n#frobnicate\n#s x\nplain\n#var foe orc\n#alias {a}\n');
    expect(d.nodes.map((n) => (n.type === 'passthrough' ? n.reason : n.type))).toEqual([
      'inert',
      'command',
      'unknown',
      'unknown',
      'text',
      'malformed',
      'malformed',
    ]);
  });

  it('recognises comments, abbreviations and case', () => {
    const doc = parseProfile('#NOP x\n#no {\ny\n}\n#act {a} {b}\n#Al {c} {d}\n#sub {e} {f} {2.5}\n#hi {g} {red}\n#mac {F5} {h}\n');
    expect(doc.nodes.map((n) => n.type)).toEqual(['comment', 'comment', 'entry', 'entry', 'entry', 'entry', 'entry']);
    expect((doc.nodes as EntryNode[]).slice(2).map((n) => n.kind)).toEqual(['action', 'alias', 'substitute', 'highlight', 'macro']);
    expect((doc.nodes[4] as EntryNode).priority).toBe('2.5');
  });

  it('rejects shapes the model does not type', () => {
    const kinds = (t: string): string[] => parseProfile(t).nodes.map((n) => n.type);
    expect(kinds('#macro {F5} {a} {5}\n')).toEqual(['passthrough']); // macros take no priority
    expect(kinds('#alias {a} {b} {high}\n')).toEqual(['passthrough']); // non-numeric priority
    expect(kinds('#alias {a} {b} {1} {2}\n')).toEqual(['passthrough']);
    expect(kinds('#variable {a}\n')).toEqual(['passthrough']);
    expect(kinds('#macros {F5} {a}\n')).toEqual(['passthrough']);
    expect(kinds('  #alias {a} {b}  \n')).toEqual(['entry']); // lead and trailing blanks are fine
  });

  it('gives source spans and line numbers', () => {
    const text = '#nop a\n\n#alias {x}\n{\n  y\n}\n#alias {z} {w}\n';
    const doc = parseProfile(text);
    for (const n of doc.nodes) expect(text.slice(n.source!.start, n.source!.end)).toBe(n.text);
    const [x, z] = listEntries(doc, 'alias');
    expect(nodeLine(doc, x!.id)).toBe(3);
    expect(nodeLine(doc, z!.id)).toBe(7);
    expect(nodeLine(doc, 999)).toBe(0);
  });

  it('picks the document line ending', () => {
    expect(parseProfile('a\r\nb\r\nc\n').eol).toBe('\r\n');
    expect(parseProfile('a\nb\n').eol).toBe('\n');
    expect(parseProfile('').eol).toBe('\n');
  });
});

describe('editing entries', () => {
  it('re-serialises only the edited entry, canonically, keeping word and priority', () => {
    const text = '#nop top\n#HIGHLIGHT {a}   {red}  {7}\n\n#alias {x}\n{\n    y\n}\n';
    const doc = parseProfile(text);
    const hl = listEntries(doc, 'highlight')[0]!;
    const d2 = editEntry(doc, hl.id, { body: 'Cyan' });
    expect(serialize(d2)).toBe('#nop top\n#HIGHLIGHT {a} {Cyan} {7}\n\n#alias {x}\n{\n    y\n}\n');
    expect(serialize(doc)).toBe(text); // input untouched
    const e2 = listEntries(d2, 'highlight')[0]!;
    expect(e2.id).toBe(hl.id);
    expect(e2.source).toBeUndefined();
    // The canonical text parses back to the same entry.
    const re = listEntries(parseProfile(serialize(d2)), 'highlight')[0]!;
    expect(re).toMatchObject({ pattern: 'a', body: 'Cyan', priority: '7', word: 'HIGHLIGHT' });
  });

  it('keeps CRLF and indent, can drop a priority, and never gives macros one', () => {
    const doc = parseProfile('  #alias {a} {b} {3}\r\n#macro {F5} {x}\r\n');
    const [a] = listEntries(doc, 'alias');
    const [m] = listEntries(doc, 'macro');
    let d = editEntry(doc, a!.id, { priority: null, pattern: 'aa' });
    d = editEntry(d, m!.id, { body: 'y', priority: '5' });
    expect(serialize(d)).toBe('  #alias {aa} {b}\r\n#macro {F5} {y}\r\n');
  });

  it('returns the same document when nothing changes', () => {
    const doc = parseProfile('#alias {a} {b}\n#nop x\n');
    const [a] = listEntries(doc, 'alias');
    expect(editEntry(doc, a!.id, { pattern: 'a' })).toBe(doc);
    expect(editEntry(doc, doc.nodes[1]!.id, { pattern: 'z' })).toBe(doc);
  });

  it('round-trips a lite-view body edit through storeBody', () => {
    const doc = parseProfile(CORPUS);
    const e = listEntries(doc, 'alias').find((x) => x.pattern === 'fe')!;
    const shown = displayBody('alias', e.body);
    expect(shown).toBe('#variable {foe} {%1};\n#show {<F23aaee>Foe set to %1<099>}');
    // Unchanged display keeps the exact bytes.
    expect(storeBody('alias', shown, e.body)).toBe(e.body);
    const d2 = editEntry(doc, e.id, { body: storeBody('alias', shown + ';\nfollow %1', e.body) });
    const e2 = listEntries(parseProfile(serialize(d2)), 'alias').find((x) => x.pattern === 'fe')!;
    expect(displayBody('alias', e2.body)).toBe(shown + ';\nfollow %1');
    expect(e2.text).toBe('#ALIAS {fe} {\n    #variable {foe} {%1};\n    #show {<F23aaee>Foe set to %1<099>};\n    follow %1\n}\n');
  });
});

describe('adding entries', () => {
  it('adds after the last entry of the same kind, in its word spelling', () => {
    const doc = parseProfile(CORPUS);
    const { doc: d, id } = addEntry(doc, { kind: 'highlight', pattern: 'YY', body: 'red', priority: '5' });
    const out = serialize(d);
    expect(out).toContain('#HIGHLIGHT {XX} {green} {5}\n#HIGHLIGHT {YY} {red} {5}\n#MACRO {\\eOP}');
    expect(listEntries(d, 'highlight').at(-1)!.id).toBe(id);
    expect(id).toBe(doc.nextId);
    expect(d.nextId).toBeGreaterThan(id);
  });

  it('adds after the last entry of any kind with blank lines when the kind is new', () => {
    const doc = parseProfile('#nop head\n\n#alias {a} {b}\n#nop tail\n');
    const d = addEntry(doc, { kind: 'action', pattern: 'x', body: 'y' }).doc;
    expect(serialize(d)).toBe('#nop head\n\n#alias {a} {b}\n\n#action {x} {y}\n\n#nop tail\n');
    const d2 = addEntry(parseProfile('#alias {a} {b}\n\n#nop tail\n'), { kind: 'macro', pattern: 'F1', body: 'y' }).doc;
    expect(serialize(d2)).toBe('#alias {a} {b}\n\n#macro {F1} {y}\n\n#nop tail\n');
  });

  it('appends at the end when there are no entries, and upper-cases for upper-case files', () => {
    expect(serialize(addEntry(parseProfile(''), { kind: 'alias', pattern: 'a', body: 'b' }).doc)).toBe('#alias {a} {b}\n');
    expect(serialize(addEntry(parseProfile('#nop x'), { kind: 'alias', pattern: 'a', body: 'b' }).doc)).toBe('#nop x\n\n#alias {a} {b}\n');
    expect(serialize(addEntry(parseProfile('#nop x\n\n'), { kind: 'alias', pattern: 'a', body: 'b' }).doc)).toBe('#nop x\n\n#alias {a} {b}\n');
    const up = addEntry(parseProfile('#ALIAS {a} {b}\n'), { kind: 'macro', pattern: 'F5', body: 'c', priority: '5' }).doc;
    expect(serialize(up)).toBe('#ALIAS {a} {b}\n\n#MACRO {F5} {c}\n');
  });

  it('adds a line break to an entry at the end of the text, using CRLF when the file does', () => {
    const d = addEntry(parseProfile('#alias {a} {b}\r\n#alias {c} {d}'), { kind: 'alias', pattern: 'e', body: 'f' }).doc;
    expect(serialize(d)).toBe('#alias {a} {b}\r\n#alias {c} {d}\r\n#alias {e} {f}\r\n');
    expect(serialize(parseProfile(serialize(d)))).toBe(serialize(d));
  });

  it('adds the template macros in order', () => {
    const d = addEntry(parseProfile(PROFILE_TEMPLATE), { kind: 'macro', pattern: 'F5', body: 'kill $foe' }).doc;
    expect(serialize(d)).toBe(PROFILE_TEMPLATE + '#macro {F5} {kill $foe}\n');
  });
});

describe('removing entries', () => {
  const ids = (t: string): { doc: ReturnType<typeof parseProfile>; ids: number[] } => {
    const doc = parseProfile(t);
    return { doc, ids: listEntries(doc).map((e) => e.id) };
  };

  it('keeps one blank line between blank-separated entries', () => {
    const t = '#alias {a} {1}\n\n#alias {b} {2}\n\n#alias {c} {3}\n';
    const { doc, ids: [a, b, c] } = ids(t);
    expect(serialize(removeEntry(doc, b!))).toBe('#alias {a} {1}\n\n#alias {c} {3}\n');
    expect(serialize(removeEntry(doc, a!))).toBe('#alias {b} {2}\n\n#alias {c} {3}\n');
    expect(serialize(removeEntry(doc, c!))).toBe('#alias {a} {1}\n\n#alias {b} {2}\n');
  });

  it('removes only the entry inside a block', () => {
    const t = '#nop x\n\n#hi {a} {red}\n#hi {b} {red}\n#hi {c} {red}\n\n#nop y\n';
    const { doc, ids: [a, b, c] } = ids(t);
    expect(serialize(removeEntry(doc, b!))).toBe('#nop x\n\n#hi {a} {red}\n#hi {c} {red}\n\n#nop y\n');
    expect(serialize(removeEntry(doc, a!))).toBe('#nop x\n\n#hi {b} {red}\n#hi {c} {red}\n\n#nop y\n');
    expect(serialize(removeEntry(doc, c!))).toBe('#nop x\n\n#hi {a} {red}\n#hi {b} {red}\n\n#nop y\n');
  });

  it('removes a lone entry and its gap, and ignores unknown ids', () => {
    const { doc, ids: [a] } = ids('#nop x\n\n#alias {a} {1}\n\n#nop y\n');
    expect(serialize(removeEntry(doc, a!))).toBe('#nop x\n\n#nop y\n');
    expect(removeEntry(doc, 999)).toBe(doc);
    const only = ids('#alias {a} {1}\n');
    expect(serialize(removeEntry(only.doc, only.ids[0]!))).toBe('');
  });

  it('removes multi-line entries from the corpus cleanly', () => {
    const doc = parseProfile(CORPUS);
    const e = listEntries(doc, 'macro').find((x) => x.pattern === '\\eOQ')!;
    const out = serialize(removeEntry(doc, e.id));
    expect(out).toContain('#MACRO {\\eOP}\n{\n    hit $foe\n}\n\n#MACRO {\\e[15~}');
    expect(out.length).toBe(CORPUS.length - e.text.length - 1);
  });
});

describe('setVariable', () => {
  it('rewrites only the value of an existing top-level #variable', () => {
    const doc = parseProfile(CORPUS);
    const d = setVariable(doc, 'foe', '*troll*');
    expect(serialize(d)).toBe(CORPUS.replace('#VARIABLE {foe} {*orc*}', '#VARIABLE {foe} {*troll*}'));
    expect(findVariable(d, 'foe')!.body).toBe('*troll*');
    // The `#variable {cloak}` inside the action body is not top level.
    const c = setVariable(doc, 'cloak', 'black');
    expect(serialize(c)).toBe(CORPUS.replace('#VARIABLE {cloak} {grey}', '#VARIABLE {cloak} {black}'));
  });

  it('keeps odd spacing, empty values and later edits consistent', () => {
    const doc = parseProfile('#var {x}   {1}   \n#var {y} {}\n');
    const d = setVariable(setVariable(doc, 'x', '22'), 'y', 'ab');
    expect(serialize(d)).toBe('#var {x}   {22}   \n#var {y} {ab}\n');
    const x = findVariable(d, 'x')!;
    expect(x.text.slice(x.args[1]!.start, x.args[1]!.end)).toBe('22');
    expect(serialize(setVariable(d, 'x', '3'))).toBe('#var {x}   {3}   \n#var {y} {ab}\n');
  });

  it('updates the last definition, and refuses missing names, same values and unsafe values', () => {
    const doc = parseProfile('#variable {a} {1}\n#variable {a} {2}\n');
    expect(serialize(setVariable(doc, 'a', '3'))).toBe('#variable {a} {1}\n#variable {a} {3}\n');
    expect(setVariable(doc, 'b', '3')).toBe(doc);
    expect(setVariable(doc, 'a', '2')).toBe(doc);
    expect(setVariable(doc, 'a', 'x{')).toBe(doc);
    expect(setVariable(doc, 'a', 'x\\')).toBe(doc);
    expect(setVariable(doc, 'A', '3')).toBe(doc); // names are case-sensitive
  });
});

describe('text helpers', () => {
  it('checks braces, ignoring escaped ones', () => {
    expect(checkBraces('{a{b}c}')).toEqual({ ok: true });
    expect(checkBraces('\\{a')).toEqual({ ok: true });
    expect(checkBraces('a}{')).toEqual({ ok: false, kind: 'unopened', index: 1 });
    expect(checkBraces('x{a{b}')).toEqual({ ok: false, kind: 'unclosed', index: 1 });
    expect(braceDepth('{{}')).toBe(1);
    expect(braceDepth('}\\}')).toBe(-1);
    expect(isSafeArgument('a\\\\')).toBe(true);
    expect(isSafeArgument('a\\')).toBe(false);
  });

  it('normalises bodies for display only for actions, aliases and macros', () => {
    const raw = '\r\n\r\n    a;\r\n      b\r\n\r\n';
    expect(displayBody('alias', raw)).toBe('a;\n  b');
    expect(displayBody('substitute', raw)).toBe(raw);
    expect(displayBody('macro', '  single  ')).toBe('  single  ');
    expect(storeBody('highlight', 'a\nb')).toBe('a\nb');
    expect(storeBody('action', 'a\n\nb', undefined, '\r\n')).toBe('\r\n    a\r\n\r\n    b\r\n');
    expect(storeBody('action', 'one')).toBe('one');
  });

  it('gives one validation message, by precedence', () => {
    expect(validateEntry({ kind: 'alias', pattern: ' ', body: '{' })).toBe('Pattern required');
    expect(validateEntry({ kind: 'alias', pattern: '', body: '{' }, { patternVisited: false })).toBe('Unbalanced braces in Commands');
    expect(validateEntry({ kind: 'macro', pattern: '', body: '' })).toBe('Key required');
    expect(validateEntry({ kind: 'alias', pattern: 'a{', body: '{' })).toBe('Unbalanced braces in Pattern');
    expect(validateEntry({ kind: 'substitute', pattern: 'a', body: '}' })).toBe('Unbalanced braces in New text');
    expect(validateEntry({ kind: 'alias', pattern: '\\{', body: '\\}' })).toBeNull();
  });
});
