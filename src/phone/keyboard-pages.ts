// Our own keyboard on the phone's pages (ADR 0139, round 53f): the start
// menu's pages before any game exists, and the pages and frames opened from
// the game's menu over the cockpit. The same view and model as the game
// layout's keyboard (keyboard.ts, keyboard-model.ts); this is its second
// mount.
//
// - It stands at the bottom of the app box (`deps.root`), in a host of its
//   own above the start page and the menu's overlay (in the page only
//   while the keyboard is up). While it is up the
//   page ends above it: `html.wc-okb-pg` and `--wc-okb-page-h` (the
//   keyboard's height, on the app box) give `.wc-chrome` and `.wc-overlay`
//   a fixed bottom reserve (phone.css). The page lays itself out in what is
//   left, once, as it does when the window changes; nothing is measured in
//   a loop and nothing animates. The cockpit under a page is not touched:
//   MUME is told no window size for this keyboard.
// - The fields are the pages' one-line text fields, marked by the shared
//   components (`inputmode="none"`, src/core/own-keyboard.ts): new and
//   rename profile, new and rename script, the export title, Lite's
//   pattern, the manual's and the editors' Find and Replace, a script
//   setting's value. A field that is not marked (a multi-line field and the
//   CodeMirror buffers, until rounds 53g and 53h) keeps the device's
//   keyboard, and ours closes when one of them takes the focus: the two
//   never stand together.
// - A tap on a field opens the keyboard for it; so does a focus that comes
//   with a pointer or just after one (a dialog opened by a tap focuses its
//   field). A focus without a pointer (a physical keyboard) opens nothing.
//   The target follows the focus between fields. The fold key closes and
//   blurs. A field that goes away (the page closed, the dialog dismissed)
//   or loses the focus to something that is no field of ours closes the
//   keyboard at once.
// - Text goes in through the field's adapter (keyboard-fields.ts), never as
//   key events. Enter is sent as a marked synthetic keydown aimed at the
//   field (ADR 0139 §4; `deps.sendKey`, src/core/own-keyboard.ts), so the
//   frame stack and the fields' own handlers take it as from a real
//   keyboard. It acts on the click, not on the press: Enter may close the
//   dialog and the keyboard under the finger.
// - The fields have no history: the arrows are dimmed. A numeric field
//   (`data-okb-kind="digits"`) opens with the digit row up, whatever the
//   stored state; the row's key folds it away for that field only.
// - The layout setting and the vibration apply as in the game.
//
// The chunk rule holds (kit.ts): nothing of the app is imported but types;
// the shell hands in what is needed (`PageKeyboardDeps`). Everything is
// driven by events of the user; nothing runs per frame or per incoming
// line.

import type { SettingsStore } from '../settings';
import { OwnKeyboard } from './keyboard';
import { type TextField, fieldTarget, fieldUsable, isMarked, isOwnableField, isTextField } from './keyboard-fields';
import { type OkbLayout, type OkbTarget, OKB_UNIT_MAX, OKB_UNIT_MAX_LAND, okbBlockWidth, okbFromQuery, okbHeightPx, okbLayout } from './keyboard-model';
import { pulse } from './haptics';

/** A focus this long after a pointer was last down still counts as that pointer's (a dialog a tap opened). */
export const PAGE_POINTER_FOCUS_MS = 700;
/** What the page must keep above the keyboard, px: under it the digit row gives way, and then the keyboard does not open. */
export const PAGE_KEEP_PX = 150;

/** The air kept between a revealed field and the edges of what scrolls it, px. */
const REVEAL_MARGIN_PX = 8;

/** Where a page's fields live: the start page and the menu's overlay (not the cockpit, whose keyboard is the layer's). */
const PAGE_SCOPE = '.wc-chrome, .wc-overlay';

export interface PageKeyboardPlan {
  landscape: boolean;
  /** The digit row is shown. */
  digits: boolean;
  /** The keyboard's height, px: the page's bottom reserve. */
  height: number;
  /** The block of keys: its left edge and width. */
  left: number;
  width: number;
}

/**
 * The keyboard's place on a page `width` × `height` px, or null when the
 * page would keep less than `PAGE_KEEP_PX` above it. The block is centred;
 * a key is at most as wide as in the game layout. The digit row gives way
 * before the keyboard does.
 */
export function pageKeyboardPlan(width: number, height: number, layout: OkbLayout, digits: boolean): PageKeyboardPlan | null {
  if (!(width > 0) || !(height > 0)) return null;
  const landscape = width > height;
  const w = okbBlockWidth(width, layout, landscape ? OKB_UNIT_MAX_LAND : OKB_UNIT_MAX);
  for (const d of digits ? [true, false] : [false]) {
    const h = okbHeightPx(landscape, height, d);
    if (height - h >= PAGE_KEEP_PX) return { landscape, digits: d, height: h, left: (width - w) / 2, width: w };
  }
  return null;
}

