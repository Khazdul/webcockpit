// Stage 65 C1 (ADR 0155): the Community page's client
// (src/cloud/community/api.ts) against a fake transport: what it asks
// (paths, X-WC on writes, the cookie only for /api/u/), the flags it
// needs, the answers read against the contract, and the failures.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GALLERY_SORTS, NOTE_MAX } from '../../shared/cloud/api';
import {
  type CommunityAnswer,
  type CommunityNeed,
  type CommunityRequest,
  communityApi,
  communityFailureOf,
  fetchTransport,
  parseBoard,
  parseBoxes,
  parseGalleryPage,
  parseGalleryRow,
} from '../../src/cloud/community/api';

const ROW = {
  id: 'Ab3dE5fG7hJk',
  title: 'Holding the Fords of Isen',
  sender: 'brego',
  character: 'Eothain',
  level: 37,
  lengthS: 8400,
  listedAt: 1_763_000_000_000,
  views: 188,
  stars: { sum: 68, count: 15 },
  comments: 4,
};
const NOTE = { id: 'Nn3dE5fG7hJk', writer: 'hollin', text: 'Moria tonight?', created: 1_763_000_000_000 };

function setup(answer: (r: CommunityRequest) => CommunityAnswer | Error, allowed: (n: CommunityNeed) => boolean = () => true) {
  const reqs: CommunityRequest[] = [];
  const api = communityApi({
    allowed: async (n) => allowed(n),
    transport: async (r) => {
      reqs.push(r);
      const a = answer(r);
      if (a instanceof Error) throw a;
      return a;
    },
  });
  return { api, reqs };
}

describe('the answers, read against the contract', () => {
  it('a row: the contract’s fields only; anything else is no row', () => {
    expect(parseGalleryRow({ ...ROW, extra: 1 })).toEqual(ROW);
    const { level: _, ...noLevel } = ROW;
    expect(parseGalleryRow(noLevel)).toEqual(noLevel);
    for (const bad of [{ ...ROW, id: 'short' }, { ...ROW, views: -1 }, { ...ROW, stars: { sum: 1 } }, { ...ROW, title: 5 }, null, []]) expect(parseGalleryRow(bad)).toBeUndefined();
  });

  it('a page (with total; an older answer without it counts what it sees); a bad row spoils the page', () => {
    const page = { sort: 'new', period: 'all', page: 1, rows: [ROW], more: false, total: 1, time: 5 };
    expect(parseGalleryPage(page)).toEqual(page);
    const { total: _, ...old } = page;
    expect(parseGalleryPage({ ...old, more: true })!.total).toBe(2);
    expect(parseGalleryPage({ ...page, sort: 'best' })).toBeUndefined();
    expect(parseGalleryPage({ ...page, rows: [{ ...ROW, id: 1 }] })).toBeUndefined();
    for (const s of GALLERY_SORTS) expect(parseGalleryPage({ ...page, sort: s })?.sort).toBe(s);
  });

  it('the boxes: the run of the day with its description, MUME only when whole; no top posters, no yesterday', () => {
    const boxes = parseBoxes({ hallOfFame: [ROW], today: { ...ROW, description: 'At dusk.' }, yesterday: ROW, topPosters: [], time: 5 });
    expect(boxes).toEqual({ hallOfFame: [ROW], today: { ...ROW, description: 'At dusk.' }, time: 5 });
    const war = { west: [{ name: 'Eothain', race: 'Man', class: 'warrior' }], dark: [] };
    expect(parseBoxes({ hallOfFame: [], today: null, mume: { ...war, players: 38 }, time: 5 })!.mume).toEqual({ ...war, players: 38 });
    expect(parseBoxes({ hallOfFame: [], today: null, mume: { west: 1, dark: [] }, time: 5 })!.mume).toBeUndefined();
    expect(parseBoxes({ hallOfFame: [], today: null, mume: { ...war, players: -1 }, time: 5 })!.mume).toEqual(war);
    expect(parseBoxes({ today: null, time: 5 })).toBeUndefined();
  });

  it('the board: notes with a writer’s name and at most 500 code points (an older server’s length)', () => {
    expect(parseBoard({ notes: [NOTE], time: 5 })).toEqual({ notes: [NOTE], time: 5 });
    expect(parseBoard({ notes: [{ ...NOTE, writer: '<b>x</b>' }], time: 5 })).toBeUndefined();
    expect(parseBoard({ notes: [{ ...NOTE, text: 'x'.repeat(501) }], time: 5 })).toBeUndefined();
  });

  it('failures: the server’s codes, else by the status', () => {
    expect(communityFailureOf(429, { error: 'too_many' }).code).toBe('too_many');
    expect(communityFailureOf(429, { error: 'rate_limited' }).code).toBe('rate_limited');
    expect(communityFailureOf(401, { error: 'session_ended' }).code).toBe('unauthorized');
    expect(communityFailureOf(403, { error: 'own' }).code).toBe('own');
    expect(communityFailureOf(404, {}).code).toBe('not_found');
    expect(communityFailureOf(502, null).code).toBe('unavailable');
    expect(communityFailureOf(418, { error: 'teapot' }).code).toBe('bad_answer');
  });
});

