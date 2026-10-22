// The fullscreen button (ADR 0097): a small, faint icon fixed in the top
// right corner of the page, on touch devices only (phones, iPads), where
// there is no F11. It is left out where the browser has no page fullscreen
// (iPhone) and removed once a request is refused (Firefox on iPad). The
// icon shows the action: expand corners, or inward corners in fullscreen.

import { canFullscreen, isFullscreen, onFullscreenChange, onFullscreenRefused, toggleFullscreen } from '../core/fullscreen';
import { device } from '../core/device';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ENTER = 'M1 6V1h5M10 1h5v5M15 10v5h-5M6 15H1v-5';
const EXIT = 'M6 1v5H1M15 6h-5V1M10 15v-5h5M1 10h5v5';

export interface FullscreenButton {
  readonly el: HTMLButtonElement;
  dispose(): void;
}

/** Adds the button to `doc.body`; null where it does not apply. */
export function installFullscreenButton(doc: Document = document): FullscreenButton | null {
  if (!device().touch || !canFullscreen(doc)) return null;
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = 'wc-fs-btn';
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(SVG_NS, 'path');
  svg.append(path);
  b.append(svg);
  const draw = (): void => {
    const fs = isFullscreen(doc);
    path.setAttribute('d', fs ? EXIT : ENTER);
    b.title = fs ? 'Exit fullscreen' : 'Fullscreen';
    b.setAttribute('aria-label', b.title);
  };
  draw();
  // Keep the input's focus (and the phone keyboard) where it is.
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    void toggleFullscreen(doc);
  });
  const offChange = onFullscreenChange(draw, doc);
  const offRefused = onFullscreenRefused(() => dispose());
  const dispose = (): void => {
    offChange();
    offRefused();
    b.remove();
  };
  doc.body.append(b);
  return { el: b, dispose };
}
