// The export editor's document (ADR 0019 "Export doc", Inv §7.7): what the
// owner cut away and the comments they added to one session, saved in the
// `exports` store (DB v6) under the chain's first run id. Pure: the model,
// its defaults, the file name and the edit operations the editor applies.
//
// Anchors are entry log µs, never line numbers, so a chain that grows later
// does not shift them:
//
//   excludes   sorted, non-overlapping half-open ranges [fromUs, toUs) of
//              entry log µs; toUs null = to the end of the log. Adjacent
//              ranges are merged (the same entries are excluded either way).
//   comments   { beforeUs, text }: shown before the entry with log µs
//              beforeUs (null = after the last entry), in array order among
//              comments with the same anchor. Kept sorted by anchor.
//
// A comment is one paragraph: whitespace collapsed to single spaces, at
// most 600 characters, shown as lines of at most 80 columns that each start
// with `## ` (colour `#ffd75f`). In the HTML replay it holds playback for
// clamp(2 + length / 15, 5, 20) seconds of real time.

import { localStamp } from '../capture/format';

export const EXPORT_SCHEMA = 1;
/** Longest comment, characters (after whitespace collapse). */
export const COMMENT_MAX = 600;
/** Comment lines are at most this wide, prefix included. */
export const COMMENT_COLS = 80;
export const COMMENT_PREFIX = '## ';
export const COMMENT_COLOR = '#ffd75f';

export type ExportFormat = 'html' | 'text';
/** Half-open range of entry log µs; `to` null = end of log. */
export type ExcludeRange = [fromUs: number, toUs: number | null];

export interface ExportComment {
  /** The comment shows before the entry with this log µs; null = after the last entry. */
  beforeUs: number | null;
  text: string;
}

export interface ExportDoc {
  /** The chain's first run id (the store's keyPath). */
  sessionId: string;
  schema: 1;
  /** '' = the default title. */
  title: string;
  format: ExportFormat;
  excludes: ExcludeRange[];
  comments: ExportComment[];
}

/** The document of a session nobody has edited. */
export function defaultExportDoc(sessionId: string): ExportDoc {
  return { sessionId, schema: EXPORT_SCHEMA, title: '', format: 'html', excludes: [], comments: [] };
}

// ------------------------------------------------------------- validation

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * A valid document from stored or restored data, or null when it is not one
 * (no session id). Bad ranges and comments are dropped; ranges are sorted
 * and merged, comments collapsed and sorted.
 */
export function normalizeExportDoc(raw: unknown): ExportDoc | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.sessionId !== 'string' || o.sessionId === '') return null;
  const doc = defaultExportDoc(o.sessionId);
  if (typeof o.title === 'string') doc.title = o.title.slice(0, 200);
  if (o.format === 'text') doc.format = 'text';
  if (Array.isArray(o.excludes)) {
    for (const r of o.excludes) {
      if (!Array.isArray(r) || !isNum(r[0]) || !(r[1] === null || isNum(r[1]))) continue;
      if (r[1] !== null && r[1] <= r[0]) continue;
      doc.excludes.push([r[0], r[1]]);
    }
  }
  if (Array.isArray(o.comments)) {
    for (const c of o.comments) {
      if (typeof c !== 'object' || c === null) continue;
      const x = c as Record<string, unknown>;
      if (!(x.beforeUs === null || isNum(x.beforeUs)) || typeof x.text !== 'string') continue;
      const text = collapseComment(x.text);
      if (text) doc.comments.push({ beforeUs: x.beforeUs, text });
    }
  }
  doc.excludes = mergeRanges(doc.excludes);
  doc.comments = sortComments(doc.comments);
  return doc;
}

/** Sorted, merged ranges (overlapping or touching ranges become one). */
export function mergeRanges(ranges: readonly ExcludeRange[]): ExcludeRange[] {
  const end = (r: ExcludeRange): number => r[1] ?? Infinity;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || end(a) - end(b));
  const out: ExcludeRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= end(last)) {
      if (end(r) > end(last)) last[1] = r[1];
    } else out.push([r[0], r[1]]);
  }
  return out;
}

function anchorKey(us: number | null): number {
  return us === null ? Infinity : us;
}

/** Comments sorted by anchor (null last), keeping the order among equal anchors. */
function sortComments(cs: readonly ExportComment[]): ExportComment[] {
  return cs
    .map((c, i) => ({ c, i }))
    .sort((a, b) => anchorKey(a.c.beforeUs) - anchorKey(b.c.beforeUs) || a.i - b.i)
    .map((x) => x.c);
}

// ------------------------------------------------------------------ title

/** Replaces characters that are unsafe in a file name with `-`. */
export function sanitizeFileName(s: string): string {
  // eslint-disable-next-line no-control-regex
  const out = s.replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '-').trim();
  return out.replace(/^\.+/, '-') || 'mume';
}

/** `mume-<char>-<YYYY-MM-DDTHH-MM-SS>` (the first run's start, local time), file-name safe. */
export function defaultTitle(character: string, startUs: number): string {
  return sanitizeFileName(`mume-${character}-${localStamp(new Date(startUs / 1000))}`);
}

/** The export's title: the doc's own, or the default. */
export function exportTitle(doc: ExportDoc, character: string, startUs: number): string {
  const t = doc.title.trim();
  return t ? sanitizeFileName(t) : defaultTitle(character, startUs);
}

