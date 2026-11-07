// The Profile list (Inv §3.4; stage 41e, ADR 0125): the first sub-page in
// the new look (src/chrome/kit/look.tsx), a lantern box under the smaller
// wordmark with Back at its top left. Its sub-frames (the New / Rename
// name prompt, Blank or Copy, the Delete confirm, the import report, the
// profile editor) still open in the old look on the cell grid.
//
//   [Back]                  ( Profiles )
//     NAME ▲                         CHANGED
//     default  SELECTED              2 hours ago      ← the cursor row
//     scout                          yesterday
//   [Select] [New] [Edit] [Rename] [Delete] [Import] [Export]
//                    flash line
//
// Every feature of the TUI list is kept. Two focus zones: the list
// (default, cursor on the selected profile) and the buttons. Tab /
// Shift+Tab toggle them; ← / → from the list go to the buttons, where
// ← / → move along them and ↑ returns to the list. In the list ↑ ↓,
// PgUp / PgDn (10), Home / End. Enter or a click on a row selects that
// profile; on the profile that is already selected it opens the editor,
// as Edit does (stage 25: the first click selects, the second edits).
// The name column's header sorts (A–Z / Z–A). Each button's letter is
// marked in its label and works from either zone: S Select (disabled on
// the selected row), N New, E Edit, R Rename and D Delete (both disabled
// on `default`), I Import (one or more files, native or foreign, then the
// import report), X Export. Esc or Back returns to the menu. Feedback
// goes to the flash line at the foot of the box (~3 s). The mouse
// selects a row on hover.

import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  DEFAULT_PROFILE,
  NAME_HINT,
  NAME_MAX,
  type ProfileRecord,
  compareNames,
  downloadProfile,
  nameError,
} from '../../profiles';
import { useGrid, useServices, useSettings } from '../kit/hooks';
import { Box, GlassButton, type IconName, LookFlash, letterOf, lookFrame } from '../kit/look';
import { editProfile } from './profile-edit';
import { loadImportFiles } from './import-load';
import { ImportReportFrame } from './import-report';
import { centreLeft, step } from '../kit/nav';
import { useIsTop, useKeys, useNav } from '../kit/stack';
import {
  Blank,
  Centered,
  FlashRow,
  type MenuItem,
  MenuRows,
  Page,
  TextField,
  menuKey,
  useMenuCursor,
} from '../kit/widgets';
import './profiles.css';

type Done = (name: string, message: string) => void;

const BUTTONS = ['SELECT', 'NEW', 'EDIT', 'RENAME', 'DELETE', 'IMPORT', 'EXPORT'] as const;
type ButtonId = (typeof BUTTONS)[number];

interface ButtonDef {
  id: ButtonId;
  label: string;
  letter: string;
  icon: IconName;
  danger?: boolean;
}

const BUTTON_DEFS: readonly ButtonDef[] = [
  { id: 'SELECT', label: 'Select', letter: 's', icon: 'check' },
  { id: 'NEW', label: 'New', letter: 'n', icon: 'plus' },
  { id: 'EDIT', label: 'Edit', letter: 'e', icon: 'pencil' },
  { id: 'RENAME', label: 'Rename', letter: 'r', icon: 'rename' },
  { id: 'DELETE', label: 'Delete', letter: 'd', icon: 'trash', danger: true },
  { id: 'IMPORT', label: 'Import', letter: 'i', icon: 'import' },
  { id: 'EXPORT', label: 'Export', letter: 'x', icon: 'export' },
];

