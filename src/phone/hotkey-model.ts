// The phone's hot keys (ADR 0136 §8): what a key shows, what it sends, and
// what the box that changes it accepts. Pure: no DOM, no import but types.
//
// - A key has a label (one to four characters), and either a command or a
//   special. The command is a line sent as if typed in the command line:
//   an alias and a `#` command work, and a line with the command separator
//   (`stand;bash`) is several commands, split by the engine as a typed line
//   is (the owner's decision in stage 52; it replaces ADR 0136 §8 "one
//   command per key").
// - Six slots are stored (K1 to K6); the first `count` (1 to 6, a setting)
//   are in use. They stand in columns of three from the right edge: K1 to
//   K3 in the first, K4 to K6 in a second one left of it, the lowest
//   number lowest.
// - A special is computed at the press: wimpy at a share of the CURRENT
//   hit points (`Char.Vitals` `hp`, not `maxhp`), sent as
//   `change wimpy <floor(hp × share)>`.
//     · Hit points unknown (no `Char.Vitals` with `hp` yet): nothing is
//       sent and the player is told.
//     · Hit points at 0 or below (stunned, dying): nothing is sent and the
//       player is told. No share of that is a wimpy worth setting.
//     · The value is never 0: `change wimpy 0` turns wimpy OFF in MUME, the
//       opposite of what a wimpy key is pressed for. With 1 hit point (half
//       of it floors to 0) and with 2 or 3 at a quarter the key sends 1.
// - The limits repeat src/settings/types.ts (`PHONE_HOTKEY_*`), which this
//   chunk may not import as values (kit.ts); a unit test holds them equal.

import type { PhoneHotkey, PhoneHotkeySpecial } from '../settings/types';

/** The stored slots, and how many stand in one column. */
export const HOTKEY_COUNT = 6;
export const HOTKEY_COLUMN = 3;
export const HOTKEY_LABEL_MAX = 4;
export const HOTKEY_COMMAND_MAX = 200;
/** A press held this long opens the key's box instead of sending. */
export const HOTKEY_HOLD_MS = 500;
/** A finger that moved further than this from where it pressed is no tap and no hold. */
export const HOTKEY_SLOP_PX = 12;

/** The quick picks, in the box's order. "look" is never one (the compass has the eye). */
export const HOTKEY_PICKS = ['assist', 'bash', 'rescue', 'shoot', 'recover'] as const;

export interface HotkeySpecial {
  id: PhoneHotkeySpecial;
  /** The share of the current hit points. */
  share: number;
  /** What it is, in full (the accessible name of the box's chip and of the token in its Command field). */
  text: string;
  /** The same on the chip and the token themselves, which have little width. */
  short: string;
  /** For the key's accessible name. */
  spoken: string;
}

export const HOTKEY_SPECIALS: readonly HotkeySpecial[] = [
  { id: 'wimpy50', share: 0.5, text: 'wimpy 50 % of current HP', short: 'wimpy 50 % HP', spoken: 'wimpy at half of current HP' },
  { id: 'wimpy25', share: 0.25, text: 'wimpy 25 % of current HP', short: 'wimpy 25 % HP', spoken: 'wimpy at a quarter of current HP' },
];

export const NOTICE_HP_UNKNOWN = 'Hot key: your hit points are not known yet, so no wimpy was set.';
export const NOTICE_HP_ZERO = 'Hot key: you have no hit points to take a share of, so no wimpy was set.';

const special = (id: PhoneHotkeySpecial): HotkeySpecial => HOTKEY_SPECIALS.find((s) => s.id === id) ?? HOTKEY_SPECIALS[0]!;

