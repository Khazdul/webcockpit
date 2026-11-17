// Balloon notices, main thread (stage 69, ADR 0159). A lazy chunk of its
// own: the weather controller imports it only while Weather effects and
// Balloons are both on (or `#weather balloon` / the demo asks for one).
//
// Each balloon is a skin's element (skin.ts; the goblin, goblin.ts) moved
// by its flight (flight.ts) in one of two layers over the cockpit:
//
// - front (`.wc-balloons-front`, z-index 89): above the game text and the
//   panes, below the weather's front canvas (90). Arriving and readable.
// - sky (`.wc-balloons-sky`, no z-index): placed right after the weather's
//   back canvas, so, like it, it paints under every later positioned
//   sibling: the game text and the panes. Gliding and drifting.
//
// A balloon moves from the front layer to the sky once, when its glide
// starts. Cost: one requestAnimationFrame loop while a balloon is up and
// the page is shown; per balloon and frame one transform, an opacity when
// it changes and the skin's own two rotations. Nothing on the text path;
// no layout read (the flight plans with the skin's fixed size and the
// weather's last measured geometry).

import './balloons.css';
import { type KillNotice, signOf } from './feed';
import { type FlightPlan, type LaneGeom, canJoin, extendRead, flightAt, planFlight } from './flight';
import { goblinSkin } from './goblin';
import { bundledRasterSkin } from './image-skin';
import type { BalloonSkin, SkinFactory } from './skin';

/** Balloons up at once; a new one beyond this hurries the oldest away. */
export const MAX_BALLOONS = 5;
/** How much faster a hurried balloon's clock runs. */
export const HURRY = 6;

export interface BalloonsHost {
  /** The cockpit (the weather canvases' root). */
  root: HTMLElement;
  /** The layout as the weather engine last measured it. */
  geometry: () => LaneGeom;
  /** The look (default: the raster goblin when its files are in public/balloons/goblin/, else the SVG goblin). */
  skin?: SkinFactory;
  /** Default: `prefers-reduced-motion: reduce`. */
  reducedMotion?: () => boolean;
  /** Flight seeds (default Math.random; tests). */
  random?: () => number;
}

export interface BalloonInfo {
  phase: string;
  front: boolean;
  count: number;
  face: string;
}

export interface Balloons {
  /** A kill: it joins the readable balloon's sign, or a new balloon rises. */
  show(k: KillNotice): void;
  /** The balloons up now, oldest first (tests, dev). */
  list(): BalloonInfo[];
  destroy(): void;
}

interface Flight {
  skin: BalloonSkin;
  plan: FlightPlan;
  t: number;
  rate: number;
  kills: KillNotice[];
  front: boolean | null;
  x: number;
  phase: string;
  opacity: number;
}

export function startBalloons(host: BalloonsHost): Balloons {
  const { root } = host;
  const doc = root.ownerDocument;
  const win = doc.defaultView ?? window;
  const skinOf = host.skin ?? bundledRasterSkin() ?? goblinSkin;
  const random = host.random ?? Math.random;
  const mq = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced = host.reducedMotion ?? (() => !!mq?.matches);

  const layer = (cls: string): HTMLDivElement => {
    const d = doc.createElement('div');
    d.className = `wc-balloons ${cls}`;
    d.setAttribute('aria-hidden', 'true');
    return d;
  };
  const sky = layer('wc-balloons-sky');
  const front = layer('wc-balloons-front');
  // The sky layer right after the back canvas (or first): under the text.
  const back = root.querySelector(':scope > canvas.wc-weather-back');
  if (back) back.after(sky);
  else root.prepend(sky);
  // Decoration only (aria-hidden): the kill's `◆` line already says it.
  root.append(front);

  const flights: Flight[] = [];
  let raf = 0;
  let last = 0;
  let destroyed = false;

  const place = (f: Flight): void => {
    const fr = flightAt(f.plan, f.t);
    f.phase = fr.phase;
    if (fr.phase === 'done') return;
    if (fr.front !== f.front) {
      f.front = fr.front;
      (fr.front ? front : sky).append(f.skin.el);
    }
    f.x = fr.x;
    const el = f.skin.el;
    el.style.transform = `translate3d(${(fr.x - f.plan.bw / 2).toFixed(1)}px, ${fr.y.toFixed(1)}px, 0) scale(${fr.scale.toFixed(4)})`;
    const o = Math.round(fr.opacity * 100) / 100;
    if (o !== f.opacity) el.style.opacity = String((f.opacity = o));
    f.skin.frame?.({ t: f.t, phase: fr.phase, tilt: fr.tilt, swing: fr.swing });
  };

  const tick = (now: number): void => {
    raf = 0;
    if (destroyed) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    for (let i = 0; i < flights.length; i++) {
      const f = flights[i]!;
      f.t += dt * f.rate;
      place(f);
      if (f.phase === 'done') {
        f.skin.destroy();
        flights.splice(i--, 1);
      }
    }
    schedule();
  };

  const schedule = (): void => {
    if (raf || destroyed || flights.length === 0 || doc.hidden) return;
    raf = win.requestAnimationFrame(tick);
  };

  const onVis = (): void => {
    if (doc.hidden) {
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0;
    } else {
      last = win.performance.now();
      schedule();
    }
  };
  doc.addEventListener('visibilitychange', onVis);

  const launch = (k: KillNotice): void => {
    // Too many up: the oldest hurry away (the very oldest goes at once beyond the cap).
    while (flights.length >= MAX_BALLOONS + 1) flights.shift()!.skin.destroy();
    if (flights.length >= MAX_BALLOONS) flights[0]!.rate = HURRY;
    let near: Flight | null = null;
    for (const f of flights) if (f.phase === 'arrive' || f.phase === 'read' || f.phase === 'glide') near = f;
    const skin = skinOf(doc);
    skin.el.classList.add('wc-balloon');
    const plan = planFlight(Math.floor(random() * 2 ** 32), host.geometry(), skin.size.w, skin.size.h, { reduced: reduced(), avoidX: near ? near.x : null });
    const f: Flight = { skin, plan, t: 0, rate: 1, kills: [k], front: null, x: plan.start.x, phase: 'arrive', opacity: -1 };
    skin.setMood(k.face);
    skin.setSign(signOf(f.kills), false);
    flights.push(f);
    place(f);
    if (!raf) last = win.performance.now();
    schedule();
  };

  return {
    show(k) {
      if (destroyed) return;
      const top = flights.at(-1);
      if (top && top.rate === 1 && canJoin(top.plan, top.t)) {
        top.kills.push(k);
        extendRead(top.plan);
        const s = signOf(top.kills);
        top.skin.setMood(s.face);
        top.skin.setSign(s, true);
        return;
      }
      launch(k);
    },
    list() {
      return flights.map((f) => ({ phase: f.phase, front: !!f.front, count: f.kills.length, face: signOf(f.kills).face }));
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) win.cancelAnimationFrame(raf);
      doc.removeEventListener('visibilitychange', onVis);
      for (const f of flights.splice(0)) f.skin.destroy();
      sky.remove();
      front.remove();
    },
  };
}
