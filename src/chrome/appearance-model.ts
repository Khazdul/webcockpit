// The Appearance settings' pure helpers (Inv §3.7, ADR 0107): what the
// Settings popup's Appearance tab (popups/settings-popup.tsx) shows besides
// its controls. No UI here.
//
// - The cycle list of a colour: the presets, with an off-palette value kept
//   first.
// - `20 000` and `#rrggbb` formatting and parsing.
// - The live preview's sample lines.

import type { NamedColor } from '../theme/presets';

/** Cycle list for a colour: the presets, with an off-palette value first. */
export function colorChoices(presets: readonly NamedColor[], cur: string): string[] {
  const hexes = presets.map((p) => p.hex);
  return hexes.includes(cur.toLowerCase()) ? hexes : [cur.toLowerCase(), ...hexes];
}

/** `20000` → `20 000`. */
export function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+$)/g, ' ');
}

/** `#rgb`, `#rrggbb` or without `#` → `#rrggbb`, else null. */
export function parseHex(s: string): string | null {
  const t = s.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{6}$/.test(t)) return '#' + t;
  if (/^[0-9a-f]{3}$/.test(t)) return '#' + [...t].map((c) => c + c).join('');
  return null;
}

/**
 * Preview lines and their colour (a palette index, or null for the font
 * colour). `bold` makes the first that many characters bold, drawn with the
 * renderer's classes so "Bold brightens colours" (ADR 0060) shows on them.
 */
export type PreviewLine = readonly [text: string, ansi: number | null, bold?: number];
export const PREVIEW: readonly PreviewLine[] = [
  ['A Quiet Glade', 2],
  ['Tall beeches ring a mossy clearing. A thin', null],
  ['stream winds south and vanishes into the ferns.', null],
  ['Exits: north, south.', null],
];
/** Then a game prompt and an echoed command (the input colour). */
export const PREVIEW_PROMPT = '*> ';
export const PREVIEW_ECHO = 'north';
/** The last lines: what happens after the command, in palette colours. */
export const PREVIEW_AFTER: readonly PreviewLine[] = [
  ['A grey-haired elf shrugs indifferently.', 6],
  ['The gate magically opens for you.', 5],
  ['A mother wolf hits your right hand and tickles it.', 1],
  // An enemy as MUME shows one in the room, the name bold red.
  ['*an Orc*, wielding a scimitar, is standing here.', null, 8],
  ["Elrond narrates 'The road goes ever on and on.'", 3],
];
