// Create account (stage 60, spec §7.2; mockup "Create account", variant
// 1: one page). On a wide box the form on the left and the six points on
// the right, the Turnstile widget and the button in a foot row; on a
// narrow one (a phone) one column: fields, the warning, the six points,
// Turnstile, the button. The layout follows the box's own width (a
// container query), never the device.
//
// - The user name's format is checked while it is typed. "Taken" can only
//   come after Create is pressed (the API has no "is this name free" call
//   by design: names must not be listable, ADR 0145), so it shows after
//   the Working state, on the name field.
// - The password: at least 10 characters, typed twice; the strength hint
//   is `passwordStrength` (length and variety, a hint and not a gate).
// - On success the recovery code page takes this page's place; there is
//   no way back to this form. `stored: false` (the account was made, this
//   browser could not keep its keys) still shows the code, and then sends
//   the player to Log in.
// - After a `timeout` or `offline` the same flow object is kept, so
//   pressing Create again finds the account it may already have made.

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type FlowHandle, type RegisterDone, checkName, startRegister } from '../../../cloud/account';
import { Box, BoxBody, Field, GlassButton, Plate, Rule, TextLink, lookFrame } from '../../kit/look';
import { useNav } from '../../kit/stack';
import { FormError, type PageProps, checkNewPassword, go, newPasswordHint, useFormKeys, useTallPage } from './form';
import { useTurnstile } from './turnstile-box';
import { NAME_HINT, PASSWORD_HINT, POINTS, failureWords, nameWords, takenWords } from './words';
import { Working, useWorking } from './working';

export const CreateFrame = lookFrame(function CreateFrame(_p: PageProps['create']): VNode {
  const nav = useNav();
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  /** A field was left once: its "too short" may show (not while the first characters are typed). */
  const [left, setLeft] = useState<{ name?: boolean; pw?: boolean; pw2?: boolean }>({});
  const [taken, setTaken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handle = useRef<FlowHandle<RegisterDone> | null>(null);
  const alive = useRef(true);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const pwRef = useRef<HTMLInputElement | null>(null);
  const pw2Ref = useRef<HTMLInputElement | null>(null);
  const focusNext = useRef<'name' | null>(null);
  const work = useWorking();
  const ts = useTurnstile(true);
  const tall = useTallPage();

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
    if (work.on || focusNext.current !== 'name') return;
    focusNext.current = null;
    nameRef.current?.focus({ preventScroll: true });
    nameRef.current?.select();
  });

  const nameProblem = checkName(name);
  const nameError =
    taken !== null && taken === name
      ? takenWords(name)
      : nameProblem === 'bad_characters' || nameProblem === 'too_long' || (nameProblem === 'too_short' && left.name)
        ? nameWords(nameProblem)
        : null;
  const { pwError, pw2Error, valid: pwValid } = checkNewPassword(pw, pw2, left);
  const valid = nameProblem === null && taken !== name && pwValid;
  const canSubmit = valid && ts.ready && !work.on;

  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    const token = ts.take();
    if (!token) return setError(failureWords('turnstile_required', 'register'));
    setError(null);
    handle.current ??= startRegister(name, pw);
    const hd = handle.current;
    const signal = work.start();
    const r = await hd.submit({ turnstile: token, onStep: work.onStep, signal });
    if (!alive.current) return;
    if (r.ok) {
      // The passwords leave the page's state with the page; the code is handed on once.
      go(nav, 'code', { name: r.value.account.name, code: r.value.recoveryCode, next: r.value.stored ? 'account' : 'login' });
      return;
    }
    work.stop();
    if (hd.finished && handle.current === hd) handle.current = null;
    if (r.code === 'cancelled') return;
    if (r.code === 'name_taken') {
      setTaken(name);
      focusNext.current = 'name';
      return;
    }
    setError(failureWords(r.code, 'register'));
  };

  const back = (): void => go(nav, 'login');
  const keys = useFormKeys({
    stops: [
      { id: 'name', field: nameRef },
      { id: 'password', field: pwRef },
      { id: 'again', field: pw2Ref },
      { id: 'turnstile', focus: ts.focus },
      { id: 'CREATE', run: () => void submit(), disabled: !canSubmit },
      { id: 'login', run: back },
    ],
    submit: () => void submit(),
    canSubmit,
    back,
    busy: work.on,
    cancel: work.cancel,
  });

  const off = work.on;
  return (
    <Box title="Create account" onBack={back} tall={tall} class="wc-ac wc-ac-create" winClass="wc-ac-win">
      <BoxBody class="wc-ac-body" scroll={tall}>
        <form class="wc-ac-form" data-page="create" noValidate {...keys.form}>
          <div class="wc-ac-cols">
            <div class="wc-ac-col">
              <Field
                id="name"
                label="User name"
                mono
                name="username"
                autocomplete="username"
                maxLength={20}
                value={name}
                disabled={off}
                autoFocus
                inputRef={nameRef}
                hint={NAME_HINT}
                error={nameError}
                onInput={(v) => {
                  setName(v);
                  setError(null);
                  drop();
                }}
                onCommit={() => setLeft((l) => ({ ...l, name: true }))}
              />
              <Field
                id="password"
                label="Password"
                type="password"
                name="new-password"
                autocomplete="new-password"
                value={pw}
                disabled={off}
                inputRef={pwRef}
                hint={newPasswordHint(pw, name, PASSWORD_HINT)}
                error={pwError}
                onInput={(v) => {
                  setPw(v);
                  setError(null);
                  drop();
                }}
                onCommit={() => setLeft((l) => ({ ...l, pw: true }))}
              />
              <Field
                id="again"
                label="Password again"
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
              <Plate id="mume">
                <b>Not your MUME password.</b> The account never needs it, and it should not be in two places.
              </Plate>
            </div>
            <div class="wc-ac-col wc-ac-points-col">
              <Rule title="What happens to your data" />
              <ol class="wc-ac-points">
                {POINTS.map(([lead, text]) => (
                  <li key={lead}>
                    <b>{lead}.</b> {text}
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div class={'wc-ac-foot' + (work.on ? ' is-working' : '')}>
            {/* Kept mounted while working: a failed try finds the next token ready. */}
            <div class="wc-ac-foot-l" hidden={work.on}>
              {ts.box}
            </div>
            {work.on ? (
              <Working work={work} />
            ) : (
              <div class="wc-ac-foot-r">
                <FormError text={error} id="create" />
                <div class="wc-lk-btns wc-ac-btns">
                  <GlassButton id="CREATE" label="Create account" primary disabled={!canSubmit} selected={keys.at === 'CREATE'} onClick={() => void submit()} />
                </div>
                <div class="wc-ac-alt">
                  <TextLink id="login" label="I have an account: log in" selected={keys.at === 'login'} onClick={back} />
                </div>
              </div>
            )}
          </div>
        </form>
      </BoxBody>
    </Box>
  );
});
