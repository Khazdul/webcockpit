// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Bus } from '../../src/core/bus';
import { type Line, type StyleRun, rgb } from '../../src/core/types';
import { OutputPane, MAX_ROWS_PER_FRAME, renderLine } from '../../src/ui/output-pane';
import { PALETTE_256, colorToCss } from '../../src/ui/palette';
import { lines } from './text-helpers';
import { chart24Rows, chart256Rows } from '../fixtures/colour-chart';

function line(text: string, prompt = false, runs: StyleRun[] = []): Line {
  return { text, runs, tags: [], prompt, raw: text, ts: 0 };
}

function setup(scrollback = 100) {
  const bus = new Bus();
  // No script engine here: pass lines straight through the display events.
  bus.on('text.line', (l) => bus.emit('text.display', { line: l, source: l }));
  bus.on('text.partial', (l) => bus.emit('text.displayPartial', { line: l, source: l }));
  const root = document.createElement('div');
  document.body.appendChild(root);
  const frames: Array<() => void> = [];
  const focus = vi.fn();
  const clip = vi.fn(() => Promise.resolve());
  const pane = new OutputPane(bus, root, {
    scrollback,
    requestFrame: (cb) => frames.push(cb),
    onFocusInput: focus,
    writeClipboard: clip,
  });
  const runFrames = () => {
    while (frames.length) frames.shift()!();
  };
  const rows = () =>
    Array.from(pane.el.querySelectorAll('.wc-rows .wc-row')).map((r) => r.textContent);
  const partial = () => pane.el.querySelector('.wc-partial') as HTMLElement;
  return { bus, root, pane, frames, runFrames, rows, partial, focus, clip };
}

describe('OutputPane batching', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('coalesces many lines into one frame and one flush', () => {
    const t = setup();
    for (let i = 0; i < 50; i++) t.bus.emit('text.line', line('l' + i));
    expect(t.frames.length).toBe(1);
    expect(t.rows()).toEqual([]);
    t.runFrames();
    expect(t.pane.flushCount).toBe(1);
    expect(t.rows().length).toBe(50);
    expect(t.rows()[49]).toBe('l49');
  });

  it('caps the scrollback, removing from the top', () => {
    const t = setup(10);
    for (let i = 0; i < 7; i++) t.bus.emit('text.line', line('a' + i));
    t.runFrames();
    for (let i = 0; i < 7; i++) t.bus.emit('text.line', line('b' + i));
    t.runFrames();
    const r = t.rows();
    expect(r.length).toBe(10);
    expect(t.pane.rows).toBe(10);
    expect(r[0]).toBe('a4');
    expect(r[9]).toBe('b6');
  });

  it('groups rows into chunks and trims whole chunks from the top', () => {
    const t = setup(1000); // chunks of 10 rows
    for (let i = 0; i < 995; i++) t.bus.emit('text.line', line('c' + i));
    t.runFrames();
    expect(t.pane.el.querySelectorAll('.wc-rows > .wc-chunk')).toHaveLength(100);
    expect(t.pane.rows).toBe(995);
    for (let i = 995; i < 1013; i++) {
      t.bus.emit('text.line', line('c' + i));
      t.runFrames();
    }
    // 1013 rows would leave 1003 after dropping the first chunk: at least
    // `scrollback` rows are kept, fewer than scrollback + one chunk.
    const r = t.rows();
    expect(r.length).toBe(1003);
    expect(t.pane.rows).toBe(1003);
    expect(r[0]).toBe('c10');
    expect(r.at(-1)).toBe('c1012');
    for (const c of t.pane.el.querySelectorAll('.wc-chunk')) {
      expect(c.childElementCount).toBeLessThanOrEqual(10);
    }
  });

  it('drops queued lines that could never be seen', () => {
    const t = setup(10);
    for (let i = 0; i < 1000; i++) t.bus.emit('text.line', line('x' + i));
    t.runFrames();
    expect(t.pane.flushCount).toBe(1);
    expect(t.rows()).toEqual(Array.from({ length: 10 }, (_, i) => 'x' + (990 + i)));
  });

  it('spreads huge bursts over frames of at most MAX_ROWS_PER_FRAME rows', () => {
    const t = setup(20000);
    const n = MAX_ROWS_PER_FRAME * 2 + 5;
    for (let i = 0; i < n; i++) t.bus.emit('text.line', line('y' + i));
    t.frames.shift()!();
    expect(t.pane.rows).toBe(MAX_ROWS_PER_FRAME);
    t.runFrames();
    expect(t.pane.rows).toBe(n);
    expect(t.pane.flushCount).toBe(3);
  });

  it('renders sys messages with the [SYSTEM] prefix', () => {
    const t = setup();
    t.bus.emit('sys.message', { text: 'Connected.' });
    t.runFrames();
    const el = t.pane.el.querySelector('.wc-sys')!;
    expect(el.textContent).toBe('[SYSTEM] Connected.');
  });

  it('never interprets game text as HTML', () => {
    const t = setup();
    t.bus.emit('text.line', line('<b>hi</b> &amp;'));
    t.runFrames();
    expect(t.pane.el.querySelector('b')).toBeNull();
    expect(t.rows()[0]).toBe('<b>hi</b> &amp;');
  });
});

