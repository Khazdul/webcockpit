// Group pane (ADR 0122; Inv §2.3 for the data, its drawing rules are
// replaced by the ADR; mockup 3c,
// notes/research/group-timers-mockups/r2-P3c-revised.dc.html). DOM in the
// terminal font, sized on the cell grid:
//
//   ┌ fight zone (while you fight, 4 rows) ───────────────────────┐
//   │ ⛉ Gibur                    vs        a black-robed orc  🪓   │  names
//   │ ██████████████░░░░                   ░░░░░░░░████████████    │  HP bars facing
//   │ 132/160                                    badly wounded     │
//   └ GROUP ─────────────────────────────────────────── 5 ─────────┘
//   ☺ Gibur                         ⛉ ✺3:12 │ ♞      two lines per member:
//   ━━━━━━━━━━  ━━━━━━  ━━━━━━━━                     marker, name, statuses,
//   ◇ a citizen mercenary [MERC]      ✸ ▭  │ ☺      position; HP, mana, moves
//   ▒▒▒▒▒▒▒▒▒▒  ······  ▒▒▒▒▒▒▒
//
// - Rows are whole cells: a two-line member is 2 rows, a one-line member
//   (name, three mini bars, up to three icons and `+n`) 1 row; the fight
//   zone 4 rows (a 1-row strip in one-line mode). Two lines when every
//   shown member fits that way, else one line; still too many: the first
//   ones and `↓ N more members` (`groupLayout`).
// - Markers: a player is the person icon in its relation colour (ally,
//   neutral), an enemy race the horned helm, an NPC a diamond plus its
//   label as a tag. Players' names are bold.
// - Statuses: the GMCP flags in `STATUS_FLAGS` order; sanctuary carries a
//   ring (and its time) when the Timers' Sanctuary group times it (your
//   cast, ADR 0122). The tank (Char.Vitals buffer) gets a shield too.
// - Away (a player's mapid is not your room): `room` shows the room after
//   the name and dims the row's name and bars; `dim` dims the row only.
// - Vitals: a colour setting per bar (Auto by side, src/panes/palette.ts),
//   orange at ≤ 45 % and red at ≤ 25 %; a band-word bar (no number) is
//   hatched.
// - Every bar, icon, name, room and the opponent carry a tooltip
//   (src/panes/pane-tooltip.ts). No browser `title`.
// - Only rows whose look changed are rebuilt (`rowSig`); a timed sanctuary
//   re-renders its row every second.
// - Display options (`group` settings) filter what is drawn only; the model
//   keeps the canonical set.

import './group.css';
import { type VitalKind, VITAL_KINDS } from '../gmcp/bands';
import { foldName, type GroupDisplay, type GroupFight, type Member, type StatusFlag, STATUS_FLAGS, type Vital, vitalPct } from '../gmcp/group';
import type { GroupSettings, Settings } from '../settings/types';
import type { TimerCell } from '../timers/entry';
import type { PaneContext } from './context';
import { ICONS, ICON_VIEWBOX, type IconName, positionIcon, STATUS_ICON } from './icons';
import { resolveColor, signalColors } from './palette';
import { PaneShell } from './pane';
import { type PaneTooltip, installPaneTooltip, setTip } from './pane-tooltip';
import { paneShade } from './shade';

// ------------------------------------------------------------------ colours

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

export const groupColors = (light: boolean): Readonly<GroupColors> => (light ? GROUP_LIGHT : GROUP_DARK);

// ------------------------------------------------------------------ layout

/** Rows of the fight zone in two-line mode (names, bars, numbers, divider). */
export const FIGHT_ROWS = 4;

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
  /** Sanctuary ring: the fraction left (timed) or 'unknown' (untimed). */
  ring?: { frac: number | null };
  /** Text after the icon (a timed sanctuary's time). */
  time?: string;
}

export interface BarView {
  kind: VitalKind;
  /** Fill 0–100 (%). */
  pct: number;
  color: string;
  /** Band-word estimate (hatched). */
  est: boolean;
  title: string;
  tip: string;
}

