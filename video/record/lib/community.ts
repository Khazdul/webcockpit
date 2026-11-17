// The real community content of mumecockpit.com (captured by
// record/capture-community.ts into private/community/) served to a
// recording page through the e2e fakes of the cloud backend
// (tests/e2e/cloud-account-fake.ts, cloud-pub-fake.ts, turnstile-stub.ts).
// Stage 70, owner's decision: the community scenes show real content only.
// The fakes' own seeds (tests/e2e/community.ts) are not used: every listed
// run, comment, note, warlord and count here is the captured one.
//
//   const c = await communityServer();                       // once per scene (all pages share it)
//   await serveCommunity(page, c);                           // each page, before it opens anything
//   await page.goto(`/?cloudtest&...`);                      // the client talks to the fakes
//   await page.goto(`/r/${c.runs[0]!.id}?cloudtest&from=community`);   // a real run's watch page
//
// The film's own account (acts 6 and 7) is a fake one: pass `account` and
// log in with its name and password on camera (the fake checks the real
// KDF), or with `logIn(page, c, name)` off camera.
//
// Time: the fake server's clock is the capture's moment, and the page's
// ages ("2 min", "today") are from the page's own date, so pin the page's
// date near it: `newPage(..., { now: c.pageNow(5) })` (5 minutes after the
// capture). A page left on the real date reads the content as older.
//
// Where the fakes differ from the Worker, this file brings them in line:
// the Hall of Fame takes only runs with HALL_OF_FAME_MIN_VOTES votes, Log
// of the day is the captured one, and `/api/stats/public` answers the
// captured counts. Votes: the public API gives only their sum and count,
// so a run's stars are cast by unnamed accounts (`voter1`…) that no page
// ever shows.
//
// The e2e files import without file extensions (Playwright's loader takes
// that, Node's does not), so they are bundled once with esbuild into the
// repository's node_modules/.cache/ and imported from there.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import { build } from 'esbuild';
import type { CommunityBoxes, Config, DayRun, GalleryRow, MumeBoxes, Note, PubMeta, PublicStats } from '../../../shared/cloud/api.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
export const COMMUNITY_DIR = fileURLToPath(new URL('../../private/community/', import.meta.url));

/** The Worker's rule (shared/cloud/api.ts HALL_OF_FAME_MIN_VOTES), kept here as a value: the API module stays out of the bundle's types. */
const HALL_OF_FAME_MIN_VOTES = 5;
const DAY_MS = 86_400_000;

/** What record/capture-community.ts wrote (`capture.json`). */
export interface CommunityCapture {
  site: string;
  capturedAt: number;
  config: Config;
  health: unknown;
  stats: PublicStats;
  gallery: { rows: GalleryRow[]; more: boolean }[];
  community: CommunityBoxes;
  runes: { notes: Note[]; time: number };
  pubs: Record<string, { meta: PubMeta; comments: { id: string; writer: string; text: string; created: number }[] }>;
}

export interface CommunityFakes {
  capture: CommunityCapture;
  server: FakeAccountServer;
  /** The listed runs, newest listed first (the list's New), with their real meta. */
  runs: PubMeta[];
  /** The page's date `minutes` after the capture (for `newPage`'s `now`). */
  pageNow(minutes?: number): number;
}

