// Link previews (worker/og.ts, the preview PUT in worker/pub.ts; ADR 0158):
// the watch page's meta tags (escaping, truncation, the generic page of a
// log that is not shown), the image's upload checks and who is served it.
import { beforeEach, describe, expect, it } from 'vitest';
import { PREVIEW_HEIGHT, PREVIEW_MAX_BYTES, PREVIEW_WIDTH } from '../../shared/cloud/preview.ts';
import { escapeHtml, injectOg } from '../og.ts';
import { bucket, db, emptyTables, envWith } from './helpers.ts';
import { ENV, META, ORIGIN, call, envOf, publish, signUp } from './share-helpers.ts';

/** A PNG head of `w` x `h` (8-bit RGBA) and `n` bytes in all; the rest is filler (never decoded). */
function png(w = PREVIEW_WIDTH, h = PREVIEW_HEIGHT, n = 200): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(Math.max(n, 40));
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  b[24] = 8;
  b[25] = 6;
  return b.slice(0, n);
}

const put = (cookie: string, id: string, body: Uint8Array, type = 'image/png', o: { csrf?: boolean } = {}): Promise<Response> =>
  call('PUT', `/api/u/pub/${id}/preview`, undefined, { cookie, body, headers: { 'content-type': type, 'content-length': String(body.length) }, ...o });

/** The content of `<meta property|name="n">`, unescaped, or null. */
function metaOf(html: string, n: string): string | null {
  const m = new RegExp(`<meta (?:property|name)="${n.replace(/[:.]/g, '\\$&')}" content="([^"]*)">`).exec(html);
  return m ? m[1]!.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : null;
}

const page = async (id: string, env = ENV): Promise<string> => {
  const res = await call('GET', `/r/${id}`, undefined, { env });
  expect(res.status).toBe(200);
  return res.text();
};

beforeEach(async () => {
  await emptyTables();
});

