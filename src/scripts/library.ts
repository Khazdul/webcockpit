// The script library (spec §2.10, ADR 0051 "Storage and files"): bundled
// and user scripts, their enabled state, settings and `store` data. It is
// the service behind the Scripts page (stage 10 P2), `#script` and the
// script host. No DOM.
//
//   const lib = new ScriptLibrary();
//   await lib.init();
//   lib.list();                        // ScriptInfo[], sorted, synchronous
//   lib.subscribe(() => render());     // after every change
//   await lib.create();                // a new user script from the template
//   await lib.save('mine', source);    // may rename (the header's @name)
//   await lib.setEnabled('mine', true);
//
// Storage (src/core/db.ts version 8):
// - `scripts`: one record per user script { id, name, source, enabled,
//   created, updated }.
// - `scriptData`: one record per script name, bundled or user: { name,
//   enabled? (bundled scripts only), settings, store }. Kept apart from
//   the code so a release that replaces a bundled script keeps them.
//
// Names (`scriptNameError`): a letter, then letters, digits, `_` or `-`,
// at most 32; unique across bundled and user scripts, case-sensitive. The
// header's `@name` is the name: `save` renames the script when the
// header names another free, valid name; `rename`, `duplicate` and
// `importFile` rewrite the `@name` line. A user script whose name a new
// release's bundled script takes is renamed (`_2`) at `init`.
//
// Everything is read into memory at `init`; `list` and `get` are
// synchronous. Writes go to IndexedDB first and then to memory, so a
// failed write changes nothing. Without IndexedDB the library lives in
// memory for the page (`persistent` false). `store.set` from scripts is
// write-behind: memory at once, the record about a second later
// (`flush` on page hide).

import { STORE, idbDone, idbRequest, openWebcockpitDb } from '../core/db';
import { normalizeKey } from '../script/keys';
import { setDeclaredScriptKeys } from '../script/script-keys';
import { type ScriptBackup, formatScriptBackup } from './backup';
import { BUNDLED_SCRIPTS, type BundledScript } from './bundled';
import { type ParsedHeader, type ScriptHeader, type SettingValue, apiProblem, convertSetting, parseHeader, withHeaderName } from './header';

export const SCRIPT_NAME_MAX = 32;
const SCRIPT_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
/** Write-behind delay of `store.set` data. */
export const STORE_FLUSH_MS = 1000;

/** A user script record (`scripts` store). */
export interface ScriptRecord {
  id: string;
  name: string;
  source: string;
  enabled: boolean;
  /** ms since the epoch. */
  created: number;
  updated: number;
}

/** A value `store.set` keeps: strings, numbers, booleans and tables of them. */
export type StoreValue = string | number | boolean | StoreValue[] | { [key: string]: StoreValue };

/** Per-name data (`scriptData` store). */
export interface ScriptDataRecord {
  name: string;
  /** Enabled state of a bundled script (user scripts keep it in their record). */
  enabled?: boolean;
  /** Values set with `#script set`; declared settings not here use their default. */
  settings: Record<string, SettingValue>;
  /** The script's `store` area. */
  store: Record<string, StoreValue>;
}

/** One script as the UI and `#script` see it. */
export interface ScriptInfo {
  name: string;
  bundled: boolean;
  /** Bundled scripts are read-only (Duplicate makes an editable copy). */
  readonly: boolean;
  source: string;
  header: ScriptHeader;
  /** Header lines that could not be used (`line 4: @setting …`). */
  problems: string[];
  /** Why the script cannot load (`@api`), or null. */
  loadProblem: string | null;
  enabled: boolean;
  /** The last error, as `<script>:<line>: <message>`, or null. Not stored. */
  lastError: string | null;
  /** Every declared setting with its current value (default when unset). */
  settings: Record<string, SettingValue>;
  /** ms since the epoch; 0 for bundled scripts. */
  created: number;
  updated: number;
}

/** What `restore` did: names added (as stored), renamed `[file name, stored name]`, identical ones skipped, data records written. */
export interface RestoreResult {
  added: string[];
  renamed: [string, string][];
  skipped: string[];
  data: number;
}

/** A rule violation (bad name, collision, read-only script). The message is user-facing. */
export class ScriptError extends Error {
  override name = 'ScriptError';
}

