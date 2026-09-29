// The in-app log player chrome (Inv §7.5, ADR 0018): header, right-edge
// strip with the gold playhead, K/D/A/L markers, control box, auto-hide,
// the pause cursor line and the keys. It drives a PlayerEngine and reads
// the current player App's output pane; the engine and the timeline know
// nothing about it (the stage 7 HTML replay brings its own chrome).
//
//   .wc-player-chrome           over the whole player (pointer-events none)
//     .wc-player-header         top row: `<char> (L<lvl>) · Run X of Y · date`, key hints
//     .wc-player-marks          markers, 5 cols left of the strip
//     .wc-player-strip          right edge, 2 cols, full height
//     .wc-player-box            control box, 8 cols in from the right, 1 row up
//     .wc-player-hint           `MM:SS` beside the pointer while dragging the strip
//
// Modes. Play: the output follows the tail, the chrome hides 6 s after the
// last key or mouse move. Pause: the chrome stays, and a cursor line
// (`bg #303030`) starts on the last line; ↑/↓, PgUp/PgDn (±20), Home/End
// and the wheel move it, a click on a line sets it. Space resumes from the
// cursor line's time (a backward seek unless it is still the last line).
// Those keys pause first when playing. `1`–`6` set the speed, ESC goes
// back. While the player is open it owns the keyboard: a window capture
// listener stops every key from reaching the (hidden) input panes.
//
// Modes (stage 7, ADR 0019 "PlayerView options"). The view is configured,
// so the HTML replay and the Spotlights reel add their modes in their own
// files: the header's parts and hints come from `header` (`runHeader` is
// the in-app player's), `keys` sees every key first, `overlay` is an extra
// layer (the spotlight info box) hidden with the chrome or always shown,
// `startHidden` starts with the chrome hidden until the user moves or
// presses something, `stripHoverTime` shows `MM:SS` beside the pointer over
// the strip, `boxButtons` adds a row of buttons to the control box, and
// `onEsc` is ESC.
//
// Viewer settings (stage 8, ADR 0021): with `settings`, a gear `⚙` ends the
// control box's first row. It folds a settings section into the box, above
// the transport row:
//
//   ┌──────────────────────────────┐
//   │ Panes                        │
//   │ [X] Character  [X] Timers    │
//   │ [X] Group      [X] Comm      │
//   │ [X] UI         [ ] Map       │
//   │ Font      ◄ Default ►        │
//   │ Colours   ◄ Default ►        │
//   │ Reset layout                 │
//   ├──────────────────────────────┤
//   │ ◄◄ Rewind  ► Play    1x    ⚙ │
//   │        00:12 / 02:02         │
//   └──────────────────────────────┘
//
// The chrome auto-hides with it open as without; ESC folds it first. The
// box takes the pointer (clicks and the wheel there never reach the stage
// or move the pause cursor). The gear cell is one cell wide whatever font
// draws it (JetBrains Mono has no ⚙; DejaVu Sans Mono does).

import './player.css';
import type { OutputPane } from '../ui/output-pane';
import type { PlayerEngine } from './engine';
import {
  type HeaderHint,
  HINTS,
  HINT_SEP,
  STRIP_COLS,
  type MarkLetter,
  fitHints,
  hintsWidth,
  type MarkRow,
  fmtClock,
  fmtDateTime,
  fmtSpeed,
  markRows,
  stripCells,
  yToOffset,
} from './strip';
import { SPEEDS } from './engine';
import { playAtLogUs } from './timeline';

/** Chrome hides this long after the last activity in play, ms. */
export const HIDE_MS = 6000;
/** Cursor step of PgUp / PgDn, lines. */
export const PAGE_STEP = 20;
/** Header width in cells (centred); wider only as far as the full hint list needs. */
const HEADER_COLS = 80;
/** Least gap between the header's left part and the hints, cells. */
const HEADER_GAP = 2;
/** Control box: cells in from the right edge, rows up from the bottom. */
const BOX_RIGHT = 8;
const BOX_BOTTOM = 1;
const BOX_INNER = 30;
/** Settings section: the pane toggles' column width, and the name column of Font / Colours. */
const TOGGLE_W = 15;
const NAME_W = 10;
/** Width of a cycled value (`Default`, `Medium` …). */
const VALUE_W = 7;

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

