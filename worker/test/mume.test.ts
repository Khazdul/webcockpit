// MUME's warlords lists and player count (worker/mume.ts, ADR 0155): the
// parse of the war page (a real copy and hostile ones), the fetch's limits,
// the MSSP parse against what MUME sent and garbage, the probe, and the
// cron's 15-minute cadence with the last good answers kept.
import { beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_CRON, runCron } from '../stats.ts';
import type { Deps, TcpSocket } from '../runtime.ts';
import {
  MAX_PAGE_BYTES,
  MAX_PROBE_BYTES,
  MSSP_REQUEST,
  PLAYERS_MAX_AGE_MS,
  REFRESH_MS,
  USER_AGENT,
  WARLORDS_MAX_AGE_MS,
  WAR_URL,
  type Warlords,
  decodeEntities,
  fetchWarlords,
  msspPlayers,
  parseMssp,
  parseWarlords,
  plainValue,
  probeMssp,
  readMume,
  refreshMume,
} from '../mume.ts';
import WAR_HTML from './fixtures/mume-war.html?raw';
import { MUME_MSSP_BASE64 } from './fixtures/mume-mssp.ts';
import { T, db, emptyTables, realEnv } from './helpers.ts';

const NOW = T('2026-11-15T21:00:00Z');
const MIN = 60_000;

const MSSP_BYTES = Uint8Array.from(atob(MUME_MSSP_BASE64), (c) => c.charCodeAt(0));

// --- Building hostile pages ---

const HEAD = `<tr class="msg_head"><th colspan=4>Armies of the West</th><th colspan=4>Forces of the Dark Lord</th></tr>
<tr class="msg_head"><th>Rank</th><th>Name</th><th>Race</th><th>Class</th><th>Rank</th><th>Name</th><th>Race</th><th>Class</th></tr>`;

function row(rank: string | number, west: string[], dark: string[]): string {
  const side = (c: string[]): string => `<td class="msg_head rank">${rank}</td>${c.map((v) => `<td>${v}</td>`).join('')}`;
  return `<tr>${side(west)}${side(dark)}</tr>`;
}

function page(rows: string, head = HEAD, cls = 'msg_body warlords'): string {
  return `<html><body><h2>Warlords Hall of Fame</h2><table class="${cls}">${head}${rows}</table><p>after</p></body></html>`;
}

const ONE = row(1, ['Lacra', 'Noldorin', 'Mountaineer'], ['Kakaroto', 'Zaugurz', 'Envoy']);

/** Every value of a parse is a plain, short, clean string. */
function expectSafe(w: Warlords): void {
  for (const x of [...w.west, ...w.dark]) {
    for (const v of [x.name, x.race, x.class]) {
      expect(typeof v).toBe('string');
      expect([...v].length).toBeLessThanOrEqual(40);
      expect(v).not.toMatch(/[<>\p{Cc}‪-‮⁦-⁩]/u);
      expect(v).toBe(v.trim());
      expect(v.normalize('NFC')).toBe(v);
    }
    expect(Object.keys(x).sort()).toEqual(['class', 'name', 'race']);
  }
}

