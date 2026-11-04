// The pane settings' shared logic (Inv §2.7.6, §2.6.3, §2.3; ADR 0107):
// what the TUI pages Options → Panes → Communication, Timers and Group
// (frames/comm-options.tsx, options-timers.tsx, options-group.tsx) and the
// panes' gear popups (popups/pane-settings.tsx) both show and do. No UI
// here; every change goes to the settings store at once (ADR 0010).
//
// - Comm: the ten fixed channels with their label and colour, and the
//   sparse filter toggle (missing = on, `false` = off). The Comm pane
//   cancels its solo by itself when the filters change from outside it.
// - Timers (ADR 0122): the choices of the look and ending-soon settings
//   and the per-group patch.
// - Group: the NPC visibility and away labels, the vital colours, and
//   `setGroup` for every other Group setting.
// - Colours (ADR 0122): a colour setting's name, and the TUI pages' step
//   through Auto and the twelve picker colours.

import { COMM_CHANNEL_ORDER, DEFAULT_CAPTIONS, channelColor, channelEnabled, channelLabel } from '../gmcp/comm';
import {
  type ColorSetting,
  GROUP_AWAY_MODES,
  GROUP_NPC_MODES,
  type GroupAwayMode,
  type GroupNpcMode,
  type SettingsStore,
  TIMER_COLS_MAX,
  TIMER_COLS_MIN,
  TIMER_GROUP_LAYOUTS,
  TIMER_LAYOUTS,
  TIMER_SIGNALS,
  TIMER_STYLES,
  TIMER_WARN_CHOICES,
  type TimerCols,
  type TimerGroupLayout,
  type TimerGroupSettings,
  type TimerLayout,
  type TimerSignal,
  type TimerStyle,
  type TimerWarnAt,
  type TimersSettings,
} from '../settings';
import { PICKER_COLORS } from '../panes/palette';
import type { GroupSettings } from '../settings/types';
import type { TimerGroup } from '../timers/entry';

// ------------------------------------------------------------------ comm

/** One channel row: its name, label, colour and whether it is shown. */
export interface CommChannelRow {
  name: string;
  label: string;
  color: string;
  on: boolean;
}

/** The ten channels in the fixed order, as `filters` has them. */
export function commChannelRows(filters: Readonly<Record<string, boolean>>): CommChannelRow[] {
  return COMM_CHANNEL_ORDER.map((name) => ({
    name,
    label: channelLabel({ name, caption: DEFAULT_CAPTIONS[name] ?? '' }),
    color: channelColor(name),
    on: channelEnabled(filters, name),
  }));
}

/** Shows channel `name` (`on`) or hides it; the filters stay sparse. */
export function setCommChannel(settings: SettingsStore, name: string, on: boolean): void {
  settings.update((d) => {
    if (on) delete d.comm.filters[name];
    else d.comm.filters[name] = false;
  });
}

/** Flips channel `name`. */
export function toggleCommChannel(settings: SettingsStore, name: string): void {
  setCommChannel(settings, name, !channelEnabled(settings.get().comm.filters, name));
}

// ---------------------------------------------------------------- timers

export const TIMER_STYLE_LABEL: Readonly<Record<TimerStyle, string>> = { bars: 'Bars', circles: 'Circles' };
export const TIMER_LAYOUT_LABEL: Readonly<Record<TimerLayout, string>> = { flow: 'Flow', grid: 'Grid' };
export const TIMER_GROUP_LAYOUT_LABEL: Readonly<Record<TimerGroupLayout, string>> = { default: 'Default', flow: 'Flow', grid: 'Grid' };
export const TIMER_SIGNAL_LABEL: Readonly<Record<TimerSignal, string>> = { text: 'Time text', pulse: 'Pulse', none: 'None' };

const choices = <T extends string>(xs: readonly T[], label: Readonly<Record<T, string>>): readonly { value: T; label: string }[] =>
  xs.map((value) => ({ value, label: label[value] }));

export const TIMER_STYLE_CHOICES = choices(TIMER_STYLES, TIMER_STYLE_LABEL);
export const TIMER_LAYOUT_CHOICES = choices(TIMER_LAYOUTS, TIMER_LAYOUT_LABEL);
export const TIMER_GROUP_LAYOUT_CHOICES = choices(TIMER_GROUP_LAYOUTS, TIMER_GROUP_LAYOUT_LABEL);
export const TIMER_SIGNAL_CHOICES = choices(TIMER_SIGNALS, TIMER_SIGNAL_LABEL);

