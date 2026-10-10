// The HTML replay's payload (ADR 0019 "Replay payload"): a session with its
// export edits applied, ready to be embedded in the file. Pure.
//
// What an exclusion removes (ADR 0019): inside an excluded range, inbound
// lines, commands and the Comm pane's channel text (`Comm.*` GMCP other than
// `Comm.Channel.List`) are dropped from the capture texts, so the file never
// contains them. The rest is state: the timeline plays it in no time at the
// cut, so the panes are right when the log resumes. Every range becomes a
// cut (the timeline plays a cut between kept entries in at most 500 ms, one
// at either end of the log in 0). Markers inside a range are dropped;
// comments anchored on a removed entry move to the next kept visible entry
// or shown system line (or to the end).
//
// Excluded state folding (ADR 0019 addendum "Excluded state folding",
// src/share/fold.ts): of that state the file keeps only what leaves the
// player as it would be with all of it. Between two barriers (a VIEW, a
// script pane record, Char.Name, an event the panes show, an unknown
// package, anything within a second of a kept entry …) the vitals, group,
// room and channel-list records become one block at the time of the last
// entry they replace; what no player reads goes; no-op SIZE records keep
// the replay clock's timers on their times. `fold: false` builds the file
// as before (tests).
//
// The excluded tail (ADR 0019 addendum "Excluded tail"): an excluded range
// that no kept entry follows (the end of the log, or a range after the
// last entry outside every range) has nothing to resume, so its entries
// are removed entirely, records included, and the runs that start after
// the last kept entry are left out of `runs`. The timeline drops such a
// tail too (src/player/timeline.ts), and the map embed (src/replay/
// map-embed.ts) reads only the runs left, so the tail's rooms are not in
// the file.
//
// Left-out runs (addendum "Excluded state folding"): a run entirely inside
// excluded ranges is left out too, before the first kept entry and between
// clips (`dropRuns: false` keeps them), unless it plays something that
// shows (an achievement, GMCP with bad JSON). What a player keeps from run
// to run that such a run set — VIEW parts, the Comm pane's channels — is
// carried into the next run at its start when it differs, after pacing
// records on the left-out entries' times. The header (`character`,
// `startUs`) comes from the first run left, `level` from the last;
// `hiddenSys` indexes the runs left.
//
// Run metadata: each run keeps only what the player reads (`playedMeta`:
// its start and level), not its id, counters or summary.
//
// System lines (src/share/system-lines.ts): the login lines the player
// prints are rows in the export editor. One whose anchor is excluded is
// listed in `hiddenSys` (by run: a run prints at most one), and the player
// does not print it; its `Char.Name` GMCP is kept, so the panes are right.
//
// Script panes (ADR 0053 P1): the SPANE records inside an excluded range
// are folded into one full record per pane (or its removal) after the
// range's last entry, so the file holds the panes' state at the cut's end
// but nothing they showed in between.
//
// Timers (ADR 0033): the Timers pane is derived from text, so each cut's
// end inside a run gets a `WebCockpit.Timers` GMCP record with the timers
// state there (src/share/timers-state.ts), before the first entry after it.

import { RECORD, formatGmcpRecord, formatPaneRecord, formatRecord, formatTs } from '../capture/format';
import { parseChannelList } from '../gmcp/comm';
import { parseGmcp } from '../net/gmcp';
import type { PaneSnapshot } from '../panes/script-content';
import { applyPaneRecord, splitPaneRecord } from '../panes/script-record';
import { overlayView, parseView } from '../player/fit';
import { type ChainRun, type PlayedRunMeta, type TimelineEdits, lastKeptUs } from '../player/timeline';
import { markersOf } from '../player/strip';
import type { RunEvent } from '../runs/events';
import { runStartUs } from '../runs/stitch';
import type { Settings } from '../settings';
import { type CaptureEntry, captureEntries, isCommText, isVisible } from './capture';
import { type ExcludeRange, type ExportDoc, commentHoldMs, isExcluded } from './edits';
import { type FoldStats, foldExcludedState, pace, paceRecord } from './fold';
import { systemLines } from './system-lines';
import { TIMERS_GMCP, timersStatesAt } from './timers-state';

export const PAYLOAD_SCHEMA = 1;

export interface PayloadComment {
  beforeUs: number | null;
  text: string;
  holdMs: number;
}

