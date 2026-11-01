// Export editor (Inv §7.7, ADR 0019, ADR 0115): History → EXPORT.
//
//                              ─── Export Editor ───
//  ► You are standing in a field.                      █░  Rasta (L73)
//  ┃▌[greyed excluded line]                            ■█  2026-09-25 · 70098 lines
//  ┃▌[greyed excluded line]                             │  3 excluded · 1 comment
//    ## This log happened in DT yesterday. …           K│
//    Rasta flees head over heels.                       │  SELECTION · 2 lines
//    …                                                  │   INCLUDE
//    ── end of log ──                                   │   ADD COMMENT
//                                                       │
//                                                       │  TITLE
//                                                       │  mume-Rasta-2026-09-25T21-00
//                                                       │   EDIT TITLE
//                                                       │
//                                                       │  EXPORT
//                                                       │   HTML REPLAY   ◄ last
//                                                       │  player, map and comments
//                                                       │   TEXT FILE
//                                                       │  plain text (.txt)
//                                                       │
//                                                       │   BACK
//                                                       │
//                                                       │  ┃ selected
//                                                       │  ▌ excluded
//                                                       │  ## comment
//                         flash row (Exported …, Export failed: …)
//
// The package is `[margin 2][log][gap 1][map 2][gap 2][panel 30]`, the grid
// less one cell each side (export-model `exportLayout`); on a grid too
// narrow for a 40-cell log beside the panel, the panel's summary and
// buttons sit above the log as rows.
//
// Selection (ADR 0115 §2): an anchor item and the cursor item; the range is
// every entry between them (comments are skipped). Mouse: a press on a log
// row (margin or text) and a drag selects, the log scrolling while the
// pointer is above or below it; a press without movement moves the cursor
// and clears the selection; Shift+click extends. Keys: Shift with ↑↓ PgUp
// PgDn Home End extends, plain moves clear. Touch: a tap in the margin
// selects that line, a second margin tap extends; a tap on the text moves
// the cursor and clears; the log scrolls natively. With no selection the
// actions work on the cursor's entry.
//
// Two focus zones, the log and the panel (Tab / Shift+Tab). In the log ↑↓
// move the cursor one item (an entry, a comment, the end row), PgUp/PgDn
// one viewport, Home/End; the cursor pulls the view along. The wheel and
// the touchpad scroll the log natively, by pixels (as EDITOR). In the panel
// ↑↓ move over its enabled buttons, Enter presses. Keys in both zones: X
// exclude / include, C add comment, E (or Enter in the log) edit and D (or
// Delete) delete the cursor comment, T title, H export the HTML replay, P
// the text file. ESC clears the selection first, then returns to History,
// whose state is intact (it stays mounted below).
//
// Every edit is saved at once (`RunLibrary.saveExportDoc`). Only the rows
// near the view are rendered (over a spacer of the full height); the model
// (export-model.ts) keeps a 5 h chain in flat arrays.

import './export.css';
import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { touchInteraction } from '../../core/device';
import type { ChainRun } from '../../player/timeline';
import type { RunEvent } from '../../runs/events';
import type { Session } from '../../runs/stitch';
import {
  type ExportDoc,
  type ExportFormat,
  addComment,
  defaultTitle,
  deleteComment,
  editComment,
  excludeRange,
  excludedBetween,
  excludedCount,
  exportFileName,
  exportTitle,
  includeRange,
  isExcluded,
  setFormat,
  setTitle,
} from '../../share/edits';
import { buildReplayPayload } from '../../share/payload';
import { buildTextExport } from '../../share/text';
import { buildReplayHtml } from '../../replay/export';
import { bundledMapSource } from '../../map/store';
import { downloadBlob } from '../kit/download';
import { useGrid, useServices } from '../kit/hooks';
import { cellLen, centreLeft, packRows, step, truncate } from '../kit/nav';
import { useKeys, useNav } from '../kit/stack';
import { Button, FlashRow, Line, Page, cellsWide, indent, useBodyRows } from '../kit/widgets';
import { barPress, cellHeight, useScrollBox } from '../kit/scroll';
import {
  type CursorKey,
  type EditorLog,
  ITEM_COMMENT,
  ITEM_END,
  ITEM_ENTRY,
  KIND_SYS,
  MAP_GAP,
  MAP_W,
  MARGIN,
  PANEL_GAP,
  buildEditorLog,
  buildItems,
  centredTop,
  changedComment,
  commentSlot,
  entryPlainRows,
  entryRangeUs,
  entrySegments,
  exportLayout,
  itemAtRow,
  itemKey,
  keyAfterDelete,
  keyItem,
  mapItem,
  mapMarks,
  mapThumb,
  pageItem,
  selectedEntries,
  selectionTitle,
  summaryLines,
  summaryText,
} from './export-model';
import { ExportInputFrame } from './export-input';
import { fmtDate } from './history-model';

