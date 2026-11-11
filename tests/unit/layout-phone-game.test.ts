import { describe, expect, it } from 'vitest';
import { PHONE_MIN_COLS, PHONE_MIN_ROWS } from '../../src/layout/phone';
import {
  COMMAND_ROW_PX,
  COMM_MIN_ROWS,
  FIGHT_ROWS,
  GAME_KEEP_ROWS,
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
    expect(r.lensHidden).toBe(false);
    expect(r.commRange).toBeNull();
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
      const r = run({ cols: PHONE_MIN_COLS - 1, fight: true, strip: true, comm: { rows: null }, lens: { cols: 16, rows: 8 } });
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

  describe('the lens', () => {
    const lens = { cols: 16, rows: 8, gapTop: 1, gapRight: 1, clearBottom: 14 };

    it('walking: a square of whole cells at the top right of the game text', () => {
      const r = run({ lens });
      expect(r.lens).toEqual({ x: 43 - 16 - 1, y: 1, w: 16, h: 8 });
      expect(r.lensHidden).toBe(false);
      // It floats: the game text keeps its full width.
      expect(r.game.w).toBe(43);
    });

    it('moves down under the fight card and the strip', () => {
      expect(run({ lens, fight: true }).lens!.y).toBe(3);
      expect(run({ lens, fight: true, strip: true }).lens!.y).toBe(12);
    });

    it('hides while Comm is open', () => {
      const r = run({ lens, comm: { rows: null } });
      expect(r.lens).toBeNull();
      expect(r.lensHidden).toBe(true);
    });

    it('hides when it would reach into the rows the keys need', () => {
      // 44 − 3 input − 14 for the keys = row 27 is the floor.
      expect(run({ lens: { ...lens, clearBottom: 20 }, strip: true, fight: true }).lens).not.toBeNull();
      const r = run({ lens: { ...lens, clearBottom: 22 }, strip: true, fight: true });
      expect(r.lens).toBeNull();
      expect(r.lensHidden).toBe(true);
    });

    it('hides on a screen narrower than the lens', () => {
      const r = run({ cols: 12, lens, guard: false });
      expect(r.lens).toBeNull();
      expect(r.lensHidden).toBe(true);
    });

    it('defaults: no gaps', () => {
      expect(run({ lens: { cols: 16, rows: 8 } }).lens).toEqual({ x: 27, y: 0, w: 16, h: 8 });
    });
  });
});
