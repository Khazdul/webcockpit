// Raster skins (stage 69, ADR 0159 "Image skins"): a balloon drawn as
// stacked transparent WebP images from an image generator, the sign under
// it as HTML (sign.ts, never part of an image). The SVG goblin (goblin.ts)
// stays the default: a raster skin is used only when its files are there.
//
// The contract (public/balloons/README.md; the owner's of 2026-11-17):
// folder `public/balloons/<skin>/`, all transparent WebP:
//
//   balloon.webp        1024 × 1536: envelope, ropes and the whole empty
//                       basket; the basket's rim spans about x 330–694 at
//                       y ≈ 1210, its bottom is at y ≈ 1480
//   basket-front.webp   1024 × 1536, the same canvas: only the basket's
//                       front wall, drawn over the passenger
//   passenger-<mood>.webp  1024 × 1024 for poor, meh, calibrating, good,
//                       great, superb, pvp, levelup, death, achievement: chest-up, head centre (512, 400),
//                       head about 380 px wide, the body cut straight at the
//                       bottom edge. Placed on the balloon canvas at 50 %
//                       (512 × 512) with its top left at (256, 900), so its
//                       lower half is behind basket-front. A missing mood
//                       shows its fallback (levelup → superb, achievement
//                       → great, death → poor), then `calibrating`.
//   optional: passenger-<mood>-blink.webp, passenger-wave.webp (same size
//   and placement): the `blink` and `wave` actions.
//
// Shown 150 CSS px wide (the canvas at ~1/6.8, so the files are ~3× the
// screen's pixels). Which files exist is known at build time: Vite's glob
// over public/ is reduced to its keys (no import, no request), so a skin
// whose files are missing is never probed with a 404.

import { type Mood, MOODS } from './feed';
import { makeSign } from './sign';
import type { BalloonSkin, SkinAction, SkinFactory, SkinPose } from './skin';

export { MOODS };

/** A round-2 mood whose picture is missing borrows a kill face's before `calibrating`. */
export const MOOD_FALLBACK: Readonly<Partial<Record<Mood, Mood>>> = { levelup: 'superb', achievement: 'great', death: 'poor' };

/** The balloon canvas and where things sit on it (canvas px). */
export const CANVAS = { w: 1024, h: 1536 } as const;
export const PASSENGER = { x: 256, y: 900, size: 512 } as const;
export const BASKET_BOTTOM = 1480;
/** The balloon's shown width, CSS px. */
export const SHOWN_W = 150;
/** The element's width (the sign is 172 px) and height (the picture to the basket's bottom, then the sign). */
const EL_W = 180;
const SIGN_H = 104;

export interface RasterSkin {
  balloon: string;
  front: string;
  passenger: Readonly<Record<Mood, string>>;
  /** Optional blink frame per mood. */
  blink: Partial<Record<Mood, string>>;
  wave: string | null;
}

/**
 * The skin `name`'s URLs from the public files that exist (`files`: paths
 * like `/public/balloons/goblin/balloon.webp`), or null when a required one
 * (balloon, basket-front, passenger-calibrating) is missing.
 */
export function rasterSkinOf(files: readonly string[], name: string, base = '/'): RasterSkin | null {
  const dir = `/public/balloons/${name}/`;
  const have = new Set(files.filter((f) => f.startsWith(dir)).map((f) => f.slice(dir.length)));
  const url = (f: string): string => `${base}balloons/${name}/${f}`;
  if (!have.has('balloon.webp') || !have.has('basket-front.webp') || !have.has('passenger-calibrating.webp')) return null;
  const pass = (m: Mood): string => {
    for (let k: Mood | undefined = m; k; k = MOOD_FALLBACK[k]) if (have.has(`passenger-${k}.webp`)) return url(`passenger-${k}.webp`);
    return url('passenger-calibrating.webp');
  };
  const blink: Partial<Record<Mood, string>> = {};
  for (const m of MOODS) if (have.has(`passenger-${m}-blink.webp`)) blink[m] = url(`passenger-${m}-blink.webp`);
  return {
    balloon: url('balloon.webp'),
    front: url('basket-front.webp'),
    passenger: Object.fromEntries(MOODS.map((m) => [m, pass(m)])) as Record<Mood, string>,
    blink,
    wave: have.has('passenger-wave.webp') ? url('passenger-wave.webp') : null,
  };
}