/** A button in the control box's extra row. */
export interface BoxButton {
  label: () => string;
  onClick: () => void;
}

export interface PlayerViewOptions {
  /** The player element (fills the window; the chrome is laid over it). */
  root: HTMLElement;
  engine: PlayerEngine;
  /** The header at run `run` (called on every render; cheap). */
  header: (run: number) => PlayerHeaderModel;
  /** Markers as playback offsets (ms). */
  marks: ReadonlyArray<{ letter: MarkLetter; offset: number }>;
  /** The current player App's output pane (it changes on a rebuild). */
  output: () => OutputPane | null;
  /** The cell size in px. */
  cells: () => { w: number; h: number };
  /** ESC (in the log player: back to History). */
  onEsc: () => void;
  /** Extra keys, before the player's own; true = handled (the view then prevents the default). */
  keys?: (e: KeyboardEvent) => boolean;
  /** An extra layer over the player, hidden with the chrome unless `keepVisible`. */
  overlay?: { el: HTMLElement; keepVisible?: boolean };
  /** Start with the chrome hidden; the first key or pointer move shows it. */
  startHidden?: boolean;
  /** `MM:SS` beside the pointer while it hovers over the strip. */
  stripHoverTime?: boolean;
  /** Buttons of an extra control box row (above the clock). */
  boxButtons?: BoxButton[];
  /** The gear and its settings section (ADR 0021). */
  settings?: ViewerControls;
  /** Auto-hide delay (tests). */
  hideMs?: number;
}

/** The viewer settings the control box's gear shows (PlayerHost implements it). */
export interface ViewerControls {
  panes: () => ReadonlyArray<{ id: string; label: string; on: boolean }>;
  togglePane: (id: string) => void;
  /** Current font / theme choice, as shown. */
  font: () => string;
  cycleFont: (dir: 1 | -1) => void;
  theme: () => string;
  cycleTheme: (dir: 1 | -1) => void;
  /** Something to reset (the reset button is dim otherwise). */
  canReset: () => boolean;
  reset: () => void;
}

type Act = 'rewind' | 'play' | 'speed' | 'settings';

