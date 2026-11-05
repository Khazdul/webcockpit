import { describe, expect, it } from 'vitest';
import { PANE_COLORS } from '../../src/layout/types';
import {
  BORDER_L_LIGHT,
  contrast,
  darkInk,
  lightTintFill,
  hexToHsl,
  hslToHex,
  isLight,
  lighten,
  lineHighlight,
  luminance,
  panelFill,
  lightShift,
  normalizeHex,
  paneBorder,
  paneEffectiveBg,
  paneIsLight,
  paneOutline,
  paneShades,
  shadeRamp,
  washout,
} from '../../src/theme/color';
import { PANE_TINTS, TERMINAL_BG_PRESETS } from '../../src/theme/presets';

describe('hex and HSL', () => {
  it('normalises', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('1a0E0e')).toBe('#1a0e0e');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex(7)).toBeNull();
  });

  it('round-trips', () => {
    for (const hex of ['#000000', '#ffffff', '#1a0e0e', '#f4ecd8', '#00d7d7', '#808000', '#c0c0c0']) {
      const { h, s, l } = hexToHsl(hex);
      expect(hslToHex(h, s, l)).toBe(hex);
    }
    expect(hexToHsl('#ff0000')).toEqual({ h: 0, s: 100, l: 50 });
    expect(hexToHsl('#808080').s).toBe(0);
  });

  it('light/dark threshold is L > 58', () => {
    expect(isLight('#f4ecd8')).toBe(true); // paper
    for (const c of TERMINAL_BG_PRESETS.filter((p) => p.name !== 'paper')) expect(isLight(c.hex)).toBe(false);
    expect(isLight(hslToHex(0, 0, 57))).toBe(false);
    expect(isLight(hslToHex(0, 0, 59))).toBe(true);
  });
});

describe('pane tints and borders (Inv §10.4)', () => {
  it('named borders are the fill + 0x14 per channel', () => {
    for (const c of PANE_COLORS) {
      const t = PANE_TINTS[c];
      if (t.fill) expect(lighten(t.fill)).toBe(t.border);
    }
    expect(paneBorder('red', '#000000')).toBe('#2e2222');
    expect(paneBorder('grey', '#000000')).toBe('#2a2a2a');
    expect(paneBorder('purple', '#1c2128')).toBe('#2a2430');
  });

  it('None on black is floored at L16 (≈ #292929)', () => {
    expect(paneBorder('black', '#000000')).toBe('#292929');
  });

  it('None on a lighter dark terminal keeps the plain lift', () => {
    expect(paneBorder('black', '#1c2128')).toBe('#30353c');
    expect(paneBorder('black', '#161616')).toBe('#2a2a2a');
  });

  it('None on a faintly tinted near-black keeps its hue at the floor', () => {
    const b = paneBorder('black', '#030001');
    expect(hexToHsl(b).l).toBeCloseTo(16, 0);
    expect(hexToHsl(b).s).toBeGreaterThan(0);
  });

  it('None on paper: same (h, s) as the bg at L80', () => {
    const b = paneBorder('black', '#f4ecd8');
    const bg = hexToHsl('#f4ecd8');
    const x = hexToHsl(b);
    expect(x.l).toBeCloseTo(80, 0);
    expect(x.h).toBeCloseTo(bg.h, 0);
    expect(paneIsLight('black', '#f4ecd8')).toBe(true);
    // A named tint is a pale wash on a light page (ADR 0123 "Paper"): a light pane, its border at L80 in its hue.
    expect(paneIsLight('red', '#f4ecd8')).toBe(true);
    expect(paneBorder('red', '#f4ecd8')).toBe(hslToHex(2, 60, BORDER_L_LIGHT));
  });

  it('a tint on a light page is a pale wash of its hue, as light as the page (ADR 0123 "Paper")', () => {
    const light = TERMINAL_BG_PRESETS.filter((p) => isLight(p.hex)).map((p) => p.hex);
    expect(light).toContain('#f4ecd8');
    for (const page of [...light, '#ffffff', '#e8e8e8', '#dfe8f0']) {
      for (const c of PANE_COLORS) {
        const tint = PANE_TINTS[c];
        const fill = paneEffectiveBg(c, page);
        if (!tint.hs) {
          expect(fill).toBe(page);
          continue;
        }
        expect(fill).toBe(lightTintFill(tint.hs, page));
        expect(isLight(fill)).toBe(true);
        // As light as the page: within 1 % of its luminance, so every colour fitted to the page keeps its contrast.
        expect(Math.abs(luminance(fill) - luminance(page)) / luminance(page)).toBeLessThan(0.01);
        expect(paneIsLight(c, page)).toBe(true);
      }
    }
    // The hue shows: on paper a red wash leans red, a blue one blue; on a neutral grey page the wash takes the tint's hue.
    const page = hexToHsl('#f4ecd8').h;
    expect(hexToHsl(paneEffectiveBg('red', '#f4ecd8')).h).toBeLessThan(page - 10);
    expect(hexToHsl(paneEffectiveBg('blue', '#f4ecd8')).h).toBeGreaterThan(150);
    const rh = hexToHsl(paneEffectiveBg('red', '#e0e0e0')).h;
    expect(rh < 10 || rh > 355).toBe(true);
    expect(Math.abs(hexToHsl(paneEffectiveBg('blue', '#e0e0e0')).h - 210)).toBeLessThan(5);
    expect(Math.abs(hexToHsl(paneEffectiveBg('green', '#e0e0e0')).h - 130)).toBeLessThan(5);
    // A white page leaves no room for a hue: the wash is white (it may not be lighter than the page).
    expect(contrast(paneEffectiveBg('red', '#ffffff'), '#ffffff')).toBeLessThan(1.02);
    // A dark page keeps the dark fills.
    for (const c of PANE_COLORS) {
      if (PANE_TINTS[c].fill) expect(paneEffectiveBg(c, '#000000')).toBe(PANE_TINTS[c].fill);
    }
  });

  it('effective bg is the fill, or the terminal bg for None', () => {
    expect(paneEffectiveBg('blue', '#000000')).toBe('#0e141c');
    expect(paneEffectiveBg('black', '#2B1B12')).toBe('#2b1b12');
  });
});

