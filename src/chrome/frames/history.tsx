// History (Inv §7.4, ADR 0018; stage 45, ADR 0130): the recorded sessions
// in the new look, round 7 direction A "Tabell och kort" (table and card)
// in the large box of layout B, capped at its content width.
//
// From stage 67 (ADR 0149) History is one frame (`HistoryFrame`, below)
// with a tab strip over three pages: Sessions (this page,
// `SessionsPage`), Spotlights and Diary (history-tabs.tsx). 1 2 3 change
// tab. `openHistory(nav, tab)` opens it on a tab.
//
//   [Back]                     ( History )
//            [1] Sessions  [2] Spotlights  [3] Diary
//   ─────────────────────────────────────────────────────────────────
//            ( All | Gibur | Gittan | Rasta )                       [?]
//    CHAR    DATE ▾      TIME   DUR.   EXPIRES   RATING  │ ┌ GIBUR ─────────┐
//    Gibur   2026-11-06  21:12  3h41m  14 days           │ │ LEVEL 41       │
//    Gibur   2026-11-05  19:40  2h05m  Saved     ★★★★    │ │ Friday, 6 Nov… │
//    …                                                    │ │ Duration Deeds │
//                                                         │ │ Kept     Log   │
//                                                         │ │ [Run log] …    │
//    [Backup] [Restore]          flash          Storage: 46 MB of 299 GB
//
// The table (the kit's `Table`, sortable heads) and the chosen session's
// card with its six actions (Run log, Stats, Rate, Save, Export, Delete);
// Backup, Restore, the flash and the storage line in the foot. On a narrow
// page (< 680 px of content: a phone) the heads go (a sort list instead),
// rows take two lines and the card opens under the chosen row.
//
// Keys. ↑ ↓ PgUp PgDn (10) Home End move the cursor; ← → change the
// character pill; Enter (Space) or a double click opens the run log; a
// click selects (touch: a tap selects, a tap on the chosen row opens). A
// pointer passing over the rows never moves the cursor (the mockup's list
// has no hover): the card's actions act on the cursor's session, and the
// way to them crosses other rows. A click on a row or a head brings the
// keyboard back to the rows.
// Letters marked in the labels: R Run log, T Stats, A Rate, S Save,
// X Export, D Delete, B Backup, O Restore; `?` (or the "?" button) shows
// the keys. Tab / Shift+Tab: rows ↔ buttons (← → ↑ ↓ walk the enabled
// buttons, Enter presses). Esc or Back returns to the menu.
//
// Run log (stage 45 owner feedback 2026-11-08, ADR 0130): the session
// loads into a player host first (`services.openRunLog`); then the Run log
// page (run-log.tsx) is pushed with it, in the same big box (the box
// swap), the player filling the box's window over the still sky. While it
// is opening (a large log takes a moment) the page holds its keys, its
// Back and its actions; a failed open shows its error box, and a finished
// one pushes the page, only while History is still the top frame (else
// the host is disposed).
//
// The frame keeps its state (filter, sort, cursor, scroll) while a
// sub-frame, a dialog or the run log is shown (it stays mounted under
// them), and the list is re-read whenever the frame is on top again. The
// cursor follows its session through sort, save and reload; after a delete
// it stays at the same index.
//
// Runs in the cloud (stage 63 C2, ADR 0153; round 11's pick 2b): logged
// in with the flag `runs`, the list holds the account's sessions that are
// only in the cloud too. A quiet tag beside the name says "in the cloud ·
// 2.4 MB" (opening fetches it) or "not in the cloud" (a saved run that is
// full, too large, or not uploaded a while after its save); a run in step
// and an unsaved run carry nothing. The card says it under Kept or Log;
// the storage line gives the device's and the cloud's figures. Run log,
// Stats and Export of a session in the cloud fetch it first, with stage
// 24's bar in the card (the actions wait); offline they are off, the tag
// says so and the flash says why. A guest, or the flag off: as before.
//
// Pure helpers (sort, cells, the card's words, the phone's sort list):
// history-model.ts; the cloud's words: src/cloud/runs-words.ts.

