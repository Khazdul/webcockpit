// The Character card's sizes (stage 77 part D, ADR 0166 point 38; the
// round 12–15 look, ADR 0166 addenda 16, 22 and 24). Pure: everything
// follows from the content box in px, the terminal font's size and advance,
// the height lock and the number of stones. Nothing follows from the tab or
// the fight, so neither moves a box.
//
//   +-----------+------------------------------+---+
//   | +-------+ | MOOD | CASTS | ALERT | WEIGHT | S |  the status cells
//   | | Rasta | |  (OB)  (DB)  (PB)  (ABS)     | T |  the D&D shields
//   | |  o o  | |                              | L |
//   | +----(73) |                              |   |
//   | i i i i i | + s s s s s s +3     3g 94s  |   |  the stones, the purse
//   +-----------+------------------------------+---+
//   | HP   187 / 270 | MANA  93 / 111 | MOVES  98 / 122 |
//   +--------------------------------------------------+
//
// - Boxes are absolute and never overlap: what does not fit gets smaller,
//   then simpler, then is left out.
// - Left column: the square iron portrait (the name in its top band, the
//   level ring on its bottom right corner) and the five icons under it,
//   while the portrait is at least `PORTRAIT_MIN`; else name, ring and icons
//   under each other, else beside the ring (until F2c's compact card). It
//   is left out only where five icons would leave the tab's area nothing.
// - The status area (`areaLayout`, the mockups' `solve`, step 0): the four
//   cells, the shields under them as large as fit (1 × 4 or 2 × 2), the
//   stones at the bottom in as many rows as they need while the shields
//   stay at least `SHIELD_MIN`, then fewer rows and `+n`. Stats keeps the
//   same rows. Where not even that fits: one row, smaller shields, none;
//   and with no room for the cells the old forms of Status fill the area.
//   F2c puts its steps 1–4 and the compact card in `areaLayout`.
// - The values' room is counted in the font's advance, so nothing is
//   measured.
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
import { type PurseMetrics, stonesPerRow } from './character-stones';

/** The least content box of Large and of Medium, px. */
export const LARGE_MIN = { w: 400, h: 160 } as const;
export const MEDIUM_MIN = { w: 210, h: 106 } as const;

/** The least portrait side, px: below it the ring column (F2c: the compact card). */
export const PORTRAIT_MIN = 44;
/** The least shield while the stones take another row (ADR 0166 point 120). */
export const SHIELD_MIN = 30;
/** Below this a shield is left out (below step 0, until F2c's steps). */
const SHIELD_LEAST = 16;

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
/** `WEIGHT`, the widest short Status label (`ALERT`). */
const STATUS_SHORT_EM = 5.1;
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
  /** The stones (`StoneView.stones.length`). Default 0. */
  stones?: number;
  /** The herblore `+` is drawn (`StoneView.canStartHerb`). Default false. */
  add?: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * `cells`: the round 12 row of four framed cells (label over value, the step
 * meter), 4 or 2 a row. Where the cells do not fit, part D's forms fill the
 * area: `full` icon and label over the value; `text` no icon; `inline` icon
 * beside the value; `value` the value alone.
 */
export type StatusForm = 'cells' | 'full' | 'text' | 'inline' | 'value';

export interface CardLayout {
  mode: CardMode;
  /** The chrome's scale: 1 at a 15 px font. */
  scale: number;
  left: Rect & {
    /** `portrait`: the square frame; `column`/`row`: the ring without it. */
    form: 'portrait' | 'column' | 'row' | 'none';
    namePx: number;
    nameW: number;
    /** The portrait's side with its frame, 0: none. */
    disc: number;
    /** The frame's iron, px. */
    frame: number;
    /** The frame's corner radius, px. */
    radius: number;
    /** The name band's height inside the frame, px. */
    nameH: number;
    /** Where the frame, the ring and the icons stand in the column (portrait form). */
    discX: number;
    ringX: number;
    ringY: number;
    iconsX: number;
    iconsY: number;
    ring: number;
    icon: number;
    iconGap: number;
  };
  main: Rect;
  /** `marks`: no words, under each other. `row`: no words, side by side. */
  tabs: Rect & { form: 'vertical' | 'stacked' | 'marks' | 'row'; px: number };
  status: StatusLayout;
  /** Status' shields and stones, and the stones Stats shares (`areaLayout`). */
  area: AreaLayout;
  info: {
    /** What the line with the data's age may be long, 0: no room for it. */
    ageChars: number;
    agePx: number;
    dense: boolean;
    /** Age and senses side by side. */
    side: boolean;
    /** The modifiers' row labels over their values. */
    narrowAge: boolean;
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
    arrow: number;
    form: VitalForm;
    /** The labels fit. */
    labels: boolean;
    numberPx: number;
    labelPx: number;
  };
}

