// Stage 65 C1: the Community page's pure parts (community-model.ts) and the
// menu counter's guest side (src/cloud/community/counter.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GALLERY_SORTS } from '../../shared/cloud/api';
import {
  DEFAULT_SORT,
  SORT_HEADS,
  characterText,
  communityBackHref,
  dateText,
  lengthText,
  meanText,
  newestListed,
  noteAge,
  noteHint,
  notesToday,
  pagerText,
  pagesOf,
  parseView,
  runHref,
  sortOfKey,
  starsShown,
} from '../../src/chrome/frames/community-model';
import { countListed, readSeen, writeSeen } from '../../src/cloud/community/counter';

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);

describe('the list', () => {
  it('a heading per sort, New the default; the letters', () => {
    expect(Object.keys(SORT_HEADS).sort()).toEqual([...GALLERY_SORTS].sort());
    expect(DEFAULT_SORT).toBe('new');
    expect(sortOfKey({ key: 'l' })).toBe('new');
    expect(sortOfKey({ key: 'S' })).toBe('top');
    expect(sortOfKey({ key: 'v' })).toBe('watched');
    expect(sortOfKey({ key: 'm' })).toBe('comments');
    expect(sortOfKey({ key: 'e' })).toBe('length');
    expect(sortOfKey({ key: 'v', ctrlKey: true })).toBeNull();
    expect(sortOfKey({ key: 'x' })).toBeNull();
    // Each letter is in its label.
    for (const h of Object.values(SORT_HEADS)) expect(h.label.toLowerCase()).toContain(h.letter);
  });

  it('pages, the pager, the row’s words', () => {
    expect(pagesOf(0)).toBe(1);
    expect(pagesOf(10)).toBe(1);
    expect(pagesOf(23)).toBe(3);
    expect(pagerText(1, 3)).toBe('Page 1 of 3');
    expect(characterText({ character: 'Gibur', level: 41 })).toBe('Gibur L41');
    expect(characterText({ character: 'Gibur' })).toBe('Gibur');
    expect(lengthText(20)).toBe('under a minute');
    expect(lengthText(37 * 60)).toBe('37 min');
    expect(lengthText(4 * 3600 + 4 * 60)).toBe('4 h 04 min');
    expect(dateText(new Date(2026, 10, 14).getTime(), new Date(2026, 10, 15).getTime())).toBe('14 Nov');
    expect(dateText(new Date(2025, 0, 2).getTime(), new Date(2026, 10, 15).getTime())).toBe('2 Jan 2025');
    expect(meanText({ sum: 0, count: 0 })).toBeNull();
    expect(meanText({ sum: 72, count: 15 })).toBe('4.8');
    expect(starsShown({ sum: 72, count: 15 })).toBe(5);
    expect(starsShown({ sum: 0, count: 0 })).toBe(0);
    expect(newestListed([{ listedAt: 5 }], null, [{ listedAt: 9 }, { listedAt: 2 }])).toBe(9);
    expect(newestListed(null, [])).toBeNull();
  });
});

describe('the board', () => {
  it('ages, the hint, the notes written today (UTC) by a name', () => {
    expect(noteAge(NOW - 10_000, NOW)).toBe('just now');
    expect(noteAge(NOW - 2 * 60_000, NOW)).toBe('2 min');
    expect(noteAge(NOW - 3 * 3_600_000, NOW)).toBe('3 h');
    expect(noteAge(NOW - 30 * 3_600_000, NOW)).toBe('yesterday');
    expect(noteAge(NOW - 4 * 86_400_000, NOW)).toBe('4 days');
    expect(noteHint(41, 250, 4)).toBe('41 / 250 · 4 left today');
    const day = Date.UTC(2026, 10, 15);
    const notes = [
      { id: 'AAAAAAAAAAA1', writer: 'Fenwick', text: 'a', created: day + 1 },
      { id: 'AAAAAAAAAAA2', writer: 'fenwick', text: 'b', created: day - 1 },
      { id: 'AAAAAAAAAAA3', writer: 'brego', text: 'c', created: day + 2 },
    ];
    expect(notesToday(notes, 'fenwick', NOW)).toBe(1);
    expect(notesToday(notes, null, NOW)).toBe(0);
  });
});

describe('the view kept for Back, and the way to a run', () => {
  it('a kept view is read tolerantly', () => {
    expect(parseView(null)).toEqual({ sort: 'new', page: 1 });
    expect(parseView('{"sort":"top","page":3,"by":"brego","tab":"hof"}')).toEqual({ sort: 'top', page: 3, by: 'brego', tab: 'hof' });
    expect(parseView('{"sort":"best","page":0,"by":"<b>","tab":"x"}')).toEqual({ sort: 'new', page: 1 });
    expect(parseView('not json')).toEqual({ sort: 'new', page: 1 });
  });

  it('the run’s address carries from=community; the watch page’s Back goes to <base>?community', () => {
    expect(runHref('Ab3dE5fG7hJk')).toBe('/r/Ab3dE5fG7hJk?from=community');
    expect(runHref('Ab3dE5fG7hJk', '/app/', true)).toBe('/app/r/Ab3dE5fG7hJk?from=community&cloudtest');
    expect(communityBackHref()).toBe('/?community');
    expect(communityBackHref('/app/', true)).toBe('/app/?community&cloudtest');
  });
});

describe('the guests’ counter', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('counts the listed times newer than the device’s seen time; seen moves forward only; storage blocked is no error', () => {
    const store = new Map<string, string>();
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readSeen(s)).toBe(0);
    expect(countListed([30, 20, 10], readSeen(s))).toBe(3);
    writeSeen(20, s);
    expect(countListed([30, 20, 10], readSeen(s))).toBe(1);
    writeSeen(5, s);
    expect(readSeen(s)).toBe(20);
    store.set('wc.communitySeen', 'junk');
    expect(readSeen(s)).toBe(0);
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readSeen(blocked)).toBe(0);
    expect(() => writeSeen(9, blocked)).not.toThrow();
  });
});