export interface ScriptLibraryOptions {
  /** IndexedDB factory; null = memory only. Default `globalThis.indexedDB`. */
  factory?: IDBFactory | null;
  /** Bundled scripts (tests). Default: the build's (`src/scripts/bundled/`). */
  bundled?: readonly BundledScript[];
  now?: () => number;
  /** Write-behind delay for `store` data in ms (tests). */
  storeFlushMs?: number;
}

/** Why `name` cannot be a script name, or null. `taken` lists names in use. */
export function scriptNameError(name: string, taken: Iterable<string> = [], except?: string): string | null {
  if (name === '') return 'Enter a name.';
  if (name.length > SCRIPT_NAME_MAX) return `At most ${SCRIPT_NAME_MAX} characters.`;
  if (!/^[A-Za-z]/.test(name)) return 'The name must start with a letter.';
  if (!SCRIPT_NAME_RE.test(name)) return 'Only letters, digits, _ and - are allowed.';
  for (const n of taken) if (n === name && n !== except) return `"${name}" already exists.`;
  return null;
}

/** `base` made valid (or `script`), then `_2`, `_3` … until it is free. */
export function uniqueScriptName(base: string, taken: Iterable<string>): string {
  let b = base
    .replace(/\.lua$/i, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^[^A-Za-z]+/, '');
  if (b === '') b = 'script';
  b = b.slice(0, SCRIPT_NAME_MAX);
  const set = new Set(taken);
  if (!set.has(b)) return b;
  for (let i = 2; ; i++) {
    const suffix = `_${i}`;
    const n = b.slice(0, SCRIPT_NAME_MAX - suffix.length) + suffix;
    if (!set.has(n)) return n;
  }
}

/** The source of a new script. */
export function scriptTemplate(name: string): string {
  return `-- @name     ${name}
-- @summary  What this script does
-- @api      1
-- @help     How to use it: one line per @help tag.

tempTrigger("You are hungry.", function()
  echo("Time to eat!")
end)
`;
}

interface Entry {
  name: string;
  bundled: boolean;
  source: string;
  parsed: ParsedHeader;
  /** User scripts only. */
  rec: ScriptRecord | null;
}

export class ScriptLibrary {
  private readonly factory: IDBFactory | null;
  private readonly bundled: readonly BundledScript[];
  private readonly now: () => number;
  private readonly storeFlushMs: number;
  private db: Promise<IDBDatabase> | null = null;
  private memory = false;
  private initP: Promise<void> | null = null;
  private readonly entries = new Map<string, Entry>();
  private readonly data = new Map<string, ScriptDataRecord>();
  private readonly errors = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private readonly dirtyData = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private infoCache: ScriptInfo[] | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(opts: ScriptLibraryOptions = {}) {
    this.factory = opts.factory === undefined ? (globalThis.indexedDB ?? null) : opts.factory;
    this.bundled = opts.bundled ?? BUNDLED_SCRIPTS;
    this.now = opts.now ?? Date.now;
    this.storeFlushMs = opts.storeFlushMs ?? STORE_FLUSH_MS;
    if (!this.factory) this.memory = true;
    for (const b of this.bundled) this.entries.set(b.name, this.entry(b.name, b.source, true, null));
  }

  /** False when nothing is saved beyond this page. */
  get persistent(): boolean {
    return !this.memory;
  }

  /** Reads the stored scripts and data. Idempotent; the other methods wait for it. */
  init(): Promise<void> {
    this.initP ??= this.load();
    return this.initP;
  }

  private async load(): Promise<void> {
    let recs: ScriptRecord[] = [];
    let datas: ScriptDataRecord[] = [];
    if (!this.memory) {
      try {
        const db = await this.open();
        const tx = db.transaction([STORE.scripts, STORE.scriptData], 'readonly');
        const done = idbDone(tx);
        [recs, datas] = await Promise.all([
          idbRequest(tx.objectStore(STORE.scripts).getAll() as IDBRequest<ScriptRecord[]>),
          idbRequest(tx.objectStore(STORE.scriptData).getAll() as IDBRequest<ScriptDataRecord[]>),
        ]);
        await done;
      } catch {
        this.memory = true;
      }
    }
    for (const d of datas) this.data.set(d.name, d);
    for (const rec of recs.sort((a, b) => a.created - b.created)) {
      let r = rec;
      if (this.entries.has(r.name)) {
        // A bundled script (a new release) or a duplicate took the name.
        const name = uniqueScriptName(r.name, this.entries.keys());
        r = { ...r, name, source: withHeaderName(r.source, name) };
        await this.write([{ store: STORE.scripts, put: r }]).catch(() => {});
      }
      this.entries.set(r.name, this.entry(r.name, r.source, false, r));
    }
    this.changed();
  }

