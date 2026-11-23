// What a phone tells MUME about its window, and what the game text really is.
//
// A phone or tablet reports at least 80 columns and 40 rows (NAWS,
// `phoneNawsCols` / `phoneNawsRows`), and the telnet layer sends NAWS only
// when the reported size changes. So a layout that only changes the game
// text's rows while they stay under 40 sends MUME nothing. The log keeps
// the three apart:
//
// - `grids`: the game text's own cells (the output pane's measured grid)
//   each time a size goes to the session, one per layout that reaches it;
// - `told`: the size handed to the session (what becomes NAWS);
// - `naws`: the NAWS messages the telnet layer really sends. The offline
//   cockpit and the mocks never negotiate NAWS, so the watch turns it on
//   and catches the messages instead of writing them.
import type { Page } from '@playwright/test';

/** Least columns and rows a phone reports to MUME. */
export const NAWS_MIN_COLS = 80;
export const NAWS_MIN_ROWS = 40;

export interface SizeLog {
  /** The size MUME had been told when the watch began (`CxR`, or '' for none). */
  start: string;
  grids: string[];
  told: string[];
  naws: string[];
}

const OPT_NAWS = 31;

/** `CxR` as numbers. */
export const parse = (s: string): { cols: number; rows: number } => {
  const [c, r] = s.split('x').map(Number);
  return { cols: c!, rows: r! };
};

/** The size a phone reports for a game text of `grid`. */
export const reported = (grid: string): string => {
  const g = parse(grid);
  return `${Math.max(NAWS_MIN_COLS, g.cols)}x${Math.max(NAWS_MIN_ROWS, g.rows)}`;
};

/** The NAWS the telnet layer sends for `told` after `start`: one per change of the size. */
export function nawsFor(log: SizeLog): string[] {
  const out: string[] = [];
  let last = log.start;
  for (const t of log.told) {
    if (t !== last) out.push(t);
    last = t;
  }
  return out;
}

/** The game text's grid now (`CxR`). */
export const gridNow = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const m = window.__wc!.app.output.measureCells();
    return `${m.cols}x${m.rows}`;
  });

/**
 * Watches the sizes from now on. `log()` reads the log, `take()` reads it
 * and starts a new one (its `start` the size told last).
 */
export async function watchNaws(page: Page): Promise<{ log(): Promise<SizeLog>; take(): Promise<SizeLog> }> {
  await page.evaluate((opt) => {
    type T = {
      us: Uint8Array;
      cols: number;
      rows: number;
      nawsSentCols: number;
      nawsSentRows: number;
      sendSb(o: number, p: Uint8Array): void;
      windowSize: { cols: number; rows: number } | null;
    };
    const w = window as unknown as { __sizeLog: { start: string; grids: string[]; told: string[]; naws: string[] } };
    const s = window.__wc!.app.session;
    const t = s.telnet as unknown as T;
    const ws = t.windowSize;
    w.__sizeLog = { start: ws ? `${ws.cols}x${ws.rows}` : '', grids: [], told: [], naws: [] };
    // NAWS on, as MUME negotiates it, with the size told so far counted as sent.
    t.us[opt] = 1;
    t.nawsSentCols = t.cols;
    t.nawsSentRows = t.rows;
    const sb = t.sendSb.bind(t);
    t.sendSb = (o: number, p: Uint8Array) => {
      if (o === opt) w.__sizeLog.naws.push(`${(p[0]! << 8) | p[1]!}x${(p[2]! << 8) | p[3]!}`);
      else sb(o, p);
    };
    const set = s.setWindowSize.bind(s);
    s.setWindowSize = (cols: number, rows: number) => {
      const m = window.__wc!.app.output.measureCells();
      w.__sizeLog.grids.push(`${m.cols}x${m.rows}`);
      w.__sizeLog.told.push(`${cols}x${rows}`);
      set(cols, rows);
    };
  }, OPT_NAWS);
  const read = (reset: boolean): Promise<SizeLog> =>
    page.evaluate((reset) => {
      const w = window as unknown as { __sizeLog: SizeLog };
      const out = { ...w.__sizeLog, grids: [...w.__sizeLog.grids], told: [...w.__sizeLog.told], naws: [...w.__sizeLog.naws] };
      if (reset) w.__sizeLog = { start: out.told.at(-1) ?? out.start, grids: [], told: [], naws: [] };
      return out;
    }, reset);
  return { log: () => read(false), take: () => read(true) };
}
