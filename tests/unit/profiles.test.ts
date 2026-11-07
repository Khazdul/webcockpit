import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE,
  BUNDLED_PROFILES,
  PROFILE_TEMPLATE,
  ProfileError,
  ProfileStore,
  caseTwins,
  isValidName,
  nameError,
  nameFromFileName,
  uniqueName,
} from '../../src/profiles';

describe('profile names', () => {
  it('accepts letters, digits and _ after a leading letter, up to 32', () => {
    expect(nameError('ranger', [])).toBeNull();
    expect(nameError('pvp_Warrior2', [])).toBeNull();
    expect(nameError('a'.repeat(32), [])).toBeNull();
    expect(isValidName('x')).toBe(true);
  });

  it('rejects empty, long, bad first character and bad characters', () => {
    expect(nameError('', [])).toMatch(/Enter a name/);
    expect(nameError('a'.repeat(33), [])).toMatch(/32/);
    expect(nameError('2fast', [])).toMatch(/start with a letter/);
    expect(nameError('_x', [])).toMatch(/start with a letter/);
    expect(nameError('my profile', [])).toMatch(/letters, digits/);
    expect(nameError('héllo', [])).toMatch(/letters, digits/);
    expect(isValidName('a-b')).toBe(false);
  });

  it('rejects a taken name, except the one being renamed', () => {
    expect(nameError('ranger', ['default', 'ranger'])).toMatch(/already exists/);
    expect(nameError('ranger', ['default', 'ranger'], 'ranger')).toBeNull();
    // Case-sensitive, like the IndexedDB key.
    expect(nameError('Ranger', ['ranger'])).toBeNull();
  });

  it('finds the names that differ from another only in case', () => {
    expect(caseTwins(['default', 'gibur', 'Gibur', 'khazdul', 'GIBUR', 'scout'])).toEqual(
      new Set(['gibur', 'Gibur', 'GIBUR']),
    );
    expect(caseTwins(['default', 'gibur', 'scout'])).toEqual(new Set());
    expect(caseTwins([])).toEqual(new Set());
  });

  it('derives a valid name from a file name', () => {
    expect(nameFromFileName('ranger.tin')).toBe('ranger');
    expect(nameFromFileName('My Profile (2).tin')).toBe('My_Profile_2');
    expect(nameFromFileName('C:\\games\\pvp-war.txt')).toBe('pvp_war');
    expect(nameFromFileName('2024 setup.tin')).toBe('p2024_setup');
    expect(nameFromFileName('Éowyn.tin')).toBe('Eowyn');
    expect(nameFromFileName('.tin')).toBe('imported');
    expect(nameFromFileName('a'.repeat(50) + '.tin')).toHaveLength(32);
    for (const f of ['x.tin', '???.txt', '__a__.tin', '9.tin']) expect(isValidName(nameFromFileName(f))).toBe(true);
  });

  it('adds _2, _3 … on a collision and stays within 32', () => {
    expect(uniqueName('ranger', ['default'])).toBe('ranger');
    expect(uniqueName('ranger', ['ranger'])).toBe('ranger_2');
    expect(uniqueName('ranger', ['ranger', 'ranger_2'])).toBe('ranger_3');
    const long = 'b'.repeat(32);
    const u = uniqueName(long, [long]);
    expect(u).toHaveLength(32);
    expect(u.endsWith('_2')).toBe(true);
  });
});

