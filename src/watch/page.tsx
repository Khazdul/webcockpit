// The watch page `<base>r/<id>` (stage 64 C2, spec §7.7, ADR 0154 "The
// watch page"; round 12's pick 3a: a band over the frame, and 5: Report as
// drawn). src/main.ts mounts it when the address is under `<base>r/`,
// instead of the start page (no sky, no start page animation). It lives in
// the chrome chunk (src/chrome/index.tsx `startWatch`), which is lazy: it
// is made of the kit, and a chunk of its own split the kit, the account's
// state and the font table out of the chunks the start page loads (ADR
// 0154 "As built (C2)"); for the same reason it imports the exporter and
// the frame host statically and writes two of the contract's values out
// (model.ts). (Since W1 only the frame host: Download as HTML is gone.)
//
// The band (the app's own DOM, every value as text): the title, then the
// character (no level: ADR 0155 W1), length, date, views and "shared by",
// the description in one quiet line (the sender's note on their own hidden
// run, the admin's on `?admin`); Report and Back at the right (Download as
// HTML is gone: owner's feedback on stage 65, ADR 0155 W1). On a phone it stacks and the description is left out. Under it
// the replay in its sandboxed frame (src/watch/frame-host.ts) fills the
// rest; while the payload comes, a loading bar in its place.
//
// The meta comes from `GET /api/pub/<id>`, never from the payload. The
// states: loading, playing, removed (410), hidden (451; logged in, the
// sender's own run is asked for at `/api/u/pub/<id>`), unknown (404 or an
// id that is not one), "This link does not work yet." (the flag `share`
// off: `/api/config` says so; with it on a 404 is unknown), the page's own
// refusal of the payload (`PayloadReadError`'s text) and a failed request
// (Try again). `?admin`: the admin's endpoints (behind Access) instead.
//
// The replay starts paused (ADR 0155 W1): the frame host asks the frame
// for it (`prefs.paused`); Play or Space in the frame starts it. A view
// is counted once per page load when the frame has the run (the
// statistics' device id; one is made if there is none).
//
// Keys (outside the frame; a click in the replay gives it the keys):
// S Share, R Report, B Back.
//
// Stage 65 C2 (round 13's pick 3a with the owner's change, ADR 0155 "As
// built (stage 65 C2)"): the page sits inside the start page's look: the
// start page's sky (its still CSS look, no engine, no animation) behind the
// framed window of the start menu's sub-pages ("Shared log" on its hood,
// Back at its top left); in it the band, the replay and, with the flag
// `gallery` (the meta carries `stars`), the stars in the band and the
// comments under the replay (src/watch/community.tsx); the page scrolls.
// Back goes to the Account page or its Published runs view when the run was
// opened from there (`?from=account`, `?from=published`, ADR 0155 W1), else
// to the start page's Community (a bare link too, the Discord post's): the
// model's `backHref`, the pair of `watchHref` that opened the run.
//
// Feedback round 2 (ADR 0155 "As built — feedback round 2, watch page"):
// from 1000 px (a desktop, a tablet in landscape) the band is a column at
// the replay's right with the comments under it, scrolling there, and the
// replay has the window's height (watch.css, CSS only: the same DOM); a
// narrower window and a phone keep the band on top. The details are
// `.wc-watch-mi` pieces so the column breaks between them, never inside.

