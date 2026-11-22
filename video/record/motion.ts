// Repeated and nearly still frames in a render, as numbers (a contact sheet
// cannot show stutter):
//
//   node record/motion.ts <film.mp4> [--ref <master.mov>] [--from <s> --to <s>] [--track <take.track.json> --at <film s>]
//
// Decodes the film frame by frame, grey, at 1920 × 1080 (a 4K file is
// averaged down), and looks at the whole of the balloons' lane: from the
// game text's right to the edge, from the top to the input row, the map's
// own box left out (it stands still and covers the sky behind it).
//
// A step between two frames is
//   repeated     when no pixel changed;
//   nearly still when its most changed block changed under 35 % of the
//                median of the eight steps round it (where those move at
//                all): the eye, and tools like mpdecimate, read it as a held
//                frame though the picture is new.
// Both are listed with their times. With --ref each says where it comes
// from: `master` when the master has the same step (so it is in the take),
// `encode` when only the film has it.
//
// With --track (a stepped take's balloons per frame) the same per balloon,
// in its own box while it shows (not a sliver behind the input row or past
// the screen's edge), whatever its speed, and how many are up at once.
//
// Holds over 34 ms: two or more such steps in a row (three frames or more).
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};
const ref = opt('--ref');
const FPS = 60;
const first = Math.round(Number(opt('--from') ?? 0) * FPS);
const to = Number(opt('--to') ?? Infinity);
const count = Number.isFinite(to) ? Math.round(to * FPS) - first : Infinity;
const trackFile = opt('--track');
const at = Math.round(Number(opt('--at') ?? 0) * FPS);
const film = args[0];
if (!film) throw new Error('usage: node record/motion.ts <film.mp4> [--ref master.mov] [--from s --to s] [--track json --at s]');

