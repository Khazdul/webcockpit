// What the Character card shows (stage 77 part D, ADR 0166 addendum 6), as
// plain data. Pure: no DOM, no timer, no clock (`now` is passed in). The
// sizes are character-layout.ts, the DOM is character.ts.
//
// - Clicks (decision 19, points 8 and 37): the next step of a cycle, never
//   berserk, and none where the next value is not known. A clicked element
//   is pending until GMCP changes its value or 3 s have passed.
// - The fight mode (decision 13): an opponent switches to Status, a tab
//   chosen during the fight holds for the fight, and after it the tab from
//   before the fight is back.
// - Words are shortened by a list, then cut with `…`: never mid-glyph.
// - Bars (decision 11): a number only when the last update was one, else
//   the band word's span. Band words are never written.
// - Minus is U+2212, as the mockup.

import { ABILITIES, AGE_NAMES, type Ability, ageAt, ageInYears, birthdayIn } from '../gmcp/age';
import { type VitalKind, bandOf } from '../gmcp/bands';
import {
  ALERTNESS_STEPS,
  type CharVital,
  type CharView,
  MOOD_STEPS,
  SPELL_EFFORT_STEPS,
  type Toggle,
  capitalise,
} from '../gmcp/char';
import type { InfoAnswer } from '../gmcp/info-answer';
import { ageFactor } from '../gmcp/race';
import { vitalColor } from './group-model';
import { type IconName, positionIcon } from './icons';

// --------------------------------------------------------------------- tabs

export type CardTab = 'status' | 'stats' | 'lore';

export const CARD_TABS: readonly { id: CardTab; label: string }[] = [
  { id: 'status', label: 'STATUS' },
  { id: 'stats', label: 'STATS' },
  { id: 'lore', label: 'LORE' },
];

/** Which tab shows, with the fight mode (see the file header). */
export class TabState {
  /** The player's tab outside a fight. */
  private chosen: CardTab = 'status';
  /** The tab during a fight, null outside one. */
  private inFight: CardTab | null = null;

  get shown(): CardTab {
    return this.inFight ?? this.chosen;
  }

  get fighting(): boolean {
    return this.inFight !== null;
  }

  select(tab: CardTab): void {
    if (this.inFight !== null) this.inFight = tab;
    else this.chosen = tab;
  }

  /** The fight began or ended. False: it already was so. */
  setFight(on: boolean): boolean {
    if (on === this.fighting) return false;
    this.inFight = on ? 'status' : null;
    return true;
  }
}

// ------------------------------------------------------------------- clicks

export type ClickId = 'mood' | 'casts' | 'alertness' | Toggle | 'position';

/** What a click reads: the values that decide its command. */
export type ClickValues = Pick<CharView, 'mood' | 'spellEffort' | 'alertness' | 'toggles' | 'position'>;

/** Mood's cycle: never berserk. */
export const MOOD_CYCLE: readonly string[] = MOOD_STEPS.filter((m) => m !== 'berserk');

const POSITION_COMMAND: ReadonlyMap<string, string> = new Map([
  ['standing', 'rest'],
  ['resting', 'stand'],
  ['sitting', 'stand'],
  ['sleeping', 'wake'],
]);

function nextStep(steps: readonly string[], value: string | null): string | null {
  const i = value === null ? -1 : steps.indexOf(value);
  return i < 0 ? null : steps[(i + 1) % steps.length]!;
}

/** What a click on `id` sends, or null: no click there (point 37). */
export function clickCommand(id: ClickId, v: ClickValues, fighting = false): string | null {
  let next: string | null;
  switch (id) {
    case 'mood':
      next = nextStep(MOOD_CYCLE, v.mood);
      return next === null ? null : `change mood ${next}`;
    case 'casts':
      next = nextStep(SPELL_EFFORT_STEPS, v.spellEffort);
      return next === null ? null : `change spellcasting ${next}`;
    case 'alertness':
      next = nextStep(ALERTNESS_STEPS, v.alertness);
      return next === null ? null : `change alertness ${next}`;
    case 'ride':
      return v.toggles.ride ? 'lead' : 'ride';
    case 'sneak':
    case 'climb':
    case 'swim':
      return id;
    case 'position':
      // The icon is the crossed swords then.
      if (fighting || v.position === null) return null;
      return POSITION_COMMAND.get(v.position) ?? null;
  }
}

