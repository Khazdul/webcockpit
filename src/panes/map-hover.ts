// The Map pane's hover box (ADR 0077 §A, feedback round 1): a box with the
// room under the pointer, after the pointer has rested on the map for
// HOVER_REST_MS (mouse) or after a long press (touch).
//
// - Mouse: every move further than HOVER_SLOP_PX from the rest point
//   restarts one timeout; a move with a button down, a wheel, a drag, the
//   pointer leaving, a map change or the pane hiding or moving cancels it.
//   A button released over the map (a click or the end of a drag) starts a
//   new rest where the pointer is. Nothing runs while the pointer is still
//   or away: no polling, no frame loop.
// - When the timeout fires the pane asks the worker (`roomAt`); the answer
//   gives the room, its square on the canvas and the content. The box
//   shows when the answer still belongs to the current rest and hides when
//   the pointer leaves that square.
// - Touch: a press held LONG_PRESS_MS without moving more than
//   PRESS_SLOP_PX asks the same way; the next press or pan hides the box.
// - Off (Options → Mapper "Room info on hover: Off"): every input returns
//   at once; no timer is armed.
// - The box is `position: fixed` in the cockpit (`host`), not in the pane,
//   so it may extend outside the Map pane and a long room shows whole in a
//   small map. With `outside` (desktop) it goes beside the pane on the side
//   with the most room, at the pointer's row, so it covers no map; when it
//   fits on neither side, above or below the pane; else beside the pointer.
//   Always inside the viewport; width capped (CSS, by text size); a box
//   taller than the viewport drops description and contents lines from the
//   end and shows `…`.

import type { RoomHoverInfo } from '../map/hover';

export const HOVER_REST_MS = 3000;
export const LONG_PRESS_MS = 550;
/** Mouse moves smaller than this (CSS px) keep the rest. */
export const HOVER_SLOP_PX = 4;
/** Touch moves smaller than this keep a long press. */
export const PRESS_SLOP_PX = 8;
/** Gap between the pointer and the box, CSS px. */
const GAP = 12;
/** Gap between the pane's edge and a box outside it, CSS px. */
const GAP_OUT = 2;
/** The box keeps this far from the viewport's edges, CSS px. */
const MARGIN = 4;

/** Options → Mapper "Hover text size". */
export type HoverTextSize = 'small' | 'medium' | 'large';

type Box = { left: number; top: number; right: number; bottom: number };

export interface MapHoverOptions {
  doc: Document;
  /** Where the box element lives (the cockpit); it is `position: fixed`. Null: not placed. */
  host: () => HTMLElement | null;
  /** The canvas's client rect: pointer points are relative to its top left. */
  frame: () => Box | null;
  /** The pane's client rect: the box goes outside it when there is room (with `outside`). */
  pane?: () => Box | null;
  /** Place the box outside the pane when it fits (desktop; default true). */
  outside?: boolean;
  /** Options → Mapper "Hover text size" (default medium). */
  size?: () => HoverTextSize;
  /** Asks the worker for the room at (x, y); returns the request id, or null when the map cannot answer. */
  ask: (x: number, y: number) => number | null;
  /** False: no box and no timers at all (Options → Mapper "Room info on hover: Off"). Default on. */
  enabled?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

type Rect = { x: number; y: number; w: number; h: number };

/** One line of the box: text, class, and a bold label before the text. */
export type HoverLine = [text: string, cls: string, label?: string];

/**
 * The box's lines. Minimal: name and note. Full (MMapper's room preview):
 * name, description (one paragraph, wrapped by the box), contents, exits,
 * then the note after a bold `Note:` (on its row for one line, else each
 * line under it indented two spaces, as MMapper's `displayRoom`).
 */
export function hoverLines(info: RoomHoverInfo): HoverLine[] {
  const out: HoverLine[] = [];
  const lines = (text: string | undefined): string[] =>
    (text ?? '')
      .replace(/\r/g, '')
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.trim() !== '');
  const add = (text: string | undefined, cls: string): void => {
    for (const l of lines(text)) out.push([l, cls]);
  };
  const full = info.desc !== undefined;
  add(info.name || '(unnamed room)', 'wc-map-hover-name');
  const desc = lines(info.desc).map((l) => l.trim()).join(' ');
  if (desc !== '') out.push([desc, 'wc-map-hover-desc']);
  add(info.contents, 'wc-map-hover-contents');
  add(info.exits, 'wc-map-hover-exits');
  const note = lines(info.note);
  if (!full) for (const l of note) out.push([l, 'wc-map-hover-note']);
  else if (note.length === 1) out.push([note[0]!, 'wc-map-hover-note', 'Note: ']);
  else if (note.length > 1) {
    out.push(['', 'wc-map-hover-note', 'Note:']);
    for (const l of note) out.push([`  ${l}`, 'wc-map-hover-note']);
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi));

/**
 * Where a `bw` × `bh` box goes (client px) for the pointer at (px, py) over
 * `pane` in a `vw` × `vh` viewport (see the file header). `pane` null: beside
 * the pointer.
 */
