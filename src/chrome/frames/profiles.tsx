// Profile frame (Inv §3.4, "P4" layout) and its sub-frames.
//
//   [ button column | 2-cell gap | table (Name ▲, Selected) | scrollbar ]
//
// Two focus zones: the table (default, cursor on the selected profile) and
// the buttons. Tab/Shift+Tab toggle, ← focuses the buttons, → the table.
// In the table, Enter or a click on a row selects that profile; on the
// profile that is already selected it opens the editor, as EDIT does
// (stage 25: first click selects, the second edits).
// Buttons: SELECT (disabled on the selected row), NEW, EDIT (the profile
// editor, src/editor, loaded on demand),
// RENAME and DELETE (disabled on `default`), IMPORT (one or more files,
// native or foreign, then the import report), EXPORT, BACK.
// Feedback goes to the flash row under the package (~3 s).

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
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
import { editProfile } from './profile-edit';
import { loadImportFiles } from './import-load';
import { ImportReportFrame } from './import-report';
import { cellLen, centreLeft, step } from '../kit/nav';
import { useIsTop, useKeys, useNav } from '../kit/stack';
import {
  Blank,
  Button,
  Centered,
  type Column,
  FlashRow,
  type MenuItem,
  MenuRows,
  Page,
  Table,
  TextField,
  indent,
  menuKey,
  useBodyRows,
  useMenuCursor,
} from '../kit/widgets';

type Done = (name: string, message: string) => void;

const BUTTONS = ['SELECT', 'NEW', 'EDIT', 'RENAME', 'DELETE', 'IMPORT', 'EXPORT', 'BACK'] as const;
type ButtonId = (typeof BUTTONS)[number];
const BUTTON_W = Math.max(...BUTTONS.map((b) => b.length)) + 2;
const GAP = 2;
const SEL_W = 8;

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function ProfileFrame(): VNode {
  const { profiles, settings, onProfileSaved } = useServices();
  const s = useSettings();
  const nav = useNav();
  const isTop = useIsTop();
  const { cols } = useGrid();
  const bodyRows = useBodyRows();
  const [list, setList] = useState<ProfileRecord[]>([]);
  const [dir, setDir] = useState<1 | -1>(1);
  const [cursorName, setCursorName] = useState<string>(s.profile);
  const [zone, setZone] = useState<'table' | 'buttons'>('table');
  const [btn, setBtn] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async (): Promise<void> => {
    try {
      setList(await profiles.list());
    } catch (e) {
      nav.flash(`Could not read profiles: ${errText(e)}`, 'fail');
    }
  };
  useEffect(() => {
    if (isTop) void reload();
  }, [isTop]);

  const rows = dir > 0 ? list : [...list].reverse();
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

  // Layout.
  const visible = Math.max(3, Math.min(Math.max(rows.length, BUTTONS.length - 1), bodyRows - 3));
  const nameW = Math.min(NAME_MAX, Math.max(12, ...rows.map((r) => cellLen(r.name))));
  const tableW = nameW + 1 + SEL_W + (rows.length > visible ? 1 : 0);
  const at = centreLeft(cols, BUTTON_W + GAP + tableW);

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
      case 'BACK':
        return nav.pop();
    }
  };

  useKeys((_e, nk) => {
    switch (nk) {
      case 'tab':
      case 'backtab':
        setZone(zone === 'table' ? 'buttons' : 'table');
        return true;
      case 'left':
        setZone('buttons');
        return true;
      case 'right':
        setZone('table');
        return true;
    }
    if (zone === 'buttons') {
      if (nk === 'up' || nk === 'down') {
        setBtn(step(BUTTONS.length, btnIdx, nk === 'up' ? -1 : 1, { enabled: btnEnabled }));
        return true;
      }
      if (nk === 'activate') {
        press(BUTTONS[btnIdx]!);
        return true;
      }
      return false;
    }
    switch (nk) {
      case 'up':
        moveTo(cursor - 1);
        return true;
      case 'down':
        moveTo(cursor + 1);
        return true;
      case 'pgup':
        moveTo(cursor - 10);
        return true;
      case 'pgdn':
        moveTo(cursor + 10);
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

  const columns: Column<ProfileRecord>[] = [
    { key: 'name', title: 'Name', width: nameW, sortable: true, cell: (r) => ({ text: r.name }) },
    {
      key: 'sel',
      title: 'Selected',
      width: SEL_W,
      align: 'center',
      cell: (r) => (r.name === s.profile ? { text: '✓', class: 'wc-c-ok' } : { text: '' }),
    },
  ];

  return (
    <Page
      title="Profile"
      footer={['↑↓ Navigate', 'Tab/←→ Cycle', zone === 'table' && cur?.name === s.profile ? 'Enter Edit' : 'Enter Select', 'ESC Back']}
    >
      <div class="wc-pkg" style={{ ...indent(at), display: 'flex' }}>
        <div class="wc-btncol">
          {BUTTONS.map((b, i) => (
            <div class="wc-line">
              <Button
                label={b}
                width={BUTTON_W}
                selected={i === btnIdx}
                focused={zone === 'buttons'}
                disabled={disabled(b)}
                onClick={() => {
                  setBtn(i);
                  setZone('buttons');
                  press(b);
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ width: `calc(var(--cell-w) * ${GAP})` }} />
        <Table
          columns={columns}
          rows={rows}
          cursor={cursor}
          visible={visible}
          focused={zone === 'table'}
          sort={{ key: 'name', dir }}
          onSort={() => setDir(dir > 0 ? -1 : 1)}
          onRowClick={(i) => {
            moveTo(i);
            setZone('table');
            pick(rows[i]);
          }}
        />
      </div>
      <Blank />
      <FlashRow />
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        class="wc-profile-file"
        onChange={() => void onFile()}
      />
    </Page>
  );
}

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
