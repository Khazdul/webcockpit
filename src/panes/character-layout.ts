// The Character card's sizes (stage 77 part D, ADR 0166 point 38; the
// round 12–15 look, ADR 0166 addenda 16, 22, 24 and 25). Pure: everything
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
//   The compact card (no portrait, no ring, no name, no tabs):
//   +--------------------------------------------------+
//   | M aggr | C norm | A norm | W hvy   /137 /-1 /39 /43 |  line 1
//   | i i i i i  + s s s s s s +3            3g 94s    |  line 2
//   | HP   187 / 270 | MANA  93 / 111 | MOVES  98 / 122 |
//   +--------------------------------------------------+
//
// - Boxes are absolute and never overlap: what does not fit gets smaller,
//   then simpler, then is left out.
// - Left column: the square iron portrait (the name in its top band, the
//   level ring on its bottom right corner) and the five icons under it,
//   while the portrait is at least `PORTRAIT_MIN`; else the compact card
//   (`compactLayout`), whose line 2 holds the icons.
// - The status area with the portrait (`areaLayout`, the mockups' `solve`):
//   the first of steps 0–4 that fits. 0: the cells, the shields as large as
//   fit (1 × 4 or 2 × 2), the stones in as many rows as they need while the
//   shields stay at least `SHIELD_MIN`, then fewer rows and `+n`; 1: one
//   row, the shields down to `SHIELD_LOW`; 2: the cells on one line; 3: the
//   shields as chips; 4: the values without cells, smaller stones. Stats
//   keeps the same rows.
// - The tabs only where the content above the vitals is at least `TAB_MIN`
//   high; below that only Status shows (`TabState.low`).
// - The tabs are folder tabs (round 20 G8, stage 77 H10): under the hood
//   from `TAB_SWITCH` px of content, on the sheet's right edge below it;
//   the chosen one is cut from the same sheet as the content (the cells
//   and the shields, Stats, Lore), the others lie behind. The sheet is
//   `SHEET_PAD` inside, the stones' row under it (`folioPaths`). The words
//   where they are at least `TAB_WORD_MIN`, else I, II, III.
// - The vitals' bars are lower in a low pane (`barCap`).
// - The values' room is counted in the font's advance, so nothing is
//   measured.
// - Nothing to press stands under the pane's close cross (`crossDepth`):
//   the tabs begin below it, and in a low pane with no border the tab's
//   area does too, as the cross's row is the content's first.
// - On a phone the tabs are wide enough for a finger, and in the landscape
//   column they stand clear of the resize band's grip.
// - The vitals' columns are Group's: 0.4 cell of padding, 0.7 of gap.
// - No mana (a troll, `CardBox.mana` false; stage 77 H9): no mana bar (HP
//   and moves take the width) and no Casts cell (Mood, Alertness and
//   Weight take its room), at every step and in the compact card.
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

/** The least portrait side, px: below it the compact card (ADR 0166 points 124, 126). */
export const PORTRAIT_MIN = 44;
/** The least shield while the stones take another row (ADR 0166 point 120). */
export const SHIELD_MIN = 30;
/** Steps 1 and 2: the shields down to this (point 124). */
export const SHIELD_LOW = 22;
/** The least content above the vitals for the tabs, px (point 125). */
export const TAB_MIN = 80;
/** The tabs' words at least, px; below it the tabs show I, II, III (ADR 0166 addendum 32). */
export const TAB_WORD_MIN = 8;
/** From this much content above the vitals the tabs stand under the hood, below it on the right edge (round 20). */
export const TAB_SWITCH = 110;
/** The sheet's padding round its content, and its gap to the stones' row, at scale 1 (round 20 G8). */
export const SHEET_PAD = 5;
export const SHEET_GAP = 4;
/** With the tabs on the right, what of the area's height stays above the stones' rows at scale 1: three tabs of 14 px. */
const TAB_LEAST = 46;
/** With the tabs on the right (a low pane), the sheet's padding at scale 1. */
export const SHEET_PAD_LOW = 2;
/** The sheet's and the tabs' corner radius, px. */
const SHEET_R = 3;
/** A tab behind is this share of the chosen one's depth (round 20 `idep`). */
export const TAB_BACK = 0.78;

/**
 * The vitals' bars at most, px, below a content box this high (point 124:
 * 14 px under a 150 px pane, 12 under 110, 10 under 90; the mockups' pane is
 * the window with 28 px of padding around the content box).
 */
const BAR_CAPS: readonly (readonly [number, number])[] = [
  [62, 10],
  [82, 12],
  [122, 14],
];

/** From each of `BAR_CAPS`' heights the cap grows by this per px (ADR 0166 addendum 29). */
const BAR_RAMP = 0.5;

/**
 * The vitals' bar height at most for a content box `h` px high. From each
 * threshold the cap grows in (half a px per px) instead of at once, so a
 * growing pane never loses content height to its bars (a 6 px step at 122
 * px cost a step of the status area).
 */
export function barCap(h: number): number {
  const [first, ...rest] = BAR_CAPS;
  if (h < first![0]) return first![1];
  let at = first![0];
  let cap = first![1];
  for (const [below, next] of [...rest, [Infinity, 34] as const]) {
    // Between `at` and `below` the cap grows from the one under `at` to this one's.
    if (h < below) return Math.min(next, Math.floor(cap + (h - at) * BAR_RAMP));
    at = below;
    cap = next;
  }
  return 34;
}

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

/** The least width of a tab for a finger. */
const TOUCH_TAB = 26;
/** How far the landscape column's grip reaches into the pane (phone.css .wc-ph-side-grip). */
export const PHONE_GRIP = 16;

/** `ALERTNESS`, the widest Status label. */
const STATUS_LABEL_EM = 7.1;
/** `WEIGHT`, the widest short Status label (`ALERT`). */
const STATUS_SHORT_EM = 5.1;
/** `ABS`, the widest shield label (Cinzel Bold, 0.08em tracking). */
const CHIP_LABEL_EM = 2.6;
/** `MOVES`, the widest bar label. */
const VITAL_LABEL_EM = 4.35;
/** STATUS, STATS and LORE in Cinzel Bold with 0.14em tracking, em (round 20, measured in Chromium). */
const TAB_EM = [4.75, 3.8, 3.37] as const;
const TABS_EM = TAB_EM[0] + TAB_EM[1] + TAB_EM[2];
/** A capital set upright, with its tracking, em (the longest word, STATUS, has 6). */
const TAB_CAP_EM = 0.92;

