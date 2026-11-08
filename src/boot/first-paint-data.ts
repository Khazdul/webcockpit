// Pure parts of the first paint (src/boot/first-paint.ts, ADR 0083),
// apart so that the unit tests can import them without running it.

import { FONT_IDS, FONT_SIZE_MAX, FONT_SIZE_MIN, LEGACY_APPEARANCE, PADDING_MAX, PADDING_MIN, PADDING_STEP, PHONE_FONT_SIZE, defaultSettings } from '../settings/types';
import type { AppearanceSettings, FontId } from '../settings/types';
import { normalizeHex } from '../theme/color';

/** The appearance fields the first paint uses. */
export type FirstAppearance = Pick<AppearanceSettings, 'font' | 'size' | 'padding' | 'fg' | 'bg'>;

/** localStorage key of the appearance mirror (src/settings/store.ts MIRROR_KEY). */
export const MIRROR_KEY = 'webcockpit.appearance';

const clamp = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d;

/**
 * The appearance the settings store will start with, from the mirror's
 * text (null: none): src/settings/migrate.ts `migrateAppearance` for the
 * fields used here, without its module (it would pull most of the
 * settings code into index.html). No mirror: the defaults, a phone's on a
 * phone.
 */
export function firstAppearance(raw: string | null, phone: boolean): FirstAppearance {
  const base = defaultSettings().appearance;
  let a: unknown = null;
  try {
    a = raw ? JSON.parse(raw) : null;
  } catch {
    a = null;
  }
  if (typeof a !== 'object' || a === null || Array.isArray(a)) {
    return { font: base.font, size: phone ? PHONE_FONT_SIZE : base.size, padding: base.padding, fg: base.fg, bg: base.bg };
  }
  const d = { ...base, ...LEGACY_APPEARANCE };
  const o = a as Record<string, unknown>;
  const padding = clamp(o.padding, PADDING_MIN, PADDING_MAX, d.padding);
  return {
    font: FONT_IDS.includes(o.font as FontId) ? (o.font as FontId) : d.font,
    size: clamp(o.size, FONT_SIZE_MIN, FONT_SIZE_MAX, d.size),
    padding: padding - (padding % PADDING_STEP),
    fg: normalizeHex(o.fg) ?? d.fg,
    bg: normalizeHex(o.bg) ?? d.bg,
  };
}


/**
 * The CSS `top` of the start menu's panel (src/chrome/start.css
 * `.wc-sm-stage`): under the wordmark (`brandH`, its box's height in CSS
 * px, as the surface measures it for `--wc-brand-h`) and the gap, or 18 px
 * from the top when the wordmark is hidden (a short window).
 */
export function panelTop(brandH: number | null): string {
  return brandH === null ? '18px' : `calc(var(--wc-brand-top) + ${brandH}px + var(--wc-brand-gap))`;
}
