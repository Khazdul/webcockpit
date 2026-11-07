import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applicableDoc,
  bodyPreview,
  heldText,
  pendingDoc,
  ellipsis,
  entryWarning,
  highlightStyle,
  keyCell,
  listRows,
  parseHighlight,
  patternColumn,
  rowText,
  FULL_W,
  LITE_MAX_W,
  LIST_GAP,
  TOGGLE_W,
  liteGeometry,
  VIEWS,
  sentinelPrompt,
  serializeHighlight,
  stepView,
  titleText,
  KINDS,
  KIND_LETTERS,
  VIEW_LABELS,
  keyLabel,
  liveText,
  peLayout,
  previewLine,
  showsAs,
  statusText,
  textSections,
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
    expect(rowText(e!, 17)).toEqual({ pattern: 'Ctrl+Sh…', body: 'cast' });
    const [n] = listEntries(parseProfile('#macro {\\eOp} {flee}\n'));
    expect(rowText(n!, 17).pattern).toBe('Numpad 0');
    // A wider list gives the pattern half the row (ADR 0104).
    expect(rowText(e!, 37)).toEqual({ pattern: 'Ctrl+Shift+F1     ', body: 'cast' });
  });

  it('splits the list in halves, the pattern never under 8 cells (ADR 0104)', () => {
    expect(patternColumn(11)).toBe(8);
    expect(patternColumn(17)).toBe(8);
    expect(patternColumn(19)).toBe(9);
    expect(patternColumn(36)).toBe(17);
    expect(patternColumn(77)).toBe(38);
  });

  it('prompts on the + New entry row', () => {
    expect(sentinelPrompt('alias', 0)).toBe('No aliases yet. Press N to add one.');
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

describe('warnings', () => {
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
    const buffer = serialize(pendingDoc(doc, doc));
    expect(buffer).toBe(PVP);
    expect(serialize(parseProfile(buffer))).toBe(PVP);
    const crlf = PVP.replace(/\n/g, '\r\n');
    const crlfDoc = parseProfile(crlf);
    expect(serialize(pendingDoc(crlfDoc, crlfDoc))).toBe(crlf);
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

  it('drops only new entries with an empty pattern from the pending text', () => {
    const doc = parseProfile('#alias {} {kept}\n');
    const { doc: d2 } = addEntry(doc, { kind: 'alias', pattern: '', body: 'x' });
    expect(serialize(pendingDoc(doc, d2))).toBe('#alias {} {kept}\n');
  });
});

describe('applicableDoc (ADR 0105)', () => {
  const base = parseProfile('#alias {a} {one}\n#alias {b} {two}\n');
  const [a, b] = listEntries(base);

  it('applies valid changes and holds back the ones that do not validate', () => {
    let d = editEntry(base, a!.id, { body: 'uno' });
    d = editEntry(d, b!.id, { body: 'dos{' });
    const r = applicableDoc(base, d);
    expect(serialize(r.doc)).toBe('#alias {a} {uno}\n#alias {b} {two}\n');
    expect(r.held.map(heldText)).toEqual(['Unbalanced braces in Commands (alias b)']);
  });

  it('leaves out a new entry that does not validate; an empty new one silently', () => {
    const { doc: d1 } = addEntry(base, { kind: 'alias', pattern: '', body: '' });
    expect(applicableDoc(base, d1)).toEqual({ doc: expect.anything(), held: [] });
    expect(serialize(applicableDoc(base, d1).doc)).toBe(serialize(base));
    const { doc: d2 } = addEntry(base, { kind: 'alias', pattern: 'c{', body: 'x' });
    const r = applicableDoc(base, d2);
    expect(serialize(r.doc)).toBe(serialize(base));
    expect(r.held.map(heldText)).toEqual(['Unbalanced braces in Pattern (alias c{)']);
  });

  it('holds back an existing entry whose pattern was cleared instead of deleting it', () => {
    const d = editEntry(base, a!.id, { pattern: '' });
    const r = applicableDoc(base, d);
    expect(serialize(r.doc)).toBe(serialize(base));
    expect(r.held.map(heldText)).toEqual(['Pattern required (alias)']);
    expect(serialize(pendingDoc(base, d))).not.toBe(serialize(base));
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

describe('LITE geometry (ADR 0104)', () => {
  it('splits the full-size column in halves: list 36 + scrollbar, gap 3, detail 37', () => {
    expect(liteGeometry(FULL_W + 2, false)).toEqual({ at: 1, w: FULL_W, list: 36, detail: 37, kindAt: 1, kindW: 13, kindGap: 3 });
  });

  it('fills a wider frame: list and detail grow in halves, the kind row centred', () => {
    const g = liteGeometry(150, false);
    expect(g.at).toBe(1);
    expect(g.w).toBe(148);
    expect(g.list + 1).toBe(Math.floor((148 - LIST_GAP) / 2));
    expect(g.detail).toBe(148 - g.list - 1 - LIST_GAP);
    expect(g.detail - (g.list + 1)).toBe(1); // the odd cell to the detail panel
    expect([g.kindAt, g.kindW, g.kindGap]).toEqual([1 + Math.floor((148 - FULL_W) / 2), 13, 3]);
  });

  it('stops at LITE_MAX_W and centres the column', () => {
    const g = liteGeometry(240, false);
    expect(g.w).toBe(LITE_MAX_W);
    expect(g.at).toBe((240 - LITE_MAX_W) / 2);
    expect([g.list, g.detail]).toEqual([77, 79]);
    expect(g.list + 1 + LIST_GAP + g.detail).toBe(LITE_MAX_W);
    expect(g.kindAt).toBe(g.at + Math.floor((LITE_MAX_W - FULL_W) / 2));
  });

  it('keeps the narrow layout below FULL_W, and the switch at FULL_W is small', () => {
    // 60 cells: detail 45 % of the column, the list the rest.
    expect(liteGeometry(62, false)).toMatchObject({ at: 1, w: 60, detail: 27, list: 29 });
    // The desktop floor is 40 cells; a phone has none (ADR 0075 §3.2).
    expect(liteGeometry(30, false)).toMatchObject({ w: 40, detail: 24, list: 12 });
    expect(liteGeometry(30, true)).toMatchObject({ at: 1, w: 28, detail: 24, list: 0 });
    expect(liteGeometry(41, true)).toMatchObject({ at: 1, w: 39, detail: 24, list: 11, kindGap: 1, kindW: 7, kindAt: 1 });
    // 76 → 77 cells: the detail panel gains 3 cells, the list gives 2.
    expect(liteGeometry(78, false)).toMatchObject({ w: 76, list: 38, detail: 34 });
    expect(liteGeometry(79, false)).toMatchObject({ w: 77, list: 36, detail: 37 });
  });
});

describe('the new look (ADR 0128)', () => {
  it('previews a row body on one line, with … when more lines follow', () => {
    expect(previewLine('alias', 'get all')).toBe('get all');
    expect(previewLine('alias', '\n\n  get all;\n  bury')).toBe('get all; …');
    expect(previewLine('action', '{one}')).toBe('{one}');
  });

  it('labels the Key cell and the key chip without brackets', () => {
    expect(keyLabel('')).toEqual({ text: 'Press to bind…', hint: true, custom: false });
    expect(keyLabel('F5')).toEqual({ text: 'F5', hint: false, custom: false });
    expect(keyLabel('\\eOq')).toEqual({ text: 'Numpad 1', hint: false, custom: false });
    expect(keyLabel('nonsense key')).toEqual({ text: 'Custom: nonsense key', hint: true, custom: true });
  });

  it('says the quiet status and the live line', () => {
    expect(statusText('clean', false)).toBe('All saved');
    expect(statusText('clean', true)).toBe('All applied');
    expect(statusText('editing', true)).toBe('Editing');
    expect(statusText('held', false)).toBe('Not applied');
    expect(liveText(true)).toBe('Connected · changes apply to the game');
    expect(liveText(false)).toBe('Not connected · changes are saved');
  });

  it('has a letter for every view and kind, none twice', () => {
    const letters = [...VIEW_LABELS.map((v) => v.letter), ...KINDS.map((k) => KIND_LETTERS[k]), 'n', 'd'];
    expect(new Set(letters).size).toBe(letters.length);
    for (const v of VIEW_LABELS) expect(v.label.toLowerCase()).toContain(v.letter);
    expect(KINDS.map((k) => KIND_LETTERS[k]).join('')).toBe('aigms');
  });

  it('lists the text sections for the rail: kinds, timers, classes and #nop headings, in text order', () => {
    const text = [
      '#nop {Gibur, a warrior.}',
      '',
      '#variable {target} {orc}',
      '',
      '#nop ---- actions ----',
      '#action {x} {',
      '  y',
      '}',
      '#nop not a heading',
      '#alias {a} {b}',
      '',
      '#nop == Fighting ==',
      '#macro {F1} {bash}',
      '#ticker {t} {score} {60}',
      '#class {c} {open}',
      '#alias {z} {zz}',
      '',
    ].join('\n');
    expect(textSections(parseProfile(text))).toEqual([
      { label: 'Gibur, a warrior.', line: 1, type: 'note' },
      { label: 'Variables', line: 3, type: 'kind' },
      // The heading that only names the kind below it is that kind's entry.
      { label: 'Actions', line: 5, type: 'kind' },
      { label: 'Aliases', line: 10, type: 'kind' },
      { label: 'Fighting', line: 12, type: 'note' },
      { label: 'Macros', line: 13, type: 'kind' },
      { label: 'Timers & events', line: 14, type: 'kind' },
      { label: 'Classes', line: 15, type: 'kind' },
    ]);
    expect(textSections(parseProfile(''))).toEqual([]);
  });

  it('shows a highlight pattern without its anchors, wildcards and arguments', () => {
    expect(showsAs('*BASH*')).toBe('BASH');
    expect(showsAs('^%1 enters')).toBe('… enters');
    expect(showsAs('')).toBe('text');
  });

  it('lays the editor out by its own width: 940 and 640 px', () => {
    expect(peLayout(1300)).toBe('wide');
    expect(peLayout(941)).toBe('wide');
    expect(peLayout(940)).toBe('mid');
    expect(peLayout(641)).toBe('mid');
    expect(peLayout(640)).toBe('narrow');
    expect(peLayout(320)).toBe('narrow');
  });
});
