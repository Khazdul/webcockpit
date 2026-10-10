// @vitest-environment happy-dom
// The excluded-state fold on a real log (ADR 0019 addendum "Excluded state
// folding"). Opt-in: WC_REAL_PAYLOAD=<a decoded replay payload .json>
// (its runs are taken as the chain, its cuts as one exclude set, and a
// synthetic set of short clips over the same runs as another). Each set is
// built three ways: as before (no fold), folded, and folded with the
// fully excluded runs left out. The folded payload must play like the
// unfolded one at every cut's end and at the end; the report (stdout, and
// WC_REAL_REPORT=<file> as JSON) lists sizes, visited rooms, the map
// Tracker's position after each kept Room.Info, and every difference.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { readMm2 } from '../../src/map/mm2';
import { describe, expect, it } from 'vitest';
import { type MapVisits, extractVisits, replaySubset } from '../../src/map/tools';
import { defaultExportDoc, mergeRanges, type ExcludeRange } from '../../src/share/edits';
import { type FoldStats } from '../../src/share/fold';
import { type ReplayPayload, buildReplayPayload } from '../../src/share/payload';
import type { ChainRun } from '../../src/player/timeline';
import { captureEntries } from '../../src/share/capture';
import { checkpoints, digestEnd, keptPlays, openPayload, prefixPayload, sizesByKind, trackPayload } from './fold-helpers';

const FILE = process.env.WC_REAL_PAYLOAD;
// A path, not a URL: the happy-dom environment has its own URL class.
const ARDA = resolve(process.cwd(), 'public/map/arda.mm2');
const HAS_ARDA = existsSync(ARDA);
const loadArda = () => readMm2(new Uint8Array(readFileSync(ARDA)), async (z) => new Uint8Array(inflateSync(z)));

/** The complement of kept clips [from, to) as exclude ranges. */
function excludesOf(clips: Array<[number, number]>): ExcludeRange[] {
  const out: ExcludeRange[] = [];
  let at = 0;
  for (const [a, b] of [...clips].sort((x, y) => x[0] - y[0])) {
    out.push([at, a]);
    at = b;
  }
  out.push([at, null]);
  return mergeRanges(out.filter((r) => r[1] === null || r[1] > r[0]));
}

function span(text: string): [number, number] {
  let a = Infinity;
  let b = -Infinity;
  for (const e of captureEntries(text)) {
    a = Math.min(a, e.ts);
    b = Math.max(b, e.ts);
  }
  return [a, b];
}