/** The value a pending click waits to see changed. */
export function clickValue(id: ClickId, v: ClickValues): string | null {
  switch (id) {
    case 'mood':
      return v.mood;
    case 'casts':
      return v.spellEffort;
    case 'alertness':
      return v.alertness;
    case 'position':
      return v.position;
    default:
      return v.toggles[id] ? 'on' : 'off';
  }
}

/** A pending mark ends after this long without a change (point 8). */
export const PENDING_MS = 3000;

/** The clicks that wait for GMCP. */
export class Pending {
  private readonly waits = new Map<ClickId, { value: string | null; until: number }>();
  /** Bumped on every change. */
  version = 0;

  get size(): number {
    return this.waits.size;
  }

  start(id: ClickId, v: ClickValues, now: number): void {
    this.waits.set(id, { value: clickValue(id, v), until: now + PENDING_MS });
    this.version++;
  }

  has(id: ClickId): boolean {
    return this.waits.has(id);
  }

  /** GMCP changed something: the waits whose value changed end. */
  settle(v: ClickValues): void {
    for (const [id, w] of this.waits) {
      if (clickValue(id, v) !== w.value) this.end(id);
    }
  }

  /** Ends the waits that are over. */
  expire(now: number): void {
    for (const [id, w] of this.waits) {
      if (now >= w.until) this.end(id);
    }
  }

  /** When the first wait is over, or null. */
  nextAt(): number | null {
    let at: number | null = null;
    for (const w of this.waits.values()) at = at === null ? w.until : Math.min(at, w.until);
    return at;
  }

  clear(): void {
    if (this.waits.size === 0) return;
    this.waits.clear();
    this.version++;
  }

  private end(id: ClickId): void {
    this.waits.delete(id);
    this.version++;
  }
}

// -------------------------------------------------------------------- words

/** The shorter forms of the words, longest first. */
const SHORTER: ReadonlyMap<string, readonly string[]> = new Map([
  ['prudent', ['prud.']],
  ['normal', ['norm.']],
  ['aggressive', ['aggres.', 'agg.']],
  ['berserk', ['bers.']],
  ['careful', ['caref.', 'car.']],
  ['thorough', ['thor.', 'th.']],
  ['attentive', ['attent.', 'att.']],
  ['vigilant', ['vigil.', 'vig.']],
  ['paranoid', ['paran.', 'par.']],
  ['peanuts', ['pean.']],
  ['uncomfortable', ['uncomf.', 'unc.']],
  ['really heavy', ['r. heavy', 'r.hv.']],
  ['painful', ['painf.', 'pain.']],
  ['torture', ['tort.']],
]);

/** `word` in at most `chars` characters. */
export function fitWord(word: string, chars: number): string {
  if (chars <= 0) return '';
  const glyphs = [...word];
  if (glyphs.length <= chars) return word;
  const short = SHORTER.get(word.toLowerCase())?.find((s) => s.length <= chars);
  if (short) return short;
  return `${glyphs.slice(0, chars - 1).join('')}…`;
}

const MINUS = '−';
const NBSP = ' ';
const NONE = '—';

/** `+2`, `−1`, `±0` with `digits` decimals. */
export function signed(v: number, digits = 0): string {
  const r = Number(Math.abs(v).toFixed(digits));
  return `${r === 0 ? '±' : v > 0 ? '+' : MINUS}${r.toFixed(digits)}`;
}

const plain = (n: number | null): string => (n === null ? NONE : n < 0 ? `${MINUS}${-n}` : String(n));
const grouped = (n: number): string => String(n).replace(/\B(?=(\d{3})+$)/g, NBSP);

// ---------------------------------------------------------------- left column

export interface RingView {
  level: string;
  /** Of the ring, 0–1: up to the session's start, and gained since. */
  base: number;
  gain: number;
  tp: number;
  title: string;
  tip: string;
}

/** Whole percent, floored: 100 only when full. */
const percent = (p: number): number => (p >= 1 ? 100 : Math.floor(p * 100 + 1e-9));

export function ringView(v: Pick<CharView, 'level' | 'xp' | 'tp' | 'toNext'>): RingView {
  const { level, xp, tp } = v;
  const lines: string[] = [];
  if (xp) {
    const left = v.toNext !== null && level !== null ? ` · ${grouped(v.toNext)} to ${level + 1}` : '';
    lines.push(`XP ${percent(xp.progress)} %${left}`);
  } else lines.push('XP unknown');
  if (tp) lines.push(tp.progress >= 1 ? 'TP done' : `TP ${percent(tp.progress)} %`);
  return {
    level: level === null ? NONE : String(level),
    base: xp?.baseline ?? 0,
    gain: xp ? Math.max(0, xp.progress - xp.baseline) : 0,
    tp: tp?.progress ?? 0,
    title: level === null ? 'Level unknown' : `Level ${level}`,
    tip: lines.join('\n'),
  };
}

