// The Account page (stage 60, spec §7.2; mockup notes/research/
// account-mockups "Account"), as far as stage 60 goes. Four groups, from
// everyday to rare, in one column:
//
//   the head                 the user name, "Account since …" (and one
//                            plain line when the account is suspended)
//   Devices                  the sessions, this device first; End on each
//                            other row, End all others in the rule
//   Password and recovery    Change password, New recovery code
//   Leaving                  Log out; Delete account, last, small and red
//
// What the mockup also drew belongs to later stages and is not here: the
// sync state and Sync now (61), the storage bars (61/63), the gallery
// notice switch (65), "Your data on this device" (the safety copy is 61;
// the exports stay on Profiles and History). The owner: do not show what
// does not exist yet.
//
// The dialogs are account-dialogs.tsx, each an overlay frame over this
// page. They reach the page through an `AccountHost` (below).
//
// Keys (the page has no text fields): P, R, L and O are the buttons'
// letters, E ends the session of the cursor's row (else the first other
// one); Tab, Shift+Tab and the arrows walk every button in order (the
// only way to Delete account, which has no letter); Enter or Space
// presses the cursor's; Esc and Back go to the start menu.
//
// The contract with the other pages and the specs:
//
// - Registered as `account` in index.tsx; reached with `go(nav,
//   'account')` or pushed by the start menu's Account row. Back and Esc
//   pop to the start menu.
// - It asks `loadAccount()` when it opens and again after every change.
//   `unauthorized` (the session is gone; the device is then already
//   logged out locally) and `not_logged_in` go to Log in with the words
//   of `failureWords`, from the page and from every dialog.
// - A log out (or a delete) that is on its way wins over the page's own
//   question: its `unauthorized` says nothing (`leaving`).
// - Two tabs: the page follows `onAccountState`. Logged out in another
//   tab: the page leaves for the start menu and says so. While one of the
//   page's own flows is in flight the flow's answer decides instead (a
//   flow that ends in `unauthorized` has logged the device out too). A
//   hint that is gone while the device's keys are there (localStorage was
//   cleared) is not a log out: the flows put the hint back.
// - A new recovery code on its way or on screen pins the page
//   (`host.pin`): nothing closes that dialog before the last group is
//   typed, not another tab's log out and not the page's own question
//   coming back 401. What wanted to move the page does so afterwards.
// - A held key never acts twice: the letters, Enter and Space ignore key
//   repeat here, and the kit's `Dialog` does not let the key that opened
//   it confirm it (look-overlay.tsx).
// - It draws the stack's flash (`LookFlash`): Recovery says "The new
//   password is set…" on it, and the dialogs say what they did.
// - `data-page="account"` on its content, `data-account-name` on the
//   name and `data-btn="LOGOUT"` on Log out are what the specs look for.
// - A session's label is untrusted text: it is only ever written as text.

import type { VNode } from 'preact';
import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type Account, type AccountSession, type FlowResult, accountState, loadAccount, onAccountState, storedAccount } from '../../../cloud/account';
import { Box, BoxBody, GlassButton, LookFlash, Rule, letterOf, lookFrame } from '../../kit/look';
import { useKeys, useNav } from '../../kit/stack';
import { DeleteDialog, EndDialog, LogoutDialog, NewCodeDialog, PasswordDialog } from './account-dialogs';
import { labelWords, orderSessions, sessionWords } from './account-model';
import { FormError, type PageProps, SmallNote, go, useHeldCode, useTallPage } from './form';
import { failureWords, sinceWords } from './words';

/** What a dialog needs of the page under it. */
export interface AccountHost {
  /** The account's name as the server spells it (the device's hint until the server has answered). */
  name: string;
  /**
   * Every flow a dialog starts goes through this: while one is in flight
   * the page does not act on "logged out" from the account's state, the
   * flow's own answer does.
   */
  track<T>(flow: Promise<FlowResult<T>>): Promise<FlowResult<T>>;
  /** A log out or a delete is on its way (true) or failed (false): the page's own question says nothing meanwhile. */
  setLeaving(on: boolean): void;
  /** The session is gone: every dialog closes and Log in takes the page's place, saying `notice`. */
  toLogin(notice: string): void;
  /** Logged out or deleted: every dialog closes, the start menu shows `flash`. */
  toMenu(flash: string): void;
  /** Asks the server for the account again (after a change). */
  reload(): void;
  /**
   * A new recovery code is on its way or on screen, unconfirmed (true):
   * the page and its dialogs stay where they are. What would have moved
   * the page meanwhile (`toLogin`, `toMenu`, another tab's log out) is
   * done when the pin is let go (false).
   */
  pin(on: boolean): void;
}

interface Stop {
  id: string;
  run(): void;
}

