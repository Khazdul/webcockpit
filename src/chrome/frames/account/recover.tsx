// Recovery, "Forgot password" (stage 60, spec §7.2; mockup "Recovery"):
// user name, recovery code, a new password twice, Turnstile. It says what
// happens (every device is logged out, this one logs in, the code stays
// the same) and what holds if the code is lost too.
//
// - The code is read as typed or pasted: case, spaces and dashes do not
//   matter (`checkRecoveryCode`).
// - The recovery is two calls behind one flow object. The first needs a
//   Turnstile token; if the second fails on the network the same object
//   is submitted again without one (`needsTurnstile` is then false; its
//   ticket is good for 15 minutes).
// - `invalid_recovery`: one message for a wrong name or a wrong code;
//   `locked`: the countdown.

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type Account, type FlowHandle, checkName, checkRecoveryCode, startRecover } from '../../../cloud/account';
import { Box, BoxBody, Field, GlassButton, lookFrame } from '../../kit/look';
import { useNav } from '../../kit/stack';
import { FormError, type PageProps, SmallNote, WaitPlate, checkNewPassword, go, newPasswordHint, useFormKeys, useTallPage } from './form';
import { useTurnstile } from './turnstile-box';
import { CODE_HINT, CODE_PLACEHOLDER, NEW_PASSWORD_HINT, WRONG_RECOVERY, failureWords } from './words';
import { Working, useWorking } from './working';

