// @vitest-environment happy-dom
// Stage 60 part B: the account pages' words (src/chrome/frames/account/
// words.ts) and the Turnstile widget's mount (turnstile.ts) over a fake
// `window.turnstile`.
import { describe, expect, it, vi } from 'vitest';
import type { FlowErrorCode } from '../../src/cloud/account';
import { type TurnstileApi, type TurnstileState, mountTurnstile, turnstileWords } from '../../src/chrome/frames/account/turnstile';
import {
  type FlowPlace,
  POINTS,
  charactersWords,
  failureWords,
  howLong,
  nameWords,
  recoveryFile,
  sinceWords,
  strengthMark,
  waitClock,
  workingWords,
} from '../../src/chrome/frames/account/words';

// Every code a flow can end with. A code added to `FlowErrorCode` without
// a line here does not compile, and so does not get past without words.
const CODES: Record<FlowErrorCode, true> = {
  invalid_login: true,
  invalid_recovery: true,
  turnstile_required: true,
  turnstile: true,
  locked: true,
  rate_limited: true,
  name_taken: true,
  unauthorized: true,
  not_found: true,
  unavailable: true,
  accounts_not_configured: true,
  bad_request: true,
  forbidden: true,
  method_not_allowed: true,
  disabled: true,
  offline: true,
  timeout: true,
  cancelled: true,
  bad_answer: true,
  worker_failed: true,
  corrupt_wrap: true,
  update_needed: true,
  storage_failed: true,
  not_logged_in: true,
  bad_input: true,
  busy: true,
  finished: true,
  failed: true,
};
const PLACES: FlowPlace[] = ['login', 'register', 'recover', 'account'];

describe('failureWords', () => {
  it('has a sentence for every code on every page, and never the generic one by accident', () => {
    const generic = failureWords('failed', 'login');
    for (const code of Object.keys(CODES) as FlowErrorCode[]) {
      for (const place of PLACES) {
        const w = failureWords(code, place);
        expect(w.length, `${code} / ${place}`).toBeGreaterThan(8);
        expect(w).toMatch(/[.!?]$/);
        if (code !== 'failed') expect(w, `${code} / ${place}`).not.toBe(generic);
      }
    }
    expect(failureWords('no_such_code' as FlowErrorCode, 'login')).toBe(generic);
  });

  it('never says which of the name and the password was wrong', () => {
    expect(failureWords('invalid_login', 'login')).toBe('Wrong user name or password.');
    expect(failureWords('invalid_recovery', 'recover')).toBe('Wrong user name or recovery code.');
    // On the Account page the name is known: only the password can be wrong.
    expect(failureWords('invalid_login', 'account')).toBe('Wrong password.');
  });

  it('a damaged key is not a typing mistake, and a timeout says what may have happened', () => {
    expect(failureWords('corrupt_wrap', 'login')).toMatch(/password is right.*will not help/);
    expect(failureWords('corrupt_wrap', 'recover')).toMatch(/recovery code is right/);
    expect(failureWords('timeout', 'register')).toMatch(/may or may not have been made/);
    expect(failureWords('timeout', 'account')).toMatch(/may or may not have been made/);
    expect(failureWords('unavailable', 'login')).toBe(failureWords('accounts_not_configured', 'login'));
    expect(failureWords('storage_failed', 'register')).toMatch(/No account was made/);
  });
});

describe('the small words', () => {
  it('the six points', () => {
    expect(POINTS).toHaveLength(6);
    expect(POINTS.map((p) => p[0])).toEqual(['What is stored', 'What we can see', 'What is never stored', 'What is public', 'No e-mail', 'Yours to delete']);
  });

  it('name problems: empty is not an error', () => {
    expect(nameWords(null)).toBeNull();
    expect(nameWords('empty')).toBeNull();
    expect(nameWords('bad_characters')).toMatch(/a–z, 0–9, _ and -/);
    expect(nameWords('too_short')).toMatch(/3/);
    expect(nameWords('too_long')).toMatch(/20/);
  });

  it('strength, counts, the clock', () => {
    expect(strengthMark('too_short')).toEqual({ step: 0, word: 'too short' });
    expect(strengthMark('weak').step).toBe(1);
    expect(strengthMark('strong')).toEqual({ step: 4, word: 'strong' });
    expect(charactersWords(1)).toBe('1 character');
    expect(charactersWords(21)).toBe('21 characters');
    expect(waitClock(872)).toBe('14:32');
    expect(waitClock(7)).toBe('0:07');
    expect(waitClock(0.2)).toBe('0:01');
    expect(waitClock(-5)).toBe('0:00');
    expect(waitClock(3723)).toBe('1:02:03');
    expect(waitClock(Number.NaN)).toBe('0:00');
  });

  it('the Working sentence follows the estimate and the device', () => {
    expect(howLong(400)).toBe('About a second.');
    expect(howLong(4000)).toBe('This takes a few seconds.');
    expect(howLong(20_000)).toMatch(/a while/);
    expect(howLong(null)).toBe('This takes a moment.');
    expect(workingWords({ phone: false, estimateMs: 400 })).toBe('Making your key on this device. About a second.');
    expect(workingWords({ phone: true, estimateMs: 4000 })).toBe('Making your key on this phone. This takes a few seconds.');
    expect(workingWords({ what: 'new key', phone: false, estimateMs: 400 })).toBe('Making your new key on this device. About a second.');
    expect(workingWords({ phone: false, estimateMs: 400, inline: true })).toMatch(/may stand still/);
  });

  it('the recovery code file: the site, the name, the code and what it is for', () => {
    const f = recoveryFile({ name: 'Olev', code: 'K7QM-2XHD-9FTP-WB4N-6RCE-3YJA', site: 'mumecockpit.com', date: '2026-11-14' });
    expect(f.name).toBe('webcockpit-recovery-code-Olev.txt');
    expect(f.text).toContain('Site:       mumecockpit.com');
    expect(f.text).toContain('User name:  Olev');
    expect(f.text).toContain('Recovery code:  K7QM-2XHD-9FTP-WB4N-6RCE-3YJA');
    expect(f.text).toMatch(/only\s+way back/);
    expect(f.text.endsWith('\n')).toBe(true);
  });

  it('"Account since": seconds or milliseconds, and nothing made up for a bad value', () => {
    const ms = Date.UTC(2026, 10, 14, 12);
    expect(sinceWords(ms, 'en-GB')).toBe('Account since 14 November 2026');
    expect(sinceWords(ms / 1000, 'en-GB')).toBe('Account since 14 November 2026');
    expect(sinceWords(0)).toBe('Account');
    expect(sinceWords(Number.NaN)).toBe('Account');
  });
});

