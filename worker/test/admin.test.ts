// The admin page and its Access check in workerd (ADR 0148, addendum of
// 2026-11-14), with an RSA key made here standing in for the Access team's
// key, served by a stub of https://<team>/cdn-cgi/access/certs.
import { exports } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdminFlag, AdminStats } from '../../shared/cloud/api.ts';
import { forgetAccessKeys } from '../access.ts';
import { handle } from '../router.ts';
import type { Deps, Env } from '../runtime.ts';
import { recordBeat, rollUp } from '../stats.ts';
import { T, at, db, device, emptyTables, envWith, realEnv } from './helpers.ts';

const NOW = T('2026-11-14T12:00:00Z');
const TEAM = 'webcockpit-test.cloudflareaccess.com';
const AUD = 'a'.repeat(64);
const OWNER = 'owner@example.org';
const ORIGIN = 'https://staging.example.test';

const enc = (v: unknown): string => b64(new TextEncoder().encode(JSON.stringify(v)));
function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

type Pair = CryptoKeyPair;
let key: Pair;
let other: Pair;
let certFetches = 0;

async function rsa(): Promise<Pair> {
  return (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as Pair;
}

async function sign(claims: Record<string, unknown>, opts: { with?: Pair; kid?: string; alg?: string } = {}): Promise<string> {
  const head = enc({ alg: opts.alg ?? 'RS256', kid: opts.kid ?? 'k1', typ: 'JWT' });
  const body = enc(claims);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', (opts.with ?? key).privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64(new Uint8Array(sig))}`;
}

const goodClaims = (): Record<string, unknown> => ({
  iss: `https://${TEAM}`,
  aud: [AUD],
  email: OWNER,
  sub: 'u1',
  type: 'app',
  iat: NOW / 1000 - 60,
  nbf: NOW / 1000 - 60,
  exp: NOW / 1000 + 3600,
});

const adminEnv = (over: Partial<Record<keyof Env, unknown>> = {}): Env =>
  envWith({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ADMIN_EMAILS: `someone@example.org, ${OWNER.toUpperCase()}`, ...over });

function deps(now = NOW): Deps {
  return at(now, async (url) => {
    certFetches++;
    if (url !== `https://${TEAM}/cdn-cgi/access/certs`) return new Response('wrong url', { status: 404 });
    const jwk = (await crypto.subtle.exportKey('jwk', key.publicKey)) as JsonWebKey;
    return Response.json({ keys: [{ kid: 'k1', kty: 'RSA', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }], public_cert: { kid: 'k1', cert: '' } });
  });
}

async function call(path: string, opts: { token?: string | null; env?: Env; init?: RequestInit; now?: number } = {}): Promise<Response> {
  const headers = new Headers(opts.init?.headers);
  const token = opts.token === undefined ? await sign(goodClaims()) : opts.token;
  if (token) headers.set('Cf-Access-Jwt-Assertion', token);
  return handle(new Request(`${ORIGIN}${path}`, { ...opts.init, headers }), opts.env ?? adminEnv(), deps(opts.now));
}

beforeAll(async () => {
  key = await rsa();
  other = await rsa();
});

beforeEach(async () => {
  await emptyTables();
  forgetAccessKeys();
  certFetches = 0;
});

describe('the Access check', () => {
  it('lets a good token from a listed e-mail through', async () => {
    const res = await call('/api/admin/stats');
    expect(res.status).toBe(200);
    // The keys are fetched once and kept.
    await call('/api/admin/stats');
    expect(certFetches).toBe(1);
  });

  it('answers 503 admin_not_configured while the team, audience or e-mails are missing', async () => {
    for (const missing of ['ACCESS_TEAM_DOMAIN', 'ACCESS_AUD', 'ADMIN_EMAILS'] as const) {
      const res = await call('/api/admin/stats', { env: adminEnv({ [missing]: '' }) });
      expect(res.status, missing).toBe(503);
      expect(await res.json(), missing).toEqual({ error: 'admin_not_configured' });
    }
    // The test Worker has none of them: the real entry answers the same.
    for (const path of ['/admin', '/admin/admin.js', '/api/admin/stats', '/api/admin/flags/stats', '/api/admin/nope']) {
      const res = await exports.default.fetch(`https://example.test${path}`);
      expect(res.status, path).toBe(503);
      expect(await res.json(), path).toEqual({ error: 'admin_not_configured' });
    }
  });

  it('answers 403 to a missing or bad token', async () => {
    const cases: [string, string | null][] = [
      ['no token', null],
      ['garbage', 'not.a.token'],
      ['two parts', 'abc.def'],
      ['wrong audience', await sign({ ...goodClaims(), aud: ['b'.repeat(64)] })],
      ['audience as another string', await sign({ ...goodClaims(), aud: 'b'.repeat(64) })],
      ['wrong issuer', await sign({ ...goodClaims(), iss: 'https://evil.cloudflareaccess.com' })],
      ['expired', await sign({ ...goodClaims(), exp: NOW / 1000 - 120 })],
      ['no expiry', await sign({ ...goodClaims(), exp: undefined })],
      ['not yet valid', await sign({ ...goodClaims(), nbf: NOW / 1000 + 600 })],
      ['signed by another key', await sign(goodClaims(), { with: other })],
      ['an unknown key id', await sign(goodClaims(), { kid: 'k9' })],
      ['alg none', await sign(goodClaims(), { alg: 'none' })],
      ['e-mail not in the list', await sign({ ...goodClaims(), email: 'stranger@example.org' })],
      ['no e-mail (a service token)', await sign({ ...goodClaims(), email: undefined })],
    ];
    const good = await sign(goodClaims());
    const [h, p] = good.split('.');
    cases.push(['claims changed after signing', `${h}.${enc({ ...goodClaims(), email: OWNER, exp: NOW / 1000 + 99999 })}.${good.split('.')[2]}`]);
    cases.push(['header of another token', `${h}.${p}.${(await sign(goodClaims(), { with: other })).split('.')[2]}`]);
    for (const [what, token] of cases) {
      const res = await call('/api/admin/stats', { token });
      expect(res.status, what).toBe(403);
      expect(await res.json(), what).toEqual({ error: 'forbidden' });
    }
  });

  it('accepts aud as a plain string and the team domain with https://', async () => {
    const token = await sign({ ...goodClaims(), aud: AUD });
    expect((await call('/api/admin/stats', { token, env: adminEnv({ ACCESS_TEAM_DOMAIN: `https://${TEAM}/` }) })).status).toBe(200);
  });

  it('answers 403 when the certs cannot be fetched', async () => {
    const res = await handle(
      new Request(`${ORIGIN}/api/admin/stats`, { headers: { 'Cf-Access-Jwt-Assertion': await sign(goodClaims()) } }),
      adminEnv(),
      at(NOW),
    );
    expect(res.status).toBe(403);
  });
});

describe('the admin page', () => {
  it('serves the page, its style and script with a strict CSP', async () => {
    const page = await call('/admin');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toMatch(/^text\/html/);
    const csp = page.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    const html = await page.text();
    expect(html).toContain('/admin/admin.js');
    expect(html).not.toMatch(/<script>[^<]/);
    expect(html).not.toMatch(/https?:\/\/(?!dash\.cloudflare\.com)/);
    expect((await call('/admin/admin.css')).headers.get('content-type')).toMatch(/^text\/css/);
    const js = await call('/admin/admin.js');
    expect(js.headers.get('content-type')).toMatch(/^text\/javascript/);
    expect(await js.text()).not.toContain('innerHTML');
    expect((await call('/admin/nope')).status).toBe(404);
    expect((await call('/admin', { init: { method: 'POST' } })).status).toBe(405);
  });

  it('GET /api/admin/stats has online now, today, the days, the uniques, the estimate and the flags', async () => {
    const day = 86_400_000;
    const a = device();
    const b = device();
    await recordBeat(db, { device: a, version: '0.9.3', type: 'desktop', browser: 'firefox', state: 'playing' }, NOW - day);
    await rollUp(db, '2026-11-13');
    await recordBeat(db, { device: a, version: '0.9.3', type: 'desktop', browser: 'firefox', state: 'playing' }, NOW - 60_000);
    await recordBeat(db, { device: b, version: '0.9.3', type: 'phone', browser: 'safari', state: 'menu' }, NOW);
    await db.prepare('INSERT INTO stat_sample (ts, online, playing) VALUES (?1, 2, 1)').bind(NOW - 120_000).run();
    const res = await call('/api/admin/stats');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const s = (await res.json()) as AdminStats;
    expect(s.now).toBe(NOW);
    expect(s.online).toEqual({ total: 2, menu: 1, playing: 1, replay: 0 });
    expect(s.today).toEqual({ day: '2026-11-14', devices: 2, newDevices: 1, peakOnline: 2, peakPlaying: 1, playMinutes: 5, beats: 2 });
    expect(s.days).toEqual([{ day: '2026-11-13', devices: 1, newDevices: 1, peakOnline: 0, peakPlaying: 0, playMinutes: 5, beats: 1 }]);
    expect(s.weekly).toBe(2);
    expect(s.monthly).toBe(2);
    expect(s.split).toEqual({ day: '2026-11-13', type: { desktop: 1 }, browser: { firefox: 1 }, version: { '0.9.3': 1 } });
    expect(s.usage.limits).toEqual({ requests: 100_000, rowsWritten: 100_000, rowsRead: 5_000_000 });
    expect(s.usage.requests).toBeGreaterThan(0);
    expect(s.usage.rowsWritten).toBeGreaterThan(0);
    expect(s.flags).toEqual({ stats: { value: true, default: true, override: null }, accounts: { value: true, default: true, override: null } });
  });

  it('PUT /api/admin/flags/<name> sets the override, with X-WC and the same Origin', async () => {
    const put = (body: unknown, headers: Record<string, string> = { 'X-WC': '1', Origin: ORIGIN, 'Content-Type': 'application/json' }, name = 'stats') =>
      call(`/api/admin/flags/${name}`, { init: { method: 'PUT', headers, body: JSON.stringify(body) } });
    expect((await put({ value: false }, { Origin: ORIGIN })).status).toBe(403);
    expect((await put({ value: false }, { 'X-WC': '1' })).status).toBe(403);
    expect((await put({ value: false }, { 'X-WC': '1', Origin: 'https://evil.example' })).status).toBe(403);
    expect((await put({ value: 'no' })).status).toBe(400);
    expect((await put({ value: false, more: 1 })).status).toBe(400);
    expect((await put({ value: false }, undefined, 'nope')).status).toBe(404);
    expect((await call('/api/admin/flags/stats')).status).toBe(405);

    const res = await put({ value: false });
    expect(res.status).toBe(200);
    expect((await res.json()) as AdminFlag).toEqual({ value: false, default: true, override: false });
    const config = await handle(new Request(`${ORIGIN}/api/config`), adminEnv(), at(NOW));
    expect(await config.json()).toMatchObject({ flags: { stats: false, accounts: true } });
    expect(await db.prepare('SELECT name, value FROM flag').all().then((r) => r.results)).toEqual([{ name: 'stats', value: 0 }]);
  });

  it('every admin path is checked before routing', async () => {
    for (const path of ['/admin', '/admin/x', '/api/admin', '/api/admin/stats', '/api/admin/flags/stats', '/api/admin/zzz']) {
      expect((await call(path, { token: null })).status, path).toBe(403);
    }
    expect((await call('/api/admin/zzz')).status).toBe(404);
  });
});

describe('staging: X-Robots-Tag', () => {
  it('every answer of the Worker says noindex when NOINDEX is set, and only then', async () => {
    const env = envWith({ NOINDEX: true });
    for (const path of ['/api/health', '/api/config', '/api/nope', '/nope', '/admin']) {
      const res = await handle(new Request(`https://example.test${path}`), env, at(NOW));
      expect(res.headers.get('x-robots-tag'), path).toBe('noindex');
    }
    expect((await handle(new Request('https://example.test/api/health'), realEnv, at(NOW))).headers.get('x-robots-tag')).toBeNull();
  });
});
