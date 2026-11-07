// The start page sky's colour and light model (stage 41, ADR 0124): a
// pure function of game time, shared by the sky engine (what it paints),
// the wordmark (where its glint and inlay light come from) and the quote
// and almanac (dark or pale text). No DOM, no canvas reads.
//
// STUB (night pass setup): the sky-engine work (41a) replaces the body
// and may add fields; the field names and meanings below are the contract
// the wordmark (41b) and the layout (41c) code against.

import { gameTimeAt, type DayPeriod, type Season } from '../../gmcp/gametime';

export interface SkyLight {
  /** The light the wordmark reflects: the sun by day, the moon at night, none when both are down. */
  kind: 'sun' | 'moon' | 'none';
  /** Its drawn position as a fraction of the viewport (0..1; may be < 0 or > 1 just off-screen). */
  x: number;
  y: number;
  /** 0 (no light) .. 1 (full sun). The moon tops out well below 1. */
  strength: number;
  /** Its colour (CSS). */
  color: string;
}

export interface SkyLook {
  period: DayPeriod;
  season: Season;
  /** 0 = deep night .. 1 = full day, smooth through dawn and dusk (the inlay blends day → night metal by it). */
  dayness: number;
  /** Gradient stops (CSS colours): zenith, middle, at the horizon, and the plain surface below it. */
  top: string;
  mid: string;
  horizon: string;
  below: string;
  /** Relative luminance (0..1) of the sky behind the quote and almanac: > ~0.45 wants dark text. */
  textBackLuminance: number;
  light: SkyLight;
}

/** The sky at game minute `g`. */
export function skyLookAt(g: number): SkyLook {
  const t = gameTimeAt(g);
  const dayness = t.period === 'night' ? 0 : t.period === 'day' ? 1 : 0.5;
  const day = dayness > 0.5;
  return {
    period: t.period,
    season: t.season,
    dayness,
    top: day ? '#3d7fc4' : '#05070d',
    mid: day ? '#79acd9' : '#0b1020',
    horizon: day ? '#c9def0' : '#141a2c',
    below: day ? '#9cc3e6' : '#04050a',
    textBackLuminance: day ? 0.6 : 0.03,
    light: day
      ? { kind: 'sun', x: 0.5, y: 0.2, strength: 1, color: '#fff3d6' }
      : { kind: 'moon', x: 0.5, y: 0.25, strength: 0.35, color: '#d8e2f0' },
  };
}
