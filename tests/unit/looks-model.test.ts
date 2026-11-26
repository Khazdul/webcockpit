// The look model (stage 80 §1, §4, §8; ADR 0169): the resolver's every row
// and fallback, the NPC name match, the looks store and its prune and merge.

import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { openWebcockpitDb } from '../../src/core/db';
import type { LibraryManifest } from '../../src/looks/library-types';
import { libraryOf } from '../../src/looks/library';
import { matchNpc, matchScore, nameWords } from '../../src/looks/match';
import { autoMember, autoSelf, dirKinds, dirPortrait, resolveMember, resolveSelf, sameDrawn } from '../../src/looks/resolve';
import { RING_MUTE, ringCss, ringRgb } from '../../src/looks/ring';
import { LOOKS_KEY, LOOKS_MAX, LooksStore, emptyLooks, mergeLooks, parseLooks, pruneLooks, withLook } from '../../src/looks/store';
import { AUTO, isLookRef, lookName, lookRef, sameLook } from '../../src/looks/types';
import { filterLibrary, inRace, libraryCounts } from '../../src/looks/filter';

const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/tokens/tokens.json', import.meta.url)), 'utf8')) as LibraryManifest;
const library = libraryOf(manifest);
const LIB = { src: 'lib', id: 'elf-f-noldor' } as const;
const GONE = { src: 'lib', id: 'no-such-token' } as const;
const OWN = { src: 'own', id: 'img1' } as const;

describe('LookRef', () => {
  it('checks and copies looks', () => {
    expect(isLookRef(AUTO)).toBe(true);
    expect(isLookRef(LIB)).toBe(true);
    expect(isLookRef({ src: 'lib' })).toBe(false);
    expect(isLookRef({ src: 'lib', id: '' })).toBe(false);
    expect(isLookRef({ src: 'own', id: 'x'.repeat(65) })).toBe(false);
    expect(isLookRef({ src: 'web', id: 'x' })).toBe(false);
    expect(isLookRef(null)).toBe(false);
    expect(lookRef({ src: 'lib', id: 'a', extra: 1 })).toEqual({ src: 'lib', id: 'a' });
    expect(lookRef({ src: 'auto', id: 'a' })).toEqual({ src: 'auto' });
    expect(sameLook(LIB, { src: 'lib', id: 'elf-f-noldor' })).toBe(true);
    expect(sameLook(LIB, OWN)).toBe(false);
    expect(sameLook(AUTO, { src: 'auto' })).toBe(true);
    expect(lookName('  Rasta ')).toBe('rasta');
  });
});

describe('resolveSelf: rows 1, 3, 4', () => {
  const me = { race: 'Elf', subrace: 'Noldo', sex: 'female' as const };

  it('row 1: your choice', () => {
    expect(resolveSelf({ ...me, choice: LIB })).toEqual({ kind: 'lib', id: 'elf-f-noldor', from: 'choice' });
    expect(resolveSelf({ ...me, choice: LIB, library })).toEqual({ kind: 'lib', id: 'elf-f-noldor', from: 'choice' });
    expect(resolveSelf({ ...me, choice: OWN, ownImages: new Set(['img1']) })).toEqual({ kind: 'own', id: 'img1', from: 'choice' });
  });

  it('row 3: the engraved drawing for your race, subrace and sex', () => {
    expect(resolveSelf(me)).toEqual({ kind: 'drawn', portrait: 'noldo', sex: 'female', from: 'auto' });
    expect(resolveSelf({ ...me, choice: AUTO })).toEqual({ kind: 'drawn', portrait: 'noldo', sex: 'female', from: 'auto' });
    expect(resolveSelf({ race: 'Orc', subrace: 'Tarkhnarb Orc', sex: null })).toEqual({ kind: 'drawn', portrait: 'tarkhnarb', sex: 'male', from: 'auto' });
  });

  it('row 4: the neutral silhouette while the race is unknown', () => {
    expect(resolveSelf({ race: null, sex: null })).toEqual({ kind: 'drawn', portrait: 'neutral', sex: 'male', from: 'unknown' });
  });

  it('falls one row down: a library id the manifest lacks, an own image not on the shelf', () => {
    expect(resolveSelf({ ...me, choice: GONE, library }).kind).toBe('drawn');
    // Without the manifest the id is trusted (the picture's own load error falls back in the pane).
    expect(resolveSelf({ ...me, choice: GONE }).kind).toBe('lib');
    expect(resolveSelf({ ...me, choice: OWN }).kind).toBe('drawn');
    expect(resolveSelf({ ...me, choice: OWN, ownImages: new Set(['other']) })).toEqual({ kind: 'drawn', portrait: 'noldo', sex: 'female', from: 'auto' });
  });

  it('draws no looks where looks are not drawn (the replay bundle, the log player)', () => {
    expect(resolveSelf({ ...me, choice: LIB, mode: 'none' })).toEqual({ kind: 'drawn', portrait: 'noldo', sex: 'female', from: 'auto' });
  });

  it('the automatic look ignores the choice', () => {
    expect(autoSelf({ ...me, choice: LIB })).toEqual(resolveSelf(me));
  });
});