export type CardMode = 'large' | 'medium' | 'small';

/** The portrait steps 0–4 (point 124), or the compact card (point 126). */
export type CardStep = 0 | 1 | 2 | 3 | 4 | 'compact';

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
  /** The character has mana (`CharView.mana`): false hides the mana bar and the Casts cell. Default true. */
  mana?: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The Status forms: `cells` the framed cells, label over value, the heat
 * track at the foot, 4 or 2 a row (steps 0–1); `line` the cells on one line, the label
 * beside the value where there is room (steps 2–3); `plain` the values with
 * no cells (step 4); `compact` the compact card's letter and value.
 */
export type StatusForm = 'cells' | 'line' | 'plain' | 'compact';

/**
 * The shields as chips (steps 3–4, and the compact card): `shape` the
 * shield's outline, label and value; `label` label and value; `value` the
 * value alone; `icon` the shield's icon and the value (the compact card).
 */
export type ChipForm = 'shape' | 'label' | 'value' | 'icon';

export interface CardLayout {
  mode: CardMode;
  /** The mana bar and the Casts cell are drawn (`CardBox.mana`). */
  mana: boolean;
  /** The chrome's scale: 1 at a 15 px font. */
  scale: number;
  step: CardStep;
  left: Rect & {
    /** `portrait`: the square frame; `none`: the compact card (the icons are in its line 2). */
    form: 'portrait' | 'none';
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
    /** Where the frame, the ring and the icons stand in the column. */
    discX: number;
    ringX: number;
    ringY: number;
    iconsX: number;
    iconsY: number;
    ring: number;
    /** The five icons' size and gap (the compact card's too). */
    icon: number;
    iconGap: number;
  };
  /**
   * The area's box: with the tabs on, the sheet (and the stones' row under
   * it), the tab strip or column outside it.
   */
  main: Rect;
  /** What the area holds inside the sheet's padding (`main` with no tabs). */
  content: Rect;
  /**
   * `on`: shown (point 125). `side`: under the hood (`top`) or on the
   * sheet's right edge. `words`: the words, `px` high (set upright on the
   * right); else I, II, III, `num` px (`numBack` behind). `items`: each
   * tab's box in this one, the chosen tab's depth (`depth`).
   */
  tabs: Rect & {
    on: boolean;
    side: 'top' | 'right';
    words: boolean;
    px: number;
    num: number;
    numBack: number;
    depth: number;
    items: Rect[];
  };
  /**
   * The sheet (round 20 G8): `pad` inside it round the content, `gap` to
   * the stones' row; `box` the sheet, its tabs and the stones' row (the
   * drawing's box, `folioPaths`). Off (`pad` 0) without tabs. `whole`:
   * the stones' row lies on the sheet, which never ends above it (the tabs
   * on the right would be too short beside the sheet alone).
   */
  sheet: { on: boolean; pad: number; gap: number; box: Rect; whole: boolean };
  status: StatusLayout;
  /** Status' shields and stones, and the stones Stats shares (`areaLayout`, `compactLayout`). */
  area: AreaLayout;
  /**
   * The compact card's line 1: the status' width, the room before the
   * shields, the letter's gap; `flat`: the 13 px rows without cells. Null:
   * not compact.
   */
  compact: { cellsW: number; mid: number; letterGap: number; flat: boolean } | null;
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
  /** Cells a row: all of them (4, or 3 without Casts) or 2. */
  cols: number;
  /** The label's size, px (0: no label). */
  labelPx: number;
  valuePx: number;
  /** What a value may be long. */
  chars: number;
  /** The short labels (`ALERT`). */
  short: boolean;
  /** `line`: the label beside the value. */
  label: boolean;
  /** The status' height with its rows, px. */
  h: number;
  /** Between cells, px. */
  gap: number;
}

export interface ChipLayout {
  form: ChipForm;
  /** The chips' height, px. */
  h: number;
  /** The value's size and room, px; the label's size. */
  px: number;
  room: number;
  labelPx: number;
  /** The `icon` form's icon, px. */
  icon: number;
  gap: number;
}

export interface AreaLayout {
  /** Steps 0–4, or the compact card. */
  step: CardStep;
  /** Between the status and the shields, and the shields and the stones, px. */
  gapTop: number;
  gapBottom: number;
  /** A shield's height, px; 0: no shields (or chips). Its width is 40/48 of it. */
  shield: number;
  shieldCols: 4 | 2;
  /** The shields' room under the cells, px. */
  shieldsH: number;
  /** The shield's label under it, px. */
  shieldLabelPx: number;
  /** Steps 3–4 and the compact card: the shields as chips. Null: none. */
  chips: ChipLayout | null;
  /** Steps 3–4: what is left of the height is shared between the rows. */
  even: boolean;
  stones: {
    /** Where the stones begin and their width, px (the compact card: after its icons). */
    x: number;
    w: number;
    /** A stone's icon, px (square); the bar under it; between stones and rows. */
    size: number;
    bar: number;
    gap: number;
    /** Rows (0: no room for the stones), places a row, the box's height. */
    rows: number;
    per: number;
    height: number;
  };
  /** The compact card's line 2 is drawn (the icons, then the stones). */
  line2: boolean;
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
  if (room <= 0) return 0;
  let px = Math.floor((room / (chars * adv)) * 10) / 10;
  while (px > 0 && glyphW(px, adv) * chars > room) px = Math.round((px - 0.1) * 10) / 10;
  return Math.max(0, px);
}

export function cardMode(w: number, h: number, lock: CharacterHeight): CardMode {
  if (lock !== 'auto') return lock;
  if (w >= LARGE_MIN.w && h >= LARGE_MIN.h) return 'large';
  return w >= MEDIUM_MIN.w && h >= MEDIUM_MIN.h ? 'medium' : 'small';
}

/** The least scale a low box gives (ADR 0166 addendum 25): below it the steps simplify instead. */
const LOW_SCALE = 0.85;

/**
 * The box the chrome is drawn for at scale 1, for every mode (ADR 0166
 * addendum 29): one scale, so a growing pane never gets smaller words. Each
 * mode had its own before (Medium 270 × 124, Large 420 × 164), and the
 * scale fell where a pane grew into the next mode (Medium from 106 px high
 * at 0.855 after Small's 1.0 and more). The modes keep their own sizes.
 */
