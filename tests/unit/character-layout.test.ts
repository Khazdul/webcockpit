// The Character card's sizes (stage 77 part D, ADR 0166 point 38): the
// modes, and that nothing overlaps or leaves the box at any size.
import { describe, expect, it } from 'vitest';
import { type CardBox, type CardLayout, LARGE_MIN, MEDIUM_MIN, PHONE_GRIP, type Rect, cardLayout, cardMode } from '../../src/panes/character-layout';

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
    expect(wide.left.disc).toBeGreaterThan(60);
    expect(wide.status).toMatchObject({ cols: 4, form: 'full' });
    expect(wide.foot.form).toBe('full');
    const lane = cardLayout(box({ w: 279, h: 153, px: 14.95 }));
    expect(lane.mode).toBe('medium');
    expect(lane.left.disc).toBeGreaterThan(30);
    expect(lane.left.disc).toBeLessThan(wide.left.disc);
    expect(lane.status).toMatchObject({ cols: 2, form: 'full' });
    expect(lane.foot.form).toBe('tight');
  });

  it('below Medium the portrait is hidden, ring and icons stay', () => {
    for (const [w, h] of [[300, 85], [200, 120], [279, 51]] as const) {
      const l = cardLayout(box({ w, h }));
      expect(l.mode).toBe('small');
      expect(l.left.disc).toBe(0);
      expect(l.left.ring).toBeGreaterThanOrEqual(14);
      expect(l.left.icon).toBeGreaterThanOrEqual(6);
    }
  });

  it('a lock holds at any size', () => {
    expect(cardLayout(box({ lock: 'medium', w: 800, h: 300 })).mode).toBe('medium');
    expect(cardLayout(box({ lock: 'large', w: 200, h: 80 })).mode).toBe('large');
    const large = cardLayout(box({ lock: 'large' })).left.disc;
    expect(cardLayout(box({ lock: 'medium' })).left.disc).toBeLessThan(large);
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
  const { left, status, foot } = l;
  if (left.form === 'column') {
    const icons = 5 * (left.icon + 2) + 5 * left.iconGap + 1;
    if (icons > left.w + 0.01) out.push('the icons are wider than the column');
    if (left.disc > left.w) out.push('the portrait is wider than the column');
    const high = left.namePx * 1.15 + (left.disc ? left.disc + left.ring * 0.375 : left.ring) + left.icon + 4;
    if (high > left.h + 0.01) out.push('the column is too high');
  }
  // A cell of Status holds what it was promised.
  if (status.chars > 0 && l.main.w >= 8) {
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
              for (const [nameEm, digits] of [[3.6, 3], [26, 4]] as const) {
                const b = box({ w, h, px, adv, lock, phone, nameEm, digits });
                const p = problems(b, cardLayout(b));
                if (p.length) bad.push(`${w}x${h} at ${px} ${phone ?? ''}: ${p.join(', ')}`);
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