  // ------------------------------------------------------------------ read

  /** Every script, sorted by name (case-insensitive). */
  list(): ScriptInfo[] {
    this.infoCache ??= [...this.entries.values()].map((e) => this.info(e)).sort((a, b) => compareNames(a.name, b.name));
    return this.infoCache;
  }

  get(name: string): ScriptInfo | null {
    const e = this.entries.get(name);
    return e ? this.info(e) : null;
  }

  /** Names of the enabled scripts, sorted. */
  enabledNames(): string[] {
    return this.list()
      .filter((s) => s.enabled)
      .map((s) => s.name);
  }

  /** Calls `fn` after every change (scripts, enabled state, settings, errors). Returns the unsubscribe. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Current settings of `name`: every declared setting, set or default. */
  settingsOf(name: string): Record<string, SettingValue> {
    const e = this.entries.get(name);
    if (!e) return {};
    const set = this.data.get(name)?.settings ?? {};
    const out: Record<string, SettingValue> = {};
    for (const d of e.parsed.header.settings) {
      const v = set[d.name];
      out[d.name] = v !== undefined && typeof v === typeof d.default ? v : d.default;
    }
    return out;
  }

  /** The `.lua` file of a script: `{ fileName, text }`. */
  exportFile(name: string): { fileName: string; text: string } {
    const e = this.need(name);
    return { fileName: `${e.name}.lua`, text: e.source };
  }

  /**
   * The backup file of every user script and the data of every script
   * (`src/scripts/backup.ts`); pending `store` values included.
   */
  backup(): string {
    const recs = [...this.entries.values()].filter((e) => !e.bundled).map((e) => e.rec!);
    const data = [...this.data.values()].filter((d) => this.entries.has(d.name));
    return formatScriptBackup(this.now(), recs, data);
  }

  // ----------------------------------------------------------------- write

  /**
   * Adds what a backup holds and the library lacks, all turned off (the
   * file's code is not shown first, as IMPORT does for one script):
   * - each user script, under its name or a free one (`_2`) when the name
   *   is taken by a different script; one identical to a stored script of
   *   that name is skipped;
   * - each data record (settings, `store`) of an added script, and of a
   *   stored script that has no data yet. Data of unknown scripts is
   *   dropped. A bundled script's enabled state is not restored.
   * One transaction: a failed write changes nothing.
   */
  restore(b: ScriptBackup): Promise<RestoreResult> {
    return this.serial(() => this.restoreNow(b));
  }

  private async restoreNow(b: ScriptBackup): Promise<RestoreResult> {
    await this.init();
    const res: RestoreResult = { added: [], renamed: [], skipped: [], data: 0 };
    const target = new Map<string, { name: string; added: boolean }>();
    const newEntries: Entry[] = [];
    const ops: WriteOp[] = [];
    const taken = new Set(this.entries.keys());
    const t = this.now();
    for (const s of b.scripts) {
      if (target.has(s.name)) continue;
      const have = this.entries.get(s.name);
      if (have && !have.bundled && have.source === s.source) {
        res.skipped.push(s.name);
        target.set(s.name, { name: s.name, added: false });
        continue;
      }
      const name = scriptNameError(s.name, taken) === null ? s.name : uniqueScriptName(s.name, taken);
      taken.add(name);
      const source = name === s.name ? s.source : withHeaderName(s.source, name);
      const rec: ScriptRecord = { id: newId(), name, source, enabled: false, created: s.created || t, updated: s.updated || t };
      ops.push({ store: STORE.scripts, put: rec });
      newEntries.push(this.entry(name, source, false, rec));
      target.set(s.name, { name, added: true });
      res.added.push(name);
      if (name !== s.name) res.renamed.push([s.name, name]);
    }
    const newData: ScriptDataRecord[] = [];
    for (const d of b.data) {
      const to = target.get(d.name) ?? (this.entries.has(d.name) ? { name: d.name, added: false } : null);
      if (!to) continue;
      if (!to.added && this.data.has(to.name)) continue;
      if (newData.some((x) => x.name === to.name)) continue;
      const rec: ScriptDataRecord = { name: to.name, settings: { ...d.settings }, store: structuredClone(d.store) };
      newData.push(rec);
      ops.push({ store: STORE.scriptData, put: rec });
    }
    await this.write(ops);
    for (const e of newEntries) this.entries.set(e.name, e);
    for (const d of newData) this.data.set(d.name, d);
    res.data = newData.length;
    if (ops.length > 0) this.changed();
    return res;
  }