/** PgUp / PgDn in the list. */
const PAGE = 10;

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "just now", "5 minutes ago", "2 hours ago", "yesterday", "3 days ago", "3 weeks ago", "4 months ago", "2 years ago"; "" when unknown. */
export function timeAgo(ms: number, now: number = Date.now()): string {
  if (!(ms > 0)) return '';
  const d = Math.max(0, now - ms);
  const n = (v: number, unit: string): string => `${v} ${unit}${v === 1 ? '' : 's'} ago`;
  if (d < MIN) return 'just now';
  if (d < HOUR) return n(Math.floor(d / MIN), 'minute');
  if (d < DAY) return n(Math.floor(d / HOUR), 'hour');
  if (d < 2 * DAY) return 'yesterday';
  if (d < 14 * DAY) return n(Math.floor(d / DAY), 'day');
  if (d < 60 * DAY) return n(Math.floor(d / (7 * DAY)), 'week');
  if (d < 365 * DAY) return n(Math.floor(d / (30 * DAY)), 'month');
  return n(Math.floor(d / (365 * DAY)), 'year');
}

const fullDate = (ms: number): string => (ms > 0 ? `Changed ${new Date(ms).toLocaleString()}` : '');

export const ProfileFrame = lookFrame(function ProfileFrame(): VNode {
  const { profiles, settings, onProfileSaved } = useServices();
  const s = useSettings();
  const nav = useNav();
  const isTop = useIsTop();
  const [list, setList] = useState<ProfileRecord[] | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [cursorName, setCursorName] = useState<string>(s.profile);
  const [zone, setZone] = useState<'table' | 'buttons'>('table');
  const [btn, setBtn] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const reload = async (): Promise<void> => {
    try {
      setList(await profiles.list());
    } catch (e) {
      setList((l) => l ?? []);
      nav.flash(`Could not read profiles: ${errText(e)}`, 'fail');
    }
  };
  useEffect(() => {
    if (isTop) void reload();
  }, [isTop]);

  const all = list ?? [];
  const rows = dir > 0 ? all : [...all].reverse();
  let cursor = rows.findIndex((r) => r.name === cursorName);
  if (cursor < 0) cursor = Math.max(0, rows.findIndex((r) => r.name === s.profile));
  const cur = rows[cursor];
  const curName = cur?.name ?? '';

  const disabled = (b: ButtonId): boolean => {
    if (!cur) return b === 'SELECT' || b === 'EDIT' || b === 'RENAME' || b === 'DELETE' || b === 'EXPORT';
    if (b === 'SELECT') return cur.name === s.profile;
    if (b === 'RENAME' || b === 'DELETE') return cur.name === DEFAULT_PROFILE;
    return false;
  };
  const btnEnabled = (i: number): boolean => !disabled(BUTTONS[i]!);
  const btnIdx = btnEnabled(btn) ? btn : step(BUTTONS.length, btn, 1, { enabled: btnEnabled, wrap: true });

  // The cursor row stays in view in a long list.
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('.wc-pl-row.is-on');
    if (isTop && el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [cursor, rows.length, isTop]);

  const done: Done = (name, message) => {
    setCursorName(name);
    setZone('table');
    nav.flash(message);
  };
  const moveTo = (i: number): void => {
    const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
    if (r) setCursorName(r.name);
  };

  const select = (): void => {
    if (!cur || cur.name === s.profile) return;
    settings.update({ profile: cur.name });
  };

  const edit = (name: string): void => {
    void editProfile(nav, profiles, name, { isLive: () => false, onSaved: onProfileSaved });
  };

  /** Enter or a click on row `r`: select it, or edit it when it is the selected profile. */
  const pick = (r: ProfileRecord | undefined): void => {
    if (!r) return;
    if (r.name === s.profile) edit(r.name);
    else settings.update({ profile: r.name });
  };

  const exportCur = async (): Promise<void> => {
    if (!cur) return;
    try {
      const rec = await profiles.get(cur.name);
      if (!rec) throw new Error('not found');
      nav.flash(`Exported ${downloadProfile(rec.name, rec.text)}.`);
    } catch (e) {
      nav.flash(`Export failed: ${errText(e)}`, 'fail');
    }
  };

  // IMPORT: one or more files (a foreign entry file and the files it
  // `#read`s, or Mudlet archives) through the lazy import chunk (ADR 0073,
  // ADR 0076), then the report.
  const onFile = async (): Promise<void> => {
    const input = fileRef.current;
    const chosen = [...(input?.files ?? [])];
    if (!input || chosen.length === 0) return;
    input.value = '';
    try {
      const [importFiles, files] = await Promise.all([
        loadImportFiles(),
        Promise.all(chosen.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))),
      ]);
      const result = await importFiles(files);
      const name = await profiles.importFile(result.entry, result.profileText);
      settings.update({ profile: name });
      await reload();
      setCursorName(name);
      setZone('table');
      nav.push(
        <ImportReportFrame result={result} name={name} onClose={() => nav.flash(`Imported "${name}" from ${result.entry}.`)} />,
      );
    } catch (e) {
      nav.flash(`Import failed: ${errText(e)}`, 'fail');
    }
  };

  const press = (b: ButtonId): void => {
    if (disabled(b)) return;
    switch (b) {
      case 'SELECT':
        return select();
      case 'NEW':
        return nav.push(<NameFrame mode="create" done={done} />);
      case 'EDIT':
        if (cur) edit(cur.name);
        return;
      case 'RENAME':
        return nav.push(<NameFrame mode="rename" from={curName} done={done} />);
      case 'DELETE':
        return nav.push(<DeleteFrame name={curName} done={done} />);
      case 'IMPORT':
        fileRef.current?.click();
        return;
      case 'EXPORT':
        void exportCur();
        return;
    }
  };

  useKeys((e, nk) => {
    const l = letterOf(e);
    const def = l ? BUTTON_DEFS.find((d) => d.letter === l) : undefined;
    if (def) {
      press(def.id);
      return true;
    }
    if (nk === 'tab' || nk === 'backtab') {
      setZone(zone === 'table' ? 'buttons' : 'table');
      return true;
    }
    if (zone === 'buttons') {
      switch (nk) {
        case 'left':
        case 'right':
          setBtn(step(BUTTONS.length, btnIdx, nk === 'left' ? -1 : 1, { enabled: btnEnabled }));
          return true;
        case 'home':
          setBtn(step(BUTTONS.length, -1, 1, { enabled: btnEnabled }));
          return true;
        case 'end':
          setBtn(step(BUTTONS.length, BUTTONS.length, -1, { enabled: btnEnabled }));
          return true;
        case 'up':
          setZone('table');
          return true;
        case 'down':
          return true;
        case 'activate':
          press(BUTTONS[btnIdx]!);
          return true;
      }
      return false;
    }
    switch (nk) {
      case 'left':
      case 'right':
        setZone('buttons');
        return true;
      case 'up':
        moveTo(cursor - 1);
        return true;
      case 'down':
        moveTo(cursor + 1);
        return true;
      case 'pgup':
        moveTo(cursor - PAGE);
        return true;
      case 'pgdn':
        moveTo(cursor + PAGE);
        return true;
      case 'home':
        moveTo(0);
        return true;
      case 'end':
        moveTo(rows.length - 1);
        return true;
      case 'activate':
        pick(cur);
        return true;
    }
    return false;
  });

  const now = Date.now();
  const enterHint = cur && cur.name === s.profile ? 'Enter or click: edit' : 'Enter or click: select';
  return (
    <Box title="Profiles" onBack={() => nav.pop()} class="wc-pl" winClass="wc-pl-win">
      <div class="wc-pl-head">
        <button
          type="button"
          tabIndex={-1}
          class="wc-pl-sort"
          title="Sort by name"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setDir(dir > 0 ? -1 : 1)}
        >
          Name {dir > 0 ? '▲' : '▼'}
        </button>
        <span>Changed</span>
      </div>
      <ul
        class={'wc-pl-list' + (zone === 'table' ? ' is-focus' : '')}
        ref={listRef}
        role="listbox"
        aria-label="Profiles"
      >
        {rows.map((r, i) => {
          const on = i === cursor;
          const sel = r.name === s.profile;
          return (
            <li
              key={r.name}
              class={'wc-pl-row' + (on ? ' is-on' : '') + (sel ? ' is-selected' : '')}
              role="option"
              aria-selected={on ? 'true' : 'false'}
              data-name={r.name}
              title={on ? enterHint : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onPointerMove={(e) => {
                if (e.pointerType !== 'touch' && !on) moveTo(i);
              }}
              onClick={(e) => {
                e.stopPropagation();
                moveTo(i);
                setZone('table');
                pick(r);
              }}
            >
              <span class="wc-pl-name">
                <span class="wc-pl-n">{r.name}</span>
                {sel && <small class="wc-pl-tag">Selected</small>}
              </span>
              <span class="wc-pl-time" title={fullDate(r.modified)}>
                {timeAgo(r.modified, now)}
              </span>
            </li>
          );
        })}
        {list !== null && rows.length === 0 && <li class="wc-pl-empty">No profiles yet. New makes one.</li>}
      </ul>
      <div class="wc-lk-btns wc-pl-btns">
        {BUTTON_DEFS.map((d, i) => (
          <GlassButton
            key={d.id}
            id={d.id}
            label={d.label}
            letter={d.letter}
            icon={d.icon}
            danger={d.danger}
            disabled={disabled(d.id)}
            selected={zone === 'buttons' && i === btnIdx}
            onClick={() => {
              setBtn(i);
              setZone('buttons');
              press(d.id);
            }}
          />
        ))}
      </div>
      <LookFlash />
      <input ref={fileRef} type="file" multiple hidden class="wc-profile-file" onChange={() => void onFile()} />
    </Box>
  );
});

