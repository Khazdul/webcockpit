// Output pane: the hot path from bus lines to painted DOM (spec §1.3, §2.2,
// Inv §1.1, ADR 0004).
//
// Batching and overflow policy
// ----------------------------
// - Bus events only enqueue. One flush per animation frame builds the rows
//   and appends them with one fragment per touched chunk, so a burst paints
//   atomically.
// - Only the last `scrollback` rows can ever be seen, so queued rows beyond
//   that are dropped before any DOM work (at enqueue when the queue grows
//   past 2 × scrollback, and again at flush). A 1 MB burst therefore costs
//   at most `scrollback` row builds, not one per received line.
// - A flush builds at most MAX_ROWS_PER_FRAME rows; the rest carries over to
//   the next frame. Normal bursts (score, eq, a combat round: tens of lines)
//   still land in one frame; only huge bursts are spread over several frames,
//   which keeps every frame well under the 50 ms budget.
// - Rows live in chunk elements (`.wc-rows > .wc-chunk > .wc-row`) of up to
//   CHUNK_ROWS rows. Chunks use `contain: content`, so a change inside one
//   does not re-lay out the others, and the scroller holds ~100 boxes, not
//   20 000.
// - Scrollback: the pane keeps at least `scrollback` rows and fewer than
//   `scrollback` + one chunk. Old rows go a whole chunk at a time, once the
//   remaining chunks still hold `scrollback` rows. Removing rows at the top
//   moves every box below; the stage-1 benchmark measured 3.8 → 21 ms per
//   50-line flush in Chromium at 20 000 flat rows trimmed per flush, and
//   ~2.5 → ~5 ms with chunks trimmed row by row.
// - Chunks are `content-visibility: auto` (ADR 0045): the browser lays out
//   and paints only those near the view, so a width change re-wraps a few
//   chunks instead of 20 000 rows. An off-screen chunk keeps the height it
//   last had, or an estimate from its rows until it has been rendered.
// - At the tail every flush (and every later change of the rows' height)
//   pins the view to the bottom. Scrolled back, the pane keeps one row in
//   place itself (see "anchoring"), through trims, chunks taking their real
//   height and width changes.
//
// Game text only ever reaches the DOM through textContent / text nodes.
//
// The pane shows the script engine's display copies (`text.display`,
// `text.displayPartial`; ADR 0015), not the raw `text.line` stream.

import type { Bus } from '../core/bus';
import type { BusEvents, Color, Line, StyleRun } from '../core/types';
import { PLAYING_COMMANDS } from '../net/session';
import { colorToCss, effectiveFg } from './palette';

/**
 * At most this many rows are built per animation frame (owner decision
 * 2026-09-30, ADR 0044). At pixel ratio 2 a catch-up frame after a hidden
 * tab took 14–38 ms at 1000 rows and 7–15 ms at 500; the newest line of a
 * 5000-line backlog shows ~80 ms later in exchange.
 */
export const MAX_ROWS_PER_FRAME = 500;

/**
 * Rows are grouped into chunk elements of up to this many rows (fewer for a
 * small scrollback: scrollback / 100, at least 1). See the file header.
 */
export const CHUNK_ROWS = 200;

/** The chunk size for a scrollback of `rows`. */
function chunkRowsFor(rows: number): number {
  return Math.max(1, Math.min(CHUNK_ROWS, Math.floor(rows / 100)));
}

/** Default scrollback depth in rows (spec §1.3). */
export const DEFAULT_SCROLLBACK = 20000;

const OP_LINE = 0;
const OP_SYS = 1;
const OP_ECHO = 2;
/** Echo typed at a partial prompt: attaches to the line that completed it. */
const OP_ECHO_ATTACH = 3;
/** A player comment row (stage 7): `text` shown in the comment colour. */
const OP_COMMENT = 4;
/** A player blank row (stage 7 spotlight transition). */
const OP_BLANK = 5;
/** A client row with classed spans (`#help`, ADR 0037). */
const OP_STYLED = 6;

/**
 * A client row that is not game text: `cls` on the row, and text segments
 * with an optional class each (colours come from the style sheet, so they
 * follow the theme).
 */
export interface StyledRow {
  cls: string;
  segs: ReadonlyArray<{
    text: string;
    cls?: string;
    /** A game style for the segment (the colour a `#highlight` gives), instead of `cls`. */
    run?: Omit<StyleRun, 'start' | 'end'>;
  }>;
}

interface Op {
  kind: number;
  line: Line | null;
  text: string;
  /** Row stamp for OP_COMMENT (µs), else 0. */
  ts?: number;
  /** The row of an OP_STYLED. */
  styled?: StyledRow;
}

