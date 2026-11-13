// The Scripts page (spec §2.10, ADR 0051 "P2", ADR 0121; stage 44a in the
// lantern look, round 7 C "Instrumentbrädan"): the script library beside
// the profile, from the start menu (a large box, layout B), in the
// in-game Scripts window (ADR 0103; the window's root, no Back) and from
// the phone's ESC → Options (a full-screen box).
//
//   ┌ index ─────┐┌ panel ─────────────────────┐┌ help ────────────┐
//   │ ◉ almanac 🔒●││ MERCENARIES 🔒               ││ ▾ HELP ───────── │
//   │ ◉ autoeat    ││ summary · ● on · running     ││ ┌ typeset @help ┐│
//   │ …            ││ [Edit][Export][Rename][Delete]││ │               ││
//   │              ││ SETTINGS ─────── [Reset all] ││ │               ││
//   │              ││ [tile][tile][tile]           ││ │               ││
//   │              ││ COMMANDS ───────             ││ └───────────────┘│
//   └────────────┘└────────────────────────────┘└──────────────────┘
//   [New] [Import] [Manual]          flash                8 scripts
//
// Three widths, by the content box's own width (container queries on the
// box's `wc-page`, never the viewport): over 1000 px three columns; 641 to
// 1000 px the help folds in under the panel (the one help element moves,
// it is never drawn twice); 640 px and under the index alone, and a tap or
// Enter drills into the panel ("All scripts" goes back).
//
// Keys. Tab / Shift+Tab: index → panel → foot. Index: ↑ ↓ (↓ on the last
// reaches the foot), Home / End, Space (and Enter, but for the narrow
// drill-down) turns the script on or off, → enters the panel. Panel: ↑ ↓
// over the button row, Reset all, each setting and the help fold; ← → /
// Enter / Space act on it; digits type a number; ← at the start of the
// button row or Esc goes back to the index. Foot: ← → the buttons, ↑ the
// index. PgUp / PgDn scroll the help anywhere (its column when wide, else
// the panel). Letters N I M E X R D (New, Import, Manual, Edit, Export,
// Rename, Delete), marked in the labels, outside text fields. Esc in the
// index or the foot leaves the page (in a window: closes it at the root).
//
// Mouse and touch: a click on a row selects it (and drills in when
// narrow), a double click opens the editor; a click on its toggle turns it
// on or off without moving the keyboard; a press on a setting puts the
// keyboard there. Settings save at once (ScriptLibrary.setSetting), so a
// running script sees the change. Dialogs are overlay frames
// (script-dialogs.tsx); the setting tiles are script-settings.tsx.

import './scripts.css';
import type { ComponentChildren, VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ScriptInfo, ScriptLibrary } from '../../scripts';
import type { SettingDecl, SettingValue } from '../../scripts/header';
import { BadScriptBackupError, looksLikeScriptBackup, parseScriptBackup } from '../../scripts/backup';
import { knownSyntaxProblem, syntaxProblem } from '../../scripts/check';
import { type HelpBlock, helpBlocks } from '../../scripts/help-text';
import { useServices } from '../kit/hooks';
import {
  Box,
  BoxBody,
  BoxFoot,
  Fold,
  GlassButton,
  Icon,
  type IconName,
  LookFlash,
  Rule,
  Toggle,
  Well,
  letterAction,
  lookFrame,
  useWindowChrome,
} from '../kit/look';
import { type Nav, useIsTop, useKeys, useNav } from '../kit/stack';
import { DeleteDialog, ExportDialog, ImportDialog, NameDialog, RestoreDialog } from './script-dialogs';
import { type SettingEdit, SettingTile } from './script-settings';
import {
  type SyntaxLookup,
  anyChanged,
  countText,
  nextChoice,
  noHelpText,
  panelKeys,
  panelProblems,
  problemText,
  rowProblem,
  scriptState,
  shownValue,
  stepChoice,
  stepSetting,
  typedNumber,
  valueText,
} from './scripts-model';

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The Scripts page; a note when this page has no script library. */
export const ScriptsFrame = lookFrame(function ScriptsFrame(): VNode {
  const { scripts } = useServices();
  if (!scripts) return <NoScripts />;
  return <ScriptsPage lib={scripts} />;
});