describe('parseWarlords', () => {
  it('reads the real war page: ten a side, entities decoded', () => {
    const w = parseWarlords(WAR_HTML);
    expect(w).not.toBeNull();
    expect(w!.west).toHaveLength(10);
    expect(w!.dark).toHaveLength(10);
    expect(w!.west[0]).toEqual({ name: 'Lacra', race: 'Noldorin', class: 'Mountaineer' });
    expect(w!.dark[0]).toEqual({ name: 'Kakaroto', race: 'Black Númenórean', class: 'Envoy' });
    expect(w!.dark[2]!.name).toBe('Zûd');
    expect(w!.west[3]!.name).toBe('Voïx');
    expect(w!.dark[9]).toEqual({ name: 'Kohrn', race: 'Morruhk', class: 'Battlemaster' });
    expectSafe(w!);
  });

  it('keeps scripts, styles, comments and tags out of the values', () => {
    const w = parseWarlords(
      page(
        row(
          1,
          ['<script>alert("x")</script>Lacra<!-- <td>x</td> -->', '<b onclick="evil()">Nol</b>dorin<style>td{}</style>', '<img src=x onerror=alert(1)>Hero'],
          ['&lt;script&gt;alert(1)&lt;/script&gt;', '<a href="javascript:x">Orc</a>', '<SCRIPT>document.cookie</SCRIPT>Envoy'],
        ),
      ),
    );
    expect(w).not.toBeNull();
    expect(w!.west[0]).toEqual({ name: 'Lacra', race: 'Noldorin', class: 'Hero' });
    expect(w!.dark[0]).toEqual({ name: 'scriptalert(1)/script', race: 'Orc', class: 'Envoy' });
    expectSafe(w!);
  });

  it('does not let a quoted ">" or a script holding "</table>" end the table early', () => {
    const w = parseWarlords(page(`<tr title="a>b"><td>1</td><td>A</td><td>B</td><td>C</td><td>1</td><td>D</td><td>E</td><td>F</td></tr>` + `<script>"</table>"</script>`));
    expect(w).toEqual({ west: [{ name: 'A', race: 'B', class: 'C' }], dark: [{ name: 'D', race: 'E', class: 'F' }] });
  });

  it('decodes entities and drops bidi, controls and lone surrogates', () => {
    const w = parseWarlords(page(row(1, ['A&#x202E;B&#8238;C', 'R&#0;&#x7;a\u0001ce', '&#xD800;Cl&amp;ss&unknown;'], ['N&eacute;e⁦x⁩', '&#x110000;Race', 'C‏l'])));
    expect(w!.west[0]).toEqual({ name: 'ABC', race: 'R\uFFFDace', class: '\uFFFDCl&ss&unknown;' });
    expect(w!.dark[0]!.name).toBe('Née' + 'x');
    expect(w!.dark[0]!.race).toBe('\uFFFDRace');
    expectSafe(w!);
  });

  it('cuts a value to 40 code points and collapses whitespace', () => {
    const long = '😀'.repeat(60);
    const w = parseWarlords(page(row(1, [long, '  Half-\n\t elven  ', 'x'.repeat(5000)], ['A', 'B', 'C'])));
    expect([...w!.west[0]!.name]).toHaveLength(40);
    expect(w!.west[0]!.race).toBe('Half- elven');
    expect(w!.west[0]!.class).toHaveLength(40);
    expectSafe(w!);
  });

  it('keeps ten a side and allows a short side', () => {
    const rows = Array.from({ length: 12 }, (_, k) => row(k + 1, [`W${k}`, 'r', 'c'], k < 3 ? [`D${k}`, 'r', 'c'] : ['', '', ''])).join('');
    const w = parseWarlords(page(rows));
    expect(w!.west.map((x) => x.name)).toEqual(Array.from({ length: 10 }, (_, k) => `W${k}`));
    expect(w!.dark.map((x) => x.name)).toEqual(['D0', 'D1', 'D2']);
  });

  it('is null when the table is not the one we know', () => {
    expect(parseWarlords('')).toBeNull();
    expect(parseWarlords('<html><body>Service unavailable</body></html>')).toBeNull();
    // No table of the class.
    expect(parseWarlords(page(ONE, HEAD, 'msg_body'))).toBeNull();
    // The columns changed: a new column, a renamed one, a missing header.
    expect(parseWarlords(page(ONE, HEAD.replace(/<th>Class<\/th>/g, '<th>Class</th><th>WP</th>')))).toBeNull();
    expect(parseWarlords(page(ONE, HEAD.replace('<th>Race</th>', '<th>Kin</th>')))).toBeNull();
    expect(parseWarlords(page(ONE, ''))).toBeNull();
    // A row of other width, a rank that is not a number.
    expect(parseWarlords(page(ONE + '<tr><td>2</td><td>A</td></tr>'))).toBeNull();
    expect(parseWarlords(page(row('first', ['A', 'B', 'C'], ['D', 'E', 'F'])))).toBeNull();
    // Empty, too many rows, a nested table, a table that never ends.
    expect(parseWarlords(page(''))).toBeNull();
    expect(parseWarlords(page(row(1, ['', '', ''], ['', '', ''])))).toBeNull();
    expect(parseWarlords(page(Array.from({ length: 21 }, (_, k) => row(k + 1, ['A', 'B', 'C'], ['D', 'E', 'F'])).join('')))).toBeNull();
    expect(parseWarlords(page(`<tr><td><table class="x"><tr><td>1</td></tr></table></td></tr>${ONE}`))).toBeNull();
    expect(parseWarlords(`<table class="warlords">${HEAD}${ONE}`)).toBeNull();
    // An unclosed tag drops the rest.
    expect(parseWarlords(`<table class="warlords">${HEAD}${ONE}<tr title="x`)).toBeNull();
  });

  it('is fast on a large hostile page', () => {
    const junk = '<script>'.repeat(20_000) + '<a b="'.repeat(5_000) + '&amp;'.repeat(10_000);
    const t0 = Date.now();
    expect(parseWarlords(junk + page(ONE))).toBeNull();
    expect(parseWarlords(page(ONE) + junk)).not.toBeNull();
    expect(Date.now() - t0).toBeLessThan(2_000);
  });

  it('decodeEntities and plainValue', () => {
    expect(decodeEntities('&uacute;&#65;&#x42;&amp;amp;&nope;&')).toBe('úAB&amp;&nope;&');
    expect(plainValue('  <b>x</b>  ')).toBe('bx/b');
    expect(plainValue('‮evil')).toBe('evil');
  });
});

