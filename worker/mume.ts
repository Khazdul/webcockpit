// MUME's warlords lists and player count for the Community page (ADR 0155,
// "MUME's lists and player count"): the 5-minute cron fetches
// https://mume.org/news/war and probes MUME's MSSP at most every 15
// minutes, and keeps the last good answers in D1 (`mume_cache`, migration
// 0006). Nothing of MUME's HTML passes on: the lists are plain strings
// through the text rules (shared/cloud/text.ts).
//
// The parse is a small tokenizer of its own, not HTMLRewriter: the router
// (and with it this file) also runs under Node (scripts/static-server.ts),
// and one parser in both places is easier to trust than two.
import { cleanText } from '../shared/cloud/text.ts';
import type { D1, Deps, TcpSocket } from './runtime.ts';

// --- The shapes (the same as shared/cloud/api.ts's Warlord) ---

export interface Warlord {
  name: string;
  race: string;
  class: string;
}

export interface Warlords {
  west: Warlord[];
  dark: Warlord[];
}

export interface MumeBoxes extends Warlords {
  players?: number;
}

// --- Limits ---

export const WAR_URL = 'https://mume.org/news/war';
export const USER_AGENT = 'WebCockpit (+https://mumecockpit.com)';
export const MSSP_HOST = { hostname: 'mume.org', port: 4242 };

/** The longest value kept, in code points. */
export const MAX_VALUE = 40;
/** The warlords kept a side (the page has ten). */
export const MAX_WARLORDS = 10;
/** More data rows than this and the page is not the one we know. */
const MAX_ROWS = 20;

export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_PAGE_BYTES = 256 * 1024;
export const PROBE_TIMEOUT_MS = 5_000;
export const MAX_PROBE_BYTES = 8 * 1024;
/** Above this a PLAYERS value is not believed. */
const MAX_PLAYERS = 100_000;

/** The cadence of the fetch and the probe. */
export const REFRESH_MS = 15 * 60_000;
/** The slack on the cadence, so a cron that fires a few seconds early still counts. */
const REFRESH_SLACK_MS = 60_000;
/** The lists are shown for this long after their last good fetch, then not at all. */
export const WARLORDS_MAX_AGE_MS = 24 * 3_600_000;
/** The player count is shown for this long after its last good probe. */
export const PLAYERS_MAX_AGE_MS = 35 * 60_000;

// --- The HTML tokenizer ---

type Token =
  | { kind: 'open'; name: string; attrs: Map<string, string> }
  | { kind: 'close'; name: string }
  | { kind: 'text'; text: string };

/** Elements whose content is not markup: skipped whole (a script's text never reaches a cell). */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'template', 'plaintext']);

const NAME_START = /[A-Za-z]/;

/**
 * The tokens of `html`: start and end tags (lowercase names, attributes
 * with lowercase names and raw values), and text. Comments, doctypes and
 * processing instructions are dropped, and so is the content of the raw
 * text elements.
 */
