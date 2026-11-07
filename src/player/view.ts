// The log player chrome (Inv §7.5, ADR 0018; the look of stage 32c, ADR
// 0114): header, the right-edge rail with the gold playhead, the kind-icon
// markers, the control box with its Panes and Display popups, auto-hide,
// the pause cursor line and the keys. It drives a PlayerEngine and reads
// the current player App's output pane; the engine and the timeline know
// nothing about it. The in-app player, the Spotlights reel and the HTML
// replay all use it.
//
//   .wc-player-chrome           over the whole player (pointer-events none)
//     .wc-player-header         top line: `<char> (L<lvl>) · Run X of Y · date`, key hints, on opaque chips
//     .wc-player-marks          kind icons left of the rail, one marker per slot
//     .wc-player-rail           right edge, RAIL_W px: track, played part, gold playhead
//     .wc-player-box            the control box (ghost look), bottom right
//       .wc-pc-row              To the start, −10 s, Play/Pause, +10 s, speed ◄ 1× ►, time,
//                               Panes, Display, the mode's buttons, Close
//       .wc-pc-pop              the Panes or the Display popup, above the box
//     .wc-player-hint           `MM:SS` beside the pointer while dragging the rail
//     .wc-player-tip            a marker's events, left of the marker under the pointer
//
// Modes. Play: the output follows the tail, the chrome hides 6 s after the
// last key or mouse move (not while a popup is open). Pause: the chrome
// stays, and a cursor line (`bg #303030`) starts on the last line; ↑/↓,
// PgUp/PgDn (±20), End and the wheel move it, a click on a line sets it.
// Space resumes from the cursor line's time (a backward seek unless it is
// still the last line). Those keys pause first when playing. ← / → (with
// or without Shift) go back or forward 10 s, Home to the start, `1`–`6`
// set the speed, ESC closes an open popup, then goes back. While the
// player is open it owns the keyboard: a window capture listener stops
// every key from reaching the (hidden) input panes; keys whose target is
// inside a `data-wc-own-keys` element (a popup, the Spotlights card) are
// left to it.
//
// Mode options (ADR 0019 "PlayerView options"): the header's parts and
// hints come from `header` (`runHeader` is the in-app player's), `keys`
// sees every key first (the reel takes plain ← →), `startHidden` starts
// with the chrome hidden until the user moves or presses something,
// `railHoverTime` shows `MM:SS` beside the pointer over the rail,
// `boxButtons` adds icon buttons before Close (the replay's Fullscreen),
// `closeTitle` adds Close (absent: none, the replay), `shiftSeek` names
// Shift+← → in the ±10 s tooltips, and `onEsc` is ESC.
//
// The player core (stage 42f, ADR 0127): `hours` shows the times as
// `h:mm:ss` from one hour (the clock, the rail's time hint; the run log
// player and the Spotlights viewer; the HTML replay keeps `MM:SS`).
// `back` adds the kit's Back at the top left (`.wc-pv-back`, the look of
// src/chrome/kit/look-glass.css): part of the chrome, so it hides and
// shows with it, and it calls `onEsc` (an open popup closes first); the
// header's left part moves right of it when the two would meet. `bare`
// draws no chrome at all (no header, rail, markers, control box, popups,
// hint or tip, and nothing hides): the keys, the pause cursor line, the
// wheel and clicks on lines stay, and a host page drives it with
// `press(act)` (the Spotlights viewer, stage 46).
//
// The keys are the player's only while its root is shown: a root inside a
// hidden element (`hidden`, or an inline `display: none`, e.g. an
// embedded player parked under its page) lets every key pass.
//
// Viewer settings (ADR 0021, as 0114): with `settings`, Display (font size
// and colours) and, when it has panes, Panes (pane toggles and Reset
// layout) open popups above the box. The box takes the pointer (clicks and
// the wheel there never reach the stage or move the pause cursor). A popup
// opened from the keyboard takes the focus; opened by a press it leaves
// the keys with the player. The box buttons never take the focus on a
// press, so Space after a click still plays or pauses.

import './player.css';
import type { OutputPane } from '../ui/output-pane';
import type { PlayerEngine } from './engine';
import {
  type HeaderHint,
  HINTS,
  HINT_SEP,
  MARK_SLOT,
  type MarkRow,
  type PlacedMark,
  RAIL_PAD,
  RAIL_W,
  fitHints,
  fmtClock,
  fmtDateTime,
  fmtSpeed,
  hintsWidth,
  markRows,
  railFraction,
  yToOffset,
} from './strip';
import { SPEEDS } from './engine';
import { playAtLogUs } from './timeline';
import { OWN_KEYS_ATTR } from '../ui/input-pane';
import { closeButton, focusPopup, popupKey, pressPopup } from '../menubar/popup';
import { LETTER_KIND, type PlayerIconName, kindIcon, playerIcon, tenIcon } from './icons';
import type { ViewerFont, ViewerTheme } from './viewer';

/** Chrome hides this long after the last activity in play, ms. */
export const HIDE_MS = 6000;
/** Cursor step of PgUp / PgDn, lines. */
export const PAGE_STEP = 20;
/** ← / → step, ms. */
export const SKIP_MS = 10_000;
/** Header width in cells (centred); wider only as far as the full hint list needs. */
const HEADER_COLS = 80;
/** Least gap between the header's left part and the hints, cells; and each chip's padding (both sides), cells. */
const HEADER_GAP = 2;
const CHIP_PAD = 2;
/** The control box: px in from the rail (roomy, and compact on a narrow player), and up from the bottom. */
const BOX_RIGHT = 28;
const BOX_RIGHT_COMPACT = 24;
const BOX_BOTTOM = 12;
/** Least space left of the box, px. */
const BOX_MARGIN = 8;
/** A popup's gap above the box, and its least margin to the player's top, px. */
const POP_GAP = 8;
const POP_TOP = 6;

/** What the in-app log player's header shows (`runHeader`). */
export interface PlayerHeader {
  character: string;
  level?: number | undefined;
  /** 0-based run index, and the number of runs. */
  run: number;
  runs: number;
  /** Start of the run, µs. */
  startUs: number;
}

/** One piece of the header's left part; pieces are joined by a dim ` · `. */
export interface HeaderPart {
  text: string;
  /** Class of its span; none = plain text in the header colour. */
  cls?: string;
}

