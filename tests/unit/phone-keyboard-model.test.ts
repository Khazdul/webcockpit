// Stage 53b (ADR 0138 §4): the pure model of the phone's own keyboard:
// layouts, pages, the digit row and where the arrows stand, shift, sizes,
// and what stands beside the block in landscape and above it in portrait.
import { describe, expect, it } from 'vitest';
import {
  OKB_ARROW_MIN_PX,
  OKB_BAND_GAP,
  OKB_BAND_MARGIN,
  OKB_DIGITS,
  OKB_PAD_X,
  OKB_PAD_Y,
  OKB_ROW_MAX,
  OKB_ROW_MAX_LAND,
  OKB_ROW_MIN,
  OKB_ROW_MIN_LAND,
  OKB_ROW_MAX_TABLET,
  OKB_ROW_MIN_TABLET,
  OKB_SIDE_MARGIN_TABLET,
  OKB_TABLET_MIN_SHORT,
  OKB_UNIT_MAX_TABLET,
  OKB_SHIFT_DOUBLE_MS,
  OKB_SHIFT_OFF,
  OKB_SIDE_TOP_MIN,
  OKB_SYMBOLS,
  OKB_SYMBOLS_CODE,
  OKB_UNIT_MAX,
  OKB_UNIT_MAX_LAND,
  OKB_UNIT_MIN_LAND,
  type OkbRow,
  okbArrowsOnDigitRow,
  okbBand,
  okbBlockWidth,
  okbChar,
  okbCols,
  okbFromQuery,
  okbHeightPx,
  okbLayout,
  okbNavRow,
  okbNavSides,
  okbPortraitSide,
  okbPortraitWidth,
  okbTabletSize,
  okbUnitMax,
  okbRowCount,
  okbRowPx,
  okbRows,
  okbSymbolPages,
  shiftTap,
  shiftUsed,
} from '../../src/phone/keyboard-model';
import { PHONE_MAX_SHORT_SIDE } from '../../src/core/device';

const text = (row: OkbRow): string => row.keys.map((k) => k.ch ?? (k.act ? `<${k.act}>` : '_')).join('');
const weight = (row: OkbRow): number => row.keys.reduce((n, k) => n + k.w, 0);

describe('own keyboard: the layout', () => {
  it('follows the browser\'s first language unless one is named', () => {
    expect(okbLayout(null, ['sv-SE', 'en'])).toBe('sv');
    expect(okbLayout(null, 'sv')).toBe('sv');
    expect(okbLayout(undefined, ['en-GB', 'sv'])).toBe('en');
    expect(okbLayout(null, ['svx'])).toBe('en');
    expect(okbLayout(null, [])).toBe('en');
    expect(okbLayout(null, undefined)).toBe('en');
    expect(okbLayout('en', ['sv-SE'])).toBe('en');
    expect(okbLayout('sv', ['en-US'])).toBe('sv');
    expect(okbLayout('de', ['sv-SE'])).toBe('sv');
  });

  it('?kbd=: 1 and debug show the readout, sv and en name the layout; nothing turns the keyboard off', () => {
    for (const v of [null, undefined, '', 'true', 'SV', 'de', '0']) expect(okbFromQuery(v)).toEqual({ layout: null, readout: false });
    expect(okbFromQuery('1')).toEqual({ layout: null, readout: true });
    expect(okbFromQuery('debug')).toEqual({ layout: null, readout: true });
    expect(okbFromQuery('sv')).toEqual({ layout: 'sv', readout: false });
    expect(okbFromQuery('en')).toEqual({ layout: 'en', readout: false });
  });

  it('Swedish has eleven letters a row, English ten', () => {
    expect(okbCols('sv')).toBe(11);
    expect(okbCols('en')).toBe(10);
  });
});

