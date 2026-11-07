// The start surface (stage 41, ADR 0125): the sky, the scenery around the
// top frame (wordmark, almanac, notices) and the start page's frame stack.
//
// Two kinds of frame share the one stack:
// - new-look frames (`lookFrame`, src/chrome/kit/look.tsx: the start menu,
//   the Profile list) are free DOM straight over the sky;
// - every other frame (Scripts, History, Credits, About, the editors, …)
//   is drawn exactly as before on the cell grid, over an opaque
//   terminal-coloured layer (`GridLayer`) that covers the sky.
// Keys, focus, Esc / Back and `show({ keep: true })` are the stack's, as
// before. The top frame tells the surface what it needs around it
// (`useScenery`): the full wordmark and the almanac (the menu), a smaller
// wordmark (a sub-page's box), nothing but the sky (a large box, layout B
// "Rummet växer": the wordmark lifts away, the almanac and the quote
// fade), or nothing at all (an old-look frame).
//
// Layout B (stage 42a, ADR 0127): the surface morphs from one box to the
// next with an empty iron proxy (src/chrome/start-morph.ts, `MorphStage`);
// every look frame is wrapped in a `LookHost` for it, the stack holds the
// old frame while it fades (`hold`), and a large box that covers most of
// the view calms the sky (`setRate('calm')`). A page may pause the sky
// while an opaque surface of its own covers it (`useSkyPause`).
//
// The sky (ADR 0124) is two things here. Its smooth part, the CSS
// gradients of the look model for the current game time, is on the sky's
// host at once (the same pixels the first paint showed, ADR 0083). The
// engine (sun, moon, stars, clouds, rain and snow) is a chunk of its own,
// imported when the surface mounts and mounted over that once the page is
// visible (on the first boot, after the reveal: `skyHold`); it fades its
// canvases in. It is disposed whenever the start page is hidden (the game,
// a player: its canvases and frame loop are not kept for an hour of play)
// and mounted again when it shows; it pauses while the document is hidden
// or an old-look frame covers it.
//
// Enter MUME's transition (`leaving`, src/chrome/enter-transition.ts): the
// page stays visible over the cockpit while its scenery fades away, the sky zooms and it fades; the
// sky keeps running, the frame stack lets go of the keys and the focus
// (they belong to the cockpit's input from the first moment) and the
// surface takes no pointer events.

import type { ComponentChildren, JSX, VNode } from 'preact';
import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { noticeIndicators } from '../app/notices';
import { CLIENT_VERSION } from '../core/build-info';
import { gameTimeAt } from '../gmcp/gametime';
import { startGameMinutes } from '../start/clock';
import '../start/geometry.css';
import type { StartSkyHandle } from '../start/sky';
import { type SkyLook, type SkyView, skyCss } from '../start/sky/look';
import { pageSkyParams } from '../start/sky/params';
import { startSkyLook } from '../start/start-look';
import { Wordmark } from '../start/wordmark';
import { GridCtx, useElementSize, useHostGrid, useNotices, useServices } from './kit/hooks';
import { MOTION, type Scenery, SceneryCtx, isLookFrame, reducedMotion, useScenery } from './kit/look';
import { centreLeft, minView, tooSmall, truncate } from './kit/nav';
import { FrameStack, useIsTopFrame } from './kit/stack';
import { almanacLines } from './start-layout';
import { LookHost, MorphCtx, MorphStage } from './start-morph';
import './start.css';

// ------------------------------------------------------------------ sky

/** The sky's current look for the page's text and wordmark (ADR 0125). */
export interface SkyStore {
  look(): SkyLook;
  subscribe(fn: (look: SkyLook) => void): () => void;
}

/** The window's size, the view a look is computed for when no host has been measured. */
const windowView = (): SkyView => ({ w: globalThis.innerWidth || 1440, h: globalThis.innerHeight || 900 });

/**
 * The surface's sky store: the engine's look while it is mounted (it pushes
 * changes a few times a second), else a still look of the start clock for
 * the sky host's size.
 */
export class SkyFeed implements SkyStore {
  private readonly subs = new Set<(look: SkyLook) => void>();
  private engine: StartSkyHandle | null = null;
  private off: (() => void) | null = null;
  private still: SkyLook | null = null;

