// The account endpoints in workerd (spec §7.2, §7.10, ADR 0145; the
// contract is the API table of docs/stages/60-accounts.md). Turnstile's
// siteverify is a stub of deps.fetch: the token `ok` passes, `down` is a
// network failure, `http500` a failing service, anything else fails.
import { exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type Account,
  DEFAULT_ACCOUNT_LIMITS,
  DEFAULT_KDF,
  FLAG_NAMES,
  NAME_PATTERN,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from '../../shared/cloud/api.ts';
import { BUILTIN_RESERVED } from '../accounts.ts';
import { fromB64url, toB64url } from '../bytes.ts';
import { handle } from '../router.ts';
import type { Deps, Env, RateLimiter } from '../runtime.ts';
import { DAILY_CRON, runCron } from '../stats.ts';
import { SITEVERIFY_URL } from '../turnstile.ts';
import { T, at, count, db, emptyTables, envWith, realEnv } from './helpers.ts';

const ORIGIN = 'https://example.test';
const NOW = T('2026-11-14T12:00:00Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const IP = '203.0.113.7';

/** The test Worker's env without the general limiter (its own tests pass a stub). */
const ENV = envWith({ API_LIMITER: undefined });

/** `n` bytes made from `fill`, base64url: a stand-in for a key, a salt or a wrap. */
const bytes = (n: number, fill: number): string => toB64url(Uint8Array.from({ length: n }, (_, i) => (fill * 31 + i * 7) & 255));
/** A 32-byte key (an authKey or a recoveryAuth) by number. */
const key = (seed: number): string => bytes(32, seed);

interface Verify {
  url: string;
  method: string | undefined;
  body: Record<string, unknown>;
}
let verifies: Verify[] = [];

const siteverify: Deps['fetch'] = async (url, init) => {
  const body = JSON.parse(init?.body ?? '{}') as Record<string, unknown>;
  verifies.push({ url, method: init?.method, body });
  const token = body.response;
  if (token === 'down') throw new TypeError('network');
  if (token === 'http500') return new Response('oops', { status: 500 });
  if (token === 'html') return new Response('<html>', { status: 200 });
  if (token === 'ours') return Response.json({ success: false, 'error-codes': ['invalid-input-secret'] });
  if (token === 'ok') return Response.json({ success: true, hostname: 'example.com', 'error-codes': [] });
  if (token === 'ok-host') return Response.json({ success: true, hostname: 'MumeCockpit.com', 'error-codes': [] });
  return Response.json({ success: false, 'error-codes': ['invalid-input-response'] });
};

interface Opts {
  now?: number;
  env?: Env;
  cookie?: string;
  ip?: string | null;
  headers?: Record<string, string>;
  /** false: without the X-WC header and the Origin. */
  csrf?: boolean;
  raw?: string;
}

function call(method: string, path: string, body?: unknown, o: Opts = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (o.ip !== null) headers['cf-connecting-ip'] = o.ip ?? IP;
  if (o.cookie) headers.cookie = o.cookie;
  if (o.csrf !== false && method !== 'GET' && method !== 'HEAD') {
    headers['x-wc'] = '1';
    headers.origin = ORIGIN;
  }
  const init: RequestInit = { method, headers: { ...headers, ...o.headers } };
  if (o.raw !== undefined) init.body = o.raw;
  else if (body !== undefined && method !== 'GET' && method !== 'HEAD') init.body = JSON.stringify(body);
  return handle(new Request(`${ORIGIN}${path}`, init), o.env ?? ENV, at(o.now ?? NOW, siteverify));
}

const post = (path: string, body?: unknown, o?: Opts): Promise<Response> => call('POST', path, body, o);
const get = (path: string, o?: Opts): Promise<Response> => call('GET', path, undefined, o);

function registration(name: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name,
    salt: bytes(16, 9),
    kdf: { ...DEFAULT_KDF },
    authKey: key(1),
    recoveryAuth: key(2),
    wrapPw: bytes(61, 3),
    wrapRc: bytes(61, 4),
    label: 'Firefox on Linux',
    turnstile: 'ok',
    ...over,
  };
}

/** The `name=value` of the session cookie a response sets ('' when it clears it), or null. */
function cookieOf(res: Response): string | null {
  const set = res.headers.get('set-cookie');
  if (set === null) return null;
  const first = set.split(';')[0] ?? '';
  return first === `${SESSION_COOKIE}=` ? '' : first;
}

/** Registers `name` and returns its session cookie. */
async function signUp(name: string, o: Opts = {}, over: Record<string, unknown> = {}): Promise<string> {
  const res = await post('/api/auth/register', registration(name, over), o);
  expect(res.status, `register ${name}`).toBe(201);
  return cookieOf(res) as string;
}

const login = (name: string, seed: number, o: Opts = {}, turnstile?: string): Promise<Response> =>
  post('/api/auth/login', { name, authKey: key(seed), label: 'Chrome on Android', ...(turnstile === undefined ? {} : { turnstile }) }, o);

async function accountOf(cookie: string, o: Opts = {}): Promise<Account> {
  const res = await get('/api/u/account', { ...o, cookie });
  expect(res.status).toBe(200);
  return ((await res.json()) as { account: Account }).account;
}

/** Everything of an answer that a caller can see. */
async function seen(res: Response): Promise<unknown> {
  return { status: res.status, body: await res.text(), headers: [...res.headers].sort() };
}

const errorOf = async (res: Response): Promise<string> => ((await res.json()) as { error: string }).error;

beforeEach(async () => {
  await emptyTables();
  verifies = [];
});

describe('the flag, the secrets and GET /api/config', () => {
  it('lists the flag accounts, and the admin sees it', () => {
    expect(FLAG_NAMES).toContain('accounts');
  });

  it('GET /api/config has the flags, the site key, the limits and the time', async () => {
    const res = await get('/api/config');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('max-age=60');
    expect(await res.json()).toEqual({
      flags: { stats: true, accounts: true },
      turnstileSiteKey: '1x00000000000000000000AA',
      limits: DEFAULT_ACCOUNT_LIMITS,
      time: NOW,
    });
    const bare = await get('/api/config', { env: envWith({ TURNSTILE_SITE_KEY: undefined, FLAG_ACCOUNTS: undefined }) });
    expect(await bare.json()).toMatchObject({ flags: { stats: true, accounts: false }, turnstileSiteKey: '' });
  });

  it('flag off: every account path answers 404 not_found, whatever the method', async () => {
    const off = envWith({ FLAG_ACCOUNTS: false, API_LIMITER: undefined });
    const cookie = await signUp('alice');
    for (const [method, path] of [
      ['GET', '/api/auth/params?name=alice'],
      ['POST', '/api/auth/register'],
      ['POST', '/api/auth/login'],
      ['POST', '/api/auth/recover'],
      ['POST', '/api/u/auth/logout'],
      ['GET', '/api/u/account'],
      ['DELETE', '/api/u/account'],
      ['POST', '/api/u/account/password'],
      ['POST', '/api/u/account/recovery'],
      ['PATCH', '/api/u/account/prefs'],
      ['DELETE', '/api/u/account/sessions/others'],
      ['GET', '/api/u/nope'],
    ] as const) {
      const res = await call(method, path, {}, { env: off, cookie });
      expect(res.status, path).toBe(404);
      expect(await res.json(), path).toEqual({ error: 'not_found' });
    }
    // A row of the flag table opens it, as for the statistics.
    await db.prepare("INSERT INTO flag (name, value) VALUES ('accounts', 1)").run();
    expect((await get('/api/auth/params?name=alice', { env: off, now: NOW + HOUR })).status).toBe(200);
  });

  it('without AUTH_PEPPER or TURNSTILE_SECRET: 503 accounts_not_configured', async () => {
    for (const over of [{ AUTH_PEPPER: undefined }, { AUTH_PEPPER: 'short' }, { TURNSTILE_SECRET: undefined }, { TURNSTILE_SECRET: '' }]) {
      const env = envWith({ ...over, API_LIMITER: undefined });
      for (const res of [
        await get('/api/auth/params?name=alice', { env }),
        await post('/api/auth/register', registration('alice'), { env }),
        await post('/api/auth/login', { name: 'alice', authKey: key(1), label: '' }, { env }),
        await get('/api/u/account', { env }),
      ]) {
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ error: 'accounts_not_configured' });
      }
    }
    expect(await count('account')).toBe(0);
  });

  it('without a database: 503 unavailable', async () => {
    const res = await get('/api/auth/params?name=alice', { env: envWith({ DB: undefined, FLAG_ACCOUNTS: true, API_LIMITER: undefined }) });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });

  it('unknown paths are 404, wrong methods 405 with Allow', async () => {
    for (const path of ['/api/auth/nope', '/api/u/nope', '/api/u/account/sessions/', '/api/auth/params/']) {
      expect((await get(path)).status, path).toBe(404);
    }
    const res = await get('/api/auth/login');
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect((await call('PUT', '/api/u/account')).headers.get('allow')).toBe('GET, DELETE');
  });

  it('answers through the real Worker with its bindings', async () => {
    const res = await exports.default.fetch(`${ORIGIN}/api/auth/params?name=alice`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('the CSRF rule', () => {
  it('a state-changing request needs X-WC: 1 and the site as Origin, before anything is read or written', async () => {
    const cookie = await signUp('alice');
    const cases: Record<string, string>[] = [
      {},
      { 'x-wc': '1' },
      { origin: ORIGIN },
      { 'x-wc': '1', origin: 'https://evil.example' },
      { 'x-wc': '1', origin: 'null' },
      { 'x-wc': '0', origin: ORIGIN },
      { 'x-wc': '1', origin: 'http://example.test' },
    ];
    for (const headers of cases) {
      for (const [method, path, body] of [
        ['POST', '/api/auth/register', registration('bob')],
        ['POST', '/api/auth/login', { name: 'alice', authKey: key(5), label: '' }],
        ['POST', '/api/auth/recover', { name: 'alice', recoveryAuth: key(2), turnstile: 'ok' }],
        ['POST', '/api/u/auth/logout', undefined],
        ['POST', '/api/u/account/password', {}],
        ['POST', '/api/u/account/recovery', {}],
        ['PATCH', '/api/u/account/prefs', { galleryNotice: false }],
        ['DELETE', '/api/u/account/sessions/others', undefined],
        ['DELETE', '/api/u/account', { authKey: key(1) }],
      ] as const) {
        const res = await call(method, path, body, { csrf: false, headers, cookie });
        expect(res.status, `${method} ${path} ${JSON.stringify(headers)}`).toBe(403);
        expect(await res.json()).toEqual({ error: 'forbidden' });
      }
    }
    expect(await count('account')).toBe(1);
    expect(await count('session')).toBe(1);
    expect(await count('attempt')).toBe(2); // the registration's two address counters
    expect(verifies).toHaveLength(1);
    // GETs need neither.
    expect((await get('/api/u/account', { cookie })).status).toBe(200);
  });
});

describe('GET /api/auth/params', () => {
  it('answers a real account with its salt and KDF, whatever the case of the name', async () => {
    await signUp('Alice_1', {}, { salt: bytes(16, 7), kdf: { name: 'pbkdf2-sha256', rounds: 750_000 } });
    for (const name of ['Alice_1', 'alice_1', 'ALICE_1']) {
      const res = await get(`/api/auth/params?name=${name}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toEqual({ salt: bytes(16, 7), kdf: { name: 'pbkdf2-sha256', rounds: 750_000 } });
    }
  });

  it('answers an unknown or impossible name with a stable fake, shaped as a real answer', async () => {
    await signUp('alice');
    const real = await get('/api/auth/params?name=alice');
    const realText = await real.text();
    const salts = new Set<string>();
    for (const name of ['nobody', 'x', 'not a name!', 'p4ssw0rd-typed-here', 'deleted']) {
      const a = await get(`/api/auth/params?name=${encodeURIComponent(name)}`);
      const b = await get(`/api/auth/params?name=${encodeURIComponent(name.toUpperCase())}`, { now: NOW + 40 * DAY, ip: '198.51.100.1' });
      const text = await a.text();
      expect(a.status, name).toBe(200);
      expect(await b.text(), name).toBe(text);
      expect([...a.headers].sort(), name).toEqual([...real.headers].sort());
      const body = JSON.parse(text) as { salt: string; kdf: unknown };
      // The same keys in the same order, the default KDF, 16 bytes of salt.
      expect(Object.keys(body)).toEqual(Object.keys(JSON.parse(realText) as object));
      expect(body.kdf).toEqual(DEFAULT_KDF);
      expect(fromB64url(body.salt)?.length, name).toBe(16);
      expect(text.length).toBe(realText.length);
      salts.add(body.salt);
    }
    expect(salts.size).toBe(5);
    // Another pepper, other fakes.
    const other = await get('/api/auth/params?name=nobody', { env: envWith({ AUTH_PEPPER: 'another-pepper-0123456789', API_LIMITER: undefined }) });
    expect(salts.has(((await other.json()) as { salt: string }).salt)).toBe(false);
    expect(await count('attempt')).toBe(2);
  });

  it('needs a name of a sane length', async () => {
    for (const q of ['', '?name=', `?name=${'a'.repeat(65)}`, '?other=1']) {
      const res = await get(`/api/auth/params${q}`);
      expect(res.status, q).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_request' });
    }
  });

  it('HEAD is GET without a body', async () => {
    const res = await call('HEAD', '/api/auth/params?name=alice');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});

describe('POST /api/auth/register', () => {
  it('makes the account and its first session, and answers 201 with the account and the cookie', async () => {
    const res = await post('/api/auth/register', registration('Alice'));
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const set = res.headers.get('set-cookie') ?? '';
    expect(set).toMatch(new RegExp(`^${SESSION_COOKIE}=[A-Za-z0-9_-]{43}; HttpOnly; Secure; SameSite=Strict; Path=/api/u; Max-Age=${SESSION_SECONDS}$`));
    expect(SESSION_SECONDS).toBe(180 * 86_400);
    const { account } = (await res.json()) as { account: Account };
    expect(account).toEqual({
      name: 'Alice',
      created: NOW,
      state: 'active',
      usage: { items: 0, itemBytes: 0, runBytes: 0 },
      limits: DEFAULT_ACCOUNT_LIMITS,
      sessions: [{ id: expect.stringMatching(/^[A-Za-z0-9_-]{16}$/), label: 'Firefox on Linux', created: NOW, lastUsed: NOW, current: true }],
      prefs: { galleryNotice: true },
    });
    expect(await accountOf(cookieOf(res) as string)).toEqual(account);
    // GET /api/u/account also hands back the current password wrap.
    const own = await get('/api/u/account', { cookie: cookieOf(res) as string });
    expect(await own.json()).toEqual({ account, wrapPw: bytes(61, 3) });

    // What is stored: hashes of the two keys, never the keys; the token's hash, never the token.
    const row = (await db.prepare('SELECT * FROM account').first()) as Record<string, unknown>;
    expect(row).toMatchObject({ name: 'Alice', name_key: 'alice', salt: bytes(16, 9), wrap_pw: bytes(61, 3), wrap_rc: bytes(61, 4), state: 'active' });
    expect(JSON.parse(row.kdf as string)).toEqual(DEFAULT_KDF);
    const sha = async (b64: string): Promise<string> => toB64url(new Uint8Array(await crypto.subtle.digest('SHA-256', fromB64url(b64) as Uint8Array<ArrayBuffer>)));
    expect(row.auth_hash).toBe(await sha(key(1)));
    expect(row.recovery_hash).toBe(await sha(key(2)));
    const everything = JSON.stringify([row, await db.prepare('SELECT * FROM session').all(), await db.prepare('SELECT * FROM attempt').all()]);
    expect(everything).not.toContain(key(1));
    expect(everything).not.toContain(key(2));
    expect(everything).not.toContain(set.split(';')[0]!.split('=')[1]);
    expect(everything).not.toContain(IP);

    // Turnstile was asked once, with the secret and the token and no address.
    expect(verifies).toEqual([{ url: SITEVERIFY_URL, method: 'POST', body: { secret: '1x0000000000000000000000000000000AA', response: 'ok' } }]);
  });

  it('a name is taken without regard to case, and two racing registrations make one account', async () => {
    await signUp('Alice');
    for (const name of ['Alice', 'alice', 'ALICE', 'aLiCe']) {
      const res = await post('/api/auth/register', registration(name, { authKey: key(8) }), { ip: '198.51.100.2' });
      expect(res.status, name).toBe(409);
      expect(await res.json()).toEqual({ error: 'name_taken' });
      expect(res.headers.get('set-cookie')).toBeNull();
    }
    expect(await count('account')).toBe(1);
    expect(await count('session')).toBe(1);
    // A taken name costs the address nothing.
    expect(await count('attempt')).toBe(2);

    const racing = await Promise.all([1, 2, 3, 4].map((i) => post('/api/auth/register', registration('Racer'), { ip: `198.51.100.${10 + i}` })));
    expect(racing.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
    expect(await count('account')).toBe(2);
    expect(await count('session')).toBe(2);
  });

  it('the built-in names cannot be registered', async () => {
    expect([...BUILTIN_RESERVED].every((n) => NAME_PATTERN.test(n) && n === n.toLowerCase())).toBe(true);
    for (const name of ['admin', 'Administrator', 'MODERATOR', 'mod', 'webcockpit', 'cockpit', 'MUME', 'abuse', 'support', 'system', 'root', 'staff', 'owner', 'official', 'anonymous', 'deleted']) {
      const res = await post('/api/auth/register', registration(name), { ip: `198.51.100.${name.length}` });
      expect(res.status, name).toBe(409);
      expect(await res.json()).toEqual({ error: 'name_taken' });
    }
    expect(await count('account')).toBe(0);
    expect(await count('attempt')).toBe(0);
  });

  it('validates every field strictly', async () => {
    const bad: [string, Record<string, unknown>][] = [
      ['short name', { name: 'ab' }],
      ['long name', { name: 'a'.repeat(21) }],
      ['space in name', { name: 'al ice' }],
      ['dot in name', { name: 'al.ice' }],
      ['unicode name', { name: 'ålice' }],
      ['name not a string', { name: 12345 }],
      ['short salt', { salt: bytes(15, 1) }],
      ['long salt', { salt: bytes(17, 1) }],
      ['a 32-byte salt', { salt: bytes(32, 1) }],
      ['padded salt', { salt: `${bytes(16, 1)}==` }],
      ['base64 not url', { salt: 'ab+/ab+/ab+/ab+/ab+/aQ' }],
      ['non-canonical base64url', { salt: `${bytes(16, 1).slice(0, -1)}B` }],
      ['salt not a string', { salt: [1, 2, 3] }],
      ['short authKey', { authKey: bytes(31, 1) }],
      ['long authKey', { authKey: bytes(33, 1) }],
      ['short recoveryAuth', { recoveryAuth: bytes(16, 1) }],
      ['short wrapPw', { wrapPw: bytes(39, 1) }],
      ['long wrapPw', { wrapPw: bytes(201, 1) }],
      ['long wrapRc', { wrapRc: bytes(201, 1) }],
      ['kdf name', { kdf: { name: 'argon2id', rounds: 600_000 } }],
      ['few rounds', { kdf: { name: 'pbkdf2-sha256', rounds: 599_999 } }],
      ['many rounds', { kdf: { name: 'pbkdf2-sha256', rounds: 10_000_001 } }],
      ['rounds not whole', { kdf: { name: 'pbkdf2-sha256', rounds: 600_000.5 } }],
      ['rounds a string', { kdf: { name: 'pbkdf2-sha256', rounds: '600000' } }],
      ['kdf extra key', { kdf: { name: 'pbkdf2-sha256', rounds: 600_000, memory: 1 } }],
      ['kdf null', { kdf: null }],
      ['label not a string', { label: 7 }],
      ['empty turnstile', { turnstile: '' }],
      ['long turnstile', { turnstile: 'x'.repeat(2049) }],
      ['turnstile not a string', { turnstile: true }],
      ['an extra field', { email: 'a@example.org' }],
    ];
    for (const [what, over] of bad) {
      const res = await post('/api/auth/register', registration('alice', over));
      expect(res.status, what).toBe(400);
      expect(await res.json(), what).toEqual({ error: 'bad_request' });
    }
    for (const missing of Object.keys(registration('alice'))) {
      const b = registration('alice');
      delete b[missing];
      expect((await post('/api/auth/register', b)).status, `missing ${missing}`).toBe(400);
    }
    for (const raw of ['', 'not json', '[]', 'null', '"x"', `{"name":"alice","pad":"${'x'.repeat(5000)}"}`]) {
      expect((await post('/api/auth/register', undefined, { raw })).status, raw.slice(0, 20)).toBe(400);
    }
    expect(await count('account')).toBe(0);
    expect(verifies).toEqual([]);

    // The edges that are fine.
    await signUp('a-_', {}, { wrapPw: bytes(40, 1), wrapRc: bytes(200, 1), kdf: { name: 'pbkdf2-sha256', rounds: 10_000_000 } });
    await signUp('A'.repeat(20), { ip: '198.51.100.3' });
  });

  it('keeps what is printable ASCII of a label, cut to 40', async () => {
    const cookie = await signUp('alice', {}, { label: `  Fire\u0000fox ‮ on Linux é ${'x'.repeat(60)}` });
    const [s] = (await accountOf(cookie)).sessions;
    expect(s?.label).toBe(`Firefox  on Linux  ${'x'.repeat(21)}`);
    expect(s?.label.length).toBe(40);
  });

  it('needs a passed Turnstile check; a failing siteverify is 503, never a pass', async () => {
    for (const [token, status, code] of [
      ['bad', 403, 'turnstile'],
      ['down', 503, 'unavailable'],
      ['http500', 503, 'unavailable'],
      ['html', 503, 'unavailable'],
      ['ours', 503, 'unavailable'],
    ] as const) {
      const res = await post('/api/auth/register', registration('alice', { turnstile: token }));
      expect(res.status, token).toBe(status);
      expect(await res.json(), token).toEqual({ error: code });
    }
    expect(await count('account')).toBe(0);
    expect(await count('attempt')).toBe(0);
    expect(verifies).toHaveLength(5);
  });

  it('TURNSTILE_HOSTNAMES, when set, is where a passed challenge must come from', async () => {
    const env = envWith({ TURNSTILE_HOSTNAMES: 'mumecockpit.com, staging.mumecockpit.com', API_LIMITER: undefined });
    const res = await post('/api/auth/register', registration('alice'), { env });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'turnstile' });
    expect((await post('/api/auth/register', registration('alice', { turnstile: 'ok-host' }), { env })).status).toBe(201);
  });

  it('three an hour and ten a day per address, counted under a key that is not the address', async () => {
    let n = 0;
    const reg = (now: number, ip = IP): Promise<Response> => post('/api/auth/register', registration(`user${n++}`), { now, ip });
    for (let i = 0; i < 3; i++) expect((await reg(NOW + i * MIN)).status).toBe(201);
    const fourth = await reg(NOW + 10 * MIN);
    expect(fourth.status).toBe(429);
    expect(await fourth.json()).toEqual({ error: 'rate_limited' });
    // Turnstile is not asked for a registration that is over the limit.
    expect(verifies).toHaveLength(3);
    expect((await reg(NOW + 59 * MIN)).status).toBe(429);
    // Another address has its own count.
    expect((await reg(NOW + 10 * MIN, '198.51.100.9')).status).toBe(201);
    // An hour after the first, three more; and so on to ten in the day.
    for (let i = 0; i < 3; i++) expect((await reg(NOW + HOUR + i * MIN)).status).toBe(201);
    expect((await reg(NOW + HOUR + 5 * MIN)).status).toBe(429);
    for (let i = 0; i < 3; i++) expect((await reg(NOW + 2 * HOUR + i * MIN)).status).toBe(201);
    expect((await reg(NOW + 3 * HOUR)).status).toBe(201);
    expect(await count('account')).toBe(11);
    // The eleventh of the day: the hour would allow it, the day does not.
    expect((await reg(NOW + 3 * HOUR + MIN)).status).toBe(429);
    expect((await reg(NOW + 11 * HOUR)).status).toBe(429);

    const { results } = await db.prepare("SELECT key, count FROM attempt WHERE key LIKE 'reg-%' ORDER BY key").all<{ key: string; count: number }>();
    expect(results).toHaveLength(4);
    expect(results.find((r) => r.key.startsWith('reg-d|') && r.count === 10)).toBeTruthy();
    for (const r of results) {
      expect(r.key).toMatch(/^reg-[hd]\|[A-Za-z0-9_-]{43}$/);
      expect(r.key).not.toContain(IP);
    }
    // The next UTC day: a new pepper, new keys, a new count.
    expect((await reg(NOW + 12 * HOUR + MIN)).status).toBe(201);
    const after = await db.prepare("SELECT key FROM attempt WHERE key LIKE 'reg-%'").all<{ key: string }>();
    expect(after.results).toHaveLength(6);
  });
});

describe('POST /api/auth/login', () => {
  it('answers with the account, the wrapped key and a new session', async () => {
    const first = await signUp('Alice');
    const res = await login('aLICE', 1, { now: NOW + MIN });
    expect(res.status).toBe(200);
    const cookie = cookieOf(res) as string;
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=[A-Za-z0-9_-]{43}$`));
    expect(cookie).not.toBe(first);
    const body = (await res.json()) as { account: Account; wrapPw: string };
    expect(body.wrapPw).toBe(bytes(61, 3));
    expect(body.account.name).toBe('Alice');
    expect(body.account.sessions).toEqual([
      { id: expect.any(String), label: 'Chrome on Android', created: NOW + MIN, lastUsed: NOW + MIN, current: true },
      { id: expect.any(String), label: 'Firefox on Linux', created: NOW, lastUsed: NOW, current: false },
    ]);
    expect((await accountOf(first, { now: NOW + MIN })).sessions.map((s) => s.current)).toEqual([false, true]);
    expect(verifies).toHaveLength(1); // the registration's
  });

  it('validates the body', async () => {
    await signUp('alice');
    for (const b of [
      {},
      { name: 'alice', authKey: key(1) },
      { name: 'alice', authKey: key(1), label: 'x', extra: 1 },
      { name: 'al', authKey: key(1), label: 'x' },
      { name: 'hunter2 is my password', authKey: key(1), label: 'x' },
      { name: 'alice', authKey: bytes(31, 1), label: 'x' },
      { name: 'alice', authKey: key(1), label: 'x', turnstile: '' },
      { name: 'alice', authKey: key(1), label: 'x', turnstile: 5 },
    ]) {
      const res = await post('/api/auth/login', b);
      expect(res.status, JSON.stringify(b)).toBe(400);
    }
    expect(await count('attempt')).toBe(2);
  });

  it('an unknown name and a wrong password are one answer at every stage: failures, Turnstile, the lock', async () => {
    await signUp('alice');
    // The same steps against a real name with a wrong key and a name nobody has.
    const steps: [number, string | undefined][] = [
      [0, undefined], // 401
      [1, undefined], // 401
      [2, 'ok'], //       401 (a token nobody asked for is not looked at)
      [3, undefined], // 403 turnstile_required
      [4, 'bad'], //      403 turnstile
      [5, 'down'], //     503
      [6, 'ok'], //       401, failure 4
      [7, 'ok'],
      [8, 'ok'],
      [9, 'ok'],
      [10, 'ok'],
      [11, 'ok'],
      [12, 'ok'], //      401, failure 10: the lock starts
      [13, 'ok'], //      429 locked
      [14, undefined], // 429 locked
      [20 * 60, undefined], // 401 again after the wait
    ];
    const expected = [401, 401, 401, 403, 403, 503, 401, 401, 401, 401, 401, 401, 401, 429, 429, 401];
    const real: unknown[] = [];
    const fake: unknown[] = [];
    for (const [seconds, token] of steps) {
      real.push(await seen(await login('alice', 77, { now: NOW + seconds * 1000 }, token)));
      fake.push(await seen(await login('nobody', 77, { now: NOW + seconds * 1000 }, token)));
    }
    expect(fake).toEqual(real);
    expect(real.map((r) => (r as { status: number }).status)).toEqual(expected);
    const bodies = real.map((r) => JSON.parse((r as { body: string }).body) as unknown);
    expect(bodies[0]).toEqual({ error: 'invalid_login' });
    expect(bodies[3]).toEqual({ error: 'turnstile_required' });
    expect(bodies[4]).toEqual({ error: 'turnstile' });
    expect(bodies[5]).toEqual({ error: 'unavailable' });
    expect(bodies[12]).toEqual({ error: 'invalid_login' });
    expect(bodies[13]).toEqual({ error: 'locked', retryAfter: 899 });
    expect(bodies[14]).toEqual({ error: 'locked', retryAfter: 898 });
    expect((real[13] as { headers: [string, string][] }).headers).toContainEqual(['retry-after', '899']);
    // No session came of it, and the counters are keyed by an HMAC, not the name.
    expect(await count('session')).toBe(1);
    const { results } = await db.prepare("SELECT key FROM attempt WHERE key LIKE 'login|%'").all<{ key: string }>();
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.key).toMatch(/^login\|[A-Za-z0-9_-]{43}$/);
      expect(r.key).not.toMatch(/alice|nobody/);
    }
  });

  it('the name is counted without regard to case, and from any address', async () => {
    await signUp('alice');
    await login('alice', 7, { ip: '198.51.100.1' });
    await login('ALICE', 7, { ip: '198.51.100.2' });
    await login('Alice', 7, { ip: null });
    expect(await errorOf(await login('aLiCe', 7))).toBe('turnstile_required');
    expect(await count('attempt')).toBe(3);
  });

  it('the lock: ten failures in 15 minutes, then 15 minutes in which the right password waits too', async () => {
    await signUp('alice');
    for (let i = 0; i < 10; i++) {
      const res = await login('alice', 7, { now: NOW + i * MIN }, i >= 3 ? 'ok' : undefined);
      expect(res.status, `failure ${i + 1}`).toBe(401);
    }
    const t10 = NOW + 9 * MIN;
    const during = await login('alice', 1, { now: t10 + 1000 }, 'ok');
    expect(during.status).toBe(429);
    expect(await during.json()).toEqual({ error: 'locked', retryAfter: 899 });
    expect(during.headers.get('set-cookie')).toBeNull();
    const late = await login('alice', 1, { now: t10 + 15 * MIN - 1 }, 'ok');
    expect(await late.json()).toEqual({ error: 'locked', retryAfter: 1 });
    // The lock costs no write and no Turnstile check.
    const row = await db.prepare("SELECT count, until FROM attempt WHERE key LIKE 'login|%'").first();
    expect(row).toEqual({ count: 10, until: t10 + 15 * MIN });
    expect(verifies).toHaveLength(1 + 7);
    // When it ends, the right password logs in, with no Turnstile.
    const after = await login('alice', 1, { now: t10 + 15 * MIN });
    expect(after.status).toBe(200);
    expect(await count('attempt')).toBe(2);
  });

  it('the tenth try is still looked at; a success clears the counter; a window ends after 15 minutes', async () => {
    await signUp('alice');
    for (let i = 0; i < 9; i++) await login('alice', 7, {}, 'ok');
    expect((await login('alice', 1, {}, 'ok')).status).toBe(200);
    expect(await db.prepare("SELECT 1 FROM attempt WHERE key LIKE 'login|%'").first()).toBeNull();
    // Three fresh failures before Turnstile is asked for again.
    for (let i = 0; i < 3; i++) expect((await login('alice', 7)).status).toBe(401);
    expect(await errorOf(await login('alice', 1))).toBe('turnstile_required');
    // The window is over 15 minutes after its first failure.
    expect((await login('alice', 7, { now: NOW + 15 * MIN })).status).toBe(401);
    expect(await db.prepare("SELECT start, count, until FROM attempt WHERE key LIKE 'login|%'").first()).toEqual({ start: NOW + 15 * MIN, count: 1, until: 0 });
    expect((await login('alice', 1, { now: NOW + 16 * MIN })).status).toBe(200);
  });

  it('guesses that race each other are all counted', async () => {
    await signUp('alice');
    const all = await Promise.all(Array.from({ length: 14 }, () => login('alice', 7)));
    const statuses = all.map((r) => r.status);
    // At most three are looked at without Turnstile; none gets past the count.
    expect(statuses.filter((s) => s === 401).length).toBeLessThanOrEqual(3);
    expect(statuses.every((s) => s === 401 || s === 403 || s === 429)).toBe(true);
    const row = await db.prepare("SELECT count FROM attempt WHERE key LIKE 'login|%'").first<{ count: number }>();
    expect(row?.count).toBeGreaterThanOrEqual(3);
  });
});

describe('sessions', () => {
  it('an ordinary request writes nothing; the session and the cookie are renewed at most once a day', async () => {
    const cookie = await signUp('alice');
    const session = (): Promise<{ last_used: number; expires: number } | null> => db.prepare('SELECT last_used, expires FROM session').first();
    const lastSeen = async (): Promise<unknown> => (await db.prepare('SELECT last_seen FROM account').first<{ last_seen: number }>())?.last_seen;
    expect(await session()).toEqual({ last_used: NOW, expires: NOW + SESSION_SECONDS * 1000 });

    for (const dt of [MIN, HOUR, DAY - 1]) {
      const res = await get('/api/u/account', { cookie, now: NOW + dt });
      expect(res.status).toBe(200);
      expect(res.headers.get('set-cookie')).toBeNull();
    }
    expect(await session()).toEqual({ last_used: NOW, expires: NOW + SESSION_SECONDS * 1000 });
    expect(await lastSeen()).toBe(NOW);

    const t = NOW + DAY;
    const renewed = await get('/api/u/account', { cookie, now: t });
    expect(renewed.status).toBe(200);
    expect(renewed.headers.get('set-cookie')).toBe(`${cookie}; HttpOnly; Secure; SameSite=Strict; Path=/api/u; Max-Age=${SESSION_SECONDS}`);
    expect(((await renewed.json()) as { account: Account }).account.sessions[0]?.lastUsed).toBe(t);
    expect(await session()).toEqual({ last_used: t, expires: t + SESSION_SECONDS * 1000 });
    expect(await lastSeen()).toBe(t);

    const again = await get('/api/u/account', { cookie, now: t + HOUR });
    expect(again.headers.get('set-cookie')).toBeNull();
    expect(await session()).toEqual({ last_used: t, expires: t + SESSION_SECONDS * 1000 });
  });

  it('an expired, unknown, malformed or missing session is 401 with the cookie cleared', async () => {
    const cookie = await signUp('alice');
    const cleared = `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/api/u; Max-Age=0`;
    const end = NOW + SESSION_SECONDS * 1000;
    expect((await get('/api/u/account', { cookie, now: NOW + DAY - 1 })).status).toBe(200);
    const cases: [string, Opts][] = [
      ['expired', { cookie, now: end }],
      ['unknown', { cookie: `${SESSION_COOKIE}=${bytes(32, 5)}` }],
      ['malformed', { cookie: `${SESSION_COOKIE}=abc` }],
      ['another cookie', { cookie: `wc_s=${cookie.split('=')[1]}` }],
      ['none', {}],
    ];
    for (const [what, o] of cases) {
      for (const [method, path] of [
        ['GET', '/api/u/account'],
        ['POST', '/api/u/auth/logout'],
        ['DELETE', '/api/u/account'],
        ['PATCH', '/api/u/account/prefs'],
      ] as const) {
        const res = await call(method, path, {}, o);
        expect(res.status, `${what} ${path}`).toBe(401);
        expect(await res.json()).toEqual({ error: 'unauthorized' });
        expect(res.headers.get('set-cookie')).toBe(cleared);
      }
    }
    // Just before its end it still works (and is found among other cookies).
    const res = await get('/api/u/account', { cookie: `a=1; ${cookie}; b=2`, now: end - 1 });
    expect(res.status).toBe(200);
  });

  it('logout ends this session only and clears the cookie', async () => {
    const a = await signUp('alice');
    const b = cookieOf(await login('alice', 1)) as string;
    const res = await post('/api/u/auth/logout', undefined, { cookie: a });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(res.headers.get('set-cookie')).toBe(`${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/api/u; Max-Age=0`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await get('/api/u/account', { cookie: a })).status).toBe(401);
    expect((await accountOf(b)).sessions).toHaveLength(1);
  });

  it('ends one session by its id, or all the others; never another account\'s', async () => {
    const a1 = await signUp('alice');
    const a2 = cookieOf(await login('alice', 1, { now: NOW + 1000 })) as string;
    const a3 = cookieOf(await login('alice', 1, { now: NOW + 2000 })) as string;
    const bob = await signUp('bob', { ip: '198.51.100.4' });
    const ids = async (cookie: string): Promise<string[]> => (await accountOf(cookie)).sessions.map((s) => s.id);
    const [id3, id2, id1] = (await ids(a1)) as [string, string, string];
    const [bobId] = (await ids(bob)) as [string];

    // Bob cannot end Alice's session, nor Alice Bob's: 404, and nothing changes.
    for (const [cookie, id] of [
      [bob, id2],
      [a1, bobId],
      [a1, 'AAAAAAAAAAAAAAAA'],
      [a1, 'short'],
      [a1, '%27%20OR%201=1'],
    ] as const) {
      const res = await call('DELETE', `/api/u/account/sessions/${id}`, undefined, { cookie });
      expect(res.status, id).toBe(404);
    }
    expect(await count('session')).toBe(4);

    const one = await call('DELETE', `/api/u/account/sessions/${id2}`, undefined, { cookie: a1 });
    expect(one.status).toBe(204);
    expect(one.headers.get('set-cookie')).toBeNull();
    expect((await get('/api/u/account', { cookie: a2 })).status).toBe(401);
    expect(await ids(a1)).toEqual([id3, id1]);

    const others = await call('DELETE', '/api/u/account/sessions/others', undefined, { cookie: a3 });
    expect(others.status).toBe(204);
    expect((await get('/api/u/account', { cookie: a1 })).status).toBe(401);
    expect(await ids(a3)).toEqual([id3]);
    expect(await ids(bob)).toEqual([bobId]);

    // Ending the session one is in clears its cookie.
    const self = await call('DELETE', `/api/u/account/sessions/${id3}`, undefined, { cookie: a3 });
    expect(self.status).toBe(204);
    expect(cookieOf(self)).toBe('');
    expect(await count('session')).toBe(1);
  });
});

describe('the account', () => {
  it("the limits are the defaults with the account's own on top; a suspended account says so", async () => {
    const cookie = await signUp('alice');
    await db.prepare("UPDATE account SET state = 'suspended', limits = ?1").bind(JSON.stringify({ runBytes: 1234, items: -5, nonsense: 9, itemBytes: 'much' })).run();
    const a = await accountOf(cookie);
    expect(a.state).toBe('suspended');
    expect(a.limits).toEqual({ ...DEFAULT_ACCOUNT_LIMITS, runBytes: 1234 });
    await db.prepare("UPDATE account SET limits = 'not json'").run();
    expect((await accountOf(cookie)).limits).toEqual(DEFAULT_ACCOUNT_LIMITS);
  });

  it('PATCH prefs sets the gallery notice switch', async () => {
    const cookie = await signUp('alice');
    const res = await call('PATCH', '/api/u/account/prefs', { galleryNotice: false }, { cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ prefs: { galleryNotice: false } });
    expect((await accountOf(cookie)).prefs).toEqual({ galleryNotice: false });
    await call('PATCH', '/api/u/account/prefs', { galleryNotice: true }, { cookie });
    expect((await accountOf(cookie)).prefs).toEqual({ galleryNotice: true });
    for (const b of [{}, { galleryNotice: 'no' }, { galleryNotice: false, other: 1 }, { other: true }]) {
      expect((await call('PATCH', '/api/u/account/prefs', b, { cookie })).status).toBe(400);
    }
  });

  it('a new password: the old key no longer logs in, the new does, the other sessions are gone', async () => {
    const here = await signUp('alice');
    const there = cookieOf(await login('alice', 1)) as string;
    const set = { salt: bytes(16, 21), kdf: { name: 'pbkdf2-sha256', rounds: 700_000 }, authKey: key(22), wrapPw: bytes(61, 23) };

    const wrong = await post('/api/u/account/password', { authKey: key(99), set }, { cookie: here });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'invalid_login' });
    // It counted on the name's login counter.
    expect(await db.prepare("SELECT count FROM attempt WHERE key LIKE 'login|%'").first()).toEqual({ count: 1 });
    for (const b of [{ authKey: key(1) }, { authKey: key(1), set: { ...set, salt: 'x' } }, { authKey: key(1), set: { ...set, more: 1 } }, { authKey: 'x', set }, { authKey: key(1), set, extra: 1 }]) {
      expect((await post('/api/u/account/password', b, { cookie: here })).status).toBe(400);
    }

    const res = await post('/api/u/account/password', { authKey: key(1), set }, { cookie: here });
    expect(res.status).toBe(204);
    expect(await db.prepare("SELECT count FROM attempt WHERE key LIKE 'login|%'").first()).toBeNull();
    expect((await get('/api/u/account', { cookie: there })).status).toBe(401);
    expect((await accountOf(here)).sessions).toHaveLength(1);
    expect(((await (await get('/api/u/account', { cookie: here })).json()) as { wrapPw: string }).wrapPw).toBe(bytes(61, 23));
    expect(await (await get('/api/auth/params?name=alice')).json()).toEqual({ salt: bytes(16, 21), kdf: { name: 'pbkdf2-sha256', rounds: 700_000 } });
    expect((await login('alice', 1)).status).toBe(401);
    const ok = await login('alice', 22);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { wrapPw: string }).wrapPw).toBe(bytes(61, 23));
  });

  it('a locked name waits on the password questions too', async () => {
    const cookie = await signUp('alice');
    for (let i = 0; i < 10; i++) await login('alice', 7, {}, 'ok');
    for (const [method, path, body] of [
      ['POST', '/api/u/account/password', { authKey: key(1), set: { salt: bytes(16, 1), kdf: DEFAULT_KDF, authKey: key(5), wrapPw: bytes(61, 1) } }],
      ['POST', '/api/u/account/recovery', { authKey: key(1), recoveryAuth: key(5), wrapRc: bytes(61, 1) }],
      ['DELETE', '/api/u/account', { authKey: key(1) }],
    ] as const) {
      const res = await call(method, path, body, { cookie, now: NOW + MIN });
      expect(res.status, path).toBe(429);
      expect(await res.json()).toEqual({ error: 'locked', retryAfter: 840 });
    }
    expect(await count('account')).toBe(1);
    // The session itself goes on working.
    expect((await get('/api/u/account', { cookie })).status).toBe(200);
  });
});

