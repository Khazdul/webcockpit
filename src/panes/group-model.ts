// What the Group pane draws (ADR 0122 "Group pane"), as plain data: the
// layout (two lines or one per member, the fight card, the overflow row),
// one view per member row and the fight card's view, with every tooltip's
// text. Pure (no DOM, no clock: `now` is passed in), unit tested in Node;
// the pane (group.ts) turns it into DOM.
//
// - Layout: rows are whole cells. A two-line member is 2 rows, a one-line
//   member 1 row; the fight card 3 rows and half a row of gap, counted as
//   4 (a 1-row strip in one-line mode). Two lines when every shown member
//   fits that way, else one line; still too many: the first ones and
//   `↓ N more members` (`groupLayout`).
// - Markers: a player is the person icon in its relation colour (ally,
//   neutral), an enemy race the horned helm, an NPC a diamond plus its
//   label as a tag.
// - Statuses: the GMCP flags in `STATUS_FLAGS` order; sanctuary carries a
//   ring (and its time) when the Timers' Sanctuary group times it (your
//   cast). The times are the Timers pane's (`countdownText`, `exactText`).
// - Away (a player's mapid is not your room): `room` shows the room after
//   the name, both modes dim the row.
// - Vitals: a colour setting per bar (Auto by side, palette.ts), orange at
//   ≤ 45 % and red at ≤ 25 %; a band-word estimate says so in its tooltip.
// - The fight card: the tank (a group member or another named buffer) and
//   the opponent; you tank (MUME's buffer `Nobody`, your own name, or
//   none): the opponent alone.
// - `memberSig` / `fightSig`: what a row's structure depends on, so the
//   pane rebuilds only the rows whose structure changed. Values are left
//   out (bar fills, colours and tooltips, a timed sanctuary's time and
//   ring, the fight card's numbers and word): the pane sets them in place.

import { type VitalKind, VITAL_KINDS } from '../gmcp/bands';
import { capitalise } from '../gmcp/char';
import { foldName, type GroupFight, type Member, type StatusFlag, STATUS_FLAGS, type Vital, vitalPct } from '../gmcp/group';
import type { GroupSettings, Settings } from '../settings/types';
import { type TimerCell, countdownText, exactText } from '../timers/entry';
import { type IconName, positionIcon, STATUS_ICON } from './icons';
import { type GroupColors, resolveColor, signalColors } from './palette';

// ------------------------------------------------------------------ layout

/** Rows of the fight card in two-line mode (names, bars, numbers, and a gap). */
export const FIGHT_ROWS = 4;

/** Icons a one-line row shows before `+n`. */
export const COMPACT_ICONS = 3;

export interface GroupLayout {
  /** 2: two lines per member; 1: one line. */
  lines: 1 | 2;
  /** Rows the fight zone takes (0: no fight). */
  fightRows: number;
  /** Members shown (the first ones). */
  shown: number;
  /** Members not shown (the `↓ N more members` row), 0 when all fit. */
  more: number;
}

/**
 * How `n` members (and the fight, if any) are drawn in `rows` rows: two
 * lines each when all fit that way, else one line; still too many, the
 * first `rows − fight − 1` and a `↓ N more` row.
 */
export function groupLayout(n: number, fight: boolean, rows: number): GroupLayout {
  if (fight && FIGHT_ROWS + 2 * n <= rows) return { lines: 2, fightRows: FIGHT_ROWS, shown: n, more: 0 };
  if (!fight && 2 * n <= rows) return { lines: 2, fightRows: 0, shown: n, more: 0 };
  const fightRows = fight ? 1 : 0;
  const room = Math.max(0, rows - fightRows);
  if (n <= room) return { lines: 1, fightRows, shown: n, more: 0 };
  const shown = Math.max(0, room - 1);
  return { lines: 1, fightRows, shown, more: n - shown };
}

// ------------------------------------------------------------------ views