export interface StatusLayout {
  form: StatusForm;
  cols: 4 | 2 | 1;
  labelPx: number;
  valuePx: number;
  /** What a value may be long. */
  chars: number;
  /** No room for the pending mark after the label. */
  tight: boolean;
  /** `cells`: the short labels (`ALERT`). */
  short: boolean;
  /** `cells`: the cells' height with their rows, px (the other forms: the area's). */
  h: number;
  /** `cells`: between cells, px. */
  gap: number;
}

export interface AreaLayout {
  /** Between the cells and the shields, and the shields and the stones, px. */
  gapTop: number;
  gapBottom: number;
  /** A shield's height, px; 0: no shields. Its width is 40/48 of it. */
  shield: number;
  shieldCols: 4 | 2;
  /** The shields' room under the cells, px. */
  shieldsH: number;
  /** The shield's label under it, px. */
  shieldLabelPx: number;
  stones: {
    /** A stone's icon, px (square); the bar under it; between stones and rows. */
    size: number;
    bar: number;
    gap: number;
    /** Rows (0: no room for the stones), places a row, the rows' height. */
    rows: number;
    per: number;
    height: number;
  };
  /** The purse's sizes (`purseFit`), and its font, px. */
  purse: PurseMetrics & { font: number };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** Down to a tenth of a px. */
const down = (v: number): number => Math.floor(v * 10) / 10;

/** A glyph's width at `px` in either browser (see the file header). */
export function glyphW(px: number, adv: number): number {
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

/**
 * Each mode's sizes at scale 1 (the mockups' `SZ`): the five icons, a stone,
 * a status value, the largest shield, and the least width the portrait
 * leaves the status area.
 */
const SIZES: Readonly<Record<CardMode, { icon: number; stone: number; value: number; shield: number; area: number }>> = {
  large: { icon: 14, stone: 13, value: 11.5, shield: 64, area: 250 },
  medium: { icon: 12, stone: 12, value: 9.5, shield: 54, area: 150 },
  small: { icon: 12, stone: 12, value: 9.5, shield: 54, area: 150 },
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

  const cells = cellsLayout(b, mode, k, main);
  const status: StatusLayout = cells ?? { ...statusLayout(b, mode, k, main), short: false, h: main.h, gap: 0 };
  const area = areaLayout({ mode, k, adv, main, status: cells ? cells.h : null, stones: b.stones ?? 0, add: b.add ?? false });
  const infoH = Math.max(0, main.h - (area.stones.rows > 0 ? area.stones.height + area.gapBottom : 0));
  return { mode, scale: k, left, main, tabs, status, area, info: infoLayout(b, k, { ...main, h: infoH }), foot };
}

function footLayout(b: CardBox, k: number, cellW: number, pad: number): CardLayout['foot'] {
  const { w, h, adv } = b;
  const bar = Math.round(clamp(Math.min(18 * k, h * 0.2), Math.min(5, h), 34));
  const arrow = h >= 24 ? Math.round(Math.min(4.5 * k, h * 0.07)) : 0;
  const high = Math.min(h, bar + arrow);
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
  return { x: 0, y: h - high, w, h: high, pad, gap, inset, bar, arrow, form, labels, numberPx: down(px), labelPx: down(px * 0.82) };
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
  const at0 = { x, y, h: body, frame: 0, radius: 0, nameH: 0, discX: 0, ringX: 0, ringY: 0, iconsX: 0, iconsY: 0 };
  const none: CardLayout['left'] = { ...at0, w: 0, form: 'none', namePx: 0, nameW: 0, disc: 0, ring: 0, icon: 0, iconGap: 0 };
  if (body < 10) return none;

  const most = Math.min(room - 34, Math.max(b.w * 0.44, 90));
  const gap = Math.max(1, Math.round(2.5 * k));
  const iconsW = (i: number): number => 5 * (i + 2) + 5 * gap + 1;
  /** The largest icon whose row fits in `wide`. */
  const iconFor = (wide: number): number => (wide - 5 * gap - 1) / 5 - 2;
  const sizes = SIZES[mode];
  let icon = Math.floor(Math.min(sizes.icon * k, iconFor(most), body * 0.45));
  if (icon < 8) return none;
  // A very long name gets an ellipsis before it gets unreadable.
  const fitted = (px: number, wide: number, least: number): number => down(Math.max(Math.min(px, least), Math.min(px, wide / Math.max(1, b.nameEm))));
  const base = { ...at0, iconGap: gap };

  if (mode !== 'small') {
    // The mockups' `attempt`: the ring follows the portrait, which follows the room left.
    const icH = icon + 4;
    const under = Math.round(2 * k);
    let p = 150 * k;
    let ring = 0;
    let over = 0;
    for (let i = 0; i < 4; i++) {
      ring = Math.round(clamp(p * 0.3, 20 * k, 34 * k));
      // What of the ring hangs out below and to the right of the frame.
      over = ring - Math.round(ring * 0.72);
      p = Math.floor(Math.min(body - over - icH - under, room - sizes.area * k - over, most - over, 150 * k));
    }
    if (p >= PORTRAIT_MIN) {
      const w = Math.ceil(Math.max(p + over, iconsW(icon)));
      const discX = Math.max(0, Math.min(Math.round((w - p) / 2), w - p - over));
      const frame = Math.max(2, Math.min(Math.round(3 * k), Math.round(p * 0.065)));
      const nameH = Math.round(clamp(p * 0.15, 12 * k, 19 * k));
      const namePx = clamp(Math.round(nameH * 0.62), 8 * k, 12 * k);
      const nameW = p - 2 * frame;
      return {
        ...base,
        w,
        form: 'portrait',
        namePx: fitted(namePx, nameW - 8 * k, 7.5),
        nameW,
        disc: p,
        frame,
        radius: Math.round(clamp(p * 0.11, 6, 13 * k)),
        nameH,
        discX,
        ringX: discX + p - Math.round(ring * 0.72),
        ringY: p - Math.round(ring * 0.72),
        iconsX: Math.floor((w - iconsW(icon)) / 2),
        iconsY: p + over + under,
        ring,
        icon,
      };
    }
  }

  const namePx = (mode === 'large' ? 16 : mode === 'medium' ? 14.5 : 13) * k;
  const nameH = namePx * 1.15;
  const space = 3 * k;
  const least = Math.min((mode === 'large' ? 108 : 96) * k, most);

  const ringHigh = Math.min((mode === 'large' ? 34 : 30) * k, body - nameH - (icon + 4) - 2 * space, most);
  if (ringHigh >= 20) {
    const col = Math.ceil(Math.max(iconsW(icon), least));
    return { ...base, w: col, form: 'column', namePx: fitted(namePx, col, 9.5), nameW: col, disc: 0, ring: Math.floor(ringHigh), icon };
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
  return { ...base, w: ring + beside + nameW, form: 'row', namePx: fitted(px, nameW, 9.5), nameW, disc: 0, ring, icon };
}

/** A cell's padding each side, px; the step meter's room beside the value at scale 1 (character.css). */
export const CELL_PAD = 2;
export const CELL_METER = 7;

/**
 * The round 12 status cells (ADR 0166 point 86): four in a row, else two;
 * small labels over the value, the step meter at the right. Null: they do
 * not fit (part D's forms then fill the area).
 */
function cellsLayout(b: CardBox, mode: CardMode, k: number, main: Rect): StatusLayout | null {
  const { adv } = b;
  const gap = Math.max(2, Math.round(3 * k));
  const want = SIZES[mode].value * k;
  for (const cols of [4, 2] as const) {
    const cw = (main.w - (cols - 1) * gap) / cols;
    const room = cw - 2 * CELL_PAD - CELL_METER * k;
    let valuePx = down(want);
    let chars = Math.floor(room / glyphW(valuePx, adv) + 1e-3);
    // Four characters at least (`agg.`), a little smaller where that gives them.
    if (chars < 4) {
      valuePx = Math.min(valuePx, pxFor(room, 4, adv));
      chars = 4;
    }
    if (valuePx < 7) continue;
    let labelPx = down(Math.max(6.3, 7 * k));
    const inner = cw - 2 * CELL_PAD;
    const short = labelPx * STATUS_LABEL_EM > inner;
    if (short) labelPx = down(Math.min(labelPx, inner / STATUS_SHORT_EM));
    if (labelPx < 5.5) continue;
    const rows = 4 / cols;
    // The label, its gap, the value, 3.5 px above and below.
    const cellH = Math.ceil(labelPx + valuePx + 10 * k);
    const h = rows * cellH + (rows - 1) * gap;
    if (h > main.h) continue;
    return { form: 'cells', cols, labelPx, valuePx, chars, tight: false, short, h, gap };
  }
  return null;
}

type OldStatus = Omit<StatusLayout, 'short' | 'h' | 'gap'>;

/** Part D's Status forms, filling the area: where the cells do not fit. */
function statusLayout(b: CardBox, mode: CardMode, k: number, main: Rect): OldStatus {
  const { adv } = b;
  const want = Math.min(b.px * (mode === 'large' ? 1.12 : 1.02), 22 * k);
  const label = 8.5 * k;

  const at = (cols: 4 | 2 | 1, form: Exclude<StatusForm, 'cells'>): OldStatus => {
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
  let best: OldStatus | null = null;
  for (const form of ['inline', 'value'] as const) {
    for (const cols of [4, 2, 1] as const) {
      const s = at(cols, form);
      if (!best || s.valuePx > best.valuePx) best = s;
    }
    if (best!.valuePx >= 8.5) break;
  }
  return best!;
}

/** What `areaLayout` reads. */
export interface AreaInput {
  mode: CardMode;
  k: number;
  adv: number;
  main: Rect;
  /** The cells' height, or null: no cells (part D's forms fill the area, nothing else shows). */
  status: number | null;
  /** The stones, and the herblore `+`. */
  stones: number;
  add: boolean;
}

/** The largest shield in `w` × `h` (its label under it), 1 × 4 or 2 × 2 by what gives the larger (the mockups' `shieldSize`). */
export function shieldSize(w: number, h: number, most: number, k: number): { size: number; cols: 4 | 2 } {
  const gap = 3 * k;
  const label = 9 * k;
  const fit = (rows: number, cols: number): number => {
    const cw = (w - (cols - 1) * gap) / cols;
    const ch = (h - (rows - 1) * gap) / rows - label;
    return Math.floor(Math.min(ch, ((cw * 48) / 40) * 0.92, most));
  };
  const row = fit(1, 4);
  const square = fit(2, 2);
  return square > row * 1.12 ? { size: square, cols: 2 } : { size: row, cols: 4 };
}

/**
 * Status' area under the cells (the mockups' `solve`, step 0, ADR 0166
 * points 86 and 120): the stones in as many rows as they need while the
 * shields stay at least `SHIELD_MIN`, else fewer rows (`+n`); the shields
 * get the rest. Below step 0: one row and the shields as they come, none
 * under `SHIELD_LEAST`, no stones where a row does not fit. Always a row
 * while it fits, empty or not: the purse may stand in it, and the first
 * stone moves nothing. Pure.
 */
export function areaLayout(a: AreaInput): AreaLayout {
  const { mode, k, adv, main } = a;
  const sizes = SIZES[mode];
  const size = Math.max(8, Math.round(sizes.stone * k));
  const bar = Math.max(3, Math.round(3 * k));
  const gap = Math.max(2, Math.round(2 * k));
  const stoneH = size + bar;
  const per = stonesPerRow(main.w, size, gap);
  const font = down(size * 0.8);
  const purse = { coin: Math.round(size * 0.92), font, charW: glyphW(font, adv), inner: Math.max(2, Math.round(2 * k)), gap: Math.round(6 * k), margin: Math.round(6 * k) };
  const gapTop = Math.round(4 * k);
  const gapBottom = Math.round(3 * k);
  const shieldLabelPx = down(Math.max(6, 7 * k));
  const rowsH = (rows: number): number => (rows > 0 ? rows * (stoneH + gap) - gap : 0);
  const out = (rows: number, shield: number, cols: 4 | 2, shieldsH: number): AreaLayout => ({
    gapTop,
    gapBottom,
    shield,
    shieldCols: cols,
    shieldsH: shield > 0 ? Math.max(0, Math.floor(shieldsH)) : 0,
    shieldLabelPx,
    stones: { size, bar, gap, rows, per, height: rowsH(rows) },
    purse,
  });
  if (a.status === null) return out(0, 0, 4, 0);
  const cells = a.status;
  const most = Math.round(k * clamp((main.h / k) * 0.3, sizes.shield, 72));
  const rest = (rows: number): number => main.h - cells - gapTop - rowsH(rows) - gapBottom;
  const need = Math.max(1, Math.ceil((a.stones + (a.add ? 1 : 0)) / per));
  for (let rows = need; rows >= 1; rows--) {
    const s = shieldSize(main.w, rest(rows), most, k);
    if (s.size >= SHIELD_MIN) return out(rows, s.size, s.cols, rest(rows));
  }
  // Below step 0 (F2c's steps go here).
  if (main.h - cells - gapBottom < stoneH) return out(0, 0, 4, 0);
  const s = shieldSize(main.w, rest(1), most, k);
  return s.size >= SHIELD_LEAST ? out(1, s.size, s.cols, rest(1)) : out(1, 0, 4, 0);
}

function infoLayout(b: CardBox, k: number, main: Rect): CardLayout['info'] {
  const { w, h } = main;
  const gap = 4 * k;
  const each = 25 * k;
  const abilityCols = [7, 4, 3, 2].find((n) => (w - (n - 1) * gap) / n >= each) ?? 1;
  const side = w >= 320 * k;
  const ageW = side ? (w - gap) * 0.565 : w;
  const sensesW = side ? w - gap - ageW : w;
  // Dense below what the tab needs at its full measure: side by side, or stacked.
  const dense = h < (side ? 170 : 250) * k;
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
    abilityCols,
    senseCols: sensesW >= 134 * k ? 2 : 1,
    loreCols: clamp(Math.floor((w + gap) / (loreEach + gap)), 1, 6),
    valuePx: down(valuePx),
  };
}
