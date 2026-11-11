// The model of the phone's own keyboard (ADR 0138 §4; stage 53b). Pure: no
// DOM. The view is keyboard.ts.
//
// Rows (letters page, Swedish; English has ten letters per row and no å ä ö):
//
//   [1][2][3][4][5][6][7][8][9][0]([↑][↓])        the digit row, folded up or down
//   [q][w][e][r][t][y][u][i][o][p][å]
//   [a][s][d][f][g][h][j][k][l][ö][ä]
//   [ shift ][z][x][c][v][b][n][m][ back ]
//   [fold][sym][123][;][ space ][.]([↑][↓])[Enter]
//
// - Layout: `sv` or `en`, by the browser's language unless one is named
//   (`okbLayout`). The layout is an input everywhere here: the setting of
//   round 53d only has to pass it in.
// - The digit row folds up and down with the `123` key (the caller keeps the
//   state). It also carries history ↑ and ↓ when its twelve keys would be at
//   least `OKB_ARROW_MIN_PX` wide; on a narrower block the arrows stand on
//   the bottom row instead, where they are there whether the digit row is
//   up or not (`okbArrowsOnDigitRow`).
// - Symbols are a second page of the same rows. The characters are one list
//   in order of use (`OKB_SYMBOLS`): the third row (seven keys, nearest the
//   thumbs) takes the first, then the second row, then the first row. With
//   the digit row folded away the page's first row shows the digits (and
//   the arrows, as the digit row would), so the page is usable on its own
//   and the block never changes height with the page. What does not fit is
//   on a further page, reached with the key in shift's place (`1/2`). `.`
//   and `;` keep their keys on the bottom row.
// - Shift: one tap gives one capital, a second tap within
//   `OKB_SHIFT_DOUBLE_MS` locks until the next tap. A single shift is used up
//   by the next character typed, of any kind (a letter, a digit, a symbol,
//   a space) and by Enter; never by backspace. A lock survives all of them.
// - Sizes come from the screen: a key's width is the block's width shared
//   by the row's keys, with a cap per key (a tablet or a landscape screen
//   gets no huge keys); the rows' height is a share of the screen's height
//   within limits.
// - Landscape (`okbBand`; the owner after 53a): the block is compressed
//   towards the middle, with the hot keys K1 to K3 in a column left of it,
//   K4 to K6 right of it and the compass at the far right, all in the
//   keyboard's band. Too narrow for that, the parts give way in a fixed
//   order.
// - Portrait (`okbPortraitSide`): the compass and the hot key columns keep
//   their places from the keyboard's top edge up; on a screen too low for
//   them the columns go first, then the compass.

export type OkbLayout = 'sv' | 'en';
export type OkbPage = 'letters' | 'symbols';
/** A special key. `alt`: the next page of symbols, in shift's place. `older` / `newer`: the history's arrows. */
export type OkbAct = 'shift' | 'back' | 'fold' | 'sym' | 'alt' | 'digits' | 'space' | 'enter' | 'older' | 'newer';

export interface OkbKey {
  /** A character key's character (lower case for a letter). */
  ch?: string;
  act?: OkbAct;
  /** The key's name (its `aria-label`). */
  label: string;
  /** The key's width as a weight within its row. */
  w: number;
  /** A letter: shift makes it a capital. */
  letter?: boolean;
}

export interface OkbRow {
  kind: 'digits' | 'chars' | 'bottom';
  keys: OkbKey[];
  /**
   * What the row's width is shared by: the keys' weights, or more when the
   * row stands in from both edges (English `a` to `l`: nine keys in ten).
   */
  units: number;
}

/** The letter rows. */
export const OKB_LETTERS: Readonly<Record<OkbLayout, readonly [string, string, string]>> = {
  sv: ['qwertyuiopå', 'asdfghjklöä', 'zxcvbnm'],
  en: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
};
export const OKB_DIGITS = '1234567890';
/**
 * The symbols in order of use (a first proposal; the owner tunes it): the
 * first seven stand on the third row, then the second row, then the first.
 * `.` and `;` are on the bottom row of every page.
 */
export const OKB_SYMBOLS = '\'",-!?:#@$%&*()/_\\{}[]+=<>~^|';
/** Character keys of the third row, between shift and backspace. */
export const OKB_THIRD_ROW_KEYS = 7;

