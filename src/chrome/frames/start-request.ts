// A page deep in the start page's stack asks the start menu to open one of
// its rows once it is the top again (stage 65 C3): the share dialog's "Open
// Community" pops the stack to the menu and asks for `community`; the menu
// (start-main.tsx) takes the request when it is the top frame, puts its
// cursor on the row and activates it, exactly as a press would. A row that
// is not there (the flag off) drops the request. Tiny and dependency free:
// the account pages' chunk and the chrome chunk both import it.

import type { StartRowKey } from './start-menu-model';

let pending: StartRowKey | null = null;

/** Asks the menu to open `key` when it is next the top frame (the last ask wins). */
export function requestStartRow(key: StartRowKey): void {
  pending = key;
}

/** The menu's: the row asked for, once (null: none). */
export function takeStartRow(): StartRowKey | null {
  const k = pending;
  pending = null;
  return k;
}