/** The header of one moment: left parts and the key hints (fitted to the width). */
export interface PlayerHeaderModel {
  left: HeaderPart[];
  hints: ReadonlyArray<HeaderHint>;
}

/** The in-app log player's header: `<char> (L<lvl>) · Run X of Y · date`, HINTS with `ESC Back` clickable. */
export function runHeader(h: PlayerHeader, onEsc: () => void): PlayerHeaderModel {
  return {
    left: [
      { text: h.character + (h.level !== undefined ? ` (L${h.level})` : ''), cls: 'wc-player-name' },
      { text: `Run ${h.run + 1} of ${h.runs}` },
      { text: fmtDateTime(h.startUs) },
    ],
    hints: HINTS.map((x) => (x.text === 'ESC Back' ? { ...x, cls: 'wc-player-back', onClick: onEsc } : x)),
  };
}

/** An icon button of the mode's own, before Close (the replay's Fullscreen). */
export interface BoxButton {
  /** Tooltip and accessible name. */
  label: () => string;
  icon: () => PlayerIconName;
  onClick: () => void;
}

export interface PlayerViewOptions {
  /** The player element (fills the window; the chrome is laid over it). */
  root: HTMLElement;
  engine: PlayerEngine;
  /** The header at run `run` (called on every render; cheap). */
  header: (run: number) => PlayerHeaderModel;
  /** Markers as playback offsets (ms). */
  marks: ReadonlyArray<PlacedMark>;
  /** The current player App's output pane (it changes on a rebuild). */
  output: () => OutputPane | null;
  /** The cell size in px. */
  cells: () => { w: number; h: number };
  /** ESC (in the log player: back to History). */
  onEsc: () => void;
  /** Extra keys, before the player's own; true = handled (the view then prevents the default). */
  keys?: (e: KeyboardEvent) => boolean;
  /** Start with the chrome hidden; the first key or pointer move shows it. */
  startHidden?: boolean;
  /** `MM:SS` beside the pointer while it hovers over the rail. */
  railHoverTime?: boolean;
  /** Icon buttons of the mode, before Close. */
  boxButtons?: BoxButton[];
  /** The Close button's tooltip; absent or null = no Close button. */
  closeTitle?: string | null;
  /** ±10 s is Shift+← → (the reel's plain arrows step spotlights). */
  shiftSeek?: boolean;
  /** Display, and Panes when it has panes (ADR 0021, 0114). */
  settings?: ViewerControls;
  /** Auto-hide delay (tests). */
  hideMs?: number;
  /** Times as `h:mm:ss` from one hour (the run log player, Spotlights); absent: `MM:SS` (the HTML replay). */
  hours?: boolean;
  /** The kit's Back at the top left (part of the chrome): its tooltip and accessible name. It calls `onEsc`. */
  back?: { title: string };
  /** No chrome (header, rail, markers, box, popups, hint, tip, auto-hide); the keys, cursor, wheel and clicks stay. */
  bare?: boolean;
}

/** The pane part of the viewer settings (the Panes popup). */
export interface ViewerPanes {
  /** `wide`: a script pane (its label may be cut). */
  list: () => ReadonlyArray<{ id: string; label: string; on: boolean; wide?: boolean }>;
  toggle: (id: string) => void;
  /** Something to reset (the button is dim otherwise). */
  canReset: () => boolean;
  reset: () => void;
}

/** The viewer settings the box's popups show (PlayerHost implements it). */
export interface ViewerControls {
  /** Absent: no Panes button (the reel shows no panes, ADR 0032). */
  panes?: ViewerPanes;
  font: () => ViewerFont;
  setFont: (f: ViewerFont) => void;
  theme: () => ViewerTheme;
  setTheme: (t: ViewerTheme) => void;
  /** A theme's swatch: its background (Default: the recorded one). */
  swatch: (t: ViewerTheme) => string;
}

/** Display's choices, in order. */
const FONT_CHOICES: ReadonlyArray<[ViewerFont, string]> = [
  ['default', 'Default'],
  ['small', 'Small'],
  ['medium', 'Medium'],
  ['large', 'Large'],
];
const THEME_CHOICES: ReadonlyArray<[ViewerTheme, string]> = [
  ['default', 'Default'],
  ['dark', 'Dark'],
  ['teal', 'Teal'],
  ['paper', 'Paper'],
  ['sepia', 'Sepia'],
  ['slate', 'Slate'],
];

export type PlayerPopup = 'panes' | 'display';

type Act = 'start' | 'back' | 'play' | 'fwd' | 'slower' | 'faster' | 'panes' | 'display' | 'close';

/** What a host page may press (`PlayerView.press`): the control box's buttons. */
export type PlayerAct = 'start' | 'back' | 'play' | 'fwd' | 'slower' | 'faster';

/** Back's gap to the header's left part, px. */
const BACK_GAP = 8;
/** The kit's Back chevron (src/chrome/kit/look-icons.tsx `back`), 16-unit box. */
const BACK_PATH = 'M9.8 3.2 5 8l4.8 4.8';

interface Popup {
  el: HTMLDivElement;
  body: HTMLDivElement;
  btn: HTMLButtonElement;
  sig: string;
}

export class PlayerView {
  readonly el: HTMLDivElement;
  private readonly o: PlayerViewOptions;
  private readonly doc: Document;
  private readonly win: Window;
  private readonly headerEl: HTMLDivElement;
  private readonly headLeft: HTMLSpanElement;
  private readonly headHints: HTMLSpanElement;
  private readonly marksEl: HTMLDivElement;
  private readonly railEl: HTMLDivElement;
  private readonly railDone: HTMLDivElement;
  private readonly railHead: HTMLDivElement;
  private readonly boxEl: HTMLDivElement;
  private readonly btnPlay: HTMLButtonElement;
  private readonly btnSlower: HTMLButtonElement;
  private readonly btnFaster: HTMLButtonElement;
  private readonly speedEl: HTMLSpanElement;
  private readonly clockEl: HTMLSpanElement;
  private readonly extraBtns: HTMLButtonElement[] = [];
  private readonly popups = new Map<PlayerPopup, Popup>();
  private openPop: PlayerPopup | null = null;
  private readonly hintEl: HTMLDivElement;
  private readonly tipEl: HTMLDivElement;
  /** The kit's Back (option `back`), or null. */
  private readonly backEl: HTMLButtonElement | null = null;
  /** Back's right edge plus its gap, px, once measured (0: not yet). */
  private backRight = 0;
  private readonly unsubs: Array<() => void> = [];
  private readonly ro: ResizeObserver | null = null;
  private raf: number | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private shown = true;
  private railSig = '';
  private marksSig = '';
  private headSig = '';
  private boxSig = '';
  /** The box is compact (no time, smaller buttons) on a narrow player; its full width, px, once measured. */
  private compact = false;
  /** The compact box's width, px, once measured (before `data-tight` hides anything). */
  private compactBoxW = 0;
  private fullBoxW = 0;
  /** Rail drag: pointer id and the previewed offset. */
  private drag: { id: number; offset: number } | null = null;
  private cursor: HTMLElement | null = null;
  /** The cursor was moved since the pause (Space then resumes from it). */
  private cursorMoved = false;
  private wasPlaying: boolean;
  private wasSeeking = false;
  /** startHidden: play starting does not show the chrome until the user acts. */
  private quiet: boolean;
  private disposed = false;

