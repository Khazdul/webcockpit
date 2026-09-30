import { describe, expect, it } from 'vitest';
import { ArgReader, expandArgs, expandVars, finishText, splitCommands, splitWords } from '../../src/script/engine/text';

describe('splitCommands', () => {
  it('splits at top-level ; only', () => {
    expect(splitCommands('n;e; s ')).toEqual(['n', 'e', 's']);
    expect(splitCommands('#if {1} {a;b};c')).toEqual(['#if {1} {a;b}', 'c']);
    expect(splitCommands('a {x {y;z}} ; b')).toEqual(['a {x {y;z}}', 'b']);
  });

  it('honours escapes and drops empty parts', () => {
    expect(splitCommands('say a\\;b;;look')).toEqual(['say a\\;b', 'look']);
    expect(splitCommands('say \\{;x')).toEqual(['say \\{', 'x']);
    expect(splitCommands(' ; ')).toEqual([]);
  });

  it('keeps newlines inside a command (multi-line bodies)', () => {
    const body = '\n    #if {"%1" != ""}\n    {\n        a;\n        b\n    };\n    c\n';
    expect(splitCommands(body)).toEqual(['#if {"%1" != ""}\n    {\n        a;\n        b\n    }', 'c']);
  });
});

describe('ArgReader', () => {
  it('reads braced and bare arguments', () => {
    const r = new ArgReader(' {a b} c {d {e}} rest of it');
    expect(r.next()).toBe('a b');
    expect(r.next()).toBe('c');
    expect(r.next()).toBe('d {e}');
    expect(r.next('all')).toBe('rest of it');
    expect(r.done).toBe(true);
    expect(r.next()).toBe('');
  });

  it('takes the braced part only for "all" when braced', () => {
    const r = new ArgReader('{x} {y} {5}');
    expect(r.next()).toBe('x');
    expect(r.next('all')).toBe('y');
    expect(r.next()).toBe('5');
  });

  it('skips newlines between arguments and tolerates an unclosed brace', () => {
    const r = new ArgReader('{a}\n  {\n b\n}');
    expect(r.next()).toBe('a');
    expect(r.next()).toBe('\n b\n');
    expect(new ArgReader('{open').next()).toBe('open');
  });

  it('splits alias words brace-aware', () => {
    expect(splitWords('orc {big troll}  x')).toEqual(['orc', 'big troll', 'x']);
    expect(splitWords('')).toEqual([]);
  });
});

describe('expandArgs', () => {
  const args = ['all of it', 'one', 'two'];
  it('replaces %0-%99 and blanks missing ones', () => {
    expect(expandArgs('say %1 and %2 (%0) %3!', args)).toBe('say one and two (all of it) !');
    const many = Array.from({ length: 12 }, (_, i) => `a${i}`);
    expect(expandArgs('%10 %11 %1', many)).toBe('a10 a11 a1');
  });

  it('%%n loses one % and is not replaced (nested definitions)', () => {
    expect(expandArgs('#action {%%1 hits} {say %%1 %1}', args)).toBe('#action {%1 hits} {say %1 one}');
    expect(expandArgs('%%%1', args)).toBe('%%1');
  });

  it('leaves other % codes alone', () => {
    expect(expandArgs('#format x {%d %s %%U}', args)).toBe('#format x {%d %s %%U}');
    expect(expandArgs('100%', args)).toBe('100%');
  });

  it('returns the same string when nothing changes, and skips escaped %', () => {
    const b = 'no args here';
    expect(expandArgs(b, args)).toBe(b);
    expect(expandArgs('\\%1 %1', args)).toBe('\\%1 one');
  });
});

describe('expandVars', () => {
  const vars = new Map([
    ['target', '*elf*'],
    ['a_b', 'x'],
    ['empty', ''],
  ]);
  const look = (n: string) => vars.get(n);

  it('replaces $name and ${name}; unknown stays', () => {
    expect(expandVars('bash $target now', look)).toBe('bash *elf* now');
    expect(expandVars('${a_b}y $a_b', look)).toBe('xy x');
    expect(expandVars('costs $5 and $nope', look)).toBe('costs $5 and $nope');
    expect(expandVars('[$empty]', look)).toBe('[]');
  });

  it('&name is 1 for a defined variable and stays otherwise', () => {
    expect(expandVars('&target &{empty} &nope salt&pepper', look)).toBe('1 1 &nope salt&pepper');
  });

  it('$$name and \\$name are not replaced', () => {
    expect(expandVars('$$target', look)).toBe('$target');
    expect(expandVars('\\$target', look)).toBe('\\$target');
    expect(expandVars('end$', look)).toBe('end$');
  });
});

describe('finishText', () => {
  it('removes escapes for ; { } $ % & and \\', () => {
    expect(finishText('say a\\;b \\{x\\} \\$y \\% \\& \\\\ \\n')).toBe('say a;b {x} $y % & \\ \\n');
  });
  it('joins lines of a multi-line body with one space', () => {
    expect(finishText('get\n      all')).toBe('get all');
  });
});