// --- The fetch ---

function respond(body: string | ReadableStream<Uint8Array>, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html' } });
}

describe('fetchWarlords', () => {
  it('asks for the war page with the User-Agent and parses it', async () => {
    let seen: { url: string; ua?: string } | null = null;
    const w = await fetchWarlords(async (url, init) => {
      seen = { url, ua: init?.headers?.['User-Agent'] };
      return respond(WAR_HTML);
    });
    expect(seen).toEqual({ url: WAR_URL, ua: USER_AGENT });
    expect(USER_AGENT).toBe('WebCockpit (+https://mumecockpit.com)');
    expect(w?.west).toHaveLength(10);
  });

  it('is null on a status other than 200, a thrown fetch or a page over 256 KB', async () => {
    expect(await fetchWarlords(async () => respond(WAR_HTML, 503))).toBeNull();
    expect(await fetchWarlords(async () => respond(WAR_HTML, 301))).toBeNull();
    expect(await fetchWarlords(async () => Promise.reject(new Error('down')))).toBeNull();
    expect(await fetchWarlords(async () => respond(WAR_HTML + ' '.repeat(MAX_PAGE_BYTES)))).toBeNull();
  });

  it('stops reading a page that never ends at 256 KB', async () => {
    let pulled = 0;
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled += 16_384;
        c.enqueue(new Uint8Array(16_384).fill(0x20));
      },
      cancel() {
        cancelled = true;
      },
    });
    expect(await fetchWarlords(async () => respond(endless))).toBeNull();
    expect(pulled).toBeLessThanOrEqual(MAX_PAGE_BYTES + 3 * 16_384);
    expect(cancelled).toBe(true);
  });

  it('gives up after the timeout and aborts the request', async () => {
    let aborted = false;
    const t0 = Date.now();
    const w = await fetchWarlords(
      (_url, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        }),
      { timeoutMs: 50 },
    );
    expect(w).toBeNull();
    expect(aborted).toBe(true);
    expect(Date.now() - t0).toBeLessThan(1_000);
  });
});

// --- MSSP ---

const IAC = 255;
const sb = (...vars: [string, ...string[]][]): number[] => {
  const enc = new TextEncoder();
  const out = [IAC, 250, 70];
  for (const [name, ...vals] of vars) {
    out.push(1, ...enc.encode(name));
    for (const v of vals) out.push(2, ...enc.encode(v));
  }
  return [...out, IAC, 240];
};

