// The client of the share links' own endpoints (stage 64 C1, spec §7.7,
// ADR 0154; the contract is shared/cloud/api.ts "Share links", the server
// worker/pub.ts):
//
//   POST   /api/u/pub          the two-part body: the meta's JSON length as
//                              4 bytes big-endian, the meta JSON (UTF-8),
//                              then the payload's gzip bytes → `PubWritten`
//   GET    /api/u/pub          the account's runs → `{ pubs: MyPub[] }`
//   GET    /api/u/pub/<id>     one of them as the sender sees it → `PubMeta`
//   PATCH  /api/u/pub/<id>     title, description, listed → `PubWritten`
//   DELETE /api/u/pub/<id>     → 204
//
// The rules' tick is the account's (`PATCH /api/u/account/prefs`, the
// account flows' `setPrefs`), not here.
//
// As the account client (src/cloud/account/api.ts): no request unless the
// page may call the API and the flags `accounts` and `share` are on
// (`disabled`); never rejects; `X-WC: 1` on every write, same-origin
// credentials (the session cookie is the browser's); what the server
// answers is checked against the contract before it is used, and its texts
// stay untrusted text (written with `textContent` only).
//
// The upload goes by XMLHttpRequest: fetch cannot report an upload's
// progress, and the dialog draws stage 24's bar while a cut of up to 5 MB
// goes up. Nothing else is sent: the body is built here from the meta and
// the bytes the caller passes, and only from them.

import { type MyPub, NEWS_MAX, PUB_ID_PATTERN, PUB_META_MAX_BYTES, type PubMeta, type PubMetaIn, type PubPatch, type PubWritten } from '../../../shared/cloud/api.ts';
import { accountsEnabled } from '../account/state';
import { flagOn } from '../config';

/**
 * Why a call did not succeed: the server's code, or ours.
 *
 *   payload_too_large  the payload is over the account's `payloadMaxBytes` (`limit`)
 *   pub_quota          the account has `sharedRuns` published runs (`limit`)
 *   rules              the account has not ticked the rules
 *   too_many           listing: the account's `listingsPerDay` first listings today (stage 65)
 *   hidden             a hidden run cannot be edited or listed (stage 65 B: `403 hidden`)
 *   suspended          the account may not publish (or edit)
 *   unauthorized       the session is gone
 *   disabled           the flags or the page say no; nothing was sent
 *   offline            the request did not reach the server
 *   timeout            no answer in time (a POST may or may not have made the link)
 *   cancelled          the caller's signal fired
 *   bad_answer         the server answered something that is not the contract's
 */
export type PubErrorCode =
  | 'payload_too_large'
  | 'pub_quota'
  | 'rules'
  | 'too_many'
  | 'hidden'
  | 'suspended'
  | 'unauthorized'
  | 'not_found'
  | 'bad_request'
  | 'forbidden'
  | 'rate_limited'
  | 'unavailable'
  | 'disabled'
  | 'offline'
  | 'timeout'
  | 'cancelled'
  | 'bad_answer';

const SERVER_CODES: readonly PubErrorCode[] = ['payload_too_large', 'pub_quota', 'rules', 'too_many', 'hidden', 'suspended', 'unauthorized', 'not_found', 'bad_request', 'forbidden', 'rate_limited', 'unavailable'];

export interface PubFailure {
  ok: false;
  code: PubErrorCode;
  /** With `payload_too_large` and `pub_quota`: the server's limit (bytes, or runs). */
  limit?: number;
  status?: number;
}

export type PubResult<T> = { ok: true; value: T } | PubFailure;

/** One request as the transport makes it. */
export interface PubRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  headers: Record<string, string>;
  body?: Uint8Array | string;
  /** Bytes sent so far, of the body's total (the POST). */
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
  timeoutMs: number;
}

/** An answer: the status and the parsed JSON body (undefined when there is none or it is not JSON). */
export interface PubAnswer {
  status: number;
  data: unknown;
}

/** Makes a request; rejects with an `Error` whose message is `offline`, `timeout` or `cancelled`. */
export type PubTransport = (req: PubRequest) => Promise<PubAnswer>;