export function tokenize(html: string): Token[] {
  const out: Token[] = [];
  const n = html.length;
  let i = 0;
  let text = '';
  const flush = (): void => {
    if (text) out.push({ kind: 'text', text });
    text = '';
  };
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      text += html.slice(i);
      break;
    }
    text += html.slice(i, lt);
    i = lt;
    const next = html[i + 1] ?? '';
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (next === '!' || next === '?') {
      const end = html.indexOf('>', i + 2);
      i = end < 0 ? n : end + 1;
      continue;
    }
    const closing = next === '/';
    const at = closing ? i + 2 : i + 1;
    if (!NAME_START.test(html[at] ?? '')) {
      // A '<' that starts no tag is text.
      text += '<';
      i += 1;
      continue;
    }
    // The tag runs to the first '>' outside a quoted value (a quote opens
    // one only right after '=').
    let j = at;
    let quote = '';
    let prev = '';
    for (; j < n; j++) {
      const c = html[j]!;
      if (quote) {
        if (c === quote) quote = '';
      } else if ((c === '"' || c === "'") && prev === '=') quote = c;
      else if (c === '>') break;
      if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r' && c !== '\f') prev = c;
    }
    if (j >= n) break; // An unclosed tag: the rest is dropped.
    const inner = html.slice(at, j);
    i = j + 1;
    const nameMatch = /^[^\s/>]+/.exec(inner);
    const name = (nameMatch?.[0] ?? '').toLowerCase();
    flush();
    if (closing) {
      out.push({ kind: 'close', name });
      continue;
    }
    const attrs = new Map<string, string>();
    const rest = inner.slice(name.length);
    const attr = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (let m = attr.exec(rest); m; m = attr.exec(rest)) {
      const k = (m[1] ?? '').toLowerCase();
      if (!attrs.has(k)) attrs.set(k, m[2] ?? m[3] ?? m[4] ?? '');
    }
    out.push({ kind: 'open', name, attrs });
    if (RAW_TEXT.has(name)) {
      // (A regex, not a lowercased copy: lowercasing can change the length.)
      const endTag = new RegExp(`</${name}`, 'gi');
      endTag.lastIndex = i;
      const end = endTag.exec(html);
      i = end ? end.index : n;
    }
  }
  flush();
  return out;
}

// --- Entities ---

/** HTML's Latin-1 entity names, U+00A0 to U+00FF in order. */
const LATIN1 =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest ' +
  'Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig ' +
  'agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml';

const ENTITIES = new Map<string, number>([
  ['amp', 0x26],
  ['lt', 0x3c],
  ['gt', 0x3e],
  ['quot', 0x22],
  ['apos', 0x27],
  ['OElig', 0x152],
  ['oelig', 0x153],
  ['Scaron', 0x160],
  ['scaron', 0x161],
  ['Yuml', 0x178],
  ['ndash', 0x2013],
  ['mdash', 0x2014],
  ['lsquo', 0x2018],
  ['rsquo', 0x2019],
  ['ldquo', 0x201c],
  ['rdquo', 0x201d],
  ['hellip', 0x2026],
  ['euro', 0x20ac],
  ['trade', 0x2122],
]);
LATIN1.split(' ').forEach((name, k) => ENTITIES.set(name, 0xa0 + k));

function codePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�';
  return String.fromCodePoint(cp);
}

/** `s` with its character references decoded; an unknown name is left as text. */
export function decodeEntities(s: string): string {
  return s.replace(/&(?:#[xX]([0-9A-Fa-f]{1,8})|#([0-9]{1,10})|([A-Za-z][A-Za-z0-9]{1,31}));?/g, (all, hex?: string, dec?: string, name?: string) => {
    if (hex !== undefined) return codePoint(parseInt(hex, 16));
    if (dec !== undefined) return codePoint(parseInt(dec, 10));
    const cp = name !== undefined ? ENTITIES.get(name) : undefined;
    return cp === undefined ? all : String.fromCodePoint(cp);
  });
}

/**
 * A cell's text as a plain value: entities decoded, whitespace collapsed,
 * the text rules applied, no '<' or '>', trimmed, at most MAX_VALUE code
 * points.
 */
export function plainValue(raw: string): string {
  const v = cleanText(decodeEntities(raw).replace(/[\s ]+/g, ' '))
    .replace(/[<>]/g, '')
    .trim();
  return [...v].slice(0, MAX_VALUE).join('').trim();
}

// --- The warlords table ---

const HEADER = ['rank', 'name', 'race', 'class', 'rank', 'name', 'race', 'class'];

interface Row {
  cells: { th: boolean; text: string }[];
}

/**
 * The rows of the first `table.warlords` of `html`, or null when there is
 * none, it does not end, or it holds another table.
 */