const VITAL_NAME: Readonly<Record<VitalKind, string>> = { hp: 'HP', mana: 'Mana', mp: 'Moves' };

export interface IconView {
  icon: IconName;
  color: string;
  title: string;
  tip: string;
  /** Sanctuary ring: the fraction left (timed) or null (untimed, dashed). */
  ring?: { frac: number | null };
  /** Text after the icon (a timed sanctuary's time). */
  time?: string;
}

export interface BarView {
  kind: VitalKind;
  /** Fill 0–100 (%). */
  pct: number;
  color: string;
  /** Band-word estimate (said in the tooltip; drawn solid like the rest). */
  est: boolean;
  title: string;
  tip: string;
}

export interface MemberView {
  key: string;
  id: number;
  /** The name, `name (LABEL)` for an NPC. */
  title: string;
  name: string;
  player: boolean;
  marker: IconView;
  tag: string | null;
  nameTip: string;
  away: boolean;
  room: string | null;
  dim: boolean;
  tank: boolean;
  statuses: IconView[];
  position: IconView | null;
  bars: BarView[];
}

export interface FightView {
  /** The tank's side, or null: you tank (the card is the opponent alone). */
  tank: { name: string; bar: BarView | null; numbers: string } | null;
  foe: { name: string; word: string | null; bar: BarView };
}

/** The colour of a vital bar at `pct` (0–1): the setting's, orange at ≤ 45 %, red at ≤ 25 %. */
export function vitalColor(base: string, pct: number | null, light: boolean): string {
  const sig = signalColors(light);
  if (pct !== null && pct <= 0.25) return sig.vitalCritical;
  if (pct !== null && pct <= 0.45) return sig.vitalLow;
  return base;
}

/** One vital's bar and tooltip. */
export function barView(kind: VitalKind, v: Vital, base: string, light: boolean): BarView {
  const { pct, known } = vitalPct(kind, v);
  const name = VITAL_NAME[kind];
  const p = pct === null ? 0 : Math.round(pct * 100);
  let title: string;
  let tip: string;
  if (pct === null) {
    title = name;
    tip = 'Unknown';
  } else if (known) {
    title = `${name} ${v.value}/${v.max} · ${p}%`;
    tip = p <= 25 ? 'Low: a quarter or less.' : p <= 45 ? 'Getting low.' : v.word ? capitalise(v.word) : '';
  } else {
    title = `${name} · ${v.word ?? ''}`.trim();
    tip = `About ${p}%.`;
  }
  return { kind, pct: p, color: pct === null ? '' : vitalColor(base, pct, light), est: pct !== null && !known, title, tip: tip || title };
}

const POSITION_TITLE: Readonly<Record<string, string>> = {
  standing: 'Standing',
  fighting: 'Fighting',
  resting: 'Resting',
  sitting: 'Sitting',
  sleeping: 'Sleeping',
  incapacitated: 'Incapacitated',
  stunned: 'Stunned',
  dying: 'Dying',
};

/** The position icon of a member, or null when MUME has not said. */
export function positionView(position: string | null, ride: boolean, c: Readonly<GroupColors>): IconView | null {
  if (position === null && !ride) return null;
  const icon = positionIcon(position, ride);
  const pos = position === null ? null : (POSITION_TITLE[position] ?? capitalise(position));
  const title = ride && (position === null || position === 'standing') ? 'Riding' : (pos ?? 'Riding');
  const tip = ride && title !== 'Riding' ? 'Mounted.' : ride ? 'Standing, mounted.' : position === 'fighting' ? 'In a fight.' : title + '.';
  const color = icon === 'fighting' ? c.fight : icon === 'sleeping' ? c.sleep : icon === 'riding' ? c.ride : c.posN;
  return { icon, color, title, tip };
}

