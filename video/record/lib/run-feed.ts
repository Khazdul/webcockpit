// A WebCockpit runs backup → feeds for the film (ADR 0133 addendum). The
// backup (`webcockpit-runs-*.jsonl.gz`, format at the top of
// src/runs/library.ts) holds each run's capture text in chunks; a line is
// `<16-digit µs> <body>`, the body in the record forms of
// tests/fixtures/*.log: `\x1bGMCP <pkg> <json>`, `> <command>` (what the
// player sent), other `\x1b[A-Z]…` client records (VIEW, SIZE, SPANE …,
// skipped) and the server's text lines.
//
// An excerpt (feeds/film.ts) names a run and a stretch of it in seconds
// from the run's start, with a time compression: a speed factor, ranges
// dropped (their text goes; their GMCP still arrives, at the cut, so the
// panes stay right), lines dropped by pattern, and a cap on idle gaps.
// `excerptFeed` turns it into
//
//   prime  the GMCP before the excerpt (no text): Char, Group, Room, the
//          map's position and the timers are right at its first line;
//   steps  timed Steps for `play()` (scripts/lib/mume-feed.ts): the server's
//          lines at their compressed times, commands typed visibly so that
//          their Enter lands when the player sent them.
//
// The log content stays in the gitignored video/private/; only the excerpt
// specs (run id and seconds) are committed.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { type Step, gmcpBytes, lineBytes } from '../../../scripts/lib/mume-feed.ts';

export interface RunMeta {
  runId: string;
  character: string;
  startedUs: number;
  endedUs?: number;
  [k: string]: unknown;
}

export interface RunLine {
  us: number;
  body: string;
}

export interface Run {
  meta: RunMeta;
  lines: RunLine[];
}

/** The runs of a backup file, each with its capture lines in order. */
export function loadBackup(file: string): Map<string, Run> {
  const text = gunzipSync(readFileSync(file)).toString('utf8');
  const runs = new Map<string, Run>();
  const chunks = new Map<string, { seq: number; text: string }[]>();
  for (const l of text.split('\n')) {
    if (!l) continue;
    const d = JSON.parse(l) as { type: string; run?: RunMeta; runId?: string; seq?: number; text?: string };
    if (d.type === 'run' && d.run) runs.set(d.run.runId, { meta: d.run, lines: [] });
    else if (d.type === 'chunk' && d.runId && d.text !== undefined) {
      const list = chunks.get(d.runId) ?? [];
      list.push({ seq: d.seq ?? 0, text: d.text });
      chunks.set(d.runId, list);
    }
  }
  for (const [id, list] of chunks) {
    const run = runs.get(id);
    if (!run) continue;
    for (const c of list.sort((a, b) => a.seq - b.seq)) {
      for (const l of c.text.split('\n')) {
        if (l.length < 17 || l[16] !== ' ') continue;
        run.lines.push({ us: Number(l.slice(0, 16)), body: l.slice(17) });
      }
    }
  }
  return runs;
}

export interface Excerpt {
  /** Run id, e.g. `Gittan/2026-11-08T12-07-39`. */
  run: string;
  /** Seconds from the run's start (`startedUs`). */
  from: number;
  to: number;
  /** Plays this many times faster (default 1). */
  speed?: number;
  /** Run-relative [from, to] seconds whose text and commands are cut out (their GMCP still arrives, at the cut). */
  drop?: [number, number][];
  /** Text lines (ANSI stripped) matching one of these are left out. */
  dropLines?: RegExp[];
  /** Commands matching one of these are not typed (their output still comes). */
  dropCmds?: RegExp[];
  /** A pause in the log longer than this (s, after `speed`) is shortened to it. */
  maxGap?: number;
  /** `prime` only from this second (default: the run's start): the GMCP between the previous excerpt and this one. */
  primeFrom?: number;
}

export interface ExcerptFeed {
  /** GMCP before the excerpt, no text (send before the camera rolls). */
  prime: Step[];
  /** Timed steps (`at`, ms from the excerpt's start). */
  steps: Step[];
  /** The excerpt's length after compression, ms. */
  durationMs: number;
  /** Where each run-relative second lands, ms (for markers). */
  timeOf: (runS: number) => number;
}