function NoScripts(): VNode {
  const nav = useNav();
  useWindowChrome({ title: 'Scripts' });
  return (
    <Box size="large" title="Scripts" onBack={() => nav.pop()}>
      <p class="wc-lk-empty wc-scr-none">Scripts are not available here.</p>
    </Box>
  );
}

// ------------------------------------------------------------ the editor and the manual (lazy)

let opening = false;

/** Loads the editor chunk and pushes the script manual. */
async function openManual(nav: Nav): Promise<void> {
  if (opening) return;
  opening = true;
  const depth = nav.depth();
  try {
    const mod = await import('../../editor');
    if (nav.depth() !== depth) return;
    mod.openScriptManual(nav);
  } catch (e) {
    nav.flash(`Could not open the manual: ${errText(e)}`, 'fail');
  } finally {
    opening = false;
  }
}

/** Loads the editor chunk and pushes the script editor (no-op while loading). */
export async function editScript(nav: Nav, lib: ScriptLibrary, name: string, onName: (n: string) => void): Promise<void> {
  if (opening) return;
  opening = true;
  const depth = nav.depth();
  try {
    const mod = await import('../../editor');
    if (nav.depth() !== depth) return;
    mod.openScriptEditor(nav, { library: lib, name, onName });
  } catch (e) {
    nav.flash(`Could not open the editor: ${errText(e)}`, 'fail');
  } finally {
    opening = false;
  }
}

// ------------------------------------------------------------ data hooks

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

/** The page's width class, from its own content box: `wide` > 1000 px, `mid`, `narrow` ≤ 640 px (as the CSS's container queries). */
type Width = 'wide' | 'mid' | 'narrow';
const widthOf = (w: number): Width => (w > 1000 ? 'wide' : w > 640 ? 'mid' : 'narrow');

