// The seam between a balloon's flight and its look (stage 69, ADR 0159;
// stage 75, round 3). The flight (flight.ts, balloons.ts) moves, scales and
// fades the skin's element as a whole and hands it a pose each frame; the
// skin draws the balloon, the passenger, its mood and the sign, and moves
// its own parts. Neither the flight nor the kill feed knows what a skin
// looks like.
//
// Since stage 75 the look is the shared rig (rig.ts) with one of eight
// passengers (passengers/<id>.ts) chosen per balloon from the player's
// race (passenger.ts); its size is the rig's, 204 × 363 (`RIG_SIZE`). (The
// stage 69 SVG goblin, the raster skin and the shared plank are gone.)

import type { Mood, SignContent } from './feed';
import type { Phase } from './flight';
import { K } from './rig';

/** The rig's size at scale 1, px (rig.ts `K.W`, `K.MAXH`, so the two cannot drift): what the flight plans with. */
export const RIG_SIZE: { readonly w: number; readonly h: number } = Object.freeze({ w: K.W, h: K.MAXH });

/** Named moments a skin may play; reserved for later animated skins (a no-op is fine). */
export type SkinAction = 'blink' | 'wave' | 'cheer';

/** What the flight hands the skin each frame. */
export interface SkinPose {
  /** Seconds since the kill. */
  t: number;
  phase: Phase;
  /** The rig's lean into its motion, degrees. */
  tilt: number;
  /** The swing of what hangs under it, degrees. */
  swing: number;
  /** How hard the burner works, 0..1 (flight.ts `burnTarget`: it leads the motion). */
  burn: number;
}

export interface BalloonSkin {
  /** The whole balloon: the flight sets its transform (translate, scale; origin top centre) and opacity. */
  readonly el: HTMLElement;
  /** Its layout size at scale 1, px (fixed: the flight plans with it, nothing is measured per frame). */
  readonly size: { readonly w: number; readonly h: number };
  /** The passenger's mood. */
  setMood(mood: Mood): void;
  /** The sign's text; `joined`: a kill just joined it (a skin may bump it). */
  setSign(sign: SignContent, joined: boolean): void;
  /** Optional per-frame hook: transforms of the skin's own parts only. */
  frame?(pose: SkinPose): void;
  /**
   * Optional: the balloon is far away now (balloons.ts `REST_AFTER`): stop
   * the passenger's life and freeze the parts; later frames only move the
   * whole element. Called once.
   */
  rest?(): void;
  /** Optional named actions (see `SkinAction`). */
  act?(name: SkinAction): void;
  destroy(): void;
}

/** What a skin is told when it is made (a skin may ignore it). */
export interface SkinInit {
  /** The first sign (the rig builds and fits it at once). */
  sign: SignContent;
  /** prefers-reduced-motion for this balloon (its flight and its look agree). */
  reduced?: boolean;
}

export type SkinFactory = (doc: Document, init: SkinInit) => BalloonSkin;
