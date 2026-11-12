// The Profile list's dialogs (Inv §3.4; ADR 0128 addendum 2026-11-12): New,
// Rename and Delete, each an overlay frame (`nav.push(…, { overlay: true })`)
// rendering the kit's `Dialog`, as the Scripts page's (script-dialogs.tsx):
// a small Lykta box over the list, which stays drawn and veiled under it.
// Feedback goes to the list's flash.
//
// New is one overlay frame that walks three steps, each its own `Dialog`
// (`data-dlg`):
//
//   new       the name (a validated `Field`)        Enter → new-how
//   new-how   Blank profile / Copy from existing    B, C, ↑ ↓ + Enter, a click
//   new-copy  the profile to copy (a scrolling list) ↑ ↓ PgUp PgDn Home End + Enter, a click
//
// Esc (and the Back button) goes one step back, with the typed name kept;
// at the name it cancels. Nothing is created before the last step.
//
// Rename is the name step alone (`data-dlg="rename"`). Delete
// (`data-dlg="delete"`) is y/N: Y deletes, any other key or a click on
// Cancel or the veil cancels.

import type { Ref, VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_PROFILE, NAME_HINT, NAME_MAX, type ProfileRecord, compareNames, nameError } from '../../profiles';
import { useServices, useSettings } from '../kit/hooks';
import { Dialog, Field, KeyLabel, letterOf, lookFrame, useListCursor } from '../kit/look';
import { useKeyLayer, useNav } from '../kit/stack';
import { popper } from './script-dialogs';

/** After a dialog's work: the row to highlight and the list's flash. */
export type ProfileDone = (name: string, message: string) => void;

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// ------------------------------------------------------------ New, Rename

export interface ProfileNameDialogProps {
  mode: 'create' | 'rename';
  from?: string;
  done: ProfileDone;
}

type Step = 'name' | 'how' | 'copy';

/** New (the name, then Blank or Copy, then the profile to copy) and Rename (the name). */
export const ProfileNameDialog = lookFrame(function ProfileNameDialog(p: ProfileNameDialogProps): VNode {
  const { profiles, settings } = useServices();
  const nav = useNav();
  const selected = useSettings().profile;
  const create = p.mode === 'create';
  const [value, setValue] = useState(create ? '' : (p.from ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('name');
  const [list, setList] = useState<ProfileRecord[] | null>(null);
  /** A later step is drawn without the veil's fade (the veil is already there). */
  const moved = useRef(false);
  const busy = useRef(false);
  /** The name the later steps create: the one that passed the check, whatever the field holds since. */
  const [name, setName] = useState('');

  const go = (s: Step): void => {
    moved.current = true;
    setError(null);
    setStep(s);
  };

  /** The name step's Enter: validate, then the next step (New) or the rename. */
  const confirmName = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    const at = popper(nav);
    try {
      const name = value.trim();
      const names = (await profiles.list()).map((r) => r.name);
      if (!at.stillTop()) return;
      if (!create && name === p.from) return nav.pop();
      const err = nameError(name, names, create ? undefined : p.from);
      if (err) return setError(err);
      if (create) {
        setName(name);
        setValue(name);
        return go('how');
      }
      await profiles.rename(p.from!, name);
      if (settings.get().profile === p.from) settings.update({ profile: name });
      p.done(name, `Renamed to "${name}".`);
      at.pop();
    } catch (e) {
      setError(errText(e));
    } finally {
      busy.current = false;
    }
  };

  /** Creates the profile (blank, or with `text`), selects it and closes. */
  const make = async (text?: string): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    const at = popper(nav);
    try {
      await profiles.create(name, text);
      settings.update({ profile: name });
      p.done(name, `Created "${name}".`);
      at.pop();
    } catch (e) {
      setError(errText(e));
    } finally {
      busy.current = false;
    }
  };

  const toCopy = (): void => {
    setList(null);
    go('copy');
  };
  useEffect(() => {
    if (step !== 'copy') return;
    let live = true;
    void profiles.list().then(
      (l) => live && setList(l),
      () => live && setList([]),
    );
    return () => {
      live = false;
    };
  }, [step]);

  const how = useListCursor({ count: 2, wrap: true, onActivate: (i) => (i === 0 ? void make() : toCopy()) });
  const rows = list ?? [];
  const copy = useListCursor({ count: rows.length, wrap: true, onActivate: (i) => void make(rows[i]!.text) });

  // Over the dialog's own keys: the rows of the two list steps (and B / C).
  // While a check or the create runs every key is held, so a key typed
  // ahead never lands in the field or on the step that is going away.
  useKeyLayer((e, nk) => {
    if (busy.current) return true;
    if (step === 'name') return false;
    if (step === 'how') {
      const l = letterOf(e);
      if (l === 'b') {
        void make();
        return true;
      }
      if (l === 'c') {
        toCopy();
        return true;
      }
      return how.key(e, nk);
    }
    return copy.key(e, nk);
  });

  const cancel = (): void => nav.pop();
  let dialog: VNode;
  if (step === 'name') {
    dialog = (
      <Dialog
        key="name"
        title={create ? 'New Profile' : 'Rename Profile'}
        dlg={create ? 'new' : 'rename'}
        error={error}
        onCancel={cancel}
        buttons={[
          { id: 'CANCEL', label: 'Cancel', run: cancel },
          { id: 'OK', label: create ? 'Next' : 'Rename', primary: true, run: () => void confirmName() },
        ]}
      >
        <p class="wc-lk-q">{create ? 'Name of the new profile:' : `Rename “${p.from}” to:`}</p>
        <Field
          id="name"
          value={value}
          mono
          placeholder="myprofile"
          hint={NAME_HINT}
          maxLength={NAME_MAX + 8}
          autoFocus
          selectAll={!create || moved.current}
          onInput={(v) => {
            setValue(v);
            setError(null);
          }}
        />
      </Dialog>
    );
  } else if (step === 'how') {
    const opts: [k: string, label: string, letter: string, note: string][] = [
      ['blank', 'Blank profile', 'b', 'empty'],
      ['copy', 'Copy from existing', 'c', 'pick one'],
    ];
    dialog = (
      <Dialog
        key="how"
        title="New Profile"
        dlg="new-how"
        error={error}
        onCancel={() => go('name')}
        buttons={[{ id: 'BACK', label: 'Back', run: () => go('name') }]}
      >
        <p class="wc-lk-q">
          How should <span class="wc-lk-mono wc-pd-name">{name}</span> start?
        </p>
        <div class="wc-lk-rows wc-pd-rows" role="listbox" aria-label="Start from" ref={how.scrollRef as unknown as Ref<HTMLDivElement>}>
          {opts.map(([k, label, letter, note], i) => (
            <div key={k} class={'wc-lk-row' + (i === how.i ? ' is-on is-cur' : '')} role="option" aria-selected={i === how.i} data-k={k} {...how.rowProps(i)}>
              <KeyLabel text={label} letter={letter} class="wc-pd-title" />
              <span class="wc-lk-dim wc-pd-note">{note}</span>
            </div>
          ))}
        </div>
      </Dialog>
    );
  } else {
    dialog = (
      <Dialog
        key="copy"
        title="New Profile"
        dlg="new-copy"
        error={error}
        onCancel={() => go('how')}
        buttons={[{ id: 'BACK', label: 'Back', run: () => go('how') }]}
      >
        <p class="wc-lk-q">
          Copy <span class="wc-lk-mono wc-pd-name">{name}</span> from:
        </p>
        {list !== null && rows.length === 0 ? (
          <p class="wc-lk-qn">No profiles available to copy from.</p>
        ) : (
          <div
            class="wc-lk-rows is-flat wc-lk-scroll wc-pd-rows wc-pd-copy"
            role="listbox"
            aria-label="Copy from"
            ref={copy.scrollRef as unknown as Ref<HTMLDivElement>}
          >
            {rows.map((r, i) => (
              <div
                key={r.name}
                class={'wc-lk-row' + (i === copy.i ? ' is-on is-cur' : '')}
                role="option"
                aria-selected={i === copy.i}
                data-name={r.name}
                {...copy.rowProps(i)}
              >
                <span class="wc-lk-mono wc-pd-pname">{r.name}</span>
                {r.name === selected && <span class="wc-lk-dim wc-pd-note">selected</span>}
              </div>
            ))}
          </div>
        )}
      </Dialog>
    );
  }
  return <div class={'wc-pd-steps' + (moved.current ? ' is-moved' : '')}>{dialog}</div>;
});

