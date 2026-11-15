// Stage 64 C1 (ADR 0154): the share links' client (src/cloud/pub/api.ts)
// against a fake transport: the two-part body, the headers, what each of
// the server's refusals comes back as, what it refuses of an answer, and
// that nothing is sent while share links are off. The share link's small
// pieces (src/share/link.ts) too.
import { describe, expect, it } from 'vitest';
import { PUB_META_MAX_BYTES, type PubMetaIn } from '../../shared/cloud/api';
import { type PubRequest, type PubTransport, createPubApi, parseMyPub, pubBody, pubFailureOf, splitPubBody } from '../../src/cloud/pub/api';
import { cleanDescription, cleanTitle, defaultLinkTitle, linkMeta, linkPath, linkTitle, linkUrl, pubText, sizeWords } from '../../src/share/link';

const META: PubMetaIn = { title: 'Clearing the ranger camp', description: '', character: 'Rasta', level: 42, lengthS: 4500, listed: false };
const PUB = {
  id: 'Ab3dE5fG7hJk',
  title: 'Clearing the ranger camp',
  description: '',
  character: 'Rasta',
  level: 42,
  lengthS: 4500,
  listed: false,
  state: 'active',
  created: 1_763_000_000,
  updated: 1_763_000_000,
  views: 0,
  bytes: 1234,
};

function api(status: number, data?: unknown, o: { enabled?: boolean; reject?: string } = {}) {
  const calls: PubRequest[] = [];
  const transport: PubTransport = async (req) => {
    calls.push(req);
    if (o.reject) throw new Error(o.reject);
    req.onProgress?.(10, 20);
    return { status, data };
  };
  return { api: createPubApi({ transport, enabled: async () => o.enabled ?? true }), calls };
}

describe('the POST body', () => {
  it('is the meta length (4 bytes big-endian), the meta JSON and the payload bytes, nothing else', () => {
    const gz = new Uint8Array([0x1f, 0x8b, 8, 0, 1, 2, 3]);
    const body = pubBody(META, gz);
    const json = new TextEncoder().encode(JSON.stringify(META));
    expect([...body.subarray(0, 4)]).toEqual([0, 0, (json.length >> 8) & 0xff, json.length & 0xff]);
    expect(body.length).toBe(4 + json.length + gz.length);
    const parts = splitPubBody(body)!;
    expect(parts.meta).toEqual(META);
    expect([...parts.payload]).toEqual([...gz]);
  });

  it('refuses meta past the limit; a body that is not one splits to null', () => {
    expect(() => pubBody({ ...META, description: 'x'.repeat(PUB_META_MAX_BYTES) }, new Uint8Array(2))).toThrow();
    expect(splitPubBody(new Uint8Array([0, 0]))).toBeNull();
    expect(splitPubBody(new Uint8Array([0, 0, 0, 9, 1]))).toBeNull();
  });
});

