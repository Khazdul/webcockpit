// The sync engine's types and ports (spec §7.4, ADR 0146, ADR 0151).
//
// The engine (engine.ts) is pure: it reaches IndexedDB, the network, the
// clock, the game and the Web Lock only through the interfaces below. The
// adapters on IndexedDB and fetch are part C of stage 61; the tests use
// in-memory ones (tests/unit/sync/).

import type { AccountLimits, DeviceType, SessionEndReason, SyncChanges, SyncItem, SyncKind, SyncUsage, SyncWritten } from '../../../shared/cloud/api.ts';
import type { NewCommRecord } from '../../gmcp/comm-archive';
import type { ScriptDataRecord } from '../../scripts/library';
import type { Settings } from '../../settings/types';
import type { TimersRecord } from '../../timers/archive';

// --- Items ---

/** A profile as it travels (the profile store's record with its v9 `id`). */
export interface ProfileItem {
  /** Stable over renames: the local key. */
  id: string;
  name: string;
  /** tt++ text, verbatim. */
  text: string;
  /** ms since the epoch. */
  created: number;
  modified: number;
}

/** A user script as it travels (the script library's record). */
export interface ScriptItem {
  id: string;
  name: string;
  source: string;
  enabled: boolean;
  created: number;
  updated: number;
}

/**
 * The settings of one device type (ADR 0152): the whole `Settings` record
 * as the settings store keeps it. Local key: `type`. A record of a newer
 * client (`record.version` above `SETTINGS_VERSION`) decodes as `newer`;
 * an older one is taken as it is and migrated by the store when it loads.
 */
export interface SettingsItem {
  type: DeviceType;
  record: Settings;
}

/** A script's data (ADR 0152): the library's `scriptData` record. Local key: `name`. */
export type ScriptDataItem = ScriptDataRecord;

/** A character's timers (ADR 0152): the timers archive's record. Local key: `character`. */
export type TimersItem = TimersRecord;

/** One Comm message in a day's piece: the archive's record without `seq`. Its identity is its canonical JSON. */
export type CommPieceRecord = NewCommRecord;

/**
 * Comm history of one UTC day (ADR 0152), all characters together. Local
 * key: `day`, `YYYY-MM-DD`, or `YYYY-MM-DD.2`, `.3` … for the further
 * pieces of a day over 1 MB. `records` sorted by `ts`, then identity, each
 * identity once.
 */
export interface CommItem {
  day: string;
  records: CommPieceRecord[];
}

/** The record type of each kind the engine syncs today. */
export interface ItemRecords {
  profile: ProfileItem;
  script: ScriptItem;
  settings: SettingsItem;
  scriptData: ScriptDataItem;
  timers: TimersItem;
  comm: CommItem;
}

/** The kinds with a body format in this client. */
export type ItemKind = keyof ItemRecords;

/** A local item as the engine handles it: its local key and its record. */
export interface LocalItem<B = Body> {
  key: string;
  body: B;
}

/** A record of any kind, as the engine sees it (the kind's spec knows its shape). */
export type Body = Readonly<Record<string, unknown>>;

// --- Ports ---

/**
 * The local stores of the current space (an account's database). The
 * engine never writes anything else of the player's.
 */
/** One write of the engine to a kind's local store. */
export interface LocalBatch {
  put: Body[];
  remove: string[];
}

export interface LocalItems {
  /**
   * Every item of `kind` (user scripts only: bundled ones are not items).
   * `comm`: only the kept days, each day's records sorted and once each
   * (`CommItem`). `scan`: the engine's scan before its write of the
   * kind (an adapter may remember what it saw, to keep a change made in
   * between).
   */
  list(kind: SyncKind, o?: { scan?: boolean }): Promise<LocalItem[]>;
  /**
   * One batch for `kind`, applied atomically (one transaction): `put`
   * creates or replaces by local key (a rename is a put of the same key
   * with a new name), `remove` deletes by local key. The engine
   * guarantees that names are unique in the state *after* the batch; the
   * adapter must not refuse a batch whose single steps would collide on
   * the way (two items swapping names): it removes the old entries before
   * it writes the new ones.
   *
   * `comm` is additive (ADR 0152): a `put` of a day adds the records the
   * store does not have (by identity) and removes none; a `remove` deletes
   * the whole day. A day older than seven days is not stored.
   */
  write(kind: SyncKind, batch: LocalBatch): Promise<void>;
}

