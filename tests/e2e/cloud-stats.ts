// E2E helpers for the cloud client of stage 59 (spec §7.6, ADR 0147): the
// API stubbed with Playwright's `page.route`, and `?cloudtest`, the
// dev-server-only hook that lets the client call the API under webdriver
// (src/cloud/config.ts). Not a spec (no tests).
//
// Why a route stub and not a test Worker behind the dev server: each test
// picks its own answers (flag on or off, 404, 500, a dropped connection)
// and sees every request the page makes, in one browser context, without a
// second server per worktree.

import type { Page, Request } from '@playwright/test';
import type { Beat, Config, PublicStats } from '../../shared/cloud/api';

export interface ApiStub {
  /** Every `/api/*` request, in order. */
  requests: Request[];
  /** The bodies of `POST /api/beat`. */
  beats: Beat[];
  paths(): string[];
}

export type StatsAnswer = PublicStats | 404 | 500 | 'abort';

/** Stubs `/api/*`: the flags, the public numbers and the beat (204). */
export async function stubApi(page: Page, o: { flags?: Config['flags'] | 404 | 500 | 'abort'; stats?: StatsAnswer } = {}): Promise<ApiStub> {
  const stub: ApiStub = {
    requests: [],
    beats: [],
    paths: () => stub.requests.map((r) => `${r.method()} ${new URL(r.url()).pathname}`),
  };
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    stub.requests.push(req);
    const path = new URL(req.url()).pathname;
    const answer = (a: unknown): Promise<void> => {
      if (a === 'abort') return route.abort('connectionrefused');
      if (a === 404) return route.fulfill(json({ error: 'not_found' }, 404));
      if (a === 500) return route.fulfill(json({ error: 'internal' }, 500));
      return route.fulfill(json(a));
    };
    if (path === '/api/config') return answer(typeof o.flags === 'object' || o.flags === undefined ? { flags: o.flags ?? {} } : o.flags);
    if (path === '/api/stats/public') return answer(o.stats ?? 404);
    if (path === '/api/beat' && req.method() === 'POST') {
      stub.beats.push(req.postDataJSON() as Beat);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill(json({ error: 'not_found' }, 404));
  });
  return stub;
}
