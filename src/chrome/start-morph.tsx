// Layout B "Rummet växer" on the start surface (stage 42a, ADR 0127): the
// morph between the top frame's box and the next one's.
//
// Pages are laid out at their final size from their first frame: the new
// box is in place but hidden (an `opacity: 0` animation on its element,
// so container queries, CodeMirror and
// pagination measure the real box at mount, keys go to the new frame at
// once and its fields can take the focus at mount). An empty iron frame, the
// proxy (`.wc-lk-morph`, owned by the surface), carries the motion from the
// old box's rectangle to the new one's; when it lands the real box shows
// under it on the same clock, the proxy goes and the content fades in. The
// plan of each change is `morphPlan` (src/chrome/kit/look-motion.ts, pure);
// this file runs it with Web Animations, every one on the document
// timeline, so the hand-overs (old box out, proxy in, proxy out, new box
// in) fall on the same frame.
//
// The proxy flies in one of two ways (stage 74, ADR 0164; `proxyInPieces`).
// On a desktop it is one box whose `left`, `top`, `width` and `height` are
// animated: laid out and painted every frame on the main thread, which a
// desktop has to spare. On a phone or a tablet it is drawn in pieces
// (`proxyFlight`, look-motion.ts; `MorphProxy`, start-surface.tsx;
// look.css), each moved, scaled or faded by an animation the compositor
// runs, so a frame of the flight is no layout, no paint and no raster, and
// the main thread's work (the new page's mount, a first-use cost) cannot
// hold it back; only the hood's width is still laid out there (a small
// plate, and its position is its holder's transform). The proxy's
// rectangle mid-flight is `proxyRect`.
//
// Each look frame on the surface is wrapped in a `LookHost` (the surface's
// `wrap`): it tells the stage when its frame becomes the top one, carries
// the frame's outermost box (`BoxHostCtx`) and its settled state
// (`useBoxSettled`). The stage keeps the top box's rectangle current with
// a ResizeObserver (never per frame), and from it whether a large box
// covers most of the view (the sky's calm rate). A new box whose rectangle
// changes while the proxy is on its way to it (content that comes a moment
// after the mount, as the Profile list's; our keyboard opening on a phone)
// retargets the flight: it lands on the box as it is (`retarget`).
//
// The stack's hold (42c, `FrameStackProps.hold`) keeps the old frame drawn
// while its content fades; without it the old frame goes at once and the
// proxy starts from its last known rectangle. A frame change during a
// morph reverses it from where the proxy is.

import type { ComponentChildren, VNode } from 'preact';
import { createContext } from 'preact';
import { useContext, useLayoutEffect, useMemo, useState } from 'preact/hooks';
import {
  type BoxKind,
  type BoxReport,
  BoxHostCtx,
  BoxSettledCtx,
  type MorphEnd,
  type MorphFlight,
  type MorphPlan,
  type MorphRect,
  PLAIN_HOOD,
  morphHold,
  morphPlan,
  PROXY_PIECES,
  type ProxyFlight,
  type ProxyPiece,
  planLength,
  proxyFlight,
  reducedMotion,
  snapRect,
} from './kit/look';
import { device } from '../core/device';
import { useIsOverlay, useIsTopFrame } from './kit/stack';

/** A large box covering at least this share of the view calms the sky behind it. */
export const CALM_COVER = 0.85;

/**
 * ms a held frame stays mounted past its plan's need. The hold is a timer
 * from the frame change; the plan runs on the animation clock, which
 * starts with the first frame after it, and that frame is the new page's
 * mount: late on a slow device (a phone's first visit, a loaded browser).
 * The old frame hides itself on the animation clock, so the slack never
 * shows it longer; it must only outlast that first frame, or nothing is
 * drawn between the old box and the proxy.
 */
const HOLD_SLACK = 400;

