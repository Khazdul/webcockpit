// History (Inv §7.4, ADR 0018; stage 45, ADR 0130): the recorded sessions
// in the new look, round 7 direction A "Tabell och kort" (table and card)
// in the large box of layout B, capped at its content width.
//
//   [Back]                     ( History )
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
// click selects (touch: a tap selects, a tap on the chosen row opens).
// Letters marked in the labels: R Run log, T Stats, A Rate, S Save,
// X Export, D Delete, B Backup, O Restore; `?` (or the "?" button) shows
// the keys. Tab / Shift+Tab: rows ↔ buttons (← → ↑ ↓ walk the enabled
// buttons, Enter presses). Esc or Back returns to the menu.
//
// The frame keeps its state (filter, sort, cursor, scroll) while a
// sub-frame, a dialog or the log player is shown: the start page is only
// hidden, and the list is re-read whenever the frame is on top again. The
// cursor follows its session through sort, save and reload; after a delete
// it stays at the same index.
//
// Pure helpers (sort, cells, the card's words, the phone's sort list):
// history-model.ts.

import type { Ref, VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { nowUs } from '../../core/types';
import { BadBackupError, backupFileName } from '../../runs/library';
import type { Session } from '../../runs/stitch';
import { downloadBlob } from '../kit/download';
import { useGrid, useServices } from '../kit/hooks';
import {
  Box,
  BoxBody,
  BoxFoot,
  BoxHead,
  Dialog,
  GlassButton,
  type IconName,
  LookFlash,
  Seg,
  Select,
  Stars as LookStars,
  Table,
  TableRow,
  inTextField,
  letterAction,
  lookFrame,
  openKeyHelp,
  useButtonZone,
  useListCursor,
} from '../kit/look';
import { centreLeft } from '../kit/nav';
import { type Nav, useIsTop, useKeys, useNav } from '../kit/stack';
import { Blank, Centered, FlashRow, Line, Page, STARS_W, Stars, ratingKey } from '../kit/widgets';
import {
  DEFAULT_HISTORY_SORT,
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
  sortValue,
  stars,
  storageText,
} from './history-model';
import { ExportEditorFrame } from './export-editor';
import { SessionStatsFrame } from './statistics';
import './history.css';

export const NO_PLAYER = 'Log player not available.';
const EMPTY = 'No runs recorded yet.';
const READ_FAILED = 'The runs could not be read.';

/** The box stops at its content's width (table ≤ 800 + gap 26 + card 290 + padding), centred (owner decision 2). */
export const HISTORY_MAX_W = 1180;
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
  EXPORT: { label: 'Export', letter: 'x', icon: 'export' },
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

export const HistoryFrame = lookFrame(function HistoryFrame(): VNode {
  const { runs, openPlayer } = useServices();
  const nav = useNav();
  const isTop = useIsTop();
  const [all, setAll] = useState<Session[] | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [storage, setStorage] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<HistorySort>(DEFAULT_HISTORY_SORT);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [cursorIdx, setCursorIdx] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const loaded = useRef(false);

  const reload = async (): Promise<void> => {
    try {
      const lib = await runs();
      setAll(await lib.listSessions(nowUs()));
      loaded.current = true;
      setReadFailed(false);
      setStorage(storageText(await lib.estimate()));
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
  const names = pillNames(all ?? []);
  const pill = filter !== null && names.includes(filter) ? filter : null;
  const pillIdx = pill === null ? 0 : names.indexOf(pill) + 1;

  const list = sortSessions(
    (all ?? []).filter((s) => pill === null || s.character === pill),
    sort,
  );
  // The cursor follows its session when the list changes (sort, save,
  // reload); after a delete it stays at the same index.
  let cursor = cursorId === null ? -1 : list.findIndex((s) => s.id === cursorId);
  if (cursor < 0) cursor = Math.max(0, Math.min(cursorIdx, list.length - 1));
  const cur = list[cursor];

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
    switch (b) {
      case 'RUN LOG':
      case 'EXPORT':
        return !cur?.hasLog;
      case 'STATS':
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

  const openLog = (s: Session | undefined): void => {
    if (!s?.hasLog) return;
    if (!openPlayer) {
      nav.flash(NO_PLAYER, 'fail');
      return;
    }
    void run(async () => {
      const r = await openPlayer(s);
      if (r && !r.ok) nav.push(<RunLogErrorDialog session={s} error={r.error} />, { overlay: true });
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
    if (disabled(b)) return;
    switch (b) {
      case 'RUN LOG':
        return openLog(cur);
      case 'STATS':
        return cur && nav.push(<HistoryStatsFrame session={cur} />);
      case 'RATE':
        return cur && openRate(nav, cur, reload);
      case 'SAVE':
        void save();
        return;
      case 'EXPORT':
        // Every device: stage 43 builds the Export editor for the phone (ADR 0075 addendum).
        return cur && nav.push(<ExportEditorFrame session={cur} />);
      case 'DELETE':
        return cur && openDelete(nav, cur, reload);
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
    // The sort list (a native select) keeps its own keys.
    if (inTextField(e.target) && nk !== 'back') return false;
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
          <SessionCard s={cur} />
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

  const rows: VNode[] = [];
  list.forEach((s, i) => {
    const on = i === cursor;
    const tone = expiryTone(s);
    const rp = lc.rowProps(i);
    rows.push(
      <TableRow
        key={s.id}
        id={s.id}
        on={on}
        class={on ? (inRows ? 'is-cur' : 'is-idle') : undefined}
        data-i={i}
        onPointerMove={rp.onPointerMove}
        onClick={rp.onClick}
        onDblClick={rp.onDblClick}
      >
        <span class="wc-lk-td wc-hist-char">{s.character}</span>
        <span class="wc-lk-td wc-hist-date">{fmtDate(s.startUs)}</span>
        <span class="wc-lk-td wc-hist-time">{fmtTime(s.startUs)}</span>
        <span class="wc-lk-td wc-hist-dur">{fmtDur(s.endUs - s.startUs)}</span>
        <span class={`wc-lk-td wc-hist-exp is-${tone}`}>{expiresText(s)}</span>
        <span class="wc-lk-td wc-hist-rate">{s.saved && s.rating > 0 ? <LookStars n={s.rating} /> : ''}</span>
      </TableRow>,
    );
    if (narrow && on) rows.push(card);
  });

  const note = all === null ? 'Loading…' : readFailed ? READ_FAILED : empty ? EMPTY : list.length === 0 ? EMPTY : null;

  return (
    <Box title="History" size="large" maxWidth={HISTORY_MAX_W} onBack={() => nav.pop()} class="wc-hist" winClass={'wc-hist-win' + (narrow ? ' is-narrow' : '')}>
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
        <div class="wc-hist-tablewrap" onPointerDown={(e) => rowPointerDown(e, lc.rowProps)}>
          <Table
            cols={COLS}
            scroll={!narrow}
            stackBelow={narrow ? STACK_ALWAYS : undefined}
            bodyRef={lc.scrollRef as Ref<HTMLDivElement>}
            heads={HEADS.map((h) => ({ key: h.key, label: h.label, sort: true }))}
            sort={sort}
            onSort={(k) => setSort((s) => nextHistorySort(s, k as HistorySortKey))}
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
        <span class="wc-hist-storage">{storage}</span>
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
});

/** `stackBelow` that always stacks (the page decides its narrow form by its own width, not the table's). */
const STACK_ALWAYS = 1e6;

/**
 * Local helper (kit gap, reported for wave 3): `TableRow` does not take a
 * cursor's `onPointerDown`, so the pointer type that tells a tap from a
 * click (`touch: 'tap-selects'`) is handed over here, from the rows' parent.
 */
function rowPointerDown(e: PointerEvent, rowProps: (i: number) => { onPointerDown(e: PointerEvent): void }): void {
  const row = (e.target as Element | null)?.closest?.('.wc-lk-tr[data-i]');
  const i = row ? Number(row.getAttribute('data-i')) : NaN;
  if (Number.isFinite(i)) rowProps(i).onPointerDown(e);
}

/** The chosen session's card: name, level, the long date, Duration, Deeds, Kept, Log. */
function SessionCard(p: { s: Session }): VNode {
  const s = p.s;
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
        <dd>{s.hasLog ? 'Captured text' : <span class="wc-lk-faint">No text captured</span>}</dd>
      </dl>
    </>
  );
}

// ------------------------------------------------------------------ stand-ins
//
// WP 45-B (`history-stats.tsx`: HistoryStatsFrame) and WP 45-C
// (`history-dialogs.tsx`: RateDialog, DeleteDialog, RunLogErrorDialog,
// HistoryKeysButton, openHistoryKeys) are built in parallel. Until they
// land on the stage branch the page uses these stand-ins with the
// contract's names: Statistics, Rate and Delete are today's frames (old
// look, on the cell grid), the run-log error box and the keys box are the
// kit's `Dialog` and `openKeyHelp`. At the merge this block goes and the
// two files' exports are imported instead (the call sites stay).

/** Stand-in for WP 45-B's `HistoryStatsFrame`: today's Statistics frame. */
function HistoryStatsFrame(p: { session: Session }): VNode {
  return <SessionStatsFrame session={p.session} />;
}

/** Stand-in for WP 45-C's `RateDialog` (an overlay frame): today's Rate frame. */
function openRate(nav: Nav, s: Session, done: () => Promise<void>): void {
  nav.push(<RateFrame session={s} done={done} />);
}

/** Stand-in for WP 45-C's `DeleteDialog` (an overlay frame): today's Delete frame. */
function openDelete(nav: Nav, s: Session, done: () => Promise<void>): void {
  nav.push(<DeleteFrame session={s} done={done} />);
}

/** History's keys (the "?" box): no key-hint row on the page (owner decision 4). */
const HISTORY_KEYS: [string, string][] = [
  ['↑ ↓', 'Move'],
  ['PgUp PgDn', 'Ten rows'],
  ['Home End', 'First, last'],
  ['← →', 'Character'],
  ['Enter', 'Run log'],
  ['R', 'Run log'],
  ['T', 'Stats'],
  ['A', 'Rate'],
  ['S', 'Save'],
  ['X', 'Export'],
  ['D', 'Delete'],
  ['B', 'Backup'],
  ['O', 'Restore'],
  ['Tab', 'Buttons'],
  ['?', 'This list'],
  ['Esc', 'Back'],
];

/** Stand-in for WP 45-C's `openHistoryKeys`. */
function openHistoryKeys(nav: Nav): void {
  openKeyHelp(nav, 'Keys', HISTORY_KEYS);
}

/** Stand-in for WP 45-C's `HistoryKeysButton`: the "?" glass icon button. */
function HistoryKeysButton(): VNode {
  const nav = useNav();
  return <GlassButton id="KEYS" icon="help" title="Keys (?)" small onClick={() => openHistoryKeys(nav)} />;
}

/** Stand-in for WP 45-C's `RunLogErrorDialog` (an overlay frame). */
const RunLogErrorDialog = lookFrame(function RunLogErrorDialog(p: { session: Session; error: string }): VNode {
  const nav = useNav();
  const close = (): void => nav.pop();
  return (
    <Dialog title="Run log" dlg="runlog-error" buttons={[{ id: 'OK', label: 'OK', primary: true, run: close }]} onCancel={close}>
      <p class="wc-lk-q">This run log could not be opened.</p>
      <p class="wc-lk-qn wc-hist-err">{p.error}</p>
      <p class="wc-lk-qn">The run data may be damaged. Stats and Backup may still work.</p>
    </Dialog>
  );
});

// ------------------------------------------------------------------ rate

/** Rate the session (Inv §7.4): 0–5, ←/→, click; Enter/Space saves (also an unsaved chain); ESC cancels. */
export function RateFrame(p: { session: Session; done: () => Promise<void> }): VNode {
  const { runs } = useServices();
  const nav = useNav();
  const { cols } = useGrid();
  const [rating, setRating] = useState(p.session.saved ? p.session.rating : 0);
  const busy = useRef(false);
  const commit = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      await (await runs()).save(p.session, rating);
      await p.done();
      nav.pop();
      nav.flash(rating > 0 ? `Rated ${stars(rating)}.` : 'Saved, no rating.');
    } catch (e) {
      nav.pop();
      nav.flash(`Rating failed: ${errText(e)}`, 'fail');
    }
  };
  useKeys((e, nk) => {
    if (nk === 'activate') {
      void commit();
      return true;
    }
    const r = ratingKey(e, rating);
    if (r === null) return false;
    setRating(r);
    return true;
  });
  const s = p.session;
  return (
    <Page
      title="Rate the session"
      footer={[
        '0-5 Rate',
        '←→ Adjust',
        { text: 'Enter Save', onClick: () => void commit() },
        { text: 'ESC Cancel', onClick: () => nav.pop() },
      ]}
    >
      <Centered
        text={`${s.character} · ${fmtDate(s.startUs)} · ${fmtTime(s.startUs)} · ${fmtDur(s.endUs - s.startUs)}`}
        class="wc-c-body"
      />
      <Blank />
      <Stars value={rating} at={centreLeft(cols, STARS_W)} onSet={setRating} />
      <Blank />
      <FlashRow />
    </Page>
  );
}

// ---------------------------------------------------------------- delete

/** Delete session (Inv §7.4, a modal): Y deletes every run of the chain; any other key cancels. */
export function DeleteFrame(p: { session: Session; done: () => Promise<void> }): VNode {
  const { runs } = useServices();
  const nav = useNav();
  const { cols } = useGrid();
  const busy = useRef(false);
  const s = p.session;
  const confirm = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      await (await runs()).remove(s);
      await p.done();
      nav.pop();
      nav.flash('Session deleted.');
    } catch (e) {
      nav.pop();
      nav.flash(`Delete failed: ${errText(e)}`, 'fail');
    }
  };
  useKeys((e) => {
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return true;
    if ((e.key === 'y' || e.key === 'Y') && !e.ctrlKey && !e.altKey && !e.metaKey) void confirm();
    else nav.pop();
    return true;
  });
  const rows: Array<[string, string]> = [
    ['Character', s.character],
    ['Date', fmtDate(s.startUs)],
    ['Time', fmtTime(s.startUs)],
    ['Duration', fmtDur(s.endUs - s.startUs)],
    ['Runs', String(s.runs.length)],
  ];
  const x = centreLeft(cols, 11 + Math.max(...rows.map(([, v]) => v.length)));
  return (
    <Page
      title="Delete session"
      titleClass="wc-c-header"
      footer={[
        { text: 'Y Delete', onClick: () => void confirm() },
        { text: 'Any other key Cancel', onClick: () => nav.pop() },
      ]}
    >
      {rows.map(([k, v]) => (
        <Line at={x}>
          <span class="wc-c-hint">{k.padEnd(11)}</span>
          <span class="wc-c-item">{v}</span>
        </Line>
      ))}
      {s.saved && <Centered text={`Saved: yes${s.rating > 0 ? ' — ' + stars(s.rating) : ''}`} class="wc-c-accent" />}
      <Blank />
      <Centered text="This will permanently delete the session's logs and run data." class="wc-c-hint" />
      <Centered text="This cannot be undone." class="wc-c-hint" />
    </Page>
  );
}
