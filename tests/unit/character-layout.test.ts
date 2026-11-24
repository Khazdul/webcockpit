// The Character card's sizes (stage 77 part D, ADR 0166 point 38; the
// round 12–15 look, F2b): the modes, the status area's step 0 (shields,
// stones, purse), and that nothing overlaps or leaves the box at any size.
import { describe, expect, it } from 'vitest';
import {
  type CardBox,
  type CardLayout,
  LARGE_MIN,
  MEDIUM_MIN,
  PHONE_GRIP,
  PORTRAIT_MIN,
  type Rect,
  SHIELD_MIN,
  areaLayout,
  cardLayout,
  cardMode,
  crossDepth,
  shieldSize,
} from '../../src/panes/character-layout';
import { type Stone, purseFit, stoneRows } from '../../src/panes/character-stones';

const box = (over: Partial<CardBox> = {}): CardBox => ({ w: 480, h: 171, px: 16.61, adv: 0.602, lock: 'auto', nameEm: 3.6, digits: 3, ...over });

describe('height modes', () => {
  it('Large, Medium and below, from the content box in px', () => {
    expect(cardMode(LARGE_MIN.w, LARGE_MIN.h, 'auto')).toBe('large');
    expect(cardMode(LARGE_MIN.w - 1, LARGE_MIN.h, 'auto')).toBe('medium');
    expect(cardMode(LARGE_MIN.w, LARGE_MIN.h - 1, 'auto')).toBe('medium');
    expect(cardMode(MEDIUM_MIN.w, MEDIUM_MIN.h, 'auto')).toBe('medium');
    expect(cardMode(MEDIUM_MIN.w, MEDIUM_MIN.h - 1, 'auto')).toBe('small');
    expect(cardMode(MEDIUM_MIN.w - 1, MEDIUM_MIN.h, 'auto')).toBe('small');
  });

  it("the new player's pane is Large, today's 33 cell lane Medium", () => {
    const wide = cardLayout(box());
    expect(wide.mode).toBe('large');
    expect(wide.left).toMatchObject({ form: 'portrait' });
    expect(wide.left.disc).toBeGreaterThan(100);
    expect(wide.status).toMatchObject({ cols: 4, form: 'cells', short: false });
    expect(wide.area.shield).toBeGreaterThan(60);
    expect(wide.area.stones.rows).toBe(1);
    expect(wide.foot.form).toBe('full');
    const lane = cardLayout(box({ w: 279, h: 153, px: 14.95 }));
    expect(lane.mode).toBe('medium');
    expect(lane.left.form).toBe('portrait');
    expect(lane.left.disc).toBeGreaterThan(70);
    expect(lane.left.disc).toBeLessThan(wide.left.disc);
    // Four cells with the short labels (`ALERT.`), the values cut to four characters.
    expect(lane.status).toMatchObject({ cols: 4, form: 'cells', short: true, chars: 4 });
    expect(lane.area.shield).toBeGreaterThanOrEqual(SHIELD_MIN);
    expect(lane.foot.form).toBe('tight');
  });

  it('below Medium the portrait is hidden, ring and icons stay', () => {
    for (const [w, h] of [[300, 85], [200, 120], [279, 51]] as const) {
      const l = cardLayout(box({ w, h }));
      expect(l.mode).toBe('small');
      expect(l.left.disc).toBe(0);
      expect(l.left.form).not.toBe('portrait');
      expect(l.left.ring).toBeGreaterThanOrEqual(14);
      expect(l.left.icon).toBeGreaterThanOrEqual(6);
    }
  });

  it('a lock holds at any size', () => {
    expect(cardLayout(box({ lock: 'medium', w: 800, h: 300 })).mode).toBe('medium');
    expect(cardLayout(box({ lock: 'large', w: 200, h: 80 })).mode).toBe('large');
    // Medium's sizes in a box Large would fill: smaller stones and values.
    const large = cardLayout(box({ lock: 'large', px: 15 }));
    const medium = cardLayout(box({ lock: 'medium', px: 15 }));
    expect(medium.area.stones.size).toBeLessThan(large.area.stones.size);
    expect(medium.status.valuePx).toBeLessThan(large.status.valuePx);
  });

  it('the portrait: square, the ring on its bottom right corner, the icons under it (round 12)', () => {
    const { left } = cardLayout(box());
    expect(left.form).toBe('portrait');
    expect(left.disc).toBeGreaterThanOrEqual(PORTRAIT_MIN);
    // The ring overlaps the corner: its centre is inside the frame, its edge outside.
    expect(left.ringX + left.ring / 2).toBeLessThan(left.discX + left.disc);
    expect(left.ringY + left.ring / 2).toBeLessThan(left.disc);
    expect(left.ringX + left.ring).toBeGreaterThan(left.discX + left.disc);
    expect(left.ringY + left.ring).toBeGreaterThan(left.disc);
    expect(left.iconsY).toBeGreaterThanOrEqual(left.ringY + left.ring);
    expect(left.nameH).toBeGreaterThan(left.namePx);
  });
});

