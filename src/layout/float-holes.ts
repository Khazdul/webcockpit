// Holes under floating panes (ADR 0091 "Engine", item 57; ADR 0095 and its
// round 1 addendum). The cockpit (cockpit.ts) owns them and calls `sync()`
// after every relayout, synchronously, before the layout is painted, so a
// moved float and its holes move in one frame; the weather (weather/index.ts)
// calls it too when it marks or unmarks the cockpit `data-weather` and
// before it measures. Layout changes only, never per frame.
//
// A hole is a `clip-path` on what lies under a float (`holeClip`), so the
// float shows what is behind that instead:
//
//   float          weather on                         weather off
//   glass          see-through (`data-weather-see`);  nothing: the float
//                  holes in the game text, the input  is opaque
//                  line, the docked panes and the
//                  floats below it
//   clear          holes in the game text and the input line only: the
//                  weather (or the page) and the panes under it show, the
//                  game text does not (owner round 1)
//
// The rest is pure.

import type { Rect } from './allocate';

/** `r` less every rect in `cuts`, as disjoint rects (none when the cuts cover it). */
export function cutRects(r: Rect, cuts: readonly Rect[]): Rect[] {
  let out: Rect[] = [r];
  for (const c of cuts) {
    const next: Rect[] = [];
    for (const a of out) {
      const ax1 = a.x + a.w, ay1 = a.y + a.h;
      const x0 = Math.max(a.x, c.x), x1 = Math.min(ax1, c.x + c.w);
      const y0 = Math.max(a.y, c.y), y1 = Math.min(ay1, c.y + c.h);
      if (x1 <= x0 || y1 <= y0) {
        next.push(a);
        continue;
      }
      if (y0 > a.y) next.push({ x: a.x, y: a.y, w: a.w, h: y0 - a.y });
      if (y1 < ay1) next.push({ x: a.x, y: y1, w: a.w, h: ay1 - y1 });
      if (x0 > a.x) next.push({ x: a.x, y: y0, w: x0 - a.x, h: y1 - y0 });
      if (x1 < ax1) next.push({ x: x1, y: y0, w: ax1 - x1, h: y1 - y0 });
    }
    out = next;
  }
  return out;
}

/**
 * A `clip-path` that shows an element of size `w` × `h` but the union of
 * `holes` (element px): one even-odd path, the element's box (with a margin)
 * and the holes made disjoint and cut to that box, so overlapping holes stay
 * holes. Empty without holes (owner item 57: the text under a float).
 */
export function holeClip(w: number, h: number, holes: readonly Rect[]): string {
  const m = 64;
  const box = { x: -m, y: -m, w: w + 2 * m, h: h + 2 * m };
  const parts: Rect[] = [];
  for (const hole of holes) {
    const x0 = Math.max(box.x, hole.x), y0 = Math.max(box.y, hole.y);
    const x1 = Math.min(box.x + box.w, hole.x + hole.w), y1 = Math.min(box.y + box.h, hole.y + hole.h);
    if (x1 > x0 && y1 > y0) parts.push(...cutRects({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, parts));
  }
  if (!parts.length) return '';
  const n = (v: number): string => String(Math.round(v * 100) / 100);
  const rect = (r: Rect): string => `M${n(r.x)} ${n(r.y)}H${n(r.x + r.w)}V${n(r.y + r.h)}H${n(r.x)}Z`;
  return `path(evenodd, "${rect(box)}${parts.map(rect).join('')}")`;
}

/**
 * See-through floating panes (owner feedback 3, 13, 18, item 57; ADR 0091
 * "Engine"). With weather on a glass float has no fill of its own
 * (`data-weather-see`), like a docked pane: the back layer shows through it
 * directly, so it always shows the very frame the weather round it shows (a
 * copy of the back layer in a canvas of its own was presented apart and now
 * and then ran a frame off: a lit rectangle in a lightning flicker). What
 * lies under it is clipped out instead: the game text and the input line,
 * the docked panes and the floats below it. A clip makes an element a
 * backdrop root, so the glass of a clipped pane would blur nothing: a pane
 * with a hole is marked `data-weather-under` and gets the glass without blur
 * (weather.css, as in Firefox) while covered.
 *
 * A clear float (`data-clear`, ADR 0095 round 1), weather on or off, cuts
 * holes in the game text and the input line only: what else lies under it
 * shows through it, the game text does not.
 */
export function floatHoles(root: HTMLElement): { sync(): void; clear(): void } {
  /** The clip each element got from here (to leave it alone when unchanged and to undo it). */
  const clips = new Map<HTMLElement, string>();
  const see = new Set<HTMLElement>();
  const unclip = (el: HTMLElement): void => {
    el.style.removeProperty('clip-path');
    el.removeAttribute('data-weather-under');
    clips.delete(el);
  };
  return {
    sync() {
      const weather = root.hasAttribute('data-weather');
      const base = root.getBoundingClientRect();
      const rel = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
      };
      const floats: { el: HTMLElement; r: ReturnType<typeof rel>; z: number; i: number; clear: boolean }[] = [];
      for (const el of root.querySelectorAll<HTMLElement>(':scope > .wc-pane[data-floating]')) {
        if (el.hidden) continue;
        const clear = el.hasAttribute('data-clear');
        // Weather off, a glass float is opaque: it needs no holes.
        if (!weather && !clear) continue;
        const r = rel(el);
        if (r.w <= 0 || r.h <= 0) continue;
        floats.push({ el, r, z: Number(el.style.zIndex) || 0, i: floats.length, clear });
      }
      // See-through: every float while the weather runs.
      const seeNow = weather ? floats : [];
      for (const el of see) if (!seeNow.some((f) => f.el === el)) el.removeAttribute('data-weather-see');
      see.clear();
      for (const f of seeNow) {
        f.el.setAttribute('data-weather-see', '');
        see.add(f.el);
      }
      const next = new Map<HTMLElement, string>();
      if (floats.length) {
        for (const el of root.querySelectorAll<HTMLElement>(':scope > .wc-game, :scope > .wc-input-slot, :scope > .wc-pane')) {
          if (el.hidden) continue;
          const text = !el.classList.contains('wc-pane');
          const self = floats.find((f) => f.el === el);
          const r = self?.r ?? rel(el);
          if (r.w <= 0 || r.h <= 0) continue;
          const holes = floats
            // A clear float hides only the game text and the input line under it.
            .filter((f) => text || !f.clear)
            .filter((f) => f !== self && (!self || f.z > self.z || (f.z === self.z && f.i > self.i)))
            .filter((f) => f.r.x < r.x + r.w && f.r.x + f.r.w > r.x && f.r.y < r.y + r.h && f.r.y + f.r.h > r.y)
            .map((f) => ({ x: f.r.x - r.x, y: f.r.y - r.y, w: f.r.w, h: f.r.h }));
          const clip = holes.length ? holeClip(r.w, r.h, holes) : '';
          if (clip) next.set(el, clip);
        }
      }
      for (const el of [...clips.keys()]) if (!next.has(el)) unclip(el);
      for (const [el, clip] of next) {
        if (clips.get(el) === clip) continue;
        el.style.setProperty('clip-path', clip);
        el.toggleAttribute('data-weather-under', el.classList.contains('wc-pane'));
        clips.set(el, clip);
      }
    },
    clear() {
      for (const el of [...clips.keys()]) unclip(el);
      for (const el of see) el.removeAttribute('data-weather-see');
      see.clear();
    },
  };
}
