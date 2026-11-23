// The contract between the Character card and the portrait drawings (stage
// 77's portrait pass, ADR 0166 addendum 12). A drawing is a pure function
// that returns one standalone SVG document as a string: the square
// `0 0 200 200` of which the card's round frame shows the inscribed disc
// (as a raster file's, public/portraits/README.md). It is drawn once per
// portrait, sex and size and baked into an image (bake.ts), so its SVG
// filters never run on a repaint.

import type { RaceKind, SubraceKind } from '../../gmcp/race';
import type { Sex } from '../../gmcp/sex';

/** A portrait: a subrace's (`subraceKind`), a race's (`raceKind`), or the neutral figure. */
export type PortraitId = SubraceKind | RaceKind | 'neutral';

/** The character's sex (src/gmcp/sex.ts). Not known yet: the card asks for `male` (ADR 0166 addendum 12). */
export type { Sex };

/** The two sizes a drawing may tune its line for: Large (about 100–180 px across) and Medium (about 40 px). */
export type PortraitSize = 'large' | 'medium';

export interface DrawOpts {
  sex: Sex;
  size: PortraitSize;
  /** A prefix for every id in the drawing's `<defs>` (filters, patterns, clips), unique per call. */
  uid: string;
}

/** One drawing: a full `<svg xmlns=… viewBox="0 0 200 200" width="200" height="200">…</svg>`. */
export type Draw = (o: DrawOpts) => string;

/** A race chunk's export: the drawings of its ids. */
export type PortraitSet = Partial<Readonly<Record<PortraitId, Draw>>>;

/** The square every drawing fills. */
export const VIEW = 200;