export function placeHoverBox(
  bw: number,
  bh: number,
  px: number,
  py: number,
  pane: Box | null,
  vw: number,
  vh: number,
  lineH = 0,
): { x: number; y: number; where: 'left' | 'right' | 'above' | 'below' | 'pointer' } {
  const maxX = Math.max(MARGIN, vw - MARGIN - bw);
  const maxY = Math.max(MARGIN, vh - MARGIN - bh);
  if (pane) {
    const rowY = clamp(py - lineH / 2, MARGIN, maxY);
    const sides = [
      { where: 'left' as const, room: pane.left - GAP_OUT - MARGIN, x: pane.left - GAP_OUT - bw },
      { where: 'right' as const, room: vw - pane.right - GAP_OUT - MARGIN, x: pane.right + GAP_OUT },
    ].sort((a, b) => b.room - a.room);
    for (const s of sides) if (s.room >= bw) return { x: s.x, y: rowY, where: s.where };
    const colX = clamp(px - bw / 2, MARGIN, maxX);
    const ends = [
      { where: 'above' as const, room: pane.top - GAP_OUT - MARGIN, y: pane.top - GAP_OUT - bh },
      { where: 'below' as const, room: vh - pane.bottom - GAP_OUT - MARGIN, y: pane.bottom + GAP_OUT },
    ].sort((a, b) => b.room - a.room);
    for (const e of ends) if (e.room >= bh) return { x: colX, y: e.y, where: e.where };
  }
  let x = px + GAP;
  if (x + bw > vw - MARGIN) x = px - GAP - bw;
  let y = py + GAP;
  if (y + bh > vh - MARGIN) y = py - GAP - bh;
  return { x: clamp(x, MARGIN, maxX), y: clamp(y, MARGIN, maxY), where: 'pointer' };
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

  /**
   * Mouse button released over the map (canvas px): a click or the end of a
   * drag. The pointer rests from here: a new rest starts at once.
   */
  up(x: number, y: number): void {
    this.cancel();
    if (this.on()) this.arm(x, y, HOVER_REST_MS);
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
    const host = this.o.host();
    const frame = this.o.frame();
    if (!host || !frame) return;
    const box = (this.box ??= doc.createElement('div'));
    box.className = info.desc !== undefined ? 'wc-map-hover is-full' : 'wc-map-hover';
    box.dataset.size = this.o.size?.() ?? 'medium';
    box.setAttribute('role', 'tooltip');
    box.replaceChildren(
      ...hoverLines(info).map(([text, cls, label]) => {
        const d = doc.createElement('div');
        d.className = cls;
        if (label) {
          const b = doc.createElement('span');
          b.className = 'wc-map-hover-label';
          b.textContent = label;
          d.append(b);
        }
        if (text !== '') d.append(text);
        return d;
      }),
    );
    if (box.parentElement !== host) host.append(box);
    box.style.left = '0px';
    box.style.top = '0px';
    box.hidden = false;
    const root = doc.documentElement;
    const win = doc.defaultView;
    const vw = root.clientWidth || win?.innerWidth || 0;
    const vh = root.clientHeight || win?.innerHeight || 0;
    // A containing block other than the viewport (none today) shifts a
    // fixed box: measure where (0, 0) lands and correct for it.
    const origin = box.getBoundingClientRect();
    if (vh > 0) this.fit(box, vh - 2 * MARGIN);
    const bw = box.offsetWidth;
    const bh = box.offsetHeight;
    const name = box.firstElementChild as HTMLElement | null;
    const p = placeHoverBox(
      bw,
      bh,
      frame.left + x,
      frame.top + y,
      this.o.outside === false ? null : (this.o.pane?.() ?? null),
      vw,
      vh,
      name?.offsetHeight ?? 0,
    );
    box.dataset.where = p.where;
    box.style.left = `${Math.round(p.x - origin.left)}px`;
    box.style.top = `${Math.round(p.y - origin.top)}px`;
  }

  /** Drops description and contents lines from the end until the box is at most `maxH` tall; `…` marks the cut. */
  private fit(box: HTMLDivElement, maxH: number): void {
    if (box.offsetHeight <= maxH) return;
    const cut = [...box.querySelectorAll<HTMLElement>('.wc-map-hover-desc, .wc-map-hover-contents')];
    if (cut.length === 0) return;
    const more = this.o.doc.createElement('div');
    more.className = 'wc-map-hover-more';
    more.textContent = '…';
    cut.at(-1)!.after(more);
    while (box.offsetHeight > maxH && cut.length > 0) {
      const el = cut.pop()!;
      if (el.classList.contains('wc-map-hover-desc')) {
        // One paragraph: drop words from its end.
        const words = (el.textContent ?? '').split(' ');
        while (words.length > 1 && box.offsetHeight > maxH) {
          words.splice(Math.max(1, words.length - 8));
          el.textContent = words.join(' ');
        }
        if (box.offsetHeight > maxH) el.remove();
      } else el.remove();
    }
  }
}