export interface ClickView {
  id: ClickId;
  icon: IconName;
  /** The element's accessible name. */
  name: string;
  /** The command, or null: no click (also where clicks are off). */
  command: string | null;
  pending: boolean;
  tip: string | null;
}

function clickView(id: ClickId, icon: IconName, name: string, v: ClickValues, e: CardEnv): ClickView {
  const command = e.clicks ? clickCommand(id, v, e.fighting) : null;
  const pending = e.pending.has(id);
  const tip = command === null ? null : pending ? 'Waiting for the game.' : `Click: ${command}`;
  return { id, icon, name, command, pending, tip };
}

/** What the clickable elements need beside the values. */
export interface CardEnv {
  /** Commands can be sent (not in a replay, not the log player). */
  clicks: boolean;
  fighting: boolean;
  pending: Pick<Pending, 'has'>;
}

export interface IconButtonView extends ClickView {
  on: boolean;
}

export const CARD_TOGGLES: readonly { id: Toggle; icon: IconName }[] = [
  { id: 'sneak', icon: 'sneak' },
  { id: 'ride', icon: 'ride' },
  { id: 'climb', icon: 'climb' },
  { id: 'swim', icon: 'swim' },
];

/** The five icons: four toggles and the position. */
export function iconsView(v: ClickValues, e: CardEnv): IconButtonView[] {
  const out = CARD_TOGGLES.map(({ id, icon }) => {
    const on = v.toggles[id];
    return { ...clickView(id, icon, `${capitalise(id)}: ${on ? 'on' : 'off'}`, v, e), on };
  });
  const icon = e.fighting ? 'fighting' : positionIcon(v.position, false);
  const name = e.fighting ? 'Fighting' : v.position === null ? 'Position unknown' : capitalise(v.position);
  out.push({ ...clickView('position', icon, name, v, e), on: v.position !== null });
  return out;
}

// ------------------------------------------------------------------- Status

/** MUME's encumbrance sentences (`info %F`), light to heavy. */
export const LOAD_SENTENCES: readonly string[] = [
  'Peanuts.',
  'A tad uncomfortable, but no problem.',
  'Heavy, but we will manage...',
  'That is really heavy!',
  'You are trying to forget the pain...',
  'Every single move is sheer torture...',
];

/** The signal of a weight step: the two highest red, the third highest orange. */
export function loadSignal(step: number | null): 'low' | 'critical' | null {
  if (step === null) return null;
  return step >= 4 ? 'critical' : step === 3 ? 'low' : null;
}

export interface StatusFieldView {
  key: 'mood' | 'casts' | 'alertness' | 'weight';
  icon: IconName;
  label: string;
  /** Fitted. */
  value: string;
  name: string;
  signal: 'low' | 'critical' | null;
  /** Null: Weight, which has no click. */
  click: ClickView | null;
  tip: string | null;
}

export function statusView(
  v: ClickValues & Pick<CharView, 'carrying'>,
  e: CardEnv,
  chars: number,
): StatusFieldView[] {
  const field = (id: 'mood' | 'casts' | 'alertness', icon: IconName, label: string, word: string | null): StatusFieldView => {
    const name = `${label}: ${word ?? 'unknown'}`;
    const click = clickView(id, icon, name, v, e);
    return { key: id, icon, label, value: fitWord(word ?? NONE, chars), name, signal: null, click, tip: click.tip };
  };
  const load = v.carrying;
  return [
    field('mood', 'mood', 'Mood', v.mood),
    field('casts', 'casts', 'Casts', v.spellEffort),
    field('alertness', 'alertness', 'Alertness', v.alertness),
    {
      key: 'weight',
      icon: 'weight',
      label: 'Weight',
      value: fitWord(load?.word ?? NONE, chars),
      name: `Weight: ${load?.word ?? 'unknown'}`,
      signal: loadSignal(load?.step ?? null),
      click: null,
      tip: load ? (load.step === null ? load.word : LOAD_SENTENCES[load.step]!) : null,
    },
  ];
}

// ------------------------------------------------------------------- vitals

export const VITAL_LABEL: Readonly<Record<VitalKind, string>> = { hp: 'HP', mana: 'MANA', mp: 'MOVES' };

/** How a bar writes itself, widest first: `187 / 270`, `187/270`, `187`, `187` without the label. */
export type VitalForm = 'full' | 'tight' | 'value' | 'number';