export interface OutputPaneOptions {
  /** Maximum rows kept (default 20 000). */
  scrollback?: number;
  /** Called when the pane wants the input focused (after click/select). */
  onFocusInput?: () => void;
  /** Called with the size in cells whenever it changes (for NAWS). */
  onResize?: (cols: number, rows: number) => void;
  /** Frame scheduler; injectable for tests. */
  requestFrame?: (cb: () => void) => void;
  /** Clipboard writer; injectable for tests. */
  writeClipboard?: (text: string) => Promise<void>;
  /**
   * The cell size in px (src/theme/cells.ts). Default: measured from the
   * pane's own font. Call `remeasure()` when it changes.
   */
  cellSize?: () => { w: number; h: number };
  /**
   * Stamp each game-line row with its receive time (`data-ts`, µs). The log
   * player maps its pause cursor line to a replay time with it.
   */
  stampRows?: boolean;
}

export class OutputPane {
  /** The outer element (position: relative wrapper). */
  readonly el: HTMLDivElement;
  /** The scrolling element. */
  readonly scroller: HTMLDivElement;
  private readonly rowsEl: HTMLDivElement;
  private readonly partialEl: HTMLDivElement;
  private readonly tailBar: HTMLDivElement;
  private readonly measurer: HTMLSpanElement;

  private scrollback: number;
  private chunkRows: number;
  private readonly requestFrame: (cb: () => void) => void;
  private readonly writeClipboard: (text: string) => Promise<void>;
  private readonly onFocusInput: (() => void) | undefined;
  private readonly onResize: ((cols: number, rows: number) => void) | undefined;
  private readonly cellSizeFn: (() => { w: number; h: number }) | undefined;
  private readonly stampRows: boolean;

  private queue: Op[] = [];
  private head = 0;
  private frameScheduled = false;

  private rowCount = 0;
  /** Screen lines per chunk, for its height estimate (see addChunkLines). */
  private readonly chunkLines = new WeakMap<Element, number>();
  /** The last row element (inside the last chunk), or null. */
  private lastRow: HTMLElement | null = null;

  private partial: Line | null = null;
  private partialEcho: string | null = null;
  private partialDirty = false;

  private scrolled = false;
  private newWhileScrolled = 0;
  /** Scrolled back: an element held at `top` px below the view top (see "anchoring"). */
  private anchor: { el: Element; top: number } | null = null;
  /** The scrollTop the pane itself last set while scrolled back. */
  private ownScrollTop = -1;
  private anchorRefresh = false;

  private lastCols = 0;
  private lastRows = 0;
  private readonly unsubs: Array<() => void> = [];
  private resizeObserver: ResizeObserver | null = null;

  /** Number of flushes performed (for tests and the benchmark). */
  flushCount = 0;

