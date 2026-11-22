// Character state from GMCP `Char.*` (Inv §2.2, §8.2). Pure TS, no DOM.
//
// - `Char.Name {name, fullname}`: the character. A different name starts a
//   new session (the XP/TP session anchors are dropped).
// - `Char.StatusVars`: race and subrace (TP scaling; the race line, race.ts),
//   level (fallback only), names.
// - `Char.Vitals`: a flat object merged key by key. A key that is absent
//   keeps its value; JSON `null` sets it to null ("off" for the toggles).
//   `wimpy` is also set from the text lines `Wimpy set to: N` /
//   `Wimpy removed.` (system rules, `setWimpy`). A mood that becomes
//   berserk sets it to 0: MUME does that without a line (`help mood`), and
//   it stays 0 when the mood changes again.
// - Exact or band, per bar (stage 77 decision 11, ADR 0166 addendum part B;
//   bands.ts): `exact` is "this bar's last update was a number". A message
//   with a numeric `hp` is exact, also with `hp-string` beside it; with
//   only `hp-string` it is band; with neither it stays; a null `hp` is not
//   exact. The merged values cannot tell this (the same word again after a
//   number, the same number again after a word), so it is state of its own
//   and its flip is a change. Excluded state folding keeps it
//   (src/share/fold.ts).
//
// Session anchors: the first `xp` / `tp` seen after `reset()` or a new
// character is the session start; the bars split there (levels.ts).
// `reset()` (a new connection, a live disconnect) clears everything, so the
// pane starts from `—` until GMCP arrives (Inv §2.1 "Inactive panes").

import { type VitalKind, VITAL_KINDS } from './bands';
import { type SessionBar, levelFromXp, tpBar, xpBar } from './levels';
import { raceLine } from './race';

export type Toggle = 'sneak' | 'ride' | 'climb' | 'swim';
export const TOGGLES: readonly Toggle[] = ['sneak', 'ride', 'climb', 'swim'];

/** Gauge steps, low → high (Inv §2.2 "Rows 4–9"). */
export const MOOD_STEPS: readonly string[] = ['wimpy', 'prudent', 'normal', 'brave', 'aggressive', 'berserk'];
export const ALERTNESS_STEPS: readonly string[] = ['normal', 'careful', 'attentive', 'vigilant', 'paranoid'];
export const POSITION_STEPS: readonly string[] = ['sleeping', 'resting', 'sitting', 'standing'];
/** `spell-effort`: the steps of `change spellcasting`, in the menu's order (stage 77 part A). */
export const SPELL_EFFORT_STEPS: readonly string[] = ['quick', 'fast', 'normal', 'careful', 'thorough'];
/** `carrying`, light → heavy: the six words measured live (stage 77 part A). */
export const CARRYING_STEPS: readonly string[] = ['peanuts', 'uncomfortable', 'heavy', 'really heavy', 'painful', 'torture'];

/** The keys of a bar in `Char.Vitals`. */
const VITAL_KEYS: Readonly<Record<VitalKind, { word: string; max: string }>> = {
  hp: { word: 'hp-string', max: 'maxhp' },
  mana: { word: 'mana-string', max: 'maxmana' },
  mp: { word: 'mp-string', max: 'maxmp' },
};

/** One bar. */
export interface CharVital {
  /** The last number: old when not `exact`. */
  value: number | null;
  max: number | null;
  /** The last band word, lower case: may be old when `exact`. */
  word: string | null;
  /** The bar's last update was a number. */
  exact: boolean;
}