/** `n` stones, untimed (the order and `+n` need no clock then). */
const someStones = (n: number): Stone[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `b${i}`,
    kind: 'buff',
    icon: 'buff',
    tone: 'buff',
    label: `Buff ${i}`,
    expiresAt: null,
    expected: null,
    tracked: true,
    herbKey: null,
    herbDebuff: false,
    about: null,
  }));

describe('the status area, step 0 (ADR 0166 points 86, 120–122)', () => {
  it('the shields: 1 × 4 in a wide area, 2 × 2 in a tall narrow one, the larger of the two', () => {
    expect(shieldSize(313, 84, 64, 1)).toEqual({ size: 64, cols: 4 });
    expect(shieldSize(150, 205, 72, 1)).toMatchObject({ cols: 2 });
    expect(shieldSize(150, 205, 72, 1).size).toBeGreaterThan(shieldSize(150, 75, 72, 1).size);
    // 2 × 2 only where it is clearly larger (the mockups' 1.12).
    expect(shieldSize(200, 120, 72, 1).cols).toBe(4);
  });

  it('the stones take more rows while the shields stay at least 30 px, then `+n`', () => {
    const at = (stones: number, h = 123) => areaLayout({ mode: 'medium', k: 1, adv: 0.6, main: { x: 0, y: 0, w: 150, h }, status: 26, stones, add: true });
    expect(at(3).stones.rows).toBe(1);
    expect(at(16).stones.rows).toBe(2);
    const many = at(60);
    expect(many.shield).toBeGreaterThanOrEqual(SHIELD_MIN);
    expect(many.stones.rows).toBeLessThan(Math.ceil(61 / many.stones.per));
    // One more row would take the shields under 30 px.
    const rest = 123 - 26 - many.gapTop - many.gapBottom - ((many.stones.rows + 1) * (12 + 3 + 2) - 2);
    expect(shieldSize(150, rest, 54, 1).size).toBeLessThan(SHIELD_MIN);
    // The rows that fit, the `+` first and the `+n` last.
    const st = many.stones;
    const rows = stoneRows(someStones(60), { width: 150, size: st.size, gap: st.gap, bar: st.bar, rows: st.rows, add: true }, 0, 20);
    expect(rows.rows).toBe(st.rows);
    expect(rows.entries[0]).toEqual({ k: 'add' });
    expect(rows.entries.at(-1)!.k).toBe('more');
    expect(rows.height).toBe(st.height);
    // A tall pane gives all of them rows.
    const tall = at(60, 400);
    expect(tall.stones.rows).toBe(Math.ceil(61 / tall.stones.per));
  });

  it('always a row while it fits, with no stones and no `+` too (the purse may stand in it)', () => {
    const none = areaLayout({ mode: 'medium', k: 1, adv: 0.6, main: { x: 0, y: 0, w: 150, h: 123 }, status: 26, stones: 0, add: false });
    expect(none.stones.rows).toBe(1);
  });

  it('the purse in the last row: g+s+c, g+s, g, none, as the stones fill it (point 121)', () => {
    const l = cardLayout(box({ stones: 3, add: true }));
    const purse = { gold: 380, silver: 5, copper: 49 };
    const st = l.area.stones;
    const shown = [3, 12, 14, 15, 16, 17, 18].map((n) => {
      const r = stoneRows(someStones(n), { width: l.main.w, size: st.size, gap: st.gap, bar: st.bar, rows: 1, add: true }, 0, 20);
      return purseFit(r.free, purse, l.area.purse);
    });
    expect(shown[0]).toBe(3);
    expect(shown.at(-1)).toBe(0);
    for (let i = 1; i < shown.length; i++) expect(shown[i]!).toBeLessThanOrEqual(shown[i - 1]!);
    expect(new Set(shown).size).toBeGreaterThan(2);
  });

  it('Stats shares the rows: one count for both tabs, from the stones', () => {
    const one = cardLayout(box({ w: 279, h: 160, px: 14.95, stones: 3, add: true }));
    const two = cardLayout(box({ w: 279, h: 160, px: 14.95, stones: 16, add: true }));
    expect(two.area.stones.rows).toBe(one.area.stones.rows + 1);
  });

  it('below step 0: one row, then no shields, then part D’s Status forms with nothing else', () => {
    const low = areaLayout({ mode: 'medium', k: 1, adv: 0.6, main: { x: 0, y: 0, w: 150, h: 60 }, status: 26, stones: 30, add: true });
    expect(low.stones.rows).toBe(1);
    expect(low.shield).toBe(0);
    const tiny = cardLayout(box({ w: 300, h: 60 }));
    expect(tiny.status.form).not.toBe('cells');
    expect(tiny.area.stones.rows).toBe(0);
    expect(tiny.area.shield).toBe(0);
  });
});