// ------------------------------------------------------------ Delete

/**
 * Delete: Y deletes; N, Enter or any other key cancels (y/N). The highlight
 * then goes to `next` (the neighbour in the list's order) when it is still
 * there, else the next name A–Z.
 */
export const ProfileDeleteDialog = lookFrame(function ProfileDeleteDialog(p: { name: string; next?: string | undefined; done: ProfileDone }): VNode {
  const { profiles, settings } = useServices();
  const nav = useNav();
  const busy = useRef(false);
  const confirm = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    const at = popper(nav);
    try {
      await profiles.remove(p.name);
      const names = (await profiles.list()).map((r) => r.name);
      if (settings.get().profile === p.name) settings.update({ profile: DEFAULT_PROFILE });
      const next =
        (p.next !== undefined && names.includes(p.next) ? p.next : undefined) ??
        names.find((n) => compareNames(n, p.name) > 0) ??
        names[names.length - 1] ??
        DEFAULT_PROFILE;
      p.done(next, `Deleted "${p.name}".`);
    } catch (e) {
      nav.flash(errText(e), 'fail');
    }
    at.pop();
  };
  // Once the delete has started, every key is held (the list under it never acts on one).
  useKeyLayer(() => busy.current);
  const cancel = (): void => {
    if (!busy.current) nav.pop();
  };
  return (
    <Dialog
      title="Delete Profile"
      dlg="delete"
      anyKeyCancels
      onCancel={cancel}
      buttons={[
        { id: 'CANCEL', label: 'Cancel', letter: 'n', primary: true, run: cancel },
        { id: 'YES', label: 'Yes, delete', letter: 'y', danger: true, run: () => void confirm() },
      ]}
    >
      <p class="wc-lk-q">
        Delete profile <b class="wc-lk-mono wc-pd-name">{p.name}</b>?
      </p>
      <p class="wc-lk-qn">Everything in it goes with it.</p>
    </Dialog>
  );
});
