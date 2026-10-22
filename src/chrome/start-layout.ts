// The start page main frame's rows (Inv §3.2), pure: shared by the frame
// (src/chrome/frames/start-main.tsx) and the first paint in index.html
// (src/boot/first-paint.ts, ADR 0083), which draws the banner where the
// frame will put it before the app has loaded.
//
// Top-anchored: blank, banner, blank, menu, flash row, quote, attribution;
// the footer on the last row. The banner is dropped when it does not fit
// with everything else (the menu always wins), the quote when the rows
// cannot hold it.

import { BANNER_H, bannerFits } from './banner-data';
import { wrapText } from './kit/nav';

/** Rows of the start page main menu (Enter MUME … About). */
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