const DRAWN_FOR = { w: 170, h: 64 } as const;

/**
 * The chrome's scale for the box: the player's font, limited by the box,
 * a low one only down to `LOW_SCALE` (the steps and the compact card take
 * the height). Never smaller in a larger box, whatever the mode.
 */
export function cardScale(w: number, h: number, px: number): number {
  return clamp(Math.min(clamp(px / 15, 0.8, 1.8), w / DRAWN_FOR.w, Math.max(h / DRAWN_FOR.h, LOW_SCALE)), 0.6, 1.8);
}

/**
 * Each mode's sizes at scale 1 (the mockups' `SZ`): the five icons, a stone,
 * a status value, the largest shield, and the least width the portrait
 * leaves the status area. Small (Auto below Medium's box) has Medium's.
 */
const SIZES: Readonly<Record<CardMode, { icon: number; stone: number; value: number; shield: number; area: number }>> = {
  large: { icon: 14, stone: 13, value: 11.5, shield: 64, area: 250 },
  medium: { icon: 12, stone: 12, value: 9.5, shield: 54, area: 150 },
  small: { icon: 12, stone: 12, value: 9.5, shield: 54, area: 150 },
};

/** The five icons' row: its width for an icon of `icon` px. */
const iconsWidth = (icon: number, gap: number): number => 5 * (icon + 2) + 5 * gap + 1;
/** The largest icon whose row fits in `wide`. */
const iconFor = (wide: number, gap: number): number => (wide - 5 * gap - 1) / 5 - 2;

/** A step's order, better first (the compact card last). */
const stepOrder = (s: CardStep): number => (s === 'compact' ? 5 : s);

/**
 * The card's boxes. The tabs stand under the hood from `TAB_SWITCH` px of
 * content where that costs the area no step against the right edge (the
 * strip takes height, the column width): so a growing pane never takes a
 * step back where the tabs move up (ADR 0166 addendum 32).
 */
export function cardLayout(b: CardBox): CardLayout {
  const l = placed(b, null);
  if (!l.tabs.on || l.tabs.side !== 'top') return l;
  const r = placed(b, 'right');
  return stepOrder(l.step) <= stepOrder(r.step) ? l : r;
}

/** The tabs' least length on the right edge, px at scale 1: shorter, the column starts below the cross's row. */
const TAB_SHORTEST = 10;

/** With the tabs on the right, where the cross's row leaves them too short (a large font, no border), the sheet starts below that row. */
function placed(b: CardBox, force: 'right' | null): CardLayout {
  const l = layoutAt(b, force, false);
  if (!l.tabs.on || l.tabs.side !== 'right' || !(b.cross ?? 0) || l.tabs.items.every((r) => r.h >= TAB_SHORTEST * l.scale)) return l;
  return layoutAt(b, force, true);
}

function layoutAt(b: CardBox, force: 'right' | null, lower: boolean): CardLayout {
  const { w, h } = b;
  const mode = cardMode(w, h, b.lock);
  const k = cardScale(w, h, b.px);
  const cellW = b.px * b.adv;
  const pad = Math.min(cellW * 0.4, w * 0.03);

  const mana = b.mana ?? true;
  /** The status cells: Mood, Casts, Alertness, Weight; no Casts without mana. */
  const n = mana ? 4 : 3;
  const foot = footLayout(b, k, cellW, pad, mana ? 3 : 2);
  // A margin over the area from about 90 px, growing in (a step at once would cost a low portrait its room).
  const top = Math.round(clamp((h - 86) / 8, 0, 1) * 3 * k);
  const body = Math.max(0, Math.floor(foot.y - Math.min(5 * k, h * 0.04) - top));

  const cross = b.cross ?? 0;
  const bottom = top + body;
  const gap = Math.round(Math.min(12 * k, w * 0.03));
  const clear = b.phone === 'side' ? Math.min(PHONE_GRIP, w * 0.08) : 0;
  // Point 125: the tabs only where the content is at least TAB_MIN high; under the hood from TAB_SWITCH (round 20).
  const side: 'top' | 'right' | null = body < TAB_MIN ? null : body >= TAB_SWITCH && force === null ? 'top' : 'right';
  const on = side !== null;
  // A low pane's sheet (the tabs on the right) is padded less: the round's 5 px cost its area a step where the tabs come.
  const sp = !on ? 0 : side === 'top' ? Math.max(3, Math.round(SHEET_PAD * k)) : Math.max(2, Math.round(SHEET_PAD_LOW * k));
  const sg = on ? Math.max(2, Math.round(SHEET_GAP * k)) : 0;
  const th = side === 'top' ? Math.round((b.phone ? 18 : 15) * k) : 0;
  let tw = side === 'right' ? Math.round((b.phone ? 22 : 18) * k) : 0;
  if (side === 'right' && b.phone) tw = Math.max(tw, Math.min(TOUCH_TAB, Math.round(w * 0.14)));
  // On the right the tabs stand at the card's edge; else the sheet keeps the pad.
  const folioRight = side === 'right' ? w - clear : w - clear - pad;
  const left = leftLayout(b, mode, k, { x: pad, y: top, h: body, room: folioRight - tw - 2 * sp - pad - gap });
  const compact = left.form === 'none';
  const mainX = Math.round(compact ? pad : left.x + left.w + gap);
  // Low and with no border, what the area holds would be under the cross's row.
  const underCross = cross > FRAMED_CROSS && body < 2.6 * cross && bottom - cross >= 9;
  const folioW = Math.max(0, Math.floor(folioRight - mainX));
  // The strip under the hood ends clear of the cross (and, with no border, the pane's buttons). Where the words
  // then do not fit but would in the whole width, or not even the numerals fit, it goes under the cross's row.
  let reserve = side === 'top' ? crossReserve(cross, cellW) : 0;
  if (reserve > 0) {
    const whole = folioW - 2 * Math.round(6 * k);
    const beside = Math.min(whole, w - reserve - mainX - Math.round(6 * k));
    const words = (room: number): boolean => stripWords(room, k, b.phone) >= TAB_WORD_MIN;
    if ((!words(beside) && words(whole)) || beside < 42 * k) reserve = 0;
  }
  const lowered = side === 'top' ? cross > 0 && reserve === 0 : underCross || lower;
  const mainY = lowered ? Math.max(top, Math.ceil(cross)) : top;
  const main: Rect = { x: mainX, y: mainY + th, w: Math.max(0, folioW - tw), h: Math.max(0, bottom - mainY - th) };
  const content: Rect = { x: main.x + sp, y: main.y + sp, w: Math.max(0, main.w - 2 * sp), h: Math.max(0, main.h - 2 * sp) };
  // With the tabs on the right: three tabs of 14 px stay above the stones, below the cross (in the content's height).
  const tabLeast = Math.round(TAB_LEAST * k) + Math.max(0, Math.ceil(cross - main.y) - Math.round(3 * k)) - 2 * sp;

  const stones = b.stones ?? 0;
  const add = b.add ?? false;
  let status: StatusLayout;
  let area: AreaLayout;
  let line1: CardLayout['compact'] = null;
  if (compact) {
    const c = compactLayout(b, mode, content, stones, add, n, side === 'right' ? tabLeast : 0);
    status = c.status;
    area = c.area;
    line1 = { cellsW: c.cellsW, mid: c.mid, letterGap: c.letterGap, flat: c.flat };
    left.icon = c.icon;
    left.iconGap = c.iconGap;
  } else {
    const cells = cellsLayout(b, mode, k, content, n);
    const line = lineLayout(b, mode, k, content, n);
    const plain = plainLayout(b, mode, k, content, n);
    area = areaLayout({ mode, k, adv: b.adv, main: content, heights: { cells: cells?.h ?? null, line: line?.h ?? null, plain: plain.h }, stones, add, sheet: on ? { gap: sg, w: main.w, least: side === 'right' ? tabLeast : 0 } : undefined });
    status = area.step === 0 || area.step === 1 ? cells! : area.step === 2 || area.step === 3 ? line! : plain;
  }
  const stonesH = area.stones.rows > 0 || area.line2 ? area.stones.height + area.gapBottom : 0;
  const at = (short: number): CardLayout['tabs'] => (side !== null ? tabsLayout({ side, main, th, tw, k, phone: b.phone, cross, reserve, w, short }) : offTabs(w - clear, top));
  let tabs = at(Math.max(0, main.h - stonesH));
  // Too short on the right beside the sheet alone (a large font, the cross's row): the sheet takes the stones' row too.
  const whole = tabs.side === 'right' && tabs.on && stonesH > 0 && tabs.items.some((r) => r.h < TAB_SHORTEST * k);
  if (whole) tabs = at(main.h);
  const box: Rect = on ? { x: main.x, y: main.y - th, w: main.w + tw, h: main.h + th } : { ...main };
  const sheet = { on, pad: sp, gap: sg, box, whole };
  const infoH = Math.max(0, content.h - stonesH);
  return { mode, mana, scale: k, step: area.step, left, main, content, tabs, sheet, status, area, compact: line1, info: infoLayout(b, k, { ...content, h: infoH }), foot };
}