describe('the requests', () => {
  it('the list, the boxes, the board: public reads without the cookie or X-WC; period all; by escaped', async () => {
    const { api, reqs } = setup((r) => ({
      status: 200,
      data: r.path.startsWith('/api/gallery')
        ? { sort: 'top', period: 'all', page: 2, rows: [ROW], more: false, total: 11, time: 5 }
        : r.path === '/api/community'
          ? { hallOfFame: [], today: null, time: 5 }
          : { notes: [], time: 5 },
    }));
    expect((await api.list({ sort: 'top', page: 2 })).ok).toBe(true);
    await api.list({ sort: 'new', page: 1, by: 'brego' });
    await api.boxes();
    await api.board();
    expect(reqs.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /api/gallery?sort=top&period=all&page=2',
      'GET /api/gallery?sort=new&period=all&page=1&by=brego',
      'GET /api/community',
      'GET /api/runes',
    ]);
    for (const r of reqs) {
      expect(r.credentials).toBe('omit');
      expect(r.headers['X-WC']).toBeUndefined();
      // Owner's feedback W4: never answered from the browser's cache, never kept there.
      expect(r.cache).toBe('no-store');
    }
  });

  it('a note: X-WC, the cookie, the JSON body; remove; report kind note', async () => {
    const { api, reqs } = setup((r) => (r.method === 'POST' && r.path === '/api/u/runes' ? { status: 200, data: { note: NOTE } } : { status: 204, data: undefined }));
    expect(await api.writeNote('Moria tonight?')).toEqual({ ok: true, value: NOTE });
    expect(await api.removeNote(NOTE.id)).toEqual({ ok: true, value: null });
    expect(await api.reportNote(NOTE.id, 'rules', 'spam')).toEqual({ ok: true, value: null });
    expect(reqs.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /api/u/runes', `DELETE /api/u/runes/${NOTE.id}`, 'POST /api/u/report']);
    for (const r of reqs) {
      expect(r.headers['X-WC']).toBe('1');
      expect(r.credentials).toBe('same-origin');
      expect(r.cache).toBeUndefined();
    }
    expect(JSON.parse(reqs[0]!.body!)).toEqual({ text: 'Moria tonight?' });
    expect(JSON.parse(reqs[2]!.body!)).toEqual({ kind: 'note', target: NOTE.id, reason: 'rules', text: 'spam' });
  });

  it('nothing is sent without the flags; a note needs `runes` and accounts; a bad id or a long note is not sent', async () => {
    const needs: CommunityNeed[] = [];
    const { api, reqs } = setup(
      () => ({ status: 200, data: {} }),
      (n) => {
        needs.push(n);
        return false;
      },
    );
    expect(await api.list({ sort: 'new', page: 1 })).toEqual({ ok: false, code: 'disabled' });
    expect(await api.board()).toEqual({ ok: false, code: 'disabled' });
    expect(await api.writeNote('hi')).toEqual({ ok: false, code: 'disabled' });
    expect(needs).toEqual(['read', 'runes', 'userRunes']);
    expect(await api.removeNote('../x')).toEqual({ ok: false, code: 'not_found' });
    expect(await api.writeNote('x'.repeat(NOTE_MAX + 1))).toEqual({ ok: false, code: 'bad_text' });
    expect(reqs).toEqual([]);
  });

  it('never rejects: offline, a timeout, a 429, an answer that is not the contract’s', async () => {
    let next: CommunityAnswer | Error = new Error('offline');
    const { api } = setup(() => next);
    expect(await api.list({ sort: 'new', page: 1 })).toEqual({ ok: false, code: 'offline' });
    next = new Error('timeout');
    expect(await api.boxes()).toEqual({ ok: false, code: 'timeout' });
    next = { status: 429, data: { error: 'too_many' } };
    expect(await api.writeNote('hi')).toEqual({ ok: false, code: 'too_many', status: 429 });
    next = { status: 200, data: { nonsense: true } };
    expect(await api.board()).toEqual({ ok: false, code: 'bad_answer', status: 200 });
  });
});

describe('the transport (owner\u2019s feedback W4: the reads are fresh)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hands `cache` to fetch for a read, and nothing for a write', async () => {
    const inits: RequestInit[] = [];
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      inits.push(init);
      return new Response(JSON.stringify({ notes: [], time: 5 }), { status: 200 });
    });
    const api = communityApi({ allowed: async () => true });
    expect((await api.board()).ok).toBe(true);
    await fetchTransport({ method: 'POST', path: '/api/u/runes', headers: {}, body: '{}', credentials: 'same-origin', timeoutMs: 1000 });
    expect(inits[0]!.cache).toBe('no-store');
    expect(inits[0]!.credentials).toBe('omit');
    expect('cache' in inits[1]!).toBe(false);
  });
});
