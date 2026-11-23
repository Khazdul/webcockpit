// The drawn portraits (stage 77's portrait pass, ADR 0166 addendum 12):
// which race chunk holds an id's drawing, the chunk's lazy load, and the
// baked image (bake.ts) the card shows. Only the player's race is ever
// fetched: one chunk per people, as the balloon passengers
// (src/weather/balloons/passenger.ts).
//
// - A bake is one (id, sex, drawing size, pixel bucket). The pixel size is
//   the disc's CSS px × the device pixel ratio, rounded up to a bucket
//   (`bucketPx`) so a pane being resized bakes a handful of times, not on
//   every step. The card only rebakes to grow (portraitEl, character-dom.ts):
//   a smaller frame keeps the larger image.
// - The drawing size: `medium` below 72 CSS px (the card's Medium), else
//   `large` (types.ts `PortraitSize`).
// - The baked URLs are kept in a small most-recent cache (a PNG `data:`
//   URL is some 100–300 kB of string).

import { bake } from './bake';
import type { Draw, PortraitId, PortraitSet, PortraitSize, Sex } from './types';

export type { PortraitId, Sex, PortraitSize };

type Group = 'men' | 'elves' | 'dwarves' | 'hobbits' | 'orcs' | 'trolls' | 'dark';

/** The chunk each id's drawing lives in. */
export const PORTRAIT_GROUP: Readonly<Record<PortraitId, Group>> = {
  human: 'men',
  dunadan: 'men',
  eriadorian: 'men',
  rohirrim: 'men',
  beorning: 'men',
  elf: 'elves',
  noldo: 'elves',
  sinda: 'elves',
  silvan: 'elves',
  halfelf: 'elves',
  dwarf: 'dwarves',
  longbeard: 'dwarves',
  firebeard: 'dwarves',
  broadbeam: 'dwarves',
  hobbit: 'hobbits',
  fallohide: 'hobbits',
  harfoot: 'hobbits',
  stoor: 'hobbits',
  orc: 'orcs',
  tarkhnarb: 'orcs',
  morruhk: 'orcs',
  zaugurz: 'orcs',
  troll: 'trolls',
  cavetroll: 'trolls',
  hilltroll: 'trolls',
  mountaintroll: 'trolls',
  numenorean: 'dark',
  neutral: 'dark',
};

declare const __WC_REPLAY__: boolean | undefined;
/** The replay runtime (one IIFE, which would inline every chunk) shows no Character pane (src/share/shared-panes.ts): it carries no drawings. */
const IN_REPLAY = typeof __WC_REPLAY__ === 'boolean' && __WC_REPLAY__;

const CHUNKS: Readonly<Record<Group, () => Promise<{ portraits: PortraitSet }>>> | null = IN_REPLAY ? null : {
  men: () => import('./men'),
  elves: () => import('./elves'),
  dwarves: () => import('./dwarves'),
  hobbits: () => import('./hobbits'),
  orcs: () => import('./orcs'),
  trolls: () => import('./trolls'),
  dark: () => import('./dark'),
};

/** The drawing of `id` (its chunk loaded once; the module system caches it), or null when it has none. */
export async function loadDraw(id: PortraitId): Promise<Draw | null> {
  if (CHUNKS === null) return null;
  const m = await CHUNKS[PORTRAIT_GROUP[id]]();
  return m.portraits[id] ?? null;
}

/** Below this many CSS px across, the Medium drawing. */
export const MEDIUM_BELOW = 72;
export const sizeFor = (discCss: number): PortraitSize => (discCss < MEDIUM_BELOW ? 'medium' : 'large');

/** The pixel size to bake for `px` device pixels: the next step of a 1.25 × ladder from 32, at most 1024. */
export function bucketPx(px: number): number {
  let b = 32;
  while (b < px && b < 1024) b = Math.ceil((b * 1.25) / 8) * 8;
  return Math.min(b, 1024);
}

const KEEP = 6;
const baked = new Map<string, Promise<string | null>>();
let serial = 0;

/** The baked image of `id` for `sex` at `px` device pixels (a bucket), or null when it has no drawing. */
export function portraitArt(doc: Document, id: PortraitId, sex: Sex, size: PortraitSize, px: number): Promise<string | null> {
  const key = `${id}|${id === 'neutral' ? '-' : sex}|${size}|${px}`;
  const hit = baked.get(key);
  if (hit) {
    baked.delete(key);
    baked.set(key, hit);
    return hit;
  }
  const job = loadDraw(id).then((draw) => (draw ? bake(doc, draw({ sex, size, uid: `wcp${++serial}-` }), px) : null));
  job.catch(() => baked.delete(key));
  baked.set(key, job);
  while (baked.size > KEEP) baked.delete(baked.keys().next().value!);
  return job;
}
