// @vitest-environment happy-dom
// The admin page's "Flags and limits" view (stage 66 C1, ADR 0157, the
// owner's pick 4b): the flags' switches, and the default limits for every
// account (built in against now, Save defaults, Back to built in).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { $, MB, boot, buttonIn, cells, gets, json, limits, modal, route, settle, setup, state, teardown, type, view, writes } from './admin-page-harness.ts';

beforeEach(setup);
afterEach(teardown);

describe('the admin page: flags', () => {
  it('the table and a switch: PUT with X-WC, then read again', async () => {
    route('GET', '/api/admin/limits', json(limits()));
    route('PUT', '/api/admin/flags/gallery', json({ value: true, default: false, override: true }));
    await boot('#flags');
    const t = $('#flags', view());
    expect(cells(t)).toEqual([
      ['stats', 'on', 'on', 'Turn off'],
      ['gallery', 'off', 'off (overridden)', 'Turn on'],
    ]);
    state.calls = [];
    buttonIn(t, 'Turn on').click();
    await settle();
    expect(writes()).toEqual([{ path: '/api/admin/flags/gallery', method: 'PUT', headers: { 'content-type': 'application/json', 'x-wc': '1' }, body: { value: true } }]);
    expect(gets()).toEqual(['/api/admin/stats']);
  });

  it('a refused switch says so in place', async () => {
    route('GET', '/api/admin/limits', json(limits()));
    route('PUT', '/api/admin/flags/stats', { status: 403, body: { error: 'forbidden' } });
    await boot('#flags');
    buttonIn($('#flags', view()), 'Turn off').click();
    await settle();
    expect($('.flags-sec .err', view()).textContent).toBe('Could not set stats: refused (X-WC or Origin) (403 forbidden)');
  });
});

describe('the admin page: default limits', () => {
  it('built in and now: an override in its input, the others empty with the built-in value', async () => {
    route('GET', '/api/admin/limits', json(limits({ runBytes: 100 * MB })));
    await boot('#flags');
    expect(gets()).toContain('/api/admin/limits');
    const t = $('.defaults-sec table.limits', view());
    expect(cells(t).slice(0, 4).map((r) => r.slice(0, 2))).toEqual([['Small items', '2,000'], ['Small items, bytes', '2 MB'], ['One small item', '1 MB'], ['Runs, bytes', '50 MB']]);
    const inputs = Array.from(t.querySelectorAll<HTMLInputElement>('input'));
    expect(inputs.length).toBe(14); // with stage 80's three own-image limits
    expect(inputs.filter((i) => i.value).map((i) => [i.name, i.value, i.classList.contains('own')])).toEqual([['runBytes', '100 MB', true]]);
    expect(buttonIn(view(), 'Back to built in').disabled).toBe(false);
  });

  it('Save defaults: lists the changes, PUTs only the fields unlike the built-in, with the note', async () => {
    route('GET', '/api/admin/limits', json(limits({ runBytes: 100 * MB })));
    route('PUT', '/api/admin/limits', json(limits()));
    await boot('#flags');
    const v = view();
    type($<HTMLInputElement>('input[name=sharedRuns]', v), '300');
    type($<HTMLInputElement>('input[name=itemBytes]', v), '2 MB'); // the built-in value: left out
    type($<HTMLInputElement>('input[name=runBytes]', v), '512 KB');
    buttonIn(v, 'Save defaults').click();
    const m = modal() as HTMLElement;
    expect(m.querySelector('h3')?.textContent).toBe('Change the default limits?');
    expect(Array.from(m.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Runs, bytes 100 MB → 512 KB', 'Published runs 150 → 300']);
    type(m.querySelector('input[name=note]') as HTMLInputElement, 'more room');
    state.calls = [];
    buttonIn(m, 'Save defaults').click();
    await settle();
    expect(writes()).toEqual([
      { path: '/api/admin/limits', method: 'PUT', headers: { 'content-type': 'application/json', 'x-wc': '1' }, body: { defaults: { runBytes: 512 * 1024, sharedRuns: 300 }, note: 'more room' } },
    ]);
    expect($('#mod-status').textContent).toBe('Default limits saved.');
    expect(gets()).toEqual(expect.arrayContaining(['/api/admin/stats', '/api/admin/limits']));
  });

  it('CR1: a default byte limit shown exactly survives a save that changes another field', async () => {
    route('GET', '/api/admin/limits', json(limits({ itemMaxBytes: 102_400, itemBytes: 1000 })));
    route('PUT', '/api/admin/limits', json(limits()));
    await boot('#flags');
    const v = view();
    expect($<HTMLInputElement>('input[name=itemMaxBytes]', v).value).toBe('100 KB');
    expect($<HTMLInputElement>('input[name=itemBytes]', v).value).toBe('1,000 B');
    type($<HTMLInputElement>('input[name=sharedRuns]', v), '300');
    buttonIn(v, 'Save defaults').click();
    const m = modal() as HTMLElement;
    expect(Array.from(m.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Published runs 150 → 300']);
    state.calls = [];
    buttonIn(m, 'Save defaults').click();
    await settle();
    expect(writes().map((w) => w.body)).toEqual([{ defaults: { itemBytes: 1000, itemMaxBytes: 102_400, sharedRuns: 300 } }]);
  });

  it('a value over 20 × the built-in or not a number stops before anything is sent', async () => {
    route('GET', '/api/admin/limits', json(limits()));
    await boot('#flags');
    const v = view();
    type($<HTMLInputElement>('input[name=notesPerDay]', v), '101');
    type($<HTMLInputElement>('input[name=votesPerHour]', v), 'lots');
    buttonIn(v, 'Save defaults').click();
    expect(modal()).toBeNull();
    expect($('.defaults-sec .err', v).textContent).toBe('Votes an hour: a whole number. Notes a day: at most 100 (20 × the built-in 5).');
    expect(writes()).toEqual([]);
  });

  it('Back to built in asks first and sends defaults: null; disabled when nothing is overridden', async () => {
    route('GET', '/api/admin/limits', json(limits({ notesPerDay: 0 })));
    await boot('#flags');
    buttonIn(view(), 'Back to built in').click();
    const m = modal() as HTMLElement;
    expect(Array.from(m.querySelectorAll('li')).map((li) => li.textContent)).toEqual(['Notes a day 0 → 5']);
    buttonIn(m, 'Back to built in').click();
    await settle();
    expect(writes().map((c) => [c.method, c.path, c.body, c.headers['x-wc']])).toEqual([['PUT', '/api/admin/limits', { defaults: null }, '1']]);

    route('GET', '/api/admin/limits', json(limits()));
    await boot('#flags');
    expect(buttonIn(view(), 'Back to built in').disabled).toBe(true);
    buttonIn(view(), 'Save defaults').click();
    expect($('.defaults-sec .err', view()).textContent).toBe('Nothing to save: the defaults are as they are.');
  });

  it('a failed read of the defaults says so in place', async () => {
    route('GET', '/api/admin/limits', { status: 503, body: { error: 'unavailable' } });
    await boot('#flags');
    expect($('.defaults-sec .err', view()).textContent).toBe('Could not read the default limits: the database is unavailable (503 unavailable)');
  });
});