describe('createPubApi', () => {
  it('create: POST /api/u/pub with X-WC and octet-stream, the progress passed on, the run read back', async () => {
    const { api: a, calls } = api(200, { pub: { ...PUB, extra: 'dropped' } });
    const seen: number[] = [];
    const r = await a.create(META, new Uint8Array([0x1f, 0x8b]), { onProgress: (s) => seen.push(s) });
    expect(r).toEqual({ ok: true, value: PUB });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.path).toBe('/api/u/pub');
    expect(calls[0]!.headers).toEqual({ Accept: 'application/json', 'X-WC': '1', 'Content-Type': 'application/octet-stream' });
    expect(splitPubBody(calls[0]!.body as Uint8Array)!.meta).toEqual(META);
    expect(seen).toEqual([10]);
  });

  it('the refusals: too large and the quota with their limits, rules, suspended, a gone session', async () => {
    expect(await api(413, { error: 'payload_too_large', limit: 5242880 }).api.create(META, new Uint8Array(2))).toEqual({ ok: false, code: 'payload_too_large', limit: 5242880, status: 413 });
    expect(await api(413, { error: 'pub_quota', limit: 150 }).api.create(META, new Uint8Array(2))).toEqual({ ok: false, code: 'pub_quota', limit: 150, status: 413 });
    expect((await api(403, { error: 'rules' }).api.create(META, new Uint8Array(2))).ok).toBe(false);
    expect(await api(403, { error: 'rules' }).api.create(META, new Uint8Array(2))).toMatchObject({ code: 'rules' });
    expect(await api(403, { error: 'suspended' }).api.create(META, new Uint8Array(2))).toMatchObject({ code: 'suspended' });
    expect(await api(401, { error: 'session_ended', reason: 'ended' }).api.list()).toMatchObject({ code: 'unauthorized' });
    expect(await api(401, { error: 'unauthorized' }).api.list()).toMatchObject({ code: 'unauthorized' });
    // A bare 401 (the edge's own page) is not taken for a gone session.
    expect(await api(401).api.list()).toMatchObject({ code: 'bad_answer' });
    expect(await api(503).api.list()).toMatchObject({ code: 'unavailable' });
    expect(await api(404, { error: 'not_found' }).api.list()).toMatchObject({ code: 'not_found' });
    expect(pubFailureOf(411, { error: 'length_required' })).toMatchObject({ code: 'bad_request' });
  });

  it('no network, a timeout and a cancel; status 0 is offline', async () => {
    expect(await api(0, undefined, { reject: 'offline' }).api.list()).toEqual({ ok: false, code: 'offline' });
    expect(await api(0, undefined, { reject: 'timeout' }).api.list()).toEqual({ ok: false, code: 'timeout' });
    expect(await api(0).api.list()).toEqual({ ok: false, code: 'offline' });
    const c = new AbortController();
    c.abort();
    expect(await api(200, { pubs: [] }).api.list({ signal: c.signal })).toEqual({ ok: false, code: 'cancelled' });
  });

  it('disabled: nothing is sent', async () => {
    const { api: a, calls } = api(200, { pubs: [] }, { enabled: false });
    expect(await a.list()).toEqual({ ok: false, code: 'disabled' });
    expect(await a.create(META, new Uint8Array(2))).toEqual({ ok: false, code: 'disabled' });
    expect(calls).toHaveLength(0);
  });

  it('list, edit, remove, mine: the paths, the bodies; an id not of the pattern is never sent', async () => {
    const l = api(200, { pubs: [PUB, { ...PUB, id: 'Qm7Rt2Lp9xWz', state: 'hidden' }] });
    expect(await l.api.list()).toMatchObject({ ok: true, value: [{ id: 'Ab3dE5fG7hJk' }, { id: 'Qm7Rt2Lp9xWz', state: 'hidden' }] });
    expect(l.calls[0]!.headers['X-WC']).toBeUndefined();
    const e = api(200, { pub: { ...PUB, title: 'New' } });
    expect(await e.api.edit(PUB.id, { title: 'New', description: 'd' })).toMatchObject({ ok: true, value: { title: 'New' } });
    expect(e.calls[0]).toMatchObject({ method: 'PATCH', path: '/api/u/pub/Ab3dE5fG7hJk', body: '{"title":"New","description":"d"}' });
    const d = api(204);
    expect(await d.api.remove(PUB.id)).toEqual({ ok: true, value: null });
    expect(d.calls[0]).toMatchObject({ method: 'DELETE', path: '/api/u/pub/Ab3dE5fG7hJk' });
    const bad = api(204);
    expect(await bad.api.remove('../account')).toEqual({ ok: false, code: 'not_found' });
    expect(bad.calls).toHaveLength(0);
    const m = api(200, { id: PUB.id, title: 't', description: '', sender: 'fenwick', character: 'Rasta', lengthS: 1, created: 1, views: 2, bytes: 3, hidden: true });
    expect(await m.api.mine(PUB.id)).toMatchObject({ ok: true, value: { hidden: true, sender: 'fenwick' } });
  });

  it('an answer that is not the contract is bad_answer', async () => {
    // A row it cannot read is left out (review fix CR4), not the whole list.
    expect(await api(200, { pubs: [{ ...PUB, id: 'short' }] }).api.list()).toMatchObject({ ok: true, value: [] });
    expect(await api(200, { pubs: 'no' }).api.list()).toMatchObject({ code: 'bad_answer' });
    expect(parseMyPub({ ...PUB, state: 'removed' })).toBeUndefined();
    expect(parseMyPub({ ...PUB, views: -1 })).toBeUndefined();
  });
});

