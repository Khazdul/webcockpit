// Following a window's size through a turn that is reported late and in
// steps (stage 73 round 3, ADR 0160 addendum "the iPad fullscreen turn").
//
// iPadOS Safari reports a turn in fullscreen late and in steps: the
// window's `innerWidth`/`innerHeight`, `visualViewport`, the viewport units
// and `screen.orientation` can disagree for a while, and an iframe's own
// window may get its `resize` late or not at all. So a layout measured at
// the first event can be the old orientation's. `watchViewport` listens to
// every source there is (the window's `resize` and `orientationchange`,
// `screen.orientation`'s `change`, the visual viewport's `resize` and
// `scroll`, `fullscreenchange` with its prefix, and a ResizeObserver of the
// given elements) and after each runs `onTick` at `SETTLE_MS` (now and a
// little later, up to a second), so a size that comes after the event is
// laid out too. The ticks stop early once two reads (`read`) agree after
// `SETTLE_QUIET_MS`. Nothing runs per frame; a quiet window costs nothing.

/** When after an event the layout is measured again (ms). */
export const SETTLE_MS: readonly number[] = [0, 50, 200, 500, 1000];
/** Two equal reads stop the ticks only from this long after the event (ms): the late steps come within it. */
export const SETTLE_QUIET_MS = 500;

export interface ViewportWatch {
  /** Measures again now and at `SETTLE_MS` (`why`: what asked; the diagnostic shows it). */
  kick(why: string): void;
  /** What asked last and when (`performance.now()`), or null before anything did. */
  readonly last: { why: string; at: number } | null;
  dispose(): void;
}

export interface ViewportWatchOptions {
  /** Runs at each tick: `why` is the event that started the ticks, `n` the tick's index in `SETTLE_MS`. */
  onTick(why: string, n: number): void;
  /** What a layout depends on, as a string: two equal reads after `SETTLE_QUIET_MS` end the ticks. Absent: every tick runs. */
  read?: () => string;
  /** Elements whose size changes start the ticks too (the root). */
  observe?: readonly Element[];
  /** Other ticks (tests). */
  delays?: readonly number[];
}

type OrientationTarget = EventTarget & { type?: string };

/** Starts following `win` (see the header). Returns the watch; `dispose` stops it. */
export function watchViewport(win: Window, o: ViewportWatchOptions): ViewportWatch {
  const doc = win.document;
  const delays = o.delays ?? SETTLE_MS;
  let timers: Array<ReturnType<typeof setTimeout>> = [];
  let last: { why: string; at: number } | null = null;
  let disposed = false;
  const clear = (): void => {
    for (const t of timers) clearTimeout(t);
    timers = [];
  };
  const kick = (why: string): void => {
    if (disposed) return;
    clear();
    const at = performance.now();
    last = { why, at };
    let prev: string | null = null;
    delays.forEach((ms, n) => {
      timers.push(
        setTimeout(() => {
          if (disposed) return;
          o.onTick(why, n);
          if (!o.read) return;
          const now = o.read();
          if (now === prev && ms >= SETTLE_QUIET_MS) clear();
          prev = now;
        }, ms),
      );
    });
  };
  const on = (why: string) => (): void => kick(why);
  const listeners: Array<[EventTarget, string, () => void]> = [];
  const listen = (t: EventTarget | null | undefined, type: string, why = type): void => {
    if (!t || typeof t.addEventListener !== 'function') return;
    const fn = on(why);
    t.addEventListener(type, fn);
    listeners.push([t, type, fn]);
  };
  listen(win, 'resize');
  listen(win, 'orientationchange');
  listen((win.screen as (Screen & { orientation?: OrientationTarget }) | undefined)?.orientation, 'change', 'orientation');
  listen(win.visualViewport, 'resize', 'vv-resize');
  listen(win.visualViewport, 'scroll', 'vv-scroll');
  listen(doc, 'fullscreenchange');
  listen(doc, 'webkitfullscreenchange', 'fullscreenchange');
  let ro: ResizeObserver | null = null;
  const RO = (win as Window & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  if (RO && o.observe?.length) {
    let first = true;
    ro = new RO(() => {
      // The first call is the observer's own start, not a change.
      if (first) {
        first = false;
        return;
      }
      kick('resize-observer');
    });
    for (const el of o.observe) ro.observe(el);
  }
  return {
    kick,
    get last() {
      return last;
    },
    dispose: () => {
      disposed = true;
      clear();
      for (const [t, type, fn] of listeners) t.removeEventListener(type, fn);
      ro?.disconnect();
    },
  };
}

/** A rectangle as `x,y w×h` in whole px (the diagnostic), or `-` for none. */
export function rectText(el: Element | null | undefined): string {
  if (!el) return '-';
  const b = el.getBoundingClientRect();
  const r = (n: number): number => Math.round(n);
  return `${r(b.left)},${r(b.top)} ${r(b.width)}×${r(b.height)}`;
}

/** What the window says of its size, as lines (the diagnostic, and `read`'s key). */
export function viewportLines(win: Window): string[] {
  const vv = win.visualViewport;
  const r = (n: number): number => Math.round(n);
  const so = (win.screen as (Screen & { orientation?: { type?: string; angle?: number } }) | undefined)?.orientation;
  const angle = (win as Window & { orientation?: unknown }).orientation;
  const d = win.document as Document & { webkitFullscreenElement?: Element | null };
  const fs = d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
  return [
    `inner ${win.innerWidth}×${win.innerHeight}  client ${d.documentElement.clientWidth}×${d.documentElement.clientHeight}`,
    vv ? `vv ${r(vv.width)}×${r(vv.height)} @${r(vv.offsetLeft)},${r(vv.offsetTop)} s${vv.scale.toFixed(2)}` : 'vv -',
    `screen ${win.screen?.width ?? '?'}×${win.screen?.height ?? '?'} ${so?.type ?? '-'}${typeof angle === 'number' ? ` o${angle}` : ''}`,
    `fullscreen ${fs ? `yes (${fs.tagName.toLowerCase()})` : 'no'}`,
  ];
}
