// The script editor (spec §2.10, ADR 0051 "P2"; stage 44b, ADR 0129): a
// look frame in the lantern look, round 7's editor C "Fokus": the least
// chrome and the most code.
//
// - On the start page a large box (layout B) with the script's name in the
//   hood (`name •` while there are unsaved changes) and Back at the top
//   left; in game the Scripts window's Lykta frame (title "Scripts", the
//   note the name) with a small Back over the well; on the phone's ESC
//   menu a full-screen box.
// - The code well: CodeMirror (lua-cm.ts, stage 42's lantern code theme)
//   fills it. Save, Find and Manual are small glass icons in a frosted
//   pill at its top right (Duplicate instead of Save for a bundled script,
//   with the plate "bundled · read-only" at the top left); they dim while
//   you type and hide while the find row (42's lantern panel, at the top
//   of the well) is open.
// - A quiet status line under the well: the state and the first problem,
//   the flash in the middle, `Modified · Ln, Col` at the right.
// - The unsaved prompt is stage 42's inline `Dialog` (`data-dlg="unsaved"`).
//
// Keys: Ctrl+S saves; F1 opens the script manual (at the API or Lua name
// under the cursor); Ctrl+F finds and replaces (search.ts; Esc closes the
// panel before it closes the editor). Tab and Shift+Tab work as in a code
// editor (lua-cm.ts): accept the completion, else the next or previous
// snippet field, else indent or dedent. Esc closes the pop-ups first
// (completion, signature help, hover, snippet), then the find row, then
// the editor, and asks first when there are unsaved changes. A bundled
// script opens read-only: Tab or ↑ on the first line reaches Duplicate,
// which opens an editable copy in its place. No key hints anywhere: the
// tools' tooltips name their keys.
//
// Speed (stage 44 performance notes): CodeMirror owns the buffer; the
// frame never re-creates the view and re-renders only when the dirty
// state, the problems, the flash or the find row change. The position is a
// small component of its own (`PosLine`), the running poll another
// (`StateLine`), and the tools' typing dim is one class on the root with a
// single timer.
//
// Hooks: `.wc-sed` (the root, `display: contents`, with `data-script`,
// `data-readonly`, `data-zone`), `.wc-sed-well`, `.wc-sed-tools`
// (`[data-btn=SAVE|DUPLICATE|FIND|MANUAL]`), `.wc-sed-ro`,
// `.wc-sed-status` (title: the problem), `.wc-sed-problem`, `.wc-sed-pos`,
// `.wc-lk-flash`, `.wc-lk-dialog[data-dlg="unsaved"]`.

import type { EditorView } from '@codemirror/view';
import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { problemText, scriptState } from '../chrome/frames/scripts-model';
import { useServices } from '../chrome/kit/hooks';
import {
  Box,
  BoxFoot,
  BoxHead,
  Dialog,
  GlassButton,
  Icon,
  InlineBack,
  LookFlash,
  lookFrame,
  useLocalFlash,
  useLookPlace,
  useWindowChrome,
} from '../chrome/kit/look';
import { type Nav, useIsTop, useKeys, useNav, useUnsaved } from '../chrome/kit/stack';
import type { ScriptInfo, ScriptLibrary } from '../scripts';
import { checkScript } from '../scripts/check';
import { useSkyPause } from '../chrome/start-surface';
import { type BufferStatus, handleKey, onFirstLine } from './cm';
import { nameAt } from './lua-api';
import { completing, createLuaBuffer, dismissPopups, snippetTab } from './lua-cm';
import { type ScriptDiagnostic, diagnosticText } from './lua-diagnostics';
import { markScriptSaved, setScriptLastError } from './lua-lint';
import { openScriptManual } from './script-manual-frame';
import { openSearch, searchFocused, searchFrameKey } from './search';
import './script-editor.css';

export interface ScriptEditorHost {
  library: ScriptLibrary;
  /** The script to edit. */
  name: string;
  /** The script now has another name (a save took a new `@name`, Duplicate opened the copy). */
  onName?: (name: string) => void;
}

type Zone = 'buttons' | 'buffer';

