// Round 53k: where a lens the user moved or resized is shown
// (src/phone/lens-place.ts). The wanted place and size are never changed by
// the room; what is shown is clamped, pushed, shrunk or hidden, and comes
// back when the room does.
import { describe, expect, it } from 'vitest';
import { compassHeight, hotTop, hotWidth, leftOfHot } from '../../src/phone/compass-size';
import { type LensRoom, type LensRoomInput, fitLens, lensIsSet, lensMax, lensRoom, lensWant, moveLens, resizeLens } from '../../src/phone/lens-place';
import { LENS_MIN_PX } from '../../src/phone/lens-zoom';

const MIN = LENS_MIN_PX;
/** A 360 × 800 screen with the command row at 750 and nothing standing in it. */
const open = (o: Partial<LensRoom> = {}): LensRoom => ({ left: 12, top: 16, right: 348, bottom: 738, blocks: [], ...o });
/** The compass and three hot keys of 36 px at the bottom right of that screen. */
const KEYS = [
  { left: 360 - 8 - 114 - 12, right: 360, top: 800 - compassHeight(36) - 12 },
  { left: 360 - 8 - 36 - 12, right: 360, top: 800 - hotTop(36, 3) - 16 },
];

describe('fitLens: the shown lens from the wanted one and the room', () => {
  it('with room it is where it is wanted, at the wanted size', () => {
    expect(fitLens({ cx: 150, cy: 300, size: 150 }, open(), MIN)).toEqual({ left: 75, top: 225, size: 150 });
  });

  it('is clamped into the room on every side', () => {
    expect(fitLens({ cx: 0, cy: 0, size: 150 }, open(), MIN)).toEqual({ left: 12, top: 16, size: 150 });
    expect(fitLens({ cx: 999, cy: 999, size: 150 }, open(), MIN)).toEqual({ left: 198, top: 588, size: 150 });
  });

  it('the panes above push it down, and it is back where it was when they go', () => {
    const want = { cx: 100, cy: 120, size: 150 };
    const at = fitLens(want, open(), MIN);
    expect(at).toEqual({ left: 25, top: 45, size: 150 });
    // The top comes down past it: it rides on the room's top edge.
    expect(fitLens(want, open({ top: 300 }), MIN)).toEqual({ left: 25, top: 300, size: 150 });
    // Less room than its size: it shrinks to what there is.
    expect(fitLens(want, open({ top: 620 }), MIN)).toEqual({ left: 41, top: 620, size: 118 });
    // Not even the least size: hidden.
    expect(fitLens(want, open({ top: 738 - MIN + 1 }), MIN)).toBeNull();
    expect(fitLens(want, open({ top: 738 - MIN }), MIN)).toEqual({ left: 52, top: 642, size: MIN });
    // The room back: the same answer as before, from the same wanted values.
    expect(fitLens(want, open(), MIN)).toEqual(at);
  });

  it('over the hot keys its floor is their top: pushed up by them, then shrunk between them and the panes, then hidden', () => {
    const room = (top: number): LensRoom => open({ top, blocks: KEYS });
    const floor = 800 - hotTop(36, 3) - 16;
    // Dropped on the keys: it stands on their top.
    const want = { cx: 300, cy: 700, size: 150 };
    expect(fitLens(want, room(16), MIN)).toEqual({ left: 198, top: floor - 150, size: 150 });
    // The panes come down: squeezed between them and the keys.
    expect(fitLens(want, room(floor - 120), MIN)).toEqual({ left: 228, top: floor - 120, size: 120 });
    expect(fitLens(want, room(floor - 90), MIN)).toBeNull();
    // The same lens left of the keys has the room down to the command row.
    expect(fitLens({ cx: 100, cy: 700, size: 150 }, room(floor - 90), MIN)).toEqual({ left: 25, top: 588, size: 150 });
  });

  it('only a block under its own columns counts: beside the compass it reaches the command row', () => {
    const want = { cx: 120, cy: 700, size: 150 };
    expect(fitLens(want, open({ blocks: KEYS }), MIN)).toEqual({ left: 45, top: 588, size: 150 });
    // One px into the compass's columns and the compass is its floor.
    const edge = KEYS[0]!.left;
    expect(fitLens({ ...want, cx: edge - 75 + 1 }, open({ blocks: KEYS }), MIN)!.top).toBe(KEYS[0]!.top - 150);
  });

  it('a size larger than the room is as large as fits; a narrow room (the landscape column) shrinks and hides it', () => {
    expect(fitLens({ cx: 180, cy: 400, size: 900 }, open(), MIN)).toEqual({ left: 12, top: 232, size: 336 });
    const land = (left: number): LensRoom => ({ left, top: 12, right: 700, bottom: 300, blocks: [] });
    const want = { cx: 200, cy: 150, size: 200 };
    expect(fitLens(want, land(12), MIN)).toEqual({ left: 100, top: 50, size: 200 });
    expect(fitLens(want, land(300), MIN)).toEqual({ left: 300, top: 50, size: 200 });
    expect(fitLens(want, land(560), MIN)).toEqual({ left: 560, top: 80, size: 140 });
    expect(fitLens(want, land(610), MIN)).toBeNull();
    expect(fitLens(want, land(12), MIN)).toEqual({ left: 100, top: 50, size: 200 });
  });

  // 320 × 568 with our keyboard up (the review of round 53k): the compass's block from x = 186 with
  // its top at 260, the hot key column's from x = 264 with its top at 134, the command row at 284.
  const SMALL = (top: number): LensRoom => ({
    left: 12,
    top,
    right: 308,
    bottom: 272,
    blocks: [
      { left: 186, right: 320, top: 260 },
      { left: 264, right: 320, top: 134 },
    ],
  });
  const BIG = { cx: 0.5422 * 320, cy: 0.5097 * 568, size: 296 };

  it('shrinks no further than it must: a box too narrow to reach a block is not held to that block\'s height', () => {
    // At the wanted width it reaches the hot keys (118 px of height); at 181 px it ends where their
    // columns begin, and has the height above the compass (244 px).
    expect(fitLens(BIG, SMALL(16), MIN)).toEqual({ left: 83, top: 79, size: 181 });
    // One px wider would reach the hot keys again.
    expect(fitLens({ ...BIG, size: 182 }, SMALL(16), MIN)).toEqual({ left: 83, top: 79, size: 181 });
    expect(fitLens({ ...BIG, size: 181 }, SMALL(16), MIN)).toEqual({ left: 83, top: 79, size: 181 });
    // Left of the hot keys' columns altogether: the whole height above the compass.
    expect(fitLens({ ...BIG, cx: 130 }, SMALL(16), MIN)).toEqual({ left: 12, top: 16, size: 244 });
  });

  it('hides only when not even the least size fits: with the strip open the lens above is shown at what fits', () => {
    // The strip open (the room's top at 88): 172 px above the compass, clear of the hot keys.
    expect(fitLens(BIG, SMALL(88), MIN)).toEqual({ left: 88, top: 88, size: 172 });
    // Down to the least size above the compass, and hidden one px later.
    expect(fitLens(BIG, SMALL(260 - MIN), MIN)).toEqual({ left: 126, top: 260 - MIN, size: MIN });
    expect(fitLens(BIG, SMALL(260 - MIN + 1), MIN)).toBeNull();
  });

  it('a size asked for past the limit (a resize) lands on the largest that fits, at 320 × 480 with our keyboard up', () => {
    // The command row at 196: the compass's top at 172, the hot keys gone (no room for them).
    const room: LensRoom = { left: 12, top: 16, right: 308, bottom: 184, blocks: [{ left: 186, right: 320, top: 172 }] };
    for (const size of [157, 200, 296]) expect(fitLens({ cx: 150, cy: 100, size }, room, MIN)).toEqual({ left: 72, top: 16, size: 156 });
    // Over the hot keys (their top at 100) nothing of the least size fits; the box narrowed to end
    // left of them does.
    const hot: LensRoom = { ...room, blocks: [...room.blocks, { left: 264, right: 320, top: 100 }] };
    expect(fitLens({ cx: 200, cy: 100, size: 200 }, hot, MIN)).toEqual({ left: 136, top: 36, size: 128 });
  });

  it('the answer is the largest size that fits: one px more does not, at any centre and any room top', () => {
    const fits = (cx: number, size: number, room: LensRoom): boolean => {
      const left = Math.round(Math.max(room.left, Math.min(room.right - size, cx - size / 2)));
      let floor = room.bottom;
      for (const b of room.blocks) if (b.left < left + size && b.right > left) floor = Math.min(floor, b.top);
      return size <= room.right - room.left && floor - room.top >= size;
    };
    for (let top = 16; top < 200; top += 23) {
      for (let cx = 0; cx <= 320; cx += 9) {
        for (const size of [100, 150, 181, 244, 296, 600]) {
          const room = SMALL(top);
          const r = fitLens({ cx, cy: 290, size }, room, MIN);
          let most = 0;
          for (let s = Math.min(size, 296); s >= MIN && !most; s--) if (fits(cx, s, room)) most = s;
          expect(r?.size ?? 0, `top ${top} cx ${cx} size ${size}`).toBe(most);
          if (r) {
            expect(r.top).toBeGreaterThanOrEqual(room.top);
            for (const b of room.blocks) if (b.left < r.left + r.size && b.right > r.left) expect(r.top + r.size).toBeLessThanOrEqual(b.top);
          }
        }
      }
    }
  });

  it('whole px, and never under the least size', () => {
    const s = fitLens({ cx: 100.4, cy: 99.6, size: 150.3 }, open({ top: 16.5 }), MIN)!;
    expect([s.left, s.top, s.size].every(Number.isInteger)).toBe(true);
    for (let top = 500; top < 740; top += 7) {
      const r = fitLens({ cx: 300, cy: 0, size: 250 }, open({ top, blocks: KEYS }), MIN);
      if (r) {
        expect(r.size).toBeGreaterThanOrEqual(MIN);
        expect(r.top).toBeGreaterThanOrEqual(top);
        expect(r.top + r.size).toBeLessThanOrEqual(738);
      }
    }
  });
});

