// Script pane content in runs (ADR 0053 P1): the payload of the client
// record `ESC SPANE <id> <json>` (src/capture/format.ts). Pure, no DOM.
//
//   <json> = null                      the pane went away (its script
//                                      stopped or closed it)
//          | {"title","lines","links"} a full snapshot (PaneSnapshot)
//          | {"n":N, "set":{"<row>":line, …}, "title"?, "links"?}
//                                      a delta against the pane's previous
//                                      record in the same run: the content
//                                      has N lines; the rows in `set`
//                                      changed (the others are kept, rows
//                                      past the old end are empty unless
//                                      set); `title` and `links` (the whole
//                                      list) only when they changed
//
// A row in `set` is a whole line, or `{"v"?: value, "l"?: label}` for a
// gauge that only changed its value or label (the common countdown).
//
// The recorder writes a pane's first record in a run as a full snapshot,
// and later ones as a delta when it is shorter, with a full one again at
// least every `PANE_KEYFRAME_US` of changes. A pane that updates its
// gauges every second then costs one or two rows per second, not the
// whole pane with its link hints. Cuts keep every record and the HTML
// export folds the records of an excluded range into a full one; a reader
// that starts mid-run (a spotlight's state prefix) applies deltas to an
// empty pane until the next full record.
//
// Everything read back is checked and capped (`sanitizeSnapshot`): a
// shared HTML replay is someone else's file.

import { MAX_HINT, MAX_LINE_CELLS, MAX_LINES, MAX_TITLE, type PaneGauge, type PaneLine, type PaneSnapshot, type PaneSpan } from './script-content';

/** What the recorder keeps of a pane's last written record, to diff the next one against. */
export interface PaneRecordState {
  title: string;
  /** JSON of each line. */
  lines: string[];
  /** JSON of the link list. */
  links: string;
}

const lineJson = (l: PaneLine): string => JSON.stringify(l);

/** The state of a pane as recorded by `s`. */
export function recordState(s: PaneSnapshot): PaneRecordState {
  return { title: s.title, lines: s.lines.map(lineJson), links: JSON.stringify(s.links) };
}

/** A changed pane gets a full record at least this often, µs. */
export const PANE_KEYFRAME_US = 60_000_000;

/**
 * The record payload for `next` after `prev` (null: none written yet in
 * this run): a full snapshot (always with `forceFull`), a shorter delta,
 * or null when nothing changed. Returns the new state with it.
 */
export function encodePaneRecord(
  prev: PaneRecordState | null,
  next: PaneSnapshot,
  forceFull = false,
): { payload: string; state: PaneRecordState; full: boolean } | null {
  const state = recordState(next);
  const full = `{"title":${JSON.stringify(state.title)},"lines":[${state.lines.join(',')}],"links":${state.links}}`;
  if (!prev) return { payload: full, state, full: true };
  const set: string[] = [];
  const n = state.lines.length;
  for (let i = 0; i < n; i++) {
    const l = state.lines[i]!;
    // Rows past the old end that are empty need not be sent.
    if (i < prev.lines.length ? l === prev.lines[i] : l === EMPTY_LINE) continue;
    set.push(`"${i}":${i < prev.lines.length ? gaugePatch(prev.lines[i]!, next.lines[i]!) ?? l : l}`);
  }
  const titleChanged = state.title !== prev.title;
  const linksChanged = state.links !== prev.links;
  if (set.length === 0 && n === prev.lines.length && !titleChanged && !linksChanged) return null;
  if (forceFull) return { payload: full, state, full: true };
  let delta = `{"n":${n}`;
  if (set.length) delta += `,"set":{${set.join(',')}}`;
  if (titleChanged) delta += `,"title":${JSON.stringify(state.title)}`;
  if (linksChanged) delta += `,"links":${state.links}`;
  delta += '}';
  return delta.length < full.length ? { payload: delta, state, full: false } : { payload: full, state, full: true };
}

const EMPTY_LINE = lineJson({ spans: [] });

/** A gauge row that changed only its value and/or label, as `{"v","l"}`; null otherwise. */
function gaugePatch(prevJson: string, next: PaneLine): string | null {
  if (!('gauge' in next) || !prevJson.startsWith('{"gauge"')) return null;
  const a = (JSON.parse(prevJson) as { gauge: PaneGauge }).gauge;
  const b = next.gauge;
  if (a.max !== b.max || a.color !== b.color) return null;
  const parts: string[] = [];
  if (a.value !== b.value) parts.push(`"v":${JSON.stringify(b.value)}`);
  if (a.label !== b.label) parts.push(`"l":${JSON.stringify(b.label)}`);
  return `{${parts.join(',')}}`;
}

/** An empty pane (a delta with no record before it). */
export function emptySnapshot(): PaneSnapshot {
  return { title: '', lines: [], links: [] };
}

/**
 * The pane after record `json` (the text after the id), from `prev` (the
 * pane before it, or null). Returns null when the pane went away, and
 * `prev` unchanged (or empty) when the record is malformed.
 */
