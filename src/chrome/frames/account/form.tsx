// What the account pages share (stage 60): the keys of a page with text
// fields, the pages' way to each other, and a few small pieces.
//
// ── Keys (`useFormKeys`) ─────────────────────────────────────────────────
//
// A page with text fields has no key letters (a letter is text). Its keys:
//
//   Tab / Shift+Tab   walk the page's stops in order, round: the fields
//                     (which take the real focus), then the buttons and
//                     links (the keyboard's cursor: `at === id`, drawn with
//                     `selected`). On a phone with our own keyboard the
//                     ring is the fields only, so the keyboard stays up.
//   Enter             presses the stop the cursor is on, else the page's
//                     lit button (`submit`, when `canSubmit`)
//   Space             presses the stop the cursor is on (outside a field)
//   Esc               `back` (the page leaves; while working: Cancel)
//
// The frame stack swallows Tab (src/chrome/kit/stack.tsx), so the ring is
// the page's own. A stop is `{ id, field }` (a ref to its input),
// `{ id, run }` (a button or a link) or `{ id, focus }` (something that
// takes the focus itself: the Turnstile frame). Disabled stops are
// skipped. While `busy` every plain key is held (nothing is typed into a
// form that is being sent).
//
//   const keys = useFormKeys({ stops, submit, canSubmit, back, busy });
//   <form class="wc-ac-form" {...keys.form}> … <GlassButton selected={keys.at === 'GO'} … /> </form>
//
// In a dialog (the Account page's, with several fields) the same ring is a
// key layer over the kit `Dialog`'s own keys: `layer: true`, and the
// dialog draws the cursor (`<Dialog at={keys.at} …>`).
//
// `keys.form` carries `onSubmit` (prevented: the CSP's `form-action
// 'none'`; a real `<form>` is there for the browsers' password managers)
// and `onFocusIn` (a field that takes the focus takes the cursor back).
//
// ── The pages' way to each other (`go`) ──────────────────────────────────
//
// The account pages are siblings: one of them stands on the start menu at
// a time, and going from one to another replaces it (`nav.replace`), so
// Back and Esc never walk through a stale form and nothing can pop its way
// back to the recovery code. `go(nav, 'login', { notice })` and so on; the
// components are registered by index.tsx (no import cycles).

import type { ComponentChildren, FunctionComponent, VNode } from 'preact';
import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type PasswordStrength, checkPassword, passwordLength, passwordStrength, passwordsMatch } from '../../../cloud/account';
import { pageKeyboard } from '../../../core/own-keyboard';
import { inTextField } from '../../kit/look';
import { type KeyHandler, type Nav, useKeyLayer, useKeys } from '../../kit/stack';
import { charactersWords, strengthMark, waitClock } from './words';

// ------------------------------------------------------------ the pages

export interface PageProps {
  login: { notice?: string; name?: string };
  create: Record<string, never>;
  recover: { name?: string };
  /** The recovery code of a new account: shown once, then on to `next`. */
  code: { name: string; code: string; next: 'account' | 'login' };
  account: Record<string, never>;
}

export type PageName = keyof PageProps;

const pages: { [K in PageName]?: FunctionComponent<PageProps[K]> } = {};

/** index.tsx: the page components. */
export function registerPages(all: { [K in PageName]: FunctionComponent<PageProps[K]> }): void {
  Object.assign(pages, all);
}

/** Goes to another account page, in this one's place. */
export function go<K extends PageName>(nav: Nav, page: K, props?: PageProps[K]): void {
  const c = pages[page] as FunctionComponent<PageProps[K]> | undefined;
  if (c) nav.replace(h(c, (props ?? {}) as PageProps[K] & Record<string, unknown>) as VNode);
}

// ------------------------------------------------------------ keys

export interface FormStop {
  id: string;
  /** A text field: it takes the real focus. */
  field?: { current: HTMLInputElement | null };
  /** A button or a link: the keyboard's cursor rests on it; Enter and Space run it. */
  run?: () => void;
  /** Something that takes the focus itself (the Turnstile frame); false: it could not. */
  focus?: () => boolean;
  disabled?: boolean;
}

