// The profile editor's in-place apply (ADR 0105), shared by the hosts that
// open it: the App (live, through its write-back queue) and the start page
// (save only, `commitStored`).
//
// The editor hands over `build`, which makes the text to store from the
// latest stored text (its edits rebased onto it). The host reads, builds,
// applies when live, and saves.

import type { ProfileStore } from './store';

export interface CommitOptions {
  /** Swap the running rule set too (a live session runs the profile). */
  live: boolean;
  /** No UI pane line for a successful apply (the editor reports it). */
  quiet: boolean;
}

export type CommitResult =
  | {
      ok: true;
      /** Something was stored (and applied); false when `build` gave the stored text back. */
      changed: boolean;
      /** Load warnings of the applied text (live only). */
      warnings: string[];
      /** The warnings the previous load did not have (live only). */
      added: string[];
    }
  | {
      ok: false;
      /** User-facing, a sentence. */
      reason: string;
      /** Where it stopped: reading, the live apply (nothing changed) or the save. */
      stage: 'read' | 'apply' | 'save';
    };

/** The commit as a host function (`App.commitProfile`). */
export type CommitProfile = (name: string, build: (stored: string) => string, opts: CommitOptions) => Promise<CommitResult>;

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Read, build, save: the commit without a live session or a write-back queue. */
export async function commitStored(store: ProfileStore, name: string, build: (stored: string) => string): Promise<CommitResult> {
  let stored: string;
  try {
    const rec = await store.get(name);
    if (!rec) return { ok: false, reason: `No profile "${name}".`, stage: 'read' };
    stored = rec.text;
  } catch (e) {
    return { ok: false, reason: `Could not read the profile: ${errText(e)}`, stage: 'read' };
  }
  const text = build(stored);
  if (text === stored) return { ok: true, changed: false, warnings: [], added: [] };
  try {
    await store.save(name, text);
  } catch (e) {
    return { ok: false, reason: `Save failed: ${errText(e)}`, stage: 'save' };
  }
  return { ok: true, changed: true, warnings: [], added: [] };
}