export interface PageKeyboardDeps {
  /** The app box: the keyboard's host is appended to it, and it carries the reserve's variable. */
  root: HTMLElement;
  settings: SettingsStore;
  /** Sends a marked key to a field (src/core/own-keyboard.ts `sendOwnKey`). */
  sendKey(target: Element, key: 'Enter'): boolean;
  /** The keyboard came up on a page, or went (the shell: the too-small guards, and the game's own keyboard closes). */
  onUp?(up: boolean): void;
}

export interface PageKeyboardHandle {
  /** The host element (in the app box only while the keyboard is up). */
  readonly el: HTMLElement;
  readonly open: boolean;
  /** Closes the keyboard; the field keeps the focus unless `blur`. */
  close(blur?: boolean): void;
  dispose(): void;
}

/** Mounts the pages' keyboard on `deps.root` (closed). */
export function mountPageKeyboard(deps: PageKeyboardDeps): PageKeyboardHandle {
  const { root, settings } = deps;
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const html = doc.documentElement;
  const asked = okbFromQuery(new URLSearchParams(win?.location?.search ?? '').get('kbd'))?.layout ?? null;
  const wanted = (): OkbLayout => {
    const set = settings.get().phone.keyboard.layout;
    const nav = win?.navigator;
    return okbLayout(asked ?? (set === 'auto' ? null : set), nav?.languages?.length ? nav.languages : nav?.language);
  };

  let open = false;
  let field: TextField | null = null;
  let target: OkbTarget | null = null;
  let watch: MutationObserver | null = null;
  /** A numeric field shows the digit row whatever the stored state, until its key folds it away. */
  let forceDigits = false;
  let reserve = -1;
  /** A pointer is down anywhere now, and when one was last seen (a focus that follows it is that pointer's). */
  let down = false;
  let at = -Infinity;
  // The app box changed size while the keyboard is up (a rotation, the address bar): placed anew.
  // Only the box is watched, and only while open; the reserve does not change its size.
  const RO = win?.ResizeObserver;
  const sized = RO ? new RO(() => place()) : null;

  const host = doc.createElement('div');
  host.className = 'wc-okb-page';
  host.hidden = true;
  const inner = doc.createElement('div');
  inner.className = 'wc-okb-page-in';
  host.append(inner);

  const digitsWanted = (): boolean => settings.get().phone.keyboard.digits || forceDigits;

  const okb = new OwnKeyboard(
    doc,
    {
      target: () => {
        if (field !== null && !fieldUsable(field)) close(false);
        return target;
      },
      fold: () => close(true),
      toggleDigits: () => {
        // A numeric field's forced row: its key folds it away for this field; the stored state is not touched.
        if (forceDigits && !settings.get().phone.keyboard.digits) {
          forceDigits = false;
          place();
        } else settings.update({ phone: { keyboard: { digits: !settings.get().phone.keyboard.digits } } });
      },
      onPress: () => {
        if (settings.get().phone.vibrate) pulse(win?.navigator);
      },
      enterOnClick: true,
    },
    wanted(),
    digitsWanted(),
  );
  inner.append(okb.el);
  // (The host is in the page only while the keyboard is up: `place`, `close`.)

  const pageField = (el: Element | null | undefined): TextField | null => {
    if (!el || !isOwnableField(el) || !isMarked(el)) return null;
    return root.contains(el) && el.closest(PAGE_SCOPE) ? el : null;
  };

  /** Places the open keyboard for the app box as it is now; closes it where the page has no room for it. */
  function place(): void {
    if (!open) return;
    if (host.parentNode !== root) root.append(host);
    host.hidden = false;
    const box = root.getBoundingClientRect();
    const st = win?.getComputedStyle(inner);
    // (The host's inner box keeps out of the safe area at the sides: its width is the keys' room.)
    const sideL = parseFloat(st?.marginLeft ?? '') || 0;
    const sideR = parseFloat(st?.marginRight ?? '') || 0;
    const layout = wanted();
    const plan = pageKeyboardPlan(box.width - sideL - sideR, box.height, layout, digitsWanted());
    if (!plan) {
      close(true);
      return;
    }
    okb.setLayout(layout);
    okb.setDigits(plan.digits);
    if (plan.height !== reserve) {
      reserve = plan.height;
      root.style.setProperty('--wc-okb-page-h', `${plan.height}px`);
    }
    okb.place({ top: 0, left: plan.left, width: plan.width });
  }

  /**
   * The field is brought into view above the keyboard, once, after the page
   * has laid itself out in what is left. Only a scrolling box the page made
   * (`overflow-y: auto | scroll`) is moved: `scrollIntoView` would also
   * scroll the clipped boxes around it (the page itself), and the whole
   * page would slide away under the keyboard.
   */
  function reveal(f: TextField): void {
    if (!win) return;
    win.requestAnimationFrame(() =>
      win.setTimeout(() => {
        if (!open || field !== f || !f.isConnected) return;
        const limit = host.getBoundingClientRect().top;
        const r = f.getBoundingClientRect();
        let top = r.top;
        let bottom = r.bottom;
        if (bottom <= limit - REVEAL_MARGIN_PX && top >= 0) return;
        for (let el = f.parentElement; el && el !== root; el = el.parentElement) {
          if (el.scrollHeight <= el.clientHeight) continue;
          const oy = win.getComputedStyle(el).overflowY;
          if (oy !== 'auto' && oy !== 'scroll') continue;
          const b = el.getBoundingClientRect();
          const lo = Math.max(b.top, 0) + REVEAL_MARGIN_PX;
          const hi = Math.min(b.bottom, limit) - REVEAL_MARGIN_PX;
          const d = bottom > hi ? bottom - hi : top < lo ? top - lo : 0;
          if (d === 0) continue;
          const before = el.scrollTop;
          el.scrollTop = before + d;
          const moved = el.scrollTop - before;
          top -= moved;
          bottom -= moved;
        }
      }, 0),
    );
  }

  /** Follows the field typed in, so one that goes away closes the keyboard at once (as the layer does for the game's fields). */
  function follow(f: TextField | null): void {
    watch?.disconnect();
    watch = null;
    const MO = win?.MutationObserver;
    if (!f || !MO) return;
    const mo = new MO(() => {
      if (field !== null && !fieldUsable(field)) close(false);
    });
    mo.observe(f, { attributes: true, attributeFilter: ['hidden', 'disabled', 'readonly', 'style', 'class', 'inputmode'] });
    for (let el = f.parentElement; el && el !== root; el = el.parentElement) mo.observe(el, { attributes: true, childList: true });
    mo.observe(root, { childList: true });
    watch = mo;
  }

  function setField(f: TextField): void {
    if (f === field) return;
    field = f;
    forceDigits = f.getAttribute('data-okb-kind') === 'digits';
    follow(f);
    target = fieldTarget(f, { submit: () => void deps.sendKey(f, 'Enter') });
    okb.sync();
  }

  function openFor(f: TextField): void {
    const was = field;
    setField(f);
    if (doc.activeElement !== f) f.focus({ preventScroll: true });
    if (open) {
      // (Another field: the same keyboard, unless it is a numeric one's digit row that comes or goes.)
      if (was !== f) {
        place();
        reveal(f);
      }
      return;
    }
    open = true;
    html.classList.add('wc-okb-pg');
    deps.onUp?.(true);
    place();
    if (!open) return;
    sized?.observe(root);
    reveal(f);
  }

  function close(blur = false): void {
    if (!open) return;
    open = false;
    const typed = field;
    field = null;
    target = null;
    forceDigits = false;
    follow(null);
    sized?.disconnect();
    okb.place(null);
    host.hidden = true;
    host.remove();
    html.classList.remove('wc-okb-pg');
    root.style.removeProperty('--wc-okb-page-h');
    reserve = -1;
    // A focus the page gives a field right after this (a frame taking its focus back) opens nothing: only a new press does.
    at = -Infinity;
    down = false;
    deps.onUp?.(false);
    if (blur && typed && doc.activeElement === typed) typed.blur();
  }

  const clock = (): number => win?.performance.now() ?? Date.now();
  const onDown = (): void => {
    down = true;
    at = clock();
  };
  const onUp = (): void => {
    if (down) at = clock();
    down = false;
  };
  const onFocus = (e: FocusEvent): void => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const f = pageField(t);
    if (f) {
      if (open || down || clock() - at < PAGE_POINTER_FOCUS_MS) openFor(f);
      return;
    }
    // A text field that is not ours (a multi-line field, an editor's buffer, the game's command
    // line): it has the device's keyboard or the game's, and ours gives way.
    if (open && isTextField(t)) close(false);
  };
  // The field lost the focus and no field of ours took it (a tap beside it, Esc): the keyboard
  // goes, as the device's does. Asked after the focus has landed; a window that lost the focus
  // keeps its active element, so an app switch closes nothing.
  const onFocusOut = (e: FocusEvent): void => {
    if (!open || e.target !== field) return;
    if (pageField(e.relatedTarget as Element | null)) return;
    const f = field;
    win?.setTimeout(() => {
      if (!open || field !== f) return;
      if (doc.activeElement !== f) close(false);
    }, 0);
  };
  // A tap on a field of ours that has the focus already (after the fold key).
  const onClick = (e: Event): void => {
    const f = e.target instanceof Element ? pageField(e.target) : null;
    if (f) openFor(f);
  };
  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('pointerup', onUp, true);
  doc.addEventListener('pointercancel', onUp, true);
  doc.addEventListener('focusin', onFocus);
  doc.addEventListener('focusout', onFocusOut);
  root.addEventListener('click', onClick, true);
  const offSettings = settings.subscribe((next, prev) => {
    if (next.phone.keyboard.digits !== prev.phone.keyboard.digits || next.phone.keyboard.layout !== prev.phone.keyboard.layout) {
      if (open) place();
      else okb.setLayout(wanted());
    }
  });

  return {
    el: host,
    get open() {
      return open;
    },
    close,
    dispose() {
      close(false);
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('pointerup', onUp, true);
      doc.removeEventListener('pointercancel', onUp, true);
      doc.removeEventListener('focusin', onFocus);
      doc.removeEventListener('focusout', onFocusOut);
      root.removeEventListener('click', onClick, true);
      sized?.disconnect();
      offSettings();
      okb.dispose();
      host.remove();
    },
  };
}
