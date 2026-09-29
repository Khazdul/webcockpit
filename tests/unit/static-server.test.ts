import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normaliseBase, serve } from '../../scripts/static-server.ts';

describe('static-server (ADR 0028, ADR 0029)', () => {
  let dir: string;
  const servers: Array<ReturnType<typeof serve>> = [];
  const start = async (opts: Parameters<typeof serve>[2]): Promise<string> => {
    const s = serve(dir, 0, opts);
    servers.push(s);
    await new Promise((r) => s.once('listening', r));
    return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'wc-static-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html>');
    writeFileSync(join(dir, 'assets', 'a-123.js'), 'export {}');
  });
  afterAll(() => {
    for (const s of servers) s.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('normalises base paths', () => {
    expect(normaliseBase('')).toBe('/');
    expect(normaliseBase('/')).toBe('/');
    expect(normaliseBase('webcockpit')).toBe('/webcockpit/');
    expect(normaliseBase('/webcockpit')).toBe('/webcockpit/');
    expect(normaliseBase('//a/b//')).toBe('/a/b/');
  });

  it('at the root: Pages headers (no COOP/COEP, max-age=600), MIME by extension', async () => {
    const url = await start({});
    const index = await fetch(`${url}/?replay`);
    expect(index.status).toBe(200);
    expect(index.headers.get('cross-origin-embedder-policy')).toBeNull();
    expect(index.headers.get('cross-origin-opener-policy')).toBeNull();
    expect(index.headers.get('cache-control')).toBe('max-age=600');
    const asset = await fetch(`${url}/assets/a-123.js`);
    expect(asset.headers.get('content-type')).toMatch(/^text\/javascript/);
    expect(asset.headers.get('cache-control')).toBe('max-age=600');
    expect((await fetch(`${url}/missing.js`)).status).toBe(404);
  });

  it('under a base: only paths under it, a redirect for the bare base', async () => {
    const url = await start({ base: '/webcockpit/' });
    const index = await fetch(`${url}/webcockpit/?replay`);
    expect(index.status).toBe(200);
    expect(index.headers.get('cache-control')).toBe('max-age=600');
    const asset = await fetch(`${url}/webcockpit/assets/a-123.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('cache-control')).toBe('max-age=600');
    expect((await fetch(`${url}/`)).status).toBe(404);
    expect((await fetch(`${url}/assets/a-123.js`)).status).toBe(404);
    const bare = await fetch(`${url}/webcockpit?replay`, { redirect: 'manual' });
    expect(bare.status).toBe(301);
    expect(bare.headers.get('location')).toBe('/webcockpit/?replay');
  });
});
