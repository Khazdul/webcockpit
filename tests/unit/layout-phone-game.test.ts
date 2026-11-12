import { describe, expect, it } from 'vitest';
import { PHONE_MIN_COLS, PHONE_MIN_ROWS } from '../../src/layout/phone';
import {
  COMMAND_ROW_PX,
  COMM_MIN_ROWS,
  FIGHT_ROWS,
  GAME_KEEP_ROWS,
  SIDE_GAME_MIN_COLS,
  SIDE_MIN_COLS,
  STRIP_MIN_ROWS,
  type PhoneGameInput,
  type PhoneGameResult,
  allocatePhoneGame,
  commandRows,
  stripRows,
  GAME_MIN_ROWS,
  OWN_KBD_GIVE,
  ownKeyboardReserve,
  BAND_ROWS,
  phonePaneRect,
} from '../../src/layout/phone-game';

const run = (o: Partial<PhoneGameInput> = {}): PhoneGameResult => allocatePhoneGame({ cols: 43, rows: 44, inputRows: 3, ...o });

/** Strip, fight, Comm, game and the command row stack without gaps or overlap and fill the screen. */
function expectStacked(r: PhoneGameResult): void {
  let y = 0;
  for (const part of [r.strip, r.fight, r.comm, r.game, r.input]) {
    if (part.h === 0 && part.w === 0) continue;
    expect(part.x).toBe(0);
    expect(part.w).toBe(r.cols);
    expect(part.y).toBe(y);
    expect(part.h).toBeGreaterThanOrEqual(0);
    y += part.h;
  }
  expect(y).toBe(r.rows);
}

describe('commandRows', () => {
  it('is the whole rows a thumb-size field needs', () => {
    expect(commandRows(19)).toBe(3);
    expect(commandRows(17)).toBe(3);
    expect(commandRows(14)).toBe(4);
    expect(commandRows(25)).toBe(2);
    expect(commandRows(24)).toBe(3);
    expect(commandRows(COMMAND_ROW_PX)).toBe(1);
    expect(commandRows(80)).toBe(1);
  });

  it('is one row without a cell height', () => {
    expect(commandRows(0)).toBe(1);
    expect(commandRows(Number.NaN)).toBe(1);
  });
});

describe('stripRows', () => {
  it('is about a fifth of the rows, within 15 to 25 %', () => {
    for (let rows = 8; rows <= 80; rows++) {
      const n = stripRows(rows);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(Math.max(1, Math.floor(rows * 0.25)));
      if (rows >= 20) expect(n).toBeGreaterThanOrEqual(Math.ceil(rows * 0.15));
    }
    expect(stripRows(44)).toBe(9);
    expect(stripRows(40)).toBe(8);
  });
});

