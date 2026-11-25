// The `stat` / `info` reconcile (Inv §2.6.5, §2.6.6). After a header line
//
//   Affected by:                                          (stat)
//   You are subjected to the following temporary effects: (info)
//
// every `- <name>` line is collected until the first line that does not
// start with `- ` (in practice the empty line or the prompt). Then the
// affects tracker gets the plain names and the stored-spells tracker the
// `stored spell <x>` ones. The block is the truth at that moment.
//
// The info poll's `%f` (stage 77 H9, ADR 0166 addendum 31) is the same
// list, hidden from the lines: `apply(names, { poll: true })`. Its stored
// spells are reconciled only when it lists one: that `%f` lists them as
// `stat` does is not measured, and a poll that does not would otherwise
// forget every stored spell each time it answers.
//
// The GMCP flags' forms (stage 77, ADR 0166 addendum 36): every whole
// list also goes to `onList` with its wound lines (`… wound at …`) and
// whether it has a `poison …` line, so GameState can clear your own
// `wound` / `poison` flag that MUME left on (it never sends `wound: false`
// after a death). Whether a list may clear is GameState's call (`poll`).

import type { AffectsTracker } from './affects';
import type { LineRouter } from './lines';
import type { StoredTracker } from './stored';
import { isPoisonForm, isWoundForm } from './data/affects';

/** What a whole list says of the GMCP flags' forms (`StatReconcile` → `onList`). */
export interface FlagLines {
  /** The `… wound at …` lines, as listed (none: no wound). */
  wounds: string[];
  /** A `poison …` line is listed. */
  poison: boolean;
  /** The list is the info poll's `%f` (not the player's own `stat` / `info`). */
  poll: boolean;
}

export const RECONCILE_HEADERS: readonly string[] = [
  'Affected by:',
  'You are subjected to the following temporary effects:',
];
const ITEM = '- ';
const STORED = 'stored spell ';

export class StatReconcile {
  private collecting = false;
  private names: string[] = [];
  private readonly affects: AffectsTracker;
  private readonly stored: StoredTracker;
  private readonly now: () => number;
  private readonly onList: ((l: FlagLines) => void) | null;

  constructor(affects: AffectsTracker, stored: StoredTracker, now: () => number, onList?: (l: FlagLines) => void) {
    this.affects = affects;
    this.stored = stored;
    this.now = now;
    this.onList = onList ?? null;
  }

  route(router: LineRouter): void {
    // The watcher sees every line first: it ends a block on the first
    // non-item line (which is then routed as usual, and may be a header).
    router.watch((text) => {
      if (!this.collecting) return;
      if (text.startsWith(ITEM)) this.names.push(text.slice(ITEM.length).trim());
      else this.finish();
    });
    for (const h of RECONCILE_HEADERS) {
      router.onLine(h, () => {
        this.collecting = true;
        this.names = [];
      });
    }
  }

  private finish(): void {
    this.collecting = false;
    const names = this.names;
    this.names = [];
    this.apply(names);
  }

  /** A whole list of `- <name>` items (without the `- `), the truth now. */
  apply(names: readonly string[], o: { poll?: boolean } = {}): void {
    const affects: string[] = [];
    const stored: string[] = [];
    for (const n of names) {
      if (n.toLowerCase().startsWith(STORED)) stored.push(n.slice(STORED.length).trim());
      else affects.push(n);
    }
    const now = this.now();
    this.affects.reconcile(affects, now);
    if (!o.poll || stored.length > 0) this.stored.reconcile(stored);
    if (this.onList) {
      this.onList({ wounds: affects.filter(isWoundForm), poison: affects.some(isPoisonForm), poll: o.poll === true });
    }
  }

  /** Forgets a block in progress (new connection). */
  reset(): void {
    this.collecting = false;
    this.names = [];
  }
}
