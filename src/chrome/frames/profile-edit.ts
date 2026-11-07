// Opens the profile editor (src/editor, a separate lazy chunk) for a stored
// profile. Shared by the start page's Profile → EDIT, the ESC menu's
// Profile row and the Profile window (Inv §4.5, §5.1, ADR 0103). The chunk
// is imported here, on demand, so the chrome chunk never carries CodeMirror.
//
// The editor applies while it stays open (ADR 0105): `commit` reads the
// latest stored text, builds the editor's text on it, applies it when live
// and saves. With the App's commit (a cockpit) it runs on the write-back
// queue; without it (the start page) it reads and saves the store.

import { type CommitProfile, type ProfileStore, commitStored } from '../../profiles';
import type { Nav } from '../kit/stack';

export interface EditOptions {
  /** A live session runs the profile (connected): an apply swaps the running rules. */
  isLive: () => boolean;
  /** The App's commit (`App.commitProfile`); absent = read and save the store. */
  commit?: CommitProfile | undefined;
  /** Runs before the stored text is read (flushes pending variable write-back). */
  beforeLoad?: (() => Promise<void>) | undefined;
  /** Called after an explicit apply (the editor's prompt) saved the profile. */
  onSaved?: ((name: string) => void) | undefined;
  /**
   * Calls `fn` whenever `isLive()` may have changed (connected or not: the
   * editor's head line in the game, ADR 0128); returns the unsubscribe.
   * The in-game hosts fill it in (43b); without it the line is read at render.
   */
  onLiveChange?: ((fn: () => void) => () => void) | undefined;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

let loading = false;

/** Loads `name` and pushes the editor over the current frame (no-op while loading). */
export async function editProfile(nav: Nav, profiles: ProfileStore, name: string, opts: EditOptions): Promise<void> {
  if (loading) return;
  loading = true;
  const depth = nav.depth();
  try {
    await opts.beforeLoad?.();
    const [rec, mod] = await Promise.all([profiles.get(name), import('../../editor')]);
    if (!rec) return nav.flash(`No profile "${name}".`, 'fail');
    // The user moved on while the chunk loaded.
    if (nav.depth() !== depth) return;
    mod.openProfileEditor(nav, {
      name,
      text: rec.text,
      isLive: opts.isLive,
      load: async () => {
        const r = await profiles.get(name);
        if (!r) throw new Error(`No profile "${name}".`);
        return r.text;
      },
      commit: async (build, { quiet }) => {
        const live = opts.isLive();
        const r = opts.commit ? await opts.commit(name, build, { live, quiet }) : await commitStored(profiles, name, build);
        if (r.ok && r.changed && !quiet) opts.onSaved?.(name);
        return r;
      },
      subscribe: (fn) => profiles.subscribe((n, text) => n === name && fn(text)),
      ...(opts.onLiveChange ? { onLiveChange: opts.onLiveChange } : {}),
    });
  } catch (e) {
    nav.flash(`Could not open the editor: ${errText(e)}`, 'fail');
  } finally {
    loading = false;
  }
}
