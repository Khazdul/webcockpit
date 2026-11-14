// The lantern kit (stage 41, ADR 0125; stage 42, ADR 0127): the new-look
// widgets, free DOM over the sky (or in a window, or the phone's ESC menu)
// instead of cells on the grid. Shared by the start menu
// (src/chrome/frames/start-main.tsx) and every page that has moved to the
// new look (the Profile list first); the other pages keep the TUI kit
// (widgets.tsx) on the grid until their own stages.
//
//   export const MyFrame = lookFrame(function MyFrame() {
//     const nav = useNav();
//     useKeys((e, nk) => …);                       // keys as in any frame
//     return (
//       <Box title="Profiles" onBack={() => nav.pop()}>
//         <ul class="wc-lk-list">…<li class="wc-lk-row is-on">…</li></ul>
//         <div class="wc-lk-btns">
//           <GlassButton id="NEW" label="New" letter="n" icon="plus" onClick={…} />
//         </div>
//         <LookFlash />
//       </Box>
//     );
//   });
//
// `lookFrame` marks the component: the start surface then draws the frame
// straight over the sky; an unmarked frame is drawn on the cell grid over
// an opaque terminal-coloured layer, exactly as before (src/chrome/start-surface.tsx).
//
// This file is the kit's barrel: it holds the frames, the scenery, the
// places and the box (package 42a) and re-exports the module files:
//
//   look-keys.ts       letterOf, letterAt, KeyLabel, letterAction (42c)
//   look-icons.tsx     Icon, ICONS, IconName, IconDraw (42b)
//   look-controls.tsx  GlassButton, Seg, Tabs, Field, …, LookFlash (42b)
//   look-overlay.tsx   Dialog, KeyHelp, openKeyHelp, Popover (42c)
//   look-cursor.ts     useListCursor, useGridCursor, useButtonZone (42c)
//   look-motion.ts     MOTION, morphPlan, reducedMotion, useReducedMotion (42a)
//   window-chrome.ts   useWindowChrome (42d)
//
// CSS: look.css (the box and its page), which imports look-tokens.css
// (the `--lk-*` tokens on `.wc-look`) and look-glass.css (the glass
// buttons and Back, also for the player).
//
// Rules (the owner's, README "Baseline"): no key-hint rows, no shortcut
// letters at row ends, no ⏎. A shortcut is the letter marked inside its
// label (`KeyLabel`: a fine lit underline). Selection is restrained: the
// chosen row's text and icon brighten; no glide, glow or sweep. Every
// sub-page has Back at the top left; Esc does the same. No lanterns.

