// The character's sex (stage 77 part E2): the plain `info` line and the
// per-name memory.
import { describe, expect, it } from 'vitest';
import { SEX_KEY, SEX_MEMORY_CAP, SexMemory, parseSexLine } from '../../src/gmcp/sex';

class MemStorage {
  readonly m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}

const ORC = { race: 'Orc', subrace: 'Tarkhnarb Orc' };

describe('parseSexLine', () => {
  it('a man and a woman', () => {
    expect(parseSexLine('You are a male Tarkhnarb Orc.')).toBe('male');
    expect(parseSexLine('You are a female Tarkhnarb Orc.')).toBe('female');
    expect(parseSexLine('You are a female Tarkhnarb Orc.  ')).toBe('female');
  });

  it('with colour', () => {
    expect(parseSexLine('You are a \x1b[32mfemale\x1b[0m Tarkhnarb Orc.')).toBe('female');
  });

  it("with the race: the subrace or the race, case and diacritics aside", () => {
    expect(parseSexLine('You are a female Tarkhnarb Orc.', ORC)).toBe('female');
    expect(parseSexLine('You are a male orc.', ORC)).toBe('male');
    expect(parseSexLine('You are a male Numenorean.', { race: 'Númenórean', subrace: null })).toBe('male');
    expect(parseSexLine('You are a male Dúnadan.', { race: 'Human', subrace: 'Dunadan' })).toBe('male');
  });

  it('another race than the own: null', () => {
    expect(parseSexLine('You are a female Silvan Elf.', ORC)).toBeNull();
    expect(parseSexLine('You are a female Tarkhnarb Orc.', { race: null, subrace: null })).toBeNull();
  });

  it('anything else: null', () => {
    expect(parseSexLine("Bob says 'You are a female Tarkhnarb Orc.'")).toBeNull();
    expect(parseSexLine('You are a female Tarkhnarb Orc')).toBeNull();
    expect(parseSexLine('You are a neuter Tarkhnarb Orc.')).toBeNull();
    expect(parseSexLine(' You are a male Tarkhnarb Orc.')).toBeNull();
    expect(parseSexLine('You are 82 years, 4 months, and 2 days old.')).toBeNull();
  });
});

describe('SexMemory', () => {
  it('per name, in any case, kept in the storage', () => {
    const s = new MemStorage();
    const m = new SexMemory(s as unknown as Storage);
    expect(m.get('Rasta')).toBeNull();
    m.set('Rasta', 'female');
    expect(m.get('rasta')).toBe('female');
    expect(new SexMemory(s as unknown as Storage).get('RASTA')).toBe('female');
    expect(JSON.parse(s.getItem(SEX_KEY)!)).toEqual({ rasta: 'female' });
  });

  it(`at most ${SEX_MEMORY_CAP} names: the oldest written goes`, () => {
    const s = new MemStorage();
    const m = new SexMemory(s as unknown as Storage);
    for (let i = 0; i < SEX_MEMORY_CAP; i++) m.set(`c${i}x`, 'male');
    m.set('c0x', 'female');
    m.set('newone', 'male');
    const kept = Object.keys(JSON.parse(s.getItem(SEX_KEY)!));
    expect(kept).toHaveLength(SEX_MEMORY_CAP);
    expect(kept).not.toContain('c1x');
    expect(m.get('c0x')).toBe('female');
    expect(m.get('newone')).toBe('male');
  });

  it('broken or odd values remember nothing and are written over', () => {
    for (const bad of ['{', '[]', '"male"', 'null', '{"rasta":"neuter","bob":1}']) {
      const s = new MemStorage();
      s.setItem(SEX_KEY, bad);
      const m = new SexMemory(s as unknown as Storage);
      expect(m.get('rasta'), bad).toBeNull();
      m.set('Rasta', 'male');
      expect(m.get('rasta'), bad).toBe('male');
    }
    const s = new MemStorage();
    s.setItem(SEX_KEY, '{"__proto__":"female"}');
    expect(new SexMemory(s as unknown as Storage).get('__proto__')).toBe('female');
  });

  it('a failed probe: `unknown` for the name until a sex is known, never over one', () => {
    const s = new MemStorage();
    const m = new SexMemory(s as unknown as Storage);
    m.setFailed('Gittan');
    expect(m.failed('gittan')).toBe(true);
    expect(m.get('Gittan')).toBeNull();
    m.set('Gittan', 'female');
    expect(m.failed('Gittan')).toBe(false);
    m.setFailed('Gittan');
    expect(m.get('Gittan')).toBe('female');
    expect(JSON.parse(s.getItem(SEX_KEY)!)).toEqual({ gittan: 'female' });
  });

  it('no storage, or one that throws: nothing remembered, no error', () => {
    const none = new SexMemory(null);
    none.set('Rasta', 'male');
    expect(none.get('Rasta')).toBeNull();
    const throws = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const m = new SexMemory(throws);
    expect(() => m.set('Rasta', 'male')).not.toThrow();
    expect(m.get('Rasta')).toBeNull();
  });
});
