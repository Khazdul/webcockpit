// Calls through the router as the admin (stage 66's tests): an RSA key
// made here stands in for the Access team's key, served by a stub of
// https://<team>/cdn-cgi/access/certs (as admin.test.ts does).
import { forgetAccessKeys } from '../access.ts';
import { handle } from '../router.ts';
import type { Deps, Env } from '../runtime.ts';
import { at, envWith } from './helpers.ts';
import { NOW as SHARE_NOW } from './share-helpers.ts';

export const NOW = SHARE_NOW;
export const TEAM = 'webcockpit-test.cloudflareaccess.com';
export const AUD = 'a'.repeat(64);
export const OWNER = 'owner@example.org';
export const ORIGIN = 'https://example.test';
export const WRITE_HEADERS = { 'X-WC': '1', Origin: ORIGIN, 'Content-Type': 'application/json' };

const enc = (v: unknown): string => b64(new TextEncoder().encode(JSON.stringify(v)));
function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let key: CryptoKeyPair | null = null;

async function keyPair(): Promise<CryptoKeyPair> {
  key ??= (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  return key;
}

export const goodClaims = (now = NOW): Record<string, unknown> => ({
  iss: `https://${TEAM}`,
  aud: [AUD],
  email: OWNER,
  sub: 'u1',
  type: 'app',
  iat: now / 1000 - 60,
  nbf: now / 1000 - 60,
  exp: now / 1000 + 3600,
});

export async function sign(claims: Record<string, unknown>): Promise<string> {
  const head = enc({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = enc(claims);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', (await keyPair()).privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64(new Uint8Array(sig))}`;
}

export const adminEnv = (over: Partial<Record<keyof Env, unknown>> = {}): Env =>
  envWith({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ADMIN_EMAILS: OWNER, API_LIMITER: undefined, AUTH_LIMITER: undefined, FLAG_SHARE: true, ...over });

export function adminDeps(now = NOW): Deps {
  return at(now, async (url) => {
    if (url !== `https://${TEAM}/cdn-cgi/access/certs`) return new Response('wrong url', { status: 404 });
    const jwk = (await crypto.subtle.exportKey('jwk', (await keyPair()).publicKey)) as JsonWebKey;
    return Response.json({ keys: [{ kid: 'k1', kty: 'RSA', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }] });
  });
}

export interface AdminOpts {
  /** null: no token; undefined: the owner's good token. */
  token?: string | null;
  env?: Env;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  now?: number;
}

/** A request through the router (`handle`), as the owner unless told otherwise; writes carry X-WC and the Origin by default. */
export async function admin(path: string, o: AdminOpts = {}): Promise<Response> {
  const method = o.method ?? (o.body === undefined ? 'GET' : 'POST');
  const headers = new Headers(o.headers ?? (method === 'GET' || method === 'HEAD' ? {} : WRITE_HEADERS));
  const token = o.token === undefined ? await sign(goodClaims(o.now)) : o.token;
  if (token) headers.set('Cf-Access-Jwt-Assertion', token);
  const init: RequestInit = { method, headers };
  if (o.body !== undefined) init.body = JSON.stringify(o.body);
  return handle(new Request(`${ORIGIN}${path}`, init), o.env ?? adminEnv(), adminDeps(o.now));
}

/** The answer's JSON after checking its status. */
export async function adminJson<T>(path: string, o: AdminOpts = {}, status = 200): Promise<T> {
  const res = await admin(path, o);
  const text = await res.text();
  if (res.status !== status) throw new Error(`${o.method ?? 'GET'} ${path}: ${res.status} ${text}`);
  return JSON.parse(text) as T;
}

export { forgetAccessKeys };