describe('parseMssp', () => {
  it('reads what MUME sent: PLAYERS and the rest', () => {
    const vars = parseMssp(MSSP_BYTES);
    expect(vars).not.toBeNull();
    expect(vars!.get('NAME')).toEqual(['MUME - Multi-Users in Middle-earth']);
    expect(vars!.get('CHARSET')).toEqual(['ASCII', 'ISO-8859-1', 'UTF-8']);
    expect(vars!.get('PORT')).toEqual(['4242']);
    expect(msspPlayers(vars)).toBe(34);
  });

  it('is null until the subnegotiation is complete', () => {
    for (const cut of [0, 10, 25, 200, MSSP_BYTES.length - 1]) expect(parseMssp(MSSP_BYTES.subarray(0, cut))).toBeNull();
  });

  it('unescapes IAC IAC, skips other options and ignores a stray IAC SB 70 in IAC IAC', () => {
    const bytes = new Uint8Array([IAC, 251, 70, IAC, IAC, 250, 70, ...sb(['PLAYERS', '7'], ['X', 'aÿ'])]);
    // The second byte pair "IAC IAC" is data, not the start of a subnegotiation.
    const vars = parseMssp(bytes);
    expect(msspPlayers(vars)).toBe(7);
    const esc = new Uint8Array([IAC, 250, 70, 1, 0x41, 2, IAC, IAC, IAC, 240]);
    expect(parseMssp(esc)!.get('A')).toEqual(['\uFFFD']);
  });

  it('survives garbage', () => {
    const rnd = (n: number, seed: number): Uint8Array => {
      const out = new Uint8Array(n);
      let s = seed;
      for (let k = 0; k < n; k++) {
        s = (s * 1103515245 + 12345) >>> 0;
        out[k] = s >>> 24;
      }
      return out;
    };
    for (let seed = 1; seed < 50; seed++) {
      const vars = parseMssp(rnd(4096, seed));
      const p = msspPlayers(vars);
      expect(p === null || (Number.isInteger(p) && p >= 0)).toBe(true);
    }
    expect(parseMssp(new Uint8Array([IAC, 250, 70, 1, 0x41, IAC, 251, 1, IAC, 240]))).toBeNull();
  });

  it('PLAYERS: a whole number in range, else null', () => {
    const of = (...v: string[]): number | null => msspPlayers(parseMssp(new Uint8Array(sb(['PLAYERS', ...v]))));
    expect(of('0')).toBe(0);
    expect(of(' 42 ')).toBe(42);
    expect(of('-1')).toBeNull();
    expect(of('3.5')).toBeNull();
    expect(of('lots')).toBeNull();
    expect(of('')).toBeNull();
    expect(of('9999999')).toBeNull();
    expect(of()).toBeNull();
    expect(msspPlayers(parseMssp(new Uint8Array(sb(['NAME', 'x']))))).toBeNull();
    expect(msspPlayers(null)).toBeNull();
  });
});

/** A fake socket: `chunks` arrive one per read (then it ends unless `hang`). */
function fakeSocket(chunks: Uint8Array[], o: { hang?: boolean } = {}): TcpSocket & { sent: Uint8Array[]; closed: number; reads: number } {
  const sent: Uint8Array[] = [];
  let k = 0;
  let cancelRead: (() => void) | null = null;
  const n = { closed: 0, reads: 0 };
  const s = {
    sent,
    get closed() {
      return n.closed;
    },
    get reads() {
      return n.reads;
    },
    readable: new ReadableStream<Uint8Array>(
      {
        pull(c) {
          n.reads++;
        const next = chunks[k++];
          if (next) c.enqueue(next.slice());
          else if (o.hang) return new Promise<void>((res) => (cancelRead = res));
          else c.close();
          return undefined;
        },
      },
      { highWaterMark: 0 },
    ),
    writable: new WritableStream<Uint8Array>({
      write(chunk) {
        sent.push(chunk);
      },
    }),
    async close() {
      n.closed++;
      cancelRead?.();
    },
  };
  return s;
}

