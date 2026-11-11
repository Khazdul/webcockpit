import { describe, expect, it } from 'vitest';
import { PHONE_MIN_COLS, PHONE_MIN_ROWS } from '../../src/layout/phone';
import {
  COMMAND_ROW_PX,
  COMM_MIN_ROWS,
  FIGHT_ROWS,
  GAME_KEEP_ROWS,
  STRIP_MIN_ROWS,
  type PhoneGameInput,
  type PhoneGameResult,
  allocatePhoneGame,
  commandRows,
  stripRows,
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

    it('a lower gameKeep (the keyboard is up) lets Comm stay where it would have closed', () => {
      // 16 rows: 13 above the command row, 2 for the fight card.
      expect(run({ rows: 16, fight: true, comm: { rows: 12 }, guard: false }).comm.h).toBe(0);
      const r = run({ rows: 16, fight: true, comm: { rows: 12 }, guard: false, gameKeep: 2 });
      expect(r.comm.h).toBe(9);
      expect(r.game.h).toBe(2);
      expect(r.commRange).toEqual({ min: COMM_MIN_ROWS, max: 9 });
      expectStacked(r);
      // And the strip with it, while it has the rows for a pane.
      expect(run({ rows: 13, strip: true, guard: false, gameKeep: 2 }).strip.h).toBe(0);
      expect(run({ rows: 18, strip: true, guard: false, gameKeep: 2 }).strip.h).toBe(4);
      // With the strip, the fight card and Comm on 20 rows: the strip stays only with the lower keep.
      expect(run({ rows: 20, strip: true, fight: true, comm: { rows: 6 }, guard: false }).strip.h).toBe(0);
      const all = run({ rows: 20, strip: true, fight: true, comm: { rows: 6 }, guard: false, gameKeep: 2 });
      expect([all.strip.h, all.fight.h, all.comm.h, all.game.h]).toEqual([4, 2, 6, 5]);
      // Not a number: the default.
      expect(run({ rows: 16, fight: true, comm: { rows: 12 }, guard: false, gameKeep: Number.NaN }).comm.h).toBe(0);
    });

    it('the strip alone closes when the game would lose its rows', () => {
      const r = run({ rows: 13, strip: true, guard: false });
      expect(r.strip.h).toBe(0);
      expect(r.game.h).toBe(10);
      // Under four rows (its hood, its dots, two rows of pane) the strip is not shown at all.
      expect(run({ rows: 14, strip: true, guard: false }).strip.h).toBe(0);
      expect(run({ rows: 8, strip: true, guard: false, gameKeep: 2 }).strip.h).toBe(0);
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