import { Component, type Ref, type VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { nowUs } from '../../core/types';
import { type SessionMark, onRunsView, runsView, sessionMark } from '../../cloud/runs-view';
import type { RunCloudRow } from '../../cloud/runs/types';
import { OFFLINE_FLASH, fetchLine, keptNote, logNote, markTag, storageLine } from '../../cloud/runs-words';
import { notFetchedWords } from '../../runs/cloud-hook';
import { BadBackupError, backupFileName } from '../../runs/library';
import type { Session } from '../../runs/stitch';
import { downloadBlob } from '../kit/download';
import { useServices } from '../kit/hooks';
import {
  Box,
  BoxBody,
  BoxFoot,
  BoxHead,
  GlassButton,
  type IconName,
  LookFlash,
  Seg,
  Select,
  Icon,
  LoadBar,
  Stars as LookStars,
  Table,
  TableRow,
  inTextField,
  letterAction,
  lookFrame,
  useButtonZone,
  useListCursor,
} from '../kit/look';
import { type Nav, useIsTop, useKeys, useNav } from '../kit/stack';
import {
  DEFAULT_HISTORY_SORT,
  HISTORY_MAX_W,
  type HistorySort,
  type HistorySortKey,
  deedsParts,
  expiresInText,
  expiresText,
  expiryLeft,
  expiryTone,
  fmtDate,
  fmtDur,
  fmtDurLong,
  fmtLongDate,
  fmtTime,
  nextHistorySort,
  parseSortValue,
  pillNames,
  sessionDeeds,
  sortOptions,
  sortSessions,
  fmtBytes,
  sortValue,
  storageText,
} from './history-model';
import { ExportEditorFrame } from './export-editor';
import { DeleteDialog, HistoryKeysButton, RateDialog, RunLogErrorDialog, openHistoryKeys } from './history-dialogs';
import { HistoryStatsFrame } from './history-stats';
import { RunLogFrame } from './run-log';
import { DiaryPage } from './credits';
import { type HistoryTab, HistoryTabsCtx, type HistoryTabsValue, useHistoryTabs } from './history-tabs';
import { SpotlightsTab } from './spotlights';
import { useRunsOn } from './runs-cloud';
import './history.css';

export const NO_PLAYER = 'Log player not available.';
const EMPTY = 'No runs recorded yet.';
const READ_FAILED = 'The runs could not be read.';

/** Below this content width (px) the page takes its narrow form (two-line rows, the card under the row). */
export const HISTORY_NARROW = 680;

/** The card's actions, in the keyboard's order, then the foot's. */
const CARD_ACTIONS = ['RUN LOG', 'STATS', 'RATE', 'SAVE', 'EXPORT', 'DELETE'] as const;
const FOOT_ACTIONS = ['BACKUP', 'RESTORE'] as const;
type ActionId = (typeof CARD_ACTIONS)[number] | (typeof FOOT_ACTIONS)[number];
const ZONE: readonly ActionId[] = [...CARD_ACTIONS, ...FOOT_ACTIONS];

const ACTION: Record<ActionId, { label: string; letter: string; icon: IconName }> = {
  'RUN LOG': { label: 'Run log', letter: 'r', icon: 'play' },
  STATS: { label: 'Stats', letter: 't', icon: 'stats' },
  RATE: { label: 'Rate', letter: 'a', icon: 'star' },
  SAVE: { label: 'Save', letter: 's', icon: 'save' },
  EXPORT: { label: 'Share', letter: 'h', icon: 'export' },
  DELETE: { label: 'Delete', letter: 'd', icon: 'trash' },
  BACKUP: { label: 'Backup', letter: 'b', icon: 'backup' },
  RESTORE: { label: 'Restore', letter: 'o', icon: 'restore' },
};

const HEADS: { key: HistorySortKey; label: string }[] = [
  { key: 'char', label: 'Char' },
  { key: 'date', label: 'Date' },
  { key: 'time', label: 'Time' },
  { key: 'dur', label: 'Dur.' },
  { key: 'expires', label: 'Expires' },
  { key: 'rating', label: 'Rating' },
];
/** The table's columns (the mockup's; narrower under 1040 px of content, in history.css). */
const COLS = 'var(--wc-hist-cols)';

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const NO_ROWS: ReadonlyMap<string, RunCloudRow> = new Map();

/** The browser's word on the network (`online` / `offline` events). */
function useOffline(): boolean {
  const [off, setOff] = useState(() => globalThis.navigator?.onLine === false);
  useEffect(() => {
    const w = globalThis.window;
    if (!w) return;
    const put = (): void => setOff(globalThis.navigator?.onLine === false);
    w.addEventListener('online', put);
    w.addEventListener('offline', put);
    return () => {
      w.removeEventListener('online', put);
      w.removeEventListener('offline', put);
    };
  }, []);
  return off;
}

/**
 * History (stage 67, ADR 0149): one frame with the tab strip over three
 * pages, Sessions (the page below), Spotlights (spotlights.tsx) and Diary
 * (credits.tsx). `tab` is the one it opens on (default Sessions: H on the
 * start menu). A tab change renders the other page in its own box, at
 * once (no morph: the hood says History on every tab); a page's state is
 * not kept across a change. The run log and the Spotlights viewer stand
 * over the tab they were opened from, so Back returns to it.
 */
export const HistoryFrame = lookFrame(function HistoryFrame(p: { tab?: HistoryTab }): VNode {
  const [tab, setTab] = useState<HistoryTab>(p.tab ?? 'sessions');
  const value = useMemo((): HistoryTabsValue => ({ tab, go: setTab }), [tab]);
  return (
    <HistoryTabsCtx.Provider value={value}>
      {tab === 'sessions' ? <SessionsPage key="sessions" /> : tab === 'spotlights' ? <SpotlightsTab key="spotlights" /> : <DiaryPage key="diary" />}
    </HistoryTabsCtx.Provider>
  );
});

/** Opens History on `tab` (default Sessions) over the current frame. */
export function openHistory(nav: Nav, tab: HistoryTab = 'sessions'): void {
  nav.push(<HistoryFrame tab={tab} />);
}

/** The Sessions tab: the History page of stage 45, under History's tab strip. */
export function SessionsPage(): VNode {
  const { runs, openRunLog } = useServices();
  const nav = useNav();
  const isTop = useIsTop();
  const [all, setAll] = useState<Session[] | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [est, setEst] = useState<{ usage: number; quota: number } | null>(null);
  // Runs in the cloud (stage 63 C2): the rows, the cloud's figures, the network, a fetch in the card.
  const runsOn = useRunsOn();
  const [cloudRows, setCloudRows] = useState<ReadonlyMap<string, RunCloudRow>>(NO_ROWS);
  const [cloudFig, setCloudFig] = useState(() => runsView().cloud);
  const offline = useOffline();
  const [fetching, setFetching] = useState<{ id: string; done: number; total: number } | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<HistorySort>(DEFAULT_HISTORY_SORT);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [cursorIdx, setCursorIdx] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  /** A run log is opening: the page's keys, Back and actions wait. */
  const opening = useRef(false);
  // No tab change while a run log opens (the keys and the strip alike).
  const tabs = useHistoryTabs('History', { hold: () => opening.current });
  const loaded = useRef(false);
  const top = useRef(isTop);
  top.current = isTop;
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const reload = async (): Promise<void> => {
    try {
      const lib = await runs();
      // The account's cloud-only sessions too (ADR 0153; their marks are stage 63 C2's).
      const [list, rows] = await Promise.all([lib.listSessions(nowUs(), { remote: true }), runsView().on ? lib.cloudRows() : Promise.resolve(NO_ROWS)]);
      setAll(list);
      setCloudRows(rows);
      loaded.current = true;
      setReadFailed(false);
      setEst(await lib.estimate());
    } catch (e) {
      // A failed first read leaves the page empty with its note; a later
      // one keeps the list it has.
      if (!loaded.current) setReadFailed(true);
      setAll((cur) => cur ?? []);
      nav.flash(`Could not read the runs: ${errText(e)}`, 'fail');
    }
  };
  useEffect(() => {
    if (isTop) void reload();
  }, [isTop]);
  // The queue and the sync change where sessions are: read again (not under a dialog or a sub-page).
  useEffect(
    () =>
      onRunsView((v) => {
        setCloudFig(v.cloud);
        if (top.current && alive.current) void reload();
      }),
    [],
  );

  // The page's own width decides its form (never the device): measured
  // once at mount (the box is laid out at its final size at once) and on
  // resize. A hidden page (width 0) keeps its form.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const check = (w: number): void => {
      if (w > 0) setNarrow(w < HISTORY_NARROW);
    };
    check(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => {
      const e = es[es.length - 1];
      if (e) check(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pills: All + one per character with sessions. A filter whose last
  // session went falls back to All.
  const names = useMemo(() => pillNames(all ?? []), [all]);
  const pill = filter !== null && names.includes(filter) ? filter : null;
  const pillIdx = pill === null ? 0 : names.indexOf(pill) + 1;

  // Sorted once per change of the list, the pill or the sort (not per key).
  const list = useMemo(
    () =>
      sortSessions(
        (all ?? []).filter((s) => pill === null || s.character === pill),
        sort,
      ),
    [all, pill, sort],
  );
  // The cursor follows its session when the list changes (sort, save,
  // reload); after a delete it stays at the same index.
  let cursor = cursorId === null ? -1 : list.findIndex((s) => s.id === cursorId);
  if (cursor < 0) cursor = Math.max(0, Math.min(cursorIdx, list.length - 1));
  const cur = list[cursor];
  // Each session's tag (null: none); only with runs in the cloud on.
  const marks = useMemo(() => {
    const m = new Map<string, SessionMark>();
    if (!runsOn || cloudRows.size === 0) return m;
    const now = Date.now();
    for (const s of all ?? []) {
      const k = sessionMark(s, cloudRows, now);
      if (k) m.set(s.id, k);
    }
    return m;
  }, [all, cloudRows, runsOn]);
  const curMark = cur ? (marks.get(cur.id) ?? null) : null;
  const curRemote = curMark?.kind === 'remote';
  // Offline with sessions in the cloud: the flash says why they cannot be opened.
  const anyRemote = [...marks.values()].some((m) => m?.kind === 'remote');
  const saidOffline = useRef(false);
  useEffect(() => {
    if (offline && anyRemote && isTop) {
      saidOffline.current = true;
      nav.flash(OFFLINE_FLASH, 'fail', 60_000);
    } else if (!offline && saidOffline.current) {
      // Online again: the line goes.
      saidOffline.current = false;
      nav.flash('', 'ok', 1);
    }
  }, [offline, anyRemote]);

  const moveTo = (i: number): void => {
    const n = Math.max(0, Math.min(list.length - 1, i));
    setCursorIdx(n);
    setCursorId(list[n]?.id ?? null);
  };
  const choosePill = (i: number): void => {
    const n = Math.max(0, Math.min(names.length, i));
    setFilter(n === 0 ? null : names[n - 1]!);
    setCursorId(null);
    setCursorIdx(0);
  };

  const disabled = (b: ActionId): boolean => {
    // A fetch in the card: every action waits.
    if (fetching) return true;
    switch (b) {
      case 'RUN LOG':
      case 'EXPORT':
        return !cur?.hasLog || (curRemote && offline);
      case 'STATS':
        return !cur || (curRemote && offline);
      case 'RATE':
      case 'DELETE':
        return !cur;
      case 'SAVE':
        return !cur || cur.saved;
      case 'BACKUP':
        return (all ?? []).length === 0;
      case 'RESTORE':
        return false;
    }
  };

  const run = async (what: () => Promise<void>): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      await what();
    } finally {
      busy.current = false;
    }
  };

  /**
   * A session in the cloud is fetched before it is read, with stage 24's
   * bar in the card; false (and a flash) when it could not be.
   */
  const fetchFirst = async (s: Session): Promise<boolean> => {
    if (marks.get(s.id)?.kind !== 'remote') return true;
    if (globalThis.navigator?.onLine === false) {
      nav.flash(OFFLINE_FLASH, 'fail');
      return false;
    }
    setFetching({ id: s.id, done: 0, total: 0 });
    try {
      const got = await (await runs()).ensureLocal(s, (done, total) => {
        if (alive.current) setFetching({ id: s.id, done, total });
      });
      if (!got.ok) {
        if (alive.current) nav.flash(notFetchedWords(got.why), 'fail');
        return false;
      }
      return true;
    } catch (e) {
      if (alive.current) nav.flash(notFetchedWords(errText(e)), 'fail');
      return false;
    } finally {
      if (alive.current) {
        setFetching(null);
        void reload();
      }
    }
  };

  /** Stats or Share (the export editor) of `s`, fetched first when it is in the cloud. */
  const openAfterFetch = (s: Session, node: () => VNode): void => {
    // On this device (a guest's always): at once, as before.
    if (marks.get(s.id)?.kind !== 'remote') {
      nav.push(node());
      return;
    }
    void run(async () => {
      opening.current = true;
      try {
        if (!(await fetchFirst(s))) return;
        if (alive.current && top.current) nav.push(node());
      } finally {
        opening.current = false;
      }
    });
  };

  const openLog = (s: Session | undefined): void => {
    if (!s?.hasLog) return;
    if (!openRunLog) {
      nav.flash(NO_PLAYER, 'fail');
      return;
    }
    if (marks.get(s.id)?.kind === 'remote' && globalThis.navigator?.onLine === false) {
      nav.flash(OFFLINE_FLASH, 'fail');
      return;
    }
    void run(async () => {
      opening.current = true;
      try {
        if (!(await fetchFirst(s))) return;
        const r = await openRunLog(s);
        // Only over History: the page and the box belong to it, not to whatever is on top now.
        const here = alive.current && top.current;
        if (r.ok) {
          if (here) nav.push(<RunLogFrame host={r.host} />);
          else r.host.dispose();
        } else if (here) {
          nav.push(<RunLogErrorDialog session={s} error={r.error} />, { overlay: true });
        }
      } finally {
        opening.current = false;
      }
    });
  };

  const save = (): Promise<void> =>
    run(async () => {
      if (!cur || cur.saved) return;
      try {
        await (await runs()).save(cur);
        await reload();
        nav.flash('Saved.');
      } catch (e) {
        nav.flash(`Save failed: ${errText(e)}`, 'fail');
      }
    });

  const backup = (): Promise<void> =>
    run(async () => {
      try {
        const blob = await (await runs()).backup();
        const name = backupFileName(new Date());
        downloadBlob(blob, name);
        nav.flash(`Saved ${name}.`);
      } catch (e) {
        nav.flash(`Backup failed: ${errText(e)}`, 'fail');
      }
    });

  const onFile = (): Promise<void> =>
    run(async () => {
      const input = fileRef.current;
      const file = input?.files?.[0];
      if (!input || !file) return;
      input.value = '';
      try {
        const r = await (await runs()).restore(file);
        await reload();
        nav.flash(`Restored ${r.added} runs (${r.skipped} already present).`);
      } catch (e) {
        nav.flash(
          e instanceof BadBackupError ? `Restore failed: ${e.message}` : `Restore failed: ${errText(e)}`,
          'fail',
        );
      }
    });

  const press = (b: ActionId): void => {
    if (opening.current || disabled(b)) return;
    switch (b) {
      case 'RUN LOG':
        return openLog(cur);
      case 'STATS':
        return cur && openAfterFetch(cur, () => <HistoryStatsFrame session={cur} />);
      case 'RATE':
        return cur && nav.push(<RateDialog session={cur} done={reload} />, { overlay: true });
      case 'SAVE':
        void save();
        return;
      case 'EXPORT':
        // Every device: stage 43 builds the Export editor for the phone (ADR 0075 addendum).
        return cur && openAfterFetch(cur, () => <ExportEditorFrame session={cur} />);
      case 'DELETE':
        return cur && nav.push(<DeleteDialog session={cur} done={reload} />, { overlay: true });
      case 'BACKUP':
        void backup();
        return;
      case 'RESTORE':
        fileRef.current?.click();
        return;
    }
  };

  const lc = useListCursor({
    count: list.length,
    initial: cursor,
    activateOn: 'dblclick',
    touch: 'tap-selects',
    onChange: moveTo,
    onActivate: (i) => openLog(list[i]),
  });
  // The cursor's own index follows the session (sort, filter, reload).
  useLayoutEffect(() => {
    if (lc.i !== cursor) lc.set(cursor);
  }, [cursor, lc.i]);

  const zone = useButtonZone({ ids: ZONE, enabled: (id) => !disabled(id as ActionId), press: (id) => press(id as ActionId) });
  const letters: Record<string, () => void> = Object.fromEntries(
    ZONE.map((id) => [ACTION[id].letter, () => press(id)] as const),
  );

  useKeys((e, nk) => {
    // A run log is opening: hold every key (Esc too) until it has opened or failed.
    if (opening.current) return true;
    // The sort list (a native select) keeps its own keys.
    if (inTextField(e.target) && nk !== 'back') return false;
    if (tabs.key(e)) return true;
    if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      openHistoryKeys(nav);
      return true;
    }
    if (letterAction(e, letters)) return true;
    if (zone.key(e, nk)) return true;
    if (zone.zone !== 'list') return false;
    if (nk === 'left' || nk === 'right') {
      choosePill(pillIdx + (nk === 'left' ? -1 : 1));
      return true;
    }
    return lc.key(e, nk);
  });

  const inRows = zone.zone === 'list';
  const empty = all !== null && all.length === 0;
  const btn = (id: ActionId, extra: { primary?: boolean; danger?: boolean; small?: boolean } = {}): VNode => (
    <GlassButton
      key={id}
      id={id}
      label={ACTION[id].label}
      letter={ACTION[id].letter}
      icon={ACTION[id].icon}
      selected={zone.sel === id}
      disabled={disabled(id)}
      onClick={() => press(id)}
      {...extra}
    />
  );

  const card = (
    <aside key="card" class="wc-hist-card" aria-label="The chosen session" aria-live="polite">
      {cur ? (
        <div key={cur.id} class="wc-hist-card-in">
          <SessionCard s={cur} mark={curMark} offline={offline} />
          {fetching && fetching.id === cur.id && (
            <LoadBar class="wc-hist-load" done={fetching.done} total={fetching.total} line={fetchLine(fetching.done, fetching.total)} />
          )}
          <div class="wc-lk-btncol wc-hist-acts">
            {btn('RUN LOG', { primary: true })}
            {btn('STATS')}
            {btn('RATE')}
            {btn('SAVE')}
            {btn('EXPORT')}
            {btn('DELETE', { danger: true })}
          </div>
        </div>
      ) : (
        <p class="wc-lk-empty wc-hist-card-empty">
          {all === null
            ? ''
            : all.length === 0
              ? 'Recorded sessions show here. Restore brings back a backup from another browser.'
              : 'No session chosen.'}
        </p>
      )}
    </aside>
  );

  // One component per row that re-renders only when its session, place or
  // state changes (a key moves the cursor: two rows render, not all).
  const rows: VNode[] = [];
  list.forEach((s, i) => {
    const on = i === cursor;
    const m = marks.get(s.id) ?? null;
    rows.push(
      <HistoryRow
        key={s.id}
        s={s}
        i={i}
        state={on ? (inRows ? 'cur' : 'idle') : null}
        tag={markTag(m, { offline, narrow })}
        tagKind={m?.kind ?? null}
        narrow={narrow}
      />,
    );
    if (narrow && on) rows.push(card);
  });
  // The rows' pointer handlers, delegated from their parent to the cursor's
  // (no closures per row). No pointer move: hovering a row does not choose
  // it (the mockup's list; the card acts on the cursor). A click or a
  // double click brings the keyboard back to the rows.
  const onRow = (kind: 'onPointerDown' | 'onClick' | 'onDblClick', e: PointerEvent | MouseEvent): void => {
    const row = (e.target as Element | null)?.closest?.('.wc-lk-tr[data-i]');
    const i = row ? Number(row.getAttribute('data-i')) : NaN;
    if (!Number.isFinite(i)) return;
    const rp = lc.rowProps(i);
    if (kind === 'onPointerDown') {
      rp.onPointerDown(e as PointerEvent);
      return;
    }
    zone.reset();
    rp[kind](e);
  };

  const note = all === null ? 'Loading…' : readFailed ? READ_FAILED : empty ? EMPTY : list.length === 0 ? EMPTY : null;

  return (
    <Box title={tabs.title} size="large" maxWidth={HISTORY_MAX_W} onBack={() => {
        if (!opening.current) nav.pop();
      }} class={'wc-hist' + (offline && anyRemote ? ' is-offline' : '')} winClass={'wc-hist-win' + (narrow ? ' is-narrow' : '') + tabs.winClass}>
      {tabs.strip}
      <BoxHead class="wc-hist-head">
        <div class="wc-hist-pills">
          <Seg
            kind="pills"
            label="Character"
            value={pill ?? ''}
            onChange={(v) => choosePill(v === '' ? 0 : names.indexOf(v) + 1)}
            options={[{ value: '', label: 'All', id: 'All' }, ...names.map((n) => ({ value: n, label: n, id: n }))]}
          />
        </div>
        <HistoryKeysButton />
        {narrow && (
          <div class="wc-hist-sort">
            <Select
              id="sort"
              label="Sort by"
              value={sortValue(sort)}
              options={sortOptions(sort)}
              onChange={(v) => {
                const s = parseSortValue(v);
                if (s) setSort(s);
              }}
            />
          </div>
        )}
      </BoxHead>
      <BoxBody class="wc-hist-main" scroll={narrow} bodyRef={bodyRef}>
        <div
          class="wc-hist-tablewrap"
          onPointerDown={(e) => onRow('onPointerDown', e)}
          onClick={(e) => onRow('onClick', e)}
          onDblClick={(e) => onRow('onDblClick', e)}
        >
          <Table
            cols={COLS}
            scroll={!narrow}
            stackBelow={narrow ? STACK_ALWAYS : undefined}
            bodyRef={lc.scrollRef as Ref<HTMLDivElement>}
            heads={HEADS.map((h) => ({ key: h.key, label: h.label, sort: true }))}
            sort={sort}
            onSort={(k) => {
              zone.reset();
              setSort((s) => nextHistorySort(s, k as HistorySortKey));
            }}
          >
            {note !== null ? <p class="wc-lk-empty wc-hist-note">{note}</p> : rows}
            {narrow && note !== null && card}
          </Table>
        </div>
        {!narrow && card}
      </BoxBody>
      <BoxFoot class="wc-hist-foot">
        <div class="wc-hist-footbtns">
          {btn('BACKUP', { small: true })}
          {btn('RESTORE', { small: true })}
        </div>
        <LookFlash class="wc-hist-flash" />
        <span class="wc-hist-storage">{storageLine(est, runsOn ? cloudFig : null, fmtBytes) ?? storageText(est)}</span>
      </BoxFoot>
      <input
        ref={fileRef}
        type="file"
        accept=".gz,.jsonl.gz,application/gzip"
        hidden
        class="wc-history-file"
        onChange={() => void onFile()}
      />
    </Box>
  );
}