describe('probeMssp', () => {
  it('sends IAC DO MSSP only, reads PLAYERS and closes', async () => {
    const sock = fakeSocket([MSSP_BYTES.subarray(0, 21), MSSP_BYTES.subarray(21, 300), MSSP_BYTES.subarray(300), new Uint8Array(500)]);
    let host: unknown;
    const n = await probeMssp((a) => {
      host = a;
      return sock;
    });
    expect(n).toBe(34);
    expect(host).toEqual({ hostname: 'mume.org', port: 4242 });
    expect(sock.sent.map((b) => [...b])).toEqual([[...MSSP_REQUEST]]);
    expect([...MSSP_REQUEST]).toEqual([255, 253, 70]);
    expect(sock.closed).toBeGreaterThanOrEqual(1);
    expect(sock.reads).toBeLessThanOrEqual(3);
  });

  it('is null and closes when the server ends without MSSP, sends too much, or the connect fails', async () => {
    const ended = fakeSocket([new TextEncoder().encode('Welcome\r\n')]);
    expect(await probeMssp(() => ended)).toBeNull();
    expect(ended.closed).toBeGreaterThanOrEqual(1);

    const flood = fakeSocket(Array.from({ length: 20 }, () => new Uint8Array(1024).fill(0x41)));
    expect(await probeMssp(() => flood)).toBeNull();
    expect(flood.reads).toBeLessThanOrEqual(MAX_PROBE_BYTES / 1024 + 1);
    expect(flood.closed).toBeGreaterThanOrEqual(1);

    expect(
      await probeMssp(() => {
        throw new Error('refused');
      }),
    ).toBeNull();
  });

  it('gives up after the timeout and closes', async () => {
    const quiet = fakeSocket([new Uint8Array([IAC, 251, 70])], { hang: true });
    const t0 = Date.now();
    expect(await probeMssp(() => quiet, { timeoutMs: 50 })).toBeNull();
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(quiet.closed).toBeGreaterThanOrEqual(1);
  });
});

// --- The cache and the cron ---

const CREATE = 'CREATE TABLE IF NOT EXISTS mume_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, fetched INTEGER NOT NULL)';

/** Deps whose fetch answers `page()` and whose connect answers `players()` (counted). */
function mumeDeps(now: number, o: { page?: () => Response | Promise<Response>; players?: () => number | null } = {}): Deps & { fetches: number; probes: number } {
  const d = {
    fetches: 0,
    probes: 0,
    now: () => now,
    fetch: async () => {
      d.fetches++;
      return o.page ? o.page() : respond(WAR_HTML);
    },
    connect: () => {
      d.probes++;
      const p = o.players ? o.players() : 34;
      return fakeSocket(p === null ? [] : [new Uint8Array(sb(['PLAYERS', String(p)]))]);
    },
  };
  return d;
}

async function cache(): Promise<Record<string, { value: unknown; fetched: number }>> {
  const { results } = await db.prepare('SELECT key, value, fetched FROM mume_cache').all<{ key: string; value: string; fetched: number }>();
  return Object.fromEntries(results.map((r) => [r.key, { value: JSON.parse(r.value) as unknown, fetched: r.fetched }]));
}