function footLayout(b: CardBox, k: number, cellW: number, pad: number, bars: number): CardLayout['foot'] {
  const { w, h, adv } = b;
  const bar = Math.round(clamp(Math.min(18 * k, h * 0.2, barCap(h)), Math.min(5, h), 34));
  const arrow = h >= 24 ? Math.round(Math.min(4.5 * k, h * 0.07)) : 0;
  const high = Math.min(h, bar + arrow);
  const gap = Math.min(cellW * 0.7, w * 0.04);
  const col = Math.max(0, (w - 2 * pad - (bars - 1) * gap) / bars);
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

const offTabs = (x: number, y: number): CardLayout['tabs'] => ({ on: false, side: 'right', words: false, px: 0, num: 0, numBack: 0, depth: 0, items: [], x, y, w: 0, h: 0 });

/** How far left of the card's right edge the top strip ends: the pane's close cross, and with no border its buttons too, in cells. */
const CROSS_CELLS = { framed: 4, borderless: 11 } as const;

/** What the top strip leaves at the card's right for the pane's cross (and buttons), px. */
const crossReserve = (cross: number, cellW: number): number => (cross === 0 ? 0 : (cross > FRAMED_CROSS ? CROSS_CELLS.borderless : CROSS_CELLS.framed) * cellW);

/** The words' size in a top strip with `avail` px for the tabs (round 20: 6 px of padding and slant each side of a word). */
function stripWords(avail: number, k: number, phone: CardBox['phone']): number {
  const room = Math.max(0, avail + 2 * Math.round(3 * k));
  return Math.min((phone ? 10 : 9) * k, (room - 6 * 8 * k) / TABS_EM);
}

/**
 * The folder tabs (round 20 G8, ADR 0166 addendum 32). Under the hood:
 * from 6 px in, each the word's width with a slanted side, 3 px over the
 * next; the words at `TAB_WORD_MIN` or more, else I, II, III a third of
 * the room each. The strip ends clear of the pane's cross (and, with no
 * border, its buttons) by `reserve`, or (0) it is under the cross's row.
 * On the right: three equal tabs down the sheet's edge as high as the
 * sheet is above the stones (`short`), from below the cross.
 */
function tabsLayout(o: {
  side: 'top' | 'right';
  main: Rect;
  th: number;
  tw: number;
  k: number;
  phone: CardBox['phone'];
  cross: number;
  /** What the strip leaves at the card's right for the cross (`crossReserve`); 0: it is under the cross's row. */
  reserve: number;
  w: number;
  short: number;
}): CardLayout['tabs'] {
  const { side, main, k } = o;
  const most = (o.phone ? 10 : 9) * k;
  if (side === 'top') {
    const m0 = Math.round(6 * k);
    const ov = Math.round(3 * k);
    const sl = 4 * k;
    const avail = Math.min(main.w - 2 * m0, o.reserve > 0 ? o.w - o.reserve - main.x - m0 : Infinity);
    const y = main.y - o.th;
    const room = Math.max(0, avail + 2 * ov);
    const fs = stripWords(avail, k, o.phone);
    const words = fs >= TAB_WORD_MIN;
    const px = words ? down(fs) : 0;
    const padX = Math.min(10 * k, (room - TABS_EM * px) / 6 - sl);
    const ws = words ? TAB_EM.map((e) => Math.floor(e * px + 2 * (padX + sl))) : [0, 1, 2].map(() => Math.floor(room / 3));
    const items: Rect[] = [];
    let x = m0;
    for (const tw of ws) {
      items.push({ x, y: 0, w: tw, h: o.th });
      x += tw - ov;
    }
    return { on: true, side, words, px, ...numerals(o.th, k), depth: o.th, items, x: main.x, y, w: main.w, h: o.th };
  }
  const m0 = Math.max(Math.round(3 * k), Math.ceil(o.cross - main.y));
  const m1 = Math.round(3 * k);
  const g = Math.round(2 * k);
  const len = Math.max(0, (o.short - m0 - m1 - 2 * g) / 3);
  const fs = Math.min(most, o.tw - 8 * k, (len - 8 * k) / (6 * TAB_CAP_EM));
  const words = fs >= TAB_WORD_MIN;
  const items: Rect[] = [0, 1, 2].map((i) => ({ x: 0, y: m0 + i * (len + g), w: o.tw, h: len }));
  return { on: true, side, words, px: words ? down(fs) : 0, ...numerals(o.tw, k), depth: o.tw, items, x: main.x + main.w, y: main.y, w: o.tw, h: o.short };
}

/** I, II, III: the chosen tab's and those behind, by the tabs' depth (round 20 `small`). */
function numerals(depth: number, k: number): { num: number; numBack: number } {
  const at = (d: number): number => down(clamp(d - 7 * k, 6, 11 * k));
  return { num: at(depth), numBack: at(depth * TAB_BACK) };
}

/** A corner of the sheet's outline: x, y and its radius. */
type Corner = readonly [number, number, number];

/** A closed outline with rounded corners. */
function roundPath(P: readonly Corner[]): string {
  const n = P.length;
  const f = (v: number): string => String(Math.round(v * 100) / 100);
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = P[(i + n - 1) % n]!;
    const c = P[i]!;
    const q = P[(i + 1) % n]!;
    const l1 = Math.hypot(p[0] - c[0], p[1] - c[1]);
    const l2 = Math.hypot(q[0] - c[0], q[1] - c[1]);
    const r = Math.min(c[2], l1 / 2, l2 / 2);
    const ax = l1 ? c[0] + ((p[0] - c[0]) / l1) * r : c[0];
    const ay = l1 ? c[1] + ((p[1] - c[1]) / l1) * r : c[1];
    const bx = l2 ? c[0] + ((q[0] - c[0]) / l2) * r : c[0];
    const by = l2 ? c[1] + ((q[1] - c[1]) / l2) * r : c[1];
    d += `${i ? 'L' : 'M'}${f(ax)} ${f(ay)}Q${f(c[0])} ${f(c[1])} ${f(bx)} ${f(by)}`;
  }
  return `${d}Z`;
}