export interface VitalView {
  /** The number, empty unless exact. */
  value: string;
  max: string;
  /** The solid fill, %. */
  fill: number;
  /** The band's hatched span, %, or null. */
  span: { lo: number; hi: number } | null;
  color: string;
}

const pct1 = (p: number): number => Math.round(Math.max(0, Math.min(1, p)) * 1000) / 10;

export function vitalView(kind: VitalKind, v: CharVital, base: string, light: boolean, form: VitalForm): VitalView {
  if (v.exact && v.value !== null) {
    const p = v.max !== null && v.max > 0 ? Math.max(0, Math.min(1, v.value / v.max)) : null;
    const max = v.max === null || form === 'value' || form === 'number' ? '' : form === 'full' ? ` / ${v.max}` : `/${v.max}`;
    return { value: plain(v.value), max, fill: p === null ? 0 : pct1(p), span: null, color: vitalColor(base, p, light) };
  }
  const band = v.exact ? null : bandOf(kind, v.word);
  if (!band) return { value: '', max: '', fill: 0, span: null, color: base };
  // As Group's estimate: the band's middle decides the colour.
  const color = vitalColor(base, (band.lo + band.hi) / 200, light);
  return { value: '', max: '', fill: band.lo, span: band.hi > band.lo ? { lo: band.lo, hi: band.hi } : null, color };
}

/** Where the wimpy arrow stands, % of the HP bar, or null: none. */
export function wimpyAt(wimpy: number | null, maxhp: number | null): number | null {
  if (wimpy === null || wimpy <= 0 || maxhp === null || maxhp <= 0) return null;
  return pct1(wimpy / maxhp);
}

/** The HP bar's tooltip: exact or span, and the wimpy. */
export function hpTip(hp: CharVital, wimpy: number | null): { title: string; tip: string } {
  let title = 'HP';
  const lines: string[] = [];
  if (hp.exact && hp.value !== null) {
    title = `HP ${plain(hp.value)}`;
    if (hp.max !== null) title += ` / ${hp.max}`;
    if (hp.max !== null && hp.max > 0) title += ` · ${Math.round((hp.value / hp.max) * 100)} %`;
  } else {
    const band = hp.exact ? null : bandOf('hp', hp.word);
    if (!band) lines.push('Unknown.');
    else if (band.lo === band.hi) lines.push(`Only the band is known (${band.lo} %).`);
    else lines.push(`Only the band is known (${band.lo}–${band.hi} %).`);
  }
  if (wimpy === null) lines.push('Wimpy unknown.');
  else if (wimpy <= 0) lines.push('No wimpy.');
  else lines.push(`Wimpy ${wimpy}: you flee below the arrow.`);
  return { title, tip: lines.join('\n') };
}

/** The digits a bar's numbers need: by the maximum, so a falling value moves nothing. */
export function vitalDigits(vitals: Readonly<Record<VitalKind, Pick<CharVital, 'value' | 'max'>>>): number {
  let n = 3;
  for (const b of [vitals.hp, vitals.mana, vitals.mp]) {
    if (b.max !== null) n = Math.max(n, String(b.max).length);
    if (b.value !== null) n = Math.max(n, String(b.value).length);
  }
  return n;
}

// -------------------------------------------------------------------- Stats

export type Dir = 'up' | 'down' | null;
const dirOf = (n: number): Dir => (n > 0 ? 'up' : n < 0 ? 'down' : null);

export const SHIELDS = [
  { key: 'ob', label: 'OB', icon: 'ob' },
  { key: 'db', label: 'DB', icon: 'db' },
  { key: 'pb', label: 'PB', icon: 'pb' },
  { key: 'abs', label: 'ABS', icon: 'abs' },
] as const satisfies readonly { key: keyof InfoAnswer; label: string; icon: IconName }[];

export const SENSES = [
  { key: 'vision', label: 'Vision' },
  { key: 'hearing', label: 'Hearing' },
  { key: 'smell', label: 'Smell' },
  { key: 'carrying', label: 'Carrying' },
] as const;

export interface AbilityView {
  key: Ability;
  value: string;
  delta: string;
  dir: Dir;
  title: string;
  tip: string;
}

export interface StatsView {
  shields: string[];
  abilities: AbilityView[];
  age: {
    years: string;
    /** `2nd age`, empty for an unknown race. */
    name: string;
    /** `3rd at 64`, empty also in the 7th. */
    next: string;
    /** Null: the race's ages are not known. */
    track: { index: number; at: number } | null;
    /** Points, then regeneration: HP, mana, moves. Null as `track`. */
    modifiers: { text: string; dir: Dir }[][] | null;
  };
  senses: string[];
}