  constructor(bus: Bus, root: HTMLElement, opts: OutputPaneOptions = {}) {
    this.scrollback = Math.max(1, opts.scrollback ?? DEFAULT_SCROLLBACK);
    this.chunkRows = chunkRowsFor(this.scrollback);
    this.requestFrame =
      opts.requestFrame ?? ((cb) => void requestAnimationFrame(() => cb()));
    this.writeClipboard =
      opts.writeClipboard ?? ((text) => navigator.clipboard.writeText(text));
    this.onFocusInput = opts.onFocusInput;
    this.onResize = opts.onResize;
    this.cellSizeFn = opts.cellSize;
    this.stampRows = opts.stampRows ?? false;

    const doc = root.ownerDocument;
    this.el = doc.createElement('div');
    this.el.className = 'wc-output';
    this.scroller = doc.createElement('div');
    this.scroller.className = 'wc-scroller';
    this.rowsEl = doc.createElement('div');
    this.rowsEl.className = 'wc-rows';
    this.partialEl = doc.createElement('div');
    this.partialEl.className = 'wc-row wc-partial';
    this.partialEl.hidden = true;
    this.measurer = doc.createElement('span');
    this.measurer.className = 'wc-measure';
    this.measurer.setAttribute('aria-hidden', 'true');
    this.measurer.textContent = 'MMMMMMMMMM';
    this.tailBar = doc.createElement('div');
    this.tailBar.className = 'wc-tail-bar';
    this.tailBar.hidden = true;

    this.scroller.append(this.rowsEl, this.partialEl);
    this.el.append(this.scroller, this.measurer, this.tailBar);
    root.appendChild(this.el);

    this.unsubs.push(
      bus.on('text.display', (d) => this.onDisplay(d)),
      bus.on('text.displayPartial', (d) => this.onPartial(d.line)),
      bus.on('sys.message', (m) => this.push(OP_SYS, null, m.text)),
      bus.on('cmd.sent', (c) => this.onCmdSent(c)),
    );

    this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
    this.scroller.addEventListener('mouseup', this.onMouseUp);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.scroller);
      // The rows' height also changes after the flush: a chunk near the view
      // takes its real height when the browser starts rendering it (ADR
      // 0045). The observer runs before the paint, so the tail stays pinned.
      this.resizeObserver.observe(this.rowsEl);
    }
  }

  // ------------------------------------------------------------------ input

  private onDisplay(d: BusEvents['text.display']): void {
    // A #showme line is not part of the game stream: it never completes
    // the partial, it just goes above it.
    if (d.local) this.push(OP_LINE, d.line, '');
    else this.onLine(d.line);
  }

  private onLine(line: Line): void {
    // A completed line supersedes the partial (it contains its text).
    const echo = this.partial ? this.partialEcho : null;
    if (this.partial) {
      this.partial = null;
      this.partialEcho = null;
      this.partialDirty = true;
    }
    this.push(OP_LINE, line, '');
    if (echo !== null) this.push(OP_ECHO_ATTACH, null, echo);
  }

  private onPartial(line: Line): void {
    if (line.text === '') {
      if (this.partial) {
        const echo = this.partialEcho;
        this.partial = null;
        this.partialEcho = null;
        this.partialDirty = true;
        if (echo !== null) this.push(OP_ECHO, null, echo);
        else this.schedule();
      }
      return;
    }
    this.partial = line;
    this.partialDirty = true;
    this.schedule();
  }

  private onCmdSent(c: BusEvents['cmd.sent']): void {
    if (c.secret || c.echo === false || c.text === '') return;
    // A replayed log's commands are echoed as they were live (ADR 0018),
    // except the width commands sent on entering `playing`: live they are
    // sent with `echo: false`, and a log cannot tell them from typed ones.
    if (c.replay && PLAYING_COMMANDS.includes(c.text)) return;
    // An open partial (a prompt without GA, e.g. the login name prompt) gets
    // the echo; it moves onto the completed line when that arrives.
    if (this.partial && this.partialEcho === null) {
      this.partialEcho = c.text;
      this.partialDirty = true;
      this.schedule();
      return;
    }
    this.push(OP_ECHO, null, c.text);
  }

  /**
   * Player rows that are not game text (ADR 0019): comment lines
   * (`.wc-comment`, stamped with `ts` when rows are stamped) or blank rows
   * (`.wc-blank`, which the player's cursor skips). They queue with the
   * game lines, so they land in order.
   */
  pushRows(kind: 'comment' | 'blank', texts: readonly string[], ts = 0): void {
    const k = kind === 'comment' ? OP_COMMENT : OP_BLANK;
    for (const text of texts) {
      if (k === OP_COMMENT) this.queue.push({ kind: k, line: null, text, ts });
      else this.push(k, null, '');
    }
    this.schedule();
  }

  /**
   * Client rows with classed spans (`#help`, ADR 0037). They are not on the
   * bus: nothing records them and no script rule sees them. They queue with
   * the game lines, so they land in order, above an open partial.
   */
  pushStyled(rows: readonly StyledRow[]): void {
    for (const styled of rows) this.push(OP_STYLED, null, '', styled);
  }

  private push(kind: number, line: Line | null, text: string, styled?: StyledRow): void {
    this.queue.push(styled ? { kind, line, text, styled } : { kind, line, text });
    const pending = this.queue.length - this.head;
    if (pending > this.scrollback * 2) {
      // Only the newest `scrollback` rows can survive; drop the rest now so
      // memory stays bounded during a huge burst.
      this.head = this.queue.length - this.scrollback;
      this.compact();
    }
    this.schedule();
  }

  private compact(): void {
    if (this.head === 0) return;
    this.queue = this.queue.slice(this.head);
    this.head = 0;
  }

  private schedule(): void {
    if (this.frameScheduled) return;
    this.frameScheduled = true;
    this.requestFrame(() => this.flush());
  }

  // ------------------------------------------------------------------ flush

  /** Renders everything queued (up to MAX_ROWS_PER_FRAME rows). */
  flush(): void {
    this.frameScheduled = false;
    this.flushCount++;
    const doc = this.el.ownerDocument;

    const tail = this.queue.length;
    let start = this.head;
    if (tail - start > this.scrollback) start = tail - this.scrollback;
    const end = Math.min(tail, start + MAX_ROWS_PER_FRAME);

    // The width for background rows. Until the resize observer has reported
    // (the first frames after start), measure: layout is clean at this point.
    const cols = this.lastCols || (end > start ? this.measureCells().cols : 0);
    const built: HTMLElement[] = [];
    let prev = this.lastRow;
    for (let i = start; i < end; i++) {
      const op = this.queue[i]!;
      let row: HTMLElement | null;
      if (op.kind === OP_LINE) {
        row = renderLine(doc, op.line!, cols);
        if (this.stampRows) row.dataset.ts = String(op.line!.ts);
      } else if (op.kind === OP_SYS) {
        row = doc.createElement('div');
        row.className = 'wc-row wc-sys';
        row.textContent = '[SYSTEM] ' + op.text;
      } else if (op.kind === OP_COMMENT) {
        row = doc.createElement('div');
        row.className = 'wc-row wc-comment';
        row.textContent = op.text;
        if (this.stampRows && op.ts) row.dataset.ts = String(op.ts);
      } else if (op.kind === OP_BLANK) {
        row = doc.createElement('div');
        row.className = 'wc-row wc-blank';
      } else if (op.kind === OP_STYLED) {
        row = renderStyled(doc, op.styled!);
      } else if (op.kind === OP_ECHO_ATTACH) {
        row = renderEcho(doc, prev && !prev.classList.contains('wc-echoed') ? prev : null, op.text);
      } else {
        row = renderEcho(doc, isOpenPrompt(prev) ? prev : null, op.text);
      }
      if (row) {
        built.push(row);
        prev = row;
      }
    }
    this.head = end;
    if (this.head >= this.queue.length) {
      this.queue.length = 0;
      this.head = 0;
    } else if (this.head > 4096) {
      this.compact();
    }

    const wasScrolled = this.scrolled;
    const added = built.length;
    if (added > 0) {
      this.appendRows(built, cols);
      this.rowCount += added;
      this.lastRow = built[added - 1]!;
      this.trimTop();
    }

    if (this.partialDirty) this.renderPartial();

    if (!wasScrolled) {
      this.scroller.scrollTop = this.scroller.scrollHeight;
    } else if (added > 0) {
      this.newWhileScrolled += added;
      this.updateTailBar();
    }

    if (this.head < this.queue.length) this.schedule();
  }

  /**
   * Appends `rows`: first into the room left in the last chunk,
   * then into new chunks. Each touched parent gets one fragment append.
   */
  private appendRows(rows: HTMLElement[], cols: number): void {
    const doc = this.el.ownerDocument;
    const size = this.chunkRows;
    let i = 0;
    const last = this.rowsEl.lastElementChild as HTMLElement | null;
    if (last) {
      const room = size - last.childElementCount;
      if (room > 0 && i < rows.length) {
        const n = Math.min(room, rows.length - i);
        const frag = doc.createDocumentFragment();
        const from = i;
        for (const stop = i + n; i < stop; i++) frag.appendChild(rows[i]!);
        last.appendChild(frag);
        this.addChunkLines(last, rows, from, i, cols);
      }
    }
    if (i >= rows.length) return;
    const chunks = doc.createDocumentFragment();
    while (i < rows.length) {
      const chunk = doc.createElement('div');
      chunk.className = 'wc-chunk';
      const from = i;
      for (const stop = Math.min(rows.length, i + size); i < stop; i++) chunk.appendChild(rows[i]!);
      this.addChunkLines(chunk, rows, from, i, cols);
      chunks.appendChild(chunk);
    }
    this.rowsEl.appendChild(chunks);
  }

  /**
   * Adds the screen lines of `rows[from, to)` to `chunk`'s height estimate
   * (ADR 0045): the height an off-screen chunk takes until it has been
   * rendered once (`contain-intrinsic-size: auto`, after which the browser
   * keeps the size it last laid out). A row takes one line per `cols`
   * characters, so the estimate is exact for rows that do not wrap or that
   * wrap inside words, and follows a cell height change by itself.
   */
  private addChunkLines(chunk: HTMLElement, rows: HTMLElement[], from: number, to: number, cols: number): void {
    let lines = this.chunkLines.get(chunk) ?? 0;
    for (let i = from; i < to; i++) {
      const len = cols > 0 ? (rows[i]!.textContent ?? '').length : 0;
      lines += len > cols ? Math.ceil(len / cols) : 1;
    }
    this.chunkLines.set(chunk, lines);
    chunk.style.setProperty('contain-intrinsic-block-size', `auto calc(var(--cell-h) * ${lines})`);
  }

  /**
   * Drops whole chunks from the top while the rest still holds at least
   * `scrollback` rows. Only whole chunks are removed: removing rows at the
   * top moves every following box, and doing that once per chunk instead
   * of once per flush keeps the cost of a full scrollback flat. While the
   * view is scrolled back, the browser's scroll anchoring keeps the rows on
   * screen in place (ADR 0045).
   */
  private trimTop(): void {
    let drop = 0;
    let chunks = 0;
    let c = this.rowsEl.firstElementChild;
    while (c && this.rowCount - drop - c.childElementCount >= this.scrollback) {
      drop += c.childElementCount;
      chunks++;
      c = c.nextElementSibling;
    }
    if (chunks === 0) return;
    for (let i = 0; i < chunks; i++) this.rowsEl.firstElementChild!.remove();
    this.rowCount -= drop;
  }

  private renderPartial(): void {
    this.partialDirty = false;
    const el = this.partialEl;
    const p = this.partial;
    if (!p) {
      el.textContent = '';
      el.hidden = true;
      return;
    }
    el.textContent = '';
    fillRow(el.ownerDocument, el, p);
    if (this.partialEcho !== null) renderEcho(el.ownerDocument, el, this.partialEcho);
    el.hidden = false;
  }

  // -------------------------------------------------------------- scrolling

  private readonly onScroll = (): void => {
    this.updateScrolled();
    // A scroll by the user (wheel, scrollbar, touch) re-anchors the view at
    // its top row; the pane's own scrolls keep the anchor they set.
    if (this.scrolled && Math.abs(this.scroller.scrollTop - this.ownScrollTop) >= 1) {
      this.setAnchor(0);
      this.refreshAnchorSoon();
    }
  };

  private updateScrolled(): void {
    const s = this.scroller;
    const atBottom = s.scrollTop + s.clientHeight >= s.scrollHeight - 2;
    if (atBottom) {
      if (this.scrolled) {
        this.scrolled = false;
        this.anchor = null;
        this.scroller.classList.remove('wc-scrolled');
        this.newWhileScrolled = 0;
        this.tailBar.hidden = true;
      }
    } else if (!this.scrolled) {
      this.scrolled = true;
      this.scroller.classList.add('wc-scrolled');
      this.newWhileScrolled = 0;
      this.updateTailBar();
      this.tailBar.hidden = false;
    }
  }

  private updateTailBar(): void {
    const n = this.newWhileScrolled;
    const what = n > 0 ? `${n} new line${n === 1 ? '' : 's'}` : 'scrolled';
    this.tailBar.textContent = `── ${what} ── PgDn / Esc to return ──`;
  }

  private pageSize(): number {
    const lh = this.cellSize().h || 18;
    return Math.max(lh, this.scroller.clientHeight - lh);
  }

  /** Scrolls up one page (keeping one row of context). */
  pageUp(): void {
    this.pageBy(-this.pageSize());
  }

  /** Scrolls down one page; leaves scroll mode when it reaches the bottom. */
  pageDown(): void {
    if (!this.scrolled) return;
    this.pageBy(this.pageSize());
  }

  /**
   * Scrolls by `dy` px. The row that stays on screen (the top row on the
   * way up, the bottom row on the way down) is the anchor: the rows the
   * step reveals may not have been laid out yet, and take their real height
   * only in the next rendering (ADR 0045).
   */
  private pageBy(dy: number): void {
    const s = this.scroller;
    // Layout that changed since the last observation is corrected first
    // (unless the user has scrolled since: then the anchor is stale).
    if (Math.abs(s.scrollTop - this.ownScrollTop) < 1) this.keepAnchor();
    // Steps faster than the frames: the last step's view was never rendered
    // (its chunks may still change height), so its anchor carries over.
    let keep = this.anchorRefresh && this.anchor?.el.isConnected ? this.anchor : null;
    if (!keep) {
      const el = this.elementAt(dy < 0 ? 0 : s.clientHeight - 1);
      keep = el ? { el, top: this.topOf(el) } : null;
    }
    const before = s.scrollTop;
    s.scrollTop = Math.max(0, before + dy);
    this.ownScrollTop = s.scrollTop;
    this.anchor = keep ? { el: keep.el, top: keep.top - (this.ownScrollTop - before) } : null;
    this.updateScrolled();
    this.refreshAnchorSoon();
  }

  // -------------------------------------------------------------- anchoring
  //
  // Scrolled back, the view keeps one row at a fixed distance from its top
  // while the layout around it changes: chunks dropped at the top, chunks
  // taking their real height as they come near the view (content-visibility,
  // ADR 0045), rows re-wrapping after a width change. The resize observer
  // sees each such change after layout and before the paint, and corrects
  // scrollTop. The browser's own scroll anchoring is off: in Firefox it does
  // not hold the view across a page step into chunks not laid out yet, nor
  // across a width change.

  /** Anchors the view at the row `y` px below its top. */
  private setAnchor(y: number): void {
    const el = this.elementAt(y);
    this.anchor = el ? { el, top: this.topOf(el) } : null;
  }

  /**
   * Two frames after a scroll, when the browser has rendered the rows now
   * in view, moves the anchor to the row at the top. A step's anchor ends
   * up at the other edge or, after steps faster than the frames, outside the
   * view, where the browser soon stops laying out its chunk.
   */
  private refreshAnchorSoon(): void {
    if (this.anchorRefresh) return;
    this.anchorRefresh = true;
    this.requestFrame(() =>
      this.requestFrame(() => {
        this.anchorRefresh = false;
        if (!this.scrolled) return;
        // Layout that changed since the last observation is corrected first.
        this.keepAnchor();
        const el = this.elementAt(0);
        if (el) this.anchor = { el, top: this.topOf(el) };
      }),
    );
  }

  /** Puts the anchor back where it was (not while the pane is hidden). */
  private keepAnchor(): void {
    const a = this.anchor;
    if (!a || !a.el.isConnected || this.scroller.clientHeight === 0) return;
    const d = this.topOf(a.el) - a.top;
    if (Math.abs(d) < 0.5) return;
    this.scroller.scrollTop += d;
    this.ownScrollTop = this.scroller.scrollTop;
  }

  /** The top of `el` relative to the top of the view (px). */
  private topOf(el: Element): number {
    return el.getBoundingClientRect().top - this.scroller.getBoundingClientRect().top;
  }

  /**
   * The row `y` px below the top of the view (null when there is none, or
   * the pane is hidden). A row in a chunk the browser skips is laid out for
   * the query, so its place within the chunk is real before the chunk is
   * rendered.
   */
  private elementAt(y: number): HTMLElement | null {
    if (this.scroller.clientHeight === 0) return null;
    const at = this.scroller.getBoundingClientRect().top + y;
    const chunk = findAt(this.rowsEl.children, at);
    return chunk ? findAt(chunk.children, at) : null;
  }

  /** Returns to the live tail. */
  toTail(): void {
    this.scroller.scrollTop = this.scroller.scrollHeight;
    this.anchor = null;
    this.scrolled = false;
    this.scroller.classList.remove('wc-scrolled');
    this.newWhileScrolled = 0;
    this.tailBar.hidden = true;
  }

  /** True while the view is scrolled away from the live tail. */
  isScrolled(): boolean {
    return this.scrolled;
  }

  // ------------------------------------------------------ selection / focus

  private readonly onMouseUp = (): void => {
    const sel = this.el.ownerDocument.getSelection();
    const text = sel && !sel.isCollapsed ? sel.toString() : '';
    if (text && sel && this.el.contains(sel.anchorNode)) {
      this.writeClipboard(text).catch(() => {
        /* clipboard denied: the selection stays for manual copy */
      });
    }
    this.onFocusInput?.();
  };

  // ------------------------------------------------------------------ cells

  private cellSize(): { w: number; h: number } {
    if (this.cellSizeFn) return this.cellSizeFn();
    const r = this.measurer.getBoundingClientRect();
    return { w: r.width / 10, h: r.height };
  }

  /** Re-measures after a font or cell size change; reports a new size (NAWS). */
  remeasure(): void {
    this.handleResize();
  }

  /** The pane size in character cells (0×0 when not laid out). */
  measureCells(): { cols: number; rows: number } {
    const { w, h } = this.cellSize();
    if (!(w > 0) || !(h > 0)) return { cols: 0, rows: 0 };
    return {
      cols: Math.floor(this.scroller.clientWidth / w),
      rows: Math.floor(this.scroller.clientHeight / h),
    };
  }

  private handleResize(): void {
    if (!this.scrolled) this.scroller.scrollTop = this.scroller.scrollHeight;
    else this.keepAnchor();
    const { cols, rows } = this.measureCells();
    if (cols <= 0 || rows <= 0) return;
    if (cols === this.lastCols && rows === this.lastRows) return;
    this.lastCols = cols;
    this.lastRows = rows;
    this.onResize?.(cols, rows);
  }

  /** True while no row is shown or queued. */
  get empty(): boolean {
    return this.rowCount === 0 && this.queue.length === this.head;
  }

  /** Current number of rows in the scrollback (for tests and diagnostics). */
  get rows(): number {
    return this.rowCount;
  }

  /**
   * Changes the scrollback depth (Options, ADR 0046). A lower depth drops
   * the oldest chunks at once; new chunks take the size for the new depth.
   */
  setScrollback(rows: number): void {
    const n = Math.max(1, rows);
    if (n === this.scrollback) return;
    this.scrollback = n;
    this.chunkRows = chunkRowsFor(n);
    this.trimTop();
    if (!this.scrolled) this.scroller.scrollTop = this.scroller.scrollHeight;
  }

  /** Unsubscribes and removes the pane from the DOM. */
  dispose(): void {
    for (const u of this.unsubs) u();
    this.resizeObserver?.disconnect();
    this.scroller.removeEventListener('scroll', this.onScroll);
    this.scroller.removeEventListener('mouseup', this.onMouseUp);
    this.el.remove();
  }
}

