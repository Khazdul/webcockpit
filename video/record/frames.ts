// Contact sheet of a recording or a render, for checking a take by eye:
//
//   node record/frames.ts <video.mp4> <out.png> <t1> <t2> …        (seconds; 3 a row, 640 px wide)
//   node record/frames.ts <video.mp4> <out.png> --every 5 [--cols 6 --w 480]   (a frame every 5 s)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name: string, d: number): number => {
  const i = args.indexOf(name);
  if (i < 0) return d;
  const v = Number(args[i + 1]);
  args.splice(i, 2);
  return v;
};
const every = opt('--every', 0);
const cols = opt('--cols', 3);
const tw = opt('--w', 640);
const th = Math.round((tw * 9) / 16);
const [video, out, ...given] = args;
if (!video || !out) throw new Error('usage: node record/frames.ts <video> <out.png> (<t…> | --every <s>)');
let times = given;
if (every > 0) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' });
  const dur = Number(r.stdout.trim());
  times = [];
  for (let t = 0; t < dur - 0.1; t += every) times.push(t.toFixed(2));
}
if (!times.length) throw new Error('no times');
const mmss = (t: string): string => {
  const s = Number(t);
  return `${Math.floor(s / 60)}\\:${(s % 60).toFixed(1).padStart(4, '0')}`;
};
const dir = mkdtempSync(join(tmpdir(), 'wc-frames-'));
try {
  const files = times.map((t, i) => {
    const f = join(dir, `${i}.png`);
    const label = `drawtext=text='${every > 0 ? mmss(t) : `${t}s`}':x=8:y=8:fontsize=${Math.round(tw / 23)}:fontcolor=yellow:box=1:boxcolor=black@0.6`;
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', t, '-i', video, '-frames:v', '1', '-vf', `scale=${tw}:${th},${label}`, f]);
    if (r.status !== 0) throw new Error(String(r.stderr));
    return f;
  });
  while (files.length % cols) files.push(files[files.length - 1]!);
  const inputs = files.flatMap((f) => ['-i', f]);
  const layout = files.map((_, i) => `${(i % cols) * tw}_${Math.floor(i / cols) * th}`).join('|');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `xstack=inputs=${files.length}:layout=${layout}`, out]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  console.log(out);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
