// The sync on a page (stage 61 part C, spec §7.4 "Triggers", ADR 0151
// "What part C provides"). Loaded with `import()` by src/cloud/sync-view.ts
// when the start menu is first drawn; never on the game path.
//
// What it does at start:
//   - every space: follows what the sync writes there from another tab
//     (notify.ts);
//   - the device's space: puts a login that did not change space into
//     its space (`reconcile`), finishes a pending hand-back of a deleted
//     account (`finishHandBacks`), and draws a locked copy's notice;
//   - an account's space: when the keys are gone, the session is lost;
//     else, with the flag `sync` on, the engine on the space's database.
//
// The engine syncs on: the page's load, the start page shown again (the
// game left), 5 s after a change was stored, every 5 minutes (on the start
// page and in play), the tab visible again (off play) or hidden (in play),
// and at the `retryAt` of a failed sync. During play only a profile or
// script change notes at 5 s; a store write of `settings`, `scriptData`,
// `comm` or `timers` starts nothing (the cockpit writes its settings by
// itself: pane sizes, window rects; the rest per second, per message, per
// tick): they ride the play schedule (ADR 0152 "When the small kinds
// push", as amended by the stage 62 review). Every call is
// fire-and-forget: nothing on the game path awaits it (§7.0 rule 1). While
// a game plays on the space, in this tab or another (the game lock), the
// selected profile, the enabled scripts and their data, this device
// type's settings and the played character's timers (every character's,
// for a game in another tab) are "in use": the engine holds pulled
// changes to them until the game ends. Comm is never in use.
// Log out and Delete account pause the sync; when they fail it goes on.
// After each sync the move goes on (move.ts), the events become
// messages, and the status feeds the owner row and the Account page.
//
// Runs in the cloud (stage 63 C1, ADR 0153), with the flag `runs` on: the
// engine syncs the kinds `run` and `exportDoc` too (`SYNC_SPECS_WITH_RUNS`;
// off, `SYNC_SPECS` and the runs stay in the space as in stage 62), and
// `PageRuns` (below) keeps the upload queue: the saved sealed runs get
// `queued` rows; the queue uploads them (Web Lock `webcockpit-runs@<space
// id>`, one tab) after a save, after a sync that ends `synced` (its room
// first), at load (rows left `fetching` recovered first) and after a
// delete; never while a game plays here or in another tab of the space;
// again at its `retryAt`. After a sync it does what the engine's events
// ask of the runs on this device (`revived`: back in the queue) before the
// sync's caller goes on (Log out counts what is not in the account next);
// what needs the network goes on behind it, one step after the other: a
// `full` of a new run item (`itemRefused`, its body deleted), the bodies
// of runs the player deleted once their tombstones went
// (`RUN_BODY_DELETES`), once per load the check of the bodies (orphans,
// lost bodies), and the queue. It sets the run library's hook
// (src/runs/cloud-hook.ts) and feeds src/cloud/runs-view.ts.

import type { SyncKind } from '../../../shared/cloud/api.ts';
import type { RunMeta } from '../../capture/store';
import { STORE, idbDone, idbRequest } from '../../core/db';
import { currentSpace, gameRunningElsewhere, holdingGameLock, spaceId } from '../../core/space';
import { onStored } from '../../core/store-events';
import type { ProfileStore } from '../../profiles/store';
import { setRunCloudHook } from '../../runs/cloud-hook';
import { RUN_BODY_DELETES } from '../../runs/store';
import { stitchChains } from '../../runs/stitch';
import type { ScriptLibrary } from '../../scripts/library';
import type { SettingsStore } from '../../settings/store';
import { createAccountStore } from '../account/store';
import { flagOn } from '../config';
import { RunQueue, runsLockName } from '../runs/queue';
import type { RunBodyPort, RunCloudRow, RunQueueEvent, RunRemote } from '../runs/types';
import { type DoesNotFit, type FetchOutcome, type FetchProgress, cloudFigures, emitDoesNotFit, patchRunsView, setRunsFetcher } from '../runs-view';
import { ItemCodec } from '../sync/codec';
import { SyncEngine } from '../sync/engine';
import { SYNC_SPECS, SYNC_SPECS_WITH_RUNS } from '../sync/items';
import { noLock, webSyncLock } from '../sync/lock';
import type { FullReason, InUse, LocalItems, Remote, SyncEvent, SyncLock, SyncOutcome, SyncRecords, Unsynced } from '../sync/types';
import { type SyncHost, isPlaying, markKeptBoth, onPlaying, patchSyncView, postSyncMessage } from '../sync-view';
import { finishHandBacks, lockedNotice, onSyncControl, reconcile, sessionLost, sessionLostLater, spacesOn, thisDeviceLabel } from './flows';
import { type OpenDb, type ProfileChanges, type SettingsWritten, idbLocalItems, idbRunCloudStore, idbSyncRecords, readMeta, settleSettingsSeed, thisDeviceType, updateMeta } from './local';
import { continueMove, moveRuns, moveState, unreachable } from './move';
import { type SyncWrite, applyWritten, listenWritten, notifyWritten } from './notify';
import { fetchRemote } from './remote';
import { fetchRunRemote } from './run-remote';
import { currentNameKey, runCounts, spaceDb } from './spaces';
import { eventWords, moveWaitWords, movedLine, movedWords, movingWords } from './words';