  /**
   * Creates a user script, disabled. Without `source`: the template under
   * `name` (or a free `script…` name). With `source`: its header's `@name`
   * when valid and free, else `name`, else a free name derived from it.
   */
  create(name?: string, source?: string): Promise<ScriptInfo> {
    return this.serial(() => this.createNow(name, source));
  }

  private async createNow(name?: string, source?: string): Promise<ScriptInfo> {
    await this.init();
    const taken = [...this.entries.keys()];
    let n: string;
    if (name !== undefined) {
      const err = scriptNameError(name, taken);
      if (err) throw new ScriptError(err);
      n = name;
    } else n = uniqueScriptName(source ? (parseHeader(source).header.name ?? 'script') : 'script', taken);
    const src = source === undefined ? scriptTemplate(n) : withHeaderName(source, n);
    const t = this.now();
    const rec: ScriptRecord = { id: newId(), name: n, source: src, enabled: false, created: t, updated: t };
    await this.write([{ store: STORE.scripts, put: rec }]);
    this.entries.set(n, this.entry(n, src, false, rec));
    this.changed();
    return this.get(n)!;
  }

  /**
   * Saves the source of a user script. When its header's `@name` is a
   * different valid, free name, the script is renamed to it. Returns the
   * name it now has and warnings (an `@name` that could not be used).
   * An enabled script is reloaded by the host (it follows the library).
   */
  save(name: string, source: string): Promise<{ name: string; warnings: string[] }> {
    return this.serial(() => this.saveNow(name, source));
  }

  private async saveNow(name: string, source: string): Promise<{ name: string; warnings: string[] }> {
    await this.init();
    const e = this.needUser(name);
    const warnings: string[] = [];
    let target = name;
    const want = parseHeader(source).header.name;
    if (want !== null && want !== name) {
      const err = scriptNameError(want, this.entries.keys(), name);
      if (err) warnings.push(`@name ${want} was not used: ${err}`);
      else target = want;
    }
    const rec: ScriptRecord = { ...e.rec!, name: target, source, updated: this.now() };
    const ops: WriteOp[] = [{ store: STORE.scripts, put: rec }];
    const d = this.data.get(name);
    if (target !== name && d) ops.push({ store: STORE.scriptData, put: { ...d, name: target } }, { store: STORE.scriptData, del: name });
    await this.write(ops);
    this.moveData(name, target);
    this.entries.delete(name);
    this.entries.set(target, this.entry(target, source, false, rec));
    this.changed();
    return { name: target, warnings };
  }

  /** Renames a user script (and its `@name` line, settings and data). */
  rename(from: string, to: string): Promise<void> {
    return this.serial(() => this.renameNow(from, to));
  }

  private async renameNow(from: string, to: string): Promise<void> {
    await this.init();
    if (from === to) return;
    const e = this.needUser(from);
    const err = scriptNameError(to, this.entries.keys(), from);
    if (err) throw new ScriptError(err);
    const source = withHeaderName(e.source, to);
    const rec: ScriptRecord = { ...e.rec!, name: to, source, updated: this.now() };
    const ops: WriteOp[] = [{ store: STORE.scripts, put: rec }];
    const d = this.data.get(from);
    if (d) ops.push({ store: STORE.scriptData, put: { ...d, name: to } }, { store: STORE.scriptData, del: from });
    await this.write(ops);
    this.moveData(from, to);
    this.entries.delete(from);
    this.entries.set(to, this.entry(to, source, false, rec));
    this.changed();
  }

  /** Deletes a user script and its data. */
  remove(name: string): Promise<void> {
    return this.serial(() => this.removeNow(name));
  }

  private async removeNow(name: string): Promise<void> {
    await this.init();
    const e = this.needUser(name);
    await this.write([
      { store: STORE.scripts, del: e.rec!.id },
      { store: STORE.scriptData, del: name },
    ]);
    this.entries.delete(name);
    this.data.delete(name);
    this.dirtyData.delete(name);
    this.errors.delete(name);
    this.changed();
  }

