// Log in (stage 60, spec §7.2; mockup notes/research/account-mockups
// "Log in"). User name, password, Log in; Create account and Forgot
// password as links under a rule.
//
// - One message for a wrong name or a wrong password (the server cannot
//   tell them apart either); the password is cleared and gets the focus.
// - The Turnstile widget comes in only after the server asked for it
//   (`turnstile_required`, from the fourth try for a name) and then stays:
//   every later try needs a new token. The same flow object is submitted
//   again with the token, so the slow step does not run twice.
// - `locked`: the countdown from `retryAfter`; when it has run out the
//   same flow can be submitted again.
// - The flow object lives as long as the name and the password are the
//   ones it was made for; a change in either field drops it, and so does
//   leaving the page. The password is in the field's state only while the
//   form shows it.

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type Account, type FlowHandle, accountState, checkName, startLogin, storedAccount } from '../../../cloud/account';
import { Box, Field, GlassButton, TextLink, lookFrame } from '../../kit/look';
import { useNav } from '../../kit/stack';
import { FormError, type PageProps, SmallNote, WaitPlate, go, useFormKeys, useHeldCode } from './form';
import { useTurnstile } from './turnstile-box';
import { failureWords, WRONG_LOGIN } from './words';
import { Working, useWorking } from './working';

export const LoginFrame = lookFrame(function LoginFrame(p: PageProps['login']): VNode {
  const nav = useNav();
  const [name, setName] = useState(() => p.name ?? accountState().lastName ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** The server asked for the check: the widget is up from then on. */
  const [check, setCheck] = useState(false);
  const [wait, setWait] = useState<number | null>(null);
  const handle = useRef<FlowHandle<Account> | null>(null);
  const alive = useRef(true);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const pwRef = useRef<HTMLInputElement | null>(null);
  /** The field to focus once the form is usable again. */
  const focusNext = useRef<'name' | 'password' | null>(null);
  const [startAt] = useState<'name' | 'password'>(() => (name ? 'password' : 'name'));
  const work = useWorking();
  const ts = useTurnstile(check);
  useHeldCode(nav, work.busy);
  // The start page's hint said "nobody", but the device's keys are the truth (localStorage was cleared, or
  // cannot be written): somebody is logged in here, so the Account page takes this page's place.
  useEffect(() => {
    void storedAccount().then((me) => {
      if (me && alive.current && !work.busy()) go(nav, 'account');
    });
  }, []);

  const drop = (): void => {
    handle.current?.dispose();
    handle.current = null;
  };
  useEffect(
    () => () => {
      alive.current = false;
      drop();
    },
    [],
  );
  useEffect(() => {
    if (work.on || wait !== null || !focusNext.current) return;
    const el = focusNext.current === 'name' ? nameRef.current : pwRef.current;
    focusNext.current = null;
    el?.focus({ preventScroll: true });
  });

  const waiting = wait !== null;
  const filled = name.trim().length > 0 && password.length > 0;
  const canSubmit = filled && !work.on && !waiting && (!check || ts.ready);

  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    const n = name.trim();
    // A name that cannot be a user name has no account: the same words, and nothing is sent.
    if (checkName(n) !== null) {
      setPassword('');
      setError(WRONG_LOGIN);
      focusNext.current = 'password';
      return;
    }
    let token: string | null = null;
    if (check) {
      token = ts.take();
      if (!token) return setError(failureWords('turnstile_required', 'login'));
    }
    setError(null);
    handle.current ??= startLogin(n, password);
    const hd = handle.current;
    const signal = work.start();
    const r = await hd.submit({ ...(token ? { turnstile: token } : {}), onStep: work.onStep, signal });
    if (!alive.current) return;
    work.stop();
    if (r.ok) {
      setPassword('');
      go(nav, 'account');
      return;
    }
    if (hd.finished && handle.current === hd) handle.current = null;
    focusNext.current = 'password';
    switch (r.code) {
      case 'cancelled':
        return;
      case 'invalid_login':
        setPassword('');
        setError(WRONG_LOGIN);
        return;
      case 'turnstile_required':
        setCheck(true);
        return;
      case 'locked':
        setWait(r.retryAfter ?? 15 * 60);
        return;
      default:
        setError(failureWords(r.code, 'login'));
    }
  };

  const back = work.orCancel(() => nav.pop());
  const toCreate = (): void => go(nav, 'create');
  const toRecover = (): void => go(nav, 'recover', name.trim() ? { name: name.trim() } : {});
  const keys = useFormKeys({
    stops: [
      { id: 'name', field: nameRef },
      { id: 'password', field: pwRef },
      { id: 'turnstile', focus: ts.focus, disabled: !check || waiting },
      { id: 'LOGIN', run: () => void submit(), disabled: !canSubmit },
      { id: 'create', run: toCreate },
      { id: 'recover', run: toRecover },
    ],
    submit: () => void submit(),
    canSubmit,
    back,
    busy: work.on,
    cancel: work.cancel,
  });

  const off = work.on || waiting;
  return (
    <Box title="Log in" onBack={back} class="wc-ac wc-ac-login" winClass="wc-ac-win">
      <form class="wc-ac-form" data-page="login" noValidate {...keys.form}>
        {p.notice && (
          <p class="wc-ac-notice" role="status">
            {p.notice}
          </p>
        )}
        <Field
          id="name"
          label="User name"
          mono
          name="username"
          autocomplete="username"
          maxLength={64}
          value={name}
          // (Open during the wait: the lock is the name's, and another name can be tried.)
          disabled={work.on}
          autoFocus={startAt === 'name'}
          inputRef={nameRef}
          onInput={(v) => {
            setName(v);
            setError(null);
            setWait(null);
            drop();
          }}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          name="password"
          autocomplete="current-password"
          value={password}
          disabled={off}
          autoFocus={startAt === 'password'}
          inputRef={pwRef}
          onInput={(v) => {
            setPassword(v);
            setError(null);
            drop();
          }}
        />
        <FormError text={waiting ? null : error} id="login" />
        {waiting && (
          <WaitPlate
            seconds={wait}
            onDone={() => {
              setWait(null);
              focusNext.current = 'password';
            }}
          />
        )}
        {check && !waiting && !work.on && <SmallNote class="wc-ac-ask">{failureWords('turnstile_required', 'login')}</SmallNote>}
        {/* Kept mounted while working and waiting: the widget is making the next token. */}
        <div hidden={off}>{ts.box}</div>
        {work.on ? (
          <Working work={work} />
        ) : (
          <div class="wc-lk-btns wc-ac-btns">
            <GlassButton id="LOGIN" label="Log in" primary disabled={!canSubmit} selected={keys.at === 'LOGIN'} onClick={() => void submit()} />
          </div>
        )}
        <div class="wc-lk-links">
          <TextLink id="create" label="Create account" selected={keys.at === 'create'} onClick={toCreate} />
          <i aria-hidden="true">·</i>
          <TextLink id="recover" label="Forgot password" selected={keys.at === 'recover'} onClick={toRecover} />
        </div>
      </form>
    </Box>
  );
});
