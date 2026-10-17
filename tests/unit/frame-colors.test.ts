// The frame's glass shades (layout.css, ADR 0091 "Frames", addendum: glass
// rim and nameplate) stay inside sRGB for every pane colour on every page
// colour: Chromium clips an out-of-gamut oklch per channel, and the
// mockup's light specular line showed a yellow fringe from it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PANE_COLORS } from '../../src/layout/types';
import { paneBorder } from '../../src/theme/color';
import { TERMINAL_BG_PRESETS } from '../../src/theme/presets';

const CSS = readFileSync(new URL('../../src/layout/layout.css', import.meta.url), 'utf8');

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.sign(c) * Math.abs(c) ** (1 / 2.4) - 0.055);

function oklch(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

function srgb(L: number, C: number, h: number): number[] {
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(gam);
}

describe('frame colours', () => {
  it('keeps every shade derived from the pane border inside sRGB, for every preset', () => {
    // oklch(from var(--pane-border) L min(calc(c * k), cap) h)
    const shades = [...CSS.matchAll(/oklch\(from var\(--pane-border\) ([\d.]+) min\(calc\(c \* ([\d.]+)\), ([\d.]+)\) h\)/g)].map((m) => m.slice(1).map(Number));
    expect(shades.length).toBeGreaterThanOrEqual(4);
    const out: string[] = [];
    for (const bg of TERMINAL_BG_PRESETS)
      for (const c of PANE_COLORS) {
        const pb = paneBorder(c, bg.hex);
        const [, C, h] = oklch(pb);
        for (const [L, k, cap] of shades) {
          const rgb = srgb(L!, Math.min(C * k!, cap!), h);
          if (rgb.some((v) => v < -0.001 || v > 1.001)) out.push(`${bg.name}/${c} ${pb} L${L}`);
        }
      }
    expect(out).toEqual([]);
  });

  it('keeps Plain neutral: no chroma on a grey border', () => {
    expect(oklch(paneBorder('black', '#000000'))[1]).toBeLessThan(1e-3);
  });
});
