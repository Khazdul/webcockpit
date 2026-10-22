// The first paint's data (ADR 0083): the banner faces cover the banner in
// every family, the mirror is read as the settings store reads it, and the
// start page layout it shares with the main frame.
import { describe, expect, it } from 'vitest';
import { BANNER_CHARS } from '../../src/boot/banner-faces';
import { BANNER_FACES } from '../../src/boot/banner-faces';
import { MIRROR_KEY, bannerFiles, firstAppearance } from '../../src/boot/first-paint-data';
import { BANNER_H, COCKPIT_ROWS, MUME_ROWS, STARS } from '../../src/chrome/banner-data';
import { START_MENU_ROWS, startLayout } from '../../src/chrome/start-layout';
import { QUOTES } from '../../src/chrome/quotes';
import { MIRROR_KEY as STORE_MIRROR_KEY } from '../../src/settings/store';
import { migrateAppearance } from '../../src/settings/migrate';
import { FONT_IDS, PHONE_FONT_SIZE, defaultSettings } from '../../src/settings/types';
import { FONTS } from '../../src/theme/fonts';

describe('banner faces', () => {
  it('include every glyph the banner draws', () => {
    const glyphs = new Set([...MUME_ROWS.join(''), ...COCKPIT_ROWS.join(''), ...STARS.map((s) => s.glyph), '░']);
    for (const g of glyphs) expect(BANNER_CHARS).toContain(g);
  });

  it('draw the whole banner in every bundled family, in stack order', () => {
    for (const id of FONT_IDS) {
      if (FONTS[id].local) continue;
      const files = bannerFiles(id);
      expect(files.length, id).toBeGreaterThan(0);
      const covered = files.flatMap((f) => [...BANNER_FACES[f]!.chars]);
      for (const c of BANNER_CHARS) expect(covered, `${id} ${c}`).toContain(c);
      // The family's own face comes after its overrides, DejaVu last.
      expect(files.at(-1)).toBe('DejaVuSansMono.woff2');
    }
  });

  it('a local-only family is looked up by name, its fill face skipped when it draws nothing here', () => {
    expect(bannerFiles('lucida')).toEqual(['local:lucida', 'DejaVuSansMono.woff2']);
  });
});

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

describe('startLayout', () => {
  it('puts the menu under the banner when it fits, else under one blank row', () => {
    const q = QUOTES[0]!.text;
    expect(startLayout(80, 40, q)).toMatchObject({ showBanner: true, showQuote: true, menuRow: BANNER_H + 2 });
    expect(startLayout(80, 18, q)).toMatchObject({ showBanner: false, menuRow: 1 });
    expect(startLayout(38, 40, q).showBanner).toBe(false);
    expect(START_MENU_ROWS).toBe(7);
  });
});