function warlordsRows(html: string): Row[] | null {
  const tokens = tokenize(html);
  const start = tokens.findIndex((t) => t.kind === 'open' && t.name === 'table' && (t.attrs.get('class') ?? '').split(/\s+/).includes('warlords'));
  if (start < 0) return null;
  const rows: Row[] = [];
  let row: Row | null = null;
  let cell: { th: boolean; text: string } | null = null;
  for (let k = start + 1; k < tokens.length; k++) {
    const t = tokens[k]!;
    if (t.kind === 'text') {
      if (cell) cell.text += t.text;
      continue;
    }
    if (t.kind === 'open') {
      if (t.name === 'table') return null;
      if (t.name === 'tr') {
        row = { cells: [] };
        rows.push(row);
        cell = null;
      } else if (t.name === 'td' || t.name === 'th') {
        if (!row) {
          row = { cells: [] };
          rows.push(row);
        }
        cell = { th: t.name === 'th', text: '' };
        row.cells.push(cell);
      } else if (t.name === 'br' && cell) cell.text += ' ';
      continue;
    }
    if (t.name === 'table') return rows;
    if (t.name === 'td' || t.name === 'th') cell = null;
    else if (t.name === 'tr') {
      row = null;
      cell = null;
    }
  }
  return null;
}

function warlordOf(cells: string[]): Warlord | null {
  const [name = '', race = '', cls = ''] = cells;
  return name ? { name, race, class: cls } : null;
}

/**
 * MUME's warlords per side from the war page, or null when the table is
 * not the shape we know: the header row Rank, Name, Race, Class twice,
 * then 1–20 rows of 8 cells whose ranks are numbers.
 */
export function parseWarlords(html: string): Warlords | null {
  const rows = warlordsRows(html);
  if (!rows) return null;
  const header = rows.findIndex((r) => r.cells.length === 8 && r.cells.every((c, k) => c.th && plainValue(c.text).toLowerCase() === HEADER[k]));
  if (header < 0) return null;
  const data = rows.slice(header + 1).filter((r) => r.cells.length > 0);
  if (data.length < 1 || data.length > MAX_ROWS) return null;
  const west: Warlord[] = [];
  const dark: Warlord[] = [];
  for (const r of data) {
    if (r.cells.length !== 8) return null;
    const v = r.cells.map((c) => plainValue(c.text));
    for (const [side, from] of [
      [west, 0],
      [dark, 4],
    ] as const) {
      const rank = v[from] ?? '';
      const w = warlordOf(v.slice(from + 1, from + 4));
      if (!w) {
        // A side with fewer warlords leaves its cells empty.
        if (rank !== '' && !/^\d{1,3}$/.test(rank)) return null;
        continue;
      }
      if (!/^\d{1,3}$/.test(rank)) return null;
      if (side.length < MAX_WARLORDS) side.push(w);
    }
  }
  if (west.length === 0 && dark.length === 0) return null;
  return { west, dark };
}

// --- The fetch ---

/** Reads at most `max` bytes of `res`'s body as UTF-8 (non-fatal); null when it is longer. */
async function readText(res: Response, max: number): Promise<string | null> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) return null;
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(all);
}

/** Rejects after `ms` (and runs `onTimeout`); the timer is cleared when `work` settles. */
async function within<T>(work: Promise<T>, ms: number, onTimeout: () => void = () => {}): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error('timeout'));
    }, ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** The warlords from MUME's war page, or null on any failure (status, size, time, shape). */
export async function fetchWarlords(fetch: Deps['fetch'], o: { timeoutMs?: number } = {}): Promise<Warlords | null> {
  const ctl = new AbortController();
  try {
    return await within(
      (async () => {
        const res = await fetch(WAR_URL, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, signal: ctl.signal });
        if (res.status !== 200) {
          await res.body?.cancel().catch(() => {});
          return null;
        }
        const html = await readText(res, MAX_PAGE_BYTES);
        return html === null ? null : parseWarlords(html);
      })(),
      o.timeoutMs ?? FETCH_TIMEOUT_MS,
      () => ctl.abort(),
    );
  } catch {
    return null;
  }
}

