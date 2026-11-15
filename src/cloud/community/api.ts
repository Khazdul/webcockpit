// The Community page's client (stage 65 C1, spec §7.8, ADR 0155; the
// contract is shared/cloud/api.ts "The community", the server
// worker/community.ts):
//
//   GET    /api/gallery?sort=&period=all&page=&by=   the list → `GalleryPage`
//   GET    /api/community                            the boxes → `CommunityBoxes`
//   GET    /api/runes                                the board → `RunesBoard`
//   POST   /api/u/runes                              a note → `Note`
//   DELETE /api/u/runes/<id>                         one's own note → 204
//   POST   /api/u/report {kind: 'note', …}           a note reported → 204
//
// The counts and the seen times (`/api/u/community/news`, `/seen`) are
// news.ts's (stage 65 C3), the one place that asks for them.
//
// As the other cloud clients (src/cloud/pub/api.ts): no request unless the
// page may call the API and the flags allow it (`share` and `gallery` for
// every path; `runes` too for the board; `accounts` too for `/api/u/`: a
// guest's reads need no account), never rejects, `X-WC: 1` on every
// write, the session cookie by the browser (same origin), and every answer
// checked against the contract before it is used. The server's texts stay
// untrusted text: the page writes them as text, never as HTML, and never
// makes links of them.
//
// Lives with the Community page in the account pages' lazy chunk (with
// shared/cloud/api.ts).

import {
  type CommunityBoxes,
  type DayRun,
  GALLERY_SORTS,
  type GalleryPage,
  type GalleryRow,
  type GallerySort,
  type MumeBoxes,
  NOTE_MAX,
  type Note,
  PUB_ID_PATTERN,
  COMMUNITY_ID_PATTERN,
  type ReportReason,
  type RunesBoard,
  type Warlord,
} from '../../../shared/cloud/api.ts';
import { accountsEnabled } from '../account/state';
import { apiAllowed, flagOn } from '../config';

/**
 * Why a call did not succeed: the server's code, or ours.
 *
 *   too_many          a limit (5 notes a day, 30 reports a day)
 *   bad_text          the text breaks the rules (the page cleans first; a server's newer rule)
 *   suspended         the account may not write
 *   unauthorized      the session is gone
 *   own               one's own note (Report)
 *   already_reported  this account reported it before
 *   not_found         gone (a removed note), or the flags off on the server
 *   disabled          the flags or the page say no; nothing was sent
 *   offline           the request did not reach the server
 *   timeout           no answer in time
 *   bad_answer        the server answered something that is not the contract's
 */
export type CommunityErrorCode =
  | 'too_many'
  | 'bad_text'
  | 'suspended'
  | 'unauthorized'
  | 'own'
  | 'already_reported'
  | 'kind_closed'
  | 'not_found'
  | 'bad_request'
  | 'forbidden'
  | 'rate_limited'
  | 'unavailable'
  | 'disabled'
  | 'offline'
  | 'timeout'
  | 'bad_answer';

const SERVER_CODES: readonly CommunityErrorCode[] = [
  'too_many',
  'bad_text',
  'suspended',
  'own',
  'already_reported',
  'kind_closed',
  'not_found',
  'bad_request',
  'forbidden',
  'rate_limited',
  'unavailable',
];

export interface CommunityFailure {
  ok: false;
  code: CommunityErrorCode;
  status?: number;
}

export type CommunityResult<T> = { ok: true; value: T } | CommunityFailure;

/** What a request needs allowed: `read` (share, gallery), `runes` (and runes), `user` (and accounts), `userRunes` (all four). */
export type CommunityNeed = 'read' | 'runes' | 'user' | 'userRunes';

/** One request as the transport makes it. */
export interface CommunityRequest {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  headers: Record<string, string>;
  body?: string;
  /** `omit` for the public reads (cacheable, no cookie), `same-origin` for `/api/u/`. */
  credentials: 'omit' | 'same-origin';
  timeoutMs: number;
}

/** An answer: the status and the parsed JSON body (undefined when there is none or it is not JSON). */
export interface CommunityAnswer {
  status: number;
  data: unknown;
}

/** Makes a request; rejects with an `Error` whose message is `offline` or `timeout`. */
export type CommunityTransport = (req: CommunityRequest) => Promise<CommunityAnswer>;

export interface CommunityApiOptions {
  transport?: CommunityTransport;
  /** May a request of this kind be made (default: `communityAllowed`). */
  allowed?: (need: CommunityNeed) => Promise<boolean>;
  timeoutMs?: number;
}

export const COMMUNITY_TIMEOUT_MS = 10_000;

/** The list's question: the sort (the client always asks `period=all`), the page, and a sender. */
export interface ListQuery {
  sort: GallerySort;
  page: number;
  by?: string;
}

