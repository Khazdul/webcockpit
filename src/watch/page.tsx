// The watch page `<base>r/<id>` (stage 64 C2, spec §7.7, ADR 0154 "The
// watch page"; round 12's pick 3a: a band over the frame, and 5: Report as
// drawn). src/main.ts mounts it when the address is under `<base>r/`,
// instead of the start page (no sky, no start page animation). It lives in
// the chrome chunk (src/chrome/index.tsx `startWatch`), which is lazy: it
// is made of the kit, and a chunk of its own split the kit, the account's
// state and the font table out of the chunks the start page loads (ADR
// 0154 "As built (C2)"); for the same reason it imports the exporter and
// the frame host statically and writes two of the contract's values out
// (model.ts).
//
// The band (the app's own DOM, every value as text): the title, then the
// character and level, length, date, views and "shared by", the
// description in one quiet line (the sender's note on their own hidden
// run, the admin's on `?admin`); Report, Download as HTML and Back at the
// right. On a phone it stacks and the description is left out. Under it
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
// A view is counted once per page load when playing starts (the
// statistics' device id; one is made if there is none). Download as HTML
// builds the exporter's file from the payload the page validated.
//
// Keys (outside the frame; a click in the replay gives it the keys):
// R Report, D Download, B Back.

import './watch.css';
import { type VNode, render } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Dialog, GlassButton, Icon, type IconDraw, LoadBar, LookFlash, TextArea, letterAction, lookFrame } from '../chrome/kit/look';
import { FrameStack, useKeyLayer, useKeys, useNav } from '../chrome/kit/stack';
import { downloadBlob } from '../chrome/kit/download';
import { inTextField } from '../chrome/kit/look-keys';
import { accountState, accountsEnabled } from '../cloud/account/state';
import { apiAllowed, config } from '../cloud/config';
import type { PubMeta, ReportReason } from '../../shared/cloud/api.ts';
import { device } from '../core/device';
import { buildReplayHtml } from '../replay/export';
import { type FrameHost, PayloadReadError, openFrame, siteBaseUrl } from './frame-host';
import { type Got, type WatchMode, countView, fetchMeta, fetchPayload, sendReport } from './api';
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
  downloadName,
  endOf,
  loadingLine,
  metaLine,
  reportFailText,
  reportText,
  watchDevice,
  watchIdOf,
} from './model';
import { noteLoginReturn } from './return';

// The download arrow, which the kit has not got, drawn in its manner (round 12's mockups); the flag is the kit's.
const DOWN: IconDraw = {
  draw: (
    <>
      <path d="M8 2.2v8" />
      <path d="M4.8 7 8 10.2 11.2 7" />
      <path d="M2.5 13.5h11" />
    </>
  ),
};

/** The site's base path. */
const base = (): string => (import.meta.env?.BASE_URL as string | undefined) ?? '/';

/** The start page (dev: the e2e hook `?cloudtest` kept, as src/core/space.ts `reloadToStart`). */
function startUrl(): string {
  const keep = import.meta.env?.DEV === true && new URLSearchParams(location.search).has('cloudtest') ? '?cloudtest' : '';
  return `${base()}${keep}`;
}