describe('the wanted lens from what is stored', () => {
  const room = open();
  it('nothing stored is not set; a place or a size is', () => {
    expect(lensIsSet({ x: null, y: null, size: null })).toBe(false);
    expect(lensIsSet({ x: 0.5, y: 0.5, size: null })).toBe(true);
    expect(lensIsSet({ x: null, y: null, size: 200 })).toBe(true);
  });

  it('a stored place is shares of the screen; without a size it has the full one', () => {
    expect(lensWant({ x: 0.25, y: 0.5, size: null }, 150, room, 360, 800)).toEqual({ cx: 90, cy: 400, size: 150 });
    expect(lensWant({ x: 0.25, y: 0.5, size: 220 }, 150, room, 360, 800)).toEqual({ cx: 90, cy: 400, size: 220 });
  });

  it('a stored size without a place stands in the room\'s top right corner, as the default lens does', () => {
    const w = lensWant({ x: null, y: null, size: 220 }, 150, room, 360, 800);
    expect(fitLens(w, room, MIN)).toEqual({ left: 348 - 220, top: 16, size: 220 });
    // Under panes: still the corner of what room there is.
    const low = open({ top: 300 });
    expect(fitLens(lensWant({ x: null, y: null, size: 220 }, 150, low, 360, 800), low, MIN)).toEqual({ left: 128, top: 300, size: 220 });
  });
});

