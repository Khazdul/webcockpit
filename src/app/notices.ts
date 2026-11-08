// Client notices (ADR 0025): the tab is out of date or can no longer save.
//
//   newer version   the site serves another release (src/app/update-check.ts)
//   chunk failed    a lazy chunk of this build is gone from the site
//   storage         a newer tab upgraded the database (src/core/db.ts
//                   `onDbSuperseded`); nothing here is saved any more
//
// Each notice is shown twice:
//
// - a persistent indicator: the cockpit's input row, left of the clock
//   (src/ui/notice-indicator.ts), the phone's ESC menu status header and the
//   start page (src/chrome/start-surface.tsx: small pills at the top right
//   over the sky, the top row of an old-look frame), from `get()` /
//   `subscribe()`;
// - once, a `[SYSTEM]` line in the output and a UI pane line, on the bus of
//   the App `attach`ed (lines from before the App existed are replayed when
//   it attaches).
//
// Nothing here reloads the page: reloading disconnects from the game, so
// the user chooses when.

import type { Bus } from '../core/bus';
import type { UiMessage } from '../core/types';
import type { ReleaseInfo } from './update-check';
import { uiMsg, uiValue } from './ui-messages';

export interface NoticeState {
  /** The newer release the site serves, or null. */
  update: ReleaseInfo | null;
  /** A newer tab upgraded the database: changes are not saved. */
  storageSuperseded: boolean;
}

/** One indicator in a status row. */
export interface NoticeIndicator {
  key: 'update' | 'storage';
  text: string;
  /** Tooltip. */
  title: string;
}

interface NoticeLine {
  sys: string;
  ui: UiMessage;
}

export const STORAGE_NOTICE =
  'Storage upgraded by a newer version in another tab – changes here are no longer saved. Reload (F5).';

/** The indicators for `s`, update first. */
export function noticeIndicators(s: Readonly<NoticeState>, running: string): NoticeIndicator[] {
  const out: NoticeIndicator[] = [];
  if (s.update) {
    out.push({
      key: 'update',
      text: `Update: ${s.update.version}`,
      title:
        `WebCockpit ${s.update.version} is available (this tab runs ${running}). ` +
        'Reload (F5) when convenient – reloading disconnects from the game.',
    });
  }
  if (s.storageSuperseded) out.push({ key: 'storage', text: 'Storage: not saved', title: STORAGE_NOTICE });
  return out;
}

export class Notices {
  private state: Readonly<NoticeState> = Object.freeze({ update: null, storageSuperseded: false });
  private readonly listeners = new Set<(s: Readonly<NoticeState>) => void>();
  private readonly lines: NoticeLine[] = [];
  private readonly buses = new Set<Bus>();
  private readonly said = new Set<string>();

  get(): Readonly<NoticeState> {
    return this.state;
  }

  /** Calls `fn` after every change; returns the unsubscribe function. */
  subscribe(fn: (s: Readonly<NoticeState>) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** The site serves `r`, another release than this tab's. */
  newVersion(r: ReleaseInfo): void {
    const cur = this.state.update;
    if (cur?.version !== r.version || cur.commit !== r.commit) this.set({ update: { version: r.version, commit: r.commit } });
    const v = uiValue(r.version);
    this.say(`update ${r.version} ${r.commit}`, {
      sys: `WebCockpit ${r.version} is available – reload (F5) when you are somewhere safe.`,
      ui: uiMsg('warn', `WebCockpit {${v}} is available.`),
    });
  }

  /** A lazy chunk could not be loaded (a newer release replaced it). */
  chunkFailed(): void {
    this.say('chunk', {
      sys: 'A newer version of WebCockpit was published; this part of it could not be loaded. Reload (F5) to use it.',
      ui: uiMsg('error', 'A part of WebCockpit could not be loaded. Reload.'),
    });
  }

  /** The database was upgraded by a newer tab (src/core/db.ts). */
  storageSuperseded(): void {
    this.set({ storageSuperseded: true });
    this.say('storage', {
      sys: STORAGE_NOTICE,
      ui: uiMsg('error', 'Storage upgraded in another tab. Changes are not saved.'),
    });
  }

  /**
   * Sends the notice lines to `bus` (the cockpit App's): those said so far,
   * then every new one. Returns the detach function.
   */
  attach(bus: Bus): () => void {
    for (const l of this.lines) emit(bus, l);
    this.buses.add(bus);
    return () => this.buses.delete(bus);
  }

  private say(key: string, line: NoticeLine): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.lines.push(line);
    for (const bus of this.buses) emit(bus, line);
  }

  private set(patch: Partial<NoticeState>): void {
    const cur = this.state;
    if ((Object.keys(patch) as Array<keyof NoticeState>).every((k) => patch[k] === cur[k])) return;
    this.state = Object.freeze({ ...cur, ...patch });
    for (const fn of [...this.listeners]) fn(this.state);
  }
}

function emit(bus: Bus, l: NoticeLine): void {
  bus.emit('sys.message', { text: l.sys });
  bus.emit('ui.message', l.ui);
}
