// Stage 10 feedback round 4: the script editor as a code editor. Block
// auto-close on Enter (src/editor/lua-blocks.ts), the case auto-correct
// of known names (src/editor/lua-case.ts) and the hold-back of live
// errors while typing (src/editor/lua-holdback.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoCloseAt, luaLex } from '../../src/editor/lua-blocks';
import { caseCorrection, canonicalName, definedNames } from '../../src/editor/lua-case';
import { type ScriptDiagnostic, syntaxDiagnostic } from '../../src/editor/lua-diagnostics';
import { checkScript } from '../../src/scripts/check';
import { HOLD_IDLE_MS, HoldBack, holdReason } from '../../src/editor/lua-holdback';

/** `text` with `|` as the cursor: the text after Enter there, `|` the new cursor; null for a plain Enter. */
function enter(withCursor: string): string | null {
  const pos = withCursor.indexOf('|');
  const text = withCursor.slice(0, pos) + withCursor.slice(pos + 1);
  const r = autoCloseAt(text, pos);
  if (!r) return null;
  const out = text.slice(0, r.from) + r.insert + text.slice(r.to);
  return out.slice(0, r.cursor) + '|' + out.slice(r.cursor);
}

describe('luaLex', () => {
  it('keeps keywords in strings, long strings and comments out of the code', () => {
    const t = luaLex('x = "end" .. [==[\nif ]==] -- do\n--[[ function\n]] y');
    expect(t.filter((k) => k.type === 'keyword')).toEqual([]);
    expect(t.map((k) => k.type)).toEqual(['name', 'op', 'string', 'op', 'string', 'comment', 'comment', 'name']);
  });
  it('ends an unfinished quoted string at the line end', () => {
    const t = luaLex('s = "abc\nend');
    expect(t.at(-1)).toMatchObject({ type: 'keyword', text: 'end' });
  });
});

describe('autoCloseAt', () => {
  it('closes function, if, for, while, do and repeat', () => {
    expect(enter('function test()|')).toBe('function test()\n  |\nend');
    expect(enter('local function f(a, b)|')).toBe('local function f(a, b)\n  |\nend');
    expect(enter('x = function()|')).toBe('x = function()\n  |\nend');
    expect(enter('if hp < 30 then|')).toBe('if hp < 30 then\n  |\nend');
    expect(enter('for i = 1, 3 do|')).toBe('for i = 1, 3 do\n  |\nend');
    expect(enter('while busy do|')).toBe('while busy do\n  |\nend');
    expect(enter('do|')).toBe('do\n  |\nend');
    expect(enter('repeat|')).toBe('repeat\n  |\nuntil ');
  });
  it('closes the call around a function argument: moves closeBrackets\' ")" or adds it', () => {
    expect(enter('tempTrigger("x", function()|)')).toBe('tempTrigger("x", function()\n  |\nend)');
    expect(enter('tempTrigger("x", function()|')).toBe('tempTrigger("x", function()\n  |\nend)');
    expect(enter('t = { f = function()|')).toBe('t = { f = function()\n  |\nend}');
  });
  it('keeps the indentation of the opener line', () => {
    expect(enter('function a()\n  if x then|\nend')).toBe('function a()\n  if x then\n    |\n  end\nend');
  });
  it('does nothing for a block that is closed already', () => {
    expect(enter('function test()|\n  echo("hi")\nend')).toBeNull();
    expect(enter('tempTrigger("x", function()|\nend)')).toBeNull();
    expect(enter('if x then|\nelse\nend')).toBeNull();
    expect(enter('repeat|\n  x = x + 1\nuntil x > 3')).toBeNull();
    expect(enter('for i = 1, 3 do|\n  if i then send("x") end\nend')).toBeNull();
  });
  it('closes a block an outer closer pops (shallower), or that nothing closes', () => {
    expect(enter('function a()\n  if x then|\nend')).toBe('function a()\n  if x then\n    |\n  end\nend');
    expect(enter('if a then\nend\nfunction b()|\nlocal z = 1')).toBe('if a then\nend\nfunction b()\n  |\nend\nlocal z = 1');
  });
  it('does nothing for an unfinished header, else, elseif, or mid-line', () => {
    expect(enter('if x|')).toBeNull();
    expect(enter('function test(|)')).toBeNull();
    expect(enter('if x then\n  a()\nelse|\nend')).toBeNull();
    expect(enter('if x then\n  a()\nelseif y then|\nend')).toBeNull();
    expect(enter('if x |then')).toBeNull();
    expect(enter('if x then return end|')).toBeNull();
    expect(enter('x = 1|')).toBeNull();
  });
  it('ignores keywords in strings and comments, and a cursor inside one', () => {
    expect(enter('echo("if x then")|')).toBeNull();
    expect(enter('-- for i = 1, 3 do|')).toBeNull();
    expect(enter('if x then -- check|')).toBe('if x then -- check\n  |\nend');
    expect(enter('s = [[\nif x then|\n]]')).toBeNull();
    expect(enter('function f()| -- "end"')).toBeNull();
  });
});