export class PlayerView {
  readonly el: HTMLDivElement;
  private readonly o: PlayerViewOptions;
  private readonly doc: Document;
  private readonly win: Window;
  private readonly headerEl: HTMLDivElement;
  private readonly headLeft: HTMLSpanElement;
  private readonly headHints: HTMLSpanElement;
  private readonly marksEl: HTMLDivElement;
  private readonly stripEl: HTMLDivElement;
  private readonly boxEl: HTMLDivElement;
  private readonly boxPlay: HTMLSpanElement;
  private readonly boxSpeed: HTMLSpanElement;
  private readonly boxClock: HTMLDivElement;
  private readonly boxExtra: HTMLDivElement | null = null;
  private readonly boxGear: HTMLSpanElement | null = null;
  private readonly settingsEl: HTMLDivElement;
  private settingsOpen = false;
  private readonly hintEl: HTMLDivElement;
  private readonly unsubs: Array<() => void> = [];
  private readonly ro: ResizeObserver | null = null;
  private raf: number | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private shown = true;
  private stripSig = '';
  private marksSig = '';
  private headSig = '';
  private boxSig = '';
  /** Strip drag: pointer id and the previewed offset. */
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
    const div = (cls: string): HTMLDivElement => {
      const d = this.doc.createElement('div');
      d.className = cls;
      return d;
    };
    this.el = div('wc-player-chrome');
    this.headerEl = div('wc-player-header');
    this.headLeft = this.doc.createElement('span');
    this.headLeft.className = 'wc-player-head-left';
    this.headHints = this.doc.createElement('span');
    this.headHints.className = 'wc-player-hints';
    this.headerEl.append(this.headLeft, this.headHints);
    this.marksEl = div('wc-player-marks');
    this.stripEl = div('wc-player-strip');
    this.boxEl = div('wc-player-box');
    const row1 = div('wc-player-box-row');
    const rewind = this.button('rewind', '◄◄ Rewind');
    this.boxPlay = this.button('play', '');
    this.boxSpeed = this.button('speed', '');
    if (opts.settings) {
      this.boxGear = this.button('settings', '⚙');
      this.boxGear.classList.add('wc-player-gear');
      this.boxGear.title = 'Viewer settings';
      row1.append('│ ', rewind, '  ', this.boxPlay, '  ', this.boxSpeed, ' ', this.boxGear, ' │');
    } else row1.append('│ ', rewind, '  ', this.boxPlay, '  ', this.boxSpeed, '   │');
    this.settingsEl = div('wc-player-settings');
    this.settingsEl.hidden = true;
    this.boxClock = div('wc-player-box-row wc-player-clock');
    const top = div('wc-player-box-frame');
    top.textContent = '┌' + '─'.repeat(BOX_INNER) + '┐';
    const bottom = div('wc-player-box-frame');
    bottom.textContent = '└' + '─'.repeat(BOX_INNER) + '┘';
    if (opts.boxButtons?.length) {
      this.boxExtra = div('wc-player-box-row');
      this.boxEl.append(top, this.settingsEl, row1, this.boxExtra, this.boxClock, bottom);
    } else this.boxEl.append(top, this.settingsEl, row1, this.boxClock, bottom);
    this.boxEl.addEventListener('wheel', this.onBoxWheel, { passive: false });
    this.hintEl = div('wc-player-hint');
    this.hintEl.hidden = true;
    this.el.append(this.headerEl, this.marksEl, this.stripEl, this.boxEl, this.hintEl);
    opts.root.appendChild(this.el);
    if (opts.overlay) opts.root.appendChild(opts.overlay.el);
    this.quiet = opts.startHidden ?? false;

