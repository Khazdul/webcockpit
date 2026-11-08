// The films to watch and upload, from Remotion's ProRes 4444 master
// (ADR 0133 addendum):
//
//   node record/master.ts out/part1-master.mov out/part1        → part1.mp4, part1-4k.mp4, part1-h264.mp4
//   node record/master.ts … --no-4k                             (skip the 4K variant)
//
//   <base>.mp4       HEVC Main10, 1920×1080, CRF 14, the film to keep
//   <base>-4k.mp4    HEVC Main10, 3840×2160 (Lanczos), CRF 16: for YouTube,
//                    which gives a 4K upload far more bitrate (its 8-bit
//                    re-encode then keeps the night sky's gradients)
//   <base>-h264.mp4  H.264 8-bit 4:2:0, CRF 12: plays anywhere (browsers)
//
// 10-bit keeps the dark gradients' steps finer than the eye; no grain is
// added: the start page's sky carries its own fine grain, which dithers,
// and added grain (tried at ±3 levels) only turned to blotches in an
// 8-bit VP9 re-encode at YouTube's 1080p bitrate.
import { spawnSync } from 'node:child_process';

const [master, base, ...flags] = process.argv.slice(2);
if (!master || !base) throw new Error('usage: node record/master.ts <master.mov> <out-base> [--no-4k]');

const tag = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
const audio = ['-c:a', 'aac', '-b:a', '320k'];
const hevc = (crf: number) => ['-c:v', 'libx265', '-preset', 'slow', '-crf', String(crf), '-tag:v', 'hvc1', '-x265-params', 'aq-mode=3:no-sao=1:log-level=error'];
const jobs: [string, string[]][] = [
  [`${base}.mp4`, ['-vf', 'format=yuv420p10le', ...hevc(14), ...tag, ...audio, '-movflags', '+faststart']],
  [`${base}-h264.mp4`, ['-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', ...tag, ...audio, '-movflags', '+faststart']],
];
if (!flags.includes('--no-4k')) {
  jobs.push([`${base}-4k.mp4`, ['-vf', 'scale=3840:2160:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p10le', ...hevc(16), ...tag, ...audio, '-movflags', '+faststart']]);
}
for (const [out, args] of jobs) {
  const t = Date.now();
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', master, ...args, out], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${out}`);
  console.log(`${out}  ${((Date.now() - t) / 1000).toFixed(0)} s`);
}
