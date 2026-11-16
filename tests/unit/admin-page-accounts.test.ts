// @vitest-environment happy-dom
// The admin page's Accounts view and one account (stage 66 C1, ADR 0157):
// the list's search, filter, sort (aria-sort) and pages; one account's
// bars, limits (human units, the checks, the warning under use, Save and
// Reset) and clean-up (End all sessions, Suspend / Restore, Delete with
// the name typed). Every name from the API is hostile: text only.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { $, HOSTILE, MB, NOW, accounts, boot, buttonIn, cells, choose, debounce, detail, entry, gets, go, json, modal, noMarkup, route, row, settle, setup, state, teardown, type, view, writes } from './admin-page-harness.ts';

beforeEach(setup);
afterEach(teardown);

const lastGet = (prefix: string): string => gets().filter((p) => p.startsWith(prefix)).at(-1) ?? '';

describe('the admin page: Accounts', () => {
  it('the table: names as text and links, tags, the totals line, aria-sort on the default sort', async () => {
    route('GET', '/api/admin/accounts', json(accounts([
      row({ name: HOSTILE, ownLimits: true }),
      row({ name: 'loud_orc', state: 'suspended', lastSeen: NOW - 2 * 86_400_000, bytes: 6_000_000 }),
      row({ name: 'nobody123', lastSeen: 0, items: 0, runs: 0, pubs: 0, bytes: 0, sessions: 0 }),
    ], { totals: { accounts: 12, bytes: 126_100_000 } })));
    await boot('#accounts');
    expect(gets()).toContain('/api/admin/accounts?state=all&sort=seen&dir=desc&page=1');
    const t = $('table.accounts', view());
    expect(Array.from(t.querySelectorAll('th')).map((th) => [th.textContent, th.getAttribute('aria-sort')])).toEqual([
      ['Name', 'none'], ['State', 'none'], ['Created', 'none'], ['Last seen ▾', 'descending'], ['Items', 'none'], ['Runs', 'none'], ['Published', 'none'], ['Bytes', 'none'], ['Sessions', null],
    ]);
    expect(cells(t)).toEqual([
      [HOSTILE + 'limits', 'active', '2026-11-15', '3 h ago', '204', '27', '15', '179 MB', '2'],
      ['loud_orc', 'suspended', '2026-11-15', '2 days ago', '204', '27', '15', '5.7 MB', '2'],
      ['nobody123', 'active', '2026-11-15', 'never', '0', '0', '0', '0 B', '0'],
    ]);
    const a = t.querySelector('tbody a') as HTMLAnchorElement;
    expect(a.textContent).toBe(HOSTILE);
    expect(a.getAttribute('href')).toBe('#account/%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');
    expect($('.tag.s', t).textContent).toBe('suspended');
    expect($('.totals', view()).textContent).toBe('12 accounts · 120.3 MB in all');
    expect($('.pager', view()).textContent).toContain('1–3 of 3 · page 1 of 1');
    noMarkup();
  });

  it('search (after a pause), the state filter, sorting and pages each ask the server', async () => {
    route('GET', '/api/admin/accounts', (c) => {
      const page = Number(new URL(c.path, 'https://x').searchParams.get('page'));
      return json(accounts([row()], { total: 120, page }));
    });
    await boot('#accounts');
    type($<HTMLInputElement>('input[name=q]', view()), ' Mo%r_ ');
    await debounce();
    expect(lastGet('/api/admin/accounts')).toBe('/api/admin/accounts?q=Mo%25r_&state=all&sort=seen&dir=desc&page=1');
    expect($<HTMLInputElement>('input[name=q]', view()).maxLength).toBe(20);

    choose($<HTMLSelectElement>('select[name=state]', view()), 'suspended');
    await settle();
    expect(lastGet('/api/admin/accounts')).toBe('/api/admin/accounts?q=Mo%25r_&state=suspended&sort=seen&dir=desc&page=1');

    // A new column sorts in its first direction; the same column again turns it.
    ($('th button[data-sort=name]', view()) as HTMLButtonElement).click();
    await settle();
    expect(lastGet('/api/admin/accounts')).toBe('/api/admin/accounts?q=Mo%25r_&state=suspended&sort=name&dir=asc&page=1');
    expect($('th[aria-sort=ascending]', view()).textContent).toBe('Name ▴');
    ($('th button[data-sort=name]', view()) as HTMLButtonElement).click();
    await settle();
    expect(lastGet('/api/admin/accounts')).toContain('sort=name&dir=desc');
    expect($('th[aria-sort=descending]', view()).textContent).toBe('Name ▾');
    ($('th button[data-sort=bytes]', view()) as HTMLButtonElement).click();
    await settle();
    expect(lastGet('/api/admin/accounts')).toContain('sort=bytes&dir=desc&page=1');

    // 120 accounts: three pages of 50.
    const pager = $('.pager', view());
    expect(pager.textContent).toContain('1–1 of 120 · page 1 of 3');
    expect(buttonIn(pager, 'Previous').disabled).toBe(true);
    buttonIn(pager, 'Next').click();
    await settle();
    expect(lastGet('/api/admin/accounts')).toContain('&page=2');
    expect($('.pager', view()).textContent).toContain('51–51 of 120 · page 2 of 3');
    // The view keeps its choices when opened again.
    await go('#log');
    await go('#accounts');
    expect(lastGet('/api/admin/accounts')).toBe('/api/admin/accounts?q=Mo%25r_&state=suspended&sort=bytes&dir=desc&page=2');
    expect($<HTMLInputElement>('input[name=q]', view()).value).toBe('Mo%r_');
  });

  it('a failed read says so in place', async () => {
    route('GET', '/api/admin/accounts', { status: 400, body: { error: 'bad_request' } });
    await boot('#accounts');
    expect($('.err', view()).textContent).toBe('Could not read the accounts: the server did not accept it (400 bad_request)');
  });
});