export function statsView(a: InfoAnswer, race: string | null, subrace: string | null): StatsView {
  const abilities = ABILITIES.map((key): AbilityView => {
    const { current, unaffected, delta } = a.abilities[key];
    const label = key.toUpperCase();
    const lines: string[] = [];
    if (unaffected !== null) lines.push(`Unaffected ${unaffected}`);
    if (delta !== null) lines.push(delta === 0 ? 'No change from affects' : `${signed(delta)} from affects`);
    return {
      key,
      value: plain(current),
      delta: delta ? signed(delta) : '',
      dir: delta ? dirOf(delta) : null,
      title: `${label} ${plain(current)}`,
      tip: lines.join('\n') || 'Unknown.',
    };
  });

  const factor = ageFactor(race, subrace);
  const age: StatsView['age'] = { years: plain(a.years), name: '', next: '', track: null, modifiers: null };
  if (a.years !== null && factor !== null) {
    const at = ageAt(ageInYears(a.years, a.months ?? 0, a.days ?? 0), factor);
    age.name = `${AGE_NAMES[at.index]} age`;
    if (at.next) age.next = `${AGE_NAMES[at.next.index]} at ${at.next.year}`;
    age.track = { index: at.index, at: pct1(at.position) };
    const row = (m: Record<VitalKind, number>, digits: number): { text: string; dir: Dir }[] =>
      (['hp', 'mana', 'mp'] as const).map((k) => ({ text: signed(m[k], digits), dir: dirOf(Number(m[k].toFixed(digits))) }));
    age.modifiers = [row(at.points, 0), row(at.regen, 1)];
  }

  return {
    shields: SHIELDS.map(({ key }) => plain(a[key])),
    abilities,
    age,
    senses: SENSES.map(({ key }) => (key === 'carrying' && a.carrying !== null ? `${a.carrying}${NBSP}lb` : plain(a[key]))),
  };
}

// --------------------------------------------------------------------- Lore

export interface LoreView {
  race: string;
  alignment: string;
  citizen: string;
  warFame: string;
  warPoints: string;
  /** Gold, silver, copper, or null. */
  purse: string[] | null;
  height: string;
  weight: string;
  birthday: string;
}

export function loreView(a: InfoAnswer, race: string | null): LoreView {
  let weight = NONE;
  if (a.weight) {
    const { stone, pounds } = a.weight;
    const parts: string[] = [];
    if (stone) parts.push(`${stone}${NBSP}st`);
    if (pounds || !stone) parts.push(`${pounds}${NBSP}lb`);
    weight = parts.join(' ');
  }
  return {
    race: race ?? NONE,
    alignment: a.alignment ?? NONE,
    // MUME separates several by spaces, the names have none.
    citizen: a.citizen?.split(/\s+/).join(' · ') || NONE,
    warFame: a.warFame?.word ?? NONE,
    warPoints: a.warFame ? String(a.warFame.points) : '',
    purse: a.purse ? [a.purse.gold, a.purse.silver, a.purse.copper].map(plain) : null,
    height: a.height ? `${a.height.feet}′${a.height.inches}″` : NONE,
    weight,
    birthday: a.months !== null && a.days !== null ? birthdayIn(a.months, a.days) : NONE,
  };
}

// --------------------------------------------------------------- data's age

/** The data's age: the longest wording in `chars` (`info 12 s ago`, `12 s ago`, `12 s`, none), and when it changes. */
export function dataAge(at: number, now: number, fetch: boolean, chars: number): { text: string; changesAt: number } {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  const unit = s < 60 ? 1 : s < 3600 ? 60 : 3600;
  const n = Math.floor(s / unit);
  const name = unit === 1 ? 's' : unit === 60 ? 'min' : 'h';
  const wordings = [`info ${n} ${name} ago`, `${n} ${name} ago`, `${n} ${name}`];
  if (!fetch) wordings.unshift(`${wordings[0]} · fetch off`, 'fetch off');
  const text = wordings.find((t) => t.length <= chars) ?? '';
  return { text, changesAt: at + (n + 1) * unit * 1000 };
}

/** What Stats and Lore say without data. */
export function quietText(o: { replay: boolean; fetch: boolean }): string {
  if (o.replay) return 'A replay has no Stats and Lore.';
  if (!o.fetch) return 'Fetching Stats and Lore is off in the settings.';
  return 'No data yet. It comes when the game is quiet.';
}
