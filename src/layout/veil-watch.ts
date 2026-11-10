// When to give up the holes under floats for veils (stage 50, ADR 0135;
// src/layout/float-holes.ts). Pure; App feeds it every output frame the
// latency monitor times (PerfMonitor `onShown`).
//
// In Firefox's software WebRender (no usable GPU: blocklisted drivers,
// virtual machines, Mesa's software GL) a path clip on the game text makes
// every new line re-raster the masked text under a float: with a large
// framed float, text waits 45–85 ms for the screen (median; p95 140–200)
// and frames drop to 12–14 a second (bench/frame-matrix.ts). In hardware
// WebRender the same hole is cheap (about 20 ms median, 40 p95, as with no
// float at all), and a veil would cost there instead. The browser does not
// say which compositor it uses, so the watch decides from what it sees:
// while there is a hole in the text, half the quick frames (our script
// short) late over several seconds means the compositor is behind, and
// veils are cheaper. It decides once per page and never switches back.

/**
 * A frame is late when received → shown less its own script exceeds this
 * (ms): two frames at 60 Hz. Hardware WebRender's p95 is about 26 ms;
 * software WebRender's median under a large float 55–75 ms.
 */
export const VEIL_LATE_MS = 35;
/**
 * Frames whose own flush took longer than this (ms) are not judged: a burst
 * of text is late from our script and the frames queued behind it, not
 * from the compositor.
 */
export const VEIL_SCRIPT_MAX_MS = 8;
/** The frames judged together. */
export const VEIL_WINDOW = 24;
/** Late frames in the window that switch to veils (half). */
export const VEIL_LATE_COUNT = 12;
/**
 * The window must stay that late for this long (ms): the first seconds
 * after a page load or a big relayout are slow on any machine, and a
 * back-to-back run of lines then must not decide (a false switch on
 * hardware WebRender in the frame screenshots, stage 50).
 */
export const VEIL_MIN_SPAN_MS = 4000;

export class FloatVeilWatch {
  /** Lateness of the last VEIL_WINDOW frames with a hole, as a bit ring. */
  private readonly late = new Uint8Array(VEIL_WINDOW);
  /** When the window last became late (NaN: it is not). */
  private lateSince = NaN;
  private n = 0;
  private lateN = 0;
  private done = false;

  /**
   * One output frame at time `t` (ms): `shownMs` from receipt to rendered,
   * `scriptMs` of our flush, `holes` whether the text had a hole under a
   * float. Returns true once, when the watch decides for veils.
   */
  frame(t: number, shownMs: number, scriptMs: number, holes: boolean): boolean {
    if (this.done || !holes || scriptMs > VEIL_SCRIPT_MAX_MS) return false;
    const i = this.n % VEIL_WINDOW;
    const isLate = shownMs - scriptMs > VEIL_LATE_MS ? 1 : 0;
    if (this.n >= VEIL_WINDOW) this.lateN -= this.late[i]!;
    this.late[i] = isLate;
    this.lateN += isLate;
    this.n++;
    if (this.n < VEIL_WINDOW || this.lateN < VEIL_LATE_COUNT) {
      this.lateSince = NaN;
      return false;
    }
    if (this.lateSince !== this.lateSince) this.lateSince = t;
    if (t - this.lateSince >= VEIL_MIN_SPAN_MS) {
      this.done = true;
      return true;
    }
    return false;
  }

  /** True once it has switched (it never switches back). */
  get decided(): boolean {
    return this.done;
  }
}
