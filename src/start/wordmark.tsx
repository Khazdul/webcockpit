// The start page wordmark (stage 41b, ADR 0126): forged iron "MUME" with a
// cyan metal inlay, "COCKPIT" between iron rules. Its light follows the sky
// (`SkyLook.light`, `dayness`).
//
// The drawing lives in wordmark-svg.ts (dependency free, shared with the
// first paint). This component only mounts that markup once per size and
// re-applies the light when `look` changes: a few attributes in the
// inlay's own layer, no re-render of the markup and no per-frame work.

import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import type { SkyLook } from './sky/look';
import { applyWordmarkLight, markBox, setWordmarkMotion, wordmarkLight, wordmarkMarkup } from './wordmark-svg';

export interface WordmarkProps {
  look: SkyLook;
  /** `full` on the start menu; `small` in a corner when a big page fills the window. */
  size?: 'full' | 'small';
  /** Animate the glint (false when the start page is hidden or motion is reduced). */
  run?: boolean;
  /** Extra class on the host element (placement by the layout). */
  class?: string;
}

let serial = 0;

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function Wordmark(p: WordmarkProps): VNode {
  const size = p.size ?? 'full';
  const host = useRef<HTMLDivElement>(null);
  const id = useRef('');
  if (!id.current) id.current = `wcw${++serial}`;
  const look = useRef(p.look);
  look.current = p.look;

  const light = (): void => {
    const el = host.current;
    if (!el) return;
    const view = el.ownerDocument.defaultView;
    applyWordmarkLight(el, wordmarkLight(look.current, markBox(el, view ?? { innerWidth: 1, innerHeight: 1 })));
  };

  // the markup, once per size; the light again when the window (and so the mark's place) changes
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    el.innerHTML = wordmarkMarkup(size, id.current);
    light();
    const view = el.ownerDocument.defaultView;
    view?.addEventListener('resize', light);
    return () => {
      view?.removeEventListener('resize', light);
      setWordmarkMotion(el, false);
    };
  }, [size]);

  useLayoutEffect(light, [p.look]);

  const run = p.run !== false;
  useEffect(() => {
    const el = host.current;
    if (el) setWordmarkMotion(el, run && !reducedMotion());
  }, [run, size]);

  return <div ref={host} class={`wc-wordmark-host${p.class ? ` ${p.class}` : ''}`} />;
}
