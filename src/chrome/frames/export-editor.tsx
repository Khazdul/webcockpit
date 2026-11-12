// Export editor (Inv §7.7, ADR 0019, ADR 0115; the lantern look, direction
// B "Verktygsraden": ADR 0128 §43d): History → Export.
//
//   ┌──────────────────────────── Export ────────────────────────────┐
//   │ ‹ Back                                                         │
//   │ RASTA Level 72 · 2026-09-25 · 70,098 lines ·…  LINE · 1  [Exclude] [Add comment] [Edit] [Delete]
//   │ ─────────────────────────────────────────────────────────────── │
//   │ ▏[SYSTEM] Rasta logged in.                                  ▕█▏ │
//   │  The Last Bridge                                            ▕ ▏ │
//   │  ## a comment, in the log's own yellow                      ▕■▏ │
//   │  ┌ Add comment (the inline composer) ┐                      ▕ ▏ │
//   │  …                                                          ▕L▏ │
//   │ ─────────────────────────────────────────────────────────────── │
//   │ FILE mume-Rasta-2026-09-25T22-03.html [Title]  [HTML replay|Plain text] [Export]
//   │                         (the flash)                            │
//   └────────────────────────────────────────────────────────────────┘
//
// A look frame in a large box (layout B; the box swap from History). The
// bar: the character, the summary, the selection heading and the tools
// (Exclude ↔ Include, Add comment, Edit, Delete). The log in the user's
// terminal font and colours, full width (capped at 120 columns on a very
// wide window: the page caps its own width), with the overview strip at
// its right (hidden under 900 px). The foot: the file name (T edits it
// inline), the format toggle (H / P only choose; the choice is the export
// doc's stored `format`, saved at once) and Export (O), the flash under it.
//
// The log is virtual: every row is one line height, an entry wrapped hard
// at the log's column count takes as many rows (export-model `buildItems`),
// a spacer holds the full height and only the items near the view are in
// the DOM (absolutely placed at their row); the inline comment composer is
// one more item of measured height (export-model `LogGeom`). Scrolling is
// native (pixels: wheel, touchpad, touch).
//
// Selection (ADR 0115 §2): an anchor item and the cursor item; the range is
// every entry between them (comments are skipped). Mouse: a press on a row
// moves the cursor and clears the selection, a drag selects (the log
// scrolls on animation frames while the pointer is above or below it),
// Shift+click extends. Keys: Shift with ↑↓ PgUp PgDn Home End extends.
// Touch: a tap in the margin selects that line, a second margin tap
// extends; a tap on the text moves the cursor and clears.
//
// Keys: ↑↓ PgUp PgDn Home End in the log, X exclude / include (I too when
// the label says Include), C add comment, E (or Enter on a comment) edit,
// D / Delete delete the comment, T the title, H / P choose the format, O
// export; Tab / Shift+Tab walk the log and the enabled buttons (tools,
// title, the two formats, Export; the keyboard's `is-sel`), ← → walk the
// buttons, Enter presses. Esc: the composer or the title field, then the
// selection, then back to History (whose state is intact). The composer
// and the title field own their keys (`data-wc-own-keys`): Enter saves,
// Esc cancels, Ctrl+U clears; the log keys pause while one is open.
//
// Every edit is saved at once (`RunLibrary.saveExportDoc`).