describe('shade ramp (Inv §10.4)', () => {
  it('walks one hue down the dark ramp', () => {
    const r = shadeRamp(2, 60, false);
    expect(hexToHsl(r.track).l).toBeCloseTo(15, 0);
    expect(r.track).toBe(hslToHex(2, 52, 15));
    expect(hexToHsl(r.paneBg).l).toBeCloseTo(8, 0);
    expect(hexToHsl(r.vtext).l).toBeCloseTo(72, 0);
    expect(hexToHsl(r.vtext).s).toBeCloseTo(30, 0);
    expect(hexToHsl(r.glow).l).toBeCloseTo(64, 0);
    expect(r.dim).toBe(hslToHex(2, 60, 27));
    expect(r.mid).toBe(hslToHex(2, 60, 42));
    expect(r.label).toBe(hslToHex(2, 38, 60));
  });

  it('light ramp inverts the lightness', () => {
    const r = shadeRamp(40, 50, true);
    expect(r.track).toBe(hslToHex(40, 40, 80));
    expect(r.vtext).toBe(hslToHex(40, 32, 22));
    expect(r.glow).toBe(hslToHex(40, 50, 60));
  });

  it('grey and None-on-black ramps are neutral; saturation clamps at 0', () => {
    const g = paneShades('grey', '#000000');
    expect(g.track).toBe(hslToHex(0, 0, 15));
    expect(g.dim).toBe('#454545');
    const n = paneShades('black', '#000000');
    expect(n).toEqual(g);
  });

  it('None on paper uses the light ramp with the bg hue', () => {
    const bg = hexToHsl('#f4ecd8');
    expect(paneShades('black', '#f4ecd8')).toEqual(shadeRamp(bg.h, bg.s, true));
  });
});

describe('light transforms (Inv §10.5)', () => {
  it('lightShift caps L and floors S, never overshoots', () => {
    const c = hexToHsl(lightShift('#66b2ff'));
    expect(c.l).toBeCloseTo(45, 0);
    expect(c.s).toBeCloseTo(100, 0);
    const dark = '#003300';
    expect(lightShift(dark)).toBe(dark);
    expect(lightShift('#C0C0C0')).toBe('#c0c0c0'); // achromatic unchanged
  });

  it('washout pins L and scales S', () => {
    const w = hexToHsl(washout('#800000'));
    expect(w.l).toBeCloseTo(70, 0);
    expect(w.s).toBeCloseTo(45, 0);
    expect(w.h).toBeCloseTo(0, 0);
  });

  it('darkInk tints toward the bg', () => {
    expect(darkInk('#000000')).toBe(hslToHex(0, 0, 40));
    const p = hexToHsl(darkInk('#f4ecd8'));
    expect(p.l).toBeCloseTo(40, 0);
    expect(p.s).toBeCloseTo(hexToHsl('#f4ecd8').s * 0.85, 0);
  });

  it('line highlight lifts 12 % toward white on dark, black on light', () => {
    expect(lineHighlight('#000000')).toBe('#1f1f1f');
    expect(lineHighlight('#f4ecd8')).toBe('#d7d0be');
  });

  it('the panel fill is the background a little toward the foreground (ADR 0121)', () => {
    const dark = panelFill('#000000', '#bcbcbc');
    expect(dark).not.toBe('#000000');
    expect(luminance(dark)).toBeGreaterThan(luminance('#000000'));
    expect(luminance(dark)).toBeLessThan(luminance(lineHighlight('#000000')));
    // Paper: darker than the paper, toward its dark ink.
    const paper = panelFill('#f4ecd8', '#3a362e');
    expect(luminance(paper)).toBeLessThan(luminance('#f4ecd8'));
    expect(luminance(paper)).toBeGreaterThan(luminance(lineHighlight('#f4ecd8')));
    // A blue background stays blue; a foreground too close to the background mixes toward white.
    expect(panelFill('#00005f', '#c0c0c0')).toMatch(/^#[0-9a-f]{6}$/);
    expect(luminance(panelFill('#101010', '#141414'))).toBeGreaterThan(luminance('#141414'));
  });

  it('pane hover outline follows the main background (ADR 0084 addendum)', () => {
    // Black: the discreet grey of round 1 (the frame grey).
    expect(paneOutline('#000000')).toBe('#292929');
    expect(paneOutline('#000000')).toBe(paneBorder('black', '#000000'));
    // Blue: a lighter blue; paper: a darker paper shade.
    const blue = hexToHsl(paneOutline('#0e141c'));
    expect(blue.h).toBeGreaterThan(190);
    expect(blue.h).toBeLessThan(230);
    expect(blue.l).toBeGreaterThan(hexToHsl('#0e141c').l);
    expect(paneOutline('#f4ecd8')).toBe('#d7d0be');
    expect(hexToHsl(paneOutline('#f4ecd8')).l).toBeLessThan(hexToHsl('#f4ecd8').l);
    expect(paneOutline('nope')).toBe('#292929');
  });
});
