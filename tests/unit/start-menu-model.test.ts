// Stage 67 (ADR 0149 and its addendum): the start menu's model. The rows
// in every form of the flags, the letters, and the owner row's states as
// a pure function of the account state.
import { describe, expect, it } from 'vitest';
import { type OwnerInput, communityCount, ownerRow, startMenu, startRows } from '../../src/chrome/frames/start-menu-model';

const shape = (input: Parameters<typeof startMenu>[0]) => startMenu(input).map((e) => (e.kind === 'rule' ? '──' : e.key));

describe('the start menu: its forms', () => {
  it('form 1 (accounts off, gallery off: production today): play, a rule, mine without the owner row, About; no second rule', () => {
    expect(shape({ owner: false, scripts: true, community: null })).toEqual(['enter', '──', 'profile', 'scripts', 'history', 'about']);
  });

  it('form 2 (accounts on): the owner row heads "mine", under the rule', () => {
    expect(shape({ owner: true, scripts: true, community: null })).toEqual(['enter', '──', 'owner', 'profile', 'scripts', 'history', 'about']);
  });

  it('form 3 (accounts and gallery on): a second rule parts Community from "mine"; About stays last', () => {
    expect(shape({ owner: true, scripts: true, community: { count: 3 } })).toEqual([
      'enter',
      '──',
      'owner',
      'profile',
      'scripts',
      'history',
      '──',
      'community',
      'about',
    ]);
  });

  it('gallery without accounts: Community and its rule, no owner row', () => {
    expect(shape({ owner: false, scripts: true, community: { count: 0 } })).toEqual(['enter', '──', 'profile', 'scripts', 'history', '──', 'community', 'about']);
  });

  it('no script library (only tests mount it so): no Scripts row', () => {
    expect(shape({ owner: false, scripts: false, community: null })).toEqual(['enter', '──', 'profile', 'history', 'about']);
  });

  it('the letters: E U P S H C A; never L, never a letter twice; Spotlights, Credits and Account are gone', () => {
    for (const owner of [false, true]) {
      for (const community of [null, { count: 1 }]) {
        const rows = startRows({ owner, scripts: true, community });
        const letters = rows.map((r) => r.letter);
        expect(new Set(letters).size).toBe(letters.length);
        expect(letters).not.toContain('l');
        expect(rows.map((r) => r.key)).not.toContain('spotlights');
        expect(rows.map((r) => r.key)).not.toContain('credits');
        expect(rows.map((r) => r.key)).not.toContain('account');
        // C only with Community, U only with the owner row.
        expect(letters.includes('c')).toBe(community !== null);
        expect(letters.includes('u')).toBe(owner);
      }
    }
    expect(startRows({ owner: true, scripts: true, community: { count: 0 } }).map((r) => r.letter)).toEqual(['e', 'u', 'p', 's', 'h', 'c', 'a']);
  });

  it("Community's counter: \"3 new\", nothing without news", () => {
    expect(communityCount(3)).toBe('3 new');
    expect(communityCount(1)).toBe('1 new');
    expect(communityCount(0)).toBeNull();
    expect(communityCount(-1)).toBeNull();
    expect(communityCount(Number.NaN)).toBeNull();
    expect(communityCount(98)).toBe('98 new');
    expect(communityCount(99)).toBe('99+ new');
    expect(communityCount(140)).toBe('99+ new');
  });
});

describe('the owner row: a pure function of the account state', () => {
  const row = (input: OwnerInput) => {
    const v = ownerRow(input);
    return { kind: v.kind, name: v.name, state: v.state, news: v.news, mark: v.mark, opens: v.opens };
  };

  it('a guest: "Guest · log in", the key mark, "log in" is the action; a press opens Log in', () => {
    const v = ownerRow({ name: null });
    expect(row({ name: null })).toEqual({ kind: 'guest', name: 'Guest', state: 'log in', news: null, mark: 'key', opens: 'login' });
    expect(v.stateIsAction).toBe(true);
    expect(v.label).toBe('Guest · log in');
  });

  it('a guest has no sync and no news whatever is passed', () => {
    expect(row({ name: null, sync: 'synced', news: 4 })).toEqual(row({ name: null }));
  });

  it('logged in before sync exists (stage 60 → 61): the name alone, never "synced"; a press opens the Account page', () => {
    const v = ownerRow({ name: 'Olev' });
    expect(row({ name: 'Olev' })).toEqual({ kind: 'name', name: 'Olev', state: null, news: null, mark: null, opens: 'account' });
    expect(v.label).toBe('Olev');
    expect(row({ name: 'Olev', sync: null })).toEqual(row({ name: 'Olev' }));
  });

  it('the sync states: synced, syncing, offline, needs attention (storage full)', () => {
    expect(row({ name: 'ole', sync: 'synced' })).toMatchObject({ kind: 'synced', state: 'synced', mark: 'dot', opens: 'account' });
    expect(row({ name: 'ole', sync: 'syncing' })).toMatchObject({ kind: 'syncing', state: 'syncing', mark: 'pulse' });
    expect(row({ name: 'ole', sync: 'offline' })).toMatchObject({ kind: 'offline', state: 'offline', mark: 'ring' });
    expect(row({ name: 'ole', sync: 'full' })).toMatchObject({ kind: 'attention', state: 'storage full', mark: 'diamond' });
    expect(row({ name: 'ole', sync: 'update' })).toMatchObject({ kind: 'attention', state: 'update the client', mark: 'diamond' });
    for (const sync of ['synced', 'syncing', 'offline', 'full'] as const) expect(ownerRow({ name: 'ole', sync }).stateIsAction).toBe(false);
  });

  it('a locked copy: "<name> · logged out here", the lock; a press opens Log in', () => {
    expect(row({ name: null, locked: 'ole' })).toEqual({ kind: 'locked', name: 'ole', state: 'logged out here', news: null, mark: 'lock', opens: 'login' });
    // Somebody logged in wins over a locked copy.
    expect(row({ name: 'Olev', locked: 'ole' }).kind).toBe('name');
  });

  it('the reactions mark: "2 new" after the state; nothing for none', () => {
    expect(ownerRow({ name: 'ole', sync: 'synced', news: 2 })).toMatchObject({ news: '2 new', label: 'ole · synced · 2 new' });
    expect(ownerRow({ name: 'ole', news: 2 })).toMatchObject({ state: null, news: '2 new', label: 'ole · 2 new' });
    expect(ownerRow({ name: 'ole', sync: 'synced', news: 0 }).news).toBeNull();
  });
});
