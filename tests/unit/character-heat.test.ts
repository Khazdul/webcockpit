// The Status cells' colour by step (stage 77 H2, round 16 variant C, ADR 0166 addendum 30).
import { describe, expect, it } from 'vitest';
import { ALERTNESS_STEPS, CARRYING_STEPS, MOOD_STEPS, SPELL_EFFORT_STEPS } from '../../src/gmcp/char';
import { PANE_COLORS } from '../../src/layout/types';
import { HEAT_DARK, HEAT_LIGHT, HEAT_STEPS, type HeatKey, heatColor } from '../../src/panes/character-heat';
import { DARK_SIGNALS, LIGHT_SIGNALS } from '../../src/panes/palette';
import { contrast, hexToRgb, isLight, paneContentBg } from '../../src/theme/color';
import { TERMINAL_BG_PRESETS } from '../../src/theme/presets';

const KEYS: readonly HeatKey[] = ['mood', 'casts', 'alertness', 'weight'];
const hex = (r: number, g: number, b: number): string => `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

/** `sum(w_i * c_i)` of hex colours (weights summing to 1). */
function blend(parts: readonly [string, number][]): string {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [c, w] of parts) {
    const x = hexToRgb(c);
    r += x.r * w;
    g += x.g * w;
    b += x.b * w;
  }
  return hex(r, g, b);
}

/**
 * The foot of a dark cell (its warmest ground, character.css): rgb(0 0 0 / 0.2)
 * mixed with 13 % of the step's colour, over the pane's ground.
 */
const darkGround = (bg: string, hc: string): string => blend([[bg, 0.696], [hc, 0.13], ['#000000', 0.174]]);
/** The foot of a Paper cell: #fffdf8 with 9 % of the step's colour. */
const lightGround = (hc: string): string => blend([['#fffdf8', 0.91], [hc, 0.09]]);

describe('the Status cells’ heat', () => {
  it('has one colour per real step of each cycle, on both sides', () => {
    expect(HEAT_STEPS).toEqual({ mood: MOOD_STEPS, casts: SPELL_EFFORT_STEPS, alertness: ALERTNESS_STEPS, weight: CARRYING_STEPS });
    for (const k of KEYS) {
      expect(HEAT_DARK[k]).toHaveLength(HEAT_STEPS[k].length);
      expect(HEAT_LIGHT[k]).toHaveLength(HEAT_STEPS[k].length);
      for (const c of [...HEAT_DARK[k], ...HEAT_LIGHT[k]]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('maps a step to its colour; no step, no colour', () => {
    expect(heatColor('mood', 0, false)).toBe('#86a9cf');
    expect(heatColor('mood', 5, false)).toBe('#ff4d4d');
    expect(heatColor('casts', 0, true)).toBe(HEAT_LIGHT.casts[0]);
    expect(heatColor('alertness', null, false)).toBeNull();
    expect(heatColor('weight', 9, false)).toBeNull();
  });

  it('runs calm → hot: Mood blue to red, Casts warm to cool, Alertness grey to hot, Weight green to red', () => {
    const hue = (c: string): { r: number; g: number; b: number } => hexToRgb(c);
    for (const t of [HEAT_DARK, HEAT_LIGHT]) {
      const m0 = hue(t.mood[0]!);
      const m5 = hue(t.mood[5]!);
      expect(m0.b).toBeGreaterThan(m0.r);
      expect(m5.r).toBeGreaterThan(m5.b + 100);
      const c0 = hue(t.casts[0]!);
      const c4 = hue(t.casts[4]!);
      expect(c0.r).toBeGreaterThan(c0.b);
      expect(c4.b).toBeGreaterThan(c4.r);
      const a4 = hue(t.alertness[4]!);
      expect(a4.r).toBeGreaterThan(a4.b + 60);
      const w0 = hue(t.weight[0]!);
      expect(w0.g).toBeGreaterThan(w0.r);
    }
  });

  it('Weight keeps today’s signal: really heavy orange, painful and torture red', () => {
    expect(HEAT_DARK.weight.slice(3)).toEqual([DARK_SIGNALS.vitalLow, DARK_SIGNALS.vitalCritical, DARK_SIGNALS.vitalCritical]);
    // On Paper the low orange a little deeper, for its 4.5 : 1 on the warmed ground.
    expect(HEAT_LIGHT.weight.slice(4)).toEqual([LIGHT_SIGNALS.vitalCritical, LIGHT_SIGNALS.vitalCritical]);
    const o = hexToRgb(HEAT_LIGHT.weight[3]!);
    expect(o.r).toBeGreaterThan(o.g + 50);
    expect(o.g).toBeGreaterThan(o.b + 40);
  });

  it('every value reads at 4.5 : 1 on its warmed ground: every dark pane tint and background, and Paper', () => {
    const darks = new Set<string>();
    const lights = new Set<string>();
    for (const { hex: term } of TERMINAL_BG_PRESETS) {
      for (const color of PANE_COLORS) {
        for (const glass of [true, false]) {
          const bg = paneContentBg(color, term, glass);
          (isLight(bg) ? lights : darks).add(bg);
        }
      }
    }
    expect(lights.size).toBeGreaterThan(0);
    let worstDark = 21;
    let worstLight = 21;
    for (const k of KEYS) {
      for (const hc of HEAT_DARK[k]) for (const bg of darks) worstDark = Math.min(worstDark, contrast(hc, darkGround(bg, hc)));
      // A Paper cell has its own ground whatever the pane's light tint.
      for (const hc of HEAT_LIGHT[k]) worstLight = Math.min(worstLight, contrast(hc, lightGround(hc)));
    }
    expect(worstDark).toBeGreaterThanOrEqual(4.5);
    expect(worstLight).toBeGreaterThanOrEqual(4.5);
  });
});
