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
// wordmark (a sub-page's box), the wordmark in the corner (a large box),
// or nothing (an old-look frame).
//
// The sky is mounted once, behind everything, and paused while the start
// page is hidden (the game, a player), the document is hidden, or an
// old-look frame covers it.

import type { ComponentChildren, JSX, VNode } from 'preact';
import { createContext } from 'preact';
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { noticeIndicators } from '../app/notices';
import { CLIENT_VERSION } from '../core/build-info';
import { gameTimeAt } from '../gmcp/gametime';
import { startGameMinutes } from '../start/clock';
import { type StartSkyHandle, mountStartSky } from '../start/sky';
import { type SkyLook, skyLookAt } from '../start/sky/look';
import { Wordmark } from '../start/wordmark';
import { GridCtx, useElementSize, useHostGrid, useNotices, useServices } from './kit/hooks';
import { type Scenery, SceneryCtx, isLookFrame, useScenery } from './kit/look';
import { centreLeft, minView, tooSmall, truncate } from './kit/nav';
import { FrameStack } from './kit/stack';
import { almanacLines } from './start-layout';
import './start.css';

// ------------------------------------------------------------------ sky

/** The sky's current look for the page's text and wordmark (ADR 0125). */
export interface SkyStore {
  look(): SkyLook;
  subscribe(fn: (look: SkyLook) => void): () => void;
}

const staticSky = (): SkyStore => {
  const look = skyLookAt(startGameMinutes());
  return { look: () => look, subscribe: () => () => {} };
};

export const SkyCtx = createContext<SkyStore | null>(null);

/** The sky's look, re-rendering on every change the sky pushes (a few times a second at most). */
export function useSkyLook(): SkyLook {
  const store = useContext(SkyCtx) ?? FALLBACK_SKY;
  const [look, set] = useState(store.look());
  useEffect(() => {
    set(store.look());
    return store.subscribe(set);
  }, [store]);
  return look;
}

let fallback: SkyStore | null = null;
const FALLBACK_SKY: SkyStore = {
  look: () => (fallback ??= staticSky()).look(),
  subscribe: () => () => {},
};

/**
 * Whether the text over the sky wants dark ink (a bright sky behind it),
 * with hysteresis so a sky near the threshold does not flicker.
 */
export function useDarkInk(): boolean {
  const store = useContext(SkyCtx) ?? FALLBACK_SKY;
  const [ink, set] = useState(() => inkFor(store.look().textBackLuminance, false));
  useEffect(() => {
    const upd = (l: SkyLook): void => set((cur) => inkFor(l.textBackLuminance, cur));
    upd(store.look());
    return store.subscribe(upd);
  }, [store]);
  return ink;
}

/** Dark ink above 0.5 luminance, pale again below 0.4 (the round 5 mockup's hysteresis). */
export function inkFor(luminance: number, cur: boolean): boolean {
  return cur ? luminance >= 0.4 : luminance > 0.5;
}

function reducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
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

// ------------------------------------------------------------- the surface

/** Smallest window (CSS px) the new-look start page lays out in; below it the size notice shows. */
export const LOOK_MIN = { w: 300, h: 340 } as const;

export interface StartSurfaceProps {
  visible: boolean;
  /** A new frame stack on every change (show without `keep`). */
  epoch: number;
  root: VNode;
}

export function StartSurface(p: StartSurfaceProps): VNode {
  const ref = useRef<HTMLDivElement>(null);
  const skyHost = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(ref);
  const g = useHostGrid(ref);
  const [scenery, setScenery] = useState<Scenery>('main');
  const docHidden = useDocHidden();

  // The sky, once; its look reaches the page through SkyCtx.
  const sky = useRef<StartSkyHandle | null>(null);
  const store = useMemo<SkyStore>(() => {
    const subs = new Set<(l: SkyLook) => void>();
    let off: (() => void) | null = null;
    let base: SkyStore | null = null;
    return {
      look: () => sky.current?.look() ?? (base ??= staticSky()).look(),
      subscribe(fn) {
        subs.add(fn);
        if (!off && sky.current) off = sky.current.onLook((l) => subs.forEach((s) => s(l)));
        return () => {
          subs.delete(fn);
          if (subs.size === 0 && off) {
            off();
            off = null;
          }
        };
      },
    };
  }, []);
  const [skyReady, setSkyReady] = useState(0);
  useLayoutEffect(() => {
    const host = skyHost.current;
    if (!host) return;
    try {
      sky.current = mountStartSky(host);
    } catch (e) {
      console.error('WebCockpit: the start page sky could not start', e);
      sky.current = null;
    }
    setSkyReady((n) => n + 1);
    return () => {
      sky.current?.dispose();
      sky.current = null;
    };
  }, []);
  const covered = scenery === 'grid';
  useEffect(() => {
    sky.current?.setPaused(!p.visible || docHidden || covered);
  }, [p.visible, docHidden, covered, skyReady]);

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
  const run = p.visible && !docHidden && !covered && !reducedMotion();
  const wrap = (node: VNode): VNode => (isLookFrame(node) ? node : <GridFrame>{node}</GridFrame>);
  // An old-look frame's element is the cell grid itself, as before.
  const screen = { left: g.left, top: g.top, width: g.cols * g.cellW, height: g.rows * g.cellH };
  const frameAttrs = (node: VNode): { class: string; style: JSX.CSSProperties } | null =>
    isLookFrame(node) ? null : { class: 'wc-screen wc-start-gridframe', style: screen };

  return (
    <div
      class={
        `wc-chrome wc-start is-${scenery}` +
        (lookSmall && !covered ? ' is-tiny' : '') +
        (gridSmall && covered ? ' is-grid-small' : '')
      }
      ref={ref}
      hidden={!p.visible}
    >
      <div class="wc-start-skyhost" ref={skyHost} aria-hidden="true" />
      <div class="wc-start-vignette" aria-hidden="true" />
      <SkyCtx.Provider value={store}>
        <div class="wc-start-scenery" hidden={covered}>
          <div class="wc-start-brand" ref={brandRef}>
            <StartWordmark size={scenery === 'large' ? 'small' : 'full'} run={run} />
          </div>
          {scenery !== 'large' && <Almanac run={p.visible && !covered && !docHidden} />}
        </div>
        {size.w > 0 && (
          <GridCtx.Provider value={{ cols: g.cols, rows: g.rows, surface: 'start' }}>
            <SceneryCtx.Provider value={setScenery}>
              <FrameStack
                key={p.epoch}
                root={p.root}
                active={p.visible}
                paused={paused}
                wrap={wrap}
                frameAttrs={frameAttrs}
              />
            </SceneryCtx.Provider>
          </GridCtx.Provider>
        )}
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

function StartWordmark(p: { size: 'full' | 'small'; run: boolean }): VNode {
  const look = useSkyLook();
  return <Wordmark look={look} size={p.size} run={p.run} />;
}

// ------------------------------------------------------------- grid frames

/**
 * Marks an old-look frame: while it is the top frame the sky's scenery
 * goes (and the sky pauses). Its element is the cell grid (`frameAttrs`),
 * over the terminal background (start.css); the client notices and the
 * minimum-size notice (Inv §3.1) are drawn above it by the surface.
 */
function GridFrame(p: { children: ComponentChildren }): VNode {
  useScenery('grid');
  return <>{p.children}</>;
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
  return (
    <aside class="wc-start-almanac" aria-label="Game time">
      <div class="wc-alm-d">{a.date}</div>
      <div class="wc-alm-m">{a.time}</div>
      <div class="wc-alm-v">WebCockpit {version || CLIENT_VERSION}</div>
    </aside>
  );
}
