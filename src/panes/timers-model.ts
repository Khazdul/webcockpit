// What the Timers pane draws (ADR 0122 "Timers pane"), as plain data: the
// groups in order with their items, colours, layouts and columns. Pure (no
// DOM, no clock: `now` is passed in), unit tested in Node; the pane
// (timers.ts) turns it into DOM.
//
// - Groups Herblores → Charmies (`TIMER_GROUPS`), each shown when enabled
//   and not empty; Herblores (ADR 0122 addendum) is shown whenever it is
//   enabled, with its header even when empty or when headers are off: the
//   header carries the `+` that starts a herblore, and each herb item an ×
//   that stops it.
// - An item is `timed` (counts down: fill = time left / duration),
//   `still` (tracked, no end: full), `untimed` (not tracked, or another's
//   sanctuary you did not cast: dashed, `?`) or `charm` (counts up).
// - Ending soon (`warnAt` seconds or less left, timed only) gives the
//   signal `text` or `pulse`; the colour never changes.
// - "Soonest first" sorts each group by time left (untimed after timed);
//   off, the hub's order. Charmies keep their order (they count up).
// - Grid columns: a cap from the settings, or Auto: as many (≤ 3) as fit
//   the longest name, at least two when there is more than one item and
//   two still leave room for `MIN_NAME_CHARS`.
// - Names: blind targets drop a leading article and are shortened in the
//   middle (`captain…Fornost`) only when they exceed the measured room;
//   every other name is left whole (CSS ellipsis on real overflow).

import { type ColorSetting, type TimersSettings } from '../settings/types';
import {
  TIMER_GROUPS,
  TIMER_GROUP_LABELS,
  type TimerCell,
  type TimerGroup,
  type TimersView,
  barPct,
  charmMinutes,
  countdownText,
  exactText,
  isTimed,
  remainingMs,
} from '../timers/entry';
import { capitalise } from '../gmcp/char';
import { type IconName, TIMER_GROUP_ICON } from './icons';
import { resolveColor } from './palette';

export type TimerItemKind = 'timed' | 'still' | 'untimed' | 'charm';
export type TimerEnding = 'text' | 'pulse' | null;

export interface TimerItem {
  id: string;
  group: TimerGroup;
  kind: TimerItemKind;
  /** The name as drawn (a blind target may be shortened). */
  name: string;
  /** The whole name (the tooltip's title). */
  full: string;
  /** The time text, or null (time text off, or nothing to show). */
  time: string | null;
  /** Fill 0–1 (bar width, ring arc). */
  pct: number;
  /** Ms left (timed), else null. */
  remaining: number | null;
  ending: TimerEnding;
  /** The item's own icon (a herb's leaf or, in a debuff phase, the debuff arrow; the group icon otherwise). */
  icon: IconName;
  /** Draw the icon in a bar (chip); circles always have it in the ring. */
  chipIcon: boolean;
  /** The tooltip's text under the title. */
  tip: string;
  /** The × on the item: forget a charm, stop a herblore; null: none. */
  remove: 'charm' | 'herb' | null;
  /** A herblore item's catalogue key (the × stops it). */
  herbKey: string | null;
}

export interface TimerGroupView {
  group: TimerGroup;
  label: string;
  icon: IconName;
  color: string;
  /** The header shows even with headers off (Herblore: its `+`). */
  pinnedHeader: boolean;
  /** The header has the `+` that starts a herblore. */
  addHerb: boolean;
  layout: 'flow' | 'grid';
  /** Grid columns (1 for flow). */
  cols: number;
  items: TimerItem[];
}

/** Room in a cell the name never gets less of (Auto columns), characters. */
export const MIN_NAME_CHARS = 8;
/** The longest name Auto columns make room for, characters. */
export const MAX_NAME_CHARS = 16;
/** The most columns Auto picks. */
export const AUTO_COLS_MAX = 3;

/** What `timersModel` needs to know about the pane. */
export interface TimersModelInput {
  view: TimersView;
  settings: TimersSettings;
  now: number;
  /** The pane's background is light. */
  light: boolean;
  /** The list's inner width, px. */
  width: number;
  /** One character of the pane font, px. */
  charW: number;
}

/** Drops a leading `a`, `an` or `the`. */
export function stripArticle(s: string): string {
  return s.replace(/^(a|an|the)\s+/i, '');
}

