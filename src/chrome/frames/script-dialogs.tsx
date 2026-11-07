// The Scripts page's dialogs (stage 44a; spec §2.10, ADR 0051, ADR 0053;
// round 7 `SC.dialogs`): New, Rename, Delete, Export, Import (a `.lua`
// file) and Restore (a backup), each an overlay frame (`nav.push(…,
// { overlay: true })`) rendering the kit's `Dialog`: a small Lykta box
// over the page, which stays drawn and veiled under it. Feedback goes to
// the page's flash (a flash before the pop shows on the page).
//
// Keys are the Dialog's (its letters, Enter the primary, Tab / ← → the
// buttons, Esc cancels); Export's rows and Import's code add a key layer
// of their own for ↑ ↓ PgUp PgDn Home End.

import type { Ref, VNode } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { SCRIPT_NAME_MAX, type ScriptLibrary, scriptNameError } from '../../scripts';
import { type ScriptBackup, formatScriptBackup, scriptBackupFileName } from '../../scripts/backup';
import { downloadBlob } from '../kit/download';
import { Dialog, Field, Well, lookFrame, useListCursor } from '../kit/look';
import { useKeyLayer, useNav } from '../kit/stack';

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export const NAME_HINT = `A letter, then letters, digits, _ or -. At most ${SCRIPT_NAME_MAX}.`;

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

// ------------------------------------------------------------ New, Rename

export interface NameDialogProps {
  lib: ScriptLibrary;
  mode: 'create' | 'rename';
  from?: string;
  /** The script's name once it exists (created or renamed). */
  done(name: string): void;
}

/** New (then the editor opens on the template) and Rename: a validated name. */
export const NameDialog = lookFrame(function NameDialog(p: NameDialogProps): VNode {
  const nav = useNav();
  const [value, setValue] = useState(p.mode === 'rename' ? (p.from ?? '') : '');
  const [error, setError] = useState<string | null>(null);
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
        // The editor opens in this dialog's place, on the template.
        const mod = await import('../../editor').catch(() => null);
        nav.pop();
        if (mod) mod.openScriptEditor(nav, { library: p.lib, name, onName: p.done });
        else nav.flash(`Created ${name}. It is off until you turn it on.`);
        return;
      }
      await p.lib.rename(p.from!, name);
      p.done(name);
      nav.flash(`Renamed to ${name}.`);
      nav.pop();
    } catch (e) {
      setError(errText(e));
    } finally {
      busy.current = false;
    }
  };

  const create = p.mode === 'create';
  return (
    <Dialog
      title={create ? 'New Script' : 'Rename Script'}
      dlg={create ? 'new' : 'rename'}
      error={error}
      onCancel={() => nav.pop()}
      buttons={[
        { id: 'CANCEL', label: 'Cancel', run: () => nav.pop() },
        { id: 'OK', label: create ? 'Create' : 'Rename', primary: true, run: () => void confirm() },
      ]}
    >
      <p class="wc-lk-q">{create ? 'Name of the new script:' : `Rename “${p.from}” to:`}</p>
      <Field
        id="name"
        value={value}
        mono
        placeholder="myscript"
        hint={NAME_HINT}
        maxLength={SCRIPT_NAME_MAX + 8}
        autoFocus
        selectAll={!create}
        onInput={(v) => {
          setValue(v);
          setError(null);
        }}
      />
    </Dialog>
  );
});

// ------------------------------------------------------------ Delete

/** Delete: Y deletes; N, Enter or any other key cancels (y/N). */
export const DeleteDialog = lookFrame(function DeleteDialog(p: { lib: ScriptLibrary; name: string; done(next: string | null): void }): VNode {
  const nav = useNav();
  const confirm = async (): Promise<void> => {
    try {
      const names = p.lib.list().map((s) => s.name);
      const i = names.indexOf(p.name);
      await p.lib.remove(p.name);
      const left = p.lib.list().map((s) => s.name);
      p.done(left[Math.min(i, left.length - 1)] ?? null);
      nav.flash(`Deleted ${p.name}.`);
    } catch (e) {
      nav.flash(errText(e), 'fail');
    }
    nav.pop();
  };
  return (
    <Dialog
      title="Delete Script"
      dlg="delete"
      anyKeyCancels
      onCancel={() => nav.pop()}
      buttons={[
        { id: 'CANCEL', label: 'Cancel', letter: 'n', primary: true, run: () => nav.pop() },
        { id: 'YES', label: 'Yes, delete', letter: 'y', danger: true, run: () => void confirm() },
      ]}
    >
      <p class="wc-lk-q">
        Delete script <b>{p.name}</b>?
      </p>
      <p class="wc-lk-qn">Its settings and saved data go too.</p>
    </Dialog>
  );
});