/** A glyph's widest (Chrome hints to whole px). */
const glyph = (px: number, adv: number): number => Math.max(px * adv, Math.round(px * adv), Math.round(Math.round(px) * adv));
const overlap = (a: Rect, b: Rect): boolean =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.01;

function problems(b: CardBox, l: CardLayout): string[] {
  const out: string[] = [];
  const parts: [string, Rect][] = [['main', l.main], ['tabs', l.tabs], ['foot', l.foot]];
  if (l.left.form !== 'none') parts.push(['left', l.left]);
  for (const [name, r] of parts) {
    if (![r.x, r.y, r.w, r.h].every(Number.isFinite)) out.push(`${name} is no number`);
    if (r.w < 0 || r.h < 0) out.push(`${name} is negative`);
    if (r.w > 0 && r.h > 0 && (r.x < -0.01 || r.y < -0.01 || r.x + r.w > b.w + 0.01 || r.y + r.h > b.h + 0.01)) out.push(`${name} is outside`);
  }
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) if (overlap(parts[i]![1], parts[j]![1])) out.push(`${parts[i]![0]} on ${parts[j]![0]}`);
  }
  const { left, status, foot, area, main } = l;
  if (b.cross && l.tabs.h >= 6 && l.tabs.y < b.cross) out.push('a tab is under the cross');
  if (left.form === 'portrait') {
    if (left.discX < -0.01 || left.discX + left.disc > left.w + 0.01) out.push('the portrait is wider than the column');
    if (left.ringX + left.ring > left.w + 0.01) out.push('the ring is outside the column');
    const icons = 5 * (left.icon + 2) + 5 * left.iconGap + 1;
    if (left.iconsX < -0.01 || left.iconsX + icons > left.w + 0.01) out.push('the icons are wider than the column');
    if (left.iconsY + left.icon + 4 > left.h + 0.01) out.push('the column is too high');
  }
  if (status.form === 'cells') {
    const below = area.shield > 0 ? area.gapTop + area.shield + 9 * l.scale : 0;
    const stones = area.stones.rows > 0 ? area.gapBottom + area.stones.height : 0;
    if (status.h + below + stones > main.h + 0.5) out.push('the status area is too high');
    if (area.shield > 0) {
      const cols = area.shieldCols;
      if (cols * ((area.shield * 40) / 48) + (cols - 1) * 3 * l.scale > main.w + 0.5) out.push('the shields are wider than the area');
      if (area.shieldsH < (4 / cols) * (area.shield + 9 * l.scale) - 0.5) out.push('the shields are higher than their room');
    }
    if (area.stones.rows > 0 && 2 * area.stones.size + area.stones.gap > main.w + 0.5) out.push('two stones are wider than the area');
  }
  if (left.form === 'column') {
    const icons = 5 * (left.icon + 2) + 5 * left.iconGap + 1;
    if (icons > left.w + 0.01) out.push('the icons are wider than the column');
    if (left.disc > left.w) out.push('the portrait is wider than the column');
    const high = left.namePx * 1.15 + (left.disc ? left.disc + left.ring * 0.375 : left.ring) + left.icon + 4;
    if (high > left.h + 0.01) out.push('the column is too high');
  }
  // A cell of Status holds what it was promised.
  if (status.form !== 'cells' && status.chars > 0 && l.main.w >= 8) {
    const room = l.main.w / status.cols - 6 - (status.form === 'inline' ? status.valuePx * 1.3 : 0);
    if (status.chars * glyph(status.valuePx, b.adv) > room + 0.01) out.push('Status words are too long');
  }
  const col = (b.w - 2 * foot.pad - 2 * foot.gap) / 3 - 2 * foot.inset;
  if (b.digits * glyph(foot.numberPx, b.adv) > col + 0.2) out.push('the number is wider than its bar');
  return out;
}

