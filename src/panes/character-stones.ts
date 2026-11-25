// The Character card's stones (stage 77 F2a, ADR 0166 addenda 16, 22 and
// 23): what is on you, as small icons with a time bar, at the bottom of the
// status area. Pure (no DOM, no clock: `now` is passed in), unit tested in
// Node; the card (F2b) draws it.
//
//   stoneView     the stones from the Timers view (buffs, debuffs,
//                 herblores; your own sanctuary) and your GMCP flags
//                 (poison, blind, snared, wound, hungry, thirsty), in the
//                 display order, filtered by `character.stones`
//   stoneTime     a stone's time at `now`: fill, countdown, ending soon
//   stoneTip      its tooltip
//   keepStones    the overflow: which stay when only `cap` fit (point 120)
//   stoneRows     the rows: per row, rows used, the `+` and `+n` entries,
//                 the room left in the last row (the mockups' `stonesFit`)
//   purseFit      3/2/1/0 coins in the room the stones leave (point 121)
//   purseTip      the whole purse
//   shortForm     the compact card's hand-made short forms (point 126)
//
// - The list (`stoneView`) changes only when the Timers or the group
//   change; its order needs no clock (by expiry), so a tick reads only
//   `stoneTime` of each stone.
// - A flag whose twin affect is timed in Debuffs (blind → blindness,
//   hungry → hunger, thirsty → thirst) is one stone: the affect's.
// - `potion` (MUME's name for a herblore's draught, stage 77 H9) is no
//   stone while a herblore runs: the herblore's stone is the same thing.
// - One wound stone however many wounds; its tooltip lists the wound
//   lines of your latest list that had them (`wounds`, ADR 0166 addendum
//   36).
// - Each stone's icon is its pick (stage 77 H8, `stone-icons.ts`), chosen
//   here when the list is built; the group's generic icon for the rest.

import type { MemberFlags } from '../gmcp/group';
import type { CharacterStones } from '../settings/types';
import { capitalise } from '../gmcp/char';
import {
  type HerbEntry,
  type TimerCell,
  type TimersView,
  barPct,
  countdownText,
  exactText,
  isTimed,
} from '../timers/entry';
import type { IconName } from './icons';
import { SANCT_STONE, affectStoneIcon, flagStoneIcon, herbStoneIcon } from './stone-icons';

// -------------------------------------------------------------------- stones

/** Where a stone comes from. */
export type StoneKind = 'buff' | 'debuff' | 'herb' | 'flag' | 'sanct';

/** Your GMCP flags that are stones (ADR 0166 addendum 16, round 12 item 5). */
export const STONE_FLAGS = ['poison', 'blind', 'snared', 'wound', 'hungry', 'thirsty'] as const;
export type StoneFlag = (typeof STONE_FLAGS)[number];

/** A flag's name (the Group pane's words). What it does is not said: the red stone says it (the owner, 2026-11-25). */
export const STONE_FLAG_LABEL: Readonly<Record<StoneFlag, string>> = {
  poison: 'Poisoned',
  blind: 'Blind',
  snared: 'Snared',
  wound: 'Wounded',
  hungry: 'Hungry',
  thirsty: 'Thirsty',
};

/** The Debuffs affect that is the same thing as a flag: one stone, the affect's. */
export const FLAG_TWIN: Readonly<Partial<Record<StoneFlag, string>>> = {
  blind: 'blindness',
  hungry: 'hunger',
  thirsty: 'thirst',
};

/** The affect MUME lists for a herblore's draught: no stone while a herblore runs. */
export const HERB_POTION = 'potion';

/** Your sanctuary from the GMCP flag alone (no cell of yours in the Sanctuary group). */
export const SANCT_FLAG_ID = 'flag:sanctuary';

/** The colour a stone is drawn in: a Timers group's colour (flags and a herblore's debuff phase in the debuffs'). */
export type StoneTone = 'buff' | 'debuff' | 'herb' | 'sanct';

/** The `+n` priority of each kind, most urgent first (after ending soon). */
const KIND_RANK: Readonly<Record<StoneKind, number>> = { flag: 1, sanct: 1, debuff: 2, herb: 3, buff: 4 };

/** The display order of the kinds: herblores, buffs, debuffs, your sanctuary, flags. */
const KIND_ORDER: readonly StoneKind[] = ['herb', 'buff', 'debuff', 'sanct', 'flag'];