import './watch.css';
import { type ComponentChildren, type VNode, render } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Dialog, GlassButton, Icon, LoadBar, LookFlash, TextArea, inTextField, letterAction, lookFrame } from '../chrome/kit/look';
import { FrameStack, useKeyLayer, useKeys, useNav } from '../chrome/kit/stack';
import { accountState, accountsEnabled } from '../cloud/account/state';
import { apiAllowed, configAnswer } from '../cloud/config';
import type { Comment, PubMeta, ReportKind, ReportReason, Stars } from '../../shared/cloud/api.ts';
import { skyCss } from '../start/sky/look';
import { startSkyLook } from '../start/start-look';
import { type FrameHost, PayloadReadError, openFrame, siteBaseUrl } from './frame-host';
import { type WatchTurn, installWatchTurn } from './turn';
import { device } from '../core/device';
import { fsDebugAsked, fsModeFor } from '../core/fs-debug';
import { type Got, type WatchMode, countView, fetchMeta, fetchPayload, sendReport } from './api';
import { Comments, type RaterRole, RunStars } from './community';
import {
  ABUSE_ADDRESS,
  ADMIN_WORDS,
  END_WORDS,
  FAILED_WORDS,
  OWNER_NOTE,
  REASONS,
  REPORT_MAX,
  REFUSED_NOTE,
  type WatchEnd,
  backHref,
  backTarget,
  endOf,
  keepCloudtest,
  loadingLine,
  metaLine,
  reportFailText,
  reportText,
  shareFlag,
  watchDevice,
  watchIdOf,
} from './model';
import { leaveForLogin } from './return';
import { copyText } from '../chrome/kit/clipboard';
import { linkUrl } from '../share/link';

/** The site's base path. */
const base = (): string => (import.meta.env?.BASE_URL as string | undefined) ?? '/';

/** The start page (dev: the e2e hook `?cloudtest` kept, as src/core/space.ts `reloadToStart`). */
function startUrl(): string {
  return `${base()}${keepCloudtest() ? '?cloudtest' : ''}`;
}

function goStart(): void {
  location.assign(startUrl());
}

/** Back: the start page's Account page or Published runs when the run was opened from one, else its Community (stage 65). */
function goBack(): void {
  location.assign(backHref(backTarget(location.search), base()));
}

/** Log in from the watch page (Report's, the stars' and the comments'): the start page's Log in, and back here after it. */
function logIn(lost = false): void {
  void leaveForLogin(location.pathname + location.search, {
    lost,
    // The app's way of a lost session: the hint and the keys go (and the account's copy is decided on).
    forget: () => import('../cloud/space/flows').then((m) => m.sessionLost(null)),
    go: goStart,
  });
}

/** What the page shows. */
type View =
  | { k: 'loading' }
  | { k: 'run'; meta: PubMeta; mode: WatchMode }
  | { k: 'end'; end: WatchEnd }
  | { k: 'failed'; lines: readonly [string, string]; retry: boolean };

/** The logged-in account's name, when accounts are on here (null: a guest). */
function loggedInName(): string | null {
  return accountState().name;
}

// ------------------------------------------------------------ the page

interface WatchProps {
  id: string;
  valid: boolean;
  admin: boolean;
}