describe('OutputPane styling', () => {
  it('uses classes for 0-15, inline style for 256 and truecolor', () => {
    const t = setup();
    t.bus.emit(
      'text.line',
      line('abcdefgh', false, [
        { start: 0, end: 2, fg: 1, bold: true },
        { start: 2, end: 4, fg: 200 },
        { start: 4, end: 6, fg: rgb(1, 2, 3), bg: 12 },
      ]),
    );
    t.runFrames();
    const spans = t.pane.el.querySelectorAll('.wc-rows span');
    expect(spans.length).toBe(3);
    expect(spans[0]!.className).toBe('wc-f1 wc-bold');
    expect((spans[1] as HTMLElement).style.color).not.toBe('');
    expect(spans[2]!.className).toBe('wc-b12');
    expect(t.rows()[0]).toBe('abcdefgh');
  });

  it('handles inverse with default colours', () => {
    const t = setup();
    t.bus.emit('text.line', line('ab', false, [{ start: 0, end: 2, inverse: true }]));
    t.runFrames();
    expect(t.pane.el.querySelector('.wc-rows span')!.className).toBe('wc-fd wc-bd');
  });

  it('builds the xterm palette', () => {
    expect(PALETTE_256.length).toBe(256);
    expect(PALETTE_256[1]).toBe('#800000');
    expect(PALETTE_256[16]).toBe('#000000');
    expect(PALETTE_256[196]).toBe('#ff0000');
    expect(PALETTE_256[231]).toBe('#ffffff');
    expect(PALETTE_256[232]).toBe('#080808');
    expect(PALETTE_256[255]).toBe('#eeeeee');
    expect(colorToCss(rgb(0x12, 0x34, 0x56))).toBe('#123456');
  });
});

