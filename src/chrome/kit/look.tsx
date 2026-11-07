// The lantern kit (stage 41, ADR 0125): the start page's new-look
// widgets, free DOM over the sky instead of cells on the grid. Shared by
// the start menu (src/chrome/frames/start-main.tsx) and every sub-page
// that has moved to the new look (the Profile list first); the other
// sub-pages keep the TUI kit (widgets.tsx) on the grid until their own
// stages.
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
// Rules (the owner's, README "Baseline"): no key-hint rows, no shortcut
// letters at row ends, no ⏎. A shortcut is the letter marked inside its
// label (`KeyLabel`: a fine lit underline). Selection is restrained: the
// chosen row's text and icon brighten; no glide, glow or sweep. Every
// sub-page has Back at the top left; Esc does the same. No lanterns.

import type { ComponentChildren, FunctionComponent, VNode } from 'preact';
import { createContext } from 'preact';
import { useContext, useLayoutEffect } from 'preact/hooks';
import { useFlash, useIsTopFrame } from './stack';

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
 * that nearly fills the window), `grid` nothing (an old-look frame covers
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

// ------------------------------------------------------------ keys

/** The shortcut letter of a key press (a–z, lower case), or null (modifiers, other keys). */
export function letterOf(e: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }): string | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  return /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : null;
}

/** Index of the shortcut `letter` in `label` (its first occurrence, any case), or -1. */
export function letterAt(label: string, letter: string | undefined): number {
  return letter ? label.toLowerCase().indexOf(letter.toLowerCase()) : -1;
}

/** A label with its shortcut letter marked by a fine lit underline. */
export function KeyLabel(p: { text: string; letter?: string | undefined; class?: string }): VNode {
  const i = letterAt(p.text, p.letter);
  return (
    <span class={p.class}>
      {i < 0 ? (
        p.text
      ) : (
        <>
          {p.text.slice(0, i)}
          <u class="wc-sk">{p.text[i]}</u>
          {p.text.slice(i + 1)}
        </>
      )}
    </span>
  );
}

// ------------------------------------------------------------ icons

const ICONS: Record<string, ComponentChildren> = {
  // Start menu (round 6 mockup), 18 × 18 unless noted.
  door: (
    <>
      <path d="M4.5 20V10.5a6.5 6.5 0 0 1 13 0V20" />
      <path d="M2.5 20h17" />
      <path d="M8 20v-8.5a3 3 0 0 1 6 0V20" />
      <path d="M12.4 16.4h.1" />
    </>
  ),
  person: (
    <>
      <circle cx="9" cy="5.6" r="3" />
      <path d="M3 16c0-3.6 2.7-5.6 6-5.6s6 2 6 5.6" />
    </>
  ),
  scroll: (
    <>
      <path d="M5.5 2.5h8a2 2 0 0 1 2 2v1.5h-2" />
      <path d="M13.5 4.5v9a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-1.5h8v1.5a2 2 0 0 0 2 2" />
      <path d="M5.5 2.5a2 2 0 0 0-2 2v7.5" />
      <path d="M6.5 6.5h4.5M6.5 9h4.5" />
    </>
  ),
  hourglass: <path d="M4.5 2h9M4.5 16h9M5.5 2c0 4 7 5 7 7s-7 3-7 7M12.5 2c0 4-7 5-7 7s7 3 7 7" />,
  star: <path d="M9 1.5l1.7 5.8 5.8 1.7-5.8 1.7L9 16.5l-1.7-5.8L1.5 9l5.8-1.7z" />,
  quill: (
    <>
      <path d="M15.5 2.5C9 3 5.2 8 4 14.5L2.6 16.2" />
      <path d="M15.5 2.5c-.8 5.2-4.8 9.2-10.6 10.4" />
      <path d="M8.5 9.5l-2-1.2" />
    </>
  ),
  info: (
    <>
      <circle cx="9" cy="9" r="7" />
      <path d="M9 8.2v4.8M9 5.4v.1" />
    </>
  ),
  // Buttons, 16 × 16.
  back: <path d="M9.8 3.2 5 8l4.8 4.8" />,
  check: <path d="M3 8.5 6.4 12 13 4.5" />,
  plus: <path d="M8 3v10M3 8h10" />,
  pencil: <path d="M10.5 2.5l3 3-8 8H2.5v-3z" />,
  rename: (
    <>
      <path d="M2.5 12.5 5.5 4l3 8.5M3.6 9.6h3.8" />
      <path d="M11 3.5v9M9.5 3.5h3M9.5 12.5h3" />
    </>
  ),
  import: <path d="M8 2v8M4.8 7 8 10.2 11.2 7M2.5 13.5h11" />,
  export: <path d="M8 10.2V2.2M4.8 5.4 8 2.2l3.2 3.2M2.5 13.5h11" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />,
};

