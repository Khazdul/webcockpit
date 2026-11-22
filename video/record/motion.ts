// Repeated frames in a render, as numbers (a contact sheet cannot show
// stutter):
//
//   node record/motion.ts <film.mp4> --ref <master.mov> --from <s> --to <s> [--track <take.track.json> --at <film s>]
//
// Reads the film and its ProRes master frame by frame, grey, in the balloons'
// lane (right of the game text, under the map). ProRes is intra only, so a
// repeated source frame is exactly the same there (difference 0): that is
// the truth of a hold. The encoded film must show the same pictures: each of
// its steps between frames is compared with the master's, and a step the
// master has and the film lost counts as a hold too (`lost`).
//
// With --track (a stepped take's balloons per frame) the same per balloon,
// in its own box, while it moves at 6 px/s or more and shows (not a sliver
// behind the input row or past the screen's edge): the interval
// distribution of the moving balloons.
//
// Reported for the whole stretch and its worst 5 s: changed frames a
// second, the longest hold, holds over 33 ms, how evenly the new pictures
// come.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};
const ref = opt('--ref');
const from = Number(opt('--from') ?? 0);
const to = Number(opt('--to') ?? Infinity);
const trackFile = opt('--track');
const at = Number(opt('--at') ?? 0);
const film = args[0];
if (!film || !ref) throw new Error('usage: node record/motion.ts <film.mp4> --ref <master.mov> [--from s --to s] [--track json --at s]');

const FPS = 60;
const W = 1920;
const H = 1080;
/** The balloons' lane, px. */
const LANE = { x: 1040, y: 336, w: 864, h: 736 };
const BLOCK = 16;

