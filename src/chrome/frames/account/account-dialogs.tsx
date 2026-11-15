// The Account page's dialogs (stage 60, spec §7.2; mockup "Dialogs"),
// each an overlay frame over the page (`nav.push(…, { overlay: true })`)
// drawing the kit's `Dialog`:
//
//   LogoutDialog     ac-logout     in an account's space (stage 61): refused,
//                                  syncing first, all in the account, or
//                                  the rows of what is not; else a plain confirm
//   EndDialog        ac-end        one session, or every other one
//                    ac-endall
//   PasswordDialog   ac-password   current password, the new one twice
//   NewCodeDialog    ac-newcode    asks the password, then shows the new
//                    ac-newcode-shown   code (the last-group gate)
//   DeleteDialog     ac-delete     the password and the typed user name
//
// Keys. The two without fields have key letters, as elsewhere in the kit
// (Enter is the lit button). The three with fields have none: Tab walks
// the fields and then the buttons, Enter presses the cursor's button or
// else the lit one, Esc cancels (`useFormKeys` as a key layer; the dialog
// draws its cursor). Enter never deletes by default: in Delete account
// the cursor rests on Cancel, and Delete is reached with Tab or a press.
//
// Every flow goes through the page's host (`host().track`), and one answer
// is the same everywhere: `unauthorized`, `not_logged_in` or
// `wrong_account` means the session is gone and the device is already
// logged out, so the dialogs close and Log in says why (`gone`).
//
// A change whose answer was lost (`work.doubtful`: the request left, the
// answer did not come, whatever the code) is said as "may or may not have
// been made" in all three dialogs with a password, never as "the server
// was not reached".
//
// While a dialog works its Cancel and Esc are the Working state's Cancel
// (nothing from `sending` on). The new recovery code pins the page from
// the moment it is asked for until its last group is typed (`host.pin`):
// nothing from outside closes that dialog.
//
// What went wrong is said on the dialog's own error line, over the
// buttons: it stays in sight when the text above scrolls (a phone on its
// side with our keyboard up).
//
// Passwords live in a dialog's state only while it is up; a dialog that
// closes is unmounted. The new recovery code lives in the dialog's state
// until Done, and nowhere else.

import type { ComponentChildren, VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  type FlowResult,
  changePassword,
  deleteAccount,
  endOtherSessions,
  endSession,
  logout,
  newRecoveryCode,
} from '../../../cloud/account';
import { deleteHandBack, leaveAccount, setLeaving as setLeavingSpace } from '../../../cloud/space/flows';
import { idbLocalItems, idbSyncRecords } from '../../../cloud/space/local';
import { pendingChanges, runCounts, spaceDb } from '../../../cloud/space/spaces';
import { loggedOutAnywayWords, loggedOutWords } from '../../../cloud/space/words';
import type { Unsynced } from '../../../cloud/sync/types';
import { syncNow, syncView, unsyncedNow } from '../../../cloud/sync-view';
import { currentSpace, gameRunningElsewhere } from '../../../core/space';
import { downloadProfile } from '../../../profiles/download';
import { backupFileName } from '../../../runs/library';
import { formatScriptBackup, scriptBackupFileName } from '../../../scripts/backup';
import { downloadBlob } from '../../kit/download';
import { useServices } from '../../kit/hooks';
import { Dialog, Field, GlassButton, Icon, KeyLabel, Plate, letterOf, lookFrame } from '../../kit/look';
import { useKeyLayer, useNav } from '../../kit/stack';
import { openHistory } from '../history';
import { endOthersWords, namesAccount } from './account-model';
import type { AccountHost } from './account-page';
import { SmallNote, WaitPlate, checkNewPassword, newPasswordHint, useFormKeys } from './form';
import { RecoveryCodeView, useRecoveryCode } from './recovery-code';
import { NEW_PASSWORD_HINT, failureWords, lostWords } from './words';
import { Working, useWorking } from './working';

type Host = () => AccountHost;

/** What the Log in page says after a log out the server did not hear of. */
export const LOGOUT_UNREACHED =
  'Logged out on this device. The server was not reached, so this session may still be listed on your other devices until it is ended there or runs out.';