// --- MSSP (telnet option 70, https://tintin.mudhalla.net/protocols/mssp/) ---

const IAC = 255;
const DO = 253;
const SB = 250;
const SE = 240;
const MSSP = 70;
const MSSP_VAR = 1;
const MSSP_VAL = 2;

/** What the probe sends: IAC DO MSSP, and nothing else. */
export const MSSP_REQUEST = new Uint8Array([IAC, DO, MSSP]);

/**
 * The variables of the first complete MSSP subnegotiation in `bytes`
 * (IAC SB MSSP … IAC SE; IAC IAC is a 255 in the data), or null when there
 * is none yet. A variable may have several values.
 */
export function parseMssp(bytes: Uint8Array): Map<string, string[]> | null {
  for (let i = 0; i + 2 < bytes.length; i++) {
    if (bytes[i] !== IAC) continue;
    if (bytes[i + 1] === IAC) {
      i++;
      continue;
    }
    if (bytes[i + 1] !== SB || bytes[i + 2] !== MSSP) continue;
    // The data, unescaped, up to IAC SE.
    const data: number[] = [];
    let end = -1;
    for (let k = i + 3; k < bytes.length; k++) {
      const b = bytes[k]!;
      if (b !== IAC) {
        data.push(b);
        continue;
      }
      const c = bytes[k + 1];
      if (c === undefined) break;
      if (c === IAC) {
        data.push(IAC);
        k++;
      } else if (c === SE) {
        end = k;
        break;
      } else break; // Another command inside the subnegotiation: broken.
    }
    if (end < 0) return null;
    const vars = new Map<string, string[]>();
    const dec = new TextDecoder('utf-8');
    let name: number[] | null = null;
    let value: number[] | null = null;
    const done = (): void => {
      if (name === null || value === null) return;
      const n = dec.decode(new Uint8Array(name));
      const list = vars.get(n) ?? [];
      list.push(dec.decode(new Uint8Array(value)));
      vars.set(n, list);
      value = null;
    };
    for (const b of data) {
      if (b === MSSP_VAR) {
        done();
        name = [];
        value = null;
      } else if (b === MSSP_VAL) {
        done();
        if (name !== null) value = [];
      } else if (value !== null) value.push(b);
      else if (name !== null) name.push(b);
    }
    done();
    return vars;
  }
  return null;
}

/** PLAYERS of MSSP variables as a whole number, or null. */
export function msspPlayers(vars: Map<string, string[]> | null): number | null {
  const v = vars?.get('PLAYERS')?.[0]?.trim() ?? '';
  if (!/^\d{1,6}$/.test(v)) return null;
  const n = Number(v);
  return n <= MAX_PLAYERS ? n : null;
}

/**
 * The number of players on MUME by MSSP: connects to mume.org:4242, sends
 * IAC DO MSSP, reads until the server's MSSP subnegotiation is complete
 * (at most MAX_PROBE_BYTES, PROBE_TIMEOUT_MS) and closes. Null on any
 * failure or a missing PLAYERS. Logs nothing in and sends nothing more.
 */
export async function probeMssp(connect: NonNullable<Deps['connect']>, o: { timeoutMs?: number } = {}): Promise<number | null> {
  let socket: TcpSocket | undefined;
  try {
    socket = connect(MSSP_HOST);
    const open = socket;
    return await within(
      (async () => {
        const writer = open.writable.getWriter();
        await writer.write(MSSP_REQUEST);
        writer.releaseLock();
        const reader = open.readable.getReader();
        const buf = new Uint8Array(MAX_PROBE_BYTES);
        let size = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) return null;
            const take = Math.min(value.byteLength, MAX_PROBE_BYTES - size);
            buf.set(value.subarray(0, take), size);
            size += take;
            const vars = parseMssp(buf.subarray(0, size));
            if (vars) return msspPlayers(vars);
            if (size >= MAX_PROBE_BYTES) return null;
          }
        } finally {
          reader.releaseLock();
        }
      })(),
      o.timeoutMs ?? PROBE_TIMEOUT_MS,
      () => void open.close().catch(() => {}),
    );
  } catch {
    return null;
  } finally {
    await socket?.close().catch(() => {});
  }
}

