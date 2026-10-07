// The map's background colour (ADR 0085, Options → Mapper "Background").
//
// `mapper.background` is a `#rrggbb` string. The list below is what ←→
// cycles and the picker offers; any other valid hex can be typed. The
// default is MMapper's (the owner's config), first in the list. The
// worker clears to it and fades the layers below the player's into it;
// the pane's CSS background (shown before the first frame) follows too.

import { normalizeHex } from '../theme/color';
import type { NamedColor } from '../theme/presets';

/** MMapper's background (owner config `#2e3436`), the default. */
export const MAP_BG_DEFAULT = '#2e3436';

/**
 * Named choices, darkest-first after the default. All dark enough that
 * the white connection lines, the infomark text and the tiles' edges
 * keep reading on them (no automatic contrast; ADR 0085).
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
];

/** The list name for `hex`, or the hex itself for a typed colour. */
export function mapBgName(hex: string): string {
  const h = hex.toLowerCase();
  return MAP_BACKGROUNDS.find((c) => c.hex === h)?.name ?? h;
}

/** What ←→ cycles through: the list, with a typed colour first. */
export function mapBgChoices(cur: string): string[] {
  const hexes = MAP_BACKGROUNDS.map((c) => c.hex);
  const h = cur.toLowerCase();
  return hexes.includes(h) ? hexes : [h, ...hexes];
}

/** A typed colour code as `#rrggbb` (`#rgb` and a missing `#` are fine), or null. */
export function parseMapBg(s: string): string | null {
  return normalizeHex(s.trim());
}