/**
 * A failed flow whose answer needs no words in the dialog: the player's
 * own Cancel, or the session is gone (the page leaves for Log in). True:
 * nothing more to do.
 */
function gone(host: AccountHost, r: FlowResult<unknown>): boolean {
  if (r.ok) return false;
  if (r.code === 'cancelled') return true;
  if (r.code !== 'unauthorized' && r.code !== 'not_logged_in' && r.code !== 'wrong_account') return false;
  host.toLogin(failureWords(r.code, 'account'));
  return true;
}

/** True until the dialog is unmounted. */
function useAlive(): { current: boolean } {
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  return alive;
}

/** The dialog's text, left-aligned (a dialog with fields, or more than a question). */
function Body(p: { children?: ComponentChildren }): VNode {
  return <div class="wc-ac-dlg">{p.children}</div>;
}

// ------------------------------------------------------------ Log out

/** What Log out would remove that is not in the account (spec §7.4, Log out 3–4). */
interface Left {
  changes: Unsynced[];
  saved: number;
  unsaved: number;
}

type LogoutPhase = 'plain' | 'checking' | 'refused' | 'syncing' | 'ask';

/**
 * Log out. In an account's space (stage 61, the owner's pick 4): refused
 * while a game runs on it in another tab; what waits is synced first
 * (Cancel only); then the question alone when everything is in the
 * account (Enter logs out), or a row for each thing that is not (Stay
 * logged in is Enter, Download, Log out anyway; only unsaved runs left:
 * Enter logs out). Logged out, the account's copy goes and the start
 * menu says so. Outside a space (the flag `sync` off) stage 60's plain
 * question.
 */