export interface FormKeys {
  /** The button or link the keyboard's cursor is on, or null (a field has the focus, or nothing). */
  at: string | null;
  form: { onSubmit(e: Event): void; onFocusIn(e: FocusEvent): void };
}

const plain = (e: KeyboardEvent): boolean => !e.ctrlKey && !e.altKey && !e.metaKey;

export function useFormKeys(o: {
  stops: FormStop[];
  /** The page's lit button. */
  submit(): void;
  canSubmit: boolean;
  /** Esc and Back. */
  back(): void;
  /** Working: the keys are held; Esc is `cancel`. */
  busy?: boolean;
  cancel?(): void;
  /** In a dialog: a key layer over the dialog's own keys, not the frame's handler. Never changes in a component's life. */
  layer?: boolean;
}): FormKeys {
  const [at, setAt] = useState<string | null>(null);
  const latest = useRef(o);
  latest.current = o;

  const handler: KeyHandler = (e, nk) => {
    const q = latest.current;
    if (q.busy) {
      if (nk === 'back') q.cancel?.();
      return nk !== null || (plain(e) && e.key.length === 1);
    }
    if (nk === 'back') {
      q.back();
      return true;
    }
    const field = inTextField(e.target);
    const usable = q.stops.filter((s) => !s.disabled && (s.field ? s.field.current !== null && !s.field.current.disabled : true));
    // Our own keyboard on a phone: the ring is the fields, so the keyboard stays up.
    const ring = pageKeyboard() ? usable.filter((s) => s.field) : usable;
    if (nk === 'tab' || nk === 'backtab') {
      if (ring.length === 0) return true;
      const active = (e.target as Element | null)?.ownerDocument?.activeElement ?? null;
      let i = ring.findIndex((s) => s.field && s.field.current === active);
      if (i < 0 && at !== null) i = ring.findIndex((s) => s.id === at);
      const d = nk === 'tab' ? 1 : -1;
      for (let n = 0; n < ring.length; n++) {
        i = i < 0 ? (d > 0 ? 0 : ring.length - 1) : (i + d + ring.length) % ring.length;
        const s = ring[i]!;
        if (s.field) {
          setAt(null);
          s.field.current?.focus({ preventScroll: false });
          return true;
        }
        if (s.focus) {
          if (!s.focus()) continue;
          setAt(null);
          return true;
        }
        // A button or a link: the focus goes back to the frame stack, the cursor to the stop.
        const el = active as HTMLElement | null;
        if (el && inTextField(el)) {
          el.blur();
          el.closest<HTMLElement>('.wc-stack')?.focus({ preventScroll: true });
        }
        setAt(s.id);
        return true;
      }
      return true;
    }
    const cur = at === null ? undefined : usable.find((s) => s.id === at && s.run);
    if (e.key === 'Enter' && plain(e)) {
      if (cur) cur.run!();
      else if (q.canSubmit) q.submit();
      return true;
    }
    if (nk === 'activate' && !field) {
      cur?.run?.();
      return true;
    }
    return false;
  };
  useKeyLayer(handler, o.layer === true);
  if (!o.layer) useKeys(handler);

  // A stop that went away or was disabled gives the cursor up.
  const gone = at !== null && !o.stops.some((s) => s.id === at && !s.disabled);
  useEffect(() => {
    if (gone) setAt(null);
  }, [gone]);

  return {
    at: gone ? null : at,
    form: {
      onSubmit: (e) => e.preventDefault(),
      onFocusIn: (e) => {
        if (inTextField(e.target)) setAt(null);
      },
    },
  };
}

// ------------------------------------------------------------ layout

/** A window this narrow or this low gets the long forms as a tall box (the phone's size, either way up). */
const TALL_PAGE = '(max-width: 640px), (max-height: 560px)';

/**
 * True where a long form (Create account, Recovery) should be a `tall`
 * box with a scrolling body: a phone-size window, upright or on its side.
 * There the box fills the screen (no wordmark above it) and its body
 * scrolls; elsewhere the box is as high as its content.
 */