describe('no overlap and nothing outside', () => {
  const widths = [72, 90, 110, 120, 150, 176, 200, 230, 260, 279, 300, 340, 392, 420, 480, 520, 560, 640, 760, 900, 1200, 1800];
  const heights = [21, 30, 40, 51, 60, 70, 85, 100, 107, 120, 140, 153, 160, 171, 190, 230, 300, 400, 800];
  for (const lock of ['auto', 'large', 'medium'] as const) {
    it(`every size, font and phone place (${lock})`, () => {
      const bad: string[] = [];
      for (const [px, adv] of [[6, 0.6], [9, 0.602], [12, 0.6], [14.95, 0.602], [16.61, 0.602], [24, 0.58], [32, 0.6]] as const) {
        for (const phone of [undefined, 'strip', 'side'] as const) {
          for (const w of widths) {
            for (const h of heights) {
              for (const [nameEm, digits, stones] of [[3.6, 3, 3], [26, 4, 40]] as const) {
                for (const framed of phone ? [false] : [true, false]) {
                  const cross = crossDepth({ phone: phone !== undefined, framed, rowH: px * 1.14 });
                  const b = box({ w, h, px, adv, lock, phone, nameEm, digits, cross, stones, add: true });
                  const p = problems(b, cardLayout(b));
                  if (p.length) bad.push(`${w}x${h} at ${px} ${phone ?? ''} ${framed}: ${p.join(', ')}`);
                }
              }
            }
          }
        }
      }
      expect(bad.slice(0, 20)).toEqual([]);
    });
  }

  it('the landscape column keeps the tabs clear of the band’s grip', () => {
    const l = cardLayout(box({ w: 328, h: 399, phone: 'side' }));
    expect(l.tabs.x + l.tabs.w).toBeLessThanOrEqual(328 - PHONE_GRIP);
    expect(l.tabs.w).toBeGreaterThanOrEqual(26);
    expect(cardLayout(box({ w: 408, h: 153, phone: 'strip' })).tabs.w).toBeGreaterThanOrEqual(26);
  });

  it('the vitals are in Group’s columns', () => {
    const l = cardLayout(box({ w: 480, px: 15, adv: 0.6 }));
    expect(l.foot.pad).toBeCloseTo(0.4 * 9);
    expect(l.foot.gap).toBeCloseTo(0.7 * 9);
  });
});
