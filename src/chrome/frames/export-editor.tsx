// Export editor (Inv §7.7, ADR 0019): History → EXPORT.
//
//                        ─── Export Editor ───
//  Rasta (L73) · 2026-09-25 · 70098 lines · 3 excluded · 1 comments · → mume-Rasta-….html
//
//  EXCLUDE FROM HERE    ► ▌ [greyed excluded line]                   █░
//  ADD COMMENT            ▌ [greyed excluded line]                   ■█
//  EDIT COMMENT           ## This log happened in DT yesterday. …     K
//  DELETE COMMENT         Rasta flees head over heels.
//  FORMAT: HTML           …
//  TITLE                  ── end of log ──
//  EXPORT
//  BACK
//
//  ▌ excluded
//  ## comment
//                        flash row (Exported …, Export failed: …)
//
// Two focus zones, the log and the buttons (Tab / Shift+Tab, ← / →). In the
// log ↑↓ move the cursor one item (an entry, a comment, the end row),
// PgUp/PgDn one viewport, Home/End; the cursor pulls the view along. The
// wheel and the touchpad scroll the log natively, by pixels (as EDITOR). The letter
// keys work in both zones: X exclude / stop, C/E/D add/edit/delete comment,
// F format, T title, S export. ESC (and BACK) return to History, whose
// state is intact (it stays mounted below).
//
// Every edit is saved at once (`RunLibrary.saveExportDoc`). Only the rows
// near the view are rendered (over a spacer of the full height); the model (export-model.ts) keeps a 5 h chain in
// flat arrays.

import './export.css';
import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ChainRun } from '../../player/timeline';
import type { RunEvent } from '../../runs/events';
import type { Session } from '../../runs/stitch';
import {
  type ExportDoc,
  addComment,
  defaultTitle,
  deleteComment,
  editComment,
  excludeFrom,
  excludedCount,
  exportFileName,
  exportTitle,
  isExcluded,
  setTitle,
  stopExcluding,
  toggleFormat,
} from '../../share/edits';
import { buildReplayPayload } from '../../share/payload';
import { buildTextExport } from '../../share/text';
import { buildReplayHtml } from '../../replay/export';
import { bundledMapSource } from '../../map/store';
import { currentOverlay } from '../../map/tilesets';
import { downloadBlob } from '../kit/download';
import { useGrid, useServices } from '../kit/hooks';
import { cellLen, centreLeft, step, truncate } from '../kit/nav';
import { useKeys, useNav } from '../kit/stack';
import { Blank, Button, FlashRow, Line, Page, cellsWide, indent, useBodyRows } from '../kit/widgets';
import { cellHeight, useScrollBox } from '../kit/scroll';
import {
  type CursorKey,
  type EditorLog,
  ITEM_COMMENT,
  ITEM_END,
  ITEM_ENTRY,
  KIND_SYS,
  buildEditorLog,
  buildItems,
  centredTop,
  changedComment,
  commentSlot,
  entryPlainRows,
  entrySegments,
  infoText,
  itemAtRow,
  itemKey,
  keyAfterDelete,
  keyItem,
  mapItem,
  mapMarks,
  mapThumb,
  pageItem,
} from './export-model';
import { ExportInputFrame } from './export-input';
import { fmtDate } from './history-model';

const BUTTON_LABELS = [
  'EXCLUDE FROM HERE',
  'ADD COMMENT',
  'EDIT COMMENT',
  'DELETE COMMENT',
  'FORMAT: HTML',
  'TITLE',
  'EXPORT',
  'BACK',
] as const;
type ButtonId = 'exclude' | 'add' | 'edit' | 'delete' | 'format' | 'title' | 'export' | 'back';
const BUTTON_IDS: readonly ButtonId[] = ['exclude', 'add', 'edit', 'delete', 'format', 'title', 'export', 'back'];
const BUTTON_W = Math.max(...BUTTON_LABELS.map((b) => b.length)) + 2;
const GAP = 2;
const GUTTER = 3;
const MAP_GAP = 1;
const MAP_W = 2;
/** Cells around the log: buttons, gap, gutter, spacer, map, margins. */
const CHROME_W = 1 + BUTTON_W + GAP + GUTTER + MAP_GAP + MAP_W + 1;
const LOG_MIN = 20;
const LOG_MAX = 100;
const END_TEXT = '── end of log ──';

type Zone = 'log' | 'buttons';

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

interface Loaded {
  chain: ChainRun[];
  events: RunEvent[];
  log: EditorLog;
}