  /**
   * An editable copy, disabled, named `<name>-copy` (`-copy_2` … when
   * taken) with its `@name` line rewritten. Settings are copied, `store`
   * data is not.
   */
  duplicate(name: string): Promise<ScriptInfo> {
    return this.serial(() => this.duplicateNow(name));
  }

  private async duplicateNow(name: string): Promise<ScriptInfo> {
    await this.init();
    const e = this.need(name);
    const n = uniqueScriptName(`${name.slice(0, SCRIPT_NAME_MAX - 5)}-copy`, this.entries.keys());
    const info = await this.createNow(n, e.source);
    const settings = this.data.get(name)?.settings;
    if (settings && Object.keys(settings).length > 0) {
      await this.putData({ name: info.name, settings: { ...settings }, store: {} });
      this.changed();
    }
    return this.get(info.name)!;
  }

  /** Imports a `.lua` file as a new disabled user script. Returns it. */
  importFile(fileName: string, text: string): Promise<ScriptInfo> {
    return this.serial(() => this.importFileNow(fileName, text));
  }

  private async importFileNow(fileName: string, text: string): Promise<ScriptInfo> {
    await this.init();
    const want = parseHeader(text).header.name;
    const base = want !== null && scriptNameError(want) === null ? want : fileName;
    return this.createNow(uniqueScriptName(base, this.entries.keys()), text);
  }

  /** Turns a script on or off (global, not per profile). */
  setEnabled(name: string, on: boolean): Promise<void> {
    return this.serial(() => this.setEnabledNow(name, on));
  }

  private async setEnabledNow(name: string, on: boolean): Promise<void> {
    await this.init();
    const e = this.need(name);
    if (this.isEnabled(e) === on) return;
    if (e.bundled) {
      await this.putData({ ...this.dataOf(name), enabled: on });
    } else {
      const rec: ScriptRecord = { ...e.rec!, enabled: on };
      await this.write([{ store: STORE.scripts, put: rec }]);
      e.rec = rec;
    }
    if (on) this.errors.delete(name);
    this.changed();
  }

  /**
   * Sets a declared setting from text (`#script set`): converted to the
   * declared type. Returns the stored value, or why it was refused.
   */
  setSetting(name: string, setting: string, text: string): Promise<{ ok: true; value: SettingValue } | { ok: false; reason: string }> {
    return this.serial(() => this.setSettingNow(name, setting, text));
  }

  private async setSettingNow(name: string, setting: string, text: string): Promise<{ ok: true; value: SettingValue } | { ok: false; reason: string }> {
    await this.init();
    const e = this.entries.get(name);
    if (!e) return { ok: false, reason: `No script ${name}.` };
    const decl = e.parsed.header.settings.find((s) => s.name === setting);
    if (!decl) {
      const known = e.parsed.header.settings.map((s) => s.name);
      return { ok: false, reason: `${name} has no setting ${setting}${known.length ? ` (settings: ${known.join(', ')})` : ''}.` };
    }
    const value = convertSetting(decl.type, text);
    if (value === null) return { ok: false, reason: `${setting} must be a ${decl.type}${decl.type === 'boolean' ? ' (true or false)' : ''}.` };
    const d = this.dataOf(name);
    await this.putData({ ...d, settings: { ...d.settings, [setting]: value } });
    this.changed();
    return { ok: true, value };
  }

  /** The host reports a script's last error (`null` clears it). Kept in memory only. */
  setError(name: string, message: string | null): void {
    if (message === null) {
      if (!this.errors.delete(name)) return;
    } else {
      if (this.errors.get(name) === message) return;
      this.errors.set(name, message);
    }
    this.changed();
  }

  // ----------------------------------------------------------------- store

  /** A value of the script's `store` area (a copy), or undefined. */
  storeGet(name: string, key: string): StoreValue | undefined {
    const v = this.data.get(name)?.store[key];
    return v === undefined ? undefined : structuredClone(v);
  }

  /** Sets (or with `undefined` removes) a `store` value; saved a moment later. */
  storeSet(name: string, key: string, value: StoreValue | undefined): void {
    const d = this.dataOf(name);
    const store = { ...d.store };
    if (value === undefined) delete store[key];
    else store[key] = structuredClone(value);
    this.data.set(name, { ...d, store });
    this.dirtyData.add(name);
    this.flushTimer ??= setTimeout(() => void this.flush(), this.storeFlushMs);
  }