function goStart(): void {
  location.assign(startUrl());
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
  const [busy, setBusy] = useState(false);
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
      if (!p.admin && !(apiAllowed() && (await config()).flags.share === true)) return set({ k: 'end', end: 'notyet' });
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
    openFrame({
      container: box,
      bytes,
      base: siteBaseUrl(),
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
        if (alive) host.current = h;
        else h.dispose();
      },
      (err: unknown) => {
        if (!alive) return;
        const text = err instanceof PayloadReadError ? err.text : 'This replay could not be read.';
        setView({ k: 'failed', lines: [text, REFUSED_NOTE], retry: false });
      },
    );
    return () => {
      alive = false;
      made?.dispose();
      host.current = null;
      setPlaying(false);
    };
  }, [bytes, meta]);

  const self = meta !== null && loggedInName()?.toLowerCase() === meta.sender.toLowerCase();
  const canReport = meta !== null && mode === 'public' && !self;
  const canDownload = playing && host.current !== null;

  const report = (): void => {
    if (!meta || !canReport) return;
    nav.push(
      <ReportFrame
        title={meta.title}
        id={meta.id}
        already={reported}
        onSent={() => setReported(true)}
        onClosed={() => setTimeout(() => host.current?.frame.focus(), 0)}
      />,
      { overlay: true },
    );
  };
  const download = async (): Promise<void> => {
    const h = host.current;
    if (!h || !meta || busy) return;
    setBusy(true);
    nav.flash('Building the file…', 'ok');
    try {
      const blob = await buildReplayHtml(h.payload, { base: siteBaseUrl() });
      const name = downloadName(meta.title);
      downloadBlob(blob, name);
      nav.flash(`Downloaded ${name}`, 'ok');
    } catch {
      nav.flash('The file could not be made. Try again.', 'fail');
    } finally {
      setBusy(false);
    }
  };

  useKeys((e, nk) => {
    if (nk === 'back') return true;
    if (view.k === 'end' || view.k === 'failed') {
      return letterAction(e, { b: goStart, ...(view.k === 'failed' && view.retry ? { t: () => setAttempt((n) => n + 1) } : {}) }) || nk !== null;
    }
    return (
      letterAction(e, {
        b: goStart,
        ...(canReport ? { r: report } : {}),
        ...(canDownload ? { d: () => void download() } : {}),
      }) || nk !== null
    );
  });

  if (view.k === 'end') return <EndBox lines={END_WORDS[view.end]} />;
  if (view.k === 'failed') return <EndBox lines={view.lines} retry={view.retry ? () => setAttempt((n) => n + 1) : undefined} />;

  const phone = device().phone;
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
          <b>Admin view.</b> {meta?.hidden ? 'This run is hidden from everyone else.' : 'Nothing here is counted.'}
        </span>
      </p>
    ) : null;
  return (
    <div class="wc-lk-page wc-watch-page" data-watch={playing ? 'playing' : 'loading'}>
      <header class="wc-watch-band">
        <div class="wc-watch-id">
          <h1 class="wc-watch-title" data-watch="title">
            {meta?.title ?? ' '}
          </h1>
          <p class="wc-watch-meta" data-watch="meta">
            {line ? (
              <>
                {line.character && <span class="wc-watch-char">{line.character}</span>}
                {line.level && <span class="wc-watch-lv"> {line.level}</span>}
                {line.character || line.level ? <i>·</i> : null}
                {line.length}
                <i>·</i>
                {line.date}
                <i>·</i>
                <span data-watch="views">{line.views}</span>
                {line.sender && (
                  <>
                    <i>·</i>
                    <span class="wc-watch-by">
                      shared by <b data-watch="sender">{line.sender}</b>
                    </span>
                  </>
                )}
              </>
            ) : (
              ' '
            )}
          </p>
          {note ??
            (meta?.description ? (
              <p class="wc-watch-desc" data-watch="description" title={meta.description}>
                {meta.description}
              </p>
            ) : null)}
        </div>
        <div class="wc-watch-acts">
          {canReport && <GlassButton id="REPORT" label="Report" letter="r" icon="flag" small onClick={report} />}
          <GlassButton
            id="DOWNLOAD"
            label={phone ? 'Download' : 'Download as HTML'}
            letter="d"
            icon={DOWN}
            small
           
            disabled={!canDownload || busy}
            onClick={() => void download()}
          />
          <GlassButton id="BACK" label="Back" letter="b" icon="back" small onClick={goStart} />
        </div>
        <LookFlash class="wc-watch-flash" />
      </header>
      <div class="wc-watch-slot" ref={slot}>
        {!playing && (
          <div class="wc-watch-wait">
            <LoadBar done={load?.done ?? 0} total={load?.total ?? meta?.bytes ?? 0} line={load ? loadingLine(load.done, load.total) : 'Loading the run…'} />
          </div>
        )}
      </div>
    </div>
  );
});

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
      <section class="wc-lk-dialog wc-watch-endbox" aria-label="Shared run" data-watch="end">
        <i class="wc-lk-br wc-lk-b1" />
        <i class="wc-lk-br wc-lk-b2" />
        <i class="wc-lk-br wc-lk-b3" />
        <i class="wc-lk-br wc-lk-b4" />
        <div class="wc-lk-hood">
          <span class="wc-lk-hood-t">Shared run</span>
        </div>
        <div class="wc-lk-dwin">
          <div class="wc-lk-dialog-b">
            <p class="wc-lk-q">{p.lines[0]}</p>
            <p class="wc-lk-qn">{p.lines[1]}</p>
          </div>
          <div class="wc-lk-btns wc-lk-dialog-btns">
            {p.retry && <GlassButton id="RETRY" label="Try again" letter="t" onClick={p.retry} />}
            <GlassButton id="BACK" label="Back to MUME Cockpit" letter="b" icon="back" primary onClick={goStart} />
          </div>
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------ Report

