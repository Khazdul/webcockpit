// Pane hover buttons (stage 29, ADR 0095): Colour, Border and Background,
// left of the close cross in a pane's title row, shown while the pointer
// is over the pane (layout.css). The cockpit (cockpit.ts `attach`) makes
// them for every pane that has a close cross and settings of its own: not
// on a phone (no cross there), not on temporary script panes (no settings);
// a script pane made with `cross = false` has them hidden with its cross
// (CSS `data-no-cross`).
//
//   framed:      … [Colour][Border][Background][ × ]▕   the last cell is the corner's
//   borderless:  … [Colour][Border][Background][ × ]    the cross at the right edge
//
// (ADR 0095 round 1: on a borderless pane the cross moved to the edge and
// the top row becomes a title bar on hover, the name tag at its left.)
//
// Each button is two cells wide; the cross keeps its three. The icons are
// small inline SVGs in `currentColor` (the cross's colour, the accent on
// hover), not font glyphs, so they look the same in every font the user
// can pick. Each icon shows its state:
//
// - Colour: a muted colour wheel round a dot in the pane's tint (CSS, from
//   `--pane-border`), so the dot tells the tint and the ring the action.
// - Border: an outlined rounded square; with the border off, the same
//   outline dimmed.
// - Background: the border icon's inverse, a filled square. Glass: the
//   square of frosted glass with a sheen across its corner. Clear: a
//   two-by-two checkerboard, the usual sign of "transparent".
//
// Pure helpers here; the cockpit does the DOM wiring and the settings.

import type { PaneLook } from './model';
import type { PaneSettings } from '../settings/types';
import { PANE_TINTS } from '../theme/presets';

/** The buttons from the left, Colour first; the cross comes after them. */
export const PANE_LOOKS: readonly PaneLook[] = ['color', 'border', 'glass'];

/** Cells per button (the cross has three). */
export const LOOK_BUTTON_CELLS = 2;
/** Cells from the pane's right edge to the cross's left edge, framed: the corner cell and the cross. */
export const CROSS_CELLS_FRAMED = 4;
/** … borderless: the cross at the edge (round 1). */
export const CROSS_CELLS_BORDERLESS = 3;

/** The tooltip and aria-label: what the button changes and the state now. */
export function lookLabel(what: PaneLook, p: Readonly<PaneSettings>): string {
  switch (what) {
    case 'color':
      return `Colour: ${PANE_TINTS[p.color].label}`;
    case 'border':
      return `Border: ${p.border ? 'on' : 'off'}`;
    case 'glass':
      return `Background: ${p.glass ? 'glass' : 'clear'}`;
  }
}

/** Whether the button's icon shows its "on" state (Colour: always). */
export function lookOn(what: PaneLook, p: Readonly<PaneSettings>): boolean {
  return what === 'border' ? p.border : what === 'glass' ? p.glass : true;
}

/**
 * How many buttons fit in a pane `paneW` px wide (cells `cellW` px) when
 * everything left of `freeFrom` px (the nameplate, a borderless pane's name
 * tag) must stay uncovered, with half a cell between: 0–3. `crossCells`:
 * from the right edge to the cross's left edge. The buttons go
 * from the left (Colour first), so the ones that stay keep their places
 * beside the cross; the cross always stays.
 */
export function lookButtonsFit(paneW: number, cellW: number, freeFrom: number, crossCells = CROSS_CELLS_FRAMED): number {
  const gap = freeFrom > 0 ? cellW / 2 : 0;
  let n = 0;
  while (n < PANE_LOOKS.length && paneW - (crossCells + LOOK_BUTTON_CELLS * (n + 1)) * cellW >= freeFrom + gap) n++;
  return n;
}

/** The slot from the cross (0: next to it) of button `what`, for its CSS place. */
export function lookSlot(what: PaneLook): number {
  return PANE_LOOKS.length - 1 - PANE_LOOKS.indexOf(what);
}

/**
 * The icon markup (static). viewBox 12 × 12; the rounded square is the
 * same in the Border and Background icons so the two read as a pair.
 */
export const LOOK_ICONS: Readonly<Record<PaneLook, string>> = {
  // The ring and dot are CSS (a conic gradient is not SVG); an empty span.
  color: '<span class="wc-look-wheel"></span>',
  border:
    '<svg viewBox="0 0 12 12" aria-hidden="true">' +
    '<rect class="wc-look-line" x="1.5" y="1.5" width="9" height="9" rx="2.25" fill="none" stroke="currentColor" stroke-width="1.25"/>' +
    '</svg>',
  // No ids (a mask or clip by id would be shared by every pane and break
  // while the first one is hidden): the sheen is two holes in one evenodd
  // path, the checker two quarter paths with the tile's round corners.
  glass:
    '<svg viewBox="0 0 12 12" aria-hidden="true">' +
    '<path class="wc-look-glass" fill="currentColor" fill-rule="evenodd" d="' +
    'M3.5 1h5A2.5 2.5 0 0 1 11 3.5v5A2.5 2.5 0 0 1 8.5 11h-5A2.5 2.5 0 0 1 1 8.5v-5A2.5 2.5 0 0 1 3.5 1z' +
    'M2.2 3.4 3.4 2.2H5L2.2 5zM2.2 6.2 6.2 2.2H7.2L2.2 7.2z"/>' +
    '<g class="wc-look-clear" fill="currentColor">' +
    '<path d="M1 3.5A2.5 2.5 0 0 1 3.5 1H6V6H1z"/><path d="M6 6h5v2.5A2.5 2.5 0 0 1 8.5 11H6z"/>' +
    '<rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1"/>' +
    '</g>' +
    '</svg>',
};
