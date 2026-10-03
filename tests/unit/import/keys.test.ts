import { describe, expect, it } from 'vitest';
import { jmcKey, sequenceKey, unescapeSequence } from '../../../src/import/keys';

const key = (r: ReturnType<typeof jmcKey>) => (r.ok ? r.key : null);

describe('jmcKey', () => {
  it('maps JMC key names and modifiers', () => {
    expect(key(jmcKey('Ctrl+F1'))).toBe('Ctrl+F1');
    expect(key(jmcKey('Alt+A'))).toBe('Alt+A');
    expect(key(jmcKey('NUM8'))).toBe('Numpad8');
    expect(key(jmcKey('Shift+PGUP'))).toBe('Shift+PageUp');
    expect(key(jmcKey('NUMDEL'))).toBe('NumpadDecimal');
    expect(key(jmcKey('ADD'))).toBe('NumpadAdd');
    expect(key(jmcKey('Alt+Ctrl+X'))).toBe('Ctrl+Alt+X');
    expect(key(jmcKey('F12'))).toBe('F12');
  });

  it('rejects unknown and unbindable keys', () => {
    expect(jmcKey('Weird+Q').ok).toBe(false);
    expect(jmcKey('BLAH').ok).toBe(false);
    const esc = jmcKey('ESC');
    expect(esc.ok).toBe(false);
    if (!esc.ok) expect(esc.reason).toMatch(/cannot be bound/);
  });
});

describe('sequenceKey', () => {
  it('reads Powwow ^[ notation', () => {
    expect(key(sequenceKey('^[OP'))).toBe('F1');
    expect(key(sequenceKey('^[Ox'))).toBe('Numpad8');
    expect(key(sequenceKey('^[[17~'))).toBe('F6');
    expect(key(sequenceKey('^[[15;5~'))).toBe('Ctrl+F5');
    expect(key(sequenceKey('^A'))).toBe('Ctrl+A');
    expect(key(sequenceKey('^[x'))).toBe('Alt+X');
  });

  it('reads tt++ escapes, octal and raw bytes', () => {
    expect(key(sequenceKey('\\eOq'))).toBe('Numpad1');
    expect(key(sequenceKey('\\033[2~'))).toBe('Insert');
    expect(key(sequenceKey('\x1b[A'))).toBe('ArrowUp');
    expect(key(sequenceKey('^?'))).toBe('Backspace');
  });

  it('knows Linux console and rxvt forms', () => {
    expect(key(sequenceKey('^[[[A'))).toBe('F1');
    expect(key(sequenceKey('^[[11^'))).toBe('Ctrl+F1');
    expect(key(sequenceKey('^[[11$'))).toBe('Shift+F1');
    expect(key(sequenceKey('^[[7~'))).toBe('Home');
    expect(key(sequenceKey('^[[a'))).toBe('Shift+ArrowUp');
    expect(key(sequenceKey('^[Od'))).toBe('Ctrl+ArrowLeft');
    expect(key(sequenceKey('^[^[[A'))).toBe('Alt+ArrowUp');
    const s = sequenceKey('^[[28~');
    expect(s.ok && s.key).toBe('Shift+F5');
    expect(s.ok && s.warning).toMatch(/rxvt/);
    const f11 = sequenceKey('^[[23~');
    expect(f11.ok && f11.key).toBe('F11');
    expect(f11.ok && f11.warning).toMatch(/F11/);
  });

  it('rejects unknown sequences', () => {
    expect(sequenceKey('^[[99~').ok).toBe(false);
  });

  it('unescapeSequence handles ^X, ^?, octal and backslash', () => {
    expect(unescapeSequence('^[O\\120')).toBe('\x1bOP');
    expect(unescapeSequence('\\=x')).toBe('=x');
  });
});
