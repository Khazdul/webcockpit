// The watch page's pure parts (stage 64 C2): the address, the details'
// words, a report's text, the meta read from the API, the requests' paths
// and failures, and Report's way back after Log in (src/watch/return.ts).
import { describe, expect, it } from 'vitest';
import { REPORT_TEXT_MAX } from '../../shared/cloud/api.ts';
import { countView, fetchMeta, fetchPayload, parseMeta, sendReport, type WatchFetch } from '../../src/watch/api';
import {
  dateText,
  downloadName,
  endOf,
  lengthText,
  loadingLine,
  metaLine,
  reportFailText,
  reportText,
  viewsText,
  watchIdOf,
} from '../../src/watch/model';
import { RETURN_KEY, RETURN_MAX_MS, noteLoginReturn, takeLoginReturn } from '../../src/watch/return';

const META = {
  id: 'Ab3dE5fG7hJk',
  title: 'Clearing the ranger camp',
  description: 'At the ford.',
  sender: 'fenwick',
  character: 'Rasta',
  level: 42,
  lengthS: 4500,
  created: Date.UTC(2026, 8, 26, 12),
  views: 37,
  bytes: 1_200_000,
};

describe('the address', () => {
  it('finds the id under <base>r/', () => {
    expect(watchIdOf('/r/Ab3dE5fG7hJk')).toEqual({ id: 'Ab3dE5fG7hJk', valid: true });
    expect(watchIdOf('/r/Ab3dE5fG7hJk/')).toEqual({ id: 'Ab3dE5fG7hJk', valid: true });
    expect(watchIdOf('/sub/r/Ab3dE5fG7hJk', '/sub/')).toEqual({ id: 'Ab3dE5fG7hJk', valid: true });
    expect(watchIdOf('/r/short')).toEqual({ id: 'short', valid: false });
    expect(watchIdOf('/r/a.b')).toEqual({ id: 'a.b', valid: false });
    expect(watchIdOf('/r/')).toEqual({ id: '', valid: false });
    expect(watchIdOf('/privacy')).toBeNull();
    expect(watchIdOf('/r/Ab3dE5fG7hJk', '/sub/')).toBeNull();
  });

  it('maps the states', () => {
    expect(endOf(404)).toBe('unknown');
    expect(endOf(410)).toBe('removed');
    expect(endOf(451)).toBe('hidden');
    expect(endOf(503)).toBeNull();
  });
});

describe('the details', () => {
  it('words the length, date, views and size', () => {
    expect(lengthText(4500)).toBe('1 h 15 min');
    expect(lengthText(3600)).toBe('1 h');
    expect(lengthText(42 * 60)).toBe('42 min');
    expect(lengthText(50)).toBe('50 s');
    expect(lengthText(Number.NaN)).toBe('0 s');
    expect(dateText(Date.UTC(2026, 8, 26, 12))).toBe('26 September 2026');
    expect(viewsText(1)).toBe('1 view');
    expect(viewsText(37)).toBe('37 views');
    expect(viewsText(12345)).toBe('12,345 views');
    expect(loadingLine(400_000, 1_200_000)).toBe('Loading the run… 0.4 of 1.2 MB');
    expect(loadingLine(1, 0)).toBe('Loading the run… 0.1 MB');
  });

  it('builds the band line from the meta, leaving out what is not there', () => {
    expect(metaLine(META)).toEqual({ character: 'Rasta', level: 'Level 42', length: '1 h 15 min', date: '26 September 2026', views: '37 views', sender: 'fenwick' });
    const { level: _, ...noLevel } = META;
    expect(metaLine({ ...noLevel, character: '' })).toMatchObject({ character: null, level: null });
  });

  it('names the download after the title, file-name safe', () => {
    expect(downloadName('Clearing the ranger camp')).toBe('Clearing the ranger camp.html');
    expect(downloadName('a/b:c?')).toBe('a-b-c-.html');
    expect(downloadName('..hidden')).toBe('-hidden.html');
    expect(downloadName('  ')).toBe('mume-run.html');
  });
});

describe("a report's text", () => {
  it('is what the Worker takes: NFC, no control or bidi characters, trimmed, at most 500', () => {
    expect(reportText('  a\r\nb\u0007c‮d⁦e  ')).toBe('a\nbcde');
    expect(reportText('é')).toBe('é');
    expect(reportText('x\ud800y')).toBe('xy');
    expect(reportText('😀'.repeat(600))).toBe('😀'.repeat(REPORT_TEXT_MAX));
    expect(reportText('   ')).toBe('');
  });

  it('words the refusals', () => {
    expect(reportFailText(429, 'too_many')).toBe('You have sent the most reports a day. Try again tomorrow.');
    expect(reportFailText(403, 'suspended')).toBe('This account is suspended: it cannot report.');
    expect(reportFailText(403, 'own')).toBe('This is your own run.');
    expect(reportFailText(404, 'not_found')).toBe('This run is no longer there.');
    expect(reportFailText(0, 'offline')).toBe('Offline: the report could not be sent. Try again when you are online.');
    expect(reportFailText(500, '')).toBe('The report could not be sent. Try again later.');
  });
});

