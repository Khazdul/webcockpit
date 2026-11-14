// Stage 60 part B: the Account page's model (src/chrome/frames/account/
// account-model.ts): the device list's order and the words of its times.
import { describe, expect, it } from 'vitest';
import type { AccountSession } from '../../src/cloud/account';
import { endOthersWords, labelWords, madeWords, namesAccount, orderSessions, sessionWords, usedWords } from '../../src/chrome/frames/account/account-model';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 14, 12);
const s = (id: string, o: Partial<AccountSession> = {}): AccountSession => ({ id, label: id, created: NOW, lastUsed: NOW, current: false, ...o });

describe('the device list', () => {
  it('puts this device first, then the latest used, whatever the server sent', () => {
    const list = [
      s('old', { lastUsed: NOW - 30 * DAY }),
      s('new', { lastUsed: NOW - DAY }),
      s('me', { lastUsed: NOW - 3 * DAY, current: true }),
      s('mid', { lastUsed: NOW - 2 * DAY }),
    ];
    expect(orderSessions(list).map((x) => x.id)).toEqual(['me', 'new', 'mid', 'old']);
    // The argument is not changed.
    expect(list.map((x) => x.id)).toEqual(['old', 'new', 'me', 'mid']);
  });

  it('breaks ties by the newest made, then by id, so the order is stable', () => {
    const list = [s('b'), s('a'), s('c', { created: NOW + 1 })];
    expect(orderSessions(list).map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(orderSessions([...list].reverse()).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });

  it('gives a session without a label a name to end it by', () => {
    expect(labelWords('Firefox on Linux')).toBe('Firefox on Linux');
    expect(labelWords('')).toBe('Unnamed device');
    expect(labelWords('   ')).toBe('Unnamed device');
    // Markup characters are kept as they are: the page writes text.
    expect(labelWords('<b>x</b>')).toBe('<b>x</b>');
  });
});

describe('the words of a session\'s times', () => {
  it('says the last use by the day and never finer (the server writes it once a day)', () => {
    expect(usedWords(NOW, NOW)).toBe('in the last day');
    expect(usedWords(NOW - 23 * 3_600_000, NOW)).toBe('in the last day');
    // The device's clock behind the server's.
    expect(usedWords(NOW + 5 * 60_000, NOW)).toBe('in the last day');
    expect(usedWords(NOW - DAY, NOW)).toBe('about a day ago');
    expect(usedWords(NOW - 1.9 * DAY, NOW)).toBe('about a day ago');
    expect(usedWords(NOW - 3 * DAY, NOW)).toBe('about 3 days ago');
    expect(usedWords(NOW - 13.5 * DAY, NOW)).toBe('about 13 days ago');
    expect(usedWords(NOW - 14 * DAY, NOW)).toBe('about 2 weeks ago');
    expect(usedWords(NOW - 36 * DAY, NOW)).toBe('about 5 weeks ago');
    expect(usedWords(NOW - 59 * DAY, NOW)).toBe('about 8 weeks ago');
    expect(usedWords(NOW - 60 * DAY, NOW)).toBe('about 2 months ago');
    expect(usedWords(NOW - 40 * 7 * DAY, NOW)).toBe('about 9 months ago');
    expect(usedWords(NOW - 400 * DAY, NOW)).toBe('over a year ago');
    // No word is ever an hour or a minute.
    for (let d = 0; d < 500; d += 0.37) expect(usedWords(NOW - d * DAY, NOW)).not.toMatch(/hour|minute|second|just now|today/);
  });

  it('reads the server\'s seconds and milliseconds alike, and makes nothing up for a bad value', () => {
    expect(usedWords((NOW - 3 * DAY) / 1000, NOW)).toBe('about 3 days ago');
    expect(usedWords(0, NOW)).toBe('');
    expect(usedWords(Number.NaN, NOW)).toBe('');
    expect(madeWords(NOW, 'en-GB')).toBe('14 Nov 2026');
    expect(madeWords(NOW / 1000, 'en-GB')).toBe('14 Nov 2026');
    expect(madeWords(0)).toBe('');
    expect(madeWords(Number.NaN)).toBe('');
  });

  it('writes the line under a device\'s name', () => {
    expect(sessionWords({ created: NOW - 9 * DAY, lastUsed: NOW - 3 * DAY }, NOW, 'en-GB')).toBe('Logged in 5 Nov 2026 · last used about 3 days ago');
    // This device: no "last used" (it is in use).
    expect(sessionWords({ created: NOW, lastUsed: 0 }, NOW, 'en-GB')).toBe('Logged in 14 Nov 2026');
    expect(sessionWords({ created: 0, lastUsed: NOW }, NOW, 'en-GB')).toBe('Last used in the last day');
    expect(sessionWords({ created: 0, lastUsed: 0 }, NOW)).toBe('');
  });
});

describe('the dialogs\' words', () => {
  it('counts the other sessions', () => {
    expect(endOthersWords(1)).toEqual({ question: 'End the session on the other device?', button: 'End 1 session' });
    expect(endOthersWords(2)).toEqual({ question: 'End the sessions on the 2 other devices?', button: 'End 2 sessions' });
  });

  it('takes the typed user name whatever its case and outer spaces, and nothing else', () => {
    expect(namesAccount('Olev', 'Olev')).toBe(true);
    expect(namesAccount(' olev ', 'Olev')).toBe(true);
    expect(namesAccount('OLEV', 'Olev')).toBe(true);
    expect(namesAccount('Ole', 'Olev')).toBe(false);
    expect(namesAccount('Olev2', 'Olev')).toBe(false);
    expect(namesAccount('', 'Olev')).toBe(false);
    expect(namesAccount('', '')).toBe(false);
  });
});