export function useTallPage(): boolean {
  const query = (): MediaQueryList | null => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(TALL_PAGE) : null);
  const [tall, setTall] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const q = query();
    if (!q) return;
    const on = (): void => setTall(q.matches);
    on();
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return tall;
}

// ------------------------------------------------------------ pieces

/** The form's own message (a failed try), in the danger colour. Always laid out when `text`. */
export function FormError(p: { text: string | null; id?: string }): VNode | null {
  if (!p.text) return null;
  return (
    <p class="wc-ac-err" role="alert" data-err={p.id}>
      {p.text}
    </p>
  );
}

/** A quiet note under a form (what happens, what holds). `<b>` in it is a little brighter. */
export function SmallNote(p: { class?: string; children?: ComponentChildren }): VNode {
  return <p class={'wc-ac-small' + (p.class ? ' ' + p.class : '')}>{p.children}</p>;
}

/**
 * The wait after too many wrong tries (`locked`, `retryAfter` seconds): a
 * countdown and one plain sentence. Counts on the clock (a tab asleep
 * wakes at the right time) and calls `onDone` when the time is up.
 */
export function WaitPlate(p: { seconds: number; onDone(): void; children?: ComponentChildren }): VNode {
  const until = useRef(Date.now() + Math.max(0, p.seconds) * 1000);
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil(p.seconds)));
  const done = useRef(p.onDone);
  done.current = p.onDone;
  useEffect(() => {
    until.current = Date.now() + Math.max(0, p.seconds) * 1000;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = (): void => {
      const s = Math.max(0, Math.ceil((until.current - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) {
        if (timer) clearInterval(timer);
        timer = null;
        done.current();
      }
    };
    tick();
    timer = setInterval(tick, 500);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [p.seconds]);
  return (
    <div class="wc-ac-wait" role="alert" data-wait={left}>
      <div class="wc-ac-wait-t">Too many wrong tries</div>
      <div class="wc-ac-wait-c">
        <span class="wc-ac-wait-l">Try again in </span>
        <span class="wc-ac-wait-n" aria-live="off">
          {waitClock(left)}
        </span>
      </div>
      <SmallNote>{p.children ?? 'Nobody can log in to this name until the time is up, from any device. Nothing is wrong with the account.'}</SmallNote>
    </div>
  );
}

/** A new password typed twice, as the pages judge it (Create account, Recovery, Change password). */
export interface NewPassword {
  /** The length that counts. */
  count: number;
  /** Under the first field, or null. */
  pwError: string | null;
  /** Under the second field, or null. */
  pw2Error: string | null;
  /** Both fields can be used. */
  valid: boolean;
}

/**
 * The checks of a new password and its repeat. `left`: the field was left
 * once, so its error may show (never while the first characters are typed).
 */
export function checkNewPassword(pw: string, pw2: string, left: { pw?: boolean; pw2?: boolean }): NewPassword {
  const problem = checkPassword(pw);
  const count = passwordLength(pw);
  const same = passwordsMatch(pw, pw2);
  return {
    count,
    pwError: problem === 'too_short' && (left.pw || pw2.length > 0) ? `${charactersWords(count)}: at least 10.` : null,
    pw2Error: pw2.length > 0 && !same && (left.pw2 || passwordLength(pw2) >= count) ? 'The two passwords differ.' : null,
    valid: problem === null && pw2.length > 0 && same,
  };
}

/** The line under a new password: `empty` until something is typed, then the strength hint. */
export function newPasswordHint(pw: string, name: string, empty: string): ComponentChildren {
  return pw.length === 0 ? empty : <Strength strength={passwordStrength(pw, name)} length={passwordLength(pw)} />;
}

/** The password's strength hint: a four-part meter, its word and the count. A hint, never a gate. */
export function Strength(p: { strength: PasswordStrength; length: number }): VNode {
  const m = strengthMark(p.strength);
  return (
    <span class="wc-ac-strength-line">
      <span class={`wc-ac-strength is-${m.step}`} data-strength={p.strength} role="img" aria-label={`Strength: ${m.word}`}>
        <i />
        <i />
        <i />
        <i />
        <em>{m.word}</em>
      </span>
      {charactersWords(p.length)}
    </span>
  );
}