/** After a profile or script change was stored (and any change off play). */
export const CHANGE_DELAY_MS = 5000;
/** On the start page and in play (the play schedule of the small kinds). */
export const PERIOD_MS = 5 * 60_000;
/** A game is this tab's view, or its cockpit holds the game lock (from Enter MUME on, before the start page's leave has ended). */
const inPlay = (): boolean => isPlaying() || holdingGameLock();

/** How long the start menu's messages of the sync stay. */
const MESSAGE_MS = 12_000;

interface Host {
  profiles: ProfileStore;
  scripts?: ScriptLibrary;
  settings: SettingsStore;
  /** The character in play in this tab (`Char.Name`), or null. */
  playedCharacter?: () => string | null;
}

export interface Runtime {
  syncNow(): Promise<SyncOutcome | null>;
  unsynced(): Promise<Unsynced[] | null>;
  stop(): void;
}

const NONE: Runtime = { syncNow: async () => null, unsynced: async () => null, stop: () => {} };

/** Starts the page's sync (sync-view.ts `startSync`). Never rejects. */
export async function startRuntime(h: SyncHost): Promise<Runtime> {
  const host = h as Host;
  try {
    // Every tab follows what the sync (the move, the hand-back) writes into its space from another tab.
    listenWritten(currentSpace(), (w) => void applyWritten(host, w));
    if (currentSpace().kind === 'device') {
      if (await reconcile()) return NONE;
      for (const text of await finishHandBacks().catch(() => [])) postSyncMessage({ text, ms: MESSAGE_MS });
      patchSyncView({ locked: await lockedNotice().catch(() => null) });
      return NONE;
    }
    const nameKey = currentNameKey()!;
    const me = await createAccountStore()
      .read()
      .catch(() => undefined);
    if (me === undefined) return NONE; // the key store could not be read just now: nothing is decided
    if (!me || me.name.toLowerCase() !== nameKey) {
      // Logged out (or into another account) without this space knowing: the session is gone for it.
      void sessionLost(null);
      return NONE;
    }
    if (!(await spacesOn())) return NONE;
    const runs = await flagOn('runs').catch(() => false);
    return new PageSync(host, nameKey, me.name, { dataKey: me.dataKey, idKey: me.idKey }, { runs }).start();
  } catch {
    return NONE;
  }
}

/** What a `PageSync` is built with besides its space (tests replace the network and the body's worker). */
export interface PageSyncOptions {
  /** The flag `runs`: runs in the cloud (ADR 0153). */
  runs?: boolean;
  remote?: Remote;
  runRemote?: RunRemote;
  /** The run bodies' port (default: src/cloud/runs/body-client.ts, loaded with `import()` on first use). */
  body?: RunBodyPort;
  /** The queue's lock (default the Web Lock `runsLockName(space)`). */
  runsLock?: SyncLock;
}

/** The sync of a page in an account's space (exported for the tests). */
export class PageSync implements Runtime {
  private readonly engine: SyncEngine;
  private readonly records: SyncRecords;
  /** Runs in the cloud (the flag `runs`), or null. */
  readonly runs: PageRuns | null = null;
  private readonly open;
  private stopped = false;
  /** A flow that may leave the space runs (Log out, Delete account): no sync until it ends or fails. */
  private paused = false;
  private changeTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private periodTimer: ReturnType<typeof setInterval> | null = null;
  private readonly offs: (() => void)[] = [];
  private last: SyncOutcome | null = null;
  private readonly type = thisDeviceType();
  /** The engine's local ports, shared by the counts and the in-use check (one Comm cache). */
  private readonly local;

