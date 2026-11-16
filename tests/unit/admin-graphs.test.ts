// @vitest-environment happy-dom
// The admin page's graph views (worker/admin/graphs.ts, stage 66 C2, ADR
// 0157): Use, Storage and Sharing drawn from a faked `GET
// /api/admin/graphs`. The shell's helpers are defined here as the page
// defines them, so the module runs as it does inside the page's IIFE.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AdminGraphDay, AdminGraphs } from '../../shared/cloud/api.ts';
import { ADMIN_GRAPHS_CSS, ADMIN_GRAPHS_JS } from '../../worker/admin/graphs.ts';

const HOSTILE = '<img src=x onerror=alert(1)>';
const NOW = Date.UTC(2026, 10, 16, 14, 2);
const DAY = 86_400_000;

interface View {
  title: string;
  group: string;
  render(root: HTMLElement, params: string): void;
}

let views: Record<string, View>;
let calls: string[];
let answer: (path: string) => unknown;

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 30 days, the last today (not final); storage only on the last 5 days, votes missing on one day. */
function fixture(): AdminGraphs {
  const days: AdminGraphDay[] = [];
  for (let i = 29; i >= 0; i--) {
    const k = 29 - i;
    const m: AdminGraphDay['m'] = {
      devices: 20 + k,
      devices_7d: 60 + k,
      devices_30d: 120 + k,
      new_devices: 3 + (k % 4),
      new_accounts: k % 3,
      play_minutes: 1000 + 10 * k,
      pubs_new: 3,
      listed_new: 1,
      votes: 7,
      comments: 2,
      notes: 1,
      reports: k % 5 === 0 ? 1 : 0,
      views: 40,
    };
    if (i < 5) Object.assign(m, { item_bytes: 9_800_000, run_bytes: 94_000_000, pub_bytes: 22_300_000, accounts: 12 });
    if (k === 10) delete m.votes;
    days.push({ day: iso(NOW - i * DAY), final: i !== 0, m });
  }
  const online = [];
  for (let h = 0; h < 30 * 24; h++) {
    if (h >= 100 && h < 110) continue; // a gap
    online.push({ ts: NOW - (720 - h) * 3_600_000, online: 3 + (h % 9), playing: 1 + (h % 5) });
  }
  return {
    range: '30d',
    now: NOW,
    bucketMinutes: 60,
    online,
    days,
    split: {
      type: { desktop: 71, phone: 22, tablet: 7 },
      browser: { chrome: 46, firefox: 31, safari: 17, [HOSTILE]: 6 },
      version: { '0.14.0': 64, '0.13.0': 24, '0.12.0': 9, '0.11.0': 1, '0.10.0': 1, '0.9.0': 1, '0.8.0': 1, '0.7.0': 1 },
    },
    storage: { accounts: 12, itemBytes: 9_800_000, runBytes: 94_000_000, pubBytes: 22_300_000 },
    largest: [
      { name: HOSTILE, itemBytes: 4_100_000, runBytes: 31_000_000, pubBytes: 6_100_000 },
      { name: 'moria-runner', itemBytes: 2_200_000, runBytes: 24_200_000, pubBytes: 0 },
    ],
    sharing: { pubs: 40, listed: 23, hidden: 1, votes: 312, comments: 87, notes: 19, openReports: 2 },
  };
}

function empty(): AdminGraphs {
  return {
    range: '30d',
    now: NOW,
    bucketMinutes: 60,
    online: [],
    days: [],
    split: { type: {}, browser: {}, version: {} },
    storage: { accounts: 0, itemBytes: 0, runBytes: 0, pubBytes: 0 },
    largest: [],
    sharing: { pubs: 0, listed: 0, hidden: 0, votes: 0, comments: 0, notes: 0, openReports: 0 },
  };
}

function boot(): void {
  views = {};
  calls = [];
  const el = (tag: string, text?: unknown, cls?: string) => {
    const e = document.createElement(tag);
    if (text !== undefined && text !== null) e.textContent = String(text);
    if (cls) e.className = cls;
    return e;
  };
  const svg = (tag: string, attrs?: Record<string, unknown>) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs ?? {}) e.setAttribute(k, String(attrs![k]));
    return e;
  };
  const fmt = (n: number) => Number(n).toLocaleString('en-GB');
  const size = (n: number) =>
    n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n >= 1e3 ? Math.round(n / 1e3) + ' KB' : n + ' B';
  const utc = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16);
  const api = (path: string) => {
    calls.push(path);
    try {
      return Promise.resolve(answer(path));
    } catch (e) {
      return Promise.reject(e);
    }
  };
  const registerView = (name: string, view: View) => {
    views[name] = view;
  };
  new Function('el', 'svg', 'fmt', 'size', 'utc', 'api', 'registerView', ADMIN_GRAPHS_JS)(el, svg, fmt, size, utc, api, registerView);
}