/** What the stage knows of one frame on the surface. */
interface Host {
  id: number;
  /** The frame's element (`.wc-frame`). */
  frame(): HTMLElement | null;
  /** The frame's outermost box, if any (`grid` for an old-look frame). */
  box: BoxReport | null;
  grid: boolean;
  setSettled(on: boolean): void;
  /** Animations the stage put on this frame (cancelled when it is the top again). */
  anims: Animation[];
}

interface Observed {
  rect: MorphRect | null;
  hood: number;
}

const rectOf = (el: Element): MorphRect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

const drawn = (el: Element | null | undefined): boolean => !!el && el.isConnected && el.getClientRects().length > 0;

const kindOf = (host: Host | null): BoxKind => (!host ? 'none' : host.grid ? 'grid' : (host.box?.kind ?? 'none'));

/** The content of a box that fades: the window's children, the hood's title, Back. */
function contentOf(box: Element): Element[] {
  return [
    ...box.querySelectorAll(':scope > .wc-lk-win > *, :scope > .wc-lk-hood > .wc-lk-hood-t, :scope > .wc-lk-back'),
  ];
}

const hoodWidth = (box: Element): number => {
  const hood = box.querySelector<HTMLElement>(':scope > .wc-lk-hood');
  return hood ? hood.offsetWidth || PLAIN_HOOD : PLAIN_HOOD;
};

const geo = (r: MorphRect): Keyframe => ({
  left: `${r.left}px`,
  top: `${r.top}px`,
  width: `${r.width}px`,
  height: `${r.height}px`,
  visibility: 'visible',
});

/**
 * Whether the proxy is drawn in pieces and flies on the compositor (a
 * phone or a tablet), or is one laid-out box (a desktop). Measured (ADR
 * 0164): in pieces the flight needs nothing of the main thread, which is
 * what a phone is short of, but its large pieces are rastered whole when
 * the flight starts, which on a large desktop window cost a frame or two
 * that the laid-out proxy does not drop there. `?morph=pieces` and
 * `?morph=layout` force either (to compare on a device).
 */
export function proxyInPieces(): boolean {
  let asked: string | null = null;
  try {
    asked = new URLSearchParams(globalThis.location?.search ?? '').get('morph');
  } catch {
    // no address: the device decides
  }
  if (asked === 'pieces') return true;
  if (asked === 'layout') return false;
  return device().phone;
}

/** The proxy's pieces in the DOM (`MorphProxy`, start-surface.tsx). */
export const PROXY_PIECE_CLASS: Record<ProxyPiece, string> = {
  shadowFrom: 'wc-lk-px-shadow-a',
  shadowTo: 'wc-lk-px-shadow-b',
  pane: 'wc-lk-px-pane',
  top: 'wc-lk-px-e-t',
  bottom: 'wc-lk-px-e-b',
  left: 'wc-lk-px-e-l',
  right: 'wc-lk-px-e-r',
  tl: 'wc-lk-px-c-tl',
  tr: 'wc-lk-px-c-tr',
  bl: 'wc-lk-px-c-bl',
  br: 'wc-lk-px-c-br',
  hood: 'wc-lk-px-h',
};

const piece = (proxy: Element, p: ProxyPiece): HTMLElement | null => proxy.querySelector<HTMLElement>(`:scope > .${PROXY_PIECE_CLASS[p]}`);

/** Where the proxy is now: in pieces its pane's rectangle (drawn at the flight's larger size and scaled to the proxy's), else its own. */
function proxyRect(proxy: Element): MorphRect {
  return rectOf(piece(proxy, 'pane') ?? proxy);
}

/** An animation that keeps a new box hidden until its landing. */
type Tagged = Animation & { wcLand?: boolean };

/** A cancelled animation rejects its `finished`; nobody waits on most of them. */
function quiet(a: Animation): Animation {
  a.finished?.catch(() => {});
  return a;
}

const canAnimate = (el: Element): boolean => typeof (el as HTMLElement).animate === 'function';

