// Draws public/share-preview.png, the generic link preview of a shared log
// without an image of its own (ADR 0158), with the same code that draws a
// log's preview (src/share/preview-image.ts): the default terminal look,
// no lines, the play button and the mark. Run against a dev server:
//
//   npx vite --port 5294 &
//   WC_URL=http://localhost:5294 node --experimental-strip-types scripts/build-share-preview.ts
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const url = process.env.WC_URL ?? 'http://localhost:5173';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url);
  const bytes = await page.evaluate(async () => {
    const path = '/src/share/preview-image.ts';
    const m = (await import(/* @vite-ignore */ path)) as { drawPreview(ctx: CanvasRenderingContext2D, lines: never[]): Promise<void> };
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 900;
    await m.drawPreview(canvas.getContext('2d')!, []);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    return [...new Uint8Array(await blob!.arrayBuffer())];
  });
  writeFileSync(new URL('../public/share-preview.png', import.meta.url), Uint8Array.from(bytes));
} finally {
  await browser.close();
}