  constructor(
    private readonly host: Host,
    nameKey: string,
    private readonly name: string,
    keys: { dataKey: CryptoKey; idKey: CryptoKey },
    o: PageSyncOptions = {},
  ) {
    this.open = spaceDb(nameKey);
    const inUse: InUse = { keys: (kind) => this.inUse(kind) };
    const codec = new ItemCodec(keys);
    this.local = idbLocalItems(
      this.open,
      { written: (kind, profiles, settings) => this.written(kind, profiles, settings) },
      { type: this.type, runServerId: (id) => codec.serverId('run', id) },
    );
    this.records = idbSyncRecords(this.open, thisDeviceLabel);
    this.engine = new SyncEngine({
      local: this.local,
      records: this.records,
      remote: o.remote ?? fetchRemote(),
      keys,
      inUse,
      events: { emit: (e) => this.event(e) },
      lock: webSyncLock(),
      specs: o.runs ? SYNC_SPECS_WITH_RUNS : SYNC_SPECS,
    });
    if (o.runs) {
      this.runs = new PageRuns({
        open: this.open,
        local: this.local,
        records: this.records,
        codec,
        dataKey: keys.dataKey,
        remote: o.runRemote ?? fetchRunRemote(),
        ...(o.body ? { body: o.body } : {}),
        lock: o.runsLock ?? webRunsLock(runsLockName(spaceId(currentSpace()))),
        requestSync: () => this.soonAfterUpload(),
        sessionLost: (reason) => void sessionLost(reason),
        blocked: () => this.stopped || this.paused,
        room: () => {
          const st = this.engine.status.get();
          return st.usage && st.limits ? { usage: st.usage, limits: st.limits } : null;
        },
      });
    }
  }

  private uploadTimer: ReturnType<typeof setTimeout> | null = null;

  /** A body went up: a sync pushes its item (one for a few uploads in a row). */
  private soonAfterUpload(): void {
    if (this.stopped || this.paused) return;
    if (this.uploadTimer) clearTimeout(this.uploadTimer);
    this.uploadTimer = setTimeout(() => {
      this.uploadTimer = null;
      this.run();
    }, 300);
  }

  start(): Runtime {
    onSyncControl({ stop: () => this.stop(), pause: () => this.pause(), resume: () => this.resume() });
    this.offs.push(this.engine.status.subscribe((status) => patchSyncView({ status })));
    patchSyncView({ status: this.engine.status.get() });
    // Called on the game path (a Comm append, a timers save): a flag test and at most a timer.
    this.offs.push(
      onStored((kind) => {
        // A saved run sealed (the Exit popup's, at the game's end): the upload queue takes it now, not at the next sync.
        if (kind === 'runSealed') {
          this.runs?.kick();
          return;
        }
        // A look chosen and an own image added or removed are the player's own acts, as a profile's edit (stage 80, ADR 0172).
        if (kind === 'profile' || kind === 'script' || kind === 'looks' || kind === 'lookImage' || !inPlay()) this.soon();
      }),
    );
    this.offs.push(
      onPlaying((on) => {
        this.period(true);
        if (!on) {
          void sessionLostLater();
          void this.leftGame();
        }
      }),
    );
    const doc = globalThis.document;
    if (doc) {
      // In play, hidden: the last minutes are pushed before a phone puts the tab away (ADR 0152).
      // Off play, visible again: what came meanwhile (stage 61).
      const vis = (): void => {
        const hidden = doc.visibilityState === 'hidden';
        if (inPlay() ? hidden : !hidden) this.run();
      };
      doc.addEventListener('visibilitychange', vis);
      this.offs.push(() => doc.removeEventListener('visibilitychange', vis));
    }
    this.period(true);
    void this.lines();
    this.run();
    if (this.runs) {
      this.offs.push(() => this.runs?.stop());
      void this.runs.start();
    }
    return this;
  }

  stop(): void {
    this.stopped = true;
    for (const off of this.offs.splice(0)) off();
    if (this.changeTimer) clearTimeout(this.changeTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.periodTimer) clearInterval(this.periodTimer);
    if (this.uploadTimer) clearTimeout(this.uploadTimer);
  }