/**
 * The element of `list` (stacked top to bottom) whose box holds the
 * viewport y `at`; the nearest one when `at` falls outside them all.
 */
function findAt(list: HTMLCollection, at: number): HTMLElement | null {
  let lo = 0;
  let hi = list.length - 1;
  if (hi < 0) return null;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.getBoundingClientRect().bottom <= at) lo = mid + 1;
    else hi = mid;
  }
  return list[lo] as HTMLElement;
}

// ---------------------------------------------------------------- rendering

function isOpenPrompt(row: HTMLElement | null): row is HTMLElement {
  return (
    row !== null && row.classList.contains('wc-prompt') && !row.classList.contains('wc-echoed')
  );
}

/**
 * The command echo form (Inv §1.1, tt++ style). Checked against a live
 * session in stage 1 — change the form here only.
 *
 * - With `prompt` (an un-echoed prompt row): the command is appended to it
 *   in default colour, separated by one space unless the prompt already
 *   ends in whitespace. Returns null (no new row).
 * - Without: returns a new row holding just the command.
 */
export function renderEcho(doc: Document, prompt: HTMLElement | null, text: string): HTMLElement | null {
  const span = doc.createElement('span');
  span.className = 'wc-echo';
  if (prompt) {
    const t = prompt.textContent ?? '';
    span.textContent = t === '' || /\s$/.test(t) ? text : ' ' + text;
    prompt.appendChild(span);
    prompt.classList.add('wc-echoed');
    return null;
  }
  const row = doc.createElement('div');
  row.className = 'wc-row';
  span.textContent = text;
  row.appendChild(span);
  return row;
}