describe('allocatePhoneGame', () => {
  it('walking: the game text over the command row, nothing else', () => {
    const r = run();
    expect(r.tooSmall).toBe(false);
    expect(r.game).toEqual({ x: 0, y: 0, w: 43, h: 41 });
    expect(r.input).toEqual({ x: 0, y: 41, w: 43, h: 3 });
    expect(r.strip.h).toBe(0);
    expect(r.fight.h).toBe(0);
    expect(r.comm.h).toBe(0);
    expect(r.lens).toBeNull();
    expect(r.lensPx).toBe(0);
    expect(r.lensHidden).toBe(false);
    expect(r.commRange).toBeNull();
    expect(r.stripRange).toBeNull();
    expectStacked(r);
  });

  it('one command row by default', () => {
    const r = allocatePhoneGame({ cols: 43, rows: 40 });
    expect(r.input).toEqual({ x: 0, y: 39, w: 43, h: 1 });
    expect(r.game.h).toBe(39);
  });

  it('fighting: the fight card takes two rows from the top of the game text', () => {
    const r = run({ fight: true });
    expect(r.fight).toEqual({ x: 0, y: 0, w: 43, h: FIGHT_ROWS });
    expect(r.game).toEqual({ x: 0, y: 2, w: 43, h: 39 });
    expect(r.input).toEqual(run().input);
    expectStacked(r);
  });

  it('the strip opens above the fight card', () => {
    const r = run({ strip: true, fight: true });
    expect(r.strip).toEqual({ x: 0, y: 0, w: 43, h: 9 });
    expect(r.fight).toEqual({ x: 0, y: 9, w: 43, h: 2 });
    expect(r.game.y).toBe(11);
    expectStacked(r);
  });

  it('Comm opens under the fight card at its default share', () => {
    const r = run({ fight: true, comm: { rows: null } });
    // 40 % of 44 rows.
    expect(r.comm).toEqual({ x: 0, y: 2, w: 43, h: 18 });
    expect(r.game).toEqual({ x: 0, y: 20, w: 43, h: 21 });
    expect(r.commRange).toEqual({ min: COMM_MIN_ROWS, max: 44 - 3 - 2 - GAME_KEEP_ROWS });
    expectStacked(r);
  });

  it('Comm keeps its stored height between its minimum and what leaves the game its rows', () => {
    expect(run({ comm: { rows: 12 } }).comm.h).toBe(12);
    expect(run({ comm: { rows: 2 } }).comm.h).toBe(COMM_MIN_ROWS);
    const tall = run({ comm: { rows: 99 } });
    expect(tall.comm.h).toBe(44 - 3 - GAME_KEEP_ROWS);
    expect(tall.game.h).toBe(GAME_KEEP_ROWS);
    expectStacked(tall);
  });

  it('a stored Comm height or a command row count that is not a number falls back', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const r = run({ comm: { rows: bad } });
      expect(r.comm.h).toBe(18);
      expectStacked(r);
      const i = run({ inputRows: bad });
      expect(i.input).toEqual({ x: 0, y: 43, w: 43, h: 1 });
      expectStacked(i);
    }
  });

  it('strip, fight card and Comm together stack in that order', () => {
    const r = run({ strip: true, fight: true, comm: { rows: 10 } });
    expect(r.strip.h).toBe(9);
    expect(r.fight.y).toBe(9);
    expect(r.comm).toEqual({ x: 0, y: 11, w: 43, h: 10 });
    expect(r.game).toEqual({ x: 0, y: 21, w: 43, h: 20 });
    expectStacked(r);
  });

  describe('short screens (the keyboard is up)', () => {
    it('Comm shrinks before anything closes', () => {
      const r = run({ rows: 28, strip: true, fight: true, comm: { rows: 12 }, guard: false });
      // 28 − 3 input − 2 fight − 6 strip − 8 game = 9 for Comm.
      expect(r.strip.h).toBe(6);
      expect(r.comm.h).toBe(9);
      expect(r.game.h).toBe(GAME_KEEP_ROWS);
      expectStacked(r);
    });

    it('the strip closes when Comm does not fit under it', () => {
      const r = run({ rows: 22, strip: true, fight: true, comm: { rows: 12 }, guard: false });
      expect(r.strip.h).toBe(0);
      expect(r.comm.h).toBe(9);
      expect(r.game.h).toBe(GAME_KEEP_ROWS);
      expectStacked(r);
    });

    it('Comm closes when it does not fit at all', () => {
      const r = run({ rows: 16, fight: true, comm: { rows: 12 }, guard: false });
      expect(r.comm.h).toBe(0);
      expect(r.commRange).toBeNull();
      expect(r.fight.h).toBe(2);
      expect(r.game.h).toBe(11);
      expectStacked(r);
    });

    it('the strip alone closes when the game would lose its rows', () => {
      const r = run({ rows: 13, strip: true, guard: false });
      expect(r.strip.h).toBe(0);
      expect(r.game.h).toBe(10);
      // Under four rows (three rows of pane and its band) the strip is not shown at all.
      expect(run({ rows: 14, strip: true, guard: false }).strip.h).toBe(0);
      expect(run({ rows: 20, strip: true, guard: false }).strip.h).toBe(4);
    });

    it('the fight card is the last to give way', () => {
      expect(run({ rows: 8, fight: true, guard: false }).fight.h).toBe(2);
      const r = run({ rows: 7, fight: true, guard: false });
      expect(r.fight.h).toBe(0);
      expect(r.game.h).toBe(4);
      expectStacked(r);
    });

    it('the command row leaves the game text one row', () => {
      const r = run({ rows: 3, guard: false });
      expect(r.input).toEqual({ x: 0, y: 1, w: 43, h: 2 });
      expect(r.game).toEqual({ x: 0, y: 0, w: 43, h: 1 });
      const one = run({ rows: 1, guard: false });
      expect(one.input.h).toBe(1);
      expect(one.game.h).toBe(0);
      const none = run({ rows: 0, guard: false });
      expect(none.input.h).toBe(0);
      expect(none.game.h).toBe(0);
    });
  });

  describe('too small', () => {
    it('below the phone limit only the game and the command row are laid out', () => {
      const r = run({ cols: PHONE_MIN_COLS - 1, fight: true, strip: true, comm: { rows: null }, lens: { fullPx: 150, cellW: 9, cellH: 19 } });
      expect(r.tooSmall).toBe(true);
      expect(r.fight.h).toBe(0);
      expect(r.strip.h).toBe(0);
      expect(r.comm.h).toBe(0);
      expect(r.lens).toBeNull();
      expect(r.game).toEqual({ x: 0, y: 0, w: PHONE_MIN_COLS - 1, h: 41 });
      expect(run({ rows: PHONE_MIN_ROWS - 1 }).tooSmall).toBe(true);
    });

    it('the guard is off while the keyboard is up', () => {
      const r = run({ rows: PHONE_MIN_ROWS - 1, guard: false });
      expect(r.tooSmall).toBe(false);
      expect(run({ cols: PHONE_MIN_COLS, rows: PHONE_MIN_ROWS }).tooSmall).toBe(false);
    });
  });

  describe('the strip\'s stored height (stage 52)', () => {
    it('null is the default share; a stored height is kept, at least the minimum', () => {
      expect(run({ strip: true, stripRows: null }).strip.h).toBe(9);
      expect(run({ strip: true, stripRows: 14 }).strip.h).toBe(14);
      expect(run({ strip: true, stripRows: 1 }).strip.h).toBe(STRIP_MIN_ROWS);
      // Not a number: the default.
      expect(run({ strip: true, stripRows: Number.NaN }).strip.h).toBe(9);
      // Closed is closed, whatever is stored.
      expect(run({ stripRows: 14 }).strip.h).toBe(0);
    });

    it('it leaves the game its rows, and says how far a drag may go', () => {
      const r = run({ strip: true, stripRows: 99 });
      expect(r.strip.h).toBe(44 - 3 - GAME_KEEP_ROWS);
      expect(r.game.h).toBe(GAME_KEEP_ROWS);
      expect(r.stripRange).toEqual({ min: STRIP_MIN_ROWS, max: 33 });
      expectStacked(r);
      // With the fight card and Comm: each band's range leaves the other its height.
      const all = run({ strip: true, stripRows: 10, fight: true, comm: { rows: 12 } });
      expect([all.strip.h, all.fight.h, all.comm.h, all.game.h]).toEqual([10, 2, 12, 17]);
      expect(all.stripRange).toEqual({ min: STRIP_MIN_ROWS, max: 31 - 12 });
      expect(all.commRange).toEqual({ min: COMM_MIN_ROWS, max: 31 - 10 });
    });

    it('a stored strip too tall for a short screen shrinks to its minimum before it closes', () => {
      const r = run({ rows: 20, strip: true, stripRows: 12, guard: false });
      // 20 − 3 input − 8 game = 9.
      expect(r.strip.h).toBe(9);
      expect(run({ rows: 15, strip: true, stripRows: 12, guard: false }).strip.h).toBe(4);
      expect(run({ rows: 14, strip: true, stripRows: 12, guard: false }).strip.h).toBe(0);
    });
  });

  describe('the limit above the quick buttons (maxTop, stage 52)', () => {
    it('strip, fight card and Comm together end at or above it', () => {
      const r = run({ strip: true, stripRows: 12, fight: true, comm: { rows: 20 }, maxTop: 28 });
      expect(r.game.y).toBe(28);
      // Comm gives way first: the strip keeps its stored height.
      expect([r.strip.h, r.fight.h, r.comm.h]).toEqual([12, 2, 14]);
      expectStacked(r);
    });

    it('nothing changes while they end above it anyway', () => {
      const free = run({ strip: true, fight: true, comm: { rows: 10 } });
      // Only the ranges (how far a drag may go) differ.
      expect(run({ strip: true, fight: true, comm: { rows: 10 }, maxTop: 30 })).toEqual({ ...free, stripRange: { min: 4, max: 18 }, commRange: { min: 6, max: 19 } });
      expect(run({ strip: true, fight: true, comm: { rows: 10 }, maxTop: 21 })).toEqual({ ...free, stripRange: { min: 4, max: 9 }, commRange: { min: 6, max: 10 } });
    });

    it('a drag stops at it: each range is what the limit leaves beside the other', () => {
      const r = run({ strip: true, stripRows: 8, fight: true, comm: { rows: 10 }, maxTop: 28 });
      expect(r.stripRange).toEqual({ min: STRIP_MIN_ROWS, max: 28 - 2 - 10 });
      expect(r.commRange).toEqual({ min: COMM_MIN_ROWS, max: 28 - 2 - 8 });
      // Dragged to its range's end, the other has not shrunk.
      const s = run({ strip: true, stripRows: r.stripRange!.max, fight: true, comm: { rows: 10 }, maxTop: 28 });
      expect([s.strip.h, s.comm.h, s.game.y]).toEqual([16, 10, 28]);
      const c = run({ strip: true, stripRows: 8, fight: true, comm: { rows: r.commRange!.max }, maxTop: 28 });
      expect([c.strip.h, c.comm.h, c.game.y]).toEqual([8, 18, 28]);
    });

    it('the limit shrinks (a fight begins, larger keys): Comm gives way to its minimum, then the strip to its own', () => {
      const o = { strip: true, stripRows: 12, comm: { rows: 14 } };
      expect(run({ ...o, maxTop: 26 }).game.y).toBe(26);
      const fight = run({ ...o, fight: true, maxTop: 26 });
      expect([fight.strip.h, fight.fight.h, fight.comm.h]).toEqual([12, 2, 12]);
      const low = run({ ...o, fight: true, maxTop: 18 });
      expect([low.strip.h, low.fight.h, low.comm.h]).toEqual([10, 2, 6]);
      expect(low.game.y).toBe(18);
      const least = run({ ...o, fight: true, maxTop: 12 });
      expect([least.strip.h, least.fight.h, least.comm.h]).toEqual([4, 2, 6]);
      expectStacked(least);
    });

    it('not even the minimums fit: the strip closes, then Comm; the fight card stays', () => {
      const o = { strip: true, stripRows: 12, fight: true, comm: { rows: 14 } };
      const a = run({ ...o, maxTop: 11 });
      expect([a.strip.h, a.fight.h, a.comm.h]).toEqual([0, 2, 9]);
      expect(a.stripRange).toBeNull();
      const b = run({ ...o, maxTop: 7 });
      expect([b.strip.h, b.fight.h, b.comm.h]).toEqual([0, 2, 0]);
      expect(b.commRange).toBeNull();
      // The strip alone: it stays while its minimum fits.
      expect(run({ strip: true, fight: true, maxTop: 6 }).strip.h).toBe(4);
      expect(run({ strip: true, fight: true, maxTop: 5 }).strip.h).toBe(0);
      const c = run({ ...o, maxTop: 0 });
      expect([c.strip.h, c.fight.h, c.comm.h, c.game.h]).toEqual([0, 2, 0, 39]);
      expectStacked(c);
    });

    it('the rows the game keeps still hold when the limit is lower down', () => {
      const r = run({ comm: { rows: 99 }, maxTop: 40 });
      expect(r.comm.h).toBe(44 - 3 - GAME_KEEP_ROWS);
    });

    it('a limit that is not a number is none', () => {
      expect(run({ comm: { rows: 20 }, maxTop: Number.NaN }).comm.h).toBe(20);
    });
  });

  describe('the lens', () => {
    // A 9 × 19 px cell: 150 px is 17 columns and 8 rows.
    const lens = { fullPx: 150, minPx: 96, cellW: 9, cellH: 19, gapTop: 1, gapRight: 1, clearBottom: 14 };

    it('walking: a square of whole cells at the top right of the game text, at its full size', () => {
      const r = run({ lens });
      expect(r.lens).toEqual({ x: 43 - 17 - 1, y: 1, w: 17, h: 8 });
      expect(r.lensPx).toBe(150);
      expect(r.lensHidden).toBe(false);
      // It floats: the game text keeps its full width.
      expect(r.game.w).toBe(43);
    });

    it('moves down under the fight card, the strip and Comm', () => {
      expect(run({ lens, fight: true }).lens!.y).toBe(3);
      expect(run({ lens, fight: true, strip: true }).lens!.y).toBe(12);
      // Comm no longer hides it (stage 52).
      const r = run({ lens, comm: { rows: 10 } });
      expect(r.lens).toEqual({ x: 25, y: 11, w: 17, h: 8 });
      expect(r.lensPx).toBe(150);
    });

    it('shrinks in whole rows as its room goes, down to its least size, then hides, and returns', () => {
      // 44 − 3 input − 14 for the keys: row 27 is the floor. Comm of n rows leaves 27 − n − 1.
      const at = (n: number): PhoneGameResult => run({ lens, comm: { rows: n } });
      expect(at(18).lensPx).toBe(150);
      expect(at(19).lens).toEqual({ x: 43 - 15 - 1, y: 20, w: 15, h: 7 });
      expect(at(19).lensPx).toBe(7 * 19);
      expect(at(20).lensPx).toBe(6 * 19);
      // Five rows are 95 px: under 96.
      const gone = at(21);
      expect(gone.lens).toBeNull();
      expect(gone.lensPx).toBe(0);
      expect(gone.lensHidden).toBe(true);
      expect(at(20).lensHidden).toBe(false);
      expect(at(18).lens).toEqual({ x: 25, y: 19, w: 17, h: 8 });
    });

    it('a fractional cell: whole px, never more than the room', () => {
      const r = run({ lens: { ...lens, cellH: 17.5 }, comm: { rows: 19 } });
      // Seven rows of 17.5 px.
      expect(r.lensPx).toBe(122);
      expect(r.lens!.h).toBe(7);
    });

    it('without a least size it never shrinks: full, or hidden', () => {
      const fixed = { fullPx: 150, cellW: 9, cellH: 19, gapTop: 1, gapRight: 1, clearBottom: 14 };
      expect(run({ lens: fixed, comm: { rows: 18 } }).lensPx).toBe(150);
      const r = run({ lens: fixed, comm: { rows: 19 } });
      expect(r.lens).toBeNull();
      expect(r.lensHidden).toBe(true);
    });

    it('hides when the keys leave it no room', () => {
      // Under the strip and the fight card (row 12): floor 21 leaves 9 rows, floor 16 five.
      expect(run({ lens: { ...lens, clearBottom: 20 }, strip: true, fight: true }).lensPx).toBe(150);
      const r = run({ lens: { ...lens, clearBottom: 25 }, strip: true, fight: true });
      expect(r.lens).toBeNull();
      expect(r.lensHidden).toBe(true);
    });

    it('hides on a screen narrower than the lens', () => {
      const r = run({ cols: 12, lens, guard: false });
      expect(r.lens).toBeNull();
      expect(r.lensHidden).toBe(true);
    });

    it('defaults: no gaps; a lens without a size or a cell is none', () => {
      expect(run({ lens: { fullPx: 150, cellW: 9, cellH: 19 } }).lens).toEqual({ x: 26, y: 0, w: 17, h: 8 });
      const none = run({ lens: { fullPx: 0, cellW: 9, cellH: 19 } });
      expect(none.lens).toBeNull();
      expect(none.lensHidden).toBe(false);
      expect(run({ lens: { fullPx: 150, cellW: 0, cellH: 19 } }).lens).toBeNull();
    });
  });
});