  /** Log out or Delete account runs: the timers stop, no new sync starts. */
  pause(): void {
    if (this.stopped) return;
    this.paused = true;
    if (this.changeTimer) clearTimeout(this.changeTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.periodTimer) clearInterval(this.periodTimer);
    this.changeTimer = this.retryTimer = this.periodTimer = null;
  }

  /** The flow failed and the page stays in the space: the sync goes on. */
  resume(): void {
    if (this.stopped || !this.paused) return;
    this.paused = false;
    this.period(true);
    this.run();
    this.runs?.kick();
  }

  syncNow(): Promise<SyncOutcome | null> {
    return this.sync();
  }

  /**
   * The local changes not in the account. With runs in the cloud, a saved
   * run not in the cloud (queued, full, too large) is one entry `run`
   * `new` (the engine's own `run` `new` entries are among them).
   */
  async unsynced(): Promise<Unsynced[] | null> {
    const list = await this.engine.unsynced();
    if (!this.runs) return list;
    const left = await runCounts(this.open);
    const out = list.filter((u) => u.kind !== 'run' || u.change !== 'new');
    for (const key of left.savedIds) out.push({ kind: 'run', key, name: null, change: 'new' });
    return out;
  }

  /** A sync, not awaited. */
  private run(): void {
    void this.sync();
  }

  private soon(): void {
    if (this.stopped || this.paused) return;
    if (this.changeTimer) clearTimeout(this.changeTimer);
    this.changeTimer = setTimeout(() => this.run(), CHANGE_DELAY_MS);
  }

  private period(on: boolean): void {
    if (this.periodTimer) clearInterval(this.periodTimer);
    this.periodTimer = on && !this.stopped && !this.paused ? setInterval(() => this.run(), PERIOD_MS) : null;
  }

  private async sync(): Promise<SyncOutcome | null> {
    if (this.stopped || this.paused) return null;
    let out: SyncOutcome | null = null;
    try {
      out = await this.engine.sync();
    } catch {
      out = null; // a local port failed: the status says offline; the next trigger tries again
    }
    if (this.stopped || this.paused) return out;
    this.last = out;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (out && 'retryAt' in out) this.retryTimer = setTimeout(() => this.run(), Math.max(1000, out.retryAt - Date.now()));
    if (out?.type === 'session_ended') {
      void sessionLost(out.reason);
      return out;
    }
    // Runs in the cloud: what the sync's events ask of this device's rows; the network's part (bodies, the queue) is not awaited.
    if (this.runs && out) await this.runs.afterSync(out, this.engine.status.get()).catch(() => {});
    // The first full pull is done: a login's copy of the settings that met none of this type is the account's now.
    const settled = out?.type === 'synced' && (await settleSettingsSeed(this.open, this.type).catch(() => false));
    if (out && out.type !== 'synced') {
      // The engine stopped before it counted: what waits on this device, for the Account page and Log out.
      const waiting = (await this.engine.unsynced().catch(() => null))?.length;
      if (waiting !== undefined && !this.stopped) patchSyncView({ status: { ...this.engine.status.get(), waiting } });
    }
    await this.lines().catch(() => {});
    if (settled) this.run(); // pushed now, not left waiting on this device
    return out;
  }

  /** The move's progress and the counts, after a sync. */
  private async lines(): Promise<void> {
    if (this.runs) await moveRuns(this.open).catch(() => 0); // a runs' move cut off at Create account
    const p = await continueMove(this.open);
    if (p && !p.done) {
      const text = unreachable(this.last) ? moveWaitWords(this.name, p.moved, p.left) : movingWords(this.name, p.moved, p.total.profiles + p.total.scripts);
      postSyncMessage({ text, ms: 20_000, tag: 'move' });
    } else if (p?.justDone) {
      postSyncMessage({ text: movedWords(this.name, p.total), ms: MESSAGE_MS, tag: 'move' });
    }
    const m = p?.done ? await moveState(this.open) : null;
    const [profiles, scripts] = await Promise.all([this.local.list('profile'), this.local.list('script')]);
    patchSyncView({
      moved: m && m.total.profiles + m.total.scripts + (m.total.runs ?? 0) > 0 ? movedLine(m.total) : null,
      counts: { profiles: profiles.length, scripts: scripts.length },
    });
  }

  /** The game was left: a sync (what was held for it comes in). */
  private async leftGame(): Promise<void> {
    if (this.stopped || this.paused) return;
    await this.sync();
  }

