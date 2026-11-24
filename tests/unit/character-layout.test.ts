// The Character card's sizes (stage 77 part D, ADR 0166 point 38; the
// round 12–15 look, F2b and F2c): the modes, the status area's steps 0–4
// (shields, stones, purse), the compact card, the tabs and the vitals in a
// low pane, and that nothing overlaps or leaves the box at any size.
import { describe, expect, it } from 'vitest';
import {
  type CardBox,
  type CardLayout,
  LARGE_MIN,
  MEDIUM_MIN,
  PHONE_GRIP,
  PORTRAIT_MIN,
  type Rect,
  SHIELD_LOW,
  SHIELD_MIN,
  TAB_MIN,
  areaLayout,
  barCap,
  cardLayout,
  cardMode,
  cardScale,
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

  it('below Medium (Small): the portrait while it is at least 44 px, else the compact card (F2c)', () => {
    const steps = cardLayout(box({ w: 330, h: 100, px: 16.61 }));
    expect(steps.mode).toBe('small');
    expect(steps.left.form).toBe('portrait');
    expect(steps.left.disc).toBeGreaterThanOrEqual(PORTRAIT_MIN);
    for (const [w, h] of [[300, 85], [200, 120], [279, 51]] as const) {
      const l = cardLayout(box({ w, h }));
      expect(l.mode).toBe('small');
      expect(l.left.form).toBe('none');
      expect(l.step).toBe('compact');
      expect(l.left.icon).toBeGreaterThanOrEqual(8);
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
    const at = (stones: number, h = 123) => areaLayout({ mode: 'medium', k: 1, adv: 0.6, main: { x: 0, y: 0, w: 150, h }, heights: { cells: 26, line: 18, plain: 14 }, stones, add: true });
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
    const none = areaLayout({ mode: 'medium', k: 1, adv: 0.6, main: { x: 0, y: 0, w: 150, h: 123 }, heights: { cells: 26, line: 18, plain: 14 }, stones: 0, add: false });
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

  it('below step 0 (point 124): the first of steps 1–4 that fits', () => {
    const at = (h: number, heights = { cells: 27, line: 18, plain: 14 }, w = 220) =>
      areaLayout({ mode: 'medium', k: 1, adv: 0.6, main: { x: 0, y: 0, w, h }, heights, stones: 30, add: true });
    // 0: the shields at least 30 px, the stones in the rows they need while they stay so.
    const s0 = at(100);
    expect(s0).toMatchObject({ step: 0, chips: null, even: false });
    expect(s0.shield).toBeGreaterThanOrEqual(SHIELD_MIN);
    // 1: one row, the shields down to 22 px (no icon under 30, character-dom.ts).
    const s1 = at(84);
    expect(s1).toMatchObject({ step: 1 });
    expect(s1.stones.rows).toBe(1);
    expect(s1.shield).toBeGreaterThanOrEqual(SHIELD_LOW);
    expect(s1.shield).toBeLessThan(SHIELD_MIN);
    // 2: the cells on one line, the same shields.
    const s2 = at(74);
    expect(s2).toMatchObject({ step: 2 });
    expect(s2.shield).toBeGreaterThanOrEqual(SHIELD_LOW);
    // 3: the shields as chips (shape, label, value where there is room), one row of stones.
    const s3 = at(62);
    expect(s3).toMatchObject({ step: 3, shield: 0, even: true });
    expect(s3.chips?.form).toBe('shape');
    expect(s3.stones).toMatchObject({ rows: 1, size: 12 });
    expect(at(62, undefined, 150).chips?.form).toBe('value');
    // 4: the values without cells, stones of 11 px; then the stones go, then the chips.
    const s4 = at(50);
    expect(s4).toMatchObject({ step: 4, even: true });
    expect(s4.stones).toMatchObject({ rows: 1, size: 11 });
    expect(at(34)).toMatchObject({ step: 4, stones: { rows: 0 } });
    expect(at(34).chips).not.toBeNull();
    expect(at(20).chips).toBeNull();
    // No one-line cells (too narrow for four characters): straight to step 4.
    expect(at(62, { cells: null as unknown as number, line: null as unknown as number, plain: 14 }).step).toBe(4);
    // Each step's parts fit the height.
    for (const a of [s1, s2]) expect(a.shieldsH + a.gapTop + a.gapBottom + a.stones.height).toBeLessThanOrEqual(84);
  });

  it('the steps in a real pane: a lower pane never takes a step back up (Medium and Large widths)', () => {
    const order = (s: CardLayout['step']): number => (s === 'compact' ? 5 : s);
    for (const lock of ['auto', 'medium', 'large'] as const) {
      for (const w of [330, 420, 520]) {
        let last = 5;
        for (let h = 30; h <= 220; h++) {
          const l = cardLayout(box({ w, h, px: 16.61, lock, stones: 8, add: true, cross: 8 }));
          // Large's own sizes come at its least box (cardMode); the scale is one (H2).
          if (lock === 'auto' && h === LARGE_MIN.h) last = 5;
          expect(order(l.step), `${lock} ${w}x${h}`).toBeLessThanOrEqual(last);
          last = order(l.step);
        }
        // Large's sizes at the font's scale leave a 330 px pane no portrait (one scale, ADR 0166 addendum 29).
        expect(last, `${lock} ${w}`).toBe(lock === 'large' && w === 330 ? 5 : 0);
      }
    }
  });
});

describe('one scale (H2, ADR 0166 points 157 and 169)', () => {
  const fonts = [9, 12, 14.95, 16.61, 20, 24, 32];
  it('a taller pane never has a smaller scale: across Small, Medium and Large', () => {
    for (const lock of ['auto', 'medium', 'large'] as const) {
      for (const px of fonts) {
        for (const w of [120, 200, 230, 279, 330, 420, 520, 900]) {
          let last = cardLayout(box({ w, h: 20, px, lock }));
          for (let h = 21; h <= 300; h++) {
            const l = cardLayout(box({ w, h, px, lock }));
            expect(l.scale, `${lock} ${px} ${w}x${h}`).toBeGreaterThanOrEqual(last.scale);
            last = l;
          }
        }
      }
    }
  });

  it('a wider pane never has a smaller scale', () => {
    for (const lock of ['auto', 'medium', 'large'] as const) {
      for (const px of fonts) {
        for (const h of [40, 80, 105, 106, 120, 159, 160, 200]) {
          let last = 0;
          for (let w = 60; w <= 900; w += 3) {
            const k = cardLayout(box({ w, h, px, lock })).scale;
            expect(k, `${lock} ${px} ${w}x${h}`).toBeGreaterThanOrEqual(last);
            last = k;
          }
        }
      }
    }
  });

  it('Medium at its least box keeps the scale Small had just below it (point 157)', () => {
    for (const px of fonts) {
      for (const w of [230, 330, 520]) {
        const small = cardLayout(box({ w, h: MEDIUM_MIN.h - 1, px }));
        const medium = cardLayout(box({ w, h: MEDIUM_MIN.h, px }));
        expect([small.mode, medium.mode]).toEqual(['small', 'medium']);
        expect(medium.scale, `${px} ${w}`).toBeGreaterThanOrEqual(small.scale);
      }
    }
    expect(cardScale(330, MEDIUM_MIN.h, 15)).toBe(1);
  });
});

describe('low panes (F2c, ADR 0166 points 124–126)', () => {
  /** The content above the vitals: from the area's top margin to the vitals. */
  const body = (l: CardLayout): number => l.main.y + l.main.h - l.left.y;

  it('the tabs only where the content is at least 80 px high; below that the area takes their room', () => {
    for (const w of [330, 520]) {
      for (let h = 60; h <= 160; h++) {
        const l = cardLayout(box({ w, h, px: 16.61, cross: 8 }));
        expect(l.tabs.on, `${w}x${h}`).toBe(body(l) >= TAB_MIN);
        if (!l.tabs.on) {
          expect(l.tabs.w).toBe(0);
          expect(l.main.x + l.main.w).toBeGreaterThan(w - 12);
        }
      }
    }
  });

  it('the vitals: 14 px under a 122 px box, 12 under 82, 10 under 62 (the mockups’ 150, 110, 90 less their padding)', () => {
    expect([200, 122, 121, 82, 81, 62, 61, 40].map(barCap)).toEqual([34, 14, 14, 12, 12, 10, 10, 10]);
    // From each height the cap grows in, half a px per px: a growing pane never loses height to its bars.
    expect([62, 63, 64, 66, 82, 84, 122, 126, 162].map(barCap)).toEqual([10, 10, 11, 12, 12, 13, 14, 16, 34]);
    const bar = (h: number): number => cardLayout(box({ w: 330, h, px: 16.61 })).foot.bar;
    expect(bar(162)).toBe(20);
    expect(bar(108)).toBe(14);
    expect(bar(72)).toBe(12);
    expect(bar(54)).toBe(10);
    // Normal sizes keep F2b's bars.
    expect(cardLayout(box()).foot.bar).toBeGreaterThan(14);
  });

  it('the portrait stays while it is at least 44 px; then the compact card, full width, no tabs', () => {
    const order: (number | string)[] = [];
    for (let h = 40; h <= 120; h++) {
      const l = cardLayout(box({ w: 330, h, px: 16.61, lock: 'medium', cross: 8 }));
      if (l.left.form === 'portrait') expect(l.left.disc).toBeGreaterThanOrEqual(PORTRAIT_MIN);
      else {
        expect(l.step).toBe('compact');
        expect(l.main.x).toBeLessThan(8);
        expect(l.tabs.on).toBe(false);
      }
      if (order.at(-1) !== l.step) order.push(l.step);
    }
    expect(order).toEqual(['compact', 3, 2, 1, 0]);
  });

  it('the compact card: line 1 the status and the shields, line 2 the icons and the stones (18 px cells while both fit)', () => {
    const l = cardLayout(box({ w: 330, h: 72, px: 16.61, stones: 8, add: true }));
    expect(l.step).toBe('compact');
    expect(l.left.form).toBe('none');
    expect(l.compact).toMatchObject({ flat: false });
    expect(l.status).toMatchObject({ form: 'compact', cols: 4, label: false });
    expect(l.status.h).toBe(Math.round(18 * (16.61 / 15)));
    // The status on the left 55 %, four characters (`aggr`), the shields as icon and value on the rest.
    expect(l.compact!.cellsW).toBe(Math.floor((l.main.w - l.compact!.mid) * 0.55));
    expect(l.status.chars).toBeGreaterThanOrEqual(4);
    expect(l.area.chips?.form).toBe('icon');
    // Line 2: the icons first, then the stones, the purse in their last row.
    expect(l.area.line2).toBe(true);
    const icons = 5 * (l.left.icon + 2) + 5 * l.left.iconGap + 1;
    expect(l.area.stones.x).toBeGreaterThan(icons);
    expect(l.area.stones.w).toBe(l.main.w - l.area.stones.x);
    expect(l.area.stones.rows).toBe(1);
    const st = l.area.stones;
    const rows = stoneRows(someStones(8), { width: st.w, size: st.size, gap: st.gap, bar: st.bar, rows: st.rows, add: true }, 0, 20);
    expect(rows.hidden).toEqual([]);
    expect(purseFit(rows.free, { gold: 380, silver: 5, copper: 49 }, l.area.purse)).toBeGreaterThan(0);
    expect(l.status.h + l.area.gapBottom + st.height).toBeLessThanOrEqual(l.main.h);
  });

  it('the compact card: flat 13 px rows and 10 px stones where 18 px does not fit, then line 2 goes', () => {
    const low = cardLayout(box({ w: 330, h: 46, px: 15, adv: 0.6 }));
    expect(low.step).toBe('compact');
    expect(low.compact!.flat).toBe(true);
    expect(low.status.h).toBe(13);
    expect(low.area.stones.size).toBe(10);
    expect(low.area.line2).toBe(true);
    const lower = cardLayout(box({ w: 330, h: 30, px: 15, adv: 0.6 }));
    expect(lower.area.line2).toBe(false);
    expect(lower.area.stones.rows).toBe(0);
    expect(lower.status.h).toBeLessThanOrEqual(lower.main.h);
  });

  it('the compact card: more rows of stones where there is height, `+n` where not', () => {
    const one = cardLayout(box({ w: 330, h: 72, px: 16.61, stones: 40, add: true }));
    expect(one.area.stones.rows).toBe(1);
    const st = one.area.stones;
    const rows = stoneRows(someStones(40), { width: st.w, size: st.size, gap: st.gap, bar: st.bar, rows: st.rows, add: true }, 0, 20);
    expect(rows.entries.at(-1)!.k).toBe('more');
    // A narrow, tall pane (the portrait has no width): the compact card with the tabs, and rows.
    const tall = cardLayout(box({ w: 180, h: 200, px: 16.61, stones: 40, add: true }));
    expect(tall.step).toBe('compact');
    expect(tall.tabs.on).toBe(true);
    expect(tall.area.stones.rows).toBeGreaterThan(1);
  });

  it('the compact card sideways: the shields’ icons go, then the shields, then the values; the letters stay', () => {
    const at = (w: number) => cardLayout(box({ w, h: 72, px: 16.61 }));
    expect(at(330).area.chips?.form).toBe('icon');
    expect(at(240).area.chips?.form).toBe('value');
    expect(at(240).status.chars).toBe(4);
    expect(at(150).area.chips).toBeNull();
    expect(at(150).compact!.cellsW).toBe(at(150).main.w);
    expect(at(72).status.chars).toBe(0);
    expect(at(72).status.valuePx).toBeGreaterThan(5);
  });
});

/** A glyph's widest (Chrome hints to whole px). */
const glyph = (px: number, adv: number): number => Math.max(px * adv, Math.round(px * adv), Math.round(Math.round(px) * adv));
const overlap = (a: Rect, b: Rect): boolean =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.01;

/** `ALERTNESS`, `WEIGHT` and `ABS` in Cinzel Bold (character-layout.ts). */
const LABEL_EM = 7.1;
const SHORT_EM = 5.1;
const CHIP_EM = 2.6;

function problems(b: CardBox, l: CardLayout): string[] {
  const out: string[] = [];
  const parts: [string, Rect][] = [['main', l.main], ['foot', l.foot]];
  if (l.tabs.on) parts.push(['tabs', l.tabs]);
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
  const k = l.scale;
  if (b.cross && l.tabs.on && l.tabs.h >= 6 && l.tabs.y < b.cross) out.push('a tab is under the cross');
  // Point 125: the tabs only where the content above the vitals is TAB_MIN high.
  if (l.tabs.on && l.tabs.y + l.tabs.h < TAB_MIN - 0.5) out.push('tabs in a low pane');
  if ((l.step === 'compact') !== (left.form === 'none')) out.push('the compact card with a portrait');
  if (left.form === 'portrait') {
    if (left.disc < PORTRAIT_MIN) out.push('the portrait is under 44 px');
    if (left.discX < -0.01 || left.discX + left.disc > left.w + 0.01) out.push('the portrait is wider than the column');
    if (left.ringX + left.ring > left.w + 0.01) out.push('the ring is outside the column');
    const icons = 5 * (left.icon + 2) + 5 * left.iconGap + 1;
    if (left.iconsX < -0.01 || left.iconsX + icons > left.w + 0.01) out.push('the icons are wider than the column');
    if (left.iconsY + left.icon + 4 > left.h + 0.01) out.push('the column is too high');
  }
  if (main.w < 8 || main.h < 6) return out;
  const g = glyph(status.valuePx, b.adv);
  const stones = area.stones.rows > 0 ? area.gapBottom + area.stones.height : 0;
  const chips = area.chips;
  if (l.step !== 'compact') {
    // The status' height with what is under it.
    const below = area.shield > 0 ? area.gapTop + area.shield + 9 * k : chips ? area.gapTop + chips.h : 0;
    if (status.h + below + stones > main.h + 0.5) out.push(`the status area is too high (step ${l.step})`);
    if (area.shield > 0) {
      const cols = area.shieldCols;
      if (cols * ((area.shield * 40) / 48) + (cols - 1) * 3 * k > main.w + 0.5) out.push('the shields are wider than the area');
      if (area.shieldsH < (4 / cols) * (area.shield + 9 * k) - 0.5) out.push('the shields are higher than their room');
    }
    // What a cell's value is promised fits it.
    const cw = (main.w - (status.cols - 1) * status.gap) / status.cols;
    let room = cw - 4 - (status.form === 'plain' ? 0 : 7 * k);
    if (status.form === 'line' && status.label) room -= status.labelPx * (status.short ? SHORT_EM : LABEL_EM) + 4 * k;
    if (status.form === 'cells' && status.labelPx * (status.short ? SHORT_EM : LABEL_EM) > cw - 4 + 0.01) out.push('a Status label is too long');
    if (status.chars * g > room + 0.01) out.push(`Status words are too long (${status.form})`);
    if (status.valuePx < 6.5) out.push(`Status words are too small (${status.form})`);
  } else {
    // Line 1, then line 2 (the icons, the stones) under it.
    if (status.h > main.h + 0.01) out.push('line 1 is too high');
    if (area.line2 && status.h + area.gapBottom + area.stones.height > main.h + 0.5) out.push('line 2 is outside');
    if (area.line2) {
      const icons = 5 * (left.icon + 2) + 5 * left.iconGap + 1;
      if (icons > area.stones.x + 0.01) out.push('the icons run into the stones');
      if (area.stones.x + area.stones.w > main.w + 0.01) out.push('the stones are wider than the line');
      if (area.stones.rows > 0 && 2 * area.stones.size + area.stones.gap > area.stones.w + 0.5) out.push('two stones are wider than their room');
    }
    const cellsW = l.compact!.cellsW;
    const inner = (cellsW - 3 * status.gap) / 4 - 2 * Math.round(2 * Math.min(1.8, Math.max(0.8, b.px / 15)));
    if (status.chars > 0 && g + l.compact!.letterGap + status.chars * g > inner + 0.01) out.push('a compact value is too long');
    if (g > inner + 0.01) out.push('a compact letter does not fit');
    if (chips && cellsW + l.compact!.mid > main.w) out.push('the shields have no room');
  }
  if (chips) {
    const cw = (main.w - (l.compact ? l.compact.cellsW + l.compact.mid : 0) - 3 * chips.gap) / 4;
    if (3 * glyph(chips.px, b.adv) > chips.room + 0.01) out.push('a chip value is too long');
    const extra = chips.form === 'shape' ? 10 * k + chips.labelPx * CHIP_EM + 6 * k : chips.form === 'label' ? chips.labelPx * CHIP_EM + 3 * k : chips.form === 'icon' ? chips.icon + 3 : 0;
    if (chips.room + extra > cw + 0.5) out.push(`a chip is wider than its room (${chips.form})`);
    if (chips.h > main.h + 0.01) out.push('the chips are too high');
  }
  if (area.stones.rows > 0 && area.stones.per * (area.stones.size + area.stones.gap) - area.stones.gap > area.stones.w + 0.5) out.push('a row of stones is wider than the area');
  const col = (b.w - 2 * foot.pad - 2 * foot.gap) / 3 - 2 * foot.inset;
  if (b.digits * glyph(foot.numberPx, b.adv) > col + 0.2) out.push('the number is wider than its bar');
  if (foot.bar > barCap(b.h)) out.push('the bars are higher than a low pane allows');
  return out;
}

describe('no overlap and nothing outside', () => {
  const widths = [72, 90, 110, 120, 150, 176, 200, 230, 260, 279, 300, 340, 392, 420, 480, 520, 560, 640, 760, 900, 1200, 1800];
  const heights = [21, 30, 36, 40, 44, 51, 54, 60, 62, 66, 70, 72, 78, 80, 85, 90, 95, 100, 104, 107, 115, 120, 140, 153, 160, 171, 190, 230, 300, 400, 800];
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
      expect(bad.slice(0, 30)).toEqual([]);
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
