// Stage 64's review fixes on the client (ADR 0154 "As built (stage 64,
// review fixes)"): one describe per finding. The Worker's are in
// worker/test/review64.test.ts and worker/test/admin.test.ts.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync, gunzipSync, inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PUB_KEY_PATTERN } from '../../shared/cloud/api.ts';
import { cleanText, isCleanText } from '../../shared/cloud/text.ts';
import { configAnswer, config, resetConfigForTest } from '../../src/cloud/config';
import { createPubApi, parseMyPub, parsePubMeta } from '../../src/cloud/pub/api';
import { readMm2 } from '../../src/map/mm2';
import { bitmapsInTurn } from '../../src/map/render/webgl';
import { type MapToolRequest, runMapToolRequest } from '../../src/map/tools';
import { decodePayload } from '../../src/replay/codec';
import { buildReplayHtml } from '../../src/replay/export';
import { framePolicy } from '../../scripts/csp.ts';
import { MAP_IMAGE_PX, MAP_IMAGE_TOTAL_PX, PayloadError, validMapFile, validatePayload } from '../../src/replay/validate';
import { defaultSettings } from '../../src/settings';
import { defaultExportDoc } from '../../src/share/edits';
import { cleanTitle, linkMeta, newLinkKey, pubText } from '../../src/share/link';
import { prepareLinkPayload } from '../../src/share/link-payload';
import { sealLinkPayload } from '../../src/share/link-seal';
import { buildReplayPayload } from '../../src/share/payload';
import { countView, fetchMeta, fetchPayload, type WatchFetch } from '../../src/watch/api';
import { dateText, reportText, shareFlag } from '../../src/watch/model';
import { RETURN_KEY, leaveForLogin, takeLoginReturn } from '../../src/watch/return';
import { gridMap } from './map-grid';
import { BASE_US, makeLog, meta } from './player-helpers';
import { logPayload } from './replay-payloads';

const ROOT = join(import.meta.dirname, '../..');

// --- PNGs made here ---

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** A w×h RGBA PNG (zeros); `extra` chunks go between IHDR and IDAT. */
function png(w: number, h: number, extra: Buffer[] = []): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (1 + 4 * w));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), ...extra, chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const pngUri = (b: Buffer): string => `data:image/png;base64,${b.toString('base64')}`;
const withMap = (files: Record<string, string>): unknown => ({ ...JSON.parse(JSON.stringify(logPayload('map-demo.log'))), map: { name: 'm', rooms: 1, visited: 1, mm2: 'AAAA', files } });

