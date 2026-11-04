// The profile editor frame (Inv §5.3–5.9): one Preact frame on the chrome's
// frame stack, with two views over the same profile text and a manual.
//
//   LITE    kind buttons, entry list (display sort only), detail panel,
//           highlight colour picker, macro key capture (ADR 0104: the
//           column fills the frame up to LITE_MAX_W, no hints panel)
//   EDITOR  CodeMirror 6 buffer (cm.ts)
//   HELP    the read-only manual (help.ts), scrollable (ADR 0037)
//
// The profile text is the source of truth. LITE edits a ProfileDoc
// (src/script/doc), EDITOR edits text; a flip serialises or parses, so it
// never reorders or drops anything (ADR 0015). Each open starts in LITE.
// HELP is laid over whichever of the two is open: `mode` stays what it was,
// the lite state is kept and the buffer stays mounted (hidden), so going to
// HELP and back changes nothing.
//
// Focus (Inv §5.8): mode, a zone (toggle, kind, list, detail, buffer, help) and
// the detail field. Wherever keyboard focus is, it paints amber; grey marks
// a persistent selection (current kind, entry being edited).
//
// Find (ADR 0070): Ctrl+F in EDITOR opens the buffer search (search.ts),
// Ctrl+H its replace; in HELP Ctrl+F opens the manual's (manual-view.tsx).
// LITE has no find: there Ctrl+F and Ctrl+H do nothing (ADR 0119), so the
// browser's own find or history does not open either.
//
// New entry (ADR 0119): `n` on the kind row or in the entry list adds an
// entry of the current kind; Del deletes only in the list.
//
// Apply in place (ADR 0105): the editor stays open while the player plays,
// so its changes take effect without leaving it. `base` is the text last
// stored (and applied, when live) as a document whose node ids the lite
// document shares; what the open view differs from it in is unapplied.
// LITE applies where an edit is finished: leaving a field (also when the
// window loses the focus), another entry or kind, a new or deleted entry, a
// captured key, a highlight style or colour; never per keystroke. EDITOR
// applies on Ctrl+S and on the flip back to LITE ("Modified" until then).
// Ctrl+S applies at once in every view. An entry that does not validate is
// held back (`applicableDoc`), a text that does not load is not applied;
// the footer says why. Each apply rebases the edits onto the latest stored
// text (`rebaseDoc`), and a save from outside (a typed `#alias`, a script
// variable) is laid under the open edits as it happens, so neither side is
// lost. ESC asks Apply / Discard / Keep editing only while something is
// unapplied. Applies run one at a time on `chain`.
//
// Keys come from the frame stack's capture-phase listener (`useKeys`).
// Text fields get the key's default action when the handler returns false;
// the CodeMirror buffer gets its bindings through `handleKey`.

import type { EditorView } from '@codemirror/view';
import type { JSX, VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { device } from '../core/device';
import { useGrid } from '../chrome/kit/hooks';
import { escHints } from '../chrome/kit/esc';
import { centreLeft, scrollbar, wrapText } from '../chrome/kit/nav';
import { TuiScrollbar, barPress, useScrollBox } from '../chrome/kit/scroll';
import { type Nav, useIsTop, useKeys, useNav, useUnsaved } from '../chrome/kit/stack';
import { Button, indent } from '../chrome/kit/widgets';
import {
  type EntryNode,
  FIELD_LABELS,
  type ProfileDoc,
  addEntry,
  alignDoc,
  checkBraces,
  displayBody,
  editEntry,
  parseProfile,
  rebaseDoc,
  removeEntry,
  serialize,
  storeBody,
  validateEntry,
} from '../script/doc';
import { bindability, displayKey, learnKeyLabel } from '../script/keys';
import type { CommitResult } from '../profiles';
import {
  type BufferStatus,
  type ScrollStatus,
  bufferText,
  createBuffer,
  handleKey,
  onFirstLine,
  pageScroll,
  replaceText,
} from './cm';
import { type ManualControl, ManualView } from './manual-view';
import { type FindQuery, EMPTY_QUERY } from './manual-search';
import { searchFocused, searchFrameKey } from './search';
import { helpFrame, helpLayout, helpMenu, helpMenuWidth } from './help';
import {
  type EditorViewName,
  HL_COLORS,
  HL_STYLES,
  HL_STYLE_LABELS,
  type HighlightSpec,
  type HlPick,
  KINDS,
  KIND_TITLES,
  LIST_GAP,
  type LiteKind,
  NEW_BODY,
  TOGGLE_W,
  VIEWS,
  ansiIndex,
  applicableDoc,
  ellipsis,
  entryWarning,
  heldText,
  highlightStyle,
  keyCell,
  listRows,
  liteGeometry,
  parseHighlight,
  patternColumn,
  pendingDoc,
  rowText,
  sentinelPrompt,
  serializeHighlight,
  stepView,
  titleText,
} from './logic';
import { balanceText } from './syntax';

// ------------------------------------------------------------------- host

/** What the editor needs from whoever opened it (ADR 0015 "Editor host", ADR 0105). */
export interface EditorHost {
  /** Profile name, for the title and the flash. */
  name: string;
  /** The stored profile text at open. */
  text: string;
  /** True while a live session runs the profile: an apply swaps the running rules, ESC asks first. */
  isLive(): boolean;
  /** The latest stored text (an outside change is followed with it). */
  load(): Promise<string>;
  /**
   * Stores, and while live applies, what `build` makes of the latest stored
   * text. `quiet`: no UI pane line for a success (the editor reports it).
   */
  commit(build: (stored: string) => string, opts: { quiet: boolean }): Promise<CommitResult>;
  /** Calls `fn` with the new text after every save of the profile, from any source. */
  subscribe?(fn: (text: string) => void): () => void;
}

/** How an apply ended (`commit`). */
type Outcome =
  /** Nothing unapplied is left. `changed`: something was stored. */
  | { kind: 'clean'; changed: boolean; added: string[] }
  /** What validates was applied; held entries (or a text that does not load) remain. */
  | { kind: 'held'; message: string }
  /** Reading or saving failed (`save`), or the live apply refused the text. */
  | { kind: 'failed'; message: string; save: boolean }
  /** The editor is closed or closing. */
  | { kind: 'gone' };

type CommitWhy = 'auto' | 'save' | 'modal' | 'close';

type Mode = 'lite' | 'editor';
type Zone = 'toggle' | 'kind' | 'list' | 'detail' | 'buffer' | 'menu' | 'help';
type Field = 'pattern' | 'body' | 'key' | 'style' | 'text' | 'bg';

const FIELDS: Readonly<Record<LiteKind, readonly Field[]>> = {
  action: ['pattern', 'body'],
  alias: ['pattern', 'body'],
  substitute: ['pattern', 'body'],
  macro: ['key', 'body'],
  highlight: ['pattern', 'style', 'text', 'bg'],
};

/** Rows under the detail panel's last box for the validation message and the entry warning (ADR 0104). */
const NOTE_ROWS = 2;
const FLASH_MS = 1500;
const BOUND_MS = 2000;

const SENTINEL = -1;

/** Footer hints of the HELP view, longest first; the first that fits is shown. */
const HELP_HINTS = [
  '↑↓ Scroll · PgUp/PgDn Page · n/p Heading · Ctrl+F Find · Tab Cycle · ESC Back',
  '↑↓ Scroll · PgUp/PgDn Page · n/p Heading · Tab Cycle · ESC Back',
  '↑↓ Scroll · n/p Heading · Ctrl+F Find · ESC Back',
  '↑↓ Scroll · n/p Heading · Tab Cycle · ESC Back',
  '↑↓ Scroll · ESC Back',
];
/** In the navigation menu. */
const HELP_MENU_HINTS = [
  '↑↓ Section · → Manual · PgUp/PgDn Page · n/p Heading · Ctrl+F Find · Tab Cycle · ESC Back',
  '↑↓ Section · → Manual · PgUp/PgDn Page · n/p Heading · Tab Cycle · ESC Back',
  '↑↓ Section · → Manual · Ctrl+F Find · ESC Back',
  '↑↓ Section · → Manual · Tab Cycle · ESC Back',
  '↑↓ Section · ESC Back',
];
/** In the manual, with the menu beside it. */
const HELP_BODY_HINTS = [
  '↑↓ Scroll · ← Menu · PgUp/PgDn Page · n/p Heading · Ctrl+F Find · Tab Cycle · ESC Back',
  '↑↓ Scroll · ← Menu · PgUp/PgDn Page · n/p Heading · Tab Cycle · ESC Back',
  '↑↓ Scroll · ← Menu · n/p Heading · Ctrl+F Find · ESC Back',
  '↑↓ Scroll · ← Menu · n/p Heading · Tab Cycle · ESC Back',
  ...HELP_HINTS.slice(2),
];

/** The unsaved-changes prompt (ESC with something unapplied). */
const APPLY_HINT = 'Y to apply · N to discard · ESC to keep editing';
/** The confirm hint on a narrow phone (ADR 0075 §3.2). */
const APPLY_HINT_SHORT = 'Y Apply · N Discard · ESC Keep editing';
/** The prompt when what is left cannot be applied (held entries, a text that does not load). */
const HELD_HINT = 'N to discard · ESC to keep editing';
const HELD_HINT_SHORT = 'N Discard · ESC Keep editing';
/** Footer hints of LITE, longest first (it applies by itself, ADR 0105; no find, ADR 0119). */
const LITE_HINTS = ['Tab Cycle · ESC Back', 'ESC Back'];
/** On the kind row. */
const KIND_HINTS = ['n New · Tab Cycle · ESC Back', 'n New · ESC Back', ...LITE_HINTS.slice(1)];
/** In the entry list. */
const LIST_HINTS = ['n New · Del Delete · Tab Cycle · ESC Back', 'n New · Del Delete · ESC Back', ...KIND_HINTS.slice(1)];
/** How long a failed or held apply stays in the footer. */
const FAIL_MS = 6000;

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const plain = (e: KeyboardEvent): boolean => !e.ctrlKey && !e.altKey && !e.metaKey;
const cps = (s: string): number => [...s].length;
/** The first of `hints` (longest first) that fits `cols`, else the last. */
const fitHint = (hints: readonly string[], cols: number): string => hints.find((h) => cps(h) <= cols) ?? hints.at(-1)!;
const pad = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - cps(s)));

