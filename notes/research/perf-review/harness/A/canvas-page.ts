// Throwaway canvas spike (Q6), serialised into the `?bench` page after the
// lab (perf/lab-page.ts) has captured the payload lines. A canvas over the
// output pane (device pixels at the page's DPR) draws rows on the cell grid:
// fillRect per background run, fillText per run (or one fillText per row
// when the row has one fg). Not a renderer: no selection, no scrollback.
export function installCanvas(): void {
  const lab = (window as any).__lab;
  const sc = document.querySelector('.wc-scroller') as HTMLElement;
  const cs = getComputedStyle(document.documentElement);
  const cellW = parseFloat(cs.getPropertyValue('--cell-w'));
  const cellH = parseFloat(cs.getPropertyValue('--cell-h'));
  const fontSize = cs.getPropertyValue('--font-size').trim();
  const dpr = devicePixelRatio;
  const canvas = document.createElement('canvas');
  const W = sc.clientWidth;
  const H = sc.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:5;background:#000`;
  (sc.parentElement as HTMLElement).appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.scale(dpr, dpr);
  ctx.textBaseline = 'alphabetic';
  const fontN = `${fontSize} "DejaVu Sans Mono"`;
  const fontB = `bold ${fontSize} "DejaVu Sans Mono"`;
  ctx.font = fontN;
  const baseline = Math.round(cellH * 0.8);
  const TRUE = 0x1000000;
  const pal: string[] = [];
  for (let i = 0; i < 16; i++) pal.push(cs.getPropertyValue(`--ansi-${i}`).trim());
  const cube = [0, 0x5f, 0x87, 0xaf, 0xd7, 0xff];
  const h2 = (n: number) => n.toString(16).padStart(2, '0');
  for (let i = 16; i < 232; i++) {
    const n = i - 16;
    pal.push('#' + h2(cube[Math.floor(n / 36)]!) + h2(cube[Math.floor(n / 6) % 6]!) + h2(cube[n % 6]!));
  }
  for (let i = 232; i < 256; i++) {
    const v = 8 + (i - 232) * 10;
    pal.push('#' + h2(v) + h2(v) + h2(v));
  }
  const css = (c: number) => (c >= TRUE ? '#' + (c & 0xffffff).toString(16).padStart(6, '0') : pal[c & 0xff]!);
  const fgDefault = cs.getPropertyValue('--term-fg').trim() || '#c0c0c0';
  const bgDefault = cs.getPropertyValue('--term-bg').trim() || '#000000';

  type Run = { start: number; end: number; fg?: number; bg?: number; bold?: boolean };
  type Line = { text: string; runs: Run[] };
  const drawRow = (line: Line, y: number, perRunText: boolean): void => {
    ctx.fillStyle = bgDefault;
    ctx.fillRect(0, y, W, cellH);
    const text = line.text;
    const runs = line.runs;
    for (const r of runs) {
      if (r.bg === undefined) continue;
      ctx.fillStyle = css(r.bg);
      ctx.fillRect(r.start * cellW, y, (r.end - r.start) * cellW, cellH);
    }
    const oneFg = !perRunText && runs.every((r) => r.fg === runs[0]?.fg && !r.bold);
    if (runs.length === 0 || oneFg) {
      ctx.font = fontN;
      ctx.fillStyle = runs[0]?.fg !== undefined ? css(runs[0]!.fg!) : fgDefault;
      ctx.fillText(text, 0, y + baseline);
      return;
    }
    let pos = 0;
    const seg = (a: number, b: number, fg: number | undefined, bold: boolean | undefined) => {
      if (b <= a) return;
      ctx.font = bold ? fontB : fontN;
      ctx.fillStyle = fg !== undefined ? css(fg) : fgDefault;
      ctx.fillText(text.slice(a, b), a * cellW, y + baseline);
    };
    for (const r of runs) {
      seg(pos, r.start, undefined, false);
      seg(r.start, r.end, r.fg, r.bold);
      pos = r.end;
    }
    seg(pos, text.length, undefined, false);
  };
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
  const rowsVisible = Math.floor(H / cellH);
  (window as any).__canvas = {
    /** Full redraw: the last `rowsVisible` rows of `name` (repeated to fill). */
    full(name: string, perRunText = true): Promise<Record<string, number>> {
      const src: Line[] = lab.lines[name];
      return new Promise((resolve) =>
        requestAnimationFrame(() => {
          const t0 = performance.now();
          for (let i = 0; i < rowsVisible; i++) drawRow(src[i % src.length]!, i * cellH, perRunText);
          const t1 = performance.now();
          afterPaint(() => resolve({ script: t1 - t0, frame: performance.now() - t0 }));
        }),
      );
    },
    /** Incremental: shift the canvas up by n rows (self drawImage) and draw n new rows of `name`. */
    scroll(name: string, perRunText = true): Promise<Record<string, number>> {
      const src: Line[] = lab.lines[name];
      const n = src.length;
      return new Promise((resolve) =>
        requestAnimationFrame(() => {
          const t0 = performance.now();
          const dy = Math.min(n, rowsVisible) * cellH;
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(canvas, 0, dy * dpr, canvas.width, canvas.height - dy * dpr, 0, 0, canvas.width, canvas.height - dy * dpr);
          ctx.restore();
          const top = (rowsVisible - Math.min(n, rowsVisible)) * cellH;
          for (let i = 0; i < Math.min(n, rowsVisible); i++) drawRow(src[src.length - Math.min(n, rowsVisible) + i]!, top + i * cellH, perRunText);
          const t1 = performance.now();
          afterPaint(() => resolve({ script: t1 - t0, frame: performance.now() - t0 }));
        }),
      );
    },
    remove(): void {
      canvas.remove();
    },
  };
}
