// @vitest-environment happy-dom
// The admin page's Log view (stage 66 C1, ADR 0157): newest first, the kind
// filter and the target search, Older pages, the chain's badge in each
// state, entries from before stage 66 marked "not sealed", hostile notes
// and targets as text.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { $, HOSTILE, boot, buttonIn, cells, choose, debounce, entry, gets, json, logPage, noMarkup, route, settle, setup, teardown, type, view } from './admin-page-harness.ts';

beforeEach(setup);
afterEach(teardown);

const lastLog = (): string => gets().filter((p) => p.startsWith('/api/admin/log')).at(-1) ?? '';

describe('the admin page: the audit log', () => {
  it('rows newest first with kind, action, target, note and by; accounts link; hostile text stays text', async () => {
    route('GET', '/api/admin/log', json(logPage([
      entry(5, { action: 'account.delete', target: HOSTILE, note: `test accounts ${HOSTILE}` }),
      entry(4, { action: 'account.limits', target: 'moria-runner', note: 'runBytes 50 MB → 200 MB' }),
      entry(3, { action: 'flag.on', target: 'gallery' }),
      entry(2, { action: 'note.hide', target: '9fA2Lw0q', note: 'Real name' }),
      entry(1, { action: 'pub.hide', target: '3mQ0aZ1x', note: '', by: '', sealed: false }),
    ], { total: 57, chain: { state: 'intact', sealed: 56, unsealed: 1, brokenAt: null, broken: [], brokenCount: 0, head: 'q3Zt8pLm09wE' } })));
    await boot('#log');
    expect(gets()).toContain('/api/admin/log');
    const t = $('table.audit', view());
    expect(cells(t)).toEqual([
      ['2026-11-16 13:55', 'Account', 'account.delete', HOSTILE, `test accounts ${HOSTILE}`, 'aX3f9k2Q'],
      ['2026-11-16 13:56', 'Limits', 'account.limits', 'moria-runner', 'runBytes 50 MB → 200 MB', 'aX3f9k2Q'],
      ['2026-11-16 13:57', 'Flag', 'flag.on', 'gallery', '', 'aX3f9k2Q'],
      ['2026-11-16 13:58', 'Moderation', 'note.hide', 'note 9fA2Lw0q', 'Real name', 'aX3f9k2Q'],
      ['2026-11-16 13:59', 'Moderation', 'pub.hide', 'run 3mQ0aZ1x', 'not sealed', '—'],
    ]);
    const links = Array.from(t.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      [HOSTILE, '#account/%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E'],
      ['moria-runner', '#account/moria-runner'],
    ]);
    const rows = Array.from(t.querySelectorAll('tbody tr'));
    expect(rows.map((r) => r.classList.contains('old'))).toEqual([false, false, false, false, true]);
    expect($('.tag.old', rows[4] as HTMLElement).textContent).toBe('not sealed');
    // The badge: intact, the counts, the head.
    const badge = $('.seal', view());
    expect(badge.className).toBe('seal ok');
    expect(badge.textContent).toBe('Sealed and intact · 56 sealed entries · 1 not sealed (before stage 66) · newest seal q3Zt8pLm09wE');
    expect($('.pager', view()).textContent).toContain('1–5 of 57');
    expect(buttonIn(view(), 'Older').hidden).toBe(true);
    noMarkup();
  });

  it('a broken chain: the badge turns red and names every entry that does not match (S3)', async () => {
    route('GET', '/api/admin/log', json(logPage([entry(3)], { chain: { state: 'broken', sealed: 40, unsealed: 0, brokenAt: 17, broken: [17, 23], brokenCount: 2, head: `ab${HOSTILE}` } })));
    await boot('#log');
    const badge = $('.seal', view());
    expect(badge.className).toBe('seal bad');
    expect(badge.textContent).toBe(`Broken: 2 entries do not match (#17, #23) · 40 sealed entries · newest seal ab${HOSTILE}`);
    expect($('code', badge).textContent).toBe(`ab${HOSTILE}`);
    noMarkup();
  });

  it('more broken entries than listed: the count and an ellipsis', async () => {
    const broken = Array.from({ length: 20 }, (_, i) => i + 1);
    route('GET', '/api/admin/log', json(logPage([entry(3)], { chain: { state: 'broken', sealed: 0, unsealed: 0, brokenAt: 1, broken, brokenCount: 31, head: '' } })));
    await boot('#log');
    expect($('.seal', view()).textContent).toBe(`Broken: 31 entries do not match (${broken.map((i) => `#${i}`).join(', ')}, …) · 0 sealed entries`);
  });

  it('S2: an unkeyed chain is shown red, not as intact', async () => {
    route('GET', '/api/admin/log', json(logPage([entry(3)], { chain: { state: 'unkeyed', sealed: 4, unsealed: 0, brokenAt: null, broken: [], brokenCount: 0, head: 'q3Zt8pLm09wE' } })));
    await boot('#log');
    const badge = $('.seal', view());
    expect(badge.className).toBe('seal bad');
    expect(badge.textContent).toMatch(/^Not keyed: the Worker has no AUTH_PEPPER/);
  });

  it('Older asks with before=next and adds the rows; the end hides it', async () => {
    route('GET', '/api/admin/log', (c) =>
      c.path.includes('before=101')
        ? json(logPage([entry(101), entry(100)], { next: null, total: 102 }))
        : json(logPage(Array.from({ length: 100 }, (_, i) => entry(i + 1)), { next: 101, total: 102 })),
    );
    await boot('#log');
    expect(cells($('table.audit', view())).length).toBe(100);
    const older = buttonIn(view(), 'Older');
    expect(older.hidden).toBe(false);
    older.click();
    await settle();
    expect(lastLog()).toBe('/api/admin/log?before=101');
    expect(cells($('table.audit', view())).length).toBe(102);
    expect($('.pager', view()).textContent).toContain('1–102 of 102');
    expect(older.hidden).toBe(true);
  });

  it('the kind filter and the target search start again from the newest', async () => {
    route('GET', '/api/admin/log', (c) => json(logPage(c.path.includes('q=') ? [] : [entry(1)], { next: c.path.includes('q=') ? null : 9 })));
    await boot('#log');
    choose($<HTMLSelectElement>('select[name=kind]', view()), 'accounts');
    await settle();
    expect(lastLog()).toBe('/api/admin/log?kind=accounts');
    buttonIn(view(), 'Older').click();
    await settle();
    expect(lastLog()).toBe('/api/admin/log?before=9&kind=accounts');
    type($<HTMLInputElement>('input[name=q]', view()), ' moria & co ');
    await debounce();
    expect(lastLog()).toBe('/api/admin/log?kind=accounts&q=moria%20%26%20co');
    expect(cells($('table.audit', view()))).toEqual([['No entry matches.']]);
    expect(Array.from(document.querySelectorAll('select[name=kind] option')).map((o) => (o as HTMLOptionElement).value)).toEqual(['', 'moderation', 'accounts', 'limits', 'flags']);
  });

  it('a failed read says so in place', async () => {
    route('GET', '/api/admin/log', { status: 503, body: { error: 'unavailable' } });
    await boot('#log');
    expect($('.err', view()).textContent).toBe('Could not read the log: the database is unavailable (503 unavailable)');
  });
});
