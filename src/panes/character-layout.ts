// The Character card's sizes (stage 77 part D, ADR 0166 point 38). Pure:
// everything follows from the content box in px, the terminal font's size
// and advance, and the height lock. Nothing follows from the tab or the
// fight, so neither moves the left column or the vitals.
//
//   +-----------+------------------------------+---+
//   |   Rasta   |                              | S |
//   |  ( o o )  |   the tab's area             | T |
//   |   ( 73 )  |                              | L |
//   | i i i i i |                              |   |
//   +-----------+------------------------------+---+
//   | HP   187 / 270 | MANA  93 / 111 | MOVES  98 / 122 |
//   +--------------------------------------------------+
//
// - Boxes are absolute and never overlap: what does not fit gets smaller,
//   then simpler, then is left out.
// - Left column: the portrait in Large and Medium while there is room for
//   it, else name, ring and icons under each other, else beside the ring.
//   It is left out only where five icons would leave the tab's area
//   nothing (a float of a few cells).
// - Status: four in a row; two rows where that would cost the words. The
//   values' room is counted in the font's advance, so nothing is measured.
// - Nothing to press stands under the pane's close cross (`crossDepth`):
//   the tabs begin below it, and in a low pane with no border the tab's
//   area does too, as the cross's row is the content's first. With no
//   height left for three tabs they stand in a row, and at the last beside
//   the bars, which then end before them.
// - On a phone the tabs are wide enough for a finger, and in the landscape
//   column they stand clear of the resize band's grip.
// - The vitals' columns are Group's: 0.4 cell of padding, 0.7 of gap.
// - An advance is counted as the widest of the exact one (Firefox) and the
//   whole px that Chrome's hinting rounds it to, also from a whole px size
//   (src/theme/fonts.ts `wholePx`).
// - Label widths are Cinzel Bold's, measured (`*_EM`, tracking included).

import type { CharacterHeight } from '../settings/types';
import type { VitalForm } from './character-model';

/** The least content box of Large and of Medium, px. */
export const LARGE_MIN = { w: 400, h: 160 } as const;
export const MEDIUM_MIN = { w: 210, h: 106 } as const;

/**
 * How far a framed pane's cross reaches into the content: its box ends with
 * the title row, its glyph's line box a few px below (layout.css; at most
 * 6.9 measured, Firefox, 6–32 px fonts).
 */
const FRAMED_CROSS = 8;
/** How far a borderless pane's cross reaches below its row (measured: 1). */
const BORDERLESS_CROSS = 2;

/**
 * How far into the content the pane's close cross can be pressed, px: a
 * phone has none, a framed pane's is in the title row, a borderless one's
 * over the top row.
 */
export function crossDepth(where: { phone: boolean; framed: boolean; rowH: number }): number {
  if (where.phone) return 0;
  return where.framed ? FRAMED_CROSS : where.rowH + BORDERLESS_CROSS;
}

/** Below this three tabs do not stand under each other. */
const TABS_STACK_MIN = 18;
/** Below this the tabs go down beside the bars. */
const TABS_MIN = 9;

/** The least width of a tab for a finger. */
const TOUCH_TAB = 26;
/** How far the landscape column's grip reaches into the pane (phone.css .wc-ph-side-grip). */
export const PHONE_GRIP = 16;

/** `ALERTNESS`, the widest Status label. */
const STATUS_LABEL_EM = 7.1;
/** The icon before a Status label, with its gap. */
const STATUS_ICON_EM = 1.9;
/** `MOVES`, the widest bar label. */
const VITAL_LABEL_EM = 4.35;
/** STATUS, STATS and LORE under each other. */
const TABS_EM = 11.7;
/** STATUS. */
const TAB_EM = 4.7;

export type CardMode = 'large' | 'medium' | 'small';

