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

import type { SyncKind } from '../../../shared/cloud/api.ts';
import { currentSpace, gameRunningElsewhere, holdingGameLock } from '../../core/space';
import { onStored } from '../../core/store-events';
import type { ProfileStore } from '../../profiles/store';
import type { ScriptLibrary } from '../../scripts/library';
import type { SettingsStore } from '../../settings/store';
import { createAccountStore } from '../account/store';
import { SyncEngine } from '../sync/engine';
import { SYNC_SPECS } from '../sync/items';
import { webSyncLock } from '../sync/lock';
import type { InUse, SyncEvent, SyncOutcome, Unsynced } from '../sync/types';
import { type SyncHost, isPlaying, markKeptBoth, onPlaying, patchSyncView, postSyncMessage } from '../sync-view';
import { finishHandBacks, lockedNotice, onSyncControl, reconcile, sessionLost, sessionLostLater, spacesOn, thisDeviceLabel } from './flows';
import { type ProfileChanges, type SettingsWritten, idbLocalItems, idbSyncRecords, settleSettingsSeed, thisDeviceType } from './local';
import { continueMove, moveState, unreachable } from './move';
import { type SyncWrite, applyWritten, listenWritten, notifyWritten } from './notify';
import { fetchRemote } from './remote';
import { currentNameKey, spaceDb } from './spaces';
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
    return new PageSync(host, nameKey, me.name, { dataKey: me.dataKey, idKey: me.idKey }).start();
  } catch {
    return NONE;
  }
}

/** The sync of a page in an account's space (exported for the tests). */
export class PageSync implements Runtime {
  private readonly engine: SyncEngine;
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
  ) {
    this.open = spaceDb(nameKey);
    const inUse: InUse = { keys: (kind) => this.inUse(kind) };
    this.local = idbLocalItems(this.open, { written: (kind, profiles, settings) => this.written(kind, profiles, settings) }, { type: this.type });
    this.engine = new SyncEngine({
      local: this.local,
      records: idbSyncRecords(this.open, thisDeviceLabel),
      remote: fetchRemote(),
      keys,
      inUse,
      events: { emit: (e) => this.event(e) },
      lock: webSyncLock(),
      specs: SYNC_SPECS,
    });
  }

  start(): Runtime {
    onSyncControl({ stop: () => this.stop(), pause: () => this.pause(), resume: () => this.resume() });
    this.offs.push(this.engine.status.subscribe((status) => patchSyncView({ status })));
    patchSyncView({ status: this.engine.status.get() });
    // Called on the game path (a Comm append, a timers save): a flag test and at most a timer.
    this.offs.push(
      onStored((kind) => {
        if (kind === 'profile' || kind === 'script' || !inPlay()) this.soon();
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
    return this;
  }

  stop(): void {
    this.stopped = true;
    for (const off of this.offs.splice(0)) off();
    if (this.changeTimer) clearTimeout(this.changeTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.periodTimer) clearInterval(this.periodTimer);
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
  }

  syncNow(): Promise<SyncOutcome | null> {
    return this.sync();
  }

  unsynced(): Promise<Unsynced[] | null> {
    return this.engine.unsynced();
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
      moved: m && m.total.profiles + m.total.scripts > 0 ? movedLine(m.total) : null,
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
    if (e.type === 'unencodable') console.warn(`WebCockpit: ${e.kind} ${e.key} is not synced (its data is not JSON)`);
    if (e.type === 'keptBoth' && e.kind === 'profile') markKeptBoth(e.copyKey);
    const text = eventWords(e);
    if (text) postSyncMessage({ text, ms: MESSAGE_MS });
  }
}