export interface MorphStageOptions {
  /** The surface's root (its data attributes: `data-lk-box`, `data-lk-morph`, `data-lk-from`). */
  root(): HTMLElement | null;
  /** The proxy element (`.wc-lk-morph`). */
  proxy(): HTMLElement | null;
  /** A large box covers ≥ 85 % of the view (or no longer does). */
  onCalm(calm: boolean): void;
  /**
   * No morph and no hold now (the start page's arrival on a page,
   * src/chrome/start-arrival.ts): a frame change shows the new frame at
   * once and hides the old one. Default: never.
   */
  still?(): boolean;
}

/** The start surface's morph controller (one per surface). */
export class MorphStage {
  private cur: Host | null = null;
  private seen = new WeakMap<Host, Observed>();
  private nextId = 1;
  private flight: Animation | null = null;
  /** The running flight's plan and its pieces' animations (`retarget`). */
  private flying: { f: MorphFlight; to: Host; pieces: Partial<Record<ProxyPiece, Animation>> } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ro: ResizeObserver | null = null;
  private observedBox: Element | null = null;
  private calm = false;
  private disposed = false;
  /** The last plan (tests, the gallery's readout). */
  last: MorphPlan | null = null;

  constructor(private readonly o: MorphStageOptions) {}

  newHost(setSettled: (on: boolean) => void, grid: boolean): Host {
    const host: Host = {
      id: this.nextId++,
      // The frame's element, found from its box (a frame without a box never morphs).
      frame: () => (host.box?.el.closest('.wc-frame') as HTMLElement | null) ?? null,
      box: null,
      grid,
      setSettled,
      anims: [],
    };
    return host;
  }

  /**
   * The stack's hold for a change away from the current top frame (42c's
   * `hold`): the plan's need plus `HOLD_SLACK`. The hold is a timer from
   * the frame change, the plan runs on the animation clock, which starts
   * a frame or two later; the old frame hides itself on that clock (its
   * `hide` at `out`), so the slack never shows it longer, it only keeps it
   * mounted until the proxy has taken over.
   */
  hold(dir: 'push' | 'pop'): number {
    if (this.o.still?.()) return 0;
    const ms = morphHold(kindOf(this.cur), dir, reducedMotion());
    return ms > 0 ? ms + HOLD_SLACK : 0;
  }

  /**
   * A frame's outermost box reported itself. A box that goes (null: its
   * frame unmounts, or renders another box next) is kept as the frame's
   * last box: a popped frame is where the next morph starts from.
   */
  boxChanged(host: Host, box: BoxReport | null): void {
    if (!box) return;
    const was = host.box;
    host.box = box;
    if (host !== this.cur) return;
    if (was?.el !== box?.el) this.observe(host);
    this.mark(host);
  }

  /** A frame became the stack's top frame: plan and run the change from the previous one. */
  top(host: Host): void {
    if (this.disposed || host === this.cur) return;
    const prev = this.cur;
    this.cur = host;
    const reduced = reducedMotion();
    const proxy = this.o.proxy();
    // Where the old box is: the proxy's rectangle mid-flight, else the old box (drawn: held) or its last rectangle.
    const flying = !!proxy && !!this.flight && this.flight.playState === 'running' && drawn(proxy) && proxyShown(proxy);
    const prevBox = prev?.box?.el ?? null;
    const prevDrawn = drawn(prevBox) && drawn(prev?.frame());
    // Landed: its box is no longer kept hidden for an earlier flight (its content may still be fading in).
    const prevLanded = !!prev && !prev.anims.some((a) => a.playState === 'running' && (a as Tagged).wcLand);
    const seen = prev ? this.seen.get(prev) : undefined;
    const from: MorphEnd | null = prev
      ? {
          kind: kindOf(prev),
          rect: flying ? proxyRect(proxy!) : prevDrawn && prevBox ? rectOf(prevBox) : (seen?.rect ?? null),
          hood: prevDrawn && prevBox ? hoodWidth(prevBox) : (seen?.hood ?? PLAIN_HOOD),
          shown: prevDrawn && prevLanded && !flying,
          flying,
        }
      : null;
    // The new box, laid out at its final size already (it is hidden below before the first paint).
    this.cancel(host);
    const box = host.box?.el ?? null;
    const to: MorphEnd | null = box ? { kind: kindOf(host), rect: rectOf(box), hood: hoodWidth(box) } : { kind: kindOf(host), rect: null };
    // Still (an arrival): no `from`, so the plan is none.
    const plan = morphPlan(this.o.still?.() ? null : from, to, reduced);
    this.last = plan;
    this.stopFlight();
    this.run(plan, prev, host, from);
    this.observe(host);
    this.mark(host);
  }