/** The outline moved `by` px inwards (clockwise on the screen). */
function insetPoly(P: readonly Corner[], by: number): Corner[] {
  const n = P.length;
  return P.map((c, i) => {
    const p = P[(i + n - 1) % n]!;
    const q = P[(i + 1) % n]!;
    const l1 = Math.hypot(c[0] - p[0], c[1] - p[1]) || 1;
    const l2 = Math.hypot(q[0] - c[0], q[1] - c[1]) || 1;
    // The inward normals of the edges into and out of the corner.
    const n1x = -(c[1] - p[1]) / l1;
    const n1y = (c[0] - p[0]) / l1;
    const n2x = -(q[1] - c[1]) / l2;
    const n2y = (q[0] - c[0]) / l2;
    const dn = 1 + n1x * n2x + n1y * n2y;
    const m = dn < 0.05 ? 0 : by / dn;
    return [c[0] + (n1x + n2x) * m, c[1] + (n1y + n2y) * m, Math.max(0.5, c[2] - by)] as const;
  });
}

/**
 * The sheet's drawing in `sheet.box` (round 20 G8): `ground` the sheet with
 * the chosen tab cut from it, `edge` its outline 1 px in (the light line),
 * `back` the other tabs' shapes (behind it, in tab order, '' for the chosen
 * one). `stones`: the stones' row is shown, so the sheet ends above it;
 * else (Lore, Stats without the row) it reaches the area's foot. Pure; the
 * card calls it when the layout, the tab or the row changes.
 */
export function folioPaths(l: CardLayout, chosen: number, stones: boolean): { ground: string; edge: string; back: string[] } {
  const { tabs, sheet, main } = l;
  if (!sheet.on || !tabs.on) return { ground: '', edge: '', back: [] };
  const top = tabs.side === 'top';
  const S = { x: main.x - sheet.box.x, y: main.y - sheet.box.y, w: main.w, h: Math.max(4, main.h - (stones && !sheet.whole ? stonesHeight(l) : 0)) };
  // The strip or column in the box's coordinates.
  const ox = tabs.x - sheet.box.x;
  const oy = tabs.y - sheet.box.y;
  const profile = (r: Rect, depth: number, behind: boolean): Corner[] => {
    const L = top ? r.w : r.h;
    const s = Math.min(4 * l.scale, L * 0.14);
    // A tab behind reaches 3 px under the sheet, so no seam shows at its foot.
    const base = behind ? -3 : 0;
    const P: Corner[] = [
      [0, base, 2.5],
      [s, depth, 3],
      [L - s, depth, 3],
      [L, base, 2.5],
    ];
    // Along the strip from the left (top) or down the column (right), outwards from the sheet.
    return P.map(([u, v, rr]): Corner => (top ? [ox + r.x + u, S.y - v, rr] : [S.x + S.w + v, oy + r.y + u, rr]));
  };
  const TL: Corner = [S.x, S.y, SHEET_R];
  const TR: Corner = [S.x + S.w, S.y, SHEET_R];
  const BR: Corner = [S.x + S.w, S.y + S.h, SHEET_R];
  const BL: Corner = [S.x, S.y + S.h, SHEET_R];
  const it = tabs.items[chosen] ?? tabs.items[0]!;
  const act = profile(it, tabs.depth, false);
  const poly = top ? [TL, ...act, TR, BR, BL] : [TL, TR, ...act, BR, BL];
  const back = tabs.items.map((r, i) => (i === chosen ? '' : roundPath(profile(r, tabs.depth * TAB_BACK, true))));
  return { ground: roundPath(poly), edge: roundPath(insetPoly(poly, 1)), back };
}