describe('own keyboard: the rows', () => {
  it('Swedish letters: q to å, a to ä, shift z to m backspace, and the bottom row', () => {
    const rows = okbRows({ layout: 'sv', page: 'letters', digits: false, arrowsOnDigitRow: true });
    expect(rows.map(text)).toEqual(['qwertyuiopå', 'asdfghjklöä', '<shift>zxcvbnm<back>', '<fold><sym><digits>;<space>.<enter>']);
    expect(rows.map((r) => r.kind)).toEqual(['chars', 'chars', 'chars', 'bottom']);
    // Every character row is shared by the layout's eleven; shift and backspace take what z to m leave.
    for (const r of rows.slice(0, 3)) {
      expect(r.units).toBe(11);
      expect(weight(r)).toBe(11);
    }
    expect(rows[2]!.keys[0]!.w).toBe(2);
    expect(rows[0]!.keys.every((k) => k.letter === true)).toBe(true);
  });

  it('English letters: QWERTY, the row of nine standing in from both edges', () => {
    const rows = okbRows({ layout: 'en', page: 'letters', digits: false, arrowsOnDigitRow: true });
    expect(rows.map(text)).toEqual(['qwertyuiop', 'asdfghjkl', '<shift>zxcvbnm<back>', '<fold><sym><digits>;<space>.<enter>']);
    expect(rows[1]!.units).toBe(10);
    expect(weight(rows[1]!)).toBe(9);
    expect(rows[2]!.keys[0]!.w).toBe(1.5);
    expect(weight(rows[2]!)).toBe(10);
  });

  it('the digit row folds up above the letters, with the arrows when they fit', () => {
    const wide = okbRows({ layout: 'sv', page: 'letters', digits: true, arrowsOnDigitRow: true });
    expect(wide).toHaveLength(5);
    expect(text(wide[0]!)).toBe('1234567890<older><newer>');
    expect(wide[0]!.kind).toBe('digits');
    expect(text(wide[4]!)).toBe('<fold><sym><digits>;<space>.<enter>');
    // Narrow: the arrows stand on the bottom row, with the digit row up or folded away.
    const narrow = okbRows({ layout: 'sv', page: 'letters', digits: true, arrowsOnDigitRow: false });
    expect(text(narrow[0]!)).toBe('1234567890');
    expect(text(narrow[4]!)).toBe('<fold><sym><digits>;<space>.<older><newer><enter>');
    const folded = okbRows({ layout: 'sv', page: 'letters', digits: false, arrowsOnDigitRow: false });
    expect(folded).toHaveLength(4);
    expect(text(folded[3]!)).toBe('<fold><sym><digits>;<space>.<older><newer><enter>');
  });

  it('the bottom row: space is the widest key, Enter next, with and without the arrows', () => {
    for (const arrowsOnDigitRow of [true, false]) {
      const bottom = okbRows({ layout: 'en', page: 'letters', digits: false, arrowsOnDigitRow }).at(-1)!;
      const w = (act: string): number => bottom.keys.find((k) => k.act === act)!.w;
      expect(bottom.units).toBeCloseTo(weight(bottom));
      expect(w('space')).toBeGreaterThan(w('enter'));
      for (const k of bottom.keys) if (k.act !== 'space' && k.act !== 'enter') expect(k.w).toBeLessThan(w('enter'));
      // Space keeps at least a fifth of the row.
      expect(w('space') / bottom.units).toBeGreaterThanOrEqual(0.2);
    }
  });

  it('every key has a name', () => {
    for (const layout of ['sv', 'en'] as const)
      for (const page of ['letters', 'symbols'] as const)
        for (const digits of [true, false])
          for (let p = 0; p < 3; p++)
            for (const row of okbRows({ layout, page, symbolPage: p, digits, arrowsOnDigitRow: false }))
              for (const k of row.keys) if (k.ch !== undefined || k.act !== undefined) expect(k.label).not.toBe('');
  });
});

describe('own keyboard: the symbols', () => {
  const REQUIRED = '\'",-_!?:/\\#@$%&*(){}[]+=<>~^|';

  it('the list has every symbol asked for once, and neither . nor ; (they keep their keys)', () => {
    for (const ch of REQUIRED) expect(OKB_SYMBOLS).toContain(ch);
    expect(new Set(OKB_SYMBOLS).size).toBe(OKB_SYMBOLS.length);
    expect(OKB_SYMBOLS).not.toContain('.');
    expect(OKB_SYMBOLS).not.toContain(';');
  });

  /** Every symbol reachable on the symbols pages, in page order. */
  const all = (layout: 'sv' | 'en', digits: boolean): string => {
    let out = '';
    for (let p = 0; p < okbSymbolPages(layout, digits); p++) {
      const rows = okbRows({ layout, page: 'symbols', symbolPage: p, digits, arrowsOnDigitRow: false });
      for (const r of rows) if (r.kind === 'chars') for (const k of r.keys) if (k.ch !== undefined && !OKB_DIGITS.includes(k.ch)) out += k.ch;
    }
    return out;
  };

  it('every symbol is on some page, once, in both layouts, with the digit row up and folded', () => {
    for (const layout of ['sv', 'en'] as const)
      for (const digits of [true, false]) expect([...all(layout, digits)].sort().join('')).toBe([...OKB_SYMBOLS].sort().join(''));
  });

  it('the page has the same number of rows as the letters', () => {
    for (const layout of ['sv', 'en'] as const)
      for (const digits of [true, false]) {
        const n = okbRows({ layout, page: 'letters', digits, arrowsOnDigitRow: true }).length;
        for (let p = 0; p < okbSymbolPages(layout, digits); p++) expect(okbRows({ layout, page: 'symbols', symbolPage: p, digits, arrowsOnDigitRow: true })).toHaveLength(n);
      }
  });

  it('the digit row folded away: the page\'s first row is the digits, as the digit row would be', () => {
    const rows = okbRows({ layout: 'sv', page: 'symbols', digits: false, arrowsOnDigitRow: true });
    expect(rows).toHaveLength(4);
    expect(text(rows[0]!)).toBe('1234567890<older><newer>');
    expect(text(rows[1]!)).toBe('#@$%&*()/_\\');
    expect(text(rows[2]!)).toBe('<alt>\'",-!?:<back>');
    expect(text(rows[3]!)).toBe('<fold><sym><digits>;<space>.<enter>');
    expect(okbSymbolPages('sv', false)).toBe(2);
    const more = okbRows({ layout: 'sv', page: 'symbols', symbolPage: 1, digits: false, arrowsOnDigitRow: false });
    expect(text(more[0]!)).toBe('1234567890');
    expect(text(more[1]!)).toBe('>~^|`');
    expect(text(more[2]!)).toBe('<alt>{}[]+=<<back>');
  });

  it('the digit row up: three rows of symbols; Swedish holds them all on one page', () => {
    const rows = okbRows({ layout: 'sv', page: 'symbols', digits: true, arrowsOnDigitRow: true });
    expect(rows).toHaveLength(5);
    expect(text(rows[0]!)).toBe('1234567890<older><newer>');
    expect(text(rows[1]!)).toBe('{}[]+=<>~^|');
    expect(text(rows[2]!)).toBe('#@$%&*()/_\\');
    // One page: no page key. The backtick (the list is one longer than the page) stands in shift's
    // place, with the rest of that place empty; backspace where it always is.
    expect(text(rows[3]!)).toBe('`_\'",-!?:<back>');
    expect(okbSymbolPages('sv', true)).toBe(1);
    expect(weight(rows[3]!)).toBe(11);
    // English is two short: a second page.
    expect(okbSymbolPages('en', true)).toBe(2);
    const en = okbRows({ layout: 'en', page: 'symbols', symbolPage: 1, digits: true, arrowsOnDigitRow: true });
    expect(text(en[3]!)).toBe('<alt>^|`_<back>');
    expect(weight(en[3]!)).toBe(10);
  });

  it('a page beyond the last is the last', () => {
    const last = okbRows({ layout: 'sv', page: 'symbols', symbolPage: 1, digits: false, arrowsOnDigitRow: false });
    expect(okbRows({ layout: 'sv', page: 'symbols', symbolPage: 9, digits: false, arrowsOnDigitRow: false })).toEqual(last);
  });

  it('the page key names where it leads', () => {
    const sym = (page: 'letters' | 'symbols'): string => okbRows({ layout: 'en', page, digits: false, arrowsOnDigitRow: true }).at(-1)!.keys.find((k) => k.act === 'sym')!.label;
    expect(sym('letters')).toBe('Symbols');
    expect(sym('symbols')).toBe('Letters');
  });
});

