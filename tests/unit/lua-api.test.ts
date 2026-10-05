// The script editor's API docs, completion, hover and Lua indent
// (stage 10 P2, ADR 0051).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEADER_TAGS, SCRIPT_API, apiDoc, completeLua, lineContext, stillCompletes, nameAt } from '../../src/editor/lua-api';
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
    const globals = SCRIPT_API.filter((d) => !/[.:]/.test(d.name) && d.kind !== 'variable').map((d) => d.name);
    for (const n of globals) expect(defined, n).toContain(n);
  });

  it('documents every pane method the host defines (ADR 0053), and nothing else', () => {
    const host = readFileSync(new URL('../../src/scripts/host.ts', import.meta.url), 'utf8');
    const block = host.slice(host.indexOf("rt.defineClass('Pane', {"), host.indexOf("rt.defineFunction('createPane'"));
    const methods = [...block.matchAll(/^ {6}(\w+): \(a\) =>/gm)].map((m) => `pane:${m[1]!}`);
    expect(methods.length).toBeGreaterThan(10);
    const documented = SCRIPT_API.filter((d) => d.name.startsWith('pane:')).map((d) => d.name);
    expect(documented.sort()).toEqual(methods.sort());
    for (const n of documented) expect(apiDoc(n)?.params?.[0]?.name, n).toBe('pane');
  });

  it('every API entry has a signature that starts with its name and a doc', () => {
    for (const d of [...SCRIPT_API, ...HEADER_TAGS]) {
      expect(d.doc.length, d.name).toBeGreaterThan(10);
      if (d.kind === 'function') expect(d.sig.startsWith(`${d.name}(`) || d.sig.startsWith(`${d.name}{`), d.name).toBe(true);
    }
    const all = [...SCRIPT_API, ...LUA_REF, ...LUA_KEYWORDS, ...LUA_SYNTAX, ...HEADER_TAGS].map((d) => d.name);
    expect(new Set(all).size).toBe(all.length);
    expect(apiDoc('store.set')?.sig).toBe('store.set(key, value)');
    expect(apiDoc('@setting')?.kind).toBe('tag');
    expect(apiDoc('os.execute')).toBeNull();
  });
});

describe('text field methods (ADR 0055)', () => {
  it('documents every field method the host defines, and nothing else', () => {
    const host = readFileSync(new URL('../../src/scripts/host.ts', import.meta.url), 'utf8');
    const block = host.slice(host.indexOf("rt.defineClass('PaneField', {"), host.indexOf("rt.defineClass('PaneToggle', {"));
    const methods = [...block.matchAll(/^ {6}(\w+): \(a\) =>/gm)].map((m) => `field:${m[1]!}`);
    expect(methods.sort()).toEqual(['field:focus', 'field:remove', 'field:select', 'field:setValue', 'field:value']);
    const documented = SCRIPT_API.filter((d) => d.name.startsWith('field:')).map((d) => d.name);
    expect(documented.sort()).toEqual(methods);
  });

  it('complete after a receiver named like a field', () => {
    expect(names(completeLua('nameField:s'))).toEqual(['field:select', 'field:setValue']);
    expect(names(completeLua('input:f'))).toEqual(['field:focus']);
    expect(nameAt('f:setValue("")', 3)?.doc.name).toBe('field:setValue');
  });
});

describe('checkbox and radio methods (ADR 0077 §B)', () => {
  it('documents every toggle method the host defines, and nothing else; completes after a receiver named like one', () => {
    const host = readFileSync(new URL('../../src/scripts/host.ts', import.meta.url), 'utf8');
    const block = host.slice(host.indexOf("rt.defineClass('PaneToggle', {"), host.indexOf("rt.defineClass('Pane', {"));
    const methods = [...block.matchAll(/^ {6}(\w+): \(a\) =>/gm)].map((m) => `toggle:${m[1]!}`);
    expect(methods.sort()).toEqual(['toggle:checked', 'toggle:remove', 'toggle:set']);
    const documented = SCRIPT_API.filter((d) => d.name.startsWith('toggle:')).map((d) => d.name);
    expect(documented.sort()).toEqual(methods);
    expect(names(completeLua('caseBox:c'))).toEqual(['toggle:checked']);
    expect(names(completeLua('radio:s'))).toEqual(['toggle:set']);
    expect(nameAt('cs:checked()', 4)?.doc.name).toBe('toggle:checked');
  });
});