export interface PubApi {
  /** `POST /api/u/pub`. */
  create(meta: PubMetaIn, payload: Uint8Array, o?: { onProgress?: (sent: number, total: number) => void; signal?: AbortSignal }): Promise<PubResult<MyPub>>;
  /** `GET /api/u/pub`: newest first. */
  list(o?: { signal?: AbortSignal }): Promise<PubResult<MyPub[]>>;
  /** `GET /api/u/pub/<id>`: the sender's own view (`hidden: true` for a hidden run). */
  mine(id: string, o?: { signal?: AbortSignal }): Promise<PubResult<PubMeta>>;
  /** `PATCH /api/u/pub/<id>`. */
  edit(id: string, patch: PubPatch, o?: { signal?: AbortSignal }): Promise<PubResult<MyPub>>;
  /** `DELETE /api/u/pub/<id>`. */
  remove(id: string, o?: { signal?: AbortSignal }): Promise<PubResult<null>>;
}

export interface PubApiOptions {
  transport?: PubTransport;
  /** May a request be made (default: the page may call the API, `accounts` and `share` are on). */
  enabled?: () => Promise<boolean>;
  timeoutMs?: number;
  /** The upload's (default two minutes: 5 MB on a slow line). */
  uploadTimeoutMs?: number;
}

export const PUB_TIMEOUT_MS = 15_000;
export const PUB_UPLOAD_TIMEOUT_MS = 120_000;

/** True when share links are on for this page: accounts on, `share` on (never rejects). */
export async function shareEnabled(): Promise<boolean> {
  try {
    return (await accountsEnabled()) && (await flagOn('share'));
  } catch {
    return false;
  }
}

// --- The body ---

/**
 * The POST's body: the meta's UTF-8 JSON length as 4 bytes big-endian,
 * that JSON, then `payload` (the gzip bytes) as they are. Throws on meta
 * longer than `PUB_META_MAX_BYTES` (the dialog's fields cannot make one).
 */
export function pubBody(meta: PubMetaIn, payload: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(meta));
  if (json.length === 0 || json.length > PUB_META_MAX_BYTES) throw new Error('meta too long');
  const out = new Uint8Array(4 + json.length + payload.length);
  new DataView(out.buffer).setUint32(0, json.length, false);
  out.set(json, 4);
  out.set(payload, 4 + json.length);
  return out;
}

/** The parts of a POST body (tests, and the e2e fake): the meta and the payload, or null when it is not one. */
export function splitPubBody(body: Uint8Array): { meta: unknown; payload: Uint8Array } | null {
  if (body.length < 4) return null;
  const n = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(0, false);
  if (n === 0 || n > PUB_META_MAX_BYTES || 4 + n > body.length) return null;
  try {
    const meta = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body.subarray(4, 4 + n))) as unknown;
    return { meta, payload: body.subarray(4 + n) };
  } catch {
    return null;
  }
}

// --- Reading an answer ---

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
/** A length in seconds: any finite number ≥ 0, read as whole seconds (review fix CR4; the Worker stores whole ones). */
const seconds = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined);

/** `MyPub` with only the contract's fields, or undefined. */
export function parseMyPub(v: unknown): MyPub | undefined {
  if (!isObject(v)) return undefined;
  const { id, title, description, character, level, lengthS, listed, state, created, updated, views, bytes } = v;
  if (typeof id !== 'string' || !PUB_ID_PATTERN.test(id)) return undefined;
  if (!text(title, 1000) || !text(description, 5000) || !text(character, 400)) return undefined;
  if (level !== undefined && !whole(level)) return undefined;
  const len = seconds(lengthS);
  if (len === undefined || typeof listed !== 'boolean' || (state !== 'active' && state !== 'hidden')) return undefined;
  if (!whole(created) || !whole(updated) || !whole(views) || !whole(bytes)) return undefined;
  const out: MyPub = { id, title, description, character, ...(level !== undefined ? { level } : {}), lengthS: len, listed, state, created, updated, views, bytes };
  // Stage 65 (the community): read when they hold, left out when not (an older Worker sends none).
  const { listedAt, stars, comments, news } = v;
  if (whole(listedAt)) out.listedAt = listedAt;
  if (isObject(stars) && whole(stars.sum) && whole(stars.count)) out.stars = { sum: stars.sum, count: stars.count };
  if (whole(comments)) out.comments = comments;
  if (isObject(news) && whole(news.votes) && whole(news.comments)) out.news = { votes: Math.min(NEWS_MAX, news.votes), comments: Math.min(NEWS_MAX, news.comments) };
  return out;
}