describe('the drag\'s sums', () => {
  it('a move follows the finger inside the room\'s rectangle', () => {
    const spot = { left: 198, top: 16, size: 150 };
    expect(moveLens(spot, -100, 200, open())).toEqual({ left: 98, top: 216, size: 150 });
    expect(moveLens(spot, -900, -900, open())).toEqual({ left: 12, top: 16, size: 150 });
    expect(moveLens(spot, 900, 900, open())).toEqual({ left: 198, top: 588, size: 150 });
  });

  it('a resize: away from the centre grows, towards it shrinks, the rim moving with the finger; within the limits', () => {
    expect(resizeLens(150, 40, 70, MIN, 336)).toBe(210);
    expect(resizeLens(150, 60, 40, MIN, 336)).toBe(110);
    expect(resizeLens(150, 60, 0, MIN, 336)).toBe(MIN);
    expect(resizeLens(150, 10, 400, MIN, 336)).toBe(336);
    // The largest is what the room holds.
    expect(lensMax(open())).toBe(336);
    expect(lensMax({ left: 300, top: 12, right: 700, bottom: 300, blocks: [] })).toBe(288);
  });
});

describe('lensRoom: the room on a screen', () => {
  const base: LensRoomInput = { W: 360, H: 800, landscape: false, gameTop: 0, gameLeft: 0, inputTop: 750, lift: 0, keyPx: 36, hotCols: 1, hotRows: 3, pad: true, k: true, boxClear: 0 };

  it('portrait: under what is above the game text, above the command row, the compass and the shown hot keys as blocks', () => {
    const r = lensRoom({ ...base, gameTop: 200 });
    expect([r.left, r.top, r.right, r.bottom]).toEqual([12, 216, 348, 738]);
    expect(r.blocks).toEqual(KEYS);
    // The columns hidden: only the compass.
    expect(lensRoom({ ...base, hotRows: 0 }).blocks).toEqual([KEYS[0]]);
    // Two columns: the block is as wide as both.
    expect(lensRoom({ ...base, hotCols: 2 }).blocks[1]!.left).toBe(360 - 8 - hotWidth(36, 2) - 12);
  });

  it('bare (stage 55, a replay): no keys at the bottom right, so no blocks, and landscape reaches the right edge', () => {
    const p = lensRoom({ ...base, gameTop: 200, bare: true });
    expect([p.left, p.top, p.right, p.bottom]).toEqual([12, 216, 348, 738]);
    expect(p.blocks).toEqual([]);
    const l = lensRoom({ ...base, W: 800, H: 360, landscape: true, gameLeft: 300, gameTop: 34, inputTop: 309, hotCols: 2, bare: true });
    expect([l.left, l.top, l.right, l.bottom]).toEqual([320, 46, 788, 297]);
    expect(l.blocks).toEqual([]);
    // Without a command row the room ends at the bottom edge's air.
    expect(lensRoom({ ...base, inputTop: 800, bare: true }).bottom).toBe(788);
  });

  it('portrait with our keyboard: the keys stand on its top edge, or are gone where they have no room', () => {
    const up = lensRoom({ ...base, inputTop: 470, lift: 280 });
    expect(up.bottom).toBe(458);
    expect(up.blocks.map((b) => b.top)).toEqual([800 - 280 - compassHeight(36) - 12, 800 - 280 - hotTop(36, 3) - 16]);
    expect(lensRoom({ ...base, inputTop: 470, lift: 280, k: false }).blocks).toHaveLength(1);
    expect(lensRoom({ ...base, inputTop: 470, lift: 280, k: false, pad: false }).blocks).toEqual([]);
  });

  it('an open hot key box ends the room above it', () => {
    expect(lensRoom({ ...base, boxClear: 400 }).bottom).toBe(400);
    expect(lensRoom({ ...base, boxClear: 20 }).bottom).toBe(738);
  });

  it('landscape: right of the column, left of the hot key columns shown or not, the compass a block; with our keyboard nothing stands in the room', () => {
    const land: LensRoomInput = { ...base, W: 800, H: 360, landscape: true, inputTop: 309, keyPx: 44, hotRows: 0 };
    const r = lensRoom({ ...land, gameLeft: 320, gameTop: 34 });
    expect([r.left, r.top, r.right, r.bottom]).toEqual([340, 46, 800 - leftOfHot(44, 1, 12), 297]);
    expect(r.blocks).toEqual([{ left: 800 - 8 - 138 - 12, right: 800, top: 360 - compassHeight(44) - 12 }]);
    expect(lensRoom(land).left).toBe(12);
    expect(lensRoom({ ...land, inputTop: 120, lift: 190 }).blocks).toEqual([]);
  });
});
