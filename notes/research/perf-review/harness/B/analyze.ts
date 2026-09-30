// Area B perf harness: attributes a V8 CPU profile (Node or Chromium CDP
// `.cpuprofile`) or a sampling heap profile to source modules and
// functions, through source maps.
//
// Attribution: each sample's leaf is walked up to the first frame that maps
// to a file under src/ (or perf/); natives called from there (String
// slice, RegExp exec, TextDecoder …) count for that frame. GC, idle and
// program pseudo-frames are their own buckets.

import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';

export interface CallFrame {
  functionName: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

export interface CpuProfile {
  nodes: Array<{ id: number; callFrame: CallFrame; children?: number[] }>;
  samples: number[];
  timeDeltas: number[];
  startTime: number;
  endTime: number;
}

export interface HeapNode {
  callFrame: CallFrame;
  selfSize: number;
  id: number;
  children: HeapNode[];
}

export interface Where {
  /** Source file relative to the repo (src/…), or '' when unmapped. */
  file: string;
  /** Original function name (from the map) or the frame's name. */
  fn: string;
  line: number;
}

export type MapResolver = (url: string) => TraceMap | null;

const COPY_OF: Record<string, string> = {
  assembler: 'src/text/assembler.ts',
  telnet: 'src/net/telnet.ts',
  session: 'src/net/session.ts',
  engine: 'src/script/engine/engine.ts',
};

/** Maps a frame to its original position (cached per frame). */
export function makeMapper(resolve: MapResolver): (cf: CallFrame) => Where {
  const cache = new Map<string, Where>();
  return (cf) => {
    const key = `${cf.url}:${cf.lineNumber}:${cf.columnNumber}:${cf.functionName}`;
    let w = cache.get(key);
    if (w) return w;
    w = { file: '', fn: cf.functionName || '(anonymous)', line: cf.lineNumber + 1 };
    const tm = cf.url ? resolve(cf.url) : null;
    if (tm && cf.lineNumber >= 0) {
      const p = originalPositionFor(tm, { line: cf.lineNumber + 1, column: Math.max(0, cf.columnNumber) });
      if (p.source) {
        const i = p.source.lastIndexOf('/src/');
        const j = p.source.lastIndexOf('/perf/');
        const k = p.source.lastIndexOf('/node_modules/');
        let file = k >= 0 ? 'node_modules' + p.source.slice(k + 13) : i >= 0 ? p.source.slice(i + 1) : j >= 0 ? p.source.slice(j + 1) : p.source;
        // The Node A/B copies (perf/base, perf/p1..p4) count as the modules they copy.
        const copy = /^perf\/(?:base|p\d)\/(assembler|telnet|session|engine)\.ts$/.exec(file);
        if (copy) file = COPY_OF[copy[1]!]!;
        w = { file, fn: cf.functionName || p.name || '(anonymous)', line: p.line ?? 0 };
      }
    }
    cache.set(key, w);
    return w;
  };
}

/** The stage a source file belongs to. */
export function stageOf(file: string): string {
  if (file.startsWith('src/net/telnet') || file.startsWith('src/net/session') || file.startsWith('src/net/ws-transport')) return 'telnet+session';
  if (file.startsWith('src/net/gmcp')) return 'gmcp parse';
  if (file.startsWith('src/text/')) return 'assembler';
  if (file.startsWith('src/core/bus')) return 'bus';
  if (file.startsWith('src/core/')) return 'core';
  if (file.startsWith('src/script/engine/engine')) return 'engine';
  if (file.startsWith('src/script/engine/pattern')) return 'engine: pattern';
  if (file.startsWith('src/script/engine/runs') || file.startsWith('src/script/engine/color')) return 'engine: runs/color';
  if (file.startsWith('src/script/')) return 'engine: other';
  if (file.startsWith('src/timers/')) return 'timers trackers';
  if (file.startsWith('src/runs/')) return 'run events';
  if (file.startsWith('src/gmcp/')) return 'game state';
  if (file.startsWith('src/capture/')) return 'recorder';
  if (file.startsWith('src/ui/output-pane') || file.startsWith('src/ui/palette')) return 'output pane';
  if (file.startsWith('src/map/')) return 'map (main thread)';
  if (file.startsWith('src/app/bench-hook')) return 'bench probe';
  if (file.startsWith('src/app/')) return 'app';
  if (file.startsWith('src/panes/')) return 'panes';
  if (file.startsWith('src/layout/') || file.startsWith('src/theme/') || file.startsWith('src/ui/')) return 'ui other';
  if (file.startsWith('src/')) return 'src other';
  if (file.startsWith('perf/')) return 'harness';
  if (file.startsWith('node_modules')) return 'node_modules';
  return file === '' ? '(unmapped)' : file;
}

export interface Agg {
  total: number;
  byStage: Map<string, number>;
  byFn: Map<string, number>;
  special: Map<string, number>;
}

const SPECIAL = new Set(['(garbage collector)', '(idle)', '(program)', '(root)']);

/** Self time (µs) per stage and per function, from a CPU profile. */
export function analyzeCpu(profile: CpuProfile, map: (cf: CallFrame) => Where, only?: (w: Where[]) => boolean): Agg {
  const byId = new Map<number, CpuProfile['nodes'][number]>();
  const parent = new Map<number, number>();
  for (const n of profile.nodes) {
    byId.set(n.id, n);
    for (const c of n.children ?? []) parent.set(c, n.id);
  }
  // First src/perf frame at or above each node (cached).
  const owner = new Map<number, { stage: string; fn: string } | null>();
  const stackOf = (id: number): Where[] => {
    const out: Where[] = [];
    for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) out.push(map(byId.get(cur)!.callFrame));
    return out;
  };
  const ownerOf = (id: number): { stage: string; fn: string } | null => {
    if (owner.has(id)) return owner.get(id)!;
    const n = byId.get(id)!;
    let res: { stage: string; fn: string } | null;
    const name = n.callFrame.functionName;
    if (SPECIAL.has(name)) res = { stage: name, fn: name };
    else {
      const w = map(n.callFrame);
      if (w.file.startsWith('src/') || w.file.startsWith('perf/')) res = { stage: stageOf(w.file), fn: `${w.fn} (${w.file}:${w.line})` };
      else {
        const p = parent.get(id);
        const up = p === undefined ? null : ownerOf(p);
        res = up ? { stage: up.stage, fn: up.fn + (name ? ` → ${name}` : '') } : { stage: stageOf(w.file), fn: `${w.fn} (${w.file || n.callFrame.url})` };
      }
    }
    owner.set(id, res);
    return res;
  };
  const agg: Agg = { total: 0, byStage: new Map(), byFn: new Map(), special: new Map() };
  const n = profile.samples.length;
  for (let i = 0; i < n; i++) {
    const id = profile.samples[i]!;
    const dt = profile.timeDeltas[i + 1] ?? profile.timeDeltas[i] ?? 0;
    if (only && !only(stackOf(id))) continue;
    const o = ownerOf(id);
    if (!o) continue;
    if (SPECIAL.has(o.stage)) {
      agg.special.set(o.stage, (agg.special.get(o.stage) ?? 0) + dt);
      if (o.stage === '(idle)' || o.stage === '(root)') continue;
    }
    agg.total += dt;
    agg.byStage.set(o.stage, (agg.byStage.get(o.stage) ?? 0) + dt);
    agg.byFn.set(o.fn, (agg.byFn.get(o.fn) ?? 0) + dt);
  }
  return agg;
}

