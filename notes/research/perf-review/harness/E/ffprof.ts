// Gecko profile (MOZ_PROFILER_SHUTDOWN raw JSON) summary for the area E
// harness: per content-process main thread, between the page's
// `perfE-start` / `perfE-end` UserTiming marks: marker counts and time
// (RefreshDriverTick, Styles, Reflow, DisplayList, …), thread CPU from the
// samples' threadCPUDelta, and ticks per second.
import { readFileSync } from 'node:fs';

interface RawThread {
  name: string;
  processType?: string;
  pid?: number | string;
  markers: { schema: Record<string, number>; data: unknown[][] };
  samples: { schema: Record<string, number>; data: unknown[][] };
  stringTable: string[];
}

interface RawProfile {
  meta: { startTime: number; interval: number; categories?: unknown };
  threads: RawThread[];
  processes?: Array<{ meta: { startTime: number; processType?: number }; threads: RawThread[] }>;
}

export interface FfSummary {
  windowMs: number;
  thread: string;
  cpuMs: number | null;
  markers: Record<string, { n: number; ms: number; perS: number }>;
  parent?: Record<string, { n: number; ms: number; perS: number }>;
  parentCpu?: Record<string, number>;
}

const WANT = [
  'RefreshDriverTick',
  'Styles',
  'Reflow (interruptible)',
  'Reflow (sync)',
  'DisplayList',
  'WrDisplayList',
  'DisplayListResources',
  'ForwardDPTransaction',
  'Paint',
  'Rasterize',
  'CSS animation iteration',
  'CSS animation',
  'Composite',
  'CompositeToTarget',
  'RenderBackend',
  'Renderer',
  'SetNeedStyleFlush',
  'Scene building',
  'Scene swap',
  'Frame build',
  'Render frame',
  'Composite #',
];

function markerTimes(t: RawThread, base: number): Array<{ name: string; s: number; e: number; phase: number; data: any }> {
  const sch = t.markers.schema;
  const out: Array<{ name: string; s: number; e: number; phase: number; data: any }> = [];
  for (const m of t.markers.data) {
    const name = t.stringTable[m[sch.name!] as number] ?? '?';
    // Instant/IntervalStart carry startTime; IntervalEnd only endTime.
    // Unset times are null or 0 in the raw format.
    const phase = m[sch.phase!] as number;
    const st = (m[sch.startTime!] as number | null) ?? 0;
    const en = (m[sch.endTime!] as number | null) ?? 0;
    const s = phase === 3 ? en : st;
    const e = phase === 1 ? en : phase === 3 ? en : st;
    out.push({ name, s: s + base, e: e + base, phase, data: m[sch.data!] });
  }
  return out;
}

function window(ms: ReturnType<typeof markerTimes>): [number, number] | null {
  let a = -1;
  let b = -1;
  for (const m of ms) {
    if (m.name !== 'UserTiming') continue;
    const n = m.data?.name;
    if (n === 'perfE-start') a = m.s;
    if (n === 'perfE-end') b = m.s;
  }
  return a >= 0 && b > a ? [a, b] : null;
}

export interface MarkerStat {
  n: number;
  ms: number;
  perS: number;
  /** Styles markers: elements styled (sum, max). */
  styled?: number;
  styledMax?: number;
  traversed?: number;
}

function summarise(ms: ReturnType<typeof markerTimes>, w: [number, number]): Record<string, MarkerStat> {
  const res: Record<string, MarkerStat> = {};
  const secs = (w[1] - w[0]) / 1000;
  const open = new Map<string, number[]>();
  const sorted = [...ms].sort((a, b) => a.s - b.s || (a.phase === 3 ? 1 : 0) - (b.phase === 3 ? 1 : 0));
  for (const m of sorted) {
    const key = WANT.find((k) => m.name === k || (k.endsWith('#') && m.name.startsWith(k.slice(0, -1))));
    if (!key) continue;
    // Start/end pairs (phase 2/3): the end closes the latest open start.
    if (m.phase === 2) {
      (open.get(m.name) ?? open.set(m.name, []).get(m.name)!).push(m.s);
      continue;
    }
    let s = m.s;
    let e = m.e;
    if (m.phase === 3) {
      const st = open.get(m.name)?.pop();
      if (st === undefined) continue;
      s = st;
      e = m.s;
    }
    if (s < w[0] || s > w[1]) continue;
    const r = (res[m.name] ??= { n: 0, ms: 0, perS: 0 });
    r.n++;
    if (m.phase !== 0) r.ms += e - s;
    if (m.name === 'Styles' && m.data) {
      const st = Number(m.data.elementsStyled ?? 0);
      r.styled = (r.styled ?? 0) + st;
      r.styledMax = Math.max(r.styledMax ?? 0, st);
      r.traversed = (r.traversed ?? 0) + Number(m.data.elementsTraversed ?? 0);
    }
  }
  for (const r of Object.values(res)) {
    r.ms = Math.round(r.ms * 1000) / 1000;
    r.perS = Math.round((r.n / secs) * 100) / 100;
  }
  return res;
}