describe('S1: a map cannot decode to gigabytes', () => {
  it('refuses an image past 512 px (the review’s 4 096² bomb) and admits 512', () => {
    expect(MAP_IMAGE_PX).toBe(512);
    expect(validMapFile('pixmaps/a.png', pngUri(png(4096, 4096)))).toBe(false);
    expect(validMapFile('pixmaps/a.png', pngUri(png(513, 8)))).toBe(false);
    expect(validMapFile('pixmaps/a.png', pngUri(png(512, 512)))).toBe(true);
  });

  it('refuses a map whose images together pass the pixel budget', () => {
    const tile = pngUri(png(512, 512));
    const n = Math.floor(MAP_IMAGE_TOTAL_PX / (512 * 512));
    const files = (count: number): Record<string, string> => Object.fromEntries(Array.from({ length: count }, (_, i) => [`pixmaps/t${i}.png`, tile]));
    expect(() => validatePayload(withMap(files(n)))).not.toThrow();
    expect(() => validatePayload(withMap(files(n + 1)))).toThrow(PayloadError);
  });

  it('every tile, tileset and font page in public/map passes (the real exports pass in replay-validate.test.ts)', () => {
    const all: string[] = [];
    const walk = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (f.endsWith('.png')) all.push(p);
      }
    };
    walk(join(ROOT, 'public/map'));
    expect(all.length).toBeGreaterThan(800);
    for (const p of all) expect(validMapFile('pixmaps/x.png', pngUri(readFileSync(p))), p).toBe(true);
  });

  it('the renderer decodes the tiles one after the other', async () => {
    let open = 0;
    let most = 0;
    vi.stubGlobal('createImageBitmap', async () => {
      open++;
      most = Math.max(most, open);
      await new Promise((r) => setTimeout(r, 1));
      open--;
      return { close() {} };
    });
    try {
      const got = await bitmapsInTurn(async () => new Blob([]), ['a', 'b', 'c', 'd']);
      expect(got).toHaveLength(4);
      expect(most).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('S2: only PNG, and only a still one', () => {
  it('refuses GIF, JPEG and WebP whatever their header says, and an APNG', () => {
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]);
    expect(validMapFile('pixmaps/a.png', `data:image/gif;base64,${gif.toString('base64')}`)).toBe(false);
    expect(validMapFile('pixmaps/a.png', 'data:image/jpeg;base64,/9j/4AAQ')).toBe(false);
    expect(validMapFile('pixmaps/a.png', 'data:image/webp;base64,UklGRgAAAABXRUJQ')).toBe(false);
    const actl = Buffer.alloc(8);
    actl.writeUInt32BE(1, 0);
    expect(validMapFile('pixmaps/a.png', pngUri(png(8, 8, [chunk('acTL', actl)])))).toBe(false);
    // Other chunks before the image data are fine (a tileset's sRGB, pHYs).
    expect(validMapFile('pixmaps/a.png', pngUri(png(8, 8, [chunk('sRGB', Buffer.from([0])), chunk('pHYs', Buffer.alloc(9))])))).toBe(true);
  });

  it('refuses woff2 under fonts/ (the exporter embeds only the .fnt descriptions)', () => {
    expect(validMapFile('fonts/x.woff2', 'data:font/woff2;base64,AAAA')).toBe(false);
    expect(validMapFile('fonts/Cantarell18.fnt', 'data:text/plain;base64,aW5mbw==')).toBe(true);
  });
});

describe('S6: a link’s map carries no room notes and no map file name', () => {
  const inflate = async (z: Uint8Array): Promise<Uint8Array> => new Uint8Array(inflateSync(z));
  const deflate = async (b: Uint8Array): Promise<Uint8Array> => new Uint8Array(deflateSync(b));
  const runMapTool = (req: MapToolRequest) => runMapToolRequest(req, { fetch, inflate, deflate });
  const fetchMap = async (url: string): Promise<Response> => {
    const m = /\/map\/(.+)$/.exec(url);
    if (m) return new Response(readFileSync(join(ROOT, 'public/map', m[1]!)));
    return url.endsWith('.js') ? new Response('/* bundle */') : new Response(new Uint8Array([1]));
  };
  const chain = () => {
    const text = makeLog(BASE_US, [
      { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 1, gmcp: 'Room.Info', json: { id: 1000 + 5 * 40 + 5, name: 'Room 205', desc: 'x' } },
      { at: 2, in: 'A room.' },
    ]);
    return [{ meta: meta('Rasta/a', BASE_US), text }];
  };
  const noted = () => {
    const map = gridMap(40, 40);
    map.notes = map.notes.map((_, i) => (i === 205 || i === 206 ? `My stash is here ${i}\n` : ''));
    return map;
  };
  const notesOf = async (mm2: string): Promise<string[]> => (await readMm2(Uint8Array.from(atob(mm2), (c) => c.charCodeAt(0)), inflate)).notes;

  it('the uploaded subset has every note empty and a neutral name', async () => {
    const prepared = await prepareLinkPayload(chain(), [], defaultExportDoc('Rasta/a'), defaultSettings(), { kind: 'data', map: noted(), name: 'olev-private-map.mm2' }, {
      base: 'https://example.org/',
      fetch: fetchMap,
      runMapTool,
    });
    const m = prepared.payload.map!;
    expect(m.rooms).toBeGreaterThan(1);
    expect(m.name).toBe('map.mm2');
    expect((await notesOf(m.mm2)).every((n) => n === '')).toBe(true);
    expect(prepared.json).not.toMatch(/olev-private-map/);
  });

  it('the HTML file to a local disk keeps them (unchanged)', async () => {
    const payload = buildReplayPayload(chain(), [], defaultExportDoc('Rasta/a'), defaultSettings());
    const blob = await buildReplayHtml(payload, { base: 'https://example.org/', fetch: fetchMap, map: { kind: 'data', map: noted(), name: 'olev-private-map.mm2' }, runMapTool });
    const p = await decodePayload(/id="wc-replay-payload">([^<]+)</.exec(await blob.text())![1]!);
    expect(p.map!.name).toBe('olev-private-map.mm2');
    expect((await notesOf(p.map!.mm2)).some((n) => n.startsWith('My stash'))).toBe(true);
  });
});

describe('S7: what is uploaded is the validated copy; the frame document is sandboxed on its own', () => {
  it('sealLinkPayload compresses the validator’s output, not the JSON it was given', async () => {
    const p = logPayload('gmcp-demo.log');
    const raw = { ...JSON.parse(JSON.stringify(p)), extra: 'dropped by the validator', runs: p.runs.map((r) => ({ ...r, secret: 'not read' })) };
    const sealed = await sealLinkPayload({ payload: p, json: JSON.stringify(raw), lengthS: 1 });
    const json = gunzipSync(sealed.bytes).toString('utf8');
    expect(json).not.toMatch(/dropped by the validator|not read/);
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(validatePayload(raw))));
  });

  it('public/_headers gives /r/frame `sandbox allow-scripts`', () => {
    const policy = framePolicy(readFileSync(join(ROOT, 'public/_headers'), 'utf8'))!;
    expect(policy.split(';').map((d) => d.trim())).toContain('sandbox allow-scripts');
  });
});

