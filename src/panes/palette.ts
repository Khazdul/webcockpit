// Colours of the Group and Timers panes (ADR 0122). A colour setting is
// `auto` or a `#rrggbb`; `auto` resolves to the default of the pane's side
// (dark or light, `paneShade(...).light`), a hex is used as stored on both
// sides. The picker offers `PICKER_COLORS` (twelve colours that read on
// black and on paper alike), a free colour input and Auto. The Group
// pane's fixed colours (markers, statuses, positions) are here too.

import type { StatusFlag } from '../gmcp/group';
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
  herb: '#a6c95a',
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
  herb: '#5c7a12',
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
 * The picker's twelve colours (ADR 0122; the swatches of mockup 3c): mid
 * tones that keep enough contrast on black and on paper, in the picker's
 * order (by hue, then a neutral).
 */
export const PICKER_COLORS: readonly { hex: string; label: string }[] = [
  { hex: '#e0566a', label: 'Rose' },
  { hex: '#e8794a', label: 'Coral' },
  { hex: '#d9a53f', label: 'Amber' },
  { hex: '#9aa83a', label: 'Olive' },
  { hex: '#3fae6a', label: 'Green' },
  { hex: '#2fa8a0', label: 'Teal' },
  { hex: '#4aa3df', label: 'Sky' },
  { hex: '#4f72d9', label: 'Blue' },
  { hex: '#8a6fe0', label: 'Violet' },
  { hex: '#c46fd2', label: 'Orchid' },
  { hex: '#e07aa8', label: 'Pink' },
  { hex: '#8c95a3', label: 'Slate' },
];

/** The Group pane's fixed colours by side (mockup 3c). */
export interface GroupColors {
  ally: string;
  neutral: string;
  enemy: string;
  npc: string;
  gold: string;
  foe: string;
  posN: string;
  fight: string;
  sleep: string;
  ride: string;
  status: Record<Exclude<StatusFlag, 'sanctuary'>, string>;
}

export const GROUP_DARK: Readonly<GroupColors> = {
  ally: '#7fb2ff',
  neutral: '#e6b450',
  enemy: '#ff7b72',
  npc: '#9a9a9a',
  gold: '#e8c35a',
  foe: '#ff7b72',
  posN: '#8a8a8a',
  fight: '#ff7a6b',
  sleep: '#8a9bd6',
  ride: '#c9a66b',
  status: {
    poison: '#9be15d',
    slept: '#a99bff',
    blind: '#7fd3e6',
    bashed: '#ffa04d',
    snared: '#5fd4b0',
    wound: '#e0524f',
    hungry: '#d9b25f',
    thirsty: '#6fb3ff',
    waiting: '#9a9a9a',
  },
};

export const GROUP_LIGHT: Readonly<GroupColors> = {
  ally: '#2a56c8',
  neutral: '#846400',
  enemy: '#c42020',
  npc: '#6e6858',
  gold: '#8f6a00',
  foe: '#a01c1c',
  posN: '#6e6858',
  fight: '#c42020',
  sleep: '#4a5aa0',
  ride: '#7a5c00',
  status: {
    poison: '#557a00',
    slept: '#5b45b8',
    blind: '#00737e',
    bashed: '#b85400',
    snared: '#1f7a5a',
    wound: '#a8302b',
    hungry: '#846400',
    thirsty: '#2a56c8',
    waiting: '#6e6858',
  },
};

/** The Group pane's fixed colours of a side. */
export const groupColors = (light: boolean): Readonly<GroupColors> => (light ? GROUP_LIGHT : GROUP_DARK);
