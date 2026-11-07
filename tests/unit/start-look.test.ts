// Stage 41 (ADR 0125): the start page's pure helpers.
import { describe, expect, it } from 'vitest';
import { gameTimeAt } from '../../src/gmcp/gametime';
import { letterAt, letterOf } from '../../src/chrome/kit/look';
import { timeAgo } from '../../src/chrome/frames/profiles';
import { almanacLines, ordinal } from '../../src/chrome/start-layout';
import { SkyFeed, inkFor } from '../../src/chrome/start-surface';
import type { StartSkyHandle } from '../../src/start/sky';
import type { SkyLook } from '../../src/start/sky/look';

describe('almanac', () => {
  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 29, 30].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '29th', '30th',
    ]);
  });

  it('gives the date and the time line, without the moon', () => {
    expect(
      almanacLines({ weekday: 'Mersday', day: 29, monthName: 'Afterlithe', hour: 13, minute: 5, period: 'day', year: 3038 }),
    ).toEqual({ date: 'Mersday, the 29th of Afterlithe', time: '1:05pm · day · T.A. 3038' });
    expect(almanacLines({ weekday: 'Sunday', day: 1, monthName: 'Afteryule', hour: 0, minute: 0, period: 'night', year: 3039 }).time).toBe(
      '12:00am · night · T.A. 3039',
    );
    const a = almanacLines(gameTimeAt(3038 * 518_400 + 6 * 43_200 + 28 * 1440 + 13 * 60 + 5));
    expect(a.time).toBe('1:05pm · day · T.A. 3038');
    expect(a.date).toMatch(/^\w+, the 29th of \w+$/);
  });
});

describe('the quote and almanac ink', () => {
  it('turns dark above 0.54 luma and pale again below 0.46 (ADR 0124)', () => {
    expect(inkFor(0.5, false)).toBe(false);
    expect(inkFor(0.54, false)).toBe(false);
    expect(inkFor(0.55, false)).toBe(true);
    expect(inkFor(0.5, true)).toBe(true);
    expect(inkFor(0.46, true)).toBe(true);
    expect(inkFor(0.45, true)).toBe(false);
  });
});

describe('the sky feed', () => {
  it('gives a still look of the start clock until the engine attaches, then the engine\'s', () => {
    const feed = new SkyFeed();
    const seen: SkyLook[] = [];
    const off = feed.subscribe((l) => seen.push(l));
    const still = feed.setStill({ w: 390, h: 844 });
    expect(still.view).toEqual({ w: 390, h: 844 });
    expect(feed.look()).toBe(still);
    const engineLook = { ...still, dayness: 0.123 } as SkyLook;
    let push: ((l: SkyLook) => void) | null = null;
    const engine = {
      look: () => engineLook,
      onLook: (cb: (l: SkyLook) => void) => ((push = cb), () => (push = null)),
    } as unknown as StartSkyHandle;
    feed.attach(engine);
    expect(feed.look()).toBe(engineLook);
    push!({ ...engineLook, dayness: 0.5 } as SkyLook);
    expect(seen.map((l) => l.dayness)).toEqual([still.dayness, 0.123, 0.5]);
    // a still look while the engine runs is not pushed
    feed.setStill({ w: 100, h: 100 });
    expect(seen).toHaveLength(3);
    feed.detach();
    expect(push).toBeNull();
    expect(feed.look().view).toEqual({ w: 100, h: 100 });
    off();
  });
});

describe('shortcut letters', () => {
  it('reads a plain letter only', () => {
    expect(letterOf({ key: 'E' })).toBe('e');
    expect(letterOf({ key: 'x' })).toBe('x');
    expect(letterOf({ key: 'e', ctrlKey: true })).toBeNull();
    expect(letterOf({ key: 'Enter' })).toBeNull();
    expect(letterOf({ key: '1' })).toBeNull();
  });

  it('finds the letter in its label', () => {
    expect(letterAt('Export', 'x')).toBe(1);
    expect(letterAt('Spotlights', 'l')).toBe(4);
    expect(letterAt('Enter MUME', 'e')).toBe(0);
    expect(letterAt('About', undefined)).toBe(-1);
  });
});

describe('profile times', () => {
  const now = Date.UTC(2026, 10, 7, 12);
  it('says how long ago', () => {
    expect(timeAgo(0, now)).toBe('');
    expect(timeAgo(now - 10_000, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(timeAgo(now - 60 * 60_000, now)).toBe('1 hour ago');
    expect(timeAgo(now - 30 * 3600_000, now)).toBe('yesterday');
    expect(timeAgo(now - 3 * 86400_000, now)).toBe('3 days ago');
    expect(timeAgo(now - 21 * 86400_000, now)).toBe('3 weeks ago');
    expect(timeAgo(now - 120 * 86400_000, now)).toBe('4 months ago');
    expect(timeAgo(now - 800 * 86400_000, now)).toBe('2 years ago');
  });
});