/** The group line of a stone's tooltip. */
const KIND_LABEL: Readonly<Record<StoneKind, string>> = {
  buff: 'Buff',
  debuff: 'Debuff',
  herb: 'Herblore',
  flag: 'GMCP flag',
  sanct: 'Sanctuary',
};

/** One stone: what does not change with the clock. */
export interface Stone {
  /** Stable (the Timers cell's id, `flag:<name>`). */
  id: string;
  kind: StoneKind;
  icon: IconName;
  tone: StoneTone;
  /** The name, capitalised (the tooltip's title). */
  label: string;
  /** Expiry, ms; null: no end (still) or not known (untimed). */
  expiresAt: number | null;
  /** The duration the bar drains over, ms; null: no drain. */
  expected: number | null;
  /** Tracked: false for a flag and an affect seen only in `stat`/`info` (dashed, no time). */
  tracked: boolean;
  /** A herblore's catalogue key while it may be stopped (its ×); null in a log player. */
  herbKey: string | null;
  /** A herblore in its debuff phase. */
  herbDebuff: boolean;
  /** The tooltip's lines under the title: the wounds; null for the rest. */
  about: string | null;
  /** Drawn dimmed: a light wound (no GMCP flag, no malus; addendum 38). Absent: false. */
  dim?: boolean;
}

/** What `stoneView` reads. */
export interface StoneViewInput {
  view: TimersView;
  /** Your own GMCP flags (`GroupModel.selfFlags`). */
  flags: Readonly<MemberFlags>;
  /** Your wound lines from the latest list that had them (`GroupModel.selfWounds`); absent: none. */
  wounds?: readonly string[];
  /** Your light wounds (`GroupModel.selfLightWounds`): lines while GMCP has no wound; absent: none. */
  lightWounds?: readonly string[];
  /** The shown groups (`character.stones`). */
  show: CharacterStones;
  /** A log player (`ctx.player`): read-only, no `+` and no ×. */
  player: boolean;
}

/** The stones and the herblore `+`. */
export interface StoneView {
  /** In the display order. */
  stones: Stone[];
  /** The herblore `+` is drawn (herblores shown, not a log player). */
  canStartHerb: boolean;
  /** The herblore catalogue (the `+` menu). */
  herbs: HerbEntry[];
  /** Equal for equal views: compare it to skip a redraw. */
  key: string;
}

function fromCell(c: TimerCell, kind: StoneKind, player: boolean): Stone {
  const herbDebuff = kind === 'herb' && c.phase === 'debuff';
  // Its own pick (stage 77 H8): a herblore's is the same in every phase, so
  // a debuff phase is drawn in the debuffs' colour (the round pages' red stone).
  const icon: IconName =
    kind === 'herb' ? herbStoneIcon(c.herbKey) : kind === 'sanct' ? SANCT_STONE.icon : affectStoneIcon(c.name, kind as 'buff' | 'debuff');
  return {
    id: c.id,
    kind,
    icon,
    tone: kind === 'flag' || herbDebuff ? 'debuff' : (kind as StoneTone),
    label: kind === 'sanct' ? 'Sanctuary' : capitalise(c.name),
    expiresAt: isTimed(c) ? c.expiresAt : null,
    expected: c.expected,
    tracked: c.tracked,
    herbKey: kind === 'herb' && !player ? (c.herbKey ?? null) : null,
    herbDebuff,
    about: null,
  };
}

function fromFlag(f: StoneFlag, wounds: readonly string[]): Stone {
  const label = STONE_FLAG_LABEL[f];
  // A wound lists its wounds alone (the owner, 2026-11-25: no extra words); the rest is the title alone.
  const about = f === 'wound' && wounds.length > 0 ? wounds.map(capitalise).join('\n') : null;
  return {
    id: `flag:${f}`,
    kind: 'flag',
    icon: flagStoneIcon(f),
    tone: 'debuff',
    label,
    expiresAt: null,
    expected: null,
    tracked: false,
    herbKey: null,
    herbDebuff: false,
    about,
  };
}

/** The light-wound stone's id. */
export const LIGHT_WOUND_ID = 'flag:wound-light';

/** Light wounds: listed, but no GMCP flag (MUME flags only a bleeding wound). Dimmed. */
function fromLightWounds(lines: readonly string[]): Stone {
  return {
    id: LIGHT_WOUND_ID,
    kind: 'flag',
    icon: flagStoneIcon('wound'),
    tone: 'debuff',
    label: lines.length > 1 ? 'Light wounds' : 'Light wound',
    expiresAt: null,
    expected: null,
    tracked: false,
    herbKey: null,
    herbDebuff: false,
    about: lines.map(capitalise).join('\n'),
    dim: true,
  };
}