describe('own keyboard: shift', () => {
  it('one tap is one capital, used up by the next character', () => {
    let s = shiftTap(OKB_SHIFT_OFF, 1000);
    expect(s.mode).toBe('once');
    expect(okbChar({ ch: 'å', label: 'å', w: 1, letter: true }, s)).toBe('Å');
    expect(okbChar({ ch: 'ö', label: 'ö', w: 1, letter: true }, s)).toBe('Ö');
    expect(okbChar({ ch: 'ä', label: 'ä', w: 1, letter: true }, s)).toBe('Ä');
    expect(okbChar({ ch: 'k', label: 'k', w: 1, letter: true }, s)).toBe('K');
    // Not a letter: as it is.
    expect(okbChar({ ch: ';', label: 'Semicolon', w: 1 }, s)).toBe(';');
    s = shiftUsed(s);
    expect(s.mode).toBe('off');
    expect(okbChar({ ch: 'k', label: 'k', w: 1, letter: true }, s)).toBe('k');
  });

  it('a second tap within the double tap time locks; a later one turns it off', () => {
    const once = shiftTap(OKB_SHIFT_OFF, 1000);
    expect(shiftTap(once, 1000 + OKB_SHIFT_DOUBLE_MS).mode).toBe('lock');
    expect(shiftTap(once, 1001 + OKB_SHIFT_DOUBLE_MS).mode).toBe('off');
    expect(shiftTap(once, 5000).mode).toBe('off');
  });

  it('a lock survives characters and ends at the next tap, however soon', () => {
    const lock = shiftTap(shiftTap(OKB_SHIFT_OFF, 0), 100);
    expect(lock.mode).toBe('lock');
    expect(shiftUsed(lock)).toBe(lock);
    expect(shiftUsed(shiftUsed(lock)).mode).toBe('lock');
    expect(shiftTap(lock, 150).mode).toBe('off');
    // And the tap after that is a single shift again, not a lock.
    expect(shiftTap(shiftTap(lock, 150), 200).mode).toBe('once');
  });

  it('a shift used up by a character does not make the next tap a double tap', () => {
    const used = shiftUsed(shiftTap(OKB_SHIFT_OFF, 0));
    expect(shiftTap(used, 100).mode).toBe('once');
  });

  it('off stays off when a character is typed', () => {
    expect(shiftUsed(OKB_SHIFT_OFF)).toBe(OKB_SHIFT_OFF);
  });
});

