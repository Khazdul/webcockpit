// The profile editor in the new look, direction B "Ryggen" (stage 43a,
// ADR 0128; the profile editor of Inv §5.3–5.9, ADR 0015, 0037, 0070,
// 0104, 0105, 0119). One look frame on the chrome's frame stack, in a
// large box on the start page, the bare body of the Profile window in the
// game and a full-screen Lykta page in the phone's ESC menu (`Box` adapts
// to its place).
//
//   head   the profile's name (start page) or the live line (in the
//          game), the views Lite · Editor · Help
//   rail   the spine: the kinds (Lite), the text's sections (Editor), the
//          manual's headings (Help)
//   main   the entry list (Lite), the CodeMirror buffer (Editor), the
//          manual (Help); Lite's entry detail beside the list (no card)
//   foot   the view's buttons, the flash, the quiet status
//
// The editor lays itself out by its own width (`peLayout`, the same
// thresholds as profile.css's container queries): rail | list | detail
// above 940 px, the rail as a row of tabs above the columns up to 940 px,
// one column at 640 px and less, where the entry opens as a sheet.
//
// The profile text is the source of truth. Lite edits a ProfileDoc
// (src/script/doc), Editor edits text; a flip serialises or parses, so it
// never reorders or drops anything (ADR 0015). Each open starts in Lite.
// Help lies over whichever of the two is open: `mode` stays, the lite
// state is kept and the buffer stays mounted (hidden).
//
// Apply in place (ADR 0105, model.ts): Lite applies where an edit is
// finished (leaving a field, also when the window loses the focus, another
// entry or kind, a new or deleted entry, a captured key, a style or
// colour), never per keystroke; Editor on Ctrl+S and on the flip back to
// Lite; Ctrl+S at once in every view.
//
// Keys (ADR 0128, a rework of ADR 0119 for the rail): the frame stack's
// listener routes every key here (`useKeys`), the inline dialogs' and the
// capture's key layers first. Zones: views, rail, list, detail (Lite),
// buffer (Editor), help (Help). The keyboard's zone is state: only text
// fields and the buffer take the DOM focus, everything else is reached by
// keys and letters (L E H views; in Lite A I G M S kinds, N new, D delete;
// in Help n / p headings), and the stack host keeps the focus otherwise.
// Esc leaves a field or the buffer first (decision 6), closes the sheet,
// the find, and only then leaves the editor (asking first when something
// is not applied).

import type { EditorView } from '@codemirror/view';
import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  Box,
  BoxFoot,
  BoxHead,
  Dialog,
  GlassButton,
  LookFlash,
  useLocalFlash,
  Seg,
  inTextField,
  letterAction,
  lookFrame,
  useBoxSettled,
  useLookPlace,
  useWindowChrome,
} from '../../chrome/kit/look';
import type { NavKey } from '../../chrome/kit/nav';
import { type FlashKind, type Nav, useIsTop, useKeys, useNav, useUnsaved } from '../../chrome/kit/stack';
import { device } from '../../core/device';
import { type EntryNode, addEntry, alignDoc, displayBody, editEntry, listEntries, parseProfile, removeEntry, serialize, storeBody } from '../../script/doc';
import { displayKey } from '../../script/keys';
import { type BufferStatus, bufferText, createBuffer, handleKey, replaceText } from '../cm';
import { helpSections } from '../help';
import type { ManualCtl } from '../look-manual';
import type { FindMemory } from '../look-manual-find';
import { EMPTY_QUERY } from '../manual-search';
import { openSearch, searchFocused, searchFrameKey } from '../search';
import { balanceText } from '../syntax';
import {
  type EditorViewName,
  HL_COLORS,
  HL_STYLES,
  type HighlightSpec,
  type HlPick,
  KINDS,
  KIND_LETTERS,
  type LiteKind,
  NEW_BODY,
  type PeLayout,
  type SaveState,
  VIEW_LABELS,
  keyLabel,
  listRows,
  liveText,
  parseHighlight,
  pendingDoc,
  peLayout,
  serializeHighlight,
  statusText,
  stepView,
} from '../logic';
import { BindDialog, type Capture, captureStep } from './capture';
import type { GridPos, HlDim } from './detail-highlight';
import { HelpRail, HelpView } from './help-view';
import { Detail, type DetailField, EntryList, KindRail, revealRow } from './lite';
import { type CommitWhy, type EditorHost, type Mode, type Outcome, ProfileModel } from './model';
import { TextRail, sectionAt, showLine, useTextSections } from './text-view';
import '../profile.css';

export type { EditorHost } from './model';

/** The keyboard's zone (`data-zone`). */
type Zone = 'views' | 'rail' | 'list' | 'detail' | 'buffer' | 'help';

/** The editor's prompts and waits (inline dialogs, `data-dlg`). */
type Modal = null | 'apply' | 'not-applied' | 'applying' | 'saving';

const FIELDS: Readonly<Record<LiteKind, readonly DetailField[]>> = {
  action: ['pattern', 'body'],
  alias: ['pattern', 'body'],
  substitute: ['pattern', 'body'],
  macro: ['key', 'body'],
  highlight: ['pattern', 'style', 'text', 'bg'],
};

/** How long a flash stays: an apply, a bind, a failure or a held entry. */
const FLASH_MS = 1500;
const BOUND_MS = 2000;
const FAIL_MS = 6000;
/** The cursor on the `+ New` row. */
const SENTINEL = -1;
const PHONE_CAPTURE = 'Key capture: desktop only.';

const plain = (e: KeyboardEvent): boolean => !e.ctrlKey && !e.altKey && !e.metaKey;
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');