/** A double tap on shift: the second tap within this locks, ms. */
export const OKB_SHIFT_DOUBLE_MS = 350;
/** Backspace held: the first repeat, then every repeat, ms. */
export const OKB_REPEAT_DELAY_MS = 400;
export const OKB_REPEAT_MS = 60;

/** The block's padding above and below its rows, and at its sides, px. */
export const OKB_PAD_Y = 2;
export const OKB_PAD_X = 2;
/** The widest a letter key gets, px: portrait (and a tablet), landscape. */
export const OKB_UNIT_MAX = 48;
export const OKB_UNIT_MAX_LAND = 46;
/** Landscape: the narrowest a letter key gets before the hot key columns, and then the compass, give way. */
export const OKB_UNIT_MIN_LAND = 36;
/** The arrows stand on the digit row when its twelve keys are at least this wide, px. */
export const OKB_ARROW_MIN_PX = 30;
/** A row's height, px: portrait's limits and share of the screen's height (for four rows); landscape's. */
export const OKB_ROW_MAX = 46;
export const OKB_ROW_MIN = 38;
export const OKB_ROW_SHARE = 0.3;
export const OKB_ROW_MAX_LAND = 36;
export const OKB_ROW_MIN_LAND = 30;
export const OKB_ROW_SHARE_LAND = 0.46;
/** Rows squeezed under this (the allocator had no room for the block) are no keyboard: it closes. */
export const OKB_ROW_LEAST = 24;
/** Landscape: between the block, a hot key column and the compass, and the compass's margin to the edge, px. */
export const OKB_BAND_GAP = 8;
export const OKB_BAND_MARGIN = 8;
/** Portrait: what stays above the compass, or above the hot key columns, for them to be shown, px. */
export const OKB_SIDE_TOP_MIN = 48;

const NAMES: Readonly<Record<string, string>> = {
  ';': 'Semicolon',
  '.': 'Period',
  "'": 'Apostrophe',
  '"': 'Quote',
  ',': 'Comma',
  '-': 'Hyphen',
  '_': 'Underscore',
  '!': 'Exclamation mark',
  '?': 'Question mark',
  ':': 'Colon',
  '/': 'Slash',
  '\\': 'Backslash',
  '#': 'Hash',
  '@': 'At',
  $: 'Dollar',
  '%': 'Percent',
  '&': 'Ampersand',
  '*': 'Asterisk',
  '(': 'Left parenthesis',
  ')': 'Right parenthesis',
  '{': 'Left brace',
  '}': 'Right brace',
  '[': 'Left bracket',
  ']': 'Right bracket',
  '+': 'Plus',
  '=': 'Equals',
  '<': 'Less than',
  '>': 'Greater than',
  '~': 'Tilde',
  '^': 'Caret',
  '|': 'Bar',
};

const chars = (s: string, letter = false): OkbKey[] => [...s].map((ch) => ({ ch, label: NAMES[ch] ?? ch, w: 1, ...(letter ? { letter: true } : {}) }));
const act = (a: OkbAct, label: string, w: number): OkbKey => ({ act: a, label, w });
const weight = (keys: readonly OkbKey[]): number => keys.reduce((n, k) => n + k.w, 0);

// ------------------------------------------------------------------ layout

/**
 * The layout from what was asked for and the browser's languages: a named
 * layout wins; else Swedish for a browser in Swedish (its first language),
 * English for every other.
 */
export function okbLayout(asked: string | null | undefined, languages: readonly string[] | string | null | undefined): OkbLayout {
  if (asked === 'sv' || asked === 'en') return asked;
  const first = typeof languages === 'string' ? languages : (languages?.[0] ?? '');
  return /^sv\b/i.test(first) ? 'sv' : 'en';
}

/**
 * The `?kbd=` gate of stage 53 (it goes when the stage is released): `1`
 * turns the keyboard on with the layout of the browser's language, `sv` or
 * `en` with that layout. Anything else: off (null).
 */
export function okbFromQuery(kbd: string | null | undefined): { layout: OkbLayout | null } | null {
  if (kbd === '1') return { layout: null };
  if (kbd === 'sv' || kbd === 'en') return { layout: kbd };
  return null;
}