// The parts of the fakes this file uses, typed here: importing their own types would pull the e2e
// files and the app's sources into video/'s typecheck, which has other settings.
type SeedFields = Record<string, unknown>;
interface FakeRequest {
  method: string;
  path: string;
  search?: string;
  headers: Record<string, string>;
}
interface FakeResponse {
  status: number;
  body?: unknown;
}
export interface FakeAccountServer {
  flags: Config['flags'];
  mume: MumeBoxes | null;
  now(): number;
  advance(ms: number): void;
  seed(name: string, fields: SeedFields, o?: { created?: number }): void;
  stored(name: string): (SeedFields & { name: string; prefs: unknown }) | null;
  addPub(name: string, o: Record<string, unknown>): string;
  addVote(name: string, id: string, stars: number, o?: { ago?: number }): void;
  addComment(name: string, id: string, text: string, o?: { ago?: number }): string;
  addNote(name: string, text: string, o?: { ago?: number }): string;
  community(req: FakeRequest, cookie: string | null): FakeResponse | 'offline';
  publicListed(): number[];
  logInBrowser(browser: unknown, name: string): void;
}
export interface FakeAccountApi {
  server: FakeAccountServer;
  browser: unknown;
}
/** The watch page's side (tests/e2e/cloud-pub-fake.ts `FakePubs`): what it saw. */
export interface FakePubs {
  views: { id: string; device: string }[];
  payloadRequests: string[];
}
interface Fakes {
  FakeAccountServer: new () => FakeAccountServer;
  seedAccount(server: FakeAccountServer, name: string, password: string, o?: { created?: number }): Promise<{ recoveryCode: string }>;
  fakeAccountApi(page: Page, o?: { server?: FakeAccountServer }): Promise<FakeAccountApi>;
  fakePubApi(page: Page, api: FakeAccountApi): Promise<FakePubs>;
  stubTurnstile(page: Page, o?: { auto?: boolean }): Promise<unknown>;
}

const ENTRY = `
export { FakeAccountServer, fakeAccountApi, seedAccount } from './tests/e2e/cloud-account-fake';
export { fakePubApi } from './tests/e2e/cloud-pub-fake';
export { stubTurnstile } from './tests/e2e/turnstile-stub';
`;

let loaded: Promise<Fakes> | null = null;

/** The fakes' modules, bundled on first use. */
function fakes(): Promise<Fakes> {
  return (loaded ??= (async () => {
    const dir = join(ROOT, 'node_modules', '.cache', 'webcockpit-film');
    mkdirSync(dir, { recursive: true });
    const out = join(dir, 'cloud-fakes.mjs');
    await build({
      stdin: { contents: ENTRY, resolveDir: ROOT, loader: 'ts', sourcefile: 'film-cloud-fakes-entry.ts' },
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      outfile: out,
      external: ['@playwright/test', 'playwright', 'playwright-core'],
      logLevel: 'error',
    });
    return (await import(`${pathToFileURL(out).href}?t=${Date.now()}`)) as Fakes;
  })());
}

/** The capture (throws with the way to make it when there is none). */
export function readCapture(): CommunityCapture {
  const file = join(COMMUNITY_DIR, 'capture.json');
  if (!existsSync(file)) throw new Error(`no community capture at ${file}: run \`node record/capture-community.ts\` in video/`);
  return JSON.parse(readFileSync(file, 'utf8')) as CommunityCapture;
}

/**
 * A fake backend holding the captured content. `flags`: the site's
 * captured flags unless given (each key replaces the captured one).
 * `account`: the film's own (fake) account, made with the client's crypto
 * so it can log in.
 */
