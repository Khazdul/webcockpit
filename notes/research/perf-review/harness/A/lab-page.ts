// In-page lab (serialised into the `?bench` page): row-building variants
// and CSS toggles measured in the SAME page, interleaved, on the real pane's
// DOM, CSS, fonts and layout. It bypasses the pane's queue: rows built by a
// variant are appended to the pane's last chunk (or a new chunk), then the
// scroller is scrolled to the bottom exactly like OutputPane.flush does.
// The `base` builder is a copy of renderLine / fillRow / styleSpan
// (src/ui/output-pane.ts) so the variants differ from it in one thing each.

export function installLab(): void {
  type Run = { start: number; end: number; fg?: number; bg?: number; bold?: boolean; italic?: boolean; underline?: boolean; inverse?: boolean; blink?: boolean };
  type Line = { text: string; runs: Run[]; prompt: boolean };
  const probe = (window as any).__wcBench;
  const app = probe.app;
  const doc = document;
  const scroller: HTMLElement = app.output.scroller;
  const rowsEl = scroller.querySelector('.wc-rows') as HTMLElement;

  // ---------------------------------------------------------------- palette
  const DOS = getComputedStyle(doc.documentElement);
  const pal: string[] = [];
  for (let i = 0; i < 16; i++) pal.push(DOS.getPropertyValue(`--ansi-${i}`).trim());
  const cube = [0x00, 0x5f, 0x87, 0xaf, 0xd7, 0xff];
  const hex2 = (n: number) => n.toString(16).padStart(2, '0');
  for (let i = 16; i < 232; i++) {
    const n = i - 16;
    pal.push('#' + hex2(cube[Math.floor(n / 36)]!) + hex2(cube[Math.floor(n / 6) % 6]!) + hex2(cube[n % 6]!));
  }
  for (let i = 232; i < 256; i++) {
    const v = 8 + (i - 232) * 10;
    pal.push('#' + hex2(v) + hex2(v) + hex2(v));
  }
  const TRUE = 0x1000000;
  const css = (c: number) => (c >= TRUE ? '#' + (c & 0xffffff).toString(16).padStart(6, '0') : pal[c & 0xff]!);

  // Static classes for 16–255 (variant cls256).
  const st = doc.createElement('style');
  let rules = '';
  for (let i = 16; i < 256; i++) rules += `.wc-lf${i}{color:${pal[i]}}.wc-lb${i}{background:${pal[i]}}\n`;
  st.textContent = rules;
  doc.head.appendChild(st);
  // Dynamic classes for truecolor (variant tccls): one rule per new colour.
  const dyn = doc.createElement('style');
  doc.head.appendChild(dyn);
  const dynSheet = dyn.sheet as CSSStyleSheet;
  const dynMap = new Map<string, string>();
  let dynN = 0;
  const dynClass = (prop: 'color' | 'background', c: string): string => {
    const k = prop[0] + c;
    let cls = dynMap.get(k);
    if (!cls) {
      cls = `wc-d${(dynN++).toString(36)}`;
      dynSheet.insertRule(`.${cls}{${prop}:${c}}`, dynSheet.cssRules.length);
      dynMap.set(k, cls);
    }
    return cls;
  };

  // ---------------------------------------------------------------- builders
  type StyleFn = (span: HTMLElement, r: Run) => void;
  const flagsCls = (r: Run) => (r.bold ? ' wc-bold' : '') + (r.italic ? ' wc-ital' : '') + (r.underline ? ' wc-ul' : '') + (r.blink ? ' wc-blink' : '');
  const swap = (r: Run): { fg?: number; bg?: number; cls: string } => {
    let fg = r.fg;
    let bg = r.bg;
    let cls = '';
    if (r.inverse) {
      const t = fg;
      fg = bg;
      bg = t;
      if (fg === undefined) cls += ' wc-fd';
      if (bg === undefined) cls += ' wc-bd';
    }
    return { fg, bg, cls };
  };
  // Today's styleSpan.
  const styleBase: StyleFn = (span, r) => {
    let { fg, bg, cls } = swap(r);
    if (fg !== undefined) {
      if (fg < 16) cls += ' wc-f' + fg;
      else span.style.color = css(fg);
    }
    if (bg !== undefined) {
      if (bg < 16) cls += ' wc-b' + bg;
      else span.style.backgroundColor = css(bg);
    }
    cls += flagsCls(r);
    if (cls) span.className = cls.slice(1);
  };
  const styleCssText: StyleFn = (span, r) => {
    let { fg, bg, cls } = swap(r);
    let s = '';
    if (fg !== undefined) {
      if (fg < 16) cls += ' wc-f' + fg;
      else s += 'color:' + css(fg) + ';';
    }
    if (bg !== undefined) {
      if (bg < 16) cls += ' wc-b' + bg;
      else s += 'background-color:' + css(bg);
    }
    cls += flagsCls(r);
    if (cls) span.className = cls.slice(1);
    if (s) span.style.cssText = s;
  };
  const styleAttr: StyleFn = (span, r) => {
    let { fg, bg, cls } = swap(r);
    let s = '';
    if (fg !== undefined) {
      if (fg < 16) cls += ' wc-f' + fg;
      else s += 'color:' + css(fg) + ';';
    }
    if (bg !== undefined) {
      if (bg < 16) cls += ' wc-b' + bg;
      else s += 'background-color:' + css(bg);
    }
    cls += flagsCls(r);
    if (cls) span.className = cls.slice(1);
    if (s) span.setAttribute('style', s);
  };
  const styleCls256: StyleFn = (span, r) => {
    let { fg, bg, cls } = swap(r);
    let s = '';
    if (fg !== undefined) {
      if (fg < 16) cls += ' wc-f' + fg;
      else if (fg < 256) cls += ' wc-lf' + fg;
      else s += 'color:' + css(fg) + ';';
    }
    if (bg !== undefined) {
      if (bg < 16) cls += ' wc-b' + bg;
      else if (bg < 256) cls += ' wc-lb' + bg;
      else s += 'background-color:' + css(bg);
    }
    cls += flagsCls(r);
    if (cls) span.className = cls.slice(1);
    if (s) span.style.cssText = s;
  };
  const styleTcCls: StyleFn = (span, r) => {
    let { fg, bg, cls } = swap(r);
    if (fg !== undefined) cls += ' ' + (fg < 16 ? 'wc-f' + fg : fg < 256 ? 'wc-lf' + fg : dynClass('color', css(fg)));
    if (bg !== undefined) cls += ' ' + (bg < 16 ? 'wc-b' + bg : bg < 256 ? 'wc-lb' + bg : dynClass('background', css(bg)));
    cls += flagsCls(r);
    if (cls) span.className = cls.slice(1);
  };

  const fillWith = (style: StyleFn) => (row: HTMLElement, line: Line): void => {
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
      style(span, r);
      span.textContent = text.slice(r.start, r.end);
      row.appendChild(span);
      pos = r.end;
    }
    if (pos < text.length) row.appendChild(doc.createTextNode(text.slice(pos)));
  };

  // Row-level fg: when the runs cover the row and share one fg >= 16, the row
  // gets the colour once and the spans only their bg (cssText).
  const fillRowFg = (row: HTMLElement, line: Line): void => {
    const runs = line.runs;
    const text = line.text;
    let uniform = runs.length > 1 && runs[0]!.start === 0 && runs[runs.length - 1]!.end === text.length;
    const fg0 = runs[0]?.fg;
    if (uniform) {
      for (let i = 0; i < runs.length; i++) {
        const r = runs[i]!;
        if (r.fg !== fg0 || r.inverse || (i > 0 && runs[i - 1]!.end !== r.start)) {
          uniform = false;
          break;
        }
      }
    }
    if (!uniform || fg0 === undefined || fg0 < 16) return fillWith(styleCssText)(row, line);
    row.style.color = css(fg0);
    for (const r of runs) {
      const span = doc.createElement('span');
      let cls = flagsCls(r);
      if (r.bg !== undefined) {
        if (r.bg < 16) cls += ' wc-b' + r.bg;
        else span.style.cssText = 'background-color:' + css(r.bg);
      }
      if (cls) span.className = cls.slice(1);
      span.textContent = text.slice(r.start, r.end);
      row.appendChild(span);
    }
  };

  // Reference only (security change!): the row as an HTML string with the
  // text escaped. Not a proposal as such; it shows the parser-side floor.
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const fillHtml = (row: HTMLElement, line: Line): void => {
    const text = line.text;
    const runs = line.runs;
    if (runs.length === 0) {
      if (text !== '') row.textContent = text;
      return;
    }
    let h = '';
    let pos = 0;
    for (const r of runs) {
      if (r.start > pos) h += esc(text.slice(pos, r.start));
      let { fg, bg, cls } = swap(r);
      let s = '';
      if (fg !== undefined) {
        if (fg < 16) cls += ' wc-f' + fg;
        else s += 'color:' + css(fg) + ';';
      }
      if (bg !== undefined) {
        if (bg < 16) cls += ' wc-b' + bg;
        else s += 'background-color:' + css(bg);
      }
      cls += flagsCls(r);
      h += `<span${cls ? ` class="${cls.slice(1)}"` : ''}${s ? ` style="${s}"` : ''}>${esc(text.slice(r.start, r.end))}</span>`;
      pos = r.end;
    }
    if (pos < text.length) h += esc(text.slice(pos));
    row.innerHTML = h;
  };

  // Reference only: backgrounds as one hard-stop gradient per row (cell
  // grid), the text as one text node. Valid only for rows that do not wrap
  // and have one fg; shows what the element count costs.
  const cellW = parseFloat(DOS.getPropertyValue('--cell-w')) || 9;
  const fillGradient = (row: HTMLElement, line: Line): void => {
    const runs = line.runs;
    if (runs.length < 2) return fillWith(styleCssText)(row, line);
    const stops: string[] = [];
    for (const r of runs) {
      const c = r.bg === undefined ? 'transparent' : css(r.bg);
      stops.push(`${c} ${r.start * cellW}px ${r.end * cellW}px`);
    }
    const fg = runs[0]!.fg;
    row.style.cssText = (fg !== undefined ? `color:${css(fg)};` : '') + `background:linear-gradient(90deg,${stops.join(',')}) no-repeat;background-size:${line.text.length * cellW}px 100%`;
    row.textContent = line.text;
  };

  const builders: Record<string, (row: HTMLElement, line: Line) => void> = {
    base: fillWith(styleBase),
    cssText: fillWith(styleCssText),
    attr: fillWith(styleAttr),
    cls256: fillWith(styleCls256),
    tccls: fillWith(styleTcCls),
    rowfg: fillRowFg,
    html: fillHtml,
    gradient: fillGradient,
  };

  // ---------------------------------------------------------------- lines
  const lines: Record<string, Line[]> = {};
  const channel = new MessageChannel();
  let post: Array<() => void> = [];
  channel.port1.onmessage = () => {
    const q = post;
    post = [];
    for (const f of q) f();
  };
  const afterPaint = (f: () => void) => {
    post.push(f);
    if (post.length === 1) channel.port2.postMessage(null);
  };

  const CHUNK = 200;
  const append = (rows: HTMLElement[]) => {
    let i = 0;
    const last = rowsEl.lastElementChild as HTMLElement | null;
    if (last) {
      const room = CHUNK - last.childElementCount;
      if (room > 0) {
        const frag = doc.createDocumentFragment();
        for (const stop = Math.min(rows.length, room); i < stop; i++) frag.appendChild(rows[i]!);
        last.appendChild(frag);
      }
    }
    if (i >= rows.length) return;
    const chunks = doc.createDocumentFragment();
    while (i < rows.length) {
      const chunk = doc.createElement('div');
      chunk.className = 'wc-chunk';
      for (const stop = Math.min(rows.length, i + CHUNK); i < stop; i++) chunk.appendChild(rows[i]!);
      chunks.appendChild(chunk);
    }
    rowsEl.appendChild(chunks);
  };

  const lab = {
    lines,
    /** Captures the display lines one payload produces (it also renders once in the pane). */
    capture(name: string, bytes: Uint8Array): Promise<number> {
      const got: Line[] = [];
      const off = app.bus.on('text.display', (d: { line: Line }) => got.push(d.line));
      probe.sock.onData(bytes);
      off();
      lines[name] = got;
      return probe.drained().then(() => got.length);
    },
    /**
     * Builds `name`'s lines with builder `variant` in the next animation frame,
     * appends them and scrolls like the pane (`scroll`: 'read' = scrollTop =
     * scrollHeight; 'big' = scrollTop = 1e9; 'none'; 'anchor' = nothing, the
     * CSS anchor keeps the view at the bottom). Resolves with phase times.
     */
    run(variant: string, name: string, scroll = 'read'): Promise<Record<string, number>> {
      const build = builders[variant]!;
      const src = lines[name]!;
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          const t0 = performance.now();
          const rows: HTMLElement[] = [];
          for (const line of src) {
            const row = doc.createElement('div');
            row.className = line.prompt ? 'wc-row wc-prompt' : 'wc-row';
            build(row, line);
            rows.push(row);
          }
          const t1 = performance.now();
          append(rows);
          const t2 = performance.now();
          if (scroll === 'read') scroller.scrollTop = scroller.scrollHeight;
          else if (scroll === 'big') scroller.scrollTop = 1e9;
          const t3 = performance.now();
          afterPaint(() => {
            const t4 = performance.now();
            resolve({ build: t1 - t0, append: t2 - t1, scroll: t3 - t2, script: t3 - t0, post: t4 - t3, frame: t4 - t0 });
          });
        });
      });
    },
    /** Plain rows (no timing) to push heavy rows out of the cull rect / display port. */
    filler(n: number): Promise<void> {
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          const rows: HTMLElement[] = [];
          for (let i = 0; i < n; i++) {
            const row = doc.createElement('div');
            row.className = 'wc-row';
            row.textContent = `filler row ${i} — the quick brown fox jumps over the lazy dog, ordinary description text.`;
            rows.push(row);
          }
          append(rows);
          scroller.scrollTop = scroller.scrollHeight;
          afterPaint(() => resolve());
        });
      });
    },
    setCss(text: string): void {
      let el = doc.getElementById('lab-css') as HTMLStyleElement | null;
      if (!el) {
        el = doc.createElement('style');
        el.id = 'lab-css';
        doc.head.appendChild(el);
      }
      el.textContent = text;
    },
    setRootVar(name: string, value: string | null): void {
      if (value === null) doc.documentElement.style.removeProperty(name);
      else doc.documentElement.style.setProperty(name, value);
    },
    dynRules(): number {
      return dynSheet.cssRules.length;
    },
    frames(n: number): Promise<void> {
      return new Promise((resolve) => {
        const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      });
    },
  };
  (window as any).__lab = lab;
}
