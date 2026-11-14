// @vitest-environment happy-dom
// Stage 60 review, finding 1 (ADR 0145 "After the review of the client"):
// the recovery code of a new account is held from the moment the
// registration answers until the player has confirmed it, whatever became
// of the page that asked (src/chrome/frames/account/form.tsx `holdCode`).
// The pages' own controls cannot leave while the request is on its way
// (tests/e2e/account-pages.spec.ts); this is the belt to those braces.
import { afterEach, describe, expect, it } from 'vitest';
import { LoginFrame, RecoveryCodeFrame, AccountFrame, accountEntry } from '../../src/chrome/frames/account';
import { heldCode, holdCode, releaseCode } from '../../src/chrome/frames/account/form';

const CODE = { name: 'Olev', code: 'K7QM-2XHD-9FTP-WB4N-6RCE-3YJA', next: 'account' } as const;

/** Would the browser ask before the page is left? */
function asksBeforeUnload(): boolean {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

afterEach(() => releaseCode());

describe('a new account\'s recovery code is held until it is confirmed', () => {
  it('nothing is held at first: the Account row opens Log in or the Account page', () => {
    expect(heldCode()).toBeNull();
    expect(accountEntry(false).type).toBe(LoginFrame);
    expect(accountEntry(true).type).toBe(AccountFrame);
    expect(asksBeforeUnload()).toBe(false);
  });

  it('a held code is what the Account row opens, logged in or not, and the browser asks before a reload', () => {
    holdCode(CODE);
    expect(heldCode()).toEqual(CODE);
    for (const loggedIn of [true, false]) {
      const page = accountEntry(loggedIn);
      expect(page.type).toBe(RecoveryCodeFrame);
      expect(page.props).toMatchObject(CODE);
    }
    expect(asksBeforeUnload()).toBe(true);
    // Held again by the page that shows it: still one code, one question.
    holdCode(CODE);
    expect(asksBeforeUnload()).toBe(true);
  });

  it('released when the player goes on: forgotten, and nothing asks any more', () => {
    holdCode(CODE);
    releaseCode();
    expect(heldCode()).toBeNull();
    expect(accountEntry(true).type).toBe(AccountFrame);
    expect(asksBeforeUnload()).toBe(false);
  });
});
