// THE ACCOUNT PAGE: A PLACEHOLDER, TO BE REPLACED.
//
// Stage 60 part B, first half, built the entry, Log in, Create account,
// the recovery code page and Recovery. The real Account page (the head,
// storage, devices, password and recovery, notices, "your data on this
// device", leaving; mockup notes/research/account-mockups "Account") and
// its dialogs are the next agent's. This file exists so that the flows
// can be walked from end to end and tested: it shows the name, "Account
// since …", a Log out button that works through `logout()`, and Back.
//
// What the real page must keep (the other pages and the specs rely on it):
//
// - It is registered as `account` in index.tsx and reached with
//   `go(nav, 'account')` (in the place of Log in, the code page or
//   Recovery) or pushed by the start menu's Account row when somebody is
//   logged in. Back and Esc pop to the start menu.
// - It asks `loadAccount()` when it opens. `unauthorized` (the session is
//   gone; the device is then already logged out locally) and
//   `not_logged_in` go to Log in with the words of `failureWords`.
// - A log out that overtakes that question wins: the question's
//   `unauthorized` must not send the player to Log in with "you were
//   logged out" (`leaving` below; a spec presses L the moment the page
//   shows).
// - It draws the stack's flash (`LookFlash`): Recovery says "The new
//   password is set…" on it.
// - `data-page="account"` on its content and `data-btn="LOGOUT"` on Log
//   out are what tests/e2e/account-pages.ts looks for.
//
// Shared pieces to build it and its dialogs with: words.ts (every error
// code's words), working.tsx (the Working… bar), recovery-code.tsx (the
// code shown again after "New recovery code"), form.tsx (the keys of a
// form, `WaitPlate` for `locked`), turnstile-box.tsx (not needed on this
// page: the password questions never ask for Turnstile).

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type Account, accountState, loadAccount, logout } from '../../../cloud/account';
import { Box, GlassButton, LookFlash, letterAction, lookFrame } from '../../kit/look';
import { useKeys, useNav } from '../../kit/stack';
import { FormError, type PageProps, SmallNote, go } from './form';
import { failureWords, sinceWords } from './words';

export const AccountFrame = lookFrame(function AccountFrame(_p: PageProps['account']): VNode {
  const nav = useNav();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  /** Log out is on its way: the page's own question to the server no longer matters. */
  const leaving = useRef(false);
  const [hint] = useState(() => accountState().name);

  useEffect(() => {
    void loadAccount().then((r) => {
      // (Log out was pressed meanwhile: its answer decides, not this one's 401.)
      if (!alive.current || leaving.current) return;
      if (r.ok) return setAccount(r.value);
      if (r.code === 'unauthorized' || r.code === 'not_logged_in') return go(nav, 'login', { notice: failureWords(r.code, 'account') });
      setError(failureWords(r.code, 'account'));
    });
    return () => {
      alive.current = false;
    };
  }, []);

  const out = async (): Promise<void> => {
    if (busy) return;
    leaving.current = true;
    setBusy(true);
    const r = await logout();
    if (!alive.current) return;
    if (r.ok && r.value.server === 'unreached') {
      go(nav, 'login', {
        notice: 'Logged out on this device. The server was not reached, so the session stays valid there until it is ended from another device or runs out.',
      });
      return;
    }
    nav.pop();
    nav.flash('Logged out.');
  };

  const back = (): void => nav.pop();
  useKeys((e, nk) => {
    if (nk === 'back') {
      back();
      return true;
    }
    return letterAction(e, { l: () => void out() });
  });

  const name = account?.name ?? hint ?? '';
  return (
    <Box title="Account" onBack={back} class="wc-ac wc-ac-account" winClass="wc-ac-win">
      <div class="wc-ac-form" data-page="account">
        <div class="wc-ac-head">
          <span class="wc-ac-head-name" data-account-name="">
            {name}
          </span>
          <span class="wc-ac-head-since">{account ? sinceWords(account.created) : error ? '' : 'Asking the server…'}</span>
        </div>
        <FormError text={error} id="account" />
        <SmallNote>Nothing is synced yet: the account, its keys and its recovery code are what exists so far.</SmallNote>
        <div class="wc-lk-btns wc-ac-btns">
          <GlassButton id="LOGOUT" label="Log out" letter="l" disabled={busy} onClick={() => void out()} />
        </div>
        <LookFlash />
      </div>
    </Box>
  );
});