/** Builds one row element for a client row with classed spans. */
export function renderStyled(doc: Document, r: StyledRow): HTMLElement {
  const row = doc.createElement('div');
  row.className = r.cls ? 'wc-row ' + r.cls : 'wc-row';
  for (const s of r.segs) {
    if (!s.cls && !s.run) {
      row.appendChild(doc.createTextNode(s.text));
      continue;
    }
    const span = doc.createElement('span');
    if (s.run) styleSpan(span, { ...s.run, start: 0, end: s.text.length });
    else span.className = s.cls!;
    span.textContent = s.text;
    row.appendChild(span);
  }
  return row;
}

/**
 * Builds one row element for a game line. `cols` is the pane width in
 * cells (0 = unknown); a line that fits may become a background row.
 */
export function renderLine(doc: Document, line: Line, cols = 0): HTMLElement {
  const row = doc.createElement('div');
  row.className = line.prompt ? 'wc-row wc-prompt' : 'wc-row';
  if (!(cols > 0 && fillBackgroundRow(doc, row, line, cols))) fillRow(doc, row, line);
  return row;
}

/** A line needs at least this many background runs to become a background row. */
export const BG_ROW_MIN_RUNS = 4;

/** True when every character of `text` takes exactly one cell. */
function oneCellText(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    // ASCII, Latin-1, Latin Extended-A/B, box drawing and block elements.
    if (!((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0x24f) || (c >= 0x2500 && c <= 0x259f))) return false;
  }
  return true;
}

