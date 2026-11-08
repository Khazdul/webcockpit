// Which final encoding holds the dark gradients? (ADR 0133 addendum.)
//
//   node record/master-test.ts <master.mov> <t0> <dur> <out-dir> <crop w:h:x:y> <t-in-segment>
//
// Cuts `dur` s from the master at `t0`, encodes it in each candidate way,
// re-encodes each the way YouTube would (8-bit VP9 at a 1080p60 bitrate),
// and saves the same contrast-boosted crop of each, plus a montage.
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [master, t0, dur, out, crop, at] = process.argv.slice(2);
if (!master || !t0 || !dur || !out || !crop || !at) throw new Error('usage: node record/master-test.ts <master.mov> <t0> <dur> <out-dir> <w:h:x:y> <t>');
mkdirSync(out, { recursive: true });
const BOOST = "curves=all='0/0 0.25/1 1/1'";

function ff(args: string[]): void {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
}

const tag = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
/** A fine temporal grain: ±a few 8-bit levels of noise, added in 8-bit 4:4:4 before the 10-bit conversion. */
const grain = (s: number): string => `format=yuv444p,noise=alls=${s}:allf=t,`;
const variants: [string, string, string[]][] = [
  ['h264-8bit-crf14', 'mp4', ['-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', ...tag]],
  ['h264-10bit-crf14', 'mp4', ['-vf', 'format=yuv420p10le', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', ...tag]],
  ['h264-10bit-crf14-grain3', 'mp4', ['-vf', `${grain(3)}format=yuv420p10le`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'grain', ...tag]],
  ['hevc-10bit-crf14-grain3', 'mp4', ['-vf', `${grain(3)}format=yuv420p10le`, '-c:v', 'libx265', '-preset', 'slow', '-crf', '14', '-tag:v', 'hvc1', '-x265-params', 'tune=grain:log-level=error', ...tag]],
  ['h264-8bit-crf14-grain3', 'mp4', ['-vf', `${grain(3)}format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'grain', ...tag]],
];
const crops: string[] = [];
const cropOf = (file: string, name: string): void => {
  const png = join(out, `crop-${name}.png`);
  ff(['-ss', at, '-i', file, '-frames:v', '1', '-vf', `crop=${crop},${BOOST},drawtext=text='${name}':x=6:y=6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.7`, png]);
  crops.push(png);
};
const seg = join(out, 'segment.mov');
ff(['-ss', t0, '-t', dur, '-i', master, '-an', '-c:v', 'copy', seg]);
cropOf(seg, 'master');
for (const [name, ext, args] of variants) {
  const file = join(out, `${name}.${ext}`);
  ff(['-i', seg, ...args, file]);
  const mbps = ((statSync(file).size * 8) / Number(dur) / 1e6).toFixed(1);
  cropOf(file, `${name} ${mbps}Mbps`);
  // YouTube-like: 8-bit VP9 at about 1080p60's bitrate
  const yt = join(out, `${name}-yt.webm`);
  ff(['-i', file, '-vf', 'format=yuv420p', '-c:v', 'libvpx-vp9', '-b:v', '6M', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', yt]);
  cropOf(yt, `${name} then VP9 6M`);
}
const [w, h] = crop.split(':').map(Number) as [number, number];
const cols = 2;
while (crops.length % cols) crops.push(crops.at(-1)!);
const layout = crops.map((_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join('|');
ff([...crops.flatMap((c) => ['-i', c]), '-filter_complex', `xstack=inputs=${crops.length}:layout=${layout}`, join(out, 'montage.png')]);
console.log(join(out, 'montage.png'));
