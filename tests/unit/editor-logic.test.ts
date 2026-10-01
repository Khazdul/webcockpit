import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bodyPreview,
  dropEmpty,
  ellipsis,
  entryWarning,
  highlightStyle,
  keyCell,
  listRows,
  parseHighlight,
  rowText,
  FULL_W,
  TOGGLE_W,
  VIEWS,
  sentinelPrompt,
  serializeHighlight,
  stepView,
  titleText,
} from '../../src/editor/logic';
import { balanceText, braceMatchAt, scanBraces, tokenizeLine } from '../../src/editor/syntax';
import {
  addEntry,
  editEntry,
  listEntries,
  parseProfile,
  removeEntry,
  serialize,
  storeBody,
  validateEntry,
} from '../../src/script/doc';

const PVP = readFileSync(new URL('./fixtures/pvp-shapes.tin', import.meta.url), 'utf8');

describe('entry list', () => {
  it('sorts by pattern, case-sensitive, for display only', () => {
    const doc = parseProfile('#alias {b} {1}\n#alias {B} {2}\n#alias {a} {3}\n#alias {a} {4}\n');
    expect(listRows(doc, 'alias').map((e) => e.body)).toEqual(['2', '3', '4', '1']);
    // The document is untouched.
    expect(listEntries(doc).map((e) => e.body)).toEqual(['1', '2', '3', '4']);
  });

  it('sorts macros by key and keeps new entries last', () => {
    const doc = parseProfile('#macro {Alt+A} {x}\n#macro {\\eOp} {y}\n#macro {F5} {z}\n#macro {Numpad2} {w}\n');
    expect(listRows(doc, 'macro').map((e) => e.body)).toEqual(['z', 'y', 'w', 'x']);
    const { doc: d2, id } = addEntry(doc, { kind: 'macro', pattern: 'F1', body: 'new' });
    expect(listRows(d2, 'macro', [id]).map((e) => e.body)).toEqual(['z', 'y', 'w', 'x', 'new']);
    expect(listRows(d2, 'macro').map((e) => e.body)[0]).toBe('new');
  });

  it('previews bodies with an ellipsis for cut or multi-line text', () => {
    expect(bodyPreview('alias', 'get %1;value %1', 30)).toBe('get %1;value %1');
    expect(bodyPreview('alias', 'testcommand1;\ntestcommand2', 30)).toBe('testcommand1;…');
    expect(bodyPreview('alias', '\n    first;\n    second\n', 30)).toBe('first;…');
    expect(bodyPreview('alias', 'abcdefghij', 5)).toBe('abcd…');
    expect(bodyPreview('alias', 'abcde\nf', 5)).toBe('abcd…');
    expect(bodyPreview('alias', '\n\n   \n', 5)).toBe('');
    expect(ellipsis('abc', 3)).toBe('abc');
  });

  it('fits a row to the pattern column', () => {
    const [e] = listEntries(parseProfile('#macro {Ctrl+Shift+F1} {cast}\n'));
    expect(rowText(e!, 20)).toEqual({ pattern: 'Ctrl+Sh…', body: 'cast' });
    const [n] = listEntries(parseProfile('#macro {\\eOp} {flee}\n'));
    expect(rowText(n!, 20).pattern).toBe('Numpad 0');
  });

  it('prompts on the + New entry row', () => {
    expect(sentinelPrompt('alias', 0)).toBe('No aliases yet. Press n to add one.');
    expect(sentinelPrompt('macro', 3)).toBe('Press Enter to create a new macro.');
  });
});

describe('highlight colours', () => {
  it('parses lower-case, Capitalised and light forms', () => {
    expect(parseHighlight('red')).toEqual({ styles: [], fg: { row: 0, bright: 0 }, bg: null });
    expect(parseHighlight('Red')).toEqual({ styles: [], fg: { row: 0, bright: 1 }, bg: null });
    expect(parseHighlight('light yellow')).toEqual({ styles: [], fg: { row: 2, bright: 1 }, bg: null });
    expect(parseHighlight('reverse underscore Cyan b light blue')).toEqual({
      styles: ['underscore', 'reverse'],
      fg: { row: 5, bright: 1 },
      bg: { row: 3, bright: 1 },
    });
    expect(parseHighlight('')).toEqual({ styles: [], fg: null, bg: null });
  });

  it('returns null for bodies it cannot edit', () => {
    for (const b of ['bold red', '<F00ff00>', 'red green', 'b', 'light', 'purple', 'blink blink']) {
      expect(parseHighlight(b)).toBeNull();
    }
  });

  it('serialises styles, text and background in order', () => {
    expect(serializeHighlight({ styles: ['reverse', 'underscore'], fg: { row: 0, bright: 1 }, bg: { row: 3, bright: 0 } })).toBe(
      'underscore reverse Red b blue',
    );
    expect(serializeHighlight({ styles: [], fg: null, bg: { row: 6, bright: 1 } })).toBe('b White');
    expect(serializeHighlight({ styles: [], fg: null, bg: null })).toBe('');
    for (const b of ['red', 'Magenta', 'blink green b Yellow']) expect(serializeHighlight(parseHighlight(b)!)).toBe(b);
  });

  it('keeps an unparseable body verbatim in the document until a swatch is touched', () => {
    const doc = parseProfile('#highlight {x} {bold red}\n');
    expect(serialize(doc)).toBe('#highlight {x} {bold red}\n');
    expect(highlightStyle('bold red')).toBeNull();
    expect(highlightStyle('Red b blue')).toEqual({ color: 'var(--ansi-9)', background: 'var(--ansi-4)' });
  });
});