/** Within a kind: timed by expiry (soonest first), then no end, then untimed; name, then id, as tie-breaks. */
function byExpiry(a: Stone, b: Stone): number {
  const r = (s: Stone): number => (s.expiresAt !== null ? 0 : s.tracked ? 1 : 2);
  const x = a.label.toLowerCase();
  const y = b.label.toLowerCase();
  return (
    r(a) - r(b) ||
    (a.expiresAt ?? 0) - (b.expiresAt ?? 0) ||
    (x < y ? -1 : x > y ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** The stones, in the display order, and the herblore `+`. Pure. */
export function stoneView(inp: StoneViewInput): StoneView {
  const { view, flags, show, player } = inp;
  const wounds = inp.wounds ?? [];
  const by: Record<StoneKind, Stone[]> = { herb: [], buff: [], debuff: [], sanct: [], flag: [] };
  if (show.herblores) for (const c of view.cells.herb) by.herb.push(fromCell(c, 'herb', player));
  const herbing = view.cells.herb.length > 0;
  const keep = (c: TimerCell): boolean => !(herbing && c.name.toLowerCase() === HERB_POTION);
  if (show.buffs) for (const c of view.cells.buff) if (keep(c)) by.buff.push(fromCell(c, 'buff', player));
  if (show.debuffs) for (const c of view.cells.debuff) if (keep(c)) by.debuff.push(fromCell(c, 'debuff', player));
  if (show.sanctuary) {
    // Yours only: a member's carries its name in `target`.
    const own = view.cells.sanct.find((c) => c.target === undefined);
    if (own) by.sanct.push(fromCell(own, 'sanct', player));
    else if (flags.sanctuary) {
      // GMCP says it glows, and no cast of yours timed it.
      by.sanct.push({
        id: SANCT_FLAG_ID,
        kind: 'sanct',
        icon: SANCT_STONE.icon,
        tone: 'sanct',
        label: 'Sanctuary',
        expiresAt: null,
        expected: null,
        tracked: false,
        herbKey: null,
        herbDebuff: false,
        about: null,
      });
    }
  }
  if (show.flags) {
    const debuffs = new Set(view.cells.debuff.map((c) => c.name.toLowerCase()));
    for (const f of STONE_FLAGS) {
      if (!flags[f]) continue;
      const twin = FLAG_TWIN[f];
      // The twin is in the list only while Debuffs are shown.
      if (twin !== undefined && show.debuffs && debuffs.has(twin)) continue;
      by.flag.push(fromFlag(f, wounds));
    }
    const light = inp.lightWounds ?? [];
    if (!flags.wound && light.length > 0) by.flag.push(fromLightWounds(light));
  }
  const stones = KIND_ORDER.flatMap((k) => by[k].sort(byExpiry));
  const canStartHerb = show.herblores && !player;
  let key = canStartHerb ? '+' : '-';
  for (const s of stones) key += `|${s.id}:${s.expiresAt}:${s.expected}:${s.tracked ? 1 : 0}:${s.herbKey ?? ''}:${s.herbDebuff ? 1 : 0}${s.kind === 'flag' ? `:${s.about}` : ''}`;
  return { stones, canStartHerb, herbs: view.herbs, key };
}

// ---------------------------------------------------------------------- time

/** `timed` counts down; `still` has no end (full bar); `untimed` is not known (dashed, no time). */
export type StoneState = 'timed' | 'still' | 'untimed';

/** A stone at `now`. */
export interface StoneTime {
  state: StoneState;
  /** Ms left (timed), else null. */
  remaining: number | null;
  /** The bar's fill 0–1. */
  fill: number;
  /** The countdown (`45s`, `3m`, `1h52`), or null (not timed). */
  text: string | null;
  /** Timed with `warnAt` seconds or less left. */
  ending: boolean;
}

export function stoneState(s: Stone): StoneState {
  return s.expiresAt !== null ? 'timed' : s.tracked ? 'still' : 'untimed';
}

/** A stone at `now`; `warnAt` is the Timers' ending-soon seconds (`timers.warnAt`). */
export function stoneTime(s: Stone, now: number, warnAt: number): StoneTime {
  const state = stoneState(s);
  if (state !== 'timed') return { state, remaining: null, fill: state === 'still' ? 1 : 0, text: null, ending: false };
  const remaining = s.expiresAt! - now;
  const cell = { tracked: true, expiresAt: s.expiresAt, expected: s.expected } as TimerCell;
  return { state, remaining, fill: barPct(cell, now), text: countdownText(remaining / 1000), ending: remaining / 1000 <= warnAt };
}

/** A stone's tooltip at `now`. */
export function stoneTip(s: Stone, now: number, warnAt: number): { title: string; tip: string } {
  const t = stoneTime(s, now, warnAt);
  const lines: string[] = [];
  // The time left and the wounds, nothing else (notes/research/character-tooltips.md
  // T16–T30): the colour, the bar, the ending mark and the × say the rest.
  if (t.state === 'timed') lines.push(`${exactText(t.remaining! / 1000)} left`);
  if (s.about) lines.push(s.about);
  return { title: s.label, tip: lines.join('\n') };
}

// ------------------------------------------------------------------ overflow

/** The `+n` rank: ending soon 0, flags (and your sanctuary) 1, debuffs 2, herblores 3, buffs 4. */
export function stoneRank(s: Stone, now: number, warnAt: number): number {
  return stoneTime(s, now, warnAt).ending ? 0 : KIND_RANK[s.kind];
}

/**
 * Which stones stay when only `cap` fit (ADR 0166 point 120): the most
 * urgent by `stoneRank`, then by time left (untimed last), then the
 * display order. `kept` and `hidden` are both in the display order.
 */
export function keepStones(stones: readonly Stone[], cap: number, now: number, warnAt: number): { kept: Stone[]; hidden: Stone[] } {
  if (stones.length <= cap) return { kept: stones.slice(), hidden: [] };
  const n = Math.max(0, Math.floor(cap));
  const left = (s: Stone): number => (s.expiresAt !== null ? s.expiresAt - now : Infinity);
  const pr = stones
    .map((s, i) => ({ s, i, r: stoneRank(s, now, warnAt), t: left(s) }))
    .sort((a, b) => a.r - b.r || (a.t === b.t ? 0 : a.t < b.t ? -1 : 1) || a.i - b.i);
  const keep = new Set(pr.slice(0, n).map((x) => x.s));
  return { kept: stones.filter((s) => keep.has(s)), hidden: stones.filter((s) => !keep.has(s)) };
}

/** One place in the stones' rows. */
export type StoneEntry = { k: 'add' } | { k: 'stone'; stone: Stone } | { k: 'more'; rest: Stone[] };

/** The pixel sizes of the stones' rows. */
export interface StoneRowsInput {
  /** The room's width, px. */
  width: number;
  /** A stone's icon, px (square). */
  size: number;
  /** Between stones and rows, px (2 in the mockups). */
  gap: number;
  /** The time bar under the icon, px (3 in the mockups). */
  bar: number;
  /** The most rows allowed (≥ 1). */
  rows: number;
  /** The herblore `+` first (`StoneView.canStartHerb`). */
  add: boolean;
}

export interface StoneRows {
  /** The `+`, the stones and the `+n`, in the order drawn (left to right, row by row). */
  entries: StoneEntry[];
  hidden: Stone[];
  /** Places per row (at least 2). */
  per: number;
  /** Rows used (at least 1). */
  rows: number;
  /** Rows all would need. */
  rowsNeed: number;
  /** A stone's height with its bar, px. */
  stoneH: number;
  /** The rows' height, px. */
  height: number;
  /** The width the last row leaves free, px (the purse's room). */
  free: number;
}

/** Places per row: at least 2. */
export function stonesPerRow(width: number, size: number, gap: number): number {
  return Math.max(2, Math.floor((width + gap) / (size + gap)));
}

/** The stones' rows (the mockups' `stonesFit`). Pure. */
export function stoneRows(stones: readonly Stone[], inp: StoneRowsInput, now: number, warnAt: number): StoneRows {
  const { width, size, gap, bar, add } = inp;
  const maxRows = Math.max(1, Math.floor(inp.rows));
  const per = stonesPerRow(width, size, gap);
  const fixed = add ? 1 : 0;
  const need = stones.length + fixed;
  const cap = maxRows * per;
  const entries: StoneEntry[] = add ? [{ k: 'add' }] : [];
  let hidden: Stone[] = [];
  if (need <= cap) for (const stone of stones) entries.push({ k: 'stone', stone });
  else {
    const r = keepStones(stones, cap - fixed - 1, now, warnAt);
    hidden = r.hidden;
    for (const stone of r.kept) entries.push({ k: 'stone', stone });
    entries.push({ k: 'more', rest: hidden });
  }
  const rows = Math.max(1, Math.ceil(entries.length / per));
  const last = entries.length - (rows - 1) * per;
  const stoneH = size + bar;
  return {
    entries,
    hidden,
    per,
    rows,
    rowsNeed: Math.max(1, Math.ceil(need / per)),
    stoneH,
    height: rows * (stoneH + gap) - gap,
    free: Math.max(0, width - last * (size + gap)),
  };
}

// --------------------------------------------------------------------- purse

export interface Purse {
  gold: number;
  silver: number;
  copper: number;
}

/** The pixel sizes of the purse. */
export interface PurseMetrics {
  /** A coin, px. */
  coin: number;
  /** One digit of the purse's font, px. */
  charW: number;
  /** Between a number and its coin, px (2 in the mockups). */
  inner: number;
  /** Between coins, px (6). */
  gap: number;
  /** Kept free between the last stone and the purse, px (6). */
  margin: number;
}

/** The mockups' metrics for stones of `size` px (round 14/15 `purseFit`). */
export function purseMetrics(size: number): PurseMetrics {
  const big = size >= 12;
  const font = big ? 10.5 : 9.5;
  return { coin: big ? 12 : 10, charW: font * 0.6, inner: 2, gap: 6, margin: 6 };
}

const purseValues = (p: Purse): number[] => [p.gold, p.silver, p.copper];

/** The width of the first `n` coins (gold, silver, copper), px. */
export function purseWidth(p: Purse, n: number, m: PurseMetrics): number {
  if (n <= 0) return 0;
  const w = purseValues(p)
    .slice(0, n)
    .reduce((a, v) => a + String(v).length * m.charW + m.inner + m.coin, 0);
  return w + (n - 1) * m.gap;
}

/** The coins shown in `free` px (ADR 0166 point 121): 3 (g+s+c), 2 (g+s), 1 (g) or 0. */
export function purseFit(free: number, p: Purse | null, m: PurseMetrics): 0 | 1 | 2 | 3 {
  if (p === null) return 0;
  for (const n of [3, 2, 1] as const) if (purseWidth(p, n, m) + m.margin <= free) return n;
  return 0;
}

/** The purse's one-line tooltip, the whole purse, only while a coin is hidden (T39–T41); else null. */
export function purseTip(p: Purse, shown: number): string | null {
  return shown < 3 ? `${p.gold} gold, ${p.silver} silver, ${p.copper} copper` : null;
}

// --------------------------------------------------------------- short forms

/** The compact card's hand-made short forms, at most four characters (ADR 0166 point 126). */
export const SHORT_FORMS: Readonly<Record<string, string>> = {
  wimpy: 'wmpy',
  prudent: 'prud',
  normal: 'norm',
  brave: 'brav',
  aggressive: 'aggr',
  berserk: 'bsrk',
  quick: 'qck',
  fast: 'fast',
  careful: 'care',
  thorough: 'thor',
  attentive: 'attn',
  vigilant: 'vigl',
  paranoid: 'para',
  peanuts: 'pnts',
  uncomfortable: 'unc',
  heavy: 'hvy',
  'really heavy': 'rhvy',
  painful: 'pain',
  torture: 'trtr',
};

/** Longer forms tried first, longest first, before the four-character one. */
const LONGER_FORMS: Readonly<Record<string, readonly string[]>> = {
  'really heavy': ['r.heavy', 'r.hvy'],
  uncomfortable: ['uncomf'],
};

/**
 * `word` in at most `maxChars` characters for the compact card: the whole
 * word when it fits, else a hand-made form (`aggr`, `r.hvy`), else the
 * start of the word (an unknown word, or less room than any form).
 */
export function shortForm(word: string, maxChars: number): string {
  const n = Math.floor(maxChars);
  if (n <= 0) return '';
  if (word.length <= n) return word;
  const w = word.toLowerCase();
  for (const f of LONGER_FORMS[w] ?? []) if (f.length <= n) return f;
  const f = SHORT_FORMS[w];
  if (f !== undefined && f.length <= n) return f;
  return (f ?? word).slice(0, n);
}
