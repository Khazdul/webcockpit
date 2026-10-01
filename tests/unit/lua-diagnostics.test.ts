// The script editor's live errors (stage 10 feedback round 1): Lua and
// header messages to line and columns (src/editor/lua-diagnostics.ts), the
// compile-only check module (src/scripts/check.ts), and the lint mapping.

import { Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import {
  diagnosticText,
  headerDiagnostics,
  nearColumns,
  parseLuaError,
  runtimeDiagnostic,
  syntaxDiagnostic,
} from '../../src/editor/lua-diagnostics';
import { toDiagnostic } from '../../src/editor/lua-lint';
import { checkScript, knownSyntaxProblem, syntaxProblem } from '../../src/scripts/check';

const lines = (s: string) => s.split('\n');

describe('parseLuaError', () => {
  it('reads name:line: text of this script only', () => {
    expect(parseLuaError('looter', "looter:12: attempt to call a nil value (global 'sendd')")).toEqual({
      line: 12,
      message: "attempt to call a nil value (global 'sendd')",
    });
    expect(parseLuaError('looter', 'other:3: x')).toBeNull();
    expect(parseLuaError('looter', 'looter: no line')).toBeNull();
    expect(parseLuaError('a-b', 'a-b:1: multi\nline')).toEqual({ line: 1, message: 'multi\nline' });
  });
});

describe('nearColumns', () => {
  it("finds the token of `near '…'` in the line", () => {
    expect(nearColumns('  x = = 1', "unexpected symbol near '='")).toEqual({ from: 6, to: 7 });
    expect(nearColumns('end)', "')' expected (to close '(' at line 2) near 'end'")).toEqual({ from: 0, to: 3 });
    expect(nearColumns('print("abc', `unfinished string near '"abc'`)).toEqual({ from: 6, to: 10 });
  });

  it('gives null for <eof>, a missing token or no near', () => {
    expect(nearColumns('function f(', "unexpected symbol near <eof>")).toBeNull();
    expect(nearColumns('abc', "unexpected symbol near 'zzz'")).toBeNull();
    expect(nearColumns('abc', 'attempt to call a nil value')).toBeNull();
  });
});

describe('syntaxDiagnostic', () => {
  it('maps a compile error to its line and token', () => {
    const src = 'x = 1\ntempTrigger("x", function()\n  send("y"\nend)';
    expect(syntaxDiagnostic('s', "s:4: ')' expected (to close '(' at line 3) near 'end'", lines(src))).toEqual({
      line: 4,
      from: 0,
      to: 3,
      message: "')' expected (to close '(' at line 3) near 'end'",
      source: 'syntax',
    });
  });

  it('keeps the line in range and takes a message without a line to line 1', () => {
    expect(syntaxDiagnostic('s', "s:9: 'end' expected near <eof>", ['a', 'b'])).toMatchObject({ line: 2, source: 'syntax' });
    expect(syntaxDiagnostic('s', 'not enough memory', ['a'])).toEqual({ line: 1, message: 'not enough memory', source: 'syntax' });
  });

  it('agrees with the runtime: a real compile error lands on the right token', async () => {
    const src = '-- @name t\n-- @api 1\nlocal a = 1\nlocal b = = 2\n';
    const r = await checkScript('t', src);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const d = syntaxDiagnostic('t', r.message, lines(src));
    expect(d).toMatchObject({ line: 4, from: 10, to: 11 });
    expect(diagnosticText(d)).toBe("Ln 4: Syntax error: unexpected symbol near '='");
  });
});

describe('headerDiagnostics', () => {
  it('puts a missing @api on line 1 and a wrong one on its line', () => {
    expect(headerDiagnostics('-- @name x\nprint(1)')).toEqual([
      { line: 1, message: 'Cannot load: the header needs "-- @api 1".', source: 'header' },
    ]);
    expect(headerDiagnostics('-- @name x\n--  @api 2\nprint(1)')).toEqual([
      { line: 2, message: 'Cannot load: it was written for @api 2; this WebCockpit runs @api 1.', source: 'header' },
    ]);
  });

  it('puts bad tag lines on their line, in order', () => {
    const ds = headerDiagnostics('-- @name x\n-- @api 1\n-- @setting d bogus 1\n-- @alias\n');
    expect(ds.map((d) => [d.line, d.message])).toEqual([
      [3, '@setting d: the type must be number, string or boolean.'],
      [4, '@alias needs a name.'],
    ]);
  });

  it('is empty for a good header', () => {
    expect(headerDiagnostics('-- @name x\n-- @api 1\n-- @setting d number 1\nprint(1)')).toEqual([]);
  });
});

describe('runtimeDiagnostic', () => {
  it('marks the line of the saved text the last error names', () => {
    const saved = lines('a\nb\nc');
    expect(runtimeDiagnostic('s', 's:2: boom', saved)).toEqual({ line: 2, message: 'boom', source: 'runtime' });
    expect(diagnosticText(runtimeDiagnostic('s', 's:2: boom', saved)!)).toBe('Ln 2: Runtime error (saved version): boom');
  });

  it('ignores no error, another chunk, no line or a line past the end', () => {
    expect(runtimeDiagnostic('s', null, ['a'])).toBeNull();
    expect(runtimeDiagnostic('s', 'sandbox:2: x', ['a', 'b'])).toBeNull();
    expect(runtimeDiagnostic('s', 's: x', ['a'])).toBeNull();
    expect(runtimeDiagnostic('s', 's:5: x', ['a'])).toBeNull();
  });
});

describe('toDiagnostic', () => {
  const doc = Text.of(['local a = 1', '  send( x )  ', '']);

  it('underlines the token when the columns are known', () => {
    const d = toDiagnostic(doc, { line: 1, from: 6, to: 7, message: 'm', source: 'syntax' });
    expect([d.from, d.to, d.severity, d.markClass]).toEqual([6, 7, 'error', 'wc-diag-syntax']);
    expect(d.message).toBe('Syntax error: m');
  });

  it('otherwise the line text without indent and trailing blanks; a blank line gets a point', () => {
    const d = toDiagnostic(doc, { line: 2, message: 'm', source: 'runtime' });
    expect(doc.sliceString(d.from, d.to)).toBe('send( x )');
    expect(d.markClass).toBe('wc-diag-runtime');
    const e = toDiagnostic(doc, { line: 3, message: 'm', source: 'header' });
    expect(e.from).toBe(e.to);
    // Out of range: the last line.
    expect(toDiagnostic(doc, { line: 9, message: 'm', source: 'syntax' }).from).toBe(doc.line(3).from);
  });
});

describe('check module', () => {
  it('compiles without running and remembers the answer per name and source', async () => {
    expect(knownSyntaxProblem('c', 'x = ')).toBeUndefined();
    const p = await syntaxProblem('c', 'x = ');
    expect(p).toMatch(/^c:1: unexpected symbol near <eof>$/);
    expect(knownSyntaxProblem('c', 'x = ')).toBe(p);
    expect(await syntaxProblem('c', 'error("never runs")')).toBeNull();
    expect(knownSyntaxProblem('c', 'error("never runs")')).toBeNull();
    expect(await checkScript('c', 'local x <close> = nil')).toEqual({
      ok: false,
      kind: 'syntax',
      message: 'c:1: <close> variables are not allowed in scripts',
    });
  });
});