/** `Char.Vitals` `hp` as a number, or null (absent, not a number). */
export function knownHp(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * The wimpy for `share` of `hp` current hit points: `floor(hp × share)`, at
 * least 1; null when there is nothing to send (hp unknown, or 0 and below).
 */
export function wimpyValue(hp: number | null, share: number): number | null {
  if (hp === null || !Number.isFinite(hp) || hp <= 0) return null;
  return Math.max(1, Math.floor(hp * share));
}

/**
 * The characters of `text` as a reader counts them: grapheme clusters
 * where the browser can tell (`Intl.Segmenter`: an emoji with its joiners,
 * a letter with its combining mark, are one), else code points.
 * src/settings/migrate.ts has the same for stored labels.
 */
export function characters(text: string): string[] {
  const Seg = (Intl as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter;
  if (!Seg) return [...text];
  return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment);
}

/** A label as stored: single spaces, trimmed, at most four characters. */
export function cleanLabel(text: string): string {
  return characters(text.replace(/\s+/g, ' ').trim()).slice(0, HOTKEY_LABEL_MAX).join('').trim();
}

/** A label while it is typed: as `cleanLabel`, but a space being typed inside it is not taken away. */
export function typedLabel(text: string): string {
  return characters(text.replace(/\s+/g, ' ').trimStart()).slice(0, HOTKEY_LABEL_MAX).join('');
}

/** A command as stored: one line, trimmed, within the length limit. */
export function cleanCommand(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').trim().slice(0, HOTKEY_COMMAND_MAX);
}

const AUTO: Readonly<Record<string, string>> = { assist: 'asst', bash: 'bash', rescue: 'resc', shoot: 'shot', recover: 'rcvr' };

/** The label a command or special gets when the player gave none: a known short form, else the first word's start. */
export function autoLabel(command: string, sp: PhoneHotkeySpecial | null): string {
  if (sp !== null) return 'wimp';
  const word = cleanCommand(command).replace(/^[^\p{L}\p{N}]+/u, '').split(/[\s;]/)[0] ?? '';
  return AUTO[word.toLowerCase()] ?? cleanLabel(word);
}

/** What a press of the key does now. */
export type HotkeyPress = { kind: 'send'; command: string } | { kind: 'notice'; text: string } | { kind: 'none' };

/** What `key` does with `hp` current hit points (null: unknown). */
export function hotkeyPress(key: PhoneHotkey, hp: number | null): HotkeyPress {
  if (key.special !== null) {
    const n = wimpyValue(hp, special(key.special).share);
    if (n !== null) return { kind: 'send', command: `change wimpy ${n}` };
    return { kind: 'notice', text: hp === null ? NOTICE_HP_UNKNOWN : NOTICE_HP_ZERO };
  }
  const command = cleanCommand(key.command);
  if (command === '') return { kind: 'none' };
  // As typed: the engine splits a line of several commands itself.
  return { kind: 'send', command };
}

/** The box's line on what the draft would send: a snapshot (the hit points of when it was written). */
export function sendsNow(key: Pick<PhoneHotkey, 'command' | 'special'>, hp: number | null): string {
  const p = hotkeyPress({ label: '', shown: true, command: key.command, special: key.special }, hp);
  if (p.kind === 'send') return `Would send now: ${p.command}`;
  if (p.kind === 'none') return 'Would send nothing: no command yet';
  return hp === null ? 'Would send nothing now: hit points not known' : 'Would send nothing now: no hit points';
}

/** The key's accessible name: `K2: bash`, `K3: wimpy at half of current HP`. */
export function hotkeyName(index: number, key: PhoneHotkey): string {
  return `K${index + 1}: ${key.special !== null ? special(key.special).spoken : cleanCommand(key.command)}`;
}

/** How many slots are in use for a stored count: a whole number from 1 to `HOTKEY_COUNT` (anything else: one column). */
export function hotkeyCount(count: unknown): number {
  return typeof count === 'number' && Number.isFinite(count) ? Math.max(1, Math.min(HOTKEY_COUNT, Math.floor(count))) : HOTKEY_COLUMN;
}

/** One step (−1 or +1) from a count, within 1 to `HOTKEY_COUNT`. */
export function stepHotkeyCount(count: number, d: number): number {
  return hotkeyCount(hotkeyCount(count) + Math.sign(d));
}

/**
 * The shown keys among the first `count` slots, as columns from the right
 * edge: `[first, second]`, each the slots top to bottom (the lowest number
 * lowest; a hidden key leaves no hole). The first column is K1 to K3, the
 * second K4 to K6; a column without a shown key is empty.
 */
export function hotkeyColumns(keys: readonly PhoneHotkey[], count: number): number[][] {
  const n = Math.min(keys.length, hotkeyCount(count));
  const cols: number[][] = [[], []];
  for (let i = n - 1; i >= 0; i--) if (keys[i]!.shown) cols[Math.floor(i / HOTKEY_COLUMN)]!.push(i);
  return cols;
}

export type HotkeyCheck = { ok: true; key: PhoneHotkey } | { ok: false; error: string };

/**
 * A draft from the box as the key to store, or why not. A special wins over
 * the command text; an empty label becomes the command's short form.
 */
export function checkHotkey(draft: PhoneHotkey): HotkeyCheck {
  const sp = draft.special !== null && HOTKEY_SPECIALS.some((s) => s.id === draft.special) ? draft.special : null;
  const command = sp === null ? cleanCommand(draft.command) : '';
  if (sp === null && command === '') return { ok: false, error: 'Give the key a command, or pick one.' };
  const label = cleanLabel(draft.label) || autoLabel(command, sp);
  if (label === '') return { ok: false, error: 'Give the key a label.' };
  return { ok: true, key: { label, command, special: sp, shown: draft.shown === true } };
}

/**
 * The draft after a quick pick or a special was chosen. The label follows
 * while it is still the short form of what the key had (or empty): a label
 * the player wrote is kept.
 */
export function pickHotkey(draft: PhoneHotkey, pick: { command: string } | { special: PhoneHotkeySpecial }): PhoneHotkey {
  const follows = cleanLabel(draft.label) === '' || cleanLabel(draft.label) === autoLabel(draft.command, draft.special);
  const next: PhoneHotkey = 'special' in pick ? { ...draft, command: '', special: pick.special } : { ...draft, command: pick.command, special: null };
  return follows ? { ...next, label: autoLabel(next.command, next.special) } : next;
}

/**
 * Enter in one of the box's two fields: from the Label on to the Command
 * field while that one is still to be written (Custom starts there);
 * anywhere else Enter saves. A special has no Command field.
 */
export function enterGoesToCommand(field: 'label' | 'command', draft: Pick<PhoneHotkey, 'command' | 'special'>): boolean {
  return field === 'label' && draft.special === null && cleanCommand(draft.command) === '';
}

/** Where a scrolling part has more than it shows: above, below (a pixel of rounding is no more). */
export function scrollMore(top: number, shown: number, all: number): { up: boolean; down: boolean } {
  return { up: top > 1, down: all - shown - top > 1 };
}

/** The keys with slot `index` replaced (always a full list, for the settings). */
export function withHotkey(keys: readonly PhoneHotkey[], index: number, key: PhoneHotkey): PhoneHotkey[] {
  return keys.map((k, i) => (i === index ? key : { ...k }));
}
