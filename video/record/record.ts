// Records a scene of the film (ADR 0133):
//
//   npm run record -- bree                      public/recordings/bree.mp4 + bree.json
//   npm run record -- bree --mode headless-2    another capture mode (lib/browser.ts MODES)
//   npm run record -- bree --measure            every mode in turn: the fps table, no files kept
//   npm run record -- bree --measure --mode a,b  only these modes
//
// Starts the repository's dev server on WC_VIDEO_PORT (default 5189) unless
// one answers there, logs in through a mocked MUME WebSocket (nothing
// reaches the real server), runs the scene's setup off camera, then films
// its run with the DevTools screencast in real time and encodes the frames
// to constant 60 fps. A `stepped` scene is taken frame by frame on a clock
// of its own instead (lib/frame-clock.ts).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { devServer } from '../../scripts/lib/dev-server.ts';
import { DEFAULT_MODE, MODES, VIEWPORT, inputEvents, launch, newPage } from './lib/browser.ts';
import { FPS, encode, imageSize } from './lib/encode.ts';
import { FrameClock } from './lib/frame-clock.ts';
import type { Scene, SceneState } from './lib/scene.ts';
import { type CaptureStats, Screencast } from './lib/screencast.ts';
import { Marks, type TimelineFile, relativeInput } from './lib/timeline.ts';
import { balloonsFountain } from './scenes/balloons.ts';
import { bree } from './scenes/bree.ts';
import { devicesDesktop, devicesPhone, devicesTablet } from './scenes/devices.ts';
import { film2A } from './scenes/film2-a.ts';
import { film2B } from './scenes/film2-b.ts';
import { part1 } from './scenes/part1.ts';
import { takeA } from './scenes/take-a.ts';
import { takeB } from './scenes/take-b.ts';

const SCENES: Record<string, Scene> = {
  bree,
  part1,
  'take-a': takeA,
  'take-b': takeB,
  'devices-desktop': devicesDesktop,
  'devices-tablet': devicesTablet,
  'devices-phone': devicesPhone,
  'film2-a': film2A,
  'film2-b': film2B,
  'balloons-fountain': balloonsFountain,
};

const VIDEO = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(VIDEO, 'public/recordings');
const PORT = Number(process.env.WC_VIDEO_PORT ?? 5189);
const BASE = `http://localhost:${PORT}`;

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const name = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--mode'));
if (!name || !(name in SCENES)) throw new Error(`usage: npm run record -- <scene> [--mode <mode>] [--measure]; scenes: ${Object.keys(SCENES).join(' ')}`);
const measure = args.includes('--measure');
const modeNames = measure ? (flag('--mode')?.split(',') ?? Object.keys(MODES)) : [flag('--mode') ?? SCENES[name]!.mode ?? DEFAULT_MODE];
for (const m of modeNames) if (!(m in MODES)) throw new Error(`unknown mode ${m}; known: ${Object.keys(MODES).join(' ')}`);

const fmt = (s: CaptureStats): string =>
  `${s.meanFps.toFixed(1)} fps mean, ${s.minFps1s} min/1 s, ${s.gapsOver50ms} gaps > 50 ms, longest ${s.maxGapMs.toFixed(0)} ms (${s.frames} frames, ${s.seconds.toFixed(1)} s)`;

async function record(sceneName: string, modeName: string, keep: boolean): Promise<CaptureStats> {
  const mode = MODES[modeName]!;
  const scene = SCENES[sceneName]!;
  const t = Date.now();
  const browser = await launch(mode);
  try {
    const { page } = await newPage(browser, mode, BASE, scene.page);
    const clock = scene.stepped ? await FrameClock.install(page) : null;
    const state = await scene.setup(page);
    const marks = new Marks(mode.dpr);
    if (clock) return await recordStepped(sceneName, modeName, page, clock, marks, state, keep);
    const vp = scene.canvas ?? scene.page?.viewport ?? VIEWPORT;
    const canvas = scene.canvas ? { width: Math.ceil((scene.canvas.width * mode.dpr) / 2) * 2, height: Math.ceil((scene.canvas.height * mode.dpr) / 2) * 2 } : undefined;
    const cast = new Screencast(page, { width: Math.round(vp.width * mode.dpr), height: Math.round(vp.height * mode.dpr), format: mode.format, ...(mode.quality ? { quality: mode.quality } : {}) });
    try {
      await cast.start();
      try {
        await scene.run({ page, marks }, state);
      } catch (err) {
        // what the page showed when the scene failed, and the markers so far
        await page.screenshot({ path: join(VIDEO, 'out', `fail-${sceneName}.png`) }).catch(() => {});
        console.error(`  markers so far: ${marks.relative(cast.t0, 1e9).map((m) => `${m.kind}@${m.t.toFixed(1)}`).join(' ')}`);
        throw err;
      }
      const end = Date.now() / 1000;
      const input = await inputEvents(page);
      await cast.stop();
      const t0 = cast.t0;
      const rel = marks.relative(t0, end - t0);
      const from = rel.find((m) => m.kind === 'active')?.t ?? 0;
      const to = rel.find((m) => m.kind === 'active-end')?.t ?? Infinity;
      const all = cast.stats();
      const active = cast.stats(from, to);
      console.log(`  ${modeName}: ${fmt(active)}  [active stretch]`);
      console.log(`  ${' '.repeat(modeName.length)}  ${fmt(all)}  [whole capture]`);
      console.log(`  frames per second: ${cast.perSecond().join(' ')}`);
      const size = await imageSize(cast.frames[0]!.file);
      if (!canvas && size.width !== Math.round(vp.width * mode.dpr)) console.warn(`  frames are ${size.width}×${size.height}, not ${vp.width * mode.dpr} wide: downscaled`);
      if (!keep) return active;
      mkdirSync(OUT, { recursive: true });
      const te = Date.now();
      const enc = await encode(cast.frames, end, join(OUT, `${sceneName}.mp4`), cast.dir, canvas);
      console.log(`  encoded ${enc.frames} frames (${enc.seconds.toFixed(2)} s) in ${((Date.now() - te) / 1000).toFixed(1)} s`);
      const timeline: TimelineFile = {
        scene: sceneName,
        recordedAt: new Date().toISOString(),
        mode: modeName,
        // the encoder pads odd sizes to even
        width: canvas?.width ?? Math.ceil(size.width / 2) * 2,
        height: canvas?.height ?? Math.ceil(size.height / 2) * 2,
        dpr: mode.dpr,
        fps: FPS,
        frames: enc.frames,
        durationS: enc.seconds,
        capture: { ...all, active, perSecond: cast.perSecond() },
        frameTimes: cast.frames.map((fr) => Math.round((fr.ts - t0) * 10000) / 10000),
        markers: rel,
        input: relativeInput(input, t0, end - t0, mode.dpr),
      };
      writeFileSync(join(OUT, `${sceneName}.json`), `${JSON.stringify(timeline, null, 1)}\n`);
      console.log(`  ${join(OUT, `${sceneName}.mp4`)}\n  ${join(OUT, `${sceneName}.json`)}  (${rel.length} markers, ${timeline.input.length} input events)`);
      return active;
    } finally {
      // stopped first, so no frame is still being written into the directory
      await cast.stop();
      cast.dispose();
    }
  } finally {
    await browser.close();
    console.log(`  ${sceneName} (${modeName}) took ${((Date.now() - t) / 1000).toFixed(1)} s`);
  }
}

