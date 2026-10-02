// Scripts page (spec §2.10, ADR 0051 "P2"): the script library beside the
// profile, under Profile on the start page and in the ESC menu.
//
//   [ NEW IMPORT EXPORT RENAME DELETE MANUAL ]
//   [ [X] name        🔒 ● EDIT ]  ░   [ help of the selected script ]
//   [   name:3: error text        ]
//
// Two focus zones: the button row and the list (default). In the list,
// ↑↓ pick a script, ←→ move between its toggle and EDIT, Enter/Space
// press the one under the cursor, PgUp/PgDn scroll the help. ↑ on the
// first script reaches the buttons. The help panel (scripts-model.ts
// `helpRows`) is read-only: settings change with `#script set`.
//
// The cursor row's name has the grey band (the script whose help is
// shown); the amber marks where the keys go (the toggle's brackets or
// EDIT's fill), as in the profile editor. Feedback goes to the flash row.
//
// EXPORT asks: this script as `.lua`, or all scripts as one backup file
// (src/scripts/backup.ts, ADR 0053 P3). IMPORT takes either: a `.lua`
// file shows its code first, a backup shows what it holds and restores
// on Y (everything turned off).

import './scripts.css';
import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { SCRIPT_NAME_MAX, type ScriptInfo, type ScriptLibrary, scriptNameError } from '../../scripts';
import {
  BadScriptBackupError,
  type ScriptBackup,
  formatScriptBackup,
  looksLikeScriptBackup,
  parseScriptBackup,
  scriptBackupFileName,
} from '../../scripts/backup';
import { knownSyntaxProblem, syntaxProblem } from '../../scripts/check';
import { downloadBlob } from '../kit/download';
import { useGrid, useServices } from '../kit/hooks';
import { centreLeft, truncate } from '../kit/nav';
import { TuiScrollbar, useScrollBox } from '../kit/scroll';
import { type Nav, useIsTop, useKeys, useNav } from '../kit/stack';
import {
  Blank,
  Button,
  Centered,
  CheckCell,
  FlashRow,
  type MenuItem,
  MenuRows,
  Page,
  TextField,
  cellsWide,
  indent,
  menuKey,
  useBodyRows,
  useMenuCursor,
} from '../kit/widgets';
import {
  EDIT_LABEL,
  LIST_GAP,
  type Row,
  SCRIPT_BUTTONS,
  type ScriptButton,
  type SyntaxLookup,
  buttonW,
  helpRows,
  listLines,
  problemText,
  scriptState,
  scriptsLayout,
} from './scripts-model';

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const NAME_HINT = `A letter, then letters, digits, _ or -. At most ${SCRIPT_NAME_MAX}.`;

/** The Scripts page; a note when this page has no script library. */
export function ScriptsFrame(): VNode {
  const { scripts } = useServices();
  const nav = useNav();
  if (!scripts) {
    return (
      <Page title="Scripts" footer={[{ text: 'ESC Back', onClick: () => nav.pop() }]}>
        <Centered text="Scripts are not available here." class="wc-c-hint" />
      </Page>
    );
  }
  return <ScriptsPage lib={scripts} />;
}

/** The library's list, kept current. */
function useScriptList(lib: ScriptLibrary): { list: ScriptInfo[]; ready: boolean } {
  const [state, set] = useState(() => ({ list: lib.list(), ready: false }));
  useEffect(() => {
    let alive = true;
    const off = lib.subscribe(() => set((s) => ({ ...s, list: lib.list() })));
    lib.init().then(
      () => alive && set({ list: lib.list(), ready: true }),
      () => alive && set({ list: lib.list(), ready: true }),
    );
    return () => {
      alive = false;
      off();
    };
  }, [lib]);
  return state;
}

/**
 * Compile errors of the scripts the host has not loaded (off, or no host
 * yet), checked lazily without running them; the page re-renders as the
 * answers come in.
 */
