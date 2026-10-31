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
//   and remembers its colour), its column cap within the group's range.
// - Group: the NPC visibility labels.

import { COMM_CHANNEL_ORDER, DEFAULT_CAPTIONS, channelColor, channelEnabled, channelLabel } from '../gmcp/comm';
import {
  GROUP_NPC_MODES,
  type GroupNpcMode,
  type SettingsStore,
  TIMER_COLS_MIN,
  type TimerColor,
  type TimerGroupSettings,
  timerColsMax,
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

/** A group's next look after clicking colour `color` (0 or 1 checked): the checked one unchecks (off, colour kept). */
export function colorToggle(g: TimerGroupSettings, color: TimerColor): Pick<TimerGroupSettings, 'enabled' | 'color'> {
  if (g.enabled && g.color === color) return { enabled: false, color };
  return { enabled: true, color };
}

/** A group's look for a colour choice: a colour shows it in that colour; null (Off) hides it and keeps its colour. */
export function colorChoice(g: TimerGroupSettings, color: TimerColor | null): Pick<TimerGroupSettings, 'enabled' | 'color'> {
  return color === null ? { enabled: false, color: g.color } : { enabled: true, color };
}

/** `cols` stepped by `d`, clamped to the group's range. */
export function stepCols(group: TimerGroup, cols: number, d: number): number {
  return Math.max(TIMER_COLS_MIN, Math.min(timerColsMax(group), cols + d));
}

/** True when the group has Clock and Bar flags (Charmies have neither). */
export const timerFlags = (group: TimerGroup): boolean => group !== 'charm';

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