/** A background colour as CSS (palette 0–15 through the theme's custom properties). */
function bgCss(c: Color): string {
  return c < 16 ? `var(--ansi-${c})` : colorToCss(c);
}

/** A colour stop position: `k` of `n` cells, as a percentage. */
function stopAt(k: number, n: number): string {
  return Math.round((k / n) * 1e6) / 1e4 + '%';
}

/**
 * Background rows (ADR 0044 rule 5; performance review #3). A span per
 * style run costs an element to style and lay out, and two display items
 * on every later frame while the row is on screen. A colour chart such as
 * MUME's `help 24-bit colours` has ~50 runs per row that differ only in
 * background: ~2 400 spans on one page.
 *
 * Such a line (at least BG_ROW_MIN_RUNS background runs, the same flags
 * throughout, no inverse, one-cell characters, not wider than the pane)
 * gets one span whose backgrounds are a single hard-stop gradient on the
 * cell grid. Its text is text nodes in that span's foreground, with a
 * nested span only where the foreground differs (merged across background
 * changes). The stops are percentages of a `calc(var(--cell-w) * n)` wide
 * background, so they follow a font or cell size change. The span is
 * inline, as the run spans are: its background covers the same box, and
 * when a narrower pane later wraps the row, each line fragment shows its
 * own slice of the gradient (`box-decoration-break: slice`). Returns false
 * when the line does not qualify; the row is then left untouched.
 */