describe('own keyboard: sizes', () => {
  it('rows: four, and five with the digit row', () => {
    expect(okbRowCount(false)).toBe(4);
    expect(okbRowCount(true)).toBe(5);
  });

  it('a row\'s height follows the screen\'s height within the shape\'s limits', () => {
    expect(okbRowPx(false, 800)).toBe(OKB_ROW_MAX);
    expect(okbRowPx(false, 640)).toBe(OKB_ROW_MAX);
    expect(okbRowPx(false, 568)).toBe(42);
    expect(okbRowPx(false, 400)).toBe(OKB_ROW_MIN);
    expect(okbRowPx(true, 360)).toBe(OKB_ROW_MAX_LAND);
    expect(okbRowPx(true, 280)).toBe(32);
    expect(okbRowPx(true, 200)).toBe(OKB_ROW_MIN_LAND);
    expect(okbRowPx(true, Infinity)).toBe(OKB_ROW_MAX_LAND);
    expect(okbRowPx(false, Infinity)).toBe(OKB_ROW_MAX);
  });

  it('the block\'s height: its rows and its padding; the digit row adds one row', () => {
    expect(okbHeightPx(false, 800, false)).toBe(4 * 46 + 2 * OKB_PAD_Y);
    expect(okbHeightPx(false, 800, true)).toBe(5 * 46 + 2 * OKB_PAD_Y);
    // Landscape at the owner's phone: no taller than round 53a's block (148 px), so the game keeps its rows.
    expect(okbHeightPx(true, 360, false)).toBeLessThanOrEqual(148);
    expect(okbHeightPx(true, 280, false)).toBeLessThanOrEqual(132);
    expect(okbHeightPx(true, 360, true) - okbHeightPx(true, 360, false)).toBe(OKB_ROW_MAX_LAND);
  });

  it('the block\'s width: the screen\'s, capped per key', () => {
    expect(okbBlockWidth(360, 'sv')).toBe(360);
    expect(okbBlockWidth(320, 'en')).toBe(320);
    // A tablet: no huge keys.
    expect(okbBlockWidth(768, 'sv')).toBe(11 * OKB_UNIT_MAX + 2 * OKB_PAD_X);
    expect(okbBlockWidth(768, 'en')).toBe(10 * OKB_UNIT_MAX + 2 * OKB_PAD_X);
    expect(okbBlockWidth(900, 'en', 40)).toBe(404);
  });

  it('the arrows stand on the digit row only when its twelve keys are wide enough', () => {
    // 360 px: twelve keys would be under 30 px each.
    expect((360 - 2 * OKB_PAD_X) / 12).toBeLessThan(OKB_ARROW_MIN_PX);
    expect(okbArrowsOnDigitRow(360)).toBe(false);
    expect(okbArrowsOnDigitRow(320)).toBe(false);
    expect(okbArrowsOnDigitRow(12 * OKB_ARROW_MIN_PX + 2 * OKB_PAD_X)).toBe(true);
    expect(okbArrowsOnDigitRow(12 * OKB_ARROW_MIN_PX + 2 * OKB_PAD_X - 1)).toBe(false);
    expect(okbArrowsOnDigitRow(412)).toBe(true);
    expect(okbArrowsOnDigitRow(510)).toBe(true);
  });
});