/** Allocated bytes per stage and function, from a sampling heap profile. */
export function analyzeHeap(head: HeapNode, map: (cf: CallFrame) => Where): Agg {
  const agg: Agg = { total: 0, byStage: new Map(), byFn: new Map(), special: new Map() };
  const walk = (node: HeapNode, up: { stage: string; fn: string } | null): void => {
    const w = map(node.callFrame);
    const name = node.callFrame.functionName;
    let me = up;
    if (w.file.startsWith('src/') || w.file.startsWith('perf/')) me = { stage: stageOf(w.file), fn: `${w.fn} (${w.file}:${w.line})` };
    else if (!up && name) me = { stage: name, fn: name };
    if (node.selfSize > 0) {
      const o = me ?? { stage: '(unattributed)', fn: name || '(root)' };
      const fn = me === up && up && name ? `${o.fn} → ${name}` : o.fn;
      agg.total += node.selfSize;
      agg.byStage.set(o.stage, (agg.byStage.get(o.stage) ?? 0) + node.selfSize);
      agg.byFn.set(fn, (agg.byFn.get(fn) ?? 0) + node.selfSize);
    }
    for (const c of node.children) walk(c, me);
  };
  walk(head, null);
  return agg;
}

/** Top entries of a map as rows, with shares of `total`. */
export function top(m: Map<string, number>, total: number, n: number, scale = 1): Array<{ name: string; value: number; pct: number }> {
  return [...m]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, v]) => ({ name, value: +(v * scale).toFixed(3), pct: +((v / total) * 100).toFixed(1) }));
}