describe('Background rows', () => {
  // A colour chart row: every 2 cells another truecolor background, one fg.
  const chart = (n: number, fg?: number): Line => {
    const runs: StyleRun[] = [];
    for (let i = 0; i < n; i += 2) runs.push({ start: i, end: i + 2, bg: rgb(i, 0, 0), ...(fg !== undefined ? { fg } : {}) });
    return line('#'.repeat(n), false, runs);
  };
  const box = (row: HTMLElement): HTMLElement => {
    const b = row.querySelector('.wc-bgrow') as HTMLElement | null;
    expect(b, 'background row').not.toBeNull();
    return b!;
  };
  /** The gradient's stops as [colour, from %, to %]. */
  const stops = (b: HTMLElement): Array<[string, number, number]> => {
    const css = b.style.backgroundImage;
    const m = /^linear-gradient\(90deg,(.*)\)$/.exec(css);
    expect(m, css).not.toBeNull();
    return m![1]!.split(/,(?![^(]*\))/).map((s) => {
      const [c, a, z] = s.trim().split(/\s+(?![^(]*\))/);
      return [c!, parseFloat(a!), parseFloat(z!)];
    });
  };

  it('draws a line of background runs as one span with a gradient on the cell grid', () => {
    const row = renderLine(document, chart(20, rgb(255, 255, 255)), 80);
    const b = box(row);
    expect(row.children.length).toBe(1);
    expect(b.querySelector('span')).toBeNull();
    expect(row.textContent).toBe('#'.repeat(20));
    const s = stops(b);
    expect(s.length).toBe(10);
    s.forEach(([c, a, z], i) => {
      expect(c).toBe(colorToCss(rgb(i * 2, 0, 0)));
      expect(a).toBeCloseTo((i * 2 * 100) / 20, 3);
      expect(z).toBeCloseTo(((i * 2 + 2) * 100) / 20, 3);
    });
    expect(b.style.backgroundSize).toBe('calc(var(--cell-w) * 20) 100%');
    expect(b.style.color).not.toBe('');
  });

  it('keeps a span only where the foreground differs, and default text between runs', () => {
    const l = chart(20, rgb(255, 255, 255));
    l.runs[3] = { ...l.runs[3]!, fg: rgb(0, 0, 0) };
    l.runs[4] = { ...l.runs[4]!, fg: rgb(0, 0, 0) };
    // A gap without a run at the end: default colours, no background.
    l.text += '  ';
    const row = renderLine(document, l, 80);
    const b = box(row);
    const spans = b.querySelectorAll('span');
    expect(spans.length).toBe(2);
    expect(spans[0]!.textContent).toBe('####'); // merged across the background change
    expect(spans[1]!.className).toBe('wc-fdef');
    expect(spans[1]!.textContent).toBe('  ');
    expect(row.textContent).toBe(l.text);
    expect(stops(b).at(-1)).toEqual(['transparent', 90.9091, 100]);
  });

  it('uses theme colours for palette 0–15 and classes for the flags', () => {
    const runs: StyleRun[] = [0, 1, 2, 3, 4].map((i) => ({ start: i * 2, end: i * 2 + 2, bg: i + 1, fg: 7, bold: true }));
    const row = renderLine(document, line('abcdefghij', false, runs), 80);
    const b = box(row);
    expect(b.className).toBe('wc-bgrow wc-f7 wc-bold');
    expect(stops(b).map((s) => s[0])).toEqual(['var(--ansi-1)', 'var(--ansi-2)', 'var(--ansi-3)', 'var(--ansi-4)', 'var(--ansi-5)']);
  });

  it('falls back to spans when the line does not qualify', () => {
    const spans = (l: Line, cols = 80): number => renderLine(document, l, cols).querySelectorAll('span').length;
    expect(spans(chart(20), 10)).toBe(10); // wider than the pane
    expect(spans(chart(20), 0)).toBe(10); // pane width unknown
    expect(spans(chart(6))).toBe(3); // too few background runs
    const wide = chart(20);
    wide.text = '漢'.repeat(20);
    expect(spans(wide)).toBe(10);
    const inv = chart(20);
    inv.runs[2] = { ...inv.runs[2]!, inverse: true };
    expect(spans(inv)).toBe(10);
    const bold = chart(20);
    bold.runs[2] = { ...bold.runs[2]!, bold: true };
    expect(spans(bold)).toBe(10);
    // Foreground-only runs (a highlighted line) are not background rows.
    const fgOnly = line('abcdefghij', false, [0, 1, 2, 3, 4].map((i) => ({ start: i * 2, end: i * 2 + 2, fg: i + 1 })));
    expect(spans(fgOnly)).toBe(5);
  });

  it('turns every row of the 24-bit and 256-colour charts into a background row', () => {
    for (const rows of [chart24Rows(), chart256Rows()]) {
      const ls = lines(rows.join('\r\n') + '\r\n');
      expect(ls.length).toBe(rows.length);
      let elements = 0;
      for (const l of ls) {
        const row = renderLine(document, l, 95);
        // The 8-cell third line of a block has too few runs: spans as before.
        if (l.text.length > 8) box(row);
        expect(row.textContent).toBe(l.text);
        elements += row.querySelectorAll('*').length;
      }
      // About one element per row instead of one per 1–2 cells.
      expect(elements).toBeLessThan(ls.length * 4);
    }
  });

  it('uses spans in a pane without a width', () => {
    const t = setup();
    t.bus.emit('text.line', chart(20));
    t.runFrames();
    // No layout here (happy-dom): the width is unknown, so spans.
    expect(t.pane.el.querySelector('.wc-bgrow')).toBeNull();
  });
});