  /** In use: what a game plays with, in this tab or in another tab of the space (the game lock). */
  private async inUse(kind: SyncKind): Promise<ReadonlySet<string>> {
    if (kind === 'comm') return new Set();
    const here = inPlay();
    const elsewhere = await gameRunningElsewhere(currentSpace());
    if (!here && !elsewhere) return new Set();
    if (kind === 'settings') return new Set([this.type]);
    if (kind === 'scriptData') return new Set(this.host.scripts?.enabledNames() ?? []);
    if (kind === 'timers') {
      // A game in another tab: its character is not known here, so every character's timers wait.
      if (elsewhere) return new Set((await this.local.list('timers')).map((i) => i.key));
      const c = this.host.playedCharacter?.() ?? null;
      return new Set(c ? [c] : []);
    }
    if (kind === 'profile') {
      const rec = await this.host.profiles.get(this.host.settings.get().profile).catch(() => null);
      return new Set(rec?.id ? [rec.id] : []);
    }
    if (kind === 'script' && this.host.scripts) {
      return new Set(
        this.host.scripts
          .backupRecords()
          .scripts.filter((s) => s.enabled)
          .map((s) => s.id),
      );
    }
    return new Set();
  }

  /** The sync wrote: this page's caches follow, and every other tab of the space is told. */
  private written(kind: SyncKind, profiles?: ProfileChanges, settings?: SettingsWritten): void {
    if (kind === 'run' || kind === 'exportDoc') return;
    if (kind === 'settings' && !settings) return; // only other device types' settings: nothing shows them
    const w: SyncWrite = {
      kind,
      ...(profiles ? { profiles } : {}),
      ...(settings ? { settings: settings.seedRecord !== undefined ? { seedRecord: settings.seedRecord } : {} } : {}),
    };
    void applyWritten(this.host, w);
    notifyWritten(currentSpace(), w);
  }

  private event(e: SyncEvent): void {
    this.runs?.engineEvent(e);
    if (e.type === 'unencodable') console.warn(`WebCockpit: ${e.kind} ${e.key} is not synced (its data is not JSON)`);
    if (e.type === 'keptBoth' && e.kind === 'profile') markKeptBoth(e.copyKey);
    const text = eventWords(e);
    if (text) postSyncMessage({ text, ms: MESSAGE_MS });
  }
}

// ------------------------------------------------------------ runs in the cloud

/** The Web Lock of the run queue (one tab uploads); `noLock` without Web Locks. */
function webRunsLock(name: string, locks: LockManager | undefined = globalThis.navigator?.locks): SyncLock {
  if (!locks) return noLock;
  return { run: (fn) => locks.request(name, { mode: 'exclusive' }, fn) };
}

/** The run bodies' port, its worker loaded on first use (`import()`): nothing of it before a run is uploaded or fetched. */
function lazyBodyPort(dataKey: CryptoKey): RunBodyPort {
  let port: Promise<RunBodyPort> | null = null;
  const get = (): Promise<RunBodyPort> => {
    port ??= import('../runs/body-client').then((m) => m.runBodyPort(dataKey));
    port.catch(() => (port = null));
    return port;
  };
  return {
    encode: async (serverId, rows) => (await get()).encode(serverId, rows),
    decode: async (serverId, runId, body) => (await get()).decode(serverId, runId, body),
  };
}

interface PageRunsOptions {
  open: OpenDb;
  local: LocalItems;
  records: SyncRecords;
  codec: ItemCodec;
  dataKey: CryptoKey;
  remote: RunRemote;
  body?: RunBodyPort;
  lock: SyncLock;
  /** A body went up: the sync pushes its item. */
  requestSync(): void;
  sessionLost(reason: Parameters<typeof sessionLost>[0]): void;
  /** The page's sync stopped or paused (Log out, Delete account): nothing starts. */
  blocked(): boolean;
  /** The room the engine last heard. */
  room(): { usage: NonNullable<ReturnType<SyncEngine['status']['get']>['usage']>; limits: NonNullable<ReturnType<SyncEngine['status']['get']>['limits']> } | null;
}

/** How long the queue waits for a game to end before it looks again (the game's end also starts it). */
const PLAY_RECHECK_MS = 60_000;

/**
 * Runs in the cloud on a page (ADR 0153; see the file header): the
 * upload queue and its triggers, the fetches, the run library's hook and
 * the view. Exported for the tests.
 */