describe('the helpers', () => {
  it('escapeHtml escapes the five characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
  it('injectOg puts the tags before </head> and replaces the title; no head, no change', () => {
    expect(injectOg('<html><head><title>A</title></head><body></body></html>', '<meta x>', 'B<')).toBe('<html><head><title>B&lt;</title>  <meta x>\n  </head><body></body></html>');
    expect(injectOg('<p>no head</p>', '<meta x>', 'B')).toBe('<p>no head</p>');
  });
});

describe('GET /r/<id>: the meta tags', () => {
  it('an active log: site name, "title (character)", description, the generic image until it has one, summary card', async () => {
    const cookie = await signUp('alice');
    const id = await publish(cookie);
    const html = await page(id);
    expect(html).toContain('<p>index</p>');
    expect(metaOf(html, 'og:site_name')).toBe('MUME Cockpit');
    expect(metaOf(html, 'og:title')).toBe('Orc fight at the ford (Olev)');
    expect(metaOf(html, 'og:description')).toBe('Two orcs. One troll.');
    expect(metaOf(html, 'og:url')).toBe(`${ORIGIN}/r/${id}`);
    expect(metaOf(html, 'og:image')).toBe(`${ORIGIN}/share-preview.png`);
    expect(metaOf(html, 'og:image:width')).toBe(String(PREVIEW_WIDTH));
    expect(metaOf(html, 'og:image:height')).toBe(String(PREVIEW_HEIGHT));
    expect(metaOf(html, 'twitter:card')).toBe('summary');
    expect(html).toContain('<title>Orc fight at the ford (Olev)</title>');

    expect((await put(cookie, id, png())).status).toBe(204);
    const image = metaOf(await page(id), 'og:image') as string;
    expect(image).toMatch(new RegExp(`^${ORIGIN}/r/${id}/preview\\.png\\?v=[0-9a-z]+$`));
  });

  it('escapes the texts and keeps the character when the title is long', async () => {
    const cookie = await signUp('bob');
    const title = `"><script>alert(1)</script> ${'a very long title '.repeat(3).trim()}`;
    const id = await publish(cookie, undefined, { ...META, title, description: '', character: "O'Brien&Co" });
    const html = await page(id);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&quot;&gt;&lt;script&gt;');
    const t = metaOf(html, 'og:title') as string;
    expect([...t].length).toBeLessThanOrEqual(70);
    expect(t.endsWith("… (O'Brien&Co)")).toBe(true);
    // No description: no description tags.
    expect(metaOf(html, 'og:description')).toBeNull();
    expect(metaOf(html, 'twitter:description')).toBeNull();
  });

  it('a hidden, removed or unknown log: the generic tags and image, none of its words', async () => {
    const cookie = await signUp('carol');
    const hidden = await publish(cookie);
    await db.prepare(`UPDATE publication SET state = 'hidden' WHERE id = ?1`).bind(hidden).run();
    const removed = await publish(cookie);
    expect((await call('DELETE', `/api/u/pub/${removed}`, undefined, { cookie })).status).toBe(204);
    for (const id of [hidden, removed, 'Zz0000000000']) {
      const html = await page(id);
      expect(metaOf(html, 'og:title'), id).toBe('A shared MUME log');
      expect(metaOf(html, 'og:image'), id).toBe(`${ORIGIN}/share-preview.png`);
      expect(html, id).not.toContain('Orc fight');
    }
  });

  it('with the flag share off: the page as it is, no tags', async () => {
    const cookie = await signUp('dave');
    const id = await publish(cookie);
    const html = await page(id, envWith({ API_LIMITER: undefined }));
    expect(html).toContain('<p>index</p>');
    expect(html).not.toContain('og:title');
  });
});

describe('PUT /api/u/pub/<id>/preview', () => {
  it('stores a PNG of the right size; a second one replaces it; served at /r/<id>/preview.png', async () => {
    const cookie = await signUp('erin');
    const id = await publish(cookie);
    expect((await put(cookie, id, png(undefined, undefined, 300))).status).toBe(204);
    expect((await put(cookie, id, png(undefined, undefined, 400))).status).toBe(204);
    expect((await bucket.head(`pubprev/${id}`))?.size).toBe(400);
    const res = await call('GET', `/r/${id}/preview.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toMatch(/^public, max-age=\d+$/);
    expect(new Uint8Array(await res.arrayBuffer()).length).toBe(400);
  });

  it('refuses another type, a wrong size or head, too many bytes, no CSRF header, another account’s run', async () => {
    const cookie = await signUp('frank');
    const other = await signUp('grace');
    const id = await publish(cookie);
    expect((await put(cookie, id, png(), 'image/jpeg')).status).toBe(400);
    expect((await put(cookie, id, png(1200, 630))).status).toBe(400);
    const notPng = png();
    notPng[1] = 0x51;
    expect((await put(cookie, id, notPng)).status).toBe(400);
    const gif = png();
    gif[25] = 3; // a palette image
    expect((await put(cookie, id, gif)).status).toBe(400);
    expect((await put(cookie, id, png(undefined, undefined, 20))).status).toBe(400);
    expect((await put(cookie, id, png(undefined, undefined, PREVIEW_MAX_BYTES + 1))).status).toBe(413);
    expect((await put(cookie, id, png(), 'image/png', { csrf: false })).status).toBe(403);
    expect((await put(other, id, png())).status).toBe(404);
    expect((await put(cookie, 'not-an-id', png())).status).toBe(404);
    expect(await bucket.head(`pubprev/${id}`)).toBeNull();
  });

  it('a hidden run’s image is neither replaced nor served; removing the run deletes it', async () => {
    const cookie = await signUp('heidi');
    const id = await publish(cookie);
    expect((await put(cookie, id, png())).status).toBe(204);
    await db.prepare(`UPDATE publication SET state = 'hidden' WHERE id = ?1`).bind(id).run();
    expect((await put(cookie, id, png())).status).toBe(403);
    expect((await call('GET', `/r/${id}/preview.png`)).status).toBe(404);
    await db.prepare(`UPDATE publication SET state = 'active' WHERE id = ?1`).bind(id).run();
    expect((await call('GET', `/r/${id}/preview.png`)).status).toBe(200);
    expect((await call('DELETE', `/api/u/pub/${id}`, undefined, { cookie })).status).toBe(204);
    expect((await call('GET', `/r/${id}/preview.png`)).status).toBe(404);
    expect(await bucket.head(`pubprev/${id}`)).toBeNull();
  });
});

describe('GET /r/<id>/preview.png', () => {
  it('an active run without an image gets the generic one; unknown ids and the flag off are 404', async () => {
    const cookie = await signUp('ivan');
    const id = await publish(cookie);
    const res = await call('GET', `/r/${id}/preview.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect((await call('GET', '/r/Zz0000000000/preview.png')).status).toBe(404);
    expect((await call('GET', '/r/bad/preview.png')).status).toBe(404);
    expect((await call('GET', `/r/${id}/preview.png`, undefined, { env: envOf({ FLAG_SHARE: false }) })).status).toBe(404);
  });
});