export interface MemberView {
  key: string;
  id: number;
  /** `memberTitle`: the name, `name (LABEL)` for an NPC. */
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
  tank: { name: string; bar: BarView | null; numbers: string } | null;
  foe: { name: string; word: string | null; bar: BarView };
}

/** `m:ss` (or `h:mm:ss`), for tooltips. */
export function clockText(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

/** The short time beside a timed sanctuary: seconds at 90 s or less, else minutes (rounded up). */
export function shortTime(secs: number): string {
  const s = Math.max(0, Math.ceil(secs));
  if (s >= 3600) return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  return s > 90 ? `${Math.ceil(s / 60)}m` : `${s}s`;
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
    tip = p <= 25 ? 'Low: a quarter or less.' : p <= 45 ? 'Getting low.' : v.word ? capital(v.word) : '';
  } else {
    title = `${name} · ${v.word ?? ''}`.trim();
    tip = `About ${p}% (the band word).`;
  }
  return { kind, pct: p, color: pct === null ? '' : vitalColor(base, pct, light), est: pct !== null && !known, title, tip: tip || title };
}

const capital = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

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
  const pos = position === null ? null : (POSITION_TITLE[position] ?? capital(position));
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
      tip: `Cast by you: ${about}${clockText(left)} left.`,
      ring: { frac: Math.max(0, Math.min(1, (cell.expiresAt - now) / cell.expected)) },
      time: shortTime(left),
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

/** The fight zone's view, or null without an opponent. */
export function fightView(
  f: GroupFight,
  tankMember: Member | null,
  self: { name: string | null; hp: number | null; maxhp: number | null },
  env: Pick<MemberEnv, 'light' | 'colors' | 'vitals'>,
): FightView | null {
  if (f.opponent === null) return null;
  let tank: FightView['tank'] = null;
  if (tankMember) {
    const bar = barView('hp', tankMember.hp, env.vitals.hp, env.light);
    const numbers = tankMember.hp.value !== null && tankMember.hp.max !== null ? `${tankMember.hp.value}/${tankMember.hp.max}` : (tankMember.hp.word ?? '');
    tank = { name: tankMember.name, bar, numbers };
  } else if (f.tank !== null) {
    const you = self.name !== null && foldName(self.name) === foldName(f.tank);
    if (you && self.hp !== null && self.maxhp !== null) {
      const bar = barView('hp', { value: self.hp, max: self.maxhp, word: null }, env.vitals.hp, env.light);
      tank = { name: self.name ?? f.tank, bar, numbers: `${self.hp}/${self.maxhp}` };
    } else {
      tank = { name: f.tank, bar: null, numbers: '' };
    }
  }
  const om = f.opponentMember;
  const word = f.opponentWord;
  const v: Vital = om ? { ...om.hp, word: word ?? om.hp.word } : { value: null, max: null, word };
  const raw = barView('hp', v, env.colors.foe, env.light);
  const foeName = om ? (om.label ? `${om.name} (${om.label})` : om.name) : f.opponent;
  const bar: BarView = { ...raw, color: env.colors.foe, title: word ? `HP · ${word}` : raw.title, tip: word ? `${raw.tip} From the last round.` : raw.tip };
  return { tank, foe: { name: foeName, word, bar } };
}

// ------------------------------------------------------------------ DOM

const SVGNS = 'http://www.w3.org/2000/svg';
const RING_C = 2 * Math.PI * 10;