  look(): SkyLook {
    return this.engine?.look() ?? (this.still ??= startSkyLook(windowView()));
  }

  subscribe(fn: (look: SkyLook) => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  /** The still look (no engine): computed now for `view`. */
  setStill(view: SkyView): SkyLook {
    this.still = startSkyLook(view);
    if (!this.engine) this.emit(this.still);
    return this.still;
  }

  attach(engine: StartSkyHandle): void {
    this.detach();
    this.engine = engine;
    this.off = engine.onLook((l) => this.emit(l));
    this.emit(engine.look());
  }

  detach(): void {
    this.off?.();
    this.off = null;
    this.engine = null;
  }

  private emit(look: SkyLook): void {
    for (const fn of this.subs) fn(look);
  }
}

export const SkyCtx = createContext<SkyStore | null>(null);

let fallback: SkyFeed | null = null;
const store = (): SkyStore => (fallback ??= new SkyFeed());

/** The sky's look, re-rendering on every change the sky pushes (a few times a second at most). */
export function useSkyLook(): SkyLook {
  const s = useContext(SkyCtx) ?? store();
  const [look, set] = useState(() => s.look());
  useEffect(() => {
    set(s.look());
    return s.subscribe(set);
  }, [s]);
  return look;
}

/** Where the text over the sky reads its background: the quote (under the menu) or the almanac (bottom right). */
export type InkSpot = 'quote' | 'almanac';

const backOf = (look: SkyLook, spot: InkSpot): number => (spot === 'quote' ? look.textBackLuminance : look.textBack.almanac);

/**
 * Whether the text at `spot` wants dark ink (a bright sky behind it), with
 * hysteresis so a sky near the threshold does not flicker.
 */
export function useDarkInk(spot: InkSpot = 'quote'): boolean {
  const s = useContext(SkyCtx) ?? store();
  const [ink, set] = useState(() => inkFor(backOf(s.look(), spot), false));
  useEffect(() => {
    const upd = (l: SkyLook): void => set((cur) => inkFor(backOf(l, spot), cur));
    upd(s.look());
    return s.subscribe(upd);
  }, [s, spot]);
  return ink;
}

/**
 * Whether the sky behind the text at `spot` is bright (luma above 0.42,
 * below 0.38 again), so pale ink needs a stronger outline: a day sky reads
 * about 0.48 to 0.51 at the quote, under the dark-ink threshold.
 */
export function useBrightBack(spot: InkSpot = 'quote'): boolean {
  const s = useContext(SkyCtx) ?? store();
  const at = (l: number, cur: boolean): boolean => (cur ? l >= 0.38 : l > 0.42);
  const [bright, set] = useState(() => at(backOf(s.look(), spot), false));
  useEffect(() => {
    const upd = (l: SkyLook): void => set((cur) => at(backOf(l, spot), cur));
    upd(s.look());
    return s.subscribe(upd);
  }, [s, spot]);
  return bright;
}

/**
 * Dark ink once the sky's luma behind the text is above 0.54, pale again
 * below 0.46 (ADR 0124: luma, the measure the mockup read from pixels, and
 * its hysteresis).
 */
export function inkFor(luma: number, cur: boolean): boolean {
  return cur ? luma >= 0.46 : luma > 0.54;
}

/** True while the calling frame is its stack's top frame (true outside a frame). */
function useTopOrFree(): boolean {
  try {
    return useIsTopFrame();
  } catch {
    return true;
  }
}

// ------------------------------------------------------------ sky pause

/** The surface's sky pause: a page registers while it covers the sky with an opaque surface of its own. */
const SkyPauseCtx = createContext<(() => () => void) | null>(null);

/**
 * Pauses the sky fully while `on` and the calling frame is the top one
 * (an opaque surface covers the box: the Spotlights viewer). No-op outside
 * the start surface.
 */
export function useSkyPause(on: boolean): void {
  const reg = useContext(SkyPauseCtx);
  const top = useTopOrFree();
  useEffect(() => {
    if (!reg || !on || !top) return;
    return reg();
  }, [reg, on, top]);
}

/**
 * The wordmark inside a page's content (About, Credits): it follows the
 * sky's light as the start page's does. No sheen by default: the masked
 * sweeping band costs frames over a page of text (stage 42 wave 3, ADR
 * 0127: 7–12 frames over 20 ms per pass in Chromium, more in Firefox);
 * with `sheen` it passes now and then while the frame is the top one. In
 * a window or the ESC menu it keeps the start clock's still light.
 */
export function LookWordmark(p: { size: 'small' | 'full'; class?: string; sheen?: boolean }): VNode {
  const look = useSkyLook();
  const top = useTopOrFree();
  return <Wordmark look={look} size={p.size} run={top && p.sheen === true} class={'wc-lk-wordmark' + (p.class ? ' ' + p.class : '')} />;
}

/** The document's visibility (the sky and the wordmark stop while hidden). */
function useDocHidden(): boolean {
  const [hidden, set] = useState(() => (typeof document !== 'undefined' ? document.hidden : false));
  useEffect(() => {
    const on = (): void => set(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return hidden;
}

type SkyModule = typeof import('../start/sky');

/** The sky engine's chunk, imported once (it is not needed for the first frame). */
let skyModule: Promise<SkyModule> | null = null;
const loadSky = (): Promise<SkyModule> => {
  skyModule ??= import('../start/sky');
  skyModule.catch(() => (skyModule = null));
  return skyModule;
};

// ------------------------------------------------------------- the surface

/** Smallest window (CSS px) the new-look start page lays out in; below it the size notice shows. */
export const LOOK_MIN = { w: 300, h: 340 } as const;

export interface StartSurfaceProps {
  visible: boolean;
  /** Enter MUME's transition is playing: no keys, focus or pointer events. */
  leaving?: boolean;
  /** A new frame stack on every change (show without `keep`). */
  epoch: number;
  root: VNode;
  /**
   * The sky engine mounts only once this settles (the first boot: after
   * the reveal, so its canvases fade in on screen over the first paint's
   * sky, not while the page is held invisible). Default: at once.
   */
  skyHold?: Promise<unknown> | null;
}

export function StartSurface(p: StartSurfaceProps): VNode {
  const ref = useRef<HTMLDivElement>(null);
  const skyHost = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const proxyRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(ref);
  const g = useHostGrid(ref);
  const docHidden = useDocHidden();
  const feed = useMemo(() => new SkyFeed(), []);

  // The scenery, and how the wordmark moves (layout B: it lifts from where
  // it rests, the full mark or the sub-page's smaller one, and settles back
  // with its own timing).
  const [scenery, setSceneryNow] = useState<Scenery>('main');
  const [liftSub, setLiftSub] = useState(false);
  const [fromLarge, setFromLarge] = useState(false);
  const sceneryNow = useRef<Scenery>('main');
  const setScenery = useCallback((s: Scenery) => {
    const was = sceneryNow.current;
    if (s === was) return;
    sceneryNow.current = s;
    if (s === 'large') {
      setLiftSub(was === 'sub');
      setFromLarge(false);
    } else if (was === 'large') setFromLarge(true);
    setSceneryNow(s);
  }, []);
  useEffect(() => {
    if (!fromLarge) return;
    const c = MOTION.close;
    const t = setTimeout(
      () => setFromLarge(false),
      Math.max(c.wordmark.delay + c.wordmark.ms, c.content.ms + c.box.ms + c.scenery.ms) + 60,
    );
    return () => clearTimeout(t);
  }, [fromLarge]);

  // Layout B's morph between boxes, and the sky's rate behind a large box.
  const [calm, setCalm] = useState(false);
  const stage = useMemo(
    () => new MorphStage({ root: () => ref.current, proxy: () => proxyRef.current, onCalm: setCalm }),
    [],
  );
  useEffect(() => () => stage.dispose(), [stage]);
  useEffect(() => stage.resized(), [stage, size.w, size.h]);
  const [pauses, setPauses] = useState(0);
  const pauseSky = useCallback(() => {
    setPauses((n) => n + 1);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      setPauses((n) => n - 1);
    };
  }, []);

  // The engine's chunk, and the hold before it may mount.
  const [mod, setMod] = useState<SkyModule | null>(null);
  useEffect(() => {
    let live = true;
    loadSky().then(
      (m) => live && setMod(m),
      (e) => console.error('WebCockpit: the start page sky could not load', e),
    );
    return () => {
      live = false;
    };
  }, []);
  const [held, setHeld] = useState(!!p.skyHold);
  useEffect(() => {
    if (!p.skyHold) {
      setHeld(false);
      return;
    }
    let live = true;
    const go = (): void => {
      if (live) setHeld(false);
    };
    p.skyHold.then(go, go);
    return () => {
      live = false;
    };
  }, [p.skyHold]);

  // The engine, while the page is visible.
  const sky = useRef<StartSkyHandle | null>(null);
  const [skyN, setSkyN] = useState(0);
  useLayoutEffect(() => {
    const host = skyHost.current;
    if (!host || !mod || held || !p.visible) return;
    let s: StartSkyHandle;
    try {
      s = mod.mountStartSky(host);
    } catch (e) {
      console.error('WebCockpit: the start page sky could not start', e);
      return;
    }
    sky.current = s;
    host.style.background = '';
    // ?skyStats: the engine's handle for bench/start-page-bench.ts (its stats).
    if (pageSkyParams().stats) (globalThis as { __wcSky?: StartSkyHandle }).__wcSky = s;
    feed.attach(s);
    setSkyN((n) => n + 1);
    return () => {
      feed.detach();
      s.dispose();
      sky.current = null;
      setSkyN((n) => n + 1);
    };
  }, [mod, held, p.visible]);

  // Without the engine: the smooth sky (the CSS gradients) for now and this size.
  useLayoutEffect(() => {
    const host = skyHost.current;
    if (!host || sky.current || !p.visible) return;
    const look = feed.setStill({ w: host.clientWidth || size.w, h: host.clientHeight || size.h });
    host.style.background = skyCss(look).all;
  }, [p.visible, size.w, size.h, skyN]);

  const covered = scenery === 'grid';
  useEffect(() => {
    sky.current?.setPaused(docHidden || covered || pauses > 0);
  }, [docHidden, covered, pauses, skyN]);
  useEffect(() => {
    sky.current?.setRate(calm ? 'calm' : 'full');
  }, [calm, skyN]);

  // The wordmark's height, for the frames' layout (`--wc-brand-h`).
  useLayoutEffect(() => {
    const el = brandRef.current;
    const surface = ref.current;
    const RO = el?.ownerDocument.defaultView?.ResizeObserver;
    if (!el || !surface) return;
    const put = (): void => surface.style.setProperty('--wc-brand-h', `${el.offsetHeight}px`);
    put();
    if (!RO) return;
    const ro = new RO(put);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lookSmall = size.w > 0 && (size.w < LOOK_MIN.w || size.h < LOOK_MIN.h);
  const gridSmall = g.cols > 0 && tooSmall(g.cols, g.rows);
  const paused = covered ? gridSmall : lookSmall;
  // The wordmark's sheen: not while hidden, covered, leaving (Enter MUME) or with reduced motion.
  const run = p.visible && !docHidden && !covered && scenery !== 'large' && !p.leaving && !reducedMotion();
  const wrap = (node: VNode): VNode =>
    isLookFrame(node) ? <LookHost>{node}</LookHost> : <GridFrame>{node}</GridFrame>;
  // The stack holds the old frame while its content fades (42c); only between two look frames.
  const hold = (from: VNode, to: VNode, dir: 'push' | 'pop'): number =>
    isLookFrame(from) && isLookFrame(to) ? stage.hold(dir) : 0;
  // An old-look frame's element is the cell grid itself, as before.
  const screen = { left: g.left, top: g.top, width: g.cols * g.cellW, height: g.rows * g.cellH };
  const frameAttrs = (node: VNode): { class: string; style: JSX.CSSProperties } | null =>
    isLookFrame(node) ? null : { class: 'wc-screen wc-start-gridframe', style: screen };

  return (
    <div
      class={
        `wc-chrome wc-start wc-look is-${scenery}` +
        (liftSub ? ' is-lift-sub' : '') +
        (fromLarge ? ' is-from-large' : '') +
        (lookSmall && !covered ? ' is-tiny' : '') +
        (gridSmall && covered ? ' is-grid-small' : '') +
        (p.leaving ? ' is-leaving' : '')
      }
      ref={ref}
      hidden={!p.visible}
    >
      <div class="wc-start-skyhost" ref={skyHost} aria-hidden="true" />
      <SkyCtx.Provider value={feed}>
        <div class="wc-start-scenery" hidden={covered}>
          <div class="wc-start-brand" ref={brandRef}>
            <StartWordmark size="full" run={run} place={scenery} />
          </div>
          <Almanac run={p.visible && !covered && !docHidden && scenery !== 'large'} />
        </div>
        {size.w > 0 && (
          <GridCtx.Provider value={{ cols: g.cols, rows: g.rows, surface: 'start' }}>
            <SceneryCtx.Provider value={setScenery}>
              <MorphCtx.Provider value={stage}>
                <SkyPauseCtx.Provider value={pauseSky}>
                  <FrameStack
                    key={p.epoch}
                    root={p.root}
                    active={p.visible && !p.leaving}
                    paused={paused}
                    wrap={wrap}
                    frameAttrs={frameAttrs}
                    hold={hold}
                  />
                </SkyPauseCtx.Provider>
              </MorphCtx.Provider>
            </SceneryCtx.Provider>
          </GridCtx.Provider>
        )}
        <MorphProxy proxyRef={proxyRef} />
        {covered && g.cols > 0 && (
          <div class={'wc-screen wc-start-gridtop' + (gridSmall ? ' is-small' : '')} style={screen}>
            {gridSmall ? <TooSmall cols={g.cols} rows={g.rows} /> : <StartNotices cols={g.cols} />}
          </div>
        )}
        {!covered && <NoticePill />}
        {!covered && lookSmall && <LookTooSmall w={size.w} h={size.h} />}
      </SkyCtx.Provider>
    </div>
  );
}

function StartWordmark(p: { size: 'full' | 'small'; run: boolean; place: string }): VNode {
  const look = useSkyLook();
  return <Wordmark look={look} size={p.size} run={p.run} place={p.place} />;
}

// ------------------------------------------------------------- grid frames

/**
 * Marks an old-look frame: while it is the top frame the sky's scenery
 * goes (and the sky pauses). Its element is the cell grid (`frameAttrs`),
 * over the terminal background (start.css); the client notices and the
 * minimum-size notice (Inv §3.1) are drawn above it by the surface. It
 * never morphs (the morph stage knows it as `grid`).
 */
function GridFrame(p: { children: ComponentChildren }): VNode {
  useScenery('grid');
  return <LookHost grid>{p.children}</LookHost>;
}

/**
 * Layout B's proxy (start.css `.wc-lk-morph`): an empty iron frame with its
 * four brackets, the hood and the window glass, that carries the motion
 * from one box's rectangle to the next (src/chrome/start-morph.ts). Idle,
 * it is `hidden`.
 */
function MorphProxy(p: { proxyRef: { current: HTMLDivElement | null } }): VNode {
  return (
    <div class="wc-lk-morph" ref={p.proxyRef} hidden aria-hidden="true">
      <i class="wc-lk-br wc-lk-b1" />
      <i class="wc-lk-br wc-lk-b2" />
      <i class="wc-lk-br wc-lk-b3" />
      <i class="wc-lk-br wc-lk-b4" />
      <div class="wc-lk-hood is-plain" />
      <div class="wc-lk-mwin" />
    </div>
  );
}

// ------------------------------------------------------------- notices

/**
 * The client notices (ADR 0025) on an old-look frame: right-aligned on the
 * top row, which every start frame leaves blank. `Update 0.1.3 available:
 * reload` (C_YELLOW) reloads on click (no game is connected here);
 * superseded storage adds `Storage: not saved` (C_ERR).
 */
export function StartNotices(p: { cols: number }): VNode | null {
  const items = startNoticeTokens(useNotices());
  if (items.length === 0) return null;
  const full = items.map((t) => t.text).join('  ');
  const text = truncate(full, Math.max(0, p.cols - 2));
  return (
    <div class="wc-line wc-start-notices" role="status">
      {text !== full ? (
        <span class={items[0]!.cls} title={items[0]!.title} onClick={items[0]!.onClick}>
          {text}
        </span>
      ) : (
        items.map((t, i) => (
          <>
            {i > 0 && '  '}
            <span class={t.cls + (t.onClick ? ' wc-start-notice-btn' : '')} title={t.title} onClick={t.onClick}>
              {t.text}
            </span>
          </>
        ))
      )}
    </div>
  );
}

/** The client notices over the sky: small glass pills at the top right. */
function NoticePill(): VNode | null {
  const items = startNoticeTokens(useNotices());
  if (items.length === 0) return null;
  return (
    <div class="wc-start-pills" role="status">
      {items.map((t) =>
        t.onClick ? (
          <button
            type="button"
            tabIndex={-1}
            class={`wc-start-pill is-${t.kind}`}
            title={t.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={t.onClick}
          >
            {t.text}
          </button>
        ) : (
          <span class={`wc-start-pill is-${t.kind}`} title={t.title}>
            {t.text}
          </span>
        ),
      )}
    </div>
  );
}

export interface StartNoticeToken {
  text: string;
  title: string;
  cls: string;
  kind: 'update' | 'storage';
  onClick?: () => void;
}

/** The start surface's notice tokens for `s`, update first. */
export function startNoticeTokens(s: Parameters<typeof noticeIndicators>[0]): StartNoticeToken[] {
  return noticeIndicators(s, CLIENT_VERSION).map((n) =>
    n.key === 'update'
      ? {
          text: `Update ${s.update!.version} available: reload`,
          title: `WebCockpit ${s.update!.version} is available (this tab runs ${CLIENT_VERSION}). Click to reload.`,
          cls: 'wc-c-yellow',
          kind: 'update' as const,
          onClick: () => globalThis.location?.reload(),
        }
      : { text: n.text, title: n.title, cls: 'wc-c-err', kind: 'storage' as const },
  );
}

// ------------------------------------------------------------- size notices

/** The minimum-size notice on the cell grid (Inv §3.1), for an old-look frame. */
export function TooSmall(p: { cols: number; rows: number }): VNode {
  const m = minView();
  const lines = [
    { text: 'Window too small', cls: 'wc-c-yellow' },
    { text: `Needs ${m.cols}×${m.rows} cells, has ${p.cols}×${p.rows}.`, cls: 'wc-c-body' },
    { text: 'Enlarge the window, zoom out, or open with ?safe.', cls: 'wc-c-hint' },
  ];
  const top = Math.max(0, Math.floor((p.rows - lines.length) / 2));
  return (
    <div class="wc-start-too-small">
      {Array.from({ length: top }, () => (
        <div class="wc-line" />
      ))}
      {lines.map((l) => (
        <div class="wc-line" style={{ paddingLeft: `calc(var(--cell-w) * ${centreLeft(p.cols, l.text.length)})` }}>
          <span class={l.cls}>{l.text}</span>
        </div>
      ))}
    </div>
  );
}

/** The minimum-size notice over the sky (the new-look frames). */
function LookTooSmall(p: { w: number; h: number }): VNode {
  return (
    <div class="wc-start-too-small wc-lk-tiny" role="alert">
      <div class="wc-lk-tiny-t">Window too small</div>
      <div>
        Needs {LOOK_MIN.w}×{LOOK_MIN.h} px, has {Math.round(p.w)}×{Math.round(p.h)}.
      </div>
      <div class="wc-lk-tiny-h">Enlarge the window or zoom out.</div>
    </div>
  );
}

// ------------------------------------------------------------- almanac

/**
 * The almanac at the bottom right (owner, 2026-11-07): the date, the time
 * with the period and the year, and the version. It follows the start
 * page's game clock, a new line each game minute (one real second).
 */
function Almanac(p: { run: boolean }): VNode {
  const { version } = useServices();
  const [g, setG] = useState(() => startGameMinutes());
  useEffect(() => {
    if (!p.run) return;
    setG(startGameMinutes());
    const t = setInterval(() => setG(startGameMinutes()), 1000);
    return () => clearInterval(t);
  }, [p.run]);
  const a = almanacLines(gameTimeAt(Math.floor(g)));
  const ink = useDarkInk('almanac');
  return (
    <aside class={'wc-start-almanac' + (ink ? ' is-ink' : '')} aria-label="Game time">
      <div class="wc-alm-d">{a.date}</div>
      <div class="wc-alm-m">{a.time}</div>
      <div class="wc-alm-v">WebCockpit {version || CLIENT_VERSION}</div>
    </aside>
  );
}