export interface ReplayPayload {
  schema: 1;
  /** The doc's title; '' = none (the header then starts with the character). */
  title: string;
  character: string;
  level?: number;
  /** The first run's start, µs (the header date). */
  startUs: number;
  /** The exporter's settings at export time (appearance, panes). */
  settings: Settings;
  /**
   * Edited capture texts, oldest run first, with the run metadata the
   * player reads (older files carry the whole `RunMeta`).
   */
  runs: Array<{ meta: PlayedRunMeta; text: string }>;
  comments: PayloadComment[];
  /** The excluded ranges, as `TimelineEdits.cuts`. */
  cuts: ExcludeRange[];
  /** `tip`: the marker's hover text (absent in older files). */
  markers: Array<{ us: number; kind: 'A' | 'D' | 'K' | 'L'; tip?: string }>;
  /**
   * Runs (indexes into `runs`) whose login system line the player does not
   * print (it was excluded in the editor). Absent in older files: none.
   */
  hiddenSys?: number[];
  /**
   * The map subset around the rooms the chain visited (ADR 0020
   * "Replays"; src/replay/map-embed.ts). Absent: no map (older files, or
   * a chain without Room.Info).
   */
  map?: ReplayMap;
}

/** The HTML replay's embedded map (ADR 0020 "Replays"). */
export interface ReplayMap {
  /** The source map's file name. */
  name: string;
  /** Rooms in the subset, and visited rooms found in it. */
  rooms: number;
  visited: number;
  /** The subset as a `.mm2` file, base64. */
  mm2: string;
  /** Asset path (`pixmaps/…`, `fonts/…`) → data URI; tiles not listed are drawn empty. */
  files: Record<string, string>;
  /** The exported tileset draws its flow marks untinted (ADR 0088); absent: tinted, as MMapper. */
  streamsAsIs?: boolean;
  /** The exported tileset's dark / no-sundeath room tints, `#rrggbb` (ADR 0088 addendum); absent: MMapper's. */
  tints?: { dark: string; noSundeath: string };
}

/**
 * The capture text of a run with the excluded content removed. Entries
 * after `tailUs` (the last kept entry, `lastKeptUs`) are the excluded tail
 * and go entirely, records included.
 */
export function editRunText(text: string, doc: ExportDoc, tailUs = Infinity): string {
  if (doc.excludes.length === 0) return text;
  let out = '';
  /** Each script pane's content so far (every record applied), and the panes changed inside the current range. */
  const panes = new Map<string, PaneSnapshot | null>();
  const folded = new Set<string>();
  /** The last excluded entry's time: folded records go there, after everything kept in the range. */
  let lastExTs = 0;
  const unfold = (): void => {
    for (const id of folded) {
      const s = panes.get(id) ?? null;
      out += formatPaneRecord(lastExTs, id, s ? JSON.stringify(s) : 'null');
    }
    folded.clear();
  };
  for (const e of captureEntries(text)) {
    if (e.ts > tailUs) continue;
    const ex = isExcluded(doc, e.ts);
    if (!ex && folded.size > 0) unfold();
    if (ex) lastExTs = e.ts;
    if (e.kind === 'spane') {
      const r = splitPaneRecord(e.body);
      if (r) {
        panes.set(r.id, applyPaneRecord(panes.get(r.id) ?? null, r.json));
        if (ex) {
          folded.add(r.id);
          continue;
        }
      }
    }
    if (ex && (isVisible(e) || isCommText(e))) continue;
    out += e.line;
  }
  unfold();
  return out;
}

/**
 * `edited` (a run's text after `editRunText`) with a timers state record
 * before the first entry at or after each cut end that lies inside the
 * run (`full`, the unedited text, is what the states are replayed from).
 */
export function addTimersRecords(edited: string, full: string, cuts: readonly ExcludeRange[]): string {
  let firstTs = -1;
  let lastTs = -1;
  for (const e of captureEntries(full)) {
    if (firstTs < 0) firstTs = e.ts;
    lastTs = e.ts;
  }
  const points: number[] = [];
  for (const [, to] of cuts) if (to !== null && to > firstTs && to <= lastTs) points.push(to);
  if (points.length === 0) return edited;
  const states = timersStatesAt(full, points);
  let out = '';
  let pi = 0;
  for (const e of captureEntries(edited)) {
    while (pi < points.length && points[pi]! <= e.ts) {
      out += formatGmcpRecord(e.ts, TIMERS_GMCP, JSON.stringify(states[pi]));
      pi++;
    }
    out += e.line;
  }
  return out;
}