export interface CardBox {
  w: number;
  h: number;
  /** The terminal font's size, px. */
  px: number;
  /** The terminal font's advance, em. */
  adv: number;
  lock: CharacterHeight;
  /** The name's width in the title font, em. */
  nameEm: number;
  /** Of the bars' numbers (`vitalDigits`). */
  digits: number;
  /** Where the phone shows the pane: its strip, or the landscape column. */
  phone?: 'strip' | 'side' | undefined;
  /** `crossDepth`: what the close cross takes of the top right. Default 0. */
  cross?: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `full`: icon and label over the value; `text`: no icon; `inline`: icon beside the value; `value`: the value alone. */
export type StatusForm = 'full' | 'text' | 'inline' | 'value';

export interface CardLayout {
  mode: CardMode;
  /** The chrome's scale: 1 at a 15 px font. */
  scale: number;
  left: Rect & {
    form: 'column' | 'row' | 'none';
    namePx: number;
    nameW: number;
    /** The portrait's diameter, 0: none. */
    disc: number;
    ring: number;
    icon: number;
    iconGap: number;
  };
  main: Rect;
  /** `marks`: no words, under each other. `row`: no words, side by side. */
  tabs: Rect & { form: 'vertical' | 'stacked' | 'marks' | 'row'; px: number };
  status: {
    cols: 4 | 2 | 1;
    form: StatusForm;
    labelPx: number;
    valuePx: number;
    /** What a value may be long. */
    chars: number;
    /** No room for the pending mark after the label. */
    tight: boolean;
  };
  info: {
    /** What the line with the data's age may be long, 0: no room for it. */
    ageChars: number;
    agePx: number;
    dense: boolean;
    /** Age and senses side by side. */
    side: boolean;
    /** The modifiers' row labels over their values. */
    narrowAge: boolean;
    shieldCols: number;
    shield: number;
    abilityCols: number;
    senseCols: number;
    loreCols: number;
    valuePx: number;
  };
  foot: Rect & {
    pad: number;
    gap: number;
    inset: number;
    bar: number;
    /** The bar in a fight: its room is always kept. */
    fightBar: number;
    arrow: number;
    form: VitalForm;
    /** The labels fit. */
    labels: boolean;
    numberPx: number;
    labelPx: number;
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** Down to a tenth of a px. */
const down = (v: number): number => Math.floor(v * 10) / 10;

/** A glyph's width at `px` in either browser (see the file header). */
function glyphW(px: number, adv: number): number {
  return Math.max(px * adv, Math.round(px * adv), Math.round(Math.round(px) * adv));
}

/** The largest size at which `chars` glyphs fit in `room`. */
function pxFor(room: number, chars: number, adv: number): number {
  let px = Math.floor((room / (chars * adv)) * 10) / 10;
  while (px > 0 && glyphW(px, adv) * chars > room) px = Math.round((px - 0.1) * 10) / 10;
  return Math.max(0, px);
}

export function cardMode(w: number, h: number, lock: CharacterHeight): CardMode {
  if (lock !== 'auto') return lock;
  if (w >= LARGE_MIN.w && h >= LARGE_MIN.h) return 'large';
  return w >= MEDIUM_MIN.w && h >= MEDIUM_MIN.h ? 'medium' : 'small';
}

/** The box each mode's chrome is drawn for at scale 1. */
const DRAWN_FOR: Readonly<Record<CardMode, { w: number; h: number }>> = {
  large: { w: 420, h: 164 },
  medium: { w: 270, h: 124 },
  small: { w: 170, h: 64 },
};

export function cardLayout(b: CardBox): CardLayout {
  const { w, h, adv } = b;
  const mode = cardMode(w, h, b.lock);
  const design = DRAWN_FOR[mode];
  // The player's font sets the scale, the box limits it.
  const k = clamp(Math.min(clamp(b.px / 15, 0.8, 1.8), w / design.w, h / design.h), 0.6, 1.8);
  const cellW = b.px * adv;
  const pad = Math.min(cellW * 0.4, w * 0.03);

  let foot = footLayout(b, k, cellW, pad);
  const top = h >= 90 ? Math.round(3 * k) : 0;
  const body = Math.max(0, Math.floor(foot.y - Math.min(5 * k, h * 0.04) - top));

  const cross = b.cross ?? 0;
  const bottom = top + body;
  const tabsY = Math.min(Math.max(top, cross), h);
  // No room for them over the bars: down beside them.
  const beside = cross > 0 && bottom - tabsY < TABS_MIN;
  const tabs = tabsLayout(w, Math.max(0, (beside ? h : bottom) - tabsY), tabsY, k, b.phone);
  const gap = Math.round(Math.min(12 * k, w * 0.03));
  if (beside) foot = footLayout({ ...b, w: Math.max(0, tabs.x - Math.max(gap, 2)) }, k, cellW, pad);
  const left = leftLayout(b, mode, k, { x: pad, y: top, h: body, room: tabs.x - pad - 2 * gap });
  const mainX = Math.round(left.form === 'none' ? pad : left.x + left.w + gap);
  // Low and with no border, what the area holds would be under the cross's row.
  const underCross = cross > FRAMED_CROSS && body < 2.6 * cross && bottom - cross >= 9;
  const mainY = underCross ? Math.max(top, cross) : top;
  const main: Rect = { x: mainX, y: mainY, w: Math.max(0, Math.floor(tabs.x - gap - mainX)), h: bottom - mainY };

  return { mode, scale: k, left, main, tabs, status: statusLayout(b, mode, k, main), info: infoLayout(b, k, main), foot };
}

function footLayout(b: CardBox, k: number, cellW: number, pad: number): CardLayout['foot'] {
  const { w, h, adv } = b;
  const bar = Math.round(clamp(Math.min(18 * k, h * 0.2), Math.min(5, h), 34));
  const fightBar = Math.round(clamp(Math.min(bar + 3 * k, h * 0.26), bar, h));
  const arrow = h >= 24 ? Math.round(Math.min(4.5 * k, h * 0.07)) : 0;
  const high = Math.min(h, fightBar + arrow);
  const gap = Math.min(cellW * 0.7, w * 0.04);
  const col = Math.max(0, (w - 2 * pad - 2 * gap) / 3);
  const inset = Math.min(6 * k, col * 0.05, bar * 0.4);
  const inner = col - 2 * inset;

  const pick = (): { form: VitalForm; px: number; labels: boolean } => {
    const best = Math.min(11.5 * k, bar * 0.72);
    const wide = (form: VitalForm, px: number): number => {
      const label = px * 0.82 * VITAL_LABEL_EM + 3;
      const d = b.digits;
      const value = glyphW(px, adv) * d;
      const small = glyphW(px * 0.88, adv);
      if (form === 'full') return label + value + small * (d + 3);
      if (form === 'tight') return label + value + small * (d + 1);
      if (form === 'value') return label + value;
      return value;
    };
    for (const form of ['full', 'tight', 'value', 'number'] as const) {
      for (const shrink of [1, 0.88, 0.8]) {
        const px = best * shrink;
        if ((px >= 7 || (shrink === 1 && form === 'number')) && wide(form, px) <= inner) {
          return { form, px, labels: form !== 'number' || px * 0.82 * VITAL_LABEL_EM <= inner };
        }
      }
    }
    return { form: 'number', px: Math.min(best, pxFor(inner, b.digits, adv)), labels: false };
  };
  const { form, px, labels } = pick();
  return { x: 0, y: h - high, w, h: high, pad, gap, inset, bar, fightBar, arrow, form, labels, numberPx: down(px), labelPx: down(px * 0.82) };
}

function tabsLayout(w: number, body: number, top: number, k: number, phone: CardBox['phone']): CardLayout['tabs'] {
  let form: CardLayout['tabs']['form'] = 'marks';
  let px = 0;
  let wide = Math.round(Math.min(Math.max(9, 10 * k), w * 0.14));
  const vertical = Math.min(9 * k, (body - 16 * k) / TABS_EM);
  if (vertical >= 6.5 && w >= 120) {
    form = 'vertical';
    px = down(vertical);
    wide = Math.ceil(px + 9 * k);
  } else {
    const stacked = Math.min(8 * k, (body - 4) / 3 / 1.2);
    if (stacked >= 6 && w >= 230) {
      form = 'stacked';
      px = down(stacked);
      wide = Math.ceil(px * TAB_EM + 8);
    }
  }
  if (form === 'marks' && body < TABS_STACK_MIN) {
    form = 'row';
    wide = Math.round(Math.min(3 * Math.max(10, 11 * k), w * 0.33));
  }
  if (phone) wide = Math.max(wide, Math.min(TOUCH_TAB, Math.round(w * 0.14)));
  const clear = phone === 'side' ? Math.min(PHONE_GRIP, w * 0.08) : 0;
  return { form, px, x: w - clear - wide, y: top, w: wide, h: body };
}

function leftLayout(b: CardBox, mode: CardMode, k: number, at: { x: number; y: number; h: number; room: number }): CardLayout['left'] {
  const { x, y, h: body, room } = at;
  const none: CardLayout['left'] = { x, y, w: 0, h: body, form: 'none', namePx: 0, nameW: 0, disc: 0, ring: 0, icon: 0, iconGap: 0 };
  if (body < 10) return none;

  const most = Math.min(room - 34, Math.max(b.w * 0.44, 90));
  const gap = Math.max(1, Math.round(2.5 * k));
  const iconsW = (i: number): number => 5 * (i + 2) + 5 * gap + 1;
  /** The largest icon whose row fits in `wide`. */
  const iconFor = (wide: number): number => (wide - 5 * gap - 1) / 5 - 2;
  const wanted = (mode === 'large' ? 16 : mode === 'medium' ? 15 : 14) * k;
  let icon = Math.floor(Math.min(wanted, iconFor(most), body * 0.45));
  if (icon < 8) return none;

  const namePx = (mode === 'large' ? 16 : mode === 'medium' ? 14.5 : 13) * k;
  const nameH = namePx * 1.15;
  const space = 3 * k;
  // A very long name gets an ellipsis before it gets unreadable.
  const fitted = (px: number, wide: number): number => down(Math.max(Math.min(px, 9.5), Math.min(px, wide / Math.max(1, b.nameEm))));
  const base = { x, y, h: body, iconGap: gap };
  const least = Math.min((mode === 'large' ? 108 : 96) * k, most);

  if (mode !== 'small') {
    const ringWanted = (mode === 'large' ? 32 : 26) * k;
    // The halo round the disc, the ring that hangs below it.
    const high = body - nameH - (icon + 4) - 2 * space - 5 * k;
    const wide = Math.min(most - 8 * k, mode === 'large' ? Math.min(Math.max(100 * k, b.w * 0.17), Math.max(b.w * 0.24, 84 * k)) : Math.min(64 * k, b.h * 0.36));
    const disc = Math.floor(Math.min(wide, high - ringWanted * 0.375, high / 1.1));
    if (disc >= 30) {
      const ring = Math.round(Math.min(ringWanted, Math.max(20, disc * 0.45)));
      const col = Math.ceil(Math.max(disc + 8 * k, iconsW(icon), least));
      return { ...base, w: col, form: 'column', namePx: fitted(namePx, col), nameW: col, disc, ring, icon };
    }
  }

  const ringHigh = Math.min((mode === 'large' ? 34 : 30) * k, body - nameH - (icon + 4) - 2 * space, most);
  if (ringHigh >= 20) {
    const col = Math.ceil(Math.max(iconsW(icon), least));
    return { ...base, w: col, form: 'column', namePx: fitted(namePx, col), nameW: col, disc: 0, ring: Math.floor(ringHigh), icon };
  }

  // Ring beside name and icons: two lines high.
  let px = Math.min(namePx, body * 0.42);
  icon = Math.floor(Math.min(icon, body * 0.5 - 2));
  px = Math.min(px, (body - icon - 3) / 1.15);
  if (icon < 6 || px < 5) return none;
  let ring = Math.floor(Math.min(30 * k, body));
  const beside = Math.round(4 * k);
  if (ring + beside + iconsW(icon) > most) {
    ring = Math.floor(Math.min(ring, Math.max(14, most * 0.24)));
    icon = Math.floor(Math.min(icon, iconFor(most - ring - beside)));
    if (icon < 6) return none;
  }
  const nameW = Math.ceil(Math.max(iconsW(icon), Math.min(b.nameEm * px, most - ring - beside)));
  return { ...base, w: ring + beside + nameW, form: 'row', namePx: fitted(px, nameW), nameW, disc: 0, ring, icon };
}

function statusLayout(b: CardBox, mode: CardMode, k: number, main: Rect): CardLayout['status'] {
  const { adv } = b;
  const want = Math.min(b.px * (mode === 'large' ? 1.12 : 1.02), 22 * k);
  const label = 8.5 * k;

  const at = (cols: 4 | 2 | 1, form: StatusForm): CardLayout['status'] => {
    const inner = main.w / cols - 6;
    const high = main.h / (4 / cols) - 1;
    let labelPx = 0;
    let room = inner;
    let value = high / 1.2;
    if (form === 'full' || form === 'text') {
      labelPx = Math.min(label, inner / (STATUS_LABEL_EM + (form === 'full' ? STATUS_ICON_EM : 0)));
      // The label's line (the icon is taller), its gap, the value.
      value = (high - labelPx * (form === 'full' ? 1.85 : 1.55)) / 1.2;
    }
    const iconEm = form === 'inline' ? 1.3 : 0;
    /** The size for `n` glyphs. */
    const sized = (n: number): number => (iconEm ? pxFor((inner * n * adv) / (n * adv + iconEm), n, adv) : pxFor(inner, n, adv));
    let px = Math.min(want, value, sized(5));
    // A little smaller where that gives the words whole.
    for (const n of [7, 6]) {
      const whole = sized(n);
      if (whole < px && whole >= want * 0.78) {
        px = whole;
        break;
      }
    }
    const valuePx = down(Math.max(0, px));
    room -= valuePx * iconEm;
    const chars = valuePx > 0 ? Math.max(0, Math.floor(room / glyphW(valuePx, adv) + 1e-3)) : 0;
    const tight = labelPx * (STATUS_LABEL_EM + (form === 'full' ? STATUS_ICON_EM : 0) + 2.4) > inner;
    return { cols, form, labelPx: down(labelPx), valuePx, chars, tight };
  };

  for (const [cols, share] of [
    [4, 0.72],
    [2, 0.6],
    [1, 0.6],
  ] as const) {
    for (const form of ['full', 'text'] as const) {
      const s = at(cols, form);
      if (s.labelPx >= 6.3 && s.valuePx >= Math.max(9, want * share)) return s;
    }
  }
  let best: CardLayout['status'] | null = null;
  for (const form of ['inline', 'value'] as const) {
    for (const cols of [4, 2, 1] as const) {
      const s = at(cols, form);
      if (!best || s.valuePx > best.valuePx) best = s;
    }
    if (best!.valuePx >= 8.5) break;
  }
  return best!;
}

function infoLayout(b: CardBox, k: number, main: Rect): CardLayout['info'] {
  const { w, h } = main;
  const gap = 4 * k;
  const shieldCols = w >= 4 * 30 * k ? 4 : w >= 2 * 30 * k ? 2 : 1;
  const shield = down(Math.max(Math.min(52 * k, w / shieldCols - 2, Math.max(34 * k, h * 0.28)), 8));
  const each = 25 * k;
  const abilityCols = [7, 4, 3, 2].find((n) => (w - (n - 1) * gap) / n >= each) ?? 1;
  const side = w >= 320 * k;
  const ageW = side ? (w - gap) * 0.565 : w;
  const sensesW = side ? w - gap - ageW : w;
  // Dense below what the tab needs at its full measure: side by side, or stacked.
  const dense = h < (side ? 226 : 310) * k;
  const agePx = down(Math.max(8, 9 * k));
  // A narrow area gets smaller words before they break inside.
  const valuePx = Math.max(8.5, Math.min(b.px * 0.93, (dense ? 12.8 : 14.5) * k, pxFor(w - 12 * k, 10, b.adv)));
  // As the mockup's auto-fill.
  const loreEach = (w < 300 * k ? 96 : w < 400 * k ? 103 : 118) * k;
  return {
    ageChars: h >= 46 ? Math.floor(w / glyphW(agePx, b.adv)) : 0,
    agePx,
    dense,
    side,
    narrowAge: ageW < 180 * k,
    shieldCols,
    shield,
    abilityCols,
    senseCols: sensesW >= 134 * k ? 2 : 1,
    loreCols: clamp(Math.floor((w + gap) / (loreEach + gap)), 1, 6),
    valuePx: down(valuePx),
  };
}