function useWidth(ref: { current: HTMLElement | null }): [Width, number] {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => {
      const e = es[es.length - 1];
      if (e) setW(Math.round(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [widthOf(w || 1400), w];
}

// ------------------------------------------------------------ the help

/** Terms that are commands or keys are set in the terminal font. */
const codeTerm = (t: string): boolean => /^[a-z#$]|[<>[\]|]|^(F\d+|Ctrl|Alt|Shift)\b/.test(t);
/** A term's character in the help (13 px terminal font or Cinzel caps), for the tables' stacking rule. */
const TERM_CH_PX = 7.8;

/**
 * Whether a table goes term over description in a help `width` px wide
 * (help-text.ts's rule in px): the term column over about 40 % of the
 * width, or under 160 px left for the descriptions.
 */
export function helpStacks(termChars: number, width: number): boolean {
  const term = termChars * TERM_CH_PX;
  return term > width * 0.42 || width - term - 18 < 160;
}

/** The help text's width in px from the page's: its column (wide), under the panel (mid), the panel (narrow). */
const helpWidth = (w: Width, px: number): number =>
  Math.max(200, w === 'wide' ? (px - 228) * (1.05 / 2.05) - 24 - 54 : w === 'mid' ? px - 224 - 48 - 46 : px - 6 - 46);

/** The typeset `@help` as DOM: headings, paragraphs, items, term tables (stacked when the terms take too much), pre runs. */
function HelpBody(p: { blocks: readonly HelpBlock[]; width: number }): VNode {
  const out: VNode[] = [];
  let items: VNode[] = [];
  const flush = (): void => {
    if (items.length) out.push(<ul key={`u${out.length}`}>{items}</ul>);
    items = [];
  };
  p.blocks.forEach((b, i) => {
    if (b.kind !== 'item') flush();
    switch (b.kind) {
      case 'heading':
        out.push(<h4 key={i}>{b.text}</h4>);
        break;
      case 'para':
        out.push(<p key={i}>{b.text}</p>);
        break;
      case 'item':
        items.push(<li key={i}>{b.text}</li>);
        break;
      case 'table': {
        const termW = Math.max(...b.rows.map((r) => [...r.term].length));
        const stacked = helpStacks(termW, p.width);
        out.push(
          <dl key={i} class={'wc-scr-t2' + (stacked ? ' is-stacked' : '')}>
            {b.rows.map((r, j) => (
              <>
                <dt key={`t${j}`} class={codeTerm(r.term) ? 'is-cmd' : undefined}>
                  {r.term}
                </dt>
                <dd key={`d${j}`}>{r.desc}</dd>
              </>
            ))}
          </dl>,
        );
        break;
      }
      case 'pre':
        out.push(<pre key={i}>{b.lines.join('\n')}</pre>);
        break;
      default:
        break;
    }
  });
  flush();
  return <div class="wc-scr-helptext">{out}</div>;
}

// ------------------------------------------------------------ the page

type Zone = 'list' | 'panel' | 'foot';
type FootId = 'NEW' | 'IMPORT' | 'MANUAL';
type PanelId = 'EDIT' | 'EXPORT' | 'RENAME' | 'DELETE';
type ButtonId = FootId | PanelId;

const FOOT: readonly FootId[] = ['NEW', 'IMPORT', 'MANUAL'];
const PANEL: readonly PanelId[] = ['EDIT', 'EXPORT', 'RENAME', 'DELETE'];

const BUTTONS: Readonly<Record<ButtonId, { label: string; letter: string; icon: IconName; danger?: boolean }>> = {
  NEW: { label: 'New', letter: 'n', icon: 'plus' },
  IMPORT: { label: 'Import', letter: 'i', icon: 'import' },
  MANUAL: { label: 'Manual', letter: 'm', icon: 'book' },
  EDIT: { label: 'Edit', letter: 'e', icon: 'pencil' },
  EXPORT: { label: 'Export', letter: 'x', icon: 'export' },
  RENAME: { label: 'Rename', letter: 'r', icon: 'rename' },
  DELETE: { label: 'Delete', letter: 'd', icon: 'trash', danger: true },
};

const LOCK_TITLE = 'Bundled with WebCockpit: read-only. Duplicate it to change it.';
const READONLY_TITLE = 'Bundled scripts are read-only';

function Lock(p: { title?: string }): VNode {
  return (
    <span class="wc-scr-lock" title={p.title ?? LOCK_TITLE} aria-label="read-only">
      <Icon name="lock" />
    </span>
  );
}

function ScriptsPage({ lib }: { lib: ScriptLibrary }): VNode {
  const { scriptRunning } = useServices();
  const nav = useNav();
  const isTop = useIsTop();
  useWindowChrome({ title: 'Scripts' });
  const { list, ready } = useScriptList(lib);
  const rootRef = useRef<HTMLDivElement>(null);
  const idxRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [width, px] = useWidth(rootRef);
  const narrow = width === 'narrow';

  const [cursorName, setCursorName] = useState<string | null>(null);
  const [zone, setZone] = useState<Zone>('list');
  const [dkey, setDkey] = useState('buttons');
  const [dbtn, setDbtn] = useState<PanelId>('EDIT');
  const [fbtn, setFbtn] = useState<FootId>('NEW');
  const [editing, setEditing] = useState<SettingEdit | null>(null);
  /** The open edit as of the last render, cleared the moment it ends (a blur after Enter or Esc is no second end). */
  const editRef = useRef<SettingEdit | null>(null);
  editRef.current = editing;
  const [helpOpen, setHelpOpen] = useState(true);
  const [, setTick] = useState(0);
  /** Setting values being saved, by `script\0setting`: shown at once, and the base of the next step. */
  const pending = useRef(new Map<string, SettingValue>());
  /** After a key: the index's or the panel's keyboard row into view (never after a pointer). */
  const reveal = useRef<'list' | 'panel' | null>(null);
  /** The last pointer's type (a touch double tap never opens the editor). */
  const pointer = useRef('mouse');

  // The host's running state changes without a library event: polled while on top and visible.
  useEffect(() => {
    if (!isTop) return;
    const t = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) setTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [isTop]);

  const running = (name: string): boolean | null => scriptRunning?.(name) ?? null;
  const syntax = useSyntaxProblems(list, running);
  let cursor = list.findIndex((s) => s.name === cursorName);
  if (cursor < 0) cursor = 0;
  const cur: ScriptInfo | undefined = list[cursor];

  const values: Record<string, SettingValue> = {};
  if (cur) for (const [k, v] of pending.current) if (k.startsWith(cur.name + '\0')) values[k.slice(cur.name.length + 1)] = v;
  const keys = cur ? panelKeys(cur) : ['buttons'];
  const dKey = keys.includes(dkey) ? dkey : 'buttons';
  const declOf = (key: string): SettingDecl | undefined =>
    key.startsWith('set:') ? cur?.header.settings.find((d) => d.name === key.slice(4)) : undefined;
  const changed = cur ? anyChanged(cur, values) : false;

  // Without a script the panel has no keys; without scripts the index none.
  const effZone: Zone = zone === 'panel' && !cur ? 'list' : zone === 'list' && list.length === 0 ? 'foot' : zone;
  // Narrow: the panel shows (the drill-down) exactly while the keys are on it, so a letter, a
  // button or a setting that moves the keys there also shows it, and a resize never strands them.
  const drill = narrow && effZone === 'panel';

  const disabled = (b: ButtonId): boolean => {
    if (b === 'NEW' || b === 'IMPORT' || b === 'MANUAL') return false;
    if (!cur) return true;
    return (b === 'RENAME' || b === 'DELETE') && cur.readonly;
  };
  const dBtn: PanelId = disabled(dbtn) ? (PANEL.find((b) => !disabled(b)) ?? 'EDIT') : dbtn;

  // ------------------------------------------------------------- scrolling

  useLayoutEffect(() => {
    const r = reveal.current;
    if (!r) return;
    reveal.current = null;
    const el =
      r === 'list'
        ? idxRef.current?.querySelector<HTMLElement>('.wc-scr-row.is-on')
        : panelRef.current?.querySelector<HTMLElement>(dKey === 'help' ? '[data-rule="help"]' : `[data-pk="${dKey}"]`);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  });

  // A new script: its panel and help start at the top.
  useLayoutEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0;
    if (helpRef.current) helpRef.current.scrollTop = 0;
  }, [cur?.name]);

  /** PgUp / PgDn: the help column when wide, else the panel. */
  const scrollHelp = (dir: 1 | -1): void => {
    const el = width === 'wide' && helpOpen && helpRef.current ? helpRef.current : panelRef.current;
    if (!el) return;
    el.scrollTop += dir * Math.max(40, el.clientHeight - 40);
  };

  // ------------------------------------------------------------- actions

  const select = (name: string | null): void => {
    if (name !== cur?.name) finishEdit(true);
    setCursorName(name);
  };
  const moveTo = (i: number): void => {
    const s = list[Math.max(0, Math.min(list.length - 1, i))];
    if (!s) return;
    reveal.current = 'list';
    select(s.name);
  };
  const toList = (): void => {
    finishEdit(true);
    setZone('list');
  };
  /** Into the panel of `s` (default the selected script), on its first setting or its button row. */
  const enterPanel = (s: ScriptInfo | undefined = cur): void => {
    if (!s) return;
    setZone('panel');
    setEditing(null);
    setDkey(panelKeys(s).find((k) => k.startsWith('set:')) ?? 'buttons');
    reveal.current = 'panel';
  };
  /** The keys on the panel's button row, on `id` (Edit: back from the editor, Esc goes to the index first). */
  const onButtons = (id: PanelId): void => {
    setZone('panel');
    setDkey('buttons');
    setDbtn(id);
  };

  // The state each switch was last asked for, until the library has it. A second click that comes
  // before the first one's render flips what was asked for, not the row's stale `enabled`.
  const asked = useRef(new Map<string, boolean>());
  const toggle = async (s: ScriptInfo): Promise<void> => {
    const on = !(asked.current.get(s.name) ?? s.enabled);
    asked.current.set(s.name, on);
    try {
      await lib.setEnabled(s.name, on);
      if (!on) nav.flash(`${s.name} is off.`);
      else nav.flash(running(s.name) === null ? `${s.name} is on. It runs when you enter MUME.` : `${s.name} is on.`);
    } catch (e) {
      nav.flash(errText(e), 'fail');
    } finally {
      if (asked.current.get(s.name) === on) asked.current.delete(s.name);
    }
  };

  const edit = (s: ScriptInfo): void => {
    onButtons('EDIT');
    void editScript(nav, lib, s.name, (n) => select(n));
  };

  const onFile = async (): Promise<void> => {
    const input = fileRef.current;
    const file = input?.files?.[0];
    if (!input || !file) return;
    input.value = '';
    try {
      const text = await file.text();
      if (looksLikeScriptBackup(text)) {
        nav.push(<RestoreDialog lib={lib} fileName={file.name} backup={parseScriptBackup(text)} done={select} />, { overlay: true });
      } else {
        nav.push(<ImportDialog lib={lib} fileName={file.name} text={text} done={select} />, { overlay: true });
      }
    } catch (e) {
      nav.flash(e instanceof BadScriptBackupError ? `Restore failed: ${e.message}` : `Import failed: ${errText(e)}`, 'fail');
    }
  };

  const press = (b: ButtonId): void => {
    if (disabled(b)) return;
    setEditing(null);
    switch (b) {
      case 'NEW':
        return nav.push(
          <NameDialog
            lib={lib}
            mode="create"
            done={(n) => {
              select(n);
              onButtons('EDIT');
            }}
          />,
          { overlay: true },
        );
      case 'IMPORT':
        fileRef.current?.click();
        return;
      case 'MANUAL':
        return void openManual(nav);
      case 'EDIT':
        return edit(cur!);
      case 'EXPORT':
        onButtons('EXPORT');
        return nav.push(<ExportDialog lib={lib} name={cur!.name} />, { overlay: true });
      case 'RENAME':
        onButtons('RENAME');
        return nav.push(<NameDialog lib={lib} mode="rename" from={cur!.name} done={(n) => select(n)} />, { overlay: true });
      case 'DELETE':
        onButtons('DELETE');
        return nav.push(
          <DeleteDialog
            lib={lib}
            name={cur!.name}
            done={(n) => {
              select(n);
              toList();
            }}
          />,
          { overlay: true },
        );
    }
  };

  // ------------------------------------------------------------- settings

  const shown = (d: SettingDecl): SettingValue => (cur ? shownValue(cur, d, values) : d.default);

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
    if (!cur || !changed) return;
    setEditing(null);
    for (const k of [...pending.current.keys()]) if (k.startsWith(cur.name + '\0')) pending.current.delete(k);
    try {
      const names = await lib.resetSettings(cur.name);
      nav.flash(names.length > 0 ? `Reset ${names.join(', ')} to the default${names.length > 1 ? 's' : ''}.` : 'Nothing to reset.');
    } catch (e) {
      nav.flash(errText(e), 'fail');
    }
  };

  /**
   * Ends the typing: Enter keeps the value (a number clamped to its range), Esc drops it. Leaving
   * the tile any other way (a blur, a tap on All scripts or on another row) keeps it too.
   */
  function finishEdit(keep: boolean): void {
    const ed = editRef.current;
    if (!ed) return;
    editRef.current = null;
    setEditing(null);
    if (!keep || !cur) return;
    const d = cur.header.settings.find((x) => x.name === ed.name);
    if (!d) return;
    if (d.type === 'number') {
      const v = typedNumber(d, ed.text);
      if (v === null) return nav.flash(`${d.name} must be a number.`, 'fail');
      if (v !== shown(d)) void save(cur, d, v, true);
      return;
    }
    if (ed.text !== shown(d)) void save(cur, d, ed.text, true);
  }

  const startEdit = (d: SettingDecl, text: string, selectAll: boolean): void => {
    if (d.type !== 'number' && d.type !== 'string') return;
    setEditing({ name: d.name, text, select: selectAll });
  };

  /** ← (-1), → (1), or Enter / Space (0) on a setting. */
  const adjust = (d: SettingDecl, dir: -1 | 0 | 1): void => {
    if (!cur) return;
    const v = shown(d);
    switch (d.type) {
      case 'boolean':
        return void save(cur, d, !v);
      case 'number': {
        if (dir === 0) return startEdit(d, valueText(d, v), true);
        const next = stepSetting(d, typeof v === 'number' ? v : Number(d.default), dir);
        if (next !== v) void save(cur, d, next);
        return;
      }
      case 'choice': {
        const next = dir === 0 ? nextChoice(d, v) : stepChoice(d, v, dir);
        if (next !== v) void save(cur, d, next);
        return;
      }
      default:
        if (dir === 0) startEdit(d, String(v), false);
    }
  };

  /** A press on a setting tile: the keyboard goes there (an edit of another setting is kept). */
  const pressSetting = (d: SettingDecl): void => {
    if (editing && editing.name !== d.name) finishEdit(true);
    setZone('panel');
    setDkey(`set:${d.name}`);
  };

  // ------------------------------------------------------------- keys

  const letters: Record<string, () => void> = {};
  for (const id of [...FOOT, ...PANEL]) letters[BUTTONS[id].letter] = () => press(id);

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
      // The input keeps its editing keys; the zones and the help wait.
      return nk === 'tab' || nk === 'backtab' || nk === 'pgup' || nk === 'pgdn';
    }
    if (nk === 'pgup' || nk === 'pgdn') {
      scrollHelp(nk === 'pgup' ? -1 : 1);
      return true;
    }
    if (letterAction(e, letters)) return true;
    if (nk === 'tab' || nk === 'backtab') {
      const ring: Zone[] = list.length === 0 ? ['foot'] : cur ? ['list', 'panel', 'foot'] : ['list', 'foot'];
      const at = Math.max(0, ring.indexOf(effZone));
      const next = ring[(at + (nk === 'tab' ? 1 : ring.length - 1)) % ring.length]!;
      if (next === 'panel') enterPanel();
      else setZone(next);
      return true;
    }

    if (effZone === 'foot') {
      const at = FOOT.indexOf(fbtn);
      switch (nk) {
        case 'left':
        case 'right':
          setFbtn(FOOT[Math.max(0, Math.min(FOOT.length - 1, at + (nk === 'left' ? -1 : 1)))]!);
          return true;
        case 'up':
          if (list.length > 0) setZone('list');
          return true;
        case 'down':
          return true;
        case 'activate':
          press(fbtn);
          return true;
      }
      return false;
    }

    if (effZone === 'list') {
      switch (nk) {
        case 'up':
          moveTo(cursor - 1);
          return true;
        case 'down':
          if (cursor >= list.length - 1) setZone('foot');
          else moveTo(cursor + 1);
          return true;
        case 'home':
          moveTo(0);
          return true;
        case 'end':
          moveTo(list.length - 1);
          return true;
        case 'right':
          enterPanel();
          return true;
        case 'left':
          return true;
        case 'activate':
          // Narrow: Enter drills into the panel (Space still turns it on or off).
          if (narrow && e.key === 'Enter') enterPanel();
          else if (cur) void toggle(cur);
          return true;
      }
      return false;
    }

    // The panel.
    const at = keys.indexOf(dKey);
    switch (nk) {
      case 'back':
        toList();
        return true;
      case 'up':
      case 'down':
        setDkey(keys[Math.max(0, Math.min(keys.length - 1, at + (nk === 'up' ? -1 : 1)))]!);
        reveal.current = 'panel';
        return true;
      case 'home':
      case 'end':
        setDkey(nk === 'home' ? keys[0]! : keys.at(-1)!);
        reveal.current = 'panel';
        return true;
    }
    if (dKey === 'buttons') {
      if (nk === 'left' || nk === 'right') {
        const live = PANEL.filter((b) => !disabled(b));
        const i = live.indexOf(dBtn);
        const j = i + (nk === 'left' ? -1 : 1);
        if (j < 0) toList();
        else setDbtn(live[Math.min(live.length - 1, j)]!);
        return true;
      }
      if (nk === 'activate') {
        press(dBtn);
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
    const d = declOf(dKey);
    if (d) {
      if (nk === 'left' || nk === 'right') {
        adjust(d, nk === 'left' ? -1 : 1);
        return true;
      }
      if (nk === 'activate') {
        adjust(d, 0);
        return true;
      }
      if (d.type === 'number' && /^[0-9.-]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        startEdit(d, e.key, false);
        return true;
      }
    }
    return false;
  });

  // ------------------------------------------------------------- render

  const inPanel = effZone === 'panel';
  const helpPx = helpWidth(width, px || 1400);
  const blocks = useMemo(() => (cur ? helpBlocks(cur.header.help) : []), [cur?.name, cur?.updated]);
  const stackKey = blocks
    .filter((b): b is Extract<HelpBlock, { kind: 'table' }> => b.kind === 'table')
    .map((b) => (helpStacks(Math.max(...b.rows.map((r) => [...r.term].length)), helpPx) ? 1 : 0))
    .join('');
  const helpBody = useMemo(
    () => (cur ? cur.header.help.length > 0 ? <HelpBody blocks={blocks} width={helpPx} /> : <p class="wc-scr-none">{noHelpText(cur)}</p> : null),
    [blocks, stackKey],
  );

  const btn = (id: ButtonId, sel: boolean, onClick: () => void, extra?: { title?: string }): VNode => {
    const def = BUTTONS[id];
    return (
      <GlassButton
        key={id}
        id={id}
        label={def.label}
        letter={def.letter}
        icon={def.icon}
        small
        danger={!!def.danger}
        selected={sel}
        disabled={disabled(id)}
        {...(extra?.title ? { title: extra.title } : {})}
        onClick={onClick}
      />
    );
  };

  const help = cur && (
    <div class="wc-scr-helpwrap">
      <Rule
        class="wc-scr-helprule"
        id="help"
        title={
          <Fold
            open={helpOpen}
            label="Help"
            class={inPanel && dKey === 'help' ? 'is-cur' : undefined}
            onToggle={() => {
              setZone('panel');
              setDkey('help');
              setHelpOpen((o) => !o);
            }}
          />
        }
      />
      {helpOpen && (
        <div class={'wc-lk-well wc-scr-help' + (width === 'wide' ? ' wc-lk-scroll' : '')} ref={helpRef}>
          {helpBody}
        </div>
      )}
    </div>
  );

  const panel = ((): ComponentChildren => {
    if (!cur) {
      return (
        <p class="wc-lk-empty wc-scr-none">
          {!ready ? '' : list.length > 0 ? 'No script selected.' : (
            <>
              Write your first script with <b>New</b>, or <b>Import</b> one.
            </>
          )}
        </p>
      );
    }
    const s = cur;
    const st = scriptState(s, running(s.name));
    const h = s.header;
    const problems = panelProblems(s, syntax);
    const items = [...h.aliases.map((a) => ({ key: a.name, text: a.text, kind: 'alias' })), ...h.keys.map((k) => ({ key: k.key, text: k.text, kind: 'key' }))];
    return (
      <>
        <GlassButton id="LIST" label="All scripts" icon="back" small keepIcon onClick={toList} />
        <div class="wc-scr-titlerow">
          <h2 class="wc-scr-title">{s.name}</h2>
          {s.bundled && <Lock />}
        </div>
        {h.summary && <p class="wc-scr-summary">{h.summary}</p>}
        <div class="wc-scr-stl">
          <span class={`wc-scr-status is-${st.cls}`}>
            <i class={`wc-scr-dot is-${st.dot}`} aria-hidden="true" />
            {st.text}
          </span>
          {s.bundled && (
            <span class="wc-scr-ro">
              <Icon name="lock" />
              bundled · read-only
            </span>
          )}
        </div>
        <div class="wc-scr-btns" data-pk="buttons">
          {PANEL.map((id) =>
            btn(
              id,
              inPanel && dKey === 'buttons' && dBtn === id,
              () => {
                onButtons(id);
                press(id);
              },
              (id === 'RENAME' || id === 'DELETE') && s.readonly ? { title: READONLY_TITLE } : undefined,
            ),
          )}
        </div>
        {problems.map((pr) => (
          <div class={'wc-scr-problem' + (pr.kind === 'header' ? ' is-header' : '')}>{pr.text}</div>
        ))}
        <Rule title="Settings">
          {h.settings.length > 0 && (
            <span data-pk="reset">
              <GlassButton
                id="RESET"
                label="Reset all"
                icon="reset"
                small
                selected={inPanel && dKey === 'reset'}
                disabled={!changed}
                title="Every setting of this script back to its default"
                onClick={() => {
                  setZone('panel');
                  setDkey('reset');
                  void resetAll();
                }}
              />
            </span>
          )}
        </Rule>
        <div class="wc-scr-tiles">
          {h.settings.length === 0 && <p class="wc-scr-none">No settings.</p>}
          {h.settings.map((d) => (
            <SettingTile
              key={d.name}
              d={d}
              value={shown(d)}
              cur={inPanel && dKey === `set:${d.name}`}
              edit={editing?.name === d.name ? editing : null}
              onPress={() => pressSetting(d)}
              onValue={(v) => {
                if (v !== shown(d)) void save(s, d, v);
              }}
              onStep={(dir) => adjust(d, dir)}
              onEdit={() => {
                if (editing?.name === d.name) return;
                startEdit(d, d.type === 'number' ? valueText(d, shown(d)) : String(shown(d)), d.type === 'number');
              }}
              onEditText={(t) => {
                if (editRef.current) editRef.current = { ...editRef.current, text: t, select: false };
                setEditing((ed) => (ed ? { ...ed, text: t, select: false } : ed));
              }}
              onEditEnd={() => finishEdit(true)}
            />
          ))}
        </div>
        {items.length > 0 && (
          <>
            <Rule title="Commands" />
            <div class="wc-scr-cmds">
              {items.map((it) => (
                <>
                  <span class={'wc-scr-c' + (it.kind === 'key' ? ' is-key' : '')}>{it.kind === 'key' ? <kbd>{it.key}</kbd> : it.key}</span>
                  <span class="wc-scr-ct">{it.text}</span>
                </>
              ))}
            </div>
          </>
        )}
        {width !== 'wide' && help}
      </>
    );
  })();

  const count = countText(list, running);
  return (
    <Box size="large" title="Scripts" onBack={() => nav.pop()} winClass="wc-scr-win">
      <div class={`wc-scr is-${width}` + (inPanel ? ' is-panel' : '')} ref={rootRef} data-w={width}>
        <BoxBody scroll={false} class={'wc-scr-main' + (drill ? ' is-drill' : '') + (effZone === 'panel' ? ' is-keys' : '')}>
          <nav class="wc-scr-idx wc-lk-scroll" aria-label="Scripts" ref={idxRef}>
            {list.length === 0 ? (
              <p class="wc-lk-empty wc-scr-none">{ready ? 'No scripts yet.' : ''}</p>
            ) : (
              <div class="wc-lk-rows is-flat" role="listbox" aria-label="Scripts">
                {list.map((s, i) => {
                  const st = scriptState(s, running(s.name));
                  const err = rowProblem(s, syntax);
                  const on = i === cursor;
                  return (
                    <div
                      key={s.name}
                      class={
                        'wc-lk-row wc-scr-row' +
                        (on ? ' is-on' : '') +
                        (on && effZone === 'list' ? ' is-cur' : '') +
                        (s.enabled ? '' : ' is-off') +
                        (err ? ' has-err' : '')
                      }
                      role="option"
                      aria-selected={on}
                      data-name={s.name}
                      onPointerDown={(e) => {
                        pointer.current = e.pointerType || 'mouse';
                      }}
                      onClick={() => {
                        select(s.name);
                        if (narrow) {
                          enterPanel(s);
                          // A tap opens the panel at its top (its name and buttons); only keys scroll.
                          reveal.current = null;
                        } else {
                          setZone('list');
                          setEditing(null);
                        }
                      }}
                      onDblClick={() => {
                        if (pointer.current !== 'touch') edit(s);
                      }}
                    >
                      {/* The kit's Toggle stops a click, not a double click: a quick off-and-on is no edit. */}
                      <span class="wc-scr-tog" onDblClick={(e) => e.stopPropagation()}>
                        <Toggle
                          on={s.enabled}
                          only="switch"
                          label={s.enabled ? `Turn ${s.name} off` : `Turn ${s.name} on`}
                          onChange={() => {
                            select(s.name);
                            void toggle(s);
                          }}
                        />
                      </span>
                      <span class="wc-scr-name">{s.name}</span>
                      {s.bundled ? <Lock /> : <span />}
                      {st.mark ? (
                        <i class={`wc-scr-mark is-${st.mark}`} title={st.markTitle} aria-label={st.markTitle} />
                      ) : (
                        <span />
                      )}
                      {err && (
                        <span class="wc-scr-error" title={err}>
                          {err}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </nav>
          <div class="wc-scr-panel wc-lk-scroll" ref={panelRef}>
            {panel}
          </div>
          {width === 'wide' && <div class="wc-scr-helpcol">{help}</div>}
        </BoxBody>
        <BoxFoot class="wc-scr-foot">
          <div class="wc-scr-fbtns">
            {FOOT.map((id) =>
              btn(id, effZone === 'foot' && fbtn === id, () => {
                setFbtn(id);
                press(id);
              }),
            )}
          </div>
          <LookFlash class="wc-scr-flash" />
          {count && <span class="wc-scr-count">{count}</span>}
        </BoxFoot>
        <input
          ref={fileRef}
          type="file"
          accept=".lua,.json,text/x-lua,text/plain,application/json"
          hidden
          class="wc-script-file"
          onChange={() => void onFile()}
        />
      </div>
    </Box>
  );
}