import './export.css';
import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { touchInteraction } from '../../core/device';
import type { ChainRun } from '../../player/timeline';
import type { RunEvent } from '../../runs/events';
import type { Session } from '../../runs/stitch';
import {
  COMMENT_MAX,
  type ExportDoc,
  type ExportFormat,
  addComment,
  collapseComment,
  commentHoldMs,
  commentLines,
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
import { useServices } from '../kit/hooks';
import {
  Box,
  BoxBody,
  BoxFoot,
  BoxHead,
  Field,
  GlassButton,
  LookFlash,
  Seg,
  TextArea,
  letterAction,
  lookFrame,
  useButtonZone,
  useKeyboardInset,
  useOwnKeyboardUp,
  useWindowChrome,
} from '../kit/look';
import { useKeys, useNav } from '../kit/stack';
import {
  type CursorKey,
  type EditorLog,
  ITEM_COMMENT,
  ITEM_ENTRY,
  KIND_OUT,
  KIND_SYS,
  type LogGeom,
  TITLE_MAX,
  barSummary,
  buildEditorLog,
  buildItems,
  changedComment,
  commentSlot,
  composerTop,
  contentHeight,
  entryPlainRows,
  entryRangeUs,
  entrySegments,
  holdText,
  itemAtY,
  itemHeight,
  itemKey,
  itemTop,
  keyAfterDelete,
  keyItem,
  logCols,
  mapItemAt,
  mapStrip,
  mapThumb,
  pageItem,
  pasteText,
  revealTop,
  selectedEntries,
  selectionTitle,
} from './export-model';
import { fmtDate } from './history-model';

const END_TEXT = '── end of log ──';
/** The padding above the first row and below the last (px). */
const PAD = 8;
/** Drag auto-scroll: px per frame per line height of distance past the edge, at most … */
const DRAG_MAX_ROWS = 8;

/** The keyboard's ring after the log: the tools, the title, the two formats, Export. */
type ZoneId = 'exclude' | 'comment' | 'edit' | 'delete' | 'title' | 'html' | 'text' | 'export';
const ZONE_IDS: readonly ZoneId[] = ['exclude', 'comment', 'edit', 'delete', 'title', 'html', 'text', 'export'];

const FORMATS = [
  { value: 'html', label: 'HTML replay', letter: 'h', icon: 'html' as const, title: 'Player, map and comments', id: 'HTML' },
  { value: 'text', label: 'Plain text', letter: 'p', icon: 'text' as const, title: 'Plain text (.txt)', id: 'TEXT' },
];

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

interface Loaded {
  chain: ChainRun[];
  events: RunEvent[];
  log: EditorLog;
}

/** The log's measured metrics: wrap columns, line height, margins, the view's height (px). */
interface Metrics {
  cols: number;
  lh: number;
  ml: number;
  view: number;
}

/**
 * The open comment composer: a new comment (`add`) before item `place`, or
 * comment `index` edited. The text being typed is the composer's own state,
 * so a keystroke re-renders the composer, never the log.
 */
type Composer =
  | { edit: false; place: number; beforeUs: number | null; slot: number; initial: string }
  | { edit: true; index: number; initial: string };

const px = (el: Element, name: string, fallback: number): number => {
  const v = parseFloat(getComputedStyle(el).getPropertyValue(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** Gives the keyboard back to the frame stack (after a field closes). */
const toStack = (el: Element | null): void => {
  el?.closest<HTMLElement>('.wc-stack')?.focus({ preventScroll: true });
};

export const ExportEditorFrame = lookFrame(function ExportEditorFrame(p: { session: Session }): VNode {
  const { runs, settings, maps } = useServices();
  const nav = useNav();
  useWindowChrome({ title: 'Export' });
  const s = p.session;
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [doc, setDocState] = useState<ExportDoc | null>(null);
  const docRef = useRef<ExportDoc | null>(null);
  const [cursor, setCursor] = useState<CursorKey>({ entry: 0 });
  /** The selection's other end; null = no selection (ADR 0115 §2). */
  const [anchor, setAnchor] = useState<CursorKey | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  /** The rendered window's block (scrollTop quantized; a new block re-renders the rows). */
  const [block, setBlock] = useState(0);
  const blockRef = useRef(0);
  const [comp, setComp] = useState<Composer | null>(null);
  const [compH, setCompH] = useState(0);
  /** The title edited inline in the foot (its starting text; the field keeps what is typed), or null. */
  const [titleEdit, setTitleEdit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const compRef = useRef<HTMLDivElement>(null);
  /** False for one cursor change that must not scroll the log (a pointer press, a map jump). */
  const revealNext = useRef(true);
  const inset = useKeyboardInset();
  // Our own keyboard on a phone: the page ends above it already (no inset), and steps aside as for the device's.
  const kbd = useOwnKeyboardUp() || inset > 0;

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

  // ------------------------------------------------------------ measure

  const measure = (): void => {
    const el = logRef.current;
    if (!el) return;
    const lh = px(el, '--exp-lh', 21);
    const ml = px(el, '--exp-ml', 26);
    const mr = px(el, '--exp-mr', 14);
    const probe = el.querySelector('.wc-exp-probe');
    const cw = probe ? probe.getBoundingClientRect().width / 10 : 0;
    const next: Metrics = { cols: logCols(el.clientWidth - ml - mr, cw || 7.8), lh, ml, view: el.clientHeight };
    setMetrics((m) => (m && m.cols === next.cols && m.lh === next.lh && m.ml === next.ml && m.view === next.view ? m : next));
  };
  const hasLog = !!data;
  useLayoutEffect(() => {
    const el = logRef.current;
    if (!el) return;
    measure();
    const RO = globalThis.ResizeObserver;
    if (!RO) return;
    const ro = new RO(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasLog]);

  // ------------------------------------------------------------- model

  const log = data?.log ?? null;
  const cols = metrics?.cols ?? 0;
  const items = useMemo(
    () => (log && doc && cols ? buildItems(log, doc.comments, cols) : null),
    [log, doc?.comments, cols],
  );
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const cur = items ? keyItem(items, cursor) : 0;
  const anchorItem = items && anchor ? keyItem(items, anchor) : -1;
  const curKind = items ? items.kind[cur] : -1;
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
  const excluded = useMemo(() => (log && doc ? excludedCount(doc, log.ts) : 0), [log, doc?.excludes]);
  const strip = useMemo(
    () => (items && log && doc && data ? mapStrip(items, log, doc, data.events) : null),
    [items, log, doc?.excludes, data?.events],
  );

  const lh = metrics?.lh ?? 21;
  const compAt = !items || !comp ? -1 : comp.edit ? (items.commentItem[comp.index] ?? -1) : comp.place;
  const geom: LogGeom = { lh, pad: PAD, comp: compAt >= 0 && comp ? { at: compAt, edit: comp.edit, h: compH } : null };
  const geomRef = useRef(geom);
  geomRef.current = geom;
  const view = metrics?.view ?? 0;
  const blockPx = Math.max(lh * 8, Math.floor(view / 2));
  const viewRows = Math.max(1, Math.floor(view / lh));

  // ------------------------------------------------------------- scroll

  const syncThumb = (): void => {
    const el = logRef.current;
    const th = thumbRef.current;
    if (!el || !th) return;
    const [t, h] = mapThumb(el.scrollTop, el.clientHeight, el.scrollHeight);
    th.style.top = `${t * 100}%`;
    th.style.height = `${h * 100}%`;
    th.hidden = h >= 1;
  };
  const syncBlock = (): void => {
    const el = logRef.current;
    if (!el) return;
    const b = Math.floor(el.scrollTop / Math.max(1, blockPx));
    if (b !== blockRef.current) {
      blockRef.current = b;
      setBlock(b);
    }
  };
  const onScroll = (): void => {
    syncThumb();
    syncBlock();
  };
  const scrollTo = (top: number): void => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, top);
    onScroll();
  };
  useLayoutEffect(syncThumb);
  // A new block size (the log's height changed: a resize, the soft keyboard,
  // the title field's inset) re-quantizes the scroll position; no scroll event
  // comes when only the height changes, and the old block would draw rows far
  // from the view.
  useLayoutEffect(syncBlock, [blockPx]);

  /** Scrolls item `i` into view (as little as possible). */
  const reveal = (i: number): void => {
    const el = logRef.current;
    const it = itemsRef.current;
    if (!el || !it) return;
    const g = geomRef.current;
    scrollTo(revealTop(el.scrollTop, el.clientHeight, itemTop(it, i, g), itemHeight(it, i, g), 0));
  };
  // The cursor pulls the view along when it moves (and after an edit).
  useLayoutEffect(() => {
    if (!items || !metrics) return;
    if (!revealNext.current) {
      revealNext.current = true;
      return;
    }
    reveal(cur);
  }, [cur, items, metrics?.cols]);
  // The composer is kept in view as it opens and grows (and above the soft keyboard).
  useLayoutEffect(() => {
    const el = logRef.current;
    if (!el || !items || !geom.comp) return;
    const top = composerTop(items, geom);
    scrollTo(revealTop(el.scrollTop, el.clientHeight, top, geom.comp.h, 4));
  }, [compAt, compH, metrics?.view]);
  // The composer's height (one more item in the log).
  useLayoutEffect(() => {
    const el = compRef.current;
    if (!el) {
      setCompH(0);
      return;
    }
    const put = (): void => setCompH(el.offsetHeight);
    put();
    const RO = globalThis.ResizeObserver;
    if (!RO) return;
    const ro = new RO(put);
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!comp, compAt]);

  // ------------------------------------------------------------ editing

  const save = (next: ExportDoc): void => {
    if (next === docRef.current) return;
    docRef.current = next;
    setDocState(next);
    void runs()
      .then((lib) => lib.saveExportDoc(next))
      .catch((e: unknown) => nav.flash(`Could not save the edit: ${errText(e)}`, 'fail'));
  };

  /** Exclude when any entry of the target is shown, Include when all are excluded (ADR 0115 §3). */
  const toggleExclude = (): void => {
    const d = docRef.current;
    if (!d || !log || !target) return;
    const [from, to] = entryRangeUs(log, target[0], target[1]);
    save(allExcluded ? includeRange(d, from, to, log.ts) : excludeRange(d, from, to));
  };

  const openComment = (edit: boolean): void => {
    const d = docRef.current;
    if (!d || !log || !items || comp || titleEdit !== null) return;
    if (edit) {
      if (curComment < 0) return;
      setComp({ edit: true, index: curComment, initial: d.comments[curComment]!.text });
      return;
    }
    // Above the selection, or at the cursor (after a cursor comment).
    const above = selLo >= 0;
    const at = above ? selLo : cur;
    const { beforeUs, slot } = commentSlot(d, log, items, at, above);
    const place = !above && items.kind[at] === ITEM_COMMENT ? at + 1 : at;
    setComp({ edit: false, place, beforeUs, slot, initial: '' });
  };

  const closeComposer = (): void => {
    toStack(logRef.current);
    setComp(null);
  };

  const saveComment = (text: string): void => {
    const c = comp;
    const before = docRef.current;
    if (!c || !before || !items) return;
    closeComposer();
    if (c.edit) {
      const next = editComment(before, c.index, text);
      if (next.comments.length < before.comments.length) {
        setAnchor(null);
        setCursor(keyAfterDelete(items, c.index));
      }
      save(next);
      return;
    }
    const next = addComment(before, c.beforeUs, text, c.slot);
    if (next === before) return;
    setAnchor(null);
    setCursor({ comment: changedComment(before.comments, next.comments) });
    save(next);
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
    if (!d || comp || titleEdit !== null) return;
    setTitleEdit(exportTitle(d, s.character, s.startUs));
  };
  const closeTitle = (): void => {
    toStack(logRef.current);
    setTitleEdit(null);
  };
  const saveTitle = (text: string): void => {
    const d = docRef.current;
    if (titleEdit === null || !d) return;
    const def = defaultTitle(s.character, s.startUs);
    const v = text.replace(/\s+/g, ' ').trim();
    closeTitle();
    save(setTitle(d, v === def ? '' : v));
  };

  const chooseFormat = (f: ExportFormat): void => {
    const d = docRef.current;
    if (d) save(setFormat(d, f));
  };

  /** Builds and downloads the chosen format (the doc's stored `format`, ADR 0115 §4, ADR 0128 §43d). */
  const doExport = async (): Promise<void> => {
    const d = docRef.current;
    if (!d || !data || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const name = exportFileName(d, s.character, s.startUs);
    try {
      let blob: Blob;
      if (d.format === 'text') {
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
      nav.flash(`Exported ${name}`);
    } catch (e) {
      nav.flash(`Export failed: ${errText(e)}`, 'fail');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // ------------------------------------------------------------ buttons

  const editing = comp !== null || titleEdit !== null;
  const enabled = (id: string): boolean => {
    if (!items || !doc) return false;
    switch (id as ZoneId) {
      case 'exclude':
        return target !== null;
      case 'edit':
      case 'delete':
        return curComment >= 0;
      case 'export':
        return !busy;
      default:
        return true;
    }
  };
  const press = (id: string): void => {
    if (!enabled(id) || editing) return;
    switch (id as ZoneId) {
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
        return chooseFormat(id as ExportFormat);
      case 'export':
        void doExport();
        return;
    }
  };
  const zone = useButtonZone({ ids: ZONE_IDS, enabled, press });

  // --------------------------------------------------------------- keys

  /** Moves the cursor to item `i`; `extend` keeps (or starts) the selection, else it is cleared. */
  const moveTo = (i: number, extend = false): void => {
    if (!items) return;
    if (extend) {
      if (!anchor) setAnchor(itemKey(items, cur));
    } else setAnchor(null);
    setCursor(itemKey(items, Math.max(0, Math.min(items.count - 1, i))));
  };

  const letters: Record<string, () => void> = {
    x: () => press('exclude'),
    i: () => {
      if (allExcluded) press('exclude');
    },
    c: () => press('comment'),
    e: () => press('edit'),
    d: () => press('delete'),
    t: () => press('title'),
    h: () => press('html'),
    p: () => press('text'),
    o: () => press('export'),
  };

  useKeys((e, nk) => {
    if (!items) return nk !== null && nk !== 'back';
    if (editing) {
      // The field keeps its own keys; here the focus is elsewhere: Esc closes it, the log keys pause.
      if (nk === 'back') {
        if (comp) closeComposer();
        else closeTitle();
        return true;
      }
      return nk !== null;
    }
    if (e.key === 'Delete' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      press('delete');
      return true;
    }
    if (letterAction(e, letters)) return true;
    if (zone.key(e, nk)) return true;
    if (nk === 'back' && anchor) {
      setAnchor(null);
      return true;
    }
    const ext = e.shiftKey;
    switch (nk) {
      case 'up':
        moveTo(cur - 1, ext);
        return true;
      case 'down':
        moveTo(cur + 1, ext);
        return true;
      case 'pgup':
        moveTo(pageItem(items, cur, viewRows, -1), ext);
        return true;
      case 'pgdn':
        moveTo(pageItem(items, cur, viewRows, 1), ext);
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

  /** The item under client y in the log (clamped to the rows in view). */
  const itemAtClientY = (el: HTMLElement, y: number): number => {
    const r = el.getBoundingClientRect();
    const yy = Math.max(r.top, Math.min(r.bottom - 1, y));
    return itemAtY(itemsRef.current!, yy - r.top + el.scrollTop, geomRef.current);
  };

  /**
   * A mouse press on log item `i` (ADR 0115 §2): moves the cursor and clears
   * the selection (Shift: extends it), then a drag selects from the pressed
   * item to the one under the pointer, the log scrolling (on animation
   * frames) while the pointer is above or below it. The pointer is captured
   * on the log, which stays mounted while the rendered rows change.
   */
  const pressRow = (ev: PointerEvent, i: number): void => {
    const el = logRef.current;
    if (!el || !items || ev.button !== 0 || ev.pointerType === 'touch' || editing) return;
    zone.reset();
    let from = i;
    let moved = false;
    if (ev.shiftKey) {
      from = anchorItem >= 0 ? anchorItem : cur;
      moved = true;
      setAnchor(itemKey(items, from));
    } else setAnchor(null);
    if (i !== cur) revealNext.current = false;
    setCursor(itemKey(items, i));

    const win = el.ownerDocument.defaultView ?? window;
    let y = ev.clientY;
    let raf = 0;
    let last = i;
    let lastT = 0;
    const follow = (): void => {
      const it = itemsRef.current;
      if (!it) return;
      const j = itemAtClientY(el, y);
      if ((!moved && j === from) || (moved && j === last)) return;
      moved = true;
      last = j;
      setAnchor(itemKey(it, from));
      setCursor(itemKey(it, j));
    };
    /** Line heights past the log's top (< 0) or bottom (> 0) edge the pointer is. */
    const outside = (): number => {
      const r = el.getBoundingClientRect();
      const h = geomRef.current.lh;
      if (y < r.top) return -Math.min(DRAG_MAX_ROWS, Math.ceil((r.top - y) / h));
      if (y >= r.bottom) return Math.min(DRAG_MAX_ROWS, Math.ceil((y - r.bottom + 1) / h));
      return 0;
    };
    // Auto-scroll: n line heights every 50 ms, spread over the frames.
    const tick = (t: number): void => {
      raf = 0;
      const n = outside();
      if (!n) return;
      const dt = lastT ? Math.min(100, t - lastT) : 16;
      lastT = t;
      el.scrollTop += (n * geomRef.current.lh * dt) / 50;
      onScroll();
      follow();
      raf = win.requestAnimationFrame(tick);
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
      if (!raf && outside()) {
        lastT = 0;
        raf = win.requestAnimationFrame(tick);
      }
    };
    const onEnd = (e: Event): void => {
      if ((e as PointerEvent).pointerId !== ev.pointerId) return;
      if (raf) win.cancelAnimationFrame(raf);
      raf = 0;
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
    const el = logRef.current;
    if (!el || !items || !touchInteraction() || editing) return;
    zone.reset();
    const inMargin = ev.clientX - el.getBoundingClientRect().left < (metrics?.ml ?? 26);
    if (inMargin) setAnchor(anchor ?? itemKey(items, i));
    else setAnchor(null);
    if (i !== cur) revealNext.current = false;
    setCursor(itemKey(items, i));
  };

  /** A press on the overview strip: the thumb drags the log like a scrollbar; elsewhere it jumps there. */
  const pressMap = (ev: PointerEvent): void => {
    const el = logRef.current;
    const bar = ev.currentTarget as HTMLElement;
    if (!el || !items || ev.button !== 0) return;
    ev.preventDefault();
    const r = bar.getBoundingClientRect();
    if (ev.target === thumbRef.current) {
      const y0 = ev.clientY;
      const s0 = el.scrollTop;
      const ratio = el.scrollHeight / Math.max(1, r.height);
      try {
        bar.setPointerCapture(ev.pointerId);
      } catch {
        // A synthetic pointer.
      }
      const win = el.ownerDocument.defaultView ?? window;
      const onMove = (e: PointerEvent): void => {
        if (e.pointerId === ev.pointerId) scrollTo(s0 + (e.clientY - y0) * ratio);
      };
      const onEnd = (e: Event): void => {
        if ((e as PointerEvent).pointerId !== ev.pointerId) return;
        win.removeEventListener('pointermove', onMove, true);
        win.removeEventListener('pointerup', onEnd, true);
        win.removeEventListener('pointercancel', onEnd, true);
      };
      win.addEventListener('pointermove', onMove, true);
      win.addEventListener('pointerup', onEnd, true);
      win.addEventListener('pointercancel', onEnd, true);
      return;
    }
    if (editing) return;
    const it = mapItemAt(items, (ev.clientY - r.top) / Math.max(1, r.height));
    zone.reset();
    setAnchor(null);
    revealNext.current = false;
    setCursor(itemKey(items, it));
    const g = geomRef.current;
    scrollTo(itemTop(items, it, g) - Math.max(0, (el.clientHeight - itemHeight(items, it, g)) / 2));
  };

  // ------------------------------------------------------------- render

  const box = (body: VNode): VNode => (
    <Box title="Export" size="large" onBack={() => nav.pop()} class="wc-exp-box" winClass="wc-exp-win">
      {body}
    </Box>
  );

  if (!data || !doc || !log) {
    return box(
      <div class="wc-exp">
        <div class={'wc-exp-state' + (failed ? ' is-bad' : '')}>
          {failed ? `Could not read the log: ${failed}` : 'Reading the log…'}
        </div>
        <LookFlash />
      </div>,
    );
  }

  const sum = barSummary({
    character: s.character,
    level: s.level,
    date: fmtDate(s.startUs),
    lines: log.ts.length,
    excluded,
    comments: doc.comments.length,
  });
  const heading = !items
    ? ''
    : selectionTitle(
        anchorItem >= 0
          ? { selected: targetCount }
          : curKind === ITEM_ENTRY
            ? { entry: curEntry }
            : curKind === ITEM_COMMENT
              ? { comment: true }
              : { end: true },
      );

  // The rows near the view: a view above and below the current block.
  const rows: VNode[] = [];
  let total = 0;
  if (items && metrics) {
    total = contentHeight(items, geom) + PAD;
    const yFrom = Math.max(0, block * blockPx - view);
    const yTo = (block + 1) * blockPx + 2 * view;
    for (let i = itemAtY(items, yFrom, geom); i < items.count; i++) {
      const top = itemTop(items, i, geom);
      if (top >= yTo) break;
      if (geom.comp?.edit && geom.comp.at === i) continue;
      const kind = items.kind[i]!;
      const isCur = i === cur;
      const sel = kind === ITEM_ENTRY && i >= selLo && i <= selHi;
      let dataKind: string;
      let lines: VNode[];
      if (kind === ITEM_ENTRY) {
        const e = items.ref[i]!;
        const excl = isExcluded(doc, log.ts[e]!);
        dataKind = excl ? 'excluded' : log.kind[e] === KIND_SYS ? 'system' : log.kind[e] === KIND_OUT ? 'command' : 'entry';
        lines = excl
          ? entryPlainRows(log, e, cols).map((t) => <div class="wc-exp-ln">{t}</div>)
          : entrySegments(log, e, cols).map((segs) => (
              <div class="wc-exp-ln">
                {segs.map((sg) =>
                  sg.cls || sg.color || sg.bg ? (
                    <span class={sg.cls || undefined} style={sg.color || sg.bg ? { color: sg.color, background: sg.bg } : undefined}>
                      {sg.text}
                    </span>
                  ) : (
                    sg.text
                  ),
                )}
              </div>
            ));
      } else if (kind === ITEM_COMMENT) {
        dataKind = 'comment';
        lines = items.commentRows[items.ref[i]!]!.map((t) => <div class="wc-exp-ln">{t}</div>);
      } else {
        dataKind = 'end';
        lines = [<div class="wc-exp-ln">{END_TEXT}</div>];
      }
      rows.push(
        <div
          key={i}
          class={'wc-exp-row' + (isCur ? ' is-cur' : '') + (sel ? ' is-sel' : '')}
          data-item={i}
          data-kind={dataKind}
          style={{ top: `${top}px`, height: `${itemHeight(items, i, geom)}px` }}
          onMouseDown={(ev) => ev.preventDefault()}
          onPointerDown={(ev) => pressRow(ev, i)}
          onClick={(ev) => tapRow(ev, i)}
        >
          {lines}
        </div>,
      );
    }
  }

  const composer =
    comp && items && geom.comp ? (
      <CommentComposer
        key={comp.edit ? `e${comp.index}` : `a${comp.place}`}
        boxRef={compRef}
        top={composerTop(items, geom)}
        edit={comp.edit}
        initial={comp.initial}
        onSave={saveComment}
        onCancel={closeComposer}
      />
    ) : null;

  const tool = (id: ZoneId, node: (selected: boolean, disabled: boolean) => VNode): VNode =>
    node(zone.sel === id, !enabled(id) || editing);
  const fmtSel = zone.sel === 'html' ? 0 : zone.sel === 'text' ? 1 : undefined;
  const ext = doc.format === 'html' ? 'html' : 'txt';

  return box(
    <div
      class={'wc-exp' + (editing ? ' is-editing' : '') + (comp ? ' is-composing' : '') + (editing && kbd ? ' is-kbd' : '')}
      data-format={doc.format}
      style={editing && inset > 0 ? { paddingBottom: `${inset}px` } : undefined}
    >
      <BoxHead class="wc-exp-bar">
        <div class="wc-exp-who">
          <span class="wc-exp-name">{sum.who}</span>
          <span class="wc-exp-counts">{sum.line}</span>
        </div>
        <span class="wc-exp-selhead">{heading}</span>
        <div class="wc-exp-tools">
          {tool('exclude', (sel, off) =>
            allExcluded ? (
              <GlassButton id="INCLUDE" label="Include" letter="i" icon="include" small selected={sel} disabled={off} onClick={() => press('exclude')} />
            ) : (
              <GlassButton id="EXCLUDE" label="Exclude" letter="x" icon="exclude" small selected={sel} disabled={off} onClick={() => press('exclude')} />
            ),
          )}
          {tool('comment', (sel, off) => (
            <GlassButton id="COMMENT" label="Add comment" letter="c" icon="comment" small selected={sel} disabled={off} onClick={() => press('comment')} />
          ))}
          {tool('edit', (sel, off) => (
            <GlassButton id="EDIT" label="Edit" letter="e" icon="pencil" small selected={sel} disabled={off} onClick={() => press('edit')} />
          ))}
          {tool('delete', (sel, off) => (
            <GlassButton id="DELETE" label="Delete" letter="d" icon="trash" small danger selected={sel} disabled={off} onClick={() => press('delete')} />
          ))}
        </div>
      </BoxHead>
      <BoxBody class="wc-exp-main" scroll={false}>
        <div
          class={'wc-exp-log' + (zone.zone === 'buttons' ? ' is-idle' : '')}
          ref={logRef}
          data-cols={cols || undefined}
          role="listbox"
          aria-label="Log"
          aria-multiselectable="true"
          onScroll={onScroll}
        >
          <span class="wc-exp-probe" aria-hidden="true">
            0000000000
          </span>
          <div class="wc-exp-spacer" style={{ height: `${total}px` }}>
            {rows}
            {composer}
          </div>
        </div>
        <div class="wc-exp-map" aria-hidden="true" onPointerDown={pressMap}>
          {strip?.excluded.map(([a, b]) => (
            <i class="wc-exp-mx" style={{ top: `${a * 100}%`, height: `max(2px, ${(b - a) * 100}%)` }} />
          ))}
          {strip?.comments.map((a) => <i class="wc-exp-mc" style={{ top: `${a * 100}%` }} />)}
          {strip?.marks.map((m) => (
            <i class="wc-exp-ml" data-mark={m.letter} style={{ top: `${m.at * 100}%` }}>
              {m.letter}
            </i>
          ))}
          <div class="wc-exp-thumb" ref={thumbRef} />
        </div>
      </BoxBody>
      <BoxFoot class="wc-exp-foot">
        <div class="wc-exp-row2">
          {titleEdit !== null ? (
            <TitleEditor
              initial={titleEdit}
              ext={ext}
              onSave={saveTitle}
              onCancel={closeTitle}
            />
          ) : (
            <div class="wc-exp-file">
              <span class="wc-exp-flabel">File</span>
              <span class="wc-exp-fn" title="Edit the title (T)" onClick={() => press('title')}>
                <span class="wc-exp-title">{exportTitle(doc, s.character, s.startUs)}</span>
                <em>.{ext}</em>
              </span>
              {tool('title', (sel, off) => (
                <GlassButton id="TITLE" label="Title" letter="t" icon="title" small selected={sel} disabled={off} onClick={() => press('title')} />
              ))}
            </div>
          )}
          <div class="wc-exp-outs">
            <Seg
              label="Format"
              options={FORMATS.map((f) => ({ ...f, disabled: editing }))}
              value={doc.format}
              selected={fmtSel}
              onChange={(v) => press(v)}
            />
            {tool('export', (sel, off) => (
              <GlassButton id="EXPORT" label="Export" letter="o" icon="export" primary selected={sel} disabled={off} onClick={() => press('export')} />
            ))}
          </div>
        </div>
        <LookFlash class="wc-exp-flash" />
      </BoxFoot>
    </div>,
  );
});

// ------------------------------------------------------------ the inline inputs

/** The keys of an inline field (it owns them: `data-wc-own-keys`): Enter saves, Esc cancels, Ctrl+U clears. */
function fieldKeys(e: KeyboardEvent, o: { save(): void; cancel(): void; clear(): void }): void {
  if (e.isComposing) return;
  const mod = e.ctrlKey || e.altKey || e.metaKey;
  if (e.key === 'Enter' && !mod) {
    e.preventDefault();
    o.save();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    o.cancel();
  } else if (e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'u') {
    e.preventDefault();
    o.clear();
  } else if (e.key === 'Tab') e.preventDefault();
}

/**
 * The comment composer, inline in the log at its place (before the anchor
 * for a new comment, in place of the comment when editing): the text (600
 * characters; newlines and tabs become spaces, a paste joins its lines),
 * the counter, the `## ` preview as in the replay, the hold time, Cancel
 * and Save. Comments are one paragraph: Enter (with Shift too) saves.
 */
function CommentComposer(p: {
  boxRef: { current: HTMLDivElement | null };
  top: number;
  edit: boolean;
  initial: string;
  onSave(text: string): void;
  onCancel(): void;
}): VNode {
  const [text, setText] = useState(p.initial);
  const flat = collapseComment(text);
  return (
    <div
      class="wc-exp-comp"
      ref={p.boxRef}
      style={{ top: `${p.top}px` }}
      data-wc-own-keys=""
      onKeyDown={(e) => fieldKeys(e, { save: () => p.onSave(text), cancel: p.onCancel, clear: () => setText('') })}
    >
      <div class="wc-exp-comp-in">
        <TextArea
          label={p.edit ? 'Edit comment' : 'Add comment'}
          id="comment"
          value={text}
          onInput={(v) => setText(pasteText(v))}
          mono
          rows={2}
          maxLength={COMMENT_MAX}
          placeholder="What happened here…"
          enterSubmits
          autoFocus
        />
        <div class={'wc-exp-count' + (flat.length >= COMMENT_MAX ? ' is-full' : '')}>{`${flat.length} / ${COMMENT_MAX}`}</div>
        {flat ? (
          <>
            <div class="wc-exp-preview">{commentLines(text).join('\n')}</div>
            <p class="wc-exp-hold">{holdText(commentHoldMs(text))}</p>
          </>
        ) : (
          <div class="wc-exp-preview is-empty">{p.edit ? 'An empty comment is deleted.' : 'Type the comment.'}</div>
        )}
        <div class="wc-exp-cbtns">
          <GlassButton id="CANCEL" label="Cancel" small onClick={p.onCancel} />
          <GlassButton id="SAVE" label="Save" small primary onClick={() => p.onSave(text)} />
        </div>
      </div>
    </div>
  );
}

/** The title, edited inline in the foot: the field, the file it gives (or the default), Save and Cancel. */
function TitleEditor(p: { initial: string; ext: string; onSave(text: string): void; onCancel(): void }): VNode {
  const [text, setText] = useState(p.initial);
  const v = text.replace(/\s+/g, ' ').trim();
  return (
    <div
      class="wc-exp-file is-edit"
      data-wc-own-keys=""
      onKeyDown={(e) => fieldKeys(e, { save: () => p.onSave(text), cancel: p.onCancel, clear: () => setText('') })}
    >
      <span class="wc-exp-flabel">File</span>
      <div class="wc-exp-tfield">
        <Field value={text} onInput={setText} id="title" mono maxLength={TITLE_MAX} autoFocus selectAll />
      </div>
      <span class="wc-exp-thint">
        {v ? (
          <>
            File: <b>{`${v}.${p.ext}`}</b>
          </>
        ) : (
          'Empty: the default title.'
        )}
      </span>
      <GlassButton id="SAVE" label="Save" small primary onClick={() => p.onSave(text)} />
      <GlassButton id="CANCEL" label="Cancel" small onClick={p.onCancel} />
    </div>
  );
}