/** The size of each icon's drawing (its viewBox side). */
const ICON_BOX: Record<string, number> = { door: 22 };
const BUTTON_ICONS = new Set(['back', 'check', 'plus', 'pencil', 'rename', 'import', 'export', 'trash']);

export type IconName = keyof typeof ICONS;

/** A small line icon (stroke: currentColor). */
export function Icon(p: { name: IconName; class?: string }): VNode {
  const n = ICON_BOX[p.name] ?? (BUTTON_ICONS.has(p.name) ? 16 : 18);
  return (
    <svg class={'wc-lk-ic' + (p.class ? ' ' + p.class : '')} viewBox={`0 0 ${n} ${n}`} aria-hidden="true">
      {ICONS[p.name]}
    </svg>
  );
}

// ------------------------------------------------------------ the box

export type BoxSize = 'normal' | 'large';

export interface BoxProps {
  /** The hood's label; none: the plain polished plate (the start menu). */
  title?: string;
  /**
   * `normal`: a centred box under the wordmark (the Profile list);
   * `large`: nearly the whole window, the wordmark small in the corner
   * (content-heavy pages; the exact layout is still being designed, so
   * this is a first cut).
   */
  size?: BoxSize;
  /** Shows Back at the top left (every sub-page). Esc does the same through the frame stack. */
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

// ------------------------------------------------------------ buttons

export interface GlassButtonProps {
  label: string;
  /** The shortcut letter, marked in the label (the page handles the key). */
  letter?: string;
  icon?: IconName;
  /** `data-btn` (tests and the page's own lookups). */
  id?: string;
  /** Keyboard cursor on it (the page's button zone). */
  selected?: boolean;
  disabled?: boolean;
  /** Destructive (Delete). */
  danger?: boolean;
  title?: string;
  onClick: () => void;
}

/**
 * A glass button: clear, faintly frosted glass with a lit top edge, no
 * texture. Never takes the focus (the frame stack keeps it); the page's
 * keys reach it through `selected` and its shortcut letter.
 */
export function GlassButton(p: GlassButtonProps): VNode {
  const cls =
    'wc-lk-btn' + (p.selected ? ' is-sel' : '') + (p.disabled ? ' is-disabled' : '') + (p.danger ? ' is-danger' : '');
  return (
    <button
      type="button"
      class={cls}
      data-btn={p.id}
      tabIndex={-1}
      title={p.title}
      aria-disabled={p.disabled ? 'true' : undefined}
      aria-keyshortcuts={p.letter?.toUpperCase()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        if (!p.disabled) p.onClick();
      }}
    >
      {p.icon && <Icon name={p.icon} />}
      <KeyLabel text={p.label} letter={p.letter} />
    </button>
  );
}

// ------------------------------------------------------------ feedback

/**
 * The page's transient message (the stack's flash, ~3 s): an italic line
 * at the bottom of the box. Always laid out (empty when none), so the box
 * never changes height.
 */
export function LookFlash(p: { class?: string }): VNode {
  const f = useFlash();
  return (
    <div class={'wc-lk-flash' + (p.class ? ' ' + p.class : '')} role="status" aria-live="polite">
      {f && (
        <span key={f.seq} class={f.kind === 'ok' ? 'is-ok' : 'is-fail'}>
          {f.text}
        </span>
      )}
    </div>
  );
}