export interface CommunityApi {
  list(q: ListQuery): Promise<CommunityResult<GalleryPage>>;
  boxes(): Promise<CommunityResult<CommunityBoxes>>;
  board(): Promise<CommunityResult<RunesBoard>>;
  writeNote(text: string): Promise<CommunityResult<Note>>;
  removeNote(id: string): Promise<CommunityResult<null>>;
  reportNote(id: string, reason: ReportReason, text?: string): Promise<CommunityResult<null>>;
}

/** The flags a request of `need` asks for (never rejects; false on any failure). */
export async function communityAllowed(need: CommunityNeed): Promise<boolean> {
  try {
    if (!apiAllowed()) return false;
    if (!(await flagOn('share')) || !(await flagOn('gallery'))) return false;
    if ((need === 'runes' || need === 'userRunes') && !(await flagOn('runes'))) return false;
    if ((need === 'user' || need === 'userRunes') && !(await accountsEnabled())) return false;
    return true;
  } catch {
    return false;
  }
}

// --- Reading the answers ---

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const NAME = /^[A-Za-z0-9_-]{1,20}$/;

/** A row of the list or a box, with only the contract's fields, or undefined. */
export function parseGalleryRow(v: unknown): GalleryRow | undefined {
  if (!isObject(v)) return undefined;
  const { id, title, sender, character, level, lengthS, listedAt, views, stars, comments } = v;
  if (typeof id !== 'string' || !PUB_ID_PATTERN.test(id)) return undefined;
  if (!text(title, 1000) || !text(sender, 40) || !text(character, 400)) return undefined;
  if (level !== undefined && !whole(level)) return undefined;
  if (typeof lengthS !== 'number' || !Number.isFinite(lengthS) || lengthS < 0) return undefined;
  if (!whole(listedAt) || !whole(views) || !whole(comments)) return undefined;
  if (!isObject(stars) || !whole(stars.sum) || !whole(stars.count)) return undefined;
  return {
    id,
    title,
    sender,
    character,
    ...(level !== undefined ? { level } : {}),
    lengthS: Math.round(lengthS),
    listedAt,
    views,
    stars: { sum: stars.sum, count: stars.count },
    comments,
  };
}

function rowsOf(v: unknown): GalleryRow[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: GalleryRow[] = [];
  for (const r of v) {
    const row = parseGalleryRow(r);
    if (!row) return undefined;
    out.push(row);
  }
  return out;
}

export function parseGalleryPage(v: unknown): GalleryPage | undefined {
  if (!isObject(v)) return undefined;
  const { sort, period, page, rows, more, total, time } = v;
  if (typeof sort !== 'string' || !(GALLERY_SORTS as readonly string[]).includes(sort)) return undefined;
  if (period !== 'week' && period !== 'month' && period !== 'all') return undefined;
  const list = rowsOf(rows);
  if (!list || !whole(page) || page < 1 || typeof more !== 'boolean' || !whole(time)) return undefined;
  // `total` came with round 13; an answer without it counts what it can see.
  const n = whole(total) ? total : (page - 1) * 10 + list.length + (more ? 1 : 0);
  return { sort: sort as GallerySort, period, page, rows: list, more, total: n, time };
}

function warlords(v: unknown): Warlord[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Warlord[] = [];
  for (const w of v.slice(0, 10)) {
    if (!isObject(w) || !text(w.name, 80) || !text(w.race, 80) || !text(w.class, 80)) return undefined;
    out.push({ name: w.name, race: w.race, class: w.class });
  }
  return out;
}

export function parseBoxes(v: unknown): CommunityBoxes | undefined {
  if (!isObject(v)) return undefined;
  const hallOfFame = rowsOf(v.hallOfFame);
  if (!hallOfFame || !whole(v.time)) return undefined;
  let today: DayRun | null = null;
  if (v.today !== null && v.today !== undefined) {
    const row = parseGalleryRow(v.today);
    const d = isObject(v.today) ? v.today.description : undefined;
    if (!row) return undefined;
    today = { ...row, description: text(d, 2000) ? d : '' };
  }
  const out: CommunityBoxes = { hallOfFame, today, time: v.time };
  if (isObject(v.mume)) {
    const west = warlords(v.mume.west);
    const dark = warlords(v.mume.dark);
    if (west && dark) {
      const mume: MumeBoxes = { west, dark };
      if (whole(v.mume.players)) mume.players = v.mume.players;
      out.mume = mume;
    }
  }
  return out;
}

export function parseNote(v: unknown): Note | undefined {
  if (!isObject(v)) return undefined;
  const { id, writer, text: t, created } = v;
  if (typeof id !== 'string' || !COMMUNITY_ID_PATTERN.test(id) || typeof writer !== 'string' || !NAME.test(writer)) return undefined;
  // The server holds notes to NOTE_MAX code points (an older one to 500): anything longer is not a note.
  if (typeof t !== 'string' || [...t].length > 500 || !whole(created)) return undefined;
  return { id, writer, text: t, created };
}

