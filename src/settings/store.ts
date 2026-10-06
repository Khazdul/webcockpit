// The settings store (ADR 0010 "Settings"): one live `Settings` object,
// persisted in IndexedDB, with every change pushed to subscribers.
//
// Usage:
//
//   const store = new SettingsStore({ safe: params.has('safe') });
//   applyTheme(store.get());           // first paint: localStorage mirror
//   await store.load();                // IndexedDB (never rejects)
//   store.subscribe((s) => applyTheme(s));
//   store.update({ appearance: { size: 16 } });
//   store.update((d) => { d.panes.ui.on = false; });
//
// - `get()` returns a frozen snapshot. Every change makes a new object, so
//   `next !== prev` means something changed; compare sub-objects by value.
// - Writes go to IndexedDB (`webcockpit` / `settings` / key `main`) at most
//   `debounceMs` after the first unsaved change (default 200 ms), and at
//   once on `pagehide`.
// - The appearance part is mirrored to localStorage (`webcockpit.appearance`)
//   synchronously on change, so the next page load paints with the right
//   font and colours before IndexedDB has answered (ADR 0006: a convenience).
// - Safe mode (`?safe`): the stored settings load, but the appearance is the
//   default, and nothing is written (IndexedDB or mirror) until the user
//   changes something. Then the whole object, with the default appearance
//   plus the change, is saved.
// - Without IndexedDB (private mode, blocked upgrade) the store works in
//   memory; `persistent` is false.

import { STORE, openWebcockpitDb } from '../core/db';
import { migrateAppearance, migrateSettings } from './migrate';
import { type AppearanceSettings, type Settings, type SettingsPatch, defaultSettings, phoneDefaultSettings } from './types';

/** localStorage key of the appearance mirror. */
export const MIRROR_KEY = 'webcockpit.appearance';
/** IndexedDB key of the settings record. */
export const SETTINGS_KEY = 'main';

export type SettingsListener = (next: Readonly<Settings>, prev: Readonly<Settings>) => void;

/**
 * A change: a deep partial merged into the settings (arrays replaced
 * whole), or a function that edits a mutable draft copy in place and may
 * also return a patch.
 */
export type SettingsUpdate = SettingsPatch | ((draft: Settings) => SettingsPatch | void);

export interface SettingsStoreOptions {
  /** IndexedDB factory; null = no persistence. Default: `globalThis.indexedDB`. */
  factory?: IDBFactory | null;
  /** Storage for the appearance mirror; null = none. Default: `globalThis.localStorage`. */
  storage?: Storage | null;
  /** Window for `pagehide`; null = none. Default: `globalThis.window`. */
  win?: Window | null;
  /** `?safe`: default appearance, nothing saved until a change. */
  safe?: boolean;
  /** A phone (ADR 0081): the defaults are `phoneDefaultSettings()`. */
  phone?: boolean;
  /** Longest delay from a change to the IndexedDB write, ms (default 200). */
  debounceMs?: number;
}

/** The mirrored appearance, or null when there is none (or it is unreadable). */
export function readAppearanceMirror(storage: Storage | null | undefined): AppearanceSettings | null {
  try {
    const raw = storage?.getItem(MIRROR_KEY);
    return raw ? migrateAppearance(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Merges `patch` into `target` in place (plain objects recursively, the rest replaced). */
function mergeInto(target: Obj, patch: Obj): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const cur = target[k];
    if (isObj(v) && isObj(cur)) mergeInto(cur, v);
    else target[k] = clone(v);
  }
}

function freeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    for (const v of Object.values(o)) freeze(v);
    Object.freeze(o);
  }
  return o;
}

export class SettingsStore {
  private current: Readonly<Settings>;
  private readonly listeners = new Set<SettingsListener>();
  private readonly factory: IDBFactory | null;
  private readonly storage: Storage | null;
  private readonly win: Window | null;
  private readonly debounceMs: number;
  private readonly safe: boolean;
  private readonly phone: boolean;

  private db: IDBDatabase | null = null;
  private loadPromise: Promise<void> | null = null;
  private loaded = false;
  private freshInstall = false;
  /** Updates made before `load()` finished; replayed on top of the loaded data. */
  private early: SettingsUpdate[] = [];
  /** Nothing is written until the first change (safe mode). */
  private holdWrites: boolean;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();
  private warned = false;

  constructor(opts: SettingsStoreOptions = {}) {
    this.factory = opts.factory === undefined ? (globalThis.indexedDB ?? null) : opts.factory;
    this.storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    this.win = opts.win === undefined ? (globalThis.window ?? null) : opts.win;
    this.debounceMs = Math.min(250, Math.max(0, opts.debounceMs ?? 200));
    this.safe = opts.safe ?? false;
    this.phone = opts.phone ?? false;
    this.holdWrites = this.safe;

    const s = this.defaults();
    if (!this.safe) {
      const mirror = readAppearanceMirror(this.storage);
      if (mirror) s.appearance = mirror;
    }
    this.current = freeze(s);
    this.win?.addEventListener('pagehide', this.onPageHide);
  }

  /** Opens a store and waits for it to load. */
  static async open(opts: SettingsStoreOptions = {}): Promise<SettingsStore> {
    const s = new SettingsStore(opts);
    await s.load();
    return s;
  }

  /** The current settings (frozen; never mutate). */
  get(): Readonly<Settings> {
    return this.current;
  }

