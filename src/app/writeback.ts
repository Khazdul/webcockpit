// Profile write-back (ADR 0015 "Live profile and write-back", amended by
// ADR 0038).
//
// Two sources write to the stored text of the loaded profile:
//
// - Typed settings (`typed`, ADR 0038): a definition or `#un…` the player
//   typed on the input line is written at once. Each one is its own job on
//   one promise chain, so they are saved in the order they were typed and
//   none can overwrite another.
// - Script variables (`queue`): when a script sets a variable, the value is
//   queued and written after a short delay (and on `pagehide` and on
//   disconnect). Only variables that have a top-level `#variable` entry
//   change (`setVariable`); everything else a script creates stays in the
//   session.
//
// Every job reads the latest stored text, edits the document model and
// saves when the text changed, so an edit made in the editor meanwhile is
// kept and untouched text stays byte for byte. Nothing is written until a
// profile has loaded completely (`target` is null before that: the "has
// loaded" guard, Inv §5.9).

import type { ProfileStore } from '../profiles';
import { checkBraces, parseProfile, serialize, setVariable } from '../script/doc';
import { type TypedChange, escapeVars } from '../script/engine';
import { applyTypedChange } from '../script/persist';

export const WRITE_BACK_DELAY_MS = 1000;

export interface WriteBackOptions {
  delayMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  /** A save failed (storage error). */
  onError?: (message: string) => void;
  /** A typed setting could not be written to the text; nothing was changed for it. */
  onRefused?: (message: string) => void;
}

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export class ProfileWriteBack {
  private targetName: string | null = null;
  private pending = new Map<string, string>();
  private timer: unknown = null;
  private chain: Promise<void> = Promise.resolve();
  /** Jobs on the chain that have not finished. */
  private jobs = 0;
  private readonly delayMs: number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;

  private readonly store: ProfileStore;
  private readonly opts: WriteBackOptions;

  constructor(store: ProfileStore, opts: WriteBackOptions = {}) {
    this.store = store;
    this.opts = opts;
    this.delayMs = opts.delayMs ?? WRITE_BACK_DELAY_MS;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** The profile that is written to (null: none loaded, nothing is written). */
  get target(): string | null {
    return this.targetName;
  }

  /** Something is queued or being written: the stored text is not final yet. */
  get busy(): boolean {
    return this.jobs > 0 || this.pending.size > 0;
  }

  /** Switches the target profile; values queued for the old one are flushed first. */
  setTarget(name: string | null): Promise<void> {
    const done = this.flush();
    this.targetName = name;
    return done;
  }

  /** Queues `name = value`, set by a script, for the target profile. */
  queue(name: string, value: string): void {
    if (this.targetName === null) return;
    this.pending.set(name, value);
    if (this.timer === null) {
      this.timer = this.setTimer(() => {
        this.timer = null;
        void this.flush();
      }, this.delayMs);
    }
  }

  /**
   * Writes a typed setting to the target profile now. False when there is
   * no target (the change stays in the session).
   */
  typed(change: TypedChange): boolean {
    const name = this.targetName;
    if (name === null) return false;
    // What was typed is newer than a value a script queued for the name.
    if (change.kind === 'variable') {
      for (const k of change.op === 'define' ? [change.key] : change.keys) this.pending.delete(k);
    }
    this.run(() => this.writeTyped(name, change));
    return true;
  }

  /** Drops script values that are queued (the engine was reloaded from the text). */
  discard(): void {
    this.pending.clear();
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  /** Writes what is queued now. Resolves when every save so far is done. */
  flush(): Promise<void> {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    if (this.pending.size === 0 || this.targetName === null) {
      this.pending.clear();
      return this.chain;
    }
    const name = this.targetName;
    const values = this.pending;
    this.pending = new Map();
    return this.run(() => this.writeValues(name, values));
  }

  private run(job: () => Promise<void>): Promise<void> {
    this.jobs++;
    this.chain = this.chain.then(job).finally(() => {
      this.jobs--;
    });
    return this.chain;
  }

  private async writeValues(name: string, values: Map<string, string>): Promise<void> {
    try {
      const rec = await this.store.get(name);
      if (!rec) return;
      let doc = parseProfile(rec.text);
      for (const [k, v] of values) doc = setVariable(doc, k, escapeVars(v));
      const text = serialize(doc);
      if (text !== rec.text) await this.store.save(name, text);
    } catch (err) {
      this.opts.onError?.(`Could not save variables to profile ${name}: ${errText(err)}`);
    }
  }

  private async writeTyped(name: string, change: TypedChange): Promise<void> {
    try {
      const rec = await this.store.get(name);
      if (!rec) {
        this.opts.onRefused?.(`Not saved: profile ${name} no longer exists.`);
        return;
      }
      // The node structure of a text with unbalanced braces cannot be trusted.
      if (!checkBraces(rec.text).ok) {
        this.opts.onRefused?.(`Not saved: profile ${name} has unbalanced braces. Fix it in the editor.`);
        return;
      }
      const r = applyTypedChange(parseProfile(rec.text), change);
      if (r.problem !== null) this.opts.onRefused?.(`Not saved to profile ${name}: ${r.problem}`);
      const text = serialize(r.doc);
      if (text === rec.text) return;
      if (!checkBraces(text).ok) {
        this.opts.onRefused?.(`Not saved to profile ${name}: the text would get unbalanced braces.`);
        return;
      }
      await this.store.save(name, text);
    } catch (err) {
      this.opts.onError?.(`Could not save to profile ${name}: ${errText(err)}`);
    }
  }
}