export const WatchPage = lookFrame(function WatchPage(p: WatchProps): VNode {
  const nav = useNav();
  const [view, setView] = useState<View>({ k: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<{ done: number; total: number } | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [playing, setPlaying] = useState(false);
  const [reported, setReported] = useState(false);
  const host = useRef<FrameHost | null>(null);
  const slot = useRef<HTMLDivElement>(null);
  const viewed = useRef(false);

  // The meta and the payload.
  useEffect(() => {
    let alive = true;
    const set = (v: View): void => {
      if (alive) setView(v);
    };
    void (async () => {
      setView({ k: 'loading' });
      setBytes(null);
      setLoad(null);
      if (!p.valid) return set({ k: 'end', end: 'unknown' });
      let mode: WatchMode = p.admin ? 'admin' : 'public';
      // The flag first: with `share` off every path is a 404, which is "not yet", not "unknown".
      // Only a config that came and says so is "not yet"; one that could not be had is a
      // failure with Try again, which asks for it again (review fix CR1).
      if (!p.admin) {
        const flags = shareFlag(apiAllowed(), apiAllowed() ? await configAnswer() : null);
        if (flags !== 'on') return set(flags === 'off' ? { k: 'end', end: 'notyet' } : { k: 'failed', lines: FAILED_WORDS, retry: true });
      }
      let meta = await fetchMeta(p.id, mode);
      if (!meta.ok && meta.status === 451 && loggedInName() !== null && (await accountsEnabled())) {
        // The sender's own hidden run (ADR 0154 "As built (B1)").
        const own = await fetchMeta(p.id, 'owner');
        if (own.ok) {
          meta = own;
          mode = 'owner';
        }
      }
      if (!alive) return;
      if (!meta.ok) return set(failedView(meta, p.admin));
      document.title = `${meta.value.title} · WebCockpit`;
      set({ k: 'run', meta: meta.value, mode });
      const got = await fetchPayload(p.id, mode, (done, total) => alive && setLoad({ done, total }), meta.value.bytes);
      if (!alive) return;
      if (!got.ok) return set(failedView(got, p.admin));
      setBytes(got.value);
    })();
    return () => {
      alive = false;
    };
  }, [attempt]);

  // The frame, once the payload is here and its slot is drawn.
  const meta = view.k === 'run' ? view.meta : null;
  const mode = view.k === 'run' ? view.mode : null;
  useLayoutEffect(() => {
    const box = slot.current;
    if (!bytes || !box || !meta) return;
    let alive = true;
    let made: FrameHost | null = null;
    let turn: WatchTurn | null = null;
    // `?fsdebug`: the fullscreen-turn readout on the page and in the frame (stage 73 round 3).
    const fsdebug = fsDebugAsked(location.search);
    // A tablet's way into fullscreen (stage 73 round 3b/3c): `?fsmode=frame|page|fill`, else `fill` in Chrome on iOS (its frame fullscreen breaks on a turn), else the frame's own.
    const fsmode = fsModeFor(location.search, window);
    openFrame({
      container: box,
      bytes,
      base: siteBaseUrl(),
      meta: { title: meta.title, description: meta.description },
      ...(fsdebug ? { fsdebug } : {}),
      ...(fsmode ? { fsmode } : {}),
      onPlay: () => {
        if (!alive) return;
        setPlaying(true);
        made?.frame.focus();
        // Once per page load, and only as anyone watches (not the sender's hidden run, not the admin).
        if (mode === 'public' && !viewed.current) {
          viewed.current = true;
          void countView(meta.id, watchDevice(storage()));
        }
      },
      onError: (text) => alive && setView({ k: 'failed', lines: [text, REFUSED_NOTE], retry: false }),
    }).then(
      (h) => {
        made = h;
        if (!alive) return h.dispose();
        host.current = h;
        // A touch device follows the window through a turn in fullscreen (src/watch/turn.ts).
        const page = box.closest<HTMLElement>('.wc-watch');
        if (page && (device().touch || fsdebug)) turn = installWatchTurn(page, h, { debug: fsdebug });
      },
      (err: unknown) => {
        if (!alive) return;
        const text = err instanceof PayloadReadError ? err.text : 'This replay could not be read.';
        setView({ k: 'failed', lines: [text, REFUSED_NOTE], retry: false });
      },
    );
    return () => {
      alive = false;
      turn?.dispose();
      made?.dispose();
      host.current = null;
      setPlaying(false);
    };
  }, [bytes, meta]);

  const me = loggedInName();
  const self = meta !== null && me?.toLowerCase() === meta.sender.toLowerCase();
  const canReport = meta !== null && mode === 'public' && !self;
  // Stage 65: the stars and the comments, only as anyone watches and only when the meta carries them (`gallery` on).
  const social = meta !== null && mode === 'public' && meta.stars !== undefined;
  const [stars, setStars] = useState<Stars | null>(null);
  const [reportedComments, setReportedComments] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => setStars(meta?.stars ?? null), [meta]);
  const role: RaterRole = me === null ? 'guest' : self ? 'own' : 'voter';
  const refocus = (): void => void setTimeout(() => host.current?.frame.focus(), 0);

  // Share (the owner, 2026-11-17): the run's own link, without `?from=`; a
  // touch device's share sheet when it has one, else the clipboard.
  const canShare = meta !== null && mode === 'public';
  const share = (): void => {
    if (!meta || !canShare) return;
    const url = linkUrl(meta.id);
    const sheet = typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches;
    if (sheet) {
      navigator.share({ title: meta.title, url }).catch((err: unknown) => {
        if ((err as { name?: string } | null)?.name !== 'AbortError') void copyLink(url);
      });
      return;
    }
    void copyLink(url);
  };
  const copyLink = async (url: string): Promise<void> => {
    const ok = await copyText(url);
    nav.flash(ok ? 'Link copied.' : `Copy this link: ${url}`, ok ? 'ok' : 'fail', ok ? undefined : 8000);
  };

  const report = (): void => {
    if (!meta || !canReport) return;
    nav.push(<ReportFrame kind="run" title={meta.title} id={meta.id} already={reported} onSent={() => setReported(true)} onClosed={refocus} />, {
      overlay: true,
    });
  };
  const reportComment = (c: Comment): void => {
    nav.push(
      <ReportFrame
        kind="comment"
        title={meta?.title ?? ''}
        id={c.id}
        quote={c.text}
        writer={c.writer}
        already={reportedComments.has(c.id)}
        onSent={() => setReportedComments((s) => new Set(s).add(c.id))}
        onClosed={() => {}}
      />,
      { overlay: true },
    );
  };

  useKeys((e, nk) => {
    // The comment field's keys are its own (Esc lets go of it: the stack's rule).
    if (inTextField(e.target)) return false;
    if (nk === 'back') return true;
    if (view.k === 'end' || view.k === 'failed') {
      return letterAction(e, { b: goBack, ...(view.k === 'failed' && view.retry ? { t: () => setAttempt((n) => n + 1) } : {}) }) || nk !== null;
    }
    return (
      letterAction(e, {
        b: goBack,
        ...(canReport ? { r: report } : {}),
        ...(canShare ? { s: share } : {}),
      }) || nk !== null
    );
  });

  if (view.k === 'end') return <EndBox lines={END_WORDS[view.end]} />;
  if (view.k === 'failed') return <EndBox lines={view.lines} retry={view.retry ? () => setAttempt((n) => n + 1) : undefined} />;

  const line = meta ? metaLine(meta) : null;
  const note =
    mode === 'owner' ? (
      <p class="wc-watch-note" data-watch="owner-note">
        <FlagIcon />
        <span>
          <b>{OWNER_NOTE[0]}</b> {OWNER_NOTE[1]}
        </span>
      </p>
    ) : mode === 'admin' ? (
      <p class="wc-watch-note" data-watch="admin-note">
        <FlagIcon />
        <span>
          <b>Admin view.</b> {meta?.hidden ? 'This log is hidden from everyone else.' : 'Nothing here is counted.'}
        </span>
      </p>
    ) : null;
  return (
    <div class={'wc-lk-page wc-watch-page' + (social ? ' has-social' : '')} data-watch={playing ? 'playing' : 'loading'}>
      <div class="wc-watch-outer">
        <WatchBox>
          <div class="wc-watch-screen">
            <header class="wc-watch-band">
              <div class="wc-watch-id">
                <h1 class="wc-watch-title" data-watch="title">
                  {meta?.title ?? ' '}
                </h1>
                <p class="wc-watch-meta" data-watch="meta">
                  {line ? (
                    <>
                      {line.character && <span class="wc-watch-char wc-watch-mi">{line.character}</span>}
                      {line.character ? <i>·</i> : null}
                      <span class="wc-watch-mi">{line.length}</span>
                      <i>·</i>
                      <span class="wc-watch-mi">{line.date}</span>
                      <i>·</i>
                      <span class="wc-watch-mi" data-watch="views">
                        {line.views}
                      </span>
                      {line.sender && (
                        <>
                          <i>·</i>
                          <span class="wc-watch-by wc-watch-mi">
                            shared by <b data-watch="sender">{line.sender}</b>
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    ' '
                  )}
                </p>
                {note ??
                  (meta?.description ? (
                    <p class="wc-watch-desc" data-watch="description" title={meta.description}>
                      {meta.description}
                    </p>
                  ) : null)}
              </div>
              {social && stars && <RunStars id={meta.id} stars={stars} role={role} onLogin={() => logIn()} onStars={setStars} />}
              {(canShare || canReport) && (
                <div class="wc-watch-acts">
                  {canShare && <GlassButton id="SHARE" label="Share" letter="s" icon="link" small onClick={share} />}
                  {canReport && <GlassButton id="REPORT" label="Report" letter="r" icon="flag" small onClick={report} />}
                </div>
              )}
              <LookFlash class="wc-watch-flash" />
            </header>
            <div class="wc-watch-slot" ref={slot}>
              {!playing && (
                <div class="wc-watch-wait">
                  <LoadBar done={load?.done ?? 0} total={load?.total ?? meta?.bytes ?? 0} line={load ? loadingLine(load.done, load.total) : 'Loading the log…'} />
                </div>
              )}
            </div>
          </div>
          {social && (
            <Comments id={meta.id} sender={meta.sender} me={me} total={meta.comments ?? 0} onLogin={() => logIn()} onReport={reportComment} onCount={() => {}} />
          )}
        </WatchBox>
      </div>
    </div>
  );
});

/**
 * The start menu's sub-page frame (the kit's large `Box`: the iron frame,
 * its brackets, the hood, Back at the top left, the lit window), drawn here
 * in the page's own scrolling layout rather than the Box's fixed one: the
 * window grows with the comments and the page scrolls.
 */
function WatchBox(p: { children: ComponentChildren }): VNode {
  return (
    <section class="wc-lk-box wc-lk-box-large wc-watch-box" aria-label="Shared log">
      <i class="wc-lk-br wc-lk-b1" />
      <i class="wc-lk-br wc-lk-b2" />
      <i class="wc-lk-br wc-lk-b3" />
      <i class="wc-lk-br wc-lk-b4" />
      <div class="wc-lk-hood">
        <span class="wc-lk-hood-t">Shared log</span>
      </div>
      <button
        type="button"
        class="wc-lk-back"
        data-btn="BACK"
        tabIndex={-1}
        aria-label="Back (B)"
        title="Back (B)"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          goBack();
        }}
      >
        <Icon name="back" />
        Back
      </button>
      <div class="wc-lk-win wc-watch-win">{p.children}</div>
    </section>
  );
}

function FlagIcon(): VNode {
  return <Icon name="flag" />;
}

/** What a failed request shows. */
function failedView(g: Got<unknown> & { ok: false }, admin: boolean): View {
  const end = endOf(g.status);
  if (end && !(admin && end === 'hidden')) return { k: 'end', end };
  if (admin && (g.code === 'access' || g.status === 401 || g.status === 403)) return { k: 'failed', lines: ADMIN_WORDS, retry: false };
  if (g.code === 'too_large') return { k: 'failed', lines: ['This replay is too large.', REFUSED_NOTE], retry: false };
  return { k: 'failed', lines: FAILED_WORDS, retry: true };
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** A state without a run: a small box in the kit's dialog look, with Back to MUME Cockpit (and Try again). */
function EndBox(p: { lines: readonly [string, string]; retry?: (() => void) | undefined }): VNode {
  return (
    <div class="wc-lk-page wc-watch-page is-end">
      <section class="wc-lk-dialog wc-watch-endbox" aria-label="Shared log" data-watch="end">
        <i class="wc-lk-br wc-lk-b1" />
        <i class="wc-lk-br wc-lk-b2" />
        <i class="wc-lk-br wc-lk-b3" />
        <i class="wc-lk-br wc-lk-b4" />
        <div class="wc-lk-hood">
          <span class="wc-lk-hood-t">Shared log</span>
        </div>
        <div class="wc-lk-dwin">
          <div class="wc-lk-dialog-b">
            <p class="wc-lk-q">{p.lines[0]}</p>
            <p class="wc-lk-qn">{p.lines[1]}</p>
          </div>
          <div class="wc-lk-btns wc-lk-dialog-btns">
            {p.retry && <GlassButton id="RETRY" label="Try again" letter="t" onClick={p.retry} />}
            <GlassButton id="BACK" label="Back to MUME Cockpit" letter="b" icon="back" primary onClick={goBack} />
          </div>
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------ Report

type ReportStep = 'form' | 'sending' | 'thanks' | 'already' | 'guest';

interface ReportProps {
  /** A run (the band's Report) or a comment (stage 65). */
  kind: Extract<ReportKind, 'run' | 'comment'>;
  /** The run's title. */
  title: string;
  /** The reported item's id. */
  id: string;
  /** A comment's text, quoted in the dialog. */
  quote?: string;
  /** A comment's writer. */
  writer?: string;
  /** Reported from this page already. */
  already: boolean;
  onSent(): void;
  onClosed(): void;
}

/**
 * Report (round 12, point 5): the reasons and a text logged in; "Log in to
 * report" and the abuse address logged out. A comment (stage 65, round 13):
 * the same with the comment quoted and the writer named.
 */
export const ReportFrame = lookFrame(function ReportFrame(p: ReportProps): VNode {
  const nav = useNav();
  const [step, setStep] = useState<ReportStep>(() => (p.already ? 'already' : loggedInName() === null ? 'guest' : 'form'));
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The server said 401 though this device holds a login (review fix CR2).
  const [lost, setLost] = useState(false);
  const close = (): void => {
    nav.pop();
    p.onClosed();
  };
  const send = async (): Promise<void> => {
    if (!reason || step === 'sending') return;
    setStep('sending');
    setError(null);
    const t = reportText(text);
    const r = await sendReport({ kind: p.kind, target: p.id, reason, ...(t ? { text: t } : {}) });
    if (r.ok) {
      p.onSent();
      setStep('thanks');
    } else if (r.code === 'already_reported') {
      p.onSent();
      setStep('already');
    } else if (r.status === 401) {
      setLost(loggedInName() !== null);
      setStep('guest');
    } else {
      setError(reportFailText(r.status, r.code, p.kind));
      setStep('form');
    }
  };
  // The arrows walk the reasons (outside the text).
  useKeyLayer(
    (e, nk) => {
      if (inTextField(e.target) || (nk !== 'up' && nk !== 'down')) return false;
      const i = reason ? REASONS.findIndex((x) => x.id === reason) : -1;
      const to = nk === 'down' ? Math.min(REASONS.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
      setReason(REASONS[to]!.id);
      return true;
    },
    step === 'form',
  );

  const what = p.kind === 'comment' ? 'comment' : 'log';
  const head = `Report this ${what}`;
  if (step === 'thanks') {
    return (
      <Dialog title="Report sent" dlg="report-thanks" width={460} onCancel={close} buttons={[{ id: 'CLOSE', label: 'Close', letter: 'c', primary: true, run: close }]}>
        <p class="wc-lk-q">Thank you.</p>
        <p class="wc-lk-qn">We look at every report. A {what} that breaks the rules is removed; one that many report is hidden until then.</p>
      </Dialog>
    );
  }
  if (step === 'already') {
    return (
      <Dialog title={head} dlg="report-already" width={440} onCancel={close} buttons={[{ id: 'CLOSE', label: 'Close', letter: 'c', primary: true, run: close }]}>
        <p class="wc-lk-q">You have already reported this {what}.</p>
        <p class="wc-lk-qn">One report per {what} is enough; it is in the queue.</p>
      </Dialog>
    );
  }
  if (step === 'guest') {
    const login = (): void => logIn(lost);
    return (
      <Dialog
        title={head}
        dlg="report-guest"
        width={480}
        onCancel={close}
        buttons={[
          { id: 'CLOSE', label: 'Close', letter: 'c', run: close },
          { id: 'LOGIN', label: 'Log in', letter: 'l', primary: true, run: login },
        ]}
      >
        <p class="wc-lk-q">Log in to report.</p>
        <p class="wc-lk-qn">
          Reports come from accounts, one per {what}. Without an account, write to{' '}
          <a class="wc-watch-mail" href={`mailto:${ABUSE_ADDRESS}`}>
            {ABUSE_ADDRESS}
          </a>{' '}
          with the link.
        </p>
      </Dialog>
    );
  }
  const n = [...text].length;
  return (
    <Dialog
      title={head}
      dlg="report"
      width={500}
      onCancel={close}
      error={error}
      buttons={[
        { id: 'CANCEL', label: 'Cancel', letter: 'c', run: close },
        { id: 'SEND', label: 'Send report', letter: 's', primary: true, disabled: !reason || step === 'sending', run: () => void send() },
      ]}
    >
      <div class="wc-watch-report">
        {p.kind === 'comment' ? (
          <>
            <p class="wc-lk-qn wc-watch-left">
              What is wrong with this comment by <b>{p.writer ?? ''}</b>?
            </p>
            <p class="wc-watch-quote" data-watch="quote">
              {p.quote ?? ''}
            </p>
          </>
        ) : (
          <p class="wc-lk-qn wc-watch-left">What is wrong with “{p.title}”?</p>
        )}
        <div class="wc-watch-reasons" role="radiogroup" aria-label="Reason">
          {REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              class={'wc-lk-check wc-watch-radio' + (reason === r.id ? ' is-on is-cur' : '')}
              aria-checked={reason === r.id ? 'true' : 'false'}
              data-reason={r.id}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                setReason(r.id);
              }}
            >
              <span class="wc-lk-cbox" aria-hidden="true" />
              <span class="wc-lk-clabel">{r.label}</span>
            </button>
          ))}
        </div>
        <TextArea
          id="report-text"
          label="More (optional)"
          value={text}
          rows={3}
          maxLength={REPORT_MAX}
          onInput={setText}
          hint={<span class="wc-watch-count">{`${n} / ${REPORT_MAX}`}</span>}
        />
        <p class="wc-lk-qn wc-watch-left wc-watch-small">The {p.kind === 'comment' ? 'writer' : 'sender'} is not told who reported.</p>
      </div>
    </Dialog>
  );
});

// ------------------------------------------------------------ mount

/** Mounts the watch page into `root` (src/main.ts, when the address is under `<base>r/`). */
export function startWatch(root: HTMLElement, path: string = location.pathname, search: string = location.search): void {
  const at = watchIdOf(path, base()) ?? { id: '', valid: false };
  const admin = new URLSearchParams(search).has('admin');
  document.title = 'Shared log · WebCockpit';
  root.replaceChildren();
  // The page's root fills the window by CSS on a phone too, not by the measured visual viewport (watch.css; stage 73 round 3).
  root.classList.add('wc-watch-app');
  const host = document.createElement('div');
  host.className = 'wc-chrome wc-look wc-watch';
  root.appendChild(host);
  stillSky(host);
  render(<FrameStack root={<WatchPage id={at.id} valid={at.valid} admin={admin} />} active={true} />, host);
}

/**
 * The start page's sky behind the page (stage 65 C2): its smooth part
 * only, the look model's CSS gradients for now and this window
 * (src/chrome/start-surface.tsx draws the same before its engine mounts),
 * painted once and again after a resize. No engine, no frame loop, no
 * animation: the watch page's first paint and boot stay as stage 64's.
 */
function stillSky(host: HTMLElement): void {
  const paint = (): void => {
    try {
      host.style.background = skyCss(startSkyLook({ w: innerWidth, h: innerHeight })).all;
    } catch {
      // The plain dark background of watch.css stays.
    }
  };
  paint();
  let queued = 0;
  const again = (): void => {
    if (queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      paint();
    });
  };
  addEventListener('resize', again);
  // A turn in fullscreen may end with no resize of the page (stage 73 round 3).
  addEventListener('orientationchange', again);
  document.addEventListener('fullscreenchange', again);
  document.addEventListener('webkitfullscreenchange', again);
}