describe('a band\'s drag against a squeezed neighbour (52b review)', () => {
  // 29 rows, a three-row command row and a fight card: 16 rows for the strip and Comm.
  const at = (strip: number, comm: number): PhoneGameResult => allocatePhoneGame({ cols: 43, rows: 29, inputRows: 3, fight: true, strip: true, stripRows: strip, comm: { rows: comm } });

  it('stored 8 and 10 in a budget of 16 show 8 and 8; dragged up, Comm would grow back and take the way back', () => {
    const r = at(8, 10);
    expect([r.strip.h, r.comm.h, r.stripRange!.max]).toEqual([8, 8, 8]);
    // Without a hold on Comm (its stored 10): the strip at 6 lets Comm regrow, and 6 is then the most.
    const loose = at(6, 10);
    expect([loose.strip.h, loose.comm.h, loose.stripRange!.max]).toEqual([6, 10, 6]);
  });

  it('with Comm held at the height it shows (what the phone layer asks for the length of the drag) the range does not move', () => {
    // The layer passes Comm's shown 8 rows while the strip's band is dragged.
    for (const strip of [8, 7, 6, 4]) {
      const r = at(strip, 8);
      expect([r.strip.h, r.comm.h, r.stripRange!.max], `strip ${strip}`).toEqual([strip, 8, 8]);
    }
    // And back down to where it began.
    expect(at(8, 8).strip.h).toBe(8);
  });

  it('the mirror: Comm\'s band against a squeezed strip, the strip held at what it shows', () => {
    // Stored strip 12, Comm 6: Comm is at its least, the strip squeezed to 10.
    const r = at(12, 6);
    expect([r.strip.h, r.comm.h, r.commRange]).toEqual([10, 6, { min: COMM_MIN_ROWS, max: 6 }]);
    // Held at 10, Comm's range stays where it was whatever the finger asks.
    const held = allocatePhoneGame({ cols: 43, rows: 29, inputRows: 3, fight: true, strip: true, stripRows: 10, comm: { rows: 6 } });
    expect([held.strip.h, held.comm.h, held.commRange!.max]).toEqual([10, 6, 6]);
  });
});