export const LogoutDialog = lookFrame(function LogoutDialog(p: { host: Host }): VNode {
  const nav = useNav();
  const alive = useAlive();
  const services = useServices();
  const busy = useRef(false);
  const [space] = useState(currentSpace);
  const [phase, setPhase] = useState<LogoutPhase>(space.kind === 'account' ? 'checking' : 'plain');
  const [left, setLeft] = useState<Left | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [offline, setOffline] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = p.host().name;

  useEffect(() => {
    if (space.kind !== 'account') return;
    const open = spaceDb(space.nameKey);
    void (async () => {
      if (await gameRunningElsewhere(space)) {
        if (alive.current) setPhase('refused');
        return;
      }
      const st = syncView().status;
      if (st) {
        setWaiting(st.waiting);
        setPhase('syncing');
        const outcome = await syncNow();
        if (!alive.current) return;
        setOffline(!!outcome && outcome.type !== 'synced');
      }
      const changes = (await unsyncedNow().catch(() => null)) ?? (await pendingChanges(idbLocalItems(open), idbSyncRecords(open, () => 'device')));
      const runs = await runCounts(open).catch(() => ({ saved: 0, unsaved: 0 }));
      if (!alive.current) return;
      setLeft({ changes, ...runs });
      setPhase('ask');
    })().catch(() => {
      if (alive.current) setPhase('plain');
    });
  }, []);

  const cancel = (): void => {
    if (!busy.current) nav.pop();
  };
  const out = async (anyway: boolean): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    const inSpace = space.kind === 'account';
    // A game may have started in another tab since the dialog opened: asked again at the last moment.
    if (inSpace && (await gameRunningElsewhere(space))) {
      busy.current = false;
      if (alive.current) {
        setWorking(false);
        setPhase('refused');
      }
      return;
    }
    const host = p.host();
    host.setLeaving(true);
    if (inSpace) setLeavingSpace(true);
    const r = await host.track(logout());
    if (!r.ok) {
      // (It does not fail; if it ever does, the player is still logged in and is told.)
      busy.current = false;
      host.setLeaving(false);
      if (inSpace) setLeavingSpace(false);
      if (alive.current) {
        setWorking(false);
        setError(failureWords(r.code, 'account'));
      }
      return;
    }
    if (inSpace) {
      const said = anyway ? loggedOutAnywayWords(name) : loggedOutWords(name);
      const unreached = r.value.server === 'unreached' ? ' The server was not reached: this session may still be listed on your other devices for a while.' : '';
      if (await leaveAccount(said + unreached)) return;
    }
    if (r.value.server === 'unreached') host.toLogin(LOGOUT_UNREACHED);
    else host.toMenu('Logged out.');
  };
  const download = async (): Promise<void> => {
    const l = left;
    if (!l) return;
    const day = new Date();
    const recs = services.scripts?.backupRecords();
    if (recs && recs.scripts.length > 0) downloadBlob(new Blob([formatScriptBackup(recs)], { type: 'application/json;charset=utf-8' }), scriptBackupFileName(day));
    for (const u of l.changes) {
      if (u.kind !== 'profile' || u.change === 'delete' || !u.name) continue;
      const rec = await services.profiles.get(u.name).catch(() => null);
      if (rec) downloadProfile(rec.name, rec.text);
    }
    if (l.saved + l.unsaved > 0) {
      try {
        downloadBlob(await (await services.runs()).backup(), backupFileName(day));
      } catch {
        /* History's own backup says why */
      }
    }
  };
  const history = (): void => {
    if (busy.current) return;
    nav.pop(nav.depth() - 1);
    openHistory(nav);
  };
  // Once the log out has started every key is held; H opens History from the unsaved runs' row.
  useKeyLayer((e) => {
    if (busy.current) return true;
    if (phase === 'ask' && left && left.unsaved > 0 && letterOf(e) === 'h') {
      if (!e.repeat) history();
      return true;
    }
    return false;
  });

  const question = (
    <p class="wc-lk-q">
      Log out of <b class="wc-ac-who">{name}</b> on this device?
    </p>
  );
  if (phase === 'refused') {
    return (
      <Dialog title="Log out" dlg="ac-logout" width={420} onCancel={cancel} buttons={[{ id: 'OK', label: 'OK', letter: 'o', primary: true, run: cancel }]}>
        <p class="wc-lk-q" data-logout="refused">
          A game is running in another tab.
        </p>
        <p class="wc-lk-qn">Log out when it has ended.</p>
      </Dialog>
    );
  }
  if (phase === 'checking' || phase === 'syncing') {
    return (
      <Dialog title="Log out" dlg="ac-logout" width={480} onCancel={cancel} buttons={[{ id: 'CANCEL', label: 'Cancel', letter: 'c', run: cancel }]}>
        {question}
        <p class="wc-ac-dwork" data-logout="syncing">
          <span class="wc-so-mark is-pulse" aria-hidden="true" />
          <span>
            {phase === 'syncing'
              ? `Syncing before you log out…${waiting > 0 ? ` ${waiting} change${waiting === 1 ? '' : 's'}` : ''}`
              : 'Looking at what is on this device…'}
          </span>
        </p>
      </Dialog>
    );
  }
  if (phase === 'ask' && left && (left.changes.length > 0 || left.saved > 0 || left.unsaved > 0)) {
    const onlyUnsaved = left.changes.length === 0 && left.saved === 0;
    const n = left.changes.length;
    return (
      <Dialog
        title="Log out"
        dlg="ac-logout"
        width={560}
        error={error}
        onCancel={cancel}
        buttons={[
          { id: 'STAY', label: 'Stay logged in', letter: 's', primary: !onlyUnsaved, disabled: working, run: cancel },
          { id: 'DOWNLOAD', label: 'Download', letter: 'd', disabled: working, run: () => void download() },
          onlyUnsaved
            ? { id: 'OUT', label: 'Log out', letter: 'l', primary: true, disabled: working, run: () => void out(false) }
            : { id: 'OUT', label: 'Log out anyway', letter: 'l', danger: true, disabled: working, run: () => void out(true) },
        ]}
      >
        <div class="wc-ac-dlg" data-logout="some">
          {question}
          <p class="wc-lk-qn">
            {onlyUnsaved
              ? 'Everything else is in your account. Logging out removes these from this device:'
              : 'Not everything is in your account yet. Logging out removes these from this device:'}
          </p>
          <ul class="wc-ac-dlist is-rows">
            {n > 0 && (
              <li data-row="changes">
                <span class="wc-so-mark is-ring" aria-hidden="true" />
                <span>
                  <b>
                    {n} change{n === 1 ? '' : 's'}
                  </b>{' '}
                  not synced{offline && <i> (the server could not be reached)</i>}
                </span>
              </li>
            )}
            {left.saved > 0 && (
              <li data-row="saved">
                <Icon name="save" />
                <span>
                  <b>
                    {left.saved} saved run{left.saved === 1 ? '' : 's'}
                  </b>{' '}
                  on this device only
                </span>
              </li>
            )}
            {left.unsaved > 0 && (
              <li data-row="unsaved">
                <Icon name="hourglass" />
                <span>
                  <b>
                    {left.unsaved} unsaved run{left.unsaved === 1 ? '' : 's'}
                  </b>{' '}
                  of the last 14 days —{' '}
                  <button type="button" class="wc-lk-link wc-ac-inlink" tabIndex={-1} onClick={history}>
                    open <KeyLabel text="History" letter="h" />
                  </button>{' '}
                  to save them
                </span>
              </li>
            )}
          </ul>
        </div>
      </Dialog>
    );
  }
  const all = phase === 'ask';
  return (
    <Dialog
      title="Log out"
      dlg="ac-logout"
      width={all ? 480 : undefined}
      error={error}
      onCancel={cancel}
      buttons={[
        { id: 'CANCEL', label: 'Cancel', letter: 'c', disabled: working, run: cancel },
        { id: 'OUT', label: 'Log out', letter: 'l', primary: true, disabled: working, run: () => void out(false) },
      ]}
    >
      {question}
      {all ? (
        <p class="wc-lk-qn" data-logout="all">
          Everything is in your account. It is removed from this device, and you are back on this device’s own profiles, scripts and runs.
        </p>
      ) : (
        <p class="wc-lk-qn">Your profiles, scripts and runs on this device stay as they are.</p>
      )}
    </Dialog>
  );
});

