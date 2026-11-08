// Where do the blocks in dark gradients come from? (ADR 0133 addendum.)
//
//   node record/banding.ts [out-dir]          (default: out/banding/)
//
// Opens the film's start page at night with the sky frozen (`?skyFreeze`),
// opens Profile (its frame and glow over the dark sky are where banding
// shows), and saves the same crop, contrast-boosted (curves 0/0 0.25/1 1/1,
// as the owner's check), from each stage:
//
//   truth          page.screenshot (PNG, what the browser draws)
//   sc-jpeg95 …    one DevTools screencast frame: JPEG q95, JPEG q100, PNG
//   enc-*          that frame through each intermediate encoding we weigh
//
// and a montage of them all. The render stage is checked on the film itself
// (record/frames.ts, `--boost`).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devServer } from '../../scripts/lib/dev-server.ts';
import { sleep } from '../../scripts/lib/mume-feed.ts';
import { MODES, VIEWPORT, launch, newPage } from './lib/browser.ts';
import { FILM_PAGE, freshStart, prepareFilm } from './lib/film-state.ts';

const VIDEO = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.argv[2] ?? join(VIDEO, 'out/banding');
const PORT = Number(process.env.WC_VIDEO_PORT ?? 5189);
const mode = MODES['intel-1.5']!;
/** The owner's contrast boost. */
export const BOOST = "curves=all='0/0 0.25/1 1/1'";

function ff(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
}

mkdirSync(OUT, { recursive: true });
const server = await devServer(PORT);
const browser = await launch(mode);
try {
  const { page } = await newPage(browser, mode, `http://localhost:${PORT}`, FILM_PAGE);
  await prepareFilm(page);
  await freshStart(page, undefined, 'skyFreeze');
  await page.keyboard.press('p');
  await page.waitForFunction(() => !document.querySelector('.wc-start')?.hasAttribute('data-lk-morph'));
  await sleep(1500);
  await page.mouse.move(5, VIEWPORT.height - 5);
  const box = (await page.locator('.wc-pl').first().boundingBox())!;
  const dpr = mode.dpr;
  // the box's top left corner, its frame and the glow around it, over the sky
  const crop = { x: Math.round((box.x - 160) * dpr), y: Math.round((box.y - 110) * dpr), w: 600, h: 400 };
  const cropF = `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`;
  writeFileSync(join(OUT, 'crop.json'), JSON.stringify({ ...crop, dpr, video: { w: VIEWPORT.width * dpr, h: VIEWPORT.height * dpr } }));

  await page.screenshot({ path: join(OUT, 'truth.png') });
  // one screencast frame per format
  for (const [name, fmt] of [
    ['sc-jpeg95.jpg', { format: 'jpeg', quality: 95 }],
    ['sc-jpeg100.jpg', { format: 'jpeg', quality: 100 }],
    ['sc-png.png', { format: 'png' }],
  ] as const) {
    const cdp = await page.context().newCDPSession(page);
    const got = new Promise<string>((resolve) =>
      cdp.on('Page.screencastFrame', (f: { data: string; sessionId: number }) => {
        void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId });
        resolve(f.data);
      }),
    );
    await cdp.send('Page.startScreencast', { ...fmt, maxWidth: VIEWPORT.width * dpr, maxHeight: VIEWPORT.height * dpr, everyNthFrame: 1 });
    // a tiny pointer move makes a fresh frame
    await page.mouse.move(6, VIEWPORT.height - 6);
    writeFileSync(join(OUT, name), Buffer.from(await got, 'base64'));
    await cdp.send('Page.stopScreencast');
    await cdp.detach();
  }

  // the intermediate encodings, from the frames they would get
  const enc: [string, string, string[]][] = [
    ['enc-old', 'sc-jpeg95.jpg', ['-vf', 'scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p', '-c:v', 'libx264', '-crf', '12', '-tune', 'animation', '-preset', 'medium']],
    ['enc-x264-420-crf12-q100', 'sc-jpeg100.jpg', ['-vf', 'scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p', '-c:v', 'libx264', '-crf', '12', '-preset', 'medium']],
    ['enc-x264rgb-qp0', 'sc-png.png', ['-c:v', 'libx264rgb', '-qp', '0', '-preset', 'medium', '-pix_fmt', 'bgr0']],
    ['enc-x264-444-qp0', 'sc-png.png', ['-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv444p', '-c:v', 'libx264', '-qp', '0', '-preset', 'medium']],
    ['enc-prores4444', 'sc-png.png', ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuv444p10le']],
  ];
  for (const [name, src, args] of enc) {
    const ext = name.includes('prores') ? 'mov' : 'mp4';
    ff(['-loop', '1', '-t', '0.5', '-r', '60', '-i', join(OUT, src), ...args, join(OUT, `${name}.${ext}`)]);
    ff(['-i', join(OUT, `${name}.${ext}`), '-frames:v', '1', join(OUT, `${name}.png`)]);
  }

  // the crops, boosted and labelled, and a montage
  const stages = ['truth.png', 'sc-jpeg95.jpg', 'sc-jpeg100.jpg', 'sc-png.png', ...enc.map(([n]) => `${n}.png`)];
  const crops = stages.map((s) => {
    const out = join(OUT, `crop-${s.replace(/\.\w+$/, '')}.png`);
    const label = `drawtext=text='${s.replace(/\.\w+$/, '')}':x=8:y=8:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.7`;
    ff(['-i', join(OUT, s), '-vf', `${cropF},${BOOST},${label}`, out]);
    return out;
  });
  const cols = 3;
  while (crops.length % cols) crops.push(crops.at(-1)!);
  const layout = crops.map((_, i) => `${(i % cols) * crop.w}_${Math.floor(i / cols) * crop.h}`).join('|');
  ff([...crops.flatMap((c) => ['-i', c]), '-filter_complex', `xstack=inputs=${crops.length}:layout=${layout}`, join(OUT, 'montage.png')]);
  console.log(`${join(OUT, 'montage.png')}  (crop ${JSON.stringify(crop)})`);
} finally {
  await browser.close();
  server?.kill();
}
