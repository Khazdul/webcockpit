// The seam between a balloon's flight and its look (stage 69, ADR 0159).
// The flight (flight.ts, balloons.ts) moves, scales and fades the skin's
// element as a whole and hands it a pose each frame; the skin draws the
// balloon, the passenger, its mood and the sign, and moves its own parts.
// Neither the flight nor the kill feed knows what a skin looks like: a new
// look is a new skin file, nothing else changes. Two exist: the SVG goblin
// (goblin.ts, the default) and raster skins from image files
// (image-skin.ts, used when public/balloons/goblin/ has its files). Both
// hang the shared HTML sign (sign.ts).

import type { Face, SignContent } from './feed';
import type { Phase } from './flight';

/** Named moments a skin may play; reserved for later animated skins (a no-op is fine). */
export type SkinAction = 'blink' | 'wave' | 'cheer';

/** What the flight hands the skin each frame. */
export interface SkinPose {
  /** Seconds since the kill. */
  t: number;
  phase: Phase;
  /** The rig's lean into its motion, degrees. */
  tilt: number;
  /** The sign's swing under it, degrees. */
  swing: number;
}

export interface BalloonSkin {
  /** The whole balloon: the flight sets its transform (translate, scale; origin top centre) and opacity. */
  readonly el: HTMLElement;
  /** Its layout size at scale 1, px (fixed: the flight plans with it, nothing is measured). */
  readonly size: { readonly w: number; readonly h: number };
  /** The passenger's mood. */
  setMood(face: Face): void;
  /** The sign's text; `joined`: a kill just joined it (a skin may bump it). */
  setSign(sign: SignContent, joined: boolean): void;
  /** Optional per-frame hook: transforms of the skin's own parts only. */
  frame?(pose: SkinPose): void;
  /** Optional named actions (see `SkinAction`). */
  act?(name: SkinAction): void;
  destroy(): void;
}

export type SkinFactory = (doc: Document) => BalloonSkin;