/** Letter keys per row: what a key's width is a share of. */
export function okbCols(layout: OkbLayout): number {
  return OKB_LETTERS[layout][0].length;
}

// -------------------------------------------------------------------- rows

/** How many pages the symbols take: with the digit row folded away the first row is the digits'. */
export function okbSymbolPages(layout: OkbLayout, digits: boolean): number {
  return Math.ceil(OKB_SYMBOLS.length / symbolsPerPage(layout, digits));
}

function symbolsPerPage(layout: OkbLayout, digits: boolean): number {
  return OKB_THIRD_ROW_KEYS + okbCols(layout) * (digits ? 2 : 1);
}

export interface OkbRowsInput {
  layout: OkbLayout;
  page: OkbPage;
  /** Which page of symbols (0 first); beyond the last it is the last. */
  symbolPage?: number;
  /** The digit row is shown. */
  digits: boolean;
  /** The arrows stand on the digit row (`okbArrowsOnDigitRow`); else on the bottom row. */
  arrowsOnDigitRow: boolean;
}

const UP = (): OkbKey => act('older', 'History up', 1);
const DOWN = (): OkbKey => act('newer', 'History down', 1);

function digitRow(arrows: boolean): OkbRow {
  const keys = [...chars(OKB_DIGITS), ...(arrows ? [UP(), DOWN()] : [])];
  return { kind: 'digits', keys, units: weight(keys) };
}

/**
 * The rows on screen, top to bottom: the digit row when it is shown, three
 * rows of characters and the bottom row. The same number of rows on every
 * page.
 */
export function okbRows(input: OkbRowsInput): OkbRow[] {
  const { layout, digits, arrowsOnDigitRow } = input;
  const cols = okbCols(layout);
  // Shift and backspace share what the third row's seven keys leave.
  const side = (cols - OKB_THIRD_ROW_KEYS) / 2;
  const rows: OkbRow[] = [];
  if (digits) rows.push(digitRow(arrowsOnDigitRow));
  const back = act('back', 'Backspace', side);
  if (input.page === 'letters') {
    const [a, b, c] = OKB_LETTERS[layout];
    rows.push({ kind: 'chars', keys: chars(a, true), units: cols });
    rows.push({ kind: 'chars', keys: chars(b, true), units: cols });
    rows.push({ kind: 'chars', keys: [act('shift', 'Shift', side), ...chars(c, true), back], units: cols });
  } else {
    const per = symbolsPerPage(layout, digits);
    const pages = okbSymbolPages(layout, digits);
    const at = Math.max(0, Math.min(pages - 1, Math.floor(input.symbolPage ?? 0)));
    const list = [...OKB_SYMBOLS].slice(at * per, (at + 1) * per).join('');
    const third = list.slice(0, OKB_THIRD_ROW_KEYS);
    const second = list.slice(OKB_THIRD_ROW_KEYS, OKB_THIRD_ROW_KEYS + cols);
    const first = list.slice(OKB_THIRD_ROW_KEYS + cols);
    // The digit row folded away: the digits are the page's first row, as the digit row would be.
    rows.push(digits ? { kind: 'chars', keys: chars(first), units: cols } : digitRow(arrowsOnDigitRow));
    rows.push({ kind: 'chars', keys: chars(second), units: cols });
    // In shift's place: the next page of symbols, or nothing where one page holds them all.
    const alt = pages > 1 ? act('alt', `Symbols ${at + 1} of ${pages}`, side) : { label: '', w: side };
    // A short last page keeps its keys' places: the row is filled out.
    const fill = OKB_THIRD_ROW_KEYS - [...third].length;
    rows.push({ kind: 'chars', keys: [alt, ...chars(third), ...(fill > 0 ? [{ label: '', w: fill }] : []), back], units: cols });
  }
  const arrows = arrowsOnDigitRow ? [] : [UP(), DOWN()];
  const bottom: OkbKey[] = arrowsOnDigitRow
    ? [
        act('fold', 'Hide keyboard', 1),
        act('sym', input.page === 'letters' ? 'Symbols' : 'Letters', 1.25),
        act('digits', 'Digit row', 1.1),
        ...chars(';'),
        act('space', 'Space', 4),
        ...chars('.'),
        act('enter', 'Enter', 1.65),
      ]
    : [
        // Narrow: the arrows are here, and the keys used least (fold, the digit row's toggle) are the narrow ones.
        act('fold', 'Hide keyboard', 0.9),
        act('sym', input.page === 'letters' ? 'Symbols' : 'Letters', 1.05),
        act('digits', 'Digit row', 1.05),
        { ...chars(';')[0]!, w: 0.9 },
        act('space', 'Space', 2.6),
        { ...chars('.')[0]!, w: 0.9 },
        ...arrows.map((k) => ({ ...k, w: 0.9 })),
        act('enter', 'Enter', 1.5),
      ];
  rows.push({ kind: 'bottom', keys: bottom, units: weight(bottom) });
  return rows;
}