/**
 * A blind target in at most `cap` characters: the article dropped, then,
 * when still too long, the head and the last word with `…` between
 * (`captain…Fornost`); a single long word is cut at the end.
 */
export function blindShort(full: string, cap: number): string {
  const s = stripArticle(full.trim());
  if (s.length <= cap) return s;
  const words = s.split(/\s+/);
  const last = words[words.length - 1]!;
  if (words.length < 2 || last.length + 3 > cap) return `${s.slice(0, Math.max(1, cap - 1)).trimEnd()}…`;
  const headLen = cap - last.length - 1;
  let head = s.slice(0, headLen);
  if (!/[\s-]/.test(s.charAt(headLen))) {
    const b = Math.max(head.lastIndexOf(' '), head.lastIndexOf('-'));
    if (b >= headLen * 0.5) head = head.slice(0, b);
  }
  return `${head.replace(/[\s,-]+$/, '')}…${last}`;
}

/** Characters of room per item beside the name: padding, icon or ring, time, ×. */
export function itemOverhead(style: TimersSettings['style'], icon: boolean, time: boolean, x: boolean): number {
  const base = style === 'bars' ? 2.2 + (icon ? 1.8 : 0) : 3.4;
  return base + (time ? 4.6 : 0) + (x ? 2.2 : 0);
}

/** Gap between items, characters. */
export function itemGap(style: TimersSettings['style']): number {
  return style === 'bars' ? 0.5 : 1;
}

/** Characters left for a name in one of `cols` columns of `widthCh` characters. */
export function nameRoom(widthCh: number, cols: number, over: number, gap: number): number {
  return Math.floor((widthCh - gap * (cols - 1)) / cols - over);
}

/** Auto columns: the most (≤ AUTO_COLS_MAX, ≤ n) that keep `chars`; two when n > 1 and two keep MIN_NAME_CHARS. */
export function autoCols(n: number, chars: number, widthCh: number, over: number, gap: number): number {
  let c = 1;
  for (let k = Math.min(AUTO_COLS_MAX, n); k > 1; k--) {
    if (nameRoom(widthCh, k, over, gap) >= chars) {
      c = k;
      break;
    }
  }
  if (c === 1 && n > 1 && nameRoom(widthCh, 2, over, gap) >= MIN_NAME_CHARS) c = 2;
  return c;
}

/** The colour of a timer group: its setting on this side. */
export function timerGroupColor(setting: ColorSetting, g: TimerGroup, light: boolean): string {
  return resolveColor(setting, g, light);
}

function itemOf(c: TimerCell, s: TimersSettings, now: number): TimerItem {
  // A herblore's leaf; its debuff phases (`Haste (recovery)`) the debuff arrow.
  const herb = c.group === 'herb' || c.id.startsWith('herb:');
  const icon: IconName = herb ? (c.phase === 'debuff' ? 'debuff' : 'herb') : TIMER_GROUP_ICON[c.group];
  const base = {
    id: c.id,
    group: c.group,
    icon,
    chipIcon: true,
    remove: (c.group === 'herb' && c.herbKey ? 'herb' : null) as TimerItem['remove'],
    herbKey: c.group === 'herb' ? (c.herbKey ?? null) : null,
    ending: null as TimerEnding,
  };
  if (c.group === 'charm') {
    const mins = charmMinutes(c, now);
    const full = capitalise(c.name);
    return {
      ...base,
      kind: 'charm',
      name: full,
      full,
      time: s.timeText && mins !== null ? `${mins}m` : null,
      pct: 0,
      remaining: null,
      tip: mins !== null ? `Charmed ${mins}m ago.` : 'Charmed.',
      remove: 'charm',
    };
  }
  const own = c.group === 'sanct' && c.target === undefined;
  const full = c.group === 'sanct' ? (own ? 'You' : c.target!) : c.group === 'blind' ? c.name : capitalise(c.name);
  const who =
    c.group === 'sanct'
      ? own
        ? 'On you.'
        : `On ${c.target}.`
      : c.group === 'blind'
        ? 'Blinded by you.'
        : c.group === 'herb'
          ? `Herblore, ${c.phase === 'debuff' ? 'a debuff' : 'a buff'} phase.`
          : '';
  if (isTimed(c)) {
    const left = remainingMs(c, now)!;
    const sec = left / 1000;
    const ending: TimerEnding = sec <= s.warnAt && s.signal !== 'none' ? s.signal : null;
    const about = c.estimated ? 'about ' : '';
    const of = c.expected !== null ? ` Of ${about}${exactText(c.expected / 1000)}.` : '';
    const cast = c.group === 'sanct' && !own ? ' Timed from your cast.' : '';
    return {
      ...base,
      kind: 'timed',
      name: full,
      full,
      time: s.timeText ? `${c.estimated ? '~' : ''}${countdownText(sec)}` : null,
      pct: barPct(c, now),
      remaining: left,
      ending,
      tip: `${about}${exactText(sec)} left.${of}${cast}${who ? ` ${who}` : ''}`.trim(),
    };
  }
  if (c.tracked) {
    return { ...base, kind: 'still', name: full, full, time: null, pct: 1, remaining: null, tip: who || 'No end time.' };
  }
  const why =
    c.group === 'sanct'
      ? 'Glowing (GMCP). Not cast by you, so no time.'
      : c.group === 'stored'
        ? 'Stored, time unknown.'
        : 'Seen in stat or info only, no time.';
  return { ...base, kind: 'untimed', name: full, full, time: s.timeText ? '?' : null, pct: 0, remaining: null, tip: `${who ? `${who} ` : ''}${why}` };
}