  /**
   * A frame left the surface (popped and unmounted). It stays the stage's
   * last top until the next one says so (an unmount runs before the next
   * frame's effects): its last rectangle is where the next morph starts.
   */
  gone(host: Host): void {
    host.anims = [];
  }

  dispose(): void {
    this.disposed = true;
    this.stopFlight();
    this.ro?.disconnect();
    if (this.timer) clearTimeout(this.timer);
  }

  /** The surface was resized: the top box may have moved without changing size. */
  resized(): void {
    const host = this.cur;
    if (host) this.measure(host);
  }

  // ---------------------------------------------------------------- running a plan

  private run(plan: MorphPlan, prev: Host | null, next: Host, from: MorphEnd | null): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const box = next.box?.el ?? null;
    const prevFrame = prev?.frame() ?? null;
    const prevBox = prev?.box?.el ?? null;
    const root = this.o.root();
    if (root) {
      root.dataset['lkMorph'] = plan.type;
      // For the scenery's own transitions (start.css): the kind of box this change comes from, and
      // the plan's clock on the scenery's element (the wordmark moves with the flight between the
      // menu's place and a sub-page's; on a phone it comes back after a tall box has landed).
      root.dataset['lkFrom'] = from?.kind ?? 'none';
      const scenery = root.querySelector<HTMLElement>(':scope > .wc-start-scenery');
      scenery?.style.setProperty('--lk-fly-at', `${plan.flight ? plan.flight.at : plan.out}ms`);
      scenery?.style.setProperty('--lk-fly-land', `${plan.land}ms`);
    }

    // The old frame: its content (or its whole box) fades, then it hides; its own scenery fades.
    if (prev && prevFrame && drawn(prevFrame)) {
      const hideAt = Math.max(plan.out, plan.sceneryOut);
      if (prevBox && from?.shown) {
        if (plan.whole) this.fade(prev, [prevBox], 0, plan.out);
        else if (plan.out > 0) this.fade(prev, contentOf(prevBox), 0, plan.out);
        this.hide(prev, prevBox, 0, plan.out, true);
      } else if (prevBox) this.hide(prev, prevBox, 0, 0, true);
      if (plan.sceneryOut > 0) this.fade(prev, [...prevFrame.querySelectorAll('.wc-lk-fades')], 0, plan.sceneryOut);
      this.hide(prev, prevFrame, 0, hideAt, true);
    }

    // The proxy.
    const proxy = this.o.proxy();
    const f = plan.flight;
    if (f && proxy && canAnimate(proxy)) {
      proxy.hidden = false;
      const timing: KeyframeAnimationOptions = { delay: f.at, duration: f.ms, easing: f.easing, fill: 'backwards' };
      this.flying = { f, to: next, pieces: {} };
      if (piece(proxy, 'pane')) this.flight = this.flyPieces(proxy, f.from, f.to, timing);
      // Laid out: the proxy's own geometry, visible from the start to the landing.
      else this.flight = quiet(proxy.animate([geo(f.from), geo(f.to)], timing));
      // Hidden until `show` (a later animation wins).
      if (f.show > 0) quiet(proxy.animate([{ visibility: 'hidden' }, { visibility: 'hidden' }], { duration: f.show }));
      const hood = proxy.querySelector<HTMLElement>('.wc-lk-hood');
      if (hood && canAnimate(hood)) {
        const frames: Keyframe[] =
          f.hood.mode === 'open'
            ? [{ width: `${f.hood.from}px` }, { width: `${f.hood.from}px`, offset: f.hood.until }, { width: `${f.hood.to}px` }]
            : [{ width: `${f.hood.from}px` }, { width: `${f.hood.to}px`, offset: f.hood.until }, { width: `${f.hood.to}px` }];
        quiet(hood.animate(frames, timing));
      }
      const flight = this.flight;
      flight.finished.then(
        () => {
          if (this.flight === flight) {
            this.flight = null;
            this.flying = null;
            proxy.hidden = true;
          }
        },
        () => {},
      );
    }