describe('OutputPane partial line', () => {
  it('shows the latest partial and removes it when a line supersedes it', () => {
    const t = setup();
    t.bus.emit('text.partial', line('By what'));
    t.bus.emit('text.partial', line('By what name?'));
    t.runFrames();
    expect(t.partial().hidden).toBe(false);
    expect(t.partial().textContent).toBe('By what name?');
    t.bus.emit('text.line', line('By what name?'));
    t.runFrames();
    expect(t.partial().hidden).toBe(true);
    expect(t.rows()).toEqual(['By what name?']);
  });

  it('clears on an empty partial', () => {
    const t = setup();
    t.bus.emit('text.partial', line('x'));
    t.runFrames();
    t.bus.emit('text.partial', line(''));
    t.runFrames();
    expect(t.partial().hidden).toBe(true);
  });

  it('carries an echo typed at a partial prompt onto the completed line', () => {
    const t = setup();
    t.bus.emit('text.partial', line('Name: '));
    t.bus.emit('cmd.sent', { text: 'Ole', ts: 0 });
    t.runFrames();
    expect(t.partial().textContent).toBe('Name: Ole');
    t.bus.emit('text.line', line('Name: '));
    t.runFrames();
    expect(t.rows()).toEqual(['Name: Ole']);
  });
});

describe('OutputPane command echo', () => {
  it('appends the command to the last prompt line', () => {
    const t = setup();
    t.bus.emit('text.line', line('oO>', true));
    t.runFrames();
    t.bus.emit('cmd.sent', { text: 'look', ts: 0 });
    t.runFrames();
    expect(t.rows()).toEqual(['oO> look']);
    expect(t.pane.el.querySelector('.wc-echo')!.textContent).toBe(' look');
  });

  it('appends to a prompt still queued in the same frame', () => {
    const t = setup();
    t.bus.emit('text.line', line('oO> ', true));
    t.bus.emit('cmd.sent', { text: 'n', ts: 0 });
    t.runFrames();
    expect(t.rows()).toEqual(['oO> n']);
  });

  it('puts a second command before the next prompt on its own line', () => {
    const t = setup();
    t.bus.emit('text.line', line('oO>', true));
    t.bus.emit('cmd.sent', { text: 'n', ts: 0 });
    t.bus.emit('cmd.sent', { text: 's', ts: 0 });
    t.runFrames();
    expect(t.rows()).toEqual(['oO> n', 's']);
  });

  it('renders on its own line after non-prompt output', () => {
    const t = setup();
    t.bus.emit('text.line', line('You are hungry.'));
    t.bus.emit('cmd.sent', { text: 'eat bread', ts: 0 });
    t.runFrames();
    expect(t.rows()).toEqual(['You are hungry.', 'eat bread']);
  });

  it('skips empty, secret, echo:false and replayed width commands', () => {
    const t = setup();
    t.bus.emit('text.line', line('oO>', true));
    t.bus.emit('cmd.sent', { text: 'change width all 500', ts: 0, replay: true });
    t.bus.emit('cmd.sent', { text: '', ts: 0, replay: true });
    t.bus.emit('cmd.sent', { text: '', ts: 0 });
    t.bus.emit('cmd.sent', { text: '', ts: 0, secret: true });
    t.bus.emit('cmd.sent', { text: 'change width all 500', ts: 0, echo: false } as never);
    t.runFrames();
    expect(t.rows()).toEqual(['oO>']);
  });
});

