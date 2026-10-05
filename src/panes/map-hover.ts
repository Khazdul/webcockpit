// The Map pane's hover box (ADR 0077 §A): a small box beside the pointer
// with the room under it, after the pointer has rested on the map for
// HOVER_REST_MS (mouse) or after a long press (touch).
//
// - Mouse: every move further than HOVER_SLOP_PX from the rest point
//   restarts one timeout; a move with a button down, a wheel, a drag, the
//   pointer leaving, a map change or the pane hiding cancels it. Nothing
//   runs while the pointer is still or away: no polling, no frame loop.
// - When the timeout fires the pane asks the worker (`roomAt`); the answer
//   gives the room, its square on the canvas and the content. The box
//   shows when the answer still belongs to the current rest and hides when
//   the pointer leaves that square.
// - Touch: a press held LONG_PRESS_MS without moving more than
//   PRESS_SLOP_PX asks the same way; the next press or pan hides the box.
// - Off (Options → Mapper "Room info on hover: Off"): every input returns
//   at once; no timer is armed.
// - The box lives in the pane's content, beside the pointer and kept
//   inside the pane; its width is capped (CSS), long lines wrap.

import type { RoomHoverInfo } from '../map/hover';

export const HOVER_REST_MS = 3000;
export const LONG_PRESS_MS = 550;
/** Mouse moves smaller than this (CSS px) keep the rest. */
export const HOVER_SLOP_PX = 4;
/** Touch moves smaller than this keep a long press. */
export const PRESS_SLOP_PX = 8;
/** Gap between the pointer and the box, CSS px. */
const GAP = 12;

export interface MapHoverOptions {
  doc: Document;
  /** Where the box goes (the pane's content; canvas coordinates). */
  host: HTMLElement;
  /** Asks the worker for the room at (x, y); returns the request id, or null when the map cannot answer. */
  ask: (x: number, y: number) => number | null;
  /** False: no box and no timers at all (Options → Mapper "Room info on hover: Off"). Default on. */
  enabled?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

type Rect = { x: number; y: number; w: number; h: number };

/** The box's lines: [text, class]. Minimal: name and note; Full: also description, exits and flags. */
export function hoverLines(info: RoomHoverInfo): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const add = (text: string | undefined, cls: string): void => {
    for (const l of (text ?? '').replace(/\r/g, '').split('\n')) {
      const t = l.trimEnd();
      if (t !== '') out.push([t, cls]);
    }
  };
  add(info.name || '(unnamed room)', 'wc-map-hover-name');
  add(info.desc, 'wc-map-hover-desc');
  add(info.exits, 'wc-map-hover-exits');
  add(info.flags, 'wc-map-hover-flags');
  add(info.note, 'wc-map-hover-note');
  return out;
}

export class MapHover {
  private timer: unknown = null;
  private rest: { x: number; y: number } | null = null;
  /** The request whose answer may show the box. */
  private req: number | null = null;
  private box: HTMLDivElement | null = null;
  /** The shown room's square (mouse: the box hides when the pointer leaves it). */
  private rect: Rect | null = null;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (t: unknown) => void;

  constructor(private readonly o: MapHoverOptions) {
    this.setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = o.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  }

  get shown(): boolean {
    return this.box !== null && !this.box.hidden;
  }

  /** Mouse move over the canvas (canvas px); `buttons` as the event's. */
  move(x: number, y: number, buttons: number): void {
    if (buttons !== 0 || !this.on()) return this.cancel();
    const r = this.rect;
    if (this.shown && r && (x < r.x || x >= r.x + r.w || y < r.y || y >= r.y + r.h)) this.hide();
    const p = this.rest;
    if (p && Math.abs(x - p.x) <= HOVER_SLOP_PX && Math.abs(y - p.y) <= HOVER_SLOP_PX) return;
    if (this.shown) return; // still on the shown room
    this.arm(x, y, HOVER_REST_MS);
  }

  /** Touch press (canvas px): hides a shown box and starts a long press when it is the only finger. */
  press(x: number, y: number, single: boolean): void {
    this.cancel();
    if (single && this.on()) this.arm(x, y, LONG_PRESS_MS);
  }

  /** Touch move: a move beyond the slop cancels the long press and hides the box. */
  pressMove(x: number, y: number): void {
    const p = this.rest;
    if (p && Math.abs(x - p.x) <= PRESS_SLOP_PX && Math.abs(y - p.y) <= PRESS_SLOP_PX) return;
    this.cancel();
  }

  /**
   * Touch release: a press shorter than the long press asks nothing; after
   * it, the asked box still comes (the answer may arrive after the finger
   * lifts), and a shown box stays until the next press.
   */
  release(): void {
    if (this.timer === null) return;
    this.stopTimer();
    this.rest = null;
    this.req = null;
  }

  /** Cancels a pending rest and hides the box (leave, wheel, drag, pan, zoom, map change, hidden). */
  cancel(): void {
    this.stopTimer();
    this.rest = null;
    this.req = null;
    this.hide();
  }

  /** The worker's `roomAt` answer. */
  answer(req: number, room: number | null, rect: Rect | undefined, info: RoomHoverInfo | undefined): void {
    if (req !== this.req || !this.rest) return;
    this.req = null;
    if (room === null || !info || !rect || !this.on()) return;
    this.rect = rect;
    this.show(this.rest.x, this.rest.y, info);
  }

  dispose(): void {
    this.cancel();
    this.box?.remove();
    this.box = null;
  }

  private on(): boolean {
    return this.o.enabled?.() ?? true;
  }

  private arm(x: number, y: number, ms: number): void {
    this.stopTimer();
    this.rest = { x, y };
    this.req = null;
    this.timer = this.setTimer(() => {
      this.timer = null;
      const p = this.rest;
      if (p) this.req = this.o.ask(p.x, p.y);
    }, ms);
  }

  private stopTimer(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  private hide(): void {
    this.rect = null;
    if (this.box) this.box.hidden = true;
  }

  private show(x: number, y: number, info: RoomHoverInfo): void {
    const doc = this.o.doc;
    const box = (this.box ??= doc.createElement('div'));
    box.className = info.desc !== undefined ? 'wc-map-hover is-full' : 'wc-map-hover';
    box.setAttribute('role', 'tooltip');
    box.replaceChildren(
      ...hoverLines(info).map(([text, cls]) => {
        const d = doc.createElement('div');
        d.className = cls;
        d.textContent = text;
        return d;
      }),
    );
    if (box.parentElement !== this.o.host) this.o.host.append(box);
    box.style.left = '0px';
    box.style.top = '0px';
    box.hidden = false;
    const W = this.o.host.clientWidth;
    const H = this.o.host.clientHeight;
    const bw = box.offsetWidth;
    const bh = box.offsetHeight;
    let left = x + GAP;
    if (W > 0 && left + bw > W) left = x - GAP - bw;
    let top = y + GAP;
    if (H > 0 && top + bh > H) top = y - GAP - bh;
    left = Math.max(0, W > 0 ? Math.min(left, W - bw) : left);
    top = Math.max(0, H > 0 ? Math.min(top, H - bh) : top);
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  }
}