    // The new frame: its box hidden until the landing, then its content (or the whole box) fades in.
    const firstIn = next.anims.length;
    if (box) {
      if (plan.land > 0) this.hide(next, box, 0, plan.land, false);
      if (plan.in > 0) {
        if (plan.whole) this.fade(next, [box], 1, plan.in, plan.land);
        else this.fade(next, contentOf(box), 1, plan.in, plan.land);
      }
    }
    const nextFrame = next.frame();
    if (nextFrame && plan.sceneryIn > 0) this.fade(next, [...nextFrame.querySelectorAll('.wc-lk-fades')], 1, plan.sceneryIn, plan.land);

    // Settled once the content has faded in (at once with reduced motion or when nothing moves):
    // when its animations have finished (on the animation clock, which a loaded browser may run
    // behind the timers), and not before their planned length.
    const length = plan.land + plan.in;
    if (plan.type === 'none' || reducedMotion() || length <= 0) next.setSettled(true);
    else {
      next.setSettled(false);
      const ins = next.anims.slice(firstIn).map((a) => a.finished);
      const timed = new Promise<void>((done) => {
        this.timer = setTimeout(() => {
          this.timer = null;
          done();
        }, length);
      });
      const plan0 = plan;
      Promise.all([timed, ...ins]).then(
        () => {
          if (this.cur === next && this.last === plan0) next.setSettled(true);
        },
        () => {},
      );
    }
    const total = planLength(plan);
    if (root && total > 0) {
      setTimeout(() => {
        if (this.last === plan && root.dataset['lkMorph'] === plan.type) delete root.dataset['lkMorph'];
      }, total);
    } else if (root) delete root.dataset['lkMorph'];
  }

  /**
   * Fades `els` to `to` (0 or 1) over `ms` from `delay`: out from where each
   * one is now, in from 0 (held at 0 until `delay`). A newer animation wins
   * over an older one on the same element, so a reversal needs no cancel.
   */
  private fade(host: Host, els: Element[], to: 0 | 1, ms: number, delay = 0): void {
    for (const el of els) {
      if (!canAnimate(el)) continue;
      const now = to === 1 ? 0 : Number.parseFloat(getComputedStyle(el).opacity || '1');
      const a = quiet(el.animate([{ opacity: now }, { opacity: to }], {
        duration: ms,
        delay,
        easing: 'ease',
        fill: to === 0 ? 'forwards' : 'backwards',
      }));
      host.anims.push(a);
    }
  }

  /**
   * `after`: `el` hides at `from + ms` and stays hidden until the frame is
   * the top again (a leaving frame); else it is hidden over `[0, from + ms]`
   * and shows after (a new box until its landing).
   */
  private hide(host: Host, el: Element, from: number, ms: number, after: boolean): void {
    if (!canAnimate(el)) return;
    // A leaving frame hides by `visibility` (nothing in it is reachable any
    // more). A new box is only transparent until it lands: what is under
    // `visibility: hidden` cannot take the DOM focus, so a field's or an
    // editor's focus at mount would be lost. It takes the pointer as it
    // takes the keys, at once (the new frame is the top one).
    const gone: Keyframe = { opacity: 0 };
    const frames: Keyframe[] = after ? [{ visibility: 'visible' }, { visibility: 'hidden' }] : [gone, gone];
    const a = quiet(
      el.animate(frames, {
        duration: ms,
        delay: from,
        fill: after ? 'forwards' : 'backwards',
      }),
    );
    if (!after) (a as Tagged).wcLand = true;
    host.anims.push(a);
  }

  /**
   * The proxy in pieces (a touch device): each piece is drawn once for this
   * flight, then only transformed and faded, which the compositor does.
   * Returns the animation the flight ends with.
   */
  private flyPieces(proxy: HTMLElement, from: MorphRect, to: MorphRect, timing: KeyframeAnimationOptions): Animation {
    const dpr = proxy.ownerDocument.defaultView?.devicePixelRatio || 1;
    const pieces = proxyFlight(snapRect(from, dpr), snapRect(to, dpr));
    this.sizePieces(proxy, pieces);
    // Visible from the start to the landing.
    const shown = quiet(proxy.animate([{ visibility: 'visible' }, { visibility: 'visible' }], timing));
    let lead: Animation | null = null;
    for (const p of PROXY_PIECES) {
      const el = piece(proxy, p);
      if (!el || !canAnimate(el)) continue;
      const a = quiet(el.animate(pieceFrames(pieces, p), timing));
      if (this.flying) this.flying.pieces[p] = a;
      if (p === 'pane') lead = a;
    }
    return lead ?? shown;
  }

  /** The sizes the pieces are drawn at for a flight: the pane and the edges at the larger, each end's shadows at its own. */
  private sizePieces(proxy: HTMLElement, pieces: ProxyFlight): void {
    proxy.style.setProperty('--lk-mw', `${pieces.maxSize.width}px`);
    proxy.style.setProperty('--lk-mh', `${pieces.maxSize.height}px`);
    const sized: [ProxyPiece, { width: number; height: number }][] = [
      ['shadowFrom', pieces.fromSize],
      ['shadowTo', pieces.toSize],
    ];
    for (const [p, size] of sized) {
      const el = piece(proxy, p);
      if (!el) continue;
      el.style.width = `${size.width}px`;
      el.style.height = `${size.height}px`;
    }
  }

  /**
   * The new box's rectangle changed while the proxy is on its way to it (a
   * page whose content comes a moment after its mount, as the Profile
   * list's; on a phone our keyboard opening for a field that took the
   * focus at mount): the flight keeps its clock and lands on the box as
   * it now is. Before the proxy has moved, which is the usual case,
   * nothing of it shows; later the proxy steps by its progress's share of
   * the change instead of the box jumping by all of it at the landing.
   */
  private retarget(host: Host, rect: MorphRect): void {
    const fl = this.flying;
    const proxy = this.o.proxy();
    if (!fl || fl.to !== host || !this.flight || !proxy || this.flight.playState === 'finished') return;
    const same =
      Math.abs(fl.f.to.left - rect.left) < 0.5 &&
      Math.abs(fl.f.to.top - rect.top) < 0.5 &&
      Math.abs(fl.f.to.width - rect.width) < 0.5 &&
      Math.abs(fl.f.to.height - rect.height) < 0.5;
    if (same) return;
    fl.f.to = rect;
    const set = (a: Animation | null | undefined, frames: Keyframe[]): void => {
      (a?.effect as KeyframeEffect | null | undefined)?.setKeyframes?.(frames);
    };
    if (!piece(proxy, 'pane')) {
      set(this.flight, [geo(fl.f.from), geo(rect)]);
      return;
    }
    const dpr = proxy.ownerDocument.defaultView?.devicePixelRatio || 1;
    const pieces = proxyFlight(snapRect(fl.f.from, dpr), snapRect(rect, dpr));
    this.sizePieces(proxy, pieces);
    for (const p of PROXY_PIECES) set(fl.pieces[p], pieceFrames(pieces, p));
  }

  /** Cancels what the stage put on a frame (it is the top again). */
  private cancel(host: Host): void {
    for (const a of host.anims) a.cancel();
    host.anims = [];
  }

  private stopFlight(): void {
    const proxy = this.o.proxy();
    if (!proxy) return;
    for (const a of proxy.getAnimations?.({ subtree: true }) ?? []) a.cancel();
    this.flight = null;
    this.flying = null;
    proxy.hidden = true;
  }

  // ---------------------------------------------------------------- the top box's rectangle

  private observe(host: Host): void {
    const el = host.box?.el ?? null;
    if (el === this.observedBox) {
      this.measure(host);
      return;
    }
    this.ro?.disconnect();
    this.observedBox = el;
    const RO = el?.ownerDocument.defaultView?.ResizeObserver;
    if (el && RO) {
      this.ro ??= new RO(() => this.cur && this.measure(this.cur));
      this.ro.observe(el);
    }
    this.measure(host);
  }

  private measure(host: Host): void {
    const el = host.box?.el;
    if (!el || !drawn(el)) {
      this.setCalm(false);
      return;
    }
    const rect = rectOf(el);
    this.seen.set(host, { rect, hood: hoodWidth(el) });
    this.retarget(host, rect);
    const view = el.ownerDocument.defaultView;
    const area = (view?.innerWidth ?? 0) * (view?.innerHeight ?? 0);
    this.setCalm(host.box?.kind === 'large' && area > 0 && (rect.width * rect.height) / area >= CALM_COVER);
  }

  private setCalm(on: boolean): void {
    if (on === this.calm) return;
    this.calm = on;
    this.o.onCalm(on);
  }

  /** The top box's kind on the surface's root (`data-lk-box`: the phone hides the wordmark for a tall box). */
  private mark(host: Host): void {
    const root = this.o.root();
    if (root) root.dataset['lkBox'] = kindOf(host);
  }
}