/** `stackBelow` that always stacks (the page decides its narrow form by its own width, not the table's). */
const STACK_ALWAYS = 1e6;

interface HistoryRowProps {
  s: Session;
  i: number;
  /** The chosen row: `cur` with the keyboard in the rows, `idle` while it is in the buttons. */
  state: 'cur' | 'idle' | null;
  /** Runs in the cloud (stage 63 C2): the tag's words (empty: none) and kind. */
  tag?: string;
  tagKind?: 'remote' | 'local' | null;
  narrow?: boolean;
}

/**
 * One table row. Its pointer handlers are delegated from the rows' parent
 * (`TableRow` takes no `onPointerDown`, which the cursor needs to tell a
 * tap from a click: a kit gap, reported for wave 3), so the row has no
 * closures and renders again only when its own props change.
 */
class HistoryRow extends Component<HistoryRowProps> {
  override shouldComponentUpdate(n: HistoryRowProps): boolean {
    const p = this.props;
    return n.s !== p.s || n.i !== p.i || n.state !== p.state || n.tag !== p.tag || n.tagKind !== p.tagKind || n.narrow !== p.narrow;
  }

  override render(): VNode {
    const { s, i, state, tag, tagKind, narrow } = this.props;
    const cls = [state === null ? '' : `is-${state}`, tagKind === 'remote' ? 'is-remote' : ''].filter(Boolean).join(' ');
    const tagEl = tag ? <span class={`wc-rc-tag is-${tagKind}`}>{tag}</span> : null;
    return (
      <TableRow id={s.id} on={state !== null} class={cls || undefined} data-i={i}>
        <span class="wc-lk-td wc-hist-char">
          {s.character}
          {!narrow && tagEl}
        </span>
        <span class="wc-lk-td wc-hist-date">{fmtDate(s.startUs)}</span>
        <span class="wc-lk-td wc-hist-time">{fmtTime(s.startUs)}</span>
        <span class="wc-lk-td wc-hist-dur">{fmtDur(s.endUs - s.startUs)}</span>
        <span class={`wc-lk-td wc-hist-exp is-${expiryTone(s)}`}>{expiresText(s)}</span>
        <span class="wc-lk-td wc-hist-rate">{s.saved && s.rating > 0 ? <LookStars n={s.rating} /> : ''}</span>
        {narrow && tag && <span class={`wc-lk-td wc-rc-tag is-${tagKind}`}>{tag}</span>}
      </TableRow>
    );
  }
}