describe('the community (stage 65 C3)', () => {
  it('create with listed: the meta says listed true; the 10-a-day refusal is too_many', async () => {
    const { api: a, calls } = api(200, { pub: { ...PUB, listed: true, listedAt: 1_763_000_000 } });
    const meta = linkMeta({ title: 'T', description: '', character: 'Rasta', lengthS: 3, listed: true });
    expect(meta.listed).toBe(true);
    expect(await a.create(meta, new Uint8Array([0x1f, 0x8b]))).toMatchObject({ ok: true, value: { listed: true, listedAt: 1_763_000_000 } });
    expect((splitPubBody(calls[0]!.body as Uint8Array)!.meta as PubMetaIn).listed).toBe(true);
    expect(await api(429, { error: 'too_many' }).api.create(meta, new Uint8Array(2))).toEqual({ ok: false, code: 'too_many', status: 429 });
    // The network's own limit stays rate_limited.
    expect(await api(429, { error: 'rate_limited' }).api.create(meta, new Uint8Array(2))).toMatchObject({ code: 'rate_limited' });
  });

  it('edit sends listed (and only what is given); 429 too_many and 403 hidden come back as such', async () => {
    const e = api(200, { pub: { ...PUB, listed: true } });
    expect(await e.api.edit(PUB.id, { listed: true })).toMatchObject({ ok: true, value: { listed: true } });
    expect(e.calls[0]).toMatchObject({ method: 'PATCH', path: '/api/u/pub/Ab3dE5fG7hJk', body: '{"listed":true}' });
    const f = api(200, { pub: PUB });
    await f.api.edit(PUB.id, { title: 'T', listed: false });
    expect(f.calls[0]!.body).toBe('{"title":"T","listed":false}');
    expect(await api(429, { error: 'too_many' }).api.edit(PUB.id, { listed: true })).toMatchObject({ code: 'too_many' });
    expect(await api(403, { error: 'hidden' }).api.edit(PUB.id, { listed: true })).toMatchObject({ code: 'hidden' });
  });

  it("the run's stars, comments, listedAt and what is new are read; a field that does not hold is left out", () => {
    const full = { ...PUB, listed: true, listedAt: 5, stars: { sum: 13, count: 3 }, comments: 4, news: { votes: 1, comments: 2 } };
    expect(parseMyPub(full)).toEqual(full);
    // Capped at NEWS_MAX as the server caps them.
    expect(parseMyPub({ ...full, news: { votes: 500, comments: 0 } })!.news).toEqual({ votes: 99, comments: 0 });
    const odd = parseMyPub({ ...PUB, listedAt: -1, stars: { sum: 'x', count: 1 }, comments: 1.5, news: { votes: 1 } })!;
    expect(odd).toEqual(PUB);
    // An older Worker sends none of them.
    expect(parseMyPub(PUB)).toEqual(PUB);
  });
});

describe('the share link\'s pieces', () => {
  it('the title: the doc\'s, or the character and the date', () => {
    const us = new Date(2026, 8, 26, 21, 0, 12).getTime() * 1000;
    expect(defaultLinkTitle('Rasta', us)).toBe('Rasta · 26 September 2026');
    expect(linkTitle({ title: '' }, 'Rasta', us)).toBe('Rasta · 26 September 2026');
    expect(linkTitle({ title: '  Clearing\tthe camp ' }, 'Rasta', us)).toBe('Clearing the camp');
  });

  it('the text rules: controls, bidi and lone surrogates out; NFC; code points', () => {
    expect(pubText('a\u0000b‮c⁦d\u0085e')).toBe('a b c d e');
    expect(pubText('a\ud800b')).toBe('ab');
    expect(pubText('é')).toBe('é');
    expect(cleanTitle('x'.repeat(150))).toHaveLength(100);
    expect(Array.from(cleanTitle('😀'.repeat(150)))).toHaveLength(100);
    expect(cleanDescription(' one\n\ntwo ')).toBe('one two');
  });

  it('the meta: cleaned texts, numbers in range, listed false', () => {
    expect(linkMeta({ title: ' T ', description: '', character: ' Rasta ', level: 42, lengthS: 12.4 })).toEqual({ title: 'T', description: '', character: 'Rasta', level: 42, lengthS: 12, listed: false });
    expect(linkMeta({ title: 'T', description: '', character: 'R', level: 5000, lengthS: -3 })).toEqual({ title: 'T', description: '', character: 'R', lengthS: 0, listed: false });
  });

  it('the link: origin, base, r/<id>', () => {
    expect(linkUrl('Ab3dE5fG7hJk', 'https://mumecockpit.com/whatever?x')).toBe('https://mumecockpit.com/r/Ab3dE5fG7hJk');
    expect(linkPath('Ab3dE5fG7hJk', 'https://mumecockpit.com/')).toBe('/r/Ab3dE5fG7hJk');
  });

  it('sizes: KB below a tenth of a MB, else MB to a tenth, rounded up', () => {
    const MB = 1024 * 1024;
    expect(sizeWords(48 * 1024)).toBe('48 KB');
    expect(sizeWords(1.2 * MB)).toBe('1.2 MB');
    expect(sizeWords(5 * MB)).toBe('5 MB');
    expect(sizeWords(5 * MB + 1)).toBe('5.1 MB');
    expect(sizeWords(0.6 * MB)).toBe('0.6 MB');
  });
});
