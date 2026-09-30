// Input-line clock strip (Inv §2.5 "Where shown"; ADR 0016 P1): the 8
// cells at the right end of the input row.
//
//   ␠ + time (5 cells, right-aligned) + ␠ + icon   e.g. `  4:33 ☼`, ` 10:14 ☼`, `    ~3 ☾`
//
// - Always exactly one blank between the time and the icon, whatever the
//   width of the time.
// - Minute precision: `H:MM` to the next day/night change; hour precision
//   `~N`; below that the strip is blank (no lone icon).
// - The icon shows the current period: ☼ `#ffb000` by day, ☾ `#4a90e2` by
//   night. The time is bold white, or on a light terminal the bg-tinted
//   `darkInk` (Inv §10.5).
// - The countdown is computed at render time from the transition target
//   and re-rendered just after each wall-clock second boundary (Cockpit
//   ADR 0034), so it steps evenly. The timer runs only while a countdown
//   is shown.

import type { GameState } from '../gmcp/state';
import { countdownText, periodIcon, STRIP_TIME_W } from '../gmcp/clock';
import type { SettingsStore } from '../settings';
import { darkInk, isLight } from '../theme/color';

export const CLOCK_DAY_FG = '#ffb000';
export const CLOCK_NIGHT_FG = '#4a90e2';
export const CLOCK_TEXT_FG = '#ffffff';

export interface ClockStripOptions {
  game: GameState;
  /** For the terminal background (light → dark ink). */
  settings: SettingsStore;
  /** Wall clock in ms. */
  now?: () => number;
  /** Timer (tests). */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

/** The strip's text parts for `game` at `nowMs`: time (5 cells) and icon, or null. */
export function stripParts(game: GameState, nowMs: number): { time: string; icon: string; day: boolean } | null {
  const t = game.clock.nextTransition(nowMs);
  if (!t) return null;
  return { time: countdownText(t, nowMs).slice(0, STRIP_TIME_W).padStart(STRIP_TIME_W), icon: periodIcon(t.period), day: t.period === 'day' };
}

export class ClockStrip {
  private readonly el: HTMLElement;
  private readonly timeEl: HTMLSpanElement;
  private readonly iconEl: HTMLSpanElement;
  private readonly o: ClockStripOptions;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;
  private timer: unknown = null;
  private iconColor = '';
  private readonly unsubs: Array<() => void> = [];
  private disposed = false;

  constructor(el: HTMLElement, o: ClockStripOptions) {
    this.el = el;
    this.o = o;
    this.now = o.now ?? Date.now;
    const win = el.ownerDocument.defaultView;
    this.setTimer = o.setTimer ?? ((fn, ms) => (win ?? globalThis).setTimeout(fn, ms));
    this.clearTimer = o.clearTimer ?? ((h) => (win ?? globalThis).clearTimeout(h as number));
    const doc = el.ownerDocument;
    this.timeEl = doc.createElement('span');
    this.timeEl.className = 'wc-clock-time';
    this.iconEl = doc.createElement('span');
    this.iconEl.className = 'wc-clock-icon';
    el.replaceChildren(doc.createTextNode(' '), this.timeEl, doc.createTextNode(' '), this.iconEl);
    el.setAttribute('aria-label', 'Game clock');
    this.unsubs.push(
      o.game.subscribe((part) => part === 'clock' && this.update()),
      o.settings.subscribe(() => this.paintInk()),
    );
    this.paintInk();
    this.update();
  }

  /** Re-renders now and schedules the next second-boundary render. */
  update(): void {
    if (this.disposed) return;
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    const now = this.now();
    const p = stripParts(this.o.game, now);
    const time = p ? p.time : ' '.repeat(STRIP_TIME_W);
    const icon = p ? p.icon : ' ';
    if (this.timeEl.textContent !== time) this.timeEl.textContent = time;
    if (this.iconEl.textContent !== icon) this.iconEl.textContent = icon;
    const color = p ? (p.day ? CLOCK_DAY_FG : CLOCK_NIGHT_FG) : '';
    if (this.iconColor !== color) {
      this.iconColor = color;
      this.iconEl.style.color = color;
    }
    this.el.dataset.period = p ? (p.day ? 'day' : 'night') : '';
    if (p) this.timer = this.setTimer(() => this.update(), 1000 - (now % 1000) + 5);
  }

  private paintInk(): void {
    const bg = this.o.settings.get().appearance.bg;
    this.timeEl.style.color = isLight(bg) ? darkInk(bg) : CLOCK_TEXT_FG;
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    for (const u of this.unsubs.splice(0)) u();
  }
}
