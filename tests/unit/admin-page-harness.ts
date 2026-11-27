// The admin page's unit harness (stage 66 C1): boots ADMIN_HTML and
// ADMIN_JS in happy-dom against a faked fetch that records every call and
// answers from a table the test fills. Used by tests/unit/admin-page-*.test.ts.
import { vi } from 'vitest';
import type { AccountLimits, AdminAccountDetail, AdminAccountRow, AdminAccounts, AdminLimits, AdminLogPage, AdminLogRow, AdminReports, AdminStats } from '../../shared/cloud/api.ts';
import { DEFAULT_ACCOUNT_LIMITS } from '../../shared/cloud/api.ts';
import { ADMIN_HTML, ADMIN_JS } from '../../worker/admin/page.ts';

export const HOSTILE = '<img src=x onerror=alert(1)>';
export const NOW = Date.UTC(2026, 10, 16, 14, 0);
export const MB = 1024 * 1024;

export interface Call {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Answer = { status: number; body?: unknown };
type Handler = (call: Call) => Answer;

export const state = {
  calls: [] as Call[],
  /** path (exact, or a prefix ending in '*') + method → answer. */
  routes: new Map<string, Handler>(),
  /** The next fetch's answer waits until its release is called (a slow answer). */
  holdNext: false,
  held: [] as Array<() => void>,
};

/** Holds the next fetch's answer; returns what lets it arrive. */
export function holdNext(): () => Promise<void> {
  state.holdNext = true;
  const at = state.held.length;
  return async () => {
    state.held[at]?.();
    await settle();
  };
}

export const json = (body: unknown, status = 200): Answer => ({ status, body });

export function route(method: string, path: string, answer: Answer | Handler): void {
  state.routes.set(`${method} ${path}`, typeof answer === 'function' ? answer : () => answer);
}

function find(method: string, path: string): Handler | undefined {
  const exact = state.routes.get(`${method} ${path}`);
  if (exact) return exact;
  const bare = path.split('?')[0] as string;
  for (const [key, h] of state.routes) {
    const [m, p] = key.split(' ') as [string, string];
    if (m !== method) continue;
    if (p.endsWith('*') && path.startsWith(p.slice(0, -1))) return h;
    if (p === bare) return h;
  }
  return undefined;
}

async function fakeFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = init.method ?? 'GET';
  const headers = Object.fromEntries(Array.from(new Headers(init.headers).entries(), ([k, v]) => [k.toLowerCase(), v]));
  const call = { path: input, method, headers, body: init.body ? JSON.parse(String(init.body)) : undefined };
  state.calls.push(call);
  const h = find(method, input);
  const a = h ? h(call) : method === 'GET' ? { status: 404, body: { error: 'not_found' } } : { status: 204 };
  const res = a.status === 204 ? new Response(null, { status: 204 }) : new Response(JSON.stringify(a.body ?? {}), { status: a.status, headers: { 'Content-Type': 'application/json' } });
  if (!state.holdNext) return res;
  state.holdNext = false;
  return new Promise((resolve) => state.held.push(() => resolve(res)));
}

export async function settle(): Promise<void> {
  for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
}
/** Past a search box's 300 ms wait. */
export async function debounce(): Promise<void> {
  await new Promise((r) => setTimeout(r, 330));
  await settle();
}

export function setup(): void {
  vi.useFakeTimers({ toFake: ['setInterval', 'Date'], now: NOW });
  state.calls = [];
  state.routes = new Map();
  state.holdNext = false;
  state.held = [];
  history.replaceState(null, '', '/admin');
  route('GET', '/api/admin/stats', json(stats()));
  route('GET', '/api/admin/reports', json(emptyReports()));
  route('GET', '/api/admin/log', json(logPage([])));
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
}

export function teardown(): void {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  document.querySelectorAll('.modal-veil').forEach((n) => n.remove());
}

export async function boot(hash = ''): Promise<void> {
  history.replaceState(null, '', `/admin${hash}`);
  // happy-dom fires hashchange on replaceState (a browser does not): let it pass first.
  await settle();
  const doc = new DOMParser().parseFromString(ADMIN_HTML, 'text/html');
  document.body.replaceChildren(...Array.from(doc.body.childNodes).map((n) => document.importNode(n, true)));
  new Function(ADMIN_JS)();
  await settle();
}

