// Balloon notices, main thread (stage 69, ADR 0159). A lazy chunk of its
// own: the weather controller imports it only while Weather effects and
// Balloons are both on (or `#weather balloon` / the demo asks for one),
// and never in the phone's layout (desktop only, round 2).
//
// Each balloon is a skin's element (skin.ts; since stage 75 the shared rig,
// rig.ts, with the passenger the player's race gives, passenger.ts) moved
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
// it changes and the skin's own parts. Nothing on the text path; no
// layout read per frame (the flight plans with the skin's fixed size and
// the weather's last measured geometry; the rig measures a sign's text
// once, when it is set).
//
// Stage 75: the passengers. Each passenger is a lazy chunk of its own
// (passenger.ts `loadPassenger`); the sign faces load with the balloons
// (fonts.ts). The player's passenger and the faces are fetched when the
// balloons start; a notice whose passenger is not loaded yet waits for it
// (notices keep their order, and a kill that comes meanwhile still joins).
// The burner is the flight's (flight.ts `burnTarget`, followed per balloon
// by `burnStep`). A balloon far into its leave rests (`REST_AFTER`): its
// passenger's life and the rig's parts stop; only the whole still moves.

import './balloons.css';
import { type Notice, isKillNotice, kindOf, signFor } from './feed';
import { BURN_STILL, type FlightPlan, type LaneGeom, burnStep, burnTarget, canJoin, extendRead, flightAt, planFlight } from './flight';
import { addSignFonts, removeSignFonts } from './fonts';
import { type PassengerId, loadPassenger } from './passenger';
import { type Rig, type RigCtx, type SkyMode, createRig } from './rig';
import { type BalloonSkin, RIG_SIZE, type SkinFactory } from './skin';

/** Balloons up at once; a new one beyond this fades the oldest out. */
export const MAX_BALLOONS = 5;
/** How long a balloon fades out when too many are up, s (it keeps its pace: no jump in speed). */
export const HURRY_FADE = 1.5;
/**
 * When a leaving balloon rests (skin.ts `rest`): once its leave has run
 * `min` s and it has shrunk to `shrunk` of its readable size, or after
 * `max` s whatever its size. Far and small by then, behind the text.
 */
export const REST_AFTER = { min: 8, shrunk: 0.6, max: 20 } as const;

export interface BalloonsHost {
  /** The cockpit (the weather canvases' root). */
  root: HTMLElement;
  /** The layout as the weather engine last measured it. */
  geometry: () => LaneGeom;
  /** A fixed look for every balloon (tests); default: the rig with the player's passenger. */
  skin?: SkinFactory;
  /** The player's passenger, read when a balloon is made (the race may change; default: the goblin). */
  passenger?: () => PassengerId;
  /** The sky behind the balloons, read when a balloon is made (default: night). */
  sky?: () => SkyMode;
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
  /** Who flies it ('' for a fixed skin). */
  passenger: string;
  /** Resting: far away, its parts frozen. */
  rest: boolean;
}

export interface ShowOpts {
  /** This passenger instead of the player's (`#weather balloon as …`). */
  passenger?: PassengerId;
}

export interface Balloons {
  /** A notice: a kill joins the readable kill balloon's sign; anything else (and a kill without one) sends a new balloon up. */
  show(n: Notice, opts?: ShowOpts): void;
  /** Resolves when every notice shown so far is up (its passenger loaded; tests, dev). */
  idle(): Promise<void>;
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
  /** The burner's level (flight.ts `burnStep`). */
  burn: number;
  passenger: string;
  resting: boolean;
}