/**
 * Brings a field the keyboard moved to into the detail's view (a small
 * window or a sheet scrolls the detail; stage 43b). Only the detail
 * scrolls: the focus itself never scrolls (the box, the window body).
 */
function revealField(el: HTMLElement): void {
  const sc = el.closest<HTMLElement>('.wc-pe-detail');
  if (!sc) return;
  const r = el.getBoundingClientRect();
  const b = sc.getBoundingClientRect();
  if (r.top < b.top) sc.scrollTop -= b.top - r.top;
  else if (r.bottom > b.bottom) sc.scrollTop += Math.min(r.bottom - b.bottom, r.top - b.top);
}

/** Pushes the profile editor for `host` onto the frame stack. */
export function openProfileEditor(nav: Nav, host: EditorHost): void {
  nav.push(<ProfileEditor host={host} />);
}

export const ProfileEditor = lookFrame(function ProfileEditor({ host }: { host: EditorHost }): VNode {
  const nav = useNav();
  const isTop = useIsTop();
  const place = useLookPlace();
  const inGame = place !== 'start';
  // Read so the editor renders again once the box has landed: a field the
  // keyboard went to during the morph (hidden, so unfocusable) gets the focus then.
  useBoxSettled();
  useWindowChrome({ title: 'Profile', note: host.name });
  // The head's line follows the connection (43b's hosts tell; else read at render).
  const [, setLiveTick] = useState(0);
  useEffect(() => host.onLiveChange?.(() => setLiveTick((n) => n + 1)), []);
  const live = host.isLive();

  const [mode, setMode] = useState<Mode>('lite');
  const [help, setHelp] = useState(false);
  // The section Help shows, kept while another view is up.
  const [helpSection, setHelpSection] = useState(0);
  const manualCtl = useRef<ManualCtl | null>(null);
  // The manual's last find query, kept while Help is closed.
  const helpFind = useRef<FindMemory>({ query: EMPTY_QUERY });
  const manual = useMemo(() => helpSections(), []);
  const [zone, setZone] = useState<Zone>('list');
  const [field, setField] = useState<DetailField>('pattern');
  const initial = useMemo(() => parseProfile(host.text), []);
  const [doc, setDoc] = useState(initial);
  const [base, setBase] = useState(initial);
  const [kind, setKind] = useState<LiteKind>('action');
  const [cursorIds, setCursorIds] = useState<Partial<Record<LiteKind, number>>>({});
  const [pinned, setPinned] = useState<number[]>([]);
  const [visited, setVisited] = useState<ReadonlySet<number>>(new Set());
  const [bodyDraft, setBodyDraft] = useState<{ id: number; text: string } | null>(null);
  const [styleCur, setStyleCur] = useState(0);
  const [textCur, setTextCur] = useState<GridPos>({ r: 0, c: 0 });
  const [bgCur, setBgCur] = useState<GridPos>({ r: 0, c: 0 });
  const [capture, setCapture] = useState<Capture | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  // Why the `not-applied` prompt cannot apply.
  const [heldMsg, setHeldMsg] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  // The last automatic apply or Ctrl+S held something back (the status "Not applied").
  const [heldNow, setHeldNow] = useState(false);
  const [status, setStatus] = useState<BufferStatus>({ line: 1, col: 1, unclosed: 0, stray: 0, hint: null });
  const [layout, setLayout] = useState<PeLayout>('wide');
  // One column: the entry is open as a sheet over the list.
  const [sheet, setSheet] = useState(false);
  // The keyboard's entry in Editor's rail.
  const [railCur, setRailCur] = useState(0);
  // The editor's own flash (1.5 s by default; a flip clears it, an apply does not cover one still up).
  const [flashNow, showFlash, flashCtl] = useLocalFlash();
  const flash = { flash: flashNow, show: (text: string, kind?: FlashKind, ms = FLASH_MS) => showFlash(text, kind, ms), ...flashCtl };

  const rootRef = useRef<HTMLDivElement>(null);
  const patternRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const bufRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const bufferInit = useRef('');
  const docRef = useRef(doc);
  docRef.current = doc;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const reportRef = useRef<(out: Outcome, why: CommitWhy) => void>(() => {});

  const bufferNow = (): string => {
    const v = viewRef.current;
    return v ? bufferText(v) : bufferInit.current;
  };

  // The apply model (model.ts): it reads and relays the open view through these.
  const model = useMemo(
    () =>
      new ProfileModel(
        host,
        {
          mode: () => modeRef.current,
          doc: () => docRef.current,
          setDoc: (f) => setDoc(f),
          buffer: () => {
            const v = viewRef.current;
            return v ? bufferText(v) : bufferInit.current;
          },
          setBuffer: (t) => {
            const v = viewRef.current;
            if (v) replaceText(v, t);
            else bufferInit.current = t;
          },
          baseChanged: (b) => setBase(b),
          report: (out, why) => reportRef.current(out, why),
        },
        initial,
      ),
    [],
  );
  useEffect(() => {
    const off = model.follow();
    return () => {
      off();
      model.dispose();
    };
  }, []);

  const narrow = layout === 'narrow';
  const railRow = layout !== 'wide';
  const view: EditorViewName = help ? 'help' : mode;

  // The layout by the editor's own width (never the device's).
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const set = (w: number): void => {
      if (w > 0) setLayout(peLayout(w));
    };
    set(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => {
      const e = es[es.length - 1];
      if (e) set(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ------------------------------------------------------------ lite model

  // The display order is read at the commit points (a new base, a new or
  // deleted entry, another kind or view), never per keystroke: typing a
  // pattern does not move its row until the edit is applied.
  const order = useMemo(() => listRows(docRef.current, kind, pinned).map((e) => e.id), [kind, pinned, base, mode]);
  const entries = useMemo(() => listEntries(doc, kind), [doc, kind]);
  const list = useMemo(() => {
    const byId = new Map(entries.map((e) => [e.id, e]));
    const out: EntryNode[] = [];
    for (const id of order) {
      const e = byId.get(id);
      if (e) {
        out.push(e);
        byId.delete(id);
      }
    }
    for (const e of byId.values()) out.push(e);
    return out;
  }, [entries, order]);
  // The rail's counts change with entries added or removed (or a new base), not with typing.
  const counts = useMemo(() => {
    const c = { action: 0, alias: 0, highlight: 0, macro: 0, substitute: 0 } as Record<LiteKind, number>;
    for (const n of docRef.current.nodes) if (n.type === 'entry' && n.kind in c) c[n.kind as LiteKind]++;
    return c;
  }, [doc.nodes.length, base, mode]);
  const wantId = cursorIds[kind];
  let idx = wantId === SENTINEL ? list.length : list.findIndex((e) => e.id === wantId);
  if (idx < 0) idx = 0;
  const cur: EntryNode | undefined = list[idx];
  const fields = FIELDS[kind];
  const isVisited = (id: number): boolean => !pinned.includes(id) || visited.has(id);
  const bodyText = cur ? (bodyDraft && bodyDraft.id === cur.id ? bodyDraft.text : displayBody(cur.kind, cur.body)) : '';

  // What the status says about Lite's edits (the serialisations are cheap next to a render).
  const baseText = useMemo(() => serialize(base), [base]);
  const editing = useMemo(() => mode === 'lite' && serialize(pendingDoc(base, doc)) !== baseText, [mode, base, doc, baseText]);
  const saveState: SaveState = heldNow ? 'held' : editing ? 'editing' : 'clean';

  /** The keyboard goes to `z` (and the detail's `f`); in one column the detail is a sheet over the list. */
  const focusZone = (z: Zone, f?: DetailField): void => {
    setZone(z);
    if (f) setField(f);
    if (z === 'detail') setSheet(true);
    else if (z === 'list') setSheet(false);
  };

  // The cursor's row is pulled into view after a key (never after a pointer: it is under the pointer).
  const reveal = useRef(false);
  const moveTo = (i: number, byKey = false): void => {
    const j = clamp(i, 0, list.length);
    reveal.current = byKey;
    setCursorIds((m) => ({ ...m, [kind]: j === list.length ? SENTINEL : list[j]!.id }));
  };
  useLayoutEffect(() => {
    if (!reveal.current) return;
    reveal.current = false;
    revealRow(listRef.current, idx);
  }, [idx, kind]);

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

  const leavePattern = (): void => {
    if (cur) setVisited((s) => (s.has(cur.id) ? s : new Set(s).add(cur.id)));
  };

  const startCapture = (e: EntryNode, auto: boolean): void => {
    if (device().phone) flash.show(PHONE_CAPTURE, 'fail');
    else setCapture({ id: e.id, auto, on: e.pattern ? keyLabel(e.pattern).text : '', error: '' });
  };

  const newEntry = (): void => {
    if (kind === 'macro' && device().phone) return flash.show(PHONE_CAPTURE, 'fail');
    const r = addEntry(doc, { kind, pattern: '', body: NEW_BODY[kind] });
    setDoc(r.doc);
    setPinned((p) => [...p, r.id]);
    setCursorIds((m) => ({ ...m, [kind]: r.id }));
    setBodyDraft(null);
    reveal.current = true;
    if (kind === 'macro') {
      setCapture({ id: r.id, auto: true, on: '', error: '' });
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
  const togglePick = (dim: HlDim, p: GridPos): void => {
    const s = hlSpec();
    const pick: HlPick = { row: p.r, bright: p.c ? 1 : 0 };
    const was = s[dim];
    const same = was && was.row === pick.row && was.bright === pick.bright;
    setHl({ ...s, [dim]: same ? null : pick });
  };

  /** Opens entry `i` of the list (the New row creates one). */
  const open = (i: number = idx): void => {
    const e = list[i];
    if (!e) return newEntry();
    setBodyDraft(null);
    focusZone('detail', FIELDS[e.kind as LiteKind][0]);
  };

  const selectKind = (k: LiteKind): void => {
    if (k === kind) return;
    setKind(k);
    setField(FIELDS[k][0]!);
    setBodyDraft(null);
    setSheet(false);
  };

  // ---------------------------------------------------------------- flip

  const flip = (to: Mode): void => {
    if (to === mode) return;
    if (to === 'editor') {
      // Unapplied lite edits go along as unapplied text (Editor applies on Ctrl+S).
      const d = pendingDoc(model.base, doc);
      bufferInit.current = serialize(d);
      setDoc(d);
    } else {
      setDoc(alignDoc(model.base, parseProfile(bufferNow())));
      setCursorIds({});
      // Back in Lite, the text is applied (ADR 0105).
      requestCommit();
    }
    setPinned([]);
    setVisited(new Set());
    setBodyDraft(null);
    setCapture(null);
    setSheet(false);
    flash.clear();
    setMode(to);
  };

  /**
   * Chooses a view (Help lies over the open one). `stay`: the keyboard
   * stays on the views (← → there); else it goes into the view: the list,
   * the buffer, the manual.
   */
  const select = (v: EditorViewName, stay = false): void => {
    if (v === 'help') {
      if (!help) {
        setHelp(true);
        setCapture(null);
        flash.clear();
      }
    } else {
      setHelp(false);
      flip(v);
    }
    focusZone(stay ? 'views' : v === 'lite' ? 'list' : v === 'editor' ? 'buffer' : 'help');
  };

  // The buffer was hidden while Help was up: let CodeMirror measure again.
  useLayoutEffect(() => {
    if (!help && mode === 'editor') viewRef.current?.requestMeasure();
  }, [help]);

  // The text's sections for Editor's rail: read when the buffer opens, then after edits (debounced).
  const textSecs = useTextSections(() => (modeRef.current === 'editor' && viewRef.current ? bufferText(viewRef.current) : null));

  // The CodeMirror buffer, mounted while in Editor (a fresh state, so a fresh undo history, on every flip).
  useLayoutEffect(() => {
    if (mode !== 'editor' || !bufRef.current) return;
    const v = createBuffer(bufRef.current, {
      text: bufferInit.current,
      eol: doc.eol,
      look: 'lantern',
      onStatus: (s) => {
        setStatus(s);
        textSecs.touch();
      },
      onScroll: () => {},
      onClipboard: (k) => flash.show(k === 'copy' ? 'Copied' : 'Cut'),
      onFocus: () => setZone('buffer'),
    });
    viewRef.current = v;
    textSecs.now();
    return () => {
      bufferInit.current = bufferText(v);
      v.destroy();
      viewRef.current = null;
    };
  }, [mode]);

  // The keyboard's zone owns the DOM focus: a text field or the buffer; elsewhere the stack host.
  useLayoutEffect(() => {
    const root = rootRef.current;
    // A window without the focus leaves it where it is (ADR 0103).
    if (!root || !isTop) return;
    const active = root.ownerDocument.activeElement as HTMLElement | null;
    const inside = !!active && root.contains(active);
    // The find fields keep the keyboard (the manual's bar, the buffer's panel).
    if (inside && active!.closest('.wc-lk-mfind, .wc-search')) return;
    let target: HTMLElement | null = null;
    if (!modal && !capture) {
      if (zone === 'detail' && field === 'pattern') target = patternRef.current;
      else if (zone === 'detail' && field === 'body') target = bodyRef.current;
      else if (zone === 'buffer') {
        const v = viewRef.current;
        if (v && !help) {
          if (!v.hasFocus && !searchFocused(v)) v.focus();
          return;
        }
      }
    }
    if (target) {
      if (active !== target) {
        target.focus({ preventScroll: true });
        revealField(target);
      }
      return;
    }
    if (inside && inTextField(active)) {
      active!.blur();
      root.closest<HTMLElement>('.wc-stack')?.focus({ preventScroll: true });
    }
  });

  // --------------------------------------------------------------- apply

  reportRef.current = (out, why) => {
    const word = host.isLive() ? 'Applied' : 'Saved';
    if (out.kind === 'clean') {
      setSaveFailed(false);
      setHeldNow(false);
      if (!out.changed) {
        if (why === 'save') flash.show(host.isLive() ? 'Nothing to apply.' : 'Nothing to save.');
      } else if (out.added.length) {
        const n = out.added.length;
        flash.show(`${word} · ${n === 1 ? 'a new warning' : `${n} new warnings`}: ${out.added[0]}`, 'ok', FAIL_MS);
      } else if (why === 'save' || !flash.showing()) flash.show(word);
    } else if (out.kind === 'held' || out.kind === 'failed') {
      setHeldNow(true);
      if (out.message) flash.show(out.message, 'fail', FAIL_MS);
    }
  };

  // Lite's commit points (see the header). A request applies after the
  // render that holds the edit; the transitions below are seen after theirs.
  const [commitReq, setCommitReq] = useState(0);
  const requestCommit = (): void => {
    if (model.alive) setCommitReq((n) => n + 1);
  };
  // Layout effects: they run before the next key, so the snapshot is the commit point's.
  useLayoutEffect(() => {
    if (commitReq > 0) void model.commit('auto');
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
    const fresh = !!cur && !model.base.nodes.some((n) => n.id === cur.id);
    if (p.field === 'pattern' && zone === 'detail' && field === 'body' && id === p.id && fresh && cur!.body.trim() === '') return;
    void model.commit('auto');
  }, [mode, zone, field, kind, cur?.id]);

  // A window's close request waits for the prompt; the Exit popup warns (ADR 0103).
  useUnsaved(() => model.unapplied(), modal !== null);

  /** Leaves the editor; the flash tells what this visit stored. */
  const leave = (out?: Outcome): void => {
    model.closing = true;
    nav.pop();
    if (!model.savedAny) return;
    if (!host.isLive()) return nav.flash(`Saved ${host.name}.`);
    const added = out?.kind === 'clean' ? out.added : [];
    nav.flash(added.length ? `Profile updated. ${added.length} new warning(s): ${added[0]}` : 'Profile updated.');
  };

  const discard = (): void => {
    model.closing = true;
    nav.pop();
  };

  /** Lets a running apply finish (and its render land) before Esc decides. */
  const settle = async (): Promise<boolean> => {
    if (!model.busy()) return true;
    setModal('applying');
    await model.settle();
    await new Promise((r) => setTimeout(r, 0));
    if (!model.alive) return false;
    setModal(null);
    return true;
  };

  const close = async (): Promise<void> => {
    if (!(await settle())) return;
    if (!model.unapplied()) return leave();
    if (saveFailed) {
      discard();
      nav.flash(`Changes to ${host.name} were not saved.`, 'fail');
      return;
    }
    if (host.isLive()) {
      // Nothing left that could be applied: say why instead of offering Yes.
      const why = model.nothingApplicable();
      if (why) {
        setHeldMsg(why);
        return setModal('not-applied');
      }
      return setModal('apply');
    }
    // Not live: Esc saves, as before (ADR 0015 P3); only what cannot be saved asks.
    setModal('saving');
    const out = await model.commit('close');
    if (out.kind === 'gone') return;
    if (out.kind === 'clean') return leave(out);
    setModal(null);
    if (out.kind === 'failed') {
      setSaveFailed(true);
      flash.show(`${out.message} · ESC again leaves without saving`, 'fail', 8000);
      return;
    }
    setHeldMsg(out.message);
    setModal('not-applied');
  };

  const applyNow = async (): Promise<void> => {
    setModal('applying');
    // Let "Applying…" paint before a synchronous apply runs.
    await new Promise((r) => setTimeout(r, 0));
    const out = await model.commit('modal');
    if (out.kind === 'gone') return;
    if (out.kind === 'clean') return leave(out);
    setHeldMsg(out.message);
    setModal('not-applied');
  };

  // ---------------------------------------------------------------- keys

  const kindLetters: Record<string, () => void> = {};
  for (const k of KINDS)
    kindLetters[KIND_LETTERS[k]] = () => {
      selectKind(k);
      if (zone !== 'rail') focusZone('list');
    };
  const viewLetters: Record<string, () => void> = {
    l: () => select('lite'),
    e: () => select('editor'),
    h: () => select('help'),
  };

  /** Editor's rail: the current section (the cursor's), the keyboard's entry when the rail has the keys. */
  const curSection = sectionAt(textSecs.sections, status.line);

  /** The zone after `z` in the Tab ring. */
  const enterZone = (z: Zone, f?: DetailField): void => {
    if (z === 'rail' && mode === 'editor' && !help) setRailCur(Math.max(0, curSection));
    focusZone(z, f);
  };

  const cycle = (dir: 1 | -1): void => {
    let order: { z: Zone; f?: DetailField }[];
    if (help) order = [{ z: 'views' }, { z: 'rail' }, { z: 'help' }];
    else if (mode === 'editor') order = [{ z: 'views' }, { z: 'rail' }, { z: 'buffer' }];
    else {
      order = [{ z: 'views' }, { z: 'rail' }, { z: 'list' }];
      if (cur) for (const f of fields) order.push({ z: 'detail', f });
    }
    const i = order.findIndex((o) => o.z === zone && (o.z !== 'detail' || o.f === field));
    const next = order[((((i < 0 ? 0 : i) + dir) % order.length) + order.length) % order.length]!;
    if (zone === 'detail' && field === 'pattern') leavePattern();
    if (next.z === 'detail') setBodyDraft(null);
    enterZone(next.z, next.f);
  };

  const viewsKey = (nk: NavKey | null): boolean => {
    if (nk === 'left' || nk === 'right') {
      select(stepView(view, nk === 'left' ? -1 : 1), true);
      return true;
    }
    if (nk === 'down' || nk === 'activate') {
      enterZone('rail');
      return true;
    }
    return nk !== null;
  };

  const onCaptureKey = (e: KeyboardEvent): void => {
    const c = capture;
    if (!c) return;
    const step = captureStep(e);
    if (step.kind === 'wait') return;
    if (step.kind === 'error') return setCapture({ ...c, error: step.error });
    if (step.kind === 'cancel') return cancelCapture();
    setDoc((d) => editEntry(d, c.id, { pattern: step.name }));
    setCapture(null);
    requestCommit();
    flash.show(`Bound to ${displayKey(step.name)}.`, 'ok', BOUND_MS);
    focusZone('detail', c.auto ? 'body' : 'key');
  };

  const cancelCapture = (): void => {
    const c = capture;
    if (!c) return;
    if (c.auto) {
      setDoc((d) => removeEntry(d, c.id));
      setPinned((p) => p.filter((id) => id !== c.id));
      setCursorIds((m) => ({ ...m, [kind]: SENTINEL }));
      focusZone('list');
    } else focusZone('detail', 'key');
    setCapture(null);
  };

  const caretAtStart = (el: HTMLInputElement | HTMLTextAreaElement | null): boolean => !!el && el.selectionStart === 0 && el.selectionEnd === 0;

  const toPatternEnd = (): void => {
    focusZone('detail', 'pattern');
    requestAnimationFrame(() => {
      const el = patternRef.current;
      if (el) el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const pageRows = (): number => {
    const l = listRef.current;
    const r = l?.querySelector<HTMLElement>('.wc-pe-row');
    const h = r?.getBoundingClientRect().height ?? 0;
    return l && h > 0 ? Math.max(1, Math.floor(l.clientHeight / h) - 1) : 10;
  };

  const listKey = (e: KeyboardEvent, nk: NavKey | null): boolean => {
    if (plain(e) && e.key === 'Delete') {
      deleteEntry();
      return true;
    }
    switch (nk) {
      case 'up':
        moveTo(idx - 1, true);
        return true;
      case 'down':
        moveTo(idx + 1, true);
        return true;
      case 'pgup':
        moveTo(idx - pageRows(), true);
        return true;
      case 'pgdn':
        moveTo(idx + pageRows(), true);
        return true;
      case 'home':
        moveTo(0, true);
        return true;
      case 'end':
        moveTo(list.length, true);
        return true;
      case 'left':
        enterZone('rail');
        return true;
      case 'right':
      case 'activate':
        open();
        return true;
    }
    return false;
  };

  const detailKey = (e: KeyboardEvent, nk: NavKey | null): boolean => {
    if (!cur) {
      focusZone('list');
      return true;
    }
    switch (field) {
      case 'pattern':
        if (nk === 'down' || (nk === 'activate' && e.key === 'Enter')) {
          leavePattern();
          focusZone('detail', fields[1]);
        } else if (nk === 'left' && caretAtStart(patternRef.current)) {
          leavePattern();
          focusZone('list');
        } else return false;
        return true;
      case 'body':
        if (nk === 'left' && caretAtStart(bodyRef.current)) {
          focusZone('list');
          return true;
        }
        return false;
      case 'key':
        if (nk === 'activate') startCapture(cur, false);
        else if (nk === 'left') focusZone('list');
        else if (nk === 'down') focusZone('detail', 'body');
        else return nk !== null;
        return true;
      case 'style':
        if (nk === 'left') {
          if (styleCur === 0) focusZone('list');
          else setStyleCur(styleCur - 1);
        } else if (nk === 'right') setStyleCur(Math.min(HL_STYLES.length - 1, styleCur + 1));
        else if (nk === 'up') toPatternEnd();
        else if (nk === 'down') focusZone('detail', 'text');
        else if (nk === 'activate') toggleStyle(styleCur);
        else return nk !== null;
        return true;
      case 'text':
      case 'bg': {
        const p = field === 'text' ? textCur : bgCur;
        const set = field === 'text' ? setTextCur : setBgCur;
        if (nk === 'left') {
          if (p.c > 0) set({ ...p, c: 0 });
          else if (field === 'text') focusZone('list');
          else {
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
        else return nk !== null;
        return true;
      }
    }
    return false;
  };

  /** Esc in a text field (or on a detail control): back to the list, or the rail from the buffer (decision 6). */
  const inOwnField = (e: KeyboardEvent): boolean => inTextField(e.target) && !!rootRef.current?.contains(e.target as Node);

  const liteKeys = (e: KeyboardEvent, nk: NavKey | null): boolean => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    // Ctrl+F / Ctrl+H in Lite: nothing, not the browser's find or history (ADR 0119).
    if (mod && !e.altKey && !e.shiftKey && (k === 'f' || k === 'h')) return true;
    if (nk === 'back') {
      if (zone === 'detail' || inOwnField(e)) {
        if (field === 'pattern') leavePattern();
        focusZone('list');
      } else if (narrow && sheet) focusZone('list');
      else void close();
      return true;
    }
    if (nk === 'tab' || nk === 'backtab') {
      cycle(nk === 'tab' ? 1 : -1);
      return true;
    }
    if (
      letterAction(e, {
        ...viewLetters,
        ...kindLetters,
        n: newEntry,
        d: () => {
          deleteEntry();
          if (zone === 'detail') focusZone('list');
        },
      })
    )
      return true;
    switch (zone) {
      case 'views':
        return viewsKey(nk);
      case 'rail': {
        const i = KINDS.indexOf(kind);
        const back = railRow ? 'left' : 'up';
        const fwd = railRow ? 'right' : 'down';
        if (nk === back || nk === fwd) {
          selectKind(KINDS[clamp(i + (nk === fwd ? 1 : -1), 0, KINDS.length - 1)]!);
          return true;
        }
        if (nk === (railRow ? 'down' : 'right') || nk === 'activate') {
          focusZone('list');
          return true;
        }
        if (railRow && nk === 'up') {
          focusZone('views');
          return true;
        }
        return nk !== null;
      }
      case 'list':
        return listKey(e, nk);
      case 'detail':
        return detailKey(e, nk);
    }
    return false;
  };

  const editorKeys = (e: KeyboardEvent, nk: NavKey | null): boolean => {
    const v = viewRef.current;
    // Find and replace: Ctrl+F, Ctrl+H, the panel's keys; Esc closes it first.
    const found = v ? searchFrameKey(v, e) : null;
    if (found !== null) {
      if (found && zone !== 'buffer') setZone('buffer');
      return found;
    }
    if (nk === 'back') {
      if (zone === 'buffer' || inOwnField(e)) enterZone('rail');
      else void close();
      return true;
    }
    if (nk === 'tab' || nk === 'backtab') {
      cycle(nk === 'tab' ? 1 : -1);
      return true;
    }
    if (zone === 'buffer') return v ? handleKey(v, e) : false;
    if (letterAction(e, viewLetters)) return true;
    if (zone === 'views') return viewsKey(nk);
    if (zone === 'rail') {
      const secs = textSecs.sections;
      const n = secs.length;
      const go = (j: number): void => {
        const s = secs[j];
        if (s && v) showLine(v, s.line, true);
        focusZone('buffer');
      };
      const step = (d: number): void => {
        const j = clamp(railCur + d, 0, Math.max(0, n - 1));
        setRailCur(j);
        const s = secs[j];
        if (s && v) showLine(v, s.line, false);
      };
      const back = railRow ? 'left' : 'up';
      const fwd = railRow ? 'right' : 'down';
      if (nk === back || nk === fwd) step(nk === fwd ? 1 : -1);
      else if (nk === 'pgup' || nk === 'pgdn') step(nk === 'pgdn' ? 10 : -10);
      else if (nk === 'home' || nk === 'end') step(nk === 'end' ? n : -n);
      else if (nk === (railRow ? 'down' : 'right') || nk === 'activate') go(railCur);
      else if (railRow && nk === 'up') focusZone('views');
      else return nk !== null;
      return true;
    }
    return false;
  };

  const goSection = (i: number): void => manualCtl.current?.goto(clamp(i, 0, manual.length - 1));

  const helpKeys = (e: KeyboardEvent, nk: NavKey | null): boolean => {
    const ctl = manualCtl.current;
    const t = e.target as Element | null;
    const inFind = !!t?.closest?.('.wc-lk-mfind');
    const mod = e.ctrlKey || e.metaKey;
    // The manual's own keys: its find (from anywhere: Ctrl+F, F3, Alt+C/W/R), its field, n / p, and the text's keys.
    const heading = !nk && plain(e) && (e.key === 'n' || e.key === 'p');
    if (ctl && (inFind || zone === 'help' || mod || e.altKey || e.key === 'F3' || heading)) {
      if (ctl.key(e, nk)) {
        if (zone !== 'help' && !inFind && !heading) setZone('help');
        return true;
      }
      if (inFind) return false;
    }
    if (nk === 'back') {
      // Esc: an open find closes first, whichever zone has the keyboard; else leave.
      if (!ctl?.closeFind()) void close();
      return true;
    }
    if (nk === 'tab' || nk === 'backtab') {
      cycle(nk === 'tab' ? 1 : -1);
      return true;
    }
    if (letterAction(e, viewLetters)) return true;
    if (zone === 'views') return viewsKey(nk);
    if (zone === 'rail') {
      const back = railRow ? 'left' : 'up';
      const fwd = railRow ? 'right' : 'down';
      if (nk === back || nk === fwd) goSection(helpSection + (nk === fwd ? 1 : -1));
      else if (nk === 'pgup' || nk === 'pgdn') goSection(helpSection + (nk === 'pgdn' ? 10 : -10));
      else if (nk === 'home' || nk === 'end') goSection(nk === 'home' ? 0 : manual.length - 1);
      else if (nk === (railRow ? 'down' : 'right') || nk === 'activate') focusZone('help');
      else if (railRow && nk === 'up') focusZone('views');
      else return nk !== null;
      return true;
    }
    if (zone === 'help' && nk === 'left') {
      focusZone('rail');
      return true;
    }
    return false;
  };

  useKeys((e, nk) => {
    // The prompts' and the capture's key layers come first; what passes them is held.
    if (modal || capture) return true;
    // Ctrl+S applies now, in every view (ADR 0105); never the browser's Save dialog.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
      void model.commit('save');
      return true;
    }
    if (help) return helpKeys(e, nk);
    if (mode === 'editor') return editorKeys(e, nk);
    return liteKeys(e, nk);
  });

  // ------------------------------------------------------------- pointer

  const onRow = (i: number, how: 'click' | 'dblclick'): void => {
    if (i >= list.length) {
      moveTo(list.length);
      newEntry();
      return;
    }
    const again = i === idx;
    moveTo(i);
    // A click on the chosen row, a double click, or any tap in one column opens the entry.
    if (how === 'dblclick' || again || narrow) open(i);
    else focusZone('list');
  };

  // --------------------------------------------------------------- render

  const modified = mode === 'editor' ? bufferNow() !== baseText : false;
  const unappliedNow = mode === 'editor' ? modified : saveState !== 'clean';
  const viewIdx = VIEW_LABELS.findIndex((v) => v.view === view);
  const detailAt: DetailField | null = zone === 'detail' && !capture && !modal ? field : null;

  let rail: VNode;
  if (help) {
    rail = <HelpRail sections={manual} current={helpSection} active={zone === 'rail'} onGo={(i) => goSection(i)} />;
  } else if (mode === 'editor') {
    rail = (
      <TextRail
        sections={textSecs.sections}
        current={curSection}
        sel={zone === 'rail' ? railCur : -1}
        onGo={(line) => {
          const v = viewRef.current;
          if (v) showLine(v, line, true);
          focusZone('buffer');
        }}
      />
    );
  } else {
    rail = (
      <KindRail
        kind={kind}
        counts={counts}
        active={zone === 'rail'}
        onPick={(k) => {
          selectKind(k);
          focusZone('rail');
        }}
      />
    );
  }

  let buttons: VNode;
  if (view === 'lite') {
    buttons = (
      <>
        <GlassButton id="NEW" small icon="plus" label="New entry" letter="n" onClick={newEntry} />
        <GlassButton id="DELETE" small danger icon="trash" label="Delete" letter="d" disabled={!cur} onClick={deleteEntry} />
      </>
    );
  } else if (view === 'editor') {
    buttons = (
      <>
        <GlassButton
          id={live ? 'APPLY' : 'SAVE'}
          small
          primary
          icon="save"
          label={live ? 'Apply' : 'Save'}
          title={`${live ? 'Apply' : 'Save'} (Ctrl+S)`}
          onClick={() => void model.commit('save')}
        />
        <GlassButton
          id="FIND"
          small
          icon="find"
          label="Find"
          title="Find (Ctrl+F) · Replace (Ctrl+H)"
          onClick={() => {
            const v = viewRef.current;
            if (v) openSearch(v);
            setZone('buffer');
          }}
        />
      </>
    );
  } else {
    buttons = (
      <GlassButton
        id="FIND"
        small
        icon="find"
        label="Find"
        title="Find in the manual (Ctrl+F)"
        onClick={() => {
          manualCtl.current?.openFind();
          setZone('help');
        }}
      />
    );
  }

  let statusEl: VNode | null = null;
  if (view === 'editor') {
    const bal = balanceText(status);
    statusEl = (
      <>
        {!flash.flash && status.hint && <span class="wc-pe-cmdhint">{status.hint}</span>}
        {modified && <span class="wc-pe-mod">Modified</span>}
        {bal && <span class="wc-pe-bal">{bal}</span>}
        <span class="wc-pe-pos">
          Ln {status.line}, Col {status.col}
        </span>
      </>
    );
  } else if (view === 'lite') {
    statusEl = (
      <span class={'wc-pe-sv is-' + saveState} data-state={saveState}>
        <i aria-hidden="true" />
        {statusText(saveState, live)}
      </span>
    );
  }

  let dialog: VNode | null = null;
  if (modal === 'apply') {
    dialog = (
      <Dialog
        inline
        title="Profile"
        dlg="apply"
        onCancel={() => setModal(null)}
        buttons={[
          { id: 'YES', label: 'Yes, apply', letter: 'y', primary: true, run: () => void applyNow() },
          { id: 'NO', label: 'No, discard', letter: 'n', danger: true, run: discard },
          { id: 'KEEP', label: 'Keep editing', run: () => setModal(null) },
        ]}
      >
        <p class="wc-lk-q">Apply changes to your profile?</p>
        <p class="wc-lk-qn">They go into the running game.</p>
      </Dialog>
    );
  } else if (modal === 'not-applied') {
    dialog = (
      <Dialog
        inline
        title="Profile"
        dlg="not-applied"
        onCancel={() => setModal(null)}
        buttons={[
          { id: 'NO', label: 'No, discard', letter: 'n', danger: true, run: discard },
          { id: 'KEEP', label: 'Keep editing', run: () => setModal(null) },
        ]}
      >
        <p class="wc-lk-q wc-lk-bad wc-pe-held">{heldMsg}</p>
        <p class="wc-lk-qn">Fix it to keep it, or leave without it.</p>
      </Dialog>
    );
  } else if (modal === 'applying' || modal === 'saving') {
    dialog = (
      <Dialog inline title="Profile" dlg={modal} buttons={[]} onCancel={() => {}}>
        <p class="wc-lk-q">{modal === 'applying' ? 'Applying…' : 'Saving…'}</p>
      </Dialog>
    );
  }

  return (
    <Box size="large" title="Profile" onBack={() => !modal && !capture && void close()} winClass="wc-pe-win">
      <div
        ref={rootRef}
        class={cx('wc-pe', `is-${place}`, sheet && narrow && 'is-sheet')}
        data-view={view}
        data-mode={mode}
        data-zone={zone}
        data-kind={kind}
        data-layout={layout}
        data-unapplied={unappliedNow ? 'true' : 'false'}
        onFocusOut={(e) => {
          // Leaving the editor (a click in the game, another window) is a commit point in Lite.
          const to = e.relatedTarget as Node | null;
          if (mode === 'lite' && !help && !model.closing && !(to && rootRef.current?.contains(to))) requestCommit();
        }}
      >
        <BoxHead class="wc-pe-head">
          {inGame ? (
            <span class={cx('wc-pe-live', live && 'is-live')}>
              <i aria-hidden="true" />
              <span class="wc-pe-live-t">{liveText(live)}</span>
            </span>
          ) : (
            <span class="wc-pe-name">
              {host.name}
              <small>tt++ profile</small>
            </span>
          )}
          <div class={cx('wc-pe-views', zone === 'views' && 'is-cur')}>
            <Seg
              label="View"
              options={VIEW_LABELS.map((v) => ({ value: v.view, label: v.label, letter: v.letter }))}
              value={view}
              selected={zone === 'views' ? viewIdx : undefined}
              onChange={(v) => select(v as EditorViewName)}
            />
          </div>
        </BoxHead>
        <div class="wc-pe-cols">
          <nav class={cx('wc-pe-rail', zone === 'rail' && 'is-zone')} aria-label={help ? 'Sections' : mode === 'editor' ? 'In the text' : 'Kinds'}>
            {rail}
          </nav>
          <div class="wc-pe-main">
            {mode === 'lite' && !help && (
              <EntryList key={kind} kind={kind} list={list} idx={idx} focused={zone === 'list'} visited={isVisited} listRef={listRef} onRow={onRow} />
            )}
            {mode === 'editor' && <div class="wc-pe-buf" ref={bufRef} hidden={help} />}
            {help && (
              <HelpView
                sections={manual}
                initial={helpSection}
                memory={helpFind.current}
                onSection={setHelpSection}
                ctl={(c) => (manualCtl.current = c)}
              />
            )}
          </div>
          {mode === 'lite' && !help && (
            <div
              class="wc-pe-detail wc-lk-scroll"
              // A press on a field moves the keyboard there before the focus moves: a render
              // between the old field's blur and the new one's focus must not pull it back.
              onPointerDown={(e) => {
                const f = (e.target as Element).closest?.('[data-field]')?.getAttribute('data-field');
                if (f === 'pattern' || f === 'body') focusZone('detail', f);
              }}
              onFocusIn={(e) => {
                const f = (e.target as Element).closest?.('[data-field]')?.getAttribute('data-field');
                if (f === 'pattern' || f === 'body') focusZone('detail', f);
              }}
              onFocusOut={(e) => {
                if ((e.target as Element).closest?.('[data-field="pattern"]')) leavePattern();
              }}
            >
              <Detail
                kind={kind}
                cur={cur}
                count={list.length}
                bodyText={bodyText}
                visited={cur ? isVisited(cur.id) : true}
                at={detailAt}
                styleCur={styleCur}
                textCur={textCur}
                bgCur={bgCur}
                phone={device().phone}
                patternRef={patternRef}
                bodyRef={bodyRef}
                onPattern={setPattern}
                onBody={setBody}
                onCapture={() => {
                  if (!cur) return;
                  focusZone('detail', 'key');
                  startCapture(cur, false);
                }}
                onStyle={(i) => {
                  setStyleCur(i);
                  focusZone('detail', 'style');
                  toggleStyle(i);
                }}
                onPick={(dim, pos) => {
                  if (dim === 'fg') setTextCur(pos);
                  else setBgCur(pos);
                  focusZone('detail', dim === 'fg' ? 'text' : 'bg');
                  togglePick(dim, pos);
                }}
                onNew={newEntry}
                onSheetBack={() => focusZone('list')}
              />
            </div>
          )}
        </div>
        <BoxFoot class="wc-pe-foot">
          <div class="wc-pe-btns">{buttons}</div>
          <LookFlash class="wc-pe-flash" flash={flash.flash} />
          <div class="wc-pe-status">{statusEl}</div>
        </BoxFoot>
        {capture && <BindDialog capture={capture} onKey={onCaptureKey} onCancel={cancelCapture} />}
        {dialog}
      </div>
    </Box>
  );
});