describe('landscape: the strip and Comm as one column from the left (stage 52c)', () => {
  // 844 × 390 at the phone's default cell: 100 × 22, a three-row command row.
  const land = (o: Partial<PhoneGameInput> = {}, side: Partial<NonNullable<PhoneGameInput['side']>> = {}): PhoneGameResult =>
    allocatePhoneGame({ cols: 100, rows: 22, inputRows: 3, ...o, side: { cols: null, band: 2, ...side } });

  it('nothing open: no column; the game text and the command row have the full width', () => {
    const r = land();
    expect(r.landscape).toBe(true);
    expect(r.side.w).toBe(0);
    expect(r.sideRange).toBeNull();
    expect(r.game).toEqual({ x: 0, y: 0, w: 100, h: 19 });
    expect(r.input).toEqual({ x: 0, y: 19, w: 100, h: 3 });
    expect(r.strip.h + r.comm.h).toBe(0);
  });

  it('portrait says so, and has no column', () => {
    const r = run({ strip: true });
    expect([r.landscape, r.side.w, r.sideBand, r.sideRange]).toEqual([false, 0, 0, null]);
  });

  it('the strip alone: about 40 % of the columns, the whole height, the command row\'s rows too', () => {
    const r = land({ strip: true });
    expect(r.side).toEqual({ x: 0, y: 0, w: 40, h: 22 });
    expect(r.strip).toEqual({ x: 0, y: 0, w: 40, h: 22 });
    expect(r.comm.h).toBe(0);
    expect(r.sideBand).toBe(2);
    // Everything else is right of it: the game text and the command row are narrower.
    expect(r.game).toEqual({ x: 40, y: 0, w: 60, h: 19 });
    expect(r.input).toEqual({ x: 40, y: 19, w: 60, h: 3 });
    // No up-and-down bands in landscape.
    expect([r.stripRange, r.commRange]).toEqual([null, null]);
  });

  it('Comm alone: the whole height', () => {
    const r = land({ comm: { rows: 7 } });
    expect(r.comm).toEqual({ x: 0, y: 0, w: 40, h: 22 });
    expect(r.strip.h).toBe(0);
  });

  it('both: the strip about 40 % of the rows, Comm the rest; the stored portrait heights are not used', () => {
    const r = land({ strip: true, stripRows: 5, comm: { rows: 6 } });
    expect(r.strip).toEqual({ x: 0, y: 0, w: 40, h: 9 });
    expect(r.comm).toEqual({ x: 0, y: 9, w: 40, h: 13 });
    // Each keeps its minimum on a low screen: 11 rows are 4 and 7; 10 rows are 4 and 6.
    const low = land({ rows: 11, strip: true, comm: { rows: null } });
    expect([low.strip.h, low.comm.h]).toEqual([4, 7]);
    const lower = land({ rows: 10, strip: true, comm: { rows: null } });
    expect([lower.strip.h, lower.comm.h]).toEqual([STRIP_MIN_ROWS, COMM_MIN_ROWS]);
  });

  it('both minimums do not fit: the strip closes, Comm has the height', () => {
    const r = land({ rows: 9, strip: true, comm: { rows: null } });
    expect([r.strip.h, r.strip.w, r.comm.h]).toEqual([0, 0, 9]);
    expect(r.side.w).toBe(40);
  });

  it('neither fits: no column', () => {
    const r = land({ rows: 5, guard: false, comm: { rows: null } });
    expect([r.comm.h, r.side.w, r.game.x, r.game.w]).toEqual([0, 0, 0, 100]);
    const s = land({ rows: 3, guard: false, strip: true });
    expect([s.strip.h, s.side.w]).toEqual([0, 0]);
  });

  it('the width: a stored one within the least and what leaves the game text 40 columns', () => {
    expect(land({ strip: true }, { cols: 50 }).side.w).toBe(50);
    expect(land({ strip: true }, { cols: 10 }).side.w).toBe(SIDE_MIN_COLS);
    const wide = land({ strip: true }, { cols: 200 });
    expect(wide.side.w).toBe(100 - SIDE_GAME_MIN_COLS);
    expect(wide.game.w).toBe(SIDE_GAME_MIN_COLS);
    expect(wide.sideRange).toEqual({ min: SIDE_MIN_COLS, max: 60 });
    // A damaged setting is the default.
    expect(land({ strip: true }, { cols: NaN }).side.w).toBe(40);
  });

  it('the width never reaches what stands at the right (the lens\'s place, the hot keys, the compass)', () => {
    const r = land({ strip: true }, { cols: 200, clearRight: 55 });
    expect(r.side.w).toBe(45);
    expect(r.sideRange).toEqual({ min: SIDE_MIN_COLS, max: 45 });
    // No room for the least width left of it: no column.
    const none = land({ strip: true, comm: { rows: null } }, { clearRight: 80 });
    expect([none.side.w, none.strip.h, none.comm.h, none.sideRange]).toEqual([0, 0, 0, null]);
  });

  it('a narrow screen: the game text keeps the phone\'s least columns instead of 40, or there is no column', () => {
    // 60 columns: 24 for the column, 36 for the game.
    const r = land({ cols: 60, strip: true });
    expect([r.side.w, r.game.w, r.sideRange]).toEqual([24, 36, { min: 24, max: 24 }]);
    // 53 columns would leave the game text 29: under the phone's 30.
    expect(land({ cols: 53, strip: true }).side.w).toBe(0);
    expect(land({ cols: 54, strip: true }).side.w).toBe(24);
    expect(PHONE_MIN_COLS).toBe(30);
  });

  it('the fight card spans the game\'s part only, at the top', () => {
    const r = land({ strip: true, comm: { rows: null }, fight: true });
    expect(r.fight).toEqual({ x: 40, y: 0, w: 60, h: FIGHT_ROWS });
    expect(r.game).toEqual({ x: 40, y: 2, w: 60, h: 17 });
    // The column is not pushed down by it.
    expect(r.strip.y).toBe(0);
    expect(r.strip.h + r.comm.h).toBe(22);
    // Without a column: the full width.
    expect(land({ fight: true }).fight).toEqual({ x: 0, y: 0, w: 100, h: 2 });
  });

  it('the portrait limit does not apply', () => {
    const r = land({ strip: true, comm: { rows: null }, maxTop: 3 });
    expect(r.strip.h + r.comm.h).toBe(22);
    expect(r.game.h).toBe(19);
  });

  it('too small: nothing but the game and the command row', () => {
    const r = land({ cols: PHONE_MIN_COLS - 1, strip: true });
    expect([r.tooSmall, r.side.w, r.landscape]).toEqual([true, 0, false]);
  });

  describe('the lens, left of the hot key columns', () => {
    // 8.44 × 17 px cells; 163 px full, 96 px least; one row under the top, 13 columns from the right edge.
    const lens = { fullPx: 163, minPx: 96, cellW: 8.44, cellH: 17, gapTop: 1, gapRight: 13, gapLeft: 3, clearBottom: 7 };

    it('with room: full size, under the top edge, its right edge the gap from the screen\'s', () => {
      const r = land({ lens });
      // 163 px are 10 rows and 20 columns.
      expect(r.lens).toEqual({ x: 100 - 13 - 20, y: 1, w: 20, h: 10 });
      expect(r.lensPx).toBe(163);
    });

    it('the fight card leaves less room: whole rows down to the least size', () => {
      // Rows 3 to 12: nine rows are 153 px.
      const r = land({ lens, fight: true });
      expect(r.lens!.y).toBe(3);
      expect(r.lensPx).toBe(9 * 17);
      expect(r.lens!.h).toBe(9);
      // More to stay clear of at the bottom: five rows are 85 px, under 96.
      const gone = land({ lens: { ...lens, clearBottom: 11 }, fight: true });
      expect([gone.lens, gone.lensHidden]).toEqual([null, true]);
    });

    it('the column leaves less room: whole columns down to the least size, then hidden; never over the column', () => {
      // The column at 60: columns 63 to 87 are 24 columns, 202 px: full.
      expect(land({ lens, strip: true }, { cols: 60 }).lensPx).toBe(163);
      // A narrower screen, 70 columns.
      const tight = allocatePhoneGame({ cols: 70, rows: 22, inputRows: 3, strip: true, lens, side: { cols: 40, band: 2 } });
      // The column is 30 (the game keeps 40): columns 33 to 57 are 24 columns: full. With a wider gap at the right, less.
      expect(tight.side.w).toBe(30);
      const less = allocatePhoneGame({ cols: 70, rows: 22, inputRows: 3, strip: true, lens: { ...lens, gapRight: 22 }, side: { cols: 40, band: 2 } });
      // Columns 33 to 48: 15 columns are 126 px.
      expect(less.lensPx).toBe(126);
      expect(less.lens!.x).toBeGreaterThanOrEqual(less.side.w + 3);
      expect(less.lens!.x + less.lens!.w).toBe(70 - 22);
      const none = allocatePhoneGame({ cols: 70, rows: 22, inputRows: 3, strip: true, lens: { ...lens, gapRight: 27 }, side: { cols: 40, band: 2 } });
      // Ten columns are 84 px: under 96.
      expect([none.lens, none.lensHidden]).toEqual([null, true]);
    });
  });
});