function fillBackgroundRow(doc: Document, row: HTMLElement, line: Line, cols: number): boolean {
  const text = line.text;
  const runs = line.runs;
  const n = text.length;
  if (runs.length < BG_ROW_MIN_RUNS || n === 0 || n > cols) return false;
  const r0 = runs[0]!;
  let bgRuns = 0;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]!;
    if (
      r.inverse ||
      !r.bold !== !r0.bold ||
      !r.italic !== !r0.italic ||
      !r.underline !== !r0.underline ||
      !r.blink !== !r0.blink
    ) {
      return false;
    }
    if (r.bg !== undefined) bgRuns++;
  }
  if (bgRuns < BG_ROW_MIN_RUNS || !oneCellText(text)) return false;

  // Background stops, and foreground segments (runs and the default-coloured
  // text between them, merged where the foreground stays the same).
  let stops = '';
  const segs: Array<{ start: number; end: number; fg: Color | undefined }> = [];
  const seg = (start: number, end: number, fg: Color | undefined): void => {
    const last = segs[segs.length - 1];
    if (last && last.fg === fg) last.end = end;
    else segs.push({ start, end, fg });
  };
  let pos = 0;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]!;
    if (r.start > pos) {
      stops += `,transparent ${stopAt(pos, n)} ${stopAt(r.start, n)}`;
      seg(pos, r.start, undefined);
    }
    const bg = r.bg === undefined ? 'transparent' : bgCss(r.bg);
    stops += `,${bg} ${stopAt(r.start, n)} ${stopAt(r.end, n)}`;
    seg(r.start, r.end, effectiveFg(r.fg, r.bold));
    pos = r.end;
  }
  if (pos < n) {
    stops += `,transparent ${stopAt(pos, n)} 100%`;
    seg(pos, n, undefined);
  }

  const box = doc.createElement('span');
  const fg = segs[0]!.fg;
  let cls = 'wc-bgrow';
  let css = '';
  if (fg !== undefined) {
    if (fg < 16) cls += ' wc-f' + fg;
    else css = `color:${colorToCss(fg)};`;
  }
  if (r0.bold) cls += ' wc-bold';
  if (r0.italic) cls += ' wc-ital';
  if (r0.underline) cls += ' wc-ul';
  if (r0.blink) cls += ' wc-blink';
  box.className = cls;
  box.style.cssText =
    `${css}background-image:linear-gradient(90deg${stops});background-size:calc(var(--cell-w) * ${n}) 100%`;
  if (segs.length === 1) {
    box.textContent = text;
  } else {
    for (const s of segs) {
      const t = text.slice(s.start, s.end);
      if (s.fg === fg) {
        box.appendChild(doc.createTextNode(t));
        continue;
      }
      const span = doc.createElement('span');
      if (s.fg === undefined) span.className = 'wc-fdef';
      else if (s.fg < 16) span.className = 'wc-f' + s.fg;
      else span.style.color = colorToCss(s.fg);
      span.textContent = t;
      box.appendChild(span);
    }
  }
  row.appendChild(box);
  return true;
}