// --- The cache (mume_cache, migration 0006) ---
//
// Rows: `warlords` (value: JSON Warlords) and `players` (value: JSON
// number), each with `fetched` the time of its last good answer; and
// `attempt` (value 'null'), `fetched` the time of the last try, which
// sets the cadence whether the try went well or not. A failure writes
// nothing else, so the last good answers stay.

type CacheRow = { key: string; value: string; fetched: number };

async function hasCache(db: D1): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'mume_cache'").first();
  return row !== null;
}

const PUT = 'INSERT INTO mume_cache (key, value, fetched) VALUES (?1, ?2, ?3) ON CONFLICT (key) DO UPDATE SET value = excluded.value, fetched = excluded.fetched';

/**
 * The cron's refresh: at most every REFRESH_MS fetches the war page and
 * (with `deps.connect`) probes MSSP, and stores what came back good.
 * Skips silently while the table `mume_cache` does not exist. Never throws.
 */
export async function refreshMume(deps: Deps, db: D1, now: number): Promise<void> {
  try {
    if (!(await hasCache(db))) return;
    const last = await db.prepare("SELECT fetched FROM mume_cache WHERE key = 'attempt'").first<{ fetched: number }>();
    if (last && now - last.fetched < REFRESH_MS - REFRESH_SLACK_MS && now >= last.fetched) return;
    await db.prepare(PUT).bind('attempt', 'null', now).run();
    const [warlords, players] = await Promise.all([
      fetchWarlords(deps.fetch).catch(() => null),
      deps.connect ? probeMssp(deps.connect).catch(() => null) : Promise.resolve(null),
    ]);
    const writes = [];
    if (warlords) writes.push(db.prepare(PUT).bind('warlords', JSON.stringify(warlords), now));
    if (players !== null) writes.push(db.prepare(PUT).bind('players', JSON.stringify(players), now));
    if (writes.length) await db.batch(writes);
  } catch {
    // The boxes keep their last good answers.
  }
}

function isWarlordList(v: unknown): v is Warlord[] {
  return (
    Array.isArray(v) &&
    v.length <= MAX_WARLORDS &&
    v.every((w) => {
      if (typeof w !== 'object' || w === null) return false;
      const r = w as Record<string, unknown>;
      return [r.name, r.race, r.class].every((s) => typeof s === 'string' && s === plainValue(s)) && r.name !== '';
    })
  );
}

/**
 * What `GET /api/community` carries as `mume`: the lists while their last
 * good fetch is under WARLORDS_MAX_AGE_MS old, the player count beside
 * them while its probe is under PLAYERS_MAX_AGE_MS old; undefined without
 * good lists (or the table).
 */
export async function readMume(db: D1, now: number): Promise<MumeBoxes | undefined> {
  try {
    const { results } = await db.prepare("SELECT key, value, fetched FROM mume_cache WHERE key IN ('warlords', 'players')").all<CacheRow>();
    const row = (k: string): CacheRow | undefined => results.find((r) => r.key === k);
    const w = row('warlords');
    if (!w || now - w.fetched > WARLORDS_MAX_AGE_MS) return undefined;
    const lists = JSON.parse(w.value) as Partial<Warlords> | null;
    if (!lists || !isWarlordList(lists.west) || !isWarlordList(lists.dark)) return undefined;
    const out: MumeBoxes = { west: lists.west, dark: lists.dark };
    const p = row('players');
    if (p && now - p.fetched <= PLAYERS_MAX_AGE_MS) {
      const n: unknown = JSON.parse(p.value);
      if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_PLAYERS) out.players = n;
    }
    return out;
  } catch {
    return undefined;
  }
}