type ButtonId = 'exclude' | 'comment' | 'edit' | 'delete' | 'title' | 'html' | 'text' | 'back';
const BUTTON_IDS: readonly ButtonId[] = ['exclude', 'comment', 'edit', 'delete', 'title', 'html', 'text', 'back'];
const LABELS: Record<ButtonId, string> = {
  exclude: 'EXCLUDE',
  comment: 'ADD COMMENT',
  edit: 'EDIT COMMENT',
  delete: 'DELETE COMMENT',
  title: 'EDIT TITLE',
  html: 'HTML REPLAY',
  text: 'TEXT FILE',
  back: 'BACK',
};
/** The panel's buttons are all as wide as the widest label. */
const BTN_W = Math.max(...Object.values(LABELS).map(cellLen)) + 2;
const LETTERS: Record<string, ButtonId> = { x: 'exclude', c: 'comment', e: 'edit', d: 'delete', t: 'title', h: 'html', p: 'text' };
const END_TEXT = '── end of log ──';
/** Auto-scroll while a drag is above or below the log: every this many ms … */
const DRAG_EVERY = 50;
/** … by one row per row of distance, at most this many. */
const DRAG_MAX_ROWS = 8;

type Zone = 'log' | 'panel';

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

interface Loaded {
  chain: ChainRun[];
  events: RunEvent[];
  log: EditorLog;
}

/** One panel row, dropped from the bottom-ranked first when the panel is taller than the log. */
interface PanelRow {
  node: VNode;
  /** 0 = always; 1 = spacing; 2 = hints; 3 = the legend (dropped first). */
  drop: number;
}