describe('the bottom reserve: a keyboard of our own (ADR 0138, stage 53a)', () => {
  it('none by default: the result is as before', () => {
    const r = run({ strip: true, fight: true });
    expect(r.bottom).toBe(0);
    expect(r).toEqual(run({ strip: true, fight: true, bottom: 0 }));
    expectStacked(r);
  });

  it('portrait: the command row sits directly above the reserve and the game text gives the rows', () => {
    const open = run({ bottom: 12 });
    const closed = run();
    expect(open.bottom).toBe(12);
    // The screen is the same size: only the game text is shorter.
    expect([open.rows, open.cols]).toEqual([closed.rows, closed.cols]);
    expect(open.input).toEqual({ x: 0, y: 44 - 12 - 3, w: 43, h: 3 });
    expect(open.game).toEqual({ x: 0, y: 0, w: 43, h: closed.game.h - 12 });
    expect(open.input.y + open.input.h + open.bottom).toBe(open.rows);
  });

  it('the strip, the fight card and Comm share what is above the reserve; the game keeps its rows', () => {
    const r = run({ bottom: 12, strip: true, fight: true, comm: { rows: 20 } });
    expect(r.fight.h).toBe(FIGHT_ROWS);
    expect(r.game.h).toBeGreaterThanOrEqual(GAME_KEEP_ROWS);
    expect(r.strip.h + r.fight.h + r.comm.h + r.game.h + r.input.h + r.bottom).toBe(r.rows);
    expect(r.game.y + r.game.h).toBe(r.input.y);
    // A band's drag ends above the reserve too.
    expect(r.commRange).not.toBeNull();
    expect(r.strip.h + FIGHT_ROWS + r.commRange!.max + GAME_KEEP_ROWS + r.input.h + r.bottom).toBeLessThanOrEqual(r.rows);
  });

  it('the lens keeps to the shorter game text, shrinks, and is left out under its least size', () => {
    const lens = { fullPx: 153, minPx: 96, cellW: 8.4, cellH: 17, gapTop: 1, gapRight: 2 };
    const closed = run({ lens });
    expect(closed.lensPx).toBe(153);
    const open = run({ lens, bottom: 12 });
    expect(open.lensPx).toBe(153);
    expect(open.lens!.y + open.lens!.h).toBeLessThanOrEqual(open.input.y);
    // 44 rows, 3 of command row, 34 of reserve: seven rows of game text, six under the gap: 102 px.
    const low = run({ lens, bottom: 34 });
    expect(low.game.h).toBe(7);
    expect(low.lensPx).toBe(102);
    const none = run({ lens, bottom: 36 });
    expect([none.lens, none.lensHidden]).toEqual([null, true]);
  });

  it('the too-small guard judges the whole screen, not what the reserve leaves', () => {
    const r = allocatePhoneGame({ cols: 43, rows: 12, inputRows: 3, bottom: 5 });
    expect(r.tooSmall).toBe(false);
    expect(r.game.h).toBe(4);
    expect(allocatePhoneGame({ cols: 43, rows: PHONE_MIN_ROWS - 1, inputRows: 3, bottom: 2 }).tooSmall).toBe(true);
  });

  it('gives way before the command row and the least game text do', () => {
    const r = allocatePhoneGame({ cols: 43, rows: 12, inputRows: 3, bottom: 20 });
    expect(r.bottom).toBe(6);
    expect(r.game.h).toBe(3);
    expect(r.input).toEqual({ x: 0, y: 3, w: 43, h: 3 });
    // A reserve that is not a whole positive number.
    expect(run({ bottom: Number.NaN }).bottom).toBe(0);
    expect(run({ bottom: -3 }).bottom).toBe(0);
    expect(run({ bottom: 2.7 }).bottom).toBe(2);
  });

  it('landscape: the column ends above the reserve too, and the command row is right of it', () => {
    // 800 × 360 at the default cell: 95 × 21.
    const land = (o: Partial<PhoneGameInput> = {}): PhoneGameResult =>
      allocatePhoneGame({ cols: 95, rows: 21, inputRows: 3, ...o, side: { cols: null, band: 2 } });
    const plain = land({ bottom: 9 });
    expect(plain.game).toEqual({ x: 0, y: 0, w: 95, h: 9 });
    expect(plain.input).toEqual({ x: 0, y: 9, w: 95, h: 3 });
    const r = land({ bottom: 9, strip: true, comm: { rows: null }, fight: true });
    expect(r.rows).toBe(21);
    expect(r.side.h).toBe(12);
    expect(r.strip.h + r.comm.h).toBe(12);
    expect(r.strip.h).toBeGreaterThanOrEqual(STRIP_MIN_ROWS);
    expect(r.comm.h).toBeGreaterThanOrEqual(COMM_MIN_ROWS);
    expect(r.input).toEqual({ x: r.side.w, y: 9, w: 95 - r.side.w, h: 3 });
    expect(r.fight).toEqual({ x: r.side.w, y: 0, w: 95 - r.side.w, h: FIGHT_ROWS });
    expect(r.game).toEqual({ x: r.side.w, y: FIGHT_ROWS, w: 95 - r.side.w, h: 9 - FIGHT_ROWS });
  });
});