/** Goes to a hash as a click on a link would. */
export async function go(hash: string): Promise<void> {
  location.hash = hash;
  await settle();
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T => {
  const e = root.querySelector<T>(sel);
  if (!e) throw new Error(`no ${sel}`);
  return e;
};
export const view = (): HTMLElement => $('#view .view');
export const buttonIn = (root: ParentNode, text: string): HTMLButtonElement => {
  const b = Array.from(root.querySelectorAll('button')).find((x) => x.textContent === text);
  if (!b) throw new Error(`no button ${text}`);
  return b;
};
export const modal = (): HTMLElement | null => document.querySelector('.modal');
export const writes = (): Call[] => state.calls.filter((c) => c.method !== 'GET');
export const gets = (): string[] => state.calls.filter((c) => c.method === 'GET').map((c) => c.path);
export function type(input: HTMLInputElement, text: string, event = 'input'): void {
  input.value = text;
  input.dispatchEvent(new Event(event, { bubbles: true }));
}
export function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}
export const cells = (table: Element): string[][] =>
  Array.from(table.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.children).map((td) => td.textContent ?? ''));
/** No markup from the API anywhere in the page. */
export function noMarkup(): void {
  if (document.querySelector('img, script:not([src]), iframe')) throw new Error('markup from the API was parsed');
}

// --- Fixtures ---

export function stats(): AdminStats {
  return {
    now: NOW,
    online: { total: 3, menu: 1, playing: 2, replay: 0 },
    today: { day: '2026-11-16', devices: 9, newDevices: 2, peakOnline: 4, peakPlaying: 3, playMinutes: 120, beats: 300 },
    weekly: 20,
    monthly: 41,
    days: [],
    split: null,
    usage: { requests: 1200, rowsWritten: 300, rowsRead: 9000, limits: { requests: 100000, rowsWritten: 100000, rowsRead: 5000000 } },
    flags: {
      stats: { value: true, default: true, override: null },
      gallery: { value: false, default: false, override: false },
    },
  } as unknown as AdminStats;
}

export const emptyReports = (): AdminReports => ({ items: [], pubs: { count: 0, bytes: 0, today: 0 } });

export function row(over: Partial<AdminAccountRow> = {}): AdminAccountRow {
  return {
    name: 'moria-runner',
    created: Date.UTC(2026, 10, 15, 9),
    lastSeen: NOW - 3 * 3600_000,
    state: 'active',
    items: 204,
    itemBytes: 0.7 * MB,
    runs: 27,
    runBytes: 172 * MB,
    pubs: 15,
    pubBytes: 6_600_000,
    lookImages: 0,
    lookBytes: 0,
    bytes: 0.7 * MB + 172 * MB + 6_600_000,
    sessions: 2,
    ownLimits: false,
    ...over,
  };
}

export function accounts(list: AdminAccountRow[], over: Partial<AdminAccounts> = {}): AdminAccounts {
  return { total: list.length, page: 1, pageSize: 50, accounts: list, totals: { accounts: list.length, bytes: list.reduce((n, a) => n + a.bytes, 0) }, ...over };
}

export const BUILT_IN: AccountLimits = { ...DEFAULT_ACCOUNT_LIMITS };

export function limits(defaults: Partial<AccountLimits> = {}): AdminLimits {
  return { builtIn: { ...BUILT_IN }, defaults: { ...BUILT_IN, ...defaults } };
}

export function detail(over: { account?: Partial<AdminAccountRow>; own?: Partial<AccountLimits>; defaults?: Partial<AccountLimits>; log?: AdminLogRow[] } = {}): AdminAccountDetail {
  const l = limits(over.defaults);
  const own = over.own ?? {};
  return {
    account: row({ ownLimits: Object.keys(own).length > 0, ...over.account }),
    limits: { ...l, own, effective: { ...l.defaults, ...own } },
    sessions: { count: 2, lastUsed: NOW - 3 * 3600_000 },
    community: { listed: 9, votes: 41, comments: 12, notes: 3, reportsMade: 1, reportsOpen: 0 },
    log: over.log ?? [],
  };
}

export function entry(id: number, over: Partial<AdminLogRow> = {}): AdminLogRow {
  return { id, ts: NOW - id * 60_000, action: 'account.suspend', target: 'loud_orc', note: '', by: 'aX3f9k2Q', sealed: true, ...over };
}

export function logPage(entries: AdminLogRow[], over: Partial<AdminLogPage> = {}): AdminLogPage {
  return {
    entries,
    next: null,
    total: entries.length,
    chain: { state: 'intact', sealed: entries.length, unsealed: 0, brokenAt: null, broken: [], brokenCount: 0, head: 'q3Zt8pLm09wE' },
    ...over,
  };
}