/** A stepped scene: one frame per 1/60 s of the page's time, taken one by one. */
async function recordStepped(sceneName: string, modeName: string, page: Page, clock: FrameClock, marks: Marks, state: SceneState, keep: boolean): Promise<CaptureStats> {
  if (!keep) throw new Error('--measure is for screencast scenes');
  const scene = SCENES[sceneName]!;
  const { workers, x } = scene.stepped!;
  const { dpr } = MODES[modeName]!;
  mkdirSync(OUT, { recursive: true });
  await clock.freeze(workers);
  const width = 1920;
  const height = 1080;
  await clock.record({ file: join(OUT, `${sceneName}.mp4`), width, height, x });
  const load = (): number => Number(readFileSync('/proc/loadavg', 'utf8').split(' ')[0]);
  const loads = [load()];
  const timer = setInterval(() => loads.push(load()), 15_000);
  const began = Date.now();
  try {
    await scene.run({ page, marks, clock }, state);
  } catch (err) {
    console.error(`  markers so far: ${marks.relative(clock.t0 / 1000, 1e9).map((m) => `${m.kind}@${m.t.toFixed(1)}`).join(' ')}`);
    throw err;
  } finally {
    clearInterval(timer);
    await clock.finish();
  }
  const seconds = clock.recorded / FPS;
  const sorted = [...loads].sort((a, b) => a - b);
  console.log(`  ${modeName}, stepped: ${clock.recorded} frames (${seconds.toFixed(2)} s), ${((Date.now() - began) / clock.recorded).toFixed(0)} ms a frame`);
  console.log(`  machine load (1 min): ${sorted[0]} min, ${sorted[sorted.length >> 1]} median, ${sorted.at(-1)} max`);
  const t0 = clock.t0 / 1000;
  const stats: CaptureStats = { frames: clock.recorded, seconds, meanFps: FPS, minFps1s: FPS, gapsOver50ms: 0, maxGapMs: 1000 / FPS };
  const timeline: TimelineFile = {
    scene: sceneName,
    recordedAt: new Date().toISOString(),
    mode: `${modeName} (stepped)`,
    width,
    height,
    dpr,
    fps: FPS,
    frames: clock.recorded,
    durationS: seconds,
    capture: { ...stats, active: stats, perSecond: [], load: loads },
    markers: marks.relative(t0, seconds),
    input: relativeInput(await inputEvents(page), t0, seconds, dpr).map((e) => (e.x === undefined ? e : { ...e, x: e.x + x })),
  };
  writeFileSync(join(OUT, `${sceneName}.json`), `${JSON.stringify(timeline, null, 1)}\n`);
  return stats;
}

const server = await devServer(PORT);
try {
  const table: [string, CaptureStats][] = [];
  for (const m of modeNames) {
    console.log(`${name} — ${m}`);
    try {
      table.push([m, await record(name, m, !measure)]);
    } catch (err) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  }
  if (measure) {
    console.log('\n| Mode | Size | Mean fps | Min fps (1 s) | Gaps > 50 ms | Longest gap |\n|---|---|---|---|---|---|');
    for (const [m, s] of table) {
      const md = MODES[m]!;
      console.log(`| ${m} | ${VIEWPORT.width * md.dpr}×${VIEWPORT.height * md.dpr} | ${s.meanFps.toFixed(1)} | ${s.minFps1s} | ${s.gapsOver50ms} | ${s.maxGapMs.toFixed(0)} ms |`);
    }
  }
} finally {
  server?.kill();
}
