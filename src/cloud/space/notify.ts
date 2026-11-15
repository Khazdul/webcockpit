// "The sync wrote profiles or scripts" (stage 61 fixes, ADR 0151 as built):
// the sync, the move and the hand-back write a space's database behind the
// back of the page's caches. The writing tab applies the change to its own
// caches and tells every other tab of the same space on the
// BroadcastChannel `webcockpit-sync@<space id>`; each tab then reloads its
// script library, lets the profile store's listeners hear (an open profile
// editor lays its edits over the new text) and keeps its selected profile
// (a pulled rename follows by id; a pulled delete falls back to `default`,
// as the shell's start does).
//
// Stage 62 C1 (ADR 0152): `settings` (this device type's: the settings
// store reads `main` again; when that changed what shows, the start menu's
// line says where they came from), `scriptData` (the library reloads),
// `timers` and `comm` (nothing to follow: the hub reads at `Char.Name`,
// the Comm pane at open).

import { type Space, spaceId } from '../../core/space';
import { DEFAULT_PROFILE } from '../../profiles/names';
import type { ProfileStore } from '../../profiles/store';
import type { ScriptLibrary } from '../../scripts/library';
import type { SettingsStore } from '../../settings/store';
import { postSyncMessage } from '../sync-view';
import type { ProfileChanges } from './local';
import { settingsFromWords } from './words';

export type WrittenKind = 'profile' | 'script' | 'settings' | 'scriptData' | 'timers' | 'comm';

const WRITTEN_KINDS: readonly string[] = ['profile', 'script', 'settings', 'scriptData', 'timers', 'comm'];

export interface SyncWrite {
  kind: WrittenKind;
  /** The profiles' changes, when known (else only the selected profile is checked). */
  profiles?: ProfileChanges;
  /**
   * `settings`: this device type's were pulled; from whom, whether they
   * waited for the game, and the record when it replaced a login's seed
   * (taken over any change not saved yet).
   */
  settings?: { from: string | null; held?: boolean; seedRecord?: unknown };
}

/** How long the start menu's line says where pulled settings came from. */
const SETTINGS_MESSAGE_MS = 8000;

/** The page's caches that follow a write. */
export interface CacheHost {
  profiles: ProfileStore;
  scripts?: ScriptLibrary | undefined;
  settings: SettingsStore;
}

export const channelName = (space: Space): string => `webcockpit-sync@${spaceId(space)}`;

/** One channel per space and page, for sending and listening: a page never hears its own posts. */
const channels = new Map<string, { c: BroadcastChannel; fns: Set<(w: SyncWrite) => void> }>();

function channel(space: Space): { c: BroadcastChannel; fns: Set<(w: SyncWrite) => void> } | null {
  const name = channelName(space);
  let ch = channels.get(name);
  if (ch) return ch;
  try {
    if (typeof BroadcastChannel !== 'function') return null;
    const c = new BroadcastChannel(name);
    const fns = new Set<(w: SyncWrite) => void>();
    c.onmessage = (ev: MessageEvent<unknown>) => {
      const w = ev.data as SyncWrite | null;
      if (!w || !WRITTEN_KINDS.includes(w.kind)) return;
      for (const fn of [...fns]) fn(w);
    };
    ch = { c, fns };
    channels.set(name, ch);
    return ch;
  } catch {
    return null;
  }
}

/** Tells the other tabs of `space` (not this one) that the sync wrote there. */
export function notifyWritten(space: Space, w: SyncWrite): void {
  try {
    channel(space)?.c.postMessage(w);
  } catch {
    /* no channel: the other tabs read the store at their next load */
  }
}

/** Calls `fn` for every write another tab of `space` tells of. Returns the unsubscribe. */
export function listenWritten(space: Space, fn: (w: SyncWrite) => void): () => void {
  const ch = channel(space);
  if (!ch) return () => {};
  ch.fns.add(fn);
  return () => void ch.fns.delete(fn);
}

/** Tests: close the channels. */
export function resetChannelsForTests(): void {
  for (const { c } of channels.values()) c.close();
  channels.clear();
}

/** Brings this page's caches up to a write of the sync (here or in another tab). Never rejects. */
export async function applyWritten(host: CacheHost, w: SyncWrite): Promise<void> {
  try {
    if (w.kind === 'script' || w.kind === 'scriptData') {
      await host.scripts?.reload();
      return;
    }
    if (w.kind === 'settings') {
      if (!w.settings) return;
      const seed = w.settings.seedRecord;
      const r = await host.settings.reload(seed !== undefined ? { force: true, record: seed } : {});
      if (r === 'applied') postSyncMessage({ text: settingsFromWords(w.settings.from, w.settings.held), ms: SETTINGS_MESSAGE_MS, tag: 'settings' });
      return;
    }
    if (w.kind !== 'profile') return;
    const ch = w.profiles;
    for (const p of ch?.put ?? []) host.profiles.announce(p.name, p.text);
    const sel = host.settings.get().profile;
    const moved = ch?.renamed.find((r) => r.from === sel);
    if (moved && (await host.profiles.get(moved.to))?.id === moved.id) {
      host.settings.update({ profile: moved.to });
      return;
    }
    if (!(await host.profiles.get(sel))) host.settings.update({ profile: DEFAULT_PROFILE });
  } catch {
    /* the caches stay as they are: the next load reads the store */
  }
}
