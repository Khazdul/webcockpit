// Screencast frames → a constant 60 fps recording (ADR 0133). Each frame
// is held until the next one's timestamp (ffmpeg's concat demuxer with a
// duration per frame), then resampled to 60 fps: a still page sends no
// frames, and those stretches become repeated frames, as on the screen.
//
// The recording is lossless (ADR 0133 addendum: the first takes' lossy
// x264 CRF 12 with `-tune animation`, on top of the JPEG frames, put 8×8
// blocks into dark gradients): libx264rgb at QP 0, RGB as the frames come,
// so not even a YUV conversion rounds the sky. Remotion's OffthreadVideo
// decodes it bit-exactly (checked with src/DecodeTest.tsx). A GOP of 30
// frames (0.5 s) keeps Remotion Studio seeking fast. About 10–30 MB a second
// of film; disk is cheap.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Frame } from './screencast.ts';

export const FPS = 60;

export interface EncodeResult {
  /** Frames in the output. */
  frames: number;
  seconds: number;
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}:\n${err.slice(-2000)}`))));
  });
}

/** The pixel size of an image file. */
export async function imageSize(file: string): Promise<{ width: number; height: number }> {
  const out = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]);
  const [w, h] = out.trim().split(',').map(Number);
  return { width: w!, height: h! };
}

/**
 * Encodes `frames` (from `from` to `to`, epoch s; the last frame held until
 * `to`) to `out`. The output's frame 0 is the first frame.
 */
export async function encode(frames: readonly Frame[], to: number, out: string, dir: string): Promise<EncodeResult> {
  const lines = ['ffconcat version 1.0'];
  for (let i = 0; i < frames.length; i++) {
    const end = i + 1 < frames.length ? frames[i + 1]!.ts : Math.max(to, frames[i]!.ts + 1 / FPS);
    lines.push(`file '${frames[i]!.file}'`, `duration ${Math.max(end - frames[i]!.ts, 0.0001).toFixed(6)}`);
  }
  // The demuxer drops the last entry's duration unless the file is listed once more.
  lines.push(`file '${frames.at(-1)!.file}'`);
  const list = join(dir, 'frames.ffconcat');
  writeFileSync(list, `${lines.join('\n')}\n`);
  const seconds = Math.max(to, frames.at(-1)!.ts) - frames[0]!.ts;
  const total = Math.round(seconds * FPS);
  await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', list,
    // JPEG frames decode as full-range YCbCr (BT.601 in JFIF); PNG frames are RGB already.
    // (DPR 1.2 gives 1920×1079 frames, Chrome rounding down: a black row at the bottom makes 1080, pixels untouched)
    '-vf', `fps=${FPS},scale=in_range=pc:in_color_matrix=bt601:flags=accurate_rnd+full_chroma_int,format=bgr0,pad=width=ceil(iw/2)*2:height=ceil(ih/2)*2:x=0:y=0:color=black`,
    '-frames:v', String(total),
    '-c:v', 'libx264rgb', '-qp', '0', '-preset', 'faster',
    '-g', '30', '-keyint_min', '30', '-sc_threshold', '0',
    '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1',
    '-movflags', '+faststart',
    out,
  ]);
  return { frames: total, seconds: total / FPS };
}
