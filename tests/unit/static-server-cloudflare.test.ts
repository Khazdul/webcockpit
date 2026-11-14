// The `cloudflare` profile of scripts/static-server.ts (ADR 0144): what
// `wrangler dev` 4.162 answers for the Worker of wrangler.jsonc, with the
// repository's real `public/_headers`.
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyHeaderRules, cloudflareMimeType, parseHeadersFile, serve } from '../../scripts/static-server.ts';

const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy': "frame-ancestors 'none'",
};
const DEFAULT_CACHE = 'public, max-age=0, must-revalidate';

describe('_headers parsing', () => {
  it('reads rules, comments, detaching, splats and placeholders', () => {
    const rules = parseHeadersFile(
      ['# comment', '/*', '  X-A: 1', '', '/assets/*', '  ! Cache-Control', '  Cache-Control: immutable', '  X-Splat: :splat', '/u/:name/x', '  X-Name: :name'].join('\n'),
    );
    expect(rules.map((r) => r.pattern)).toEqual(['/*', '/assets/*', '/u/:name/x']);
    expect(applyHeaderRules(rules, '/assets/a/b.js', { 'cache-control': 'default' })).toEqual({
      'x-a': '1',
      'cache-control': 'immutable',
      'x-splat': 'a/b.js',
    });
    expect(applyHeaderRules(rules, '/u/bob/x', {})).toEqual({ 'x-a': '1', 'x-name': 'bob' });
    expect(applyHeaderRules(rules, '/u/bob/y/x', {})).toEqual({ 'x-a': '1' });
  });

  it('joins a header set by two rules with a comma, but not onto the default', () => {
    const rules = parseHeadersFile('/*\n  X-A: 1\n  Cache-Control: a\n/x\n  X-A: 2\n  Cache-Control: b\n');
    expect(applyHeaderRules(rules, '/x', { 'cache-control': 'default' })).toEqual({ 'x-a': '1, 2', 'cache-control': 'a, b' });
  });

  it('knows the types Cloudflare gives', () => {
    expect(cloudflareMimeType('a.js')).toMatch(/^text\/javascript/);
    expect(cloudflareMimeType('a.md')).toMatch(/^text\/markdown/);
    expect(cloudflareMimeType('arda.mm2')).toBeNull();
  });
});

