import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { ProfileStore } from '../../src/profiles';
import { stripSend } from '../../src/profiles/migrate';

describe('stripSend (ADR 0040)', () => {
  it('drops _send where it starts a command', () => {
    expect(stripSend('#alias {c} {_send close $sd1}\n')).toBe('#alias {c} {close $sd1}\n');
    expect(stripSend('#ALIAS {cc}\n{\n    _send close $sd1;\n    _send lock $sd1\n}\n')).toBe(
      '#ALIAS {cc}\n{\n    close $sd1;\n    lock $sd1\n}\n',
    );
    expect(stripSend('#alias {x} {a; _send b;_send c}')).toBe('#alias {x} {a; b;c}');
    expect(stripSend('#if {1} { _send yes }')).toBe('#if {1} { yes }');
    expect(stripSend('_send look\r\n_send\texits\r\n')).toBe('look\r\nexits\r\n');
  });

  it('leaves everything else alone', () => {
    for (const t of [
      '#alias {k} {kill %1}\n',
      '#alias {x} {say _send me}\n',
      '#alias {my_send} {say hi}\n',
      '#alias {_sender} {say hi}\n',
      '#variable {_send} {1}\n',
      '#nop uses _send no more\n',
    ])
      expect(stripSend(t)).toBe(t);
  });

  it('cleans stored profiles at init and imported files', async () => {
    const factory = new IDBFactory();
    const a = new ProfileStore({ factory });
    await a.init();
    await a.save('default', '#alias {o} {_send open exit}\n');
    await a.close();
    const b = new ProfileStore({ factory });
    await b.init();
    expect((await b.get('default'))?.text).toBe('#alias {o} {open exit}\n');
    const name = await b.importFile('old.tin', '#macro {F5} {_send flee}\n');
    expect((await b.get(name))?.text).toBe('#macro {F5} {flee}\n');
    await b.close();
  });
});
