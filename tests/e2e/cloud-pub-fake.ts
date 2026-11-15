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
//   GET  /api/u/pub/<id>/payload                    the sender's hidden run
//                                                    (its meta: the account fake)
//   POST /api/u/report
//   GET  /api/admin/pub/<id>, /payload              `adminAllowed` (else
//                                                    Access's redirect)
//
// The runs live in the account fake's store (`server.pubs`, part C1's,
// which also answers the sender's `/api/u/pub` and `GET /api/u/pub/<id>`);
// a test seeds them with `add` (not through the share dialog) and removes
// one with `setState(id, 'removed')`, which leaves a tombstone here (the
// store deletes removed runs). The flag `share` is the account fake's
// `flags.share`: off, every path here is 404 (the admin's are not behind
// it, as in the Worker).

import type { Page } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { PUB_ID_PATTERN, type PubMeta, REPORTS_PER_DAY, REPORTS_TO_HIDE, REPORT_REASONS, REPORT_TEXT_MAX, type ReportRequest } from '../../shared/cloud/api';
import type { FakeAccountApi, FakeAccountServer } from './cloud-account-fake';

export type FakePubState = 'active' | 'hidden' | 'removed';

export interface FakeReport extends ReportRequest {
  account: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The watch page's side of the runs in the account fake's store: tombstones, views and reports. */
export class FakePubs {
  readonly server: FakeAccountServer;
  /** Removed runs (the store deletes them; the public paths answer 410). */
  removed = new Set<string>();
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

  constructor(server: FakeAccountServer) {
    this.server = server;
  }

  /** Seeds a run of `owner` (an account name); its payload is the JSON of `payload`, gzip. Returns its id. */
  add(o: { id?: string; owner: string; title?: string; description?: string; character?: string; level?: number; lengthS?: number; created?: number; views?: number; state?: FakePubState; payload: unknown | Uint8Array }): string {
    const bytes = o.payload instanceof Uint8Array ? o.payload : new Uint8Array(gzipSync(JSON.stringify(o.payload)));
    const id = this.server.addPub(o.owner, {
      ...(o.id ? { id: o.id } : {}),
      title: o.title ?? 'Clearing the ranger camp',
      description: o.description ?? '',
      character: o.character ?? 'Rasta',
      ...(o.level !== undefined ? { level: o.level } : {}),
      lengthS: o.lengthS ?? 4500,
      created: o.created ?? Date.UTC(2026, 8, 26, 12),
      views: o.views ?? 0,
      bytes: bytes.byteLength,
      payload: bytes,
    });
    if (o.state) this.setState(id, o.state);
    return id;
  }

  /** A run's state; `removed` deletes it from the store and leaves a tombstone. */
  setState(id: string, state: FakePubState): void {
    if (state === 'removed') {
      this.server.pubs.delete(id);
      this.removed.add(id);
      return;
    }
    const p = this.server.pubs.get(id);
    if (p) p.pub.state = state;
  }

  /** The public `PubMeta` of a run in the store (its sender's name as the account spells it). */
  meta(id: string): PubMeta | null {
    const p = this.server.pubs.get(id);
    if (!p) return null;
    const { pub } = p;
    return {
      id: pub.id,
      title: pub.title,
      description: pub.description,
      sender: this.server.accountName(p.account) ?? p.account,
      character: pub.character,
      ...(pub.level !== undefined ? { level: pub.level } : {}),
      lengthS: pub.lengthS,
      created: pub.created,
      views: pub.views,
      bytes: pub.bytes,
    };
  }
}


const day = (): string => new Date().toISOString().slice(0, 10);

/**
 * Adds the share links' read side to a page that has `fakeAccountApi`
 * already (its server's flags and sessions are used). Open the page with
 * `?cloudtest`.
 */
export async function fakePubApi(page: Page, api: FakeAccountApi, pubs = new FakePubs(api.server)): Promise<FakePubs> {
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
      const pub = PUB_ID_PATTERN.test(id) ? server.pubs.get(id) : undefined;
      const state = (): Promise<void> | null =>
        pubs.removed.has(id) ? json(410, { error: 'gone' }) : !pub ? json(404, { error: 'not_found' }) : pub.pub.state === 'hidden' ? json(451, { error: 'hidden' }) : null;
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
          pub!.pub.views++;
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
      return json(200, pubs.meta(id));
    }

    // The sender's own run's payload (its meta: the account fake's `GET /api/u/pub/<id>`).
    m = /^\/api\/u\/pub\/([^/]+)\/payload$/.exec(path);
    if (m && req.method() === 'GET') {
      if (!share || server.flags.accounts !== true) return json(404, { error: 'not_found' });
      const who = server.sessionAccount(api.browser.cookie);
      if (!who) return json(401, { error: 'unauthorized' });
      const pub = server.pubs.get(m[1]!);
      if (!pub || pub.account !== who.name.toLowerCase()) return json(404, { error: 'not_found' });
      pubs.payloadRequests.push(path);
      return bytes(pub.payload);
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
      const pub = server.pubs.get(b.target);
      if (!pub) return json(404, { error: 'not_found' });
      if (pub.account === who.name.toLowerCase()) return json(403, { error: 'own' });
      if (pubs.reports.some((r) => r.target === b!.target && r.account.toLowerCase() === who.name.toLowerCase())) return json(409, { error: 'already_reported' });
      if (pubs.reports.filter((r) => r.account.toLowerCase() === who.name.toLowerCase()).length >= REPORTS_PER_DAY) return json(429, { error: 'too_many' });
      pubs.reports.push({ ...(b as unknown as ReportRequest), account: who.name });
      if (new Set(pubs.reports.filter((r) => r.target === b!.target).map((r) => r.account.toLowerCase())).size >= REPORTS_TO_HIDE) pub.pub.state = 'hidden';
      return route.fulfill({ status: 204 });
    }

    // The admin's view (Access in front; not behind the flag).
    m = /^\/api\/admin\/pub\/([^/]+)(\/payload)?$/.exec(path);
    if (m && req.method() === 'GET') {
      if (!pubs.adminAllowed) return route.fulfill({ status: 302, headers: { Location: 'https://example.cloudflareaccess.com/cdn-cgi/access/login' } });
      if (pubs.removed.has(m[1]!)) return json(410, { error: 'gone' });
      const pub = server.pubs.get(m[1]!);
      if (!pub) return json(404, { error: 'not_found' });
      if (m[2]) {
        pubs.payloadRequests.push(path);
        return bytes(pub.payload);
      }
      return json(200, { ...pubs.meta(m[1]!), ...(pub.pub.state === 'hidden' ? { hidden: true } : {}) });
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