// ------------------------------------------------------------ name input

interface NameFrameProps {
  mode: 'create' | 'rename';
  from?: string;
  done: Done;
}

/** NEW (then Blank/Copy) and RENAME: a validated name prompt. */
function NameFrame(p: NameFrameProps): VNode {
  const { profiles, settings } = useServices();
  const nav = useNav();
  const { cols } = useGrid();
  const [value, setValue] = useState(p.mode === 'rename' ? (p.from ?? '') : '');
  const [error, setError] = useState('');
  const busy = useRef(false);

  const confirm = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      const names = (await profiles.list()).map((r) => r.name);
      const name = value.trim();
      if (p.mode === 'rename' && name === p.from) return nav.pop();
      const err = nameError(name, names, p.mode === 'rename' ? p.from : undefined);
      if (err) return setError(err);
      if (p.mode === 'create') return nav.replace(<ChooseFrame name={name} done={p.done} />);
      await profiles.rename(p.from!, name);
      if (settings.get().profile === p.from) settings.update({ profile: name });
      p.done(name, `Renamed to "${name}".`);
      nav.pop();
    } catch (e) {
      setError(errText(e));
    } finally {
      busy.current = false;
    }
  };

  useKeys((_e, nk) => {
    if (nk === 'activate' && _e.key === 'Enter') {
      void confirm();
      return true;
    }
    return false;
  });

  const w = Math.min(cols - 4, NAME_MAX + 4);
  const at = centreLeft(cols, w);
  return (
    <Page
      title={p.mode === 'create' ? 'Create New Profile' : 'Rename Profile'}
      footer={[
        { text: 'Enter Confirm', onClick: () => void confirm() },
        { text: 'ESC Cancel', onClick: () => nav.pop() },
      ]}
    >
      {p.mode === 'rename' && <Centered text={`Rename "${p.from}" to:`} class="wc-c-active" />}
      <TextField
        value={value}
        onInput={(v) => {
          setValue(v);
          setError('');
        }}
        width={w}
        at={at}
        maxLength={NAME_MAX + 8}
        label="Profile name"
      />
      <Centered text={NAME_HINT} class="wc-c-hint" />
      {error ? <Centered text={error} class="wc-c-danger" /> : <Blank />}
    </Page>
  );
}