/** What a character key types under `shift`. */
export function okbChar(key: OkbKey, shift: OkbShiftState): string {
  const ch = key.ch ?? '';
  return key.letter && shift.mode !== 'off' ? ch.toUpperCase() : ch;
}

// ------------------------------------------------------------------- shift

export type OkbShift = 'off' | 'once' | 'lock';
export interface OkbShiftState {
  mode: OkbShift;
  /** When the tap that made it `once` came (the clock's ms); else -Infinity. */
  at: number;
}

export const OKB_SHIFT_OFF: OkbShiftState = { mode: 'off', at: -Infinity };

/** A tap on shift at `now` ms. */
export function shiftTap(s: OkbShiftState, now: number): OkbShiftState {
  if (s.mode === 'off') return { mode: 'once', at: now };
  if (s.mode === 'once' && now - s.at <= OKB_SHIFT_DOUBLE_MS) return { mode: 'lock', at: -Infinity };
  return OKB_SHIFT_OFF;
}

/** A character was typed (of any kind), or Enter: a single shift is used up; a lock stays. */
export function shiftUsed(s: OkbShiftState): OkbShiftState {
  return s.mode === 'once' ? OKB_SHIFT_OFF : s;
}

// ------------------------------------------------------------------- sizes

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Rows of keys: three of characters and the bottom row, and the digit row when it is shown. */
export function okbRowCount(digits: boolean): number {
  return digits ? 5 : 4;
}

/**
 * A row's height in px for the screen: a share of its height (judged for
 * four rows, so the digit row adds a row and does not shrink the others),
 * within the shape's limits. Landscape is low: the keys are lower there and
 * leave the game its rows.
 */
export function okbRowPx(landscape: boolean, height: number): number {
  if (!Number.isFinite(height)) return landscape ? OKB_ROW_MAX_LAND : OKB_ROW_MAX;
  return landscape
    ? clamp(Math.floor((height * OKB_ROW_SHARE_LAND) / 4), OKB_ROW_MIN_LAND, OKB_ROW_MAX_LAND)
    : clamp(Math.floor((height * OKB_ROW_SHARE) / 4), OKB_ROW_MIN, OKB_ROW_MAX);
}

/** The height the block needs from the cockpit's bottom edge, px. */
export function okbHeightPx(landscape: boolean, height: number, digits: boolean): number {
  return okbRowCount(digits) * okbRowPx(landscape, height) + 2 * OKB_PAD_Y;
}

/** The block's width for a screen (or a band's room) `width` px wide: its letter keys at most `cap` px each. */
export function okbBlockWidth(width: number, layout: OkbLayout, cap = OKB_UNIT_MAX): number {
  return Math.max(0, Math.min(width, okbCols(layout) * cap + 2 * OKB_PAD_X));
}

/** Whether the arrows stand on the digit row of a block `blockW` px wide: its twelve keys are wide enough. */
export function okbArrowsOnDigitRow(blockW: number): boolean {
  return (blockW - 2 * OKB_PAD_X) / (OKB_DIGITS.length + 2) >= OKB_ARROW_MIN_PX;
}

// --------------------------------------------------------------- the band

export interface OkbBandInput {
  /** The screen's width, px. */
  width: number;
  layout: OkbLayout;
  /** A compass key's side, px (the hot keys are the same). */
  keyPx: number;
  /** The compass's gap between keys, px. */
  keyGap: number;
  /** Hot keys shown in the first column (K1 to K3) and in the second (K4 to K6); 0 for none, or for columns the K key hid. */
  kLeft: number;
  kRight: number;
}