/** Why an item is not plainly in step (`SyncRecord.state`). */
export type SyncRecordState =
  /** The local copy is based on `rev`; nothing pulled is waiting. */
  | 'synced'
  /** A pulled change waits in `remote` (the item is in use during play, or a conflict waits for it). */
  | 'held'
  /** The server has a version this client cannot read (`remote.blob`): left untouched, "update the client". */
  | 'newer'
  /** The server's version does not open or is not a body (`remote.blob`): left untouched. */
  | 'unreadable'
  /** The last push was refused for storage (413): the item is kept local and retried. */
  | 'full';

/** A server version the engine has pulled but not taken into the local copy. */
export interface RemoteVersion {
  rev: number;
  deleted: boolean;
  /** The decoded record (absent for a tombstone and for `newer`/`unreadable`). */
  body?: Body;
  /** Its content hash, and the hash without the name (`itemHashes`). */
  hash?: string;
  bare?: string;
  /** The blob as pulled (base64url), kept for `newer`/`unreadable` so a later client can read it. */
  blob?: string;
}

/**
 * One row of the `sync` store: what this device last agreed with the
 * server about one item. Keyed by `kind` + `serverId`.
 */
export interface SyncRecord {
  kind: SyncKind;
  /** The opaque id (`opaqueId(idKey, kind, key)`). */
  serverId: string;
  /** The local key (profile or script `id`); null for an item this client cannot read. */
  key: string | null;
  /** The name at `rev` (for lists such as Log out's), or null. */
  name: string | null;
  /** The server rev the local copy is based on; 0 = none yet (never on the server). */
  rev: number;
  /** The content hash at `rev`; null for none (or a tombstone). */
  hash: string | null;
  /** The hash without the name at `rev` (`itemHashes`), or null. */
  bare: string | null;
  state: SyncRecordState;
  /** A pulled version waiting to be taken in (`held`, `newer`, `unreadable`). */
  remote?: RemoteVersion;
  /** The 413 code of the last refused push (`full`). */
  full?: FullReason;
}

/** The `syncMeta` store as the engine uses it. */
export interface SyncMeta {
  /** The `seq` of the last pulled change; 0 before the first pull. */
  cursor: number;
  /** This device's label (`syncDeviceLabel`), set at login. Used in keep-both names. */
  deviceLabel: string;
  /** When a sync last finished with nothing waiting for the network, or null. */
  lastSynced: number | null;
}

/** The `sync` and `syncMeta` stores. */
export interface SyncRecords {
  list(): Promise<SyncRecord[]>;
  /** One batch, atomic: `put` by (`kind`, `serverId`), `remove` the same. */
  write(batch: { put: SyncRecord[]; remove: { kind: SyncKind; serverId: string }[] }): Promise<void>;
  meta(): Promise<SyncMeta>;
  setMeta(patch: Partial<Pick<SyncMeta, 'cursor' | 'lastSynced'>>): Promise<void>;
}

/** 413's codes. */
export type FullReason = 'item_too_large' | 'storage_full' | 'too_many_items';

/** The answer to a push (`PUT` or `DELETE` of an item). */
export type WriteResult =
  | { status: 'ok'; written: SyncWritten }
  /** `409`. `current` is the item; a missing item is a tombstone of rev 0. */
  | { status: 'conflict'; current: SyncItem }
  /** `413`. */
  | { status: 'full'; error: FullReason };

/** How a request failed when it did not get one of the answers above. */
export type RemoteErrorKind =
  /** No answer: offline, DNS, a dropped connection, a timeout. */
  | 'offline'
  /** `5xx`, or `429`. */
  | 'server'
  /** `401 {error: "session_ended", reason}`. */
  | 'session_ended'
  /** `401 {error: "not_logged_in"}`: a cookie the server never knew. */
  | 'not_logged_in'
  /** Any other answer: a `4xx` the client did not expect, or a body that is not the contract's. */
  | 'refused';

export class RemoteError extends Error {
  readonly kind: RemoteErrorKind;
  /** The session's end reason for `session_ended`. */
  readonly reason: SessionEndReason | null;
  readonly status: number | null;

  constructor(kind: RemoteErrorKind, opts: { reason?: SessionEndReason; status?: number; message?: string } = {}) {
    super(opts.message ?? kind);
    this.name = 'RemoteError';
    this.kind = kind;
    this.reason = opts.reason ?? null;
    this.status = opts.status ?? null;
  }
}