  /** Writes pending `store` data now. */
  async flush(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.dirtyData.size === 0) return;
    const ops: WriteOp[] = [];
    for (const n of this.dirtyData) {
      const d = this.data.get(n);
      if (d) ops.push({ store: STORE.scriptData, put: d });
    }
    this.dirtyData.clear();
    await this.write(ops).catch(() => {});
  }

  /** Closes the database connection (tests). */
  async close(): Promise<void> {
    await this.flush();
    const db = this.db;
    this.db = null;
    if (db) (await db.catch(() => null))?.close();
  }

  // -------------------------------------------------------------- internal

  /** Runs mutations one at a time, so each sees the last one's result. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(fn);
    this.chain = p.catch(() => {});
    return p;
  }

  private entry(name: string, source: string, bundled: boolean, rec: ScriptRecord | null): Entry {
    return { name, bundled, source, parsed: parseHeader(source), rec };
  }

  private info(e: Entry): ScriptInfo {
    return {
      name: e.name,
      bundled: e.bundled,
      readonly: e.bundled,
      source: e.source,
      header: e.parsed.header,
      problems: e.parsed.problems,
      loadProblem: apiProblem(e.parsed.header),
      enabled: this.isEnabled(e),
      lastError: this.errors.get(e.name) ?? null,
      settings: this.settingsOf(e.name),
      created: e.rec?.created ?? 0,
      updated: e.rec?.updated ?? 0,
    };
  }

  private isEnabled(e: Entry): boolean {
    return e.bundled ? this.data.get(e.name)?.enabled === true : e.rec!.enabled;
  }

  private need(name: string): Entry {
    const e = this.entries.get(name);
    if (!e) throw new ScriptError(`No script ${name}.`);
    return e;
  }

  private needUser(name: string): Entry {
    const e = this.need(name);
    if (e.bundled) throw new ScriptError(`${name} is a bundled script and cannot be changed; duplicate it to edit a copy.`);
    return e;
  }

  private dataOf(name: string): ScriptDataRecord {
    return this.data.get(name) ?? { name, settings: {}, store: {} };
  }

  private async putData(d: ScriptDataRecord): Promise<void> {
    await this.write([{ store: STORE.scriptData, put: d }]);
    this.data.set(d.name, d);
    this.dirtyData.delete(d.name);
  }

  private moveData(from: string, to: string): void {
    if (from === to) return;
    const d = this.data.get(from);
    if (d) {
      this.data.delete(from);
      this.data.set(to, { ...d, name: to });
    }
    if (this.dirtyData.delete(from)) this.dirtyData.add(to);
    const err = this.errors.get(from);
    if (err !== undefined) {
      this.errors.delete(from);
      this.errors.set(to, err);
    }
  }

  private changed(): void {
    this.infoCache = null;
    const keys = new Map<string, string>();
    for (const s of this.list()) {
      if (!s.enabled) continue;
      for (const k of s.header.keys) {
        const c = normalizeKey(k.key);
        if (c && !keys.has(c)) keys.set(c, s.name);
      }
    }
    setDeclaredScriptKeys(keys);
    for (const fn of [...this.listeners]) {
      try {
        fn();
      } catch (err) {
        console.error('[scripts] listener threw', err);
      }
    }
  }

  private async write(ops: readonly WriteOp[]): Promise<void> {
    if (this.memory || ops.length === 0) return;
    let db: IDBDatabase;
    try {
      db = await this.open();
    } catch {
      this.memory = true;
      return;
    }
    let tx: IDBTransaction;
    try {
      tx = db.transaction([STORE.scripts, STORE.scriptData], 'readwrite');
    } catch {
      // Closed by a versionchange in another tab: reopen once.
      this.db = null;
      tx = (await this.open()).transaction([STORE.scripts, STORE.scriptData], 'readwrite');
    }
    for (const op of ops) {
      const os = tx.objectStore(op.store);
      if ('put' in op) os.put(op.put);
      else os.delete(op.del);
    }
    await idbDone(tx);
  }

  private open(): Promise<IDBDatabase> {
    if (!this.db) {
      this.db = openWebcockpitDb(this.factory!);
      this.db.catch(() => {
        this.db = null;
      });
    }
    return this.db;
  }
}

type WriteOp = { store: string; put: ScriptRecord | ScriptDataRecord } | { store: string; del: string };

function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function compareNames(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0;
}