describe('hints and warnings', () => {
  it('warns when a macro shadows an input-line key', () => {
    expect(entryWarning({ kind: 'macro', pattern: 'Ctrl+A' })).toBe('Ctrl+a overrides the input line (selects all).');
    expect(entryWarning({ kind: 'macro', pattern: 'F5' })).toBeNull();
  });

  it('warns when a macro takes a key that types text (ADR 0026)', () => {
    expect(entryWarning({ kind: 'macro', pattern: 'a' })).toBe('a overrides the input line (types text).');
    expect(entryWarning({ kind: 'macro', pattern: 'Shift+A' })).toBe('Shift+A overrides the input line (types text).');
    expect(entryWarning({ kind: 'macro', pattern: 'Shift+2' })).toBe('Shift+2 overrides the input line (types text).');
    expect(entryWarning({ kind: 'macro', pattern: 'Backquote' })).toBe('` overrides the input line (types text).');
    expect(entryWarning({ kind: 'macro', pattern: 'Ctrl+Shift+2' })).toBeNull();
  });

  it('warns about aliases that can never run', () => {
    expect(entryWarning({ kind: 'alias', pattern: '_send %1' })).toBeNull();
    expect(entryWarning({ kind: 'alias', pattern: '#conn' })).toBe('#connect is a client command; this alias never runs.');
    expect(entryWarning({ kind: 'alias', pattern: 'gv %1' })).toBeNull();
  });

  it('labels the macro Key cell', () => {
    expect(keyCell('')).toEqual({ text: '[ Press to bind… ]', hint: true });
    expect(keyCell('\\eOp')).toEqual({ text: '[ Numpad 0 ]', hint: false });
    expect(keyCell('Alt+A')).toEqual({ text: '[ Alt+a ]', hint: false });
    expect(keyCell('\\e[99~')).toEqual({ text: '[ Custom: \\e[99~ ]', hint: true });
  });

  it('cuts the title to its width', () => {
    expect(titleText('rasta', 80)).toBe('─── Profile Editor: rasta ───');
    expect(titleText('rasta', 10)).toBe('─── Profi…');
  });
});

describe('validation precedence', () => {
  it('pattern required > braces in pattern > braces in body', () => {
    expect(validateEntry({ kind: 'alias', pattern: '', body: '{' })).toBe('Pattern required');
    expect(validateEntry({ kind: 'alias', pattern: '', body: '{' }, { patternVisited: false })).toBe(
      'Unbalanced braces in Commands',
    );
    expect(validateEntry({ kind: 'alias', pattern: 'a{', body: '{' })).toBe('Unbalanced braces in Pattern');
    expect(validateEntry({ kind: 'substitute', pattern: 'a', body: '}' })).toBe('Unbalanced braces in New text');
    expect(validateEntry({ kind: 'macro', pattern: '', body: '' })).toBe('Key required');
    expect(validateEntry({ kind: 'alias', pattern: 'a\\{', body: '' })).toBeNull();
  });
});

