// Live errors that do not flicker while you type (stage 10 feedback round
// 4). A syntax or header error that is most likely the code being typed
// is held back while the user is typing, the way a language server's
// squiggles feel in VS Code; any other error shows after the normal check
// delay. Pure (timers only); unit tested with fake timers. lua-lint.ts
// filters each check's diagnostics through `HoldBack`.
//
// Held (`holdReason`):
// - *unfinished*: a syntax error at the end of the script (`near <eof>`:
//   `'end' expected …`, `<name> expected`, an unfinished long string or
//   comment). The code is not finished yet wherever the cursor is.
// - *cursor*: an error on the cursor's line; an error whose opener is on
//   the cursor's line (`')' expected (to close '(' at line 6)`); an error
//   on the next line of code after the cursor's (blank and comment lines
//   between): Lua reads on until a token does not fit, so `if x` + Enter
//   or a lone `function` above other code reports there.
// Released: when the cursor leaves the line (cursor holds only), after
// HOLD_IDLE_MS without an edit, or on save. Once shown, an error stays
// shown until the check no longer reports it (it is fixed), even while
// typing on its line. Runtime errors are never held.

import type { ScriptDiagnostic } from './lua-diagnostics';

/** Idle time after the last edit before held errors show. */
export const HOLD_IDLE_MS = 1500;

export type HoldReason = 'unfinished' | 'cursor' | null;

export interface Cursor {
  /** 1-based line. */
  line: number;
  /** 0-based column. */
  col: number;
}

/** Why `d` is held back while the user types at `cursor` in `lines`, or null (show it). */
export function holdReason(d: ScriptDiagnostic, cursor: Cursor, lines: readonly string[]): HoldReason {
  if (d.source === 'runtime') return null;
  if (d.source === 'syntax' && /near '?<eof>'?$/.test(d.message)) return 'unfinished';
  if (d.line === cursor.line) return 'cursor';
  const opener = /\bat line (\d+)\)/.exec(d.message);
  if (opener && Number(opener[1]) === cursor.line) return 'cursor';
  // The next line of code after the cursor's: Lua reads on until a token does not fit
  // (`if x` + Enter, `function` above `tempAlias("x", …)` reports in that line).
  if (d.line > cursor.line && lines.slice(cursor.line, d.line - 1).every((l) => l.replace(/--.*$/, '').trim() === '')) {
    return 'cursor';
  }
  return null;
}

/** A diagnostic's identity across edits: its line numbers move, its message's too. */
const keyOf = (d: ScriptDiagnostic): string => `${d.source}\0${d.message.replace(/\bline \d+/g, 'line #')}`;

/**
 * The hold-back state of one buffer: typing or idle, and what is shown.
 * `onIdle` runs when the idle time is over (re-filter and show).
 */
export class HoldBack {
  private idle = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private shown = new Set<string>();

  constructor(
    private readonly onIdle: () => void,
    private readonly idleMs = HOLD_IDLE_MS,
  ) {}

  /** True while the user is typing (an edit less than the idle time ago). */
  get typing(): boolean {
    return !this.idle;
  }

  /** The buffer was edited: hold until the idle time is over. */
  edited(): void {
    this.idle = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.idle = true;
      this.onIdle();
    }, this.idleMs);
  }

  /** Show everything now (a save). */
  reveal(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.idle = true;
  }

  /** The diagnostics to show of `ds` (a check of `lines`), the cursor at `cursor`. */
  filter(ds: readonly ScriptDiagnostic[], cursor: Cursor, lines: readonly string[]): ScriptDiagnostic[] {
    const out = ds.filter((d) => this.idle || this.shown.has(keyOf(d)) || holdReason(d, cursor, lines) === null);
    this.shown = new Set(out.map(keyOf));
    return out;
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