export class PageRuns {
  readonly queue: RunQueue;
  private readonly store;
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private checked = false;
  /** Engine events of the sync in flight that concern runs. */
  private revived: string[] = [];
  private refused: { key: string; error: FullReason }[] = [];
  /** The network's part after each sync, one after the other (`afterSync`). */
  private behind: Promise<void> = Promise.resolve();
  /** Runs this page was asked to save (a moved run saved again is told when it does not fit). */
  private readonly savedHere = new Set<string>();

  constructor(private readonly o: PageRunsOptions) {
    this.store = idbRunCloudStore(o.open);
    this.queue = new RunQueue({
      store: this.store,
      body: o.body ?? lazyBodyPort(o.dataKey),
      remote: o.remote,
      // Asked before each upload: a game started in another tab meanwhile stops the queue too.
      isPlaying: async () => inPlay() || (await gameRunningElsewhere(currentSpace()).catch(() => false)),
      requestSync: () => o.requestSync(),
      lock: o.lock,
      events: { emit: (e) => void this.queueEvent(e) },
    });
  }

  /** At load: rows left `fetching` go back to `remote`, then the queue. */
  async start(): Promise<void> {
    setRunCloudHook({
      saved: (ids) => this.saved(ids),
      removed: () => this.removed(),
      fetch: async (ids, onProgress) => {
        const r = await this.fetch(ids, onProgress);
        return r.ok ? { ok: true } : { ok: false, why: r.why ?? 'unavailable' };
      },
    });
    setRunsFetcher({ fetchSession: (id, p) => this.fetchSession(id, p), fetchAll: (p) => this.fetchAll(p) });
    patchRunsView({ on: true });
    await this.queue.recover().catch(() => 0);
    await this.view();
    this.kick();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    setRunCloudHook(null);
    setRunsFetcher(null);
    patchRunsView({ on: false, cloud: null, queued: 0, notInCloudAfterMove: 0 });
  }

  /** The library saved runs: the sealed ones are queued and go up (off play; an Exit's, and its "does not fit", wait for the start page). */
  private saved(ids: readonly string[]): void {
    for (const id of ids) this.savedHere.add(id);
    this.kick();
  }

  /** The library deleted runs: the sync pushes the tombstones (then the bodies go), the queue has room again. */
  private removed(): void {
    this.o.requestSync();
  }

  /** The engine's events during a sync: kept for `afterSync`. */
  engineEvent(e: SyncEvent): void {
    if (e.kind !== 'run') return;
    if (e.type === 'revived') this.revived.push(e.key);
    if (e.type === 'full') this.refused.push({ key: e.key, error: e.error });
  }

  /**
   * After a sync (not on `session_ended`, which goes the lost session's
   * way). Awaited by the sync's caller (Log out counts what is not in the
   * account next): only this device's rows. The network's part (`later`)
   * is not.
   */
  async afterSync(out: SyncOutcome, status: ReturnType<SyncEngine['status']['get']>): Promise<void> {
    if (this.stopped) return;
    const revived = this.revived.splice(0);
    const refused = this.refused.splice(0);
    // An edit here beat a delete elsewhere: a run here goes back in the queue (its body may be gone); a remote one's row goes (nobody has its body).
    for (const runId of revived) {
      const row = await this.store.get(runId);
      if (!row) continue;
      if (await this.here(runId)) await this.store.put({ ...row, state: 'queued', at: Date.now() });
      else await this.store.remove(runId);
    }
    // A run item refused for room: only one new to the account gives its body back (a request: behind the sync).
    if (refused.length) {
      this.later(async () => {
        const recs = await this.o.records.list();
        for (const { key, error } of refused) {
          const rec = recs.find((r) => r.kind === 'run' && r.key === key);
          if (!rec || rec.rev === 0) await this.queue.itemRefused(key, error);
        }
      });
    }
    if (out.type === 'synced') {
      if (status.usage && status.limits) this.queue.setRoom(status.usage, status.limits);
      this.later(async () => {
        await this.deleteBodies();
        if (!this.checked) {
          this.checked = true;
          await this.checkBodies().catch(() => (this.checked = false));
        }
        this.kick();
      });
    }
    await this.view();
  }

  /** Runs `fn` behind the sync (not awaited), after what was asked before; nothing once stopped or blocked. */
  private later(fn: () => Promise<void>): void {
    this.behind = this.behind.then(async () => {
      if (this.stopped || this.o.blocked()) return;
      await fn().catch(() => {});
      await this.view().catch(() => {});
    });
  }

