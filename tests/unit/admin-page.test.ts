// @vitest-environment happy-dom
// The admin page's script (worker/admin/page.ts, stage 64 C3, ADR 0154
// "Admin") in the unit DOM against a faked fetch: the report queue, the
// totals, the log, the confirmations and the calls they make. Every text
// from the API is hostile here: it must show as text, never as markup.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminLogEntry, AdminReports, AdminStats, PubMeta } from '../../shared/cloud/api.ts';
import { ADMIN_HTML, ADMIN_JS } from '../../worker/admin/page.ts';

const HOSTILE = '<img src=x onerror=alert(1)>';
const NOW = Date.UTC(2026, 10, 15, 16, 40);

interface Call {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let calls: Call[];
let reports: AdminReports;
let log: AdminLogEntry[];
/** The answer of the next writes, in order; 204 when empty. */
let writes: Array<{ status: number; body?: unknown }>;
let failReports = false;

const stats: AdminStats = {
  now: NOW,
  online: { total: 0, menu: 0, playing: 0, replay: 0 },
  today: { day: '2026-11-15', devices: 0, newDevices: 0, peakOnline: 0, peakPlaying: 0, playMinutes: 0, beats: 0 },
  weekly: 0,
  monthly: 0,
  days: [],
  split: null,
  usage: { requests: 0, rowsWritten: 0, rowsRead: 0, limits: { requests: 100000, rowsWritten: 100000, rowsRead: 5000000 } },
  flags: {},
} as unknown as AdminStats;

const queue = (): AdminReports => ({
  items: [
    {
      kind: 'run',
      target: 'Zp6Wd3Fg5uNa',
      title: HOSTILE,
      sender: 'fenwick',
      state: 'hidden',
      reasons: { real_life: 3, harassment: 2 },
      reporters: 5,
      newest: NOW - 2 * 3600_000,
      text: `His name is ${HOSTILE}`,
      hiddenReason: 'reports',
    },
    {
      kind: 'run',
      target: 'Vt8Ky2Qa4mRc',
      title: 'Orc raid',
      sender: '<b>marrow</b>',
      state: 'active',
      reasons: { harassment: 2, other: 1 },
      reporters: 3,
      newest: NOW - 5 * 3600_000,
    },
  ],
  pubs: { count: 1284, bytes: 1_310_000_000, today: 47 },
});

const meta = (id: string): PubMeta => ({
  id,
  title: 'x',
  description: '',
  sender: 'fenwick',
  character: HOSTILE,
  level: 28,
  lengthS: 60,
  created: Date.UTC(2026, 10, 3),
  views: 21,
  bytes: 1_900_000,
});

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function fakeFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = init.method ?? 'GET';
  const headers = Object.fromEntries(Array.from(new Headers(init.headers).entries(), ([k, v]) => [k.toLowerCase(), v]));
  calls.push({ path: input, method, headers, body: init.body ? JSON.parse(String(init.body)) : undefined });
  if (method === 'POST') {
    const w = writes.shift();
    return w ? json(w.body ?? {}, w.status) : new Response(null, { status: 204 });
  }
  if (input === '/api/admin/stats') return json(stats);
  if (input === '/api/admin/reports') return failReports ? json({ error: 'unavailable' }, 503) : json(reports);
  if (input === '/api/admin/log') return json({ entries: log });
  const m = /^\/api\/admin\/pub\/([^/]+)$/.exec(input);
  if (m) return json(meta(m[1] as string));
  return json({ error: 'not_found' }, 404);
}

