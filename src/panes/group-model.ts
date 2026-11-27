// What the Group pane draws (ADR 0122 "Group pane"), as plain data: the
// layout (two lines or one per member, the fight card, the overflow row),
// one view per member row and the fight card's view, with every tooltip's
// text. Pure (no DOM, no clock: `now` is passed in), unit tested in Node;
// the pane (group.ts) turns it into DOM.
//
// - Layout (`groupRows`, stage 80 §8): every member row has the same
//   height, the pane's free height shared between the members and held to
//   steps in cells: one line (growing), two lines, three lines with the
//   numbers, at most 4.5 cells. Too many for a cell each: one-line rows
//   of a cell, the first ones and `↓ N more members`. The fight card (3
//   cells and half a cell of gap, counted as 4) or its 1-cell strip comes
//   off the height first.
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
import { type VitalTone, vitalTone } from '../gmcp/vital-tone';
import type { Library } from '../looks/library';
import { type Look, autoMember, resolveMember } from '../looks/resolve';
import { ringCss } from '../looks/ring';
import type { LookRef } from '../looks/types';
import { type IconName, positionIcon, STATUS_ICON } from './icons';
import { type GroupColors, resolveColor, signalColors } from './palette';

// ------------------------------------------------------------------ layout

/** Cells the fight card takes off the height (3 lines and half a line of gap, counted as 4). */
export const FIGHT_CELLS = 4;
/** Cells the one-line fight strip takes. */
export const STRIP_CELLS = 1;

/** Icons a one-line row shows before `+n`. */
export const COMPACT_ICONS = 3;

/** The largest token, CSS px (stage 80 decision 18: the one absolute number). */
export const TOKEN_MAX = 68;

/**
 * The step a row height falls in (stage 80 §8):
 * - `crowded`: the members do not fit at a cell each: one-line rows of a
 *   cell, the first ones and `↓ n more`;
 * - `one`: one line, growing (c ≤ h < 2c);
 * - `two`: the name line and the bars side by side (2c ≤ h < 3.3c);
 * - `three`: the name line and HP, mana, moves as full lines with their
 *   numbers (3.3c ≤ h ≤ 4.5c);
 * - `top`: as `three`, the row held at 4.5c (the rest of the pane is empty).
 */
export type GroupStep = 'crowded' | 'one' | 'two' | 'three' | 'top';

export interface GroupRows {
  step: GroupStep;
  /** Lines a member row draws. */
  lines: 1 | 2 | 3;
  /** Every member row's height, CSS px. */
  h: number;
  /** The fight's form: the card (4 cells), the strip (1 cell), or none. */
  fight: 'card' | 'strip' | null;
  /** Members shown (the first ones). */
  shown: number;
  /** Members not shown (the `↓ N more members` row, 1 cell), 0 when all fit. */
  more: number;
  /** The token's diameter, CSS px. */
  token: number;
  /** A bar's thickness, CSS px (two and three lines; one line keeps its mini bars). */
  bar: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.max(0, Math.min(1, t));
const half = (x: number): number => Math.round(x * 2) / 2;

/** The row heights where the steps start for a cell `c` px high: two lines, three lines, the top (whole px). */
export function groupSteps(c: number): { two: number; three: number; top: number } {
  return { two: Math.ceil(2 * c - 1e-6), three: Math.round(3.3 * c), top: Math.floor(4.5 * c + 1e-6) };
}

/**
 * How `n` members (and the fight, if any) are drawn in `heightPx` of a
 * pane whose cell is `cellH` px high (stage 80 §8, ADR 0122 addendum):
 * every row the same height, the pane's free height shared between the
 * members, held to the steps (in cells: the text keeps the terminal's
 * size, so with a larger font every step grows with it). What is left
 * over stays empty at the bottom. The fight card (4 cells) comes off the
 * height first; if the rows then get less than 2 cells each, the strip (1
 * cell) instead. The bars grow from 5 to 8 px over the two-line step and
 * from 5 to 9 px over the three-line one (at a 17 px cell; with the cell).
 */
export function groupRows(n: number, fight: boolean, heightPx: number, cellH: number): GroupRows {
  const c = cellH > 0 ? cellH : 17;
  const H = Math.max(0, heightPx);
  const st = groupSteps(c);
  let form: GroupRows['fight'] = null;
  let free = H;
  if (fight) {
    const card = H - FIGHT_CELLS * c;
    if (card >= 0 && (n === 0 || card / n >= st.two)) {
      form = 'card';
      free = card;
    } else {
      form = 'strip';
      free = Math.max(0, H - STRIP_CELLS * c);
    }
  }
  const scale = c / 17;
  const raw = n > 0 ? free / n : Infinity;
  if (raw < c) {
    const room = Math.floor(free / c + 1e-6);
    const shown = n <= room ? n : Math.max(0, room - 1);
    return { step: 'crowded', lines: 1, h: c, fight: form, shown, more: n - shown, token: Math.max(0, c - 4), bar: 0 };
  }
  const h = Math.max(c, Math.min(st.top, Math.floor(raw + 1e-6)));
  if (h < st.two) return { step: 'one', lines: 1, h, fight: form, shown: n, more: 0, token: h - 4, bar: 0 };
  if (h < st.three) {
    const bar = half(lerp(5, 8, (h - st.two) / Math.max(1, st.three - 1 - st.two)) * scale);
    return { step: 'two', lines: 2, h, fight: form, shown: n, more: 0, token: h - 8, bar };
  }
  const bar = half(lerp(5, 9, (h - st.three) / Math.max(1, st.top - st.three)) * scale);
  const step: GroupStep = Math.floor(raw + 1e-6) > st.top ? 'top' : 'three';
  return { step, lines: 3, h, fight: form, shown: n, more: 0, token: Math.min(TOKEN_MAX, h - 8), bar };
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
  /** The numbers at the end of a three-line bar: `value/max` when both are known, else the band word (or nothing). */
  num: string;
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
  /** The HP fraction (`vitalPct`: a band-word estimate counts), or null: the token's arc. */
  hp: number | null;
  /** The HP arc's colour (the HP bar's). */
  arc: string;
}

export interface FightView {
  /** The tank's side, or null: you tank (the card is the opponent alone). */
  tank: { name: string; bar: BarView | null; numbers: string } | null;
  foe: { name: string; word: string | null; bar: BarView };
}

/** The colour of a vital bar at `pct` (0–1): the setting's, orange at ≤ 45 %, red at ≤ 25 %. */
export function vitalColor(base: string, pct: number | null, light: boolean): string {
  const tone = vitalTone(pct);
  if (tone === 'ok') return base;
  const sig = signalColors(light);
  return tone === 'critical' ? sig.vitalCritical : sig.vitalLow;
}

/** The HP colours by tone for a side (the map tokens' arc, stage 80 §7): Group's HP bar colour, orange, red. */
export function hpToneColors(s: Readonly<Settings>, light: boolean): Record<VitalTone, string> {
  const sig = signalColors(light);
  return { ok: groupVitals(s, light).hp, low: sig.vitalLow, critical: sig.vitalCritical };
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
  const num = known ? `${v.value}/${v.max}` : (v.word ?? '');
  return { kind, pct: p, color: pct === null ? '' : vitalColor(base, pct, light), est: pct !== null && !known, title, tip: tip || title, num };
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
  const pos = position === null ? null : ((Object.hasOwn(POSITION_TITLE, position) ? POSITION_TITLE[position] : undefined) ?? capitalise(position));
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
    // A member MUME sends no mana for (a troll or an NPC, stage 77 H9 and its follow-up): no mana bar, HP and moves take the width.
    bars: VITAL_KINDS.filter((k) => k !== 'mana' || !m.noMana).map((k) => barView(k, m[k], env.vitals[k], env.light)),
    ...hpArc(m, env),
  };
}