describe('profile template', () => {
  it('has a header comment and the ten numpad macros in readable names', () => {
    expect(PROFILE_TEMPLATE.startsWith('#nop ')).toBe(true);
    const macros = [...PROFILE_TEMPLATE.matchAll(/^#macro \{(\w+)\} \{([^}]*)\}$/gm)].map((m) => [m[1], m[2]]);
    expect(Object.fromEntries(macros)).toEqual({
      Numpad0: 'flee',
      Numpad2: 'south',
      Numpad3: 'down',
      Numpad4: 'west',
      Numpad5: 'exits',
      Numpad6: 'east',
      Numpad8: 'north',
      Numpad9: 'up',
      NumpadAdd: 'open exit',
      NumpadSubtract: 'close exit',
    });
  });
});

const stores: ProfileStore[] = [];
function make(factory: IDBFactory | null = new IDBFactory()): ProfileStore {
  let t = 1000;
  const s = new ProfileStore({ factory, now: () => t++ });
  stores.push(s);
  return s;
}

afterEach(async () => {
  for (const s of stores.splice(0)) await s.close();
});

for (const kind of ['indexeddb', 'memory'] as const) {
  describe(`ProfileStore (${kind})`, () => {
    const fresh = () => make(kind === 'memory' ? null : new IDBFactory());

    it('seeds default from the template once', async () => {
      const s = fresh();
      await s.init();
      const d = await s.get(DEFAULT_PROFILE);
      expect(d?.text).toBe(PROFILE_TEMPLATE);
      await s.save(DEFAULT_PROFILE, 'edited');
      await s.init();
      expect((await s.get(DEFAULT_PROFILE))?.text).toBe('edited');
      expect(s.persistent).toBe(kind === 'indexeddb');
    });

    it('seeds the bundled profiles on first run only', async () => {
      const s = fresh();
      await s.init();
      const k = await s.get('khazdul');
      expect(k?.text).toBe(BUNDLED_PROFILES[0]!.text);
      expect(k?.text).toMatch(/#ALIAS/i);
      await s.remove('khazdul');
      await s.init();
      expect(await s.get('khazdul')).toBeNull();
    });

    it('creates, lists sorted, and refuses bad or taken names', async () => {
      const s = fresh();
      await s.init();
      await s.create('zed', 'z');
      await s.create('Alpha', 'a');
      await s.create('beta');
      expect((await s.list()).map((r) => r.name)).toEqual(['Alpha', 'beta', 'default', 'khazdul', 'zed']);
      expect((await s.get('beta'))?.text).toBe(PROFILE_TEMPLATE);
      await expect(s.create('zed', 'again')).rejects.toBeInstanceOf(ProfileError);
      await expect(s.create('1bad', '')).rejects.toThrow(/start with a letter/);
      expect((await s.get('zed'))?.text).toBe('z');
    });

    it('renames, keeping text and created time', async () => {
      const s = fresh();
      await s.init();
      const r = await s.create('ranger', 'text');
      await s.rename('ranger', 'hunter');
      expect(await s.get('ranger')).toBeNull();
      const h = await s.get('hunter');
      expect(h?.text).toBe('text');
      expect(h?.created).toBe(r.created);
      expect(h!.modified).toBeGreaterThan(r.modified);
      await s.rename('hunter', 'hunter');
      await expect(s.rename('hunter', 'default')).rejects.toThrow(/already exists/);
      await expect(s.rename('default', 'other')).rejects.toBeInstanceOf(ProfileError);
      await expect(s.rename('nobody', 'other')).rejects.toThrow(/No profile/);
      expect((await s.list()).map((x) => x.name)).toEqual(['default', 'hunter', 'khazdul']);
    });

    it('deletes, but never default', async () => {
      const s = fresh();
      await s.init();
      await s.create('temp', '');
      await s.remove('temp');
      expect(await s.get('temp')).toBeNull();
      await expect(s.remove(DEFAULT_PROFILE)).rejects.toThrow(/can't delete the default/);
      expect(await s.get(DEFAULT_PROFILE)).not.toBeNull();
    });

    it('imports under a sanitised, unique name, text verbatim', async () => {
      const s = fresh();
      await s.init();
      const text = '#nop mine\r\n#alias {k} {kill %1}\n';
      expect(await s.importFile('My Warrior.tin', text)).toBe('My_Warrior');
      expect(await s.importFile('My Warrior.tin', 'x')).toBe('My_Warrior_2');
      expect(await s.importFile('default.tin', 'y')).toBe('default_2');
      expect((await s.get('My_Warrior'))?.text).toBe(text);
    });
  });
}

it('persists across store instances on the same database', async () => {
  const factory = new IDBFactory();
  const a = make(factory);
  await a.init();
  await a.create('ranger', 'r');
  await a.close();
  const b = make(factory);
  expect((await b.list()).map((r) => r.name)).toEqual(['default', 'khazdul', 'ranger']);
});