describe('own keyboard: landscape, the band', () => {
  const band = (width: number, kLeft: number, kRight: number, layout: 'sv' | 'en' = 'sv', keyPx = 44) => okbBand({ width, layout, keyPx, keyGap: 3, kLeft, kRight });
  const padW = (keyPx: number): number => 3 * keyPx + 6;

  it('800 px, six hot keys: K1 to K3 left of the block, K4 to K6 right of it, the compass at the far right', () => {
    const b = band(800, 3, 3);
    expect(b.pad).toBe(true);
    expect(b.droppedK).toBe(false);
    expect(b.unit).toBe(OKB_UNIT_MAX_LAND);
    expect(b.w).toBe(11 * OKB_UNIT_MAX_LAND + 2 * OKB_PAD_X);
    // Left to right, nothing overlapping, everything on screen.
    expect(b.kLeftX).not.toBeNull();
    expect(b.kRightX).not.toBeNull();
    expect(b.kLeftX!).toBeGreaterThanOrEqual(OKB_BAND_MARGIN);
    expect(b.kLeftX! + 44 + OKB_BAND_GAP).toBe(b.x);
    expect(b.kRightX!).toBe(b.x + b.w + OKB_BAND_GAP);
    const compassLeft = 800 - OKB_BAND_MARGIN - padW(44);
    expect(b.kRightX! + 44 + OKB_BAND_GAP).toBeLessThanOrEqual(compassLeft);
    // The group stands in the middle of what the compass leaves.
    const groupLeft = b.kLeftX!;
    const groupRight = b.kRightX! + 44;
    expect(groupLeft).toBeCloseTo(compassLeft - OKB_BAND_GAP - groupRight);
    // So the block does not move when the K key hides the columns (review finding F).
    expect(b.x).toBeCloseTo(band(800, 0, 0).x);
  });

  it('a column with no key takes no width, and the block moves into the middle', () => {
    const three = band(800, 3, 0);
    expect(three.kLeftX).not.toBeNull();
    expect(three.kRightX).toBeNull();
    expect(three.w).toBe(band(800, 3, 3).w);
    expect(three.x).toBeGreaterThan(band(800, 3, 3).x);
    const onlyRight = band(800, 0, 2);
    expect(onlyRight.kLeftX).toBeNull();
    expect(onlyRight.kRightX).toBe(onlyRight.x + onlyRight.w + OKB_BAND_GAP);
    const none = band(800, 0, 0);
    expect(none.kLeftX).toBeNull();
    expect(none.kRightX).toBeNull();
    expect(none.droppedK).toBe(false);
    expect(none.pad).toBe(true);
    // Alone: in the middle between the left edge and the compass.
    const compassLeft = 800 - OKB_BAND_MARGIN - padW(44) - OKB_BAND_GAP;
    expect(none.x).toBeCloseTo((compassLeft - none.w) / 2);
  });

  it('the keys shrink to fit before anything gives way', () => {
    const b = band(740, 3, 3);
    expect(b.droppedK).toBe(false);
    expect(b.pad).toBe(true);
    expect(b.unit).toBeLessThan(OKB_UNIT_MAX_LAND);
    expect(b.unit).toBeGreaterThanOrEqual(OKB_UNIT_MIN_LAND);
    expect(b.kRightX! + 44 + OKB_BAND_GAP).toBeCloseTo(740 - OKB_BAND_MARGIN - padW(44));
  });

  it('too narrow: first the hot key columns give way, then the compass, and only then the keys get narrower', () => {
    // 568 px (a small phone): no room for the columns, the compass stays.
    const noK = band(568, 3, 3);
    expect(noK.droppedK).toBe(true);
    expect(noK.kLeftX).toBeNull();
    expect(noK.kRightX).toBeNull();
    expect(noK.pad).toBe(true);
    expect(noK.unit).toBeGreaterThanOrEqual(OKB_UNIT_MIN_LAND);
    expect(noK.x + noK.w + OKB_BAND_GAP).toBeLessThanOrEqual(568 - OKB_BAND_MARGIN - padW(44) + 0.001);
    // 500 px: the compass too; the block has the full width, its keys as wide as the cap allows.
    const bare = band(500, 3, 3);
    expect(bare.droppedK).toBe(true);
    expect(bare.pad).toBe(false);
    expect(bare.x).toBeGreaterThanOrEqual(0);
    expect(bare.x + bare.w).toBeLessThanOrEqual(500);
    expect(bare.unit).toBeGreaterThanOrEqual(OKB_UNIT_MIN_LAND);
    // 300 px: nothing left to drop, the keys get narrower.
    const tiny = band(300, 3, 3);
    expect(tiny.pad).toBe(false);
    expect(tiny.unit).toBeLessThan(OKB_UNIT_MIN_LAND);
    expect(tiny.x).toBe(0);
    expect(tiny.w).toBe(300);
  });

  it('English is narrower: at 568 px it keeps the compass with room to spare', () => {
    const b = band(568, 0, 0, 'en');
    expect(b.pad).toBe(true);
    expect(b.unit).toBeGreaterThan(band(568, 0, 0, 'sv').unit);
  });

  it('never overlaps and never leaves the screen, whatever the width', () => {
    for (let width = 300; width <= 1000; width += 7)
      for (const [l, r] of [[3, 3], [3, 0], [0, 3], [0, 0], [1, 2]] as const)
        for (const layout of ['sv', 'en'] as const)
          for (const keyPx of [36, 44]) {
            const b = band(width, l, r, layout, keyPx);
            expect(b.x).toBeGreaterThanOrEqual(0);
            expect(b.x + b.w).toBeLessThanOrEqual(width + 0.001);
            expect(b.unit).toBeLessThanOrEqual(OKB_UNIT_MAX_LAND);
            const right = b.pad ? width - OKB_BAND_MARGIN - padW(keyPx) - OKB_BAND_GAP : width;
            if (b.kLeftX !== null) {
              expect(b.kLeftX).toBeGreaterThanOrEqual(OKB_BAND_MARGIN - 0.001);
              expect(b.kLeftX + keyPx).toBeLessThanOrEqual(b.x - OKB_BAND_GAP + 0.001);
            }
            if (b.kRightX !== null) {
              expect(b.kRightX).toBeGreaterThanOrEqual(b.x + b.w + OKB_BAND_GAP - 0.001);
              expect(b.kRightX + keyPx).toBeLessThanOrEqual(right + 0.001);
            } else expect(b.x + b.w).toBeLessThanOrEqual(right + 0.001);
            if (b.droppedK) expect(l + r).toBeGreaterThan(0);
          }
  });
});

describe('own keyboard: portrait, what stands above it', () => {
  // 36 px keys: the compass takes 122 px, the place of three hot keys ends 244 px up.
  it('with room: the compass and the columns', () => {
    expect(okbPortraitSide(612, 122, 244)).toEqual({ pad: true, k: true });
    expect(okbPortraitSide(244 + OKB_SIDE_TOP_MIN, 122, 244)).toEqual({ pad: true, k: true });
  });

  it('a low screen: the columns go first, then the compass', () => {
    expect(okbPortraitSide(244 + OKB_SIDE_TOP_MIN - 1, 122, 244)).toEqual({ pad: true, k: false });
    expect(okbPortraitSide(122 + OKB_SIDE_TOP_MIN, 122, 244)).toEqual({ pad: true, k: false });
    expect(okbPortraitSide(122 + OKB_SIDE_TOP_MIN - 1, 122, 244)).toEqual({ pad: false, k: false });
  });
});

