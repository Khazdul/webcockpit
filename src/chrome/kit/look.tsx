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
//   look-motion.ts     MOTION, reducedMotion, useReducedMotion (42a)
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

import type { ComponentChildren, FunctionComponent, Ref, VNode } from 'preact';
import { createContext } from 'preact';
import { useContext, useLayoutEffect } from 'preact/hooks';
import { Icon } from './look-icons';
import { useIsTopFrame, useNav } from './stack';

export * from './look-keys';
export * from './look-icons';
export * from './look-controls';
export * from './look-overlay';
export * from './look-cursor';
export * from './look-motion';
export * from './window-chrome';

// ------------------------------------------------------------ frames

const FREE = '__wcLook';

/** Marks a frame component as a new-look frame (drawn over the sky, not on the grid). */
export function lookFrame<P>(c: FunctionComponent<P>): FunctionComponent<P> {
  (c as unknown as Record<string, boolean>)[FREE] = true;
  return c;
}

/** Whether `node` is a new-look frame (`lookFrame`). */
export function isLookFrame(node: VNode): boolean {
  const t = node.type as unknown;
  return typeof t === 'function' && (t as unknown as Record<string, unknown>)[FREE] === true;
}

/**
 * What the start surface shows around the top frame: `main` the full
 * wordmark and the almanac (the start menu), `sub` a smaller wordmark
 * above a normal box, `large` the wordmark small in the corner (a box
 * that nearly fills the window; in stage 42a it becomes layout B: no
 * wordmark, almanac or quote), `grid` nothing (an old-look frame covers
 * the sky).
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

// ------------------------------------------------------------ the box

export type BoxSize = 'normal' | 'large';

export interface BoxProps {
  /** The hood's label; may change between renders; none: the plain polished plate (the start menu). */
  title?: string;
  /**
   * `normal`: a centred box under the wordmark (the Profile list);
   * `large`: nearly the whole window (layout B "Rummet växer", 42a).
   */
  size?: BoxSize;
  /** Normal only: grows downward to the window's bottom margin (42a; 42-0 stub: ignored). */
  tall?: boolean;
  /** Large only: CSS px; the box stops there, centred (42a; 42-0 stub: ignored). */
  maxWidth?: number;
  /** Shows Back at the top left (a sub-page; start and menu). Esc does the same through the frame stack. */
  onBack?: () => void;
  /** The accessible name (default: the title). */
  label?: string;
  class?: string;
  /** Classes on the lit window inside the frame. */
  winClass?: string;
  children?: ComponentChildren;
}

/**
 * The lantern box (ADR 0123's Lykta family): a thin stone-like iron frame
 * with riveted corner brackets, the polished hood plate at the top centre
 * (with the page's name, or plain with two rivets and an engraved line)
 * and the lit window. With `onBack` it is a sub-page: the box sits on its
 * own page (centred under the smaller wordmark, or nearly filling the
 * window when `large`), with Back at its top left, and it sets the
 * surface's scenery to match.
 */
export function Box(p: BoxProps): VNode {
  const size = p.size ?? 'normal';
  const sub = !!p.onBack;
  useScenery(sub ? (size === 'large' ? 'large' : 'sub') : 'main');
  const box = (
    <section
      class={`wc-lk-box wc-lk-box-${size}` + (p.class ? ' ' + p.class : '')}
      aria-label={p.label ?? p.title}
    >
      <i class="wc-lk-br wc-lk-b1" />
      <i class="wc-lk-br wc-lk-b2" />
      <i class="wc-lk-br wc-lk-b3" />
      <i class="wc-lk-br wc-lk-b4" />
      {p.title ? (
        <div class="wc-lk-hood">
          <span class="wc-lk-hood-t">{p.title}</span>
        </div>
      ) : (
        <div class="wc-lk-hood is-plain">
          <i class="wc-lk-eng" />
        </div>
      )}
      {p.onBack && <BackButton onClick={p.onBack} />}
      <div class={'wc-lk-win' + (p.winClass ? ' ' + p.winClass : '')}>{p.children}</div>
    </section>
  );
  // A sub-page: the box on its own page, under the smaller wordmark (scrolls when short).
  return sub ? <div class={`wc-lk-page wc-lk-sub wc-lk-sub-${size}`}>{box}</div> : box;
}

/** The box's fixed head (at the top of the window). 42-0 stub. */
export function BoxHead(p: { class?: string; children?: ComponentChildren }): VNode {
  return <div class={'wc-lk-bhead' + (p.class ? ' ' + p.class : '')}>{p.children}</div>;
}

/** The box's body: fills the window, scrolls natively (thin iron scrollbar) unless `scroll` is false. 42-0 stub. */
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

/** The box's fixed foot (at the bottom of the window). 42-0 stub. */
export function BoxFoot(p: { class?: string; children?: ComponentChildren }): VNode {
  return <div class={'wc-lk-bfoot' + (p.class ? ' ' + p.class : '')}>{p.children}</div>;
}

/**
 * False from the frame's mount until its content has faded in (true at
 * once with reduced motion, in windows and in the ESC menu). Pages that
 * measure wait for it. 42-0 stub: always true.
 */
export function useBoxSettled(): boolean {
  return true;
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
 * own Back). Default action: `nav.pop()`. 42-0 stub: a plain Back.
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