/** How long the tools stay dim after the last input. */
const TYPING_MS = 1600;
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Pushes the script editor for `host.name` (no-op when the script is gone). */
export function openScriptEditor(nav: Nav, host: ScriptEditorHost): void {
  if (!host.library.get(host.name)) return nav.flash(`No script "${host.name}".`, 'fail');
  nav.push(<ScriptEditor host={host} />);
}

// ------------------------------------------------------------ small stores

/** A value outside Preact's state: its readers re-render alone (the cursor's position). */
interface Cell<T> {
  get(): T;
  set(v: T): void;
  sub(fn: () => void): () => void;
}

function cell<T>(v: T): Cell<T> {
  const fns = new Set<() => void>();
  return {
    get: () => v,
    set(next) {
      v = next;
      for (const fn of fns) fn();
    },
    sub(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
  };
}

function useCell<T>(c: Cell<T>): T {
  const [, bump] = useState(0);
  useLayoutEffect(() => c.sub(() => bump((n) => n + 1)), [c]);
  return c.get();
}

// ------------------------------------------------------------ the frame

export const ScriptEditor = lookFrame(function ScriptEditor({ host, flash: initialFlash }: { host: ScriptEditorHost; flash?: string }): VNode {
  const nav = useNav();
  const isTop = useIsTop();
  const place = useLookPlace();
  const lib = host.library;

  const [name, setName] = useState(host.name);
  const [info, setInfo] = useState<ScriptInfo | null>(() => lib.get(host.name));
  const [zone, setZone] = useState<Zone>('buffer');
  const [modal, setModal] = useState<null | 'confirm' | 'saving'>(null);
  const [diags, setDiags] = useState<readonly ScriptDiagnostic[]>([]);
  const [dirty, setDirty] = useState(false);
  const [finding, setFinding] = useState(false);
  const [flash, showFlash] = useLocalFlash();
  const [pos] = useState(() => cell<BufferStatus>({ line: 1, col: 1, unclosed: 0, stray: 0, hint: null }));

  const rootRef = useRef<HTMLDivElement>(null);
  const bufRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const nameRef = useRef(name);
  nameRef.current = name;
  /** The saved text, and the buffer's (kept out of state: no render per keystroke). */
  const savedRef = useRef(lib.get(host.name)?.source ?? '');
  const busy = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const readOnly = info?.readonly ?? true;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const buttons = readOnly ? (['DUPLICATE'] as const) : ([] as const);
  const shown = `${name}${dirty ? ' •' : ''}`;

  // The window's title and note (in game; a no-op elsewhere).
  useWindowChrome({ title: 'Scripts', note: shown });
  // The editor's box is opaque (no blur, an opaque code well): the sky
  // behind it stands still while the editor is on top, so its frames never
  // compete with typing (a no-op outside the start page).
  useSkyPause(true);

  useEffect(() => {
    if (initialFlash) showFlash(initialFlash);
    return () => void (typingTimer.current && clearTimeout(typingTimer.current));
  }, []);

  // The script as the library sees it (state, errors).
  useEffect(() => lib.subscribe(() => setInfo(lib.get(nameRef.current))), [lib]);

  // -------------------------------------------------------------- buffer

  /** The tools dim while typing: one class on the root, one timer. */
  const typed = (): void => {
    const root = rootRef.current;
    if (!root) return;
    root.classList.add('is-typing');
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => root.classList.remove('is-typing'), TYPING_MS);
  };

  useLayoutEffect(() => {
    if (!bufRef.current) return;
    const view = createLuaBuffer(bufRef.current, {
      text: savedRef.current,
      readOnly,
      onStatus: (s) => pos.set(s),
      onChange: (text) => {
        setDirty(!readOnlyRef.current && text !== savedRef.current);
        typed();
      },
      onFocus: () => setZone('buffer'),
      onSearch: setFinding,
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

  // Keyboard focus follows the zone: the buffer, else the frame stack (the
  // tools never take the focus; the prompt's keys come through the stack).
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !isTop) return;
    const v = viewRef.current;
    if (zone === 'buffer' && v && !modal) {
      if (!v.hasFocus && !searchFocused(v)) v.focus();
      return;
    }
    const stack = root.closest<HTMLElement>('.wc-stack');
    if (stack && root.ownerDocument.activeElement !== stack) stack.focus({ preventScroll: true });
  });

  // ------------------------------------------------------------- actions

  const current = (): string => viewRef.current?.state.doc.toString() ?? savedRef.current;
  const unsaved = (): boolean => !readOnlyRef.current && current() !== savedRef.current;

  /** Saves the buffer. True when it was saved. */
  const save = async (): Promise<boolean> => {
    if (readOnly || busy.current) return false;
    busy.current = true;
    const src = current();
    const before = nameRef.current;
    try {
      const r = await lib.save(before, src);
      if (viewRef.current) markScriptSaved(viewRef.current, src);
      savedRef.current = src;
      setDirty(current() !== src);
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
    if (modal) return;
    if (unsaved()) return setModal('confirm');
    nav.pop();
  };
  // A window's close request waits for the prompt; the Exit popup warns (ADR 0103).
  useUnsaved(unsaved, modal !== null);

  const keepEditing = (): void => {
    if (modal === 'confirm') setModal(null);
  };
  const discard = (): void => {
    if (modal === 'confirm') nav.pop();
  };
  const saveAndClose = async (): Promise<void> => {
    if (modal !== 'confirm') return;
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
    let at: string | undefined;
    if (atCursor && v) {
      const head = v.state.selection.main.head;
      const line = v.state.doc.lineAt(head);
      const hit = nameAt(line.text, head - line.from);
      if (hit) at = hit.doc.name;
    }
    openScriptManual(nav, at);
  };

  const find = (): void => {
    const v = viewRef.current;
    if (!v) return;
    setZone('buffer');
    openSearch(v);
  };

  // ---------------------------------------------------------------- keys

  useKeys((e, nk) => {
    // The prompt is a key layer over this handler (its letters, Enter, Esc); while saving, nothing else.
    if (modal) return true;
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
    // The buffer's pop-ups and snippet fields take Esc and Tab first.
    if (zone === 'buffer' && v && !searchFocused(v)) {
      if (nk === 'back' && dismissPopups(v)) return true;
      if ((nk === 'tab' || nk === 'backtab') && snippetTab(v, nk === 'backtab')) return true;
      // An editable buffer keeps Tab: indent and dedent (lua-cm.ts).
      if ((nk === 'tab' || nk === 'backtab') && !readOnly) {
        handleKey(v, e);
        return true;
      }
    }
    // Find and replace: Ctrl+F, the panel's keys, and Esc closes it first.
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
      if (nk === 'activate') void duplicate();
      else if (nk === 'down') {
        v?.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
        setZone('buffer');
      } else if (nk !== 'left' && nk !== 'right' && nk !== 'up') return false;
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

  const inWindow = place === 'window' && nav.depth() > 1;
  const tools = (
    <div class="wc-sed-tools" role="toolbar" aria-label="Editor">
      {readOnly ? (
        <GlassButton
          id="DUPLICATE"
          label="Duplicate"
          icon="duplicate"
          keepIcon
          primary
          small
          selected={zone === 'buttons' && !modal}
          title="Make your own copy to edit"
          onClick={() => void duplicate()}
        />
      ) : (
        <GlassButton id="SAVE" icon="save" primary small disabled={!dirty} title="Save (Ctrl+S)" onClick={() => void save()} />
      )}
      <GlassButton id="FIND" icon="find" small title="Find and replace (Ctrl+F, Ctrl+H)" onClick={find} />
      <GlassButton id="MANUAL" icon="book" small title="The manual at the name under the cursor (F1)" onClick={() => manual(true)} />
    </div>
  );

  return (
    <div
      class={'wc-sed' + (finding ? ' is-finding' : '')}
      ref={rootRef}
      data-zone={zone}
      data-script={name}
      data-readonly={readOnly ? 'true' : 'false'}
    >
      <Box size="large" title={shown} label={`Script editor: ${name}`} onBack={close} winClass="wc-sed-win">
        {inWindow && (
          <BoxHead class="wc-sed-head">
            <InlineBack onClick={close} />
          </BoxHead>
        )}
        <div class="wc-sed-well">
          {readOnly && (
            <span class="wc-sed-ro" title="Bundled with WebCockpit: read-only. Duplicate it to change it.">
              <Icon name="lock" />
              bundled · read-only
            </span>
          )}
          {tools}
          <div class="wc-sed-buf" ref={bufRef} />
        </div>
        <BoxFoot class="wc-sed-line">
          <StateLine info={info} name={name} dirty={dirty} diags={diags} />
          <LookFlash class="wc-sed-flash" flash={flash} />
          <PosLine pos={pos} dirty={dirty} />
        </BoxFoot>
        {modal && (
          <Dialog
            inline
            dlg="unsaved"
            width={540}
            title={modal === 'saving' ? 'Saving…' : 'Unsaved changes'}
            onCancel={keepEditing}
            buttons={[
              { id: 'KEEP', label: 'Keep editing', disabled: modal === 'saving', run: keepEditing },
              { id: 'NO', label: 'No, discard', letter: 'n', danger: true, disabled: modal === 'saving', run: discard },
              { id: 'YES', label: 'Yes, save', letter: 'y', primary: true, disabled: modal === 'saving', run: () => void saveAndClose() },
            ]}
          >
            <p class="wc-lk-q">
              Save changes to <b>{name}</b>?
            </p>
          </Dialog>
        )}
      </Box>
    </div>
  );
});

// ------------------------------------------------------------ the status line

type Dot = 'on' | 'wait' | 'off' | 'bad';

/** The status dot: running, on but not yet (starting, at login), off, or failed. */
function dotOf(s: ScriptInfo, running: boolean | null): Dot {
  if (!s.enabled) return 'off';
  if (running === true) return 'on';
  if (s.lastError || s.loadProblem) return 'bad';
  return 'wait';
}

/**
 * The state and the first problem: the first live error of the buffer
 * (lua-lint.ts), else the saved script's load or last error, else its
 * first header problem. With unsaved changes the saved script's problems
 * may be fixed already: only the live ones show. The host's running state
 * changes without a library event: polled every second while the editor
 * is the top frame.
 */
function StateLine(p: { info: ScriptInfo | null; name: string; dirty: boolean; diags: readonly ScriptDiagnostic[] }): VNode {
  const isTop = useIsTop();
  const { scriptRunning } = useServices();
  const ask = (): boolean | null => scriptRunning?.(p.name) ?? null;
  const [running, setRunning] = useState(ask);
  useEffect(() => {
    setRunning(ask());
    if (!isTop) return;
    const t = setInterval(() => setRunning(ask()), 1000);
    return () => clearInterval(t);
  }, [isTop, p.name]);

  const info = p.info;
  const st = info ? scriptState(info, running) : null;
  const dot = info ? dotOf(info, running) : 'off';
  const live = p.diags[0] ? diagnosticText(p.diags[0]) : null;
  const saved = info && !p.dirty ? info : null;
  const problem = live ?? (saved ? problemText(saved) : null);
  const extra = problem ?? (saved && saved.problems.length > 0 ? `Header ${saved.problems[0]}` : null);
  return (
    <div class="wc-sed-status" title={extra ?? undefined}>
      {st && (
        <span class={`wc-sed-st is-${dot}`}>
          <i class={`wc-sed-dot is-${dot}`} aria-hidden="true" />
          {st.text}
        </span>
      )}
      {extra && <span class="wc-sed-problem">{extra}</span>}
    </div>
  );
}

/** `Modified · Ln 12, Col 5`: the cursor's place, re-rendered alone. */
function PosLine(p: { pos: Cell<BufferStatus>; dirty: boolean }): VNode {
  const s = useCell(p.pos);
  return (
    <div class="wc-sed-pos">
      {p.dirty && (
        <>
          <span class="wc-sed-mod">Modified</span>
          <span class="wc-sed-sep">·</span>
        </>
      )}
      <span>
        Ln {s.line}, Col {s.col}
      </span>
    </div>
  );
}