/** The download name: `<title>.html` or `<title>.txt`. */
export function exportFileName(doc: ExportDoc, character: string, startUs: number): string {
  return `${exportTitle(doc, character, startUs)}.${doc.format === 'html' ? 'html' : 'txt'}`;
}

// --------------------------------------------------------------- comments

/** One paragraph: whitespace (newlines included) collapsed, trimmed, at most 600 characters. */
export function collapseComment(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, COMMENT_MAX).trimEnd();
}

/**
 * A comment as shown: word-wrapped lines of at most 80 columns, each
 * starting with `## `. A word longer than a line is broken.
 */
export function commentLines(text: string, cols = COMMENT_COLS): string[] {
  const width = Math.max(1, cols - COMMENT_PREFIX.length);
  const words = collapseComment(text).split(' ').filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (let w of words) {
    while (w.length > width) {
      if (cur) {
        lines.push(cur);
        cur = '';
      }
      lines.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!w) continue;
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= width) cur += ' ' + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur || lines.length === 0) lines.push(cur);
  return lines.map((l) => COMMENT_PREFIX + l);
}

/** How long a comment holds the HTML replay, ms: clamp(1 + length / 30, 2.5, 10) s. */
export function commentHoldMs(text: string): number {
  const s = 1 + collapseComment(text).length / 30;
  return Math.round(Math.max(2.5, Math.min(10, s)) * 1000);
}

// --------------------------------------------------------------- queries

/** The exclusion range holding `us`, or -1. */
export function rangeAt(doc: ExportDoc, us: number): number {
  return doc.excludes.findIndex((r) => us >= r[0] && (r[1] === null || us < r[1]));
}

export function isExcluded(doc: ExportDoc, us: number): boolean {
  return rangeAt(doc, us) >= 0;
}

/** How many of the entries (log µs, ascending) are excluded. */
export function excludedCount(doc: ExportDoc, keys: readonly number[]): number {
  let n = 0;
  let r = 0;
  const ex = doc.excludes;
  for (const us of keys) {
    while (r < ex.length && ex[r]![1] !== null && us >= ex[r]![1]!) r++;
    if (r < ex.length && us >= ex[r]![0]) n++;
  }
  return n;
}

// ------------------------------------------------------------ edit ops
//
// Every op returns a new document (the input is not changed); a no-op
// returns the input itself.

/**
 * EXCLUDE FROM HERE (Inv §7.7): opens a range at `us` that runs to the end
 * of the next range (merging with it), or to the end of the log. A no-op on
 * an excluded entry.
 */
export function excludeFrom(doc: ExportDoc, us: number): ExportDoc {
  if (isExcluded(doc, us)) return doc;
  const next = doc.excludes.find((r) => r[0] > us);
  const to = next ? next[1] : null;
  return { ...doc, excludes: mergeRanges([...doc.excludes, [us, to]]) };
}

/**
 * STOP EXCLUDING (Inv §7.7) on the excluded entry `us`: the range holding it
 * now ends just above it; on the range's first entry the range is removed.
 * `keys` (the entries' log µs, ascending) tells whether any entry is left
 * above `us` in the range; without it only `us` = the range start removes it.
 */
export function stopExcluding(doc: ExportDoc, us: number, keys?: readonly number[]): ExportDoc {
  const i = rangeAt(doc, us);
  if (i < 0) return doc;
  const [from] = doc.excludes[i]!;
  const first = keys ? !keys.some((k) => k >= from && k < us) : us <= from;
  const excludes = doc.excludes.map((r) => [r[0], r[1]] as ExcludeRange);
  if (first) excludes.splice(i, 1);
  else excludes[i] = [from, us];
  return { ...doc, excludes };
}

/**
 * Adds a comment before the entry `beforeUs` (null: after the last one).
 * `slot` is its place among the comments already on that anchor (0 = first,
 * default last). An empty text is a no-op.
 */
export function addComment(doc: ExportDoc, beforeUs: number | null, text: string, slot = Infinity): ExportDoc {
  const t = collapseComment(text);
  if (!t) return doc;
  const cs = [...doc.comments];
  const key = anchorKey(beforeUs);
  let at = cs.findIndex((c) => anchorKey(c.beforeUs) > key);
  if (at < 0) at = cs.length;
  let first = at;
  while (first > 0 && anchorKey(cs[first - 1]!.beforeUs) === key) first--;
  cs.splice(Math.min(at, first + Math.max(0, slot)), 0, { beforeUs, text: t });
  return { ...doc, comments: cs };
}

/** Replaces comment `index`'s text; an empty text deletes it. */
export function editComment(doc: ExportDoc, index: number, text: string): ExportDoc {
  const c = doc.comments[index];
  if (!c) return doc;
  const t = collapseComment(text);
  if (!t) return deleteComment(doc, index);
  if (t === c.text) return doc;
  const cs = [...doc.comments];
  cs[index] = { beforeUs: c.beforeUs, text: t };
  return { ...doc, comments: cs };
}

export function deleteComment(doc: ExportDoc, index: number): ExportDoc {
  if (!doc.comments[index]) return doc;
  return { ...doc, comments: doc.comments.filter((_, i) => i !== index) };
}

export function setTitle(doc: ExportDoc, title: string): ExportDoc {
  const t = title.replace(/\s+/g, ' ').trim().slice(0, 200);
  return t === doc.title ? doc : { ...doc, title: t };
}

export function toggleFormat(doc: ExportDoc): ExportDoc {
  return { ...doc, format: doc.format === 'html' ? 'text' : 'html' };
}