export interface OkbBand {
  /** The block's left edge and width, px. */
  x: number;
  w: number;
  /** A letter key's width, px. */
  unit: number;
  /** The left edge of the column of K1 to K3 (left of the block), or null: none, or no room. */
  kLeftX: number | null;
  /** The left edge of the column of K4 to K6 (right of the block), or null. */
  kRightX: number | null;
  /** The compass stands at the far right (false: no room for it). */
  pad: boolean;
  /** The hot key columns were wanted and gave way. */
  droppedK: boolean;
}

/**
 * Landscape: the keyboard's band, left to right: the column of K1 to K3,
 * the block, the column of K4 to K6, the compass. The block and its
 * columns stand as one group in the middle of what the compass leaves; an
 * absent column takes no width.
 *
 * A letter key is as wide as fits, at most `OKB_UNIT_MAX_LAND`. When
 * everything together would leave it under `OKB_UNIT_MIN_LAND`, the parts
 * give way in this order: first both hot key columns, then the compass;
 * only then does the key get narrower than that.
 */
export function okbBand(input: OkbBandInput): OkbBand {
  const { width, keyPx } = input;
  const cols = okbCols(input.layout);
  const padW = 3 * keyPx + 2 * input.keyGap;
  const col = keyPx + OKB_BAND_GAP;
  const wantK = input.kLeft > 0 || input.kRight > 0;
  const fit = (k: boolean, pad: boolean): OkbBand => {
    const kl = k && input.kLeft > 0;
    const kr = k && input.kRight > 0;
    // What is left for the group: the compass with its margin and a gap, or the bare edge.
    const right = pad ? OKB_BAND_MARGIN + padW + OKB_BAND_GAP : 0;
    const left = kl ? OKB_BAND_MARGIN : 0;
    const room = width - left - right - (kl ? col : 0) - (kr ? col : 0);
    const unit = Math.max(0, Math.min(OKB_UNIT_MAX_LAND, (room - 2 * OKB_PAD_X) / cols));
    const w = Math.min(Math.max(0, room), unit * cols + 2 * OKB_PAD_X);
    const x = left + (kl ? col : 0) + Math.max(0, room - w) / 2;
    return { x, w, unit, kLeftX: kl ? x - col : null, kRightX: kr ? x + w + OKB_BAND_GAP : null, pad, droppedK: wantK && !k };
  };
  const all = fit(true, true);
  if (all.unit >= OKB_UNIT_MIN_LAND) return all;
  const noK = fit(false, true);
  if (noK.unit >= OKB_UNIT_MIN_LAND) return noK;
  return fit(false, false);
}

/**
 * Portrait: what of the compass and the hot key columns is shown above the
 * keyboard. They stand as with the keyboard down, from the keyboard's top
 * edge up (`top`: that edge from the screen's top, px). On a screen too low
 * the columns go first (their place of three keys would end less than
 * `OKB_SIDE_TOP_MIN` from the top), then the compass.
 */
export function okbPortraitSide(top: number, compassH: number, hotTop3: number): { pad: boolean; k: boolean } {
  const pad = top - compassH >= OKB_SIDE_TOP_MIN;
  return { pad, k: pad && top - hotTop3 >= OKB_SIDE_TOP_MIN };
}

// -------------------------------------------------------------- the target

/**
 * What the keys type into (ADR 0138 §3): the small editing interface every
 * field of the game layout gets. The command line implements it now (the
 * input pane's public editing API); Comm's reply and search, the hot key
 * box and the script pane fields follow in round 53d as adapters over their
 * element and their own Enter action. A key calls these and nothing else:
 * no keyboard event is made up.
 */
export interface OkbTarget {
  /** Types `text` at the caret, over the selection if there is one. */
  insert(text: string): void;
  /** Deletes the selection, or the character (a whole grapheme cluster) before the caret. */
  deleteBack(): void;
  /** Enter in the field. */
  submit(): void;
  /** History: one entry older, one newer. Absent: the field has none (the arrows are dimmed). */
  historyUp?(): void;
  historyDown?(): void;
  /** Gives the field the focus (its caret shows; nothing else comes up), and takes it away. */
  focus(): void;
  blur(): void;
}
