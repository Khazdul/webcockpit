// The Turnstile widget as the account pages use it (stage 60): a hook
// that mounts the widget of turnstile.ts while a page needs it and draws
// its box and its words.
//
// HOW TO USE IT:
//
//   const ts = useTurnstile(needed);          // false: nothing is loaded or drawn
//   …
//   {ts.box}                                  // where the widget stands (null while not needed)
//   <GlassButton primary disabled={… || (needed && !ts.ready)} … />
//   …
//   const token = ts.take();                  // on submit: the token, ONCE (null: none ready)
//   const r = await handle.submit({ ...(token ? { turnstile: token } : {}), … });
//
// `take()` resets the widget, so after a failed try the next token is
// already on its way; never keep a token. `ts.focus()` is a Tab stop of
// the page (form.tsx `{ id, focus }`): it moves the keyboard to the
// widget's door, from where the browser's own Tab goes into the widget.
// The widget is removed when the page goes or `needed` turns false.
//
// Log in passes `needed` only after `turnstile_required`; Create account
// and Recovery always.

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { accountConfig } from '../../../cloud/account';
import { TextLink } from '../../kit/look';
import { type TurnstileState, type TurnstileWidget, mountTurnstile, turnstileWords } from './turnstile';

export interface TurnstileHandle {
  /** The widget's box and words; null while not needed. */
  box: VNode | null;
  state: TurnstileState;
  /** A token is ready. */
  ready: boolean;
  /** The token, once (the widget is reset). */
  take(): string | null;
  /** Moves the keyboard to the widget's door (the next Tab goes into the widget); false when the widget needs nobody now. */
  focus(): boolean;
}

export function useTurnstile(needed: boolean): TurnstileHandle {
  const slot = useRef<HTMLDivElement>(null);
  const door = useRef<HTMLSpanElement>(null);
  const widget = useRef<TurnstileWidget | null>(null);
  const [st, setSt] = useState<{ state: TurnstileState; detail?: string | undefined }>({ state: 'loading' });

  useEffect(() => {
    const el = slot.current;
    if (!needed || !el) return;
    setSt({ state: 'loading' });
    const w = mountTurnstile(el, {
      siteKey: accountConfig().then((c) => c.turnstileSiteKey),
      onState: (state, detail) => {
        setSt({ state, detail });
        // Passed while the keyboard was inside the widget (a click or a key in Cloudflare's frame): the
        // page gets the keyboard back, so Enter presses its button and Esc leaves, without a click first.
        if (state === 'passed' && el.contains(el.ownerDocument.activeElement)) {
          el.closest<HTMLElement>('.wc-stack')?.focus({ preventScroll: true });
        }
      },
    });
    widget.current = w;
    return () => {
      widget.current = null;
      w.dispose();
    };
  }, [needed]);

  const words = turnstileWords(st.state, st.detail);
  const canRetry = st.state === 'blocked' || st.state === 'error';
  const box = needed ? (
    <div class="wc-ac-ts" data-ts={st.state}>
      <div class="wc-ac-ts-frame">
        {/* The door (see `focus` below): the page's Tab ring stops here, and the next Tab is the browser's own, into the widget. */}
        <span
          class="wc-ac-ts-door"
          ref={door}
          tabIndex={-1}
          role="note"
          aria-label="The check that you are a person. Press Tab to go into it."
          data-wc-own-keys=""
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            // Esc gives the keyboard back to the page.
            e.preventDefault();
            e.currentTarget.blur();
            e.currentTarget.closest<HTMLElement>('.wc-stack')?.focus({ preventScroll: true });
          }}
        />
        <div class="wc-ac-ts-slot" ref={slot} />
      </div>
      {words && (
        <p class="wc-ac-ts-note" role="status">
          {words}
          {canRetry && (
            <>
              {' '}
              <TextLink id="ts-retry" label="Try again" onClick={() => widget.current?.retry()} />
            </>
          )}
        </p>
      )}
    </div>
  ) : null;

  return {
    box,
    state: st.state,
    ready: needed && st.state === 'passed',
    take: () => widget.current?.take() ?? null,
    // Cloudflare draws the widget in a closed shadow tree: the page cannot
    // focus its frame. So the stop is a "door" just before it, marked
    // `data-wc-own-keys`: the frame stack leaves the keys pressed there
    // alone, and the browser's own Tab then walks into the widget (Shift+Tab
    // back to the last field). Only while the widget may want the person.
    focus: () => {
      const el = door.current;
      if (!needed || !el || !(st.state === 'waiting' || st.state === 'expired' || st.state === 'error')) return false;
      el.focus({ preventScroll: false });
      return true;
    },
  };
}