/** Options of `buildReplayPayload` (tests and the real-log check; the export uses the defaults). */
export interface PayloadOptions {
  /** Fold the state inside excluded ranges (default true; false: every record in a range is kept). */
  fold?: boolean;
  /** Leave out the runs that lie entirely inside excluded ranges (default true). */
  dropRuns?: boolean;
  /** Counters of the fold. */
  foldStats?: FoldStats;
}

/** The run metadata the payload keeps: what the player reads. */
export function playedMeta(m: PlayedRunMeta): PlayedRunMeta {
  const s = m.summary;
  if (!s) return { startedUs: m.startedUs };
  return { startedUs: m.startedUs, summary: { startUs: s.startUs, ...(s.level !== undefined ? { level: s.level } : {}) } };
}

/**
 * True when a run that lies entirely inside excluded ranges can be left
 * out: nothing it plays shows but its connection lines in the UI pane. A
 * GMCP message with bad JSON (a line in the game window) or an achievement
 * (a UI pane line) keeps it.
 */
function droppable(text: string, doc: ExportDoc, tailUs: number): boolean {
  for (const e of captureEntries(text)) {
    if (e.ts > tailUs) break;
    if (!isExcluded(doc, e.ts)) return false;
    if (e.kind !== 'gmcp') continue;
    const g = parseGmcp(e.body);
    if (g.error !== undefined || g.pkg.toLowerCase() === 'event.achieved') return false;
  }
  return true;
}

/**
 * The state a player carries from one run into the next that a left-out
 * run may have set: the VIEW parts (PlayerHost's `base`) and the Comm
 * pane's channels.
 */
class CarriedState {
  /** The VIEW parts so far, as the player overlays them. */
  private readonly view: Record<string, unknown> = {};
  /** The last channel list the Comm pane took: its GMCP body and the list. */
  private ccl: { body: string; key: string } | null = null;

  take(text: string): void {
    for (const e of captureEntries(text)) {
      if (e.kind === 'view') {
        const v = parseView(e.body);
        if (v) overlayView(this.view as unknown as Settings, v);
      } else if (e.kind === 'gmcp' && e.pkg!.toLowerCase() === 'comm.channel.list') {
        const g = parseGmcp(e.body);
        const list = g.pkg.toLowerCase() === 'comm.channel.list' ? parseChannelList(g.data) : null;
        if (list) this.ccl = { body: e.body, key: JSON.stringify(list) };
      }
    }
  }

  /** Records at `ts` that turn `other`'s state into this one ('' when they agree). */
  carry(other: CarriedState, ts: number): string {
    const parts: Record<string, unknown> = {};
    for (const k of Object.keys(this.view)) {
      if (JSON.stringify(this.view[k]) !== JSON.stringify(other.view[k])) parts[k] = this.view[k];
    }
    let out = Object.keys(parts).length > 0 ? formatRecord(ts, RECORD.view, JSON.stringify(parts)) : '';
    if (this.ccl && this.ccl.key !== other.ccl?.key) out += formatTs(ts) + ' \x1b' + RECORD.gmcp + ' ' + this.ccl.body + '\n';
    return out;
  }
}

/** True for an entry the player's timeline takes (src/player/timeline.ts `lineKind`). */
function isTimelineEntry(e: CaptureEntry): boolean {
  return e.kind === 'in' || e.kind === 'out' || (e.kind !== 'record' && e.body !== '');
}

/** Log µs of the first entry of `text`, or null. */
function firstUs(text: string): number | null {
  const e = captureEntries(text).next();
  return e.done ? null : e.value.ts;
}