describe('Comm holds the own keyboard\'s target (commKeep, stage 53d; review finding B)', () => {
  // 360 x 520 at a 17 px cell: 30 rows; the keyboard takes 9, the command row 3; the lifted limit leaves 5 rows.
  const short = { cols: 43, rows: 30, inputRows: 3, bottom: 9, comm: { rows: null }, maxTop: 5 } as const;

  it('without it Comm is squeezed out by the limit, as before', () => {
    const r = allocatePhoneGame(short);
    expect(r.comm.h).toBe(0);
    expect(r.overLimit).toBe(false);
  });

  it('with it the limit gives way first: Comm keeps its minimum and reaches under the hot keys\' place', () => {
    const r = allocatePhoneGame({ ...short, commKeep: true });
    expect(r.comm.h).toBeGreaterThanOrEqual(COMM_MIN_ROWS);
    expect(r.overLimit).toBe(true);
    expect(r.game.h).toBeGreaterThanOrEqual(GAME_KEEP_ROWS);
    expect(r.strip.h + r.fight.h + r.comm.h + r.game.h + r.input.h + r.bottom).toBe(r.rows);
    expect(r.commRange!.min).toBe(COMM_MIN_ROWS);
  });

  it('it changes nothing where Comm fits anyway', () => {
    const roomy = { cols: 43, rows: 47, inputRows: 3, bottom: 11, comm: { rows: 10 }, maxTop: 20, strip: true, fight: true } as const;
    expect(allocatePhoneGame({ ...roomy, commKeep: true })).toEqual(allocatePhoneGame(roomy));
    expect(allocatePhoneGame({ ...roomy, commKeep: true }).overLimit).toBe(false);
  });

  it('then the game text goes down to its least rows, then the fight card gives way; at each step the strip shrinks and closes as ever', () => {
    // 18 rows above the keyboard and the command row: without the limit both fit at their least heights.
    const a = allocatePhoneGame({ cols: 43, rows: 30, inputRows: 3, bottom: 9, comm: { rows: null }, maxTop: 2, strip: true, stripRows: 6, commKeep: true });
    expect([a.strip.h, a.comm.h, a.game.h]).toEqual([4, COMM_MIN_ROWS, GAME_KEEP_ROWS]);
    // 15 rows: the strip closes rather than the game text going under its usual rows.
    const a2 = allocatePhoneGame({ cols: 43, rows: 27, inputRows: 3, bottom: 9, comm: { rows: null }, maxTop: 2, strip: true, stripRows: 6, commKeep: true });
    expect([a2.strip.h, a2.comm.h, a2.game.h]).toEqual([0, 7, GAME_KEEP_ROWS]);
    // 11 rows above: Comm's 6 leave the game 5, under the usual 8.
    const b = allocatePhoneGame({ cols: 43, rows: 23, inputRows: 3, bottom: 9, comm: { rows: null }, maxTop: 0, commKeep: true });
    expect(b.comm.h).toBe(COMM_MIN_ROWS);
    expect(b.game.h).toBe(5);
    expect(b.overLimit).toBe(true);
    // With a fight on, 11 rows: the card's 2 and Comm's 6 leave 3.
    const c = allocatePhoneGame({ cols: 43, rows: 23, inputRows: 3, bottom: 9, comm: { rows: null }, fight: true, commKeep: true });
    expect([c.fight.h, c.comm.h, c.game.h]).toEqual([FIGHT_ROWS, COMM_MIN_ROWS, GAME_MIN_ROWS]);
    // 10 rows: the card gives way.
    const d = allocatePhoneGame({ cols: 43, rows: 22, inputRows: 3, bottom: 9, comm: { rows: null }, fight: true, commKeep: true });
    expect([d.fight.h, d.comm.h, d.game.h]).toEqual([0, COMM_MIN_ROWS, 4]);
  });

  it('a screen with no room even then closes Comm', () => {
    const r = allocatePhoneGame({ cols: 43, rows: 20, inputRows: 3, bottom: 9, comm: { rows: null }, commKeep: true });
    expect(r.comm.h).toBe(0);
    expect(r.overLimit).toBe(false);
    expect(r.game.h).toBe(8);
  });

  it('landscape is as without it: the column has every row above the keyboard, which always hold Comm', () => {
    const side = { cols: null, band: 2 };
    for (const rows of [16, 21]) {
      const o = { cols: 95, rows, inputRows: 3, bottom: 12, comm: { rows: null }, strip: true, side } as const;
      expect(allocatePhoneGame({ ...o, commKeep: true })).toEqual(allocatePhoneGame(o));
      expect(allocatePhoneGame({ ...o, strip: false, commKeep: true }).comm.h).toBeGreaterThanOrEqual(COMM_MIN_ROWS);
    }
  });
});