describe('static-server, cloudflare profile (ADR 0144)', () => {
  let dir: string;
  let url: string;
  let server: ReturnType<typeof serve>;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wc-static-cf-'));
    mkdirSync(join(dir, 'assets'));
    mkdirSync(join(dir, 'map'));
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html>');
    writeFileSync(join(dir, '404.html'), 'nothing here');
    writeFileSync(join(dir, 'page.html'), 'page');
    writeFileSync(join(dir, 'sub', 'index.html'), 'sub');
    writeFileSync(join(dir, 'assets', 'a-123.js'), 'export {}');
    writeFileSync(join(dir, 'map', 'arda.mm2'), 'map');
    writeFileSync(join(dir, 'release.json'), '{"version":"1.2.3","commit":"abc1234"}');
    copyFileSync(resolve(import.meta.dirname, '../../public/_headers'), join(dir, '_headers'));
    server = serve(dir, 0, { profile: 'cloudflare' });
    await new Promise((r) => server.once('listening', r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const headers = (res: Response): Record<string, string> => Object.fromEntries(res.headers);

  it('the page and the manifest are no-cache, hashed assets immutable, the rest revalidated', async () => {
    for (const path of ['/', '/?replay', '/release.json']) {
      const res = await fetch(`${url}${path}`);
      expect(res.status, path).toBe(200);
      expect(headers(res), path).toMatchObject({ ...SECURITY, 'cache-control': 'no-cache' });
      expect(res.headers.get('etag'), path).toMatch(/^"[0-9a-f]+"$/);
    }
    const asset = await fetch(`${url}/assets/a-123.js`);
    expect(headers(asset)).toMatchObject({ ...SECURITY, 'cache-control': 'public, max-age=31536000, immutable' });
    expect(asset.headers.get('content-type')).toMatch(/^text\/javascript/);
    const map = await fetch(`${url}/map/arda.mm2`);
    expect(headers(map)).toMatchObject({ ...SECURITY, 'cache-control': DEFAULT_CACHE });
    expect(map.headers.get('content-type')).toBeNull();
    expect(await map.text()).toBe('map');
    expect(asset.headers.get('cross-origin-embedder-policy')).toBeNull();
    expect(asset.headers.get('cross-origin-opener-policy')).toBeNull();
  });

  it('answers If-None-Match with 304 and ignores Range', async () => {
    const first = await fetch(`${url}/release.json`);
    const etag = first.headers.get('etag')!;
    const again = await fetch(`${url}/release.json`, { headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(304);
    expect(again.headers.get('cache-control')).toBe('no-cache');
    expect((await fetch(`${url}/release.json`, { headers: { 'If-None-Match': '"other"' } })).status).toBe(200);
    const range = await fetch(`${url}/release.json`, { headers: { Range: 'bytes=0-3' } });
    expect(range.status).toBe(200);
    expect(await range.text()).toContain('1.2.3');
  });

  it('html_handling auto-trailing-slash: .html paths redirect to the clean ones', async () => {
    const manual = { redirect: 'manual' } as const;
    const index = await fetch(`${url}/index.html?replay`, manual);
    expect(index.status).toBe(307);
    expect(index.headers.get('location')).toBe('/?replay');
    expect(headers(index)).toMatchObject(SECURITY);
    const page = await fetch(`${url}/page.html`, manual);
    expect([page.status, page.headers.get('location')]).toEqual([307, '/page']);
    expect(await (await fetch(`${url}/page`)).text()).toBe('page');
    const sub = await fetch(`${url}/sub/index.html`, manual);
    expect([sub.status, sub.headers.get('location')]).toEqual([307, '/sub/']);
    expect(await (await fetch(`${url}/sub/`)).text()).toBe('sub');
  });

  it('not_found_handling 404-page: unknown paths, directories and _headers are a 404 with 404.html', async () => {
    for (const path of ['/missing.js', '/nope', '/sub/deeper/x', '/map', '/map/', '/_headers', '/__fixtures/list', '/api']) {
      const res = await fetch(`${url}${path}`);
      expect(res.status, path).toBe(404);
      expect(await res.text(), path).toBe('nothing here');
      expect(headers(res), path).toMatchObject({ ...SECURITY, 'cache-control': DEFAULT_CACHE });
      expect(res.headers.get('content-type'), path).toMatch(/^text\/html/);
    }
    expect((await fetch(`${url}/%2e%2e/%2e%2e/etc/passwd`)).status).toBe(404);
  });

  it('other methods on a file are 405; HEAD has no body', async () => {
    expect((await fetch(`${url}/release.json`, { method: 'POST', body: 'x' })).status).toBe(405);
    const head = await fetch(`${url}/release.json`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('/api/* is the Worker router: health from release.json, JSON errors, no _headers rules', async () => {
    const health = await fetch(`${url}/api/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, version: '1.2.3', commit: 'abc1234' });
    expect(health.headers.get('cache-control')).toBe('no-store');
    expect(health.headers.get('referrer-policy')).toBeNull();
    expect(await (await fetch(`${url}/api/config`)).json()).toMatchObject({ flags: { stats: false, accounts: false }, turnstileSiteKey: '' });
    // No database here: the beat answers 503, the public numbers 404 (the flag is off).
    const beat = await fetch(`${url}/api/beat`, { method: 'POST', body: '{}' });
    expect(beat.status).toBe(503);
    expect(await beat.json()).toEqual({ error: 'unavailable' });
    expect((await fetch(`${url}/api/stats/public`)).status).toBe(404);
    // run_worker_first covers /admin too; without Access settings it is not configured.
    for (const path of ['/admin', '/admin/admin.js', '/api/admin/stats']) {
      const admin = await fetch(`${url}${path}`);
      expect(admin.status, path).toBe(503);
      expect(await admin.json(), path).toEqual({ error: 'admin_not_configured' });
    }
    const unknown = await fetch(`${url}/api/x`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'not_found' });
    const post = await fetch(`${url}/api/health`, { method: 'POST', body: '{}' });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET');
    expect(await post.json()).toEqual({ error: 'method_not_allowed' });
  });

  it('without a release.json the health says dev', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'wc-static-cf-empty-'));
    const s = serve(empty, 0, { profile: 'cloudflare' });
    await new Promise((r) => s.once('listening', r));
    try {
      const origin = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
      expect(await (await fetch(`${origin}/api/health`)).json()).toEqual({ ok: true, version: 'dev', commit: 'dev' });
      const none = await fetch(`${origin}/nope`);
      expect(none.status).toBe(404);
      expect(await none.text()).toBe('');
    } finally {
      s.close();
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
