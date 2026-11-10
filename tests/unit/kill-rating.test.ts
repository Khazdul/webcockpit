import { describe, expect, it } from 'vitest';
import { fmtK } from '../../src/chrome/frames/stats-layout';
import { KillRater, RATING_MIN_KILLS, RATING_WINDOW, ratingOf } from '../../src/runs/kill-rating';
import type { RunEvent } from '../../src/runs/events';

describe('kill rating (ADR 0134)', () => {
  it('maps a ratio to the five words at the bounds', () => {
    expect(ratingOf(0)).toBe('poor');
    expect(ratingOf(0.4499)).toBe('poor');
    expect(ratingOf(0.45)).toBe('meh');
    expect(ratingOf(0.7999)).toBe('meh');
    expect(ratingOf(0.8)).toBe('good');
    expect(ratingOf(1.4999)).toBe('good');
    expect(ratingOf(1.5)).toBe('great');
    expect(ratingOf(2.4999)).toBe('great');
    expect(ratingOf(2.5)).toBe('superb');
    expect(ratingOf(Number.NaN)).toBe('poor');
  });

  it('calibrates until five kills, then rates against the median', () => {
    const r = new KillRater();
    for (let i = 0; i < RATING_MIN_KILLS - 1; i++) r.add(1000);
    expect(r.median).toBeNull();
    expect(r.rate(1000)).toBeNull();
    r.add(3000);
    expect(r.median).toBe(1000);
    expect(r.rate(1000)).toEqual({ rating: 'good', ratio: 1 });
    expect(r.rate(2600)?.rating).toBe('superb');
    expect(r.rate(400)?.rating).toBe('poor');
  });

  it('uses the last 30 mob kills; pkills and XP-less kills stay out of the median', () => {
    const r = new KillRater();
    for (let i = 0; i < RATING_WINDOW; i++) r.add(500);
    for (let i = 0; i < RATING_WINDOW; i++) r.add(10_000);
    expect(r.count).toBe(RATING_WINDOW);
    expect(r.median).toBe(10_000);
    r.add(1_000_000, true);
    r.add(0);
    r.add(-50);
    expect(r.median).toBe(10_000);
    expect(r.rate(1_000_000)?.rating).toBe('superb');
  });

  it('even counts take the middle pair; adapts to the level (2k great low, poor high)', () => {
    const low = new KillRater();
    for (const x of [600, 800, 900, 1000, 1100, 1200]) low.add(x);
    expect(low.median).toBe(950);
    expect(low.rate(2000)?.rating).toBe('great');
    const high = new KillRater();
    for (const x of [12_000, 14_000, 15_000, 16_000, 18_000]) high.add(x);
    expect(high.rate(2000)?.rating).toBe('poor');
  });

  it('reads run events', () => {
    const ev: RunEvent[] = [
      { type: 'kill', us: 1, logUs: 1, mobName: 'a rat', xpDelta: 100 },
      { type: 'pkill', us: 2, logUs: 2, name: 'Ugluk', race: 'Orc', xpDelta: 90_000 },
      ...[2, 3, 4, 5].map((i): RunEvent => ({ type: 'kill', us: i + 2, logUs: i, mobName: 'a rat', xpDelta: 100 * i })),
    ];
    const r = new KillRater();
    r.addEvents(ev);
    expect(r.count).toBe(5);
    expect(r.median).toBe(300);
  });

  it('shows XP exact under 1000 and with k above (fmtK)', () => {
    expect(fmtK(540)).toBe('540');
    expect(fmtK(999)).toBe('999');
    expect(fmtK(2600)).toBe('2.6k');
    expect(fmtK(25_900)).toBe('25.9k');
  });
});