function svgIcon(doc: Document, name: IconName, cls = 'wc-gp-i'): SVGSVGElement {
  const svg = doc.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('viewBox', ICON_VIEWBOX);
  svg.setAttribute('aria-hidden', 'true');
  const p = doc.createElementNS(SVGNS, 'path');
  p.setAttribute('d', ICONS[name]);
  svg.append(p);
  return svg;
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function iconEl(doc: Document, v: IconView, key: string): HTMLElement {
  const box = el(doc, 'span', 'wc-gp-ic');
  box.style.color = v.color;
  if (v.ring) {
    const svg = doc.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'wc-gp-ring');
    svg.setAttribute('viewBox', ICON_VIEWBOX);
    svg.setAttribute('aria-hidden', 'true');
    const bg = doc.createElementNS(SVGNS, 'circle');
    const arc = doc.createElementNS(SVGNS, 'circle');
    for (const c of [bg, arc]) {
      c.setAttribute('cx', '12');
      c.setAttribute('cy', '12');
      c.setAttribute('r', '10');
    }
    bg.setAttribute('class', 'wc-gp-ring-bg');
    arc.setAttribute('class', v.ring.frac === null ? 'wc-gp-ring-arc is-unknown' : 'wc-gp-ring-arc');
    const f = v.ring.frac ?? 1;
    arc.setAttribute('stroke-dasharray', `${(f * RING_C).toFixed(2)} ${RING_C.toFixed(2)}`);
    svg.append(bg, arc);
    box.append(svg);
    box.classList.add('has-ring');
  }
  box.append(svgIcon(doc, v.icon));
  setTip(box, v.tip, v.title, key);
  return box;
}

function barEl(doc: Document, b: BarView, key: string, cls = 'wc-gp-bar'): HTMLElement {
  const w = el(doc, 'span', cls);
  const trk = el(doc, 'span', 'wc-gp-trk');
  const fill = el(doc, 'span', b.est ? 'wc-gp-fill is-est' : 'wc-gp-fill');
  fill.style.width = `${b.pct}%`;
  if (b.color) fill.style.backgroundColor = b.color;
  trk.append(fill);
  w.append(trk);
  setTip(w, b.tip, b.title, key);
  w.dataset.kind = b.kind;
  return w;
}

function markerEl(doc: Document, v: MemberView): HTMLElement {
  const mk = el(doc, 'span', 'wc-gp-mk');
  mk.style.color = v.marker.color;
  mk.append(svgIcon(doc, v.marker.icon));
  setTip(mk, v.marker.tip, v.marker.title, `${v.key}:mk`);
  return mk;
}

function nameEl(doc: Document, v: MemberView): HTMLElement {
  const n = el(doc, 'span', v.player ? 'wc-gp-name is-player' : 'wc-gp-name', v.name);
  setTip(n, v.nameTip, v.title, `${v.key}:name`);
  return n;
}

/** A two-line member row. */
export function memberRow2(doc: Document, v: MemberView, tankColor: string): HTMLElement {
  const row = el(doc, 'div', 'wc-gp-row wc-gp-m2');
  row.dataset.key = v.key;
  row.dataset.name = v.title;
  if (v.dim) row.classList.add('is-away');
  const l1 = el(doc, 'div', 'wc-gp-l1');
  l1.append(markerEl(doc, v), nameEl(doc, v));
  if (v.tag) l1.append(el(doc, 'span', 'wc-gp-tag', v.tag));
  if (v.room) {
    const where = el(doc, 'span', 'wc-gp-where');
    where.append(svgIcon(doc, 'pin'), doc.createTextNode(v.room));
    setTip(where, `At ${v.room}.`, 'Not in your room', `${v.key}:room`);
    l1.append(where);
  }
  const sts = el(doc, 'span', 'wc-gp-sts');
  if (v.tank) sts.append(iconEl(doc, { icon: 'tank', color: tankColor, title: 'Tanking', tip: 'Your fight buffer; also in the fight zone.' }, `${v.key}:tank`));
  for (const s of v.statuses) {
    sts.append(iconEl(doc, s, `${v.key}:${s.icon}`));
    if (s.time) {
      const t = el(doc, 'span', 'wc-gp-stime', s.time);
      t.style.color = s.color;
      sts.append(t);
    }
  }
  if (v.position) {
    if (sts.childElementCount > 0) sts.append(el(doc, 'span', 'wc-gp-vr'));
    sts.append(iconEl(doc, v.position, `${v.key}:pos`));
  }
  l1.append(sts);
  const bars = el(doc, 'div', 'wc-gp-bars');
  for (const b of v.bars) bars.append(barEl(doc, b, `${v.key}:${b.kind}`));
  row.append(l1, bars);
  return row;
}

