// The start page wordmark (stage 41b, ADR 0126): forged iron "MUME" with a
// mithril inlay, "COCKPIT" between iron rules. Its light follows the sky
// (`SkyLook.light`, `dayness`).
//
// The drawing lives in wordmark-svg.ts (dependency free, shared with the
// first paint). This component only mounts that markup once per size and
// re-applies the light when `look` changes: a few attributes in the
// inlay's own layer, no re-render of the markup and no per-frame work.
//
// Looks arrive inside the sky engine's frame, after its style writes, so
// the light must not read layout: where the mark sits (`markBox`) is kept
// and measured again only when it may have moved: a window resize, the
// host's size (ResizeObserver: also when it is shown again), the end of a
// transition on an ancestor (the start page's scenery moves the brand),
// and a while after `place` changes in case no transition ran.

import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import type { SkyLook } from './sky/look';
import { type MarkBox, applyWordmarkLight, markBox, setWordmarkMotion, wordmarkLight, wordmarkMarkup } from './wordmark-svg';

export interface WordmarkProps {
  look: SkyLook;
  /** `full` on the start menu; `small` in a corner when a big page fills the window. */
  size?: 'full' | 'small';
  /** Animate the glint (false when the start page is hidden or motion is reduced). */
  run?: boolean;
  /** Extra class on the host element (placement by the layout). */
  class?: string;
  /**
   * Where the layout puts the mark (the start page's scenery). On a change
   * the mark is measured again: at once, at the end of the move's
   * transition, and `PLACE_SETTLE_MS` later.
   */
  place?: string;
}

/** A little more than the brand's move (start.css: `.wc-start-brand`, 0.8 s). */
export const PLACE_SETTLE_MS = 850;

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
  const box = useRef<MarkBox | null>(null);

  const light = (): void => {
    const el = host.current;
    if (!el) return;
    if (!box.current) {
      const view = el.ownerDocument.defaultView;
      box.current = markBox(el, view ?? { innerWidth: 1, innerHeight: 1 });
    }
    applyWordmarkLight(el, wordmarkLight(look.current, box.current));
  };
  /** The mark may have moved: measure it again and re-light. */
  const moved = (): void => {
    box.current = null;
    light();
  };

  // the markup, once per size; measured again when the mark may have moved
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    el.innerHTML = wordmarkMarkup(size, id.current);
    moved();
    const doc = el.ownerDocument;
    const view = doc.defaultView;
    const onTransition = (e: Event): void => {
      const t = e.target as Node | null;
      if (t && typeof t.contains === 'function' && t.contains(el)) moved();
    };
    view?.addEventListener('resize', moved);
    doc.addEventListener('transitionend', onTransition);
    const RO = view?.ResizeObserver;
    const ro = RO ? new RO(moved) : null;
    ro?.observe(el);
    return () => {
      view?.removeEventListener('resize', moved);
      doc.removeEventListener('transitionend', onTransition);
      ro?.disconnect();
      setWordmarkMotion(el, false);
    };
  }, [size]);

  const placed = useRef(p.place);
  useLayoutEffect(() => {
    if (placed.current === p.place) return;
    placed.current = p.place;
    moved();
    const t = setTimeout(moved, PLACE_SETTLE_MS);
    return () => clearTimeout(t);
  }, [p.place]);

  useLayoutEffect(light, [p.look]);

  const run = p.run !== false;
  useEffect(() => {
    const el = host.current;
    if (el) setWordmarkMotion(el, run && !reducedMotion());
  }, [run, size]);

  return <div ref={host} class={`wc-wordmark-host${p.class ? ` ${p.class}` : ''}`} />;
}
