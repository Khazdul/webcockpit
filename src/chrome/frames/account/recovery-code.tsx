// The recovery code, shown once (stage 60, spec §7.2; mockup "Recovery
// code"): the code in six groups (one row on a wide box, two rows of
// three on a narrow one), Copy, Download as a text file, the "only way
// back" plate, and "type its last group" before the way on lights.
//
// Two parts:
//
//   useRecoveryCode + RecoveryCodeView   the REUSABLE part (the Account
//       page's "New recovery code" dialog shows the code again with it)
//   RecoveryCodeFrame                    the page after Create account
//
// HOW TO USE THE VIEW (the next page's author):
//
//   const rc = useRecoveryCode(name, code);       // code: canonical, XXXX-XXXX-…
//   <RecoveryCodeView
//     rc={rc}
//     lead={<>Your new recovery code. The old one has stopped working.</>}
//     at={keys.at}                                // the keyboard's cursor ('COPY' | 'DOWNLOAD'), or null
//     action={<GlassButton id="CONTINUE" label="Done" primary disabled={!rc.confirmed} onClick={…} />}
//   />
//
//   rc.confirmed     the last group was typed right (`lastGroupMatches`)
//   rc.field         the "Last group" input's ref (a Tab stop)
//   rc.copy(), rc.download()   for the page's own key stops; the view's
//                    buttons call them, and its own line says "Copied."
//
// A view inside a `Dialog` gives it the keys: the field takes the typing,
// and the dialog's primary button should be the way on, disabled until
// `rc.confirmed`.
//
// The code is in memory only: in the props and in this component. It is
// never written to storage, to a log or into the address. Copy puts it on
// the clipboard and Download makes a file because the player asked. The
// file names the site and the user name and says what the code is for;
// never the password.
//
// The page has no Back and takes Esc itself, and it stands in the place
// of the Create account page (`go` replaces), so nothing in the frame
// stack leads back to it or pops it. Should the page be taken down all
// the same before the last group is typed, the code is still held
// (form.tsx `holdCode`) and the next account page shows it again. A
// reload loses the code (the browser asks first, while it is held); a new
// code can be made on the Account page.

import type { ComponentChildren, VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { lastGroupMatches } from '../../../cloud/account';
import { downloadBlob } from '../../kit/download';
import { Box, Field, GlassButton, LookFlash, Plate, Well, lookFrame, useLocalFlash } from '../../kit/look';
import { type Flash, useNav } from '../../kit/stack';
import { type PageProps, SmallNote, go, holdCode, releaseCode, useFormKeys } from './form';
import { recoveryFile } from './words';

export interface RecoveryCodeHandle {
  name: string;
  code: string;
  /** What is typed in "Last group". */
  typed: string;
  setTyped(v: string): void;
  /** The last group was typed right. */
  confirmed: boolean;
  field: { current: HTMLInputElement | null };
  copy(): void;
  download(): void;
  flash: Flash | null;
}

/** Puts `text` on the clipboard; false when the browser would not. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* not allowed here: the old way below */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.cssText = 'position:fixed;left:-999px;top:0;opacity:0';
    document.body.append(el);
    const back = document.activeElement as HTMLElement | null;
    el.select();
    const ok = document.execCommand('copy');
    el.remove();
    back?.focus?.({ preventScroll: true });
    return ok;
  } catch {
    return false;
  }
}

export function useRecoveryCode(name: string, code: string): RecoveryCodeHandle {
  const [typed, setTyped] = useState('');
  const field = useRef<HTMLInputElement | null>(null);
  const [flash, show] = useLocalFlash();
  return {
    name,
    code,
    typed,
    setTyped,
    confirmed: lastGroupMatches(code, typed),
    field,
    copy: () => {
      void copyText(code).then((ok) => (ok ? show('Copied.') : show('It could not be copied here: select the code and copy it by hand.', 'fail', 6000)));
    },
    download: () => {
      try {
        const site = typeof location === 'undefined' ? '' : location.host;
        const f = recoveryFile({ name, code, site, date: new Date().toISOString().slice(0, 10) });
        downloadBlob(new Blob([f.text], { type: 'text/plain;charset=utf-8' }), f.name);
        show('Saved as a text file.');
      } catch {
        show('The file could not be made: write the code down instead.', 'fail', 6000);
      }
    },
    flash,
  };
}