/** GMCP packages left out of `prime` (old channel talk would fill Comm before the excerpt). */
const PRIME_SKIP = /^Comm\.Channel\.Text$/;

const gmcpOf = (body: string): string | null => (body.startsWith('\x1bGMCP ') ? body.slice(6) : null);
const isClientRecord = (body: string): boolean => /^\x1b[A-Z]/.test(body) && !body.startsWith('\x1bGMCP ');
const plain = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

export function excerptFeed(runs: Map<string, Run>, ex: Excerpt): ExcerptFeed {
  const run = runs.get(ex.run);
  if (!run) throw new Error(`no run ${ex.run} in the backup`);
  const t0 = run.meta.startedUs;
  const rel = (us: number): number => (us - t0) / 1e6;
  const speed = ex.speed ?? 1;
  const dropped = (s: number): boolean => (ex.drop ?? []).some(([a, b]) => s >= a && s < b);

  // prime: every GMCP record before the excerpt, in order, in sends of up to 64 KiB
  const prime: Step[] = [];
  let buf: Buffer[] = [];
  let size = 0;
  for (const l of run.lines) {
    if (rel(l.us) >= ex.from) break;
    if (ex.primeFrom !== undefined && rel(l.us) < ex.primeFrom) continue;
    const g = gmcpOf(l.body);
    if (g === null || PRIME_SKIP.test(g.split(' ')[0]!)) continue;
    const b = gmcpBytes(g);
    buf.push(b);
    size += b.length;
    if (size > 65_536) {
      prime.push({ out: Buffer.concat(buf) });
      buf = [];
      size = 0;
    }
  }
  if (buf.length) prime.push({ out: Buffer.concat(buf) });

  // the time map: run seconds → excerpt ms (drops removed, speed, long gaps capped)
  const inside = run.lines.filter((l) => rel(l.us) >= ex.from && rel(l.us) < ex.to);
  const keys = [...new Set(inside.map((l) => rel(l.us)))].sort((a, b) => a - b);
  const at = new Map<number, number>();
  let clock = 0;
  let prev = ex.from;
  for (const k of keys) {
    // the seconds between prev and k that are not dropped
    let live = k - prev;
    for (const [a, b] of ex.drop ?? []) live -= Math.max(0, Math.min(b, k) - Math.max(a, prev));
    let gap = live / speed;
    if (ex.maxGap !== undefined) gap = Math.min(gap, ex.maxGap);
    clock += gap;
    at.set(k, Math.round(clock * 1000));
    prev = k;
  }
  let tail = ex.to - prev;
  for (const [a, b] of ex.drop ?? []) tail -= Math.max(0, Math.min(b, ex.to) - Math.max(a, prev));
  const durationMs = Math.round((clock + Math.min(tail / speed, ex.maxGap ?? Infinity)) * 1000);
  const timeOf = (s: number): number => {
    let best = 0;
    for (const k of keys) if (k <= s) best = at.get(k)!;
    return best;
  };

  // steps: one send per timestamp (text and GMCP in log order), commands on their own
  const steps: Step[] = [];
  let out: Buffer[] = [];
  let outAt = 0;
  const flush = (): void => {
    if (out.length) steps.push({ out: Buffer.concat(out), at: outAt });
    out = [];
  };
  for (const l of inside) {
    const s = rel(l.us);
    const ms = at.get(s)!;
    if (out.length && ms !== outAt) flush();
    outAt = ms;
    const g = gmcpOf(l.body);
    if (g !== null) {
      out.push(gmcpBytes(g));
      continue;
    }
    if (isClientRecord(l.body) || dropped(s)) continue;
    if (l.body.startsWith('> ')) {
      const cmd = l.body.slice(2);
      if ((ex.dropCmds ?? []).some((r) => r.test(cmd))) continue;
      flush();
      steps.push({ cmd, at: ms });
      continue;
    }
    if ((ex.dropLines ?? []).some((r) => r.test(plain(l.body)))) continue;
    out.push(lineBytes(l.body));
  }
  flush();
  return { prime, steps, durationMs, timeOf };
}
