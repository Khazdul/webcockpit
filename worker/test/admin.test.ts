// The admin page and its Access check in workerd (ADR 0148, addendum of
// 2026-11-14), with an RSA key made here standing in for the Access team's
// key, served by a stub of https://<team>/cdn-cgi/access/certs.
import { exports } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdminFlag, AdminLogEntry, AdminReports, AdminStats, PubMeta } from '../../shared/cloud/api.ts';
import { forgetAccessKeys } from '../access.ts';
import { handle } from '../router.ts';
import type { Deps, Env } from '../runtime.ts';
import { recordBeat, rollUp } from '../stats.ts';
import { T, at, count, db, device, emptyTables, envWith, faultyBucket, r2Keys, realEnv } from './helpers.ts';
import { call as userCall, payload, post as userPost, pubRow, publish, reportOf, signUp } from './share-helpers.ts';

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
    expect(s.flags).toEqual({
      stats: { value: true, default: true, override: null },
      accounts: { value: true, default: true, override: null },
      sync: { value: true, default: true, override: null },
      runs: { value: false, default: false, override: null },
      share: { value: false, default: false, override: null },
    });
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

describe('moderation (stage 64, ADR 0154)', () => {
  const write = (path: string, body: unknown, o: { headers?: Record<string, string>; env?: Env } = {}) =>
    call(path, {
      env: o.env ?? adminEnv(),
      init: { method: 'POST', headers: o.headers ?? { 'X-WC': '1', Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    });
  const read = async <T>(path: string): Promise<T> => {
    const res = await call(path);
    expect(res.status, path).toBe(200);
    return (await res.json()) as T;
  };
  /** The share-helpers' accounts make their own requests at their own time; the admin's are at NOW of this file. */
  async function reported(n: number): Promise<{ alice: string; id: string; reporters: string[] }> {
    const alice = await signUp('alice');
    const id = await publish(alice, payload(321));
    const reporters: string[] = [];
    for (let i = 0; i < n; i++) {
      const c = await signUp(`rep${i}`, { rules: false });
      reporters.push(c);
      expect((await reportOf(c, id, { reason: i % 2 ? 'rules' : 'harassment', ...(i === n - 1 ? { text: 'the newest' } : {}) }, { now: T('2026-11-15T12:00:00Z') + i })).status).toBe(204);
    }
    return { alice, id, reporters };
  }

  it('every moderation path is behind the Access check; writes need X-WC and the same Origin', async () => {
    for (const path of ['/api/admin/reports', '/api/admin/log', '/api/admin/pub/AAAAAAAAAAAA', '/api/admin/pub/AAAAAAAAAAAA/payload', '/api/admin/account/alice']) {
      expect((await call(path, { token: null })).status, path).toBe(403);
    }
    const { id } = await reported(1);
    for (const headers of [{ Origin: ORIGIN }, { 'X-WC': '1' }, { 'X-WC': '1', Origin: 'https://evil.example' }] as Record<string, string>[]) {
      expect((await write(`/api/admin/pub/${id}`, { action: 'hide' }, { headers })).status).toBe(403);
      expect((await write('/api/admin/account/alice', { action: 'suspend' }, { headers })).status).toBe(403);
    }
    expect((await pubRow(id))?.state).toBe('active');
    expect(await count('admin_log')).toBe(0);
  });

  it('GET /api/admin/reports: open reports by item with reasons, reporters, the newest text; the totals of published runs', async () => {
    const { id } = await reported(3);
    const alice2 = await signUp('carol');
    await publish(alice2, payload(1000));
    const answer = await read<AdminReports>('/api/admin/reports');
    expect(answer).toEqual({
      items: [
        {
          kind: 'run',
          target: id,
          title: 'Orc fight at the ford',
          sender: 'alice',
          state: 'active',
          reasons: { harassment: 2, rules: 1 },
          reporters: 3,
          newest: T('2026-11-15T12:00:00Z') + 2,
          text: 'the newest',
        },
      ],
      pubs: { count: 2, bytes: 1321, today: 2 },
    } satisfies AdminReports);
  });

  it('hide, restore and delete a run: each marks its reports handled and writes the log (who is a hash)', async () => {
    const { id } = await reported(2);
    expect((await write(`/api/admin/pub/${id}`, { action: 'hide', note: 'looks bad' })).status).toBe(204);
    expect(await pubRow(id)).toMatchObject({ state: 'hidden', hidden_reason: 'admin' });
    expect((await userCall('GET', `/api/pub/${id}`)).status).toBe(451);
    // The queue is empty now: the reports are handled.
    expect((await read<AdminReports>('/api/admin/reports')).items).toEqual([]);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM report WHERE handled = 0').first<{ n: number }>())?.n).toBe(0);

    // The admin still sees the hidden run and its payload.
    const meta = await read<PubMeta>(`/api/admin/pub/${id}`);
    expect(meta).toMatchObject({ id, sender: 'alice', hidden: true, bytes: 321 });
    const bytes = await call(`/api/admin/pub/${id}/payload`);
    expect(bytes.status).toBe(200);
    expect(new Uint8Array(await bytes.arrayBuffer())).toEqual(payload(321));

    expect((await write(`/api/admin/pub/${id}`, { action: 'restore' })).status).toBe(204);
    expect(await pubRow(id)).toMatchObject({ state: 'active', hidden_reason: null });
    expect((await userCall('GET', `/api/pub/${id}`)).status).toBe(200);

    expect((await write(`/api/admin/pub/${id}`, { action: 'delete' })).status).toBe(204);
    expect(await pubRow(id)).toMatchObject({ state: 'removed', title: '', bytes: 0 });
    expect(await r2Keys()).toEqual([]);
    expect((await db.prepare("SELECT pub_count, pub_bytes FROM account WHERE name_key = 'alice'").first())).toEqual({ pub_count: 0, pub_bytes: 0 });
    expect((await userCall('GET', `/api/pub/${id}`)).status).toBe(410);
    expect((await call(`/api/admin/pub/${id}`)).status).toBe(410);
    expect((await write(`/api/admin/pub/${id}`, { action: 'restore' })).status).toBe(410);

    const { entries } = await read<{ entries: AdminLogEntry[] }>('/api/admin/log');
    expect(entries.map((e) => [e.action, e.target, e.note])).toEqual([
      ['pub.delete', id, ''],
      ['pub.restore', id, ''],
      ['pub.hide', id, 'looks bad'],
    ]);
    const who = (await db.prepare('SELECT DISTINCT who FROM admin_log').all<{ who: string }>()).results;
    expect(who.length).toBe(1);
    expect(who[0]?.who).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(JSON.stringify(await db.prepare('SELECT * FROM admin_log').all())).not.toMatch(/owner|example\.org/i);
  });

  it('a run action: 400 for a bad body, 404 for an unknown run', async () => {
    const { id } = await reported(1);
    for (const b of [{}, { action: 'ban' }, { action: 'hide', more: 1 }, { action: 'hide', note: 'x'.repeat(501) }, { action: 'hide', note: 'a\u0000' }]) {
      expect((await write(`/api/admin/pub/${id}`, b)).status, JSON.stringify(b)).toBe(400);
    }
    expect((await write('/api/admin/pub/AAAAAAAAAAAA', { action: 'hide' })).status).toBe(404);
    expect((await write('/api/admin/pub/bad', { action: 'hide' })).status).toBe(404);
    expect((await call('/api/admin/pub/AAAAAAAAAAAA/payload')).status).toBe(404);
    expect(await count('admin_log')).toBe(0);
  });

  it('suspend and restore an account: it syncs but cannot share or report while suspended', async () => {
    const { alice, id } = await reported(1);
    const bob = await signUp('bob');
    expect((await write('/api/admin/account/Alice', { action: 'suspend', note: 'spam' })).status).toBe(204);
    expect((await db.prepare("SELECT state FROM account WHERE name_key = 'alice'").first())).toEqual({ state: 'suspended' });
    expect((await userPost(alice)).status).toBe(403);
    expect((await userCall('GET', '/api/u/account', undefined, { cookie: alice })).status).toBe(200);
    // Its published runs stay.
    expect((await userCall('GET', `/api/pub/${id}`)).status).toBe(200);
    // A suspended account cannot report either.
    await write('/api/admin/account/bob', { action: 'suspend' });
    expect((await reportOf(bob, id)).status).toBe(403);
    expect((await write('/api/admin/account/alice', { action: 'restore' })).status).toBe(204);
    expect((await userPost(alice)).status).toBe(200);
    const { entries } = await read<{ entries: AdminLogEntry[] }>('/api/admin/log');
    expect(entries.map((e) => [e.action, e.target])).toEqual([
      ['account.restore', 'alice'],
      ['account.suspend', 'bob'],
      ['account.suspend', 'alice'],
    ]);
    expect((await write('/api/admin/account/nobody', { action: 'suspend' })).status).toBe(404);
    expect((await write('/api/admin/account/a b', { action: 'suspend' })).status).toBe(404);
    expect((await write('/api/admin/account/alice', { action: 'ban' })).status).toBe(400);
  });

  it('delete an account: only with its name typed; its runs, items and sessions go, its name is reserved', async () => {
    const { alice, id } = await reported(2);
    expect((await write('/api/admin/account/alice', { action: 'delete' })).status).toBe(400);
    expect((await write('/api/admin/account/alice', { action: 'delete', confirm: 'bob' })).status).toBe(400);
    expect(await count('admin_log')).toBe(0);
    expect((await write('/api/admin/account/alice', { action: 'delete', confirm: 'ALICE', note: 'gone' })).status).toBe(204);
    expect(await db.prepare("SELECT 1 FROM account WHERE name_key = 'alice'").first()).toBeNull();
    expect(await db.prepare("SELECT 1 AS x FROM reserved_name WHERE name_key = 'alice'").first()).toEqual({ x: 1 });
    expect((await userCall('GET', '/api/u/account', undefined, { cookie: alice })).status).toBe(401);
    expect((await userCall('GET', `/api/pub/${id}`)).status).toBe(410);
    expect(await r2Keys('pub/')).toEqual([]);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM report WHERE handled = 0').first<{ n: number }>())?.n).toBe(0);
    expect((await read<{ entries: AdminLogEntry[] }>('/api/admin/log')).entries.map((e) => [e.action, e.target, e.note])).toEqual([['account.delete', 'alice', 'gone']]);
    expect((await write('/api/admin/account/alice', { action: 'delete', confirm: 'alice' })).status).toBe(404);
  });

  it('delete an account with R2 failing: the account and its links are gone; the cron catches the objects', async () => {
    const { id } = await reported(0);
    expect((await write('/api/admin/account/alice', { action: 'delete', confirm: 'alice' }, { env: adminEnv({ FILES: faultyBucket({ fail: ['delete', 'list'] }) }) })).status).toBe(204);
    expect((await userCall('GET', `/api/pub/${id}`)).status).toBe(410);
    expect(await r2Keys()).toEqual([`pub/${id}`]);
  });

  it('the log keeps the newest 100', async () => {
    await db.batch(Array.from({ length: 105 }, (_, i) => db.prepare("INSERT INTO admin_log (ts, who, action, target, note) VALUES (?1, 'w', 'pub.hide', ?2, '')").bind(i, `t${i}`)));
    const { entries } = await read<{ entries: AdminLogEntry[] }>('/api/admin/log');
    expect(entries.length).toBe(100);
    expect(entries[0]).toEqual({ ts: 104, action: 'pub.hide', target: 't104', note: '' });
  });

  it('works with the flag share off (the admin can clean up)', async () => {
    const { id } = await reported(1);
    expect((await write(`/api/admin/pub/${id}`, { action: 'hide' }, { env: adminEnv({ FLAG_SHARE: false }) })).status).toBe(204);
  });
});