describe('resolveMember: rows 1 to 5', () => {
  const dir = { race: 'dwarf', subrace: 'longbeard', sex: 'female', token: null } as const;

  it('row 1: your assignment for the name (players and NPCs)', () => {
    expect(resolveMember({ name: 'Thorin', npc: false, choice: LIB, dir: { ...dir, token: 'dwarf-m-mage' } })).toEqual({ kind: 'lib', id: 'elf-f-noldor', from: 'choice' });
    expect(resolveMember({ name: 'a trained horse', npc: true, choice: LIB, library })).toEqual({ kind: 'lib', id: 'elf-f-noldor', from: 'choice' });
  });

  it("row 2: the directory's library token", () => {
    expect(resolveMember({ name: 'Thorin', npc: false, dir: { ...dir, token: 'dwarf-m-mage' } })).toEqual({ kind: 'lib', id: 'dwarf-m-mage', from: 'shared' });
    // An unknown shared token falls to row 3.
    expect(resolveMember({ name: 'Thorin', npc: false, dir: { ...dir, token: 'gone' }, library })).toEqual({ kind: 'drawn', portrait: 'longbeard', sex: 'female', from: 'auto' });
    // A reset assignment is no choice: the directory again.
    expect(resolveMember({ name: 'Thorin', npc: false, choice: AUTO, dir: { ...dir, token: 'dwarf-m-mage' } }).from).toBe('shared');
    // An assignment whose picture is gone falls to row 2.
    expect(resolveMember({ name: 'Thorin', npc: false, choice: GONE, library, dir: { ...dir, token: 'dwarf-m-mage' } }).from).toBe('shared');
  });

  it("row 3: the engraved drawing for the directory's race, subrace and sex", () => {
    expect(resolveMember({ name: 'Thorin', npc: false, dir })).toEqual({ kind: 'drawn', portrait: 'longbeard', sex: 'female', from: 'auto' });
    expect(resolveMember({ name: 'Thorin', npc: false, dir: { race: 'troll', subrace: null, sex: null, token: null } })).toEqual({ kind: 'drawn', portrait: 'troll', sex: 'male', from: 'auto' });
    // A subrace of another race is not trusted: the race's own.
    expect(resolveMember({ name: 'X', npc: false, dir: { race: 'elf', subrace: 'longbeard', sex: 'male', token: null } })).toMatchObject({ portrait: 'elf' });
  });

  it('row 4: an NPC gets the library picture its name matches', () => {
    expect(resolveMember({ name: 'a trained horse', npc: true, library })).toEqual({ kind: 'lib', id: 'mount-trained-horse', from: 'matched' });
    // NPCs have no directory row.
    expect(resolveMember({ name: 'a trained horse', npc: true, library, dir: { ...dir, token: 'dwarf-m-mage' } })).toMatchObject({ id: 'mount-trained-horse' });
  });

  it('row 5: the neutral silhouette for a player, the type icon for an NPC with no match', () => {
    expect(resolveMember({ name: 'Bilbo', npc: false })).toEqual({ kind: 'drawn', portrait: 'neutral', sex: 'male', from: 'unknown' });
    expect(resolveMember({ name: 'Bilbo', npc: false, dir: { race: null, subrace: null, sex: 'male', token: null } }).from).toBe('unknown');
    expect(resolveMember({ name: 'a stone giant', npc: true, library })).toEqual({ kind: 'icon', from: 'icon' });
    // Before the manifest has loaded an NPC is not matched yet.
    expect(resolveMember({ name: 'a trained horse', npc: true })).toEqual({ kind: 'icon', from: 'icon' });
  });

  it('draws no looks where looks are not drawn', () => {
    expect(resolveMember({ name: 'Thorin', npc: false, choice: LIB, dir, mode: 'none' })).toEqual({ kind: 'icon', from: 'icon' });
  });

  it('the automatic look ignores the assignment', () => {
    expect(autoMember({ name: 'Thorin', npc: false, choice: LIB, dir })).toEqual(resolveMember({ name: 'Thorin', npc: false, dir }));
  });

  it('a directory row from GMCP kinds: a bear stays a Beorning', () => {
    expect(dirKinds('Bear', null)).toEqual({ race: 'beorning', subrace: null });
    expect(dirKinds('Elf', 'Sindar')).toEqual({ race: 'elf', subrace: 'sinda' });
    expect(dirPortrait({ race: null, subrace: 'sinda' })).toBe('sinda');
    expect(dirPortrait({ race: null, subrace: null })).toBeNull();
  });

  it('sameDrawn compares what is drawn', () => {
    expect(sameDrawn(resolveSelf({ race: null, sex: 'male' }), resolveSelf({ race: null, sex: 'female' }))).toBe(true);
    expect(sameDrawn(resolveSelf({ race: 'Elf', sex: 'male' }), resolveSelf({ race: 'Elf', sex: 'female' }))).toBe(false);
  });
});

