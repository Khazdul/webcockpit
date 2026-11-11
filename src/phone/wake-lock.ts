// Keep the screen on (ADR 0136 §10): a Screen Wake Lock held while the
// setting is on, the session is connected to MUME and the page is visible.
//
// - The browser releases a lock by itself when the page is hidden; coming
//   back visible it is asked for again. `sync()` is called on every change
//   of the three conditions and settles the lock to them.
// - Released on a disconnect and on exit (the session is then not
//   connected), and when the layer goes.
// - Where the browser has no `navigator.wakeLock` nothing happens (and the
//   settings row is absent). A refused request (battery saver, no user
//   gesture) is dropped silently: the screen then sleeps as it would have.
// - Nothing here runs per frame or per line: only on those changes.

/** The lock the browser hands out. */
export interface WakeSentinel {
  release(): Promise<void>;
  addEventListener?(type: 'release', fn: () => void): void;
}

/** The part of `navigator` used here. */
export interface WakeLockSource {
  wakeLock?: { request(type: 'screen'): Promise<WakeSentinel> };
}

export function canWakeLock(nav: WakeLockSource | undefined): boolean {
  return typeof nav?.wakeLock?.request === 'function';
}

/** Whether the lock should be held (pure). */
export function wakeWanted(c: { setting: boolean; connected: boolean; visible: boolean }): boolean {
  return c.setting && c.connected && c.visible;
}

export class WakeLock {
  private sentinel: WakeSentinel | null = null;
  /** A request is on its way (one at a time). */
  private asking = false;
  private gone = false;

  /** `wanted`: the three conditions now. */
  constructor(
    private readonly nav: WakeLockSource | undefined,
    private readonly wanted: () => boolean,
  ) {}

  /** True while a lock is held. */
  get held(): boolean {
    return this.sentinel !== null;
  }

  /** Settles the lock to the conditions: asks for it, or lets it go. */
  sync(): void {
    if (!canWakeLock(this.nav)) return;
    const want = !this.gone && this.wanted();
    if (!want) {
      const s = this.sentinel;
      this.sentinel = null;
      void s?.release().catch(() => {});
      return;
    }
    if (this.sentinel || this.asking) return;
    this.asking = true;
    this.nav!.wakeLock!.request('screen').then(
      (s) => {
        this.asking = false;
        // The conditions changed while it was asked for: not kept.
        if (this.gone || !this.wanted()) {
          void s.release().catch(() => {});
          return;
        }
        this.sentinel = s;
        // The browser took it back (the page was hidden): asked for again when the conditions say so.
        s.addEventListener?.('release', () => {
          if (this.sentinel === s) this.sentinel = null;
        });
      },
      () => {
        this.asking = false;
      },
    );
  }

  dispose(): void {
    this.gone = true;
    this.sync();
  }
}
