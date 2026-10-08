// The map's background colour (ADR 0085 and its addenda, Options → Mapper
// "Background colour").
//
// `mapper.background` is a `#rrggbb` string, one of the list below, which
// is what ←→ cycles (typed codes were removed in stage 25 round 3). The
// default is MMapper's (the owner's config), first in the list. The
// worker clears to it and fades the layers below the player's into it;
// the pane's CSS background (shown before the first frame) follows too.

import { normalizeHex, takesDarkInk } from '../theme/color';
import type { NamedColor } from '../theme/presets';

/** MMapper's background (owner config `#2e3436`), the default. */
export const MAP_BG_DEFAULT = '#2e3436';

/**
 * "Dark paper": a shade darker than the Appearance `paper` background
 * (#f4ecd8), a light choice like White (ADR 0085 addenda).
 */
export const MAP_BG_DARK_PAPER = '#e8dfc8';

/**
 * "Transparent" (ADR 0085 addendum): the map draws on the Map pane's own
 * background, the terminal background or the pane's tint. Not a colour:
 * the pane resolves it (`mapBgEffective`) before the worker sees it, so
 * the lower-layer fade and the light-background lines work as for any
 * colour.
 */
export const MAP_BG_TRANSPARENT = 'transparent';

/**
 * Named choices after the default. The dark ones keep the white
 * connection lines, the infomark text and the tiles' edges reading
 * (ADR 0085); on the light ones at the end (Dark paper, White) the
 * renderer draws the connection and infomark lines dark instead (ADR 0085
 * addenda).
 */
export const MAP_BACKGROUNDS: readonly NamedColor[] = [
  { name: 'Default', hex: MAP_BG_DEFAULT },
  { name: 'Black', hex: '#000000' },
  { name: 'Dark grey', hex: '#1c1c1c' },
  { name: 'Grey', hex: '#4e4e4e' },
  { name: 'Navy', hex: '#101c3c' },
  { name: 'Dark blue', hex: '#0e141c' },
  { name: 'Dark teal', hex: '#0f2e2e' },
  { name: 'Dark green', hex: '#13261a' },
  { name: 'Olive', hex: '#2e2e1a' },
  { name: 'Dark brown', hex: '#2b1d12' },
  { name: 'Maroon', hex: '#2e1214' },
  { name: 'Dark purple', hex: '#22162e' },
  { name: 'Dark paper', hex: MAP_BG_DARK_PAPER },
  { name: 'White', hex: '#ffffff' },
  { name: 'Transparent', hex: MAP_BG_TRANSPARENT },
];

/** Whether `hex` is one of the named choices. */
export function isNamedMapBg(hex: string): boolean {
  const h = hex.toLowerCase();
  return MAP_BACKGROUNDS.some((c) => c.hex === h);
}

/** The colour the map draws on: `bg`, or `paneBg` (`#rrggbb`) for Transparent. */
export function mapBgEffective(bg: string, paneBg: string): string {
  return bg === MAP_BG_TRANSPARENT ? paneBg : bg;
}

/** Whether the map draws dark lines on `hex` (ADR 0085 addendum; as the renderer decides). */
export function mapBgIsLight(hex: string): boolean {
  return takesDarkInk(normalizeHex(hex) ?? MAP_BG_DEFAULT);
}

/** The list name for `hex`, or the hex itself for one not in the list. */
export function mapBgName(hex: string): string {
  const h = hex.toLowerCase();
  return MAP_BACKGROUNDS.find((c) => c.hex === h)?.name ?? h;
}
