// TUI kit: clickable `ESC …` footer tokens (ADR 0075 §2, owner-approved
// for desktop too). A click or tap on a token that names Esc (`ESC Back`,
// `ESC Save & back`, `ESC Cancel` …) sends a synthetic Escape keydown, so
// the frame's own Esc path runs (unsaved-change prompts included). No
// per-frame back logic.

import type { ComponentChildren, VNode } from 'preact';

/** True for a footer token that names the Esc key (`ESC Back`). */
export const isEscToken = (t: string): boolean => /^ESC\b/.test(t);

/**
 * Dispatches an Escape keydown (and keyup) as the keyboard would: at the
 * focused element, bubbling, so the frame stack's window capture listener
 * sees it first, exactly as a real Esc.
 */
export function sendEscape(doc: Document = document): void {
  const target = doc.activeElement ?? doc.body;
  const init: KeyboardEventInit = { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true, composed: true };
  const win = doc.defaultView;
  if (!win) return;
  target.dispatchEvent(new win.KeyboardEvent('keydown', init));
  target.dispatchEvent(new win.KeyboardEvent('keyup', init));
}

/** One clickable `ESC …` token. The press keeps the focus where it is, as a key would. */
export function EscToken(p: { text: string; children?: ComponentChildren }): VNode {
  return (
    <span
      class="wc-footer-btn wc-esc-btn"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        sendEscape((e.currentTarget as Element).ownerDocument);
      }}
    >
      {p.children ?? p.text}
    </span>
  );
}

/**
 * A hint line (`↑↓ Scroll · … · ESC Save & back`) with its `ESC …` tokens
 * clickable. Text without such a token comes back unchanged.
 */
export function escHints(text: string): ComponentChildren {
  const parts = text.split(' · ');
  if (!parts.some(isEscToken)) return text;
  return parts.map((t, i) => (
    <>
      {i > 0 && ' · '}
      {isEscToken(t) ? <EscToken text={t} /> : t}
    </>
  ));
}
