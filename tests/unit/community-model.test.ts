// Stage 65 C1: the Community page's pure parts (community-model.ts) and the
// menu counter's guest side (src/cloud/community/counter.ts); the owner's
// feedback W2: short headings, "Title (Char)", search, the phone's sub-pages.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GALLERY_Q_MAX, GALLERY_Q_MIN, GALLERY_SORTS } from '../../shared/cloud/api';
import {
  DEFAULT_SORT,
  SEARCH_TOO_LONG,
  SORT_HEADS,
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
  runName,
  searchLine,
  searchOf,
  searchTooLong,
  sortOfKey,
  starsShown,
} from '../../src/chrome/frames/community-model';
import { countListed, readSeen, writeSeen } from '../../src/cloud/community/counter';
import { backHref, watchHref } from '../../src/watch/href';

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);

describe('the list', () => {
  it('a short heading per column (Run, Stars, Com., Views), New the default; the letters; no Length', () => {
    expect(Object.keys(SORT_HEADS).sort()).toEqual(GALLERY_SORTS.filter((s) => s !== 'length').sort());
    expect(Object.values(SORT_HEADS).map((h) => h.label)).toEqual(['Run', 'Stars', 'Com.', 'Views']);
    expect(DEFAULT_SORT).toBe('new');
    expect(sortOfKey({ key: 'n' })).toBe('new');
    expect(sortOfKey({ key: 'S' })).toBe('top');
    expect(sortOfKey({ key: 'v' })).toBe('watched');
    expect(sortOfKey({ key: 'm' })).toBe('comments');
    expect(sortOfKey({ key: 'e' })).toBeNull();
    expect(sortOfKey({ key: 'l' })).toBeNull();
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
    expect(runName({ title: 'Orcs at the ford', character: 'Gibur' })).toBe('Orcs at the ford (Gibur)');
    expect(runName({ title: 'Orcs at the ford', character: '' })).toBe('Orcs at the ford');
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

describe('search', () => {
  it('the bounds are the contract’s; the text as the Worker takes it; the line over the list', () => {
    expect(searchOf('x'.repeat(GALLERY_Q_MIN))).not.toBeNull();
    expect(searchOf('x'.repeat(GALLERY_Q_MAX))).not.toBeNull();
    expect(searchOf('')).toBeNull();
    expect(searchOf(' a ')).toBeNull();
    expect(searchOf('  ford  ')).toBe('ford');
    expect(searchOf('orc   fight')).toBe('orc fight');
    expect(searchOf('x'.repeat(61))).toBeNull();
    expect(searchOf('\u200b\u200bx')).toBeNull();
    // Too long is said, not dropped (review fix 2 CR2): the cleaned text counts.
    expect(searchTooLong('x'.repeat(GALLERY_Q_MAX + 1))).toBe(true);
    expect(searchTooLong(` ${'x'.repeat(GALLERY_Q_MAX)}   `)).toBe(false);
    expect(searchTooLong('a')).toBe(false);
    expect(SEARCH_TOO_LONG).toBe(`A search takes at most ${GALLERY_Q_MAX} characters.`);
    expect(searchLine('ford', 3)).toBe('Search: “ford” — 3 runs');
    expect(searchLine('ford', 1)).toBe('Search: “ford” — 1 run');
    expect(searchLine('ford', 0)).toBe('Search: “ford” — 0 runs');
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
    expect(parseView('{"sort":"top","page":3,"by":"brego","sub":"hof"}')).toEqual({ sort: 'top', page: 3, by: 'brego', sub: 'hof' });
    expect(parseView('{"sort":"watched","page":1,"q":"  ford ","sub":"runs"}')).toEqual({ sort: 'watched', page: 1, q: 'ford', sub: 'runs' });
    expect(parseView('{"sort":"best","page":0,"by":"<b>","sub":"x","q":"a"}')).toEqual({ sort: 'new', page: 1 });
    // A sender's runs from the Hall of Fame keep where Back goes (review fix 2 CR3); only there.
    expect(parseView('{"sort":"new","page":1,"by":"brego","sub":"runs","from":"hof"}')).toEqual({ sort: 'new', page: 1, by: 'brego', sub: 'runs', from: 'hof' });
    expect(parseView('{"sort":"new","page":1,"sub":"runs","from":"hof"}')).toEqual({ sort: 'new', page: 1, sub: 'runs' });
    expect(parseView('{"sort":"new","page":1,"by":"brego","sub":"runs","from":"x"}')).toEqual({ sort: 'new', page: 1, by: 'brego', sub: 'runs' });
    // Before the owner's feedback: the Length sort and the phone's tabs are gone.
    expect(parseView('{"sort":"length","page":2,"tab":"runes"}')).toEqual({ sort: 'new', page: 2 });
    expect(parseView('not json')).toEqual({ sort: 'new', page: 1 });
  });

  it('the run’s address carries from=community; the watch page’s Back goes to <base>?community', () => {
    expect(watchHref('Ab3dE5fG7hJk', 'community')).toBe('/r/Ab3dE5fG7hJk?from=community');
    expect(watchHref('Ab3dE5fG7hJk', 'community', '/app/', true)).toBe('/app/r/Ab3dE5fG7hJk?from=community&cloudtest');
    expect(watchHref('Ab3dE5fG7hJk', 'published')).toBe('/r/Ab3dE5fG7hJk?from=published');
    expect(backHref('community')).toBe('/?community');
    expect(backHref('community', '/app/', true)).toBe('/app/?community&cloudtest');
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