// ------------------------------------------------------------ End session, End all others

/** Ends one session (`session`) or every other one (`others`: how many there are). */
export const EndDialog = lookFrame(function EndDialog(p: { host: Host; session?: { id: string; label: string }; others?: number }): VNode {
  const nav = useNav();
  const alive = useAlive();
  const busy = useRef(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const one = p.session;
  const all = endOthersWords(p.others ?? 1);
  const cancel = (): void => {
    if (!busy.current) nav.pop();
  };
  const end = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    setError(null);
    const host = p.host();
    const r = await host.track(one ? endSession(one.id) : endOtherSessions());
    busy.current = false;
    if (gone(host, r) || !alive.current) return;
    // Whatever was answered, the list shows what the server holds now.
    host.reload();
    if (r.ok) {
      nav.pop();
      nav.flash(one ? 'The session is ended.' : 'The other sessions are ended.');
      return;
    }
    setWorking(false);
    setError(failureWords(r.code, 'account'));
  };
  useKeyLayer(() => busy.current);
  return (
    <Dialog
      title={one ? 'End session' : 'End all others'}
      dlg={one ? 'ac-end' : 'ac-endall'}
      error={error}
      onCancel={cancel}
      buttons={[
        { id: 'CANCEL', label: 'Cancel', letter: 'c', disabled: working, run: cancel },
        { id: 'END', label: one ? 'End' : all.button, letter: 'e', primary: true, disabled: working, run: () => void end() },
      ]}
    >
      {one ? (
        <>
          <p class="wc-lk-q">
            End the session on <b class="wc-ac-who">{one.label}</b>?
          </p>
          <p class="wc-lk-qn">That device is logged out. The data on it stays there, and it can log in again with the password.</p>
        </>
      ) : (
        <>
          <p class="wc-lk-q">{all.question}</p>
          <p class="wc-lk-qn">Only this device stays logged in. Do this if a device is lost; then change the password.</p>
        </>
      )}
    </Dialog>
  );
});

// ------------------------------------------------------------ Change password