/** The raster skin `name` if its files are in public/balloons/ (else null: the SVG goblin). */
export function bundledRasterSkin(name = 'goblin'): SkinFactory | null {
  const files = Object.keys(import.meta.glob('/public/balloons/*/*.webp'));
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  const r = rasterSkinOf(files, name, base);
  return r ? imageSkin(r) : null;
}

const BLINK_MS = 140;
const WAVE_MS = 1400;

/** A skin factory for the raster files `r`. */
export function imageSkin(r: RasterSkin): SkinFactory {
  const k = SHOWN_W / CANVAS.w;
  const px = (v: number): string => `${+(v * k).toFixed(2)}px`;
  const size = { w: EL_W, h: BASKET_BOTTOM * k + 10 + SIGN_H };
  return (doc): BalloonSkin => {
    const el = doc.createElement('div');
    el.className = 'wc-iskin';
    el.style.width = `${EL_W}px`;
    const rig = doc.createElement('div');
    rig.style.transformOrigin = '50% 20%';
    const stack = doc.createElement('div');
    stack.style.cssText = `position:relative;width:${SHOWN_W}px;height:${px(CANVAS.h)};margin:0 auto`;
    const img = (src: string, box: string): HTMLImageElement => {
      const i = doc.createElement('img');
      i.alt = '';
      i.decoding = 'async';
      i.draggable = false;
      i.src = src;
      i.style.cssText = `position:absolute;${box}`;
      return i;
    };
    const full = `left:0;top:0;width:100%;height:100%`;
    const seat = `left:${px(PASSENGER.x)};top:${px(PASSENGER.y)};width:${px(PASSENGER.size)};height:${px(PASSENGER.size)}`;
    const back = img(r.balloon, full);
    const front = img(r.front, full);
    stack.append(back, front);
    // One <img> per passenger picture, made on first use and swapped by
    // `hidden`: a new mood shows at once, without a decode gap.
    const people = new Map<string, HTMLImageElement>();
    let shown: HTMLImageElement | null = null;
    const show = (src: string): void => {
      let i = people.get(src);
      if (!i) {
        i = img(src, seat);
        i.hidden = true;
        people.set(src, i);
        front.before(i);
      }
      if (i === shown) return;
      if (shown) shown.hidden = true;
      i.hidden = false;
      shown = i;
    };
    const sign = makeSign(doc);
    // The sign hangs from the basket's bottom.
    sign.el.style.marginTop = `${+((BASKET_BOTTOM - CANVAS.h) * k + 10).toFixed(2)}px`;
    rig.append(stack, sign.el);
    el.append(rig);
    let mood: Mood = 'calibrating';
    let tilt = NaN;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const play = (src: string | null | undefined, ms: number): void => {
      if (!src || timer) return;
      show(src);
      timer = setTimeout(() => {
        timer = null;
        show(r.passenger[mood]);
      }, ms);
    };
    return {
      el,
      size,
      setMood(face) {
        mood = face;
        if (!timer) show(r.passenger[face]);
      },
      setSign: (s, joined) => sign.set(s, joined),
      frame(p: SkinPose) {
        const ti = Math.round(p.tilt * 10) / 10;
        if (ti !== tilt) rig.style.transform = `rotate(${(tilt = ti)}deg)`;
        sign.swing(p.swing);
      },
      act(name: SkinAction) {
        if (name === 'blink') play(r.blink[mood], BLINK_MS);
        else if (name === 'wave') play(r.wave, WAVE_MS);
      },
      destroy() {
        if (timer) clearTimeout(timer);
        el.remove();
      },
    };
  };
}