/** The stones' row under the sheet with its gap, px (0: no row). */
export function stonesHeight(l: CardLayout): number {
  return l.area.stones.rows > 0 || l.area.line2 ? l.area.stones.height + l.area.gapBottom : 0;
}

/**
 * The portrait column (the mockups' `attempt`), or `none` where the portrait
 * would be under `PORTRAIT_MIN`: then the compact card fills the area. Small
 * tries it too (with Medium's sizes and its own scale).
 */
function leftLayout(b: CardBox, mode: CardMode, k: number, at: { x: number; y: number; h: number; room: number }): CardLayout['left'] {
  const { x, y, h: body, room } = at;
  const at0 = { x, y, h: body, frame: 0, radius: 0, nameH: 0, discX: 0, ringX: 0, ringY: 0, iconsX: 0, iconsY: 0 };
  const none: CardLayout['left'] = { ...at0, w: 0, form: 'none', namePx: 0, nameW: 0, disc: 0, ring: 0, icon: 0, iconGap: 0 };
  if (body < 10) return none;

  const most = Math.min(room - 34, Math.max(b.w * 0.44, 90));
  const gap = Math.max(1, Math.round(2.5 * k));
  const sizes = SIZES[mode];
  const icon = Math.floor(Math.min(sizes.icon * k, iconFor(most, gap), body * 0.45));
  if (icon < 8) return none;
  // A very long name gets an ellipsis before it gets unreadable.
  const fitted = (px: number, wide: number, least: number): number => down(Math.max(Math.min(px, least), Math.min(px, wide / Math.max(1, b.nameEm))));

  // The ring follows the portrait, which follows the room left.
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
  if (p < PORTRAIT_MIN) return none;
  const w = Math.ceil(Math.max(p + over, iconsWidth(icon, gap)));
  const discX = Math.max(0, Math.min(Math.round((w - p) / 2), w - p - over));
  const frame = Math.max(2, Math.min(Math.round(3 * k), Math.round(p * 0.065)));
  const nameH = Math.round(clamp(p * 0.15, 12 * k, 19 * k));
  const namePx = clamp(Math.round(nameH * 0.62), 8 * k, 12 * k);
  const nameW = p - 2 * frame;
  return {
    ...at0,
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
    iconsX: Math.floor((w - iconsWidth(icon, gap)) / 2),
    iconsY: p + over + under,
    ring,
    icon,
    iconGap: gap,
  };
}

/**
 * A cell's padding each side, px; the room the value keeps from the corner
 * mark at scale 1 (character.css). The step meter at the right (7 px) went
 * with round 16 C: the heat track lies in the cell's foot padding, so the
 * value has the cell's width (ADR 0166 addendum 30).
 */
export const CELL_PAD = 2;
export const CELL_MARK = 3;

/**
 * Steps 0–1, the round 12 status cells (ADR 0166 point 86): four in a row,
 * else two; small labels over the value, the heat track at the foot. Null:
 * they do not fit.
 */
function cellsLayout(b: CardBox, mode: CardMode, k: number, main: Rect, n: number): StatusLayout | null {
  const { adv } = b;
  const gap = Math.max(2, Math.round(3 * k));
  const want = SIZES[mode].value * k;
  for (const cols of [n, 2]) {
    const cw = (main.w - (cols - 1) * gap) / cols;
    const room = cw - 2 * CELL_PAD - CELL_MARK * k;
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
    const rows = Math.ceil(n / cols);
    // The label, its gap, the value, 3.5 px above and below.
    const cellH = Math.ceil(labelPx + valuePx + 10 * k);
    const h = rows * cellH + (rows - 1) * gap;
    if (h > main.h) continue;
    return { form: 'cells', cols, labelPx, valuePx, chars, short, label: true, h, gap };
  }
  return null;
}

/**
 * Steps 2–3: the four cells on one line (the mockups' `statusRow` `one`),
 * the heat track at the foot; the label beside the value where a cell is at
 * least 64 px and four characters stay, else the value only. Null: not
 * even four characters fit.
 */
function lineLayout(b: CardBox, mode: CardMode, k: number, main: Rect, n: number): StatusLayout | null {
  const { adv } = b;
  const gap = Math.max(2, Math.round(3 * k));
  const cw = (main.w - (n - 1) * gap) / n;
  const room = cw - 2 * CELL_PAD - CELL_MARK * k;
  let valuePx = down(SIZES[mode].value * k);
  if (glyphW(valuePx, adv) * 4 > room) valuePx = pxFor(room, 4, adv);
  if (valuePx < 7) return null;
  const fit = (r: number): number => Math.floor(r / glyphW(valuePx, adv) + 1e-3);
  const labelPx = down(Math.max(6.3, 7 * k));
  let label = false;
  let short = false;
  let chars = fit(room);
  if (cw >= 64 * k) {
    for (const [em, s] of [
      [STATUS_LABEL_EM, false],
      [STATUS_SHORT_EM, true],
    ] as const) {
      const n = fit(room - labelPx * em - 4 * k);
      if (n >= 4) {
        label = true;
        short = s;
        chars = n;
        break;
      }
    }
  }
  return { form: 'line', cols: n, labelPx: label ? labelPx : 0, valuePx, chars, short, label, h: Math.ceil(valuePx + 8.5 * k), gap };
}

/** Step 4: the values without cells (the mockups' `statusRow` `mini`). */
function plainLayout(b: CardBox, mode: CardMode, k: number, main: Rect, n: number): StatusLayout {
  const { adv } = b;
  const gap = Math.max(2, Math.round(2 * k));
  const room = Math.max(0, (main.w - (n - 1) * gap) / n - 2 * CELL_PAD);
  let valuePx = Math.max(7, down(Math.min(SIZES[mode].value, 9.5) * k));
  if (glyphW(valuePx, adv) * 4 > room) valuePx = Math.max(6.5, pxFor(room, 4, adv));
  const chars = Math.max(0, Math.floor(room / glyphW(valuePx, adv) + 1e-3));
  return { form: 'plain', cols: n, labelPx: 0, valuePx, chars, short: false, label: false, h: Math.ceil(valuePx + 4.5 * k), gap };
}

/**
 * The shields as four chips in `w` (steps 3–4, the compact card): the first
 * of `forms` whose value keeps three digits at 7 px or more. Null: none fits.
 */
