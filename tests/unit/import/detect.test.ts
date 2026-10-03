import { describe, expect, it } from 'vitest';
import { detectFormat } from '../../../src/import/detect';

const d = (name: string, text: string) => detectFormat([{ name, text }]);

describe('detectFormat', () => {
  it('a #savefile-version first line is Powwow', () => {
    const r = d('mume', '#savefile-version 6\n#alias k=kill $1\n');
    expect(r.format).toBe('powwow');
    expect(r.signals[0]).toBe('first line #savefile-version');
  });

  it('labelled actions and #mark are Powwow without a header', () => {
    expect(d('x', '#action >+hunger You are hungry=eat bread\n').format).toBe('powwow');
    expect(d('x', '#mark ^You=bold red\n').format).toBe('powwow');
    expect(d('x', '#(@xp = 0)\n').format).toBe('powwow');
  });

  it('a .set name or the 3.7 header is JMC', () => {
    expect(d('Default.set', '#alias {k} {kill %1}').format).toBe('jmc');
    expect(d('a.txt', '#multiaction ON\n#alias {k} {kill %1}').format).toBe('jmc');
    expect(d('a.txt', '#action TEXT {^x} {y} {5} {default}').format).toBe('jmc');
    expect(d('a.txt', '#hot {Ctrl+F1} {flee}').format).toBe('jmc');
  });

  it('weak JMC signals need a margin of 2 over tt++', () => {
    // colour-first highlight + %%n + {default}: 3 points against no tt++ signals
    expect(d('a.txt', '#highlight {light red} {x} {default}\n#alias {a} {#var %1 {%%2}}').format).toBe('jmc');
    // one weak signal against tt++ signals stays tt++
    expect(d('a.tin', '#alias {a} {#var %1 {%%2}}\n#class {x} {open}\n#macro {F1} {x}').format).toBe('tintin');
  });

  it('plain tt++ and WebCockpit profiles are tt++', () => {
    const r = d('pvp.tin', '#alias {k} {kill %1}\n#action {^%w arrives} {#showme <118>hi}\n#class {a} {open}\n');
    expect(r.format).toBe('tintin');
    expect(r.signals.length).toBeGreaterThan(0);
    expect(r.signals.length).toBeLessThanOrEqual(3);
    expect(d('empty', '').signals).toEqual(['no foreign signals (tt++ syntax)']);
  });
});