function parseList(v: unknown): MyPub[] | undefined {
  if (!isObject(v) || !Array.isArray(v.pubs)) return undefined;
  const out: MyPub[] = [];
  for (const p of v.pubs) {
    // A row this client cannot read is left out, not the whole list (review fix CR4).
    const one = parseMyPub(p);
    if (one) out.push(one);
  }
  return out;
}

function parseWritten(v: unknown): MyPub | undefined {
  return isObject(v) ? parseMyPub((v as Partial<PubWritten>).pub) : undefined;
}

/** `PubMeta` with only the contract's fields, or undefined. */
export function parsePubMeta(v: unknown): PubMeta | undefined {
  if (!isObject(v)) return undefined;
  const { id, title, description, sender, character, level, lengthS, created, views, bytes, hidden } = v;
  if (typeof id !== 'string' || !PUB_ID_PATTERN.test(id)) return undefined;
  if (!text(title, 1000) || !text(description, 5000) || !text(sender, 100) || !text(character, 400)) return undefined;
  if (level !== undefined && !whole(level)) return undefined;
  const len = seconds(lengthS);
  if (len === undefined || !whole(created) || !whole(views) || !whole(bytes)) return undefined;
  if (hidden !== undefined && hidden !== true) return undefined;
  return {
    id,
    title,
    description,
    sender,
    character,
    ...(level !== undefined ? { level } : {}),
    lengthS: len,
    created,
    views,
    bytes,
    ...(hidden === true ? { hidden: true as const } : {}),
  };
}

const fail = (code: PubErrorCode, status?: number): PubFailure => (status === undefined ? { ok: false, code } : { ok: false, code, status });

/** What an answer that is not 2xx means. */
export function pubFailureOf(status: number, data: unknown): PubFailure {
  const code = isObject(data) && typeof data.error === 'string' ? data.error : null;
  // A session that ended (stage 61) is a session that is gone, here.
  if (status === 401 && (code === 'unauthorized' || code === 'session_ended')) return fail('unauthorized', status);
  if (code !== null && (SERVER_CODES as readonly string[]).includes(code) && code !== 'unauthorized') {
    const out = fail(code as PubErrorCode, status);
    if (code === 'payload_too_large' || code === 'pub_quota') {
      const limit = (data as Record<string, unknown>).limit;
      if (whole(limit)) out.limit = limit;
    }
    return out;
  }
  // The framing's own refusals are the client's mistake: a bad request.
  if (code === 'length_required') return fail('bad_request', status);
  if (status === 404) return fail('not_found', status);
  if (status === 429) return fail('rate_limited', status);
  if (status >= 500) return fail('unavailable', status);
  return fail('bad_answer', status);
}

// --- The transport ---

/** The default transport: XMLHttpRequest (the upload's progress). */
export const xhrTransport: PubTransport = (req) =>
  new Promise<PubAnswer>((resolve, reject) => {
    if (typeof XMLHttpRequest === 'undefined') {
      reject(new Error('offline'));
      return;
    }
    const x = new XMLHttpRequest();
    let why: 'offline' | 'timeout' | 'cancelled' = 'offline';
    const onAbort = (): void => {
      why = 'cancelled';
      x.abort();
    };
    const done = (): void => req.signal?.removeEventListener('abort', onAbort);
    x.open(req.method, req.path, true);
    x.withCredentials = false; // same-origin: the cookie goes anyway
    x.timeout = req.timeoutMs;
    x.responseType = 'text';
    for (const [k, v] of Object.entries(req.headers)) x.setRequestHeader(k, v);
    if (req.onProgress && req.body instanceof Uint8Array) {
      const total = req.body.length;
      const report = req.onProgress;
      x.upload.onprogress = (e) => report(Math.min(total, e.loaded), total);
    }
    x.onload = () => {
      done();
      let data: unknown;
      if (x.status !== 204 && x.responseText) {
        try {
          data = JSON.parse(x.responseText) as unknown;
        } catch {
          data = undefined;
        }
      }
      resolve({ status: x.status, data });
    };
    x.ontimeout = () => {
      done();
      reject(new Error('timeout'));
    };
    x.onerror = () => {
      done();
      reject(new Error(why));
    };
    x.onabort = () => {
      done();
      reject(new Error(why === 'offline' ? 'cancelled' : why));
    };
    if (req.signal?.aborted) {
      reject(new Error('cancelled'));
      return;
    }
    req.signal?.addEventListener('abort', onAbort, { once: true });
    x.send((req.body as XMLHttpRequestBodyInit | undefined) ?? null);
  });