/** Every marker of the main thread in [a, b] (for per-action slicing). */
export function contentMarkers(path: string, prefix = 'perfE'): { marks: Array<{ name: string; t: number }>; markers: ReturnType<typeof markerTimes> } | null {
  const p = JSON.parse(readFileSync(path, 'utf8')) as RawProfile;
  const t0 = p.meta.startTime;
  for (const pr of p.processes ?? []) {
    const base = pr.meta.startTime - t0;
    for (const t of pr.threads) {
      if (t.name !== 'GeckoMain') continue;
      const ms = markerTimes(t, base);
      const marks = ms.filter((m) => m.name === 'UserTiming' && typeof m.data?.name === 'string').map((m) => ({ name: m.data.name as string, t: m.s }));
      if (marks.some((m) => m.name.startsWith(prefix))) return { marks, markers: ms };
    }
  }
  return null;
}

export { summarise as summariseMarkers };

/** Thread CPU in ms from the samples' threadCPUDelta (units: meta.sampleUnits, ns on Linux). */
let cpuUnitToMs = 1e-6;
function cpuMs(t: RawThread, base: number, w: [number, number]): number | null {
  const sch = t.samples.schema;
  if (sch.threadCPUDelta === undefined) return null;
  let v = 0;
  for (const s of t.samples.data) {
    const time = (s[sch.time!] as number) + base;
    if (time < w[0] || time > w[1]) continue;
    v += (s[sch.threadCPUDelta!] as number | null) ?? 0;
  }
  return Math.round(v * cpuUnitToMs * 10) / 10;
}

export function summariseFfProfile(path: string): FfSummary | null {
  const p = JSON.parse(readFileSync(path, 'utf8')) as RawProfile & { meta: { sampleUnits?: { threadCPUDelta?: string } } };
  const unit = p.meta.sampleUnits?.threadCPUDelta ?? 'ns';
  cpuUnitToMs = unit === 'ns' ? 1e-6 : unit === 'µs' || unit === 'us' ? 1e-3 : 1e-6;
  const t0 = p.meta.startTime;
  let best: FfSummary | null = null;
  let win: [number, number] | null = null;
  for (const pr of p.processes ?? []) {
    const base = pr.meta.startTime - t0;
    for (const t of pr.threads) {
      if (t.name !== 'GeckoMain') continue;
      const ms = markerTimes(t, base);
      const w = window(ms);
      if (!w) continue;
      win = w;
      best = { windowMs: Math.round(w[1] - w[0]), thread: `content ${t.processType ?? ''} GeckoMain`, cpuMs: cpuMs(t, base, w), markers: summarise(ms, w) };
    }
  }
  if (!best || !win) return null;
  // Parent process: compositor / renderer threads in the same window.
  const parent: Record<string, { n: number; ms: number; perS: number }> = {};
  const parentCpu: Record<string, number> = {};
  for (const t of p.threads) {
    const ms = markerTimes(t, 0);
    const s = summarise(ms, win);
    for (const [k, v] of Object.entries(s)) parent[`${t.name}: ${k}`] = v;
    const c = cpuMs(t, 0, win);
    if (c !== null && c > 0) parentCpu[t.name] = (parentCpu[t.name] ?? 0) + c;
  }
  best.parent = parent;
  best.parentCpu = parentCpu;
  return best;
}