describe('S5: the watch page’s view is a same-site JSON request', () => {
  it('sends Content-Type JSON and X-WC: 1', async () => {
    const seen: RequestInit[] = [];
    const f: WatchFetch = async (_url, init) => {
      seen.push(init);
      return new Response(null, { status: 204 });
    };
    expect(await countView('AbCdEfGh1234', '00000000-0000-4000-8000-000000000001', f)).toBe(true);
    const h = new Headers(seen[0]!.headers);
    expect(h.get('content-type')).toBe('application/json');
    expect(h.get('x-wc')).toBe('1');
  });
});

describe('CR1: a failed /api/config is a failure with Try again, not “does not work yet”', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetConfigForTest();
  });

  it('configAnswer is null on a failure, which is forgotten: the next call asks again', async () => {
    const answers = [new Response('down', { status: 503 }), Response.json({ flags: { share: true } })];
    const fetchFn = vi.fn(async () => answers.shift()!);
    vi.stubGlobal('fetch', fetchFn);
    vi.stubGlobal('navigator', { webdriver: false });
    // (The dev server's tests: the API is allowed with the test hook.)
    vi.stubGlobal('location', { search: '?cloudtest' });
    expect(await configAnswer()).toBeNull();
    expect(await configAnswer()).toEqual({ flags: { share: true } });
    expect(await config()).toEqual({ flags: { share: true } });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('only a config that came and says share off is “not yet”', () => {
    expect(shareFlag(true, null)).toBe('failed');
    expect(shareFlag(true, { flags: {} })).toBe('off');
    expect(shareFlag(true, { flags: { share: false } })).toBe('off');
    expect(shareFlag(true, { flags: { share: true } })).toBe('on');
    expect(shareFlag(false, null)).toBe('off');
  });
});

describe('CR2: a stale login hint does not bounce Log in back to the run for ever', () => {
  const store = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { m: Map<string, string> } => {
    const m = new Map<string, string>();
    return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  };

  it('after a 401, Log in forgets the lost session first: the start page opens Log in', async () => {
    const s = store();
    let hint: string | null = 'Olev';
    const order: string[] = [];
    await leaveForLogin('/r/AbCdEfGh1234', {
      lost: true,
      forget: async () => {
        order.push('forget');
        hint = null;
      },
      go: () => order.push('go'),
      now: 1000,
      store: s,
    });
    expect(order).toEqual(['forget', 'go']);
    expect(s.m.has(RETURN_KEY)).toBe(true);
    expect(takeLoginReturn(hint !== null, '/', 2000, s)).toEqual({ open: 'login' });
  });

  it('a guest’s Log in does not touch the session', async () => {
    const forget = vi.fn(async () => {});
    const go = vi.fn();
    await leaveForLogin('/r/AbCdEfGh1234', { lost: false, forget, go, store: store() });
    expect(forget).not.toHaveBeenCalled();
    expect(go).toHaveBeenCalledTimes(1);
  });
});