function chipLayout(w: number, h: number, k: number, adv: number, want: number, forms: readonly ChipForm[], icon = 0): ChipLayout | null {
  const gap = Math.max(2, Math.round(3 * k));
  const labelPx = down(Math.max(6, 7 * k));
  const space = Math.round(3 * k);
  for (const form of forms) {
    // The compact card's chips have no ground, so 1 px of padding (character.css).
    let room = (w - 3 * gap) / 4 - 2 * (form === 'icon' || form === 'value' ? 1 : Math.round(2 * k));
    if (form === 'shape') room -= Math.round(10 * k) + space + labelPx * CHIP_LABEL_EM + space;
    else if (form === 'label') room -= labelPx * CHIP_LABEL_EM + space;
    else if (form === 'icon') room -= icon + space;
    const r = Math.floor(room);
    const px = Math.min(down(want), pxFor(r, 3, adv));
    if (px >= 7) return { form, h, px, room: r, labelPx, icon, gap };
  }
  return null;
}

/** The purse beside stones of `size` px (`purseFit`). */
function purseOf(size: number, k: number, adv: number): AreaLayout['purse'] {
  const font = down(size * 0.8);
  return { coin: Math.round(size * 0.92), font, charW: glyphW(font, adv), inner: Math.max(2, Math.round(2 * k)), gap: Math.round(6 * k), margin: Math.round(6 * k) };
}

/** What `areaLayout` reads. */
export interface AreaInput {
  mode: CardMode;
  k: number;
  adv: number;
  main: Rect;
  /** The Status forms' heights: the cells (null: they do not fit), on one line (null: no), the values alone. */
  heights: { cells: number | null; line: number | null; plain: number };
  /** The stones, and the herblore `+`. */
  stones: number;
  add: boolean;
  /**
   * The sheet (round 20 G8): the stones' row lies under it, `gap` below its
   * padding, as wide as the sheet (`w`); `least` of the area's height
   * stays above the stones' rows (the tabs on its right edge). Absent: no
   * sheet.
   */
  sheet?: { gap: number; w: number; least: number } | undefined;
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
 * Status' area with the portrait (the mockups' `solve`, ADR 0166 points 86,
 * 120 and 124): the first step that fits. 0: the stones in as many rows as
 * they need while the shields stay at least `SHIELD_MIN`, else fewer rows
 * (`+n`); 1: one row, the shields down to `SHIELD_LOW`; 2: the same with the
 * cells on one line; 3: the shields as chips; 4: the values without cells,
 * stones of 11 px. Where not even step 4 fits, its stones go, then its
 * chips. Always a row while it fits, empty or not: the purse may stand in
 * it, and the first stone moves nothing. Pure.
 */
export function areaLayout(a: AreaInput): AreaLayout {
  const { mode, k, adv, main, heights } = a;
  const sizes = SIZES[mode];
  const bar = Math.max(3, Math.round(3 * k));
  const gap = Math.max(2, Math.round(2 * k));
  const shieldLabelPx = down(Math.max(6, 7 * k));
  const rowsH = (rows: number, size: number): number => (rows > 0 ? rows * (size + bar + gap) - gap : 0);
  const stonesW = a.sheet?.w ?? main.w;
  const out = (o: { step: CardStep; size: number; rows: number; gapTop: number; gapBottom: number; shield?: { size: number; cols: 4 | 2; h: number }; chips?: ChipLayout | null }): AreaLayout => ({
    step: o.step,
    gapTop: o.gapTop,
    gapBottom: o.gapBottom,
    shield: o.shield?.size ?? 0,
    shieldCols: o.shield?.cols ?? 4,
    shieldsH: o.shield ? Math.max(0, Math.floor(o.shield.h)) : 0,
    shieldLabelPx,
    chips: o.chips ?? null,
    even: o.step === 3 || o.step === 4,
    stones: { x: 0, w: stonesW, size: o.size, bar, gap, rows: o.rows, per: stonesPerRow(stonesW, o.size, gap), height: rowsH(o.rows, o.size) },
    line2: false,
    purse: purseOf(o.size, k, adv),
  });
  const size = Math.max(8, Math.round(sizes.stone * k));
  const slots = a.stones + (a.add ? 1 : 0);
  const most = Math.round(k * clamp((main.h / k) * 0.3, sizes.shield, 72));
  const gapTop = Math.round(4 * k);
  // Under a sheet, its gap (character.css adds the sheet's padding).
  const gapBottom = a.sheet ? a.sheet.gap : Math.round(3 * k);
  /** The shields' room under a status `status` px high with `rows` rows of stones. */
  const rest = (status: number, rows: number): number => main.h - status - gapTop - rowsH(rows, size) - gapBottom;
  const shields = (step: CardStep, status: number, rows: number, least: number): AreaLayout | null => {
    const s = shieldSize(main.w, rest(status, rows), most, k);
    return s.size >= least ? out({ step, size, rows, gapTop, gapBottom, shield: { size: s.size, cols: s.cols, h: rest(status, rows) } }) : null;
  };
  if (heights.cells !== null) {
    const need = Math.max(1, Math.ceil(slots / stonesPerRow(stonesW, size, gap)));
    for (let rows = need; rows >= 1; rows--) {
      // A sheet with its tabs on the right keeps the height of three tabs above the stones.
      if (rows > 1 && a.sheet && rowsH(rows, size) + gapBottom > main.h - a.sheet.least) continue;
      const r = shields(0, heights.cells, rows, SHIELD_MIN);
      if (r) return r;
    }
    const r = shields(1, heights.cells, 1, SHIELD_LOW);
    if (r) return r;
  }
  const chipH = Math.round(15 * k);
  const chips = chipLayout(main.w, chipH, k, adv, 10 * k, ['shape', 'label', 'value']);
  if (heights.line !== null) {
    const r = shields(2, heights.line, 1, SHIELD_LOW);
    if (r) return r;
    const g = Math.round(4 * k);
    if (chips && heights.line + g + chipH + g + rowsH(1, size) <= main.h) return out({ step: 3, size, rows: 1, gapTop: g, gapBottom: g, chips });
  }
  const small = Math.max(8, Math.round(11 * k));
  const g = Math.max(1, Math.round(2 * k));
  const plain = heights.plain;
  const room = chips ? plain + g + chipH : plain;
  if (room + g + rowsH(1, small) <= main.h) return out({ step: 4, size: small, rows: 1, gapTop: g, gapBottom: g, chips });
  if (chips && room <= main.h) return out({ step: 4, size: small, rows: 0, gapTop: g, gapBottom: g, chips });
  return out({ step: 4, size: small, rows: 0, gapTop: g, gapBottom: g });
}