const STATUS_TEXT: Readonly<Record<StatusFlag, [string, string]>> = {
  sanctuary: ['Sanctuary', 'A white aura: half damage.'],
  poison: ['Poisoned', 'Loses HP over time.'],
  slept: ['Magically asleep', 'Cannot act until woken.'],
  blind: ['Blind', 'Cannot see.'],
  bashed: ['Bashed', 'On the ground.'],
  snared: ['Snared', 'Cannot leave the room.'],
  wound: ['Wounded', 'Bleeding.'],
  hungry: ['Hungry', 'Regenerates slower.'],
  thirsty: ['Thirsty', 'Regenerates slower.'],
  waiting: ['Waiting', 'Busy for a moment.'],
};

/** The tank's shield in a member row. */
export function tankIcon(gold: string, inZone: boolean): IconView {
  return { icon: 'tank', color: gold, title: 'Tanking', tip: inZone ? 'Your fight buffer; also in the fight zone.' : 'Your fight buffer.' };
}

/** What a member row needs beyond the member and the settings. */
export interface MemberEnv {
  light: boolean;
  colors: Readonly<GroupColors>;
  vitals: Record<VitalKind, string>;
  sanct: string;
  away: GroupSettings['away'];
  isAway: (m: Member) => boolean;
  tankId: number | null;
  /** The Sanctuary timer cell of member `id`, if any. */
  sanctCell: (id: number) => TimerCell | undefined;
  now: number;
}

/** A sanctuary status icon: a ring with the time when timed by you, else untimed. */
export function sanctView(cell: TimerCell | undefined, color: string, now: number): IconView {
  const [title] = STATUS_TEXT.sanctuary;
  if (cell && cell.expiresAt !== null && cell.expected) {
    const left = Math.max(0, (cell.expiresAt - now) / 1000);
    const about = cell.estimated ? 'about ' : '';
    return {
      icon: 'sanct',
      color,
      title,
      tip: `Cast by you: ${about}${exactText(left)} left.`,
      ring: { frac: Math.max(0, Math.min(1, (cell.expiresAt - now) / cell.expected)) },
      time: `${cell.estimated ? '~' : ''}${countdownText(left)}`,
    };
  }
  return { icon: 'sanct', color, title, tip: 'Glowing. Not cast by you, so the time is unknown.', ring: { frac: null } };
}

/** One member row's view. */
export function memberView(m: Member, env: MemberEnv): MemberView {
  const c = env.colors;
  const npc = m.type === 'npc';
  const enemy = m.type === 'enemy';
  const neutral = m.type === 'neutral';
  const away = env.isAway(m);
  const tank = env.tankId === m.id;
  const marker: IconView = npc
    ? { icon: 'npc', color: c.npc, title: 'NPC', tip: m.label ? `Labeled ${m.label}.` : 'Unlabeled.' }
    : enemy
      ? { icon: 'enemy', color: c.enemy, title: 'Player · enemy race', tip: 'In your group, of an enemy race.' }
      : { icon: 'player', color: neutral ? c.neutral : c.ally, title: neutral ? 'Player · neutral race' : 'Player · ally', tip: neutral ? 'Of a neutral race.' : 'Your ally.' };
  const kind = npc ? (m.label ? `NPC, labeled ${m.label}` : 'NPC') : enemy ? 'Player, enemy race' : neutral ? 'Player, neutral race' : 'Player, ally';
  const where = away ? (m.room ? `At ${m.room}.` : 'Not in your room.') : 'Here.';
  const nameTip = [kind + '.', where, tank ? 'Tanking.' : ''].filter(Boolean).join(' ');
  const statuses: IconView[] = [];
  for (const f of STATUS_FLAGS) {
    if (!m.flags[f]) continue;
    if (f === 'sanctuary') {
      statuses.push(sanctView(env.sanctCell(m.id), env.sanct, env.now));
      continue;
    }
    const [title, tip] = STATUS_TEXT[f];
    statuses.push({ icon: STATUS_ICON[f], color: c.status[f], title, tip });
  }
  return {
    key: `m${m.id}`,
    id: m.id,
    title: npc && m.label ? `${m.name} (${m.label})` : m.name,
    name: m.name || m.label || '?',
    player: !npc,
    marker,
    tag: npc ? m.label : null,
    nameTip,
    away,
    room: away && env.away === 'room' ? m.room : null,
    dim: away,
    tank,
    statuses,
    position: positionView(m.position, m.ride, c),
    bars: VITAL_KINDS.map((k) => barView(k, m[k], env.vitals[k], env.light)),
  };
}