// --- The client ---

export function createPubApi(options: PubApiOptions = {}): PubApi {
  const enabled = options.enabled ?? shareEnabled;
  const transport = options.transport ?? xhrTransport;
  const timeoutMs = options.timeoutMs ?? PUB_TIMEOUT_MS;
  const uploadTimeoutMs = options.uploadTimeoutMs ?? PUB_UPLOAD_TIMEOUT_MS;

  async function call<T>(
    method: PubRequest['method'],
    path: string,
    o: { json?: unknown; bytes?: Uint8Array; onProgress?: (sent: number, total: number) => void; signal?: AbortSignal | undefined },
    read: (data: unknown) => T | undefined,
  ): Promise<PubResult<T>> {
    let on = false;
    try {
      on = await enabled();
    } catch {
      on = false;
    }
    if (!on) return fail('disabled');
    if (o.signal?.aborted) return fail('cancelled');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (method !== 'GET') headers['X-WC'] = '1';
    let body: Uint8Array | string | undefined;
    if (o.bytes) {
      headers['Content-Type'] = 'application/octet-stream';
      body = o.bytes;
    } else if (o.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(o.json);
    }
    let a: PubAnswer;
    try {
      a = await transport({
        method,
        path,
        headers,
        ...(body !== undefined ? { body } : {}),
        ...(o.onProgress ? { onProgress: o.onProgress } : {}),
        ...(o.signal ? { signal: o.signal } : {}),
        timeoutMs: o.bytes ? uploadTimeoutMs : timeoutMs,
      });
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      return fail(o.signal?.aborted ? 'cancelled' : m === 'timeout' ? 'timeout' : m === 'cancelled' ? 'cancelled' : 'offline');
    }
    // (XHR's status 0 is a request that never got an answer.)
    if (a.status === 0) return fail('offline');
    if (a.status < 200 || a.status >= 300) return pubFailureOf(a.status, a.data);
    const value = read(a.data);
    return value === undefined ? fail('bad_answer', a.status) : { ok: true, value };
  }

  const one = (id: string): string | null => (PUB_ID_PATTERN.test(id) ? `/api/u/pub/${id}` : null);

  return {
    create: async (meta, payload, o = {}) => {
      let bytes: Uint8Array;
      try {
        bytes = pubBody(meta, payload);
      } catch {
        return fail('bad_request');
      }
      return call('POST', '/api/u/pub', { bytes, onProgress: o.onProgress, signal: o.signal }, parseWritten);
    },
    list: (o = {}) => call('GET', '/api/u/pub', { signal: o.signal }, parseList),
    mine: async (id, o = {}) => {
      const path = one(id);
      return path ? call('GET', path, { signal: o.signal }, parsePubMeta) : fail('not_found');
    },
    edit: async (id, patch, o = {}) => {
      const path = one(id);
      if (!path) return fail('not_found');
      const json: PubPatch = {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.listed !== undefined ? { listed: patch.listed } : {}),
      };
      return call('PATCH', path, { json, signal: o.signal }, parseWritten);
    },
    remove: async (id, o = {}) => {
      const path = one(id);
      return path ? call('DELETE', path, { signal: o.signal }, () => null) : fail('not_found');
    },
  };
}