export function applyPaneRecord(prev: PaneSnapshot | null, json: string): PaneSnapshot | null {
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return prev ?? emptySnapshot();
  }
  if (v === null) return null;
  if (!isObject(v)) return prev ?? emptySnapshot();
  if (Array.isArray(v.lines)) return sanitizeSnapshot(v);
  const base = prev ?? emptySnapshot();
  const n = typeof v.n === 'number' && Number.isFinite(v.n) ? Math.max(0, Math.min(MAX_LINES, Math.floor(v.n))) : base.lines.length;
  const lines: PaneLine[] = base.lines.slice(0, n);
  while (lines.length < n) lines.push({ spans: [] });
  if (isObject(v.set)) {
    for (const [k, l] of Object.entries(v.set)) {
      const row = Number(k);
      if (!Number.isInteger(row) || row < 0 || row >= n) continue;
      const old = lines[row];
      if (old && 'gauge' in old && isObject(l) && !('gauge' in l) && !('spans' in l)) {
        // A gauge's new value and/or label.
        const g = { ...old.gauge };
        if (typeof l.v === 'number' && Number.isFinite(l.v)) g.value = Math.max(0, Math.min(g.max, l.v));
        if (typeof l.l === 'string') g.label = l.l.slice(0, MAX_LINE_CELLS);
        lines[row] = { gauge: g };
        continue;
      }
      const line = sanitizeLine(l);
      if (line) lines[row] = line;
    }
  }
  return {
    title: typeof v.title === 'string' ? v.title.slice(0, MAX_TITLE) : base.title,
    lines,
    links: Array.isArray(v.links) ? sanitizeLinks(v.links, n) : base.links.filter((l) => l.row < n),
  };
}

type Obj = Record<string, unknown>;

function isObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isColor = (c: unknown): c is number => typeof c === 'number' && Number.isInteger(c) && c >= 0 && c <= 0x1ffffff;
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function sanitizeLine(l: unknown): PaneLine | null {
  if (!isObject(l)) return null;
  if (isObject(l.gauge)) {
    const g = l.gauge;
    const max = num(g.max, 1) > 0 ? num(g.max, 1) : 1;
    const out: PaneLine = {
      gauge: {
        value: Math.max(0, Math.min(max, num(g.value, 0))),
        max,
        label: typeof g.label === 'string' ? g.label.slice(0, MAX_LINE_CELLS) : '',
      },
    };
    if (isColor(g.color)) out.gauge.color = g.color;
    return out;
  }
  if (!Array.isArray(l.spans)) return null;
  const spans: PaneSpan[] = [];
  let cells = 0;
  for (const s of l.spans) {
    if (!isObject(s) || typeof s.text !== 'string' || cells >= MAX_LINE_CELLS) continue;
    const text = s.text.slice(0, MAX_LINE_CELLS - cells);
    cells += text.length;
    const sp: PaneSpan = { text };
    if (isColor(s.fg)) sp.fg = s.fg;
    if (isColor(s.bg)) sp.bg = s.bg;
    if (s.bold === true) sp.bold = true;
    if (s.italic === true) sp.italic = true;
    if (s.underline === true) sp.underline = true;
    spans.push(sp);
  }
  return { spans };
}

function sanitizeLinks(links: unknown[], rows: number): PaneSnapshot['links'] {
  const out: PaneSnapshot['links'] = [];
  for (const l of links) {
    if (!isObject(l)) continue;
    const row = num(l.row, -1);
    const col = num(l.col, -1);
    const len = num(l.len, 0);
    if (!Number.isInteger(row) || row < 0 || row >= rows || !Number.isInteger(col) || col < 0 || col >= MAX_LINE_CELLS) continue;
    if (!(len >= 1)) continue;
    out.push({
      row,
      col,
      len: Math.min(MAX_LINE_CELLS - col, Math.floor(len)),
      hint: typeof l.hint === 'string' ? l.hint.slice(0, MAX_HINT) : '',
    });
  }
  return out;
}

/** `v` as a well-formed, capped snapshot (bad lines become empty, bad links go). */
export function sanitizeSnapshot(v: Obj): PaneSnapshot {
  const raw = Array.isArray(v.lines) ? v.lines.slice(-MAX_LINES) : [];
  const lines = raw.map((l) => sanitizeLine(l) ?? { spans: [] });
  return {
    title: typeof v.title === 'string' ? v.title.slice(0, MAX_TITLE) : '',
    lines,
    links: Array.isArray(v.links) ? sanitizeLinks(v.links, lines.length) : [],
  };
}

/** Splits a SPANE record body (`<id> <json>`) into the pane id and its JSON, or null. */
export function splitPaneRecord(body: string): { id: string; json: string } | null {
  const sp = body.indexOf(' ');
  if (sp <= 0) return null;
  return { id: body.slice(0, sp), json: body.slice(sp + 1) };
}