/**
 * The sync API of `shared/cloud/api.ts`, one call per request. The fetch
 * adapter maps HTTP onto it: `200`, `409` and `413` are results, anything
 * else throws a `RemoteError`.
 */
export interface Remote {
  /** `GET /api/u/sync/changes?since=&limit=`. */
  changes(since: number, limit?: number): Promise<SyncChanges>;
  /** `PUT /api/u/sync/items/<kind>/<id>`, `If-Match: <baseRev>`, body = blob. */
  put(kind: SyncKind, id: string, baseRev: number, blob: Uint8Array): Promise<WriteResult>;
  /** `DELETE /api/u/sync/items/<kind>/<id>`, `If-Match: <baseRev>`. */
  remove(kind: SyncKind, id: string, baseRev: number): Promise<WriteResult>;
}

export interface Clock {
  now(): number;
}

/**
 * What a game in progress uses (spec §7.4 step 5): the active profile's
 * id, the enabled scripts' ids. Empty when no game plays. Asked once per
 * round; the engine neither writes these items nor takes a pulled change
 * into them, and does so at the first sync where they are free.
 */
export interface InUse {
  keys(kind: SyncKind): ReadonlySet<string> | Promise<ReadonlySet<string>>;
}

/** Runs `fn` alone among this browser's tabs (the Web Lock `webcockpit-sync`). */
export interface SyncLock {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

/** The account's two derived keys (src/cloud/crypto/root.ts). */
export interface SyncKeys {
  dataKey: CryptoKey;
  idKey: CryptoKey;
}

// --- What comes out ---

/** Something the player should hear about. */
export type SyncEvent =
  /** The same item changed here and elsewhere: the server's version kept `name`, this device's is the new `copyName`. */
  | { type: 'keptBoth'; kind: SyncKind; key: string; name: string; copyKey: string; copyName: string }
  /** Two items had one name: this one was renamed (a pulled item took the name). */
  | { type: 'renamed'; kind: SyncKind; key: string; from: string; to: string }
  /** An item deleted here was changed elsewhere and is back (an edit beats a delete). */
  | { type: 'restored'; kind: SyncKind; key: string; name: string }
  /** A version from a newer client: left untouched; update the client. */
  | { type: 'newer'; kind: SyncKind; serverId: string }
  /** A version that does not open or is not a body: left untouched. */
  | { type: 'unreadable'; kind: SyncKind; serverId: string }
  /** A local item whose body is not JSON (a number that is not finite …): left alone, the rest is synced. */
  | { type: 'unencodable'; kind: SyncKind; key: string }
  /** A push refused for storage: the item stays on this device and is retried. */
  | { type: 'full'; kind: SyncKind; key: string; name: string | null; error: FullReason };

export interface EventSink {
  emit(event: SyncEvent): void;
}

/** The state words of spec §7.4 ("needs attention" is `full` or `update`). */
export type SyncState = 'synced' | 'syncing' | 'offline' | 'full' | 'update';

export interface SyncStatus {
  state: SyncState;
  /** Local changes not in the account yet (new, edited, deleted). */
  waiting: number;
  /** Pulled changes waiting for the game to end (or for a conflict on an item in use). */
  held: number;
  /** When a sync last finished, or null. */
  lastSynced: number | null;
  /** When the engine wants to be run again after a failure, or null. */
  retryAt: number | null;
  /** The 413 code behind `full`. */
  full: FullReason | null;
  usage: SyncUsage | null;
  limits: AccountLimits | null;
}

/** What one `sync()` came to. */
export type SyncOutcome =
  | { type: 'synced' }
  /** No answer or a server error: retry at `retryAt` (back-off). */
  | { type: 'offline' | 'server' | 'refused'; retryAt: number }
  /** Three rounds of `409` in a row: retry at `retryAt`. */
  | { type: 'busy'; retryAt: number }
  /** The session is gone (`reason` null for `not_logged_in`): the caller leaves the account's space. */
  | { type: 'session_ended'; reason: SessionEndReason | null };

/** One local change not in the account (Log out's list, the locked copy's decision). */
export interface Unsynced {
  kind: SyncKind;
  key: string;
  name: string | null;
  change: 'new' | 'edit' | 'delete';
}
