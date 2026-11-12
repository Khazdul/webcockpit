// The own keyboard's readout (stage 53a, ADR 0138 "To verify on a
// device"): shown only with `?kbd=1` or `?kbd=debug`, for screenshots from a
// phone. Two small lines at the top left that say whether the device's
// keyboard stayed down:
//
//   ae TEXTAREA im=none | okb 1
//   vv 800 / inner 800 | VK api 1
//
// - `ae`: the focused element and its `inputmode`.
// - `okb`: our keyboard is open.
// - `vv` / `inner`: the visual viewport's height against the window's (a
//   device keyboard that came up anyway shows as a lower `vv`).
// - `VK api`: `navigator.virtualKeyboard` exists (Chromium).
//
// It only reads, and redraws on focus, blur and resize events: nothing per
// frame.

/** A number for the readout: one decimal at most. */
const n = (v: number | undefined): string => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 10) / 10) : '?');

/** The readout's two lines from the live values. */
export function keyboardReadoutText(win: Window, open: boolean): string {
  const doc = win.document;
  const ae = doc.activeElement;
  const vv = win.visualViewport;
  return (
    [
      `ae ${ae ? ae.tagName : '-'}${ae?.hasAttribute('inputmode') ? ` im=${ae.getAttribute('inputmode')}` : ''}`,
      `okb ${open ? 1 : 0}`,
    ].join(' | ') +
    '\n' +
    [`vv ${vv ? n(vv.height) : '?'} / inner ${n(win.innerHeight)}`, `VK api ${'virtualKeyboard' in win.navigator ? 1 : 0}`].join(' | ')
  );
}

/** Shows the readout and keeps it current. Returns `draw` (call it when our keyboard opens or closes) and the stop function. */
export function installKeyboardReadout(win: Window, open: () => boolean): { draw(): void; dispose(): void } {
  const doc = win.document;
  const el = doc.createElement('div');
  el.className = 'wc-okb-readout';
  // Inline style: a diagnostic, not part of the theme. It lets every touch through and sits
  // above the cockpit; under the `?vv=1` readout's line when both are asked for.
  const below = new URLSearchParams(win.location?.search ?? '').get('vv') === '1';
  el.style.cssText =
    `position:fixed;top:${below ? 26 : 0}px;left:0;z-index:2147483646;pointer-events:none;` +
    'font:10px/12px monospace;padding:1px 3px;color:#fff;background:rgba(0,70,140,.85);white-space:pre';
  const draw = (): void => {
    el.textContent = keyboardReadoutText(win, open());
  };
  const vv = win.visualViewport;
  doc.addEventListener('focusin', draw);
  doc.addEventListener('focusout', draw);
  win.addEventListener('resize', draw);
  vv?.addEventListener('resize', draw);
  doc.body.append(el);
  draw();
  return {
    draw,
    dispose: () => {
      doc.removeEventListener('focusin', draw);
      doc.removeEventListener('focusout', draw);
      win.removeEventListener('resize', draw);
      vv?.removeEventListener('resize', draw);
      el.remove();
    },
  };
}
