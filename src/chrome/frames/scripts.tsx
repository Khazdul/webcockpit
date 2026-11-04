// Scripts page (spec §2.10, ADR 0051 "P2", ADR 0121): the script library
// beside the profile, on the start page's main menu (under Profile, stage
// 32), under Options in the phone's ESC menu, and in the Scripts window
// where the menu bar exists (ADR 0103).
//
//   [ NEW IMPORT MANUAL ]
//                           ┌─┤ name ├──────── EDIT ─ EXPORT ─ RENAME ─ DELETE ─┐
//   [X] name    🔒 ●         summary · status · problems
//   [X] name    🔒 ●  ┘     ─ Settings ─────────────────────────── RESET ALL
//   [X] NAME    🔒 ●        ▸ name*  control           label
//   [X] name    🔒    ┐     ─ Commands ───────────────
//                     │     ▾ Help ─────────────────────────────── PgUp/PgDn
//                     │     ┌ the typeset @help, its own scrollbar ┐
//
// The selected script's row is a tab: it has the panel fill and runs into
// the detail frame, whose left edge is open there. The frame holds the
// script's buttons in its top border (on a row of their own when the frame
// is narrow), its status, its settings as controls that save at once
// (boolean `[ON|OFF]`, number `◂ 25 ▸ unit`, choice `( ) a  (•) b`,
// string `[text]`), RESET ALL, the commands and the help (help-text.ts) in
// a box of its own that takes the rows left. Without room for the frame (a
// phone) the list is alone and every button sits above it.
//
// Three focus zones, Tab / Shift+Tab: the page buttons, the list (default)
// and the detail. List: ↑↓ pick (↑ on the first reaches the buttons),
// Space/Enter turn on or off, → enters the detail. Detail: ↑↓ move over
// the button row, RESET ALL, each setting and the help fold; ←→ and
// Enter act on the row (scripts-model.ts `controlSegs`), a digit starts
// typing a number; Esc (or ← at the start of the button row) returns to
// the list. PgUp/PgDn scroll the help everywhere. The amber marks where
// the keys go, as in the profile editor. Feedback goes to the flash row.
//
// EXPORT asks: this script as `.lua`, or all scripts as one backup file
// (src/scripts/backup.ts, ADR 0053 P3). IMPORT takes either: a `.lua`
// file shows its code first, a backup shows what it holds and restores
// on Y (everything turned off).

import './scripts.css';
import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { SCRIPT_NAME_MAX, type ScriptInfo, type ScriptLibrary, scriptNameError } from '../../scripts';
import type { SettingDecl, SettingValue } from '../../scripts/header';
import {
  BadScriptBackupError,
  type ScriptBackup,
  formatScriptBackup,
  looksLikeScriptBackup,
  parseScriptBackup,
  scriptBackupFileName,
} from '../../scripts/backup';
import { knownSyntaxProblem, syntaxProblem } from '../../scripts/check';
import { device, touchInteraction } from '../../core/device';
import { downloadBlob } from '../kit/download';
import { useGrid, useServices } from '../kit/hooks';
import { cellLen, centreLeft, footerText, truncate } from '../kit/nav';
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
  DETAIL_BUTTONS,
  type DetailModel,
  type Row,
  type ScriptButton,
  type SyntaxLookup,
  buttonRows,
  buttonW,
  clampSetting,
  detailRows,
  edgeChar,
  helpLines,
  listLines,
  problemText,
  scriptState,
  scriptsLayout,
  stepChoice,
  stepSetting,
  valueText,
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

/** Footer hints of a zone, longest first; the first that fits is shown (on a phone the longest wraps). */
function fitFooter(cands: readonly (readonly string[])[], cols: number, phone: boolean): string[] {
  if (phone) return [...cands[0]!];
  return [...(cands.find((c) => cellLen(footerText(c)) <= cols) ?? cands.at(-1)!)];
}

