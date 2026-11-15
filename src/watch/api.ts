// The watch page's requests (stage 64 C2, ADR 0154; the contract is
// shared/cloud/api.ts "Share links"). Never rejects: every call resolves
// to the value or to a failure with the HTTP status (0: no answer) and
// the server's code.
//
// Three ways to the same run:
//
//   public   GET /api/pub/<id>, /payload   anyone; no cookie is sent (and
//                                          none would reach: its path is /api/u)
//   owner    GET /api/u/pub/<id>, /payload the sender's own hidden run, with
//                                          the session (ADR 0154 "As built (B1)")
//   admin    GET /api/admin/pub/<id>, /payload  `?admin`: behind Cloudflare
//                                          Access, which answers a stranger
//                                          with a redirect (read as `access`)
//
// A view is `POST /api/pub/<id>/view` with the statistics' device id
// (ADR 0147), and a report `POST /api/u/report` (`X-WC: 1`).

import type { PubMeta, ReportRequest } from '../../shared/cloud/api.ts';

export type WatchMode = 'public' | 'owner' | 'admin';

export type Got<T> = { ok: true; value: T } | { ok: false; status: number; code: string };

/** Requests give up after this long (ms); the payload's has its own, longer one. */
export const WATCH_TIMEOUT_MS = 15_000;
export const PAYLOAD_TIMEOUT_MS = 120_000;
/** The most bytes the page reads of a payload (the server stores at most 5 MiB; this is the page's own fuse). */
export const PAYLOAD_READ_MAX = 16 * 1024 * 1024;

const PREFIX: Record<WatchMode, string> = { public: '/api/pub/', owner: '/api/u/pub/', admin: '/api/admin/pub/' };

export type WatchFetch = (url: string, init: RequestInit) => Promise<Response>;

const defaultFetch: WatchFetch = (url, init) => globalThis.fetch(url, init);

function init(mode: WatchMode, timeoutMs: number, extra: RequestInit = {}): RequestInit {
  return {
    // The public paths need no cookie; the owner's needs the session, the admin's the Access cookie.
    credentials: mode === 'public' ? 'omit' : 'same-origin',
    cache: 'no-store',
    // Access answers a stranger with a redirect to its login: not followed.
    redirect: mode === 'admin' ? 'manual' : 'follow',
    ...(typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    ...extra,
  };
}

async function failure(res: Response): Promise<{ ok: false; status: number; code: string }> {
  if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) return { ok: false, status: res.status, code: 'access' };
  let code = '';
  try {
    const d = (await res.json()) as { error?: unknown };
    if (d && typeof d.error === 'string') code = d.error.slice(0, 40);
  } catch {
    /* no JSON */
  }
  return { ok: false, status: res.status, code };
}

const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** `PubMeta` as the contract has it, only its fields; undefined when it is not. */
export function parseMeta(v: unknown): PubMeta | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (!str(o.id, 40) || !str(o.title, 400) || !str(o.description, 2000) || !str(o.sender, 40) || !str(o.character, 200)) return undefined;
  if (!num(o.lengthS) || !num(o.created) || !num(o.views) || !num(o.bytes)) return undefined;
  if (o.level !== undefined && o.level !== null && !num(o.level)) return undefined;
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    sender: o.sender,
    character: o.character,
    ...(num(o.level) ? { level: o.level } : {}),
    lengthS: o.lengthS,
    created: o.created,
    views: o.views,
    bytes: o.bytes,
    ...(o.hidden === true ? { hidden: true as const } : {}),
  };
}

/** The run's meta (`PubMeta`). */
export async function fetchMeta(id: string, mode: WatchMode, f: WatchFetch = defaultFetch): Promise<Got<PubMeta>> {
  try {
    const res = await f(PREFIX[mode] + encodeURIComponent(id), init(mode, WATCH_TIMEOUT_MS, { headers: { Accept: 'application/json' } }));
    if (!res.ok) return failure(res);
    const meta = parseMeta(await res.json());
    return meta ? { ok: true, value: meta } : { ok: false, status: res.status, code: 'bad_answer' };
  } catch {
    return { ok: false, status: 0, code: 'offline' };
  }
}

/**
 * The run's payload as served (gzip JSON), read in pieces so the page can
 * show how much has come (`progress(done, total)`; `total` the declared
 * length, else `expected`). More than `PAYLOAD_READ_MAX` → `too_large`.
 */
export async function fetchPayload(
  id: string,
  mode: WatchMode,
  progress: (done: number, total: number) => void = () => {},
  expected = 0,
  f: WatchFetch = defaultFetch,
): Promise<Got<Uint8Array>> {
  try {
    const res = await f(`${PREFIX[mode]}${encodeURIComponent(id)}/payload`, init(mode, PAYLOAD_TIMEOUT_MS));
    if (!res.ok) return failure(res);
    const declared = Number(res.headers.get('content-length'));
    const total = Number.isSafeInteger(declared) && declared > 0 ? declared : expected;
    if (total > PAYLOAD_READ_MAX) return { ok: false, status: res.status, code: 'too_large' };
    if (!res.body) {
      const all = new Uint8Array(await res.arrayBuffer());
      if (all.byteLength > PAYLOAD_READ_MAX) return { ok: false, status: res.status, code: 'too_large' };
      progress(all.byteLength, total);
      return { ok: true, value: all };
    }
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let n = 0;
    progress(0, total);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > PAYLOAD_READ_MAX) {
        void reader.cancel().catch(() => {});
        return { ok: false, status: res.status, code: 'too_large' };
      }
      parts.push(value);
      progress(n, total);
    }
    const out = new Uint8Array(n);
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.byteLength;
    }
    return { ok: true, value: out };
  } catch {
    return { ok: false, status: 0, code: 'offline' };
  }
}

/** Counts a view of this device (best effort: nothing is shown either way). */
export async function countView(id: string, device: string, f: WatchFetch = defaultFetch): Promise<boolean> {
  try {
    const res = await f(
      `${PREFIX.public}${encodeURIComponent(id)}/view`,
      init('public', WATCH_TIMEOUT_MS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device }) }),
    );
    return res.status === 204;
  } catch {
    return false;
  }
}

/** Sends a report (`204` → ok). */
export async function sendReport(body: ReportRequest, f: WatchFetch = defaultFetch): Promise<Got<null>> {
  try {
    const res = await f(
      '/api/u/report',
      init('owner', WATCH_TIMEOUT_MS, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-WC': '1' },
        body: JSON.stringify(body),
      }),
    );
    if (res.status === 204 || res.ok) return { ok: true, value: null };
    return failure(res);
  } catch {
    return { ok: false, status: 0, code: 'offline' };
  }
}