describe('ownKeyboardReserve: the rows a keyboard of our own gets (stage 53d: the cockpit\'s rounding, on its own)', () => {
  it('nothing wanted, or nothing to measure with: nothing', () => {
    expect(ownKeyboardReserve(800, 17, 0, 3)).toEqual({ bottom: 0, lift: 0 });
    expect(ownKeyboardReserve(800, 0, 188, 3)).toEqual({ bottom: 0, lift: 0 });
    expect(ownKeyboardReserve(0, 17, 188, 3)).toEqual({ bottom: 0, lift: 0 });
    expect(ownKeyboardReserve(800, 17, Number.NaN, 3)).toEqual({ bottom: 0, lift: 0 });
  });

  it('whole rows that hold the height, and what they are on screen', () => {
    // 800 px at 20 px: 40 rows, nothing under the last. 188 px less 6 % is 176.7: nine rows.
    expect(ownKeyboardReserve(800, 20, 188, 3)).toEqual({ bottom: 9, lift: 180 });
    // Exactly whole rows: no row more.
    expect(ownKeyboardReserve(800, 20, 180, 3, 0)).toEqual({ bottom: 9, lift: 180 });
    expect(ownKeyboardReserve(800, 20, 181, 3, 0)).toEqual({ bottom: 10, lift: 200 });
  });

  it('what the screen has under its last whole row counts towards the keyboard', () => {
    // 800 px at 17 px: 47 rows and 1 px under them.
    const r = ownKeyboardReserve(800, 17, 188, 3);
    expect(r.bottom).toBe(Math.ceil((188 * (1 - OWN_KBD_GIVE) - 1) / 17));
    expect(r.lift).toBe(r.bottom * 17 + 1);
    // 13 px under the last row are worth most of a row: one row fewer than without them.
    expect(ownKeyboardReserve(810, 20, 190, 3, 0)).toEqual({ bottom: 9, lift: 190 });
    expect(ownKeyboardReserve(800, 20, 190, 3, 0)).toEqual({ bottom: 10, lift: 200 });
  });

  it('the keyboard gives up to 6 % of its height before it takes one more row', () => {
    // 191 px want ten rows of 20; less 6 % (179.5) nine hold it.
    expect(ownKeyboardReserve(800, 20, 191, 3).bottom).toBe(9);
    expect(ownKeyboardReserve(800, 20, 192, 3).bottom).toBe(10);
    expect(ownKeyboardReserve(800, 20, 191, 3, 0).bottom).toBe(10);
  });

  it('at least one row; never more than leaves the command row and the least game text, as the allocator has it', () => {
    expect(ownKeyboardReserve(800, 20, 1, 3)).toEqual({ bottom: 1, lift: 20 });
    // 12 rows: 3 of command row and 3 of game text leave 6.
    const r = ownKeyboardReserve(240, 20, 400, 3);
    expect(r).toEqual({ bottom: 6, lift: 120 });
    expect(allocatePhoneGame({ cols: 43, rows: 12, inputRows: 3, bottom: 20 }).bottom).toBe(r.bottom);
    expect(ownKeyboardReserve(100, 20, 400, 3)).toEqual({ bottom: 0, lift: 0 });
  });

  it('the lift is where the allocator puts the command row\'s foot', () => {
    for (const [h, cell, px] of [[800, 17, 188], [520, 17, 156], [360, 17, 148], [280, 17, 132], [640, 19, 234]] as const) {
      const r = ownKeyboardReserve(h, cell, px, 3);
      const g = allocatePhoneGame({ cols: 43, rows: Math.floor(h / cell), inputRows: 3, bottom: r.bottom, guard: false });
      expect(h - (g.input.y + g.input.h) * cell).toBe(r.lift);
    }
  });
});