  constructor(opts: PlayerViewOptions) {
    this.o = opts;
    this.doc = opts.root.ownerDocument;
    this.win = this.doc.defaultView!;
    const doc = this.doc;
    const div = (cls: string): HTMLDivElement => {
      const d = doc.createElement('div');
      d.className = cls;
      return d;
    };
    this.el = div('wc-player-chrome');
    this.headerEl = div('wc-player-header');
    this.headLeft = doc.createElement('span');
    this.headLeft.className = 'wc-player-head-left';
    this.headHints = doc.createElement('span');
    this.headHints.className = 'wc-player-hints';
    this.headerEl.append(this.headLeft, this.headHints);
    this.marksEl = div('wc-player-marks');
    this.railEl = div('wc-player-rail');
    const track = div('wc-player-rail-track');
    this.railDone = div('wc-player-rail-done');
    track.append(this.railDone);
    this.railHead = div('wc-player-rail-head');
    this.railEl.append(track, this.railHead);
    this.railEl.style.setProperty('--rail-pad', `${RAIL_PAD}px`);

    // The control box.
    this.boxEl = div('wc-player-box');
    const row = div('wc-pc-row');
    const seekKey = (dir: string): string => (opts.shiftSeek ? `Shift+${dir}` : dir);
    const start = this.button('start', 'To the start (Home)', playerIcon(doc, 'start'));
    const back = this.button('back', `Back 10 s (${seekKey('←')})`, tenIcon(doc, 'back'));
    this.btnPlay = this.button('play', 'Play / pause (Space)', playerIcon(doc, 'pause'), 'wc-pc-play');
    const fwd = this.button('fwd', `Forward 10 s (${seekKey('→')})`, tenIcon(doc, 'fwd'));
    this.btnSlower = this.button('slower', 'Slower (1–6)', playerIcon(doc, 'prev'), 'wc-pc-ib wc-pc-sm');
    this.btnFaster = this.button('faster', 'Faster (1–6)', playerIcon(doc, 'next'), 'wc-pc-ib wc-pc-sm');
    this.speedEl = doc.createElement('span');
    this.speedEl.className = 'wc-player-speed';
    this.speedEl.title = 'Speed (1–6)';
    const speed = doc.createElement('span');
    speed.className = 'wc-pc-speed';
    speed.append(this.btnSlower, this.speedEl, this.btnFaster);
    this.clockEl = doc.createElement('span');
    this.clockEl.className = 'wc-player-clock';
    const grow = doc.createElement('span');
    grow.className = 'wc-pc-grow';
    row.append(start, back, this.btnPlay, fwd, speed, this.clockEl, grow);
    const tail: HTMLElement[] = [];
    // A bare view has no box, so no popups either.
    const settings = opts.bare ? undefined : opts.settings;
    if (settings?.panes) tail.push(this.popupButton('panes', 'Panes', 'panes'));
    if (settings) tail.push(this.popupButton('display', 'Display: font size and colours', 'display'));
    for (const b of opts.boxButtons ?? []) {
      const btn = this.iconButton('wc-pc-ib', b.label(), playerIcon(doc, b.icon()));
      btn.dataset.act = 'extra';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.touch();
        b.onClick();
        this.schedule();
      });
      this.extraBtns.push(btn);
      tail.push(btn);
    }
    if (opts.closeTitle) tail.push(this.button('close', opts.closeTitle, playerIcon(doc, 'close')));
    if (tail.length > 0) {
      const vs = doc.createElement('span');
      vs.className = 'wc-pc-vs';
      row.append(vs, ...tail);
    }
    this.boxEl.append(row, ...[...this.popups.values()].map((p) => p.el));
    this.boxEl.addEventListener('wheel', this.onBoxWheel, { passive: false });
    // A press on the box never moves the focus (keys stay with the player)
    // and never reaches the stage (no cursor move).
    row.addEventListener('mousedown', (e) => e.preventDefault());
    this.boxEl.addEventListener('click', (e) => e.stopPropagation());

    this.hintEl = div('wc-player-hint');
    this.hintEl.hidden = true;
    this.tipEl = div('wc-player-tip');
    this.tipEl.hidden = true;
    if (opts.bare) this.el.toggleAttribute('data-bare', true);
    else {
      if (opts.back) this.backEl = this.backButton(opts.back.title);
      this.el.append(...(this.backEl ? [this.backEl] : []), this.headerEl, this.marksEl, this.railEl, this.boxEl, this.hintEl, this.tipEl);
    }
    opts.root.appendChild(this.el);
    this.quiet = !opts.bare && (opts.startHidden ?? false);

    this.wasPlaying = opts.engine.playing;
    this.unsubs.push(opts.engine.subscribe((c) => this.onEngine(c)));
    this.win.addEventListener('keydown', this.onKey, true);
    opts.root.addEventListener('pointermove', this.onActivity);
    opts.root.addEventListener('pointerdown', this.onActivity);
    opts.root.addEventListener('wheel', this.onWheel, { passive: false });
    opts.root.addEventListener('click', this.onStageClick);
    this.railEl.addEventListener('pointerdown', this.onRailDown);
    this.railEl.addEventListener('pointermove', this.onRailMove);
    this.railEl.addEventListener('pointerup', this.onRailUp);
    this.railEl.addEventListener('pointercancel', this.onRailCancel);
    this.railEl.addEventListener('pointerleave', this.onRailLeave);
    this.marksEl.addEventListener('click', this.onMarkClick);
    this.marksEl.addEventListener('pointerover', this.onMarkOver);
    this.marksEl.addEventListener('pointerout', this.onMarkOut);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.schedule());
      this.ro.observe(opts.root);
    }
    if (this.quiet) this.setShown(false);
    else this.touch();
    this.render();
  }

  /** Redraws on the next frame (a header or setting that changed outside the engine's events). */
  refresh(): void {
    this.schedule();
  }

  /**
   * Presses one of the control box's buttons (a host page's own controls,
   * the bare view): `play` plays or pauses, and resumes from the cursor
   * line as Space does.
   */
  press(act: PlayerAct): void {
    if (this.disposed) return;
    this.quiet = false;
    this.touch();
    this.act(act);
  }

  /** A playback time as this mode shows it. */
  private clock(ms: number): string {
    return fmtClock(ms, this.o.hours === true);
  }

  /** The kit's Back: never takes the focus; closes an open popup, then `onEsc`. */
  private backButton(title: string): HTMLButtonElement {
    const doc = this.doc;
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'wc-lk-back wc-pv-back wc-look';
    b.tabIndex = -1;
    b.title = title;
    b.setAttribute('aria-label', title);
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'wc-lk-ic');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', BACK_PATH);
    svg.append(path);
    b.append(svg, 'Back');
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setPopup(null);
      this.o.onEsc();
    });
    return b;
  }

  private iconButton(cls: string, label: string, icon: SVGSVGElement): HTMLButtonElement {
    const b = this.doc.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.append(icon);
    return b;
  }

  private button(act: Act, label: string, icon: SVGSVGElement, cls = 'wc-pc-ib'): HTMLButtonElement {
    const b = this.iconButton(cls, label, icon);
    b.dataset.act = act;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.touch();
      this.act(act);
    });
    return b;
  }

  /** A box button that opens popup `name`, and the popup (hidden). */
  private popupButton(name: PlayerPopup, label: string, icon: PlayerIconName): HTMLButtonElement {
    const doc = this.doc;
    const btn = this.iconButton('wc-pc-ib', label, playerIcon(doc, icon));
    btn.dataset.act = name;
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // From the keyboard (the button had the focus): the popup takes it.
      const keyed = doc.activeElement === btn;
      this.setPopup(this.openPop === name ? null : name, keyed);
    });
    const el = doc.createElement('div');
    el.className = `wc-pc-pop wc-pc-pop-${name}`;
    el.dataset.pop = name;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', name === 'panes' ? 'Panes' : 'Display');
    el.setAttribute(OWN_KEYS_ATTR, '');
    el.tabIndex = -1;
    el.hidden = true;
    el.addEventListener('mousedown', (e) => pressPopup(e, el));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        this.setPopup(null);
        return;
      }
      if (popupKey(e, el)) e.preventDefault();
    });
    el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    const head = doc.createElement('div');
    head.className = 'wc-pc-pop-head';
    const title = doc.createElement('span');
    title.className = 'wc-pc-pop-title';
    title.textContent = name === 'panes' ? 'Panes' : 'Display';
    head.append(title, closeButton(doc, () => this.setPopup(null)));
    const body = doc.createElement('div');
    body.className = 'wc-pc-pop-body';
    el.append(head, body);
    this.popups.set(name, { el, body, btn, sig: '' });
    return btn;
  }

  private act(a: Act): void {
    const eng = this.o.engine;
    switch (a) {
      case 'start':
        this.seekTo(0);
        break;
      case 'back':
        this.skip(-SKIP_MS);
        break;
      case 'fwd':
        this.skip(SKIP_MS);
        break;
      case 'play':
        this.toggle();
        break;
      case 'slower':
      case 'faster': {
        const i = SPEEDS.indexOf(eng.speed) + (a === 'faster' ? 1 : -1);
        if (i >= 0 && i < SPEEDS.length) eng.setSpeed(SPEEDS[i]!);
        break;
      }
      case 'close':
        this.setPopup(null);
        this.o.onEsc();
        return;
      default:
        break;
    }
    this.schedule();
  }

  /** Seeks to `ms` (clamped); the cursor line goes, paused stays paused. */
  private seekTo(ms: number): void {
    const eng = this.o.engine;
    this.clearCursor();
    eng.seek(Math.max(0, Math.min(eng.duration, ms)));
  }

  /** Back (−) or forward (+) `ms` from where it plays. */
  skip(ms: number): void {
    this.seekTo(this.o.engine.position + ms);
  }

  /** True while the chrome is shown (tests). */
  get chromeShown(): boolean {
    return this.shown;
  }

  /** The open popup, or null. */
  get popup(): PlayerPopup | null {
    return this.openPop;
  }

  /** The control box (tests). */
  get boxElement(): HTMLElement {
    return this.boxEl;
  }

  /**
   * Opens popup `name` (closing the other) or closes the open one (null).
   * `focus`: it takes the focus (opened from the keyboard). The chrome
   * stays shown while a popup is open.
   */
  setPopup(name: PlayerPopup | null, focus = false): void {
    if (name !== null && !this.popups.has(name)) return;
    const prev = this.openPop;
    if (prev === name) return;
    const doc = this.doc;
    if (prev) {
      const p = this.popups.get(prev)!;
      const had = p.el.contains(doc.activeElement);
      p.el.hidden = true;
      p.btn.classList.remove('is-on');
      p.btn.setAttribute('aria-expanded', 'false');
      // The keys go back to the player.
      if (had) (doc.activeElement as HTMLElement | null)?.blur?.();
    }
    this.openPop = name;
    this.boxEl.toggleAttribute('data-popup', name !== null);
    if (name) {
      const p = this.popups.get(name)!;
      p.sig = '';
      this.renderPopup(name);
      p.el.hidden = false;
      p.btn.classList.add('is-on');
      p.btn.setAttribute('aria-expanded', 'true');
      this.placePopup(p);
      if (focus) focusPopup(p.el);
    }
    this.touch();
  }

  /** The popup's height is capped by the room above the box. */
  private placePopup(p: Popup): void {
    const room = this.boxEl.offsetTop - POP_GAP - POP_TOP;
    p.el.style.maxHeight = room > 0 ? `${room}px` : '';
  }

  /** The pause cursor's line, or null. */
  get cursorLine(): HTMLElement | null {
    return this.cursor;
  }

  // ------------------------------------------------------------- engine

  private onEngine(_c: 'state' | 'tick'): void {
    const eng = this.o.engine;
    const playing = eng.playing;
    const seeking = eng.seeking;
    const seekDone = this.wasSeeking && !seeking;
    this.wasSeeking = seeking;
    if (playing !== this.wasPlaying) {
      this.wasPlaying = playing;
      if (playing) {
        this.clearCursor();
        this.o.output()?.toTail();
        if (!this.quiet) this.touch();
      } else {
        this.show();
      }
    }
    // Paused (or a seek landed while paused): the cursor parks on the last
    // line, after the output's own flush in the same frame.
    if (!playing && !seeking && (seekDone || !this.cursor)) {
      this.win.requestAnimationFrame(() => {
        if (this.disposed || eng.playing || eng.seeking) return;
        this.o.output()?.toTail();
        this.cursorToEnd();
      });
    }
    this.schedule();
  }

  private toggle(): void {
    const eng = this.o.engine;
    if (eng.playing) {
      eng.pause();
      return;
    }
    const at = this.cursorMoved ? this.cursorTime() : null;
    this.clearCursor();
    if (at !== null) eng.seek(at);
    eng.play();
  }

  /** Playback time of the cursor line (its stamp, or the nearest stamped line above). */
  private cursorTime(): number | null {
    const c = this.cursor;
    if (!c || c === this.lastRow()) return null;
    for (let r: HTMLElement | null = c; r; r = prevRow(r)) {
      const ts = r.dataset.ts;
      if (ts) return playAtLogUs(this.o.engine.timeline, Number(ts));
    }
    return 0;
  }

  // ------------------------------------------------------------- render

  private schedule(): void {
    if (this.raf !== null || this.disposed) return;
    this.raf = this.win.requestAnimationFrame(() => {
      this.raf = null;
      if (!this.disposed) this.render();
    });
  }

  /** Draws everything that changed. */
  render(): void {
    const eng = this.o.engine;
    const { w, h } = this.o.cells();
    if (!(w > 0 && h > 0)) return;
    const W = this.o.root.clientWidth;
    const H = this.o.root.clientHeight;
    const cols = Math.max(1, Math.floor((W - RAIL_W) / w));
    const dur = eng.duration;
    const pos = this.drag ? this.drag.offset : eng.position;
    if (this.o.bare) {
      this.el.dataset.playing = String(eng.playing);
      this.el.toggleAttribute('data-seeking', eng.seeking);
      return;
    }

    this.renderHeader(W, w, cols);

    // Rail: the played part and the playhead, at whole px.
    const span = Math.max(0, H - 2 * RAIL_PAD);
    const y = Math.round(railFraction(pos, dur) * span);
    const railSig = `${H}|${y}`;
    if (railSig !== this.railSig) {
      this.railSig = railSig;
      this.railDone.style.height = `${y}px`;
      this.railHead.style.top = `${RAIL_PAD + y}px`;
    }

    // Markers: one per slot, at the earliest event's place.
    const slots = Math.max(1, Math.floor(span / MARK_SLOT));
    const marksSig = `${H}|${slots}`;
    if (marksSig !== this.marksSig) {
      this.marksSig = marksSig;
      this.tipEl.hidden = true;
      this.marksEl.textContent = '';
      for (const m of markRows(this.o.marks, dur, slots)) this.marksEl.appendChild(this.markEl(m, RAIL_PAD + railFraction(m.offset, dur) * span));
    }

    // Control box.
    const labels = this.o.boxButtons?.map((b) => `${b.label()}|${b.icon()}`) ?? [];
    const boxSig = `${eng.playing}|${eng.speed}|${this.clock(pos)}|${this.clock(dur)}|${labels.join('|')}`;
    if (boxSig !== this.boxSig) {
      this.boxSig = boxSig;
      const playing = eng.playing;
      if (this.btnPlay.dataset.playing !== String(playing)) {
        this.btnPlay.dataset.playing = String(playing);
        this.btnPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
        this.btnPlay.replaceChildren(playerIcon(this.doc, playing ? 'pause' : 'play'));
      }
      const i = SPEEDS.indexOf(eng.speed);
      this.speedEl.textContent = fmtSpeed(eng.speed);
      this.btnSlower.disabled = i <= 0;
      this.btnFaster.disabled = i < 0 || i >= SPEEDS.length - 1;
      const cur = this.doc.createElement('b');
      cur.textContent = this.clock(pos);
      this.clockEl.replaceChildren(cur, ` / ${this.clock(dur)}`);
      this.o.boxButtons?.forEach((b, k) => {
        const btn = this.extraBtns[k]!;
        const label = b.label();
        if (btn.title === label) return;
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.replaceChildren(playerIcon(this.doc, b.icon()));
      });
    }
    this.fitBox(W);
    if (this.openPop) {
      this.renderPopup(this.openPop);
      this.placePopup(this.popups.get(this.openPop)!);
    }
    this.el.dataset.playing = String(eng.playing);
    this.el.toggleAttribute('data-seeking', eng.seeking);
  }

  /**
   * Header: the left part and the hints that fit, each on an opaque chip,
   * centred left of the rail; right of Back (option `back`) when centred
   * it would meet it, and as much narrower as it has to be.
   */
  private renderHeader(W: number, w: number, cols: number): void {
    const hd = this.o.header(this.o.engine.run);
    const leftLen = hd.left.reduce((n, p) => n + p.text.length, 0) + 3 * Math.max(0, hd.left.length - 1);
    const full = hintsWidth(hd.hints.map((x) => x.text));
    const extra = HEADER_GAP + 2 * CHIP_PAD;
    let hc = Math.max(1, Math.min(Math.max(HEADER_COLS, leftLen + extra + full), cols));
    let left = Math.max(0, Math.floor((W - RAIL_W - hc * w) / 2));
    // Back's place is measured once (its size never changes after that).
    const back = this.backEl;
    if (back && this.backRight === 0 && back.offsetWidth > 0) this.backRight = back.offsetLeft + back.offsetWidth + BACK_GAP;
    if (this.backRight > 0 && left < this.backRight) {
      left = this.backRight;
      hc = Math.max(1, Math.min(hc, Math.floor((W - RAIL_W - left) / w)));
    }
    const hints = fitHints(hc - leftLen - extra, hd.hints);
    const headSig = `${JSON.stringify(hd)}|${hc}|${left}|${w}|${W}|${hints.join()}`;
    if (headSig === this.headSig) return;
    this.headSig = headSig;
    this.headerEl.style.width = `${hc * w}px`;
    this.headerEl.style.left = `${left}px`;
    this.headLeft.textContent = '';
    hd.left.forEach((p, i) => {
      if (i > 0) {
        const s = this.doc.createElement('span');
        s.className = 'wc-player-sep';
        s.textContent = ' · ';
        this.headLeft.append(s);
      }
      if (!p.cls) return void this.headLeft.append(p.text);
      const span = this.doc.createElement('span');
      span.className = p.cls;
      span.textContent = p.text;
      this.headLeft.append(span);
    });
    this.headLeft.hidden = hd.left.length === 0;
    this.headHints.textContent = '';
    hints.forEach((t, i) => {
      if (i > 0) this.headHints.append(HINT_SEP);
      const h = hd.hints.find((x) => x.text === t);
      if (!h?.onClick && !h?.cls) return void this.headHints.append(t);
      const span = this.doc.createElement('span');
      span.className = h.cls ?? 'wc-player-click';
      span.textContent = t;
      const click = h.onClick;
      if (click) span.addEventListener('click', () => click());
      this.headHints.append(span);
    });
    this.headHints.hidden = hints.length === 0;
  }

  /**
   * The box sits BOX_RIGHT px left of the rail; on a player too narrow for
   * its full width it goes compact: next to the rail, without the time,
   * with smaller buttons.
   */
  private fitBox(W: number): void {
    if (!this.compact) {
      const bw = this.boxEl.offsetWidth;
      if (bw > 0) this.fullBoxW = bw;
    }
    const room = W - RAIL_W - BOX_RIGHT - BOX_MARGIN;
    const compact = this.fullBoxW > 0 && room < this.fullBoxW;
    if (compact !== this.compact) {
      this.compact = compact;
      this.boxEl.toggleAttribute('data-compact', compact);
    }
    // Still too wide when compact (a 320 px phone, a very narrow window):
    // tight drops Fullscreen and To the start (the rail seeks there too).
    if (compact && !this.boxEl.hasAttribute('data-tight')) {
      const bw = this.boxEl.offsetWidth;
      if (bw > 0) this.compactBoxW = bw;
    }
    const tightRoom = W - RAIL_W - BOX_RIGHT_COMPACT - BOX_MARGIN;
    const tight = compact && this.compactBoxW > 0 && tightRoom < this.compactBoxW;
    if (tight !== this.boxEl.hasAttribute('data-tight')) this.boxEl.toggleAttribute('data-tight', tight);
    const right = RAIL_W + (compact ? BOX_RIGHT_COMPACT : BOX_RIGHT);
    this.boxEl.style.right = `${right}px`;
    this.boxEl.style.bottom = `${BOX_BOTTOM}px`;
    // The popups hang from the box's right edge: never wider than the room left of it.
    this.boxEl.style.setProperty('--pc-pop-max', `${Math.max(160, W - right - BOX_MARGIN)}px`);
  }

  /** Fills or updates popup `name` from the settings. */
  private renderPopup(name: PlayerPopup): void {
    const vs = this.o.settings;
    const p = this.popups.get(name);
    if (!vs || !p) return;
    if (name === 'panes' && vs.panes) this.renderPanes(p, vs.panes);
    else if (name === 'display') this.renderDisplay(p, vs);
  }

  private renderPanes(p: Popup, vp: ViewerPanes): void {
    const doc = this.doc;
    const list = vp.list();
    const can = vp.canReset();
    const ids = list.map((x) => x.id).join('|');
    // Built once per list of panes; the states are updated in place (the focus stays).
    if (p.body.dataset.ids !== ids || !p.body.firstChild) {
      p.body.dataset.ids = ids;
      const rows = list.map((x) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = `wc-pc-prow${x.wide ? ' is-wide' : ''}`;
        b.dataset.pane = x.id;
        b.setAttribute('role', 'switch');
        const l = doc.createElement('span');
        l.className = 'wc-pc-plabel';
        l.textContent = x.label;
        b.title = x.label;
        const tg = doc.createElement('span');
        tg.className = 'wc-pc-tg';
        tg.append(doc.createElement('i'));
        b.append(l, tg);
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          vp.toggle(x.id);
          this.schedule();
        });
        return b;
      });
      const foot = doc.createElement('div');
      foot.className = 'wc-pc-pop-foot';
      const reset = doc.createElement('button');
      reset.type = 'button';
      reset.className = 'wc-pc-btn';
      reset.dataset.set = 'reset';
      reset.textContent = 'Reset layout';
      reset.addEventListener('click', (e) => {
        e.stopPropagation();
        if (vp.canReset()) vp.reset();
        this.schedule();
      });
      foot.append(reset);
      const listEl = doc.createElement('div');
      listEl.className = 'wc-pc-plist';
      listEl.append(...rows);
      p.body.replaceChildren(listEl, foot);
      p.sig = '';
    }
    const sig = JSON.stringify([list, can]);
    if (sig === p.sig) return;
    p.sig = sig;
    const byId = new Map(list.map((x) => [x.id, x]));
    for (const b of p.body.querySelectorAll<HTMLElement>('[data-pane]')) {
      const x = byId.get(b.dataset.pane!);
      if (!x) continue;
      b.setAttribute('aria-checked', String(x.on));
      b.classList.toggle('is-on', x.on);
      b.querySelector('.wc-pc-plabel')!.textContent = x.label;
    }
    const reset = p.body.querySelector<HTMLButtonElement>('[data-set="reset"]')!;
    reset.classList.toggle('is-off', !can);
    reset.setAttribute('aria-disabled', String(!can));
  }

  private renderDisplay(p: Popup, vs: ViewerControls): void {
    const doc = this.doc;
    if (!p.body.firstChild) {
      const sub = (text: string): HTMLDivElement => {
        const d = doc.createElement('div');
        d.className = 'wc-pc-sub';
        d.textContent = text;
        return d;
      };
      const seg = doc.createElement('div');
      seg.className = 'wc-pc-seg';
      seg.setAttribute('role', 'radiogroup');
      seg.setAttribute('aria-label', 'Font size');
      for (const [id, label] of FONT_CHOICES) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'wc-pc-sg';
        b.dataset.font = id;
        b.setAttribute('role', 'radio');
        b.textContent = label;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          vs.setFont(id);
          this.schedule();
        });
        seg.append(b);
      }
      const sws = doc.createElement('div');
      sws.className = 'wc-pc-sws';
      sws.setAttribute('role', 'radiogroup');
      sws.setAttribute('aria-label', 'Colours');
      for (const [id, label] of THEME_CHOICES) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'wc-pc-sw';
        b.dataset.theme = id;
        b.setAttribute('role', 'radio');
        const d = doc.createElement('span');
        d.className = 'wc-pc-swd';
        b.append(d, label);
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          vs.setTheme(id);
          this.schedule();
        });
        sws.append(b);
      }
      p.body.replaceChildren(sub('Font size'), seg, sub('Colours'), sws);
      p.sig = '';
    }
    const sig = `${vs.font()}|${vs.theme()}|${vs.swatch('default')}`;
    if (sig === p.sig) return;
    p.sig = sig;
    for (const b of p.body.querySelectorAll<HTMLElement>('[data-font]')) {
      const on = b.dataset.font === vs.font();
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    }
    for (const b of p.body.querySelectorAll<HTMLElement>('[data-theme]')) {
      const on = b.dataset.theme === vs.theme();
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
      b.querySelector<HTMLElement>('.wc-pc-swd')!.style.background = vs.swatch(b.dataset.theme as ViewerTheme);
    }
  }

  private markEl(m: MarkRow, top: number): HTMLDivElement {
    const d = this.doc.createElement('div');
    d.className = 'wc-player-mark';
    d.style.top = `${Math.round(top)}px`;
    d.dataset.offset = String(m.offset);
    d.dataset.kinds = m.letters.join('');
    d.dataset.tip = m.tips.join('\n');
    d.setAttribute('role', 'button');
    d.setAttribute('aria-label', m.tips.join('; '));
    for (const l of m.letters) d.append(kindIcon(this.doc, LETTER_KIND[l], 'wc-player-mark-ic'));
    return d;
  }

  // ------------------------------------------------------------ show/hide

  private readonly onActivity = (): void => {
    this.quiet = false;
    this.touch();
  };

  /** Shows the chrome and re-arms the auto-hide (in play, no popup open). */
  touch(): void {
    this.show();
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    if (this.o.bare || !this.o.engine.playing || this.openPop) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      if (this.o.engine.playing && !this.drag && !this.openPop) this.setShown(false);
    }, this.o.hideMs ?? HIDE_MS);
  }

  private show(): void {
    this.setShown(true);
  }

  private setShown(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.el.toggleAttribute('data-hidden', !on);
  }

  // ----------------------------------------------------------------- keys

  /** The root is in the page and no ancestor hides it (`hidden`, inline `display: none`); no layout read. */
  private rootShown(): boolean {
    const root = this.o.root;
    if (!root.isConnected) return false;
    for (let el: HTMLElement | null = root; el; el = el.parentElement) if (el.hidden || el.style.display === 'none') return false;
    return true;
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.isComposing) return;
    // Parked out of sight (an embedded player under its page): the keys are the page's.
    if (!this.rootShown()) return;
    // A popup's keys are its own (the box's popups, the Spotlights card).
    if ((e.target as Element | null)?.closest?.(`[${OWN_KEYS_ATTR}]`)) return;
    // The player owns the keyboard (see the file header).
    e.stopPropagation();
    this.quiet = false;
    this.touch();
    // Esc closes an open popup before anything else.
    if (e.key === 'Escape' && this.openPop && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      this.setPopup(null);
      return;
    }
    if (this.o.keys?.(e)) {
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const eng = this.o.engine;
    let handled = true;
    switch (e.key) {
      case 'Escape':
        this.o.onEsc();
        break;
      case ' ':
        this.toggle();
        break;
      case 'ArrowLeft':
        this.skip(-SKIP_MS);
        break;
      case 'ArrowRight':
        this.skip(SKIP_MS);
        break;
      case 'Home':
        this.seekTo(0);
        break;
      case 'ArrowUp':
        this.moveCursor(-1);
        break;
      case 'ArrowDown':
        this.moveCursor(1);
        break;
      case 'PageUp':
        this.moveCursor(-PAGE_STEP);
        break;
      case 'PageDown':
        this.moveCursor(PAGE_STEP);
        break;
      case 'End':
        this.moveCursor(Infinity);
        break;
      default: {
        const n = e.key.length === 1 ? e.key.charCodeAt(0) - 49 : -1;
        if (n >= 0 && n < SPEEDS.length) eng.setSpeed(SPEEDS[n]!);
        else handled = false;
      }
    }
    if (handled) e.preventDefault();
  };

  // --------------------------------------------------------------- cursor

  private rowsEl(): HTMLElement | null {
    return this.o.output()?.el.querySelector<HTMLElement>('.wc-rows') ?? null;
  }

  private lastRow(): HTMLElement | null {
    return (this.rowsEl()?.lastElementChild?.lastElementChild as HTMLElement | null) ?? null;
  }

  private cursorToEnd(): void {
    this.setCursor(this.lastRow(), false);
  }

  private clearCursor(): void {
    this.cursor?.classList.remove('wc-player-cursor');
    this.cursor = null;
    this.cursorMoved = false;
  }

  private setCursor(row: HTMLElement | null, moved: boolean): void {
    this.cursor?.classList.remove('wc-player-cursor');
    this.cursor = row;
    if (!row) return;
    row.classList.add('wc-player-cursor');
    if (moved) {
      this.cursorMoved = true;
      row.scrollIntoView({ block: 'nearest' });
    }
  }

  /** Moves the cursor `n` lines (±Infinity: first / last); pauses first. */
  moveCursor(n: number): void {
    const eng = this.o.engine;
    if (eng.playing) {
      eng.pause();
      this.o.output()?.flush();
      this.cursorToEnd();
    }
    const from = this.cursor && this.cursor.isConnected ? this.cursor : this.lastRow();
    if (!from) return;
    let row: HTMLElement = from;
    if (n === -Infinity) {
      row = (this.rowsEl()?.firstElementChild?.firstElementChild as HTMLElement | null) ?? row;
      // Blank rows (a spotlight's transition) are skipped.
      if (isBlank(row)) row = step(row, 1) ?? row;
    } else if (n === Infinity) row = this.lastRow() ?? row;
    else {
      for (let i = 0; i < Math.abs(n); i++) {
        const r = step(row, n < 0 ? -1 : 1);
        if (!r) break;
        row = r;
      }
    }
    this.setCursor(row, true);
  }

  private readonly onWheel = (e: WheelEvent): void => {
    if (this.railEl.contains(e.target as Node)) return;
    // A side pane scrolls itself natively (Comm, UI, Timers; ADR 0052): the
    // wheel keeps its default there. Only the game text moves the cursor.
    if ((e.target as Element | null)?.closest?.('.wc-pane')) return void this.touch();
    // The Spotlights card's character list scrolls itself.
    if ((e.target as Element | null)?.closest?.(`[${OWN_KEYS_ATTR}]`)) return void this.touch();
    e.preventDefault();
    this.touch();
    if (this.o.engine.playing || e.deltaY === 0) return;
    this.moveCursor(e.deltaY < 0 ? -1 : 1);
  };

  /** The box keeps the wheel (no page scroll, no cursor move); its popups scroll themselves. */
  private readonly onBoxWheel = (e: WheelEvent): void => {
    e.stopPropagation();
    this.touch();
    if (!(e.target as Element | null)?.closest?.('.wc-pc-pop')) e.preventDefault();
  };

  private readonly onStageClick = (e: MouseEvent): void => {
    if (this.o.engine.playing) return;
    const t = e.target as Element | null;
    const rows = this.rowsEl();
    const row = t?.closest?.('.wc-row') as HTMLElement | null;
    if (row && rows?.contains(row) && !isBlank(row)) this.setCursor(row, true);
  };

  // ----------------------------------------------------------------- rail

  private offsetAt(clientY: number): number {
    const r = this.railEl.getBoundingClientRect();
    return yToOffset(clientY - r.top, r.height, RAIL_PAD, this.o.engine.duration);
  }

  private readonly onRailDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    this.railEl.setPointerCapture?.(e.pointerId);
    this.drag = { id: e.pointerId, offset: this.offsetAt(e.clientY) };
    this.showHint(e.clientY);
    this.render();
  };

  private readonly onRailMove = (e: PointerEvent): void => {
    if (!this.drag) {
      if (this.o.railHoverTime) this.showHint(e.clientY, this.offsetAt(e.clientY));
      return;
    }
    if (e.pointerId !== this.drag.id) return;
    this.drag.offset = this.offsetAt(e.clientY);
    this.showHint(e.clientY);
    this.schedule();
  };

  private readonly onRailLeave = (): void => {
    if (!this.drag) this.hintEl.hidden = true;
  };

  private readonly onRailUp = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const offset = this.offsetAt(e.clientY);
    this.drag = null;
    this.hintEl.hidden = true;
    this.clearCursor();
    this.o.engine.seek(offset);
    this.touch();
    this.schedule();
  };

  private readonly onRailCancel = (): void => {
    this.drag = null;
    this.hintEl.hidden = true;
    this.schedule();
  };

  private showHint(clientY: number, offset = this.drag?.offset ?? 0): void {
    const root = this.o.root.getBoundingClientRect();
    this.hintEl.textContent = this.clock(offset);
    this.hintEl.style.top = `${Math.round(clientY - root.top)}px`;
    this.hintEl.hidden = false;
  }

  /**
   * Hover tip of a marker: one line per event, right-aligned left of the
   * marker, from its top down (kept inside the player).
   */
  private readonly onMarkOver = (e: PointerEvent): void => {
    const m = (e.target as Element | null)?.closest?.('.wc-player-mark') as HTMLElement | null;
    if (!m?.dataset.tip) return;
    const lines = m.dataset.tip.split('\n');
    this.tipEl.replaceChildren(
      ...lines.map((l) => {
        const r = this.doc.createElement('div');
        r.textContent = l;
        return r;
      }),
    );
    this.tipEl.hidden = false;
    const H = this.o.root.clientHeight;
    const top = m.offsetTop - m.offsetHeight / 2;
    this.tipEl.style.top = `${Math.max(0, Math.min(top, H - this.tipEl.offsetHeight))}px`;
    this.tipEl.style.right = `${RAIL_W + m.offsetWidth + 6}px`;
  };

  private readonly onMarkOut = (e: PointerEvent): void => {
    const to = (e.relatedTarget as Element | null)?.closest?.('.wc-player-mark');
    if (to && to === (e.target as Element | null)?.closest?.('.wc-player-mark')) return;
    this.tipEl.hidden = true;
  };

  private readonly onMarkClick = (e: MouseEvent): void => {
    const m = (e.target as Element | null)?.closest?.('.wc-player-mark') as HTMLElement | null;
    if (!m) return;
    e.stopPropagation();
    this.clearCursor();
    this.o.engine.seek(Number(m.dataset.offset));
    this.touch();
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const u of this.unsubs.splice(0)) u();
    this.win.removeEventListener('keydown', this.onKey, true);
    const root = this.o.root;
    root.removeEventListener('pointermove', this.onActivity);
    root.removeEventListener('pointerdown', this.onActivity);
    root.removeEventListener('wheel', this.onWheel);
    root.removeEventListener('click', this.onStageClick);
    this.boxEl.removeEventListener('wheel', this.onBoxWheel);
    this.ro?.disconnect();
    if (this.raf !== null) this.win.cancelAnimationFrame(this.raf);
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.el.remove();
  }
}

function isBlank(row: HTMLElement): boolean {
  return row.classList.contains('wc-blank');
}

/** The next non-blank row in direction `dir` (±1), or null. */
function step(row: HTMLElement, dir: number): HTMLElement | null {
  let r: HTMLElement | null = row;
  do r = dir < 0 ? prevRow(r) : nextRow(r);
  while (r && isBlank(r));
  return r;
}

/** The row before `row` in the output (across chunks), or null. */
export function prevRow(row: HTMLElement): HTMLElement | null {
  const p = row.previousElementSibling as HTMLElement | null;
  if (p) return p;
  const chunk = row.parentElement?.previousElementSibling;
  return (chunk?.lastElementChild as HTMLElement | null) ?? null;
}

/** The row after `row` in the output (across chunks), or null. */
export function nextRow(row: HTMLElement): HTMLElement | null {
  const n = row.nextElementSibling as HTMLElement | null;
  if (n) return n;
  const chunk = row.parentElement?.nextElementSibling;
  return (chunk?.firstElementChild as HTMLElement | null) ?? null;
}