/** Icons a one-line row shows before `+n`. */
export const COMPACT_ICONS = 3;

/** A one-line member row. */
export function memberRow1(doc: Document, v: MemberView, tankColor: string): HTMLElement {
  const row = el(doc, 'div', 'wc-gp-row wc-gp-m1');
  row.dataset.key = v.key;
  row.dataset.name = v.title;
  if (v.dim) row.classList.add('is-away');
  const n = nameEl(doc, v);
  const mini = el(doc, 'span', 'wc-gp-mini');
  for (const b of v.bars) mini.append(barEl(doc, b, `${v.key}:${b.kind}`));
  const sts = el(doc, 'span', 'wc-gp-sts');
  const icons: IconView[] = [];
  if (v.tank) icons.push({ icon: 'tank', color: tankColor, title: 'Tanking', tip: 'Your fight buffer.' });
  icons.push(...v.statuses.map((s) => ({ ...s, time: undefined })));
  for (const s of icons.slice(0, COMPACT_ICONS)) sts.append(iconEl(doc, s, `${v.key}:${s.icon}`));
  if (icons.length > COMPACT_ICONS) {
    const more = el(doc, 'span', 'wc-gp-more', `+${icons.length - COMPACT_ICONS}`);
    setTip(more, icons.slice(COMPACT_ICONS).map((s) => s.title).join(', '), 'Also', `${v.key}:more`);
    sts.append(more);
  }
  row.append(markerEl(doc, v), n, mini, sts);
  return row;
}

function fightZone(doc: Document, f: FightView, c: Readonly<GroupColors>, count: number): HTMLElement[] {
  const zone = el(doc, 'div', 'wc-gp-row wc-gp-fight');
  zone.dataset.key = 'fight';
  const side = (left: boolean): HTMLElement => el(doc, 'div', left ? 'wc-gp-fs' : 'wc-gp-fs is-foe');
  const a = side(true);
  const b = side(false);
  // The tank.
  const at = el(doc, 'div', 'wc-gp-ft');
  const shield = el(doc, 'span', 'wc-gp-ic');
  shield.style.color = c.gold;
  shield.append(svgIcon(doc, 'tank'));
  setTip(shield, 'Takes the hits: your fight buffer.', 'Tanking', 'fight:tankic');
  at.append(shield);
  const tn = el(doc, 'span', 'wc-gp-fn', f.tank?.name ?? 'Nobody');
  setTip(tn, f.tank ? 'Tanking (Char.Vitals buffer).' : 'No buffer known.', f.tank?.name ?? 'Tank', 'fight:tank');
  at.append(tn);
  a.append(at);
  if (f.tank?.bar) a.append(barEl(doc, f.tank.bar, 'fight:tankhp', 'wc-gp-fbar'));
  else a.append(el(doc, 'span', 'wc-gp-fbar is-empty'));
  a.append(el(doc, 'span', 'wc-gp-fsub', f.tank?.numbers ?? ''));
  // The opponent.
  const bt = el(doc, 'div', 'wc-gp-ft');
  const fn = el(doc, 'span', 'wc-gp-fn is-foe', f.foe.name);
  setTip(fn, 'Your opponent: not a group member (Char.Vitals).', f.foe.name, 'fight:foe');
  const axe = el(doc, 'span', 'wc-gp-ic');
  axe.style.color = c.foe;
  axe.append(svgIcon(doc, 'axe'));
  setTip(axe, 'Whom you fight.', 'Your opponent', 'fight:foeic');
  bt.append(fn, axe);
  b.append(bt, barEl(doc, f.foe.bar, 'fight:foehp', 'wc-gp-fbar is-foe'));
  const word = el(doc, 'span', 'wc-gp-fsub is-foe', f.foe.word ?? '');
  if (f.foe.word) setTip(word, f.foe.bar.tip, f.foe.bar.title, 'fight:word');
  b.append(word);
  const vs = el(doc, 'div', 'wc-gp-vs');
  vs.append(el(doc, 'span', 'wc-gp-vsm', 'vs'));
  zone.append(a, vs, b);
  const sep = el(doc, 'div', 'wc-gp-row wc-gp-sep');
  sep.dataset.key = 'sep';
  sep.append(el(doc, 'span', '', 'Group'), el(doc, 'span', 'wc-gp-ln'), el(doc, 'span', '', String(count)));
  return [zone, sep];
}