describe('refreshMume', () => {
  beforeEach(async () => {
    await emptyTables();
    await db.prepare(CREATE).run();
    await db.prepare('DELETE FROM mume_cache').run();
  });

  it('stores the lists and the player count, and readMume gives them back', async () => {
    const d = mumeDeps(NOW);
    await refreshMume(d, db, NOW);
    expect(d.fetches).toBe(1);
    expect(d.probes).toBe(1);
    const c = await cache();
    expect(c.war!.fetched).toBe(NOW);
    expect((c.war!.value as Warlords).west).toHaveLength(10);
    expect(c.players).toEqual({ value: 34, fetched: NOW });
    expect(c.attempt!.fetched).toBe(NOW);
    const m = await readMume(db, NOW + MIN);
    expect(m?.west[0]).toEqual({ name: 'Lacra', race: 'Noldorin', class: 'Mountaineer' });
    expect(m?.dark).toHaveLength(10);
    expect(m?.players).toBe(34);
  });

  it('runs at most every 15 minutes on the 5-minute cron', async () => {
    const d = mumeDeps(NOW);
    for (let t = 0; t <= 60; t += 5) await refreshMume(d, db, NOW + t * MIN);
    // 0, 15, 30, 45, 60.
    expect(d.fetches).toBe(5);
    expect(d.probes).toBe(5);
    expect((await cache()).war!.fetched).toBe(NOW + 60 * MIN);
  });

  it('keeps the last good answers when the page or the probe fails, and still waits 15 minutes', async () => {
    await refreshMume(mumeDeps(NOW), db, NOW);
    const bad = mumeDeps(NOW, { page: () => respond('<html>changed</html>'), players: () => null });
    await refreshMume(bad, db, NOW + REFRESH_MS);
    await refreshMume(bad, db, NOW + REFRESH_MS + 5 * MIN);
    expect(bad.fetches).toBe(1);
    const c = await cache();
    expect(c.war!.fetched).toBe(NOW);
    expect(c.players!.fetched).toBe(NOW);
    expect(c.attempt!.fetched).toBe(NOW + REFRESH_MS);
    // A thrown fetch keeps them too; one part failing does not stop the other.
    const half = mumeDeps(NOW, { page: () => Promise.reject(new Error('down')), players: () => 40 });
    await refreshMume(half, db, NOW + 2 * REFRESH_MS);
    const c2 = await cache();
    expect(c2.war!.fetched).toBe(NOW);
    expect(c2.players).toEqual({ value: 40, fetched: NOW + 2 * REFRESH_MS });
  });

  it('readMume: the lists for 24 hours, the count for 35 minutes, nothing without good lists', async () => {
    await refreshMume(mumeDeps(NOW), db, NOW);
    expect((await readMume(db, NOW + PLAYERS_MAX_AGE_MS))?.players).toBe(34);
    const later = await readMume(db, NOW + PLAYERS_MAX_AGE_MS + 1);
    expect(later?.west).toHaveLength(10);
    expect(later).not.toHaveProperty('players');
    expect(await readMume(db, NOW + WARLORDS_MAX_AGE_MS)).toBeDefined();
    expect(await readMume(db, NOW + WARLORDS_MAX_AGE_MS + 1)).toBeUndefined();
    // A row that is not what we write is not passed on.
    await db.prepare("UPDATE mume_cache SET value = ?1 WHERE key = 'war'").bind(JSON.stringify({ west: [{ name: '<b>x</b>', race: '', class: '' }], dark: [] })).run();
    expect(await readMume(db, NOW)).toBeUndefined();
    await db.prepare("UPDATE mume_cache SET value = 'not json' WHERE key = 'war'").run();
    expect(await readMume(db, NOW)).toBeUndefined();
  });

  it('without connect: the lists only', async () => {
    const d = mumeDeps(NOW);
    const { connect: _, ...noConnect } = d;
    await refreshMume(noConnect, db, NOW);
    const c = await cache();
    expect(c.war).toBeDefined();
    expect(c.players).toBeUndefined();
  });

  it('the 5-minute cron calls it; it skips silently while mume_cache does not exist', async () => {
    const d = mumeDeps(NOW);
    await runCron(realEnv, SAMPLE_CRON, NOW, d);
    expect(d.fetches).toBe(1);
    await db.prepare('DROP TABLE mume_cache').run();
    try {
      const d2 = mumeDeps(NOW);
      await expect(runCron(realEnv, SAMPLE_CRON, NOW + REFRESH_MS, d2)).resolves.toBeUndefined();
      await expect(refreshMume(d2, db, NOW + REFRESH_MS)).resolves.toBeUndefined();
      expect(d2.fetches).toBe(0);
      expect(d2.probes).toBe(0);
      expect(await readMume(db, NOW)).toBeUndefined();
    } finally {
      await db.prepare(CREATE).run();
    }
  });
});
