// The film's YouTube thumbnail: the start page in the film's night, as a
// 3840×2160 PNG (1600×900 CSS at DPR 2.4), plain and with a shooting star.
//
//   node record/thumbnail.ts            → out/thumbnail/start-*.png
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devServer } from '../../scripts/lib/dev-server.ts';
import { MODES, launch, newPage } from './lib/browser.ts';
import { FILM_PAGE, freshStart, prepareFilm, shootingStar } from './lib/film-state.ts';

const VIDEO = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(VIDEO, 'out', 'thumbnail');
const PORT = Number(process.env.WC_VIDEO_PORT ?? 5189);
const MODE = { ...MODES['intel-1.2-png']!, dpr: 2.4 };

mkdirSync(OUT, { recursive: true });
const server = await devServer(PORT);
const browser = await launch(MODE);
try {
  const { page } = await newPage(browser, MODE, `http://localhost:${PORT}`, FILM_PAGE);
  await prepareFilm(page);
  await freshStart(page);
  await page.mouse.move(1599, 899);
  // Let the menu's entrance, the fonts and the sky settle.
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(OUT, 'start-plain.png') });
  // A shooting star crossing the upper left, as in the film's opening.
  for (const [i, delay] of [180, 260, 340, 420].entries()) {
    await shootingStar(page, { x: 0.12, y: 0.08, dir: 1, angle: 0.42 });
    await page.waitForTimeout(delay);
    await page.screenshot({ path: join(OUT, `start-star-${i + 1}.png`) });
    await page.waitForTimeout(2500);
  }
} finally {
  await browser.close();
  server?.kill();
}