/** What the Character pane draws. */
export interface CharView {
  /** Capitalised `Char.Name` name, or null when unknown. */
  name: string | null;
  /** Level from XP (StatusVars level when XP is unknown), or null. */
  level: number | null;
  /** XP bar through the level, or null while XP is unknown. */
  xp: SessionBar | null;
  /** TP bar through the level, or null while XP or TP is unknown. */
  tp: SessionBar | null;
  toggles: Record<Toggle, boolean>;
  /** Lower-case values, or null when unknown. */
  mood: string | null;
  alertness: string | null;
  position: string | null;
  wimpy: number | null;
  maxhp: number | null;
  /** One of `SPELL_EFFORT_STEPS`, or an unknown word as sent; null when unknown. */
  spellEffort: string | null;
  /** The word as sent and its index in `CARRYING_STEPS` (null: an unknown word). */
  carrying: { word: string; step: number | null } | null;
  race: string | null;
  subrace: string | null;
  /** What the card writes as the race (decision 18, race.ts), or null. */
  raceLine: string | null;
  vitals: Record<VitalKind, CharVital>;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const lower = (v: unknown): string | null => {
  const s = str(v)?.trim();
  return s ? s.toLowerCase() : null;
};

const sent = (v: unknown): string | null => str(v)?.trim() || null;

/** A word of `steps` in their spelling, another one as sent. */
function stepWord(v: unknown, steps: readonly string[]): string | null {
  const s = sent(v);
  if (s === null) return null;
  const l = s.toLowerCase();
  return steps.includes(l) ? l : s;
}

function carryingOf(v: unknown): CharView['carrying'] {
  const word = sent(v);
  if (word === null) return null;
  const step = CARRYING_STEPS.indexOf(word.toLowerCase());
  return { word, step: step < 0 ? null : step };
}

/** `rasta` → `Rasta`. */
export const capitalise = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export class CharModel {
  /** `Char.Name` name as sent, or null. */
  name: string | null = null;
  fullname: string | null = null;
  /** `Char.StatusVars`, merged (absent keys keep their value). */
  readonly statusVars: Map<string, unknown> = new Map();
  /** `Char.Vitals`, merged; a present `null` is kept as null. */
  readonly vitals: Map<string, unknown> = new Map();
  /** XP / TP at session start, or null before the first value. */
  anchorXp: number | null = null;
  anchorTp: number | null = null;
  /** Per bar: the last update was a number (see the file header). */
  readonly exact: Record<VitalKind, boolean> = { hp: false, mana: false, mp: false };
  /** The race line, worked out when StatusVars change: `view` runs each frame. */
  private line: string | null = null;
  /** Bumped on every change (renderers may compare). */
  version = 0;

  /**
   * Applies one GMCP message (`pkg` as sent, matched case-insensitively).
   * Returns true when the state changed.
   */
  apply(pkg: string, data: unknown): boolean {
    switch (pkg.toLowerCase()) {
      case 'char.name':
        return this.applyName(data);
      case 'char.statusvars': {
        const changed = this.merge(this.statusVars, data);
        if (changed) this.line = raceLine(str(this.statusVars.get('race')), str(this.statusVars.get('subrace')));
        return changed;
      }
      case 'char.vitals': {
        const wasBerserk = this.berserk();
        const changed = this.merge(this.vitals, data);
        if (!wasBerserk && this.berserk()) this.setWimpy(0);
        const flipped = this.noteExact(data);
        if (flipped && !changed) this.version++;
        this.anchor();
        return changed || flipped;
      }
    }
    return false;
  }

  private applyName(data: unknown): boolean {
    if (!isObj(data)) return false;
    const name = str(data.name);
    const fullname = str(data.fullname);
    if (name !== null && this.name !== null && name.toLowerCase() !== this.name.toLowerCase()) {
      // Another character on this connection: a new session.
      this.clearState();
    }
    if (name !== null) this.name = name;
    if (fullname !== null) this.fullname = fullname;
    this.version++;
    return true;
  }

  private merge(into: Map<string, unknown>, data: unknown): boolean {
    if (!isObj(data)) return false;
    let changed = false;
    for (const [k, v] of Object.entries(data)) {
      if (into.has(k) && Object.is(into.get(k), v)) continue;
      into.set(k, v);
      changed = true;
    }
    if (changed) this.version++;
    return changed;
  }

  private berserk(): boolean {
    return lower(this.vitals.get('mood')) === 'berserk';
  }

  /** Exact or band from one message; true when a bar flipped. */
  private noteExact(data: unknown): boolean {
    if (!isObj(data)) return false;
    let flipped = false;
    for (const k of VITAL_KINDS) {
      let exact: boolean;
      if (Object.hasOwn(data, k)) exact = num(data[k]) !== null;
      else if (Object.hasOwn(data, VITAL_KEYS[k].word)) exact = false;
      else continue;
      if (this.exact[k] === exact) continue;
      this.exact[k] = exact;
      flipped = true;
    }
    return flipped;
  }

  private anchor(): void {
    if (this.anchorXp === null) this.anchorXp = num(this.vitals.get('xp'));
    if (this.anchorTp === null) this.anchorTp = num(this.vitals.get('tp'));
  }

  /** Wimpy from the text lines (`Wimpy removed.` is 0). */
  setWimpy(n: number | null): boolean {
    if (this.vitals.get('wimpy') === n) return false;
    this.vitals.set('wimpy', n);
    this.version++;
    return true;
  }

  /** Forgets everything (new connection, live disconnect). */
  reset(): void {
    this.name = null;
    this.fullname = null;
    this.clearState();
    this.version++;
  }

  /** All that belongs to one character's session. */
  private clearState(): void {
    this.statusVars.clear();
    this.vitals.clear();
    this.anchorXp = null;
    this.anchorTp = null;
    for (const k of VITAL_KINDS) this.exact[k] = false;
    this.line = null;
  }

  private vitalView(kind: VitalKind): CharVital {
    const v = this.vitals;
    const keys = VITAL_KEYS[kind];
    return { value: num(v.get(kind)), max: num(v.get(keys.max)), word: lower(v.get(keys.word)), exact: this.exact[kind] };
  }

  /** The derived view for the pane. */
  view(): CharView {
    const v = this.vitals;
    const xp = num(v.get('xp'));
    const tp = num(v.get('tp'));
    const race = str(this.statusVars.get('race'));
    const level = xp !== null ? levelFromXp(xp) : num(this.statusVars.get('level'));
    return {
      name: this.name ? capitalise(this.name) : null,
      level,
      xp: xp !== null ? xpBar(xp, this.anchorXp) : null,
      tp: xp !== null && tp !== null ? tpBar(xp, tp, this.anchorTp, race) : null,
      toggles: {
        sneak: isFlag(v.get('sneak'), 's'),
        ride: isOn(v.get('ride')),
        climb: isFlag(v.get('climb'), 'c'),
        swim: v.get('swim') === true,
      },
      mood: lower(v.get('mood')),
      alertness: lower(v.get('alertness')),
      position: lower(v.get('position')),
      wimpy: num(v.get('wimpy')),
      maxhp: num(v.get('maxhp')),
      spellEffort: stepWord(v.get('spell-effort'), SPELL_EFFORT_STEPS),
      carrying: carryingOf(v.get('carrying')),
      race: sent(race),
      subrace: sent(this.statusVars.get('subrace')),
      raceLine: this.line,
      vitals: { hp: this.vitalView('hp'), mana: this.vitalView('mana'), mp: this.vitalView('mp') },
    };
  }
}

/** `s`/`S` (sneak) or `c`/`C` (climb) → on; null, absent, anything else → off. */
function isFlag(v: unknown, letter: string): boolean {
  return typeof v === 'string' && v.toLowerCase() === letter;
}

/** Truthy → on (ride: a mount name or true); null, false, '', 0 → off. */
function isOn(v: unknown): boolean {
  return v !== null && v !== undefined && v !== false && v !== '' && v !== 0;
}