/** Soonest first: timed by time left, then still, then untimed (stable). */
export function soonestFirst(items: TimerItem[]): TimerItem[] {
  const rank = (t: TimerItem): number => (t.kind === 'timed' ? 0 : t.kind === 'still' ? 1 : 2);
  return items
    .map((t, i) => ({ t, i }))
    .sort((a, b) => rank(a.t) - rank(b.t) || (a.t.remaining ?? 0) - (b.t.remaining ?? 0) || a.i - b.i)
    .map((x) => x.t);
}

/** The groups the pane draws, top to bottom. Pure. */
export function timersModel(inp: TimersModelInput): TimerGroupView[] {
  const { view, settings: s, now, light } = inp;
  const widthCh = inp.charW > 0 ? inp.width / inp.charW : 0;
  const out: TimerGroupView[] = [];
  for (const g of TIMER_GROUPS) {
    const gs = s.groups[g];
    const cells = view.cells[g];
    const herb = g === 'herb';
    if (!gs.enabled || (cells.length === 0 && !herb)) continue;
    let items = cells.map((c) => itemOf(c, s, now));
    if (s.soonestFirst && g !== 'charm') items = soonestFirst(items);
    // With headers, blind chips leave the icon to the header.
    if (g === 'blind' && s.headers) items = items.map((t) => ({ ...t, chipIcon: false }));
    const layout = gs.layout === 'default' ? s.layout : gs.layout;
    const icon = s.style === 'bars' && items.some((t) => t.chipIcon);
    const time = items.some((t) => t.time !== null);
    const over = itemOverhead(s.style, icon, time, items.some((t) => t.remove === 'charm'));
    const gap = itemGap(s.style);
    const n = items.length;
    let cols = 1;
    if (layout === 'grid') {
      if (n === 0) {
        cols = 1;
      } else if (s.cols === 'auto') {
        const longest = Math.max(...items.map((t) => (g === 'blind' ? stripArticle(t.full) : t.full).length));
        cols = autoCols(n, Math.min(MAX_NAME_CHARS, longest), widthCh, over, gap);
      } else {
        cols = Math.max(1, Math.min(s.cols, n));
      }
    }
    if (g === 'blind' && widthCh > 0) {
      const room = Math.max(4, nameRoom(widthCh, cols, over, gap));
      items = items.map((t) => ({ ...t, name: blindShort(t.full, room) }));
    }
    out.push({
      group: g,
      label: TIMER_GROUP_LABELS[g],
      icon: TIMER_GROUP_ICON[g],
      color: timerGroupColor(gs.color, g, light),
      pinnedHeader: herb,
      addHerb: herb,
      layout,
      cols,
      items,
    });
  }
  return out;
}

/** True when anything shown changes with time (a countdown, a drain, a charm's minutes). */
export function timersTimed(groups: readonly TimerGroupView[]): boolean {
  return groups.some((g) => g.items.some((t) => t.kind === 'timed' || (t.kind === 'charm' && t.time !== null)));
}
