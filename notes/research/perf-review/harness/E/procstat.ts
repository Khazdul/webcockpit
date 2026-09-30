// Per-thread CPU time of the browser processes Playwright started (Linux
// /proc), grouped by process type and thread name (area E harness).
import { readFileSync, readdirSync } from 'node:fs';

const TICK_MS = 1000 / 100; // CLK_TCK is 100 on Linux

interface Proc {
  pid: number;
  ppid: number;
  type: string;
}

function readStat(path: string): { comm: string; ppid: number; cpu: number } | null {
  try {
    const s = readFileSync(path, 'utf8');
    const l = s.indexOf('(');
    const r = s.lastIndexOf(')');
    const comm = s.slice(l + 1, r);
    const f = s.slice(r + 2).split(' ');
    // f[0] = state (field 3); ppid = field 4; utime = 14; stime = 15.
    return { comm, ppid: Number(f[1]), cpu: (Number(f[11]) + Number(f[12])) * TICK_MS };
  } catch {
    return null;
  }
}

function procType(pid: number): string {
  let cmd = '';
  try {
    cmd = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ');
  } catch {
    return '?';
  }
  const t = /--type=([\w-]+)/.exec(cmd);
  if (t) {
    const sub = /--utility-sub-type=([\w.]+)/.exec(cmd);
    return t[1] === 'utility' && sub ? `utility:${sub[1]!.split('.').pop()}` : t[1]!;
  }
  if (cmd.includes('-contentproc')) {
    const parts = cmd.trim().split(' ');
    return 'content:' + parts[parts.length - 1];
  }
  if (/chrome|chromium|headless_shell/.test(cmd)) return 'browser';
  if (/firefox/.test(cmd)) return 'parent';
  return cmd.split(' ')[0]!.split('/').pop() ?? '?';
}

/** All descendants of `root` (default: this Node process). */
export function descendants(root = process.pid): Proc[] {
  const all = new Map<number, number>();
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    const st = readStat(`/proc/${d}/stat`);
    if (st) all.set(Number(d), st.ppid);
  }
  const out: Proc[] = [];
  const want = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, ppid] of all) {
      if (!want.has(pid) && want.has(ppid)) {
        want.add(pid);
        grew = true;
      }
    }
  }
  want.delete(root);
  for (const pid of want) out.push({ pid, ppid: all.get(pid)!, type: procType(pid) });
  return out;
}

export type Snapshot = Map<string, { proc: string; pid: number; tid: number; thread: string; cpu: number }>;

/** CPU ms per thread of every descendant process. */
export function snapshot(procs = descendants()): Snapshot {
  const snap: Snapshot = new Map();
  for (const p of procs) {
    let tids: string[] = [];
    try {
      tids = readdirSync(`/proc/${p.pid}/task`);
    } catch {
      continue;
    }
    for (const t of tids) {
      const st = readStat(`/proc/${p.pid}/task/${t}/stat`);
      if (!st) continue;
      const tid = Number(t);
      snap.set(`${p.pid}:${t}`, { proc: p.type, pid: p.pid, tid, thread: tid === p.pid ? `${st.comm} [main]` : st.comm, cpu: st.cpu });
    }
  }
  return snap;
}

export interface CpuRow {
  proc: string;
  thread: string;
  ms: number;
}

/** Deltas between two snapshots, grouped by process type + thread name (numbers stripped). */
export function delta(a: Snapshot, b: Snapshot): CpuRow[] {
  const g = new Map<string, CpuRow>();
  for (const [k, v] of b) {
    const d = v.cpu - (a.get(k)?.cpu ?? 0);
    if (d <= 0) continue;
    const thread = v.thread.replace(/#?\d+$/, '#');
    const key = `${v.proc}|${thread}`;
    const row = g.get(key) ?? { proc: v.proc, thread, ms: 0 };
    row.ms += d;
    g.set(key, row);
  }
  return [...g.values()].sort((x, y) => y.ms - x.ms);
}

export function loadavg(): string {
  try {
    return readFileSync('/proc/loadavg', 'utf8').trim();
  } catch {
    return '?';
  }
}
