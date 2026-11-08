// The import page (stage 43c, direction C "Importsidan", ADR 0128 and the
// ADR 0073 addendum): Import on the Profile list pushes it in place of the
// list (the normal box stays and morphs to this page's size). A lead, the
// drop zone with the primary Choose files…, and the four formats the
// importer reads; the native picker opens from the button, never at once.
//
//   [Back]                ( Import )
//     Settings from another client become a new profile. …
//     ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
//     │        ⇩  Drop the files here            │
//     │          [ Choose files… ]               │
//     └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
//     TinTin++     JMC        Powwow      Mudlet
//
// The chosen (or dropped) files go through the lazy import chunk as
// before (`loadImportFiles` → `importFiles` → `profiles.importFile` →
// `settings.update({ profile })`): while that runs the page reads
// "Reading a.set, b.set…" with a thin bar; a failure stays on the page
// ("Import failed: …" with the files under it, and the drop zone to try
// again); a success replaces this page by the receipt (import-report.tsx)
// in the same box, so OK there goes straight back to the list.
//
// Keys: Enter or C = Choose files…; Esc / Back = the list (during the
// reading too: an import not yet saved is dropped, one already saved
// flashes on the list as usual). Drops anywhere on the box import those
// files; a drag of files over it lights the zone; a drop beside the box
// does nothing (the browser must not open the file over the session).
// On a touch device the drop line hides (import.css); the button stays.

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useServices } from '../kit/hooks';
import { Box, GlassButton, Icon, letterAction, lookFrame } from '../kit/look';
import { useIsTop, useKeys, useNav } from '../kit/stack';
import { loadImportFiles, readImportFiles } from './import-load';
import { IMPORT_FORMATS, IMPORT_LEAD, readingText } from './import-model';
import { ImportReceipt } from './import-report';
import './import.css';

/** Called when an import is done (after the receipt's OK): the list's cursor and flash. */
export type ImportDone = (name: string, message: string) => void;

type Stage = { at: 'pick' } | { at: 'reading'; names: string[] } | { at: 'error'; message: string; names: string[] };

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Whether a drag carries files (not text or a link). */
const hasFiles = (e: DragEvent): boolean => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

export const ImportFrame = lookFrame(function ImportFrame(p: { done: ImportDone }): VNode {
  const { profiles, settings } = useServices();
  const nav = useNav();
  const isTop = useIsTop();
  const [stage, setStage] = useState<Stage>({ at: 'pick' });
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /** The page's height when the reading began: the box keeps it (no jump while reading). */
  const [hold, setHold] = useState(0);
  const busy = useRef(false);
  /** False once the page is left (Back, or unmounted): a popped frame stays mounted while it fades. */
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const leave = (): void => {
    alive.current = false;
    nav.pop();
  };

  const run = async (chosen: File[]): Promise<void> => {
    if (busy.current || chosen.length === 0) return;
    busy.current = true;
    const names = chosen.map((f) => f.name);
    setHold(rootRef.current?.offsetHeight ?? 0);
    setStage({ at: 'reading', names });
    try {
      const [importFiles, files] = await Promise.all([loadImportFiles(), readImportFiles(chosen)]);
      const result = await importFiles(files);
      // Back during the reading: nothing is saved.
      if (!alive.current) return;
      const name = await profiles.importFile(result.entry, result.profileText);
      settings.update({ profile: name });
      const message = `Imported "${name}" from ${result.entry}.`;
      if (!alive.current) return p.done(name, message);
      nav.replace(<ImportReceipt result={result} name={name} files={names} onOk={() => p.done(name, message)} />);
    } catch (e) {
      if (alive.current) setStage({ at: 'error', message: errText(e), names });
    } finally {
      busy.current = false;
    }
  };

  const choose = (): void => {
    if (busy.current) return;
    fileRef.current?.click();
  };

  const onFile = (): void => {
    const input = fileRef.current;
    const chosen = [...(input?.files ?? [])];
    if (input) input.value = '';
    void run(chosen);
  };

  // Drops on the box (the whole box, not only the zone) import those files.
  // While the page is up, a drop beside the box is swallowed so the browser
  // never navigates to the file and ends the session.
  useEffect(() => {
    if (!isTop) return;
    const box = rootRef.current?.closest<HTMLElement>('.wc-lk-box') ?? rootRef.current;
    if (!box) return;
    let depth = 0;
    const enter = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setOver(true);
    };
    const leave = (): void => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const overBox = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = busy.current ? 'none' : 'copy';
    };
    const drop = (e: DragEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      depth = 0;
      setOver(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) void run([...files]);
    };
    const outside = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.type === 'dragover' && e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };
    box.addEventListener('dragenter', enter);
    box.addEventListener('dragleave', leave);
    box.addEventListener('dragover', overBox);
    box.addEventListener('drop', drop);
    document.addEventListener('dragover', outside);
    document.addEventListener('drop', outside);
    return () => {
      box.removeEventListener('dragenter', enter);
      box.removeEventListener('dragleave', leave);
      box.removeEventListener('dragover', overBox);
      box.removeEventListener('drop', drop);
      document.removeEventListener('dragover', outside);
      document.removeEventListener('drop', outside);
      setOver(false);
    };
  }, [isTop]);

  useKeys((e, nk) => {
    if (nk === 'back') {
      leave();
      return true;
    }
    if (stage.at === 'reading') return nk !== null;
    if (letterAction(e, { c: choose })) return true;
    if (nk === 'activate') {
      choose();
      return true;
    }
    return false;
  });

  const reading = stage.at === 'reading';
  // The picker's input sits beside the box, not in it: the box is
  // `visibility: hidden` while it morphs in, and Chromium opens no file
  // chooser for an input that is not visible (Enter right after Import).
  return (
    <>
      <Box title="Import" onBack={leave} class="wc-imp" winClass="wc-imp-win">
        <div
          ref={rootRef}
          class={'wc-imp-page' + (reading ? ' is-reading' : '')}
          data-stage={stage.at}
          style={reading && hold > 0 ? { minHeight: `${hold}px` } : undefined}
        >
          {reading ? (
            <div class="wc-imp-reading" role="status">
              <p>{readingText(stage.names)}</p>
              <div class="wc-imp-bar">
                <i />
              </div>
            </div>
          ) : (
            <>
              <p class="wc-imp-lead">{IMPORT_LEAD}</p>
              <div class={'wc-imp-drop' + (over ? ' is-over' : '')}>
                <Icon name="drop" class="wc-imp-drop-ic" />
                <p class="wc-imp-drop-t">Drop the files here</p>
                <GlassButton
                  id="CHOOSE"
                  label="Choose files…"
                  letter="c"
                  icon="folder"
                  primary
                  keepIcon
                  onClick={choose}
                />
              </div>
              {stage.at === 'error' ? (
                <div class="wc-imp-err" role="alert">
                  <p>Import failed: {stage.message}</p>
                  {stage.names.length > 0 && <span class="wc-imp-err-files">{stage.names.join(', ')}</span>}
                </div>
              ) : (
                <ul class="wc-imp-fmts" aria-label="Formats">
                  {IMPORT_FORMATS.map((f) => (
                    <li key={f.name}>
                      <b>{f.name}</b>
                      <span>{f.ext}</span>
                      <em>{f.note}</em>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </Box>
      <input ref={fileRef} type="file" multiple hidden class="wc-imp-file" onChange={onFile} />
    </>
  );
});