// ------------------------------------------------------------ Export

/** Export: this script as `.lua`, or every script as one backup file. */
export const ExportDialog = lookFrame(function ExportDialog(p: { lib: ScriptLibrary; name: string }): VNode {
  const nav = useNav();
  const one = (): void => {
    try {
      const f = p.lib.exportFile(p.name);
      downloadBlob(new Blob([f.text], { type: 'text/x-lua;charset=utf-8' }), f.fileName);
      nav.flash(`Exported ${f.fileName}.`);
    } catch (e) {
      nav.flash(`Export failed: ${errText(e)}`, 'fail');
    }
    nav.pop();
  };
  const all = (): void => {
    try {
      const name = scriptBackupFileName(new Date());
      downloadBlob(new Blob([formatScriptBackup(p.lib.backupRecords())], { type: 'application/json;charset=utf-8' }), name);
      const n = p.lib.list().filter((s) => !s.bundled).length;
      nav.flash(`Exported ${plural(n, 'script')} and all settings to ${name}.`);
    } catch (e) {
      nav.flash(`Export failed: ${errText(e)}`, 'fail');
    }
    nav.pop();
  };
  const run = [one, all];
  const list = useListCursor({ count: 2, onActivate: (i) => run[i]!() });
  useKeyLayer((e, nk) => list.key(e, nk));
  const rows: [k: string, title: string, note: VNode][] = [
    ['one', 'This script', <span class="wc-lk-mono wc-scr-xfile">{p.name}.lua</span>],
    ['all', 'All scripts and their data', <span class="wc-lk-dim wc-scr-xnote">backup</span>],
  ];
  return (
    <Dialog title="Export Scripts" dlg="export" onCancel={() => nav.pop()} buttons={[{ id: 'CANCEL', label: 'Cancel', run: () => nav.pop() }]}>
      <div class="wc-lk-rows wc-scr-xrows" role="listbox" aria-label="Export" ref={list.scrollRef as unknown as Ref<HTMLDivElement>}>
        {rows.map(([k, title, note], i) => (
          <div key={k} class={'wc-lk-row' + (i === list.i ? ' is-on is-cur' : '')} role="option" aria-selected={i === list.i} data-k={k} {...list.rowProps(i)}>
            <span class="wc-scr-xtitle">{title}</span>
            {note}
          </div>
        ))}
      </div>
      <p class="wc-lk-qn">A backup holds your own scripts, every script's settings and saved data. Import reads it back.</p>
    </Dialog>
  );
});

// ------------------------------------------------------------ Import a .lua