describe('the Turnstile widget', () => {
  type Opts = Record<string, (a?: string) => unknown> & { sitekey: string; theme: string; size: string };

  function fake(): { api: TurnstileApi; opts: () => Opts; calls: string[] } {
    const calls: string[] = [];
    let opts: Opts | null = null;
    const api: TurnstileApi = {
      render: (_el, o) => {
        opts = o as Opts;
        calls.push('render');
        return 'w1';
      },
      reset: (id) => void calls.push(`reset ${id}`),
      remove: (id) => void calls.push(`remove ${id}`),
    };
    return { api, opts: () => opts!, calls };
  }

  async function mount(siteKey: string | null = 'site-key', load?: () => Promise<TurnstileApi>) {
    const f = fake();
    const states: string[] = [];
    const slot = document.createElement('div');
    document.body.append(slot);
    const w = mountTurnstile(slot, {
      siteKey,
      onState: (s: TurnstileState, d?: string) => states.push(d ? `${s}:${d}` : s),
      load: load ?? (() => Promise.resolve(f.api)),
    });
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    return { ...f, states, w, slot };
  }

  it('renders explicitly with the site key, dark; a token is handed out once and the widget reset', async () => {
    const m = await mount();
    expect(m.states).toEqual(['loading', 'waiting']);
    expect(m.opts()).toMatchObject({ sitekey: 'site-key', theme: 'dark', size: 'normal', 'response-field': false, 'refresh-expired': 'auto', retry: 'auto' });
    expect(m.w.take()).toBeNull();
    m.opts().callback!('tok-1');
    expect(m.w.state).toBe('passed');
    expect(m.w.take()).toBe('tok-1');
    expect(m.w.take()).toBeNull();
    expect(m.calls).toEqual(['render', 'reset w1']);
    expect(m.w.state).toBe('waiting');
  });

  it('expiry, an error (handled: true) and unsupported drop the token', async () => {
    const m = await mount();
    m.opts().callback!('tok-1');
    m.opts()['expired-callback']!();
    expect(m.w.state).toBe('expired');
    expect(m.w.take()).toBeNull();
    m.opts().callback!('tok-2');
    expect(m.opts()['error-callback']!('300030')).toBe(true);
    expect(m.states.at(-1)).toBe('error:300030');
    expect(m.w.take()).toBeNull();
    m.w.retry();
    expect(m.calls.at(-1)).toBe('reset w1');
    expect(m.w.state).toBe('waiting');
    m.opts()['unsupported-callback']!();
    expect(m.w.state).toBe('unsupported');
  });

  it('no site key: nothing is rendered; a script that does not load: blocked, and retry loads again', async () => {
    const none = await mount(null);
    expect(none.states).toEqual(['loading', 'nokey']);
    expect(none.calls).toEqual([]);

    const f = fake();
    const load = vi.fn<() => Promise<TurnstileApi>>().mockRejectedValueOnce(new Error('blocked')).mockResolvedValue(f.api);
    const m = await mount('site-key', load);
    expect(m.states).toEqual(['loading', 'blocked']);
    m.w.retry();
    await new Promise((r) => setTimeout(r, 0));
    expect(m.states).toEqual(['loading', 'blocked', 'loading', 'waiting']);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('dispose removes the widget and silences its callbacks', async () => {
    const m = await mount();
    m.w.dispose();
    expect(m.calls).toEqual(['render', 'remove w1']);
    const before = m.states.length;
    m.opts().callback!('late');
    expect(m.states).toHaveLength(before);
    expect(m.w.take()).toBeNull();
    m.w.dispose();
    expect(m.calls).toEqual(['render', 'remove w1']);
  });

  it('has words for every state that needs them', () => {
    for (const s of ['loading', 'expired', 'blocked', 'error', 'unsupported', 'nokey'] as const) expect(turnstileWords(s)).toBeTruthy();
    expect(turnstileWords('waiting')).toBeNull();
    expect(turnstileWords('passed')).toBeNull();
    expect(turnstileWords('error', '300030')).toContain('(300030)');
  });
});