export const AccountFrame = lookFrame(function AccountFrame(_p: PageProps['account']): VNode {
  const nav = useNav();
  /** Where this page stands in the stack: what is above it are its dialogs. */
  const [depth] = useState(() => nav.depth());
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(true);
  const [hint] = useState(() => accountState().name);
  /** The keyboard's button, or null. */
  const [at, setAt] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const alive = useRef(true);
  /** The page has left (or is leaving) for Log in or the menu: nothing else moves it. */
  const left = useRef(false);
  const leaving = useRef(false);
  const flights = useRef(0);
  const asked = useRef(0);
  /** `host.pin`, and what waits for it to be let go. */
  const pinned = useRef(false);
  const later = useRef<(() => void) | null>(null);
  /** `follow` is asking the device's store whether the missing hint is a log out. */
  const checking = useRef(false);
  const rows = useRef<HTMLUListElement | null>(null);
  const tall = useTallPage();

  const name = account?.name ?? hint ?? '';

  const host = useRef<AccountHost>(null as unknown as AccountHost);
  const closeDialogs = (): void => {
    const over = nav.depth() - depth;
    if (over > 0) nav.pop(over);
  };
  /** Nobody is logged in here any more and no flow of the page's is about to say why: another tab did it. */
  const follow = (): void => {
    if (!alive.current || left.current || flights.current > 0 || pinned.current) return;
    const s = accountState();
    if (s.name === null) {
      // The hint is not the truth: a cleared localStorage with the keys still here is no log out (the
      // flows' `storedAccount` then puts the hint back). A log out removes the keys before the hint.
      if (checking.current) return;
      checking.current = true;
      void storedAccount().then((me) => {
        checking.current = false;
        if (me) return;
        if (!alive.current || left.current || flights.current > 0 || accountState().name !== null) return;
        host.current.toMenu('Logged out in another tab.');
      });
      return;
    }
    // (`host.current`: this runs from the listener of the first render.)
    if (host.current.name && s.name !== host.current.name) {
      // Another account was logged in from another tab: this page starts over for it.
      left.current = true;
      closeDialogs();
      go(nav, 'account');
    }
  };
  const load = (): void => {
    const n = ++asked.current;
    setAsking(true);
    void host.current.track(loadAccount()).then((r) => {
      // (A log out pressed meanwhile decides, not this answer's 401.)
      if (!alive.current || left.current || leaving.current || n !== asked.current) return;
      setAsking(false);
      if (r.ok) {
        setError(null);
        setAccount(r.value);
        return;
      }
      if (r.code === 'unauthorized' || r.code === 'not_logged_in' || r.code === 'wrong_account') return host.current.toLogin(failureWords(r.code, 'account'));
      setError(failureWords(r.code, 'account'));
    });
  };
  host.current = {
    name,
    track: async (flow) => {
      flights.current++;
      try {
        return await flow;
      } finally {
        flights.current--;
        // After the caller has acted on the answer (it may leave for Log in itself).
        setTimeout(follow, 0);
      }
    },
    setLeaving: (on) => {
      const was = leaving.current;
      leaving.current = on;
      // A delete that failed: the question it silenced is asked again.
      if (was && !on && alive.current && !left.current) load();
    },
    toLogin: (notice) => {
      if (!alive.current || left.current) return;
      if (pinned.current) {
        later.current = () => host.current.toLogin(notice);
        return;
      }
      left.current = true;
      closeDialogs();
      go(nav, 'login', { notice });
    },
    toMenu: (flash) => {
      if (!alive.current || left.current) return;
      if (pinned.current) {
        later.current = () => host.current.toMenu(flash);
        return;
      }
      left.current = true;
      nav.pop(nav.depth() - depth + 1);
      nav.flash(flash);
    },
    reload: () => {
      if (alive.current && !left.current) load();
    },
    pin: (on) => {
      if (pinned.current === on) return;
      pinned.current = on;
      if (on) return;
      const run = later.current;
      later.current = null;
      // After the dialog that let go has closed itself.
      setTimeout(run ?? follow, 0);
    },
  };
  useHeldCode(nav);

  useEffect(() => {
    load();
    const off = onAccountState(() => follow());
    return () => {
      alive.current = false;
      off();
    };
  }, []);

  const sessions = account ? orderSessions(account.sessions) : [];
  const others = sessions.filter((s) => !s.current);

  const open = (dialog: VNode): void => nav.push(dialog, { overlay: true });
  // The host is handed over as the ref's object, so a dialog always reads the page's latest.
  const hostOf = (): (() => AccountHost) => () => host.current;
  const endOne = (s: AccountSession): void => open(h(EndDialog, { host: hostOf(), session: { id: s.id, label: labelWords(s.label) } }) as VNode);
  const endAll = (): void => open(h(EndDialog, { host: hostOf(), others: others.length }) as VNode);
  const password = (): void => open(h(PasswordDialog, { host: hostOf() }) as VNode);
  const recovery = (): void => open(h(NewCodeDialog, { host: hostOf() }) as VNode);
  const out = (): void => open(h(LogoutDialog, { host: hostOf() }) as VNode);
  const remove = (): void => open(h(DeleteDialog, { host: hostOf() }) as VNode);

  const endId = (s: AccountSession): string => `END:${s.id}`;
  const stops: Stop[] = [
    ...(error ? [{ id: 'RETRY', run: load }] : []),
    ...(others.length > 0 ? [{ id: 'ENDALL', run: endAll }] : []),
    ...others.map((s) => ({ id: endId(s), run: () => endOne(s) })),
    { id: 'PASSWORD', run: password },
    { id: 'RECOVERY', run: recovery },
    { id: 'LOGOUT', run: out },
    { id: 'DELETE', run: remove },
  ];
  const cur = at === null ? undefined : stops.find((s) => s.id === at);
  /** The row E ends: the cursor's, else the first other session. */
  const eRow = others.find((s) => endId(s) === at) ?? others[0];

  const back = (): void => nav.pop();
  useKeys((e, nk) => {
    if (nk === 'back') {
      back();
      return true;
    }
    const d = nk === 'tab' || nk === 'down' || nk === 'right' ? 1 : nk === 'backtab' || nk === 'up' || nk === 'left' ? -1 : 0;
    if (d !== 0) {
      const i = cur ? stops.indexOf(cur) : -1;
      const to = stops[i < 0 ? (d > 0 ? 0 : stops.length - 1) : (i + d + stops.length) % stops.length]!;
      setAt(to.id);
      return true;
    }
    if (nk === 'activate' || e.key === 'Enter') {
      // (Not on key repeat: a held key opens a dialog once and does not go on to answer it.)
      if (!e.repeat) cur?.run();
      return true;
    }
    const press: Record<string, (() => void) | undefined> = {
      p: password,
      r: recovery,
      l: out,
      o: others.length > 0 ? endAll : undefined,
      e: eRow ? () => endOne(eRow) : undefined,
      t: error ? load : undefined,
    };
    const l = letterOf(e);
    const run = l ? press[l] : undefined;
    if (!run) return false;
    if (!e.repeat) run();
    return true;
  });

  // The cursor's row stays in view (a long device list scrolls on its own on a desktop).
  useEffect(() => {
    if (at?.startsWith('END:')) rows.current?.querySelector('.is-cur')?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  return (
    <Box title="Account" onBack={back} tall={tall} class="wc-ac wc-ac-account" winClass="wc-ac-win">
      <BoxBody class="wc-ac-body" scroll={tall}>
        <div class="wc-ac-form wc-ac-acct" data-page="account">
          <div class="wc-ac-head">
            <span class="wc-ac-head-name" data-account-name="">
              {name}
            </span>
            <span class="wc-ac-head-since">{account ? sinceWords(account.created) : error ? '' : 'Asking the server…'}</span>
          </div>
          {account?.state === 'suspended' && (
            <p class="wc-ac-suspended" role="status" data-suspended="">
              <b>This account is suspended.</b> It cannot publish runs or comment. Everything else works as before.
            </p>
          )}

          <Rule title="Devices" id="devices">
            {others.length > 0 && <GlassButton id="ENDALL" label="End all others" letter="o" small selected={at === 'ENDALL'} onClick={endAll} />}
          </Rule>
          {error ? (
            <div class="wc-ac-noload">
              <FormError text={error} id="account" />
              <GlassButton id="RETRY" label="Try again" letter="t" small selected={at === 'RETRY'} onClick={load} />
            </div>
          ) : !account ? (
            <p class="wc-ac-devs-wait">{asking ? 'Asking the server…' : ''}</p>
          ) : (
            <ul class="wc-lk-rows is-flat wc-ac-devs wc-lk-scroll" ref={rows} aria-label="Devices">
              {sessions.map((s) => {
                const on = !s.current && at === endId(s);
                return (
                  <li key={s.id} class={'wc-lk-row wc-ac-dev' + (on ? ' is-on is-cur' : '')} data-session={s.current ? 'current' : 'other'}>
                    <span class="wc-ac-dev-id">
                      <span class="wc-ac-dev-n" data-label="">
                        {labelWords(s.label)}
                      </span>
                      <span class="wc-ac-dev-t">{sessionWords(s.current ? { created: s.created, lastUsed: 0 } : s, now)}</span>
                    </span>
                    {s.current ? (
                      <span class="wc-ac-dev-this">this device</span>
                    ) : (
                      <GlassButton id="END" label="End" small selected={on} {...(s === eRow ? { letter: 'e' } : {})} onClick={() => endOne(s)} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <Rule title="Password and recovery" id="password" />
          <div class="wc-lk-btns wc-ac-row">
            <GlassButton id="PASSWORD" label="Change password" letter="p" icon="lock" selected={at === 'PASSWORD'} onClick={password} />
            <GlassButton id="RECOVERY" label="New recovery code" letter="r" icon="key" selected={at === 'RECOVERY'} onClick={recovery} />
          </div>
          <SmallNote>Both ask for your password.</SmallNote>

          <Rule title="Leaving" id="leaving" />
          <div class="wc-ac-leave">
            <GlassButton id="LOGOUT" label="Log out" letter="l" selected={at === 'LOGOUT'} onClick={out} />
            <GlassButton id="DELETE" label="Delete account" danger small selected={at === 'DELETE'} onClick={remove} />
          </div>
          <LookFlash class="wc-ac-flash" />
        </div>
      </BoxBody>
    </Box>
  );
});