/** Import a `.lua` file: the warning and its code first; Import (I, also Y) adds it turned off. */
export const ImportDialog = lookFrame(function ImportDialog(p: { lib: ScriptLibrary; fileName: string; text: string; done(name: string): void }): VNode {
  const nav = useNav();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const code = useMemo(() => p.text.replace(/\r\n?/g, '\n').replace(/\n$/, '').replace(/\t/g, '  ').split('\n'), [p.text]);
  const nums = useMemo(() => code.map((_, i) => String(i + 1)).join('\n'), [code]);

  const confirm = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      const info = await p.lib.importFile(p.fileName, p.text);
      p.done(info.name);
      nav.flash(`Imported ${info.name} from ${p.fileName}. It is off until you turn it on.`);
      nav.pop();
    } catch (e) {
      busy.current = false;
      setError(`Import failed: ${errText(e)}`);
    }
  };

  useKeyLayer((e, nk) => {
    if ((e.key === 'y' || e.key === 'Y') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      void confirm();
      return true;
    }
    const el = box.current;
    if (!el) return false;
    const page = Math.max(40, el.clientHeight - 30);
    const by: Partial<Record<string, number>> = { up: -22, down: 22, pgup: -page, pgdn: page };
    if (e.key === ' ' && nk === 'activate') {
      el.scrollTop += page;
      return true;
    }
    if (nk && by[nk] !== undefined) {
      el.scrollTop += by[nk]!;
      return true;
    }
    if (nk === 'home' || nk === 'end') {
      el.scrollTop = nk === 'home' ? 0 : el.scrollHeight;
      return true;
    }
    return false;
  });

  return (
    <Dialog
      title="Import Script"
      dlg="import"
      width={820}
      error={error}
      onCancel={() => nav.pop()}
      buttons={[
        { id: 'CANCEL', label: 'Cancel', run: () => nav.pop() },
        { id: 'IMPORT', label: 'Import', letter: 'i', primary: true, run: () => void confirm() },
      ]}
    >
      <p class="wc-scr-warn">This script can send commands to the game as you.</p>
      <p class="wc-lk-qn">
        Read <span class="wc-lk-mono wc-scr-xfile">{p.fileName}</span> before you import it. It is added turned off.
      </p>
      <Well mono class="wc-scr-code">
        <div class="wc-scr-codebox wc-lk-scroll" ref={box}>
          <pre class="wc-scr-gut" aria-hidden="true">
            {nums}
          </pre>
          <pre class="wc-scr-src">{code.join('\n')}</pre>
        </div>
      </Well>
    </Dialog>
  );
});

// ------------------------------------------------------------ Restore a backup

/** Import of a backup file: what it holds and a warning; Restore (R, also Y) adds what is missing, turned off. */
export const RestoreDialog = lookFrame(function RestoreDialog(p: {
  lib: ScriptLibrary;
  fileName: string;
  backup: ScriptBackup;
  done(name: string): void;
}): VNode {
  const nav = useNav();
  const busy = useRef(false);
  const b = p.backup;
  const confirm = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await p.lib.restore(b);
      if (r.added[0]) p.done(r.added[0]);
      const parts = [`Restored ${plural(r.added.length, 'script')}`];
      if (r.skipped.length) parts.push(`${r.skipped.length} already present`);
      if (r.renamed.length) parts.push(`renamed ${r.renamed.map(([a, c]) => `${a} → ${c}`).join(', ')}`);
      parts.push(`settings and data of ${r.data}`);
      nav.flash(`${parts.join(', ')}. Restored scripts are off.`);
    } catch (e) {
      nav.flash(`Restore failed: ${errText(e)}`, 'fail');
    }
    nav.pop();
  };
  useKeyLayer((e) => {
    if ((e.key === 'y' || e.key === 'Y') && !e.ctrlKey && !e.altKey && !e.metaKey) {
      void confirm();
      return true;
    }
    return false;
  });
  const names = b.scripts.map((s) => s.name).join(', ');
  return (
    <Dialog
      title="Restore Scripts"
      dlg="restore"
      onCancel={() => nav.pop()}
      buttons={[
        { id: 'CANCEL', label: 'Cancel', letter: 'n', run: () => nav.pop() },
        { id: 'RESTORE', label: 'Restore', letter: 'r', primary: true, run: () => void confirm() },
      ]}
    >
      <p class="wc-scr-warn">These scripts can send commands to the game as you.</p>
      <p class="wc-lk-q">
        Restore from <span class="wc-lk-mono wc-scr-xfile">{p.fileName}</span>?
      </p>
      <p class="wc-lk-qn wc-scr-gap">
        {plural(b.scripts.length, 'script')}
        {names ? `: ${names}` : ''}
      </p>
      <p class="wc-lk-qn">Settings and saved data of {plural(b.data.length, 'script')}.</p>
      <p class="wc-lk-qn wc-scr-gap wc-lk-faint">Only what is missing is added; nothing here is replaced. Scripts are added turned off.</p>
    </Dialog>
  );
});
