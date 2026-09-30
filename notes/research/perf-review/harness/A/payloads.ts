// Payloads for the area-A render harnesses, cut from the owner's Cockpit logs
// (read-only). Each payload is telnet bytes as MUME would send them (lines
// end in CR LF; prompt-like lines end in IAC GA; src/net/replay-socket.ts
// FrameBuilder), either as one frame ("one-shot") or as the frames the log's
// timestamps give at speed 1 ("timed").
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return next(specifier + '.ts', context);
      throw err;
    }
  },
});
const { FrameBuilder, logToFrames } = await import('../src/net/replay-socket.ts');

export const RUNS = '/home/ole/MUME/data/runs';
export const REPRO_LOG = `${RUNS}/Rasta/2026-09-30T00-11-08.log`;
export const BIG_LOG = `${RUNS}/Rasta/2026-09-18T18-11-42.log`;

const cache = new Map<string, string[]>();
function logLines(path: string): string[] {
  let l = cache.get(path);
  if (!l) {
    l = readFileSync(path, 'utf8').split('\n');
    cache.set(path, l);
  }
  return l;
}

/** Log lines [from, to] (1-based, inclusive) as log text, outbound lines dropped. */
export function slice(path: string, from: number, to: number): string[] {
  return logLines(path)
    .slice(from - 1, to)
    .filter((l) => /^\d{16} /.test(l) && !l.slice(17).startsWith('> ') && l.slice(17) !== '>');
}

