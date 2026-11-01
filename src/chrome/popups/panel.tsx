// A settings popup's panel (ADR 0107): the bar's `.wc-pop` box with a
// title, a close cross and its content, shared by the Settings popup and
// the pane gear popups. The surface (surface.tsx) mounts one at a time.
//
// - Keys (ADR 0108): it carries `data-wc-own-keys`, so the input pane's
//   key and click routing leaves it alone, and the surface gives it the
//   focus when it opens. A mouse down in it never starts a text selection
//   and gives the focus to the control pressed (or the panel), so the
//   keyboard goes on from there; a text field takes its focus itself. A
//   click in the game text or the input gives the keys back without
//   closing it. A press hides the focus ring until a key is used
//   (`data-pointer`).
// - Esc in it closes it (a control's own Esc, such as an open dropdown
//   list, comes first); Tab and Shift+Tab wrap inside it; Page Up/Down
//   scroll its body when it scrolls and are swallowed otherwise (the bar's
//   `popupKey`, src/menubar/popup.ts).
// - Placed by the caller's `place` (above the Settings icon, beside a pane)
//   when it opens, on a resize of the window or of itself, and on every
//   settings or cell change (the font moves the bar). While a slider is
//   held (`useHold`), it keeps its font size and place, and refits when the
//   slider is let go: a Size drag would otherwise move the thumb from under
//   the pointer.

import { type ComponentChildren, type VNode, createContext } from 'preact';
import { useContext, useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { CLOSE_X } from '../../menubar/icons';
import { focusPopup, popupKey, popupTabbables, pressPopup } from '../../menubar/popup';
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

/** The panel's tabbable controls, in document order (visible ones only). */
export const tabbables = popupTabbables;

export interface PopupPanelProps {
  /** Extra class on `.wc-pop` (`wc-sp-settings` …). */
  cls: string;
  /** The dialog's accessible name. */
  label: string;
  title: ComponentChildren;
  place: PopupPlace;
  /** The X and Esc in it. */
  onClose: () => void;
  /** Takes the focus when it mounts (a popup drawn inside a page; the surface focuses its own). */
  focusOnOpen?: boolean;
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
  useLayoutEffect(() => {
    if (p.focusOnOpen && ref.current) focusPopup(ref.current);
  }, []);

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

  const onMouseDown = (e: MouseEvent): void => pressPopup(e, ref.current!);

  const onKeyDown = (e: KeyboardEvent): void => {
    const el = ref.current!;
    if (e.key === 'Escape' && !e.defaultPrevented && !e.ctrlKey && !e.altKey && !e.metaKey) {
      el.removeAttribute('data-pointer');
      e.preventDefault();
      e.stopPropagation();
      p.onClose();
      return;
    }
    if (popupKey(e, el)) e.preventDefault();
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