describe('the admin page: one account', () => {
  const PATH = '/api/admin/account/moria-runner';
  beforeEach(() => {
    route('GET', PATH, json(detail({ own: { runBytes: 200 * MB, notesPerDay: 0 }, log: [entry(7, { action: 'account.limits', target: 'moria-runner', note: `runBytes 50 MB → 200 MB ${HOSTILE}` })] })));
  });

  it('the figures: bars against the effective limits, the limits table, the community, its log; hostile text stays text', async () => {
    await boot('#account/moria-runner');
    expect(gets()).toContain(PATH);
    const v = view();
    expect($('h2', v).textContent).toBe('moria-runner');
    expect($('.acct-head', v).textContent).toContain('active · created 2026-11-15 · last seen 3 h ago');
    expect($('.acct-head .tag', v).textContent).toBe('limits of its own');
    const use = Array.from(v.querySelectorAll('.use .v')).map((x) => x.textContent);
    expect(use).toEqual(['204 of 2,000', '717 KB of 2 MB', '172 MB of 200 MB', '15 of 150']);
    const fills = Array.from(v.querySelectorAll<HTMLElement>('.use .fill')).map((f) => [f.style.width, f.classList.contains('hi')]);
    expect(fills).toEqual([['10.2%', false], ['35.0%', false], ['86.0%', true], ['10.0%', false]]);

    const t = $('table.limits', v);
    const inputs = Array.from(t.querySelectorAll<HTMLInputElement>('input'));
    expect(inputs.map((i) => [i.name, i.value, i.placeholder, i.classList.contains('own')])).toEqual([
      ['items', '', '2,000', false],
      ['itemBytes', '', '2 MB', false],
      ['itemMaxBytes', '', '1 MB', false],
      ['runBytes', '200 MB', '50 MB', true],
      ['runMaxBytes', '', '20 MB', false],
      ['payloadMaxBytes', '', '5 MB', false],
      ['sharedRuns', '', '150', false],
      ['commentsPerHour', '', '20', false],
      ['votesPerHour', '', '60', false],
      ['notesPerDay', '0', '5', true],
      ['listingsPerDay', '', '10', false],
    ]);
    expect(cells(t).map((r) => [r[0], r[1], r[3]]).slice(0, 4)).toEqual([
      ['Small items', '2,000', '204'],
      ['Small items, bytes', '2 MB', '717 KB'],
      ['One small item', '1 MB', ''],
      ['Runs, bytes', '50 MB', '172 MB'],
    ]);
    const kv = Array.from(v.querySelectorAll('dl.kv dd')).map((d) => d.textContent);
    expect(kv).toEqual(['15 (9 in the Hall of Fame) · 6.3 MB', '41', '12', '3', '1', '0', '2 · last used 3 h ago']);
    const log = cells($('table.audit', v));
    expect(log).toEqual([['2026-11-16 13:53', 'account.limits', 'moria-runner', `runBytes 50 MB → 200 MB ${HOSTILE}`]]);
    noMarkup();
  });

  it('a hostile name is shown as text and asked for encoded; an unknown one says so', async () => {
    route('GET', '/api/admin/account/*', json(detail({ account: { name: HOSTILE } })));
    await boot('#account/' + encodeURIComponent(HOSTILE));
    expect($('h2', view()).textContent).toBe(HOSTILE);
    noMarkup();
    state.routes.delete('GET /api/admin/account/*');
    await go('#account/ghost');
    expect($('.err', view()).textContent).toBe('No account named “ghost”.');
  });

  it('Save limits: MB parsed to bytes, a default-equal value left out, the changes listed, a warning under use; PUT with X-WC and the note', async () => {
    route('PUT', `${PATH}/limits`, json({}));
    await boot('#account/moria-runner');
    const v = view();
    const input = (n: string) => $<HTMLInputElement>(`input[name=${n}]`, v);
    type(input('runBytes'), '100 MB');
    type(input('items'), '2,000'); // equal to the default: not its own
    type(input('itemMaxBytes'), '1.5'); // a bare number in MB
    type(input('commentsPerHour'), '40');
    type(input('notesPerDay'), '');
    buttonIn(v, 'Save limits').click();
    const m = modal() as HTMLElement;
    expect(m.querySelector('h3')?.textContent).toBe('Save the limits of moria-runner?');
    expect(Array.from(m.querySelectorAll('li')).map((li) => li.textContent)).toEqual([
      'One small item 1 MB → 1.5 MB',
      'Runs, bytes 200 MB → 100 MB',
      'Comments an hour 20 → 40',
      'Notes a day 0 → 5',
    ]);
    expect(m.querySelector('.warn')?.textContent).toBe('Runs, bytes 100 MB is under what moria-runner uses (172 MB). Nothing is removed; writes that would grow past it are refused.');
    expect(writes()).toEqual([]);
    type(m.querySelector('input[name=note]') as HTMLInputElement, `asked ${HOSTILE}`);
    buttonIn(m, 'Save limits').click();
    await settle();
    expect(writes()).toEqual([
      {
        path: `${PATH}/limits`,
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-wc': '1' },
        body: { limits: { itemMaxBytes: 1.5 * MB, runBytes: 100 * MB, commentsPerHour: 40 }, note: `asked ${HOSTILE}` },
      },
    ]);
    expect(modal()).toBeNull();
    expect($('#mod-status').textContent).toBe('Limits saved: moria-runner');
    // The account is read again.
    expect(gets().filter((p) => p === PATH).length).toBe(2);
  });

  it('CR1: own byte limits shown exactly survive a save that changes another field (100 KB, 1,000 B, 1.5 MB)', async () => {
    route('GET', PATH, json(detail({ own: { itemMaxBytes: 102_400, itemBytes: 1000, runMaxBytes: 1.5 * MB, payloadMaxBytes: 5 * MB + 1 } })));
    route('PUT', `${PATH}/limits`, json({}));
    await boot('#account/moria-runner');
    const v = view();
    const input = (n: string) => $<HTMLInputElement>(`input[name=${n}]`, v);
    expect(['itemMaxBytes', 'itemBytes', 'runMaxBytes', 'payloadMaxBytes'].map((n) => input(n).value)).toEqual(['100 KB', '1,000 B', '1.5 MB', '5,242,881 B']);
    type(input('items'), '3000');
    buttonIn(v, 'Save limits').click();
    const m = modal() as HTMLElement;
    expect(Array.from(m.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Small items 2,000 → 3,000']);
    buttonIn(m, 'Save limits').click();
    await settle();
    expect(writes().map((w) => w.body)).toEqual([{ limits: { items: 3000, itemBytes: 1000, itemMaxBytes: 102_400, runMaxBytes: 1.5 * MB, payloadMaxBytes: 5 * MB + 1 } }]);
  });

  it('CR8: an account at 50 MiB reads 50 MB in the list, in its bars and its limits', async () => {
    route('GET', '/api/admin/accounts', json(accounts([row({ itemBytes: 0, pubBytes: 0, runBytes: 50 * MB, bytes: 50 * MB })])));
    await boot('#accounts');
    expect(cells($('table.accounts', view()))[0]).toContain('50 MB');
    route('GET', PATH, json(detail({ account: { itemBytes: 0, pubBytes: 0, runBytes: 50 * MB, bytes: 50 * MB } })));
    await go('#account/moria-runner');
    expect(Array.from(view().querySelectorAll('.use .v')).map((x) => x.textContent)[2]).toBe('50 MB of 50 MB');
    expect(cells($('table.limits', view()))[3]).toEqual(['Runs, bytes', '50 MB', '', '50 MB']);
  });

  it('a bad value or one over 20 × the built-in stops before anything is sent', async () => {
    await boot('#account/moria-runner');
    const v = view();
    type($<HTMLInputElement>('input[name=items]', v), '12 MB');
    type($<HTMLInputElement>('input[name=runBytes]', v), '2 GB');
    buttonIn(v, 'Save limits').click();
    expect(modal()).toBeNull();
    expect($('.limits-help + .err', v).textContent).toBe('Small items: a whole number. Runs, bytes: at most 1,000 MB (20 × the built-in 50 MB).');
    expect($<HTMLInputElement>('input[name=items]', v).classList.contains('bad')).toBe(true);
    expect(writes()).toEqual([]);
  });

  it('nothing changed: says so and sends nothing', async () => {
    await boot('#account/moria-runner');
    buttonIn(view(), 'Save limits').click();
    expect(modal()).toBeNull();
    expect($('.limits-help + .err', view()).textContent).toBe('Nothing to save: the limits are as they are.');
  });

  it('Reset to defaults asks first and sends limits: null; disabled without limits of its own', async () => {
    await boot('#account/moria-runner');
    buttonIn(view(), 'Reset to defaults').click();
    const m = modal() as HTMLElement;
    expect(m.querySelector('h3')?.textContent).toBe('Reset the limits of moria-runner?');
    expect(Array.from(m.querySelectorAll('li')).map((li) => li.textContent)[0]).toBe('Runs, bytes 200 MB → 50 MB');
    buttonIn(m, 'Reset to defaults').click();
    await settle();
    expect(writes().map((c) => [c.method, c.path, c.body, c.headers['x-wc']])).toEqual([['PUT', `${PATH}/limits`, { limits: null }, '1']]);

    route('GET', PATH, json(detail()));
    await boot('#account/moria-runner');
    expect(buttonIn(view(), 'Reset to defaults').disabled).toBe(true);
  });

  it('End all sessions and Suspend ask first and post the action; Restore for a suspended account', async () => {
    await boot('#account/moria-runner');
    buttonIn(view(), 'End all sessions').click();
    expect(modal()?.querySelector('h3')?.textContent).toBe('End every session of moria-runner?');
    buttonIn(modal() as HTMLElement, 'Cancel').click();
    expect(writes()).toEqual([]);
    buttonIn(view(), 'End all sessions').click();
    type(modal()?.querySelector('input[name=note]') as HTMLInputElement, 'lost phone');
    buttonIn(modal() as HTMLElement, 'End all sessions').click();
    await settle();
    expect($('#mod-status').textContent).toBe('Sessions ended: moria-runner');
    buttonIn(view(), 'Suspend…').click();
    buttonIn(modal() as HTMLElement, 'Suspend account').click();
    await settle();
    expect(writes().map((c) => [c.method, c.path, c.body, c.headers['x-wc']])).toEqual([
      ['POST', PATH, { action: 'end-sessions', note: 'lost phone' }, '1'],
      ['POST', PATH, { action: 'suspend' }, '1'],
    ]);
    // After each action the account is read again, not the queue.
    expect(gets().filter((p) => p === PATH).length).toBe(3);

    route('GET', PATH, json(detail({ account: { state: 'suspended' } })));
    await boot('#account/moria-runner');
    expect($('.acct-head .tag.s', view()).textContent).toBe('suspended');
    state.calls = [];
    buttonIn(view(), 'Restore…').click();
    buttonIn(modal() as HTMLElement, 'Restore account').click();
    await settle();
    expect(writes().map((c) => c.body)).toEqual([{ action: 'restore' }]);
  });

  it('Delete wants the name typed, sends it as confirm, then goes to the list', async () => {
    route('GET', '/api/admin/accounts', json(accounts([])));
    await boot('#account/moria-runner');
    buttonIn(view(), 'Delete account…').click();
    const m = modal() as HTMLElement;
    expect(m.querySelector('h3')?.textContent).toBe('Delete the account moria-runner?');
    const ok = buttonIn(m, 'Delete account');
    expect(ok.disabled).toBe(true);
    type(m.querySelector('input[name=confirm]') as HTMLInputElement, 'moria');
    expect(ok.disabled).toBe(true);
    type(m.querySelector('input[name=confirm]') as HTMLInputElement, 'MORIA-RUNNER');
    expect(ok.disabled).toBe(false);
    ok.click();
    await settle();
    expect(writes().map((c) => [c.method, c.path, c.body])).toEqual([['POST', PATH, { action: 'delete', confirm: 'MORIA-RUNNER' }]]);
    expect(location.hash).toBe('#accounts');
    expect(view().dataset.view).toBe('accounts');
    expect($('#mod-status').textContent).toBe('Deleted the account moria-runner');
  });

  it('a refused action keeps the modal open with the reason', async () => {
    route('POST', PATH, { status: 409, body: { error: 'conflict' } });
    await boot('#account/moria-runner');
    buttonIn(view(), 'End all sessions').click();
    buttonIn(modal() as HTMLElement, 'End all sessions').click();
    await settle();
    expect(modal()?.querySelector('.modal-err')?.textContent).toBe('Could not do it: the account changed meanwhile; try again (409 conflict)');
  });
});