export function ExportEditorFrame(p: { session: Session }): VNode {
  const { runs, settings, maps } = useServices();
  const nav = useNav();
  const { cols } = useGrid();
  const footer = ['↑↓ Move', 'Shift Select', 'X Exclude', 'C Comment', 'T Title', 'H/P Export', 'ESC Back'];
  const bodyRows = useBodyRows(footer);
  const s = p.session;
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [doc, setDocState] = useState<ExportDoc | null>(null);
  const docRef = useRef<ExportDoc | null>(null);
  const [zone, setZone] = useState<Zone>('log');
  const [btn, setBtn] = useState(0);
  const [cursor, setCursor] = useState<CursorKey>({ entry: 0 });
  /** The selection's other end; null = no selection (ADR 0115 §2). */
  const [anchor, setAnchor] = useState<CursorKey | null>(null);
  /** The top row of the log view (from its native scroll position). */
  const [top, setTop] = useState(0);
  const box = useScrollBox();
  /** Reads the top row from the scroll position (a jump renders its rows at once, not a frame later). */
  const syncTop = (): void => {
    const el = box.ref.current;
    if (el) setTop(Math.floor(el.scrollTop / cellHeight(el) + 0.01));
  };
  const busy = useRef(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const lib = await runs();
        const ids = s.runs.map((r) => r.runId);
        const [chain, events, d] = await Promise.all([lib.chainLog(ids), lib.events(ids), lib.exportDoc(s.id)]);
        if (!live) return;
        docRef.current = d;
        setDocState(d);
        setData({ chain, events, log: buildEditorLog(chain) });
      } catch (e) {
        if (live) setFailed(errText(e));
      }
    })();
    return () => {
      live = false;
    };
  }, [s.id]);

  // ------------------------------------------------------------- layout

  const L = exportLayout(cols);
  const logW = L.logW;
  const beside = L.panelW > 0;
  /** Narrow grids: the panel's buttons as rows above the log. */
  const btnRows = beside ? [] : packRows(BUTTON_IDS.map((id) => cellLen(LABELS[id]) + 2 + (id === 'html' || id === 'text' ? 1 : 0)), cols - 2, 1);
  // Above the log on a narrow grid: the summary, the button rows, a blank.
  const above = beside ? 0 : 1 + btnRows.length + 1;
  // The package (H rows) and the flash row.
  const height = Math.max(3, bodyRows - 1 - above);

  const log = data?.log ?? null;
  const items = useMemo(
    () => (log && doc ? buildItems(log, doc.comments, logW) : null),
    [log, doc?.comments, logW],
  );
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const cur = items ? keyItem(items, cursor) : 0;
  const anchorItem = items && anchor ? keyItem(items, anchor) : -1;
  // The cursor item pulls the view along when it moves (and after an edit).
  useLayoutEffect(() => {
    if (!items) return;
    box.show(items.rowStart[cur]!, items.rowStart[cur + 1]! - 1);
    syncTop();
  }, [cur, items]);

  const excluded = useMemo(() => (log && doc ? excludedCount(doc, log.ts) : 0), [log, doc?.excludes]);
  const marks = useMemo(
    () => (items && log && doc && data ? mapMarks(items, log, doc, data.events, height) : []),
    [items, log, doc?.excludes, data?.events, height],
  );

  // ---------------------------------------------------------- selection

  const curKind = items ? items.kind[cur] : ITEM_END;
  const curEntry = items && curKind === ITEM_ENTRY ? items.ref[cur]! : -1;
  const curComment = items && curKind === ITEM_COMMENT ? items.ref[cur]! : -1;
  const selLo = anchorItem >= 0 ? Math.min(anchorItem, cur) : -1;
  const selHi = anchorItem >= 0 ? Math.max(anchorItem, cur) : -1;
  /** The entries the actions work on: the selection's, or the cursor entry. */
  const target: [number, number] | null = items
    ? anchorItem >= 0
      ? selectedEntries(items, anchorItem, cur)
      : curEntry >= 0
        ? [curEntry, curEntry]
        : null
    : null;
  const targetCount = target ? target[1] - target[0] + 1 : 0;
  const allExcluded = !!(target && log && doc && excludedBetween(doc, log.ts, target[0], target[1]) === targetCount);

  // ------------------------------------------------------------ editing

  const save = (next: ExportDoc): void => {
    if (next === docRef.current) return;
    docRef.current = next;
    setDocState(next);
    void runs()
      .then((lib) => lib.saveExportDoc(next))
      .catch((e: unknown) => nav.flash(`Could not save the edit: ${errText(e)}`, 'fail'));
  };

  /** EXCLUDE when any entry of the target is shown, INCLUDE when all are excluded (ADR 0115 §3). */
  const toggleExclude = (): void => {
    const d = docRef.current;
    if (!d || !log || !target) return;
    const [from, to] = entryRangeUs(log, target[0], target[1]);
    save(allExcluded ? includeRange(d, from, to, log.ts) : excludeRange(d, from, to));
  };

  const openComment = (edit: boolean): void => {
    const d = docRef.current;
    if (!d || !log || !items) return;
    if (edit) {
      if (curComment < 0) return;
      const index = curComment;
      nav.push(
        <ExportInputFrame
          mode="comment"
          title="Edit comment"
          initial={d.comments[index]!.text}
          onSave={(text) => {
            const before = docRef.current!;
            const next = editComment(before, index, text);
            if (next.comments.length < before.comments.length) {
              setAnchor(null);
              setCursor(keyAfterDelete(items, index));
            }
            save(next);
          }}
        />,
      );
      return;
    }
    // Above the selection, or at the cursor.
    const at = selLo >= 0 ? selLo : cur;
    const { beforeUs, slot } = commentSlot(d, log, items, at, selLo >= 0);
    nav.push(
      <ExportInputFrame
        mode="comment"
        title="Add comment"
        initial=""
        onSave={(text) => {
          const before = docRef.current!;
          const next = addComment(before, beforeUs, text, slot);
          if (next === before) return;
          setAnchor(null);
          setCursor({ comment: changedComment(before.comments, next.comments) });
          save(next);
        }}
      />,
    );
  };

  const removeComment = (): void => {
    const d = docRef.current;
    if (!d || !items || curComment < 0) return;
    setAnchor(null);
    setCursor(keyAfterDelete(items, curComment));
    save(deleteComment(d, curComment));
  };

  const openTitle = (): void => {
    const d = docRef.current;
    if (!d) return;
    const def = defaultTitle(s.character, s.startUs);
    nav.push(
      <ExportInputFrame
        mode="title"
        title="Export title"
        initial={exportTitle(d, s.character, s.startUs)}
        ext={d.format === 'html' ? 'html' : 'txt'}
        onSave={(text) => {
          const v = text.replace(/\s+/g, ' ').trim();
          save(setTitle(docRef.current!, v === def ? '' : v));
        }}
      />,
    );
  };

  /** Builds and downloads one format; the format becomes the doc's "last used" (ADR 0115 §4). */
  const doExport = async (format: ExportFormat): Promise<void> => {
    const d = docRef.current;
    if (!d || !data || busy.current) return;
    busy.current = true;
    const name = exportFileName({ ...d, format }, s.character, s.startUs);
    try {
      let blob: Blob;
      if (format === 'text') {
        blob = new Blob([buildTextExport(data.chain, d)], { type: 'text/plain;charset=utf-8' });
      } else {
        nav.flash('Building the replay…');
        blob = await buildReplayHtml(buildReplayPayload(data.chain, data.events, d, settings.get()), {
          map: maps ? await maps.source() : bundledMapSource(),
          // No tileset: a replay always draws MMapper's default tiles (ADR 0020
          // addendum 2026-10-10), much smaller than the community sets.
        });
      }
      downloadBlob(blob, name);
      save(setFormat(docRef.current ?? d, format));
      nav.flash(`Exported ${name}`);
    } catch (e) {
      nav.flash(`Export failed: ${errText(e)}`, 'fail');
    } finally {
      busy.current = false;
    }
  };

  // ------------------------------------------------------------ buttons

  const label = (id: ButtonId): string => (id === 'exclude' && allExcluded ? 'INCLUDE' : LABELS[id]);
  const disabled = (id: ButtonId): boolean => {
    if (id === 'back') return false;
    if (!items) return true;
    switch (id) {
      case 'exclude':
        return target === null;
      case 'edit':
      case 'delete':
        return curComment < 0;
      default:
        return false;
    }
  };
  const enabled = (i: number): boolean => !disabled(BUTTON_IDS[i]!);
  const btnIdx = enabled(btn) ? btn : step(BUTTON_IDS.length, btn, 1, { enabled, wrap: true });

  const press = (id: ButtonId): void => {
    if (disabled(id)) return;
    switch (id) {
      case 'exclude':
        return toggleExclude();
      case 'comment':
        return openComment(false);
      case 'edit':
        return openComment(true);
      case 'delete':
        return removeComment();
      case 'title':
        return openTitle();
      case 'html':
      case 'text':
        void doExport(id);
        return;
      case 'back':
        return nav.pop();
    }
  };

  // --------------------------------------------------------------- keys

  /** Moves the cursor to item `i`; `extend` keeps (or starts) the selection, else it is cleared. */
  const moveTo = (i: number, extend = false): void => {
    if (!items) return;
    if (extend) {
      if (!anchor) setAnchor(itemKey(items, cur));
    } else setAnchor(null);
    setCursor(itemKey(items, Math.max(0, Math.min(items.count - 1, i))));
  };

  useKeys((e, nk) => {
    if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
      const id = LETTERS[e.key.toLowerCase()];
      if (id) {
        press(id);
        return true;
      }
    }
    if (e.key === 'Delete' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      press('delete');
      return true;
    }
    if (nk === 'back' && anchor) {
      setAnchor(null);
      return true;
    }
    if (nk === 'tab' || nk === 'backtab') {
      setZone((z) => (z === 'log' ? 'panel' : 'log'));
      return true;
    }
    if (zone === 'panel') {
      switch (nk) {
        case 'up':
        case 'down':
          setBtn(step(BUTTON_IDS.length, btnIdx, nk === 'up' ? -1 : 1, { enabled, wrap: true }));
          return true;
        case 'home':
          setBtn(step(BUTTON_IDS.length, -1, 1, { enabled }));
          return true;
        case 'end':
          setBtn(step(BUTTON_IDS.length, BUTTON_IDS.length, -1, { enabled }));
          return true;
        case 'activate':
          press(BUTTON_IDS[btnIdx]!);
          return true;
        case 'pgup':
        case 'pgdn':
        case 'left':
        case 'right':
          return true;
      }
      return false;
    }
    if (!items) return nk !== null && nk !== 'back';
    const ext = e.shiftKey;
    switch (nk) {
      case 'up':
        moveTo(cur - 1, ext);
        return true;
      case 'down':
        moveTo(cur + 1, ext);
        return true;
      case 'pgup':
        moveTo(pageItem(items, cur, height, -1), ext);
        return true;
      case 'pgdn':
        moveTo(pageItem(items, cur, height, 1), ext);
        return true;
      case 'home':
        moveTo(0, ext);
        return true;
      case 'end':
        moveTo(items.count - 1, ext);
        return true;
      case 'activate':
        if (e.key === 'Enter') press('edit');
        return true;
      case 'left':
      case 'right':
        return true;
    }
    return false;
  });

  // -------------------------------------------------------------- mouse

  /**
   * A mouse press on log item `i` (ADR 0115 §2): moves the cursor and clears
   * the selection (Shift: extends it), then a drag selects from the pressed
   * item to the one under the pointer, scrolling the log while the pointer
   * is above or below it. The pointer is captured on the scroll box, which
   * stays mounted while the rendered rows change.
   */
  const pressRow = (ev: PointerEvent, i: number): void => {
    const el = box.ref.current;
    if (!el || !items || ev.button !== 0 || ev.pointerType === 'touch') return;
    setZone('log');
    let from = i;
    let moved = false;
    if (ev.shiftKey) {
      from = anchorItem >= 0 ? anchorItem : cur;
      moved = true;
      setAnchor(itemKey(items, from));
    } else setAnchor(null);
    setCursor(itemKey(items, i));

    const win = el.ownerDocument.defaultView ?? window;
    let y = ev.clientY;
    let timer = 0;
    /** The item under the pointer, clamped to the rows in view. */
    const itemAtPointer = (): number => {
      const it = itemsRef.current!;
      const r = el.getBoundingClientRect();
      const yy = Math.max(r.top, Math.min(r.bottom - 1, y));
      return itemAtRow(it, Math.floor((yy - r.top + el.scrollTop) / cellHeight(el)));
    };
    let last = i;
    const follow = (): void => {
      const it = itemsRef.current;
      if (!it) return;
      const j = itemAtPointer();
      if ((!moved && j === from) || (moved && j === last)) return;
      moved = true;
      last = j;
      setAnchor(itemKey(it, from));
      setCursor(itemKey(it, j));
    };
    /** Rows past the log's top (< 0) or bottom (> 0) edge the pointer is. */
    const outside = (): number => {
      const r = el.getBoundingClientRect();
      const ch = cellHeight(el);
      if (y < r.top) return -Math.min(DRAG_MAX_ROWS, Math.ceil((r.top - y) / ch));
      if (y >= r.bottom) return Math.min(DRAG_MAX_ROWS, Math.ceil((y - r.bottom + 1) / ch));
      return 0;
    };
    const tick = (): void => {
      timer = 0;
      const n = outside();
      if (!n) return;
      el.scrollTop += n * cellHeight(el);
      syncTop();
      follow();
      timer = win.setTimeout(tick, DRAG_EVERY);
    };
    try {
      el.setPointerCapture(ev.pointerId);
    } catch {
      // A synthetic pointer: the window listeners below still see it.
    }
    const onMove = (e: PointerEvent): void => {
      if (e.pointerId !== ev.pointerId) return;
      y = e.clientY;
      follow();
      if (!timer && outside()) timer = win.setTimeout(tick, DRAG_EVERY);
    };
    const onEnd = (e: Event): void => {
      if ((e as PointerEvent).pointerId !== ev.pointerId) return;
      if (timer) win.clearTimeout(timer);
      timer = 0;
      win.removeEventListener('pointermove', onMove, true);
      win.removeEventListener('pointerup', onEnd, true);
      win.removeEventListener('pointercancel', onEnd, true);
      el.removeEventListener('lostpointercapture', onEnd);
    };
    win.addEventListener('pointermove', onMove, true);
    win.addEventListener('pointerup', onEnd, true);
    win.addEventListener('pointercancel', onEnd, true);
    el.addEventListener('lostpointercapture', onEnd);
  };

  /**
   * A tap on log item `i` (ADR 0115 §6; the mouse is handled at the press):
   * in the margin it selects the line, a second margin tap extends to the
   * tapped line; on the text it moves the cursor and clears the selection.
   */
  const tapRow = (ev: MouseEvent, i: number): void => {
    const el = box.ref.current;
    if (!el || !items || !touchInteraction()) return;
    setZone('log');
    const cellW = el.getBoundingClientRect().width / (MARGIN + logW) || 1;
    const inMargin = ev.clientX - el.getBoundingClientRect().left < MARGIN * cellW;
    if (inMargin) setAnchor(anchor ?? itemKey(items, i));
    else setAnchor(null);
    setCursor(itemKey(items, i));
  };

  // ------------------------------------------------------------- render

  if (!data || !doc || !items || !log) {
    return (
      <Page title="Export Editor" footer={['ESC Back']}>
        <Line at={centreLeft(cols, 20)}>
          <span class="wc-c-hint">{failed ? truncate(`Could not read the log: ${failed}`, cols) : 'Reading the log…'}</span>
        </Line>
        <FlashRow />
      </Page>
    );
  }

  const summary = {
    character: s.character,
    level: s.level,
    date: fmtDate(s.startUs),
    lines: log.ts.length,
    excluded,
    comments: doc.comments.length,
  };

  // The log scrolls natively (pixels, as EDITOR) over a spacer of all its
  // rows; only the rows near the view are rendered (a 5 h chain is long):
  // a viewport above and below it, so a fast scroll does not show blanks.
  const totalRows = Math.max(items.totalRows, height);
  const from = Math.max(0, Math.min(top, totalRows - height) - height);
  const to = Math.min(totalRows, top + 2 * height + 1);
  const rowsOut: VNode[] = [];
  const logFocused = zone === 'log';
  for (let i = itemAtRow(items, from), row = items.rowStart[i]!; row < to && i < items.count; i++) {
    const kind = items.kind[i]!;
    const isCur = i === cur;
    const start = items.rowStart[i]!;
    const n = items.rowStart[i + 1]! - start;
    let excl = false;
    let sys = false;
    let lines: VNode[] = [];
    if (kind === ITEM_ENTRY) {
      const e = items.ref[i]!;
      excl = isExcluded(doc, log.ts[e]!);
      sys = log.kind[e] === KIND_SYS;
      lines = excl
        ? entryPlainRows(log, e, logW).map((txt) => <span class="wc-exp-excl">{txt}</span>)
        : entrySegments(log, e, logW).map((segs) => (
            <>
              {segs.map((sg) =>
                sg.cls || sg.color || sg.bg ? (
                  <span
                    class={sg.cls || undefined}
                    style={sg.color || sg.bg ? { color: sg.color, background: sg.bg } : undefined}
                  >
                    {sg.text}
                  </span>
                ) : (
                  sg.text
                ),
              )}
            </>
          ));
    } else if (kind === ITEM_COMMENT) {
      lines = items.commentRows[items.ref[i]!]!.map((txt) => <span class="wc-exp-comment">{txt}</span>);
    } else {
      lines = [<span class="wc-c-hint">{END_TEXT}</span>];
    }
    const sel = kind === ITEM_ENTRY && i >= selLo && i <= selHi;
    for (let k = 0; k < n; k++, row++) {
      if (row < from) continue;
      if (row >= to) break;
      const mark = isCur && k === 0 ? '►' : sel ? '┃' : ' ';
      rowsOut.push(
        <div
          class={'wc-line wc-exp-row' + (isCur ? ' is-cur' : '') + (sel ? ' is-sel' : '')}
          data-item={i}
          data-kind={kind === ITEM_ENTRY ? (excl ? 'excluded' : sys ? 'system' : 'entry') : kind === ITEM_COMMENT ? 'comment' : 'end'}
          onMouseDown={(ev) => ev.preventDefault()}
          onPointerDown={(ev) => pressRow(ev, i)}
          onClick={(ev) => tapRow(ev, i)}
        >
          <span class={'wc-exp-mark' + (mark === '┃' ? ' is-sel' : logFocused ? ' is-focus' : '')}>{mark}</span>
          <span class="wc-exp-bar">{excl ? '▌' : ' '}</span>
          {lines[k]}
        </div>,
      );
    }
  }
  while (rowsOut.length < to - from) rowsOut.push(<div class="wc-line wc-exp-row is-empty" />);

  const [thumbA, thumbB] = mapThumb(items, Math.min(top, Math.max(0, items.totalRows - height)), height, height);
  // The map's thumb drags the log like a scrollbar's (ADR 0106); a click still jumps.
  const thumbBar = items.totalRows > height ? marks.map((_, r) => r >= thumbA && r <= thumbB) : [];
  const mapRows = marks.map((m, r) => {
    const content =
      m === null ? (
        <span class="wc-exp-map-track">│</span>
      ) : m === 'excluded' ? (
        <span class="wc-exp-map-excl">█</span>
      ) : m === 'comment' ? (
        <span class="wc-exp-comment">■</span>
      ) : (
        <span class="wc-c-accent">{m}</span>
      );
    const thumb = r >= thumbA && r <= thumbB;
    return (
      <div
        class="wc-line wc-exp-map-row"
        data-map-row={r}
        onMouseDown={(ev) => ev.preventDefault()}
        onClick={() => {
          const it = mapItem(items, r, height);
          setZone('log');
          setAnchor(null);
          setCursor(itemKey(items, it));
          box.toRow(centredTop(items, it, height));
          syncTop();
        }}
      >
        {content}
        <span
          class={thumb ? 'wc-exp-map-thumb' : 'wc-exp-map-track'}
          // Only the thumb drags (an empty bar ignores the press): the track's click jumps.
          {...barPress(() => ({ el: box.ref.current, bar: thumb ? thumbBar : [], i: r }))}
        >
          {thumb ? '█' : ' '}
        </span>
      </div>
    );
  });

  const button = (id: ButtonId, width?: number): VNode => {
    const i = BUTTON_IDS.indexOf(id);
    return (
      <Button
        label={label(id)}
        width={width ?? cellLen(label(id)) + 2}
        selected={i === btnIdx}
        focused={zone === 'panel'}
        disabled={disabled(id)}
        onClick={() => {
          setBtn(i);
          setZone('panel');
          press(id);
        }}
      />
    );
  };
  /** The mark after the export button used last (ADR 0115 §4). */
  const lastMark = (id: ButtonId, text: string): VNode | null =>
    (id === 'html' || id === 'text') && doc.format === id ? (
      <span class="wc-exp-last" title="Exported last">
        {text}
      </span>
    ) : null;

  const pkgStyle = { ...indent(L.at), display: 'flex' };
  const logBox = (
    <>
      <div
        class="wc-scrollbox wc-exp-log"
        ref={box.ref}
        style={{ ...cellsWide(MARGIN + logW), height: `calc(var(--cell-h) * ${height})` }}
        onScroll={syncTop}
      >
        <div class="wc-exp-spacer" style={{ height: `calc(var(--cell-h) * ${totalRows})` }}>
          <div class="wc-exp-window" style={{ top: `calc(var(--cell-h) * ${from})` }}>
            {rowsOut}
          </div>
        </div>
      </div>
      <div style={cellsWide(MAP_GAP)} />
      <div class="wc-exp-map" style={cellsWide(MAP_W)}>
        {mapRows}
      </div>
    </>
  );

  if (!beside) {
    // A narrow grid (ADR 0115 §6): the summary on one line, the buttons
    // wrapped to the width, then the log.
    const sel = anchorItem >= 0 ? ` · ${targetCount} selected` : '';
    return (
      <Page title="Export Editor" footer={footer}>
        <Line at={L.at} class="wc-exp-summary">
          <span class="wc-c-body">{truncate(summaryText(summary) + sel, cols - 2)}</span>
        </Line>
        {btnRows.map((r) => (
          <Line at={L.at} class="wc-exp-btnrow">
            {r.map((bi, k) => {
              const id = BUTTON_IDS[bi]!;
              return (
                <>
                  {k > 0 && ' '}
                  {button(id)}
                  {lastMark(id, '◄') ?? (id === 'html' || id === 'text' ? ' ' : null)}
                </>
              );
            })}
          </Line>
        ))}
        <div class="wc-line" />
        <div class="wc-pkg wc-exp" style={pkgStyle}>
          {logBox}
        </div>
        <FlashRow />
      </Page>
    );
  }

  // ------------------------------------------------------- the panel

  const [who, when, counts] = summaryLines(summary);
  const pw = L.panelW;
  const text = (t: string, cls: string, extra = ''): VNode => (
    <div class={'wc-line' + (extra ? ' ' + extra : '')}>
      <span class={cls}>{truncate(t, pw)}</span>
    </div>
  );
  const btnRow = (id: ButtonId, after?: VNode | null): VNode => (
    <div class="wc-line">
      {' '}
      {button(id, BTN_W)}
      {after}
    </div>
  );
  const heading = selectionTitle(
    anchorItem >= 0
      ? { selected: targetCount }
      : curKind === ITEM_ENTRY
        ? { entry: curEntry }
        : curKind === ITEM_COMMENT
          ? { comment: true }
          : { end: true },
  );
  const blank = (drop = 1): PanelRow => ({ node: <div class="wc-line" />, drop });
  const rows: PanelRow[] = [
    { node: text(who, 'wc-c-header', 'wc-exp-who'), drop: 0 },
    { node: text(when, 'wc-c-body'), drop: 0 },
    { node: text(counts, 'wc-c-body', 'wc-exp-counts'), drop: 0 },
    blank(),
    { node: text(heading, 'wc-c-section', 'wc-exp-selhead'), drop: 0 },
    { node: btnRow('exclude'), drop: 0 },
    { node: btnRow('comment'), drop: 0 },
    // EDIT / DELETE show on a comment; their rows stay so nothing below moves.
    { node: curComment >= 0 ? btnRow('edit') : <div class="wc-line" />, drop: 0 },
    { node: curComment >= 0 ? btnRow('delete') : <div class="wc-line" />, drop: 0 },
    blank(),
    { node: text('TITLE', 'wc-c-section'), drop: 0 },
    { node: text(exportTitle(doc, s.character, s.startUs), 'wc-c-body', 'wc-exp-title'), drop: 0 },
    { node: btnRow('title'), drop: 0 },
    blank(),
    { node: text('EXPORT', 'wc-c-section'), drop: 0 },
    { node: btnRow('html', lastMark('html', ' ◄ last')), drop: 0 },
    { node: text('  player, map and comments', 'wc-c-hint'), drop: 2 },
    { node: btnRow('text', lastMark('text', ' ◄ last')), drop: 0 },
    { node: text('  plain text (.txt)', 'wc-c-hint'), drop: 2 },
    blank(),
    { node: btnRow('back'), drop: 0 },
    blank(3),
    {
      node: (
        <div class="wc-line">
          <span class="wc-exp-mark is-sel">┃</span>
          <span class="wc-c-hint"> selected</span>
        </div>
      ),
      drop: 3,
    },
    {
      node: (
        <div class="wc-line">
          <span class="wc-exp-bar">▌</span>
          <span class="wc-c-hint"> excluded</span>
        </div>
      ),
      drop: 3,
    },
    { node: text('## comment', 'wc-exp-comment'), drop: 3 },
  ];
  // Drop the legend, then the hints, then the spacing until the panel fits.
  let shown = rows;
  for (let level = 3; level >= 1 && shown.length > height; level--) shown = shown.filter((r) => r.drop < level);

  return (
    <Page title="Export Editor" footer={footer}>
      <div class="wc-pkg wc-exp" style={pkgStyle}>
        {logBox}
        <div style={cellsWide(PANEL_GAP)} />
        <div class="wc-exp-panel" style={{ ...cellsWide(pw), height: `calc(var(--cell-h) * ${height})` }}>
          {shown.map((r) => r.node)}
        </div>
      </div>
      <FlashRow />
    </Page>
  );
}
