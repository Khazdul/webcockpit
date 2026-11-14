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
// already on its way; never keep a token. `ts.focus()` moves the keyboard
// into the widget's frame (a Tab stop of the page: form.tsx). The widget
// is removed when the page goes or `needed` turns false.
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
  /** Moves the focus into the widget (its frame); false when there is none to focus. */
  focus(): boolean;
}

export function useTurnstile(needed: boolean): TurnstileHandle {
  const slot = useRef<HTMLDivElement>(null);
  const widget = useRef<TurnstileWidget | null>(null);
  const [st, setSt] = useState<{ state: TurnstileState; detail?: string | undefined }>({ state: 'loading' });

  useEffect(() => {
    const el = slot.current;
    if (!needed || !el) return;
    setSt({ state: 'loading' });
    const w = mountTurnstile(el, {
      siteKey: accountConfig().then((c) => c.turnstileSiteKey),
      onState: (state, detail) => setSt({ state, detail }),
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
    focus: () => {
      const frame = slot.current?.querySelector<HTMLElement>('iframe, button, [tabindex]');
      if (!frame) return false;
      frame.focus();
      return true;
    },
  };
}
