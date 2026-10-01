// Hang guard (ADR 0051 "Package notes — P1"). One Lua call can block the
// page without the instruction budget firing (a C function that runs
// long, such as a pattern search the sandbox's guard does not catch).
// The player then closes or reloads the tab. On the next start the
// script that was running is turned off, with a UI message.
//
// The marker is one `localStorage` key holding the running script's name:
//
// - Calls (triggers, timers, events …): written when a call starts and
//   no marker for that script is up yet, and removed in a microtask, which
//   runs once the current task's code has returned. So a task that calls
//   Lua costs one `setItem` and one `removeItem`, however many calls it
//   makes, plus a write when another script's call starts (nested calls
//   restore the outer name). A call that never returns leaves the marker.
// - Loads (a script's main chunk and its sysLoadEvent): `pin` writes the
//   marker and yields a task before the load runs, so the write is out of
//   the page even in browsers that commit storage writes at the end of a
//   task (Firefox); the load's own end unpins it.
//
// A per-call clock check in the host (SLOW_CALL_MS) covers a call that
// does return after a long time, and the "Stop script" of a browser's
// slow-script dialog.

/** The `localStorage` key of the marker. */
export const HANG_KEY = 'wc.scripts.running';

export class HangGuard {
  private readonly storage: Storage | null;
  private current: string | null = null;
  private pinned: string | null = null;
  private queued = false;

  constructor(storage: Storage | null) {
    this.storage = storage;
  }

  /** Reads and removes a marker left by an earlier page: the script that hung, or null. */
  takeLeftover(): string | null {
    if (!this.storage) return null;
    try {
      const v = this.storage.getItem(HANG_KEY);
      if (v !== null) this.storage.removeItem(HANG_KEY);
      return v;
    } catch {
      return null;
    }
  }

  /** A call of `name` starts. Returns what `exit` needs. */
  enter(name: string): string | null {
    const prev = this.current;
    if (prev !== name) this.write(name);
    return prev;
  }

  /** The call that `enter` returned `prev` for has returned. */
  exit(prev: string | null): void {
    if (prev !== null && prev !== this.current) this.write(prev);
  }

  /** Marks a load of `name` and yields a task, so the mark is stored before the load runs. */
  async pin(name: string): Promise<void> {
    this.pinned = name;
    this.write(name);
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  /** The pinned load is over. */
  unpin(): void {
    this.pinned = null;
    this.clear();
  }

  private write(name: string): void {
    this.current = name;
    try {
      this.storage?.setItem(HANG_KEY, name);
    } catch {
      /* storage full or blocked: no guard */
    }
    if (!this.queued) {
      this.queued = true;
      queueMicrotask(this.clear);
    }
  }

  private readonly clear = (): void => {
    this.queued = false;
    if (this.pinned !== null) {
      if (this.current !== this.pinned) this.write(this.pinned);
      return;
    }
    if (this.current === null) return;
    this.current = null;
    try {
      this.storage?.removeItem(HANG_KEY);
    } catch {
      /* blocked */
    }
  };
}
