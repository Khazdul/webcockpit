// The start menu's model (stage 67, ADR 0149 and its addendum): which
// rows the menu has, in what order and with which shortcut letters, and
// what the owner row says. Pure: no Preact, no DOM, no storage, so the
// unit tests can hold every form and every state, and the kit gallery can
// draw the states that have no source yet.
//
// The menu (direction A of the mockups of round 8):
//
//   play         Enter MUME                       E
//   ──◆──
//   mine         the owner row (flag `accounts`)  U (not shown)
//                Profile (<the profile>)          P
//                Scripts                          S
//                History                          H
//   ──◆──        (only when Community is there: it parts the two zones)
//   everybody's  Community  3 new (flag `gallery`) C
//                About, the panel's last quiet row A
//
// Three forms by the flags: none (production today), `accounts`, and
// `accounts` with `gallery`. The letters L and the old C (Spotlights,
// Credits) are gone; C is Community's, and with no Community it does
// nothing.

/** A row's key: its `data-key` and the menu cursor's identity. */
export type StartRowKey = 'enter' | 'owner' | 'profile' | 'scripts' | 'history' | 'community' | 'about';

export type StartEntry = { kind: 'row'; key: StartRowKey; letter: string } | { kind: 'rule' };

export interface StartMenuInput {
  /** The owner row is shown (the flag `accounts` is on and the row has come in). */
  owner: boolean;
  /** The Scripts row (the shell always has the script library; some tests mount the page without it). */
  scripts: boolean;
  /** Community is shown (the flag `gallery`, stage 65); null: not shown. */
  community: { count: number } | null;
}

/** The shortcut letters, by row. The owner row's U is not marked in its text (it holds no u). */
export const START_LETTERS: Readonly<Record<StartRowKey, string>> = {
  enter: 'e',
  owner: 'u',
  profile: 'p',
  scripts: 's',
  history: 'h',
  community: 'c',
  about: 'a',
};

const row = (key: StartRowKey): StartEntry => ({ kind: 'row', key, letter: START_LETTERS[key] });

/** The menu's entries, rules included, top to bottom. */
export function startMenu(input: StartMenuInput): StartEntry[] {
  const out: StartEntry[] = [row('enter'), { kind: 'rule' }];
  if (input.owner) out.push(row('owner'));
  out.push(row('profile'));
  if (input.scripts) out.push(row('scripts'));
  out.push(row('history'));
  // The second rule parts "mine" from "everybody's": without Community there is nothing to part.
  if (input.community) out.push({ kind: 'rule' }, row('community'));
  out.push(row('about'));
  return out;
}

/** Only the rows, in order (the cursor walks these). */
export function startRows(input: StartMenuInput): Extract<StartEntry, { kind: 'row' }>[] {
  return startMenu(input).filter((e): e is Extract<StartEntry, { kind: 'row' }> => e.kind === 'row');
}

/** The counters' cap (`NEWS_MAX`, `COUNTER_RUNS` of the contract): from it on, "99+ new" (round 13's pick 5). */
export const COUNT_CAP = 99;

/** The Community row's counter (and the owner row's mark): "3 new", "99+ new" from the cap on, or nothing when there is no news. */
export function communityCount(count: number): string | null {
  if (!Number.isFinite(count) || count < 1) return null;
  return count >= COUNT_CAP ? `${COUNT_CAP}+ new` : `${Math.floor(count)} new`;
}

// ------------------------------------------------------------ the owner row

/**
 * The account's sync as the owner row says it (ADR 0146 and its
 * addendum; the engine's `SyncState`, stage 61). Without a sync (the flag
 * `sync` off) the start page passes none, and the row says the name alone.
 * `full` and `update` are "needs attention".
 */
export type OwnerSync = 'synced' | 'syncing' | 'offline' | 'full' | 'update';

export interface OwnerInput {
  /** The account logged in on this device (`AccountState.name`); null: nobody. */
  name: string | null;
  /** The sync's state while somebody is logged in; null or absent: no sync yet (before stage 61). */
  sync?: OwnerSync | null;
  /** Nobody is logged in, but this account's copy is kept here, locked (ADR 0146 addendum); its name. */
  locked?: string | null;
  /** New reactions to the account's published runs (stage 65). */
  news?: number;
}

/** The mark in the left margin. */
export type OwnerMark = 'key' | 'lock' | 'dot' | 'pulse' | 'ring' | 'diamond' | null;

export type OwnerKind = 'guest' | 'name' | 'synced' | 'syncing' | 'offline' | 'attention' | 'locked';

export interface OwnerView {
  kind: OwnerKind;
  /** In small capitals; gives way with an ellipsis. */
  name: string;
  /** In italic after a middle dot; never cut. null: the name alone. */
  state: string | null;
  /** The state is what a press does ("log in"): underlined. */
  stateIsAction: boolean;
  /** The reactions mark ("2 new"), in gold; never cut. */
  news: string | null;
  mark: OwnerMark;
  /** What a press opens. */
  opens: 'login' | 'account';
  /** The row's whole text for a screen reader (the shown text is split and partly hidden). */
  label: string;
}

const SYNC: Record<OwnerSync, { kind: OwnerKind; state: string; mark: OwnerMark }> = {
  synced: { kind: 'synced', state: 'synced', mark: 'dot' },
  syncing: { kind: 'syncing', state: 'syncing', mark: 'pulse' },
  offline: { kind: 'offline', state: 'offline', mark: 'ring' },
  full: { kind: 'attention', state: 'storage full', mark: 'diamond' },
  update: { kind: 'attention', state: 'update the client', mark: 'diamond' },
};

/** What the owner row shows for the account's state. */
export function ownerRow(input: OwnerInput): OwnerView {
  const finish = (v: Omit<OwnerView, 'label'>): OwnerView => ({
    ...v,
    label: [v.name, v.state, v.news].filter((s): s is string => !!s).join(' · '),
  });
  if (input.name === null) {
    if (input.locked) {
      return finish({ kind: 'locked', name: input.locked, state: 'logged out here', stateIsAction: false, news: null, mark: 'lock', opens: 'login' });
    }
    return finish({ kind: 'guest', name: 'Guest', state: 'log in', stateIsAction: true, news: null, mark: 'key', opens: 'login' });
  }
  const news = communityCount(input.news ?? 0);
  const sync = input.sync ? SYNC[input.sync] : null;
  if (!sync) return finish({ kind: 'name', name: input.name, state: null, stateIsAction: false, news, mark: null, opens: 'account' });
  return finish({ kind: sync.kind, name: input.name, state: sync.state, stateIsAction: false, news, mark: sync.mark, opens: 'account' });
}