  /** Tests: the network's part of the syncs so far has ended. */
  idle(): Promise<void> {
    return this.behind;
  }

  /** The bodies of runs the player deleted, once their tombstones went; a run listed again (an edit elsewhere beat the delete) keeps its body. */
  private async deleteBodies(): Promise<void> {
    const cur = (await readMeta(this.o.open, [RUN_BODY_DELETES]))[RUN_BODY_DELETES] as Record<string, string> | undefined;
    if (!cur || typeof cur !== 'object' || Object.keys(cur).length === 0) return;
    const listed = new Set((await this.o.local.list('run')).map((i) => i.key));
    const done = new Map<string, string>();
    for (const [runId, serverId] of Object.entries(cur)) {
      if (listed.has(runId) || (typeof serverId === 'string' && (await this.queue.removeBody(serverId)))) done.set(runId, serverId);
    }
    if (!done.size) return;
    // In one transaction with what a Delete made meanwhile added: only the entries done go.
    await updateMeta(this.o.open, RUN_BODY_DELETES, (now) => {
      const next: Record<string, string> = { ...(now && typeof now === 'object' ? (now as Record<string, string>) : {}) };
      for (const [id, sid] of done) if (next[id] === sid) delete next[id];
      return Object.keys(next).length ? next : undefined;
    });
  }

  private async checkBodies(): Promise<void> {
    const live = new Set<string>();
    for (const rec of await this.o.records.list()) if (rec.kind === 'run' && rec.rev > 0 && rec.hash !== null) live.add(rec.serverId);
    await this.queue.checkBodies(live);
  }

  /** Whether the run is on this device. */
  private async here(runId: string): Promise<boolean> {
    const db = await this.o.open();
    const t = db.transaction(STORE.runs, 'readonly');
    const done = idbDone(t);
    const k = await idbRequest(t.objectStore(STORE.runs).getKey(runId));
    await done;
    return k !== undefined;
  }

  /** Every saved, sealed run here without a `runCloud` row gets a `queued` one. */
  private async enqueue(): Promise<number> {
    const db = await this.o.open();
    const t = db.transaction([STORE.runs, STORE.runCloud], 'readonly');
    const done = idbDone(t);
    const [runs, keys] = (await Promise.all([idbRequest(t.objectStore(STORE.runs).getAll()), idbRequest(t.objectStore(STORE.runCloud).getAllKeys())])) as [RunMeta[], IDBValidKey[]];
    await done;
    const have = new Set(keys);
    const todo = runs.filter((m) => m && m.sealed && m.saved && !have.has(m.runId));
    if (!todo.length) return 0;
    const ids = await Promise.all(todo.map((m) => this.o.codec.serverId('run', m.runId)));
    const w = (await this.o.open()).transaction([STORE.runs, STORE.runCloud], 'readwrite');
    const wdone = idbDone(w);
    const cloud = w.objectStore(STORE.runCloud);
    const at = Date.now();
    let n = 0;
    for (let i = 0; i < todo.length; i++) {
      const m = todo[i]!;
      // Still here and still without a row (a tombstone or another tab meanwhile).
      const [run, row] = await Promise.all([idbRequest(w.objectStore(STORE.runs).getKey(m.runId)), idbRequest(cloud.getKey(m.runId))]);
      if (run === undefined || row !== undefined) continue;
      cloud.put({ runId: m.runId, state: 'queued', serverId: ids[i]!, size: 0, tries: 0, at, startedUs: m.startedUs } satisfies RunCloudRow);
      n++;
    }
    await wdone;
    return n;
  }

  /** The queue runs, not awaited (never on the game path). */
  kick(): void {
    void this.runQueue().catch(() => {});
  }

  private async runQueue(): Promise<void> {
    if (this.stopped || this.o.blocked()) return;
    await this.enqueue();
    if (inPlay()) return; // the game's end starts it again
    if (await gameRunningElsewhere(currentSpace()).catch(() => false)) {
      this.retry(Date.now() + PLAY_RECHECK_MS);
      return;
    }
    if (!this.queue.room) {
      const r = this.o.room();
      if (r) this.queue.setRoom(r.usage, r.limits);
    }
    const out = await this.queue.run();
    if (this.stopped) return;
    if (out.type === 'session_ended') this.o.sessionLost(out.reason);
    else if ('retryAt' in out) this.retry(out.retryAt);
    else if (out.type === 'playing' && !inPlay()) this.retry(Date.now() + PLAY_RECHECK_MS);
    await this.view();
  }