describe('pane methods (ADR 0053)', () => {
  it('complete after a pane receiver, never as globals; hover finds them after a colon', () => {
    expect(names(completeLua('pane:se'))).toEqual(['pane:setLine', 'pane:setLink', 'pane:setHover', 'pane:setText', 'pane:setInput', 'pane:setCheckbox', 'pane:setRadio', 'pane:setTitle', 'pane:setGrip']);
    expect(completeLua('myPane:g')?.method).toBe(true);
    expect(names(completeLua('line:up'))).toEqual(['string.upper']);
    expect(names(completeLua('pane'))).toBeNull();
    expect(nameAt('p:gauge(1, {})', 3)?.doc.name).toBe('pane:gauge');
    expect(nameAt('s:find("x")', 3)?.doc.name).toBe('string.find');
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

  it('opens the members right after a dot or colon (round 5)', () => {
    for (const lib of ['math', 'string', 'table', 'utf8', 'coroutine', 'store']) {
      const r = names(completeLua(`x = ${lib}.`))!;
      expect(r.length).toBeGreaterThan(1);
      expect(r.every((n) => n.startsWith(`${lib}.`))).toBe(true);
    }
    expect(names(completeLua('math.'))).toHaveLength(27);
    expect(names(completeLua('math.'))).toContain('math.ult');
    expect(names(completeLua('gmcp.'))).toEqual(['gmcp.Char', 'gmcp.Comm', 'gmcp.Event', 'gmcp.Group', 'gmcp.Room']);
    expect(names(completeLua('local v = gmcp.Char.'))).toEqual(['gmcp.Char.Name', 'gmcp.Char.Vitals', 'gmcp.Char.StatusVars']);
    expect(names(completeLua('gmcp.Comm.Channel.T'))).toEqual(['gmcp.Comm.Channel.Text']);
    expect(names(completeLua('gmcp.char.v'))).toEqual(['gmcp.Char.Vitals']);
    expect(completeLua('gmcp.Char.Vitals.')).toBeNull();
    expect(names(completeLua('state.'))).toEqual(['state.char', 'state.group', 'state.room']);
    expect(names(completeLua('state.char.'))).toContain('state.char.vitals');
    expect(names(completeLua('Math.ab'))).toEqual(['math.abs']);
    // After `..` a name completes again.
    expect(names(completeLua('echo(x..math.fl'))).toEqual(['math.floor']);
    // String methods after `x:`.
    expect(names(completeLua('line:'))).toContain('string.upper');
    expect(completeLua('line:')?.method).toBe(true);
  });

  it('lists the script\'s own settings after settings.', () => {
    const settings = [
      { name: 'delay', type: 'number' as const, default: 0.5, label: 'Seconds before looting' },
      { name: 'auto', type: 'boolean' as const, default: true, label: '' },
    ];
    const r = completeLua('if settings.', false, settings)!;
    expect(names(r)).toEqual(['settings.delay', 'settings.auto']);
    expect(r.options[0]!.doc).toBe('Seconds before looting');
    expect(names(completeLua('settings.a', false, settings))).toEqual(['settings.auto']);
    expect(completeLua('settings.')).toBeNull();
  });

  it('does not open after a dot in a number, a string, a comment or after ..', () => {
    expect(completeLua('x = 1.')).toBeNull();
    expect(completeLua('x = 1.5')).toBeNull();
    expect(completeLua('send("a.')).toBeNull();
    expect(completeLua("send('math.")).toBeNull();
    expect(completeLua('-- see math.')).toBeNull();
    expect(completeLua('x = y..')).toBeNull();
    expect(completeLua('x = "a" ..')).toBeNull();
    expect(completeLua('::')).toBeNull();
  });

  it('keeps a list only while more word characters follow the word it was asked for (round 6)', () => {
    expect(stillCompletes('ma', 'mat')).toBe(true);
    expect(stillCompletes('math.', 'math.ab')).toBe(true);
    expect(stillCompletes('gmcp.Char.Vi', 'gmcp.Char.Vit')).toBe(true);
    expect(stillCompletes('@se', '@set')).toBe(true);
    expect(stillCompletes('', 'x')).toBe(true);
    // A dot asks again.
    expect(stillCompletes('math', 'math.')).toBe(false);
    expect(stillCompletes('math.', 'math.a.')).toBe(false);
    // Backspace asks again: a list for a longer word must not stand for a shorter one.
    expect(stillCompletes('gmcp.Comm', 'gmcp.Com')).toBe(false);
    expect(stillCompletes('gmcp.Comm', 'gmcp.')).toBe(false);
    expect(stillCompletes('gmcp.Comm.Channel.', 'gmcp.')).toBe(false);
    expect(stillCompletes('string.form', 'string.')).toBe(false);
    expect(stillCompletes('math.fl', 'math.f')).toBe(false);
  });

  it('has candidates at every step of the paths the e2e backspaces through (round 6)', () => {
    for (const path of ['gmcp.comm.channel.li', 'string.form', 'x = math.flo', 'state.char.', 'gmcp.Comm.Channel.', 'x:up']) {
      const start = path.indexOf('=') >= 0 ? 5 : 1;
      for (let i = path.length; i >= start; i--) expect(completeLua(path.slice(0, i)), path.slice(0, i)).not.toBeNull();
    }
    expect(names(completeLua('gmcp.'))).toHaveLength(5);
    expect(names(completeLua('x:'))!.length).toBeGreaterThan(10);
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
