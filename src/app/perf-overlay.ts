// The `#perf` overlay (stage 50, ADR 0135, ADR 0047 addendum): a small box
// in the bottom-left corner with live frame rate, the worst frame of the
// last 5 s, and rolling received -> shown and key -> send. `#perf` alone
// turns it on and off. Loaded with a dynamic import on the first toggle.
//
// Cost while on: one requestAnimationFrame callback per frame (a
// subtraction and two typed-array stores, src/app/perf-live.ts) and a
// 250 ms interval that computes the figures and writes one text node.
// Off: the loop, the interval and the box are gone; nothing of it runs.
// It takes no pointer events, no focus and no keys (`aria-hidden`, no
// tab stop).

import './perf-overlay.css';
import { FrameMeter, liveFigures, overlayLines } from './perf-live';
import type { PerfRings } from './perf-monitor';

/** Text updates per second at most (owner rule: about 4). */
export const UPDATE_MS = 250;

export class PerfOverlay {
  readonly el: HTMLElement;
  private readonly text: Text;
  private readonly frames = new FrameMeter();
  private raf = 0;
  private timer: number | null = null;
  private readonly win: Window & typeof globalThis;
  private last = '';

  constructor(
    host: HTMLElement,
    private readonly rings: Pick<PerfRings, 'shown' | 'keys'>,
    private readonly now: () => number = () => performance.now(),
  ) {
    const doc = host.ownerDocument;
    this.win = doc.defaultView as Window & typeof globalThis;
    this.el = doc.createElement('pre');
    this.el.className = 'wc-perf-overlay';
    this.el.setAttribute('aria-hidden', 'true');
    this.text = doc.createTextNode('');
    this.el.append(this.text);
    host.append(this.el);
    this.raf = this.win.requestAnimationFrame(this.onFrame);
    this.timer = this.win.setInterval(this.update, UPDATE_MS);
    this.win.document.addEventListener('visibilitychange', this.onVisibility);
    this.update();
  }

  private readonly onFrame = (t: number): void => {
    this.frames.tick(t);
    this.raf = this.win.requestAnimationFrame(this.onFrame);
  };

  /** A hidden tab gets no frames: its pause is not a slow frame. */
  private readonly onVisibility = (): void => {
    this.frames.pause();
  };

  private readonly update = (): void => {
    const s = overlayLines(liveFigures(this.frames, this.rings.shown, this.rings.keys, this.now())).join('\n');
    if (s !== this.last) this.text.data = this.last = s;
  };

  dispose(): void {
    this.win.cancelAnimationFrame(this.raf);
    if (this.timer !== null) this.win.clearInterval(this.timer);
    this.timer = null;
    this.win.document.removeEventListener('visibilitychange', this.onVisibility);
    this.el.remove();
  }
}