/**
 * The fight card's view, or null without an opponent. The tank's side is
 * a group member, or another named buffer; none when you tank (the
 * buffer is `Nobody`, your own name `selfName`, or unknown).
 */
export function fightView(
  f: GroupFight,
  tankMember: Member | null,
  selfName: string | null,
  env: Pick<MemberEnv, 'light' | 'colors' | 'vitals'>,
): FightView | null {
  if (f.opponent === null) return null;
  let tank: FightView['tank'] = null;
  if (tankMember) {
    const bar = barView('hp', tankMember.hp, env.vitals.hp, env.light);
    const numbers = tankMember.hp.value !== null && tankMember.hp.max !== null ? `${tankMember.hp.value}/${tankMember.hp.max}` : (tankMember.hp.word ?? '');
    tank = { name: tankMember.name, bar, numbers };
  } else if (f.tank !== null) {
    const you = selfName !== null && foldName(selfName) === foldName(f.tank);
    if (!you) tank = { name: f.tank, bar: null, numbers: '' };
  }
  const om = f.opponentMember;
  const word = f.opponentWord;
  const v: Vital = om ? { ...om.hp, word: word ?? om.hp.word } : { value: null, max: null, word };
  const raw = barView('hp', v, env.colors.foe, env.light);
  const foeName = om ? (om.label ? `${om.name} (${om.label})` : om.name) : f.opponent;
  const bar: BarView = { ...raw, color: env.colors.foe, title: word ? `HP · ${word}` : raw.title, tip: word ? `${raw.tip} From the last round.` : raw.tip };
  return { tank, foe: { name: foeName, word, bar } };
}

/** The three vital colours resolved for a side. */
export function groupVitals(s: Readonly<Settings>, light: boolean): Record<VitalKind, string> {
  const c = s.group.colors;
  return {
    hp: resolveColor(c.hp, 'hp', light),
    mana: resolveColor(c.mana, 'mana', light),
    mp: resolveColor(c.mp, 'mp', light),
  };
}

// ------------------------------------------------------------- signatures

const iconSig = (v: IconView): string =>
  // A timed sanctuary's time, ring and tip tick: the pane sets them in place.
  v.ring && v.ring.frac !== null ? `${v.icon}:${v.color}:timed` : `${v.icon}:${v.color}:${v.title}:${v.tip}:${v.ring ? 'u' : ''}`;

/**
 * What a member row's structure depends on (lines, the elements drawn and
 * their fixed texts and tooltips). The bars and a timed sanctuary's time
 * and ring are values the pane sets in place: equal signatures, the built
 * row stays.
 */
export function memberSig(v: MemberView, lines: 1 | 2, gold: string): string {
  return [
    lines,
    gold,
    v.name,
    v.title,
    v.player ? 'p' : 'n',
    iconSig(v.marker),
    v.tag ?? '',
    v.nameTip,
    v.room ?? '',
    v.dim ? 'd' : '',
    v.tank ? 't' : '',
    v.statuses.map(iconSig).join(','),
    v.position ? iconSig(v.position) : '',
  ].join('|');
}

/**
 * What the fight card's structure depends on, in card (2) or strip (1)
 * form. The bars, the tank's numbers and the opponent's word are values
 * the pane sets in place.
 */
export function fightSig(f: FightView, form: 1 | 2, light: boolean): string {
  const t = f.tank ? `${f.tank.name}|${f.tank.bar ? 'b' : ''}` : '-';
  return [form, light ? 'l' : 'd', t, f.foe.name].join('|');
}