describe('round trip over the PvP corpus', () => {
  it('a flip with no edits is byte-exact (serialise → parse → serialise)', () => {
    const doc = parseProfile(PVP);
    const buffer = serialize(dropEmpty(doc, new Set()));
    expect(buffer).toBe(PVP);
    expect(serialize(parseProfile(buffer))).toBe(PVP);
    const crlf = PVP.replace(/\n/g, '\r\n');
    expect(serialize(dropEmpty(parseProfile(crlf), new Set()))).toBe(crlf);
  });

  it('adding and deleting through the lite view leaves the other bytes intact', () => {
    const doc = parseProfile(PVP);
    const { doc: added, id } = addEntry(doc, { kind: 'alias', pattern: 'gv %1', body: 'get %1;value %1' });
    const text = serialize(added);
    const line = '#ALIAS {gv %1} {get %1;value %1}\n';
    expect(text.replace(line, '')).toBe(PVP);
    // Edit its body in the lite view, multi-line.
    const e = listEntries(added).find((x) => x.id === id)!;
    const edited = editEntry(added, id, { body: storeBody('alias', 'get %1;\nvalue %1', e.body, added.eol) });
    expect(serialize(edited)).toContain('#ALIAS {gv %1} {\n    get %1;\n    value %1\n}\n');
    // Delete it again: back to the original bytes.
    expect(serialize(removeEntry(edited, id))).toBe(PVP);
    // Delete an existing entry: only its lines go.
    const cloak = listEntries(doc, 'variable').find((x) => x.pattern === 'cloak')!;
    expect(serialize(removeEntry(doc, cloak.id))).toBe(PVP.replace('#VARIABLE {cloak} {grey}\n', ''));
  });

  it('drops only lite-touched entries with an empty pattern on save', () => {
    const doc = parseProfile('#alias {} {kept}\n');
    const { doc: d2, id } = addEntry(doc, { kind: 'alias', pattern: '', body: 'x' });
    expect(serialize(dropEmpty(d2, new Set([id])))).toBe('#alias {} {kept}\n');
  });
});

describe('syntax', () => {
  const classes = (s: string): string[] => tokenizeLine(s).map((t) => `${t.cls}:${s.slice(t.from, t.to)}`);

  it('classifies commands, braces, delimiters, variables and codes', () => {
    expect(classes('#alias {gv %1} {get %1;value $x}')).toEqual([
      'cmd:#alias',
      'brace:{',
      'var:%1',
      'brace:}',
      'brace:{',
      'var:%1',
      'delim:;',
      'var:$x',
      'brace:}',
    ]);
    expect(classes('  #showme {<F9AA8B7>## ${foe} &x %* \\n}')).toEqual([
      'cmd:#showme',
      'brace:{',
      'code:<F9AA8B7>',
      'var:${foe}',
      'var:&x',
      'var:%*',
      'code:\\n',
      'brace:}',
    ]);
    // `#` only in command position.
    expect(classes('say #1 {x};#nop')).toEqual(['brace:{', 'brace:}', 'delim:;', 'cmd:#nop']);
    expect(classes('\\{ \\xFF \\u{1F600} <088>')).toEqual(['code:\\{', 'code:\\xFF', 'code:\\u{1F600}', 'code:<088>']);
  });

  it('marks inert commands with their hint', () => {
    const [t] = tokenizeLine('#lua {x}');
    expect(t!.cls).toBe('cmd');
    expect(t!.hint).toMatch(/do nothing/);
    expect(tokenizeLine('#alias {x} {y}')[0]!.hint).toBeUndefined();
  });

  it('scans structural braces for matching and balance', () => {
    const text = '#a {x ${v} \\{ {y}}\n#b {';
    const scan = scanBraces(text);
    expect(scan.unclosed).toBe(1);
    expect(scan.stray).toBe(0);
    expect(braceMatchAt(scan, text, 3)).toEqual([3, 17]);
    expect(braceMatchAt(scan, text, 18)).toEqual([17, 3]);
    expect(braceMatchAt(scan, text, 7)).toBeNull(); // inside ${…}
    expect(braceMatchAt(scan, text, text.length)).toBeNull(); // unbalanced
    expect(balanceText(scanBraces('}} {'))).toBe('1 unclosed {  ·  2 stray }');
    expect(balanceText(scanBraces('{}'))).toBe('');
  });
});

describe('view toggle', () => {
  it('is LITE, EDITOR, HELP, one cell apart', () => {
    expect(VIEWS.map((v) => v.label)).toEqual(['LITE', 'EDITOR', 'HELP']);
    // A button is its label with one cell on each side.
    for (const v of VIEWS) expect(v.width).toBe(v.label.length + 2);
    expect(TOGGLE_W).toBe(' LITE   EDITOR   HELP '.length);
  });

  it('steps left and right without wrapping', () => {
    expect(stepView('lite', 1)).toBe('editor');
    expect(stepView('editor', 1)).toBe('help');
    expect(stepView('help', 1)).toBe('help');
    expect(stepView('help', -1)).toBe('editor');
    expect(stepView('editor', -1)).toBe('lite');
    expect(stepView('lite', -1)).toBe('lite');
  });
});
