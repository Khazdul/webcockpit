// The start page wordmark (stage 41b): forged iron "MUME" with a cyan
// metal inlay, "COCKPIT" between iron rules. Its light follows the sky
// (`SkyLook.light`, `dayness`).
//
// STUB (night pass setup): plain text. The wordmark work (41b) replaces
// the body; the props are the contract the layout (41c) codes against.

import type { VNode } from 'preact';
import type { SkyLook } from './sky/look';

export interface WordmarkProps {
  look: SkyLook;
  /** `full` on the start menu; `small` in a corner when a big page fills the window. */
  size?: 'full' | 'small';
  /** Animate the glint (false when the start page is hidden or motion is reduced). */
  run?: boolean;
}

export function Wordmark(p: WordmarkProps): VNode {
  return (
    <div class={`wc-wordmark wc-wordmark-${p.size ?? 'full'}`} role="img" aria-label="MUME Cockpit">
      <div class="wc-wordmark-mume">MUME</div>
      <div class="wc-wordmark-cockpit">COCKPIT</div>
    </div>
  );
}