function useSyntaxProblems(list: readonly ScriptInfo[], running: (name: string) => boolean | null): SyntaxLookup {
  const [, setDone] = useState(0);
  const wanted = list.filter((s) => problemText(s) === null && running(s.name) !== true);
  const todo = wanted.filter((s) => knownSyntaxProblem(s.name, s.source) === undefined);
  const todoKey = todo.map((s) => s.name + ':' + s.updated).join(',');
  useEffect(() => {
    if (todo.length === 0) return;
    let alive = true;
    void Promise.all(todo.map((s) => syntaxProblem(s.name, s.source))).then(() => alive && setDone((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [todoKey]);
  return (s) => (running(s.name) === true ? null : knownSyntaxProblem(s.name, s.source));
}

let editing = false;

/** Loads the editor chunk and pushes the script manual. */
async function openManual(nav: Nav): Promise<void> {
  if (editing) return;
  editing = true;
  const depth = nav.depth();
  try {
    const mod = await import('../../editor');
    if (nav.depth() !== depth) return;
    mod.openScriptManual(nav);
  } catch (e) {
    nav.flash(`Could not open the manual: ${errText(e)}`, 'fail');
  } finally {
    editing = false;
  }
}

/** Loads the editor chunk and pushes the script editor (no-op while loading). */
export async function editScript(nav: Nav, lib: ScriptLibrary, name: string, onName: (n: string) => void): Promise<void> {
  if (editing) return;
  editing = true;
  const depth = nav.depth();
  try {
    const mod = await import('../../editor');
    if (nav.depth() !== depth) return;
    mod.openScriptEditor(nav, { library: lib, name, onName });
  } catch (e) {
    nav.flash(`Could not open the editor: ${errText(e)}`, 'fail');
  } finally {
    editing = false;
  }
}

/** A padlock one cell wide, in the current colour (bundled scripts). */
function Lock(): VNode {
  return (
    <span class="wc-scr-lock" title="Bundled with WebCockpit: read-only. Duplicate it to change it.">
      <svg viewBox="0 0 10 20" aria-label="read-only">
        <path d="M2.9 9.5V6.6a2.1 2.1 0 0 1 4.2 0V9.5" fill="none" stroke="currentColor" stroke-width="1.5" />
        <rect x="1" y="9" width="8" height="7.4" rx="1" fill="currentColor" />
      </svg>
    </span>
  );
}

function ScriptsPage({ lib }: { lib: ScriptLibrary }): VNode {
  const { scriptRunning } = useServices();
  const nav = useNav();
  const isTop = useIsTop();
  const { cols } = useGrid();
  const bodyRows = useBodyRows();
  const { list, ready } = useScriptList(lib);
  const [cursorName, setCursorName] = useState<string | null>(null);
  const [zone, setZone] = useState<'buttons' | 'list'>('list');
  const [btn, setBtn] = useState(0);
  const [col, setCol] = useState<0 | 1>(0);
  const listBox = useScrollBox();
  const helpBox = useScrollBox();
  const [, setTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // The host's running state changes without a library event: polled.
  useEffect(() => {
    if (!isTop) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [isTop]);

  let cursor = list.findIndex((s) => s.name === cursorName);
  if (cursor < 0) cursor = 0;
  const cur: ScriptInfo | undefined = list[cursor];
  const running = (name: string): boolean | null => scriptRunning?.(name) ?? null;

  // ------------------------------------------------------------- layout

  const L = scriptsLayout(
    cols,
    list.map((s) => s.name),
  );
  const pkgH = Math.max(4, bodyRows - 2);
  const listVisible = Math.max(1, pkgH - 2);
  const syntax = useSyntaxProblems(list, running);
  const lines = listLines(list, syntax);
  const curLine = Math.max(0, lines.findIndex((l) => l.kind === 'script' && l.index === cursor));
  const curEnd = lines[curLine + 1]?.kind === 'error' ? curLine + 1 : curLine;
  // The cursor (and its error line) pulls the list along when it moves.
  useLayoutEffect(() => listBox.show(curLine, curEnd), [curLine, curEnd, listVisible, lines.length]);

  const help: Row[] = cur && L.detailW > 0 ? helpRows(cur, running(cur.name), L.detailW - 1, syntax) : [];
  useLayoutEffect(() => helpBox.home(), [cur?.name]);

  // ------------------------------------------------------------ actions

  const select = (name: string): void => setCursorName(name);
  const moveTo = (i: number): void => {
    const s = list[Math.max(0, Math.min(list.length - 1, i))];
    if (s) select(s.name);
  };

  const disabled = (b: ScriptButton): boolean => {
    if (b === 'NEW' || b === 'IMPORT' || b === 'MANUAL') return false;
    if (!cur) return true;
    return (b === 'RENAME' || b === 'DELETE') && cur.readonly;
  };
  const btnEnabled = (i: number): boolean => !disabled(SCRIPT_BUTTONS[i]!);
  const bIdx = btnEnabled(btn) ? btn : Math.max(0, SCRIPT_BUTTONS.findIndex((_, i) => btnEnabled(i)));

  const toggle = async (s: ScriptInfo): Promise<void> => {
    try {
      await lib.setEnabled(s.name, !s.enabled);
      if (s.enabled) nav.flash(`${s.name} is off.`);
      else nav.flash(running(s.name) === null ? `${s.name} is on. It runs when you enter MUME.` : `${s.name} is on.`);
    } catch (e) {
      nav.flash(errText(e), 'fail');
    }
  };

  const edit = (s: ScriptInfo): void => void editScript(nav, lib, s.name, select);

  const exportCur = (): void => {
    if (cur) nav.push(<ExportFrame lib={lib} name={cur.name} />);
  };

  const onFile = async (): Promise<void> => {
    const input = fileRef.current;
    const file = input?.files?.[0];
    if (!input || !file) return;
    input.value = '';
    try {
      const text = await file.text();
      if (looksLikeScriptBackup(text)) {
        nav.push(<RestoreFrame lib={lib} fileName={file.name} backup={parseScriptBackup(text)} done={select} />);
      } else {
        nav.push(<ImportFrame lib={lib} fileName={file.name} text={text} done={select} />);
      }
    } catch (e) {
      nav.flash(e instanceof BadScriptBackupError ? `Restore failed: ${e.message}` : `Import failed: ${errText(e)}`, 'fail');
    }
  };

  const press = (b: ScriptButton): void => {
    if (disabled(b)) return;
    switch (b) {
      case 'NEW':
        return nav.push(<NameFrame lib={lib} mode="create" done={(n) => (select(n), setZone('list'))} />);
      case 'IMPORT':
        fileRef.current?.click();
        return;
      case 'EXPORT':
        return exportCur();
      case 'RENAME':
        return nav.push(<NameFrame lib={lib} mode="rename" from={cur!.name} done={(n) => (select(n), setZone('list'))} />);
      case 'DELETE':
        return nav.push(<DeleteFrame lib={lib} name={cur!.name} done={(n) => (setCursorName(n), setZone('list'))} />);
      case 'MANUAL':
        return void openManual(nav);
    }
  };

  useKeys((_e, nk) => {
    if (nk === 'tab' || nk === 'backtab') {
      setZone(zone === 'list' ? 'buttons' : 'list');
      return true;
    }
    if (nk === 'pgup' || nk === 'pgdn') {
      helpBox.page(nk === 'pgup' ? -1 : 1);
      return true;
    }
    if (zone === 'buttons') {
      switch (nk) {
        case 'left':
        case 'right': {
          const d = nk === 'left' ? -1 : 1;
          for (let i = bIdx + d; i >= 0 && i < SCRIPT_BUTTONS.length; i += d) {
            if (btnEnabled(i)) {
              setBtn(i);
              break;
            }
          }
          return true;
        }
        case 'down':
          if (list.length > 0) setZone('list');
          return true;
        case 'up':
          return true;
        case 'activate':
          press(SCRIPT_BUTTONS[bIdx]!);
          return true;
      }
      return false;
    }
    switch (nk) {
      case 'up':
        if (cursor <= 0) setZone('buttons');
        else moveTo(cursor - 1);
        return true;
      case 'down':
        moveTo(cursor + 1);
        return true;
      case 'home':
        moveTo(0);
        return true;
      case 'end':
        moveTo(list.length - 1);
        return true;
      case 'left':
        setCol(0);
        return true;
      case 'right':
        setCol(1);
        return true;
      case 'activate':
        if (!cur) setZone('buttons');
        else if (col === 0) void toggle(cur);
        else edit(cur);
        return true;
    }
    return false;
  });

  // ------------------------------------------------------------- render

  const listFocused = zone === 'list';
  const buttonRow = (
    <div class="wc-line wc-scr-buttons">
      {SCRIPT_BUTTONS.map((b, i) => (
        <>
          {i > 0 && ' '}
          <Button
            label={b}
            width={buttonW(b)}
            selected={i === bIdx}
            focused={zone === 'buttons'}
            disabled={disabled(b)}
            onClick={() => {
              setBtn(i);
              setZone('buttons');
              press(b);
            }}
          />
        </>
      ))}
    </div>
  );

  // All lines in a native scroll box (pixels, as EDITOR); the TUI scrollbar beside it.
  const listRows = Array.from({ length: Math.max(listVisible, lines.length) }, (_, vi) => {
    const ln = lines[vi];
    if (!ln) {
      if (vi === 0 && ready && list.length === 0) {
        return (
          <div class="wc-line" key={vi}>
            <span class="wc-c-hint">{truncate('No scripts yet: NEW writes one.', L.listW)}</span>
          </div>
        );
      }
      return <div class="wc-line" key={vi} />;
    }
    const s = list[ln.index]!;
    if (ln.kind === 'error') {
      return (
        <div class="wc-line" key={vi}>
          <span class="wc-c-err wc-scr-error" title={ln.text} style={cellsWide(L.listW)}>
            {truncate('    ' + ln.text, L.listW)}
          </span>
        </div>
      );
    }
    const isCur = ln.index === cursor;
    const st = scriptState(s, running(s.name));
    const nameCls = 'wc-tr wc-scr-name' + (isCur ? ' is-cur' : s.enabled ? '' : ' is-off');
    return (
      <div class="wc-line wc-scr-row" key={vi} data-script={s.name}>
        <CheckCell
          checked={s.enabled}
          cursor={isCur && listFocused && col === 0}
          title={s.enabled ? `Turn ${s.name} off` : `Turn ${s.name} on`}
          onClick={() => {
            select(s.name);
            setZone('list');
            setCol(0);
            void toggle(s);
          }}
        />
        {' '}
        <span
          class={nameCls}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            select(s.name);
            setZone('list');
          }}
        >
          {truncate(s.name, L.nameW).padEnd(L.nameW)}
        </span>
        {' '}
        {s.bundled ? <Lock /> : ' '}
        {' '}
        <span class={'wc-scr-mark ' + st.markCls} title={st.markTitle || undefined}>
          {st.mark}
        </span>
        {' '}
        <Button
          label={EDIT_LABEL}
          width={buttonW(EDIT_LABEL)}
          selected={isCur && col === 1}
          focused={listFocused}
          onClick={() => {
            select(s.name);
            setZone('list');
            setCol(1);
            edit(s);
          }}
        />
      </div>
    );
  });

  const helpPanel =
    L.detailW > 0 ? (
      <div class="wc-scr-help wc-scrollrow" style={{ ...cellsWide(L.detailW), height: `calc(var(--cell-h) * ${pkgH})` }}>
        <div class="wc-scrollbox wc-scr-help-rows" ref={helpBox.ref} style={cellsWide(L.detailW - 1)}>
          {Array.from({ length: Math.max(pkgH, help.length) }, (_, vi) => (
            <div class="wc-line" key={vi}>
              <span class="wc-scr-help-text" style={cellsWide(L.detailW - 1)}>
                {(help[vi] ?? []).map((s) => (
                  <span class={s.cls}>{s.text}</span>
                ))}
              </span>
            </div>
          ))}
        </div>
        {help.length > pkgH && <TuiScrollbar target={helpBox.ref} rows={pkgH} />}
      </div>
    ) : null;

  const footer =
    zone === 'buttons'
      ? ['←→ Navigate', 'Enter Select', '↓ List', 'Tab Cycle', 'ESC Back']
      : ['↑↓ Navigate', '←→ Toggle/Edit', 'Enter Select', 'PgUp/PgDn Help', 'Tab Cycle', 'ESC Back'];

  return (
    <Page title="Scripts" footer={footer}>
      <div class="wc-scr" style={{ ...indent(L.at), display: 'flex', height: `calc(var(--cell-h) * ${pkgH})` }}>
        <div class="wc-scr-left" style={cellsWide(L.listW + 1)}>
          {buttonRow}
          <div class="wc-line" />
          <div class="wc-scrollrow" style={{ height: `calc(var(--cell-h) * ${listVisible})` }}>
            <div class="wc-scrollbox wc-scr-list" ref={listBox.ref} style={cellsWide(L.listW)}>
              {listRows}
            </div>
            {lines.length > listVisible && <TuiScrollbar target={listBox.ref} rows={listVisible} />}
          </div>
        </div>
        {L.detailW > 0 && <div style={{ ...cellsWide(LIST_GAP), flex: '0 0 auto' }} />}
        {helpPanel}
      </div>
      <Blank />
      <FlashRow />
      <input
        ref={fileRef}
        type="file"
        accept=".lua,.json,text/x-lua,text/plain,application/json"
        hidden
        class="wc-script-file"
        onChange={() => void onFile()}
      />
    </Page>
  );
}

// ------------------------------------------------------------ name input

interface NameFrameProps {
  lib: ScriptLibrary;
  mode: 'create' | 'rename';
  from?: string;
  done: (name: string) => void;
}

/** NEW (then the editor opens on the template) and RENAME: a validated name prompt. */
function NameFrame(p: NameFrameProps): VNode {
  const nav = useNav();
  const { cols } = useGrid();
  const [value, setValue] = useState(p.mode === 'rename' ? (p.from ?? '') : '');
  const [error, setError] = useState('');
  const busy = useRef(false);

  const confirm = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      const name = value.trim();
      if (p.mode === 'rename' && name === p.from) return nav.pop();
      const err = scriptNameError(
        name,
        p.lib.list().map((s) => s.name),
        p.mode === 'rename' ? p.from : undefined,
      );
      if (err) return setError(err);
      if (p.mode === 'create') {
        await p.lib.create(name);
        p.done(name);
        // The editor opens in this prompt's place, on the template.
        const mod = await import('../../editor').catch(() => null);
        nav.pop();
        if (mod) mod.openScriptEditor(nav, { library: p.lib, name, onName: p.done });
        else nav.flash(`Created ${name}. It is off until you turn it on.`);
        return;
      }
      await p.lib.rename(p.from!, name);
      p.done(name);
      nav.pop();
      nav.flash(`Renamed to ${name}.`);
    } catch (e) {
      setError(errText(e));
    } finally {
      busy.current = false;
    }
  };

  useKeys((e, nk) => {
    if (nk === 'activate' && e.key === 'Enter') {
      void confirm();
      return true;
    }
    return false;
  });

  const w = Math.min(cols - 4, SCRIPT_NAME_MAX + 4);
  return (
    <Page
      title={p.mode === 'create' ? 'New Script' : 'Rename Script'}
      footer={[
        { text: 'Enter Confirm', onClick: () => void confirm() },
        { text: 'ESC Cancel', onClick: () => nav.pop() },
      ]}
    >
      {p.mode === 'rename' ? (
        <Centered text={`Rename "${p.from}" to:`} class="wc-c-active" />
      ) : (
        <Centered text="Name of the new script:" class="wc-c-active" />
      )}
      <TextField
        value={value}
        onInput={(v) => {
          setValue(v);
          setError('');
        }}
        width={w}
        at={centreLeft(cols, w)}
        maxLength={SCRIPT_NAME_MAX + 8}
        label="Script name"
      />
      <Centered text={NAME_HINT} class="wc-c-hint" />
      {error ? <Centered text={error} class="wc-c-danger" /> : <Blank />}
    </Page>
  );
}

/** DELETE: `Delete script 'name'?  (y/N)`; any other key cancels (ADR 0039's profile form). */
function DeleteFrame(p: { lib: ScriptLibrary; name: string; done: (next: string | null) => void }): VNode {
  const nav = useNav();
  const confirm = async (): Promise<void> => {
    try {
      const names = p.lib.list().map((s) => s.name);
      const i = names.indexOf(p.name);
      await p.lib.remove(p.name);
      const left = p.lib.list().map((s) => s.name);
      p.done(left[Math.min(i, left.length - 1)] ?? null);
      nav.pop();
      nav.flash(`Deleted ${p.name}.`);
    } catch (e) {
      nav.pop();
      nav.flash(errText(e), 'fail');
    }
  };
  useKeys((e) => {
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return true;
    if (e.key === 'y' || e.key === 'Y') void confirm();
    else nav.pop();
    return true;
  });
  return (
    <Page
      title="Delete Script"
      footer={[
        { text: 'Y Confirm', onClick: () => void confirm() },
        { text: 'any other key Cancel', onClick: () => nav.pop() },
      ]}
    >
      <Centered text={`Delete script '${p.name}'?  (y/N)`} class="wc-c-active" />
      <Centered text="Its settings and saved data go too." class="wc-c-hint" />
    </Page>
  );
}

// ---------------------------------------------------------------- export

/** EXPORT: the selected script as `.lua`, or every script as one backup file. */
function ExportFrame(p: { lib: ScriptLibrary; name: string }): VNode {
  const nav = useNav();
  const one = (): void => {
    try {
      const f = p.lib.exportFile(p.name);
      downloadBlob(new Blob([f.text], { type: 'text/x-lua;charset=utf-8' }), f.fileName);
      nav.pop();
      nav.flash(`Exported ${f.fileName}.`);
    } catch (e) {
      nav.pop();
      nav.flash(`Export failed: ${errText(e)}`, 'fail');
    }
  };
  const all = (): void => {
    try {
      const name = scriptBackupFileName(new Date());
      downloadBlob(new Blob([formatScriptBackup(p.lib.backupRecords())], { type: 'application/json;charset=utf-8' }), name);
      const n = p.lib.list().filter((s) => !s.bundled).length;
      nav.pop();
      nav.flash(`Exported ${n} script${n === 1 ? '' : 's'} and all settings to ${name}.`);
    } catch (e) {
      nav.pop();
      nav.flash(`Export failed: ${errText(e)}`, 'fail');
    }
  };
  const items: MenuItem[] = [
    { key: 'one', label: `This script (${p.name}.lua)`, activate: one },
    { key: 'all', label: 'All scripts and their data (backup)', activate: all },
    { key: 'sp', spacer: true },
    { key: 'back', label: 'Back', activate: () => nav.pop() },
  ];
  const [cursor, setCursor] = useMenuCursor(items);
  useKeys((_e, nk) => menuKey(items, cursor, setCursor, nk));
  return (
    <Page title="Export Scripts" footer={['↑↓ Navigate', 'Enter Select', 'ESC Back']}>
      <MenuRows items={items} cursor={cursor} setCursor={setCursor} />
      <Blank />
      <Centered text="A backup holds your own scripts, every script's settings and saved data." class="wc-c-hint" />
      <Centered text="IMPORT reads it back." class="wc-c-hint" />
    </Page>
  );
}

/**
 * IMPORT of a backup file: what it holds and a warning; Y restores
 * (scripts added turned off), any other key cancels.
 */
function RestoreFrame(p: { lib: ScriptLibrary; fileName: string; backup: ScriptBackup; done: (name: string) => void }): VNode {
  const nav = useNav();
  const { cols } = useGrid();
  const busy = useRef(false);
  const b = p.backup;
  const confirm = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await p.lib.restore(b);
      if (r.added[0]) p.done(r.added[0]);
      nav.pop();
      const parts = [`Restored ${r.added.length} script${r.added.length === 1 ? '' : 's'}`];
      if (r.skipped.length) parts.push(`${r.skipped.length} already present`);
      if (r.renamed.length) parts.push(`renamed ${r.renamed.map(([a, c]) => `${a} → ${c}`).join(', ')}`);
      parts.push(`settings and data of ${r.data}`);
      nav.flash(`${parts.join(', ')}. Restored scripts are off.`);
    } catch (e) {
      nav.pop();
      nav.flash(`Restore failed: ${errText(e)}`, 'fail');
    }
  };
  useKeys((e) => {
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return true;
    if (e.key === 'y' || e.key === 'Y') void confirm();
    else nav.pop();
    return true;
  });
  const names = b.scripts.map((s) => s.name).join(', ');
  const w = Math.max(20, cols - 4);
  return (
    <Page
      title="Restore Scripts"
      footer={[
        { text: 'Y Restore', onClick: () => void confirm() },
        { text: 'any other key Cancel', onClick: () => nav.pop() },
      ]}
    >
      <Centered text="These scripts can send commands to the game as you." class="wc-c-err" />
      <Centered text={truncate(`Restore from ${p.fileName}?  (y/N)`, w)} class="wc-c-active" />
      <Blank />
      <Centered
        text={truncate(`${b.scripts.length} script${b.scripts.length === 1 ? '' : 's'}${names ? `: ${names}` : ''}`, w)}
        class="wc-c-item"
      />
      <Centered text={`Settings and saved data of ${b.data.length} script${b.data.length === 1 ? '' : 's'}.`} class="wc-c-item" />
      <Blank />
      <Centered text={truncate('Only what is missing is added; nothing here is replaced. Scripts are added turned off.', w)} class="wc-c-hint" />
    </Page>
  );
}

