// Contact sheet of a recording or a render, for checking a take by eye:
//
//   node record/frames.ts <video.mp4> <out.png> <t1> <t2> …   (seconds; 3 per row, 640 px wide each)
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [video, out, ...times] = process.argv.slice(2);
if (!video || !out || !times.length) throw new Error('usage: node record/frames.ts <video> <out.png> <t…>');
const dir = mkdtempSync(join(tmpdir(), 'wc-frames-'));
try {
  const files = times.map((t, i) => {
    const f = join(dir, `${i}.png`);
    const label = `drawtext=text='${t}s':x=10:y=10:fontsize=28:fontcolor=yellow:box=1:boxcolor=black@0.6`;
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', t, '-i', video, '-frames:v', '1', '-vf', `scale=640:360,${label}`, f]);
    if (r.status !== 0) throw new Error(String(r.stderr));
    return f;
  });
  const cols = 3;
  while (files.length % cols) files.push(files[files.length - 1]!);
  const inputs = files.flatMap((f) => ['-i', f]);
  // tiles of 640×360 (16:9 sources)
  const layout = files.map((_, i) => `${(i % cols) * 640}_${Math.floor(i / cols) * 360}`).join('|');
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `xstack=inputs=${files.length}:layout=${layout}`, out]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  console.log(out);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
