// The script editor (spec §2.10, ADR 0051 "P2"): a full-screen frame on
// the chrome's frame stack, laid out like the profile editor's EDITOR view
// (ADR 0015, ADR 0037): title row with buttons, a CodeMirror buffer with
// the TUI scrollbar, a status row (state, load errors, warnings) and the
// footer (hints or a flash, Ln/Col).
//
// Keys: Ctrl+S saves; F1 opens the script manual (at the API or Lua name
// under the cursor); Ctrl+F finds and replaces (search.ts; ESC closes the
// panel before it closes the editor). Tab and Shift+Tab work as in a code
// editor (lua-cm.ts): accept the completion, else the next or previous
// snippet field, else indent or dedent. ESC closes the pop-ups first
// (completion, signature help, hover, snippet), then the editor, and asks
// first when there are unsaved changes. The title row has no buttons
// (stage 10 feedback round 4), except for a bundled script: it opens
// read-only with DUPLICATE (Tab or ↑ on the first line reaches it), which
// opens an editable copy in its place.

import type { EditorView } from '@codemirror/view';
import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { problemText, scriptState } from '../chrome/frames/scripts-model';
import { useGrid, useServices } from '../chrome/kit/hooks';
import { escHints } from '../chrome/kit/esc';
import { device } from '../core/device';
import { cellLen, centreLeft, scrollbar, truncate } from '../chrome/kit/nav';
import { type Nav, useIsTop, useKeys, useNav } from '../chrome/kit/stack';
import { Button, indent } from '../chrome/kit/widgets';
import type { ScriptInfo, ScriptLibrary } from '../scripts';
import { type BufferStatus, type ScrollStatus, handleKey, onFirstLine, pageScroll } from './cm';
import { FULL_W } from './logic';
import { checkScript } from '../scripts/check';
import { nameAt } from './lua-api';
import { openScriptManual } from './script-manual-frame';
import { completing, createLuaBuffer, dismissPopups, snippetTab } from './lua-cm';
import { type ScriptDiagnostic, diagnosticText } from './lua-diagnostics';
import { markScriptSaved, setScriptLastError } from './lua-lint';
import { searchFocused, searchFrameKey } from './search';

export interface ScriptEditorHost {
  library: ScriptLibrary;
  /** The script to edit. */
  name: string;
  /** The script now has another name (a save took a new `@name`, DUPLICATE opened the copy). */
  onName?: (name: string) => void;
}

interface LocalFlash {
  text: string;
  kind: 'ok' | 'fail';
  seq: number;
}

type Zone = 'buttons' | 'buffer';
type Btn = 'DUPLICATE';

const FLASH_MS = 3000;
const MODAL_HINT = 'Y to save · N to discard · ESC to keep editing';
/** The confirm hint on a narrow phone (ADR 0075 §3.2). */
const MODAL_HINT_SHORT = 'Y Save · N Discard · ESC Keep editing';
/** Footer hints, longest first; the first that fits beside Ln/Col is shown. */
const HINTS = [
  'Ctrl+S Save · Ctrl+F Find · Ctrl+Space Complete · F1 Manual · Tab Indent · ESC Back',
  'Ctrl+S Save · Ctrl+F Find · Ctrl+Space Complete · F1 Manual · ESC Back',
  'Ctrl+S Save · Ctrl+F Find · F1 Manual · ESC Back',
  'Ctrl+S Save · F1 Manual · ESC Back',
  'Ctrl+S Save · ESC Back',
];
const RO_HINTS = [
  'Read-only: DUPLICATE makes your copy · Ctrl+F Find · F1 Manual · Tab Cycle · ESC Back',
  'Read-only: DUPLICATE makes your copy · Ctrl+F Find · F1 Manual · ESC Back',
  'Read-only · Ctrl+F Find · F1 Manual · ESC Back',
  'Read-only · ESC Back',
];
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const plain = (e: KeyboardEvent): boolean => !e.ctrlKey && !e.altKey && !e.metaKey;

/** Pushes the script editor for `host.name` (no-op when the script is gone). */
export function openScriptEditor(nav: Nav, host: ScriptEditorHost): void {
  if (!host.library.get(host.name)) return nav.flash(`No script "${host.name}".`, 'fail');
  nav.push(<ScriptEditor host={host} />);
}

