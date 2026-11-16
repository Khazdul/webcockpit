// @vitest-environment happy-dom
// The admin page's shell (stage 66 C1, ADR 0157, the owner's pick 1b): the
// side bar's groups and links, the views by the hash (reload, Back and
// Forward), the header's online count, the Reports view's figures on top,
// and the minute's reload only while Reports is open.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminReports } from '../../shared/cloud/api.ts';
import { ADMIN_CSS, ADMIN_JS, ADMIN_JS_MODULES } from '../../worker/admin/page.ts';
import { $, HOSTILE, NOW, accounts, boot, gets, go, json, logPage, route, settle, setup, state, teardown, view } from './admin-page-harness.ts';

beforeEach(setup);
afterEach(teardown);

const navText = (): Array<[string, string]> =>
  Array.from(document.querySelectorAll('#nav > *')).map((n) => [n.tagName === 'A' ? (n as HTMLAnchorElement).getAttribute('href') ?? '' : 'group', n.textContent?.trim() ?? '']);
const on = (): string[] => Array.from(document.querySelectorAll('#nav a.on')).map((a) => a.getAttribute('href') ?? '');

describe('the admin page: the shell', () => {
  it('the side bar: three groups, the links in order, Reports with the open count', async () => {
    const reports: AdminReports = {
      items: [
        { kind: 'run', target: 'Zp6Wd3Fg5uNa', title: HOSTILE, sender: 'x', state: 'active', reasons: { harassment: 2, other: 1 }, reporters: 3, newest: NOW },
      ],
      pubs: { count: 1, bytes: 1, today: 0 },
    };
    route('GET', '/api/admin/reports', json(reports));
    await boot();
    expect(navText()).toEqual([
      ['group', 'Look after'],
      ['#reports', 'Reports 3'],
      ['#accounts', 'Accounts'],
      ['#log', 'Log'],
      ['group', 'Numbers'],
      ['#use', 'Use'],
      ['#storage', 'Storage'],
      ['#sharing', 'Sharing'],
      ['group', 'Site'],
      ['#flags', 'Flags and limits'],
    ]);
    expect($('#nav-count').textContent).toBe('3');
    expect(on()).toEqual(['#reports']);
    expect($('#nav a.on').getAttribute('aria-current')).toBe('page');
    // The header: the environment and online now.
    expect($('#env').textContent).toBe('local');
    expect($('#online-now').textContent).toBe('3 online');
    expect(document.title).toBe('WebCockpit admin · Reports');
  });

  it('no open reports: the count is empty', async () => {
    await boot();
    expect($('#nav-count').textContent).toBe('');
  });

  it('Reports is the default view: today and the estimate on top, the queue under them', async () => {
    await boot();
    expect($('#v-reports').hidden).toBe(false);
    expect($('#view').hidden).toBe(true);
    expect(Array.from(document.querySelectorAll('#online dd, #today dd, #unique dd')).map((d) => d.textContent)).toEqual(['3', '1', '2', '0', '9', '2', '4', '3', '120', '300', '20', '41']);
    expect($('#today-day').textContent).toBe('2026-11-16');
    expect(Array.from(document.querySelectorAll('#usage tbody tr')).map((r) => r.firstChild?.textContent)).toEqual(['Worker requests', 'D1 rows written', 'D1 rows read']);
    expect($('#queue').textContent).toBe('No open reports.');
    // An unknown view falls back to Reports.
    await go('#nonsense');
    expect(on()).toEqual(['#reports']);
  });

  it('every view by its hash; reload keeps it; Back and Forward work; the account view lights Accounts', async () => {
    route('GET', '/api/admin/accounts', json(accounts([])));
    route('GET', '/api/admin/limits', { status: 503, body: { error: 'unavailable' } });
    await boot('#log');
    expect(on()).toEqual(['#log']);
    expect($('#v-reports').hidden).toBe(true);
    expect(view().dataset.view).toBe('log');
    expect(document.title).toBe('WebCockpit admin · Log');

    for (const [hash, name] of [['#accounts', 'accounts'], ['#use', 'use'], ['#storage', 'storage'], ['#sharing', 'sharing'], ['#flags', 'flags']] as const) {
      await go(hash);
      expect(view().dataset.view, hash).toBe(name);
      expect(on(), hash).toEqual([hash]);
    }
    await go('#account/' + encodeURIComponent(HOSTILE));
    expect(view().dataset.view).toBe('account');
    expect(on()).toEqual(['#accounts']);
    expect(gets()).toContain('/api/admin/account/%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');

    history.back();
    await settle();
    expect(view().dataset.view).toBe('flags');
    history.back();
    await settle();
    expect(view().dataset.view).toBe('sharing');
    history.forward();
    await settle();
    expect(view().dataset.view).toBe('flags');

    // A reload (a new boot at the same address) opens the same view.
    await boot('#flags');
    expect(view().dataset.view).toBe('flags');
    expect(on()).toEqual(['#flags']);
  });

  it('the minute reloads the numbers and the queue only while Reports is open', async () => {
    route('GET', '/api/admin/accounts', json(accounts([])));
    await boot('#accounts');
    // Once at the start, for the header and the side bar's count.
    expect(gets().filter((p) => p === '/api/admin/reports').length).toBe(1);
    state.calls = [];
    vi.advanceTimersByTime(60_000);
    await settle();
    expect(gets()).toEqual([]);
    await go('#reports');
    expect(gets().sort()).toEqual(['/api/admin/log', '/api/admin/reports', '/api/admin/stats']);
    state.calls = [];
    vi.advanceTimersByTime(60_000);
    await settle();
    expect(gets().sort()).toEqual(['/api/admin/log', '/api/admin/reports', '/api/admin/stats']);
  });

  it('a failing read of the numbers says so in the side bar', async () => {
    route('GET', '/api/admin/stats', { status: 500, body: {} });
    await boot();
    expect($('#status').textContent).toBe('Could not read the numbers: HTTP 500');
  });

  it('the Reports view links to the whole log', async () => {
    route('GET', '/api/admin/log', json(logPage([])));
    await boot();
    expect(Array.from(document.querySelectorAll('#v-reports a')).some((a) => a.getAttribute('href') === '#log')).toBe(true);
  });
});

describe('the admin page: the modules', () => {
  it('no module has an HTML sink, eval or a timer from a string', () => {
    for (const [name, js] of Object.entries(ADMIN_JS_MODULES)) {
      expect(js, name).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|setTimeout\(['"`]|setInterval\(['"`]/);
      expect(ADMIN_JS, name).toContain(js);
    }
    expect(ADMIN_JS.match(/^\(function \(\) \{$/gm)?.length).toBe(1);
    expect(ADMIN_JS.trimEnd().endsWith('})();')).toBe(true);
    expect(ADMIN_CSS).toContain('@media (max-width: 900px)');
    expect(ADMIN_CSS).toContain('prefers-color-scheme: dark');
  });
});