/** The chosen session's card: name, level, the long date, Duration, Deeds, Kept, Log. */
function SessionCard(p: { s: Session; mark?: SessionMark; offline?: boolean }): VNode {
  const s = p.s;
  const m = p.mark ?? null;
  const deeds = sessionDeeds(s);
  const d = deeds && deedsParts(deeds);
  const n = s.runs.length;
  return (
    <>
      <div class="wc-hist-name">
        {s.character}
        {s.level !== undefined && <small>Level {s.level}</small>}
      </div>
      <div class="wc-hist-when">
        {fmtLongDate(s.startUs)} · {fmtTime(s.startUs)}
      </div>
      <dl class="wc-lk-kv wc-hist-kv">
        <dt>Duration</dt>
        <dd>
          {fmtDurLong(s.endUs - s.startUs)}{' '}
          <span class="wc-lk-dim">
            · {n} run{n === 1 ? '' : 's'}
          </span>
        </dd>
        <dt>Deeds</dt>
        <dd>
          {d ? (
            <>
              {d.kills}
              {d.pvp && (
                <>
                  {' · '}
                  <span class="wc-hist-pk">{d.pvp}</span>
                </>
              )}
              {d.deaths && (
                <>
                  {' · '}
                  <span class="wc-hist-dead">{d.deaths}</span>
                </>
              )}
            </>
          ) : (
            <span class="wc-lk-faint">Not recorded</span>
          )}
        </dd>
        <dt>Kept</dt>
        <dd>
          {s.saved || s.expiresDays === null ? (
            <>
              <span class="wc-lk-gold">Saved</span>
              {s.rating > 0 && (
                <>
                  {' '}
                  <LookStars n={s.rating} />
                </>
              )}
              {m?.kind === 'local' && (
                <span class="wc-rc-kept" data-note="local">
                  <Icon name="cloudOff" class="wc-rc-cloud" />
                  {keptNote(m.why)}
                </span>
              )}
            </>
          ) : (
            <>
              {expiresInText(s.expiresDays)}
              <i class="wc-hist-gauge" aria-hidden="true">
                <b style={{ width: `${expiryLeft(s.expiresDays) * 100}%` }} />
              </i>
            </>
          )}
        </dd>
        <dt>Log</dt>
        <dd>
          {m?.kind === 'remote' ? (
            <CloudLog bytes={m.bytes} offline={!!p.offline} />
          ) : s.hasLog ? (
            'Captured text'
          ) : (
            <span class="wc-lk-faint">No text captured</span>
          )}
        </dd>
      </dl>
    </>
  );
}

/** The card's Log for a session in the cloud: `In the cloud · 2.4 MB`, then fetched when opened (or needs the network). */
function CloudLog(p: { bytes: number; offline: boolean }): VNode {
  const n = logNote(p.bytes, p.offline);
  return (
    <>
      <span class="wc-rc-log" data-note="remote">
        <Icon name="cloud" class={'wc-rc-cloud' + (p.offline ? ' is-faint' : '')} />
        {n.line}
      </span>
      <span class={'wc-rc-logsub' + (p.offline ? ' is-off' : '')}>{n.sub}</span>
    </>
  );
}