describe('the NPC name match', () => {
  it('reads words folded', () => {
    expect(nameWords('A Trained-Horse, of Rohan')).toEqual(['a', 'trained', 'horse', 'of', 'rohan']);
  });

  it('the head noun must be there; the others score', () => {
    expect(matchScore(new Set(['a', 'horse']), { match: ['trained', 'horse'] })).toBe(1);
    expect(matchScore(new Set(['trained', 'horse']), { match: ['trained', 'horse'] })).toBe(2);
    expect(matchScore(new Set(['trained', 'pony']), { match: ['trained', 'horse'] })).toBe(0);
    expect(matchScore(new Set(['horses']), { match: ['horse'] })).toBe(1);
    expect(matchScore(new Set(['horse']), {})).toBe(0);
  });

  it('the names in the fixtures and the GMCP notes', () => {
    const m = (n: string | null): string | null => matchNpc(n, manifest.tokens);
    expect(m('a trained horse')).toBe('mount-trained-horse');
    expect(m('trained horse')).toBe('mount-trained-horse');
    expect(m('a sturdy pony')).toBe('mount-pony');
    expect(m('a citizen mercenary')).toBe('mob-mercenary');
    expect(m('a large dog')).toBe('mob-dog-little');
    expect(m('hungry warg')).toBe('mount-warg-hungry');
    expect(m('pack horse')).toBe('mount-horse-pack');
    expect(m('the black wolf')).toBe('mob-wolf-black');
    // A tie goes to the first in the manifest.
    expect(m('a horse')).toBe('mount-horse-1');
    expect(m('a wolf')).toBe('mount-wolf-brown');
    expect(m('a stone giant')).toBeNull();
    expect(m('')).toBeNull();
    expect(m(null)).toBeNull();
  });
});

describe('the ring (R3)', () => {
  it('mutes the hue 25 % toward grey', () => {
    expect(RING_MUTE).toBe(0.25);
    expect(ringRgb(0xffff00)).toEqual([226, 226, 35]);
    expect(ringCss(0x000000)).toBe('rgb(35 35 35)');
  });
});

describe('the looks record', () => {
  it('parses what is stored, dropping what is not a look', () => {
    const d = parseLooks({ names: { Rasta: { look: LIB, at: 5, own: true }, bad: { look: { src: 'x' }, at: 1 }, nat: { look: AUTO, at: 'x' }, rasta: { look: AUTO, at: 2 } } });
    expect(Object.keys(d.names)).toEqual(['rasta']);
    expect(d.names.rasta).toEqual({ look: LIB, at: 5, own: true });
    expect(parseLooks(null)).toEqual(emptyLooks());
    expect(parseLooks({ names: [] })).toEqual(emptyLooks());
  });

  it('sets a look; a reset is an entry; own sticks', () => {
    let d = withLook(emptyLooks(), 'Rasta', LIB, 10, true);
    d = withLook(d, 'rasta', AUTO, 20);
    expect(d.names.rasta).toEqual({ look: AUTO, at: 20, own: true });
  });

  it('prunes to 500 names the same way everywhere: not own, oldest first, then by name', () => {
    let d = emptyLooks();
    for (let i = 0; i < LOOKS_MAX; i++) d = withLook(d, `n${String(i).padStart(3, '0')}`, LIB, 1000 + i);
    d = withLook(d, 'mine', LIB, 1, true);
    expect(Object.keys(d.names)).toHaveLength(LOOKS_MAX);
    expect(d.names.mine).toBeDefined();
    expect(d.names.n000).toBeUndefined();
    // Two at the same time: the name decides.
    const tie = pruneLooks({ names: { b: { look: LIB, at: 1 }, a: { look: LIB, at: 1 }, c: { look: LIB, at: 2 } } }, 2);
    expect(Object.keys(tie.names).sort()).toEqual(['b', 'c']);
    // Own entries are never pruned, even over the limit.
    const own = pruneLooks({ names: { a: { look: LIB, at: 1, own: true }, b: { look: LIB, at: 2, own: true } } }, 1);
    expect(Object.keys(own.names)).toHaveLength(2);
  });

  it('merges per name, the newest winning, own sticking', () => {
    const a = { names: { x: { look: LIB, at: 5, own: true as const }, y: { look: LIB, at: 9 } } };
    const b = { names: { x: { look: AUTO, at: 7 }, y: { look: AUTO, at: 3 }, z: { look: OWN, at: 1 } } };
    const m = mergeLooks(a, b);
    expect(m.names.x).toEqual({ look: AUTO, at: 7, own: true });
    expect(m.names.y).toEqual({ look: LIB, at: 9 });
    expect(m.names.z).toEqual({ look: OWN, at: 1 });
    expect(mergeLooks(b, a)).toEqual(m);
  });
});