// Round 53g (ADR 0139 §5): the keys a page's keyboard adds, and the backtick.
describe('own keyboard: the page keys', () => {
  const NAV_ACTS = ['esc', 'tab', 'left', 'right', 'up', 'down'];
  const acts = (rows: OkbRow[]): string[] => rows.flatMap((r) => r.keys.map((k) => k.act ?? ''));

  it('the game layout has none of them, whatever else is asked', () => {
    for (const layout of ['sv', 'en'] as const)
      for (const page of ['letters', 'symbols'] as const)
        for (const digits of [true, false])
          for (const arrowsOnDigitRow of [true, false]) {
            const rows = okbRows({ layout, page, digits, arrowsOnDigitRow });
            for (const a of NAV_ACTS) expect(acts(rows)).not.toContain(a);
            expect(rows.some((r) => r.kind === 'nav')).toBe(false);
            expect(rows).toHaveLength(okbRowCount(digits));
          }
  });

  it('`nav: row`: one more row at the top: Esc, Tab, then the carets, six keys of one width', () => {
    for (const digits of [true, false]) {
      const rows = okbRows({ layout: 'sv', page: 'letters', digits, arrowsOnDigitRow: false, history: false, nav: 'row' });
      expect(rows).toHaveLength(okbRowCount(digits, true));
      expect(rows[0]!.kind).toBe('nav');
      expect(text(rows[0]!)).toBe('<esc><tab><left><right><up><down>');
      expect(new Set(rows[0]!.keys.map((k) => k.w)).size).toBe(1);
      expect(rows[0]!.units).toBe(6);
      // The rows under it are the ones without it.
      expect(rows.slice(1)).toEqual(okbRows({ layout: 'sv', page: 'letters', digits, arrowsOnDigitRow: false, history: false }));
    }
    expect(okbNavRow().keys.map((k) => k.label)).toEqual(['Escape', 'Tab', 'Caret left', 'Caret right', 'Caret up', 'Caret down']);
  });

  it('at 360 px a page key is wider than a letter key (59 px against 32)', () => {
    const inner = 360 - 2 * OKB_PAD_X;
    expect(inner / okbNavRow().units).toBeGreaterThan(inner / okbCols('sv'));
    expect(inner / okbNavRow().units).toBeGreaterThanOrEqual(44);
  });

  it('the columns beside the block (landscape): three keys each, caret left at the left foot and caret right at the right', () => {
    const { left, right } = okbNavSides();
    expect(left.map((k) => k.act)).toEqual(['esc', 'tab', 'left']);
    expect(right.map((k) => k.act)).toEqual(['up', 'down', 'right']);
    // `nav: sides` adds no row: the columns are drawn beside the block.
    expect(okbRows({ layout: 'en', page: 'letters', digits: false, arrowsOnDigitRow: true, history: false, nav: 'sides' })).toHaveLength(4);
  });

  it('`history: false` (a page): no history arrows anywhere, and the bottom row is the wide one', () => {
    for (const arrowsOnDigitRow of [true, false])
      for (const digits of [true, false])
        for (const page of ['letters', 'symbols'] as const) {
          const rows = okbRows({ layout: 'en', page, digits, arrowsOnDigitRow, history: false });
          expect(acts(rows)).not.toContain('older');
          expect(acts(rows)).not.toContain('newer');
          expect(text(rows.at(-1)!)).toBe('<fold><sym><digits>;<space>.<enter>');
          expect(rows.at(-1)).toEqual(okbRows({ layout: 'en', page, digits, arrowsOnDigitRow: true }).at(-1));
        }
  });

  it('the heights count the row of page keys', () => {
    expect(okbRowCount(false, true)).toBe(5);
    expect(okbRowCount(true, true)).toBe(6);
    expect(okbHeightPx(false, 800, false, true) - okbHeightPx(false, 800, false)).toBe(okbRowPx(false, 800));
    expect(okbHeightPx(true, 360, true, true) - okbHeightPx(true, 360, true)).toBe(okbRowPx(true, 360));
  });

  it('the backtick is a symbol: last in the list, on the last page in English, in shift\'s place in Swedish with the digit row up', () => {
    expect(OKB_SYMBOLS.at(-1)).toBe('`');
    const sv = okbRows({ layout: 'sv', page: 'symbols', digits: true, arrowsOnDigitRow: true });
    expect(sv[3]!.keys[0]).toMatchObject({ ch: '`', label: 'Backtick', w: 1 });
    expect(sv[3]!.keys[1]).toMatchObject({ label: '', w: 1 });
    expect(weight(sv[3]!)).toBe(11);
    for (const digits of [true, false]) {
      const pages = okbSymbolPages('en', digits);
      const last = okbRows({ layout: 'en', page: 'symbols', symbolPage: pages - 1, digits, arrowsOnDigitRow: true });
      expect(last.flatMap((r) => r.keys.map((k) => k.ch))).toContain('`');
      // A row keeps its full weight on a short page.
      for (const r of last) if (r.kind === 'chars' && r.keys.some((k) => k.act === 'back')) expect(weight(r)).toBe(10);
    }
    // The number of pages did not grow with it.
    expect([okbSymbolPages('sv', true), okbSymbolPages('sv', false), okbSymbolPages('en', true), okbSymbolPages('en', false)]).toEqual([1, 2, 2, 2]);
  });
});