export function RecoveryCodeView(p: {
  rc: RecoveryCodeHandle;
  /** The line over the code. */
  lead: ComponentChildren;
  /** The keyboard's cursor: `COPY` or `DOWNLOAD` (the page's stops), or null. */
  at?: string | null;
  /** The way on (a button), beside the field. */
  action?: ComponentChildren;
  /** A line under the "shown once" note (the account was made but this device is not logged in). */
  extra?: ComponentChildren;
  autoFocus?: boolean;
}): VNode {
  const rc = p.rc;
  const groups = rc.code.split('-');
  return (
    <div class="wc-ac-codeview">
      <p class="wc-lk-lead wc-ac-lead">{p.lead}</p>
      <Well class="wc-ac-code">
        <span class="wc-ac-code-g" role="group" aria-label="Recovery code" data-code="">
          {groups.map((g, i) => (
            <span key={i} class="wc-ac-code-p">
              {i > 0 && (
                <i class="wc-ac-code-d" aria-hidden="true">
                  -
                </i>
              )}
              <span>{g}</span>
            </span>
          ))}
        </span>
      </Well>
      <div class="wc-lk-btns wc-ac-btns wc-ac-code-btns">
        <GlassButton id="COPY" label="Copy" icon="duplicate" selected={p.at === 'COPY'} onClick={rc.copy} />
        <GlassButton id="DOWNLOAD" label="Download as a text file" icon="export" selected={p.at === 'DOWNLOAD'} onClick={rc.download} />
      </div>
      <LookFlash class="wc-ac-code-flash" flash={rc.flash} />
      <Plate id="only" class="wc-ac-only">
        <b>This is the only way back</b> if you forget the password. We cannot reset it and cannot read your data: there is no e-mail and no back door.
      </Plate>
      <SmallNote>
        It is shown this once. Keep it where you keep other keys: a password manager, or on paper. You can make a new one later on the Account page.
      </SmallNote>
      {p.extra}
      <p class="wc-ac-confirm-t">To show that you have kept it, type its last group.</p>
      <div class="wc-ac-confirm">
        <Field
          id="last"
          label="Last group"
          mono
          maxLength={8}
          placeholder="····"
          value={rc.typed}
          inputRef={rc.field}
          autoFocus={p.autoFocus ?? false}
          onInput={rc.setTyped}
        />
        {p.action}
      </div>
    </div>
  );
}

/** The page after Create account: the code, then on to the Account page (or to Log in, when this device could not keep the keys). */
export const RecoveryCodeFrame = lookFrame(function RecoveryCodeFrame(p: PageProps['code']): VNode {
  const nav = useNav();
  const rc = useRecoveryCode(p.name, p.code);
  const toLogin = p.next === 'login';

  // Held from here (too) until the player goes on: a page that is taken down early loses nothing.
  useEffect(() => holdCode({ name: p.name, code: p.code, next: p.next }), []);

  const on = (): void => {
    if (!rc.confirmed) return;
    releaseCode();
    if (toLogin) go(nav, 'login', { name: p.name, notice: 'The account is made. Log in to use it on this device.' });
    else go(nav, 'account');
  };

  // (A reload or a closed tab loses the code: the browser asks first while it is held, form.tsx.)

  const keys = useFormKeys({
    stops: [
      { id: 'last', field: rc.field },
      { id: 'COPY', run: rc.copy },
      { id: 'DOWNLOAD', run: rc.download },
      { id: 'CONTINUE', run: on, disabled: !rc.confirmed },
    ],
    submit: on,
    canSubmit: rc.confirmed,
    // No way back: Esc does nothing here.
    back: () => {},
  });

  return (
    <Box title="Recovery code" noBack class="wc-ac wc-ac-codepage" winClass="wc-ac-win">
      <form class="wc-ac-form" data-page="code" noValidate {...keys.form}>
        <RecoveryCodeView
          rc={rc}
          autoFocus
          at={keys.at}
          lead={
            <>
              The account <b>{p.name}</b> is made. This is its recovery code.
            </>
          }
          extra={
            toLogin ? (
              <SmallNote class="wc-ac-nokeys">
                <b>You are not logged in here yet:</b> this browser could not keep the account’s keys (a private window, or storage is blocked). Keep the code, then
                log in.
              </SmallNote>
            ) : null
          }
          action={
            <div class="wc-lk-btns">
              <GlassButton id="CONTINUE" label="Continue" primary disabled={!rc.confirmed} selected={keys.at === 'CONTINUE'} onClick={on} />
            </div>
          }
        />
      </form>
    </Box>
  );
});
