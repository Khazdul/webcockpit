// A fake of the share links' read side (stage 64 C2, the watch page; the
// contract is shared/cloud/api.ts "Share links", the real thing
// worker/pub.ts, worker/reports.ts and worker/moderation.ts). Not a spec.
//
// It sits beside the account fake (cloud-account-fake.ts) on the same
// page: `fakePubApi(page, api)` adds a route over `fakeAccountApi`'s that
// answers only the paths the watch page uses and passes everything else
// down (`route.fallback()`):
//
//   GET  /api/pub/<id>, /api/pub/<id>/payload, POST /api/pub/<id>/view
//   GET  /api/u/pub/<id>, /api/u/pub/<id>/payload   the sender's hidden run
//   POST /api/u/report
//   GET  /api/admin/pub/<id>, /payload              `adminAllowed` (else
//                                                    Access's redirect)
//
// The runs are seeded straight into it (`add`), not through the share
// dialog (part C1 builds that and the `/api/u/pub` writes). The flag
// `share` is the account fake's `flags.share`: off, every path here is 404
// (the admin's are not behind it, as in the Worker).

import type { Page } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { PUB_ID_PATTERN, type PubMeta, REPORTS_PER_DAY, REPORTS_TO_HIDE, REPORT_REASONS, REPORT_TEXT_MAX, type ReportRequest } from '../../shared/cloud/api';
import type { FakeAccountApi } from './cloud-account-fake';

export type FakePubState = 'active' | 'hidden' | 'removed';

export interface FakePub {
  meta: Omit<PubMeta, 'hidden'>;
  /** The sender's account name. */
  owner: string;
  state: FakePubState;
  /** The stored bytes (gzip JSON). */
  payload: Uint8Array;
}

export interface FakeReport extends ReportRequest {
  account: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The runs, views and reports. */
export class FakePubs {
  pubs = new Map<string, FakePub>();
  /** Every view request that counted (a new device and day). */
  views: { id: string; device: string }[] = [];
  /** Every view request, counted or not. */
  viewRequests: { id: string; device: string }[] = [];
  reports: FakeReport[] = [];
  /** Cloudflare Access lets the admin's requests through. */
  adminAllowed = true;
  /** The public meta and payload answer this status instead (e.g. 503, 429). */
  failPublic: number | null = null;
  /** Payload requests seen, by path. */
  payloadRequests: string[] = [];

  /** Seeds a run; its payload is the JSON of `payload`, gzip. Returns its id. */
  add(o: { id?: string; owner: string; title?: string; description?: string; character?: string; level?: number; lengthS?: number; created?: number; views?: number; state?: FakePubState; payload: unknown | Uint8Array }): string {
    const id = o.id ?? randomId();
    const bytes = o.payload instanceof Uint8Array ? o.payload : new Uint8Array(gzipSync(JSON.stringify(o.payload)));
    this.pubs.set(id, {
      owner: o.owner,
      state: o.state ?? 'active',
      payload: bytes,
      meta: {
        id,
        title: o.title ?? 'Clearing the ranger camp',
        description: o.description ?? '',
        sender: o.owner,
        character: o.character ?? 'Rasta',
        ...(o.level !== undefined ? { level: o.level } : {}),
        lengthS: o.lengthS ?? 4500,
        created: o.created ?? Date.UTC(2026, 8, 26, 12),
        views: o.views ?? 0,
        bytes: bytes.byteLength,
      },
    });
    return id;
  }
}

function randomId(): string {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => a[b % a.length]).join('');
}

const day = (): string => new Date().toISOString().slice(0, 10);

/**
 * Adds the share links' read side to a page that has `fakeAccountApi`
 * already (its server's flags and sessions are used). Open the page with
 * `?cloudtest`.
 */
