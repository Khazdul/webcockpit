// The first paint's data (ADR 0083 and its 2026-11-07 addendum): the
// mirror is read as the settings store reads it, and the loading panel
// sits where the start menu puts its panel.
import { describe, expect, it } from 'vitest';
import { MIRROR_KEY, firstAppearance, panelTop } from '../../src/boot/first-paint-data';
import { MIRROR_KEY as STORE_MIRROR_KEY } from '../../src/settings/store';
import { migrateAppearance } from '../../src/settings/migrate';
import { FONT_IDS, PHONE_FONT_SIZE, defaultSettings } from '../../src/settings/types';

describe('firstAppearance', () => {
  it('reads the same mirror key as the settings store', () => {
    expect(MIRROR_KEY).toBe(STORE_MIRROR_KEY);
  });

  it('agrees with migrateAppearance on the fields it uses', () => {
    const samples: unknown[] = [
      {},
      { font: 'firacode', size: 21, padding: 7, fg: '#ABCDEF', bg: '#fff' },
      { font: 'nope', size: 99, padding: -3, fg: 'red', bg: 12 },
      { font: 'hack', size: 6.6, padding: 40 },
    ];
    for (const s of samples) {
      const m = migrateAppearance(s);
      expect(firstAppearance(JSON.stringify(s), false)).toEqual({ font: m.font, size: m.size, padding: m.padding, fg: m.fg, bg: m.bg });
    }
  });

  it('without a mirror: the defaults, the phone size on a phone', () => {
    const d = defaultSettings().appearance;
    expect(firstAppearance(null, false)).toMatchObject({ font: d.font, size: d.size });
    expect(firstAppearance(null, true)).toMatchObject({ font: d.font, size: PHONE_FONT_SIZE });
    expect(firstAppearance('not json', false)).toMatchObject({ font: d.font, size: d.size });
  });
});

describe('panelTop', () => {
  it("is the start menu stage's top padding: under the measured wordmark and the gap, or 18 px without it", () => {
    expect(panelTop(147)).toBe('calc(var(--wc-brand-top) + 147px + var(--wc-brand-gap))');
    expect(panelTop(null)).toBe('18px');
  });
});
