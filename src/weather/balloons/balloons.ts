// Balloon notices, main thread (stage 69, ADR 0159). A lazy chunk of its
// own: the weather controller imports it only while Weather effects and
// Balloons are both on (or `#weather balloon` / the demo asks for one),
// and never in the phone's layout (desktop only, round 2).
//
// Each balloon is a skin's element (skin.ts; the goblin, goblin.ts) moved
// by its flight (flight.ts) in one of two layers in the cockpit, both
// positioned without a z-index, so they paint in tree order among the
// cockpit's other positioned, `z-index: auto` children:
//
// - sky (`.wc-balloons-sky`): right after the weather's back canvas, so it
//   paints under the game text and every pane. Gliding and drifting.
// - over the text (`.wc-balloons-front`): right after the game pane
//   (`.wc-game`), so it paints over the game text but under the input row
//   (it rises from behind the prompt) and under every pane, docked (later
//   siblings) or floating (z-index 10 and up). Arriving and readable.
//   (Round 1 had it at z-index 89, over the panes; the owner wants the
//   balloons behind every pane in every phase.)
//
// A balloon moves from the front layer to the sky once, when its glide
// starts. Cost: one requestAnimationFrame loop while a balloon is up and
// the page is shown; per balloon and frame one transform, an opacity when
// it changes and the skin's own two rotations. Nothing on the text path;
// no layout read (the flight plans with the skin's fixed size and the
// weather's last measured geometry).

import './balloons.css';
import { type Notice, isKillNotice, kindOf, signFor } from './feed';
import { type FlightPlan, type LaneGeom, canJoin, extendRead, flightAt, planFlight } from './flight';
import { goblinSkin } from './goblin';
import { bundledRasterSkin } from './image-skin';
import type { BalloonSkin, SkinFactory } from './skin';

/** Balloons up at once; a new one beyond this fades the oldest out. */
export const MAX_BALLOONS = 5;
/** How long a balloon fades out when too many are up, s (it keeps its pace: no jump in speed). */
export const HURRY_FADE = 1.5;

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
  /** The notice's kind: kill, levelup, death, achievement. */
  kind: string;
  count: number;
  /** The passenger's mood. */
  face: string;
}

export interface Balloons {
  /** A notice: a kill joins the readable kill balloon's sign; anything else (and a kill without one) sends a new balloon up. */
  show(n: Notice): void;
  /** The balloons up now, oldest first (tests, dev). */
  list(): BalloonInfo[];
  destroy(): void;
}

interface Flight {
  skin: BalloonSkin;
  plan: FlightPlan;
  t: number;
  /** When too many are up: the time it began to fade out (null: not fading). */
  fadeAt: number | null;
  notices: Notice[];
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
  // The front layer right after the game pane: over the text, under the
  // input row and every pane. Decoration only (aria-hidden): the kill's
  // `◆` line already says it.
  const game = root.querySelector(':scope > .wc-game');
  if (game) game.after(front);
  else sky.after(front);

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
    const out = f.fadeAt === null ? 1 : 1 - (f.t - f.fadeAt) / HURRY_FADE;
    if (out <= 0) {
      f.phase = 'done';
      return;
    }
    const o = Math.round(fr.opacity * out * 100) / 100;
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
      f.t += dt;
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

  const launch = (k: Notice): void => {
    // Too many up: the oldest fades out where it flies (the very oldest goes at once beyond the cap).
    while (flights.length >= MAX_BALLOONS + 1) flights.shift()!.skin.destroy();
    if (flights.length >= MAX_BALLOONS) {
      const old = flights.find((f) => f.fadeAt === null);
      if (old) old.fadeAt = old.t;
    }
    let near: Flight | null = null;
    for (const f of flights) if (f.phase === 'arrive' || f.phase === 'read' || f.phase === 'glide') near = f;
    const skin = skinOf(doc);
    skin.el.classList.add('wc-balloon');
    const plan = planFlight(Math.floor(random() * 2 ** 32), host.geometry(), skin.size.w, skin.size.h, { reduced: reduced(), avoidX: near ? near.x : null });
    const f: Flight = { skin, plan, t: 0, fadeAt: null, notices: [k], front: null, x: plan.start.x, phase: 'arrive', opacity: -1 };
    const sign = signFor(f.notices);
    skin.setMood(sign.mood);
    skin.setSign(sign, false);
    flights.push(f);
    place(f);
    if (!raf) last = win.performance.now();
    schedule();
  };

  return {
    show(n) {
      if (destroyed) return;
      // Only kills join, and only the newest kill balloon's sign while it is
      // readable (a level up, a death or an achievement may have risen after
      // it); those three always rise alone.
      let top: Flight | undefined;
      if (isKillNotice(n)) for (let i = flights.length - 1; i >= 0 && !top; i--) if (isKillNotice(flights[i]!.notices[0]!)) top = flights[i];
      if (top && top.fadeAt === null && canJoin(top.plan, top.t)) {
        top.notices.push(n);
        extendRead(top.plan);
        const s = signFor(top.notices);
        top.skin.setMood(s.mood);
        top.skin.setSign(s, true);
        return;
      }
      launch(n);
    },
    list() {
      return flights.map((f) => ({ phase: f.phase, front: !!f.front, kind: kindOf(f.notices[0]!), count: f.notices.length, face: signFor(f.notices).mood }));
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
