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
// While a run log is opening (a large log takes a moment) the page holds
// its keys, its Back and its actions, so the player opens over History and
// its Back returns there; a failed open shows its error box only while
// History is still the top frame.
//
// The frame keeps its state (filter, sort, cursor, scroll) while a
// sub-frame, a dialog or the log player is shown: the start page is only
// hidden, and the list is re-read whenever the frame is on top again. The
// cursor follows its session through sort, save and reload; after a delete
// it stays at the same index.
//
// Pure helpers (sort, cells, the card's words, the phone's sort list):
// history-model.ts.

import { Component, type Ref, type VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { nowUs } from '../../core/types';
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
  Stars as LookStars,
  Table,
  TableRow,
  inTextField,
  letterAction,
  lookFrame,
  useButtonZone,
  useListCursor,
} from '../kit/look';
import { useIsTop, useKeys, useNav } from '../kit/stack';
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
  sortValue,
  storageText,
} from './history-model';
import { ExportEditorFrame } from './export-editor';
import { DeleteDialog, HistoryKeysButton, RateDialog, RunLogErrorDialog, openHistoryKeys } from './history-dialogs';
import { HistoryStatsFrame } from './history-stats';
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
  /** A run log is opening: the page's keys, Back and actions wait. */
  const opening = useRef(false);
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
      opening.current = true;
      try {
        const r = await openPlayer(s);
        // Only over History: the box belongs to this page, not to whatever is on top now.
        if (r && !r.ok && alive.current && top.current) {
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
        return cur && nav.push(<HistoryStatsFrame session={cur} />);
      case 'RATE':
        return cur && nav.push(<RateDialog session={cur} done={reload} />, { overlay: true });
      case 'SAVE':
        void save();
        return;
      case 'EXPORT':
        // Every device: stage 43 builds the Export editor for the phone (ADR 0075 addendum).
        return cur && nav.push(<ExportEditorFrame session={cur} />);
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

  // One component per row that re-renders only when its session, place or
  // state changes (a key moves the cursor: two rows render, not all).
  const rows: VNode[] = [];
  list.forEach((s, i) => {
    const on = i === cursor;
    rows.push(<HistoryRow key={s.id} s={s} i={i} state={on ? (inRows ? 'cur' : 'idle') : null} />);
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
    <Box title="History" size="large" maxWidth={HISTORY_MAX_W} onBack={() => {
        if (!opening.current) nav.pop();
      }} class="wc-hist" winClass={'wc-hist-win' + (narrow ? ' is-narrow' : '')}>
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

interface HistoryRowProps {
  s: Session;
  i: number;
  /** The chosen row: `cur` with the keyboard in the rows, `idle` while it is in the buttons. */
  state: 'cur' | 'idle' | null;
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
    return n.s !== p.s || n.i !== p.i || n.state !== p.state;
  }

  override render(): VNode {
    const { s, i, state } = this.props;
    return (
      <TableRow id={s.id} on={state !== null} class={state === null ? undefined : `is-${state}`} data-i={i}>
        <span class="wc-lk-td wc-hist-char">{s.character}</span>
        <span class="wc-lk-td wc-hist-date">{fmtDate(s.startUs)}</span>
        <span class="wc-lk-td wc-hist-time">{fmtTime(s.startUs)}</span>
        <span class="wc-lk-td wc-hist-dur">{fmtDur(s.endUs - s.startUs)}</span>
        <span class={`wc-lk-td wc-hist-exp is-${expiryTone(s)}`}>{expiresText(s)}</span>
        <span class="wc-lk-td wc-hist-rate">{s.saved && s.rating > 0 ? <LookStars n={s.rating} /> : ''}</span>
      </TableRow>
    );
  }
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
