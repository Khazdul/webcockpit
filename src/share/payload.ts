// The HTML replay's payload (ADR 0019 "Replay payload"): a session with its
// export edits applied, ready to be embedded in the file. Pure.
//
// What an exclusion removes (ADR 0019): inside an excluded range, inbound
// lines, commands and the Comm pane's channel text (`Comm.*` GMCP other than
// `Comm.Channel.List`) are dropped from the capture texts, so the file never
// contains them. Other GMCP, VIEW, SIZE (and unknown records) are kept: the
// timeline plays them in no time at the cut, so the panes are right when the
// log resumes. Every range becomes a cut (the timeline plays a cut between
// kept entries in at most 500 ms, one at either end of the log in 0).
// Markers inside a range are dropped; comments anchored on a removed entry
// move to the next kept visible entry or shown system line (or to the end).
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

import { formatGmcpRecord, formatPaneRecord } from '../capture/format';
import type { PaneSnapshot } from '../panes/script-content';
import { applyPaneRecord, splitPaneRecord } from '../panes/script-record';
import type { RunMeta } from '../capture/store';
import type { ChainRun, TimelineEdits } from '../player/timeline';
import { markersOf } from '../player/strip';
import type { RunEvent } from '../runs/events';
import { runStartUs } from '../runs/stitch';
import type { Settings } from '../settings';
import { captureEntries, isCommText, isVisible } from './capture';
import { type ExcludeRange, type ExportDoc, commentHoldMs, isExcluded } from './edits';
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
  /** Edited capture texts, oldest run first. */
  runs: Array<{ meta: RunMeta; text: string }>;
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
}

/** The capture text of a run with the excluded content removed. */
export function editRunText(text: string, doc: ExportDoc): string {
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

/** Builds the payload of a chain (oldest run first) with its events and export doc. */
export function buildReplayPayload(
  chain: readonly ChainRun[],
  events: readonly RunEvent[],
  doc: ExportDoc,
  settings: Settings,
): ReplayPayload {
  const runs = chain.map((r) => ({
    meta: r.meta,
    text: doc.excludes.length === 0 ? r.text : addTimersRecords(editRunText(r.text, doc), r.text, doc.excludes),
  }));

  // Kept visible entries' and shown system lines' times, for moving
  // comments off removed entries.
  const kept: number[] = [];
  for (const r of runs) for (const e of captureEntries(r.text)) if (isVisible(e)) kept.push(e.ts);
  const hiddenSys: number[] = [];
  for (const l of systemLines(chain)) {
    if (isExcluded(doc, l.ts)) hiddenSys.push(l.run);
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
  for (const r of chain) if (r.meta.summary?.level !== undefined) level = r.meta.summary.level;
  const first = chain[0]?.meta;
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