function fillRow(doc: Document, row: HTMLElement, line: Line): void {
  const text = line.text;
  const runs = line.runs;
  if (runs.length === 0) {
    if (text !== '') row.textContent = text;
    return;
  }
  let pos = 0;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]!;
    if (r.start > pos) row.appendChild(doc.createTextNode(text.slice(pos, r.start)));
    const span = doc.createElement('span');
    styleSpan(span, r);
    span.textContent = text.slice(r.start, r.end);
    row.appendChild(span);
    pos = r.end;
  }
  if (pos < text.length) row.appendChild(doc.createTextNode(text.slice(pos)));
}

function styleSpan(span: HTMLElement, r: StyleRun): void {
  let fg = effectiveFg(r.fg, r.bold);
  let bg = r.bg;
  let cls = '';
  if (r.inverse) {
    const t = fg;
    fg = bg;
    bg = t;
    if (fg === undefined) cls += ' wc-fd';
    if (bg === undefined) cls += ' wc-bd';
  }
  if (fg !== undefined) {
    if (fg < 16) cls += ' wc-f' + fg;
    else span.style.color = colorToCss(fg);
  }
  if (bg !== undefined) {
    if (bg < 16) cls += ' wc-b' + bg;
    else span.style.backgroundColor = colorToCss(bg);
  }
  if (r.bold) cls += ' wc-bold';
  if (r.italic) cls += ' wc-ital';
  if (r.underline) cls += ' wc-ul';
  if (r.blink) cls += ' wc-blink';
  if (cls) span.className = cls.slice(1);
}
