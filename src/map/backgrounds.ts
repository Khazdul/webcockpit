// The map's background colour (ADR 0085, Options → Mapper "Background
// colour" and "Background colour code").
//
// `mapper.background` is a `#rrggbb` string. The list below is what ←→
// cycles on the named row; any other valid hex can be typed on the code
// row (remembered in `mapper.backgroundCode`). The
// default is MMapper's (the owner's config), first in the list. The
// worker clears to it and fades the layers below the player's into it;
// the pane's CSS background (shown before the first frame) follows too.

import { normalizeHex, takesDarkInk } from '../theme/color';
import type { NamedColor } from '../theme/presets';

/** MMapper's background (owner config `#2e3436`), the default. */
export const MAP_BG_DEFAULT = '#2e3436';

/**
 * "Dark paper": a shade darker than the Appearance `paper` background
 * (#f4ecd8), the one light choice (ADR 0085 addendum).
 */
export const MAP_BG_DARK_PAPER = '#e8dfc8';

/**
 * Named choices after the default. The dark ones keep the white
 * connection lines, the infomark text and the tiles' edges reading
 * (ADR 0085); on Dark paper, a light colour, the renderer draws the
 * connection and infomark lines dark instead (ADR 0085 addendum).
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
];

/** Whether `hex` is one of the named choices. */
export function isNamedMapBg(hex: string): boolean {
  const h = hex.toLowerCase();
  return MAP_BACKGROUNDS.some((c) => c.hex === h);
}

/** Whether the map draws dark lines on `hex` (ADR 0085 addendum; as the renderer decides). */
export function mapBgIsLight(hex: string): boolean {
  return takesDarkInk(normalizeHex(hex) ?? MAP_BG_DEFAULT);
}

/** The list name for `hex`, or the hex itself for a typed colour. */
export function mapBgName(hex: string): string {
  const h = hex.toLowerCase();
  return MAP_BACKGROUNDS.find((c) => c.hex === h)?.name ?? h;
}

/** A typed colour code as `#rrggbb` (`#rgb` and a missing `#` are fine), or null. */
export function parseMapBg(s: string): string | null {
  return normalizeHex(s.trim());
}