export function parseBoard(v: unknown): RunesBoard | undefined {
  if (!isObject(v) || !Array.isArray(v.notes) || !whole(v.time)) return undefined;
  const notes: Note[] = [];
  for (const n of v.notes) {
    const note = parseNote(n);
    if (!note) return undefined;
    notes.push(note);
  }
  return { notes, time: v.time };
}

// --- Failures ---

const fail = (code: CommunityErrorCode, status?: number): CommunityFailure => (status === undefined ? { ok: false, code } : { ok: false, code, status });

/** What an answer that is not 2xx means. */
export function communityFailureOf(status: number, data: unknown): CommunityFailure {
  const code = isObject(data) && typeof data.error === 'string' ? data.error : null;
  if (status === 401) return fail('unauthorized', status);
  if (code !== null && (SERVER_CODES as readonly string[]).includes(code)) return fail(code as CommunityErrorCode, status);
  if (status === 404) return fail('not_found', status);
  if (status === 429) return fail('rate_limited', status);
  if (status >= 500) return fail('unavailable', status);
  return fail('bad_answer', status);
}

// --- The transport ---

/** The default transport: fetch with a timeout. */
export const fetchTransport: CommunityTransport = async (req) => {
  const f = globalThis.fetch;
  if (typeof f !== 'function') throw new Error('offline');
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl?.abort();
  }, req.timeoutMs);
  try {
    const res = await f(req.path, {
      method: req.method,
      headers: req.headers,
      credentials: req.credentials,
      ...(req.body !== undefined ? { body: req.body } : {}),
      ...(ctl ? { signal: ctl.signal } : {}),
    });
    let data: unknown;
    if (res.status !== 204) {
      try {
        data = (await res.json()) as unknown;
      } catch {
        data = undefined;
      }
    }
    return { status: res.status, data };
  } catch {
    throw new Error(timedOut ? 'timeout' : 'offline');
  } finally {
    clearTimeout(timer);
  }
};

// --- The client ---

/** The Community page's client (one per page is enough; it keeps nothing). */
export function communityApi(o: CommunityApiOptions = {}): CommunityApi {
  const transport = o.transport ?? fetchTransport;
  const allowed = o.allowed ?? communityAllowed;
  const timeoutMs = o.timeoutMs ?? COMMUNITY_TIMEOUT_MS;

  async function call<T>(
    need: CommunityNeed,
    method: CommunityRequest['method'],
    path: string,
    parse: (data: unknown, status: number) => T | undefined,
    body?: unknown,
  ): Promise<CommunityResult<T>> {
    try {
      if (!(await allowed(need))) return fail('disabled');
    } catch {
      return fail('disabled');
    }
    const user = need === 'user' || need === 'userRunes';
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (method !== 'GET') headers['X-WC'] = '1';
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let ans: CommunityAnswer;
    try {
      ans = await transport({
        method,
        path,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        credentials: user ? 'same-origin' : 'omit',
        timeoutMs,
      });
    } catch (e) {
      return fail(e instanceof Error && e.message === 'timeout' ? 'timeout' : 'offline');
    }
    if (ans.status < 200 || ans.status > 299) return communityFailureOf(ans.status, ans.data);
    const value = parse(ans.data, ans.status);
    return value === undefined ? fail('bad_answer', ans.status) : { ok: true, value };
  }

  const nothing = (_: unknown, status: number): null | undefined => (status === 204 || status === 200 ? null : undefined);

  return {
    list(q) {
      const page = Math.max(1, Math.floor(q.page));
      const by = q.by === undefined ? '' : `&by=${encodeURIComponent(q.by)}`;
      return call('read', 'GET', `/api/gallery?sort=${q.sort}&period=all&page=${page}${by}`, parseGalleryPage);
    },
    boxes() {
      return call('read', 'GET', '/api/community', parseBoxes);
    },
    board() {
      return call('runes', 'GET', '/api/runes', parseBoard);
    },
    writeNote(t) {
      if ([...t].length > NOTE_MAX) return Promise.resolve(fail('bad_text'));
      return call('userRunes', 'POST', '/api/u/runes', (d) => (isObject(d) ? parseNote(d.note) : undefined), { text: t });
    },
    removeNote(id) {
      if (!COMMUNITY_ID_PATTERN.test(id)) return Promise.resolve(fail('not_found'));
      return call('userRunes', 'DELETE', `/api/u/runes/${id}`, nothing);
    },
    reportNote(id, reason, t) {
      if (!COMMUNITY_ID_PATTERN.test(id)) return Promise.resolve(fail('not_found'));
      return call('userRunes', 'POST', '/api/u/report', nothing, { kind: 'note', target: id, reason, ...(t ? { text: t } : {}) });
    },
  };
}