export function ScriptEditor({ host, flash: initialFlash }: { host: ScriptEditorHost; flash?: string }): VNode {
  const nav = useNav();
  const isTop = useIsTop();
  const { cols, rows, surface } = useGrid();
  const { scriptRunning } = useServices();
  const lib = host.library;

  const [name, setName] = useState(host.name);
  const [info, setInfo] = useState<ScriptInfo | null>(() => lib.get(host.name));
  const [saved, setSaved] = useState(() => lib.get(host.name)?.source ?? '');
  const [text, setText] = useState(saved);
  const [zone, setZone] = useState<Zone>('buffer');
  const [btn, setBtn] = useState(0);
  const [modal, setModal] = useState<null | 'confirm' | 'saving'>(null);
  const [flash, setFlash] = useState<LocalFlash | null>(null);
  const [status, setStatus] = useState<BufferStatus>({ line: 1, col: 1, unclosed: 0, stray: 0, hint: null });
  const [scroll, setScroll] = useState<ScrollStatus>({ top: 0, height: 0, client: 0 });
  const [diags, setDiags] = useState<readonly ScriptDiagnostic[]>([]);
  const [, setTick] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const bufRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const nameRef = useRef(name);
  nameRef.current = name;
  const busy = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashSeq = useRef(0);
  const cellH = useRef(16);

  const readOnly = info?.readonly ?? true;
  const buttons: Btn[] = readOnly ? ['DUPLICATE'] : [];
  const dirty = !readOnly && text !== saved;

  const showFlash = (t: string, kind: 'ok' | 'fail' = 'ok', ms = FLASH_MS): void => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash({ text: t, kind, seq: ++flashSeq.current });
    flashTimer.current = setTimeout(() => setFlash(null), ms);
  };
  useEffect(() => {
    if (initialFlash) showFlash(initialFlash);
    return () => void (flashTimer.current && clearTimeout(flashTimer.current));
  }, []);

  // The script as the library sees it (state, errors), and the host's
  // running state, which changes without a library event: polled.
  useEffect(() => lib.subscribe(() => setInfo(lib.get(nameRef.current))), [lib]);
  useEffect(() => {
    if (!isTop) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [isTop]);

  // ------------------------------------------------------------ geometry

  const gap = surface === 'start' ? 2 : 1;
  // A phone may be narrower than 42 columns (ADR 0075 §3.2): no 40-cell floor there.
  const W = Math.max(device().phone ? Math.min(40, cols - 2) : 40, Math.min(FULL_W, cols - 2));
  const at = centreLeft(cols, W);
  // gap + title + blank + buffer + status + footer
  const bufferH = Math.max(3, rows - gap - 4);

  // -------------------------------------------------------------- buffer

  useLayoutEffect(() => {
    if (!bufRef.current) return;
    const view = createLuaBuffer(bufRef.current, {
      text: saved,
      readOnly,
      onStatus: setStatus,
      onScroll: setScroll,
      onChange: setText,
      onFocus: () => setZone('buffer'),
      // Live errors: header and a compile-only check (the Lua runtime
      // loads now, in its own chunk), plus the running script's last error.
      lint: {
        name: () => nameRef.current,
        check: async (n, src) => {
          const r = await checkScript(n, src);
          return r.ok ? null : r.message;
        },
        onDiagnostics: setDiags,
      },
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // The running script's last error, marked on its line (lua-lint.ts).
  const lastError = info?.lastError ?? null;
  useEffect(() => {
    if (viewRef.current) setScriptLastError(viewRef.current, lastError);
  }, [lastError]);

  // Keyboard focus follows the zone.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !isTop) return;
    const lh = parseFloat(getComputedStyle(root).lineHeight);
    if (lh > 0) cellH.current = lh;
    const v = viewRef.current;
    if (zone === 'buffer' && v && !modal) {
      if (!v.hasFocus && !searchFocused(v)) v.focus();
      return;
    }
    if (root.ownerDocument.activeElement !== root) root.focus({ preventScroll: true });
  });

  // ------------------------------------------------------------- actions

  const current = (): string => viewRef.current?.state.doc.toString() ?? text;

  /** Saves the buffer. True when it was saved. */
  const save = async (): Promise<boolean> => {
    if (readOnly || busy.current) return false;
    busy.current = true;
    const src = current();
    const before = nameRef.current;
    try {
      const r = await lib.save(before, src);
      if (viewRef.current) markScriptSaved(viewRef.current, src);
      setSaved(src);
      setText(src);
      if (r.name !== nameRef.current) {
        nameRef.current = r.name;
        setName(r.name);
        host.onName?.(r.name);
      }
      const now = lib.get(r.name);
      setInfo(now);
      if (r.warnings.length > 0) showFlash(`Saved. ${r.warnings[0]}`, 'fail', 6000);
      else if (r.name !== before) showFlash(`Saved as ${r.name}.`);
      else showFlash(now?.enabled ? 'Saved. The script reloads.' : 'Saved. Turn it on in the list to run it.');
      return true;
    } catch (e) {
      showFlash(`Save failed: ${errText(e)}`, 'fail', 6000);
      return false;
    } finally {
      busy.current = false;
    }
  };

  const duplicate = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      const copy = await lib.duplicate(nameRef.current);
      host.onName?.(copy.name);
      nav.replace(<ScriptEditor host={{ ...host, name: copy.name }} flash={`Duplicated as ${copy.name}. This copy is yours to edit.`} />);
    } catch (e) {
      showFlash(`Duplicate failed: ${errText(e)}`, 'fail', 6000);
    } finally {
      busy.current = false;
    }
  };

  const close = (): void => {
    if (dirty || (!readOnly && current() !== saved)) return setModal('confirm');
    nav.pop();
  };

  const saveAndClose = async (): Promise<void> => {
    setModal('saving');
    const ok = await save();
    if (ok) {
      nav.pop();
      nav.flash(`Saved ${nameRef.current}.`);
    } else setModal(null);
  };

  /** The script manual, at the API or Lua name under the cursor when `atCursor` and there is one. */
  const manual = (atCursor: boolean): void => {
    const v = viewRef.current;
    let name: string | undefined;
    if (atCursor && v) {
      const head = v.state.selection.main.head;
      const line = v.state.doc.lineAt(head);
      const hit = nameAt(line.text, head - line.from);
      if (hit) name = hit.doc.name;
    }
    openScriptManual(nav, name);
  };

  const press = (b: Btn): void => {
    if (b === 'DUPLICATE') void duplicate();
  };

  // ---------------------------------------------------------------- keys

  useKeys((e, nk) => {
    if (modal === 'saving') return true;
    if (modal === 'confirm') {
      const k = e.key.toLowerCase();
      if (plain(e) && k === 'y') void saveAndClose();
      else if (plain(e) && k === 'n') nav.pop();
      else if (nk === 'back') setModal(null);
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
      void save();
      return true;
    }
    if (e.key === 'F1' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      manual(zone === 'buffer');
      return true;
    }
    const v = viewRef.current;
    if (zone === 'buffer' && v && completing(v)) return handleKey(v, e);
    // The buffer's pop-ups and snippet fields take ESC and Tab first.
    if (zone === 'buffer' && v && !searchFocused(v)) {
      if (nk === 'back' && dismissPopups(v)) return true;
      if ((nk === 'tab' || nk === 'backtab') && snippetTab(v, nk === 'backtab')) return true;
      // An editable buffer keeps Tab: indent and dedent (lua-cm.ts).
      if ((nk === 'tab' || nk === 'backtab') && !readOnly) {
        handleKey(v, e);
        return true;
      }
    }
    // Find and replace: Ctrl+F, the panel's keys, and ESC closes it first.
    const found = v ? searchFrameKey(v, e) : null;
    if (found !== null) {
      if (found && zone !== 'buffer') setZone('buffer');
      return found;
    }
    if (nk === 'back') {
      close();
      return true;
    }
    if (nk === 'tab' || nk === 'backtab') {
      if (buttons.length > 0) setZone(zone === 'buffer' ? 'buttons' : 'buffer');
      return true;
    }
    if (zone === 'buttons') {
      const i = Math.min(btn, buttons.length - 1);
      if (nk === 'left' || nk === 'right') setBtn(Math.max(0, Math.min(buttons.length - 1, i + (nk === 'left' ? -1 : 1))));
      else if (nk === 'activate') press(buttons[i]!);
      else if (nk === 'down') {
        v?.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
        setZone('buffer');
      } else return false;
      return true;
    }
    if (!v) return false;
    if (nk === 'up' && buttons.length > 0 && onFirstLine(v)) {
      setZone('buttons');
      return true;
    }
    return handleKey(v, e);
  });

  // -------------------------------------------------------------- render

  const titleFull = `─── Script Editor: ${name} ───`;
  const btnW = (b: string): number => cellLen(b) + 4;
  const btnsW = buttons.length > 0 ? buttons.reduce((n, b) => n + btnW(b), 0) + buttons.length - 1 : 0;
  const roText = readOnly ? ' read-only' : '';
  const title = truncate(titleFull, Math.max(10, W - btnsW - 1 - cellLen(roText)));
  const titleAt = Math.max(0, Math.min(centreLeft(cols, cellLen(title)), at + W - btnsW - 1 - cellLen(title) - cellLen(roText)));
  const btnFocused = zone === 'buttons' && !modal;
  const bIdx = Math.min(btn, buttons.length - 1);

  const titleRow = (
    <div class="wc-line wc-ped-title">
      <span style={indent(titleAt)} class="wc-c-section">
        {title}
      </span>
      {roText && <span class="wc-c-hint wc-sed-ro">{roText}</span>}
      <span style={indent(Math.max(1, at + W - btnsW - titleAt - cellLen(title) - cellLen(roText)))} />
      <span class="wc-sed-buttons">
        {buttons.map((b, i) => (
          <>
            {i > 0 && ' '}
            <Button
              label={b}
              width={btnW(b)}
              selected={i === bIdx}
              focused={btnFocused}
              onClick={() => {
                setBtn(i);
                setZone('buttons');
                press(b);
              }}
            />
          </>
        ))}
      </span>
    </div>
  );

  // Status row: state, then the first live error of the buffer (lua-lint.ts),
  // else the saved script's load error or last error.
  const st = info ? scriptState(info, scriptRunning?.(name) ?? null) : null;
  const live = diags[0] ? diagnosticText(diags[0]) : null;
  // With unsaved changes the saved script's problems may be fixed already: only the live ones show.
  const savedInfo = info && !dirty ? info : null;
  const problem = live ?? (savedInfo ? problemText(savedInfo) : null);
  const headerProblem = savedInfo && savedInfo.problems.length > 0 ? `Header ${savedInfo.problems[0]}` : null;
  const stText = st ? `${st.glyph} ${st.text}` : '';
  const room = Math.max(0, W - cellLen(stText) - 3);
  const extra = problem ?? headerProblem;
  const statusRow = (
    <div class="wc-line wc-sed-status" style={indent(at)} title={extra ?? undefined}>
      {st && <span class={st.cls}>{stText}</span>}
      {extra && (
        <>
          <span class="wc-c-hint">{' · '}</span>
          <span class={problem ? 'wc-c-err wc-sed-problem' : 'wc-c-danger wc-sed-problem'}>{truncate(extra, room)}</span>
        </>
      )}
    </div>
  );

  // Touch (ADR 0075 §3.2): the key-only hints are tappable.
  const tapActions = device().touch
    ? { 'Ctrl+S Save': () => void save(), 'F1 Manual': () => manual(false) }
    : undefined;
  const right = `${dirty ? 'Modified  ·  ' : ''}Ln ${status.line}, Col ${status.col}`;
  const rightAt = at + W - cellLen(right);
  const roomC = Math.max(0, rightAt - at - 2);
  const hints = (readOnly ? RO_HINTS : HINTS).find((h) => cellLen(h) <= roomC) ?? (readOnly ? RO_HINTS : HINTS).at(-1)!;
  const centre = truncate(flash ? flash.text : hints, roomC);
  const cAt = Math.max(at, Math.min(centreLeft(cols, cellLen(centre)), rightAt - 2 - cellLen(centre)));
  const footer = (
    <div class="wc-line wc-footer wc-ped-footer">
      <span
        style={indent(cAt)}
        class={flash ? (flash.kind === 'ok' ? 'wc-c-accent' : 'wc-c-err') : 'wc-c-hint'}
        role={flash ? 'status' : undefined}
      >
        {flash ? centre : escHints(centre, tapActions)}
      </span>
      <span style={indent(Math.max(2, rightAt - cAt - cellLen(centre)))} />
      <span class={dirty ? 'wc-ped-note' : 'wc-c-hint'}>{right}</span>
    </div>
  );

  const cellHpx = cellH.current;
  const total = Math.max(1, Math.round(scroll.height / cellHpx));
  const visible = Math.max(1, Math.round(scroll.client / cellHpx));
  const bar = scrollbar(total, Math.min(visible, bufferH), Math.round(scroll.top / cellHpx));

  return (
    <div
      class="wc-page wc-ped wc-sed"
      ref={rootRef}
      tabIndex={-1}
      data-zone={zone}
      data-script={name}
      data-readonly={readOnly ? 'true' : 'false'}
    >
      <div class="wc-line" style={{ height: `calc(var(--cell-h) * ${gap})` }} />
      {titleRow}
      <div class="wc-line" />
      <div class="wc-ped-bufwrap" style={{ height: `calc(var(--cell-h) * ${bufferH})` }}>
        <div class="wc-ped-buffer" ref={bufRef} style={{ width: `calc(var(--cell-w) * ${cols - 1})` }} />
        <div class="wc-ped-bufbar">
          {Array.from({ length: bufferH }, (_, i) =>
            bar.length && i < bar.length ? (
              <div
                class={'wc-line ' + (bar[i] ? 'wc-scroll-thumb' : 'wc-scroll-track')}
                onMouseDown={(e) => {
                  e.preventDefault();
                  const v = viewRef.current;
                  if (!v || bar[i]) return;
                  pageScroll(v, i < bar.indexOf(true) ? -1 : 1);
                }}
              >
                {bar[i] ? '█' : '░'}
              </div>
            ) : (
              <div class="wc-line" />
            ),
          )}
        </div>
      </div>
      <div class="wc-ped-spacer" />
      {statusRow}
      {footer}
      {modal && renderModal()}
    </div>
  );

  function renderModal(): VNode {
    const lines =
      modal === 'saving'
        ? [{ text: '', cls: '' }, { text: 'Saving…', cls: 'wc-c-accent' }, { text: '', cls: '' }]
        : [
            { text: '', cls: '' },
            { text: `Save changes to ${name}?`, cls: 'wc-c-active' },
            { text: '', cls: '' },
            { text: MODAL_HINT, cls: 'wc-c-hint' },
            { text: '', cls: '' },
          ];
    const w = Math.min(cols - 2, 54);
    const h = lines.length + 2;
    // Touch: Y and N are tappable; a narrow phone gets the short wording.
    const hint = device().phone && cellLen(MODAL_HINT) > w - 2 ? MODAL_HINT_SHORT : MODAL_HINT;
    const tap = device().touch
      ? {
          [hint === MODAL_HINT ? 'Y to save' : 'Y Save']: () => void saveAndClose(),
          [hint === MODAL_HINT ? 'N to discard' : 'N Discard']: () => nav.pop(),
        }
      : undefined;
    const left = centreLeft(cols, w);
    const top = Math.max(0, Math.floor((rows - h) / 2));
    return (
      <div
        class="wc-ped-overlay"
        role="dialog"
        aria-modal="true"
        style={{
          left: `calc(var(--cell-w) * ${left})`,
          top: `calc(var(--cell-h) * ${top})`,
          width: `calc(var(--cell-w) * ${w})`,
          height: `calc(var(--cell-h) * ${h})`,
        }}
      >
        <div class="wc-line wc-c-section">{'┌' + '─'.repeat(w - 2) + '┐'}</div>
        {lines.map((l) => (
          <div class="wc-line">
            <span class="wc-c-section">│</span>
            {l.text === MODAL_HINT ? (
              <span class={l.cls} style={indent(centreLeft(w - 2, cellLen(hint)))}>
                {tap ? escHints(truncate(hint, w - 2), tap) : truncate(hint, w - 2)}
              </span>
            ) : (
              <span class={l.cls} style={indent(centreLeft(w - 2, cellLen(l.text)))}>
                {truncate(l.text, w - 2)}
              </span>
            )}
            <span class="wc-ped-overlay-r wc-c-section">│</span>
          </div>
        ))}
        <div class="wc-line wc-c-section">{'└' + '─'.repeat(w - 2) + '┘'}</div>
      </div>
    );
  }
}