describe('CR3: the share dialog’s idempotency key', () => {
  it('is 16–32 of [A-Za-z0-9_-], new each time, and goes in the meta', () => {
    const a = newLinkKey();
    const b = newLinkKey();
    expect(a).toMatch(PUB_KEY_PATTERN);
    expect(b).not.toBe(a);
    expect(linkMeta({ title: 'A', description: '', character: 'Rasta', lengthS: 3, key: a }).key).toBe(a);
  });
});

describe('CR4: lengths in seconds are read tolerantly, and one bad row does not lose the list', () => {
  const pub = (o: Record<string, unknown> = {}) => ({
    id: 'AbCdEfGh1234',
    title: 'T',
    description: '',
    character: 'Rasta',
    lengthS: 93.5,
    listed: false,
    state: 'active',
    created: 1,
    updated: 1,
    views: 0,
    bytes: 2,
    ...o,
  });

  it('a finite lengthS is rounded; a negative one is not a run', () => {
    expect(parseMyPub(pub())?.lengthS).toBe(94);
    expect(parsePubMeta({ ...pub(), sender: 'olev' })?.lengthS).toBe(94);
    expect(parseMyPub(pub({ lengthS: -1 }))).toBeUndefined();
  });

  it('the list skips a row it cannot read', async () => {
    const api = createPubApi({
      enabled: async () => true,
      transport: async () => ({ status: 200, data: { pubs: [pub(), pub({ id: 'bad' }), pub({ id: 'ZyXwVuTs9876', lengthS: 'x' }), pub({ id: 'Qw2Er4Ty6Ui8' })] } }),
    });
    const got = await api.list();
    expect(got.ok && got.value.map((p) => p.id)).toEqual(['AbCdEfGh1234', 'Qw2Er4Ty6Ui8']);
  });
});

describe('CR8: the payload uses the browser’s cache, the meta does not', () => {
  it('fetchPayload asks with cache default, fetchMeta with no-store', async () => {
    const seen: RequestInit[] = [];
    const f: WatchFetch = async (url, init) => {
      seen.push(init);
      return url.endsWith('/payload') ? new Response(new Uint8Array([0x1f, 0x8b])) : Response.json({});
    };
    await fetchPayload('AbCdEfGh1234', 'public', () => {}, 0, f);
    await fetchMeta('AbCdEfGh1234', 'public', f);
    expect(seen.map((i) => i.cache)).toEqual(['default', 'no-store']);
  });
});

describe('CR10: one set of text rules (shared/cloud/text.ts)', () => {
  const hostile = ['a\u0000b', 'x‮y', 'p⁦q', 'l\ud800r', 'tab\there', 'c1\u0085x', 'line\nbreak', 'é', 'ok'];

  it('what the client sends passes the Worker’s check', () => {
    for (const s of hostile) {
      expect(isCleanText(cleanTitle(s)), s).toBe(true);
      expect(isCleanText(reportText(s), true), s).toBe(true);
      expect(isCleanText(pubText(s, true), true), s).toBe(true);
      expect(isCleanText(cleanText(s)), s).toBe(true);
    }
    expect(isCleanText('a\nb')).toBe(false);
    expect(isCleanText('a\nb', true)).toBe(true);
  });
});

describe('created is milliseconds everywhere', () => {
  it('the watch page reads ms only (no seconds fallback)', () => {
    expect(dateText(Date.UTC(2026, 8, 26, 12))).toBe('26 September 2026');
    expect(dateText(1_790_000_000)).toMatch(/1970$/);
  });
});
