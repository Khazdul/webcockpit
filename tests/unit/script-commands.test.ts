import { describe, expect, it } from 'vitest';
import { COMMANDS, type CommandEntry, commandByName, resolveCommand } from '../../src/script/commands';

const name = (w: string): string | null => {
  const r = resolveCommand(w);
  return r === null || r === 'ambiguous' ? r : r.name;
};

describe('command table', () => {
  it('is alphabetical with unique names', () => {
    const names = COMMANDS.map((c) => c.name);
    expect([...names].sort()).toEqual(names);
    expect(new Set(names).size).toBe(names.length);
  });

  it('covers the spec §3 tiers, the inert set and the client commands', () => {
    const must = ['alias', 'action', 'highlight', 'substitute', 'gag', 'macro', 'variable', 'ticker', 'delay', 'if', 'elseif', 'else', 'showme', 'nop'];
    for (const n of must) expect(commandByName(n)?.tier, n).toBe('must');
    for (const n of ['unaction', 'unalias', 'unhighlight', 'unsubstitute', 'ungag', 'unmacro', 'unvariable', 'unticker', 'undelay']) {
      expect(commandByName(n), n).toMatchObject({ kind: 'undefine', tier: 'must' });
    }
    for (const n of ['math', 'format', 'class', 'event', 'message']) expect(commandByName(n)?.tier, n).toBe('should');
    for (const n of ['lua', 'system', 'script', 'run', 'read', 'write', 'session', 'zap', 'gts', 'line', 'buffer', 'screen', 'split', 'map', 'config', 'send']) {
      const c = commandByName(n)!;
      expect(c.inert, n).toBe(true);
      expect(c.hint, n).toBeTruthy();
    }
    for (const n of ['connect', 'disconnect', 'reconnect', 'runlog', 'replay', 'help', 'perf']) {
      expect(commandByName(n), n).toMatchObject({ kind: 'client', inert: false });
    }
    expect(commandByName('class')).toMatchObject({ kind: 'command', inert: false });
    expect(commandByName('list')).toMatchObject({ tier: 'unsupported', inert: true });
  });

  it('links define and undefine commands to their rule store', () => {
    expect(commandByName('substitute')?.rule).toBe('substitute');
    expect(commandByName('unvariable')?.rule).toBe('variable');
    expect(commandByName('event')?.rule).toBe('event');
    expect(commandByName('showme')?.rule).toBeUndefined();
  });
});

describe('resolveCommand', () => {
  it('resolves exact names in any case, with or without #', () => {
    expect(name('#VARIABLE')).toBe('variable');
    expect(name('Highlight')).toBe('highlight');
    expect(name('#elseif')).toBe('elseif');
    expect(name('run')).toBe('run');
    expect(name('runlog')).toBe('runlog');
  });

  it('#menu needs its full name and takes no tt++ abbreviation', () => {
    expect(name('#menu')).toBe('menu');
    expect(name('#MENU')).toBe('menu');
    expect(name('#me')).toBe('message');
    expect(name('#men')).toBe(null);
    expect(commandByName('menu')).toMatchObject({ kind: 'client', minAbbrev: 4 });
    expect(commandByName('message')?.minAbbrev).toBe(2);
  });

  it('resolves the short forms real profiles use', () => {
    const cases: Record<string, string> = {
      var: 'variable',
      act: 'action',
      al: 'alias',
      sub: 'substitute',
      show: 'showme',
      hi: 'highlight',
      mac: 'macro',
      tick: 'ticker',
      ses: 'session',
      unact: 'unaction',
      unvar: 'unvariable',
      del: 'delay',
      ev: 'event',
      cl: 'class',
      no: 'nop',
      ma: 'macro',
      mat: 'math',
      el: 'else',
      conn: 'connect',
      con: 'config',
      disc: 'disconnect',
      rec: 'reconnect',
      re: 'read',
      repl: 'replace',
      repla: 'replace',
    };
    for (const [w, n] of Object.entries(cases)) expect(name(w), w).toBe(n);
  });

  it('rejects plurals, unknown words and empty words', () => {
    expect(name('macros')).toBeNull();
    expect(name('#aliases')).toBeNull();
    expect(name('frob')).toBeNull();
    expect(name('')).toBeNull();
    expect(name('#')).toBeNull();
    expect(name('5')).toBeNull();
  });

  it('calls a one-letter word ambiguous when several names start with it', () => {
    expect(name('s')).toBe('ambiguous');
    expect(name('#u')).toBe('ambiguous');
    expect(name('z')).toBe('zap');
    expect(name('i')).toBe('ambiguous');
    expect(name('a')).toBe('ambiguous');
  });

  it('agrees with minAbbrev for every command', () => {
    for (const c of COMMANDS) {
      const short = c.name.slice(0, c.minAbbrev);
      expect((resolveCommand(short) as CommandEntry).name, c.name).toBe(c.name);
      if (c.minAbbrev > 1) expect(name(c.name.slice(0, c.minAbbrev - 1)), c.name).not.toBe(c.name);
    }
  });
});
