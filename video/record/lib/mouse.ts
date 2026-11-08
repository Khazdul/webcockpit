// The pointer for the film. Playwright's `mouse.move` with `steps` sends its
// steps at once, so the pointer is moved here one display frame at a time.
// The recorder logs every move in the page (browser.ts) and the
// compositions draw a cursor from that log (the headless take has none).
//
// `Pointer` (the film's scenes) moves like a hand, not a script (owner,
// 2026-11-08): straight to the next target, no stops on the way; a
// Fitts-like time (longer for far and small targets) with a fast start and
// a long deceleration; a slightly bowed path that differs per move; now and
// then a small overshoot and a correction; a landing point off the target's
// centre; a short, varied reaction pause before a click; a slow drift while
// it rests. All of it from a seeded generator, so a retake moves the same.
//
// `place`, `glide` and `glideClick` are the simpler eased glide the bree
// test scene uses.
import type { Locator, Page } from '@playwright/test';
import { sleep } from '../../../scripts/lib/mume-feed.ts';

/** mulberry32: a small seeded generator, [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Pt {
  x: number;
  y: number;
}

/** Minimum jerk on warped time: the peak speed early, a long deceleration into the target. */
const profile = (t: number): number => {
  const u = t ** 0.72;
  return u * u * u * (10 - 15 * u + 6 * u * u);
};

export class Pointer {
  private readonly page: Page;
  private readonly rnd: () => number;
  private at: Pt;

  constructor(page: Page, seed: number, start: Pt = { x: 5, y: 5 }) {
    this.page = page;
    this.rnd = seeded(seed);
    this.at = { ...start };
  }

  /** A number in [a, b). */
  private r(a: number, b: number): number {
    return a + (b - a) * this.rnd();
  }

  /** Roughly normal, mean 0, sd 1 (three uniforms). */
  private n(): number {
    return (this.rnd() + this.rnd() + this.rnd() - 1.5) * 2;
  }

  /** Puts the pointer at (x, y) at once (off camera). */
  async place(x: number, y: number): Promise<void> {
    await this.page.mouse.move(x, y);
    this.at = { x, y };
  }

  /** Fitts-like movement time, ms, for `d` px to a target `w` px across. */
  private moveMs(d: number, w: number): number {
    if (d < 2) return 0;
    const id = Math.log2(d / Math.max(w, 8) + 1);
    return (180 + 165 * id) * this.r(0.9, 1.12);
  }