export const RecoverFrame = lookFrame(function RecoverFrame(p: PageProps['recover']): VNode {
  const nav = useNav();
  const [name, setName] = useState(p.name ?? '');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [left, setLeft] = useState<{ code?: boolean; pw?: boolean; pw2?: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState<number | null>(null);
  /** The first call is done: the next submit needs no token. */
  const [second, setSecond] = useState(false);
  const handle = useRef<FlowHandle<Account> | null>(null);
  const alive = useRef(true);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const codeRef = useRef<HTMLInputElement | null>(null);
  const pwRef = useRef<HTMLInputElement | null>(null);
  const pw2Ref = useRef<HTMLInputElement | null>(null);
  const focusNext = useRef<'code' | null>(null);
  const [startAt] = useState<'name' | 'code'>(() => (name ? 'code' : 'name'));
  const work = useWorking();
  const ts = useTurnstile(true);
  const tall = useTallPage();

  const drop = (): void => {
    handle.current?.dispose();
    handle.current = null;
    setSecond(false);
  };
  useEffect(
    () => () => {
      alive.current = false;
      handle.current?.dispose();
      handle.current = null;
    },
    [],
  );
  useEffect(() => {
    if (work.on || wait !== null || focusNext.current !== 'code') return;
    focusNext.current = null;
    codeRef.current?.focus({ preventScroll: true });
    codeRef.current?.select();
  });

  const waiting = wait !== null;
  const n = name.trim();
  const canonical = checkRecoveryCode(code);
  const codeError = code.trim().length > 0 && canonical === null && left.code ? 'A recovery code is six groups of four letters and digits.' : null;
  const { pwError, pw2Error, valid: pwValid } = checkNewPassword(pw, pw2, left);
  const valid = checkName(n) === null && canonical !== null && pwValid;
  const canSubmit = valid && !work.on && !waiting && (second || ts.ready);

  const submit = async (): Promise<void> => {
    if (!canSubmit || canonical === null) return;
    handle.current ??= startRecover(n, canonical, pw);
    const hd = handle.current;
    const again = !hd.needsTurnstile;
    let token: string | null = null;
    if (!again) {
      token = ts.take();
      if (!token) return setError(failureWords('turnstile_required', 'recover'));
    }
    setError(null);
    const signal = work.start();
    const r = await hd.submit({ ...(token ? { turnstile: token } : {}), onStep: work.onStep, signal });
    if (!alive.current) return;
    if (r.ok) {
      go(nav, 'account');
      nav.flash('The new password is set. Every other device was logged out.');
      return;
    }
    work.stop();
    if (hd.finished) {
      if (handle.current === hd) handle.current = null;
      setSecond(false);
    } else setSecond(!hd.needsTurnstile);
    switch (r.code) {
      case 'cancelled':
        return;
      case 'invalid_recovery':
        focusNext.current = 'code';
        // The second call was refused: its ticket ran out (the code itself was accepted a moment ago).
        setError(again ? 'The recovery took more than 15 minutes. Press Set new password once more.' : WRONG_RECOVERY);
        return;
      case 'locked':
        setWait(r.retryAfter ?? 15 * 60);
        return;
      default:
        setError(failureWords(r.code, 'recover'));
    }
  };

  const back = (): void => go(nav, 'login', n ? { name: n } : {});
  const keys = useFormKeys({
    stops: [
      { id: 'name', field: nameRef },
      { id: 'code', field: codeRef },
      { id: 'password', field: pwRef },
      { id: 'again', field: pw2Ref },
      { id: 'turnstile', focus: ts.focus, disabled: waiting || second },
      { id: 'SET', run: () => void submit(), disabled: !canSubmit },
    ],
    submit: () => void submit(),
    canSubmit,
    back,
    busy: work.on,
    cancel: work.cancel,
  });

  const off = work.on || waiting;
  const edited = (): void => {
    setError(null);
    drop();
  };
  return (
    <Box title="Recovery" onBack={back} tall={tall} class="wc-ac wc-ac-recover" winClass="wc-ac-win">
      <BoxBody class="wc-ac-body" scroll={tall}>
        <form class="wc-ac-form" data-page="recover" noValidate {...keys.form}>
          <p class="wc-lk-lead wc-ac-lead">With your recovery code you set a new password. Your data stays as it is.</p>
          <Field
            id="name"
            label="User name"
            mono
            name="username"
            autocomplete="username"
            maxLength={64}
            value={name}
            // (Open during the wait: the lock is the name's.)
            disabled={work.on}
            autoFocus={startAt === 'name'}
            inputRef={nameRef}
            onInput={(v) => {
              setName(v);
              setWait(null);
              edited();
            }}
          />
          <Field
            id="code"
            label="Recovery code"
            mono
            name="recovery-code"
            maxLength={64}
            placeholder={CODE_PLACEHOLDER}
            value={code}
            disabled={off}
            autoFocus={startAt === 'code'}
            inputRef={codeRef}
            hint={error ? undefined : CODE_HINT}
            error={codeError}
            onInput={(v) => {
              setCode(v);
              edited();
            }}
            onCommit={() => setLeft((l) => ({ ...l, code: true }))}
          />
          <FormError text={waiting ? null : error} id="recover" />
          <div class="wc-ac-pair">
            <Field
              id="password"
              label="New password"
              type="password"
              name="new-password"
              autocomplete="new-password"
              value={pw}
              disabled={off}
              inputRef={pwRef}
              hint={newPasswordHint(pw, n, NEW_PASSWORD_HINT)}
              error={pwError}
              onInput={(v) => {
                setPw(v);
                edited();
              }}
              onCommit={() => setLeft((l) => ({ ...l, pw: true }))}
            />
            <Field
              id="again"
              label="New password again"
              type="password"
              name="new-password-again"
              autocomplete="new-password"
              value={pw2}
              disabled={off}
              inputRef={pw2Ref}
              error={pw2Error}
              onInput={(v) => {
                setPw2(v);
                setError(null);
              }}
              onCommit={() => setLeft((l) => ({ ...l, pw2: true }))}
            />
          </div>
          {waiting && (
            <WaitPlate
              seconds={wait}
              onDone={() => {
                setWait(null);
                focusNext.current = 'code';
              }}
            >
              Nobody can use a recovery code for this name until the time is up, from any device. Nothing is wrong with the account.
            </WaitPlate>
          )}
          {/* Kept mounted while working: a failed try finds the next token ready. */}
          <div hidden={off || second}>{ts.box}</div>
          {work.on ? (
            <Working work={work} what="new key" />
          ) : (
            <div class="wc-lk-btns wc-ac-btns">
              <GlassButton id="SET" label="Set new password" primary disabled={!canSubmit} selected={keys.at === 'SET'} onClick={() => void submit()} />
            </div>
          )}
          <SmallNote class="wc-ac-foot-note">Every device is logged out, this one logs in. The recovery code stays the same.</SmallNote>
          <SmallNote class="wc-ac-foot-note">
            <b>Lost the code too?</b> Then nobody can open the cloud copy, us included. What is on your devices is untouched: make a new account and it goes
            there.
          </SmallNote>
        </form>
      </BoxBody>
    </Box>
  );
});