describe('POST /api/auth/recover', () => {
  const set = { salt: bytes(16, 31), kdf: { ...DEFAULT_KDF }, authKey: key(32), wrapPw: bytes(61, 33) };

  it('first the wrap for the code, then the new password: every session ended, the old password dead, the code alive', async () => {
    const old1 = await signUp('Alice');
    const old2 = cookieOf(await login('alice', 1)) as string;
    // A lock on the login does not stand in the way of the code.
    for (let i = 0; i < 10; i++) await login('alice', 7, {}, 'ok');
    verifies = [];

    const first = await post('/api/auth/recover', { name: 'alice', recoveryAuth: key(2), turnstile: 'ok' });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ wrapRc: bytes(61, 4) });
    expect(first.headers.get('set-cookie')).toBeNull();
    expect(verifies).toHaveLength(1);
    expect(await count('session')).toBe(2);

    const second = await post('/api/auth/recover', { name: 'ALICE', recoveryAuth: key(2), set, label: 'Safari on iPhone' }, { now: NOW + MIN });
    expect(second.status).toBe(200);
    expect(verifies).toHaveLength(1); // no Turnstile on the second call
    const cookie = cookieOf(second) as string;
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=[A-Za-z0-9_-]{43}$`));
    const { account } = (await second.json()) as { account: Account };
    expect(account.name).toBe('Alice');
    expect(account.sessions).toEqual([{ id: expect.any(String), label: 'Safari on iPhone', created: NOW + MIN, lastUsed: NOW + MIN, current: true }]);
    for (const c of [old1, old2]) expect((await get('/api/u/account', { cookie: c })).status).toBe(401);
    expect(await accountOf(cookie)).toEqual(account);

    // The login lock went with the old password; the old key is dead, the new works.
    expect(await db.prepare("SELECT 1 FROM attempt WHERE key LIKE 'login|%' OR key LIKE 'recover|%'").first()).toBeNull();
    expect((await login('alice', 1, { now: NOW + 2 * MIN })).status).toBe(401);
    const ok = await login('alice', 32, { now: NOW + 2 * MIN });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { wrapPw: string }).wrapPw).toBe(bytes(61, 33));
    // The recovery code still works.
    const again = await post('/api/auth/recover', { name: 'alice', recoveryAuth: key(2), turnstile: 'ok' }, { now: NOW + 3 * MIN });
    expect(await again.json()).toEqual({ wrapRc: bytes(61, 4) });
  });

  it('needs one of the two forms exactly', async () => {
    await signUp('alice');
    for (const b of [
      { name: 'alice', recoveryAuth: key(2) },
      { name: 'alice', recoveryAuth: key(2), turnstile: 'ok', set, label: 'x' },
      { name: 'alice', recoveryAuth: key(2), turnstile: 'ok', label: 'x' },
      { name: 'alice', recoveryAuth: key(2), set },
      { name: 'alice', recoveryAuth: key(2), label: 'x' },
      { name: 'alice', recoveryAuth: key(2), set: { ...set, authKey: 'x' }, label: 'x' },
      { name: 'alice', recoveryAuth: key(2), set: { ...set, name: 'bob' }, label: 'x' },
      { name: 'alice', recoveryAuth: bytes(31, 2), turnstile: 'ok' },
      { name: 'a', recoveryAuth: key(2), turnstile: 'ok' },
      { name: 'alice', recoveryAuth: key(2), turnstile: '' },
      { name: 'alice', recoveryAuth: key(2), turnstile: 'ok', other: 1 },
    ]) {
      expect((await post('/api/auth/recover', b)).status, JSON.stringify(b).slice(0, 80)).toBe(400);
    }
  });

  it('the first call needs a passed Turnstile check', async () => {
    await signUp('alice');
    expect(await errorOf(await post('/api/auth/recover', { name: 'alice', recoveryAuth: key(2), turnstile: 'bad' }))).toBe('turnstile');
    const down = await post('/api/auth/recover', { name: 'alice', recoveryAuth: key(2), turnstile: 'down' });
    expect(down.status).toBe(503);
    expect(await db.prepare("SELECT 1 FROM attempt WHERE key LIKE 'recover|%'").first()).toBeNull();
  });

  it('a wrong code and an unknown name are one answer, counted per name on a counter of their own, with the same lock', async () => {
    await signUp('alice');
    const real: unknown[] = [];
    const fake: unknown[] = [];
    for (let i = 0; i < 12; i++) {
      // Both calls count: odd tries are the second call.
      const body = (name: string): unknown => (i % 2 ? { name, recoveryAuth: key(66), set, label: 'x' } : { name, recoveryAuth: key(66), turnstile: 'ok' });
      real.push(await seen(await post('/api/auth/recover', body('alice'), { now: NOW + i * 1000 })));
      fake.push(await seen(await post('/api/auth/recover', body('nobody'), { now: NOW + i * 1000 })));
    }
    expect(fake).toEqual(real);
    const statuses = real.map((r) => (r as { status: number }).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 429, 429]);
    expect(JSON.parse((real[0] as { body: string }).body)).toEqual({ error: 'invalid_recovery' });
    expect(JSON.parse((real[10] as { body: string }).body)).toEqual({ error: 'locked', retryAfter: 899 });
    // The right code waits too, in both calls; the login is not locked by it.
    expect((await post('/api/auth/recover', { name: 'alice', recoveryAuth: key(2), turnstile: 'ok' }, { now: NOW + MIN })).status).toBe(429);
    expect((await post('/api/auth/recover', { name: 'alice', recoveryAuth: key(2), set, label: 'x' }, { now: NOW + MIN })).status).toBe(429);
    expect((await login('alice', 1, { now: NOW + MIN })).status).toBe(200);
    expect((await login('alice', 32, { now: NOW + MIN })).status).toBe(401);
    // After the wait the code works.
    expect((await post('/api/auth/recover', { name: 'alice', recoveryAuth: key(2), turnstile: 'ok' }, { now: NOW + 9000 + 15 * MIN })).status).toBe(200);
  });

  it('a new recovery code: the old one stops working, the new one works', async () => {
    const cookie = await signUp('alice');
    const wrong = await post('/api/u/account/recovery', { authKey: key(9), recoveryAuth: key(42), wrapRc: bytes(61, 43) }, { cookie });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'invalid_login' });
    for (const b of [{ authKey: key(1), recoveryAuth: key(42) }, { authKey: key(1), recoveryAuth: 'x', wrapRc: bytes(61, 43) }, { authKey: key(1), recoveryAuth: key(42), wrapRc: bytes(10, 1) }]) {
      expect((await post('/api/u/account/recovery', b, { cookie })).status).toBe(400);
    }
    const res = await post('/api/u/account/recovery', { authKey: key(1), recoveryAuth: key(42), wrapRc: bytes(61, 43) }, { cookie });
    expect(res.status).toBe(204);
    expect(await errorOf(await post('/api/auth/recover', { name: 'alice', recoveryAuth: key(2), turnstile: 'ok' }))).toBe('invalid_recovery');
    const ok = await post('/api/auth/recover', { name: 'alice', recoveryAuth: key(42), turnstile: 'ok' });
    expect(await ok.json()).toEqual({ wrapRc: bytes(61, 43) });
    // The session and the password are as they were.
    expect((await get('/api/u/account', { cookie })).status).toBe(200);
    expect((await login('alice', 1)).status).toBe(200);
  });
});

describe('DELETE /api/u/account', () => {
  it('needs the password; removes the account and its sessions; the name stays reserved', async () => {
    const cookie = await signUp('Alice');
    const other = cookieOf(await login('alice', 1)) as string;
    const bob = await signUp('bob', { ip: '198.51.100.5' });

    const wrong = await call('DELETE', '/api/u/account', { authKey: key(9) }, { cookie });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'invalid_login' });
    for (const b of [{}, { authKey: 'x' }, { authKey: key(1), sure: true }]) expect((await call('DELETE', '/api/u/account', b, { cookie })).status).toBe(400);
    expect(await count('account')).toBe(2);

    const res = await call('DELETE', '/api/u/account', { authKey: key(1) }, { cookie });
    expect(res.status).toBe(204);
    expect(cookieOf(res)).toBe('');
    expect(await db.prepare('SELECT name_key FROM account').all()).toMatchObject({ results: [{ name_key: 'bob' }] });
    expect(await db.prepare('SELECT name_key FROM reserved_name').all()).toMatchObject({ results: [{ name_key: 'alice' }] });
    expect(await count('session')).toBe(1);
    for (const c of [cookie, other]) expect((await get('/api/u/account', { cookie: c })).status).toBe(401);
    expect((await get('/api/u/account', { cookie: bob })).status).toBe(200);

    // Cannot log in, cannot recover, cannot register the name again in any case.
    expect(await errorOf(await login('alice', 1))).toBe('invalid_login');
    expect(await errorOf(await post('/api/auth/recover', { name: 'alice', recoveryAuth: key(2), turnstile: 'ok' }))).toBe('invalid_recovery');
    for (const name of ['Alice', 'alice', 'ALICE']) {
      const again = await post('/api/auth/register', registration(name), { ip: '198.51.100.6' });
      expect(again.status).toBe(409);
      expect(await again.json()).toEqual({ error: 'name_taken' });
    }
    expect(await count('account')).toBe(1);
    // params now answers the fake, not the old salt.
    const p = (await (await get('/api/auth/params?name=alice')).json()) as { salt: string };
    expect(p.salt).not.toBe(bytes(16, 9));
  });
});

describe('the general limiter', () => {
  function limiter(blocked: (key: string) => boolean = () => false): RateLimiter & { keys: string[] } {
    const keys: string[] = [];
    return {
      keys,
      limit: async ({ key }) => {
        keys.push(key);
        return { success: !blocked(key) };
      },
    };
  }

  it('is keyed by the address without a session, by the hash of the token with one', async () => {
    const cookie = await signUp('alice');
    const token = cookie.split('=')[1] as string;
    const l = limiter();
    const env = envWith({ API_LIMITER: l });
    await get('/api/auth/params?name=alice', { env });
    // The cookie is not sent to /api/auth by a browser; if it is, it is not looked at.
    await login('alice', 1, { env, cookie });
    await get('/api/u/account', { env });
    await get('/api/u/account', { env, cookie });
    await get('/api/u/account', { env, cookie: `${SESSION_COOKIE}=${bytes(32, 6)}` });
    await get('/api/auth/params?name=alice', { env, ip: null });
    expect(l.keys).toHaveLength(7);
    expect(l.keys.slice(0, 3)).toEqual([`a|${IP}`, `a|${IP}`, `a|${IP}`]);
    expect(l.keys[3]).toMatch(/^s\|[A-Za-z0-9_-]{43}$/);
    expect(l.keys[3]).not.toContain(token);
    // A made-up session has a key of its own, so the address is counted as well.
    expect(l.keys[4]).toMatch(/^s\|/);
    expect(l.keys[4]).not.toBe(l.keys[3]);
    expect(l.keys[5]).toBe(`a|${IP}`);
    expect(l.keys[6]).toBe('a|unknown');
  });

  it('over the limit: 429 rate_limited, before anything else', async () => {
    const cookie = await signUp('alice');
    const env = envWith({ API_LIMITER: limiter() });
    const full = envWith({ API_LIMITER: limiter(() => true) });
    expect((await get('/api/u/account', { env, cookie })).status).toBe(200);
    for (const res of [
      await get('/api/auth/params?name=alice', { env: full }),
      await login('alice', 7, { env: full }),
      await get('/api/u/account', { env: full, cookie }),
      await post('/api/auth/register', registration('bob'), { env: full, csrf: false }),
      await get('/api/auth/nope', { env: full }),
    ]) {
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: 'rate_limited' });
    }
    expect(await db.prepare("SELECT 1 FROM attempt WHERE key LIKE 'login|%'").first()).toBeNull();
    // A made-up session from an address over its limit.
    const byAddress = envWith({ API_LIMITER: limiter((k) => k.startsWith('a|')) });
    expect((await get('/api/u/account', { env: byAddress, cookie: `${SESSION_COOKIE}=${bytes(32, 6)}` })).status).toBe(429);
    expect((await get('/api/u/account', { env: byAddress, cookie })).status).toBe(200);
    // The rest of the API is not behind it.
    expect((await get('/api/config', { env: full })).status).toBe(200);
  });
});

describe('the daily cron', () => {
  it('prunes stale attempt counters and expired sessions, and leaves the rest', async () => {
    const cookie = await signUp('alice');
    const time = T('2026-11-16T00:10:00Z');
    const attempt = (k: string, start: number, until = 0) => db.prepare('INSERT INTO attempt (key, start, count, until) VALUES (?1, ?2, 1, ?3)').bind(k, start, until);
    const session = (h: string, expires: number) =>
      db.prepare("INSERT INTO session (id_hash, id, account, label, created, last_used, expires) VALUES (?1, ?1, 'x', '', 0, 0, ?2)").bind(h, expires);
    await db.batch([
      db.prepare('DELETE FROM attempt'),
      attempt('old', time - DAY - 1),
      attempt('old-but-locked', time - DAY - 1, time + 1),
      attempt('yesterday-evening', time - HOUR),
      attempt('fresh', time - 1),
      session('expired', time - 1),
      session('ending-now', time),
      session('alive', time + 1),
    ]);
    await runCron(realEnv, DAILY_CRON, time);
    const keys = (await db.prepare('SELECT key FROM attempt ORDER BY key').all<{ key: string }>()).results.map((r) => r.key);
    expect(keys).toEqual(['fresh', 'old-but-locked', 'yesterday-evening']);
    const left = (await db.prepare('SELECT id FROM session ORDER BY id').all<{ id: string }>()).results.map((r) => r.id);
    expect(left).toHaveLength(2);
    expect(left).toContain('alive');
    expect((await get('/api/u/account', { cookie, now: time })).status).toBe(200);
    expect(await count('account')).toBe(1);
  });
});