function hpArc(m: Member, env: Pick<MemberEnv, 'vitals' | 'light'>): { hp: number | null; arc: string } {
  const hp = vitalPct('hp', m.hp).pct;
  return { hp, arc: hp === null ? '' : vitalColor(env.vitals.hp, hp, env.light) };
}

/** The HP arc is drawn when the HP is known and below full (the map's rule, stage 80 §8). */
export const arcShown = (hp: number | null): hp is number => hp !== null && hp < 1;

// ------------------------------------------------------------------ tokens

/** A member's token (stage 80 §8): what to draw, its fallback, the ring. */
export interface TokenView {
  /** The look to draw (src/looks/resolve.ts). */
  look: Look;
  /** The automatic look: where a picture that cannot load falls to. */
  alt: Look;
  /** The R3 ring's colour (the member's hue, muted). */
  ring: string;
  /** The button's label. */
  label: string;
}

export interface TokenEnv {
  looks: { lookFor(name: string | null | undefined): LookRef | null } | null;
  library: Library | null;
  /** The member's hue (`GameState.groupTable`), 0xRRGGBB, or null. */
  hue: (id: number) => number | null;
}

/** A grey for a member the hue table does not know (yet). */
const NO_HUE = 0x8c8c8c;

/** A member's token. */
export function tokenView(m: Member, env: TokenEnv): TokenView {
  const input = { mode: 'live' as const, name: m.name, npc: m.type === 'npc', choice: env.looks?.lookFor(m.name) ?? null, library: env.library };
  const name = m.name || m.label || '?';
  return { look: resolveMember(input), alt: autoMember(input), ring: ringCss(env.hue(m.id) ?? NO_HUE), label: `Look for ${name}` };
}

/** What a look draws, as a short key (signatures, `data-look`). */
export function lookKey(l: Look): string {
  switch (l.kind) {
    case 'lib':
      return `lib:${l.id}`;
    case 'own':
      return `own:${l.id}`;
    case 'drawn':
      return `drawn:${l.portrait}:${l.portrait === 'neutral' ? '-' : l.sex}`;
    default:
      return 'icon';
  }
}

/** What a token's structure depends on (its arc is set in place). */
export const tokenSig = (t: TokenView): string => `${lookKey(t.look)}|${lookKey(t.alt)}|${t.ring}|${t.label}`;

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
 * What a member row's structure depends on (the layout's key: lines, row
 * height and token size; the elements drawn and
 * their fixed texts and tooltips). The bars and a timed sanctuary's time
 * and ring are values the pane sets in place: equal signatures, the built
 * row stays.
 */
export function memberSig(v: MemberView, layout: string | number, gold: string): string {
  return [
    layout,
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
    v.bars.map((b) => b.kind).join(','),
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