export const PasswordDialog = lookFrame(function PasswordDialog(p: { host: Host }): VNode {
  const nav = useNav();
  const alive = useAlive();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [left, setLeft] = useState<{ pw?: boolean; pw2?: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState<number | null>(null);
  const curRef = useRef<HTMLInputElement | null>(null);
  const pwRef = useRef<HTMLInputElement | null>(null);
  const pw2Ref = useRef<HTMLInputElement | null>(null);
  const focusNext = useRef(false);
  const work = useWorking();
  const name = p.host().name;

  const waiting = wait !== null;
  useEffect(() => {
    if (work.on || waiting || !focusNext.current) return;
    focusNext.current = false;
    curRef.current?.focus({ preventScroll: true });
  });

  const check = checkNewPassword(pw, pw2, left);
  const canSubmit = cur.length > 0 && check.valid && !work.on && !waiting;

  const cancel = work.orCancel(() => nav.pop());
  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    setError(null);
    const host = p.host();
    const signal = work.start();
    const r = await host.track(changePassword(cur, pw, { onStep: work.onStep, signal }));
    if (!alive.current) return;
    const doubt = !r.ok && work.doubtful(r.code);
    work.stop();
    if (r.ok) {
      setCur('');
      setPw('');
      setPw2('');
      nav.pop();
      nav.flash('The password is changed. Your other devices were logged out.');
      host.reload();
      return;
    }
    focusNext.current = true;
    if (gone(host, r)) return;
    if (doubt) {
      // The other devices may be logged out already: the list shows it.
      host.reload();
      setError(`${lostWords('account')} The next time you log in, try the new password first; if it is refused, the old one still holds.`);
      return;
    }
    switch (r.code) {
      case 'invalid_login':
        setCur('');
        setError(failureWords(r.code, 'account'));
        return;
      case 'locked':
        setWait(r.retryAfter ?? 15 * 60);
        return;
      default:
        setError(failureWords(r.code, 'account'));
    }
  };

  const keys = useFormKeys({
    layer: true,
    stops: [
      { id: 'current', field: curRef },
      { id: 'password', field: pwRef },
      { id: 'again', field: pw2Ref },
      { id: 'CANCEL', run: cancel },
      { id: 'CHANGE', run: () => void submit(), disabled: !canSubmit },
    ],
    submit: () => void submit(),
    canSubmit,
    back: cancel,
    busy: work.on,
    cancel: work.cancel,
  });

  const off = work.on || waiting;
  return (
    <Dialog
      title="Change password"
      dlg="ac-password"
      width={460}
      error={waiting ? null : error}
      at={keys.at}
      onCancel={cancel}
      buttons={
        work.on
          ? []
          : [
              { id: 'CANCEL', label: 'Cancel', run: cancel },
              { id: 'CHANGE', label: 'Change', primary: true, disabled: !canSubmit, run: () => void submit() },
            ]
      }
    >
      <Body>
        <form class="wc-ac-dform" noValidate {...keys.form}>
          {/* For the browser's password manager: whose password this is. Never shown, never in the Tab ring. */}
          <input class="wc-ac-hidden" type="text" name="username" autocomplete="username" value={name} readOnly tabIndex={-1} aria-hidden="true" />
          <Field
            id="current"
            label="Current password"
            type="password"
            name="password"
            autocomplete="current-password"
            value={cur}
            disabled={off}
            autoFocus
            inputRef={curRef}
            onInput={(v) => {
              setCur(v);
              setError(null);
            }}
          />
          <Field
            id="password"
            label="New password"
            type="password"
            name="new-password"
            autocomplete="new-password"
            value={pw}
            disabled={off}
            inputRef={pwRef}
            hint={newPasswordHint(pw, name, NEW_PASSWORD_HINT)}
            error={check.pwError}
            onInput={(v) => {
              setPw(v);
              setError(null);
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
            error={check.pw2Error}
            onInput={(v) => {
              setPw2(v);
              setError(null);
            }}
            onCommit={() => setLeft((l) => ({ ...l, pw2: true }))}
          />
          {waiting && <WaitPlate seconds={wait} onDone={() => setWait(null)} />}
          {work.on ? (
            <>
              <Working work={work} what="new key" />
              <SmallNote class="wc-ac-twice">Two keys are made, one from the old password and one from the new: about twice as long as logging in.</SmallNote>
            </>
          ) : (
            <SmallNote>Your other devices are logged out. The recovery code stays the same.</SmallNote>
          )}
        </form>
      </Body>
    </Dialog>
  );
});

// ------------------------------------------------------------ New recovery code

/** The password is asked, the code is made, and the code is shown until its last group is typed. */
export const NewCodeDialog = lookFrame(function NewCodeDialog(p: { host: Host }): VNode {
  /** The new code, once the server has taken it. In this state only. */
  const [code, setCode] = useState<string | null>(null);
  // Whatever becomes of this dialog, the page's pin does not outlive it.
  useEffect(() => () => p.host().pin(false), []);
  return code === null ? <AskCode host={p.host} made={setCode} /> : <ShownCode host={p.host} code={code} />;
});

function AskCode(p: { host: Host; made(code: string): void }): VNode {
  const nav = useNav();
  const alive = useAlive();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState<number | null>(null);
  /** The server may have taken a new code that nobody has seen. */
  const [lost, setLost] = useState(false);
  const pwRef = useRef<HTMLInputElement | null>(null);
  const focusNext = useRef(false);
  const work = useWorking();
  const name = p.host().name;

  const waiting = wait !== null;
  useEffect(() => {
    if (work.on || waiting || !focusNext.current) return;
    focusNext.current = false;
    pwRef.current?.focus({ preventScroll: true });
  });

  const canSubmit = password.length > 0 && !work.on && !waiting;
  const cancel = work.orCancel(() => nav.pop());
  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    setError(null);
    const host = p.host();
    const signal = work.start();
    // From here until the code's last group is typed nothing moves the page: a code the server has taken is shown.
    host.pin(true);
    const r = await host.track(newRecoveryCode(password, { signal, onStep: work.onStep }));
    if (r.ok) {
      // (Pinned: this dialog is still here.)
      setPassword('');
      p.made(r.value.recoveryCode);
      return;
    }
    host.pin(false);
    if (!alive.current) return;
    /** The new code was on its way to the server: an answer that is lost leaves the old code in doubt. */
    const doubt = work.doubtful(r.code);
    work.stop();
    focusNext.current = true;
    if (gone(host, r)) return;
    if (doubt) {
      // The password stays in the field: one press makes a new code again.
      setLost(true);
      return;
    }
    switch (r.code) {
      case 'invalid_login':
        setPassword('');
        setError(failureWords(r.code, 'account'));
        return;
      case 'locked':
        setWait(r.retryAfter ?? 15 * 60);
        return;
      default:
        setError(failureWords(r.code, 'account'));
    }
  };

  const label = lost ? 'Make a new code again' : 'Make new code';
  const keys = useFormKeys({
    layer: true,
    stops: [
      { id: 'password', field: pwRef },
      { id: 'CANCEL', run: cancel },
      { id: 'MAKE', run: () => void submit(), disabled: !canSubmit },
    ],
    submit: () => void submit(),
    canSubmit,
    back: cancel,
    busy: work.on,
    cancel: work.cancel,
  });

  const off = work.on || waiting;
  return (
    <Dialog
      title="New recovery code"
      dlg="ac-newcode"
      width={460}
      error={waiting ? null : error}
      at={keys.at}
      onCancel={cancel}
      buttons={
        work.on
          ? []
          : [
              { id: 'CANCEL', label: 'Cancel', run: cancel },
              { id: 'MAKE', label, primary: true, disabled: !canSubmit, run: () => void submit() },
            ]
      }
    >
      <Body>
        <form class="wc-ac-dform" noValidate {...keys.form}>
          <input class="wc-ac-hidden" type="text" name="username" autocomplete="username" value={name} readOnly tabIndex={-1} aria-hidden="true" />
          <p class="wc-lk-q">Make a new recovery code?</p>
          {lost ? (
            <Plate id="lost" class="wc-ac-lost">
              <b>Your old recovery code may no longer work, and the new one was not shown.</b> The server did not answer, so it may or may not have taken the new
              code. Make a new code again now: only a code you have seen can be used.
            </Plate>
          ) : (
            <p class="wc-ac-dtxt">The old code stops working at once. The new one is shown once, as the first was.</p>
          )}
          <Field
            id="password"
            label="Password"
            type="password"
            name="password"
            autocomplete="current-password"
            value={password}
            disabled={off}
            autoFocus
            inputRef={pwRef}
            onInput={(v) => {
              setPassword(v);
              setError(null);
            }}
          />
          {waiting && <WaitPlate seconds={wait} onDone={() => setWait(null)} />}
          {work.on && <Working work={work} />}
        </form>
      </Body>
    </Dialog>
  );
}

function ShownCode(p: { host: Host; code: string }): VNode {
  const nav = useNav();
  const rc = useRecoveryCode(p.host().name, p.code);
  const done = (): void => {
    if (!rc.confirmed) return;
    nav.pop();
    nav.flash('The new recovery code is in use. The old one no longer works.');
  };

  // A reload or a closed tab loses the code: the browser asks first, until the last group is typed.
  // And nothing moves the page under the code until then (another tab's log out waits: `host.pin`).
  const confirmed = rc.confirmed;
  useEffect(() => {
    p.host().pin(!confirmed);
    if (confirmed) return;
    const ask = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [confirmed]);

  const keys = useFormKeys({
    layer: true,
    stops: [
      { id: 'last', field: rc.field },
      { id: 'COPY', run: rc.copy },
      { id: 'DOWNLOAD', run: rc.download },
      { id: 'DONE', run: done, disabled: !rc.confirmed },
    ],
    submit: done,
    canSubmit: rc.confirmed,
    // No way out before the last group is typed: Esc does nothing until then.
    back: done,
  });

  return (
    <Dialog title="Recovery code" dlg="ac-newcode-shown" width={640} at={null} onCancel={done} buttons={[]}>
      <Body>
        <form class="wc-ac-dform wc-ac-dcode" noValidate {...keys.form}>
          <RecoveryCodeView
            rc={rc}
            autoFocus
            at={keys.at}
            lead={<>Your new recovery code. The old one has stopped working.</>}
            action={
              <div class="wc-lk-btns">
                <GlassButton id="DONE" label="Done" primary disabled={!rc.confirmed} selected={keys.at === 'DONE'} onClick={done} />
              </div>
            }
          />
        </form>
      </Body>
    </Dialog>
  );
}

// ------------------------------------------------------------ Delete account

export const DeleteDialog = lookFrame(function DeleteDialog(p: { host: Host }): VNode {
  const nav = useNav();
  const alive = useAlive();
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [typedLeft, setTypedLeft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState<number | null>(null);
  const pwRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const focusNext = useRef(false);
  const work = useWorking();
  const name = p.host().name;
  const [space] = useState(currentSpace);
  const inSpace = space.kind === 'account';
  // Refused while a game runs on the account's space in another tab (as Log out): asked at open and at the last moment.
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    if (!inSpace) return;
    void gameRunningElsewhere(space).then((on) => {
      if (on && alive.current) setRefused(true);
    });
  }, []);

  const waiting = wait !== null;
  useEffect(() => {
    if (work.on || waiting || !focusNext.current) return;
    focusNext.current = false;
    pwRef.current?.focus({ preventScroll: true });
  });

  const named = namesAccount(typed, name);
  const ready = password.length > 0 && named && !work.on && !waiting;
  const cancel = work.orCancel(() => nav.pop());
  const remove = async (): Promise<void> => {
    if (!ready) return;
    setError(null);
    if (inSpace && (await gameRunningElsewhere(space))) {
      if (alive.current) setRefused(true);
      return;
    }
    const host = p.host();
    host.setLeaving(true);
    if (inSpace) setLeavingSpace(true);
    const signal = work.start();
    const r = await host.track(deleteAccount(password, { onStep: work.onStep, signal }));
    if (r.ok) {
      // In the account's space (stage 61): its profiles and scripts become this device's, and the page reloads.
      if (inSpace && (await deleteHandBack(name))) return;
      host.toMenu(`The account ${name} is deleted. What is on this device is untouched.`);
      return;
    }
    host.setLeaving(false);
    if (inSpace) setLeavingSpace(false);
    if (!alive.current) return;
    const doubt = work.doubtful(r.code);
    work.stop();
    focusNext.current = true;
    if (gone(host, r)) return;
    if (doubt) {
      setError('The server’s answer did not arrive. The account may or may not have been deleted: try again, and if it is gone you will be sent to Log in.');
      return;
    }
    switch (r.code) {
      case 'invalid_login':
        setPassword('');
        setError(failureWords(r.code, 'account'));
        return;
      case 'locked':
        setWait(r.retryAfter ?? 15 * 60);
        return;
      default:
        setError(failureWords(r.code, 'account'));
    }
  };

  const keys = useFormKeys({
    layer: true,
    stops: [
      { id: 'password', field: pwRef },
      { id: 'confirm', field: nameRef },
      { id: 'CANCEL', run: cancel },
      { id: 'DELETE', run: () => void remove(), disabled: !ready },
    ],
    // Enter never deletes by default: the cursor rests on Cancel.
    submit: cancel,
    canSubmit: true,
    back: cancel,
    busy: work.on,
    cancel: work.cancel,
  });

  const off = work.on || waiting;
  if (refused) {
    return (
      <Dialog title="Delete account" dlg="ac-delete" width={420} onCancel={cancel} buttons={[{ id: 'OK', label: 'OK', letter: 'o', primary: true, run: cancel }]}>
        <p class="wc-lk-q" data-delete="refused">
          A game is running in another tab.
        </p>
        <p class="wc-lk-qn">Delete the account when it has ended.</p>
      </Dialog>
    );
  }
  return (
    <Dialog
      title="Delete account"
      dlg="ac-delete"
      width={520}
      error={waiting ? null : error}
      at={keys.at ?? 'CANCEL'}
      onCancel={cancel}
      buttons={
        work.on
          ? []
          : [
              { id: 'CANCEL', label: 'Cancel', run: cancel },
              { id: 'DELETE', label: 'Delete account', danger: true, disabled: !ready, run: () => void remove() },
            ]
      }
    >
      <Body>
        <form class="wc-ac-dform" noValidate {...keys.form}>
          <p class="wc-lk-q">
            Delete the account <b class="wc-ac-who">{name}</b>?
          </p>
          <p class="wc-ac-dtxt">
            <b>What goes:</b> the account and everything stored in it, at once and for good, and the login on every device. The name <b>{name}</b> can never be
            registered again, by you or anyone.
          </p>
          {inSpace ? (
            <p class="wc-ac-dtxt" data-delete="handback">
              <b>What happens on this device:</b> your profiles, scripts and runs in <b>{name}</b> come back to this device as its own. A name that exists on
              both sides keeps both.
            </p>
          ) : (
            <p class="wc-ac-dtxt">
              <b>What stays:</b> what is on this device. Your profiles, scripts and runs here are not touched.
            </p>
          )}
          <Field
            id="password"
            label="Password"
            type="password"
            name="password"
            autocomplete="current-password"
            value={password}
            disabled={off}
            autoFocus
            inputRef={pwRef}
            onInput={(v) => {
              setPassword(v);
              setError(null);
            }}
          />
          <Field
            id="confirm"
            label="Type the user name to confirm"
            mono
            maxLength={64}
            placeholder={name}
            value={typed}
            disabled={off}
            inputRef={nameRef}
            error={typedLeft && typed.trim().length > 0 && !named ? 'That is not this account’s user name.' : null}
            onInput={(v) => {
              setTyped(v);
              setTypedLeft(false);
            }}
            onCommit={() => setTypedLeft(true)}
          />
          {waiting && <WaitPlate seconds={wait} onDone={() => setWait(null)} />}
          {work.on && <Working work={work} />}
        </form>
      </Body>
    </Dialog>
  );
});
