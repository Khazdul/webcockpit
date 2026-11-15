// Runs in the cloud, the views shared by several pages (stage 63 C2, ADR
// 0153; round 11's picks, notes/research/start-menu-mockups/round11/):
//
// - The "does not fit" dialog (pick 1a): the kit's dialog "Cloud storage
//   full" where the save was asked, after an Exit on the start page.
//   `useDoesNotFit` (mounted once, by the start menu, the stack's bottom
//   frame) takes the events of src/cloud/runs-view.ts, also those fired
//   before the chrome was up (`takeDoesNotFit`), waits while a game or a
//   run log plays, and shows them one after the other, at most once per
//   session per page. Download the run (the runs backup of that session),
//   Open History (left out when History is open under it), Keep on this
//   device (the primary: Enter; Esc too).
// - The move's line (`useMoveLine`): after Create account, saved runs of
//   the device that do not fit get one start-menu line, no dialog.
// - The count of Spotlights' and Diary's foot (`CloudCount`, pick 5):
//   "N sessions in the cloud are not counted", with Fetch all on a desktop
//   (a phone or a tablet never fetches a library by itself); hidden when
//   N is 0 or runs in the cloud are off.
//
// With runs in the cloud off (a guest, the flag) nothing here shows.

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type DoesNotFit, cloudOnlySessions, fetchAll, onDoesNotFit, onRunsView, runsView, takeDoesNotFit } from '../../cloud/runs-view';
import { KEPT_HERE, cloudSize, fetchAllFailed, fetchAllLine, notCountedLine, notFitWords, notInCloudAfterMoveLine } from '../../cloud/runs-words';
import { device } from '../../core/device';
import { isPlaying, onPlaying } from '../../core/playing';
import { spaceStorageKey } from '../../core/space';
import { backupFileName } from '../../runs/library';
import type { Session } from '../../runs/stitch';
import { downloadBlob } from '../kit/download';
import { useServices } from '../kit/hooks';
import { Dialog, GlassButton, Icon, LoadBar, lookFrame } from '../kit/look';
import { type Nav, useNav } from '../kit/stack';
import { fmtDurLong } from './history-model';
import { openHistory } from './history';
import './runs-cloud.css';

// ------------------------------------------------------------ History open

/** History is in the frame stack (not leaving): the dialog then leaves out Open History. */
function historyInStack(): boolean {
  const doc = globalThis.document;
  return !!doc?.querySelector('.wc-stack > .wc-frame:not([data-held="pop"]) .wc-htabs');
}

// ------------------------------------------------------------ "does not fit"

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The run's line under the dialog's words: `Saturday, 14 November · 4 h 4 min · 2.1 MB` after the name. */
export function notFitRunLine(s: Pick<Session, 'startUs' | 'endUs'>, size: number): string {
  const d = new Date(s.startUs / 1000);
  const parts = [`${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`, fmtDurLong(s.endUs - s.startUs)];
  if (size > 0) parts.push(cloudSize(size));
  return parts.join(' · ');
}

/** The sessions already told in this page (a session's runs are told once). */
const told = new Set<string>();

/** Tests: forget what was told. */
export function resetToldForTests(): void {
  told.clear();
}

/** The "does not fit" dialog (pick 1a). */
export const DoesNotFitDialog = lookFrame(function DoesNotFitDialog(p: { fit: DoesNotFit; session: Session | null; overHistory: boolean; onClose: () => void }): VNode {
  const { runs } = useServices();
  const nav = useNav();
  const done = useRef(false);
  const words = notFitWords(p.fit);
  const close = (): void => {
    if (done.current) return;
    done.current = true;
    nav.pop();
    p.onClose();
  };
  const download = async (): Promise<void> => {
    const s = p.session;
    if (!s) return;
    try {
      const blob = await (await runs()).backup(undefined, { only: new Set(s.runs.map((r) => r.runId)) });
      downloadBlob(blob, backupFileName(new Date()));
    } catch {
      /* History's own Backup says why */
    }
  };
  const history = (): void => {
    if (done.current) return;
    done.current = true;
    nav.pop(nav.depth() - 1);
    openHistory(nav);
    p.onClose();
  };
  return (
    <Dialog
      title={words.title}
      dlg="run-full"
      width={520}
      onCancel={close}
      buttons={[
        ...(p.session ? [{ id: 'DOWNLOAD', label: 'Download the run', letter: 'd', run: () => void download() }] : []),
        ...(p.overHistory ? [] : [{ id: 'HISTORY', label: 'Open History', letter: 'h', run: history }]),
        { id: 'KEEP', label: 'Keep on this device', letter: 'k', primary: true, run: close },
      ]}
    >
      <div class="wc-rf" data-reason={p.fit.reason}>
        <p class="wc-lk-q">{words.line}</p>
        <p class="wc-lk-qn">{KEPT_HERE}</p>
        {p.session && (
          <p class="wc-rf-run">
            <Icon name="cloudOff" class="wc-rc-cloud" />
            <span>
              <b>{p.session.character}</b> · {notFitRunLine(p.session, p.fit.size)}
            </span>
          </p>
        )}
      </div>
    </Dialog>
  );
});