/** Builds the payload of a chain (oldest run first) with its events and export doc. */
export function buildReplayPayload(
  chain: readonly ChainRun[],
  events: readonly RunEvent[],
  doc: ExportDoc,
  settings: Settings,
  opts: PayloadOptions = {},
): ReplayPayload {
  const edited = doc.excludes.length > 0;
  // The excluded tail: nothing after the last kept entry, and no run that
  // starts after it. Runs entirely inside excluded ranges go too.
  const tailUs = edited ? lastKeptUs(chain, doc.excludes) : Infinity;
  const texts = chain.map((r) => (edited ? editRunText(r.text, doc, tailUs) : r.text));
  let keep = chain.length;
  if (tailUs !== Infinity) {
    keep = 0;
    for (let r = 0; r < chain.length; r++) {
      const first = firstUs(chain[r]!.text);
      if (first !== null && first <= tailUs) keep = r + 1;
    }
  }
  /** Chain run → payload run, or -1 when the run is left out. */
  const index: number[] = [];
  let n = 0;
  for (let r = 0; r < chain.length; r++) {
    const out = r >= keep || (edited && opts.dropRuns !== false && droppable(chain[r]!.text, doc, tailUs));
    index.push(out ? -1 : n++);
  }
  const keptTexts = texts.filter((_, r) => index[r]! >= 0);
  const folded: string[] = edited && opts.fold !== false ? foldExcludedState(keptTexts, doc.excludes, opts.foldStats) : keptTexts;
  // A run after left-out ones gets the state they leave behind when it
  // differs from what the runs played before it leave, and pacing records
  // on their times so the replay clock (timers) goes the same way.
  const all = new CarriedState();
  const played = new CarriedState();
  let gap: number[] | null = null;
  let lastPlayed: number | null = null;
  for (let r = 0; r < chain.length; r++) {
    const i = index[r]!;
    if (i < 0) {
      gap ??= [];
      for (const e of captureEntries(texts[r]!)) if (isTimelineEntry(e)) gap.push(e.ts);
      all.take(texts[r]!);
      continue;
    }
    const start = firstUs(texts[r]!);
    if (gap && start !== null) {
      const carry = all.carry(played, start);
      if (carry) played.take(carry);
      const points = gap.filter((t) => t < start);
      const written = points.map((_, k) => k === 0 && lastPlayed === null);
      pace(lastPlayed, points, start, written);
      let head = '';
      for (let k = 0; k < points.length; k++) if (written[k]) head += paceRecord(points[k]!);
      folded[i] = head + carry + folded[i]!;
    }
    gap = null;
    all.take(texts[r]!);
    played.take(texts[r]!);
    for (const e of captureEntries(folded[i]!)) lastPlayed = e.ts;
  }
  const runs = chain
    .filter((_, r) => index[r]! >= 0)
    .map((r, i) => ({
      meta: playedMeta(r.meta),
      text: edited ? addTimersRecords(folded[i]!, r.text, doc.excludes) : folded[i]!,
    }));

  // Kept visible entries' and shown system lines' times, for moving
  // comments off removed entries.
  const kept: number[] = [];
  for (const r of runs) for (const e of captureEntries(r.text)) if (isVisible(e)) kept.push(e.ts);
  const hiddenSys: number[] = [];
  for (const l of systemLines(chain)) {
    const i = index[l.run]!;
    if (i < 0) continue;
    if (isExcluded(doc, l.ts)) hiddenSys.push(i);
    else kept.push(l.ts);
  }
  kept.sort((a, b) => a - b);
  const nextKept = (us: number): number | null => {
    let lo = 0;
    let hi = kept.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (kept[mid]! < us) lo = mid + 1;
      else hi = mid;
    }
    return lo < kept.length ? kept[lo]! : null;
  };
  const comments = doc.comments.map((c) => ({
    beforeUs: c.beforeUs === null ? null : nextKept(c.beforeUs),
    text: c.text,
    holdMs: commentHoldMs(c.text),
  }));

  const markers = markersOf(events)
    .filter((m) => !isExcluded(doc, m.us))
    .map((m) => ({ us: m.us, kind: m.letter, tip: m.tip }));

  let level: number | undefined;
  for (const r of runs) if (r.meta.summary?.level !== undefined) level = r.meta.summary.level;
  // The header: the first run played (the chain's first when none is).
  const first = chain[index.indexOf(0)]?.meta ?? chain[0]?.meta;
  return {
    schema: PAYLOAD_SCHEMA,
    title: doc.title.trim(),
    character: first?.character ?? '',
    ...(level !== undefined ? { level } : {}),
    startUs: first ? runStartUs(first) : 0,
    settings: JSON.parse(JSON.stringify(settings)) as Settings,
    runs,
    comments,
    cuts: doc.excludes.map((r) => [r[0], r[1]] as ExcludeRange),
    markers,
    ...(hiddenSys.length > 0 ? { hiddenSys } : {}),
  };
}

/** The timeline edits of a payload: its comments (with holds) and cuts. */
export function payloadEdits(p: ReplayPayload): TimelineEdits {
  return { comments: p.comments, cuts: p.cuts };
}