  /** True once IndexedDB is open and writable. */
  get persistent(): boolean {
    return this.db !== null;
  }

  /**
   * True once loaded when IndexedDB works and holds no settings record
   * (and not in safe mode): this browser has never saved a setting, a new
   * user as far as the settings know (ADR 0078). Stays true for the page.
   */
  get fresh(): boolean {
    return this.freshInstall;
  }

  /** A fresh copy of this device's defaults (the phone's on a phone, ADR 0081). */
  defaults(): Settings {
    return this.phone ? phoneDefaultSettings() : defaultSettings();
  }

  /** True in `?safe` mode. */
  get isSafe(): boolean {
    return this.safe;
  }

  /**
   * Loads the stored settings from IndexedDB (once; later calls return the
   * same promise). Never rejects: on failure the store stays in memory.
   * Subscribers are told if the loaded settings differ from the first guess.
   * Changes made before the load finished are replayed on top of it.
   */
  load(): Promise<void> {
    this.loadPromise ??= this.doLoad();
    return this.loadPromise;
  }

  private async doLoad(): Promise<void> {
    let stored: unknown;
    if (this.factory) {
      try {
        const db = await openWebcockpitDb(this.factory);
        db.addEventListener('close', () => {
          if (this.db === db) this.db = null;
        });
        const tx = db.transaction(STORE.settings, 'readonly');
        const r = tx.objectStore(STORE.settings).get(SETTINGS_KEY);
        stored = await new Promise<unknown>((resolve, reject) => {
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        this.db = db;
      } catch (err) {
        this.warn('settings are not saved (IndexedDB unavailable)', err);
      }
    }
    this.freshInstall = this.db !== null && stored === undefined && !this.safe;
    const prev = this.current;
    let next: Settings;
    if (stored !== undefined) {
      next = migrateSettings(stored);
      if (this.safe) next.appearance = this.defaults().appearance;
    } else {
      next = clone(prev) as Settings;
    }
    this.loaded = true;
    const early = this.early;
    this.early = [];
    for (const u of early) next = this.applyUpdate(next, u);
    this.current = freeze(next);
    if (early.length > 0) this.changed(prev);
    else {
      if (!this.safe && stored !== undefined) this.writeMirror(prev.appearance, true);
      if (!same(prev, this.current)) this.emit(prev);
    }
  }

  /** Applies a change. No-op when nothing actually changes. */
  update(u: SettingsUpdate): void {
    if (!this.loaded) this.early.push(u);
    const prev = this.current;
    const next = freeze(this.applyUpdate(clone(prev) as Settings, u));
    if (same(prev, next)) return;
    this.current = next;
    this.changed(prev);
  }

  private applyUpdate(draft: Settings, u: SettingsUpdate): Settings {
    if (typeof u === 'function') {
      const patch = u(draft);
      if (patch) mergeInto(draft as unknown as Obj, patch as Obj);
    } else {
      mergeInto(draft as unknown as Obj, u as Obj);
    }
    return migrateSettings(draft);
  }

  private changed(prev: Readonly<Settings>): void {
    this.holdWrites = false;
    this.writeMirror(prev.appearance, false);
    this.dirty = true;
    this.schedule();
    this.emit(prev);
  }

  /** Calls `fn(next, prev)` on every change; returns the unsubscribe function. */
  subscribe(fn: SettingsListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(prev: Readonly<Settings>): void {
    const next = this.current;
    for (const fn of [...this.listeners]) {
      try {
        fn(next, prev);
      } catch (err) {
        console.error('settings listener failed', err);
      }
    }
  }

  /** Resets everything to the defaults (Options could offer this). */
  reset(): void {
    this.update(() => this.defaults());
  }

  // ---------------------------------------------------------------- saving

  private writeMirror(prevAppearance: AppearanceSettings, force: boolean): void {
    if (this.holdWrites || !this.storage) return;
    const a = this.current.appearance;
    if (!force && same(a, prevAppearance)) return;
    try {
      this.storage.setItem(MIRROR_KEY, JSON.stringify(a));
    } catch {
      /* quota or disabled storage: the mirror is only a convenience */
    }
  }

  private schedule(): void {
    if (this.timer !== null || this.holdWrites) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }

  /** Writes any unsaved change now. Resolves when the write committed (or failed). */
  flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty || this.holdWrites) return this.writing;
    if (!this.loaded) {
      // Wait for the load so a change made during it is not overwritten.
      return this.load().then(() => this.flush());
    }
    const db = this.db;
    if (!db) return this.writing;
    this.dirty = false;
    const value = this.current;
    let p: Promise<void>;
    try {
      const tx = db.transaction(STORE.settings, 'readwrite');
      tx.objectStore(STORE.settings).put(value, SETTINGS_KEY);
      p = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
      });
    } catch (err) {
      p = Promise.reject(err);
    }
    this.writing = p.catch((err: unknown) => this.warn('settings could not be saved', err));
    return this.writing;
  }

  private readonly onPageHide = (): void => {
    void this.flush();
  };

  private warn(msg: string, err: unknown): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(`WebCockpit: ${msg}:`, err);
  }

  /** Flushes, stops listening and closes the database. */
  async dispose(): Promise<void> {
    this.win?.removeEventListener('pagehide', this.onPageHide);
    await this.flush();
    this.listeners.clear();
    this.db?.close();
    this.db = null;
  }
}