/**
 * The compact card (the mockups' `compact`, ADR 0166 point 126), where the
 * portrait would be under `PORTRAIT_MIN`: line 1 the status (letter and
 * value, no meter) on the left 55 % and the shields as icon and value on the
 * right; line 2 the five icons, then the stones in the rows that fit and the
 * purse. Cells 18 px high while both lines fit, else flat 13 px rows and
 * 10 px stones; where not even that fits, line 2 goes. Sized by the font
 * alone (the box's limit is the 13 px form). What does not fit sideways:
 * the shields' icons, then the shields (the status takes the whole line),
 * then the values (the letters stay); smaller icons, then no stones beside
 * them.
 */
function compactLayout(
  b: CardBox,
  mode: CardMode,
  main: Rect,
  stones: number,
  add: boolean,
  n: number,
  /** With the tabs on the right: what of the height stays above the stones (the tabs' room). */
  tabRoom = 0,
): { status: StatusLayout; area: AreaLayout; cellsW: number; mid: number; letterGap: number; flat: boolean; icon: number; iconGap: number } {
  const { adv } = b;
  const kc = clamp(b.px / 15, 0.8, 1.8);
  const sizes = SIZES[mode];
  const W = main.w;
  const H = main.h;
  const iconGap = Math.max(1, Math.round(2.5 * kc));
  const bar = Math.max(3, Math.round(3 * kc));
  const gap = Math.max(2, Math.round(2 * kc));
  const after = Math.round(6 * kc);
  let icon = Math.floor(Math.min(sizes.icon * kc, iconFor(W * 0.6, iconGap)));
  const rowsH = (rows: number, size: number): number => (rows > 0 ? rows * (size + bar + gap) - gap : 0);

  let big = true;
  let h1 = 0;
  let g = 0;
  let size = 0;
  for (const b18 of [true, false]) {
    big = b18;
    h1 = Math.round((big ? 18 : 13) * kc);
    g = Math.round((big ? 3 : 2) * kc);
    size = Math.round((big ? sizes.stone : 10) * kc);
    if (h1 + g + Math.max(icon + 4, size + bar) <= H) break;
  }
  // Not even the low form's line 1: as high as there is room for.
  h1 = Math.min(h1, H);
  const vf = down(Math.min((big ? Math.min(sizes.value, 10) : 9) * kc, h1 * 0.72));

  // Line 1: the status on the left 55 % (more where four characters need it), the shields on the rest.
  const mid = Math.round(8 * kc);
  const cellGap = Math.max(1, Math.round(2 * kc));
  const cellPad = Math.round(2 * kc);
  // The letter and its gap (the mockups' 3 px), then the value.
  const letterGap = Math.round(3 * kc);
  const least = Math.max(7, vf * 0.8);
  /** What the cells need for the letter and four characters at `px`. */
  const forFour = (px: number): number => Math.ceil(n * (glyphW(px, adv) * 5 + letterGap + 2 * cellPad) + (n - 1) * cellGap);
  const shieldIcon = Math.round((big ? 11 : 10) * kc);
  let cellsW = W;
  let chips: ChipLayout | null = null;
  const share = Math.floor((W - mid) * 0.55);
  // Four characters with the shields, else three (`agg`), else the status takes the line.
  const forThree = Math.ceil(n * (glyphW(least, adv) * 4 + letterGap + 2 * cellPad) + (n - 1) * cellGap);
  for (const want of [Math.max(share, forFour(least)), Math.max(share, forThree)]) {
    chips = chipLayout(W - mid - want, h1, kc, adv, vf, ['icon', 'value'], shieldIcon);
    if (chips) {
      cellsW = want;
      break;
    }
  }
  const inner = (cellsW - (n - 1) * cellGap) / n - 2 * cellPad;
  let valuePx = vf;
  const letter = (px: number): number => glyphW(px, adv) + letterGap;
  const fit = (px: number): number => Math.max(0, Math.floor((inner - letter(px)) / glyphW(px, adv) + 1e-3));
  // Four characters (`aggr`, `norm`) a little smaller rather than three.
  const four = pxFor(inner - letterGap, 5, adv);
  if (fit(valuePx) < 4 && four >= least) valuePx = Math.min(valuePx, four);
  if (glyphW(valuePx, adv) > inner) valuePx = pxFor(inner, 1, adv);
  const chars = fit(valuePx);
  const status: StatusLayout = { form: 'compact', cols: n, labelPx: 0, valuePx, chars, short: false, label: false, h: h1, gap: cellGap };

  // Line 2: the icons, then the stones (at least two places beside them).
  let line2 = h1 + g + Math.max(icon + 4, size + bar) <= H;
  let x = iconsWidth(icon, iconGap) + after;
  let rows = 0;
  if (line2 && W - x < 2 * size + gap) {
    const smaller = Math.floor(iconFor(W - after - 2 * size - gap, iconGap));
    if (smaller >= 8) icon = smaller;
    else icon = Math.floor(Math.min(icon, iconFor(W, iconGap)));
    x = iconsWidth(icon, iconGap) + after;
  }
  if (icon < 6) line2 = false;
  const w2 = Math.max(0, W - x);
  if (line2 && w2 >= 2 * size + gap) {
    const per = stonesPerRow(w2, size, gap);
    const need = Math.max(1, Math.ceil((stones + (add ? 1 : 0)) / per));
    const fit = Math.max(1, Math.floor((Math.min(H - h1 - g, H - tabRoom - g) + gap) / (size + bar + gap)));
    rows = Math.min(need, fit);
  }
  const area: AreaLayout = {
    step: 'compact',
    gapTop: 0,
    gapBottom: g,
    shield: 0,
    shieldCols: 4,
    shieldsH: 0,
    shieldLabelPx: down(Math.max(6, 7 * kc)),
    chips,
    even: false,
    stones: {
      x,
      w: w2,
      size,
      bar,
      gap,
      rows,
      per: stonesPerRow(w2, size, gap),
      height: line2 ? Math.max(icon + 4, rowsH(rows, size)) : 0,
    },
    line2,
    purse: purseOf(size, kc, adv),
  };
  return { status, area, cellsW, mid, letterGap, flat: !big, icon, iconGap };
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
