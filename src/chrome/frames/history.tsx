// History (Inv §7.4, ADR 0018): the recorded sessions, and Rate, Delete.
//
//                       ─── History ───
//            [ All ]  Gittan   Rasta                     filter pills
//
//   RUN LOG   Char    Date ▼      Time   Dur.   Expires   Rating
//   STATS     Rasta   2026-09-26  21:00  1h10m  Saved     ★★★★
//   RATE      Gittan  2026-09-25  20:15  35m    12 days
//   SAVE …
//   EXPORT · DELETE · BACKUP · RESTORE · BACK
//                    flash row (Saved., Restored 4 runs …)
//                    Storage: 1.2 MB of 2.0 GB
//
// Three focus zones: filter → table → buttons (Tab / Shift+Tab). Filter
// ←/→ move the pill cursor and filter at once (clamped; the row windows by
// whole pills with ‹ › when it overflows), ↓ / Enter enter the table at
// row 0. Table ↑ on row 0 goes back to the filter, ← to the buttons;
// Enter / Space / click on a row with a log opens the log player
// (`ChromeServices.openPlayer`); EXPORT opens the export editor
// (export-editor.tsx, stage 7). Buttons: ↑ from the first enabled one goes
// to the filter, ↓ wraps, → to the table. The wheel scrolls the table.
//
// The frame keeps its state (filter, sort, cursor, scroll) while a
// sub-frame or the log player is shown: the start page is only hidden, and
// the list is re-read whenever the frame is on top again.
//
// Pure helpers (sort, cells, pill window): history-model.ts.

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { nowUs } from '../../core/types';
import { BadBackupError, backupFileName } from '../../runs/library';
import type { Session } from '../../runs/stitch';
import { downloadBlob } from '../kit/download';
import { useGrid, useServices } from '../kit/hooks';
import { centreLeft, step } from '../kit/nav';
import { useIsTop, useKeys, useNav } from '../kit/stack';
import {
  Blank,
  Button,
  Centered,
  type Column,
  FlashRow,
  Line,
  Page,
  STARS_W,
  Stars,
  Table,
  indent,
  ratingKey,
  useBodyRows,
} from '../kit/widgets';
import {
  DEFAULT_HISTORY_SORT,
  type HistorySort,
  type HistorySortKey,
  PILL_GAP,
  PILL_SLOT,
  expiresCell,
  fmtDate,
  fmtDur,
  fmtTime,
  nextHistorySort,
  panPills,
  pillNames,
  pillWidth,
  pillWindow,
  ratingCell,
  scrollPills,
  sortSessions,
  stars,
  storageText,
} from './history-model';
import { ExportEditorFrame } from './export-editor';
import { SessionStatsFrame } from './statistics';

const BUTTONS = ['RUN LOG', 'STATS', 'RATE', 'SAVE', 'EXPORT', 'DELETE', 'BACKUP', 'RESTORE', 'BACK'] as const;
type ButtonId = (typeof BUTTONS)[number];
const BUTTON_W = Math.max(...BUTTONS.map((b) => b.length)) + 2;
const GAP = 2;
const EMPTY = 'No runs recorded yet.';
export const NO_PLAYER = 'Log player not available.';