/** A piece's keyframes for a flight: its transform at each end, and for the shadows their cross-fade. */
function pieceFrames(pieces: ProxyFlight, p: ProxyPiece): Keyframe[] {
  const fade = pieces.fade[p];
  return fade
    ? [
        { transform: pieces.from[p], opacity: fade[0] },
        { transform: pieces.to[p], opacity: fade[1] },
      ]
    : [{ transform: pieces.from[p] }, { transform: pieces.to[p] }];
}

/** Whether the proxy is visible now (its animations may hide it before its flight). */
function proxyShown(proxy: HTMLElement): boolean {
  return getComputedStyle(proxy).visibility !== 'hidden';
}

// ------------------------------------------------------------------ the frame host

export const MorphCtx = createContext<MorphStage | null>(null);

/**
 * Wraps a frame on the start surface (the surface's `wrap`): tells the
 * stage when the frame becomes the top one (never for an overlay frame:
 * the page under it stays drawn and keeps its box), takes its outermost box's
 * report and provides `useBoxSettled`. `grid`: an old-look frame (no box;
 * it covers the sky).
 */
export function LookHost(p: { grid?: boolean; children: ComponentChildren }): VNode {
  const stage = useContext(MorphCtx);
  // An overlay (a dialog over the page) is no page change: the page's box stays the stage's top box.
  const topFrame = useIsTopFrame();
  const overlay = useIsOverlay();
  const top = topFrame && !overlay;
  const [settled, setSettled] = useState(() => !stage || reducedMotion());
  const host = useMemo(() => stage?.newHost(setSettled, !!p.grid) ?? null, [stage]);
  const report = useMemo(() => (stage && host ? (b: BoxReport | null) => stage.boxChanged(host, b) : null), [stage, host]);
  useLayoutEffect(() => {
    if (top && stage && host) stage.top(host);
  }, [top, stage, host]);
  useLayoutEffect(() => () => host && stage?.gone(host), [stage, host]);
  // No element of its own: the frame's content stays the frame's direct child.
  return (
    <BoxHostCtx.Provider value={report}>
      <BoxSettledCtx.Provider value={settled}>{p.children}</BoxSettledCtx.Provider>
    </BoxHostCtx.Provider>
  );
}