describe('case correction', () => {
  const fix = (withCursor: string, refused: Set<string> = new Set()) => {
    const pos = withCursor.indexOf('|');
    const text = withCursor.slice(0, pos) + withCursor.slice(pos + 1);
    return caseCorrection(text, pos, refused)?.canonical ?? null;
  };
  it('knows API and Lua names in any case', () => {
    expect(canonicalName('TEMPTRIGGER')).toBe('tempTrigger');
    expect(canonicalName('String.Format')).toBe('string.format');
    expect(canonicalName('nosuchname')).toBeNull();
    expect(canonicalName('@name')).toBeNull();
    expect(canonicalName('End')).toBeNull();
  });
  it('corrects a finished word: API names, libraries, dotted names', () => {
    expect(fix('temptrigger|(')).toBe('tempTrigger');
    expect(fix('String|.')).toBe('string');
    expect(fix('x = string.Format|(')).toBe('string.format');
    expect(fix('  Send| ')).toBe('send');
    expect(fix('tempTrigger|(')).toBeNull();
  });
  it('leaves strings, comments, fields and methods alone', () => {
    expect(fix('echo("temptrigger|(")')).toBeNull();
    expect(fix('-- temptrigger|(')).toBeNull();
    expect(fix('obj.Send|(')).toBeNull();
    expect(fix('line:Upper|(')).toBeNull();
    expect(fix('t[1].Format|(')).toBeNull();
    expect(fix('s = [[\nSend|(\n]]')).toBeNull();
  });
  it('leaves a spelling the script defines', () => {
    expect(fix('local temptrigger| ')).toBeNull();
    expect(fix('local function Send(x) end\nSend|(')).toBeNull();
    expect(fix('function f(Echo)\n  Echo|(')).toBeNull();
    expect(fix('for Echo, v in pairs(t) do Echo|(')).toBeNull();
    expect(fix('Send = print\nSend|(')).toBeNull();
    expect(fix('local String = {}\nString|.')).toBeNull();
    // Only that exact spelling: another case is still corrected.
    expect(fix('local send2 = 1\nSEND|(')).toBe('send');
  });
  it('never corrects a refused spelling', () => {
    expect(fix('temptrigger|(', new Set(['temptrigger']))).toBeNull();
    expect(fix('TempTrigger|(', new Set(['temptrigger']))).toBe('tempTrigger');
  });
  it('finds what the script defines', () => {
    const names = definedNames(luaLex('local a, b <const> = 1\nfunction M.f(x, y) end\nfor i = 1, 2 do end\nz = 1\nt.k = 2\nif q == 1 then end'));
    expect([...names].sort()).toEqual(['M', 'a', 'b', 'i', 'x', 'y', 'z']);
  });
});

describe('holdReason', () => {
  const lines = ['-- @api 1', 'function test()', '  echo("hi")', '', 'tempAlias("x", f)'];
  const d = (line: number, message: string, source: ScriptDiagnostic['source'] = 'syntax', from?: number): ScriptDiagnostic => ({
    line,
    message,
    source,
    ...(from !== undefined ? { from, to: from + 1 } : {}),
  });
  it('holds unfinished code wherever the cursor is', () => {
    expect(holdReason(d(5, "'end' expected (to close 'function' at line 2) near <eof>"), { line: 1, col: 0 }, lines)).toBe('unfinished');
    expect(holdReason(d(5, "unfinished long string (starting at line 3) near '<eof>'"), { line: 1, col: 0 }, lines)).toBe('unfinished');
  });
  it('holds an error on the cursor line, of an opener on it, or on the next line of code', () => {
    expect(holdReason(d(3, "unfinished string near '\"hi'"), { line: 3, col: 5 }, lines)).toBe('cursor');
    expect(holdReason(d(5, "')' expected (to close '(' at line 3) near 'tempAlias'"), { line: 3, col: 5 }, lines)).toBe('cursor');
    expect(holdReason(d(5, "'then' expected near 'tempAlias'", 'syntax', 0), { line: 3, col: 12 }, lines)).toBe('cursor');
  });
  it('shows errors elsewhere, and never holds runtime errors', () => {
    expect(holdReason(d(5, "'=' expected near 'f'", 'syntax', 15), { line: 2, col: 0 }, lines)).toBeNull();
    expect(holdReason(d(5, "'then' expected near 'tempAlias'", 'syntax', 0), { line: 2, col: 2 }, lines)).toBeNull();
    expect(holdReason(d(3, 'attempt to call a nil value', 'runtime'), { line: 3, col: 0 }, lines)).toBeNull();
    // A stray `end` far below is not unfinished code.
    expect(holdReason(d(5, "<eof> expected near 'end'"), { line: 2, col: 0 }, lines)).toBeNull();
    expect(holdReason(d(1, 'Cannot load: x', 'header'), { line: 3, col: 0 }, lines)).toBeNull();
    expect(holdReason(d(1, 'Cannot load: x', 'header'), { line: 1, col: 3 }, lines)).toBe('cursor');
  });
});