type Zone = 'filter' | 'table' | 'buttons';

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function HistoryFrame(): VNode {
  const { runs, openPlayer } = useServices();
  const nav = useNav();
  const isTop = useIsTop();
  const { cols } = useGrid();
  const bodyRows = useBodyRows();
  const [all, setAll] = useState<Session[] | null>(null);
  const [storage, setStorage] = useState('');
  const [pill, setPill] = useState(0);
  const [pillStart, setPillStart] = useState(0);
  const [sort, setSort] = useState<HistorySort>(DEFAULT_HISTORY_SORT);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [cursorIdx, setCursorIdx] = useState(0);
  const [zone, setZone] = useState<Zone>('table');
  const [btn, setBtn] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  const reload = async (): Promise<void> => {
    try {
      const lib = await runs();
      setAll(await lib.listSessions(nowUs()));
      setStorage(storageText(await lib.estimate()));
    } catch (e) {
      setAll((cur) => cur ?? []);
      nav.flash(`Could not read the runs: ${errText(e)}`, 'fail');
    }
  };
  useEffect(() => {
    if (isTop) void reload();
  }, [isTop]);

  // Pills: All + one per character with sessions.
  const names = pillNames(all ?? []);
  const pills = ['All', ...names];
  const pillIdx = Math.min(pill, pills.length - 1);
  const filter = pillIdx === 0 ? null : pills[pillIdx]!;
  const widths = pills.map(pillWidth);
  const win = pillWindow(widths, cols, pillStart);

  const list = sortSessions(
    (all ?? []).filter((s) => filter === null || s.character === filter),
    sort,
  );
  // The cursor follows its session when the list changes (sort, save,
  // reload); after a delete it stays at the same index.
  let cursor = cursorId === null ? -1 : list.findIndex((s) => s.id === cursorId);
  if (cursor < 0) cursor = Math.max(0, Math.min(cursorIdx, list.length - 1));
  const cur = list[cursor];

  const disabled = (b: ButtonId): boolean => {
    switch (b) {
      case 'RUN LOG':
        return !cur?.hasLog;
      case 'STATS':
      case 'RATE':
      case 'DELETE':
        return !cur;
      case 'SAVE':
        return !cur || cur.saved;
      case 'EXPORT':
        return !cur?.hasLog;
      case 'BACKUP':
        return (all ?? []).length === 0;
      case 'RESTORE':
      case 'BACK':
        return false;
    }
  };
  const btnEnabled = (i: number): boolean => !disabled(BUTTONS[i]!);
  const btnIdx = btnEnabled(btn) ? btn : step(BUTTONS.length, btn, 1, { enabled: btnEnabled, wrap: true });
  const firstBtn = step(BUTTONS.length, -1, 1, { enabled: btnEnabled });

  // Layout: pills, blank, the package, flash, storage (the body).
  // The table fits the data, at least as tall as the button column.
  const visible = Math.max(3, Math.min(Math.max(BUTTONS.length - 1, (all ?? []).length), bodyRows - 5));
  const charW = Math.min(12, Math.max(6, ...list.map((s) => s.character.length)));

  const moveTo = (i: number): void => {
    const n = Math.max(0, Math.min(list.length - 1, i));
    setCursorIdx(n);
    setCursorId(list[n]?.id ?? null);
  };
  const choosePill = (i: number): void => {
    const n = Math.max(0, Math.min(pills.length - 1, i));
    setPill(n);
    setPillStart((s) => scrollPills(widths, cols, s, n));
    setCursorId(null);
    setCursorIdx(0);
  };

  const openLog = (s: Session | undefined): void => {
    if (!s?.hasLog) return;
    if (openPlayer) openPlayer(s);
    else nav.flash(NO_PLAYER, 'fail');
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

  const press = (b: ButtonId): void => {
    if (disabled(b)) return;
    switch (b) {
      case 'RUN LOG':
        return openLog(cur);
      case 'STATS':
        return cur && nav.push(<SessionStatsFrame session={cur} />);
      case 'RATE':
        return cur && nav.push(<RateFrame session={cur} done={reload} />);
      case 'SAVE':
        void save();
        return;
      case 'EXPORT':
        return cur && nav.push(<ExportEditorFrame session={cur} />);
      case 'DELETE':
        return cur && nav.push(<DeleteFrame session={cur} done={reload} />);
      case 'BACKUP':
        void backup();
        return;
      case 'RESTORE':
        fileRef.current?.click();
        return;
      case 'BACK':
        return nav.pop();
    }
  };

  const zones: Zone[] = ['filter', 'table', 'buttons'];
  const toTable = (): void => {
    setZone('table');
    moveTo(0);
  };

  useKeys((_e, nk) => {
    if (nk === 'tab' || nk === 'backtab') {
      setZone(zones[(zones.indexOf(zone) + (nk === 'tab' ? 1 : 2)) % 3]!);
      return true;
    }
    if (zone === 'filter') {
      switch (nk) {
        case 'left':
        case 'right':
          choosePill(pillIdx + (nk === 'left' ? -1 : 1));
          return true;
        case 'down':
        case 'activate':
          toTable();
          return true;
        case 'up':
          return true;
      }
      return false;
    }
    if (zone === 'buttons') {
      switch (nk) {
        case 'up':
          if (btnIdx === firstBtn) setZone('filter');
          else setBtn(step(BUTTONS.length, btnIdx, -1, { enabled: btnEnabled }));
          return true;
        case 'down':
          setBtn(step(BUTTONS.length, btnIdx, 1, { enabled: btnEnabled, wrap: true }));
          return true;
        case 'right':
          setZone('table');
          return true;
        case 'left':
          return true;
        case 'activate':
          press(BUTTONS[btnIdx]!);
          return true;
      }
      return false;
    }
    switch (nk) {
      case 'up':
        if (cursor <= 0) setZone('filter');
        else moveTo(cursor - 1);
        return true;
      case 'down':
        moveTo(cursor + 1);
        return true;
      case 'pgup':
        moveTo(cursor - 10);
        return true;
      case 'pgdn':
        moveTo(cursor + 10);
        return true;
      case 'home':
        moveTo(0);
        return true;
      case 'end':
        moveTo(list.length - 1);
        return true;
      case 'left':
        setZone('buttons');
        return true;
      case 'right':
        return true;
      case 'activate':
        openLog(cur);
        return true;
    }
    return false;
  });

  const columns: Column<Session>[] = [
    { key: 'char', title: 'Char', width: charW, sortable: true, cell: (s) => ({ text: s.character }) },
    { key: 'date', title: 'Date', width: 10, sortable: true, cell: (s) => ({ text: fmtDate(s.startUs) }) },
    { key: 'time', title: 'Time', width: 6, sortable: true, cell: (s) => ({ text: fmtTime(s.startUs) }) },
    { key: 'dur', title: 'Dur.', width: 6, sortable: true, cell: (s) => ({ text: fmtDur(s.endUs - s.startUs) }) },
    { key: 'expires', title: 'Expires', width: 9, sortable: true, cell: expiresCell },
    { key: 'rating', title: 'Rating', width: 8, sortable: true, cell: ratingCell },
  ];
  const tableW = columns.reduce((n, c) => n + c.width, 0) + columns.length - 1 + (list.length > visible ? 1 : 0);
  const at = centreLeft(cols, BUTTON_W + GAP + tableW);
  const empty = all !== null && all.length === 0;

  // The pill row: centred when it fits, else the window between ‹ › slots.
  const pillRow = (
    <div
      class="wc-line wc-pills"
      style={indent(
        win.overflow ? 0 : centreLeft(cols, widths.reduce((n, w) => n + w, 0) + (pills.length - 1) * PILL_GAP),
      )}
    >
      {win.overflow && (
        <span
          class="wc-pill-arrow"
          data-arrow="left"
          onClick={() => setPillStart((s) => panPills(widths, cols, s, -1))}
        >
          {win.left ? '‹ ' : '  '}
        </span>
      )}
      {pills.slice(win.start, win.end).map((name, k) => {
        const i = win.start + k;
        return (
          <>
            {k > 0 && ' '.repeat(PILL_GAP)}
            <Button
              label={name}
              width={widths[i]!}
              selected={i === pillIdx}
              focused={zone === 'filter'}
              onClick={() => {
                setZone('filter');
                choosePill(i);
              }}
            />
          </>
        );
      })}
      {win.overflow && (
        <>
          {' '.repeat(
            Math.max(
              0,
              cols -
                2 * PILL_SLOT -
                widths.slice(win.start, win.end).reduce((n, w) => n + w, 0) -
                (win.end - win.start - 1) * PILL_GAP,
            ),
          )}
          <span
            class="wc-pill-arrow"
            data-arrow="right"
            onClick={() => setPillStart((s) => panPills(widths, cols, s, 1))}
          >
            {win.right ? ' ›' : '  '}
          </span>
        </>
      )}
    </div>
  );

  return (
    <Page title="History" footer={['↑↓ Navigate', 'Tab/←→ Cycle', 'Enter Open', 'ESC Back']}>
      {pillRow}
      <Blank />
      <div class="wc-pkg" style={{ ...indent(at), display: 'flex' }}>
        <div class="wc-btncol">
          {BUTTONS.map((b, i) => (
            <div class="wc-line">
              <Button
                label={b}
                width={BUTTON_W}
                selected={i === btnIdx}
                focused={zone === 'buttons'}
                disabled={disabled(b)}
                onClick={() => {
                  setBtn(i);
                  setZone('buttons');
                  press(b);
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ width: `calc(var(--cell-w) * ${GAP})` }} />
        <div class="wc-history-table">
          <Table
            key={pill}
            columns={columns}
            rows={list}
            cursor={cursor}
            visible={visible}
            focused={zone === 'table'}
            sort={sort}
            onSort={(k) => {
              setSort((s) => nextHistorySort(s, k as HistorySortKey));
              setZone('table');
            }}
            onRowClick={(i) => {
              moveTo(i);
              setZone('table');
              openLog(list[i]);
            }}
          />
          {empty && (
            <div class="wc-history-empty" style={{ marginTop: `calc(var(--cell-h) * ${-visible})` }}>
              <Line at={centreLeft(tableW, EMPTY.length)}>
                <span class="wc-c-hint">{EMPTY}</span>
              </Line>
            </div>
          )}
        </div>
      </div>
      <FlashRow />
      {storage && (
        <>
          <Blank n={Math.max(0, bodyRows - 4 - Math.max(BUTTONS.length, visible + 1))} />
          <Centered text={storage} class="wc-c-hint wc-history-storage" />
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".gz,.jsonl.gz,application/gzip"
        hidden
        class="wc-history-file"
        onChange={() => void onFile()}
      />
    </Page>
  );
}

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
