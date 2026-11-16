// The Community page's pure parts (stage 65 C1, spec §7.8, ADR 0155;
// round 13's picks 1b with the owner's changes, 2 and 5; the owner's
// feedback W2: short headings, search, the phone's dashboard): the list's
// columns and their sorts, the words of a row, the boxes and the board,
// the page's remembered view, and the address of a run opened from here.
// No DOM, no requests (community.tsx draws, src/cloud/community/api.ts
// asks).

import type { GalleryRow, GallerySort, Note } from '../../../shared/cloud/api.ts';
import { cleanPublicText, publicTextToSend, searchText } from '../../../shared/cloud/text.ts';
import { ageText } from '../../cloud/community/format';

// ------------------------------------------------------------ the list

/** The sorts the page offers (owner's feedback W2: one per column; the API's `length` is not offered). */
export type HeadSort = Exclude<GallerySort, 'length'>;

/** A sortable heading of the list (desktop and tablet): its sort, its label and its key. */
export interface SortHead {
  sort: HeadSort;
  label: string;
  letter: string;
}

/** The sorts by their column (short headings): Run (New, the default), Stars (Top), Com. (Comments), Views (Most watched). */
export const SORT_HEADS: Readonly<Record<HeadSort, SortHead>> = {
  new: { sort: 'new', label: 'Run', letter: 'n' },
  top: { sort: 'top', label: 'Stars', letter: 's' },
  comments: { sort: 'comments', label: 'Com.', letter: 'm' },
  watched: { sort: 'watched', label: 'Views', letter: 'v' },
};

export const DEFAULT_SORT: HeadSort = 'new';

/** The sort a key chooses (a heading's letter, no modifier), or null. */
export function sortOfKey(e: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }): HeadSort | null {
  if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return null;
  const k = e.key.toLowerCase();
  return Object.values(SORT_HEADS).find((h) => h.letter === k)?.sort ?? null;
}

/** The pages of a list of `total` runs, at least 1. */
export function pagesOf(total: number, size = 10): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

/** The pager's words: "Page 1 of 3". */
export const pagerText = (page: number, pages: number): string => `Page ${page} of ${pages}`;

/** "Title (Char)": the run's title and its character, no level (owner's feedback 11); the title alone without a character. */
export function runName(r: Pick<GalleryRow, 'title' | 'character'>): string {
  return r.character ? `${r.title} (${r.character})` : r.title;
}

// ------------------------------------------------------------ search

/** A search's shortest and longest text (the contract's GALLERY_Q_MIN, GALLERY_Q_MAX; a unit test holds them equal). */
export const SEARCH_MIN = 2;
export const SEARCH_MAX = 60;

/** The text a search field asks for, or null (nothing to search: the whole list). */
export function searchOf(field: string): string | null {
  return searchText(field, SEARCH_MIN, SEARCH_MAX);
}

/** The search's line over the list: 'Search: "ford" — 3 runs'. */
export function searchLine(q: string, total: number): string {
  return `Search: “${q}” — ${total} ${total === 1 ? 'run' : 'runs'}`;
}