describe('HoldBack', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const lines = ['x = 1', 'if x', 'y = 2', 'z = = 3'];
  const here: ScriptDiagnostic = { line: 2, message: "'then' expected near 'y'", source: 'syntax' };
  const there: ScriptDiagnostic = { line: 4, message: "unexpected symbol near '='", source: 'syntax' };

  it('shows everything when idle (the editor just opened)', () => {
    const h = new HoldBack(() => {});
    expect(h.filter([here, there], { line: 2, col: 4 }, lines)).toEqual([here, there]);
  });
  it('holds the error being typed, shows the others, releases after the idle time', () => {
    const onIdle = vi.fn();
    const h = new HoldBack(onIdle);
    h.edited();
    expect(h.typing).toBe(true);
    expect(h.filter([here, there], { line: 2, col: 4 }, lines)).toEqual([there]);
    vi.advanceTimersByTime(HOLD_IDLE_MS - 1);
    h.edited(); // still typing: the idle time starts again
    vi.advanceTimersByTime(HOLD_IDLE_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(h.filter([here, there], { line: 2, col: 4 }, lines)).toEqual([here, there]);
  });
  it('releases when the cursor leaves the line', () => {
    const h = new HoldBack(() => {});
    h.edited();
    expect(h.filter([here], { line: 2, col: 4 }, lines)).toEqual([]);
    expect(h.filter([here], { line: 3, col: 0 }, lines)).toEqual([here]);
    // Shown once, it stays while the user types on its line again.
    h.edited();
    expect(h.filter([{ ...here, line: 2 }], { line: 2, col: 4 }, lines)).toEqual([here]);
    // Fixed: gone; when it comes back while typing there, it is held again.
    expect(h.filter([], { line: 2, col: 4 }, lines)).toEqual([]);
    expect(h.filter([here], { line: 2, col: 4 }, lines)).toEqual([]);
    h.dispose();
  });
  it('keeps a shown error whose line numbers moved', () => {
    const h = new HoldBack(() => {});
    const eof = (n: number): ScriptDiagnostic => ({ line: n, message: `'end' expected (to close 'function' at line ${n - 2}) near <eof>`, source: 'syntax' });
    expect(h.filter([eof(5)], { line: 1, col: 0 }, lines)).toHaveLength(1);
    h.edited();
    expect(h.filter([eof(6)], { line: 1, col: 0 }, lines)).toHaveLength(1);
  });
  it('reveals everything on save', () => {
    const h = new HoldBack(() => {});
    h.edited();
    expect(h.filter([here], { line: 2, col: 4 }, lines)).toEqual([]);
    h.reveal();
    expect(h.filter([here], { line: 2, col: 4 }, lines)).toEqual([here]);
  });
});

describe('hold-back with the real compiler', () => {
  const HEAD = '-- @name t\n-- @api 1\n\n';
  const TAIL = '\ntempAlias("^x$", function() send("y") end)\n';
  /** Types `keys` (`\n` is Enter with the auto-close) one at a time after HEAD, before `tail`; every error on the way must be held. */
  async function typeThrough(keys: string, tail: string, closeBrackets: boolean): Promise<string> {
    let text = HEAD + tail;
    let pos = HEAD.length;
    for (const k of keys) {
      if (k === '\n') {
        const r = autoCloseAt(text, pos);
        if (r) {
          text = text.slice(0, r.from) + r.insert + text.slice(r.to);
          pos = r.cursor;
        } else {
          text = text.slice(0, pos) + '\n' + text.slice(pos);
          pos++;
        }
      } else if (closeBrackets && (k === ')' || k === '"') && text[pos] === k) pos++;
      else {
        const pair = closeBrackets ? ({ '(': ')', '"': '"' } as Record<string, string>)[k] ?? '' : '';
        text = text.slice(0, pos) + k + pair + text.slice(pos);
        pos++;
      }
      const r = await checkScript('t', text);
      if (r.ok) continue;
      const lines = text.split('\n');
      const d = syntaxDiagnostic('t', r.message, lines);
      const before = text.slice(0, pos).split('\n');
      const cursor = { line: before.length, col: before.at(-1)!.length };
      expect(holdReason(d, cursor, lines), `after ${JSON.stringify(text.slice(0, pos))}: ${r.message}`).not.toBeNull();
    }
    return text;
  }
  it('function test() Enter echo("hi"): at the end of the script and above other code', async () => {
    for (const cb of [true, false]) {
      expect(await typeThrough('function test()\necho("hi")', '', cb)).toBe(HEAD + 'function test()\n  echo("hi")\nend');
      expect(await typeThrough('function test()\necho("hi")', TAIL, cb)).toBe(HEAD + 'function test()\n  echo("hi")\nend' + TAIL);
      expect(await typeThrough('if hp then\nsend("flee")', TAIL, cb)).toBe(HEAD + 'if hp then\n  send("flee")\nend' + TAIL);
      expect(await typeThrough('tempTrigger("x", function()\nsend("y")', TAIL, cb)).toContain('tempTrigger("x", function()\n  send("y")\nend)');
      await typeThrough('local x = 1 + 2', TAIL, cb);
    }
  }, 30_000);
});
