// The Worker's API in the Workers runtime (workerd, through
// @cloudflare/vitest-plugin; the `worker` project of vitest.config.ts).
// `exports.default` is the Worker of wrangler.jsonc with its bindings; the
// assets directory of the test run is worker/test/assets.
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { type Env, handle, release } from '../router.ts';

const get = (path: string, init?: RequestInit): Promise<Response> => exports.default.fetch(`https://example.test${path}`, init);

describe('the Worker API (spec §7.1, ADR 0144)', () => {
  it('GET /api/health answers with the version and commit of release.json', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await res.json()).toEqual({ ok: true, version: '9.9.9', commit: 'abc1234' });
  });

  it('GET /api/config answers with the flags, cached a minute', async () => {
    const res = await get('/api/config');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('max-age=60');
    // The test Worker's default (FLAG_STATS = true, as on staging); stats.test.ts has the rest.
    expect(await res.json()).toEqual({ flags: { stats: true } });
  });

  it('HEAD is GET without a body', async () => {
    const res = await get('/api/config', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(await res.text()).toBe('');
  });

  it('an unknown API path is a JSON 404, also for names from Object.prototype', async () => {
    for (const path of ['/api/nope', '/api/', '/api', '/api/health/', '/api/constructor', '/api/__proto__']) {
      const res = await get(path);
      expect(res.status, path).toBe(404);
      expect(res.headers.get('content-type'), path).toMatch(/^application\/json/);
      expect(res.headers.get('cache-control'), path).toBe('no-store');
      expect(await res.json(), path).toEqual({ error: 'not_found' });
    }
  });

  it('a wrong method is a JSON 405 that names the allowed one', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const res = await get('/api/health', { method });
      expect(res.status, method).toBe(405);
      expect(res.headers.get('allow'), method).toBe('GET');
      expect(res.headers.get('cache-control'), method).toBe('no-store');
      expect(await res.json(), method).toEqual({ error: 'method_not_allowed' });
    }
  });

  it('other paths go to the static assets', async () => {
    const file = await get('/release.json');
    expect(file.status).toBe(200);
    expect(await file.json()).toMatchObject({ version: '9.9.9' });
    expect((await get('/nope')).status).toBe(404);
  });
});

describe('release() without a usable release.json', () => {
  const stub = (answer: () => Response | Promise<Response>): Env => ({ ASSETS: { fetch: async () => answer() } });

  it('says dev for a missing file, a bad one and a failing binding', async () => {
    const dev = { version: 'dev', commit: 'dev' };
    expect(await release(stub(() => new Response('not found', { status: 404 })), 'https://x.test')).toEqual(dev);
    expect(await release(stub(() => new Response('<html>')), 'https://x.test')).toEqual(dev);
    expect(await release(stub(() => new Response('{"version":1}')), 'https://x.test')).toEqual(dev);
    expect(await release(stub(() => Promise.reject(new Error('down'))), 'https://x.test')).toEqual(dev);
    const res = await handle(new Request('https://x.test/api/health'), stub(() => new Response(null, { status: 404 })));
    expect(await res.json()).toEqual({ ok: true, ...dev });
  });

  it('the real binding has the release of the test assets', async () => {
    expect(await release(env as unknown as Env, 'https://x.test')).toEqual({ version: '9.9.9', commit: 'abc1234' });
  });
});