const SGR = /\x1b\[([0-9;]*)m/g;

/** Body of a log line (after "<ts> "). */
const body = (l: string) => l.slice(17);
const withBody = (l: string, b: string) => l.slice(0, 17) + b;

export function stripSgr(lines: string[]): string[] {
  return lines.map((l) => withBody(l, body(l).replace(SGR, '')));
}

const CUBE = [0, 0x5f, 0x87, 0xaf, 0xd7, 0xff];
function nearestCube(v: number): number {
  let best = 0;
  for (let i = 1; i < 6; i++) if (Math.abs(CUBE[i]! - v) < Math.abs(CUBE[best]! - v)) best = i;
  return best;
}
function to256(r: number, g: number, b: number): number {
  return 16 + 36 * nearestCube(r) + 6 * nearestCube(g) + nearestCube(b);
}
const ANSI16 = [
  [0, 0, 0], [170, 0, 0], [0, 170, 0], [170, 85, 0], [0, 0, 170], [170, 0, 170], [0, 170, 170], [170, 170, 170],
  [85, 85, 85], [255, 85, 85], [85, 255, 85], [255, 255, 85], [85, 85, 255], [255, 85, 255], [85, 255, 255], [255, 255, 255],
];
function to16(r: number, g: number, b: number): number {
  let best = 0;
  let bd = Infinity;
  ANSI16.forEach(([R, G, B], i) => {
    const d = (R! - r) ** 2 + (G! - g) ** 2 + (B! - b) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Rewrites every 24-bit SGR colour to the nearest 256-colour (or 16-colour) index. */
export function mapTruecolor(lines: string[], mode: '256' | '16'): string[] {
  return lines.map((l) =>
    withBody(
      l,
      body(l).replace(SGR, (_m, p: string) => {
        const ps = p.split(';');
        const out: string[] = [];
        for (let i = 0; i < ps.length; i++) {
          const x = ps[i]!;
          if ((x === '38' || x === '48') && ps[i + 1] === '2') {
            const [r, g, b] = [Number(ps[i + 2]), Number(ps[i + 3]), Number(ps[i + 4])];
            i += 4;
            if (mode === '256') out.push(x, '5', String(to256(r, g, b)));
            else {
              const c = to16(r, g, b);
              const base = x === '38' ? (c < 8 ? 30 : 90) : c < 8 ? 40 : 100;
              out.push(String(base + (c % 8)));
            }
          } else out.push(x);
        }
        return `\x1b[${out.join(';')}m`;
      }),
    ),
  );
}

/**
 * Rewrites every 24-bit SGR colour to a palette index that cycles through
 * `lo..hi`, so neighbouring runs never merge: the same run structure as the
 * 24-bit page, but palette colours (inline style for 16–255 today, classes
 * for 0–15). Not the page's look; for cost comparisons only.
 */
export function cyclePalette(lines: string[], lo: number, hi: number): string[] {
  let k = 0;
  return lines.map((l) =>
    withBody(
      l,
      body(l).replace(SGR, (_m, p: string) => {
        const ps = p.split(';');
        const out: string[] = [];
        for (let i = 0; i < ps.length; i++) {
          const x = ps[i]!;
          if ((x === '38' || x === '48') && ps[i + 1] === '2') {
            i += 4;
            const c = lo + (k++ % (hi - lo + 1));
            if (x === '38') {
              // Keep the row's foreground fixed, as on the page (white text).
              out.push(...(hi < 16 ? ['97'] : ['38', '5', '231']));
            } else if (hi < 16) out.push(String((c < 8 ? 40 : 100) + (c % 8)));
            else out.push('48', '5', String(c));
          } else out.push(x);
        }
        return `\x1b[${out.join(';')}m`;
      }),
    ),
  );
}

/** The log lines as one telnet frame (one-shot delivery). */
export function oneShot(lines: string[]): Uint8Array {
  const fb = new FrameBuilder();
  for (const l of lines) fb.inbound(body(l));
  return fb.take();
}

/** The log lines as frames with delivery times at speed 1 (as ReplaySocket gives them). */
export function timed(lines: string[]): Array<{ atMs: number; bytes: Uint8Array }> {
  return [...logToFrames(lines.join('\n') + '\n', { speed: 1 })].map((f) => ({ atMs: f.atMs, bytes: f.bytes }));
}

export interface Payload {
  name: string;
  what: string;
  lines: string[];
}

/**
 * Scenarios (1-based line numbers in the logs):
 * - p24a / p24b: `help 24-bit colours`, pages 1 and 2 (REPRO_LOG 230–275, 277–352).
 * - p24s: p24a with the SGR removed (the floor: same characters, one text node per row).
 * - p256: p24a with each 24-bit colour mapped to the nearest xterm-256 index (same run structure).
 * - p16: p24a mapped to the 16 ANSI colours (runs merge where neighbours map alike; classes only).
 * - ansi: `help ansi codes` page (REPRO_LOG 150–196), SGR in the 16-colour range.
 * - info: an `info` output with khazdul highlights (BIG_LOG 21323–21357, 35 lines).
 * - room: a `look` in a fight (BIG_LOG 71252–71267).
 * - combat: a combat round (BIG_LOG 71211–71214: 2 lines + prompt).
 */
export function payloads(): Payload[] {
  const p24a = slice(REPRO_LOG, 230, 275);
  return [
    { name: 'p24a', what: 'help 24-bit colours, page 1 (46 lines)', lines: p24a },
    { name: 'p24b', what: 'help 24-bit colours, page 2', lines: slice(REPRO_LOG, 277, 352) },
    { name: 'p24s', what: 'page 1, SGR stripped', lines: stripSgr(p24a) },
    { name: 'p256', what: 'page 1, 24-bit → 256-colour', lines: mapTruecolor(p24a, '256') },
    { name: 'p16', what: 'page 1, 24-bit → 16-colour', lines: mapTruecolor(p24a, '16') },
    { name: 'p256x', what: 'page 1 run structure, bg cycling 256-colour indices 16–255 (fg 231)', lines: cyclePalette(p24a, 16, 255) },
    { name: 'p16x', what: 'page 1 run structure, bg cycling 16 colours (fg 97)', lines: cyclePalette(p24a, 0, 15) },
    { name: 'ansi', what: 'help ansi codes, page 1', lines: slice(REPRO_LOG, 151, 196) },
    { name: 'info', what: 'info (35 lines, highlights)', lines: slice(BIG_LOG, 21323, 21357) },
    { name: 'room', what: 'look in a fight (15 lines)', lines: slice(BIG_LOG, 71252, 71267) },
    { name: 'combat', what: 'combat round (3 lines + prompt)', lines: slice(BIG_LOG, 71211, 71214) },
  ];
}

/** `n` lines of ordinary play from BIG_LOG starting at `from` (for prefill / catch-up). */
export function playLines(n: number, from = 60000): string[] {
  const out: string[] = [];
  const all = logLines(BIG_LOG);
  for (let i = from - 1; i < all.length && out.length < n; i++) {
    const l = all[i]!;
    if (!/^\d{16} /.test(l) || l.slice(17).startsWith('> ')) continue;
    out.push(l);
  }
  return out;
}
