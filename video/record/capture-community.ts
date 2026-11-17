// Captures the real community content of mumecockpit.com once, for the
// film's act 7 (stage 70: "community content is real"):
//
//   node record/capture-community.ts            → private/community/
//   WC_SITE=https://… node record/capture-community.ts
//
// Only the public, unauthenticated GETs the client itself makes as a guest
// (worker/router.ts, worker/community.ts, worker/pub.ts): the flags, the
// guests' counter, every page of the list (New), the Community's boxes
// (Hall of Fame, Log of the day, MUME's warlords and players online),
// Random Runes, and for each listed run its meta, every comment and its
// payload. Nothing is posted, voted, viewed (no `/view`) or logged in; no
// personal data is sent (a generic User-Agent, no cookies).
//
// The result lives in the gitignored private/community/ (other players'
// names and words: not committed):
//
//   capture.json          every JSON answer as it came, plus `capturedAt`
//   payloads/<id>.gz      each run's payload, the bytes as served
//
// record/lib/community.ts serves it to a recording through the e2e fakes.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VIDEO = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(VIDEO, 'private', 'community');
const SITE = (process.env.WC_SITE ?? 'https://mumecockpit.com').replace(/\/$/, '');
const HEADERS = { 'User-Agent': 'webcockpit-film-capture', Accept: 'application/json' };
/** The list's page cap (GALLERY_PAGES_MAX is 10; a safety stop). */
const MAX_PAGES = 20;

async function get(path: string): Promise<Response> {
  const res = await fetch(SITE + path, { headers: HEADERS, redirect: 'error' });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text().catch(() => '')}`);
  return res;
}

async function getJson<T>(path: string): Promise<T> {
  const t = await (await get(path)).json();
  console.log(`  GET ${path}`);
  return t as T;
}

interface Row {
  id: string;
  title: string;
  sender: string;
}
interface GalleryPage {
  rows: Row[];
  more: boolean;
}
interface CommentPage {
  comments: { writer: string; created: number }[];
  more: boolean;
  before?: string;
}

const capturedAt = Date.now();
console.log(`capturing ${SITE}`);
const config = await getJson<{ flags: Record<string, boolean> }>('/api/config');
for (const f of ['share', 'gallery', 'runes'] as const) {
  if (config.flags[f] !== true) throw new Error(`the site's flag ${f} is off: nothing to capture`);
}
const health = await getJson<unknown>('/api/health');
const stats = await getJson<unknown>('/api/stats/public');

const gallery: GalleryPage[] = [];
for (let page = 1; page <= MAX_PAGES; page++) {
  const p = await getJson<GalleryPage>(`/api/gallery?sort=new&period=all&page=${page}`);
  gallery.push(p);
  if (!p.more) break;
}
const community = await getJson<unknown>('/api/community');
const runes = await getJson<unknown>('/api/runes');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'payloads'), { recursive: true });

const pubs: Record<string, { meta: unknown; comments: CommentPage['comments'] }> = {};
for (const row of gallery.flatMap((p) => p.rows)) {
  const meta = await getJson<unknown>(`/api/pub/${row.id}`);
  // Every comment: the newest page, then older ones by the cursor (oldest first in the end).
  const comments: CommentPage['comments'] = [];
  let before: string | undefined;
  for (let i = 0; i < 100; i++) {
    const c: CommentPage = await getJson<CommentPage>(`/api/pub/${row.id}/comments${before ? `?before=${encodeURIComponent(before)}` : ''}`);
    comments.unshift(...c.comments);
    if (!c.more || !c.before) break;
    before = c.before;
  }
  const bytes = new Uint8Array(await (await get(`/api/pub/${row.id}/payload`)).arrayBuffer());
  console.log(`  GET /api/pub/${row.id}/payload (${bytes.byteLength} bytes)`);
  writeFileSync(join(OUT, 'payloads', `${row.id}.gz`), bytes);
  pubs[row.id] = { meta, comments };
}

writeFileSync(join(OUT, 'capture.json'), `${JSON.stringify({ site: SITE, capturedAt, config, health, stats, gallery, community, runes, pubs }, null, 2)}\n`);
const rows = gallery.flatMap((p) => p.rows);
const notes = (runes as { notes: unknown[] }).notes.length;
const comments = Object.values(pubs).reduce((n, p) => n + p.comments.length, 0);
console.log(`→ ${OUT}: ${rows.length} listed run(s), ${comments} comment(s), ${notes} note(s)`);
for (const r of rows) console.log(`  ${r.id}  "${r.title}" by ${r.sender}`);
