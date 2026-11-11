// The phone's Text settings as pure helpers (ADR 0136 §10): the menu
// sheet's quick row and the settings page's Text group change the same
// appearance settings the desktop does (`appearance.size`, `.bg` with its
// ink and palette, `.font`). No new keys. No DOM, and no import: the font
// size limits come from the caller (the phone kit, kit.ts).

/** The two themes the phone offers: the terminal backgrounds `black` and `paper` (src/theme/presets.ts). */
export const PHONE_THEMES = [
  { value: 'black', label: 'Black', bg: '#000000' },
  { value: 'paper', label: 'Paper', bg: '#f4ecd8' },
] as const;

export type PhoneTheme = (typeof PHONE_THEMES)[number]['value'];

/** The theme a background is, or null for any other background (one set on a computer). */
export function themeOf(bg: string): PhoneTheme | null {
  const hex = bg.trim().toLowerCase();
  return PHONE_THEMES.find((t) => t.bg === hex)?.value ?? null;
}

/** The background of `theme`. */
export function themeBg(theme: PhoneTheme): string {
  return PHONE_THEMES.find((t) => t.value === theme)!.bg;
}

/** The font size limits (`FONT_SIZE_MIN` / `FONT_SIZE_MAX`). */
export interface SizeLimits {
  min: number;
  max: number;
}

/** `size` one step (`d` = −1 or +1) on, inside the font size limits. */
export function stepSize(size: number, d: number, lim: SizeLimits): number {
  const n = Number.isFinite(size) ? Math.round(size) : lim.min;
  return Math.max(lim.min, Math.min(lim.max, n + Math.sign(d)));
}

/** The screen a text size must fit: the cockpit's size in px and its cell at the current size. */
export interface ScreenFit {
  /** The cockpit's width and height in px (`height` Infinity: do not judge the rows, the keyboard is up). */
  width: number;
  height: number;
  /** The cell at `size`, px. */
  cellW: number;
  cellH: number;
  /** The font size the cell was measured at. */
  size: number;
  /** The least columns and rows of the game (the phone's too-small limit). */
  minCols: number;
  minRows: number;
}

/**
 * Whether the game still has its least columns and rows at font size
 * `next`. A cell grows with the font size; it is rounded up to whole
 * pixels here (the real grid is calibrated to whole pixels), so the answer
 * errs towards "does not fit". Unknown metrics: it fits (nothing to judge by).
 */
export function sizeFits(next: number, f: ScreenFit | null): boolean {
  if (!f || !(f.size > 0 && f.cellW > 0 && f.cellH > 0 && f.width > 0)) return true;
  // A smaller size always fits at least as well as the current one.
  if (next <= f.size) return true;
  const k = next / f.size;
  const cols = Math.floor(f.width / Math.ceil(f.cellW * k - 1e-6));
  const rows = Number.isFinite(f.height) ? Math.floor(f.height / Math.ceil(f.cellH * k - 1e-6)) : Infinity;
  return cols >= f.minCols && rows >= f.minRows;
}

/** Whether a step `d` from `size` would change it (else the key is at its end). */
export function canStep(size: number, d: number, lim: SizeLimits): boolean {
  return stepSize(size, d, lim) !== size;
}
