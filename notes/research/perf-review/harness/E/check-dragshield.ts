// Functional check of exp-dragshield: during a real pointer drag of the
// right dock's gap the element under the pointer shows `col-resize`, text
// is not selected, the shield hides after the drop and the dock resized.
//
//   node perf/check-dragshield.ts [build] [port]
import { firefox, chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const { serveDir } = await import('./serve.ts');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const build = process.argv[2] ?? 'exp-dragshield';
const port = Number(process.argv[3] ?? '4247');
const server = await serveDir(`${ROOT}perf/builds/${build}`, port, true);
try {
  for (const type of [chromium, firefox]) {
    const b = await type.launch();
    const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(`http://127.0.0.1:${port}/?bench`);
    await page.waitForFunction(() => (window as any).__wcBench?.app != null);
    const h = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.wc-handle[data-dock="right"]')!;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + 200, w0: document.querySelector<HTMLElement>('.wc-pane-character')!.getBoundingClientRect().width };
    });
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x - 40, h.y, { steps: 5 });
    const during = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x!, y!) as HTMLElement;
      const cockpitMark = document.querySelector<HTMLElement>('.wc-cockpit')!.dataset.drag ?? null;
      return { cls: el.className, cursor: getComputedStyle(el).cursor, mark: cockpitMark, sel: String(getSelection()) };
    }, [h.x - 40, h.y] as const);
    // Over the output text too.
    await page.mouse.move(h.x - 400, h.y + 100, { steps: 5 });
    const overText = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x!, y!) as HTMLElement;
      return { cls: el.className, cursor: getComputedStyle(el).cursor };
    }, [h.x - 400, h.y + 100] as const);
    await page.mouse.move(h.x - 40, h.y, { steps: 3 });
    await page.mouse.up();
    const after = await page.evaluate(() => ({
      shieldHidden: document.querySelector<HTMLElement>('.wc-drag-shield')?.hidden ?? 'no shield',
      mark: document.querySelector<HTMLElement>('.wc-cockpit')!.dataset.drag ?? null,
      w1: document.querySelector<HTMLElement>('.wc-pane-character')!.getBoundingClientRect().width,
      sel: String(getSelection()),
    }));
    console.log(type.name(), JSON.stringify({ during, overText, after, w0: h.w0 }));
    await b.close();
  }
} finally {
  server.close();
}