  private retry(at: number): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.kick();
    }, Math.max(1000, at - Date.now()));
  }

  /** A queue event: a run that does not fit is told (none for the move's that no save of this page asked for: they are counted). */
  private async queueEvent(e: RunQueueEvent): Promise<void> {
    if (e.type === 'uploaded') return;
    const moved = new Set((await moveState(this.o.open).catch(() => null))?.runs?.saved ?? []);
    if (moved.has(e.runId) && !this.savedHere.has(e.runId)) {
      await this.view();
      return;
    }
    const room = this.queue.room;
    const ev: DoesNotFit =
      e.type === 'full'
        ? { runId: e.runId, sessionId: await this.sessionOf(e.runId), used: e.used, limit: e.limit, size: e.size, reason: e.reason }
        : { runId: e.runId, sessionId: await this.sessionOf(e.runId), used: room?.usage.runBytes ?? 0, limit: e.limit, size: e.size, reason: 'tooLarge' };
    emitDoesNotFit(ev);
  }

  /** The sealed metas here and of the `remote` rows, and the rows. */
  private async metas(): Promise<{ metas: RunMeta[]; rows: RunCloudRow[] }> {
    const db = await this.o.open();
    const t = db.transaction([STORE.runs, STORE.runCloud], 'readonly');
    const done = idbDone(t);
    const [runs, rows] = (await Promise.all([idbRequest(t.objectStore(STORE.runs).getAll()), idbRequest(t.objectStore(STORE.runCloud).getAll())])) as [RunMeta[], RunCloudRow[]];
    await done;
    const metas = runs.filter((m) => m?.sealed);
    const here = new Set(metas.map((m) => m.runId));
    for (const r of rows) if ((r.state === 'remote' || r.state === 'fetching') && r.meta && !here.has(r.runId)) metas.push(r.meta);
    return { metas, rows };
  }

  /** The session (its first run's id) a run is in. */
  private async sessionOf(runId: string): Promise<string> {
    const { metas } = await this.metas().catch(() => ({ metas: [] as RunMeta[] }));
    const chain = stitchChains(metas).find((c) => c.some((m) => m.runId === runId));
    return chain?.[0]?.runId ?? runId;
  }

  private async fetch(ids: readonly string[], onProgress?: FetchProgress): Promise<FetchOutcome> {
    if (this.stopped) return { ok: false, fetched: 0, failed: ids.length, why: 'unavailable' };
    const r = await this.queue.fetchRuns(ids, onProgress);
    if (r.failed.some((f) => f.why === 'session_ended')) this.o.sessionLost(null);
    await this.view();
    return { ok: r.failed.length === 0, fetched: r.fetched.length, failed: r.failed.length, why: r.failed[0]?.why ?? null };
  }

  /** A session's cloud-only runs. */
  async fetchSession(sessionId: string, onProgress?: FetchProgress): Promise<FetchOutcome> {
    const { metas, rows } = await this.metas();
    const chain = stitchChains(metas).find((c) => c[0]?.runId === sessionId);
    if (!chain) return { ok: false, fetched: 0, failed: 0, why: 'not_remote' };
    const remote = new Set(rows.filter((r) => r.state === 'remote' || r.state === 'fetching').map((r) => r.runId));
    return this.fetch(
      chain.map((m) => m.runId).filter((id) => remote.has(id)),
      onProgress,
    );
  }

  /** Every cloud-only run (Fetch all). */
  async fetchAll(onProgress?: FetchProgress): Promise<FetchOutcome> {
    const rows = await this.store.list();
    return this.fetch(
      rows.filter((r) => r.state === 'remote' || r.state === 'fetching').map((r) => r.runId),
      onProgress,
    );
  }

  /** The view's figures. */
  private async view(): Promise<void> {
    if (this.stopped) return;
    const rows = await this.store.list().catch(() => [] as RunCloudRow[]);
    const moved = new Set((await moveState(this.o.open).catch(() => null))?.runs?.saved ?? []);
    const r = this.queue.room ?? this.o.room();
    patchRunsView({
      on: true,
      cloud: r ? cloudFigures(r.usage, r.limits) : null,
      queued: rows.filter((x) => x.state === 'queued').length,
      notInCloudAfterMove: rows.filter((x) => moved.has(x.runId) && (x.state === 'full' || x.state === 'tooLarge')).length,
    });
  }
}