/** Lets the faked fetches and their promise chains settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

async function boot(): Promise<void> {
  const doc = new DOMParser().parseFromString(ADMIN_HTML, 'text/html');
  document.body.replaceChildren(...Array.from(doc.body.childNodes).map((n) => document.importNode(n, true)));
  new Function(ADMIN_JS)();
  await settle();
}

const $ = <T extends Element = HTMLElement>(sel: string): T => {
  const e = document.querySelector<T>(sel);
  if (!e) throw new Error(`no ${sel}`);
  return e;
};
const cards = (): HTMLElement[] => Array.from(document.querySelectorAll<HTMLElement>('#queue article.rq'));
const buttonIn = (root: ParentNode, text: string): HTMLButtonElement => {
  const b = Array.from(root.querySelectorAll('button')).find((x) => x.textContent === text);
  if (!b) throw new Error(`no button ${text}`);
  return b;
};
const modal = (): HTMLElement | null => document.querySelector('.modal');
const posts = (): Call[] => calls.filter((c) => c.method === 'POST');
function type(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'Date'], now: NOW });
  calls = [];
  reports = queue();
  log = [
    { ts: NOW - 3 * 3600_000, action: 'pub.restore', target: 'Kd5Ra8Tz2yBm', note: HOSTILE },
    { ts: NOW - 9 * 3600_000, action: 'account.suspend', target: 'grimbeorn', note: '' },
  ];
  writes = [];
  failReports = false;
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('the admin page: the report queue', () => {
  it('shows each item, the totals and the log; hostile text stays text', async () => {
    await boot();
    expect($('#reports-count').textContent).toBe('8 open on 2 runs');
    const [first, second] = cards();
    expect(first?.querySelector('h3')?.textContent).toBe(HOSTILE);
    expect(first?.classList.contains('is-hidden')).toBe(true);
    expect(first?.querySelector('.rq-state')?.textContent).toBe('Hidden after 5 reports');
    expect(first?.querySelector('.rq-text')?.textContent).toBe(`“His name is ${HOSTILE}”`);
    expect(first?.querySelector('.rq-from')?.textContent).toContain('Reported by 5 accounts');
    expect(first?.querySelector('.rq-from')?.textContent).toContain('2026-11-15 14:40 UTC (2 h ago)');
    // Reasons in a fixed order with their counts.
    expect(Array.from(first?.querySelectorAll('.rq-r') ?? []).map((r) => r.textContent)).toEqual(['Harassment 2', 'Real-life information about someone 3']);
    // The details from the run's meta, the character as text.
    expect(first?.querySelector('.rq-who')?.textContent).toBe(`by fenwick · Zp6Wd3Fg5uNa · ${HOSTILE} (L28) · 1.9 MB · 21 views · 2026-11-03`);
    expect(second?.querySelector('.rq-who b')?.textContent).toBe('<b>marrow</b>');
    // No markup from the API anywhere.
    expect(document.querySelector('img')).toBeNull();
    expect(document.body.innerHTML).not.toContain('<img');
    expect(document.body.innerHTML).not.toContain('<b>marrow');

    const watch = first?.querySelector('a') as HTMLAnchorElement;
    expect(watch.textContent).toBe('Watch');
    expect(watch.getAttribute('href')).toBe('/r/Zp6Wd3Fg5uNa?admin');
    expect(watch.target).toBe('_blank');
    expect(watch.rel).toBe('noopener noreferrer');

    // A hidden run offers Restore; a shown one Hide; both Dismiss reports (review fix CR6).
    const texts = (c: HTMLElement | undefined) => Array.from(c?.querySelectorAll('button') ?? []).map((b) => b.textContent);
    expect(texts(first)).toEqual(['Restore', 'Delete', 'Dismiss reports', 'Suspend fenwick']);
    expect(texts(second)).toEqual(['Hide', 'Delete', 'Dismiss reports', 'Suspend <b>marrow</b>']);

    expect(Array.from(document.querySelectorAll('#pubs dd')).map((d) => d.textContent)).toEqual(['1,284', '1.31 GB', '47']);
    expect($('#pubs-r2').textContent).toBe('R2 holds 10 GB free; published runs use 13.1 % of it.');

    const rows = Array.from(document.querySelectorAll('#log tbody tr')).map((tr) => Array.from(tr.children).map((td) => td.textContent));
    expect(rows).toEqual([
      ['2026-11-15 13:40', 'restore', 'run Kd5Ra8Tz2yBm', HOSTILE],
      ['2026-11-15 07:40', 'suspend', 'account grimbeorn', ''],
    ]);
    // Only reads so far.
    expect(posts()).toEqual([]);
    expect(calls.map((c) => c.path)).toEqual(
      expect.arrayContaining(['/api/admin/stats', '/api/admin/reports', '/api/admin/log', '/api/admin/pub/Zp6Wd3Fg5uNa', '/api/admin/pub/Vt8Ky2Qa4mRc']),
    );
  });

  it('nothing open: one line with the last action on a run; the totals and the log as always', async () => {
    reports = { items: [], pubs: { count: 3, bytes: 2_500_000, today: 0 } };
    await boot();
    expect($('#reports-count').textContent).toBe('none open');
    expect(cards()).toEqual([]);
    expect($('#queue').textContent).toBe('No open reports. The last action on a run: 2026-11-15 13:40 UTC.');
    expect(Array.from(document.querySelectorAll('#pubs dd')).map((d) => d.textContent)).toEqual(['3', '2.5 MB', '0']);
    expect(document.querySelectorAll('#log tbody tr').length).toBe(2);

    log = [];
    calls = [];
    vi.advanceTimersByTime(60_000);
    await settle();
    expect($('#queue').textContent).toBe('No open reports.');
    expect($('#log tbody').textContent).toBe('Nothing in the log yet.');
  });

  it('a failing read says so in a line of text', async () => {
    failReports = true;
    await boot();
    expect($('#queue').textContent).toBe('Could not read the reports: HTTP 503');
  });

  it('a long log shows the newest 20, and all on asking', async () => {
    log = Array.from({ length: 100 }, (_, i) => ({ ts: NOW - i * 60_000, action: 'pub.hide', target: `id${i}`, note: '' }));
    await boot();
    expect(document.querySelectorAll('#log tbody tr').length).toBe(20);
    expect($('#log-count').textContent).toBe('the newest 20 of 100');
    $<HTMLButtonElement>('#log-more').click();
    expect(document.querySelectorAll('#log tbody tr').length).toBe(100);
  });
});

describe('the admin page: the actions ask first', () => {
  it('Hide: a modal, Cancel sends nothing; confirmed it posts with X-WC and the note, then reloads', async () => {
    await boot();
    const second = cards()[1] as HTMLElement;
    buttonIn(second, 'Hide').click();
    expect(modal()?.querySelector('h3')?.textContent).toBe('Hide “Orc raid”?');
    expect(modal()?.textContent).toContain('Its 3 open reports are marked handled');
    buttonIn(modal() as HTMLElement, 'Cancel').click();
    expect(modal()).toBeNull();
    expect(posts()).toEqual([]);

    buttonIn(second, 'Hide').click();
    type(modal()?.querySelector('input[name=note]') as HTMLInputElement, '  while I ask  ');
    calls = [];
    buttonIn(modal() as HTMLElement, 'Hide run').click();
    await settle();
    expect(posts()).toEqual([
      {
        path: '/api/admin/pub/Vt8Ky2Qa4mRc',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-wc': '1' },
        body: { action: 'hide', note: 'while I ask' },
      },
    ]);
    expect(modal()).toBeNull();
    expect($('#mod-status').textContent).toBe('Hidden: Orc raid');
    // Reloaded after the action.
    expect(calls.filter((c) => c.path === '/api/admin/reports').length).toBe(1);
    expect(calls.filter((c) => c.path === '/api/admin/log').length).toBe(1);
  });

  it('Restore sends restore and Dismiss reports dismiss (review fix CR6), without a note when none is given', async () => {
    await boot();
    buttonIn(cards()[0] as HTMLElement, 'Restore').click();
    expect(modal()?.querySelector('h3')?.textContent).toBe(`Show “${HOSTILE}” again?`);
    buttonIn(modal() as HTMLElement, 'Restore run').click();
    await settle();
    buttonIn(cards()[1] as HTMLElement, 'Dismiss reports').click();
    buttonIn(modal() as HTMLElement, 'Dismiss reports').click();
    await settle();
    expect(posts().map((c) => [c.path, c.body])).toEqual([
      ['/api/admin/pub/Zp6Wd3Fg5uNa', { action: 'restore' }],
      ['/api/admin/pub/Vt8Ky2Qa4mRc', { action: 'dismiss' }],
    ]);
  });

  it('review fixes: the card says why a run is hidden; Dismiss on a hidden run keeps it hidden', async () => {
    reports.items.push({ ...reports.items[0]!, target: 'Qw2Er4Ty6Ui8', title: 'By hand', hiddenReason: 'admin' });
    reports.items.push({ ...reports.items[0]!, target: 'Mn3Bv5Cx7Zl9', title: 'Older', hiddenReason: undefined as never });
    await boot();
    expect(cards().map((c) => c.querySelector('.rq-state')?.textContent)).toEqual(['Hidden after 5 reports', 'shown', 'Hidden by the admin', 'hidden']);
    buttonIn(cards()[2] as HTMLElement, 'Dismiss reports').click();
    expect(modal()?.textContent).toContain('stays as it is, hidden');
    buttonIn(modal() as HTMLElement, 'Dismiss reports').click();
    await settle();
    expect(posts().map((c) => [c.path, c.body])).toEqual([['/api/admin/pub/Qw2Er4Ty6Ui8', { action: 'dismiss' }]]);
  });

  it('Delete a run wants its id typed exactly', async () => {
    await boot();
    buttonIn(cards()[0] as HTMLElement, 'Delete').click();
    const m = modal() as HTMLElement;
    expect(m.textContent).toContain('1.9 MB');
    expect(m.textContent).toContain('cannot be undone');
    const ok = buttonIn(m, 'Delete run');
    expect(ok.disabled).toBe(true);
    const typed = m.querySelector('input[name=confirm]') as HTMLInputElement;
    type(typed, 'zp6wd3fg5una');
    expect(ok.disabled).toBe(true);
    ok.click();
    await settle();
    expect(posts()).toEqual([]);
    type(typed, 'Zp6Wd3Fg5uNa');
    expect(ok.disabled).toBe(false);
    ok.click();
    await settle();
    expect(posts().map((c) => [c.path, c.body])).toEqual([['/api/admin/pub/Zp6Wd3Fg5uNa', { action: 'delete' }]]);
  });

  it('Suspend the sender from the queue', async () => {
    await boot();
    buttonIn(cards()[1] as HTMLElement, 'Suspend <b>marrow</b>').click();
    expect(modal()?.querySelector('h3')?.textContent).toBe('Suspend <b>marrow</b>?');
    buttonIn(modal() as HTMLElement, 'Suspend account').click();
    await settle();
    expect(posts().map((c) => [c.path, c.body, c.headers['x-wc']])).toEqual([['/api/admin/account/%3Cb%3Emarrow%3C%2Fb%3E', { action: 'suspend' }, '1']]);
  });

  it('an account by name: Delete wants the name typed (any case) and sends it as confirm', async () => {
    reports = { items: [], pubs: { count: 0, bytes: 0, today: 0 } };
    await boot();
    $<HTMLInputElement>('#acct-name').value = 'Grimbeorn';
    $<HTMLSelectElement>('#acct-action').value = 'delete';
    $<HTMLFormElement>('#acct').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const m = modal() as HTMLElement;
    expect(m.querySelector('h3')?.textContent).toBe('Delete the account Grimbeorn?');
    const ok = buttonIn(m, 'Delete account');
    expect(ok.disabled).toBe(true);
    type(m.querySelector('input[name=confirm]') as HTMLInputElement, 'grimbeorn');
    expect(ok.disabled).toBe(false);
    ok.click();
    await settle();
    expect(posts().map((c) => [c.path, c.body])).toEqual([['/api/admin/account/Grimbeorn', { action: 'delete', confirm: 'grimbeorn' }]]);
    expect($('#mod-status').textContent).toBe('Deleted the account Grimbeorn');
  });

  it('an account by name: Restore needs no typing; an empty name asks for one', async () => {
    await boot();
    $<HTMLFormElement>('#acct').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    expect(modal()).toBeNull();
    expect($('#mod-status').textContent).toBe('Type an account name first.');
    $<HTMLInputElement>('#acct-name').value = 'brego';
    $<HTMLSelectElement>('#acct-action').value = 'restore';
    $<HTMLFormElement>('#acct').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    buttonIn(modal() as HTMLElement, 'Restore account').click();
    await settle();
    expect(posts().map((c) => [c.path, c.body])).toEqual([['/api/admin/account/brego', { action: 'restore' }]]);
  });

  it('a refused action keeps the modal open with the reason as text; Escape closes it', async () => {
    await boot();
    writes = [{ status: 404, body: { error: 'not_found' } }];
    $<HTMLInputElement>('#acct-name').value = 'nobody';
    $<HTMLFormElement>('#acct').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    const m = modal() as HTMLElement;
    buttonIn(m, 'Suspend account').click();
    await settle();
    expect(modal()).toBe(m);
    expect(m.querySelector('.modal-err')?.textContent).toBe('Could not do it: no such run or account (404 not_found)');
    expect(buttonIn(m, 'Suspend account').disabled).toBe(false);
    m.querySelector('input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal()).toBeNull();
  });
});
