// The pane settings' shared logic (Inv §2.7.6, §2.6.3, §2.3; ADR 0107):
// what the TUI pages Options → Panes → Communication, Timers and Group
// (frames/comm-options.tsx, options-timers.tsx, options-group.tsx) and the
// panes' gear popups (popups/pane-settings.tsx) both show and do. No UI
// here; every change goes to the settings store at once (ADR 0010).
//
// - Comm: the ten fixed channels with their label and colour, and the
//   sparse filter toggle (missing = on, `false` = off). The Comm pane
//   cancels its solo by itself when the filters change from outside it.
// - Timers: a group's colour choice (0 or 1 swatch: off hides the group
//   and remembers its colour).
// - Group: the NPC visibility labels.

import { COMM_CHANNEL_ORDER, DEFAULT_CAPTIONS, channelColor, channelEnabled, channelLabel } from '../gmcp/comm';
import {
  type ColorSetting,
  GROUP_AWAY_MODES,
  GROUP_NPC_MODES,
  type GroupAwayMode,
  type GroupNpcMode,
  type SettingsStore,
  TIMER_COLOR_HEX,
  TIMER_LEGACY_DEFAULT_COLOR,
  type TimerColor,
  type TimerGroupSettings,
} from '../settings';
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

// Until stage 39c replaces these pages, the colour choice offers the old
// seven swatches over the ADR 0122 colour setting: a group's own old
// default swatch is stored as `auto`, any other as its hex.

/** The swatch a group's colour setting shows as, or null (a custom colour; Sanctuary on Auto). */
export function swatchOf(group: TimerGroup, color: ColorSetting): TimerColor | null {
  if (color === 'auto') return group === 'sanct' ? null : TIMER_LEGACY_DEFAULT_COLOR[group];
  for (const [name, hex] of Object.entries(TIMER_COLOR_HEX) as [TimerColor, string][]) if (hex === color) return name;
  return null;
}

/** The colour setting of swatch `c` for `group`: its old default swatch is `auto`. */
export function swatchSetting(group: TimerGroup, c: TimerColor): ColorSetting {
  return group !== 'sanct' && TIMER_LEGACY_DEFAULT_COLOR[group] === c ? 'auto' : TIMER_COLOR_HEX[c];
}

/** A group's next look after clicking swatch `color` (0 or 1 checked): the checked one unchecks (off, colour kept). */
export function colorToggle(group: TimerGroup, g: TimerGroupSettings, color: TimerColor): Pick<TimerGroupSettings, 'enabled' | 'color'> {
  if (g.enabled && swatchOf(group, g.color) === color) return { enabled: false, color: g.color };
  return { enabled: true, color: swatchSetting(group, color) };
}

/** A group's look for a colour choice: a swatch shows it in that colour; null (Off) hides it and keeps its colour. */
export function colorChoice(group: TimerGroup, g: TimerGroupSettings, color: TimerColor | null): Pick<TimerGroupSettings, 'enabled' | 'color'> {
  return color === null ? { enabled: false, color: g.color } : { enabled: true, color: swatchSetting(group, color) };
}

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

/** Writes one vital's colour setting. */
export function setVitalColor(settings: SettingsStore, key: 'hp' | 'mana' | 'mp', color: ColorSetting): void {
  settings.update({ group: { colors: { [key]: color } } });
}