function fightStrip(doc: Document, f: FightView, c: Readonly<GroupColors>): HTMLElement {
  const row = el(doc, 'div', 'wc-gp-row wc-gp-fstrip');
  row.dataset.key = 'fight';
  const shield = el(doc, 'span', 'wc-gp-ic');
  shield.style.color = c.gold;
  shield.append(svgIcon(doc, 'tank'));
  setTip(shield, f.tank?.bar?.title ?? 'Your fight buffer.', f.tank ? `${f.tank.name} tanks` : 'Tank', 'fight:tankic');
  const tb = f.tank?.bar ? barEl(doc, f.tank.bar, 'fight:tankhp', 'wc-gp-sbar') : el(doc, 'span', 'wc-gp-sbar is-empty');
  const vs = el(doc, 'span', 'wc-gp-svs', 'vs');
  const fb = barEl(doc, f.foe.bar, 'fight:foehp', 'wc-gp-sbar is-foe');
  const axe = el(doc, 'span', 'wc-gp-ic');
  axe.style.color = c.foe;
  axe.append(svgIcon(doc, 'axe'));
  setTip(axe, f.foe.word ?? 'Your opponent.', f.foe.name, 'fight:foe');
  row.append(shield, tb, vs, fb, axe);
  return row;
}

function overflowRow(doc: Document, more: number): HTMLElement {
  const row = el(doc, 'div', 'wc-gp-row wc-gp-over', `↓ ${more} more member${more === 1 ? '' : 's'}`);
  row.dataset.key = 'more';
  return row;
}

// ------------------------------------------------------------------ pane