export function ExportEditorFrame(p: { session: Session }): VNode {
  const { runs, settings, maps } = useServices();
  const nav = useNav();
  const { cols } = useGrid();
  const bodyRows = useBodyRows();
  const s = p.session;
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [doc, setDocState] = useState<ExportDoc | null>(null);
  const docRef = useRef<ExportDoc | null>(null);
  const [zone, setZone] = useState<Zone>('log');
  const [btn, setBtn] = useState(0);
  const [cursor, setCursor] = useState<CursorKey>({ entry: 0 });
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

  // Layout: info row, blank, the package (H rows), flash row.
  const height = Math.max(3, bodyRows - 3);
  const logW = Math.max(LOG_MIN, Math.min(LOG_MAX, cols - CHROME_W));
  const pkgW = CHROME_W - 2 + logW;
  const at = centreLeft(cols, pkgW);

  const log = data?.log ?? null;
  const items = useMemo(
    () => (log && doc ? buildItems(log, doc.comments, logW) : null),
    [log, doc?.comments, logW],
  );
  const cur = items ? keyItem(items, cursor) : 0;
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

  // ------------------------------------------------------------ editing

  const save = (next: ExportDoc): void => {
    if (next === docRef.current) return;
    docRef.current = next;
    setDocState(next);
    void runs()
      .then((lib) => lib.saveExportDoc(next))
      .catch((e: unknown) => nav.flash(`Could not save the edit: ${errText(e)}`, 'fail'));
  };

  const curKind = items ? items.kind[cur] : ITEM_END;
  const curEntry = items && curKind === ITEM_ENTRY ? items.ref[cur]! : -1;
  const curComment = items && curKind === ITEM_COMMENT ? items.ref[cur]! : -1;
  const curExcluded = log && doc && curEntry >= 0 ? isExcluded(doc, log.ts[curEntry]!) : false;

  const toggleExclude = (): void => {
    const d = docRef.current;
    if (!d || !log || curEntry < 0) return;
    const us = log.ts[curEntry]!;
    save(isExcluded(d, us) ? stopExcluding(d, us, log.ts) : excludeFrom(d, us));
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
            if (next.comments.length < before.comments.length) setCursor(keyAfterDelete(items, index));
            save(next);
          }}
        />,
      );
      return;
    }
    const { beforeUs, slot } = commentSlot(d, log, items, cur);
    nav.push(
      <ExportInputFrame
        mode="comment"
        title="Add comment"
        initial=""
        onSave={(text) => {
          const before = docRef.current!;
          const next = addComment(before, beforeUs, text, slot);
          if (next === before) return;
          setCursor({ comment: changedComment(before.comments, next.comments) });
          save(next);
        }}
      />,
    );
  };

  const removeComment = (): void => {
    const d = docRef.current;
    if (!d || !items || curComment < 0) return;
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

  const doExport = async (): Promise<void> => {
    const d = docRef.current;
    if (!d || !data || busy.current) return;
    busy.current = true;
    const name = exportFileName(d, s.character, s.startUs);
    try {
      let blob: Blob;
      if (d.format === 'text') {
        blob = new Blob([buildTextExport(data.chain, d)], { type: 'text/plain;charset=utf-8' });
      } else {
        nav.flash('Building the replay…');
        blob = await buildReplayHtml(buildReplayPayload(data.chain, data.events, d, settings.get()), {
          map: maps ? await maps.source() : bundledMapSource(),
          tileset: currentOverlay(settings.get().mapper.tileset),
        });
      }
      downloadBlob(blob, name);
      nav.flash(`Exported ${name}`);
    } catch (e) {
      nav.flash(`Export failed: ${errText(e)}`, 'fail');
    } finally {
      busy.current = false;
    }
  };

  // ------------------------------------------------------------ buttons

  const label = (id: ButtonId): string => {
    if (id === 'exclude') return curExcluded ? 'STOP EXCLUDING' : 'EXCLUDE FROM HERE';
    if (id === 'format') return doc?.format === 'text' ? 'FORMAT: TEXT' : 'FORMAT: HTML';
    return BUTTON_LABELS[BUTTON_IDS.indexOf(id)]!;
  };
  const disabled = (id: ButtonId): boolean => {
    if (id === 'back') return false;
    if (!items) return true;
    switch (id) {
      case 'exclude':
        return curEntry < 0;
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
      case 'add':
        return openComment(false);
      case 'edit':
        return openComment(true);
      case 'delete':
        return removeComment();
      case 'format':
        if (docRef.current) save(toggleFormat(docRef.current));
        return;
      case 'title':
        return openTitle();
      case 'export':
        void doExport();
        return;
      case 'back':
        return nav.pop();
    }
  };

  // --------------------------------------------------------------- keys

  const moveTo = (i: number): void => {
    if (!items) return;
    setCursor(itemKey(items, Math.max(0, Math.min(items.count - 1, i))));
  };

  const LETTERS: Record<string, ButtonId> = {
    x: 'exclude',
    c: 'add',
    e: 'edit',
    d: 'delete',
    f: 'format',
    t: 'title',
    s: 'export',
  };

  useKeys((e, nk) => {
    if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1) {
      const id = LETTERS[e.key.toLowerCase()];
      if (id) {
        press(id);
        return true;
      }
    }
    if (nk === 'tab' || nk === 'backtab' || nk === 'left' || nk === 'right') {
      setZone((z) => (z === 'log' ? 'buttons' : 'log'));
      return true;
    }
    if (zone === 'buttons') {
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
          return true;
      }
      return false;
    }
    if (!items) return nk !== null && nk !== 'back';
    switch (nk) {
      case 'up':
        moveTo(cur - 1);
        return true;
      case 'down':
        moveTo(cur + 1);
        return true;
      case 'pgup':
        moveTo(pageItem(items, cur, height, -1));
        return true;
      case 'pgdn':
        moveTo(pageItem(items, cur, height, 1));
        return true;
      case 'home':
        moveTo(0);
        return true;
      case 'end':
        moveTo(items.count - 1);
        return true;
      case 'activate':
        return true;
    }
    return false;
  });

  // ------------------------------------------------------------- render

  const footer = [
    '↑↓ Move',
    'Tab/←→ Focus',
    'X Exclude',
    'C/E/D Comment',
    'F Format',
    'T Title',
    'S Export',
    'ESC Back',
  ];

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

  const info = truncate(
    infoText({
      character: s.character,
      level: s.level,
      date: fmtDate(s.startUs),
      lines: log.ts.length,
      excluded,
      comments: doc.comments.length,
      file: exportFileName(doc, s.character, s.startUs),
    }),
    cols,
  );

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
    const click = (): void => {
      setZone('log');
      moveTo(i);
    };
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
    for (let k = 0; k < n; k++, row++) {
      if (row < from) continue;
      if (row >= to) break;
      rowsOut.push(
        <div
          class={'wc-line wc-exp-row' + (isCur ? ' is-cur' : '')}
          data-item={i}
          data-kind={kind === ITEM_ENTRY ? (excl ? 'excluded' : sys ? 'system' : 'entry') : kind === ITEM_COMMENT ? 'comment' : 'end'}
          onMouseDown={(ev) => ev.preventDefault()}
          onClick={click}
        >
          <span class={'wc-exp-mark' + (logFocused ? ' is-focus' : '')}>{isCur && k === 0 ? '►' : ' '}</span>
          <span class="wc-exp-bar">{excl ? '▌' : ' '}</span>
          {' '}
          {lines[k]}
        </div>,
      );
    }
  }
  while (rowsOut.length < to - from) rowsOut.push(<div class="wc-line wc-exp-row is-empty" />);

  const [thumbA, thumbB] = mapThumb(items, Math.min(top, Math.max(0, items.totalRows - height)), height, height);
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
          setCursor(itemKey(items, it));
          box.toRow(centredTop(items, it, height));
          syncTop();
        }}
      >
        {content}
        <span class={thumb ? 'wc-exp-map-thumb' : 'wc-exp-map-track'}>{thumb ? '█' : ' '}</span>
      </div>
    );
  });

  const legendRoom = height - BUTTON_IDS.length - 1 >= 2;

  return (
    <Page title="Export Editor" footer={footer}>
      <Line at={centreLeft(cols, cellLen(info))} class="wc-exp-info">
        <span class="wc-c-body">{info}</span>
      </Line>
      <Blank />
      <div class="wc-pkg wc-exp" style={{ ...indent(at), display: 'flex' }}>
        <div class="wc-btncol" style={cellsWide(BUTTON_W)}>
          {BUTTON_IDS.map((id, i) => (
            <div class="wc-line">
              <Button
                label={label(id)}
                width={BUTTON_W}
                selected={i === btnIdx}
                focused={zone === 'buttons'}
                disabled={disabled(id)}
                onClick={() => {
                  setBtn(i);
                  setZone('buttons');
                  press(id);
                }}
              />
            </div>
          ))}
          {legendRoom && (
            <>
              <Blank />
              <div class="wc-line">
                <span class="wc-exp-bar">▌</span>
                <span class="wc-c-hint"> excluded</span>
              </div>
              <div class="wc-line">
                <span class="wc-exp-comment">## comment</span>
              </div>
            </>
          )}
        </div>
        <div style={cellsWide(GAP)} />
        <div
          class="wc-scrollbox wc-exp-log"
          ref={box.ref}
          style={{ ...cellsWide(GUTTER + logW), height: `calc(var(--cell-h) * ${height})` }}
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
      </div>
      <FlashRow />
    </Page>
  );
}
