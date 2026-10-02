// The scripts backup file (ADR 0053, P3): every user script and the data
// of every script (bundled ones too) in one JSON file, written by EXPORT →
// "All scripts" on the Scripts page and read back by IMPORT. Pure: no DOM,
// no IndexedDB (ScriptLibrary.backup / restore do the I/O).
//
//   webcockpit-scripts-YYYY-MM-DD.json
//   {
//     "type": "webcockpit-scripts", "schema": 1, "exported": <ms>,
//     "scripts": [{ "name", "source", "enabled", "created", "updated" }],
//     "data":    [{ "name", "enabled"?, "settings": {…}, "store": {…} }]
//   }
//
// `scripts` holds user scripts only (bundled ones come with the release);
// `data` holds `#script set` values and `store` areas by script name.
// `parseScriptBackup` checks the whole file before anything is written and
// throws `BadScriptBackupError` with a user-facing message.

import type { SettingValue } from './header';
import type { ScriptDataRecord, ScriptRecord, StoreValue } from './library';

export const SCRIPT_BACKUP_TYPE = 'webcockpit-scripts';
export const SCRIPT_BACKUP_SCHEMA = 1;
/** Limits that keep a hostile file from filling the library. */
export const SCRIPT_BACKUP_MAX_SCRIPTS = 500;
export const SCRIPT_BACKUP_MAX_SOURCE = 1_000_000;
const MAX_DEPTH = 32;

/** One user script in a backup. */
export interface BackupScript {
  name: string;
  source: string;
  enabled: boolean;
  created: number;
  updated: number;
}

export interface ScriptBackup {
  exported: number;
  scripts: BackupScript[];
  data: ScriptDataRecord[];
}

/** A file that is not a readable scripts backup; the message is user-facing. */
export class BadScriptBackupError extends Error {
  override name = 'BadScriptBackupError';
}

/** `webcockpit-scripts-2026-10-02.json` (local date). */
export function scriptBackupFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `webcockpit-scripts-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

/** The file text for user script records and data records. */
export function formatScriptBackup(exported: number, scripts: readonly ScriptRecord[], data: readonly ScriptDataRecord[]): string {
  const out = {
    type: SCRIPT_BACKUP_TYPE,
    schema: SCRIPT_BACKUP_SCHEMA,
    exported,
    scripts: scripts.map((r) => ({ name: r.name, source: r.source, enabled: r.enabled, created: r.created, updated: r.updated })),
    data: data.map((d) => ({
      name: d.name,
      ...(d.enabled !== undefined ? { enabled: d.enabled } : {}),
      settings: d.settings,
      store: d.store,
    })),
  };
  return JSON.stringify(out, null, 1) + '\n';
}

/** Cheap sniff: does this text look like a scripts backup (not a `.lua` file)? */
export function looksLikeScriptBackup(text: string): boolean {
  const t = text.trimStart();
  return t.startsWith('{') && t.slice(0, 200).includes(SCRIPT_BACKUP_TYPE);
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function isSetting(v: unknown): v is SettingValue {
  return typeof v === 'string' || typeof v === 'boolean' || isNum(v);
}

function isStoreValue(v: unknown, depth = 0): v is StoreValue {
  if (depth > MAX_DEPTH) return false;
  if (isSetting(v)) return true;
  if (Array.isArray(v)) return v.every((x) => isStoreValue(x, depth + 1));
  if (isRec(v)) return Object.values(v).every((x) => isStoreValue(x, depth + 1));
  return false;
}

/** Reads and checks a backup file's text. Throws `BadScriptBackupError`. */
export function parseScriptBackup(text: string): ScriptBackup {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    throw new BadScriptBackupError('The file is not JSON.');
  }
  if (!isRec(o) || o.type !== SCRIPT_BACKUP_TYPE) throw new BadScriptBackupError('Not a WebCockpit scripts backup.');
  if (o.schema !== SCRIPT_BACKUP_SCHEMA) throw new BadScriptBackupError(`Unknown backup version ${String(o.schema)}.`);
  if (!Array.isArray(o.scripts) || !Array.isArray(o.data)) throw new BadScriptBackupError('The backup has no script list.');
  if (o.scripts.length > SCRIPT_BACKUP_MAX_SCRIPTS || o.data.length > SCRIPT_BACKUP_MAX_SCRIPTS * 2)
    throw new BadScriptBackupError('The backup holds too many scripts.');
  const scripts: BackupScript[] = o.scripts.map((s, i) => {
    const bad = (what: string): never => {
      throw new BadScriptBackupError(`Script ${i + 1}: ${what}.`);
    };
    if (!isRec(s)) return bad('not a record');
    if (typeof s.name !== 'string' || s.name === '') return bad('no name');
    if (typeof s.source !== 'string') return bad('no source');
    if (s.source.length > SCRIPT_BACKUP_MAX_SOURCE) return bad('source too long');
    return {
      name: s.name,
      source: s.source,
      enabled: s.enabled === true,
      created: isNum(s.created) ? s.created : 0,
      updated: isNum(s.updated) ? s.updated : 0,
    };
  });
  const data: ScriptDataRecord[] = o.data.map((d, i) => {
    const bad = (what: string): never => {
      throw new BadScriptBackupError(`Data ${i + 1}: ${what}.`);
    };
    if (!isRec(d)) return bad('not a record');
    if (typeof d.name !== 'string' || d.name === '') return bad('no name');
    const settings = d.settings ?? {};
    const store = d.store ?? {};
    if (!isRec(settings) || !Object.values(settings).every(isSetting)) return bad('bad settings');
    if (!isRec(store) || !isStoreValue(store)) return bad('bad store data');
    const rec: ScriptDataRecord = {
      name: d.name,
      settings: settings as Record<string, SettingValue>,
      store: store as Record<string, StoreValue>,
    };
    if (typeof d.enabled === 'boolean') rec.enabled = d.enabled;
    return rec;
  });
  return { exported: isNum(o.exported) ? o.exported : 0, scripts, data };
}
