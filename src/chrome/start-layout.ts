// The start page's pure layout and text helpers.
//
// `almanacLines`: the almanac's text at the bottom right (stage 41,
// ADR 0125).
//
// `startLayout`: the old cell-grid start page's rows (Inv §3.2). Since
// stage 41 the start page is free DOM over the sky (ADR 0125) and no
// longer uses it; only the first paint in index.html
// (src/boot/first-paint.ts, ADR 0083) still does, to place the pixel
// banner and the loading bar, until its redesign (stage 41d) retires it.
// Top-anchored: blank, banner, blank, menu, flash row, quote,
// attribution; the footer on the last row. The banner is dropped when it
// does not fit with everything else (the menu always wins), the quote
// when the rows cannot hold it.

import type { GameTimeInfo } from '../gmcp/gametime';
import { BANNER_H, bannerFits } from './banner-data';
import { wrapText } from './kit/nav';

/** `1st`, `2nd`, `3rd`, `4th`, … `11th`, `12th`, `13th`, `21st`. */
export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return n + (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
}

/**
 * The almanac (owner, 2026-11-07): "Mersday, the 29th of Afterlithe" and
 * "1:05pm · day · T.A. 3038" (no moon text). The version line is the
 * caller's.
 */
export function almanacLines(t: Pick<GameTimeInfo, 'weekday' | 'day' | 'monthName' | 'hour' | 'minute' | 'period' | 'year'>): {
  date: string;
  time: string;
} {
  const h12 = t.hour % 12 || 12;
  const mm = String(t.minute).padStart(2, '0');
  return {
    date: `${t.weekday}, the ${ordinal(t.day)} of ${t.monthName}`,
    time: `${h12}:${mm}${t.hour < 12 ? 'am' : 'pm'} · ${t.period} · T.A. ${t.year}`,
  };
}

/**
 * Rows of the start page main menu: Enter MUME, Profile, Scripts, History,
 * Spotlights, Credits, About (src/chrome/frames/start-main.tsx). The first
 * paint places its loading bar by it.
 */
export const START_MENU_ROWS = 7;

export interface StartLayout {
  /** The quote, wrapped (with its quotation marks). */
  quoteLines: string[];
  showQuote: boolean;
  showBanner: boolean;
  /** The first menu row (0-based): below the banner and a blank row, or below one blank row. */
  menuRow: number;
  /** Rows used above the footer and its filler. */
  used: number;
}

/** The main frame's layout on a `cols` × `rows` grid with `menuRows` menu items. */
export function startLayout(cols: number, rows: number, quote: string, menuRows: number = START_MENU_ROWS): StartLayout {
  const quoteLines = wrapText(`"${quote}"`, Math.min(cols - 4, 72));
  // blank, menu, flash row, quote, attribution, footer.
  const withQuote = 1 + menuRows + 1 + quoteLines.length + 1 + 1;
  const showQuote = rows >= withQuote;
  const reserved = showQuote ? withQuote - 1 : menuRows + 2;
  const showBanner = bannerFits(rows, reserved, cols);
  const menuRow = showBanner ? BANNER_H + 2 : 1;
  const used = menuRow + menuRows + 1 + (showQuote ? quoteLines.length + 1 : 0);
  return { quoteLines, showQuote, showBanner, menuRow, used };
}
