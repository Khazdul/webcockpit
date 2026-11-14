// The lantern kit's overlays (stage 42, ADR 0127): dialogs, the keys box
// and popovers. Package 42c owns this file (and look-overlay.css).
//
// A dialog is a small Lykta box (the iron frame, the riveted brackets, the
// hood with its title) centred over the box or the window content below
// (not over the whole game), on a dim veil. Two shapes:
//
// - An overlay frame: a look frame pushed with `{ overlay: true }`; the
//   frame below stays drawn and inert, the dialog's frame has the keys,
//   and it centres over the page's box (`--wc-ov-*`, set by the stack):
//
//     const AskFrame = lookFrame(function AskFrame(p: { done(yes: boolean): void }) {
//       const nav = useNav();
//       const close = (yes: boolean): void => { nav.pop(); p.done(yes); };
//       return (
//         <Dialog title="Delete" dlg="delete" onCancel={() => close(false)}
//                 buttons={[{ id: 'YES', label: 'Yes', letter: 'y', primary: true, danger: true, run: () => close(true) },
//                           { id: 'NO', label: 'No', letter: 'n', run: () => close(false) }]}>
//           <p class="wc-lk-q">Delete “gibur”?</p>
//         </Dialog>
//       );
//     });
//     nav.push(<AskFrame done={…} />, { overlay: true });
//
// - `inline`: drawn by the page inside its own content (over the nearest
//   positioned ancestor, e.g. the box's window), with the keys through a
//   key layer over the page's handler while it is up.
//
// Keys: its letters (outside text fields), Enter = the keyboard's button
// (the primary until Tab / ← → walk the buttons, skipping disabled ones),
// Space as Enter outside fields, Esc = onCancel (any other key too with
// `anyKeyCancels`). A dialog holds every plain key while it is up (nav
// keys and characters), so the page below never acts on one; keys with
// Ctrl / Alt / Meta and function keys pass. In a text field of the dialog
// the editing keys are the field's; Enter, Esc and Tab are the dialog's.
// An overlay dialog's keys are its frame's handler (`useKeys`, latest
// wins); a dialog frame that wants keys of its own adds a key layer
// (`useKeyLayer`), which comes first.
//
// A dialog with several text fields (stage 60: Change password) has a ring
// of its own over the fields and the buttons, as a key layer of its frame
// (the account pages' `useFormKeys` with `layer`). It hands the dialog the
// keyboard's button as `at` (an id, or null while a field has the focus);
// the dialog then draws that cursor and leaves Tab, Enter, Space and the
// arrows to the owner: only Esc and the hold are its own.