/** The hints of one row: its own keys, then the common ones, shorter and shorter. */
const detailHints = (own: readonly string[]): string[][] => [
  [...own, '↑↓ Rows', 'PgUp/PgDn Help', 'Tab Cycle', 'ESC List'],
  [...own, '↑↓ Rows', 'PgUp/PgDn Help', 'ESC List'],
  [...own, '↑↓ Rows', 'ESC List'],
  [...own, 'ESC List'],
];

/** Rows the help box keeps inside it when the frame is short (ADR 0121). */
const HELP_MIN = 4;

type Zone = 'buttons' | 'list' | 'detail';
interface Editing {
  name: string;
  text: string;
  /** Typing replaces the value (a click on it, Enter): it starts selected. */
  select: boolean;
}

/** The value being typed into a setting: a one-line input, focused when it appears. */
function SettingInput(p: { text: string; width: number; select: boolean; label: string; onInput: (t: string) => void }): VNode {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (p.select) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
    // The stack takes the focus back when the input goes (Enter, Esc).
    const host = el.closest('.wc-stack') as HTMLElement | null;
    return () => {
      if (host && (el.ownerDocument.activeElement === el || el.ownerDocument.activeElement === el.ownerDocument.body)) host.focus({ preventScroll: true });
    };
  }, []);
  return (
    <input
      ref={ref}
      class="wc-field wc-scr-input"
      style={cellsWide(p.width)}
      value={p.text}
      aria-label={p.label}
      spellcheck={false}
      autocomplete="off"
      onInput={(e) => p.onInput((e.currentTarget as HTMLInputElement).value)}
    />
  );
}