describe('own keyboard: the symbols in a code editor (round 53h)', () => {
  /** What Lua and the profile syntax need (`;` and `.` keep their keys on the bottom row). */
  const CODE = [...'{}[]()="\'#%:,-_+*/\\<>~^|&`'];
  const symbolsOf = (layout: 'sv' | 'en', digits: boolean, page: number): string[] =>
    okbRows({ layout, page: 'symbols', symbolPage: page, digits, arrowsOnDigitRow: true, history: false, symbols: 'code' })
      .filter((r) => r.kind === 'chars')
      .flatMap((r) => r.keys.map((k) => k.ch ?? ''))
      .filter((c) => c !== '');

  it('the code order is the same symbols, each once', () => {
    expect([...OKB_SYMBOLS_CODE].sort()).toEqual([...OKB_SYMBOLS].sort());
    expect(new Set(OKB_SYMBOLS_CODE).size).toBe([...OKB_SYMBOLS_CODE].length);
  });

  it('the rows nearest the thumbs: brackets, =, the quote and the comma; then what code uses most', () => {
    const rows = okbRows({ layout: 'en', page: 'symbols', digits: false, arrowsOnDigitRow: true, history: false, symbols: 'code' });
    const chars = rows.filter((r) => r.kind === 'chars').map((r) => r.keys.map((k) => k.ch ?? '').join(''));
    expect(chars).toEqual(['[]#%:-_<>+', '(){}=",']);
  });

  it('with the digit row up everything code needs is on the first page (two taps), in both layouts', () => {
    for (const layout of ['sv', 'en'] as const) {
      const first = symbolsOf(layout, true, 0);
      for (const c of CODE) expect(first, `${c} in ${layout}`).toContain(c);
    }
    // English keeps three for a second page, none of them code's.
    expect(symbolsOf('en', true, 1)).toEqual(['@', '!', '?']);
    expect(okbSymbolPages('sv', true)).toBe(1);
  });

  it('with the digit row folded the first page holds the most used, the second the rest', () => {
    const first = symbolsOf('en', false, 0);
    for (const c of '(){}[]=",-_#%:<>+') expect(first).toContain(c);
    expect([...symbolsOf('en', false, 0), ...symbolsOf('en', false, 1)].sort()).toEqual([...OKB_SYMBOLS].sort());
  });

  it('the game layout and every plain field keep their order', () => {
    const plain = okbRows({ layout: 'en', page: 'symbols', digits: false, arrowsOnDigitRow: true });
    const text = okbRows({ layout: 'en', page: 'symbols', digits: false, arrowsOnDigitRow: true, symbols: 'text' });
    expect(plain).toEqual(text);
    expect(plain.find((r) => r.kind === 'chars' && r.keys.some((k) => k.act === 'alt'))!.keys.filter((k) => k.ch).map((k) => k.ch).join('')).toBe([...OKB_SYMBOLS].slice(0, 7).join(''));
  });
});