export async function fakePubApi(page: Page, api: FakeAccountApi, pubs = new FakePubs()): Promise<FakePubs> {
  const server = api.server;
  const seenViews = new Set<string>();
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
    const bytes = (b: Uint8Array) =>
      route.fulfill({
        status: 200,
        contentType: 'application/octet-stream',
        headers: { 'Cache-Control': 'private, max-age=604800, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'attachment' },
        body: Buffer.from(b),
      });
    const share = server.flags.share === true;

    // The public paths.
    let m = /^\/api\/pub\/([^/]+)(\/payload|\/view)?$/.exec(path);
    if (m) {
      if (!share) return json(404, { error: 'not_found' });
      const id = m[1]!;
      const pub = PUB_ID_PATTERN.test(id) ? pubs.pubs.get(id) : undefined;
      const state = (): Promise<void> | null =>
        !pub ? json(404, { error: 'not_found' }) : pub.state === 'removed' ? json(410, { error: 'gone' }) : pub.state === 'hidden' ? json(451, { error: 'hidden' }) : null;
      if (m[2] === '/view') {
        if (req.method() !== 'POST') return json(405, { error: 'method_not_allowed' });
        let device = '';
        try {
          device = (JSON.parse(req.postData() ?? '') as { device?: string }).device ?? '';
        } catch {
          device = '';
        }
        if (!UUID.test(device)) return json(400, { error: 'bad_request' });
        const refused = state();
        if (refused) return refused;
        pubs.viewRequests.push({ id, device });
        const key = `${id}|${device}|${day()}`;
        if (!seenViews.has(key)) {
          seenViews.add(key);
          pub!.meta.views++;
          pubs.views.push({ id, device });
        }
        return route.fulfill({ status: 204 });
      }
      if (req.method() !== 'GET') return json(405, { error: 'method_not_allowed' });
      if (pubs.failPublic !== null) return json(pubs.failPublic, { error: pubs.failPublic === 429 ? 'rate_limited' : 'unavailable' });
      const refused = state();
      if (refused) return refused;
      if (m[2] === '/payload') {
        pubs.payloadRequests.push(path);
        return bytes(pub!.payload);
      }
      return json(200, { ...pub!.meta });
    }

    // The sender's own run (a hidden one).
    m = /^\/api\/u\/pub\/([^/]+)(\/payload)?$/.exec(path);
    if (m && req.method() === 'GET') {
      if (!share || server.flags.accounts !== true) return json(404, { error: 'not_found' });
      const who = server.sessionAccount(api.browser.cookie);
      if (!who) return json(401, { error: 'unauthorized' });
      const pub = pubs.pubs.get(m[1]!);
      if (!pub || pub.state === 'removed' || pub.owner.toLowerCase() !== who.name.toLowerCase()) return json(404, { error: 'not_found' });
      if (m[2]) {
        pubs.payloadRequests.push(path);
        return bytes(pub.payload);
      }
      return json(200, { ...pub.meta, ...(pub.state === 'hidden' ? { hidden: true } : {}) });
    }

    // Report.
    if (path === '/api/u/report') {
      if (!share || server.flags.accounts !== true) return json(404, { error: 'not_found' });
      if (req.method() !== 'POST') return json(405, { error: 'method_not_allowed' });
      const headers = await req.allHeaders();
      if (headers['x-wc'] !== '1' || headers.origin !== url.origin) return json(403, { error: 'forbidden' });
      const who = server.sessionAccount(api.browser.cookie);
      if (!who) return json(401, { error: 'unauthorized' });
      if (who.state === 'suspended') return json(403, { error: 'suspended' });
      let b: Record<string, unknown> | null = null;
      try {
        b = JSON.parse(req.postData() ?? '') as Record<string, unknown>;
      } catch {
        b = null;
      }
      const keys = b ? Object.keys(b) : [];
      if (
        !b ||
        !keys.every((k) => ['kind', 'target', 'reason', 'text'].includes(k)) ||
        typeof b.kind !== 'string' ||
        typeof b.target !== 'string' ||
        !(REPORT_REASONS as readonly unknown[]).includes(b.reason) ||
        (b.text !== undefined && (typeof b.text !== 'string' || [...b.text].length > REPORT_TEXT_MAX || /[\x00-\x09\x0b-\x1f\x7f-\x9f]/.test(b.text)))
      ) {
        return json(400, { error: 'bad_request' });
      }
      if (b.kind !== 'run') return json(400, { error: 'kind_closed' });
      const pub = pubs.pubs.get(b.target);
      if (!pub || pub.state === 'removed') return json(404, { error: 'not_found' });
      if (pub.owner.toLowerCase() === who.name.toLowerCase()) return json(403, { error: 'own' });
      if (pubs.reports.some((r) => r.target === b!.target && r.account.toLowerCase() === who.name.toLowerCase())) return json(409, { error: 'already_reported' });
      if (pubs.reports.filter((r) => r.account.toLowerCase() === who.name.toLowerCase()).length >= REPORTS_PER_DAY) return json(429, { error: 'too_many' });
      pubs.reports.push({ ...(b as unknown as ReportRequest), account: who.name });
      if (new Set(pubs.reports.filter((r) => r.target === b!.target).map((r) => r.account.toLowerCase())).size >= REPORTS_TO_HIDE) pub.state = 'hidden';
      return route.fulfill({ status: 204 });
    }

    // The admin's view (Access in front; not behind the flag).
    m = /^\/api\/admin\/pub\/([^/]+)(\/payload)?$/.exec(path);
    if (m && req.method() === 'GET') {
      if (!pubs.adminAllowed) return route.fulfill({ status: 302, headers: { Location: 'https://example.cloudflareaccess.com/cdn-cgi/access/login' } });
      const pub = pubs.pubs.get(m[1]!);
      if (!pub) return json(404, { error: 'not_found' });
      if (pub.state === 'removed') return json(410, { error: 'gone' });
      if (m[2]) {
        pubs.payloadRequests.push(path);
        return bytes(pub.payload);
      }
      return json(200, { ...pub.meta, ...(pub.state === 'hidden' ? { hidden: true } : {}) });
    }

    return route.fallback();
  });
  return pubs;
}

/** A small payload that passes `validatePayload` (schema 1): a few lines of a fight. */
export function demoPayload(o: { title?: string; character?: string; lines?: string[] } = {}): unknown {
  const T0 = 1_790_000_000_000_000;
  const ts = (s: number): string => String(T0 + Math.round(s * 1e6));
  const lines = o.lines ?? [
    'You attack the hardened ranger.',
    'You slash the hardened ranger hard.',
    'The hardened ranger hits you.',
    'The hardened ranger is dead! R.I.P.',
    'You receive your share of experience.',
  ];
  const text = [`${ts(0)} \x1bGMCP Char.Name {"name":"Rasta","fullname":"Rasta the Ranger"}`, ...lines.map((l, i) => `${ts(1 + i)} ${l}`), ''].join('\n');
  return {
    schema: 1,
    title: o.title ?? 'Clearing the ranger camp',
    character: o.character ?? 'Rasta',
    level: 42,
    startUs: T0,
    settings: {},
    runs: [{ meta: { startedUs: T0 }, text }],
    comments: [],
    cuts: [],
    markers: [],
  };
}