export function startBalloons(host: BalloonsHost): Balloons {
  const { root } = host;
  const doc = root.ownerDocument;
  const win = doc.defaultView ?? window;
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

  // ---- the looks: a fixed skin (tests), or the rig with a passenger, each loaded once
  const ctx: RigCtx = { doc, reduced: reduced(), skyMode: () => host.sky?.() ?? 'night', pace: () => 1 };
  const rigs = new Map<PassengerId, Promise<Rig>>();
  const made: Rig[] = [];
  /** The faces, asked for once (only when a rig is wanted). */
  let fonts: Promise<void> | null = null;
  const rigFor = (id: PassengerId): Promise<Rig> => {
    let r = rigs.get(id);
    if (!r) {
      fonts ??= addSignFonts(doc);
      r = Promise.all([loadPassenger(id), fonts]).then(([m]) => {
        const rig = createRig(ctx, m.passenger.spec(ctx));
        if (destroyed) rig.destroy();
        else made.push(rig);
        return rig;
      });
      // a failed load may be tried again by the next notice
      r.catch(() => rigs.delete(id));
      rigs.set(id, r);
    }
    return r;
  };
  /** The rigs already made, by passenger (a notice for one launches at once). */
  const ready = new Map<PassengerId, Rig>();
  const who = (o?: ShowOpts): PassengerId => o?.passenger ?? host.passenger?.() ?? 'goblin';

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
    if (!f.resting) {
      const p = f.plan, leave = f.t - p.ta - p.read;
      if (!p.reduced && leave >= REST_AFTER.min && (fr.scale <= p.scale * REST_AFTER.shrunk || leave >= REST_AFTER.max)) {
        f.resting = true;
        f.skin.rest?.();
        return;
      }
      f.skin.frame?.({ t: f.t, phase: fr.phase, tilt: fr.tilt, swing: fr.swing, burn: f.burn });
    }
  };

  const tick = (now: number): void => {
    raf = 0;
    if (destroyed) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    for (let i = 0; i < flights.length; i++) {
      const f = flights[i]!;
      f.t += dt;
      f.burn = f.plan.reduced ? BURN_STILL : burnStep(f.burn, burnTarget(f.plan, f.t), dt);
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

  const launch = (k: Notice, make: SkinFactory, passenger: string): void => {
    // Too many up: the oldest fades out where it flies (the very oldest goes at once beyond the cap).
    while (flights.length >= MAX_BALLOONS + 1) flights.shift()!.skin.destroy();
    if (flights.length >= MAX_BALLOONS) {
      const old = flights.find((f) => f.fadeAt === null);
      if (old) old.fadeAt = old.t;
    }
    const near = flights.filter((f) => f.phase === 'arrive' || f.phase === 'read' || f.phase === 'glide').map((f) => f.x);
    const notices = [k];
    const sign = signFor(notices);
    const skin = make(doc, { sign });
    skin.el.classList.add('wc-balloon');
    const plan = planFlight(Math.floor(random() * 2 ** 32), host.geometry(), skin.size.w, skin.size.h, { reduced: reduced(), avoidX: near });
    const f: Flight = { skin, plan, t: 0, fadeAt: null, notices, front: null, x: plan.start.x, phase: 'arrive', opacity: -1, burn: plan.reduced ? BURN_STILL : 1, passenger, resting: false };
    skin.setMood(sign.mood);
    skin.setSign(sign, false);
    flights.push(f);
    place(f);
    if (!raf) last = win.performance.now();
    schedule();
  };

  /** Joins a kill to the newest kill balloon's sign while it is readable; false: it needs a balloon of its own. */
  const join = (n: Notice): boolean => {
    // Only kills join, and only the newest kill balloon's sign while it is
    // readable (a level up, a death or an achievement may have risen after
    // it); those three always rise alone.
    let top: Flight | undefined;
    if (isKillNotice(n)) for (let i = flights.length - 1; i >= 0 && !top; i--) if (isKillNotice(flights[i]!.notices[0]!)) top = flights[i];
    if (!top || top.fadeAt !== null || !canJoin(top.plan, top.t)) return false;
    top.notices.push(n);
    extendRead(top.plan);
    const s = signFor(top.notices);
    top.skin.setMood(s.mood);
    top.skin.setSign(s, true);
    return true;
  };

  // Notices whose passenger is still loading wait here, in order.
  let queue: Promise<void> = Promise.resolve();
  let waiting = 0;
  const show = (n: Notice, o?: ShowOpts): void => {
    if (destroyed) return;
    if (host.skin) {
      if (!join(n)) launch(n, host.skin, '');
      return;
    }
    const id = who(o);
    if (waiting === 0) {
      if (join(n)) return;
      const rig = ready.get(id);
      if (rig) {
        launch(n, (_, init) => rig.make(init.sign), id);
        return;
      }
    }
    waiting++;
    queue = queue
      .then(() => rigFor(id))
      .then(
        (r) => {
          ready.set(id, r);
          if (!destroyed && !join(n)) launch(n, (_, init) => r.make(init.sign), id);
        },
        (err: unknown) => console.warn(`balloons: the ${id} passenger could not be loaded`, err),
      )
      .finally(() => waiting--);
  };

  // The player's passenger and the sign faces, fetched now, so the first balloon rises at once.
  if (!host.skin) {
    const id = who();
    rigFor(id).then((r) => ready.set(id, r), () => {});
  }

  return {
    show,
    idle: () => queue,
    list() {
      return flights.map((f) => ({ phase: f.phase, front: !!f.front, kind: kindOf(f.notices[0]!), count: f.notices.length, face: signFor(f.notices).mood, passenger: f.passenger, rest: f.resting }));
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) win.cancelAnimationFrame(raf);
      doc.removeEventListener('visibilitychange', onVis);
      for (const f of flights.splice(0)) f.skin.destroy();
      for (const r of made.splice(0)) r.destroy();
      if (fonts) removeSignFonts(doc);
      sky.remove();
      front.remove();
    },
  };
}