describe('OutputPane replayed commands (ADR 0018)', () => {
  it('echoes a replayed command as a live one', () => {
    const t = setup();
    t.bus.emit('text.line', line('oO>', true));
    t.bus.emit('cmd.sent', { text: 'kill orc', ts: 0, replay: true });
    t.bus.emit('text.line', line('You are hungry.'));
    t.bus.emit('cmd.sent', { text: 'eat bread', ts: 0, replay: true });
    t.runFrames();
    expect(t.rows()).toEqual(['oO> kill orc', 'You are hungry.', 'eat bread']);
  });
});

describe('OutputPane scrolling and selection', () => {
  function fakeScroll(el: HTMLElement, heights: { scrollHeight: number; clientHeight: number }) {
    let top = 0;
    Object.defineProperty(el, 'scrollHeight', { get: () => heights.scrollHeight, configurable: true });
    Object.defineProperty(el, 'clientHeight', { get: () => heights.clientHeight, configurable: true });
    Object.defineProperty(el, 'scrollTop', {
      get: () => top,
      set: (v: number) => {
        top = Math.max(0, Math.min(v, heights.scrollHeight - heights.clientHeight));
      },
      configurable: true,
    });
  }

  it('enters scroll mode on pageUp, counts new lines, and leaves on pageDown', () => {
    const t = setup(1000);
    const h = { scrollHeight: 1800, clientHeight: 180 };
    fakeScroll(t.pane.scroller, h);
    t.pane.toTail();
    expect(t.pane.isScrolled()).toBe(false);
    t.pane.pageUp();
    expect(t.pane.isScrolled()).toBe(true);
    const bar = t.pane.el.querySelector('.wc-tail-bar') as HTMLElement;
    expect(bar.hidden).toBe(false);
    const topBefore = t.pane.scroller.scrollTop;
    t.bus.emit('text.line', line('new'));
    t.runFrames();
    expect(t.pane.scroller.scrollTop).toBe(topBefore);
    expect(bar.textContent).toContain('1 new line');
    t.pane.pageDown();
    t.pane.pageDown();
    expect(t.pane.isScrolled()).toBe(false);
    expect(bar.hidden).toBe(true);
  });

  it('pageDown at the tail does nothing; toTail leaves scroll mode', () => {
    const t = setup();
    const h = { scrollHeight: 1800, clientHeight: 180 };
    fakeScroll(t.pane.scroller, h);
    t.pane.toTail();
    t.pane.pageDown();
    expect(t.pane.isScrolled()).toBe(false);
    t.pane.pageUp();
    t.pane.pageUp();
    t.pane.toTail();
    expect(t.pane.isScrolled()).toBe(false);
    expect(t.pane.scroller.scrollTop).toBe(1620);
  });

  it('a plain click returns focus without touching scroll state', () => {
    const t = setup();
    const h = { scrollHeight: 1800, clientHeight: 180 };
    fakeScroll(t.pane.scroller, h);
    t.pane.toTail();
    t.pane.pageUp();
    t.pane.scroller.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(t.focus).toHaveBeenCalledTimes(1);
    expect(t.clip).not.toHaveBeenCalled();
    expect(t.pane.isScrolled()).toBe(true);
  });

  it('copies a selection on mouseup, then returns focus', () => {
    const t = setup();
    t.bus.emit('text.line', line('copy me'));
    t.runFrames();
    const row = t.pane.el.querySelector('.wc-rows .wc-row')!;
    const range = document.createRange();
    range.selectNodeContents(row);
    const sel = document.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    t.pane.scroller.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(t.clip).toHaveBeenCalledWith('copy me');
    expect(t.focus).toHaveBeenCalled();
    sel.removeAllRanges();
  });
});