/** Warn at, as strings (a segmented control's values). */
export const TIMER_WARN_OPTIONS: readonly { value: string; label: string }[] = TIMER_WARN_CHOICES.map((n) => ({ value: String(n), label: `${n}s` }));

/** The grid column choices: Auto, then 1–6. */
export const TIMER_COLS_CHOICES: readonly TimerCols[] = [
  'auto',
  ...Array.from({ length: TIMER_COLS_MAX - TIMER_COLS_MIN + 1 }, (_, i) => TIMER_COLS_MIN + i),
];

/** A column choice's label. */
export const colsLabel = (c: TimerCols): string => (c === 'auto' ? 'Auto' : String(c));

/** Writes `patch` into the Timers settings (not the groups). */
export function setTimers(settings: SettingsStore, patch: Partial<Omit<TimersSettings, 'groups'>>): void {
  settings.update({ timers: patch });
}

/** Warn at from a segmented value. */
export const warnAtOf = (v: string): TimerWarnAt => (TIMER_WARN_CHOICES.find((n) => String(n) === v) ?? 20);

/** Writes `patch` into timer group `g`. */
export function patchTimerGroup(settings: SettingsStore, g: TimerGroup, patch: Partial<TimerGroupSettings>): void {
  settings.update({ timers: { groups: { [g]: patch } } });
}

// ----------------------------------------------------------------- group

export const NPC_MODE_LABEL: Readonly<Record<GroupNpcMode, string>> = {
  off: 'Off',
  labeled: 'Labeled',
  all: 'All',
};

/** The NPC visibility choices in order. */
export const NPC_MODE_CHOICES: readonly { value: GroupNpcMode; label: string }[] = GROUP_NPC_MODES.map((value) => ({
  value,
  label: NPC_MODE_LABEL[value],
}));

/** The Away members labels (ADR 0122). */
export const AWAY_MODE_LABEL: Readonly<Record<GroupAwayMode, string>> = {
  room: 'Room name',
  dim: 'Dim only',
};

/** The Away members choices in order. */
export const AWAY_MODE_CHOICES: readonly { value: GroupAwayMode; label: string }[] = GROUP_AWAY_MODES.map((value) => ({
  value,
  label: AWAY_MODE_LABEL[value],
}));

/** The vital bars with a colour setting, in the pane's order. */
export const VITAL_COLOR_ROWS: readonly { key: 'hp' | 'mana' | 'mp'; label: string }[] = [
  { key: 'hp', label: 'HP' },
  { key: 'mana', label: 'Mana' },
  { key: 'mp', label: 'Moves' },
];

/** Writes `patch` into the Group settings (not the colours). */
export function setGroup(settings: SettingsStore, patch: Partial<Omit<GroupSettings, 'colors'>>): void {
  settings.update({ group: patch });
}

/** Writes one vital's colour setting. */
export function setVitalColor(settings: SettingsStore, key: 'hp' | 'mana' | 'mp', color: ColorSetting): void {
  settings.update({ group: { colors: { [key]: color } } });
}

// ---------------------------------------------------------------- colours

/** A colour setting's name: Auto, a picker colour's name, or the hex. */
export function colorName(c: ColorSetting): string {
  if (c === 'auto') return 'Auto';
  return PICKER_COLORS.find((p) => p.hex.toLowerCase() === c.toLowerCase())?.label ?? c.toLowerCase();
}

/** Auto, then the picker colours; a free colour (not in the list) after Auto. */
export function colorCycle(current: ColorSetting): ColorSetting[] {
  const list: ColorSetting[] = ['auto', ...PICKER_COLORS.map((c) => c.hex)];
  if (current !== 'auto' && !list.some((c) => c.toLowerCase() === current.toLowerCase())) list.splice(1, 0, current);
  return list;
}

/** The colour `d` steps from `current` in `colorCycle` (the TUI pages' ←→). */
export function stepColor(current: ColorSetting, d: number): ColorSetting {
  const list = colorCycle(current);
  const at = list.findIndex((c) => c.toLowerCase() === current.toLowerCase());
  return list[(at + d + list.length) % list.length]!;
}