async function* grey(file: string): AsyncGenerator<Buffer> {
  const p = spawn('ffmpeg', ['-v', 'error', '-ss', String(from), ...(Number.isFinite(to) ? ['-t', String(to - from)] : []), '-i', file, '-vf', 'format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let cur = Buffer.allocUnsafe(W * H);
  let n = 0;
  for await (let c of p.stdout as AsyncIterable<Buffer>) {
    while (c.length) {
      const k = Math.min(c.length, cur.length - n);
      c.copy(cur, n, 0, k);
      n += k;
      c = c.subarray(k);
      if (n < cur.length) break;
      yield cur;
      cur = Buffer.allocUnsafe(W * H);
      n = 0;
    }
  }
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The input row's top, px: an arriving balloon is behind it. */
const INPUT_TOP = 1056;
/**
 * Something of the balloon shows: more of it above the input row than its
 * envelope's empty margin (12 px), and at the screen's sides more than the
 * rig's empty margin (15 % of its width).
 */
const shows = (r: Box): boolean => Math.min(INPUT_TOP, r.y + r.h) - Math.max(0, r.y) >= 12 && Math.min(W, r.x + r.w) - Math.max(0, r.x) >= r.w * 0.15;

/** How a box differs between two frames: the most changed block's mean, and the whole box's mean. */
function change(a: Buffer, b: Buffer, r: Box): { block: number; mean: number } {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(W, Math.ceil(r.x + r.w));
  const y1 = Math.min(H, Math.ceil(r.y + r.h));
  let most = 0;
  let all = 0;
  for (let by = y0; by < y1; by += BLOCK)
    for (let bx = x0; bx < x1; bx += BLOCK) {
      const yy = Math.min(y1, by + BLOCK);
      const xx = Math.min(x1, bx + BLOCK);
      let s = 0;
      for (let y = by; y < yy; y++)
        for (let i = y * W + bx, e = y * W + xx; i < e; i++) {
          const d = a[i]! - b[i]!;
          s += d < 0 ? -d : d;
        }
      all += s;
      most = Math.max(most, s / ((yy - by) * (xx - bx)));
    }
  return { block: most, mean: all / Math.max(1, (x1 - x0) * (y1 - y0)) };
}

/**
 * The master changed here and the film did not follow: the film's step is
 * under a quarter of the master's (only where the master's step stands
 * clear of the encoder's noise, about 1.5 levels in a block).
 */
const lost = (master: { block: number }, out: { block: number }): boolean => master.block > 6 && out.block < master.block / 4;

type Seen = [id: number, x: number, y: number, w: number, h: number, opacity: number];
const track = trackFile ? (JSON.parse(readFileSync(trackFile, 'utf8')) as { frames: Seen[][] }).frames : null;

interface Step {
  held: boolean;
  lost: boolean;
}
const lane: Step[] = [];
const boxes = new Map<string, Step>(); // `${id}:${frame}`
const a = grey(ref)[Symbol.asyncIterator]();
const b = grey(film)[Symbol.asyncIterator]();
let pa: Buffer | null = null;
let pb: Buffer | null = null;
let i = 0;
for (;; i++) {
  const [na, nb] = await Promise.all([a.next(), b.next()]);
  if (na.done || nb.done) {
    if (na.done !== nb.done) throw new Error(`the film and its master differ in length at frame ${i}`);
    break;
  }
  if (pa && pb) {
    const m = change(na.value, pa, LANE);
    lane.push({ held: m.block === 0, lost: lost(m, change(nb.value, pb, LANE)) });
    const k = Math.round((from - at) * FPS) + i;
    for (const [id, x, y, w, h] of track?.[k] ?? []) {
      const was = track![k - 1]?.find((s) => s[0] === id);
      // the envelope's and the car's middle move with it
      if (!was || Math.hypot(x + w / 2 - was[1] - was[3] / 2, y - was[2]) < 6 / FPS) continue;
      const r = { x, y, w, h };
      if (!shows(r)) continue;
      const bm = change(na.value, pa, r);
      boxes.set(`${id}:${i}`, { held: bm.block === 0, lost: lost(bm, change(nb.value, pb, r)) });
    }
  }
  pa = na.value;
  pb = nb.value;
}

const ms = (frames: number): number => Math.round((frames / FPS) * 1000);
interface Stats {
  fps: number;
  held: number;
  longest: number;
  over33: number;
  hist: number[];
  uneven: number;
}
function stats(s: readonly Step[]): Stats {
  const hist: number[] = [];
  let run = 1;
  let held = 0;
  let uneven = 0;
  let last = 0;
  let longest = 1;
  for (const x of s) {
    if (x.held || x.lost) {
      run++;
      held++;
      longest = Math.max(longest, run);
      continue;
    }
    hist[run] = (hist[run] ?? 0) + 1;
    if (last && run !== last) uneven++;
    last = run;
    run = 1;
  }
  if (run > 1) hist[run] = (hist[run] ?? 0) + 1;
  let over33 = 0;
  hist.forEach((n, k) => {
    if (k > 2) over33 += n;
  });
  return { fps: ((s.length - held) / Math.max(1, s.length)) * FPS, held, longest: ms(longest), over33, hist, uneven };
}
const say = (name: string, s: Stats, total: number): void => {
  const intervals = s.hist.map((n, k) => (n ? `${ms(k)} ms: ${n}` : '')).filter(Boolean).join(', ');
  console.log(`${name}: ${s.fps.toFixed(1)} new pictures/s, ${s.held} of ${total} steps repeated, longest hold ${s.longest} ms, holds over 33 ms: ${s.over33}, changes of cadence: ${s.uneven}\n  intervals: ${intervals}`);
};

console.log(`${film}: ${i} frames, ${from}–${(from + i / FPS).toFixed(1)} s`);
say('lane, whole', stats(lane), lane.length);
console.log(`  steps the master has and the film lost: ${lane.filter((s) => s.lost).length}`);
const win = 5 * FPS;
let worst = { at: 0, held: -1 };
let held = 0;
for (let k = 0; k < lane.length; k++) {
  held += Number(lane[k]!.held || lane[k]!.lost);
  if (k >= win) held -= Number(lane[k - win]!.held || lane[k - win]!.lost);
  if (k >= win - 1 && held > worst.held) worst = { at: k - win + 1, held };
}
const worstSteps = lane.slice(worst.at, worst.at + win);
say(`lane, worst 5 s (${(from + worst.at / FPS).toFixed(1)} s)`, stats(worstSteps), worstSteps.length);
const holds: string[] = [];
for (let k = 0, run = 0; k <= lane.length; k++) {
  if (k < lane.length && (lane[k]!.held || lane[k]!.lost)) run++;
  else {
    if (run >= 2) holds.push(`${(from + (k - run) / FPS).toFixed(2)} (${ms(run + 1)} ms)`);
    run = 0;
  }
}
if (holds.length) console.log(`  holds over 33 ms at: ${holds.slice(0, 40).join(', ')}${holds.length > 40 ? ', …' : ''}`);

if (track) {
  const by = new Map<string, Step[]>();
  for (const [key, s] of boxes) {
    const id = key.split(':')[0]!;
    by.set(id, [...(by.get(id) ?? []), s]);
  }
  const all: Step[] = [];
  let longest = 0;
  for (const [id, s] of by) {
    const st = stats(s);
    longest = Math.max(longest, st.longest);
    all.push(...s);
    console.log(`  balloon ${id}: ${s.length} moving steps, ${st.held} repeated, longest hold ${st.longest} ms`);
  }
  say('moving balloons, all', stats(all), all.length);
}
