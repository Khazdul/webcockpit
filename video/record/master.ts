// The films to watch and upload, from Remotion's ProRes 4444 master
// (ADR 0133 addendum):
//
//   node record/master.ts out/part1-master.mov out/part1        → part1.mp4, part1-youtube.mp4, part1-h264.mp4
//   node record/master.ts … --no-4k                             (skip the YouTube 4K variant)
//
//   <base>.mp4          HEVC Main10, 1920×1080, CRF 14, the film to keep
//   <base>-youtube.mp4  H.264 High 8-bit, 3840×2160 (Lanczos), CRF 14 (about
//                       18 Mbit/s), closed GOP of 30 (half the frame rate),
//                       AAC 384k: the upload, as YouTube recommends. YouTube
//                       gives a 4K upload far more bitrate, and its re-encode
//                       then keeps the night sky's gradients. A first upload
//                       as HEVC Main10 4K at CRF 16 (about 3 Mbit/s) showed
//                       about a second of broken picture on YouTube where
//                       the whole frame changes colour (Black → Paper);
//                       this file played clean (owner, 2026-11-08).
//   <base>-h264.mp4     H.264 8-bit 4:2:0, CRF 12: plays anywhere (browsers)
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
  jobs.push([`${base}-youtube.mp4`, ['-vf', 'scale=3840:2160:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p', '-r', '60', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-maxrate', '80M', '-bufsize', '160M', '-profile:v', 'high', '-level', '5.2', '-g', '30', '-bf', '2', '-flags', '+cgop', ...tag, '-c:a', 'aac', '-b:a', '384k', '-ar', '48000', '-movflags', '+faststart']]);
}
for (const [out, args] of jobs) {
  const t = Date.now();
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', master, ...args, out], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${out}`);
  console.log(`${out}  ${((Date.now() - t) / 1000).toFixed(0)} s`);
}