export class GroupPane extends PaneShell {
  private readonly tip: PaneTooltip;
  /** Built rows by key, with the signature they were built from. */
  private built = new Map<string, { sig: string; el: HTMLElement }>();
  private order = '';
  private themeKey_ = '';
  private tickTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: PaneContext) {
    super(ctx, 'group');
    this.content.classList.add('wc-gp');
    this.tip = installPaneTooltip(ctx.doc);
    this.own(this.tip.attach(this.content));
    this.own(ctx.game.subscribe((part) => (part === 'group' || part === 'timers' || part === 'char') && this.markDirty()));
    this.own(
      ctx.settings.subscribe((next, prev) => {
        if (next.group !== prev.group || next.timers.groups.sanct !== prev.timers.groups.sanct) this.markDirty();
      }),
    );
    this.own(() => this.stopTick());
  }

  protected override render(): void {
    const s = this.ctx.settings.get();
    const doc = this.ctx.doc;
    const shade = paneShade(s, 'group');
    const light = shade.light;
    const colors = groupColors(light);
    this.theme(shade.ramp, light);
    const game = this.ctx.game;
    const now = this.ctx.now();
    const display: GroupDisplay = { showPlayers: s.group.showPlayers, npcMode: s.group.npcMode };
    const members = game.group.displayed(display);
    const fight = game.group.fight();
    const vitals = groupVitals(s, light);
    const sanctCells = game.timers.view(now).cells.sanct ?? [];
    const env: MemberEnv = {
      light,
      colors,
      vitals,
      sanct: resolveColor(s.timers.groups.sanct.color, 'sanct', light),
      away: s.group.away,
      isAway: (m) => game.group.isAway(m),
      tankId: fight.tankId,
      sanctCell: (id) => sanctCells.find((c) => c.id === `sanct:${id}`),
      now,
    };
    const charView = game.char.view();
    const vitalsMap = game.char.vitals;
    const self = {
      name: charView.name,
      hp: typeof vitalsMap.get('hp') === 'number' ? (vitalsMap.get('hp') as number) : null,
      maxhp: charView.maxhp,
    };
    const tankMember = fight.tankId === null ? null : (game.group.get(fight.tankId) ?? null);
    const fv = fightView(fight, tankMember, self, env);
    const layout = groupLayout(members.length, fv !== null, this.rows);
    const views = members.slice(0, layout.shown).map((m) => memberView(m, env));

    const want: Array<{ key: string; sig: string; build: () => HTMLElement | HTMLElement[] }> = [];
    if (fv && layout.fightRows > 1) {
      want.push({ key: 'fight', sig: `2|${JSON.stringify(fv)}|${members.length}|${light}`, build: () => fightZone(doc, fv, colors, members.length) });
    } else if (fv && layout.fightRows === 1) {
      want.push({ key: 'fight', sig: `1|${JSON.stringify(fv)}|${light}`, build: () => fightStrip(doc, fv, colors) });
    }
    for (const v of views) {
      const build = layout.lines === 2 ? memberRow2 : memberRow1;
      want.push({ key: v.key, sig: `${layout.lines}|${JSON.stringify(v)}|${colors.gold}`, build: () => build(doc, v, colors.gold) });
    }
    if (layout.more > 0) want.push({ key: 'more', sig: String(layout.more), build: () => overflowRow(doc, layout.more) });
    this.reconcile(want);
    this.tip.refresh();
    // A timed sanctuary counts down: once a second while one is shown.
    if (views.some((v) => v.statuses.some((st) => st.ring && st.ring.frac !== null))) this.armTick(now);
    else this.stopTick();
  }

  protected override blank(): void {
    this.stopTick();
    this.built.clear();
    this.order = '';
    this.themeKey_ = '';
    super.blank();
  }

  private theme(ramp: Record<string, string>, light: boolean): void {
    const key = `${ramp.vtext}${ramp.label}${ramp.mid}${ramp.dim}${ramp.track}${light}`;
    if (key === this.themeKey_) return;
    this.themeKey_ = key;
    const st = this.content.style;
    st.setProperty('--gp-text', ramp.vtext!);
    st.setProperty('--gp-label', ramp.label!);
    st.setProperty('--gp-mid', ramp.mid!);
    st.setProperty('--gp-line', ramp.dim!);
    st.setProperty('--gp-track', ramp.track!);
    this.content.toggleAttribute('data-light', light);
  }

  private reconcile(want: Array<{ key: string; sig: string; build: () => HTMLElement | HTMLElement[] }>): void {
    const next = new Map<string, { sig: string; el: HTMLElement }>();
    const els: HTMLElement[] = [];
    let changed = false;
    for (const w of want) {
      const old = this.built.get(w.key);
      if (old && old.sig === w.sig) {
        next.set(w.key, old);
        els.push(old.el);
        if (w.key === 'fight') {
          const sep = this.built.get('sep');
          if (sep) {
            next.set('sep', sep);
            els.push(sep.el);
          }
        }
        continue;
      }
      changed = true;
      const built = w.build();
      const list = Array.isArray(built) ? built : [built];
      next.set(w.key, { sig: w.sig, el: list[0]! });
      if (list[1]) next.set('sep', { sig: w.sig, el: list[1] });
      els.push(...list);
    }
    const order = els.map((e) => e.dataset.key).join(',');
    if (changed || order !== this.order || next.size !== this.built.size) {
      // Replace only what changed: unchanged rows stay the same nodes.
      const cur = [...this.content.children];
      if (cur.length !== els.length || cur.some((c, i) => c !== els[i])) this.content.replaceChildren(...els);
    }
    this.built = next;
    this.order = order;
  }

  private armTick(now: number): void {
    if (this.tickTimer !== null) return;
    const wait = 1000 - (now % 1000) + 5;
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      this.markDirty();
    }, wait);
  }

  private stopTick(): void {
    if (this.tickTimer !== null) clearTimeout(this.tickTimer);
    this.tickTimer = null;
  }
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
