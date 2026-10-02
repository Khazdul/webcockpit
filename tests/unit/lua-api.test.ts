// The script editor's API docs, completion, hover and Lua indent
// (stage 10 P2, ADR 0051).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEADER_TAGS, SCRIPT_API, apiDoc, completeLua, lineContext, nameAt } from '../../src/editor/lua-api';
import { LUA_KEYWORDS, LUA_REF, LUA_SYNTAX } from '../../src/editor/lua-ref';
import { luaIndent, luaTokens, opensBlock, startsWithCloser } from '../../src/editor/lua-indent';

const names = (r: ReturnType<typeof completeLua>) => r?.options.map((o) => o.name) ?? null;

describe('API docs', () => {
  it('documents every function and view the host defines, and nothing it does not', () => {
    const host = readFileSync(new URL('../../src/scripts/host.ts', import.meta.url), 'utf8');
    const defined = [...host.matchAll(/rt\.define(?:Function|View|Table)\('(\w+)'/g)].map((m) => m[1]!);
    expect(defined.length).toBeGreaterThan(20);
    const documented = new Set(SCRIPT_API.map((d) => d.name));
    for (const n of defined) expect(documented, n).toContain(n);
    const globals = SCRIPT_API.filter((d) => !d.name.includes('.') && d.kind !== 'variable').map((d) => d.name);
    for (const n of globals) expect(defined, n).toContain(n);
  });

  it('every API entry has a signature that starts with its name and a doc', () => {
    for (const d of [...SCRIPT_API, ...HEADER_TAGS]) {
      expect(d.doc.length, d.name).toBeGreaterThan(10);
      if (d.kind === 'function') expect(d.sig.startsWith(`${d.name}(`), d.name).toBe(true);
    }
    const all = [...SCRIPT_API, ...LUA_REF, ...LUA_KEYWORDS, ...LUA_SYNTAX, ...HEADER_TAGS].map((d) => d.name);
    expect(new Set(all).size).toBe(all.length);
    expect(apiDoc('store.set')?.sig).toBe('store.set(key, value)');
    expect(apiDoc('@setting')?.kind).toBe('tag');
    expect(apiDoc('os.execute')).toBeNull();
  });
});

describe('completion', () => {
  it('completes global names by prefix, API names first', () => {
    expect(names(completeLua('sen'))).toEqual(['send']);
    expect(completeLua('  sen')?.from).toBe(2);
    const t = names(completeLua('t'))!;
    expect(t.slice(0, 4)).toEqual(['tempTrigger', 'tempRegexTrigger', 'tempAlias', 'tempKey']);
    expect(t).toContain('tostring');
    expect(t.indexOf('tostring')).toBeGreaterThan(t.indexOf('tempTimer'));
    expect(names(completeLua('x = getV'))).toEqual(['getVariable']);
  });

  it('completes members after a dot', () => {
    expect(names(completeLua('store.'))).toEqual(['store.get', 'store.set']);
    expect(completeLua('store.')?.from).toBe(0);
    expect(names(completeLua('local s = string.fo'))).toEqual(['string.format']);
    expect(completeLua('foo.')).toBeNull();
  });

  it('completes header tags in a header comment', () => {
    expect(names(completeLua('-- @se'))).toEqual(['@setting']);
    expect(completeLua('-- @se')?.from).toBe(3);
    expect(names(completeLua('--@'))).toHaveLength(HEADER_TAGS.length);
  });

  it('stays quiet in strings, comments, numbers and on an empty word', () => {
    expect(completeLua('send("sen')).toBeNull();
    expect(completeLua('x = 1 -- sen')).toBeNull();
    expect(completeLua('x = 12')).toBeNull();
    expect(completeLua('x = ')).toBeNull();
    expect(completeLua('x = ', true)?.options.length).toBeGreaterThan(30);
    expect(lineContext('a = "x\\"y')).toBe('string');
    expect(lineContext("a = 'x' -- c")).toBe('comment');
    expect(lineContext('a = "--"')).toBe('code');
  });
});

describe('hover', () => {
  it('finds the API name under the cursor', () => {
    const line = '  send("kill " .. matches[2])';
    expect(nameAt(line, 4)).toMatchObject({ from: 2, to: 6, doc: { name: 'send' } });
    expect(nameAt(line, 20)?.doc.name).toBe('matches');
    expect(nameAt(line, 10)).toBeNull(); // in the string
    expect(nameAt('store.set("k", 1)', 1)?.doc.name).toBe('store');
    expect(nameAt('store.set("k", 1)', 7)).toMatchObject({ from: 0, to: 9, doc: { name: 'store.set' } });
    expect(nameAt('x = gmcp.Char.Vitals.hp', 15)?.doc.name).toBe('gmcp');
    expect(nameAt('-- @setting delay number 1', 6)?.doc.name).toBe('@setting');
    expect(nameAt('local x = 1', 7)).toBeNull();
  });
});

describe('Lua indent', () => {
  it('tokenizes words and brackets outside strings and comments', () => {
    expect(luaTokens('tempTrigger("a (b", function() -- end')).toEqual(['tempTrigger', '(', 'function', '(', ')']);
    expect(luaTokens('x = [[ end ]] .. y')).toEqual(['x', 'y']);
  });

  it('indents one level after a line that opens a block, whatever it opens with', () => {
    expect(opensBlock('tempTrigger("x", function()')).toBe(true);
    expect(opensBlock('if a then')).toBe(true);
    expect(opensBlock('if a then return end')).toBe(false);
    expect(opensBlock('else')).toBe(true);
    expect(opensBlock('elseif b then')).toBe(true);
    expect(opensBlock('end)')).toBe(false);
    expect(opensBlock('local t = {')).toBe(true);
    expect(opensBlock('send("(")')).toBe(false);
    expect(startsWithCloser('  end)')).toBe(true);
    expect(startsWithCloser('ending = 1')).toBe(false);
    expect(luaIndent({ text: 'tempTrigger("x", function()', indent: 0 }, '', 2)).toBe(2);
    expect(luaIndent({ text: '  send("x")', indent: 2 }, 'end)', 2)).toBe(0);
    expect(luaIndent({ text: '  send("x")', indent: 2 }, '', 2)).toBe(2);
    expect(luaIndent(null, '', 2)).toBe(0);
  });
});
