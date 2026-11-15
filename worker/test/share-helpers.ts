// Shared by the share links' tests (pub.test.ts, reports.test.ts and the
// moderation part of admin.test.ts): accounts, the two-part POST body of
// a publication, and calls through the router with the flag `share` on.
import { expect } from 'vitest';
import { DEFAULT_KDF, type PubMetaIn, type PubWritten } from '../../shared/cloud/api.ts';
import { toB64url } from '../bytes.ts';
import { handle } from '../router.ts';
import type { Deps, Env } from '../runtime.ts';
import { T, at, db, envWith } from './helpers.ts';

export const ORIGIN = 'https://example.test';
export const NOW = T('2026-11-15T12:00:00Z');
export const DAY = 86_400_000;

const BASE = { API_LIMITER: undefined, AUTH_LIMITER: undefined, BEAT_LIMITER: undefined, FLAG_SHARE: true };
export const ENV = envWith(BASE);
/** The env with the flag on and other bindings or vars replaced. */
export const envOf = (over: Partial<Record<keyof Env, unknown>>): Env => envWith({ ...BASE, ...over });

const bytes = (n: number, fill: number): string => toB64url(Uint8Array.from({ length: n }, (_, i) => (fill * 31 + i * 7) & 255));
const key = (seed: number): string => bytes(32, seed);

export const siteverify: Deps['fetch'] = async (_url, init) => {
  const token = (JSON.parse(init?.body ?? '{}') as { response?: unknown }).response;
  return Response.json(token === 'ok' ? { success: true, hostname: 'example.com', 'error-codes': [] } : { success: false, 'error-codes': ['invalid-input-response'] });
};

export interface Opts {
  now?: number;
  env?: Env;
  cookie?: string;
  headers?: Record<string, string>;
  csrf?: boolean;
  body?: BodyInit;
  ip?: string;
}

export function call(method: string, path: string, json?: unknown, o: Opts = {}): Promise<Response> {
  const headers: Record<string, string> = { 'cf-connecting-ip': o.ip ?? '203.0.113.7' };
  if (o.cookie) headers.cookie = o.cookie;
  if (o.csrf !== false && method !== 'GET' && method !== 'HEAD') {
    headers['x-wc'] = '1';
    headers.origin = ORIGIN;
  }
  const init: RequestInit = { method, headers: { ...headers, ...o.headers } };
  if (o.body !== undefined) init.body = o.body;
  else if (json !== undefined) init.body = JSON.stringify(json);
  return handle(new Request(`${ORIGIN}${path}`, init), o.env ?? ENV, at(o.now ?? NOW, siteverify));
}

function cookieOf(res: Response): string {
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

let ips = 0;
/** A new account; `rules`: the sharing rules ticked (default). Returns its cookie. */
export async function signUp(name: string, o: { rules?: boolean } = {}): Promise<string> {
  ips++;
  const res = await call(
    'POST',
    '/api/auth/register',
    { name, salt: bytes(16, 9), kdf: { ...DEFAULT_KDF }, authKey: key(1), recoveryAuth: key(2), wrapPw: bytes(61, 3), wrapRc: bytes(61, 4), label: 'Firefox on Linux', turnstile: 'ok' },
    { ip: `198.51.${Math.floor(ips / 250)}.${ips % 250}` },
  );
  expect(res.status, `register ${name}`).toBe(201);
  const cookie = cookieOf(res);
  if (o.rules !== false) expect((await call('PATCH', '/api/u/account/prefs', { rulesAccepted: true }, { cookie })).status).toBe(200);
  return cookie;
}

/**
 * A new account `signUp` makes, RANKING_AGE_DAYS + 1 days old, so its
 * reports count towards the five that hide (stage 65 review fix S6).
 */
export async function oldSignUp(name: string, o: { rules?: boolean } = {}): Promise<string> {
  const cookie = await signUp(name, o);
  await db.prepare('UPDATE account SET created = created - ?2 WHERE name_key = ?1').bind(name.toLowerCase(), 8 * DAY).run();
  return cookie;
}

/** The key that proves the password of every account made by `signUp`. */
export const AUTH_KEY = key(1);

export const META: PubMetaIn = { title: 'Orc fight at the ford', description: 'Two orcs.\nOne troll.', character: 'Olev', level: 26, lengthS: 93, listed: false };

/** A payload of `n` bytes that starts with the gzip magic (the Worker never decompresses it). */
export function payload(n: number, fill = 1): Uint8Array<ArrayBuffer> {
  const out = Uint8Array.from({ length: n }, (_, i) => (fill * 13 + i) & 255);
  out[0] = 0x1f;
  if (n > 1) out[1] = 0x8b;
  return out;
}

/** The two-part body: the meta's length (4 bytes, big-endian), its UTF-8 JSON, the payload. */
export function pubBody(meta: unknown, data: Uint8Array, rawMeta?: Uint8Array): Uint8Array<ArrayBuffer> {
  const m = rawMeta ?? new TextEncoder().encode(typeof meta === 'string' ? meta : JSON.stringify(meta));
  const out = new Uint8Array(4 + m.length + data.length);
  new DataView(out.buffer).setUint32(0, m.length);
  out.set(m, 4);
  out.set(data, 4 + m.length);
  return out;
}

/** POST /api/u/pub with its Content-Length (a Request made in the Worker has none of its own). */
export function post(cookie: string, meta: unknown = META, data: Uint8Array = payload(100), o: Opts = {}): Promise<Response> {
  const b = pubBody(meta, data);
  return call('POST', '/api/u/pub', undefined, {
    ...o,
    cookie,
    headers: { 'content-type': 'application/octet-stream', 'content-length': String(b.length), ...o.headers },
    body: o.body ?? b,
  });
}

export async function ok<T>(res: Response): Promise<T> {
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as T;
}

/** Publishes and returns the new id. */
export async function publish(cookie: string, data: Uint8Array = payload(100), meta: unknown = META, o: Opts = {}): Promise<string> {
  return (await ok<PubWritten>(await post(cookie, meta, data, o))).pub.id;
}

export async function accountRow(name: string): Promise<{ id: string; pub_count: number; pub_bytes: number; state: string }> {
  return (await db.prepare('SELECT id, pub_count, pub_bytes, state FROM account WHERE name_key = ?1').bind(name).first()) as {
    id: string;
    pub_count: number;
    pub_bytes: number;
    state: string;
  };
}

export async function pubRow(id: string): Promise<Record<string, unknown> | null> {
  return db.prepare('SELECT * FROM publication WHERE id = ?1').bind(id).first();
}

export async function setLimits(name: string, limits: Record<string, number>): Promise<void> {
  await db.prepare('UPDATE account SET limits = ?2 WHERE name_key = ?1').bind(name, JSON.stringify(limits)).run();
}

/** A report of `id` by the account of `cookie`. */
export function reportOf(cookie: string, id: string, extra: Record<string, unknown> = {}, o: Opts = {}): Promise<Response> {
  return call('POST', '/api/u/report', { kind: 'run', target: id, reason: 'harassment', ...extra }, { ...o, cookie });
}

export const T0 = NOW;
export { T };