describe.skipIf(!FILE || !HAS_ARDA)('excluded-state fold on a real payload', () => {
  it('plays as before and reports sizes, visited rooms and map positions', { timeout: 1_800_000 }, async () => {
    const src = JSON.parse(readFileSync(FILE!, 'utf8')) as ReplayPayload;
    const chain: ChainRun[] = src.runs.map((r) => ({ meta: r.meta as ChainRun['meta'], text: r.text }));
    const arda = await loadArda();
    const sets: Record<string, ExcludeRange[]> = { cuts: src.cuts.map((r) => [r[0], r[1]]) };
    // Synthetic: the original clip, a minute in the middle of a later run,
    // and two half minutes inside one more run (excluded runs between).
    const clips: Array<[number, number]> = [];
    // The payload's one clip: between its two cuts.
    const c0 = src.cuts[0]?.[1];
    const c1 = src.cuts[1]?.[0];
    const keptOrig: [number, number] | null = src.cuts.length === 2 && typeof c0 === 'number' && typeof c1 === 'number' ? [c0, c1] : null;
    if (keptOrig) clips.push(keptOrig);
    if (chain.length >= 6) {
      const [a4, b4] = span(chain[4]!.text);
      const m4 = Math.round((a4 + b4) / 2);
      clips.push([m4, m4 + 60e6]);
      const [a5, b5] = span(chain[5]!.text);
      const q1 = Math.round(a5 + (b5 - a5) / 3);
      const q2 = Math.round(a5 + (2 * (b5 - a5)) / 3);
      clips.push([q1, q1 + 30e6], [q2, q2 + 30e6]);
      sets.synthetic = excludesOf(clips);
    }
    // Three clips inside the original one (short cuts between them, so
    // their stretches play), and one more in a later run.
    if (keptOrig && chain.length >= 6) {
      const [k0, k1] = keptOrig;
      const [a5, b5] = span(chain[5]!.text);
      const h = Math.round((a5 + b5) / 2);
      sets.inner = excludesOf([
        [k0, k0 + 8e6],
        [k0 + 12e6, k0 + 16e6],
        [k0 + 20e6, k1],
        [h, h + 20e6],
      ]);
    }

    const report: Record<string, unknown> = {};
    for (const [name, excludes] of Object.entries(sets)) {
      const doc = { ...defaultExportDoc('real'), excludes };
      const stats: FoldStats = { segments: 0, fallbacks: 0, paces: 0 };
      const base = buildReplayPayload(chain, [], doc, src.settings, { fold: false, dropRuns: false });
      const folded = buildReplayPayload(chain, [], doc, src.settings, { dropRuns: false, foldStats: stats });
      const full = buildReplayPayload(chain, [], doc, src.settings);
      const r: Record<string, unknown> = { excludes, stats };
      const size = (p: ReplayPayload) => p.runs.reduce((n, x) => n + x.text.length, 0);
      r.size = { base: size(base), folded: size(folded), full: size(full), json: [JSON.stringify(base).length, JSON.stringify(full).length] };
      r.runs = { base: base.runs.length, folded: folded.runs.length, full: full.runs.length };
      r.sizesByKind = { base: sizesByKind(base), full: sizesByKind(full) };
      const visits = (p: ReplayPayload): MapVisits => extractVisits(p.runs.map((x) => x.text));
      const sub = (p: ReplayPayload) => replaySubset(arda, visits(p));
      const subs = { base: sub(base), folded: sub(folded), full: sub(full) };
      r.visits = {
        base: visits(base).rooms.length,
        folded: visits(folded).rooms.length,
        full: visits(full).rooms.length,
        visited: { base: subs.base?.visited, folded: subs.folded?.visited, full: subs.full?.visited },
        subsetRooms: { base: subs.base?.map.roomCount, folded: subs.folded?.map.roomCount, full: subs.full?.map.roomCount },
        noServerId: { arda: countNoId(arda.serverId), base: subs.base ? countNoId(subs.base.map.serverId) : 0, full: subs.full ? countNoId(subs.full.map.serverId) : 0 },
      };
      // The map: the Tracker after each kept Room.Info, each on its own subset.
      const track = {
        base: subs.base ? trackPayload(base, subs.base.map) : [],
        folded: subs.folded ? trackPayload(folded, subs.folded.map) : [],
        full: subs.full ? trackPayload(full, subs.full.map) : [],
        // The same subset for both: only the fold's effect.
        foldedOnBase: subs.base ? trackPayload(folded, subs.base.map) : [],
      };
      const mapDiffs = (a: typeof track.base, b: typeof track.base) =>
        a.flatMap((x, i) => {
          const y = b[i];
          if (!y || y.ts !== x.ts) return [{ i, ts: x.ts, missing: true }];
          const d: Record<string, unknown> = {};
          for (const k of ['room', 'located', 'path', 'members'] as const) if (x[k] !== y[k]) d[k] = [x[k], y[k]];
          return Object.keys(d).length ? [{ i, ts: x.ts, ...d }] : [];
        });
      r.map = {
        keptRoomInfos: track.base.length,
        foldedVsBase: mapDiffs(track.base, track.folded),
        fullVsBase: mapDiffs(track.base, track.full),
        foldedOnBaseSubset: mapDiffs(track.base, track.foldedOnBase),
      };
      // Playback: kept entries at the same times, the same state at each cut's end.
      const ob = openPayload(base);
      const of = openPayload(folded);
      const oa = openPayload(full);
      r.timeline = {
        keptPlaysEqual: keptPlays(base, ob.tl) === keptPlays(folded, of.tl),
        keptPlaysEqualFull: keptPlays(base, ob.tl) === keptPlays(full, oa.tl),
        duration: [ob.tl.durationMs, of.tl.durationMs, oa.tl.durationMs],
        entries: [ob.tl.n, of.tl.n, oa.tl.n],
      };
      ob.host.dispose();
      of.host.dispose();
      oa.host.dispose();
      const points = [...checkpoints(base), Infinity];
      const digestDiffs: unknown[] = [];
      const fullDiffs: unknown[] = [];
      for (const us of points) {
        const db = digestEnd(prefixPayload(base, us));
        const df = digestEnd(prefixPayload(folded, us));
        const da = digestEnd(prefixPayload(full, us));
        for (const k of Object.keys(db)) {
          if (db[k] !== df[k]) digestDiffs.push({ us, k, ...diffOf(db[k]!, df[k]!) });
          if (db[k] !== da[k]) fullDiffs.push({ us, k, ...diffOf(db[k]!, da[k]!) });
        }
      }
      r.checkpoints = points.length;
      r.digestFoldedVsBase = digestDiffs;
      r.digestFullVsBase = fullDiffs;
      report[name] = r;
    }
    const json = JSON.stringify(report, null, 1);
    if (process.env.WC_REAL_REPORT) writeFileSync(process.env.WC_REAL_REPORT, json);
    else console.log(json);
    for (const r of Object.values(report) as Array<{ timeline: unknown; digestFoldedVsBase: unknown[] }>) {
      expect(r.timeline).toMatchObject({ keptPlaysEqual: true });
      expect(r.digestFoldedVsBase).toEqual([]);
    }
  });
});

/** Where two strings first differ, with some context. */
function diffOf(a: string, b: string): { at: number; a: string; b: string } {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const from = Math.max(0, i - 120);
  return { at: i, a: a.slice(from, i + 240), b: b.slice(from, i + 240) };
}

function countNoId(ids: ArrayLike<number>): number {
  let n = 0;
  for (let i = 0; i < ids.length; i++) if (ids[i] === 0) n++;
  return n;
}
