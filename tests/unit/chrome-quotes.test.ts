import { describe, expect, it } from 'vitest';
import { QUOTES, randomQuote } from '../../src/chrome/quotes';

describe('quotes', () => {
  it('has about twenty attributed quotes and picks one', () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(20);
    for (const q of QUOTES) {
      expect(q.text.length).toBeGreaterThan(5);
      expect(q.by.length).toBeGreaterThan(2);
    }
    expect(randomQuote(() => 0)).toBe(QUOTES[0]);
    expect(randomQuote(() => 0.9999999)).toBe(QUOTES[QUOTES.length - 1]);
  });
});