// Round 53j: a pane's header takes no row on a phone (its name is on its band).
describe('phonePaneRect: the pane has every row of its part but the band\'s (round 53j)', () => {
  it('portrait: the strip and Comm each lose only their last row, the band', () => {
    const r = run({ strip: true, stripRows: 9, comm: { rows: 12 } });
    expect(r.strip).toEqual({ x: 0, y: 0, w: 43, h: 9 });
    expect(phonePaneRect(r.strip, r)).toEqual({ x: 0, y: 0, w: 43, h: 9 - BAND_ROWS });
    expect(r.comm).toEqual({ x: 0, y: 9, w: 43, h: 12 });
    expect(phonePaneRect(r.comm, r)).toEqual({ x: 0, y: 9, w: 43, h: 12 - BAND_ROWS });
    expect(BAND_ROWS).toBe(1);
  });

  it('at the least heights the panes keep three and five rows', () => {
    const r = run({ strip: true, stripRows: STRIP_MIN_ROWS, comm: { rows: COMM_MIN_ROWS } });
    expect(phonePaneRect(r.strip, r).h).toBe(STRIP_MIN_ROWS - 1);
    expect(phonePaneRect(r.comm, r).h).toBe(COMM_MIN_ROWS - 1);
  });

  it('landscape: every row, without the band\'s columns at the column\'s right edge', () => {
    const r = allocatePhoneGame({ cols: 95, rows: 21, inputRows: 3, strip: true, comm: { rows: null }, side: { cols: null, band: 2 } });
    expect(r.landscape).toBe(true);
    expect(phonePaneRect(r.strip, r)).toEqual({ x: 0, y: 0, w: r.side.w - 2, h: r.strip.h });
    expect(phonePaneRect(r.comm, r)).toEqual({ x: 0, y: r.strip.h, w: r.side.w - 2, h: r.comm.h });
    expect(r.strip.h + r.comm.h).toBe(21);
  });

  it('a part of one row or one column keeps it', () => {
    expect(phonePaneRect({ x: 0, y: 0, w: 10, h: 1 }, { landscape: false, sideBand: 0 }).h).toBe(1);
    expect(phonePaneRect({ x: 0, y: 0, w: 1, h: 5 }, { landscape: true, sideBand: 2 }).w).toBe(1);
  });
});

// Round 53j: the hot key box, with our keyboard typing in it, needs the rows of what is above the game text.
describe('hide: open parts left out of a layout for now (round 53j)', () => {
  const open = { strip: true, stripRows: 9, comm: { rows: 12 }, fight: true } as const;

  it('nothing hidden is the layout as ever', () => {
    const r = run(open);
    expect(r.hidden).toEqual({ strip: false, comm: false });
    expect(run({ ...open, hide: null })).toEqual(r);
    expect(run({ ...open, hide: { strip: false, comm: false } })).toEqual(r);
  });

  it('Comm hidden: its rows are the game text\'s; the strip and the fight card stay', () => {
    const base = run(open);
    const r = run({ ...open, hide: { strip: false, comm: true } });
    expect(r.hidden).toEqual({ strip: false, comm: true });
    expect(r.comm.h).toBe(0);
    expect(r.commRange).toBeNull();
    expect(r.strip).toEqual(base.strip);
    expect(r.fight).toEqual(base.fight);
    expect(r.game.y).toBe(base.game.y - base.comm.h);
    expect(r.game.h).toBe(base.game.h + base.comm.h);
    expectStacked(r);
  });

  it('both hidden: only the fight card is above the game text', () => {
    const r = run({ ...open, hide: { strip: true, comm: true } });
    expect(r.hidden).toEqual({ strip: true, comm: true });
    expect([r.strip.h, r.comm.h, r.fight.h]).toEqual([0, 0, FIGHT_ROWS]);
    expect(r.game.y).toBe(FIGHT_ROWS);
    expect(r).toEqual({ ...run({ fight: true }), hidden: { strip: true, comm: true } });
    expectStacked(r);
  });

  it('with the keyboard\'s rows in the same layout: one layout for both', () => {
    const r = run({ ...open, bottom: 14, hide: { strip: true, comm: true } });
    expect(r.bottom).toBe(14);
    expect([r.strip.h, r.comm.h]).toEqual([0, 0]);
    expect(r.game).toEqual({ x: 0, y: FIGHT_ROWS, w: 43, h: 44 - 14 - 3 - FIGHT_ROWS });
  });

  it('a part that is not open is not "hidden", and laying out without `hide` brings everything back', () => {
    const r = run({ strip: true, stripRows: 9, hide: { strip: false, comm: true } });
    expect(r.hidden).toEqual({ strip: false, comm: false });
    expect(r.strip.h).toBe(9);
    expect(run(open).strip.h + run(open).comm.h).toBe(21);
  });

  it('landscape: the column without Comm is the strip\'s alone; without both there is no column', () => {
    const land = { cols: 95, rows: 21, inputRows: 3, strip: true, comm: { rows: null }, side: { cols: null } } as const;
    const one = allocatePhoneGame({ ...land, hide: { strip: false, comm: true } });
    expect([one.strip.h, one.comm.h]).toEqual([21, 0]);
    expect(one.side.w).toBeGreaterThan(0);
    const none = allocatePhoneGame({ ...land, hide: { strip: true, comm: true } });
    expect(none.side.w).toBe(0);
    expect(none.game.x).toBe(0);
    expect(none.game.w).toBe(95);
  });
});
