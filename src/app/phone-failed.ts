// The phone layout could not be loaded (stage 55): one plain cover over the
// app with a Reload button. Shown by the shell when the phone layer's chunk
// (src/phone/) fails to load or its mount throws. A phone has no other
// layout to fall back on, so there is nothing behind it to use: no retry,
// no fallback menu.
//
// Eager and dependency-free: no kit, no stylesheet, no chunk. The colours
// are the page's own (`--term-bg` / `--term-fg`, set by the first paint and
// the theme), so it is dark on a dark theme and light on Paper.

export const PHONE_FAILED_TEXT = 'The phone layout could not be loaded. Check the connection and reload.';

const COVER_CSS = [
  'position:fixed',
  'inset:0',
  'z-index:2147483000',
  'box-sizing:border-box',
  'display:flex',
  'flex-direction:column',
  'align-items:center',
  'justify-content:center',
  'gap:24px',
  'padding:max(24px,env(safe-area-inset-top)) max(24px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left))',
  'background:var(--term-bg,#000)',
  'color:var(--term-fg,#ccc)',
  'font:16px/1.5 system-ui,sans-serif',
  'text-align:center',
].join(';');

const BUTTON_CSS = [
  'box-sizing:border-box',
  'min-width:160px',
  'min-height:48px',
  'padding:0 24px',
  'border:1px solid currentColor',
  'border-radius:8px',
  'background:transparent',
  'color:inherit',
  'font:inherit',
  'font-weight:600',
  'touch-action:manipulation',
].join(';');

/** Appends the cover to `root` (once; a second call returns the first). `reload` defaults to reloading the page. */
export function showPhoneFailed(root: HTMLElement, reload?: () => void): HTMLElement {
  const doc = root.ownerDocument;
  const up = root.querySelector<HTMLElement>(':scope > .wc-phone-failed');
  if (up) return up;
  const cover = doc.createElement('div');
  cover.className = 'wc-phone-failed';
  cover.setAttribute('role', 'alert');
  cover.style.cssText = COVER_CSS;
  const text = doc.createElement('p');
  text.style.cssText = 'margin:0;max-width:30em';
  text.textContent = PHONE_FAILED_TEXT;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'wc-phone-failed-reload';
  button.style.cssText = BUTTON_CSS;
  button.textContent = 'Reload';
  button.addEventListener('click', () => (reload ? reload() : doc.defaultView?.location.reload()));
  cover.append(text, button);
  root.append(cover);
  return cover;
}