/** Visual rows of `text` in a box `w` cells wide (char wrap). */
function visualRows(text: string, w: number): number {
  let n = 0;
  for (const line of text.split('\n')) n += Math.max(1, Math.ceil(cps(line) / Math.max(1, w)));
  return n;
}

interface Capture {
  id: number;
  /** Opened by `+ New entry`: ESC removes the entry, a bind moves on to Commands. */
  auto: boolean;
  error: string;
}

interface LocalFlash {
  text: string;
  kind: 'ok' | 'fail' | 'warn';
  seq: number;
}

const FLASH_CLASS: Readonly<Record<LocalFlash['kind'], string>> = { ok: 'wc-c-accent', fail: 'wc-c-err', warn: 'wc-c-yellow' };

interface GridPos {
  r: number;
  c: number;
}

/** Pushes the profile editor for `host` onto the frame stack. */
export function openProfileEditor(nav: Nav, host: EditorHost): void {
  nav.push(<ProfileEditor host={host} />);
}

export function ProfileEditor({ host }: { host: EditorHost }): VNode {
  const nav = useNav();
  const isTop = useIsTop();
  const { cols, rows, surface } = useGrid();

  const [mode, setMode] = useState<Mode>('lite');
  const [help, setHelp] = useState(false);
  // The section HELP shows, kept while another view is up (manual-view.tsx scrolls).
  const [helpSection, setHelpSection] = useState(0);
  const manualCtl = useRef<ManualControl | null>(null);
  // The manual's last find query, kept while HELP is closed.
  const helpFind = useRef<FindQuery>(EMPTY_QUERY);
  const [zone, setZone] = useState<Zone>('kind');
  const [field, setField] = useState<Field>('pattern');
  const initial = useMemo(() => parseProfile(host.text), []);
  const [doc, setDoc] = useState<ProfileDoc>(initial);
  // What is stored (and applied) as far as the editor knows (ADR 0105).
  const [base, setBase] = useState<ProfileDoc>(initial);
  const [kind, setKind] = useState<LiteKind>('action');
  const [cursorIds, setCursorIds] = useState<Partial<Record<LiteKind, number>>>({});
  const listBox = useScrollBox();
  const [pinned, setPinned] = useState<number[]>([]);
  const [visited, setVisited] = useState<ReadonlySet<number>>(new Set());
  const [bodyDraft, setBodyDraft] = useState<{ id: number; text: string } | null>(null);
  const [bodyTop, setBodyTop] = useState(0);
  const [styleCur, setStyleCur] = useState(0);
  const [textCur, setTextCur] = useState<GridPos>({ r: 0, c: 0 });
  const [bgCur, setBgCur] = useState<GridPos>({ r: 0, c: 0 });
  const [capture, setCapture] = useState<Capture | null>(null);
  const [modal, setModal] = useState<null | 'confirm' | 'held' | 'applying' | 'saving'>(null);
  // Why the `held` prompt cannot apply.
  const [heldMsg, setHeldMsg] = useState('');
  const [flash, setFlash] = useState<LocalFlash | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [status, setStatus] = useState<BufferStatus>({ line: 1, col: 1, unclosed: 0, stray: 0, hint: null });
  const [scroll, setScroll] = useState<ScrollStatus>({ top: 0, height: 0, client: 0 });

  const rootRef = useRef<HTMLDivElement>(null);
  const patternRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const bufRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const bufferInit = useRef('');
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashSeq = useRef(0);
  const flashRef = useRef<LocalFlash | null>(null);
  const cellH = useRef(16);

  // Refs for the applies, which finish after the render that started them.
  const baseRef = useRef(initial);
  const docRef = useRef(doc);
  docRef.current = doc;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const mounted = useRef(true);
  /** Set once the editor leaves (a discard must not apply on the way out). */
  const closing = useRef(false);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const inflight = useRef(0);
  const refreshQueued = useRef(false);
  /** Something was stored during this visit (the flash on leaving). */
  const savedAny = useRef(false);
  /** The unapplied text an automatic apply last held back: not tried (and flashed) again. */
  const lastHeld = useRef<string | null>(null);

  const showFlash = (text: string, kind: LocalFlash['kind'] = 'ok', ms = FLASH_MS): void => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    const f = { text, kind, seq: ++flashSeq.current };
    flashRef.current = f;
    setFlash(f);
    flashTimer.current = setTimeout(() => {
      flashRef.current = null;
      setFlash(null);
    }, ms);
  };
  const clearFlash = (): void => {
    flashRef.current = null;
    setFlash(null);
  };
  useEffect(
    () => () => {
      mounted.current = false;
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  /** Key capture needs a physical keyboard: a phone gets a note instead (ADR 0075 §3). */
  const PHONE_CAPTURE = 'Key capture: desktop only.';
  const startCapture = (id: number): void => {
    if (device().phone) showFlash(PHONE_CAPTURE, 'fail');
    else setCapture({ id, auto: false, error: '' });
  };

  // ------------------------------------------------------------- geometry

  const gap = surface === 'start' ? 2 : 1;
  // The LITE column, list and detail widths (ADR 0104; logic.ts `liteGeometry`).
  const { w: W, at, list: L, detail: D, kindAt, kindW, kindGap } = liteGeometry(cols, device().phone);
  // gap + title + blank + (kind row 3 + blank) + body + blank + footer
  const bodyH = Math.max(4, rows - gap - 2 - 4 - 2);
  const bufferH = Math.max(3, rows - gap - 2 - 2);
  const listVisible = Math.max(1, bodyH - 1);
  // HELP: the menu at the left edge, then the manual: text, a blank cell
  // and the scrollbar (help.ts `helpFrame`).
  const menu = useMemo(() => helpMenu(), []);
  const menuW = useMemo(() => helpMenuWidth(menu), [menu]);
  // EDITOR and HELP span the whole grid, cell 0 to the last cell (ADR 0037).
  const hf = helpFrame(cols, menuW);
  const manual = useMemo(() => helpLayout(hf.width - 2), [hf.width]);
  // The menu is gone (narrow frame): its focus goes to the manual.
  useEffect(() => {
    if (zone === 'menu' && !hf.menu) setZone('help');
  }, [zone, hf.menu]);

  // ------------------------------------------------------------ lite model

  const list = listRows(doc, kind, pinned);
  const wantId = cursorIds[kind];
  let idx = wantId === SENTINEL ? list.length : list.findIndex((e) => e.id === wantId);
  if (idx < 0) idx = 0;
  const cur: EntryNode | undefined = list[idx];
  const fields = FIELDS[kind];
  const fieldIdx = Math.max(0, fields.indexOf(field));
  const count = list.length + 1; // + New entry

  // The cursor pulls the list along when it moves (and on a new kind or view).
  const liteShown = mode === 'lite' && !help;
  useLayoutEffect(() => {
    if (liteShown) listBox.show(idx);
  }, [idx, listVisible, count, kind, liteShown]);

  const moveTo = (i: number): void => {
    const j = Math.max(0, Math.min(list.length, i));
    setCursorIds((m) => ({ ...m, [kind]: j === list.length ? SENTINEL : list[j]!.id }));
  };

  const bodyText = cur ? (bodyDraft && bodyDraft.id === cur.id ? bodyDraft.text : displayBody(cur.kind, cur.body)) : '';

  // -------------------------------------------------------------- focus

  const focusZone = (z: Zone, f?: Field): void => {
    setZone(z);
    if (f) setField(f);
  };

  // ------------------------------------------------------------- editing

  const setPattern = (v: string): void => {
    if (!cur) return;
    setDoc((d) => editEntry(d, cur.id, { pattern: v }));
  };

  const setBody = (v: string): void => {
    if (!cur) return;
    setBodyDraft({ id: cur.id, text: v });
    setDoc((d) => editEntry(d, cur.id, { body: storeBody(cur.kind, v, cur.body, d.eol) }));
  };

  const newEntry = (): void => {
    if (kind === 'macro' && device().phone) return showFlash(PHONE_CAPTURE, 'fail');
    const r = addEntry(doc, { kind, pattern: '', body: NEW_BODY[kind] });
    setDoc(r.doc);
    setPinned((p) => [...p, r.id]);
    setCursorIds((m) => ({ ...m, [kind]: r.id }));
    setBodyDraft(null);
    if (kind === 'macro') {
      setCapture({ id: r.id, auto: true, error: '' });
      focusZone('detail', 'key');
    } else {
      focusZone('detail', 'pattern');
    }
  };

  const deleteEntry = (): void => {
    if (!cur) return;
    const next = list[idx + 1] ?? list[idx - 1];
    setDoc((d) => removeEntry(d, cur.id));
    setPinned((p) => p.filter((id) => id !== cur.id));
    setCursorIds((m) => ({ ...m, [kind]: next ? next.id : SENTINEL }));
    requestCommit();
  };

  const hlSpec = (): HighlightSpec => (cur ? parseHighlight(cur.body) : null) ?? { styles: [], fg: null, bg: null };
  const setHl = (s: HighlightSpec): void => {
    if (!cur) return;
    const body = serializeHighlight(s);
    setDoc((d) => editEntry(d, cur.id, { body }));
    requestCommit();
  };
  const toggleStyle = (i: number): void => {
    const s = hlSpec();
    const st = HL_STYLES[i]!;
    setHl({ ...s, styles: s.styles.includes(st) ? s.styles.filter((x) => x !== st) : [...s.styles, st] });
  };
  const togglePick = (dim: 'fg' | 'bg', p: GridPos): void => {
    const s = hlSpec();
    const pick: HlPick = { row: p.r, bright: p.c ? 1 : 0 };
    const cur0 = s[dim];
    const same = cur0 && cur0.row === pick.row && cur0.bright === pick.bright;
    setHl({ ...s, [dim]: same ? null : pick });
  };

  // ---------------------------------------------------------------- flip

  const flip = (to: Mode): void => {
    if (to === mode) return;
    if (to === 'editor') {
      // Unapplied lite edits go along as unapplied text (EDITOR applies on Ctrl+S).
      const d = pendingDoc(baseRef.current, doc);
      bufferInit.current = serialize(d);
      setDoc(d);
    } else {
      setDoc(alignDoc(baseRef.current, parseProfile(bufferNow())));
      setCursorIds({});
      // Back in LITE, the text is applied (ADR 0105).
      requestCommit();
    }
    setPinned([]);
    setVisited(new Set());
    setBodyDraft(null);
    setCapture(null);
    clearFlash();
    setMode(to);
  };

  /** The toggle: HELP is laid over the current view; LITE and EDITOR flip as before. */
  const view: EditorViewName = help ? 'help' : mode;
  const select = (v: EditorViewName): void => {
    if (v === 'help') {
      if (!help) {
        setHelp(true);
        setCapture(null);
        clearFlash();
      }
      return;
    }
    setHelp(false);
    flip(v);
  };

  // The buffer was hidden while HELP was up: let CodeMirror measure again.
  useLayoutEffect(() => {
    if (!help && mode === 'editor') viewRef.current?.requestMeasure();
  }, [help]);

  // Mount the CodeMirror buffer while in EDITOR mode (a fresh state, so a
  // fresh undo history, on every flip).
  useLayoutEffect(() => {
    if (mode !== 'editor' || !bufRef.current) return;
    const view = createBuffer(bufRef.current, {
      text: bufferInit.current,
      eol: doc.eol,
      onStatus: setStatus,
      onScroll: setScroll,
      onClipboard: (k) => showFlash(k === 'copy' ? 'Copied' : 'Cut'),
      onFocus: () => setZone('buffer'),
    });
    viewRef.current = view;
    return () => {
      bufferInit.current = bufferText(view);
      view.destroy();
      viewRef.current = null;
    };
  }, [mode]);

  // Keyboard focus follows the zone (after the buffer is mounted).
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const lh = parseFloat(getComputedStyle(root).lineHeight);
    if (lh > 0) cellH.current = lh;
    // A window without the focus leaves it where it is (ADR 0103).
    if (!isTop) return;
    const active = root.ownerDocument.activeElement;
    // The manual's find field keeps the keyboard.
    if (help && !modal && active && root.contains(active) && active.closest('.wc-search')) return;
    let target: HTMLElement | null = root;
    if (!modal && !capture) {
      if (zone === 'detail' && field === 'pattern') target = patternRef.current;
      else if (zone === 'detail' && field === 'body') target = bodyRef.current;
      else if (zone === 'buffer') {
        const v = viewRef.current;
        if (v) {
          if (!v.hasFocus && !searchFocused(v)) v.focus();
          return;
        }
      }
    }
    target ??= root;
    if (active !== target) target.focus({ preventScroll: true });
  });

  // --------------------------------------------------------------- apply

  const bufferNow = (): string => {
    const v = viewRef.current;
    return v ? bufferText(v) : bufferInit.current;
  };

  /** The open view's edits as a document that shares its ids with `b`. */
  const localNow = (b: ProfileDoc): ProfileDoc =>
    modeRef.current === 'editor' ? alignDoc(b, parseProfile(bufferNow())) : docRef.current;

  /** True while the open view holds changes that are not applied. */
  const unapplied = (): boolean => {
    const b = baseRef.current;
    const bt = serialize(b);
    return modeRef.current === 'editor' ? bufferNow() !== bt : serialize(pendingDoc(b, docRef.current)) !== bt;
  };

  const putBase = (b: ProfileDoc): void => {
    baseRef.current = b;
    setBase(b);
  };

  /**
   * Lays the open view's edits (made against `from`) over `onto`, the new
   * base. EDITOR's text is lined up with `ref` (default `from`): after an
   * apply that is the applied snapshot, so the nodes it added keep the ids
   * they have in `onto` and are not added twice.
   */
  const relayLocal = (from: ProfileDoc, onto: ProfileDoc, ref: ProfileDoc = from): void => {
    if (modeRef.current === 'editor') {
      const t = bufferNow();
      const next = serialize(rebaseDoc(from, alignDoc(ref, parseProfile(t)), onto));
      const v = viewRef.current;
      if (v) replaceText(v, next);
      else bufferInit.current = next;
    } else setDoc((d) => rebaseDoc(from, d, onto));
  };

  /** Runs `fn` after every apply and refresh queued before it. */
  const enqueue = <T,>(fn: () => Promise<T>): Promise<T> => {
    inflight.current++;
    const p = chain.current.then(fn).finally(() => {
      inflight.current--;
    });
    chain.current = p.catch(() => {});
    return p;
  };

  /** The open view's edits at a commit point, against the base of that moment. */
  interface Snapshot {
    from: ProfileDoc;
    local: ProfileDoc;
    editor: boolean;
  }
  const snapshot = (): Snapshot => {
    const from = baseRef.current;
    return { from, local: localNow(from), editor: modeRef.current === 'editor' };
  };

  /** One apply: the snapshot's applicable edits, rebased onto the latest stored text. */
  const runCommit = async (why: CommitWhy, snap: Snapshot): Promise<Outcome> => {
    if (!mounted.current || closing.current) return { kind: 'gone' };
    const from = baseRef.current;
    const editor = snap.editor;
    // An apply that ran meanwhile moved the base: the snapshot's edits go over it.
    const local = snap.from === from ? snap.local : rebaseDoc(snap.from, snap.local, from);
    const baseText = serialize(from);
    const pending = serialize(editor ? local : pendingDoc(from, local));
    if (pending === baseText) return { kind: 'clean', changed: false, added: [] };
    const { doc: appl, held } = editor ? { doc: local, held: [] } : applicableDoc(from, local);
    const heldMessage = held[0] ? `Not applied: ${heldText(held[0])}` : 'Not applied.';
    if (serialize(appl) === baseText) return { kind: 'held', message: heldMessage };
    const got: { onto?: ProfileDoc; applied?: ProfileDoc } = {};
    let res: CommitResult;
    try {
      res = await host.commit(
        (stored) => {
          got.onto = alignDoc(from, parseProfile(stored));
          got.applied = rebaseDoc(from, appl, got.onto);
          return serialize(got.applied);
        },
        { quiet: why !== 'modal' },
      );
    } catch (e) {
      res = { ok: false, reason: errText(e), stage: 'save' };
    }
    if (!mounted.current) return { kind: 'gone' };
    if (!res.ok) {
      // The outside changes read meanwhile still show; the edits stay unapplied.
      if (got.onto) {
        putBase(got.onto);
        relayLocal(from, got.onto, local);
      }
      return res.stage === 'apply'
        ? { kind: 'held', message: `Not applied: ${res.reason}` }
        : { kind: 'failed', message: res.reason, save: true };
    }
    putBase(got.applied!);
    relayLocal(from, got.applied!, local);
    if (res.changed) savedAny.current = true;
    if (held.length) return { kind: 'held', message: heldMessage };
    return { kind: 'clean', changed: res.changed, added: res.added };
  };

  /**
   * Applies the edits as they are now (queued behind a running apply) and
   * reports it in the footer. The snapshot is taken here, at the commit
   * point, so a key typed while an apply runs is not applied with it.
   */
  const commit = (why: CommitWhy): Promise<Outcome> => {
    const snap = snapshot();
    const text = snapText(snap);
    return enqueue(async () => {
      // An automatic apply does not try (and flash) again what it held back last time.
      if (why === 'auto' && lastHeld.current !== null && lastHeld.current === text) return { kind: 'held', message: '' };
      const out = await runCommit(why, snap);
      if (out.kind === 'gone' || !mounted.current) return out;
      lastHeld.current = out.kind === 'held' ? text : null;
      if (out.kind === 'clean') setSaveFailed(false);
      if (why === 'auto' || why === 'save') report(out, why);
      return out;
    });
  };

  const snapText = (snap: Snapshot): string => serialize(snap.editor ? snap.local : pendingDoc(snap.from, snap.local));

  const report = (out: Outcome, why: CommitWhy): void => {
    const word = host.isLive() ? 'Applied' : 'Saved';
    if (out.kind === 'clean') {
      if (!out.changed) {
        if (why === 'save') showFlash(host.isLive() ? 'Nothing to apply.' : 'Nothing to save.');
      } else if (out.added.length) {
        const n = out.added.length;
        showFlash(`${word} · ${n === 1 ? 'a new warning' : `${n} new warnings`}: ${out.added[0]}`, 'warn', FAIL_MS);
      } else if (why === 'save' || !flashRef.current) showFlash(word);
    } else if (out.kind === 'held' || out.kind === 'failed') showFlash(out.message, 'fail', FAIL_MS);
  };

  /** Follows a save from outside (typed settings, script variables): read, lay the edits over it. */
  const refresh = (): void => {
    if (refreshQueued.current) return;
    refreshQueued.current = true;
    void enqueue(async () => {
      refreshQueued.current = false;
      if (!mounted.current) return;
      let stored: string;
      try {
        stored = await host.load();
      } catch {
        return;
      }
      const from = baseRef.current;
      if (!mounted.current || stored === serialize(from)) return;
      // A buffer with open braces cannot be lined up; the next apply rebases it.
      if (modeRef.current === 'editor' && !checkBraces(bufferNow()).ok) return;
      const onto = alignDoc(from, parseProfile(stored));
      putBase(onto);
      relayLocal(from, onto);
      lastHeld.current = null;
    });
  };
  useEffect(() => host.subscribe?.((text) => text !== serialize(baseRef.current) && refresh()), []);

  // LITE's commit points (see the header). A request applies after the render
  // that holds the edit; the transitions below are seen after theirs.
  const [commitReq, setCommitReq] = useState(0);
  const requestCommit = (): void => {
    if (mounted.current) setCommitReq((n) => n + 1);
  };
  // Layout effects: they run before the next key, so the snapshot is the commit point's.
  useLayoutEffect(() => {
    if (commitReq > 0) void commit('auto');
  }, [commitReq]);
  const spot = useRef({ zone, field, id: cur?.id, kind, mode });
  useLayoutEffect(() => {
    const p = spot.current;
    const id = cur?.id;
    spot.current = { zone, field, id, kind, mode };
    if (mode !== 'lite' || p.mode !== 'lite') return;
    const leftField = p.zone === 'detail' && (zone !== 'detail' || field !== p.field || id !== p.id);
    if (!leftField && id === p.id && kind === p.kind) return;
    // A new entry waits for its Commands: Pattern → its still empty Commands box.
    const fresh = !!cur && !baseRef.current.nodes.some((n) => n.id === cur.id);
    if (p.field === 'pattern' && zone === 'detail' && field === 'body' && id === p.id && fresh && cur!.body.trim() === '') return;
    void commit('auto');
  }, [mode, zone, field, kind, cur?.id]);

  // A window's close request waits for the prompt; the Exit popup warns (ADR 0103).
  useUnsaved(unapplied, modal !== null);

  /** Leaves the editor; the flash tells what this visit stored. */
  const leave = (out?: Outcome): void => {
    closing.current = true;
    nav.pop();
    if (!savedAny.current) return;
    if (!host.isLive()) return nav.flash(`Saved ${host.name}.`);
    const added = out?.kind === 'clean' ? out.added : [];
    nav.flash(added.length ? `Profile updated. ${added.length} new warning(s): ${added[0]}` : 'Profile updated.');
  };

  const discard = (): void => {
    closing.current = true;
    nav.pop();
  };

  /** Lets a running apply finish (and its render land) before ESC decides. */
  const settle = async (): Promise<boolean> => {
    if (inflight.current === 0) return true;
    setModal('applying');
    await chain.current;
    await new Promise((r) => setTimeout(r, 0));
    if (!mounted.current) return false;
    setModal(null);
    return true;
  };

  const close = async (): Promise<void> => {
    if (!(await settle())) return;
    if (!unapplied()) return leave();
    if (saveFailed) {
      discard();
      nav.flash(`Changes to ${host.name} were not saved.`, 'fail');
      return;
    }
    if (host.isLive()) {
      // Nothing left that could be applied: say why instead of offering Y.
      const b = baseRef.current;
      const r = mode === 'lite' ? applicableDoc(b, doc) : null;
      if (r && r.held[0] && serialize(r.doc) === serialize(b)) {
        setHeldMsg(`Not applied: ${heldText(r.held[0])}`);
        return setModal('held');
      }
      return setModal('confirm');
    }
    // Not live: ESC saves, as before (ADR 0015 P3); only what cannot be saved asks.
    setModal('saving');
    const out = await commit('close');
    if (out.kind === 'gone') return;
    if (out.kind === 'clean') return leave(out);
    setModal(null);
    if (out.kind === 'failed') {
      setSaveFailed(true);
      showFlash(`${out.message} · ESC again leaves without saving`, 'fail', 8000);
      return;
    }
    setHeldMsg(out.message);
    setModal('held');
  };

  const applyNow = async (): Promise<void> => {
    setModal('applying');
    // Let "Applying…" paint before a synchronous apply runs.
    await new Promise((r) => setTimeout(r, 0));
    const out = await commit('modal');
    if (out.kind === 'gone') return;
    if (out.kind === 'clean') return leave(out);
    setHeldMsg(out.message);
    setModal('held');
  };

  // ---------------------------------------------------------------- keys

  const cycle = (dir: 1 | -1): void => {
    let order: { z: Zone; f?: Field }[];
    if (help) order = hf.menu ? [{ z: 'toggle' }, { z: 'menu' }, { z: 'help' }] : [{ z: 'toggle' }, { z: 'help' }];
    else if (mode === 'editor') order = [{ z: 'toggle' }, { z: 'buffer' }];
    else {
      order = [{ z: 'toggle' }, { z: 'kind' }, { z: 'list' }];
      if (cur) for (const f of fields) order.push({ z: 'detail', f });
    }
    const i = order.findIndex((o) => o.z === zone && (o.z !== 'detail' || o.f === fields[fieldIdx]));
    const next = order[(((i < 0 ? 0 : i) + dir) % order.length + order.length) % order.length]!;
    focusZone(next.z, next.f);
  };

  const onCaptureKey = (e: KeyboardEvent): boolean => {
    if (!capture) return false;
    if (e.key === 'Escape' && plain(e) && !e.shiftKey) {
      if (capture.auto) {
        setDoc((d) => removeEntry(d, capture.id));
        setPinned((p) => p.filter((id) => id !== capture.id));
        setCursorIds((m) => ({ ...m, [kind]: SENTINEL }));
        focusZone('list');
      } else focusZone('detail', 'key');
      setCapture(null);
      return true;
    }
    if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'OS'].includes(e.key)) return true;
    learnKeyLabel(e);
    if (e.getModifierState?.('AltGraph')) {
      setCapture({ ...capture, error: 'AltGr keys type text.' });
      return true;
    }
    const b = bindability(e);
    if (!b.ok) {
      setCapture({ ...capture, error: b.reason });
      return true;
    }
    setDoc((d) => editEntry(d, capture.id, { pattern: b.name }));
    setCapture(null);
    requestCommit();
    showFlash(`Bound to ${displayKey(b.name)}.`, 'ok', BOUND_MS);
    focusZone('detail', capture.auto ? 'body' : 'key');
    return true;
  };

  useKeys((e, nk) => {
    if (modal === 'applying' || modal === 'saving') return true;
    if (modal === 'confirm' || modal === 'held') {
      const k = e.key.toLowerCase();
      if (modal === 'confirm' && plain(e) && k === 'y') void applyNow();
      else if (plain(e) && k === 'n') discard();
      else if (nk === 'back') setModal(null);
      return true;
    }
    if (capture) return onCaptureKey(e);
    // Ctrl+S applies now, in every view (ADR 0105); never the browser's Save dialog.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
      void commit('save');
      return true;
    }
    // Find in HELP: Ctrl+F, the panel's keys; ESC closes it first.
    const inManual = help ? (manualCtl.current?.findKey(e) ?? null) : null;
    if (inManual !== null) {
      if (inManual && zone !== 'help' && zone !== 'menu') focusZone('help');
      return inManual;
    }
    // Ctrl+F / Ctrl+H in LITE: nothing, not the browser's find or history (ADR 0119).
    if (mode === 'lite' && !help && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'f' || k === 'h') return true;
    }
    // Find and replace in EDITOR: Ctrl+F, the panel's keys; ESC closes it first.
    const buf = mode === 'editor' && !help ? viewRef.current : null;
    const found = buf ? searchFrameKey(buf, e) : null;
    if (found !== null) {
      if (found && zone !== 'buffer') focusZone('buffer');
      return found;
    }
    if (nk === 'back') {
      void close();
      return true;
    }
    if (nk === 'tab' || nk === 'backtab') {
      cycle(nk === 'tab' ? 1 : -1);
      return true;
    }
    switch (zone) {
      case 'toggle':
        if (nk === 'left') select(stepView(view, -1));
        else if (nk === 'right') select(stepView(view, 1));
        else if (help) {
          if (nk === 'activate' || nk === 'down') focusZone('help');
          else return helpKey(e, nk, 'outside');
        } else if (nk === 'activate' || nk === 'down') {
          // ↓ / Enter enter the buffer at offset 0 (Inv §5.8); Tab keeps the cursor.
          if (mode === 'editor') viewRef.current?.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
          focusZone(mode === 'lite' ? 'kind' : 'buffer');
        }
        else return false;
        return true;
      case 'menu':
      case 'help':
        return helpKey(e, nk, zone);
      case 'buffer': {
        const v = viewRef.current;
        if (!v) return false;
        if (nk === 'up' && onFirstLine(v)) {
          focusZone('toggle');
          return true;
        }
        return handleKey(v, e);
      }
      case 'kind': {
        const k = KINDS.indexOf(kind);
        // n: a new entry of this kind, as in the list (Del stays the list's).
        if (plain(e) && e.key === 'n') newEntry();
        else if (nk === 'left' || nk === 'right') {
          const next = KINDS[Math.max(0, Math.min(KINDS.length - 1, k + (nk === 'left' ? -1 : 1)))]!;
          if (next !== kind) selectKind(next);
        } else if (nk === 'up') focusZone('toggle');
        else if (nk === 'down' || nk === 'activate') {
          setCursorIds((m) => ({ ...m, [kind]: list[0]?.id ?? SENTINEL }));
          focusZone('list');
        } else return false;
        return true;
      }
      case 'list':
        return listKey(e, nk);
      case 'detail':
        return detailKey(e, nk);
    }
    return false;
  });

  /** Keys of the manual (manual-view.tsx); ↑ out of it goes to the toggle. */
  const helpKey = (e: KeyboardEvent, nk: string | null, z: 'menu' | 'help' | 'outside'): boolean => {
    const r = manualCtl.current?.key(e, nk, z) ?? false;
    if (r === 'up-out') {
      focusZone('toggle');
      return true;
    }
    return r;
  };

  const selectKind = (k: LiteKind): void => {
    setKind(k);
    setField(FIELDS[k][0]!);
    setBodyDraft(null);
  };

  const listKey = (e: KeyboardEvent, nk: string | null): boolean => {
    if (plain(e) && e.key === 'n') {
      newEntry();
      return true;
    }
    if (plain(e) && e.key === 'Delete') {
      deleteEntry();
      return true;
    }
    switch (nk) {
      case 'up':
        if (idx === 0) focusZone('kind');
        else moveTo(idx - 1);
        return true;
      case 'down':
        moveTo(idx + 1);
        return true;
      case 'pgup':
        moveTo(idx - listVisible);
        return true;
      case 'pgdn':
        moveTo(idx + listVisible);
        return true;
      case 'home':
        moveTo(0);
        return true;
      case 'end':
        moveTo(list.length);
        return true;
      case 'activate':
      case 'right':
        if (!cur) {
          if (nk === 'activate') newEntry();
        } else {
          setBodyDraft(null);
          focusZone('detail', fields[0]);
        }
        return true;
    }
    return false;
  };

  const caretAtStart = (el: HTMLInputElement | HTMLTextAreaElement | null): boolean =>
    !!el && el.selectionStart === 0 && el.selectionEnd === 0;

  const toPatternEnd = (): void => {
    focusZone('detail', 'pattern');
    requestAnimationFrame(() => {
      const el = patternRef.current;
      if (el) el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const leavePattern = (): void => {
    if (cur) setVisited((s) => (s.has(cur.id) ? s : new Set(s).add(cur.id)));
  };

  const detailKey = (e: KeyboardEvent, nk: string | null): boolean => {
    if (!cur) {
      focusZone('list');
      return true;
    }
    switch (field) {
      case 'pattern':
        if (nk === 'up') {
          leavePattern();
          focusZone('kind');
        } else if (nk === 'down' || (nk === 'activate' && e.key === 'Enter')) {
          leavePattern();
          focusZone('detail', fields[1]);
        } else if (nk === 'left' && caretAtStart(patternRef.current)) {
          leavePattern();
          focusZone('list');
        } else return false;
        return true;
      case 'body':
        if (nk === 'left' && caretAtStart(bodyRef.current)) {
          if (kind === 'macro') focusZone('detail', 'key');
          else toPatternEnd();
          return true;
        }
        return false;
      case 'key':
        if (nk === 'activate') startCapture(cur.id);
        else if (nk === 'left') focusZone('list');
        else if (nk === 'up') focusZone('kind');
        else if (nk === 'down') focusZone('detail', 'body');
        else return false;
        return true;
      case 'style':
        if (nk === 'left') {
          if (styleCur === 0) toPatternEnd();
          else setStyleCur(styleCur - 1);
        } else if (nk === 'right') setStyleCur(Math.min(HL_STYLES.length - 1, styleCur + 1));
        else if (nk === 'up') toPatternEnd();
        else if (nk === 'down') focusZone('detail', 'text');
        else if (nk === 'activate') toggleStyle(styleCur);
        else return false;
        return true;
      case 'text':
      case 'bg': {
        const p = field === 'text' ? textCur : bgCur;
        const set = field === 'text' ? setTextCur : setBgCur;
        if (nk === 'left') {
          if (p.c > 0) set({ ...p, c: 0 });
          else if (field === 'text') {
            setStyleCur(HL_STYLES.length - 1);
            focusZone('detail', 'style');
          } else {
            setTextCur({ r: p.r, c: 1 });
            focusZone('detail', 'text');
          }
        } else if (nk === 'right') {
          if (p.c < 1) set({ ...p, c: 1 });
          else if (field === 'text') {
            setBgCur({ r: p.r, c: 0 });
            focusZone('detail', 'bg');
          }
        } else if (nk === 'up') {
          if (p.r > 0) set({ ...p, r: p.r - 1 });
          else focusZone('detail', 'style');
        } else if (nk === 'down') set({ ...p, r: Math.min(HL_COLORS.length - 1, p.r + 1) });
        else if (nk === 'activate') togglePick(field === 'text' ? 'fg' : 'bg', p);
        else return false;
        return true;
      }
    }
    return false;
  };

  // --------------------------------------------------------------- render

  const title = titleText(host.name, Math.max(10, W - TOGGLE_W - 1));
  const titleAt = Math.min(centreLeft(cols, cps(title)), at + W - TOGGLE_W - 1 - cps(title));
  const toggleFocused = zone === 'toggle' && !capture && !modal;

  const titleRow = (
    <div class="wc-line wc-ped-title">
      <span style={indent(Math.max(0, titleAt))} class="wc-c-section">
        {title}
      </span>
      <span style={indent(Math.max(1, at + W - TOGGLE_W - Math.max(0, titleAt) - cps(title)))} />
      <span class="wc-ped-toggle">
        {VIEWS.map((v, i) => (
          <>
            {i > 0 && ' '}
            <Button
              label={v.label}
              width={v.width}
              selected={view === v.view}
              focused={toggleFocused}
              onClick={() => {
                select(v.view);
                focusZone('toggle');
              }}
            />
          </>
        ))}
      </span>
    </div>
  );

  // Ctrl+S in the EDITOR footer: Apply while live, else Save (the start page).
  const saveHint = host.isLive() ? 'Ctrl+S Apply' : 'Ctrl+S Save';
  // Touch (ADR 0075 §3.2): the key-only hint is tappable.
  const saveTap = device().touch ? { [saveHint]: () => void commit('save') } : undefined;
  const modified = mode === 'editor' ? bufferNow() !== serialize(base) : false;
  const helpHints = zone === 'menu' ? HELP_MENU_HINTS : zone === 'help' && hf.menu ? HELP_BODY_HINTS : HELP_HINTS;
  let footer: VNode;
  // Phone (ADR 0075 §3.2): when the hints and the cursor position do not
  // share the footer row, the position moves to the blank row above it.
  let above: VNode = <div class="wc-line" />;
  if (mode === 'editor' && !help) {
    const right = `Ln ${status.line}, Col ${status.col}`;
    const bal = flash ? '' : balanceText(status);
    // "Modified" while the buffer differs from what is applied (ADR 0105), as the script editor.
    const mod = modified ? 'Modified' : '';
    const rightFull = [mod, bal, right].filter((x) => x).join('  ·  ');
    const rightParts = (
      <>
        {mod && <span class="wc-ped-note wc-ped-modified">{mod}</span>}
        {mod && <span class="wc-c-hint">{'  ·  '}</span>}
        {bal && <span class="wc-c-danger">{bal}</span>}
        {bal && <span class="wc-c-hint">{'  ·  '}</span>}
        <span class="wc-c-hint">{right}</span>
      </>
    );
    const longHints = `${saveHint} · Ctrl+F Find · Tab Cycle · ESC Back`;
    const hints = device().phone && cps(longHints) > cols - at ? `${saveHint} · ESC Back` : longHints;
    const centre = flash ? flash.text : (status.hint ?? hints);
    const centreCls = flash ? FLASH_CLASS[flash.kind] : status.hint ? 'wc-ped-note' : 'wc-c-hint';
    const split = device().phone && cps(centre) + 2 + cps(rightFull) > W;
    if (split) {
      above = (
        <div class="wc-line wc-ped-pos" style={indent(Math.max(0, at + W - cps(rightFull)))}>
          {rightParts}
        </div>
      );
    }
    const rightAt = split ? cols + 2 : at + W - cps(rightFull);
    const room = Math.max(0, rightAt - at - 2);
    const c = ellipsis(centre, room);
    const cAt = Math.max(at, Math.min(centreLeft(cols, cps(c)), rightAt - 2 - cps(c)));
    footer = (
      <div class="wc-line wc-footer wc-ped-footer">
        <span style={indent(cAt)} class={centreCls} role={flash ? 'status' : undefined}>
          {flash ? c : escHints(c, saveTap)}
        </span>
        {!split && (
          <>
            <span style={indent(Math.max(2, rightAt - cAt - cps(c)))} />
            {rightParts}
          </>
        )}
      </div>
    );
  } else {
    const text = flash
      ? flash.text
      : help
        ? fitHint(helpHints, cols)
        : fitHint(zone === 'list' ? LIST_HINTS : zone === 'kind' ? KIND_HINTS : LITE_HINTS, cols);
    const t = ellipsis(text, cols);
    footer = (
      <div
        class={'wc-line wc-footer wc-ped-footer ' + (flash ? FLASH_CLASS[flash.kind] : 'wc-c-hint')}
        style={indent(centreLeft(cols, cps(t)))}
        role={flash ? 'status' : undefined}
      >
        {flash ? t : escHints(t)}
      </div>
    );
  }

  return (
    <div
      class="wc-page wc-ped"
      ref={rootRef}
      tabIndex={-1}
      data-mode={mode}
      data-view={view}
      data-zone={zone}
      data-unapplied={modified ? 'true' : 'false'}
      onFocusOut={(e) => {
        // Leaving the editor (a click in the game, another window) is a commit point in LITE.
        const to = e.relatedTarget as Node | null;
        if (mode === 'lite' && !closing.current && !(to && rootRef.current?.contains(to))) requestCommit();
      }}
    >
      <div class="wc-line" style={{ height: `calc(var(--cell-h) * ${gap})` }} />
      {titleRow}
      <div class="wc-line" />
      {mode === 'lite' ? (help ? null : renderLite()) : renderEditor()}
      {help && renderHelp()}
      <div class="wc-ped-spacer" />
      {above}
      {footer}
      {capture && renderCapture()}
      {modal && renderModal()}
    </div>
  );

  // ---------------------------------------------------------------- lite

  function renderLite(): VNode {
    const kindFocused = zone === 'kind' && !capture;
    return (
      <>
        <div class="wc-ped-kinds" style={indent(kindAt)}>
          {KINDS.map((k, i) => {
            const sel = k === kind;
            const cls = 'wc-ped-kind' + (sel ? (kindFocused ? ' is-sel-focus' : ' is-sel') : '');
            const label = ellipsis(KIND_TITLES[k], kindW);
            const l = Math.floor((kindW - cps(label)) / 2);
            return (
              <>
                {i > 0 && <span class="wc-ped-kind-gap" style={{ width: `calc(var(--cell-w) * ${kindGap})` }} />}
                <span
                  class={cls}
                  data-kind={k}
                  style={{ width: `calc(var(--cell-w) * ${kindW})` }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (k !== kind) selectKind(k);
                    focusZone('kind');
                  }}
                >
                  <span class="wc-line">{' '}</span>
                  <span class="wc-line">{' '.repeat(l) + label}</span>
                  <span class="wc-line">{' '}</span>
                </span>
              </>
            );
          })}
        </div>
        <div class="wc-line" />
        <div class="wc-ped-body" style={{ ...indent(at), height: `calc(var(--cell-h) * ${bodyH})` }}>
          {renderList()}
          <div style={{ width: `calc(var(--cell-w) * ${LIST_GAP})`, flex: '0 0 auto' }} />
          {renderDetail()}
        </div>
      </>
    );
  }

  function renderList(): VNode {
    const labels = FIELD_LABELS[kind];
    const patW = patternColumn(L);
    const header = pad(labels.pattern, patW) + ' ' + labels.body;
    const listFocused = zone === 'list' && !capture;
    const bodyW = L - patW - 1;
    // All rows in a native scroll box (pixels, as EDITOR); the TUI scrollbar beside it.
    return (
      <div class="wc-ped-list" style={{ width: `calc(var(--cell-w) * ${L + 1})` }}>
        <div class="wc-line wc-c-hint">{ellipsis(header, L)}</div>
        <div class="wc-scrollrow" style={{ height: `calc(var(--cell-h) * ${listVisible})` }}>
          <div class="wc-scrollbox wc-ped-list-rows" key={kind} ref={listBox.ref} style={{ width: `calc(var(--cell-w) * ${L})` }}>
            {Array.from({ length: Math.max(listVisible, count) }, (_, i) => {
              const isCur = i === idx;
              const band = isCur ? (listFocused ? ' is-cur-focus' : ' is-cur') : '';
              if (i > list.length) return <div class="wc-line" key={i} />;
              const onClick = (): void => {
                moveTo(i);
                if (i === list.length) newEntry();
                else focusZone('list');
              };
              if (i === list.length) {
                return (
                  <div class="wc-line" key={i}>
                    <span class={'wc-tr wc-ped-new' + band} data-row="new" onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
                      {pad('+ New entry', L)}
                    </span>
                  </div>
                );
              }
              const e = list[i]!;
              const t = rowText(e, L);
              const hl = kind === 'highlight' && !isCur ? highlightStyle(e.body) : null;
              return (
                <div class="wc-line" key={i}>
                  <span class={'wc-tr' + band} data-row={i} data-id={e.id} onMouseDown={(ev) => ev.preventDefault()} onClick={onClick}>
                    {t.pattern + ' '}
                    {hl ? (
                      <>
                        <span style={hl}>{t.body}</span>
                        {' '.repeat(Math.max(0, bodyW - cps(t.body)))}
                      </>
                    ) : (
                      pad(t.body, bodyW)
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          {count > listVisible && <TuiScrollbar target={listBox.ref} rows={listVisible} />}
        </div>
      </div>
    );
  }

  function boxTop(w: number, focused: boolean): VNode {
    return <div class={'wc-line wc-ped-border' + (focused ? ' is-focus' : '')}>{'┌' + '─'.repeat(w - 2) + '┐'}</div>;
  }
  function boxBottom(w: number, focused: boolean): VNode {
    return <div class={'wc-line wc-ped-border' + (focused ? ' is-focus' : '')}>{'└' + '─'.repeat(w - 2) + '┘'}</div>;
  }

  function renderDetail(): VNode {
    const style: JSX.CSSProperties = { width: `calc(var(--cell-w) * ${D})` };
    if (!cur) {
      const lines = wrapText(sentinelPrompt(kind, list.length), D);
      const topPad = Math.max(0, Math.floor((bodyH - lines.length) / 2) - 1);
      return (
        <div class="wc-ped-detail" style={style}>
          {Array.from({ length: topPad }, () => (
            <div class="wc-line" />
          ))}
          {lines.map((l) => (
            <div class="wc-line wc-c-hint wc-ped-prompt" style={indent(centreLeft(D, cps(l)))}>
              {l}
            </div>
          ))}
        </div>
      );
    }
    const labels = FIELD_LABELS[cur.kind];
    const focused = (f: Field): boolean => zone === 'detail' && field === f && !capture && !modal;
    const inner = D - 4;
    const msg = validateEntry(
      { kind: cur.kind, pattern: cur.pattern, body: cur.body },
      { patternVisited: !pinned.includes(cur.id) || visited.has(cur.id) },
    );
    const warn = entryWarning(cur);
    let used = 0;
    const rowsOut: VNode[] = [];
    const push = (v: VNode, n = 1): void => {
      rowsOut.push(v);
      used += n;
    };

    if (cur.kind === 'macro') {
      const kc = keyCell(cur.pattern);
      const f = focused('key');
      push(<div class="wc-line wc-c-hint">{labels.pattern}</div>);
      push(
        <div class="wc-line">
          <span
            class={'wc-ped-keycell' + (kc.hint ? ' is-hint' : '') + (f ? ' is-focus' : '')}
            data-field="key"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              focusZone('detail', 'key');
              startCapture(cur.id);
            }}
          >
            <span class="wc-ped-br">{'['}</span>
            {kc.text.slice(1, -1)}
            <span class="wc-ped-br">{']'}</span>
          </span>
        </div>,
      );
      push(<div class="wc-line" />);
    } else {
      const f = focused('pattern');
      push(<div class="wc-line wc-c-hint">{labels.pattern}</div>);
      push(boxTop(D, f));
      push(
        <div class={'wc-line wc-ped-border' + (f ? ' is-focus' : '')}>
          {'│ '}
          <input
            ref={patternRef}
            class="wc-field wc-ped-input"
            style={{ width: `calc(var(--cell-w) * ${inner})` }}
            value={cur.pattern}
            aria-label={labels.pattern}
            spellcheck={false}
            autocomplete="off"
            data-field="pattern"
            onFocus={() => focusZone('detail', 'pattern')}
            onBlur={leavePattern}
            onInput={(e) => setPattern((e.currentTarget as HTMLInputElement).value.replace(/[\r\n]+/g, ' '))}
          />
          {' │'}
        </div>,
      );
      push(boxBottom(D, f));
    }

    if (cur.kind === 'highlight') {
      push(<div class="wc-line" />);
      push(renderStyles());
      push(<div class="wc-line" />);
      for (const r of renderSwatches()) push(r);
    } else {
      const f = focused('body');
      // The box takes the height that is left: its label, its borders and the note rows aside.
      const n = Math.max(1, bodyH - used - 1 - 2 - NOTE_ROWS);
      const total = visualRows(bodyText, inner);
      const bar = scrollbar(total, n, bodyTop);
      push(<div class="wc-line wc-c-hint">{labels.body}</div>);
      push(boxTop(D, f));
      push(
        <div class={'wc-ped-textbox wc-ped-border' + (f ? ' is-focus' : '')} style={{ height: `calc(var(--cell-h) * ${n})` }}>
          <span class="wc-ped-col">{'│\n'.repeat(n)}</span>
          <span class="wc-ped-col">{' \n'.repeat(n)}</span>
          <textarea
            ref={bodyRef}
            class="wc-field wc-ped-textarea"
            style={{ width: `calc(var(--cell-w) * ${inner})`, height: `calc(var(--cell-h) * ${n})` }}
            value={bodyText}
            aria-label={labels.body}
            spellcheck={false}
            autocomplete="off"
            data-field="body"
            onFocus={() => focusZone('detail', 'body')}
            onScroll={(e) => setBodyTop(Math.round((e.currentTarget as HTMLTextAreaElement).scrollTop / cellH.current))}
            onInput={(e) => setBody((e.currentTarget as HTMLTextAreaElement).value)}
          />
          <span class="wc-ped-col wc-ped-vbar">
            {Array.from({ length: n }, (_, i) =>
              bar.length ? (
                <span
                  class={bar[i] ? 'wc-scroll-thumb' : 'wc-scroll-track'}
                  {...barPress(() => ({ el: bodyRef.current, bar, i, rowPx: cellH.current, cellPx: cellH.current }))}
                >
                  {(bar[i] ? '█' : '░') + '\n'}
                </span>
              ) : (
                ' \n'
              ),
            )}
          </span>
          <span class="wc-ped-col">{'│\n'.repeat(n)}</span>
        </div>,
        n,
      );
      push(boxBottom(D, f));
    }

    // The note rows: the validation message (red), then the entry warning (yellow), wrapped.
    const notes: VNode[] = [];
    if (msg) notes.push(<div class="wc-line wc-c-danger wc-ped-msg">{ellipsis(msg, D)}</div>);
    if (warn) {
      const lines = wrapText(warn, D);
      const room = Math.max(1, NOTE_ROWS - notes.length);
      const shown = lines.length > room ? [...lines.slice(0, room - 1), lines.slice(room - 1).join(' ')] : lines;
      for (const l of shown) notes.push(<div class="wc-line wc-c-yellow wc-ped-warn">{ellipsis(l, D)}</div>);
    }
    for (const v of notes.slice(0, Math.max(0, bodyH - used))) push(v);
    return (
      <div class="wc-ped-detail" style={style} data-kind={cur.kind}>
        {rowsOut}
      </div>
    );
  }

  function renderStyles(): VNode {
    const s = parseHighlight(cur!.body);
    const f = zone === 'detail' && field === 'style' && !capture;
    return (
      <div class="wc-line wc-ped-styles">
        {HL_STYLES.map((st, i) => {
          const on = !!s?.styles.includes(st);
          return (
            <>
              {' '}
              <span
                class={'wc-ped-sw' + (f && i === styleCur ? ' is-cursor' : '') + (on ? ' is-on' : '')}
                data-style={st}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setStyleCur(i);
                  focusZone('detail', 'style');
                  toggleStyle(i);
                }}
              >
                <span class="wc-ped-br">[</span>
                {on ? 'X' : ' '}
                <span class="wc-ped-br">]</span>
                {HL_STYLE_LABELS[st]}
              </span>
            </>
          );
        })}
      </div>
    );
  }

  function renderSwatches(): VNode[] {
    const s = parseHighlight(cur!.body);
    const fT = zone === 'detail' && field === 'text' && !capture;
    const fB = zone === 'detail' && field === 'bg' && !capture;
    const cell = (dim: 'fg' | 'bg', r: number, c: number): VNode => {
      const pick = s?.[dim];
      const on = !!pick && pick.row === r && pick.bright === c;
      const p = dim === 'fg' ? textCur : bgCur;
      const isCursor = (dim === 'fg' ? fT : fB) && p.r === r && p.c === c;
      return (
        <span
          class={'wc-ped-sw' + (isCursor ? ' is-cursor' : '') + (on ? ' is-on' : '')}
          data-swatch={`${dim}-${r}-${c}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const pos = { r, c };
            if (dim === 'fg') setTextCur(pos);
            else setBgCur(pos);
            focusZone('detail', dim === 'fg' ? 'text' : 'bg');
            togglePick(dim, pos);
          }}
        >
          <span class="wc-ped-br">[</span>
          {on ? 'X' : ' '}
          <span class="wc-ped-br">]</span>
          <span style={{ color: `var(--ansi-${ansiIndex({ row: r, bright: c ? 1 : 0 })})` }}>██</span>
        </span>
      );
    };
    const head = (
      <div class="wc-line wc-c-hint">
        {'  ── Text ──'}
        {'          '}
        {'── BG ──'}
      </div>
    );
    return [
      head,
      ...HL_COLORS.map((_, r) => (
        <div class="wc-line">
          {' '}
          {cell('fg', r, 0)}
          {'  '}
          {cell('fg', r, 1)}
          {'       '}
          {cell('bg', r, 0)}
          {'  '}
          {cell('bg', r, 1)}
        </div>
      )),
    ];
  }

  // -------------------------------------------------------------- editor

  function renderEditor(): VNode {
    const cellHpx = cellH.current;
    const total = Math.max(1, Math.round(scroll.height / cellHpx));
    const visible = Math.max(1, Math.round(scroll.client / cellHpx));
    const topRow = Math.round(scroll.top / cellHpx);
    const bar = scrollbar(total, Math.min(visible, bufferH), topRow);
    return (
      <div
        class="wc-ped-bufwrap"
        style={{ height: `calc(var(--cell-h) * ${bufferH})`, ...(help ? { display: 'none' } : {}) }}
      >
        <div class="wc-ped-buffer" ref={bufRef} style={{ width: `calc(var(--cell-w) * ${cols - 1})` }} />
        <div class="wc-ped-bufbar">
          {Array.from({ length: bufferH }, (_, i) =>
            bar.length && i < bar.length ? (
              <div
                class={'wc-line ' + (bar[i] ? 'wc-scroll-thumb' : 'wc-scroll-track')}
                {...barPress(() => {
                  const v = viewRef.current;
                  return { el: v?.scrollDOM, bar, i, rowPx: cellHpx, page: (dir) => v && pageScroll(v, dir) };
                })}
              >
                {bar[i] ? '█' : '░'}
              </div>
            ) : (
              <div class="wc-line" />
            ),
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- help

  function renderHelp(): VNode {
    const focus = modal ? null : zone === 'menu' ? 'menu' : zone === 'help' ? 'help' : null;
    return (
      <ManualView
        layout={manual}
        menu={hf.menu ? menu : null}
        menuW={menuW}
        width={hf.width}
        height={bufferH}
        focus={focus}
        onZone={(z) => focusZone(z)}
        ctl={manualCtl}
        initial={helpSection}
        onSection={setHelpSection}
        findMemory={helpFind}
      />
    );
  }

  // ------------------------------------------------------------ overlays

  function overlayBox(lines: { text: string; cls: string }[], width: number): VNode {
    // Touch (ADR 0075 §3.2): the confirm's Y and N are tappable.
    const modalTaps =
      device().touch && (modal === 'confirm' || modal === 'held')
        ? {
            ...(modal === 'confirm' ? { 'Y to apply': () => void applyNow(), 'Y Apply': () => void applyNow() } : {}),
            'N to discard': discard,
            'N Discard': discard,
          }
        : undefined;
    const w = Math.min(cols - 2, width);
    const h = lines.length + 2;
    const left = centreLeft(cols, w);
    const topRow = Math.max(0, Math.floor((rows - h) / 2));
    return (
      <div
        class="wc-ped-overlay"
        role="dialog"
        aria-modal="true"
        style={{
          left: `calc(var(--cell-w) * ${left})`,
          top: `calc(var(--cell-h) * ${topRow})`,
          width: `calc(var(--cell-w) * ${w})`,
          height: `calc(var(--cell-h) * ${h})`,
        }}
      >
        <div class="wc-line wc-c-section">{'┌' + '─'.repeat(w - 2) + '┐'}</div>
        {lines.map((l) => (
          <div class="wc-line">
            <span class="wc-c-section">│</span>
            <span class={l.cls} style={indent(centreLeft(w - 2, cps(l.text)))}>
              {l.cls === 'wc-c-hint' ? escHints(ellipsis(l.text, w - 2), modalTaps) : ellipsis(l.text, w - 2)}
            </span>
            <span class="wc-ped-overlay-r wc-c-section">│</span>
          </div>
        ))}
        <div class="wc-line wc-c-section">{'└' + '─'.repeat(w - 2) + '┘'}</div>
      </div>
    );
  }

  function renderCapture(): VNode {
    return overlayBox(
      [
        { text: '─── Bind key ───', cls: 'wc-c-section' },
        { text: '', cls: '' },
        { text: 'Press the key to bind…', cls: 'wc-c-body' },
        { text: '', cls: '' },
        { text: capture!.error, cls: 'wc-c-danger wc-ped-capture-error' },
        { text: '', cls: '' },
        { text: 'ESC Cancel', cls: 'wc-c-hint' },
      ],
      44,
    );
  }

  function renderModal(): VNode {
    if (modal === 'applying') return overlayBox([{ text: '', cls: '' }, { text: 'Applying…', cls: 'wc-c-accent' }, { text: '', cls: '' }], 54);
    if (modal === 'saving') return overlayBox([{ text: '', cls: '' }, { text: 'Saving…', cls: 'wc-c-accent' }, { text: '', cls: '' }], 54);
    if (modal === 'held') {
      const lines = wrapText(heldMsg, Math.min(cols - 2, 60) - 4).slice(0, 3);
      return overlayBox(
        [
          { text: '', cls: '' },
          ...lines.map((l) => ({ text: l, cls: 'wc-c-err wc-ped-held' })),
          { text: '', cls: '' },
          {
            text: device().phone && cps(HELD_HINT) > Math.min(cols - 2, 60) - 2 ? HELD_HINT_SHORT : HELD_HINT,
            cls: 'wc-c-hint',
          },
          { text: '', cls: '' },
        ],
        60,
      );
    }
    return overlayBox(
      [
        { text: '', cls: '' },
        { text: 'Apply changes to your profile?', cls: 'wc-c-active' },
        { text: '', cls: '' },
        {
          text: device().phone && cps(APPLY_HINT) > Math.min(cols - 2, 54) - 2 ? APPLY_HINT_SHORT : APPLY_HINT,
          cls: 'wc-c-hint',
        },
        { text: '', cls: '' },
      ],
      54,
    );
  }
}
