// The phone's hot keys (ADR 0136 §8): what a key shows, what it sends, and
// what the box that changes it accepts. Pure: no DOM, no import but types.
//
// - A key has a label (one to four characters), and either a command or a
//   special. The command is ONE command, sent as if typed: an alias and a
//   `#` command work as in the command line, but a line the engine would
//   split at its command separator is refused, in the box and again at the
//   press (a stored value from elsewhere): one tap never fans out into
//   several commands (ADR 0136 "Consequences"). The split is the engine's
//   own, handed in (`Split`; the kit's `splitCommands`).
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

export const HOTKEY_COUNT = 3;
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
  /** The box's chip and the token in its Command field. */
  text: string;
  /** For the key's accessible name. */
  spoken: string;
}

export const HOTKEY_SPECIALS: readonly HotkeySpecial[] = [
  { id: 'wimpy50', share: 0.5, text: 'wimpy 50 % of current HP', spoken: 'wimpy at half of current HP' },
  { id: 'wimpy25', share: 0.25, text: 'wimpy 25 % of current HP', spoken: 'wimpy at a quarter of current HP' },
];

export const NOTICE_MANY = 'Hot key: one command per key, so nothing was sent. Use an alias for more.';
export const ERROR_MANY = 'One command per key. Use an alias for more.';
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

/** A typed line as the engine's commands (the kit's `splitCommands`). */
export type Split = (text: string) => string[];

/** True when the engine would run `command` as more than one command. */
export function manyCommands(command: string, split: Split): boolean {
  return split(command).length > 1;
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
export function hotkeyPress(key: PhoneHotkey, hp: number | null, split: Split): HotkeyPress {
  if (key.special !== null) {
    const n = wimpyValue(hp, special(key.special).share);
    if (n !== null) return { kind: 'send', command: `change wimpy ${n}` };
    return { kind: 'notice', text: hp === null ? NOTICE_HP_UNKNOWN : NOTICE_HP_ZERO };
  }
  const command = cleanCommand(key.command);
  if (command === '') return { kind: 'none' };
  // Never several commands from one tap, whatever was stored.
  if (manyCommands(command, split)) return { kind: 'notice', text: NOTICE_MANY };
  return { kind: 'send', command };
}

/** The box's line on what the draft would send: a snapshot (the hit points of when it was written). */
export function sendsNow(key: Pick<PhoneHotkey, 'command' | 'special'>, hp: number | null, split: Split): string {
  const p = hotkeyPress({ label: '', shown: true, command: key.command, special: key.special }, hp, split);
  if (p.kind === 'send') return `Would send now: ${p.command}`;
  if (p.kind === 'none') return 'Would send nothing: no command yet';
  if (key.special === null) return 'Would send nothing: more than one command';
  return hp === null ? 'Would send nothing now: hit points not known' : 'Would send nothing now: no hit points';
}

/** The key's accessible name: `K2: bash`, `K3: wimpy at half of current HP`. */
export function hotkeyName(index: number, key: PhoneHotkey): string {
  return `K${index + 1}: ${key.special !== null ? special(key.special).spoken : cleanCommand(key.command)}`;
}

/** The slots of the keys in the column, top to bottom (K1 lowest). */
export function columnKeys(keys: readonly PhoneHotkey[]): number[] {
  const out: number[] = [];
  for (let i = Math.min(keys.length, HOTKEY_COUNT) - 1; i >= 0; i--) if (keys[i]!.shown) out.push(i);
  return out;
}

export type HotkeyCheck = { ok: true; key: PhoneHotkey } | { ok: false; error: string };

/**
 * A draft from the box as the key to store, or why not. A special wins over
 * the command text; a command is one command (`split`); an empty label
 * becomes the command's short form.
 */
export function checkHotkey(draft: PhoneHotkey, split: Split): HotkeyCheck {
  const sp = draft.special !== null && HOTKEY_SPECIALS.some((s) => s.id === draft.special) ? draft.special : null;
  const command = sp === null ? cleanCommand(draft.command) : '';
  if (sp === null && command === '') return { ok: false, error: 'Give the key a command, or pick one.' };
  if (sp === null && manyCommands(command, split)) return { ok: false, error: ERROR_MANY };
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

/** The keys with slot `index` replaced (always a full list, for the settings). */
export function withHotkey(keys: readonly PhoneHotkey[], index: number, key: PhoneHotkey): PhoneHotkey[] {
  return keys.map((k, i) => (i === index ? key : { ...k }));
}