describe('the requests', () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const answer =
    (status: number, body: BodyInit | null, headers: Record<string, string> = {}): WatchFetch =>
    async (url, init) => {
      calls.push({ url, init });
      return new Response(body, { status, headers });
    };

  it('reads the meta strictly (only its fields; a wrong type is a bad answer)', () => {
    expect(parseMeta({ ...META, extra: '<b>', hidden: true })).toEqual({ ...META, hidden: true });
    expect(parseMeta({ ...META, title: 5 })).toBeUndefined();
    expect(parseMeta({ ...META, views: -1 })).toBeUndefined();
    expect(parseMeta({ ...META, level: 'x' })).toBeUndefined();
    expect(parseMeta(null)).toBeUndefined();
  });

  it('asks the three ways with the right credentials', async () => {
    calls.length = 0;
    const f = answer(200, JSON.stringify(META), { 'Content-Type': 'application/json' });
    expect(await fetchMeta('Ab3dE5fG7hJk', 'public', f)).toEqual({ ok: true, value: META });
    await fetchMeta('Ab3dE5fG7hJk', 'owner', f);
    await fetchMeta('Ab3dE5fG7hJk', 'admin', f);
    expect(calls.map((c) => [c.url, c.init.credentials, c.init.redirect])).toEqual([
      ['/api/pub/Ab3dE5fG7hJk', 'omit', 'follow'],
      ['/api/u/pub/Ab3dE5fG7hJk', 'same-origin', 'follow'],
      ['/api/admin/pub/Ab3dE5fG7hJk', 'same-origin', 'manual'],
    ]);
  });

  it("gives the status and the server's code on a failure; no answer is status 0", async () => {
    expect(await fetchMeta('x', 'public', answer(451, JSON.stringify({ error: 'hidden' })))).toEqual({ ok: false, status: 451, code: 'hidden' });
    expect(await fetchMeta('x', 'admin', answer(302, null, { Location: 'https://access.example' }))).toEqual({ ok: false, status: 302, code: 'access' });
    expect(await fetchMeta('x', 'public', () => Promise.reject(new Error('down')))).toEqual({ ok: false, status: 0, code: 'offline' });
    expect(await fetchMeta('x', 'public', answer(200, '{"id":1}'))).toEqual({ ok: false, status: 200, code: 'bad_answer' });
  });

  it('reads the payload in pieces with its progress, and stops past the fuse', async () => {
    const seen: [number, number][] = [];
    const body = new Uint8Array(3000).fill(7);
    const got = await fetchPayload('x', 'public', (d, t) => seen.push([d, t]), 0, answer(200, body, { 'Content-Length': '3000' }));
    expect(got.ok && got.value.byteLength).toBe(3000);
    expect(seen[0]).toEqual([0, 3000]);
    expect(seen.at(-1)).toEqual([3000, 3000]);
    const big = await fetchPayload('x', 'public', () => {}, 0, answer(200, 'x', { 'Content-Length': String(64 * 1024 * 1024) }));
    expect(big).toEqual({ ok: false, status: 200, code: 'too_large' });
  });

  it('counts a view and sends a report as the contract has them', async () => {
    calls.length = 0;
    expect(await countView('Ab3dE5fG7hJk', 'a-device', answer(204, null))).toBe(true);
    expect(calls[0]!.url).toBe('/api/pub/Ab3dE5fG7hJk/view');
    expect(calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ device: 'a-device' });
    expect(await sendReport({ kind: 'run', target: 'Ab3dE5fG7hJk', reason: 'rules' }, answer(204, null))).toEqual({ ok: true, value: null });
    expect(calls[1]!.url).toBe('/api/u/report');
    expect((calls[1]!.init.headers as Record<string, string>)['X-WC']).toBe('1');
    expect(calls[1]!.init.credentials).toBe('same-origin');
    expect(await sendReport({ kind: 'run', target: 'x', reason: 'rules' }, answer(409, JSON.stringify({ error: 'already_reported' })))).toEqual({
      ok: false,
      status: 409,
      code: 'already_reported',
    });
  });
});

describe("Report's Log in, and back", () => {
  const store = (): Storage => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    } as Storage;
  };

  it('opens Log in once, then goes back to the run after the login', () => {
    const s = store();
    noteLoginReturn('/r/Ab3dE5fG7hJk?cloudtest', 1000, s);
    expect(takeLoginReturn(false, '/', 2000, s)).toEqual({ open: 'login' });
    expect(JSON.parse(s.getItem(RETURN_KEY)!)).toMatchObject({ step: 'return' });
    expect(takeLoginReturn(true, '/', 3000, s)).toEqual({ go: '/r/Ab3dE5fG7hJk?cloudtest' });
    expect(s.getItem(RETURN_KEY)).toBeNull();
  });

  it('forgets the way back when the next load has no login, or when it is old', () => {
    const s = store();
    noteLoginReturn('/r/Ab3dE5fG7hJk', 1000, s);
    takeLoginReturn(false, '/', 1000, s);
    expect(takeLoginReturn(false, '/', 1000, s)).toBeNull();
    expect(s.getItem(RETURN_KEY)).toBeNull();
    noteLoginReturn('/r/Ab3dE5fG7hJk', 0, s);
    expect(takeLoginReturn(false, '/', RETURN_MAX_MS + 1, s)).toBeNull();
    expect(s.getItem(RETURN_KEY)).toBeNull();
  });

  it('goes only to a watch page of this site', () => {
    const s = store();
    for (const back of ['https://evil.example/r/x', '//evil.example/r/x', '/admin', '/r/x?a=<b>', 'javascript:alert(1)']) {
      noteLoginReturn(back, 0, s);
      expect(takeLoginReturn(true, '/', 1, s)).toBeNull();
    }
    noteLoginReturn('/sub/r/Ab3dE5fG7hJk', 0, s);
    expect(takeLoginReturn(true, '/sub/', 1, s)).toEqual({ go: '/sub/r/Ab3dE5fG7hJk' });
  });
});