import type { ComponentChildren, FunctionComponent, JSX, Ref, VNode } from 'preact';
import { createContext } from 'preact';
import { useContext, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './look-icons';
import { type BoxKind, MOTION } from './look-motion';
import { LOOK_MARK, useIsTopFrame, useNav } from './stack';

export * from './look-keys';
export * from './look-icons';
export * from './look-controls';
export * from './look-overlay';
export * from './look-cursor';
export * from './look-motion';
export * from './window-chrome';

// ------------------------------------------------------------ frames

/** Marks a frame component as a new-look frame (drawn over the sky, not on the grid). */
export function lookFrame<P>(c: FunctionComponent<P>): FunctionComponent<P> {
  (c as unknown as Record<string, boolean>)[LOOK_MARK] = true;
  return c;
}

/** Whether `node` is a new-look frame (`lookFrame`). */
export function isLookFrame(node: VNode): boolean {
  const t = node.type as unknown;
  return typeof t === 'function' && (t as unknown as Record<string, unknown>)[LOOK_MARK] === true;
}

/**
 * What the start surface shows around the top frame: `main` the full
 * wordmark and the almanac (the start menu), `sub` a smaller wordmark
 * above a normal box, `large` layout B "Rummet växer" (a box that nearly
 * fills the window: no wordmark, no almanac, no quote; the wordmark lifts
 * away and settles back), `grid` nothing (an old-look frame covers the
 * sky).
 */
export type Scenery = 'main' | 'sub' | 'large' | 'grid';

export const SceneryCtx = createContext<((s: Scenery) => void) | null>(null);

/** Tells the start surface what the frame needs around it, while it is the top frame. */
export function useScenery(s: Scenery): void {
  const set = useContext(SceneryCtx);
  const top = useIsTopFrame();
  useLayoutEffect(() => {
    if (top) set?.(s);
  }, [top, s, set]);
}

// ------------------------------------------------------------ places

/**
 * Where a look frame runs (stage 42, ADR 0127): `start` over the sky,
 * `window` in an in-game window (the window frame is the box), `menu` the
 * phone's ESC menu (a full-screen Lykta page over the opaque background).
 */
export type LookPlace = 'start' | 'window' | 'menu';

/** The place of the frames below; provided by each stack's host (42d: windows, the ESC menu). Default `start`. */
export const LookPlaceCtx = createContext<LookPlace>('start');

/** The place this frame runs in. */
export function useLookPlace(): LookPlace {
  return useContext(LookPlaceCtx);
}

// ------------------------------------------------------------ the frame host (start surface)

/** What a frame's outermost box tells the start surface: its element and kind (for the morph). */
export interface BoxReport {
  el: HTMLElement;
  kind: BoxKind;
}

/**
 * Internal (the start surface's frame host, src/chrome/start-morph.tsx):
 * where a frame's outermost `Box` reports itself. Null elsewhere (windows,
 * the ESC menu) and inside a box (a nested box never reports).
 */
export const BoxHostCtx = createContext<((b: BoxReport | null) => void) | null>(null);

/** Internal: the frame host's settled state (`useBoxSettled`); true where nothing morphs. */
export const BoxSettledCtx = createContext<boolean>(true);

/**
 * False from the frame's mount until its content has faded in after the
 * box's morph; true at once with reduced motion, where nothing morphs, in
 * windows and in the ESC menu. Pages that measure (columns, pagination)
 * wait for it; a later resize is the page's own `ResizeObserver`.
 */
export function useBoxSettled(): boolean {
  return useContext(BoxSettledCtx);
}

// ------------------------------------------------------------ the box

export type BoxSize = 'normal' | 'large';

export interface BoxProps {
  /** The hood's label; may change between renders (cross-fades); none: the plain polished plate (the start menu). */
  title?: string;
  /**
   * `normal`: a centred box under the wordmark (the Profile list);
   * `large`: layout B "Rummet växer", the box nearly fills the window.
   */
  size?: BoxSize;
  /** Normal only: grows downward to the window's bottom margin (on the phone the wordmark hides for it). */
  tall?: boolean;
  /** Large only: CSS px; the box stops there, centred, the sky on both sides. */
  maxWidth?: number;
  /** Shows Back at the top left (a sub-page; start and menu). Esc does the same through the frame stack. */
  onBack?: () => void;
  /**
   * A sub-page without Back (stage 60: the recovery code page, which is
   * left only by its own button): laid out as a sub-page under the smaller
   * wordmark, no Back button drawn. The page must also take Esc itself
   * (`useKeys`: return true for `back`), or the frame stack pops it.
   */
  noBack?: boolean;
  /** The accessible name (default: the title). */
  label?: string;
  class?: string;
  /** Classes on the lit window inside the frame (the content box). */
  winClass?: string;
  children?: ComponentChildren;
}

/** The box's kind for the start surface's morph. */
function kindOf(p: BoxProps): BoxKind {
  if (!p.onBack && !p.noBack) return 'menu';
  if (p.size === 'large') return 'large';
  return p.tall ? 'tall' : 'normal';
}

/**
 * The lantern box (ADR 0123's Lykta family): a thin stone-like iron frame
 * with riveted corner brackets, the polished hood plate at the top centre
 * (with the page's name, or plain with two rivets and an engraved line)
 * and the lit window, the content box (`.wc-lk-win`: a flex column and an
 * inline-size container named `wc-page`, in every place; `BoxHead`,
 * `BoxBody`, `BoxFoot` are its slots).
 *
 * It adapts to its place (`useLookPlace`):
 * - `start`: without `onBack` the start menu's panel; with it a sub-page,
 *   centred under the smaller wordmark (`normal`, `tall` growing to the
 *   window's bottom margin) or nearly filling the window (`large`, layout
 *   B, `maxWidth` capping it), with Back at its top left; it sets the
 *   surface's scenery to match. The surface morphs between boxes.
 * - `window`: no iron frame, no hood, no Back: the window frame is the box
 *   and its title bar carries the title (`useWindowChrome`); the content
 *   box fills the window.
 * - `menu` (the phone's ESC menu): a full-screen box with the hood and
 *   Back, over the opaque background.
 */
export function Box(p: BoxProps): VNode {
  const size = p.size ?? 'normal';
  const place = useLookPlace();
  const sub = !!p.onBack || !!p.noBack;
  const tall = size === 'normal' && !!p.tall;
  useScenery(sub ? (size === 'large' ? 'large' : 'sub') : 'main');
  const report = useContext(BoxHostCtx);
  const ref = useRef<HTMLElement>(null);
  const kind = kindOf(p);
  useLayoutEffect(() => {
    if (!report) return;
    report(ref.current ? { el: ref.current, kind } : null);
  }, [report, kind, p.maxWidth]);
  useLayoutEffect(() => () => report?.(null), [report]);

  const label = p.label ?? p.title;
  const win = (
    <div class={'wc-lk-win' + (p.winClass ? ' ' + p.winClass : '')}>
      <SceneryCtx.Provider value={null}>
        <BoxHostCtx.Provider value={null}>{p.children}</BoxHostCtx.Provider>
      </SceneryCtx.Provider>
    </div>
  );

  if (place === 'window') {
    return (
      <section
        ref={ref}
        class={`wc-lk-box wc-lk-box-${size} wc-lk-inwin` + (p.class ? ' ' + p.class : '')}
        aria-label={label}
      >
        {win}
      </section>
    );
  }

  const menu = place === 'menu';
  const capped = size === 'large' && p.maxWidth ? p.maxWidth : 0;
  const style: JSX.CSSProperties | undefined = capped ? { '--lk-box-maxw': `${capped}px` } : undefined;
  const box = (
    <section
      ref={ref}
      class={
        `wc-lk-box wc-lk-box-${size}` +
        (tall ? ' is-tall' : '') +
        (capped ? ' is-capped' : '') +
        (menu ? ' wc-lk-box-full' : '') +
        (p.class ? ' ' + p.class : '')
      }
      style={style}
      aria-label={label}
    >
      <i class="wc-lk-br wc-lk-b1" />
      <i class="wc-lk-br wc-lk-b2" />
      <i class="wc-lk-br wc-lk-b3" />
      <i class="wc-lk-br wc-lk-b4" />
      {p.title ? (
        <div class="wc-lk-hood">
          <HoodTitle title={p.title} />
        </div>
      ) : (
        <div class="wc-lk-hood is-plain">
          <i class="wc-lk-eng" />
        </div>
      )}
      {p.onBack && !p.noBack && <BackButton onClick={p.onBack} />}
      {win}
    </section>
  );
  // The phone's ESC menu: the box fills the menu.
  if (menu) return <div class="wc-lk-page wc-lk-menu">{box}</div>;
  if (!sub) return box;
  // Layout B: the box nearly fills the window (inset `--lk-box-m`), centred when capped.
  if (size === 'large') return <div class="wc-lk-page wc-lk-large">{box}</div>;
  // A sub-page: the box on its own page, under the smaller wordmark (scrolls when short).
  return <div class={'wc-lk-page wc-lk-sub wc-lk-sub-normal' + (tall ? ' is-tall' : '')}>{box}</div>;
}

/** The hood's title; a new title cross-fades with the old one (`MOTION.swap.title`). */
function HoodTitle(p: { title: string }): VNode {
  const [old, setOld] = useState<string | null>(null);
  const prev = useRef(p.title);
  useLayoutEffect(() => {
    if (prev.current === p.title) return;
    const was = prev.current;
    prev.current = p.title;
    setOld(was);
    const t = setTimeout(() => setOld(null), MOTION.swap.title);
    return () => clearTimeout(t);
  }, [p.title]);
  return (
    <>
      {old !== null && (
        <span class="wc-lk-hood-t is-out" aria-hidden="true">
          {old}
        </span>
      )}
      <span key={p.title} class={'wc-lk-hood-t' + (old !== null ? ' is-in' : '')}>
        {p.title}
      </span>
    </>
  );
}

/** The box's fixed head (at the top of the content box). */
export function BoxHead(p: { class?: string; children?: ComponentChildren }): VNode {
  return <div class={'wc-lk-bhead' + (p.class ? ' ' + p.class : '')}>{p.children}</div>;
}

/** The box's body: fills the content box, scrolls natively (thin iron scrollbar) unless `scroll` is false. */
export function BoxBody(p: {
  class?: string;
  scroll?: boolean;
  bodyRef?: Ref<HTMLDivElement>;
  children?: ComponentChildren;
}): VNode {
  const scroll = p.scroll ?? true;
  return (
    <div ref={p.bodyRef} class={'wc-lk-bbody' + (scroll ? ' wc-lk-scroll' : '') + (p.class ? ' ' + p.class : '')}>
      {p.children}
    </div>
  );
}

/** The box's fixed foot (at the bottom of the content box). */
export function BoxFoot(p: { class?: string; children?: ComponentChildren }): VNode {
  return <div class={'wc-lk-bfoot' + (p.class ? ' ' + p.class : '')}>{p.children}</div>;
}

/** Back, at the top left of a sub-page's box (Esc does the same). */
export function BackButton(p: { onClick: () => void }): VNode {
  return (
    <button
      type="button"
      class="wc-lk-back"
      tabIndex={-1}
      aria-label="Back (Esc)"
      title="Back (Esc)"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        p.onClick();
      }}
    >
      <Icon name="back" />
      Back
    </button>
  );
}

/**
 * The small Back of a window's sub-page: rendered only in a window and
 * only when the frame is not the stack's root (elsewhere the box has its
 * own Back). The page places it (in its `BoxHead`, say). Default action:
 * `nav.pop()`.
 */
export function InlineBack(p: { label?: string; onClick?: () => void }): VNode | null {
  const place = useLookPlace();
  const nav = useNav();
  if (place !== 'window' || nav.depth() <= 1) return null;
  const label = p.label ?? 'Back';
  return (
    <button
      type="button"
      class="wc-lk-back wc-lk-iback"
      tabIndex={-1}
      title={`${label} (Esc)`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        if (p.onClick) p.onClick();
        else nav.pop();
      }}
    >
      <Icon name="back" />
      {label}
    </button>
  );
}