// ADR 0140: a tablet-size window (short side 600 px or more) gets larger keys. The phone's sizes
// (every test above, all with `tablet` left out) do not change.
describe('own keyboard: a tablet-size window', () => {
  it('a tablet-size window is one whose short side is 600 px or more; an unknown size is not', () => {
    expect(OKB_TABLET_MIN_SHORT).toBe(PHONE_MAX_SHORT_SIDE);
    expect(okbTabletSize(820, 1180)).toBe(true);
    expect(okbTabletSize(1180, 820)).toBe(true);
    expect(okbTabletSize(600, 600)).toBe(true);
    expect(okbTabletSize(599, 1180)).toBe(false);
    expect(okbTabletSize(1180, 599)).toBe(false);
    // Phones, upright and on their side.
    for (const [w, h] of [[360, 800], [412, 915], [430, 932], [932, 430], [800, 360], [568, 320]] as const) expect(okbTabletSize(w, h)).toBe(false);
    expect(okbTabletSize(0, 820)).toBe(false);
    expect(okbTabletSize(NaN, 820)).toBe(false);
    expect(okbTabletSize(820, Infinity)).toBe(false);
  });

  it('the cap of a letter key: 72 px in both shapes; the phone\'s without the flag', () => {
    expect(okbUnitMax(false, true)).toBe(72);
    expect(okbUnitMax(true, true)).toBe(72);
    expect(okbUnitMax(false)).toBe(OKB_UNIT_MAX);
    expect(okbUnitMax(true)).toBe(OKB_UNIT_MAX_LAND);
    expect(okbUnitMax(false, false)).toBe(48);
    expect(okbUnitMax(true, false)).toBe(46);
  });

  it('a row is 56 px at 820 × 1180 and at 1180 × 820: landscape has no low rows on a tablet', () => {
    expect(okbRowPx(false, 1180, true)).toBe(56);
    expect(okbRowPx(true, 820, true)).toBe(56);
    // The same rule in both shapes.
    for (const h of [600, 640, 700, 744, 820, 1024, 1180, 1366]) expect(okbRowPx(true, h, true)).toBe(okbRowPx(false, h, true));
    // A lower window (Safari's bars; a small tablet on its side): a share of the height, never under 48.
    expect(okbRowPx(true, 730, true)).toBe(54);
    expect(okbRowPx(true, 700, true)).toBe(52);
    expect(okbRowPx(true, 600, true)).toBe(OKB_ROW_MIN_TABLET);
    expect(okbRowPx(false, Infinity, true)).toBe(OKB_ROW_MAX_TABLET);
    expect(okbRowPx(true, Infinity, true)).toBe(OKB_ROW_MAX_TABLET);
    // Without the flag: the phone's, whatever the height.
    expect(okbRowPx(true, 820)).toBe(OKB_ROW_MAX_LAND);
    expect(okbRowPx(false, 1180)).toBe(OKB_ROW_MAX);
    expect(okbRowPx(true, 820, false)).toBe(36);
  });

  it('the block\'s height: 228 px (284 with the digit row) at both of the iPad\'s shapes', () => {
    expect(okbHeightPx(false, 1180, false, false, true)).toBe(4 * 56 + 4);
    expect(okbHeightPx(false, 1180, true, false, true)).toBe(5 * 56 + 4);
    expect(okbHeightPx(true, 820, false, false, true)).toBe(228);
    expect(okbHeightPx(true, 820, true, false, true)).toBe(284);
    expect(okbHeightPx(true, 820, false)).toBe(4 * 36 + 4);
  });

  it('portrait: the block across the screen with a margin at each side, its keys at most 72 px', () => {
    // 820 px, Swedish: eleven keys of exactly 72 px between two 12 px margins.
    const sv = okbPortraitWidth(820, 'sv', true);
    expect(sv).toBe(820 - 2 * OKB_SIDE_MARGIN_TABLET);
    expect((sv - 2 * OKB_PAD_X) / 11).toBe(72);
    // English: ten keys at the cap.
    expect(okbPortraitWidth(820, 'en', true)).toBe(10 * 72 + 2 * OKB_PAD_X);
    // A narrower tablet: the margins stay and the keys share what is left.
    expect(okbPortraitWidth(744, 'sv', true)).toBe(720);
    expect(okbPortraitWidth(600, 'sv', true)).toBe(576);
    // The arrows stand on the digit row there.
    expect(okbArrowsOnDigitRow(sv)).toBe(true);
    // A phone-size window: exactly `okbBlockWidth`, no margin.
    for (const w of [320, 360, 412, 430, 599]) {
      for (const l of ['sv', 'en'] as const) {
        expect(okbPortraitWidth(w, l)).toBe(okbBlockWidth(w, l));
        expect(okbPortraitWidth(w, l, false)).toBe(Math.min(w, okbCols(l) * OKB_UNIT_MAX + 2 * OKB_PAD_X));
      }
    }
  });

  it('landscape 1180 px: the block between the hot key column(s) and the compass, 72 px keys', () => {
    const band = (kLeft: number, kRight: number, layout: 'sv' | 'en' = 'sv') => okbBand({ width: 1180, layout, keyPx: 44, keyGap: 3, kLeft, kRight, tablet: true });
    const padLeft = 1180 - OKB_BAND_MARGIN - (3 * 44 + 6);
    for (const [kl, kr] of [[3, 3], [3, 0], [0, 0]] as const) {
      const b = band(kl, kr);
      expect(b.unit).toBe(OKB_UNIT_MAX_TABLET);
      expect(b.w).toBe(11 * 72 + 2 * OKB_PAD_X);
      expect(b.pad).toBe(true);
      expect(b.droppedK).toBe(false);
      // Left to right on screen: the first column, the block, the second column, the compass.
      expect(b.kLeftX === null).toBe(kl === 0);
      expect(b.kRightX === null).toBe(kr === 0);
      if (b.kLeftX !== null) {
        expect(b.kLeftX).toBeGreaterThanOrEqual(OKB_BAND_MARGIN);
        expect(b.kLeftX + 44 + OKB_BAND_GAP).toBe(b.x);
      }
      const right = b.kRightX !== null ? b.kRightX + 44 : b.x + b.w;
      expect(right + OKB_BAND_GAP).toBeLessThanOrEqual(padLeft);
    }
    // With a column on each side the block stands where it does without them (the K key does not move it).
    expect(band(3, 3).x).toBe(band(0, 0).x);
    expect(band(3, 3, 'en').w).toBe(10 * 72 + 2 * OKB_PAD_X);
    // A narrower tablet on its side: the keys share what the columns and the compass leave.
    const mini = okbBand({ width: 960, layout: 'sv', keyPx: 44, keyGap: 3, kLeft: 3, kRight: 3, tablet: true });
    expect(mini.unit).toBeLessThan(72);
    expect(mini.unit).toBeGreaterThan(OKB_UNIT_MAX_LAND);
    expect(mini.droppedK).toBe(false);
  });

  it('without the flag the band is the phone\'s at every width, a tablet\'s included', () => {
    for (const width of [568, 640, 800, 932, 1180]) {
      for (const [kl, kr] of [[3, 3], [3, 0], [0, 0]] as const) {
        const ask = { width, layout: 'sv' as const, keyPx: 44, keyGap: 3, kLeft: kl, kRight: kr };
        expect(okbBand({ ...ask, tablet: false })).toEqual(okbBand(ask));
        expect(okbBand(ask).unit).toBeLessThanOrEqual(OKB_UNIT_MAX_LAND);
      }
    }
  });
});
