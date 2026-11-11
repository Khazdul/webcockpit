// The phone viewport readout (stage 52d): `?vv=1` with the phone flag.
//
// One small line at the top of the screen with the numbers the visible
// area is computed from (phone-viewport.ts), so that when the input line
// is still covered by the keyboard on a device nobody here can test on,
// the owner can take a screenshot and the numbers say why.
//
// Loaded by a dynamic import from `installPhoneViewport` only when the
// parameter is there: never on desktop, never without `vv=1`. It only
// reads; it redraws on the viewport, fullscreen and keyboard geometry
// events and after every published update, nothing per frame.

import { isFullscreen } from '../core/fullscreen';
import { keyboardUp, onPhoneViewportApplied, virtualKeyboardOf } from './phone-viewport';

/** A number for the readout: one decimal at most. */
const n = (v: number | undefined): string => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 10) / 10) : '?');

/** The readout's text from the live values. */
export function viewportReadoutText(win: Window): string {
  const vv = win.visualViewport;
  const vk = virtualKeyboardOf(win);
  const root = win.document.documentElement;
  const rect = vk?.boundingRect;
  return [
    `inner ${n(win.innerHeight)}`,
    `screen ${n(win.screen?.height)}`,
    vv ? `vv ${n(vv.height)}@${n(vv.offsetTop)}` : 'no vv',
    `fs ${isFullscreen(win.document) ? 1 : 0}`,
    vk && rect ? `vk top ${n(rect.top)} h ${n(rect.height)} oc ${vk.overlaysContent ? 1 : 0}` : 'no VK',
    `--wc-vv-h ${root.style.getPropertyValue('--wc-vv-h') || '-'}`,
    `kbd ${keyboardUp() ? 1 : 0}`,
  ].join(' | ');
}

/** Shows the readout and keeps it current. Returns the stop function. */
export function installViewportReadout(win: Window = window): () => void {
  const doc = win.document;
  const el = doc.createElement('div');
  el.className = 'wc-vv-readout';
  // Inline style: this is a diagnostic, not part of the theme, and must
  // not add rules to the stylesheets everyone loads. It lets every touch
  // through and sits above the cockpit and the menus.
  el.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:2147483647;pointer-events:none;' +
    'font:10px/12px monospace;padding:1px 3px;color:#fff;background:rgba(160,0,0,.8);' +
    'white-space:normal;overflow-wrap:anywhere';
  const draw = (): void => {
    el.textContent = viewportReadoutText(win);
  };
  const vv = win.visualViewport;
  const vk = virtualKeyboardOf(win);
  const offApplied = onPhoneViewportApplied(draw);
  vv?.addEventListener('resize', draw);
  vv?.addEventListener('scroll', draw);
  win.addEventListener('resize', draw);
  doc.addEventListener('fullscreenchange', draw);
  doc.addEventListener('webkitfullscreenchange', draw);
  vk?.addEventListener('geometrychange', draw);
  doc.body.append(el);
  draw();
  return () => {
    offApplied();
    vv?.removeEventListener('resize', draw);
    vv?.removeEventListener('scroll', draw);
    win.removeEventListener('resize', draw);
    doc.removeEventListener('fullscreenchange', draw);
    doc.removeEventListener('webkitfullscreenchange', draw);
    vk?.removeEventListener('geometrychange', draw);
    el.remove();
  };
}