/** A run's length: "37 min", "4 h 04 min", "under a minute". */
export function lengthText(s: number): string {
  const m = Math.round(Math.max(0, s) / 60);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The listed date: "14 Nov" this year, "14 Nov 2025" before (local time). */
export function dateText(ms: number, now: number = Date.now()): string {
  const d = new Date(ms);
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? day : `${day} ${d.getFullYear()}`;
}

/** The stars' mean ("4.8") and the whole stars drawn: the community's one formatter set (review fix CR6). */
export { meanText, meanStars as starsShown } from '../../cloud/community/format';

/** The newest `listedAt` among what the page has shown (the counter's seen time), null when nothing. */
export function newestListed(...lists: ReadonlyArray<readonly Pick<GalleryRow, 'listedAt'>[] | null | undefined>): number | null {
  let best: number | null = null;
  for (const l of lists) for (const r of l ?? []) if (best === null || r.listedAt > best) best = r.listedAt;
  return best;
}

// ------------------------------------------------------------ the board

/** The age of a note at the right: "just now", "2 min", "3 h", "yesterday", "4 days" (the community's formatter, CR6). */
export function noteAge(ms: number, now: number = Date.now()): string {
  return ageText(ms, now);
}

/** The start (ms) of the UTC day of `now`. */
export function utcDayStart(now: number): number {
  return Math.floor(now / 86_400_000) * 86_400_000;
}

/** The notes `name` wrote today (UTC) that the board shows (a removed one still counts on the server: the 429 says so). */
export function notesToday(notes: readonly Note[], name: string | null, now: number = Date.now()): number {
  if (name === null) return 0;
  const start = utcDayStart(now);
  const key = name.toLowerCase();
  return notes.filter((n) => n.writer.toLowerCase() === key && n.created >= start).length;
}

const ONE_LINE = { newlines: 0 };

/** The note field's text as the player types: the free-text rules, one line, cut to `max` code points (cleaned again after the cut: no dangling ZWJ). Not trimmed. */
export function noteField(raw: string, max: number): string {
  const s = cleanPublicText(raw, ONE_LINE);
  const cps = [...s];
  return cps.length > max ? cleanPublicText(cps.slice(0, max).join(''), ONE_LINE) : s;
}

/** What a note sends: trimmed, '' when nothing visible is left (review fix S2). */
export function noteToSend(field: string): string {
  return publicTextToSend(field, ONE_LINE);
}

/** The field's hint: "41 / 250 · 4 left today". */
export function noteHint(length: number, max: number, left: number): string {
  return `${length} / ${max} · ${left} left today`;
}

export const NOTE_LIMIT_TEXT = 'Five notes today, the most a day. The field opens again at midnight (UTC).';

/** What a failed note says (the server's code, or ours for the network). */
export function noteFailText(code: string): string {
  switch (code) {
    case 'too_many':
      return 'The most notes a day are written. The field opens again at midnight (UTC).';
    case 'bad_text':
      return 'The note has characters the board does not take.';
    case 'suspended':
      return 'This account is suspended: it cannot write.';
    case 'unauthorized':
      return 'Logged out: log in again to write.';
    case 'offline':
    case 'timeout':
      return 'Offline: the note was not sent. Try again when you are online.';
    default:
      return 'The note could not be sent. Try again later.';
  }
}

/** What a failed report of a note says. */
export function noteReportFailText(code: string, status = 0): string {
  if (code === 'too_many') return 'You have sent the most reports a day. Try again tomorrow.';
  if (code === 'suspended') return 'This account is suspended: it cannot report.';
  if (code === 'own') return 'This is your own note.';
  if (code === 'not_found') return 'This note is no longer there.';
  if (code === 'offline' || code === 'timeout' || status === 0) return 'Offline: the report could not be sent. Try again when you are online.';
  return 'The report could not be sent. Try again later.';
}

// ------------------------------------------------------------ the view kept across a run

/** The page's view: kept in this tab while a run is watched, so Back on the watch page finds it again. */
export interface CommunityView {
  sort: HeadSort;
  page: number;
  /** A sender's runs (the name as shown). */
  by?: string;
  /** A search's text (as `searchOf` gives it). */
  q?: string;
  /** The phone's sub-page (none: the dashboard). */
  sub?: CommunitySub;
}

/** The phone's sub-pages over its dashboard: the whole list, the Hall of Fame. */
export type CommunitySub = 'runs' | 'hof';

export const VIEW_KEY = 'wc.community.view';

const SORTS: readonly string[] = ['new', 'top', 'watched', 'comments'];
const NAME = /^[A-Za-z0-9_-]{3,20}$/;

/** A kept view, or the default when it is not one. */
export function parseView(raw: string | null): CommunityView {
  const out: CommunityView = { sort: DEFAULT_SORT, page: 1 };
  if (!raw) return out;
  try {
    const v = JSON.parse(raw) as Partial<CommunityView> | null;
    if (!v || typeof v !== 'object') return out;
    if (typeof v.sort === 'string' && SORTS.includes(v.sort)) out.sort = v.sort;
    if (typeof v.page === 'number' && Number.isInteger(v.page) && v.page >= 1 && v.page <= 100) out.page = v.page;
    if (typeof v.by === 'string' && NAME.test(v.by)) out.by = v.by;
    if (typeof v.q === 'string') {
      const q = searchOf(v.q);
      if (q !== null) out.q = q;
    }
    if (v.sub === 'runs' || v.sub === 'hof') out.sub = v.sub;
    return out;
  } catch {
    return out;
  }
}

// ------------------------------------------------------------ the way to a run and back

/**
 * The query that tells the watch page its run was opened from the
 * Community page (ADR 0155 "As built (stage 65 C1)"): its Back then goes
 * to `communityBackHref`.
 */
export const FROM_COMMUNITY = 'from=community';
/** The start page's query that opens the Community page (and its kept view). */
export const OPEN_COMMUNITY = 'community';

/** `<base>r/<id>?from=community` (on the dev server the e2e hook `cloudtest` kept). */
export function runHref(id: string, base = '/', cloudtest = false): string {
  return `${base}r/${encodeURIComponent(id)}?${FROM_COMMUNITY}${cloudtest ? '&cloudtest' : ''}`;
}

/** Where the watch page's Back goes for a run opened from here: `<base>?community`. */
export function communityBackHref(base = '/', cloudtest = false): string {
  return `${base}?${OPEN_COMMUNITY}${cloudtest ? '&cloudtest' : ''}`;
}