/** After the name: B blank profile, C copy from an existing one. */
function ChooseFrame(p: { name: string; done: Done }): VNode {
  const { profiles, settings } = useServices();
  const nav = useNav();
  const create = async (text?: string): Promise<void> => {
    try {
      await profiles.create(p.name, text);
      settings.update({ profile: p.name });
      p.done(p.name, `Created "${p.name}".`);
      nav.pop();
    } catch (e) {
      nav.flash(errText(e), 'fail');
    }
  };
  const copy = (): void => nav.replace(<CopyFrame name={p.name} create={create} />);
  const items: MenuItem[] = [
    { key: 'blank', label: 'Blank profile', activate: () => void create() },
    { key: 'copy', label: 'Copy from existing', activate: copy },
  ];
  const [cursor, setCursor] = useMenuCursor(items);
  useKeys((e, nk) => {
    const k = e.key.toLowerCase();
    if (!e.ctrlKey && !e.altKey && !e.metaKey && k === 'b') {
      void create();
      return true;
    }
    if (!e.ctrlKey && !e.altKey && !e.metaKey && k === 'c') {
      copy();
      return true;
    }
    return menuKey(items, cursor, setCursor, nk);
  });
  return (
    <Page title="Create New Profile" footer={['B Blank profile', 'C Copy from existing', 'ESC Cancel']}>
      <Centered text={`Name: ${p.name}`} class="wc-c-active" />
      <Blank />
      <MenuRows items={items} cursor={cursor} setCursor={setCursor} />
      <Blank />
      <FlashRow />
    </Page>
  );
}

