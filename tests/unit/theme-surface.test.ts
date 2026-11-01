// Menu surfaces (src/theme/surface.ts, ADR 0116): every floating panel's
// colours derive from the terminal background, readable on every preset.
import { describe, expect, it } from 'vitest';
import { rootTokens } from '../../src/theme/apply';
import { contrast, luminance } from '../../src/theme/color';
import { migrateSettings } from '../../src/settings';
import { TERMINAL_BG_PRESETS } from '../../src/theme/presets';
import {
  SURFACE_MIN_CONTRAST,
  surfaceColors,
  surfaceContrasts,
  surfaceTokens,
  surfaceVar,
} from '../../src/theme/surface';

const PAPER = TERMINAL_BG_PRESETS.find((c) => c.name === 'paper')!.hex;

describe('surfaceColors', () => {
  for (const { name, hex } of TERMINAL_BG_PRESETS) {
    it(`${name}: every text role meets its minimum contrast`, () => {
      const c = surfaceContrasts(hex);
      for (const [role, min] of Object.entries(SURFACE_MIN_CONTRAST)) {
        expect(c[role], `${name} ${role}`).toBeGreaterThanOrEqual(min - 0.01);
      }
    });
  }

  it('keeps the old ghost panel on black', () => {
    expect(surfaceColors('#000000').bg).toBe('#0a0a0a');
  });

  it('gives Paper a light card, lighter than the page', () => {
    const s = surfaceColors(PAPER);
    expect(s.scheme).toBe('light');
    expect(luminance(s.bg)).toBeGreaterThan(luminance(PAPER));
    // Dark ink on the card.
    expect(luminance(s.fg)).toBeLessThan(luminance(s.bg));
  });

  it('gives every dark preset a dark panel', () => {
    for (const { name, hex } of TERMINAL_BG_PRESETS) {
      if (name === 'paper') continue;
      const s = surfaceColors(hex);
      expect(s.scheme, name).toBe('dark');
      expect(luminance(s.fg), name).toBeGreaterThan(luminance(s.bg));
    }
  });

  it('keeps the levels in order: border softer than border-hot, hot strongest', () => {
    for (const { name, hex } of TERMINAL_BG_PRESETS) {
      const s = surfaceColors(hex);
      expect(contrast(s.borderHot, s.bg), name).toBeGreaterThan(contrast(s.border, s.bg));
      expect(contrast(s.hot, s.bg), name).toBeGreaterThan(contrast(s.fg, s.bg));
      expect(contrast(s.fg, s.bg), name).toBeGreaterThan(contrast(s.dim, s.bg));
    }
  });

  it('falls back to black for a bad colour', () => {
    expect(surfaceColors('nope').bg).toBe('#0a0a0a');
  });
});

describe('surface tokens', () => {
  it('names roles as --sf-<kebab>', () => {
    expect(surfaceVar('borderHot')).toBe('--sf-border-hot');
    expect(surfaceVar('onTrack')).toBe('--sf-on-track');
    expect(Object.keys(surfaceTokens('#000000'))).toContain('--sf-danger-hover');
  });

  it('are part of the root tokens', () => {
    const t = rootTokens(migrateSettings({ appearance: { bg: PAPER } }));
    expect(t['--sf-bg']).toBe(surfaceColors(PAPER).bg);
    expect(t['--sf-scheme']).toBe('light');
    expect(rootTokens(migrateSettings({}))['--sf-bg']).toBe('#0a0a0a');
  });
});
