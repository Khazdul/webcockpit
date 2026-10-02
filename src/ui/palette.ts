// Colour palette for the output pane (Inv §1.1, spec §2.3).
//
// - 0–15: the user's ANSI palette (default: Cockpit's "DOS palette",
//   src/theme/presets.ts). Rendered with classes (`wc-f<n>` / `wc-b<n>`)
//   that read the CSS custom properties `--ansi-0` … `--ansi-15`, which
//   src/theme/apply.ts sets from the settings, so a palette change never
//   touches the renderer or the rows already on screen.
// - 16–255: the standard xterm 6×6×6 cube and 24-step grey ramp. Rendered
//   as inline style (rare in MUME output).
// - Truecolor (`TRUECOLOR | 0xRRGGBB`): inline style.
// - Bold (`wc-bold`) keeps the colour index; whether it brightens is the
//   "Bold brightens colours" setting, applied in CSS through the --bold-*
//   tokens (ADR 0060). A bold run in the default foreground gets `wc-fbd`,
//   an inverse run `wc-inv`.

import { type Color, isTrueColor } from '../core/types';
import { DOS_PALETTE } from '../theme/presets';

const CUBE_STEPS = [0x00, 0x5f, 0x87, 0xaf, 0xd7, 0xff];

function hex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}

function buildXterm256(): string[] {
  const out = DOS_PALETTE.slice();
  for (let i = 16; i < 232; i++) {
    const n = i - 16;
    const r = CUBE_STEPS[Math.floor(n / 36)]!;
    const g = CUBE_STEPS[Math.floor(n / 6) % 6]!;
    const b = CUBE_STEPS[n % 6]!;
    out.push('#' + hex2(r) + hex2(g) + hex2(b));
  }
  for (let i = 232; i < 256; i++) {
    const v = 8 + (i - 232) * 10;
    out.push('#' + hex2(v) + hex2(v) + hex2(v));
  }
  return out;
}

/** Hex colour for every palette index 0–255. */
export const PALETTE_256: readonly string[] = buildXterm256();

/** CSS colour string for any `Color` (palette index or truecolor). */
export function colorToCss(c: Color): string {
  if (isTrueColor(c)) return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
  return PALETTE_256[c & 0xff]!;
}
