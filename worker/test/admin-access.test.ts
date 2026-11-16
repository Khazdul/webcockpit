// Stage 66 (ADR 0157 "Access"): a walk over every admin route and method
// of the router's table, and over unknown admin paths, with every kind of
// wrong credential; and every admin write without `X-WC: 1` or from
// another Origin. Each must be 403, and nothing may be written.
import { beforeEach, describe, expect, it } from 'vitest';
import { adminRoute } from '../router.ts';
import { count, db, emptyTables } from './helpers.ts';
import { ORIGIN, admin, forgetAccessKeys, goodClaims, sign } from './access-helpers.ts';
import { payload, publish, signUp } from './share-helpers.ts';
import { commented, list, noted } from './community-helpers.ts';

const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

/**
 * One path of every route of the router's admin table (router.ts
 * `ADMIN_ROUTES`, moderation.ts and panel.ts). The test below fails when a
 * sample names no route, so a route renamed or removed shows here; a new
 * prefix route must be added to this list (the unknown paths below are
 * still walked and refused without it).
 */
const ROUTE_SAMPLES = (ids: { pub: string; comment: string; note: string }): string[] => [
  '/admin',
  '/admin/',
  '/admin/admin.css',
  '/admin/admin.js',
  '/api/admin/stats',
  '/api/admin/flags/stats',
  '/api/admin/reports',
  `/api/admin/pub/${ids.pub}`,
  `/api/admin/pub/${ids.pub}/payload`,
  '/api/admin/account/alice',
  '/api/admin/account/alice/limits',
  `/api/admin/comment/${ids.comment}`,
  `/api/admin/note/${ids.note}`,
  '/api/admin/accounts',
  '/api/admin/limits',
  '/api/admin/graphs',
  '/api/admin/log',
];

const UNKNOWN = ['/api/admin', '/api/admin/', '/api/admin/nope', '/api/admin/account/alice/nope', '/api/admin/accounts/x', '/admin/x', '/admin/../api/admin/log', '/api/admin/log/', '/api/admin/flags/'];

beforeEach(async () => {
  await emptyTables();
  forgetAccessKeys();
});

/** An account with a listed run, a comment and a note, so every action has something to act on. */
async function world(): Promise<{ pub: string; comment: string; note: string }> {
  const alice = await signUp('alice');
  const pub = await list(alice);
  await publish(alice, payload(50));
  const bob = await signUp('bob');
  const comment = await commented(bob, pub);
  const note = await noted(bob);
  return { pub, comment, note };
}

async function snapshot(): Promise<Record<string, unknown>> {
  return {
    log: await count('admin_log'),
    flags: await count('flag'),
    defaults: await count('limit_default'),
    accounts: (await db.prepare('SELECT name_key, state, limits FROM account ORDER BY name_key').all()).results,
    pubs: (await db.prepare('SELECT id, state FROM publication ORDER BY id').all()).results,
    comments: (await db.prepare('SELECT id, state FROM comment ORDER BY id').all()).results,
    notes: (await db.prepare('SELECT id, state FROM note ORDER BY id').all()).results,
    sessions: await count('session'),
  };
}

describe('the Access walk (stage 66)', () => {
  it('every admin route and method, and unknown admin paths: 403 without the token, for another e-mail, a service token, a wrong audience', async () => {
    const ids = await world();
    const samples = ROUTE_SAMPLES(ids);
    for (const path of samples) expect(adminRoute(path), `a route for ${path}`).toBeDefined();
    const before = await snapshot();
    const bad: [string, string | null][] = [
      ['no token', null],
      ['another e-mail', await sign({ ...goodClaims(), email: 'stranger@example.org' })],
      // A service token's JWT has a common_name and no e-mail.
      ['a service token', await sign({ ...goodClaims(), email: undefined, type: 'app', common_name: 'abc.access' })],
      ['a wrong audience', await sign({ ...goodClaims(), aud: ['b'.repeat(64)] })],
    ];
    let walked = 0;
    for (const path of [...samples, ...UNKNOWN]) {
      for (const method of METHODS) {
        for (const [what, token] of bad) {
          const body = method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? undefined : { action: 'delete', confirm: 'alice', value: false, limits: null, defaults: null };
          const res = await admin(path, { token, method, ...(body ? { body } : {}) });
          expect(res.status, `${method} ${path}: ${what}`).toBe(403);
          walked++;
        }
      }
    }
    expect(walked).toBe((samples.length + UNKNOWN.length) * METHODS.length * bad.length);
    expect(await snapshot()).toEqual(before);
    // The good token reaches the routes (so the 403s above were the check's).
    expect((await admin('/api/admin/accounts')).status).toBe(200);
    expect((await admin('/api/admin/nope')).status).toBe(404);
  });

  it('every admin write without X-WC, or from another Origin, is 403 and writes nothing', async () => {
    const ids = await world();
    const writes: [string, string, unknown][] = [];
    for (const path of ROUTE_SAMPLES(ids)) {
      const route = adminRoute(path) ?? {};
      for (const method of Object.keys(route)) {
        if (method === 'GET' || method === 'HEAD') continue;
        writes.push([method, path, bodyFor(path)]);
      }
    }
    // Every write the router knows: the flag, a run, an account (POST and its limits), a comment, a note, the defaults.
    expect(writes.map(([m, p]) => `${m} ${p.replace(/[A-Za-z0-9]{12}$/, '<id>')}`).sort()).toEqual(
      [
        'POST /api/admin/account/alice',
        'POST /api/admin/comment/<id>',
        'POST /api/admin/note/<id>',
        'POST /api/admin/pub/<id>',
        'PUT /api/admin/account/alice/limits',
        'PUT /api/admin/flags/stats',
        'PUT /api/admin/limits',
      ].sort(),
    );
    const before = await snapshot();
    const wrong: [string, Record<string, string>][] = [
      ['no X-WC', { Origin: ORIGIN, 'Content-Type': 'application/json' }],
      ['X-WC not 1', { 'X-WC': 'yes', Origin: ORIGIN, 'Content-Type': 'application/json' }],
      ['no Origin', { 'X-WC': '1', 'Content-Type': 'application/json' }],
      ['another Origin', { 'X-WC': '1', Origin: 'https://evil.example', 'Content-Type': 'application/json' }],
      ['the Origin as http', { 'X-WC': '1', Origin: ORIGIN.replace('https:', 'http:'), 'Content-Type': 'application/json' }],
      ['a null Origin', { 'X-WC': '1', Origin: 'null', 'Content-Type': 'application/json' }],
    ];
    for (const [method, path, body] of writes) {
      for (const [what, headers] of wrong) {
        const res = await admin(path, { method, body, headers });
        expect(res.status, `${method} ${path}: ${what}`).toBe(403);
      }
    }
    expect(await snapshot()).toEqual(before);
    // With both, each write goes through (so the 403s were the CSRF rule's).
    for (const [method, path, body] of writes) expect((await admin(path, { method, body })).status, `${method} ${path}`).toBeLessThan(300);
    expect(await count('admin_log')).toBe(writes.length);
  });
});

function bodyFor(path: string): unknown {
  if (path.startsWith('/api/admin/flags/')) return { value: false };
  if (path.endsWith('/limits') && path.includes('/account/')) return { limits: { items: 10 } };
  if (path === '/api/admin/limits') return { defaults: { items: 3000 } };
  if (path.startsWith('/api/admin/account/')) return { action: 'suspend' };
  return { action: 'hide' };
}