function ScriptsPage({ lib }: { lib: ScriptLibrary }): VNode {
  const { scriptRunning } = useServices();
  const nav = useNav();
  const isTop = useIsTop();
  const { cols } = useGrid();
  const { list, ready } = useScriptList(lib);
  const [cursorName, setCursorName] = useState<string | null>(null);
  const [zone, setZone] = useState<Zone>('list');
  const [btn, setBtn] = useState(0);
  const [dBtn, setDBtn] = useState(0);
  const [dCursor, setDCursor] = useState('buttons');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [helpOpen, setHelpOpen] = useState(true);
  const listBox = useScrollBox();
  const helpBox = useScrollBox();
  const outerBox = useScrollBox();
  const [, setTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Setting values being saved, by `script\0setting`: shown at once, and the base of the next step. */
  const pending = useRef(new Map<string, SettingValue>());

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

  const phone = device().phone;
  const L = scriptsLayout(
    cols,
    list.map((s) => s.name),
    phone,
  );
  const framed = L.detailW > 0;
  const hasDetail = framed && !!cur;
  if (zone === 'detail' && !hasDetail) setZone('list');
  const btnRows = buttonRows(L.buttons, L.listW, phone);
  const pageButtons = L.buttons;
  const syntax = useSyntaxProblems(list, running);
  const lines = listLines(list, syntax);
  const curLine = Math.max(0, lines.findIndex((l) => l.kind === 'script' && l.index === cursor));
  const curEnd = lines[curLine + 1]?.kind === 'error' ? curLine + 1 : curLine;

  // The detail frame: its inner width and the script's buttons (in the top border when they fit).
  const iw = Math.max(16, L.detailW - 4);
  const borderBtnsW = DETAIL_BUTTONS.reduce((n, b) => n + buttonW(b), 0) + DETAIL_BUTTONS.length - 1;
  const nameRoom = L.detailW - 1 - 5 - 1 - borderBtnsW - 2;
  const buttonsInside = framed && nameRoom < Math.min(8, cur ? cellLen(cur.name) : 0);
  const values: Record<string, SettingValue> = {};
  if (cur) for (const [k, v] of pending.current) if (k.startsWith(cur.name + '\0')) values[k.slice(cur.name.length + 1)] = v;
  const detail: DetailModel | null = hasDetail
    ? detailRows({
        s: cur!,
        running: running(cur!.name),
        syntax,
        width: iw,
        cursor: zone === 'detail' ? dCursor : null,
        editing: editing ? { name: editing.name, text: editing.text } : null,
        helpOpen,
        buttonsInside,
        values,
      })
    : null;
  const dKeys = detail?.keys ?? ['buttons'];
  const dKey = dKeys.includes(dCursor) ? dCursor : dKeys[0]!;
  const declOf = (key: string): SettingDecl | undefined =>
    key.startsWith('set:') ? cur?.header.settings.find((d) => d.name === key.slice(4)) : undefined;
  const dDecl = declOf(dKey);

  // ------------------------------------------------------------- footer

  const footer = ((): string[] => {
    if (editing) return ['Enter Keep', 'ESC Cancel'];
    if (zone === 'buttons') {
      return fitFooter(
        [
          ['←→ Navigate', 'Enter Select', '↓ List', 'Tab Cycle', 'ESC Back'],
          ['←→ Navigate', 'Enter Select', 'ESC Back'],
        ],
        cols,
        phone,
      );
    }
    if (zone === 'list') {
      if (!framed) {
        return fitFooter(
          [
            ['↑↓ Navigate', 'Space On/off', 'Tab Buttons', 'ESC Back'],
            ['↑↓ Navigate', 'Space On/off', 'ESC Back'],
          ],
          cols,
          phone,
        );
      }
      return fitFooter(
        [
          ['↑↓ Script', 'Space On/off', '→ Details', 'PgUp/PgDn Help', 'Tab Cycle', 'ESC Back'],
          ['↑↓ Script', 'Space On/off', '→ Details', 'PgUp/PgDn Help', 'ESC Back'],
          ['↑↓ Script', 'Space On/off', '→ Details', 'ESC Back'],
          ['↑↓ Script', 'ESC Back'],
        ],
        cols,
        phone,
      );
    }
    const own =
      dKey === 'buttons'
        ? ['←→ Choose', 'Enter Press']
        : dKey === 'reset'
          ? ['Enter Reset all']
          : dKey === 'help'
            ? [helpOpen ? 'Enter Fold' : 'Enter Unfold']
            : dDecl?.type === 'boolean'
              ? ['←→ Switch']
              : dDecl?.type === 'number'
                ? ['←→ Step', '0-9 Type']
                : dDecl?.type === 'choice'
                  ? ['←→ Pick']
                  : ['Enter Edit'];
    return fitFooter(detailHints(own), cols, phone);
  })();
  const bodyRows = useBodyRows(footer);
  const pkgH = Math.max(6, bodyRows - 2);
  // Framed: buttons, the frame's top border, the list beside the frame's inside, its bottom border.
  const listVisible = framed ? Math.max(1, pkgH - btnRows.length - 2) : Math.max(1, pkgH - 1 - btnRows.length);
  // The cursor (and its error line) pulls the list along when it moves.
  useLayoutEffect(() => listBox.show(curLine, curEnd), [curLine, curEnd, listVisible, lines.length]);

  const help: Row[] = hasDetail ? helpLines(cur!, iw - 4) : [];
  useLayoutEffect(() => {
    helpBox.home();
    outerBox.home();
  }, [cur?.name]);

  // The inside of the frame: the top part, then the help box with the rows left (ADR 0121).
  const fixedN = detail?.rows.length ?? 0;
  const freeForHelp = listVisible - fixedN - 2;
  const helpH = helpOpen ? Math.max(HELP_MIN, freeForHelp) : 0;
  const innerN = fixedN + (helpOpen ? helpH + 2 : 0);
  const overflow = innerN > listVisible;
  const keyRow = detail?.rows.findIndex((r) => r.key === dKey) ?? -1;
  useLayoutEffect(() => {
    if (!overflow || keyRow < 0) return;
    let end = keyRow;
    while (detail!.rows[end + 1] && !detail!.rows[end + 1]!.key && detail!.rows[end + 1]!.segs.length > 0 && dKey.startsWith('set:')) end++;
    outerBox.show(keyRow, end);
  }, [dKey, keyRow, overflow, listVisible]);

  // ------------------------------------------------------------ actions

  const select = (name: string): void => {
    if (name !== cur?.name) setEditing(null);
    setCursorName(name);
  };
  const moveTo = (i: number): void => {
    const s = list[Math.max(0, Math.min(list.length - 1, i))];
    if (s) select(s.name);
  };

  const disabled = (b: ScriptButton): boolean => {
    if (b === 'NEW' || b === 'IMPORT' || b === 'MANUAL') return false;
    if (!cur) return true;
    return (b === 'RENAME' || b === 'DELETE') && cur.readonly;
  };
  const firstEnabled = (bs: readonly ScriptButton[], i: number): number => (!disabled(bs[i]!) ? i : Math.max(0, bs.findIndex((b) => !disabled(b))));
  const bIdx = firstEnabled(pageButtons, Math.min(btn, pageButtons.length - 1));
  const dIdx = firstEnabled(DETAIL_BUTTONS, Math.min(dBtn, DETAIL_BUTTONS.length - 1));
  /** The next enabled button of `bs` from `i` going `d`, or -1. */
  const nextEnabled = (bs: readonly ScriptButton[], i: number, d: number): number => {
    for (let j = i + d; j >= 0 && j < bs.length; j += d) if (!disabled(bs[j]!)) return j;
    return -1;
  };

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
      case 'EDIT':
        return edit(cur!);
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

  // ----------------------------------------------------------- settings

  const shown = (d: SettingDecl): SettingValue => values[d.name] ?? cur?.settings[d.name] ?? d.default;

  /** Saves a setting at once (ADR 0121); the value shows while it is being saved. */
  const save = async (s: ScriptInfo, d: SettingDecl, value: SettingValue, say = false): Promise<void> => {
    const k = s.name + '\0' + d.name;
    pending.current.set(k, value);
    setTick((n) => n + 1);
    const r = await lib.setSetting(s.name, d.name, String(value));
    if (pending.current.get(k) === value) pending.current.delete(k);
    setTick((n) => n + 1);
    if (!r.ok) nav.flash(r.reason, 'fail');
    else if (say) nav.flash(`${d.name} = ${valueText(d, r.value)}${d.unit ? ' ' + d.unit : ''}`);
  };

  const resetAll = async (): Promise<void> => {
    if (!cur || !detail?.changed) return;
    setEditing(null);
    for (const k of [...pending.current.keys()]) if (k.startsWith(cur.name + '\0')) pending.current.delete(k);
    try {
      const names = await lib.resetSettings(cur.name);
      nav.flash(names.length > 0 ? `Reset ${names.join(', ')} to the default${names.length > 1 ? 's' : ''}.` : 'Nothing to reset.');
    } catch (e) {
      nav.flash(errText(e), 'fail');
    }
  };

  /** Ends the typing: Enter keeps the value (a number clamped to its range), Esc drops it. */
  const finishEdit = (keep: boolean): void => {
    const ed = editing;
    setEditing(null);
    if (!keep || !ed || !cur) return;
    const d = cur.header.settings.find((x) => x.name === ed.name);
    if (!d) return;
    if (d.type === 'number') {
      const n = Number(ed.text.trim());
      if (ed.text.trim() === '' || !Number.isFinite(n)) {
        nav.flash(`${d.name} must be a number.`, 'fail');
        return;
      }
      const v = clampSetting(d, n);
      if (v !== shown(d)) void save(cur, d, v, true);
      return;
    }
    if (ed.text !== shown(d)) void save(cur, d, ed.text, true);
  };

  const startEdit = (d: SettingDecl, text: string, selectAll: boolean): void => {
    if (d.type !== 'number' && d.type !== 'string') return;
    setEditing({ name: d.name, text, select: selectAll });
  };

  /** ← (-1), → (1), or Enter/Space (0) on a setting. */
  const adjust = (d: SettingDecl, dir: -1 | 0 | 1): void => {
    if (!cur) return;
    const v = shown(d);
    switch (d.type) {
      case 'boolean':
        return void save(cur, d, !v);
      case 'number':
        if (dir === 0) return startEdit(d, valueText(d, v), true);
        {
          const next = stepSetting(d, typeof v === 'number' ? v : Number(d.default), dir);
          if (next !== v) void save(cur, d, next);
        }
        return;
      case 'choice': {
        const opts = d.options ?? [];
        const next = dir === 0 ? opts[(opts.indexOf(v) + 1) % Math.max(1, opts.length)]! : stepChoice(d, v, dir);
        if (next !== v) void save(cur, d, next);
        return;
      }
      default:
        if (dir === 0) startEdit(d, String(v), false);
    }
  };

  /** A click on a run with a `hit` (scripts-model.ts). */
  const hit = (h: string): void => {
    if (!cur) return;
    setZone('detail');
    if (h === 'reset') {
      setDCursor('reset');
      void resetAll();
      return;
    }
    if (h === 'fold') {
      setDCursor('help');
      setHelpOpen((o) => !o);
      return;
    }
    const m = /^set:([^:]+):(.*)$/.exec(h);
    if (!m) return;
    const d = cur.header.settings.find((x) => x.name === m[1]);
    if (!d) return;
    if (editing && editing.name !== d.name) finishEdit(true);
    setDCursor(`set:${d.name}`);
    const what = m[2]!;
    if (what === 'focus') return;
    if (what === 'flip') return adjust(d, 0);
    if (what === 'on' || what === 'off') {
      if (shown(d) !== (what === 'on')) void save(cur, d, what === 'on');
      return;
    }
    if (what === 'dec' || what === 'inc') return adjust(d, what === 'dec' ? -1 : 1);
    if (what === 'type' || what === 'edit') {
      if (editing?.name === d.name) return;
      return startEdit(d, d.type === 'number' ? valueText(d, shown(d)) : String(shown(d)), d.type === 'number');
    }
    if (what.startsWith('opt:')) {
      const o = d.options?.[Number(what.slice(4))];
      if (o !== undefined && o !== shown(d)) void save(cur, d, o);
    }
  };

  // ---------------------------------------------------------------- keys

  const zones: Zone[] = hasDetail ? ['buttons', 'list', 'detail'] : ['buttons', 'list'];
  const scrollHelp = (dir: 1 | -1): void => {
    if (helpOpen && help.length > 0) helpBox.page(dir);
    else outerBox.page(dir);
  };
  const enterDetail = (): void => {
    if (!hasDetail) return;
    setZone('detail');
    setEditing(null);
    const first = dKeys.find((k) => k.startsWith('set:'));
    setDCursor(first ?? 'buttons');
  };

  useKeys((e, nk) => {
    if (editing) {
      if (nk === 'back') {
        finishEdit(false);
        return true;
      }
      if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        finishEdit(true);
        return true;
      }
      if (nk === 'tab' || nk === 'backtab' || nk === 'pgup' || nk === 'pgdn') return true;
      return false;
    }
    if (nk === 'tab' || nk === 'backtab') {
      const i = zones.indexOf(zone);
      const next = zones[(i + (nk === 'tab' ? 1 : zones.length - 1)) % zones.length]!;
      if (next === 'detail') enterDetail();
      else setZone(next === 'list' && list.length === 0 ? 'buttons' : next);
      return true;
    }
    if (nk === 'pgup' || nk === 'pgdn') {
      scrollHelp(nk === 'pgup' ? -1 : 1);
      return true;
    }
    if (zone === 'buttons') {
      switch (nk) {
        case 'left':
        case 'right': {
          const j = nextEnabled(pageButtons, bIdx, nk === 'left' ? -1 : 1);
          if (j >= 0) setBtn(j);
          return true;
        }
        case 'down':
          if (list.length > 0) setZone('list');
          return true;
        case 'up':
          return true;
        case 'activate':
          press(pageButtons[bIdx]!);
          return true;
      }
      return false;
    }
    if (zone === 'list') {
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
        case 'right':
          enterDetail();
          return true;
        case 'left':
          return true;
        case 'activate':
          if (!cur) setZone('buttons');
          else void toggle(cur);
          return true;
      }
      return false;
    }
    // The detail frame.
    const at = dKeys.indexOf(dKey);
    switch (nk) {
      case 'back':
        setZone('list');
        return true;
      case 'up':
      case 'down': {
        const j = Math.max(0, Math.min(dKeys.length - 1, at + (nk === 'up' ? -1 : 1)));
        setDCursor(dKeys[j]!);
        return true;
      }
      case 'home':
      case 'end':
        setDCursor(nk === 'home' ? dKeys[0]! : dKeys.at(-1)!);
        return true;
    }
    if (dKey === 'buttons') {
      if (nk === 'left' || nk === 'right') {
        const j = nextEnabled(DETAIL_BUTTONS, dIdx, nk === 'left' ? -1 : 1);
        if (j >= 0) setDBtn(j);
        else if (nk === 'left') setZone('list');
        return true;
      }
      if (nk === 'activate') {
        press(DETAIL_BUTTONS[dIdx]!);
        return true;
      }
      return false;
    }
    if (dKey === 'reset' || dKey === 'help') {
      if (nk === 'activate') {
        if (dKey === 'reset') void resetAll();
        else setHelpOpen((o) => !o);
        return true;
      }
      return nk === 'left' || nk === 'right';
    }
    if (dDecl) {
      if (nk === 'left' || nk === 'right') {
        adjust(dDecl, nk === 'left' ? -1 : 1);
        return true;
      }
      if (nk === 'activate') {
        adjust(dDecl, 0);
        return true;
      }
      if (dDecl.type === 'number' && /^[0-9.-]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        startEdit(dDecl, e.key, false);
        return true;
      }
    }
    return false;
  });

  // ------------------------------------------------------------- render

  const listFocused = zone === 'list';
  const buttonRow = (
    <>
      {btnRows.map((r) => (
        <div class="wc-line wc-scr-buttons">
          {r.map((b, j) => {
            const i = pageButtons.indexOf(b);
            return (
              <>
                {j > 0 && ' '}
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
            );
          })}
        </div>
      ))}
    </>
  );

  /** A row of runs: plain text, clickable runs, a filled button, the input being typed. */
  const segs = (row: Row): VNode[] =>
    row.map((s) => {
      if (s.button) {
        const label = s.text.trim();
        return (
          <Button
            label={label}
            width={cellLen(s.text)}
            selected={s.button.cursor}
            focused={zone === 'detail'}
            disabled={s.button.disabled}
            onClick={() => s.hit && hit(s.hit)}
          />
        );
      }
      if (s.field !== undefined && editing) {
        return (
          <SettingInput
            text={editing.text}
            width={s.field}
            select={editing.select}
            label={editing.name}
            onInput={(t) => setEditing((ed) => (ed ? { ...ed, text: t, select: false } : ed))}
          />
        );
      }
      const h = s.hit;
      return h ? (
        <span
          class={'wc-scr-hit' + (s.cls ? ' ' + s.cls : '')}
          data-hit={h}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            hit(h);
          }}
        >
          {s.text}
        </span>
      ) : (
        <span class={s.cls}>{s.text}</span>
      );
    });

  // The list: every line in a native scroll box (pixels, as EDITOR), each
  // line ending in the scrollbar's cell and, beside the frame, the frame's
  // left edge (open at the selected script, ADR 0121).
  const edgeAt = (i: number): string => edgeChar(i, cur ? curLine : -1);
  const tail = (i: number, tab: boolean): VNode => (
    <>
      <span class={'wc-scr-gap' + (tab ? ' wc-scr-fill' : '')}> </span>
      {framed && <span class={'wc-scr-line' + (tab ? ' wc-scr-fill' : '')}>{edgeAt(i)}</span>}
    </>
  );
  const listRows = Array.from({ length: Math.max(listVisible, lines.length) }, (_, vi) => {
    const ln = lines[vi];
    if (!ln) {
      const empty = vi === 0 && ready && list.length === 0;
      return (
        <div class="wc-line" key={vi}>
          <span class="wc-c-hint wc-scr-error" style={cellsWide(L.listW)}>
            {empty ? truncate('No scripts yet: NEW writes one.', L.listW) : ''}
          </span>
          {tail(vi, false)}
        </div>
      );
    }
    const s = list[ln.index]!;
    if (ln.kind === 'error') {
      return (
        <div class="wc-line" key={vi}>
          <span class="wc-c-err wc-scr-error" title={ln.text} style={cellsWide(L.listW)}>
            {truncate('    ' + ln.text, L.listW)}
          </span>
          {tail(vi, false)}
        </div>
      );
    }
    const isCur = ln.index === cursor;
    const tab = framed && isCur;
    const st = scriptState(s, running(s.name));
    const nameCls = 'wc-tr wc-scr-name' + (isCur ? ' is-cur' : s.enabled ? '' : ' is-off');
    return (
      <div class={'wc-line wc-scr-row' + (tab ? ' is-tab' : '')} key={vi} data-script={s.name}>
        <span class={'wc-scr-cells' + (tab ? ' wc-scr-fill' : '')} style={cellsWide(L.listW)}>
          <CheckCell
            checked={s.enabled}
            cursor={isCur && listFocused}
            title={s.enabled ? `Turn ${s.name} off` : `Turn ${s.name} on`}
            onClick={() => {
              select(s.name);
              setZone('list');
              void toggle(s);
            }}
          />
          {' '}
          <span
            class={nameCls}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              // Touch (ADR 0075 §3.2): a tap on the selected script's name
              // opens it, as EDIT; the first tap selects it.
              const again = touchInteraction() && isCur;
              select(s.name);
              setZone('list');
              if (again) edit(s);
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
        </span>
        {tail(vi, tab)}
      </div>
    );
  });

  const leftW = L.listW + 1 + (framed ? 1 : 0);
  const listCol = (
    <div class="wc-scr-listwrap" style={{ ...cellsWide(leftW), height: `calc(var(--cell-h) * ${listVisible})` }}>
      <div class="wc-scrollbox wc-scr-list" ref={listBox.ref} style={{ ...cellsWide(leftW), height: '100%' }}>
        {listRows}
      </div>
      {lines.length > listVisible && (
        <div class="wc-scr-listbar" style={{ left: `calc(var(--cell-w) * ${L.listW})` }}>
          <TuiScrollbar target={listBox.ref} rows={listVisible} />
        </div>
      )}
    </div>
  );

  // ----------------------------------------------------------- the frame

  const fw = L.detailW - 1;
  const frame = ((): VNode | null => {
    if (!framed) return null;
    // Top border: `─┤ name ├──── EDIT ─ EXPORT ─ RENAME ─ DELETE ─┐`.
    const top = ((): VNode => {
      if (!cur) return <div class="wc-line wc-scr-line">{'─'.repeat(fw - 1) + '┐'}</div>;
      const room = buttonsInside ? fw - 7 : nameRoom;
      const name = truncate(cur.name, Math.max(1, room));
      const used = 5 + cellLen(name) + (buttonsInside ? 0 : borderBtnsW + 1);
      return (
        <div class="wc-line wc-scr-top">
          <span class="wc-scr-line">{'─┤ '}</span>
          <span class="wc-c-title wc-scr-title">{name}</span>
          <span class="wc-scr-line">{' ├' + '─'.repeat(Math.max(1, fw - used - 2))}</span>
          {!buttonsInside && detailButtons(true)}
          <span class="wc-scr-line">{'─┐'}</span>
        </div>
      );
    })();
    const inner = detail ? (
      <>
        {detail.rows.map((r) =>
          r.buttons ? (
            <div class="wc-line wc-scr-drow">{detailButtons(false)}</div>
          ) : (
            <div
              class={'wc-line wc-scr-drow' + (r.key?.startsWith('set:') ? ' wc-scr-setting' : '')}
              data-row={r.key}
              onMouseDown={(e) => e.preventDefault()}
              onClick={
                r.key?.startsWith('set:')
                  ? () => {
                      if (editing && editing.name !== r.key!.slice(4)) finishEdit(true);
                      setZone('detail');
                      setDCursor(r.key!);
                    }
                  : undefined
              }
            >
              {segs(r.segs)}
            </div>
          ),
        )}
        {helpOpen && (
          <div class="wc-scr-helpbox">
            <div class="wc-line wc-scr-box">{'┌' + '─'.repeat(iw - 2) + '┐'}</div>
            <div class="wc-scrollrow" style={{ height: `calc(var(--cell-h) * ${helpH})` }}>
              <div class="wc-scr-box wc-scr-import-side">{Array.from({ length: helpH }, () => '│').join('\n')}</div>
              <span class="wc-scr-gap"> </span>
              <div class="wc-scrollbox wc-scr-help" ref={helpBox.ref} style={cellsWide(iw - 4)}>
                {Array.from({ length: Math.max(helpH, help.length) }, (_, vi) => (
                  <div class="wc-line" key={vi}>
                    {segs(help[vi] ?? [])}
                  </div>
                ))}
              </div>
              <span class="wc-scr-gap"> </span>
              {help.length > helpH ? (
                <TuiScrollbar target={helpBox.ref} rows={helpH} />
              ) : (
                <div class="wc-scr-box wc-scr-import-side">{Array.from({ length: helpH }, () => '│').join('\n')}</div>
              )}
            </div>
            <div class="wc-line wc-scr-box">{'└' + '─'.repeat(iw - 2) + '┘'}</div>
          </div>
        )}
      </>
    ) : (
      <div class="wc-line wc-c-hint">{ready ? 'No script selected.' : ''}</div>
    );
    const side = <div class="wc-scr-line wc-scr-import-side">{Array.from({ length: listVisible }, () => '│').join('\n')}</div>;
    return (
      <div class="wc-scr-frame" style={cellsWide(fw)}>
        {top}
        <div class="wc-scrollrow" style={{ height: `calc(var(--cell-h) * ${listVisible})` }}>
          <div class="wc-scrollbox wc-scr-detail wc-scr-fill" ref={outerBox.ref} style={cellsWide(fw - 1)}>
            <div class="wc-scr-pad" style={{ ...cellsWide(fw - 1), minHeight: '100%' }}>
              {inner}
            </div>
          </div>
          {overflow ? <TuiScrollbar target={outerBox.ref} rows={listVisible} /> : side}
        </div>
        <div class="wc-line wc-scr-line">{'─'.repeat(fw - 1) + '┘'}</div>
      </div>
    );
  })();

  /** The script's buttons: in the top border, or (a narrow frame) on a row of their own. */
  function detailButtons(border: boolean): VNode {
    return (
      <span class="wc-scr-dbuttons">
        {DETAIL_BUTTONS.map((b, i) => (
          <>
            {i > 0 && (border ? <span class="wc-scr-line">─</span> : ' ')}
            <Button
              label={b}
              width={buttonW(b)}
              selected={zone === 'detail' && dKey === 'buttons' && i === dIdx}
              focused={zone === 'detail'}
              disabled={disabled(b)}
              onClick={() => {
                setDBtn(i);
                setZone('detail');
                setDCursor('buttons');
                press(b);
              }}
            />
          </>
        ))}
      </span>
    );
  }

  const cornerChar = (top: boolean): string => {
    const open = !!cur && (top ? curLine === 0 : curLine === listVisible - 1 || (lines.length > listVisible && curLine === lines.length - 1));
    return open ? '─' : top ? '┌' : '└';
  };

  return (
    <Page title="Scripts" footer={footer}>
      <div class="wc-scr" style={{ ...indent(L.at), display: 'flex', height: `calc(var(--cell-h) * ${pkgH})` }}>
        <div class="wc-scr-left" style={cellsWide(leftW)}>
          {buttonRow}
          {framed ? (
            <div class="wc-line">
              {' '.repeat(L.listW + 1)}
              <span class="wc-scr-line">{cornerChar(true)}</span>
            </div>
          ) : (
            <div class="wc-line" />
          )}
          {listCol}
          {framed && (
            <div class="wc-line">
              {' '.repeat(L.listW + 1)}
              <span class="wc-scr-line">{cornerChar(false)}</span>
            </div>
          )}
        </div>
        {framed && (
          <div class="wc-scr-right" style={cellsWide(fw)}>
            {Array.from({ length: btnRows.length }, () => (
              <div class="wc-line" />
            ))}
            {frame}
          </div>
        )}
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
