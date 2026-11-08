// Frame spacing around a moment of a take, as a picture (ADR 0133 addendum):
//
//   node record/intervals.ts <scene> <marker kind> [<label>] [--before 2] [--after 4] [--out file.png]
//
// Plots the capture's frame intervals (each frame's gap to the one before,
// ms) and the page's own long frames (over 40 ms between animation frames,
// logged in the page) in a window around the marker. A gap with no long
// frame under it is the capture's; a long frame is the client's.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TimelineFile } from './lib/timeline.ts';

const VIDEO = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const opt = (name: string, d: string): string => {
  const i = args.indexOf(name);
  if (i < 0) return d;
  const v = args[i + 1]!;
  args.splice(i, 2);
  return v;
};
const before = Number(opt('--before', '2'));
const after = Number(opt('--after', '4'));
const outArg = opt('--out', '');
const [scene, kind, label] = args;
if (!scene || !kind) throw new Error('usage: node record/intervals.ts <scene> <marker kind> [<label>] [--before s] [--after s] [--out png]');
const out = outArg || join(VIDEO, `out/stills/intervals-${scene}-${kind}.png`);
const tl = JSON.parse(readFileSync(join(VIDEO, `public/recordings/${scene}.json`), 'utf8')) as TimelineFile;
const m = tl.markers.find((x) => x.kind === kind && (label === undefined || x.label === label));
if (!m || !tl.frameTimes) throw new Error(`no marker ${kind} or no frame times in ${scene}.json (re-record)`);
const t0 = m.t - before;
const t1 = m.t + after;
const ft = tl.frameTimes;
const gaps: [number, number][] = [];
for (let i = 1; i < ft.length; i++) if (ft[i]! >= t0 && ft[i]! <= t1) gaps.push([ft[i]!, (ft[i]! - ft[i - 1]!) * 1000]);
const longs = tl.input.filter((e) => e.type === 'longframe' && e.t >= t0 && e.t <= t1).map((e) => [e.t, Number(e.key)] as [number, number]);

const Wd = 1200;
const H = 420;
const pad = { l: 60, r: 20, t: 40, b: 40 };
const maxMs = Math.max(120, ...gaps.map((g) => g[1]), ...longs.map((l) => l[1]));
const x = (t: number): number => pad.l + ((t - t0) / (t1 - t0)) * (Wd - pad.l - pad.r);
const y = (ms: number): number => H - pad.b - (ms / maxMs) * (H - pad.t - pad.b);
const lines: string[] = [];
lines.push(`<rect width="${Wd}" height="${H}" fill="#101014"/>`);
for (const ms of [16.7, 33.3, 50, 100]) {
  if (ms > maxMs) continue;
  lines.push(`<line x1="${pad.l}" x2="${Wd - pad.r}" y1="${y(ms)}" y2="${y(ms)}" stroke="#333" stroke-dasharray="4 4"/><text x="8" y="${y(ms) + 4}" fill="#888" font-size="12" font-family="sans-serif">${ms} ms</text>`);
}
for (const [t, ms] of gaps) lines.push(`<line x1="${x(t)}" x2="${x(t)}" y1="${y(0)}" y2="${y(ms)}" stroke="${ms > 50 ? '#e0654a' : '#6aa7e8'}" stroke-width="2"/>`);
for (const [t, ms] of longs) lines.push(`<rect x="${x(t) - 3}" y="${y(ms)}" width="6" height="6" fill="#f0c040"/>`);
lines.push(`<line x1="${x(m.t)}" x2="${x(m.t)}" y1="${pad.t}" y2="${H - pad.b}" stroke="#7ed07e" stroke-width="2"/>`);
lines.push(
  `<text x="${pad.l}" y="24" fill="#ddd" font-size="15" font-family="sans-serif">${scene}: frame intervals around "${kind}${label ? ` ${label}` : ''}" (green, ${m.t.toFixed(2)} s). Blue/red bars: capture gaps (red over 50 ms). Yellow: the page's own long frames.</text>`,
);
for (let s = Math.ceil(t0); s <= t1; s++) lines.push(`<text x="${x(s) - 10}" y="${H - 14}" fill="#888" font-size="12" font-family="sans-serif">${s}s</text>`);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${H}">${lines.join('')}</svg>`;
const svgFile = out.replace(/\.png$/, '.svg');
writeFileSync(svgFile, svg);
const r = spawnSync('rsvg-convert', ['-o', out, svgFile]);
if (r.status !== 0) throw new Error(String(r.stderr));
const worst = [...gaps].sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log(`${out}\n  worst capture gaps: ${worst.map(([t, ms]) => `${ms.toFixed(0)} ms at ${t.toFixed(2)}`).join(', ')}\n  page long frames: ${longs.map(([t, ms]) => `${ms} ms at ${t.toFixed(2)}`).join(', ') || 'none'}`);
