// A settings popup's panel (ADR 0107): the bar's dark `.wc-pop` box with a
// title, a close cross and its content, shared by the Settings popup and
// the pane gear popups. The surface (surface.tsx) mounts one at a time.
//
// - Keys only after a click in it (ADR 0099): it carries
//   `data-wc-own-keys`, so the input pane's key and click routing leaves
//   it alone. A mouse down in it never starts a text selection and gives
//   the focus to the control pressed (or the panel), so the keyboard goes
//   on from there; a text field takes its focus itself. A click in the game
//   text or the input gives the keys back without closing it. A press
//   hides the focus ring until a key is used (`data-pointer`).
// - Esc in it closes it (a control's own Esc, such as an open dropdown
//   list, comes first); Tab and Shift+Tab wrap inside it.
// - Placed by the caller's `place` (above the Settings icon, beside a pane)
//   when it opens, on a resize of the window or of itself, and on every
//   settings or cell change (the font moves the bar). While a slider is
//   held (`useHold`), it keeps its font size and place, and refits when the
//   slider is let go: a Size drag would otherwise move the thumb from under
//   the pointer.

import { type ComponentChildren, type VNode, createContext } from 'preact';
import { useContext, useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { CLOSE_X } from '../../menubar/icons';
import { OWN_KEYS_ATTR } from '../../ui/input-pane';
import { useServices } from '../kit/hooks';

/** Places the popup's panel (position: fixed) on screen. */
export type PopupPlace = (panel: HTMLElement) => void;

/** Holds the popup's scale while a control is dragged (true), lets it refit (false). */
export const HoldCtx = createContext<(held: boolean) => void>(() => {});

/** The popup's hold, for a slider's `onHold`. */
export function useHold(): (held: boolean) => void {
  return useContext(HoldCtx);
}

const FOCUSABLE = 'button, input, select, textarea, [tabindex]';

/** The panel's tabbable controls, in document order (visible ones only). */
export function tabbables(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.tabIndex < 0 || (el as HTMLButtonElement).disabled) return false;
    if (el.closest('[aria-hidden="true"], [hidden]')) return false;
    return (el as HTMLInputElement).type !== 'hidden' && (el as HTMLInputElement).type !== 'file';
  });
}

export interface PopupPanelProps {
  /** Extra class on `.wc-pop` (`wc-sp-settings` …). */
  cls: string;
  /** The dialog's accessible name. */
  label: string;
  title: ComponentChildren;
  place: PopupPlace;
  /** The X and Esc in it. */
  onClose: () => void;
  children?: ComponentChildren;
}

export function PopupPanel(p: PopupPanelProps): VNode {
  const ref = useRef<HTMLDivElement>(null);
  const held = useRef(false);
  const place = useRef(p.place);
  place.current = p.place;
  const { settings, cells } = useServices();

  const doPlace = (): void => {
    const el = ref.current;
    if (el && !held.current) place.current(el);
  };
  useLayoutEffect(doPlace, [p.place]);

  useEffect(() => {
    const el = ref.current!;
    const win = el.ownerDocument.defaultView;
    let raf = 0;
    const later = (): void => {
      if (raf || !win) return;
      raf = win.requestAnimationFrame(() => {
        raf = 0;
        doPlace();
      });
    };
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(later);
    ro?.observe(el);
    win?.addEventListener('resize', later);
    const offs = [settings.subscribe(later), cells.subscribe(later)];
    return () => {
      ro?.disconnect();
      win?.removeEventListener('resize', later);
      for (const off of offs) off();
      if (raf) win?.cancelAnimationFrame(raf);
    };
  }, []);

  const hold = (on: boolean): void => {
    const el = ref.current;
    if (!el) return;
    if (on) {
      if (held.current) return;
      el.style.fontSize = getComputedStyle(el).fontSize;
      held.current = true;
    } else if (held.current) {
      held.current = false;
      el.style.fontSize = '';
      doPlace();
    }
  };

  const onMouseDown = (e: MouseEvent): void => {
    const el = ref.current!;
    const t = e.target as Element;
    // A text field takes the focus (and its caret) itself.
    if (t.closest?.('input, textarea, select')) return;
    e.preventDefault();
    el.setAttribute('data-pointer', '');
    const doc = el.ownerDocument;
    const f = t.closest?.<HTMLElement>(FOCUSABLE);
    const to = f && el.contains(f) ? f : el;
    if (doc.activeElement !== to) to.focus({ preventScroll: true });
    if (!el.contains(doc.activeElement)) el.focus({ preventScroll: true });
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    ref.current?.removeAttribute('data-pointer');
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      p.onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const el = ref.current!;
    const items = tabbables(el);
    if (items.length === 0) return;
    const at = items.indexOf(el.ownerDocument.activeElement as HTMLElement);
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const next = e.shiftKey ? (at <= 0 ? last : null) : at < 0 || at === items.length - 1 ? first : null;
    if (!next) return;
    e.preventDefault();
    next.focus({ preventScroll: true });
  };

  return (
    <div
      ref={ref}
      class={`wc-pop wc-sp ${p.cls}`}
      role="dialog"
      aria-label={p.label}
      tabIndex={-1}
      {...{ [OWN_KEYS_ATTR]: '' }}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
    >
      <div class="wc-pop-head">
        <span class="wc-pop-title">{p.title}</span>
        <button
          type="button"
          class="wc-pop-x"
          aria-label="Close"
          onClick={(e) => {
            e.stopPropagation();
            p.onClose();
          }}
        >
          <svg class="wc-pop-x-svg" viewBox="0 0 12 12" aria-hidden="true">
            <path d={CLOSE_X} />
          </svg>
        </button>
      </div>
      <HoldCtx.Provider value={hold}>{p.children}</HoldCtx.Provider>
    </div>
  );
}
