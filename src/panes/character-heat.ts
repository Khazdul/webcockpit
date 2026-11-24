// The Status cells' colour by step (stage 77 H2, round 16 variant C "heat",
// ADR 0166 addendum 30). Pure.
//
// Each of Mood, Casts, Alertness and Weight goes from calm to hot along its
// steps (src/gmcp/char.ts): Mood blue (wimpy) to red (berserk), Casts warm
// (quick) to cool (thorough), Alertness grey to hot, Weight green to red.
// The middle step of each is the card's neutral parchment. Weight keeps
// today's signal: really heavy the vitals' low orange, painful and torture
// their critical red (`signalColors`; on Paper a deeper orange, for the
// contrast). The value, the fill track at the
// cell's foot and a slight warming of the cell's ground take the step's
// colour. One table per side: the Lykta (dark) and the Paper (light) one;
// every value reads at 4.5 : 1 or more on its cell's ground
// (tests/unit/character-heat.test.ts).

import { ALERTNESS_STEPS, CARRYING_STEPS, MOOD_STEPS, SPELL_EFFORT_STEPS } from '../gmcp/char';
import { DARK_SIGNALS, LIGHT_SIGNALS } from './palette';

export type HeatKey = 'mood' | 'casts' | 'alertness' | 'weight';

/** The steps of each cell, low → high, as the card shows them. */
export const HEAT_STEPS: Readonly<Record<HeatKey, readonly string[]>> = {
  mood: MOOD_STEPS,
  casts: SPELL_EFFORT_STEPS,
  alertness: ALERTNESS_STEPS,
  weight: CARRYING_STEPS,
};

/** On a dark pane (the Lykta look). */
export const HEAT_DARK: Readonly<Record<HeatKey, readonly string[]>> = {
  // wimpy, prudent, normal, brave, aggressive, berserk
  mood: ['#86a9cf', '#8fc0ad', '#d9cfb4', '#eab35e', '#f2874a', '#ff4d4d'],
  // quick, fast, normal, careful, thorough
  casts: ['#f2a65a', '#e8c47e', '#d9cfb4', '#a7c8b6', '#7db7da'],
  // normal, careful, attentive, vigilant, paranoid
  alertness: ['#a9a491', '#cfc6a0', '#e9cf9f', '#f2b45c', '#ee7d5c'],
  // peanuts, uncomfortable, heavy, really heavy, painful, torture
  weight: ['#6fd38a', '#a6c95a', '#d9cfb4', DARK_SIGNALS.vitalLow, DARK_SIGNALS.vitalCritical, DARK_SIGNALS.vitalCritical],
};

/** On a light pane (Paper). */
export const HEAT_LIGHT: Readonly<Record<HeatKey, readonly string[]>> = {
  mood: ['#2f5f8e', '#2f6e58', '#6e5220', '#8a5a0c', '#a84716', '#b3261e'],
  casts: ['#9a4f0c', '#7c5f16', '#6e5220', '#2f6e58', '#25608a'],
  alertness: ['#665c48', '#6e6030', '#6e5220', '#8a5a0c', '#a84716'],
  // Really heavy a deeper orange than the vitals' low (#b85400 reads at 4.3 : 1 on the warmed ground).
  weight: ['#26733a', '#55700f', '#6e5220', '#a04a00', LIGHT_SIGNALS.vitalCritical, LIGHT_SIGNALS.vitalCritical],
};

/** The colour of `step` of `key` on a side; null for no step (an unknown word, no value). */
export function heatColor(key: HeatKey, step: number | null, light: boolean): string | null {
  if (step === null) return null;
  return (light ? HEAT_LIGHT : HEAT_DARK)[key][step] ?? null;
}