    this.wasPlaying = opts.engine.playing;
    this.unsubs.push(opts.engine.subscribe((c) => this.onEngine(c)));
    this.win.addEventListener('keydown', this.onKey, true);
    opts.root.addEventListener('pointermove', this.onActivity);
    opts.root.addEventListener('pointerdown', this.onActivity);
    opts.root.addEventListener('wheel', this.onWheel, { passive: false });
    opts.root.addEventListener('click', this.onStageClick);
    this.stripEl.addEventListener('pointerdown', this.onStripDown);
    this.stripEl.addEventListener('pointermove', this.onStripMove);
    this.stripEl.addEventListener('pointerup', this.onStripUp);
    this.stripEl.addEventListener('pointercancel', this.onStripCancel);
    this.stripEl.addEventListener('pointerleave', this.onStripLeave);
    this.marksEl.addEventListener('click', this.onMarkClick);
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.schedule());
      this.ro.observe(opts.root);
    }
    if (this.quiet) this.setShown(false);
    else this.touch();
    this.render();
  }

  /** Redraws on the next frame (a header that changed outside the engine's events). */
  refresh(): void {
    this.schedule();
  }

  private button(act: Act, text: string): HTMLSpanElement {
    const b = this.doc.createElement('span');
    b.className = 'wc-player-btn';
    b.dataset.act = act;
    b.textContent = text;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.touch();
      this.act(act);
    });
    return b;
  }

  private act(a: Act): void {
    const eng = this.o.engine;
    if (a === 'rewind') eng.seek(0);
    else if (a === 'play') this.toggle();
    else if (a === 'settings') this.setSettingsOpen(!this.settingsOpen);
    else {
      const i = SPEEDS.indexOf(eng.speed);
      eng.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]!);
    }
  }

  /** True while the chrome is shown (tests). */
  get chromeShown(): boolean {
    return this.shown;
  }

  /** True while the settings section is folded out. */
  get settingsShown(): boolean {
    return this.settingsOpen;
  }

  /** Folds the settings section in or out (the gear). */
  setSettingsOpen(on: boolean): void {
    if (!this.o.settings || on === this.settingsOpen) return;
    this.settingsOpen = on;
    this.settingsEl.hidden = !on;
    this.boxGear?.classList.toggle('is-on', on);
    this.boxEl.toggleAttribute('data-settings', on);
    this.boxSig = '';
    this.touch();
    this.schedule();
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
    const cols = Math.max(1, Math.floor(W / w));
    const rows = Math.max(2, Math.floor(H / h));
    const dur = eng.duration;
    const pos = this.drag ? this.drag.offset : eng.position;

    // Header.
    const hd = this.o.header(eng.run);
    const leftLen = hd.left.reduce((n, p) => n + p.text.length, 0) + 3 * Math.max(0, hd.left.length - 1);
    const full = hintsWidth(hd.hints.map((x) => x.text));
    const hc = Math.max(1, Math.min(Math.max(HEADER_COLS, leftLen + HEADER_GAP + full), cols - STRIP_COLS));
    const hints = fitHints(hc - leftLen - HEADER_GAP, hd.hints);
    const headSig = `${JSON.stringify(hd)}|${hc}|${w}|${W}|${hints.join()}`;
    if (headSig !== this.headSig) {
      this.headSig = headSig;
      this.headerEl.style.width = `${hc * w}px`;
      this.headerEl.style.left = `${Math.max(0, Math.floor((W - STRIP_COLS * w - hc * w) / 2))}px`;
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
    }

    // Strip.
    const stripSig = `${rows}|${h}|${dur > 0 ? Math.round((pos / dur) * (rows * 2 - 1)) : 0}`;
    if (stripSig !== this.stripSig) {
      this.stripSig = stripSig;
      const frag = this.doc.createDocumentFragment();
      for (const c of stripCells(pos, dur, rows)) {
        const r = this.doc.createElement('div');
        r.textContent = c.ch.repeat(STRIP_COLS);
        r.style.color = c.fg;
        r.style.backgroundColor = c.bg;
        frag.appendChild(r);
      }
      this.stripEl.textContent = '';
      this.stripEl.appendChild(frag);
    }

    // Markers.
    const marksSig = `${rows}|${h}|${w}`;
    if (marksSig !== this.marksSig) {
      this.marksSig = marksSig;
      this.marksEl.textContent = '';
      for (const m of markRows(this.o.marks, dur, rows)) this.marksEl.appendChild(this.markEl(m, h));
    }

    // Control box.
    const playLabel = (eng.playing ? '▌▌ Pause' : '► Play').padEnd(8);
    const clock = `${fmtClock(pos)} / ${fmtClock(dur)}`;
    const extra = this.o.boxButtons?.map((b) => b.label()) ?? [];
    const vs = this.o.settings && this.settingsOpen ? this.o.settings : null;
    const setSig = vs
      ? JSON.stringify([vs.panes(), vs.font(), vs.theme(), vs.canReset()])
      : '';
    const boxSig = `${playLabel}|${eng.speed}|${clock}|${extra.join('|')}|${setSig}`;
    if (boxSig !== this.boxSig) {
      this.boxSig = boxSig;
      if (vs) this.renderSettings(vs);
      if (this.boxExtra) {
        const text = extra.join('  ');
        const pad = Math.max(0, BOX_INNER - text.length);
        this.boxExtra.textContent = '';
        this.boxExtra.append('│' + ' '.repeat(pad >> 1));
        extra.forEach((label, i) => {
          if (i > 0) this.boxExtra!.append('  ');
          const b = this.doc.createElement('span');
          b.className = 'wc-player-btn';
          b.textContent = label;
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            this.touch();
            this.o.boxButtons![i]!.onClick();
            this.schedule();
          });
          this.boxExtra!.append(b);
        });
        this.boxExtra.append(' '.repeat(pad - (pad >> 1)) + '│');
      }
      this.boxPlay.textContent = playLabel;
      this.boxSpeed.textContent = fmtSpeed(eng.speed).padEnd(5);
      const pad = BOX_INNER - clock.length;
      this.boxClock.textContent = '│' + ' '.repeat(pad >> 1) + clock + ' '.repeat(pad - (pad >> 1)) + '│';
    }
    this.boxEl.style.right = `${BOX_RIGHT * w}px`;
    this.boxEl.style.bottom = `${BOX_BOTTOM * h}px`;
    this.el.dataset.playing = String(eng.playing);
    this.el.toggleAttribute('data-seeking', eng.seeking);
  }

  /** The settings section's rows (see the file header). */
  private renderSettings(vs: ViewerControls): void {
    const doc = this.doc;
    const rows: HTMLDivElement[] = [];
    const row = (...parts: Array<string | HTMLElement>): void => {
      const r = doc.createElement('div');
      r.className = 'wc-player-box-row';
      const len = parts.reduce((n, p) => n + (typeof p === 'string' ? p.length : (p.textContent ?? '').length), 0);
      r.append('│ ', ...parts, ' '.repeat(Math.max(0, BOX_INNER - 1 - len)) + '│');
      rows.push(r);
    };
    const btn = (text: string, cls: string, onClick: () => void, data: Record<string, string> = {}): HTMLSpanElement => {
      const b = doc.createElement('span');
      b.className = `wc-player-btn ${cls}`;
      b.textContent = text;
      Object.assign(b.dataset, data);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.touch();
        onClick();
        this.schedule();
      });
      return b;
    };
    const label = (text: string, cls: string): HTMLSpanElement => {
      const l = doc.createElement('span');
      l.className = cls;
      l.textContent = text;
      return l;
    };
    row(label('Panes', 'wc-player-set-head'));
    const panes = vs.panes();
    for (let i = 0; i < panes.length; i += 2) {
      const parts: Array<string | HTMLElement> = [];
      panes.slice(i, i + 2).forEach((p, j) => {
        const text = `[${p.on ? 'X' : ' '}] ${p.label}`;
        const b = btn(text, `wc-player-toggle${p.on ? ' is-on' : ''}`, () => vs.togglePane(p.id), { pane: p.id });
        parts.push(b);
        if (j === 0) parts.push(' '.repeat(Math.max(1, TOGGLE_W - text.length)));
      });
      row(...parts);
    }
    const cycler = (name: string, key: string, value: string, step: (dir: 1 | -1) => void): void =>
      row(
        label(name.padEnd(NAME_W), 'wc-player-set-head'),
        btn('◄', 'wc-player-step', () => step(-1), { set: key, dir: '-1' }),
        btn(` ${value.padEnd(VALUE_W)} `, 'wc-player-value', () => step(1), { set: key, value }),
        btn('►', 'wc-player-step', () => step(1), { set: key, dir: '1' }),
      );
    cycler('Font', 'font', vs.font(), vs.cycleFont);
    cycler('Colours', 'theme', vs.theme(), vs.cycleTheme);
    const can = vs.canReset();
    row(btn('Reset layout', `wc-player-reset${can ? '' : ' is-off'}`, () => can && vs.reset(), { set: 'reset' }));
    const sep = doc.createElement('div');
    sep.className = 'wc-player-box-row wc-player-box-frame';
    sep.textContent = '├' + '─'.repeat(BOX_INNER) + '┤';
    rows.push(sep);
    this.settingsEl.replaceChildren(...rows);
  }

  private markEl(m: MarkRow, h: number): HTMLDivElement {
    const d = this.doc.createElement('div');
    d.className = 'wc-player-mark';
    d.textContent = m.text;
    d.style.top = `${m.row * h}px`;
    d.dataset.offset = String(m.offset);
    return d;
  }

  // ------------------------------------------------------------ show/hide

  private readonly onActivity = (): void => {
    this.quiet = false;
    this.touch();
  };

  /** Shows the chrome and re-arms the auto-hide (in play). */
  touch(): void {
    this.show();
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    if (!this.o.engine.playing) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      if (this.o.engine.playing && !this.drag) this.setShown(false);
    }, this.o.hideMs ?? HIDE_MS);
  }

  private show(): void {
    this.setShown(true);
  }

  private setShown(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.el.toggleAttribute('data-hidden', !on);
    const ov = this.o.overlay;
    if (ov && !ov.keepVisible) ov.el.toggleAttribute('data-hidden', !on);
  }

  // ----------------------------------------------------------------- keys

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.isComposing) return;
    // The player owns the keyboard (see the file header).
    e.stopPropagation();
    this.quiet = false;
    this.touch();
    if (this.o.keys?.(e)) {
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const eng = this.o.engine;
    let handled = true;
    switch (e.key) {
      case 'Escape':
        if (this.settingsOpen) this.setSettingsOpen(false);
        else this.o.onEsc();
        break;
      case ' ':
        this.toggle();
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
      case 'Home':
        this.moveCursor(-Infinity);
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
    if (this.stripEl.contains(e.target as Node)) return;
    e.preventDefault();
    this.touch();
    if (this.o.engine.playing || e.deltaY === 0) return;
    // A side pane scrolls itself (Comm, Timers); only the game text moves the cursor.
    if ((e.target as Element | null)?.closest?.('.wc-pane')) return;
    this.moveCursor(e.deltaY < 0 ? -1 : 1);
  };

  /** The box keeps the wheel (no page scroll, no cursor move). */
  private readonly onBoxWheel = (e: WheelEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    this.touch();
  };

  private readonly onStageClick = (e: MouseEvent): void => {
    if (this.o.engine.playing) return;
    const t = e.target as Element | null;
    const rows = this.rowsEl();
    const row = t?.closest?.('.wc-row') as HTMLElement | null;
    if (row && rows?.contains(row) && !isBlank(row)) this.setCursor(row, true);
  };

  // ---------------------------------------------------------------- strip

  private offsetAt(clientY: number): number {
    const r = this.stripEl.getBoundingClientRect();
    return yToOffset(clientY - r.top, r.height, this.o.cells().h, this.o.engine.duration);
  }

  private readonly onStripDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    this.stripEl.setPointerCapture?.(e.pointerId);
    this.drag = { id: e.pointerId, offset: this.offsetAt(e.clientY) };
    this.showHint(e.clientY);
    this.render();
  };

  private readonly onStripMove = (e: PointerEvent): void => {
    if (!this.drag) {
      if (this.o.stripHoverTime) this.showHint(e.clientY, this.offsetAt(e.clientY));
      return;
    }
    if (e.pointerId !== this.drag.id) return;
    this.drag.offset = this.offsetAt(e.clientY);
    this.showHint(e.clientY);
    this.schedule();
  };

  private readonly onStripLeave = (): void => {
    if (!this.drag) this.hintEl.hidden = true;
  };

  private readonly onStripUp = (e: PointerEvent): void => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const offset = this.offsetAt(e.clientY);
    this.drag = null;
    this.hintEl.hidden = true;
    this.clearCursor();
    this.o.engine.seek(offset);
    this.touch();
    this.schedule();
  };

  private readonly onStripCancel = (): void => {
    this.drag = null;
    this.hintEl.hidden = true;
    this.schedule();
  };

  private showHint(clientY: number, offset = this.drag?.offset ?? 0): void {
    const root = this.o.root.getBoundingClientRect();
    const { h } = this.o.cells();
    this.hintEl.textContent = ` ${fmtClock(offset)} `;
    this.hintEl.style.top = `${Math.max(0, Math.floor((clientY - root.top) / h)) * h}px`;
    this.hintEl.hidden = false;
  }

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
    this.o.overlay?.el.remove();
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