  /** One movement along a bowed path in `ms`, a frame (with a little jitter) per step. */
  private async stroke(to: Pt, ms: number): Promise<void> {
    const from = this.at;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5 || ms <= 0) {
      await this.page.mouse.move(to.x, to.y);
      this.at = { ...to };
      return;
    }
    // the bow: sideways at a random point along the way, by a share of the distance that varies
    const bow = (this.rnd() < 0.5 ? -1 : 1) * this.r(0.03, 0.11) * d;
    const along = this.r(0.35, 0.6);
    const c = { x: from.x + dx * along - (dy / d) * bow, y: from.y + dy * along + (dx / d) * bow };
    const start = Date.now();
    for (;;) {
      const t = Math.min(1, (Date.now() - start) / ms);
      const u = profile(t);
      const x = (1 - u) ** 2 * from.x + 2 * (1 - u) * u * c.x + u * u * to.x;
      const y = (1 - u) ** 2 * from.y + 2 * (1 - u) * u * c.y + u * u * to.y;
      await this.page.mouse.move(x, y);
      if (t >= 1) break;
      await sleep(this.r(13, 19));
    }
    this.at = { ...to };
  }

  /** The plan of a movement to a target box: where it lands, the overshoot if any, and how long it takes. */
  private plan(box: { x: number; y: number; width: number; height: number }): { land: Pt; over: Pt | null; ms: number; fixMs: number } {
    // off the centre, inside the middle of the box
    const land = {
      x: box.x + box.width * (0.5 + Math.max(-0.3, Math.min(0.3, this.n() * 0.12))),
      y: box.y + box.height * (0.5 + Math.max(-0.25, Math.min(0.25, this.n() * 0.1))),
    };
    const d = Math.hypot(land.x - this.at.x, land.y - this.at.y);
    const ms = this.moveMs(d, Math.min(box.width, box.height));
    // now and then (longer moves) a few px past it, then back
    let over: Pt | null = null;
    let fixMs = 0;
    if (d > 180 && this.rnd() < 0.3) {
      const k = this.r(4, 10) / d;
      over = { x: land.x + (land.x - this.at.x) * k, y: land.y + (land.y - this.at.y) * k };
      fixMs = this.r(110, 190);
    }
    return { land, over, ms, fixMs };
  }

  private async follow(p: { land: Pt; over: Pt | null; ms: number; fixMs: number }): Promise<void> {
    if (p.over) {
      await this.stroke(p.over, p.ms);
      await sleep(this.r(30, 70));
      await this.stroke(p.land, p.fixMs);
    } else await this.stroke(p.land, p.ms);
  }

  /** Rests until `until` (epoch ms), drifting a pixel or two now and then. */
  async rest(until: number): Promise<void> {
    while (Date.now() < until - 40) {
      const wait = Math.min(this.r(350, 900), until - Date.now() - 40);
      if (wait > 0) await sleep(wait);
      if (Date.now() >= until - 120) break;
      const to = { x: this.at.x + this.n() * 0.9, y: this.at.y + this.n() * 0.7 };
      await this.stroke(to, this.r(90, 180));
    }
    const left = until - Date.now();
    if (left > 0) await sleep(left);
  }

  /** The target's box, once it has stopped moving (a page that grows in). */
  private async box(el: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
    let prev = await el.boundingBox();
    for (let i = 0; i < 20; i++) {
      await sleep(50);
      const b = await el.boundingBox();
      if (b && prev && Math.abs(b.x - prev.x) < 0.5 && Math.abs(b.y - prev.y) < 0.5 && Math.abs(b.width - prev.width) < 0.5) return b;
      prev = b;
    }
    if (!prev) throw new Error('pointer: the target has no box');
    return prev;
  }

  /**
   * Moves straight to `el` and presses it so that the press lands at `at`
   * (epoch ms): rests (drifting) until the movement must start, moves, waits
   * a human moment, presses, releases. Returns the press time.
   */
  async clickAt(el: Locator, at: number): Promise<number> {
    await this.rest(at - 1700);
    const b = await this.box(el);
    const p = this.plan(b);
    const react = this.r(150, 350);
    const lead = p.ms + (p.over ? p.fixMs + 50 : 0) + react;
    await this.rest(at - lead);
    await this.follow(p);
    const left = at - Date.now();
    await sleep(Math.max(60, left));
    const down = Date.now();
    await this.page.mouse.down();
    await sleep(this.r(60, 115));
    await this.page.mouse.up();
    return down;
  }

  /** Moves straight onto `el` (no click), arriving at `at` (epoch ms). */
  async hoverAt(el: Locator, at: number): Promise<void> {
    await this.rest(at - 1700);
    const b = await this.box(el);
    const p = this.plan(b);
    await this.rest(at - p.ms - (p.over ? p.fixMs + 50 : 0));
    await this.follow(p);
  }

  /** Moves straight to a point (out of the way), starting now. */
  async moveTo(x: number, y: number): Promise<void> {
    const d = Math.hypot(x - this.at.x, y - this.at.y);
    await this.stroke({ x, y }, this.moveMs(d, 120));
  }
}

// ------------------------------------------------------------ the simple glide (bree)

/** Where each page's pointer is, CSS px (Playwright does not say). */
const at = new WeakMap<Page, { x: number; y: number }>();

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Puts the pointer at (x, y) at once (off camera). */
export async function place(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  at.set(page, { x, y });
}

/**
 * Moves the pointer to (x, y) over `ms` (default by distance, 350–900 ms),
 * along an arc bowed by `arc` (a share of the distance, sideways).
 */
export async function glide(page: Page, x: number, y: number, o: { ms?: number; arc?: number } = {}): Promise<void> {
  const from = at.get(page) ?? { x: 5, y: 5 };
  const dx = x - from.x;
  const dy = y - from.y;
  const dist = Math.hypot(dx, dy);
  const ms = o.ms ?? Math.min(900, Math.max(350, dist * 0.9));
  const arc = (o.arc ?? 0.08) * dist;
  const cx = from.x + dx / 2 + (dist ? (-dy / dist) * arc : 0);
  const cy = from.y + dy / 2 + (dist ? (dx / dist) * arc : 0);
  const start = Date.now();
  for (;;) {
    const t = Math.min(1, (Date.now() - start) / ms);
    const u = ease(t);
    const px = (1 - u) ** 2 * from.x + 2 * (1 - u) * u * cx + u * u * x;
    const py = (1 - u) ** 2 * from.y + 2 * (1 - u) * u * cy + u * u * y;
    await page.mouse.move(px, py);
    if (t >= 1) break;
    await sleep(16);
  }
  at.set(page, { x, y });
}

/** Glides to the middle of `el` (or `dx`, `dy` shares of its box) and clicks there, a short press. */
export async function glideClick(page: Page, el: Locator, o: { dx?: number; dy?: number; ms?: number } = {}): Promise<void> {
  const b = await el.boundingBox();
  if (!b) throw new Error('glideClick: the element has no box');
  const x = b.x + b.width * (o.dx ?? 0.5);
  const y = b.y + b.height * (o.dy ?? 0.5);
  await glide(page, x, y, o.ms === undefined ? {} : { ms: o.ms });
  await sleep(120);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
}