import type { ComponentChildren, FunctionComponent, VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { GlassButton } from './look-controls';
import { lookFrame } from './look';
import { inTextField, letterOf } from './look-keys';
import { type NavKey, navKey } from './nav';
import { type Nav, useKeyLayer, useKeys } from './stack';
import './look-overlay.css';

export interface DialogButton {
  id: string;
  label: string;
  letter?: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  run(): void;
}

export interface DialogProps {
  /** The hood's title (and the dialog's accessible name). */
  title: string;
  /** `data-dlg` (tests). */
  dlg: string;
  buttons: DialogButton[];
  onCancel(): void;
  /** A line under the content in the danger colour (`role=alert`). */
  error?: string | null;
  anyKeyCancels?: boolean;
  /** Inside a frame (a key layer), not an overlay frame. */
  inline?: boolean;
  /** CSS px (default 460; never wider than the room). */
  width?: number;
  /**
   * The keyboard's button by id, or null for none: the owner walks and
   * presses (a ring of its own over the dialog's fields and buttons, in a
   * key layer). Left out: the dialog walks its buttons itself.
   */
  at?: string | null;
  children?: ComponentChildren;
}

const MODIFIERS = ['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS'];
const plain = (e: KeyboardEvent): boolean => !e.ctrlKey && !e.altKey && !e.metaKey;

/** Gives the focus back to the frame stack when it was inside `el` (a field of a closing dialog). */
function releaseFocus(el: HTMLElement | null): void {
  const doc = el?.ownerDocument;
  if (!el || !doc || !el.contains(doc.activeElement)) return;
  el.closest<HTMLElement>('.wc-stack')?.focus({ preventScroll: true });
}

/** A dialog: a small Lykta box with a hood title, its content, an error line and a row of buttons. */
export function Dialog(p: DialogProps): VNode {
  const [walked, setWalked] = useState<number | null>(null);
  const pr = useRef(p);
  pr.current = p;
  const ref = useRef<HTMLElement>(null);

  const enabled = (): number[] => pr.current.buttons.flatMap((b, i) => (b.disabled ? [] : [i]));
  const primary = (): number => pr.current.buttons.findIndex((b) => b.primary && !b.disabled);
  /** The keyboard's button: the walked one while it is enabled, else the primary (or none). */
  const current = (): number => (walked !== null && enabled().includes(walked) ? walked : primary());
  const press = (): void => {
    const b = pr.current.buttons[current()];
    if (b && !b.disabled) b.run();
  };
  const walk = (d: 1 | -1, ring: boolean): void => {
    const en = enabled();
    if (en.length === 0) return;
    const at = en.indexOf(current());
    const to = at < 0 ? (d > 0 ? 0 : en.length - 1) : ring ? (at + d + en.length) % en.length : Math.max(0, Math.min(en.length - 1, at + d));
    setWalked(en[to]!);
  };

  const handle = (e: KeyboardEvent, nk: NavKey | null): boolean => {
    const q = pr.current;
    const field = inTextField(e.target);
    const textarea = (e.target as HTMLElement | null)?.tagName === 'TEXTAREA';
    if (nk === 'back') {
      q.onCancel();
      return true;
    }
    // The owner's ring took Tab, Enter and Space before this; what is left is the field's, or held.
    if (q.at !== undefined) return field ? false : nk !== null || (plain(e) && e.key.length === 1);
    if (e.key === 'Enter' && plain(e) && !(textarea && e.shiftKey)) {
      press();
      return true;
    }
    if (nk === 'tab' || nk === 'backtab') {
      if (enabled().length > 1 || !q.anyKeyCancels) {
        walk(nk === 'tab' ? 1 : -1, true);
        return true;
      }
    }
    if (!field) {
      const l = letterOf(e);
      const byLetter = l ? q.buttons.find((b) => b.letter?.toLowerCase() === l && !b.disabled) : undefined;
      if (byLetter) {
        byLetter.run();
        return true;
      }
      if (nk === 'activate') {
        press();
        return true;
      }
      if ((nk === 'left' || nk === 'right') && enabled().length > 1) {
        walk(nk === 'right' ? 1 : -1, false);
        return true;
      }
    }
    if (q.anyKeyCancels && !MODIFIERS.includes(e.key)) {
      q.onCancel();
      return true;
    }
    if (field) return false;
    // Hold every plain key (the page below never acts on one); Ctrl / Alt / Meta and F-keys pass.
    return nk !== null || (plain(e) && e.key.length === 1);
  };

  // Keys: an overlay frame's own handler, or a layer over the page's (inline).
  useKeyLayer(handle, !!p.inline);
  if (!p.inline) useKeys(handle);
  useLayoutEffect(() => {
    const el = ref.current;
    return () => releaseFocus(el);
  }, []);

  const cur = p.at !== undefined ? p.buttons.findIndex((b) => b.id === p.at && !b.disabled) : walked === null ? -1 : current();
  return (
    <div
      class={'wc-lk-veil' + (p.inline ? ' is-inline' : '')}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget || (e.target as Element).classList?.contains('wc-lk-dslot')) {
          if (pr.current.anyKeyCancels) pr.current.onCancel();
        }
      }}
    >
      <div class="wc-lk-dslot">
        <section
          ref={ref}
          class="wc-lk-dialog"
          data-dlg={p.dlg}
          role="dialog"
          aria-modal="true"
          aria-label={p.title}
          style={p.width ? { width: `min(${p.width}px, 100%)` } : undefined}
          // An inline dialog's own fields keep their editing keys (the stack leaves
          // keys from inside it alone); Enter, Esc and Tab there are the dialog's.
          {...(p.inline ? { 'data-wc-own-keys': '' } : {})}
          onKeyDown={
            p.inline
              ? (e) => {
                  if (!inTextField(e.target)) return;
                  if (handle(e, navKey(e))) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }
              : undefined
          }
        >
          <i class="wc-lk-br wc-lk-b1" />
          <i class="wc-lk-br wc-lk-b2" />
          <i class="wc-lk-br wc-lk-b3" />
          <i class="wc-lk-br wc-lk-b4" />
          <div class="wc-lk-hood">
            <span class="wc-lk-hood-t">{p.title}</span>
          </div>
          <div class="wc-lk-dwin">
            <div class="wc-lk-dialog-b">{p.children}</div>
            {p.error ? (
              <div class="wc-lk-dialog-err" role="alert">
                {p.error}
              </div>
            ) : null}
            {p.buttons.length > 0 && (
              <div class="wc-lk-btns wc-lk-dialog-btns">
                {p.buttons.map((b, i) => (
                  <GlassButton
                    key={b.id}
                    id={b.id}
                    label={b.label}
                    {...(b.letter ? { letter: b.letter } : {})}
                    {...(b.primary ? { primary: true } : {})}
                    {...(b.danger ? { danger: true } : {})}
                    {...(b.disabled ? { disabled: true } : {})}
                    {...(i === cur ? { selected: true } : {})}
                    onClick={() => b.run()}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export type KeyHelpRows = [keys: string, what: string][];

/** A two-column keys list (the content of a Dialog): the keys in the terminal font, what they do. */
export function KeyHelp(p: { rows: KeyHelpRows }): VNode {
  return (
    <dl class="wc-lk-keyhelp">
      {p.rows.map(([k, w]) => (
        <div key={k + w} class="wc-lk-kh-row">
          <dt>{k}</dt>
          <dd>{w}</dd>
        </div>
      ))}
    </dl>
  );
}

type KeyHelpFrameProps = { title: string; rows: KeyHelpRows; nav: Nav };

// Made on first use: look.tsx re-exports this module, so `lookFrame` is not
// ready while it is being evaluated.
let keyHelpFrame: FunctionComponent<KeyHelpFrameProps> | null = null;

function KeyHelpFrame(): FunctionComponent<KeyHelpFrameProps> {
  keyHelpFrame ??= lookFrame(function KeyHelpFrame(p: KeyHelpFrameProps): VNode {
    const close = (): void => p.nav.pop();
    return (
      <Dialog
        title={p.title}
        dlg="keys"
        width={520}
        buttons={[{ id: 'OK', label: 'OK', primary: true, run: close }]}
        onCancel={close}
        anyKeyCancels
      >
        <KeyHelp rows={p.rows} />
      </Dialog>
    );
  });
  return keyHelpFrame;
}

/** Opens the keys box (`data-dlg="keys"`) as an overlay frame over the current one; any key closes it. */
export function openKeyHelp(nav: Nav, title: string, rows: KeyHelpRows): void {
  const Frame = KeyHelpFrame();
  nav.push(<Frame title={title} rows={rows} nav={nav} />, { overlay: true });
}

export interface PopoverProps {
  /** The button it hangs from (it opens below it, or above when there is no room). */
  anchor: () => HTMLElement | null;
  onClose(): void;
  label: string;
  children?: ComponentChildren;
}

/** Room kept between the popover and its anchor, and from the edges. */
const POP_GAP = 6;

/**
 * A popover anchored to a button: a small lit plate of the Lykta family
 * below the anchor (above when there is no room), inside its positioned
 * ancestor. Esc closes it (a key layer, and from its own fields), so does
 * a press outside it and its anchor (the anchor's own click toggles). It
 * carries `data-wc-own-keys`, so keys typed in its fields stay theirs.
 */
export function Popover(p: PopoverProps): VNode {
  const ref = useRef<HTMLDivElement>(null);
  const pr = useRef(p);
  pr.current = p;
  useKeyLayer((_e, nk) => {
    if (nk !== 'back') return false;
    pr.current.onClose();
    return true;
  });

  // Placement: under the anchor in the offset parent's px, kept inside it; current on resize.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = (): void => {
      const a = pr.current.anchor();
      const parent = (el.offsetParent as HTMLElement | null) ?? el.parentElement;
      if (!a || !parent) return;
      const ar = a.getBoundingClientRect();
      const pr2 = parent.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const sx = parent.scrollLeft;
      const sy = parent.scrollTop;
      const roomW = parent.clientWidth || pr2.width;
      let left = ar.left - pr2.left + sx;
      left = Math.max(POP_GAP + sx, Math.min(left, sx + roomW - w - POP_GAP));
      const below = ar.bottom - pr2.top + sy + POP_GAP;
      const above = ar.top - pr2.top + sy - POP_GAP - h;
      const view = el.ownerDocument.defaultView;
      const fitsBelow = ar.bottom + POP_GAP + h <= Math.min(pr2.bottom, view?.innerHeight ?? Infinity);
      const top = fitsBelow || above < sy ? below : above;
      el.style.left = `${Math.round(left)}px`;
      el.style.top = `${Math.round(top)}px`;
      el.dataset.side = top === below ? 'below' : 'above';
    };
    place();
    const doc = el.ownerDocument;
    const view = doc.defaultView;
    view?.addEventListener('resize', place);
    // A scrolling page between the anchor and the offset parent moves the anchor.
    doc.addEventListener('scroll', place, { capture: true, passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    ro?.observe(el);
    return () => {
      view?.removeEventListener('resize', place);
      doc.removeEventListener('scroll', place, { capture: true });
      ro?.disconnect();
      releaseFocus(el);
    };
  }, []);

  // A press outside (not on the anchor, whose click toggles) closes it.
  useEffect(() => {
    const el = ref.current;
    const doc = el?.ownerDocument;
    if (!el || !doc) return;
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node;
      if (el.contains(t) || pr.current.anchor()?.contains(t)) return;
      pr.current.onClose();
    };
    doc.addEventListener('pointerdown', onDown, true);
    return () => doc.removeEventListener('pointerdown', onDown, true);
  }, []);

  return (
    <div
      ref={ref}
      class="wc-lk-pop"
      role="dialog"
      aria-label={p.label}
      data-wc-own-keys=""
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        pr.current.onClose();
      }}
    >
      <div class="wc-lk-pop-in">{p.children}</div>
    </div>
  );
}