/**
 * Shows the "does not fit" events (the start menu mounts it once): over
 * the page on top, never while a game or a run log plays, one at a time,
 * once per session per page.
 */
export function useDoesNotFit(nav: Nav): void {
  const { runs } = useServices();
  const navRef = useRef(nav);
  navRef.current = nav;
  useEffect(() => {
    let alive = true;
    let busy = false;
    const pump = async (): Promise<void> => {
      if (busy || !alive || isPlaying()) return;
      busy = true;
      try {
        for (;;) {
          if (!alive || isPlaying()) return;
          const fit = takeDoesNotFit();
          if (!fit) return;
          if (told.has(fit.sessionId)) continue;
          told.add(fit.sessionId);
          const lib = await runs().catch(() => null);
          const all = lib ? await lib.listSessions(Date.now() * 1000).catch(() => [] as Session[]) : [];
          const session = all.find((s) => s.id === fit.sessionId) ?? all.find((s) => s.runs.some((r) => r.runId === fit.runId)) ?? null;
          if (!alive) return;
          await new Promise<void>((resolve) => {
            navRef.current.push(<DoesNotFitDialog fit={fit} session={session} overHistory={historyInStack()} onClose={resolve} />, { overlay: true });
          });
        }
      } finally {
        busy = false;
      }
    };
    const offFit = onDoesNotFit(() => void pump());
    const offPlay = onPlaying((on) => {
      if (!on) void pump();
    });
    void pump();
    return () => {
      alive = false;
      offFit();
      offPlay();
    };
  }, []);
}

// ------------------------------------------------------------ the move's line

const MOVE_TOLD = 'webcockpit-runs-move-told';

function readTold(): number {
  try {
    return Number(globalThis.localStorage?.getItem(spaceStorageKey(MOVE_TOLD)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeTold(n: number): void {
  try {
    globalThis.localStorage?.setItem(spaceStorageKey(MOVE_TOLD), String(n));
  } catch {
    /* private mode */
  }
}

/**
 * After Create account: the saved runs moved in that do not fit get one
 * line on the start menu (no dialog), once (the number told is kept per
 * space, so a reload does not say it again; told again only when more do
 * not fit).
 */
export function useMoveLine(nav: Nav, isTop: boolean): void {
  useEffect(() => {
    if (!isTop) return;
    // (Never set back on 0: the view says 0 until the queue has looked at the rows after a load.)
    const check = (n: number): void => {
      if (n <= readTold()) return;
      writeTold(n);
      nav.flash(notInCloudAfterMoveLine(n), 'ok', 12_000);
    };
    check(runsView().notInCloudAfterMove);
    return onRunsView((v) => check(v.notInCloudAfterMove));
  }, [isTop]);
}

// ------------------------------------------------------------ the counts (pick 5)

/** Runs in the cloud are on in this page (follows the view). */
export function useRunsOn(): boolean {
  const [on, setOn] = useState(() => runsView().on);
  useEffect(() => {
    setOn(runsView().on);
    return onRunsView((v) => setOn(v.on));
  }, []);
  return on;
}

/**
 * The foot's count: a cloud, "N sessions in the cloud are not counted",
 * and Fetch all on a desktop (stage 24's bar while it fetches; then
 * `onFetched` rebuilds the page). Nothing when N is 0 or runs in the
 * cloud are off.
 */
export function CloudCount(p: { onFetched: () => void; class?: string }): VNode | null {
  const { runs } = useServices();
  const nav = useNav();
  const on = useRunsOn();
  const [n, setN] = useState(0);
  const [fetching, setFetching] = useState<{ done: number; total: number } | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const count = async (): Promise<void> => {
    const lib = await runs().catch(() => null);
    const c = lib ? await cloudOnlySessions(lib).catch(() => 0) : 0;
    if (alive.current) setN(c);
  };
  useEffect(() => {
    if (!on) {
      setN(0);
      return;
    }
    void count();
    // A sync may bring (or a fetch take away) sessions only in the cloud.
    return onRunsView(() => void count());
  }, [on]);
  if (!on || (n === 0 && !fetching)) return null;
  const desktop = !device().phone;
  const fetchNow = async (): Promise<void> => {
    if (fetching) return;
    const sessions = n;
    setFetching({ done: 0, total: 0 });
    const out = await fetchAll((done, total) => {
      if (alive.current) setFetching({ done, total });
    });
    if (!alive.current) return;
    setFetching(null);
    await count();
    if (!out.ok) nav.flash(fetchAllFailed(out.why), 'fail');
    if (out.fetched > 0 || sessions > 0) p.onFetched();
  };
  if (fetching) {
    return (
      <span class={'wc-rc-count is-busy' + (p.class ? ` ${p.class}` : '')} data-count="busy">
        <LoadBar inline done={fetching.done} total={fetching.total} line={fetchAllLine(n, fetching.done, fetching.total)} />
      </span>
    );
  }
  return (
    <span class={'wc-rc-count' + (p.class ? ` ${p.class}` : '')} data-count={n}>
      <Icon name="cloud" class="wc-rc-cloud" />
      <span class="wc-rc-count-t">{notCountedLine(n)}</span>
      {desktop && <GlassButton id="FETCHALL" label="Fetch all" small onClick={() => void fetchNow()} />}
    </span>
  );
}