// ---------------------------------------------------------------- import

/**
 * IMPORT: the file's code and a warning before it is added (spec §2.10).
 * ↑↓ PgUp/PgDn scroll; Y imports (turned off); ESC cancels.
 */
function ImportFrame(p: { lib: ScriptLibrary; fileName: string; text: string; done: (name: string) => void }): VNode {
  const nav = useNav();
  const { cols } = useGrid();
  const bodyRows = useBodyRows();
  const box = useScrollBox();
  const busy = useRef(false);
  const code = p.text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  const numW = String(code.length).length;
  const w = Math.max(20, Math.min(cols - 4, 100));
  const at = centreLeft(cols, w);
  // warning (2) + blank + box top + code + box bottom + blank + flash
  const visible = Math.max(3, bodyRows - 7);

  const confirm = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      const info = await p.lib.importFile(p.fileName, p.text);
      p.done(info.name);
      nav.pop();
      nav.flash(`Imported ${info.name} from ${p.fileName}. It is off until you turn it on.`);
    } catch (e) {
      busy.current = false;
      nav.flash(`Import failed: ${errText(e)}`, 'fail');
    }
  };

  useKeys((e, nk) => {
    if ((e.key === 'y' || e.key === 'Y') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      void confirm();
      return true;
    }
    switch (nk) {
      case 'up':
        box.by(-1);
        return true;
      case 'down':
        box.by(1);
        return true;
      case 'pgup':
        box.page(-1);
        return true;
      case 'pgdn':
      case 'activate':
        box.page(1);
        return true;
      case 'home':
        box.home();
        return true;
      case 'end':
        box.end();
        return true;
    }
    return false;
  });

  const inner = w - 2;
  const textW = inner - numW - 2;
  // The code lines do not change while scrolling: built once.
  const rows = useMemo(
    () =>
      Array.from({ length: Math.max(visible, code.length) }, (_, i) => {
        const l = code[i];
        const text = l === undefined ? '' : truncate(l.replace(/\t/g, '  '), textW);
        return (
          <div class="wc-line" key={i}>
            <span class="wc-c-hint">{l === undefined ? ' '.repeat(numW) : String(i + 1).padStart(numW)}</span>
            {'  '}
            <span class="wc-c-item wc-scr-code">{text.padEnd(textW)}</span>
          </div>
        );
      }),
    [p.text, visible, textW],
  );
  const side = <div class="wc-c-hint wc-scr-import-side">{Array.from({ length: visible }, () => '│').join('\n')}</div>;
  return (
    <Page
      title="Import Script"
      footer={['↑↓ Scroll', { text: 'Y Import', onClick: () => void confirm() }, { text: 'ESC Cancel', onClick: () => nav.pop() }]}
    >
      <Centered text="This script can send commands to the game as you." class="wc-c-err" />
      <Centered text={truncate(`Read ${p.fileName} before you import it. It is added turned off.`, cols)} class="wc-c-hint" />
      <Blank />
      <div class="wc-scr-import" style={indent(at)}>
        <div class="wc-line wc-c-hint">{'┌' + truncate(`─ ${p.fileName} `, inner).padEnd(inner, '─') + '┐'}</div>
        {/* The code scrolls natively (pixels, as EDITOR) between the box sides. */}
        <div class="wc-scrollrow" style={{ height: `calc(var(--cell-h) * ${visible})` }}>
          {side}
          <div class="wc-scrollbox wc-scr-import-code" ref={box.ref} style={cellsWide(inner)}>
            {rows}
          </div>
          {code.length > visible ? <TuiScrollbar target={box.ref} rows={visible} /> : side}
        </div>
        <div class="wc-line wc-c-hint">{'└' + '─'.repeat(inner) + '┘'}</div>
      </div>
      <Blank />
      <FlashRow />
    </Page>
  );
}