describe('LooksStore', () => {
  it('stores in the space database under the key looks, and reads it back', async () => {
    const f = new IDBFactory();
    const openDb = () => openWebcockpitDb(f, 'webcockpit', { create: true });
    let t = 100;
    const s = new LooksStore({ openDb, now: () => t });
    await s.ready;
    const seen: number[] = [];
    s.subscribe(() => seen.push(s.version));
    s.choose('Rasta', LIB, true);
    expect(s.lookFor('rasta')).toEqual(LIB);
    expect(seen.length).toBe(1);
    await new Promise((r) => setTimeout(r, 20));
    const db = await openDb();
    const rec = await new Promise((res) => {
      const r = db.transaction('looks').objectStore('looks').get(LOOKS_KEY);
      r.onsuccess = () => res(r.result);
    });
    expect(rec).toEqual({ names: { rasta: { look: LIB, at: 100, own: true } } });
    db.close();
    t = 200;
    const again = new LooksStore({ openDb, now: () => t });
    await again.ready;
    expect(again.stored('RASTA')).toEqual(LIB);
  });

  it('previews without storing; a choice drops the preview', async () => {
    const s = new LooksStore();
    await s.ready;
    s.preview('Rasta', LIB);
    expect(s.lookFor('Rasta')).toEqual(LIB);
    expect(s.stored('Rasta')).toBeNull();
    s.preview('Rasta', null);
    expect(s.lookFor('Rasta')).toBeNull();
    s.preview('Rasta', OWN);
    s.choose('Rasta', LIB);
    expect(s.lookFor('Rasta')).toEqual(LIB);
    expect(s.lookFor(null)).toBeNull();
  });

  it('works in memory without a database', async () => {
    const s = new LooksStore({ openDb: () => Promise.reject(new Error('none')) });
    await s.ready;
    s.choose('Rasta', LIB);
    expect(s.lookFor('Rasta')).toEqual(LIB);
  });
});

describe('the picker library filter', () => {
  const all = manifest.tokens;
  it('counts the chips', () => {
    const c = libraryCounts(all);
    expect(c.mount).toBe(15);
    expect(c.mob).toBe(22);
    expect(c.human).toBe(20);
    expect(c.dwarf).toBe(4);
    expect(c.other).toBe(13);
    expect(c.all).toBe(125);
    expect(c.male + c.female).toBe(all.filter((t) => t.sex).length);
  });

  it('filters by people, sex, kind and search words', () => {
    const f = { race: 'all', sex: null, kind: null, q: '' } as const;
    expect(filterLibrary(all, f)).toHaveLength(125);
    expect(filterLibrary(all, f)[0]!.race).toBe('human');
    expect(filterLibrary(all, f).at(-1)!.group).toBe('mob');
    expect(filterLibrary(all, { ...f, race: 'elf', sex: 'female' }).map((t) => t.id)).toContain('elf-f-noldor');
    expect(filterLibrary(all, { ...f, race: 'elf', sex: 'female' }).every((t) => t.race === 'elf' && t.sex === 'female')).toBe(true);
    expect(filterLibrary(all, { ...f, kind: 'mount' })).toHaveLength(15);
    expect(filterLibrary(all, { ...f, q: 'noldor' }).map((t) => t.id)).toEqual(['elf-f-noldor', 'elf-m-noldor']);
    expect(filterLibrary(all, { ...f, q: 'Elf F Noldor' }).map((t) => t.id)).toEqual(['elf-f-noldor']);
    expect(filterLibrary(all, { ...f, kind: 'mount', q: 'trained horse' }).map((t) => t.id)).toEqual(['mount-trained-horse']);
    expect(filterLibrary(all, { ...f, q: 'zzz' })).toEqual([]);
    expect(inRace(all.find((t) => t.id === 'bn-m-scout')!, 'other')).toBe(true);
  });
});
