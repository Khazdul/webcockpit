// Colours of the Group and Timers panes (ADR 0122). A colour setting is
// `auto` or a `#rrggbb`; `auto` resolves to the default of the pane's side
// (dark or light, `paneShade(...).light`), a hex is used as stored on both
// sides. The picker offers `PICKER_COLORS` (twelve colours that read on
// black and on paper alike), a free colour input and Auto.

import type { ColorSetting } from '../settings/types';
import type { TimerGroup } from '../timers/entry';

/** Everything with a colour setting: the timer groups and the three vitals. */
export type ColorKey = TimerGroup | 'hp' | 'mana' | 'mp';

/** The Auto colours on a dark pane (ADR 0122 table). */
export const DARK_COLORS: Readonly<Record<ColorKey, string>> = {
  sanct: '#f0b6e4',
  spell: '#66b2ff',
  buff: '#4cc96a',
  debuff: '#c8504f',
  stored: '#d6407e',
  blind: '#3fd0d0',
  charm: '#9d86ff',
  hp: '#2fa84f',
  mana: '#3d7eff',
  mp: '#c08a3e',
};

/** The Auto colours on a light pane (Paper; ADR 0122 table). */
export const LIGHT_COLORS: Readonly<Record<ColorKey, string>> = {
  sanct: '#a956b5',
  spell: '#2a56c8',
  buff: '#2a6e1a',
  debuff: '#98332f',
  stored: '#8e1a50',
  blind: '#00737e',
  charm: '#4b3aa8',
  hp: '#2a6e1a',
  mana: '#2a56c8',
  mp: '#846400',
};

/** Fixed signal colours by side: a vital at ≤ 45 % and ≤ 25 %, the ending-soon time text. */
export interface SignalColors {
  vitalLow: string;
  vitalCritical: string;
  ending: string;
}

export const DARK_SIGNALS: Readonly<SignalColors> = { vitalLow: '#ff8c2a', vitalCritical: '#ff4d4d', ending: '#ff3b3b' };
export const LIGHT_SIGNALS: Readonly<SignalColors> = { vitalLow: '#b85400', vitalCritical: '#d01f1f', ending: '#d0101a' };

/** The signal colours of a side. */
export function signalColors(light: boolean): Readonly<SignalColors> {
  return light ? LIGHT_SIGNALS : DARK_SIGNALS;
}

/** The Auto colour of `key` on a side. */
export function autoColor(key: ColorKey, light: boolean): string {
  return (light ? LIGHT_COLORS : DARK_COLORS)[key];
}

/** The colour to draw `key` with: `auto` → the side's default, a hex as is. */
export function resolveColor(setting: ColorSetting, key: ColorKey, light: boolean): string {
  return setting === 'auto' ? autoColor(key, light) : setting;
}

/**
 * The picker's twelve colours (ADR 0122): mid tones that keep enough
 * contrast on black and on paper, the default hues among them. In the
 * picker's order (by hue, then the neutrals).
 */
export const PICKER_COLORS: readonly { hex: string; label: string }[] = [
  { hex: '#d9483b', label: 'Red' },
  { hex: '#e07a2e', label: 'Orange' },
  { hex: '#c9a227', label: 'Gold' },
  { hex: '#4caf50', label: 'Green' },
  { hex: '#2aa198', label: 'Teal' },
  { hex: '#26a6c9', label: 'Cyan' },
  { hex: '#4a7fe0', label: 'Blue' },
  { hex: '#7b68ee', label: 'Indigo' },
  { hex: '#a65fd1', label: 'Violet' },
  { hex: '#d4589e', label: 'Pink' },
  { hex: '#c98bd6', label: 'Lilac' },
  { hex: '#8a8f98', label: 'Grey' },
];