/** Copy picker: the new profile starts as a copy of the chosen one. */
function CopyFrame(p: { name: string; create: (text?: string) => Promise<void> }): VNode {
  const { profiles } = useServices();
  const nav = useNav();
  const [list, setList] = useState<ProfileRecord[] | null>(null);
  useEffect(() => {
    void profiles.list().then(setList, () => setList([]));
  }, []);
  const items: MenuItem[] = (list ?? []).map((r) => ({
    key: r.name,
    label: r.name,
    activate: () => void p.create(r.text),
  }));
  const [cursor, setCursor] = useMenuCursor(items);
  useKeys((_e, nk) => {
    if (list && list.length === 0 && nk !== null) {
      nav.pop();
      return true;
    }
    return menuKey(items, cursor, setCursor, nk);
  });
  return (
    <Page title="Create New Profile" footer={['↑↓ Navigate', 'Enter Select', 'ESC Cancel']}>
      <Centered text={`Copy from:`} class="wc-c-body" />
      <Blank />
      {list && list.length === 0 ? (
        <Centered text="No profiles available to copy from." class="wc-c-hint" />
      ) : (
        <MenuRows items={items} cursor={cursor} setCursor={setCursor} />
      )}
      <Blank />
      <FlashRow />
    </Page>
  );
}

/** DELETE: `Delete profile 'name'?  (y/N)`; any other key cancels. */
function DeleteFrame(p: { name: string; done: Done }): VNode {
  const { profiles, settings } = useServices();
  const nav = useNav();
  const confirm = async (): Promise<void> => {
    try {
      await profiles.remove(p.name);
      const names = (await profiles.list()).map((r) => r.name);
      if (settings.get().profile === p.name) settings.update({ profile: DEFAULT_PROFILE });
      const next = names.find((n) => compareNames(n, p.name) > 0) ?? names[names.length - 1] ?? DEFAULT_PROFILE;
      p.done(next, `Deleted "${p.name}".`);
      nav.pop();
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
      title="Delete Profile"
      footer={[
        { text: 'Y Confirm', onClick: () => void confirm() },
        { text: 'any other key Cancel', onClick: () => nav.pop() },
      ]}
    >
      <Centered text={`Delete profile '${p.name}'?  (y/N)`} class="wc-c-active" />
    </Page>
  );
}