async function show(name: string, params = ''): Promise<HTMLElement> {
  const root = document.createElement('div');
  document.body.append(root);
  views[name]!.render(root, params);
  await flush();
  return root;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function card(root: HTMLElement, id: string): HTMLElement {
  const c = root.querySelector<HTMLElement>(`[data-graph="${id}"]`);
  expect(c, id).not.toBeNull();
  return c!;
}

function open(root: HTMLElement, id: string): HTMLElement {
  const c = card(root, id);
  c.querySelector<HTMLButtonElement>('.gr-open')!.click();
  expect(c.classList.contains('is-open')).toBe(true);
  return c;
}

function tableOf(c: HTMLElement): string[][] {
  const btn = c.querySelector<HTMLButtonElement>('.gr-tbtn')!;
  btn.click();
  expect(btn.getAttribute('aria-pressed')).toBe('true');
  return [...c.querySelectorAll('tr')].map((tr) => [...tr.children].map((td) => td.textContent ?? ''));
}

beforeEach(() => {
  document.body.replaceChildren();
  history.replaceState(null, '', '/admin');
  answer = () => fixture();
  boot();
});
afterEach(() => {
  document.body.replaceChildren();
});

describe('the module', () => {
  it('registers Use, Storage and Sharing in the numbers group', () => {
    expect(Object.keys(views).sort()).toEqual(['sharing', 'storage', 'use']);
    for (const v of Object.values(views)) expect(v.group).toBe('numbers');
  });

  it('never parses markup or sets a style attribute', () => {
    for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', "setAttribute('style'", 'setAttribute("style"', 'eval(']) {
      expect(ADMIN_GRAPHS_JS).not.toContain(bad);
    }
    expect(ADMIN_GRAPHS_JS).not.toContain('\\');
  });

  it('defines the series colours for light and dark', () => {
    expect(ADMIN_GRAPHS_CSS).toContain('--gr1: #2a78d6; --gr2: #eb6834; --gr3: #1baf7a');
    expect(ADMIN_GRAPHS_CSS).toMatch(/prefers-color-scheme: dark\) \{ :root \{ --gr1: #3987e5; --gr2: #d95926; --gr3: #199e70/);
  });
});

describe('Use', () => {
  it('reads the graphs once for the default range and draws every card', async () => {
    const root = await show('use');
    expect(calls).toEqual(['/api/admin/graphs?range=30d']);
    for (const id of ['online', 'devices', 'devices-wm', 'new', 'play', 'types', 'browsers', 'versions']) card(root, id);
    expect(root.querySelector('[data-range="30d"]')!.getAttribute('aria-pressed')).toBe('true');
    // Lines are paths with the series classes; bars are bar paths.
    expect(card(root, 'online').querySelectorAll('path.gr-line').length).toBe(2);
    expect(card(root, 'new').querySelectorAll('path.gr-barp').length).toBeGreaterThan(0);
    // The big figure: the newest whole day, today so far beside it.
    expect(card(root, 'devices').querySelector('.gr-big')!.textContent).toMatch(/^48.*today so far 49$/);
    // Splits as shares; the eight versions fold into six and Other.
    const versions = card(root, 'versions');
    expect(versions.querySelectorAll('.gr-hb-k').length).toBe(7);
    expect(versions.textContent).toContain('Other');
  });

  it('takes the range from the hash and changes it with one call', async () => {
    const root = await show('use', '90d');
    expect(calls).toEqual(['/api/admin/graphs?range=90d']);
    (root.querySelector('[data-range="7d"]') as HTMLButtonElement).click();
    await flush();
    expect(calls).toEqual(['/api/admin/graphs?range=90d', '/api/admin/graphs?range=7d']);
    expect(location.hash).toBe('#use/7d');
    expect(root.querySelector('[data-range="7d"]')!.getAttribute('aria-pressed')).toBe('true');
    (root.querySelector('.gr-reload') as HTMLButtonElement).click();
    await flush();
    expect(calls.at(-1)).toBe('/api/admin/graphs?range=7d');
    expect(calls.length).toBe(3);
  });

  it('falls back to 30 days for an unknown range', async () => {
    await show('use', 'bogus');
    expect(calls).toEqual(['/api/admin/graphs?range=30d']);
  });

  it('opens a card large with a legend, end labels, a crosshair moved by the keys, and a table', async () => {
    const root = await show('use');
    const c = open(root, 'online');
    expect(c.querySelectorAll('.gr-legend span').length).toBe(2);
    const labels = [...c.querySelectorAll('text.gr-dl')].map((t) => t.textContent);
    expect(labels).toHaveLength(2);
    expect(labels.some((l) => l!.startsWith('Online '))).toBe(true);
    const plot = c.querySelector<HTMLElement>('.gr-plot')!;
    const tip = c.querySelector<HTMLElement>('.gr-tip')!;
    expect(tip.hidden).toBe(true);
    plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(tip.hidden).toBe(false);
    const last = fixture().online.at(-1)!;
    expect(tip.textContent).toContain(`${last.online}Online`);
    expect(tip.textContent).toContain(`${last.playing}Playing`);
    plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(tip.textContent).toContain(new Date(fixture().online[0]!.ts).toISOString().slice(0, 10));
    expect(c.querySelector('.gr-cross')!.getAttribute('visibility')).toBe('visible');
    plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(tip.hidden).toBe(true);

    // Only one open card at a time.
    open(root, 'devices');
    expect(c.classList.contains('is-open')).toBe(false);
  });

  it('shows the same numbers as a table, today marked so far', async () => {
    const root = await show('use');
    const c = open(root, 'new');
    const rows = tableOf(c);
    expect(rows[0]).toEqual(['Day', 'New devices', 'New accounts']);
    const f = fixture();
    const today = f.days.at(-1)!;
    expect(rows[1]).toEqual([`${today.day}, so far`, String(today.m.new_devices), String(today.m.new_accounts)]);
    expect(rows).toHaveLength(31);
    expect(c.querySelector('svg')).toBeNull();
    // A table of a split: every key with its count.
    const b = open(root, 'browsers');
    const brows = tableOf(b);
    expect(brows[0]).toEqual(['Value', 'Devices', 'Share']);
    expect(brows.map((r) => r[0])).toContain(HOSTILE);
  });

  it('shows hostile split keys as text', async () => {
    const root = await show('use');
    expect(root.textContent).toContain(HOSTILE);
    expect(root.querySelector('img')).toBeNull();
  });

  it('draws a gap, not a zero, for a missing sample or metric', async () => {
    const root = await show('use');
    // The online line breaks over the ten missing hours: two subpaths per series.
    const d = card(root, 'online').querySelector('path.gr-line')!.getAttribute('d')!;
    expect(d.split('M').length - 1).toBe(2);
    const sharing = await show('sharing');
    const votes = open(sharing, 'votes');
    const rows = tableOf(votes);
    const missing = fixture().days[10]!.day;
    expect(rows.find((r) => r[0] === missing)).toEqual([missing, '–']);
  });

  it('says so before any roll-up', async () => {
    answer = () => empty();
    const root = await show('use');
    expect(root.querySelector('.gr-notice')!.textContent).toMatch(/No days rolled up yet/);
    expect(card(root, 'online').textContent).toContain('No samples in this range.');
    expect(card(root, 'devices').querySelector('svg')).toBeNull();
    expect(card(root, 'types').textContent).toContain('No devices in this range yet.');
    expect(card(root, 'devices').querySelector<HTMLElement>('.gr-open')!.hidden).toBe(true);
  });

  it('says when the call fails', async () => {
    answer = () => {
      throw new Error('forbidden');
    };
    const root = await show('use');
    expect(root.querySelector('.gr-status')!.textContent).toContain('forbidden');
  });
});

describe('Storage', () => {
  it('shows the figures, the stacked total with its history gap, and the largest accounts', async () => {
    const root = await show('storage');
    expect(root.querySelector('.gr-figs')!.textContent).toContain('126.1 MB');
    const total = card(root, 'storage');
    expect(total.querySelector('.gr-big')!.textContent).toMatch(/^126\.1 MB/);
    expect(total.textContent).toContain('History begins with stage 66');
    const rows = tableOf(open(root, 'storage'));
    expect(rows[0]).toEqual(['Day', 'Runs', 'Published', 'Small items', 'Total']);
    expect(rows[1]!.slice(1)).toEqual(['94.0 MB', '22.3 MB', '9.8 MB', '126.1 MB']);
    expect(rows.at(-1)!.slice(1)).toEqual(['–', '–', '–', '–']);

    const largest = card(root, 'largest');
    const links = [...largest.querySelectorAll('a')];
    expect(links[0]!.textContent).toBe(HOSTILE);
    expect(links[0]!.getAttribute('href')).toBe('#account/' + encodeURIComponent(HOSTILE));
    expect(links[1]!.getAttribute('href')).toBe('#account/moria-runner');
    expect(root.querySelector('img')).toBeNull();
    // Segments sized by CSSOM, not a style string from the API.
    const seg = largest.querySelector<HTMLElement>('.gr-seg i')!;
    expect(seg.style.width).toMatch(/%$/);
  });

  it('says that the storage history has not started', async () => {
    answer = () => empty();
    const root = await show('storage');
    expect(card(root, 'storage').textContent).toContain('No storage history yet');
    expect(card(root, 'largest').textContent).toContain('No accounts store anything yet.');
  });
});

describe('Sharing', () => {
  it('shows the figures and splits published runs into link and Hall of Fame', async () => {
    const root = await show('sharing');
    expect(root.querySelector('.gr-figs')!.textContent).toContain('In the Hall of Fame23');
    for (const id of ['published', 'votes', 'comments', 'reports', 'views']) card(root, id);
    const rows = tableOf(open(root, 'published'));
    expect(rows[0]).toEqual(['Day', 'Link', 'Hall of Fame', 'Total']);
    // pubs_new 3, listed_new 1: two by a link, one listed.
    expect(rows[2]!.slice(1)).toEqual(['2', '1', '3']);
  });
});