type ReportStep = 'form' | 'sending' | 'thanks' | 'already' | 'guest';

interface ReportProps {
  title: string;
  id: string;
  /** Reported from this page already. */
  already: boolean;
  onSent(): void;
  onClosed(): void;
}

/** Report (round 12, point 5): the reasons and a text logged in; "Log in to report" and the abuse address logged out. */
export const ReportFrame = lookFrame(function ReportFrame(p: ReportProps): VNode {
  const nav = useNav();
  const [step, setStep] = useState<ReportStep>(() => (p.already ? 'already' : loggedInName() === null ? 'guest' : 'form'));
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const close = (): void => {
    nav.pop();
    p.onClosed();
  };
  const send = async (): Promise<void> => {
    if (!reason || step === 'sending') return;
    setStep('sending');
    setError(null);
    const t = reportText(text);
    const r = await sendReport({ kind: 'run', target: p.id, reason, ...(t ? { text: t } : {}) });
    if (r.ok) {
      p.onSent();
      setStep('thanks');
    } else if (r.code === 'already_reported') {
      p.onSent();
      setStep('already');
    } else if (r.status === 401) {
      setStep('guest');
    } else {
      setError(reportFailText(r.status, r.code));
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

  if (step === 'thanks') {
    return (
      <Dialog title="Report sent" dlg="report-thanks" width={460} onCancel={close} buttons={[{ id: 'CLOSE', label: 'Close', letter: 'c', primary: true, run: close }]}>
        <p class="wc-lk-q">Thank you.</p>
        <p class="wc-lk-qn">We look at every report. A run that breaks the rules is removed; one that many report is hidden until then.</p>
      </Dialog>
    );
  }
  if (step === 'already') {
    return (
      <Dialog title="Report this run" dlg="report-already" width={440} onCancel={close} buttons={[{ id: 'CLOSE', label: 'Close', letter: 'c', primary: true, run: close }]}>
        <p class="wc-lk-q">You have already reported this run.</p>
        <p class="wc-lk-qn">One report per run is enough; it is in the queue.</p>
      </Dialog>
    );
  }
  if (step === 'guest') {
    const login = (): void => {
      noteLoginReturn(location.pathname + location.search);
      goStart();
    };
    return (
      <Dialog
        title="Report this run"
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
          Reports come from accounts, one per run. Without an account, write to{' '}
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
      title="Report this run"
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
        <p class="wc-lk-qn wc-watch-left">What is wrong with “{p.title}”?</p>
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
        <p class="wc-lk-qn wc-watch-left wc-watch-small">The sender is not told who reported.</p>
      </div>
    </Dialog>
  );
});

// ------------------------------------------------------------ mount

/** Mounts the watch page into `root` (src/main.ts, when the address is under `<base>r/`). */
export function startWatch(root: HTMLElement, path: string = location.pathname, search: string = location.search): void {
  const at = watchIdOf(path, base()) ?? { id: '', valid: false };
  const admin = new URLSearchParams(search).has('admin');
  document.title = 'Shared run · WebCockpit';
  root.replaceChildren();
  const host = document.createElement('div');
  host.className = 'wc-chrome wc-look wc-watch';
  root.appendChild(host);
  render(<FrameStack root={<WatchPage id={at.id} valid={at.valid} admin={admin} />} active={true} />, host);
}
