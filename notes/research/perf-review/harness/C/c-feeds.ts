// Load feeds for the input-latency harness (area C). Pure Node; imports
// the app's own log → telnet frame encoder (src/net/replay-socket.ts).
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { RUNS, ROOT } from './lib.ts';
import { resolve } from 'node:path';

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
const { logToFrames } = (await import('../src/net/replay-socket.ts')) as typeof import('../src/net/replay-socket.ts');

export const HELP_LOG = `${RUNS}/Rasta/2026-09-30T00-11-08.log`;
export const BURST_LOG = `${RUNS}/Rasta/2026-09-18T18-11-42.log`;

function lines(path: string): string[] {
  return readFileSync(path, 'utf8').split('\n');
}

/** The three pages of MUME's `help 24-bit colours` as the server sent them (CR LF). */
export function helpPages(): string[] {
  const all = lines(HELP_LOG);
  const page = (a: number, b: number) =>
    all
      .slice(a - 1, b)
      .map((l) => l.slice(l.indexOf(' ') + 1))
      .join('\r\n') + '\r\n';
  return [page(230, 275), page(277, 322), page(324, 354)];
}

export function burstText(): string {
  return readFileSync(BURST_LOG, 'utf8');
}

const GMCP_RE = /^\d{16} \x1bGMCP /;

/** GMCP login records (Comm.Channel.List, Char.Name, StatusVars, Vitals, Group.Set) as a log. */
export function loginLog(ts: number): string {
  const demo = lines(resolve(ROOT, 'tests/fixtures/gmcp-demo.log')).filter((l) => GMCP_RE.test(l));
  const want = ['Comm.Channel.List', 'Char.Name', 'Char.StatusVars', 'Char.Vitals', 'Group.Set'];
  const out: string[] = [];
  for (const w of want) {
    const l = demo.find((x) => x.includes(`GMCP ${w} `));
    if (l) out.push(`${ts} ${l.slice(l.indexOf(' ') + 1)}`);
  }
  return out.join('\n') + '\n';
}

/** Frames (bytes) for a log at speed 0 (one or a few frames). */
export function framesOf(logText: string, speed = 0): { atMs: number; b64: string }[] {
  return [...logToFrames(logText, { speed })].map((f) => ({ atMs: f.atMs, b64: Buffer.from(f.bytes).toString('base64') }));
}

/**
 * Normal play: a busy-but-typical window of the big Rasta log (the 90th
 * percentile of lines per `windowS` s), with GMCP from the fixtures mixed
 * in (a Char.Vitals after every prompt, and one of the other records —
 * Room.Info, Event.Moved, Group.*, Comm.Channel.Text — after every 8th
 * line), at speed 1.
 */
export function playFrames(windowS = 90): { frames: { atMs: number; b64: string }[]; info: string } {
  const all = lines(BURST_LOG).filter((l) => /^\d{16} /.test(l));
  const ts = all.map((l) => Number(l.slice(0, 16)));
  const W = windowS * 1e6;
  const counts: { i: number; n: number }[] = [];
  let j = 0;
  for (let i = 0; i < all.length; i += 50) {
    while (j < all.length && ts[j]! < ts[i]! + W) j++;
    counts.push({ i, n: j - i });
  }
  const sorted = [...counts].sort((a, b) => a.n - b.n);
  const pick = sorted[Math.floor(sorted.length * 0.9)]!;
  let end = pick.i;
  while (end < all.length && ts[end]! < ts[pick.i]! + W) end++;
  const seg = all.slice(pick.i, end);

  const demo = lines(resolve(ROOT, 'tests/fixtures/gmcp-demo.log')).filter((l) => GMCP_RE.test(l));
  const map = lines(resolve(ROOT, 'tests/fixtures/map-demo.log')).filter((l) => GMCP_RE.test(l));
  const body = (l: string) => l.slice(l.indexOf(' ') + 1);
  const vitals = demo.filter((l) => l.includes('GMCP Char.Vitals ')).map(body);
  const skip = /GMCP (Char\.Name|Char\.StatusVars|Comm\.Channel\.List) /;
  const pool = [...demo.filter((l) => !skip.test(l) && !l.includes('GMCP Char.Vitals ')), ...map.filter((l) => !skip.test(l))].map(body);
  const out: string[] = [];
  let v = 0;
  let p = 0;
  let n = 0;
  let gm = 0;
  for (const l of seg) {
    out.push(l);
    const stamp = l.slice(0, 16);
    const text = l.slice(17).replace(/\x1b\[[0-9;]*m/g, '').trim();
    if (text.endsWith('>') && !l.slice(17).startsWith('> ')) {
      out.push(`${stamp} ${vitals[v++ % vitals.length]}`);
      gm++;
    }
    if (++n % 8 === 0) {
      out.push(`${stamp} ${pool[p++ % pool.length]}`);
      gm++;
    }
  }
  const text = out.join('\n') + '\n';
  const frames = framesOf(text, 1);
  const bytes = frames.reduce((a, f) => a + Buffer.from(f.b64, 'base64').length, 0);
  return {
    frames,
    info: `Rasta/2026-09-18T18-11-42.log lines ${pick.i + 1}–${end} (${seg.length} lines in ${windowS} s, 90th percentile window), ${gm} GMCP records mixed in, ${frames.length} frames, ${(bytes / 1024).toFixed(0)} KB, last frame at ${(frames.at(-1)!.atMs / 1000).toFixed(1)} s`,
  };
}
