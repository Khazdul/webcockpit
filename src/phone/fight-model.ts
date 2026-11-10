// The phone's fight card as data (ADR 0136 §3). Pure: no DOM.
//
// Two names and two bars, nothing else:
// - Left: `You`, or the tank's name when someone else tanks. The bar is
//   that character's HP share: yours from `Char.Vitals` (`hp` / `maxhp`,
//   the band word's midpoint when a number is missing), a group member's
//   from the group model, unknown (null: an empty track) for a tank that
//   is not in the group.
// - Right: the opponent's name. The bar goes in steps from MUME's
//   condition word (`opponent-hits`); an unknown or missing word keeps the
//   last step, and a fight starts at a full bar.
//
// Who tanks and how the opponent is named come from `fightView`
// (src/panes/group-model.ts), the Group pane's own fight card, so the two
// never disagree. No GMCP is parsed here.

import { type GroupFight, type Member, type Vital, vitalPct } from '../gmcp/group';
import { fightView } from '../panes/group-model';
import { GROUP_DARK } from '../panes/palette';

/** The opponent's bar (%) by MUME's condition word, lower case. */
export const FOE_STEPS: Readonly<Record<string, number>> = {
  healthy: 100,
  fine: 85,
  hurt: 65,
  wounded: 45,
  bad: 25,
  awful: 10,
  // Not in ADR 0136's list: MUME's last word before death (src/gmcp/bands.ts).
  dying: 0,
};

/** The bar a fight starts with before a word is known. */
export const FOE_START = 100;

/** The opponent's bar for `word`: its step, or `last` (null: a full bar) for an unknown or missing word. */
export function foeStep(word: string | null, last: number | null): number {
  const key = word === null ? '' : word.trim().toLowerCase();
  // Own keys only: `constructor` and the like are unknown words, not steps.
  const step = Object.hasOwn(FOE_STEPS, key) ? FOE_STEPS[key] : undefined;
  return step ?? last ?? FOE_START;
}

/** Your own hit points as `Char.Vitals` last told them. */
export interface SelfVitals {
  /** `Char.Name`, or null before login. */
  name: string | null;
  hp: number | null;
  maxhp: number | null;
  /** `hp-string`, or null. */
  word: string | null;
}

export interface FightCard {
  /** You or the tank: the name and the HP bar 0–100, or null when unknown. */
  left: { name: string; pct: number | null };
  /** The opponent: the name and the stepped bar 0–100. */
  right: { name: string; pct: number };
}

/** What `fightView` wants of a pane's colours; the card has its own (phone.css). */
const NO_COLORS = { light: false, colors: GROUP_DARK, vitals: { hp: '', mana: '', mp: '' } } as const;

/** A whole percent 0–100 from a share 0–1. */
const pct = (share: number | null): number | null => (share === null ? null : Math.round(share * 100));

/**
 * The fight card, or null when there is no fight. `tankMember` is the
 * group member `f.tankId` names (null: none); `lastStep` the opponent's
 * bar of the card shown before, in the same fight (null: none).
 */
export function fightCard(f: GroupFight, tankMember: Member | null, self: SelfVitals, lastStep: number | null): FightCard | null {
  const v = fightView(f, tankMember, self.name, NO_COLORS);
  if (!v) return null;
  let left: FightCard['left'];
  if (v.tank === null) {
    const own: Vital = { value: self.hp, max: self.maxhp, word: self.word };
    left = { name: 'You', pct: pct(vitalPct('hp', own).pct) };
  } else {
    left = { name: v.tank.name, pct: tankMember ? pct(vitalPct('hp', tankMember.hp).pct) : null };
  }
  return { left, right: { name: v.foe.name, pct: foeStep(v.foe.word, lastStep) } };
}

/** Everything the card draws, as one string: equal signatures, nothing to update. */
export function fightSig(c: FightCard | null): string {
  return c === null ? '' : `${c.left.name}\n${c.left.pct}\n${c.right.name}\n${c.right.pct}`;
}