const W = 1920;
const H = 1080;
const BLOCK = 16;
/** The balloons' lane, px. */
const LANE = { x: 1040, y: 0, w: 880, h: 1056 };
/** The map's box (record/lib/balloon-state.ts: a row from the top and the right). */
const MAP = { x: 1538, y: 22, w: 360, h: 286 };
/** The input row's top, px: an arriving balloon is behind it. */
const INPUT_TOP = 1056;
const NEARLY = 0.35;
/** The round-about median under this is no motion (grey levels, the most changed block's mean). */
const MOVING = 1.5;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function* grey(file: string): AsyncGenerator<Buffer> {
  const size = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim();
  const vf = Number.parseInt(size, 10) === W ? 'format=gray' : `scale=${W}:${H}:flags=area,format=gray`;
  // from just before the first frame wanted, so that frame is the first one out
  const seek = first > 0 ? ['-ss', ((first - 0.25) / FPS).toFixed(5)] : [];
  const p = spawn('ffmpeg', ['-v', 'error', ...seek, '-i', file, ...(Number.isFinite(count) ? ['-frames:v', String(count)] : []), '-an', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
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

interface Change {
  /** The most changed block's mean. */
  block: number;
  same: boolean;
}

/** How a box differs between two frames, the map's box aside. */
function change(a: Buffer, b: Buffer, r: Box): Change {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(W, Math.ceil(r.x + r.w));
  const y1 = Math.min(H, Math.ceil(r.y + r.h));
  let most = 0;
  let same = true;
  for (let by = y0; by < y1; by += BLOCK)
    for (let bx = x0; bx < x1; bx += BLOCK) {
      const yy = Math.min(y1, by + BLOCK);
      const xx = Math.min(x1, bx + BLOCK);
      if (bx >= MAP.x && xx <= MAP.x + MAP.w && by >= MAP.y && yy <= MAP.y + MAP.h) continue;
      let s = 0;
      for (let y = by; y < yy; y++) {
        const inMapRow = y >= MAP.y && y < MAP.y + MAP.h;
        for (let x = bx, i = y * W + bx; x < xx; x++, i++) {
          if (inMapRow && x >= MAP.x && x < MAP.x + MAP.w) continue;
          const d = a[i]! - b[i]!;
          s += d < 0 ? -d : d;
        }
      }
      if (s) same = false;
      most = Math.max(most, s / (BLOCK * BLOCK));
    }
  return { block: most, same };
}

const shows = (r: Box): boolean => Math.min(INPUT_TOP, r.y + r.h) - Math.max(0, r.y) >= 12 && Math.min(W, r.x + r.w) - Math.max(0, r.x) >= r.w * 0.15;

type Seen = [id: number, x: number, y: number, w: number, h: number, opacity: number];
const track = trackFile ? (JSON.parse(readFileSync(trackFile, 'utf8')) as { frames: Seen[][] }).frames : null;

interface Step {
  /** The frame it arrives at. */
  frame: number;
  /** How much of the balloon is in view (a balloon's steps). */
  part?: number;
  out: Change;
  master?: Change;
}
const lane: Step[] = [];
const balloons = new Map<number, Step[]>();
const order: number[] = [];
let mostUp = 0;

const fb = grey(film)[Symbol.asyncIterator]();
const fa = ref ? grey(ref)[Symbol.asyncIterator]() : null;
let pb: Buffer | null = null;
let pa: Buffer | null = null;
let i = 0;
for (;; i++) {
  const [nb, na] = await Promise.all([fb.next(), fa?.next()]);
  if (nb.done || na?.done) {
    if (na && nb.done !== na.done) throw new Error(`the film and its master differ in length at frame ${first + i}`);
    break;
  }
  const b = nb.value;
  const a = na?.value ?? null;
  const frame = first + i;
  const seen = track?.[frame - at] ?? [];
  mostUp = Math.max(mostUp, seen.length);
  for (const [id] of seen) if (!order.includes(id)) order.push(id);
  if (pb) {
    const step = (r: Box): Step => ({ frame, out: change(b, pb!, r), ...(a && pa ? { master: change(a, pa, r) } : {}) });
    lane.push(step(LANE));
    const before = track?.[frame - at - 1] ?? [];
    for (const [id, x, y, w, h] of seen) {
      const r = { x, y, w, h };
      if (!shows(r) || !before.some((s) => s[0] === id)) continue;
      if (!balloons.has(id)) balloons.set(id, []);
      const part = ((Math.min(W, x + w) - Math.max(0, x)) * (Math.min(INPUT_TOP, y + h) - Math.max(0, y))) / (w * h);
      balloons.get(id)!.push({ ...step(r), part });
    }
  }
  pb = b;
  pa = a;
}

type Still = { step: Step; kind: 'repeated' | 'nearly still'; from: string; share: number };

function stills(steps: readonly Step[]): Map<number, Still> {
  const out = new Map<number, Still>();
  const judge = (get: (s: Step) => Change, k: number): { kind: Still['kind'] | null; share: number } => {
    const me = get(steps[k]!);
    const round: number[] = [];
    for (let j = Math.max(0, k - 4); j <= Math.min(steps.length - 1, k + 4); j++) if (j !== k) round.push(get(steps[j]!).block);
    round.sort((p, q) => p - q);
    const med = round[round.length >> 1] ?? 0;
    if (me.same) return { kind: 'repeated', share: 0 };
    return { kind: med > MOVING && me.block < NEARLY * med ? 'nearly still' : null, share: me.block / (med || 1) };
  };
  for (let k = 0; k < steps.length; k++) {
    const { kind, share } = judge((s) => s.out, k);
    if (!kind) continue;
    let from = '';
    if (steps[k]!.master) from = judge((s) => s.master!, k).kind ? 'master' : 'encode';
    out.set(k, { step: steps[k]!, kind, from, share });
  }
  return out;
}

const ms = (frames: number): number => Math.round((frames / FPS) * 1000);
const clockText = (frame: number): string => {
  const s = frame / FPS;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`;
};

function report(name: string, steps: readonly Step[]): void {
  const found = stills(steps);
  const exact = [...found.values()].filter((s) => s.kind === 'repeated').length;
  let run = 0;
  let longest = 0;
  let long = 0;
  for (let k = 0; k <= steps.length; k++) {
    if (found.has(k)) run++;
    else {
      longest = Math.max(longest, run);
      if (run >= 2) long++;
      run = 0;
    }
  }
  const rate = (n: number, of: number): string => ((FPS * (of - n)) / Math.max(1, of)).toFixed(2);
  console.log(`${name}: ${steps.length} steps; ${rate(exact, steps.length)} new pictures/s; repeated ${exact}; nearly still ${found.size - exact}; longest hold ${ms(longest + 1)} ms; holds over 34 ms ${long}`);
  if (name.startsWith('lane')) {
    const win = 5 * FPS;
    let worst = { k: 0, n: -1, exact: 0 };
    let n = 0;
    let e = 0;
    for (let k = 0; k < steps.length; k++) {
      const add = found.get(k);
      if (add) n++;
      if (add?.kind === 'repeated') e++;
      const gone = found.get(k - win);
      if (gone) n--;
      if (gone?.kind === 'repeated') e--;
      if (k >= win - 1 && n > worst.n) worst = { k: k - win + 1, n, exact: e };
    }
    if (worst.n >= 0) console.log(`  worst 5 s from ${clockText(steps[worst.k]!.frame)}: ${rate(worst.exact, win)} new pictures/s; ${worst.n} repeated or nearly still`);
  }
  for (const f of found.values()) console.log(`  ${clockText(f.step.frame)} ${f.kind}${f.kind === 'repeated' ? '' : ` (${Math.round(f.share * 100)} % of the steps round it)`}${f.from ? ` [${f.from}]` : ''}${f.step.part === undefined ? '' : ` ${Math.round(100 * f.step.part)} % of it in view`}`);
}

console.log(`${film}: ${i} frames from ${clockText(first)}`);
report('lane, whole', lane);
if (track) {
  console.log(`balloons in view at most ${mostUp}; in the order ${order.join(' ')}`);
  for (const [id, steps] of balloons) report(`balloon ${id}`, steps);
}