export async function communityServer(o: { flags?: Config['flags']; account?: { name: string; password: string; created?: number } } = {}): Promise<CommunityFakes> {
  const f = await fakes();
  const capture = readCapture();
  const server = new f.FakeAccountServer();
  server.advance(capture.capturedAt - server.now());
  const t = server.now();
  server.flags = { ...capture.config.flags, ...o.flags };

  // Every account the content names (senders, writers): one registration's fields for all, as tests/e2e/community.ts does.
  const rows = capture.gallery.flatMap((p) => p.rows);
  const names = new Set<string>();
  for (const r of rows) names.add(capture.pubs[r.id]?.meta.sender ?? r.sender);
  for (const n of capture.runes.notes) names.add(n.writer);
  for (const p of Object.values(capture.pubs)) for (const c of p.comments) names.add(c.writer);
  if (o.account) names.delete(o.account.name);
  const seedName = '__film_seed';
  await f.seedAccount(server, seedName, `film ${Math.random()}`);
  const fields = server.stored(seedName)!;
  const { name: _n, prefs: _p, ...seedFields } = fields;
  for (const n of names) server.seed(n, seedFields, { created: t - 90 * DAY_MS });
  if (o.account) await f.seedAccount(server, o.account.name, o.account.password, { created: o.account.created ?? t - 30 * DAY_MS });

  // The runs, oldest listed first (so the store's order matches), with their payloads.
  const runs: PubMeta[] = [];
  let voters = 0;
  for (const r of [...rows].reverse()) {
    const meta = capture.pubs[r.id]?.meta;
    if (!meta) throw new Error(`capture: no meta for ${r.id}`);
    const payload = new Uint8Array(readFileSync(join(COMMUNITY_DIR, 'payloads', `${r.id}.gz`)));
    server.addPub(meta.sender, {
      id: meta.id,
      title: meta.title,
      description: meta.description,
      character: meta.character,
      ...(meta.level !== undefined ? { level: meta.level } : {}),
      lengthS: meta.lengthS,
      listed: true,
      listedAt: r.listedAt,
      created: meta.created,
      views: meta.views,
      bytes: payload.byteLength,
      payload,
    });
    // Stars: the captured sum over the captured count, cast by unnamed accounts.
    const { sum, count } = meta.stars ?? r.stars;
    for (let i = 0; i < count; i++) {
      const v = `voter${++voters}`;
      server.seed(v, seedFields, { created: t - 90 * DAY_MS });
      const stars = Math.floor(sum / count) + (i < sum % count ? 1 : 0);
      server.addVote(v, meta.id, stars, { ago: DAY_MS });
    }
    for (const c of capture.pubs[r.id]!.comments) server.addComment(c.writer, meta.id, c.text, { ago: t - c.created });
    runs.unshift(meta);
  }
  // Random Runes: oldest first, each at its own age.
  for (const n of [...capture.runes.notes].reverse()) server.addNote(n.writer, n.text, { ago: t - n.created });
  server.mume = (capture.community.mume ?? null) as MumeBoxes | null;

  // The Worker's Hall of Fame (five votes or more) and the captured Log of the day.
  const community = server.community.bind(server);
  server.community = (req: FakeRequest, cookie: string | null): FakeResponse | 'offline' => {
    const res = community(req, cookie);
    if (res === 'offline' || req.path !== '/api/community' || res.status !== 200) return res;
    const b = res.body as CommunityBoxes;
    const day = capture.community.today;
    const dayRow = day ? (b.hallOfFame.find((x) => x.id === day.id) ?? null) : null;
    const today: DayRun | null = day ? { ...day, ...(dayRow ?? {}), description: day.description } : null;
    return { ...res, body: { ...b, hallOfFame: b.hallOfFame.filter((x) => x.stars.count >= HALL_OF_FAME_MIN_VOTES), today } };
  };

  return {
    capture,
    server,
    runs,
    pageNow: (minutes = 0) => capture.capturedAt + minutes * 60_000,
  };
}

/**
 * Puts the fakes on `page` (call before it opens anything): the account
 * and community endpoints, the watch page's, Turnstile's stub (it passes
 * by itself) and the captured `/api/stats/public`. Open pages with
 * `?cloudtest`.
 */
export async function serveCommunity(page: Page, c: CommunityFakes): Promise<{ api: FakeAccountApi; pubs: FakePubs }> {
  const f = await fakes();
  await f.stubTurnstile(page, { auto: true });
  const api = await f.fakeAccountApi(page, { server: c.server });
  const pubs = await f.fakePubApi(page, api);
  await page.route('**/api/stats/public', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-store' },
      body: JSON.stringify({ online: c.capture.stats.online, playing: c.capture.stats.playing, listed: c.server.publicListed() } satisfies PublicStats),
    }),
  );
  return { api, pubs };
}

/** Logs `page` in as `name` off camera (an account made with `communityServer`'s `account`). */
export async function logIn(page: Page, c: CommunityFakes, api: FakeAccountApi, name: string): Promise<void> {
  c.server.logInBrowser(api.browser, name);
  await page.addInitScript((n) => localStorage.setItem('wc.account', JSON.stringify({ name: n })), name);
}
