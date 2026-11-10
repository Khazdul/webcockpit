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
// while there is a hole in the text, most quick frames (our script short)
// still late means the compositor is behind, and veils are cheaper. It
// decides once per page and never switches back.

/** A frame is late when received → shown less its own script exceeds this (ms): about three frames at 60 Hz. */
export const VEIL_LATE_MS = 45;
/**
 * Frames whose own flush took longer than this (ms) are not judged: a burst
 * of text is late from our script and the frames queued behind it, not
 * from the compositor.
 */
export const VEIL_SCRIPT_MAX_MS = 8;
/** The frames judged together. */
export const VEIL_WINDOW = 24;
/** Late frames in the window that switch to veils (two thirds). */
export const VEIL_LATE_COUNT = 16;

export class FloatVeilWatch {
  /** Lateness of the last VEIL_WINDOW frames with a hole, as a bit ring. */
  private readonly late = new Uint8Array(VEIL_WINDOW);
  private n = 0;
  private lateN = 0;
  private done = false;

  /**
   * One output frame: `shownMs` from receipt to rendered, `scriptMs` of our
   * flush, `holes` whether the text had a hole under a float. Returns true
   * once, when the watch decides for veils.
   */
  frame(shownMs: number, scriptMs: number, holes: boolean): boolean {
    if (this.done || !holes || scriptMs > VEIL_SCRIPT_MAX_MS) return false;
    const i = this.n % VEIL_WINDOW;
    const isLate = shownMs - scriptMs > VEIL_LATE_MS ? 1 : 0;
    if (this.n >= VEIL_WINDOW) this.lateN -= this.late[i]!;
    this.late[i] = isLate;
    this.lateN += isLate;
    this.n++;
    if (this.n >= VEIL_WINDOW && this.lateN >= VEIL_LATE_COUNT) {
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
