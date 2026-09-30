// Bundled font families (public/fonts, @font-face in fonts.css).

import type { FontId } from '../settings/types';

export interface FontInfo {
  /** Label in the Appearance options. */
  label: string;
  /** The @font-face family name. */
  family: string;
  /** The CSS `font-family` value (with fallbacks). */
  stack: string;
  /** File names under public/fonts. */
  regular: string;
  bold: string;
  /**
   * Ink height of `█` in em, from the font file (fontTools glyph bounds /
   * unitsPerEm; see public/fonts/README.md). The cell height is this times
   * the font size, rounded down (src/theme/cells.ts).
   */
  blockEm: number;
  /** Advance width of every glyph in em (monospace), from the font file. */
  advanceEm: number;
  /** Faces ahead of the family in `stack` that replace single glyphs. */
  overrides?: readonly GlyphFace[];
}

/** A small face that replaces a few glyphs of a bundled family. */
export interface GlyphFace {
  /** The @font-face family name. */
  family: string;
  /** File names under public/fonts. */
  regular: string;
  bold: string;
  /** The characters it draws (the text `document.fonts.load` asks for). */
  text: string;
  /** The @font-face `unicode-range`. */
  unicodeRange: string;
}

/**
 * `_` of DejaVu Sans Mono, drawn higher (ADR 0043). DejaVu puts `_` in its
 * lowest descender row, which falls outside the cell at many settings
 * (the cell is lower than the font, src/theme/cells.ts). Same advance,
 * thickness and vertical metrics as DejaVu, so no line box changes.
 * Built by scripts/build-underscore-font.py.
 */
export const UNDERSCORE_FACE: GlyphFace = {
  family: 'WebCockpit Underscore',
  regular: 'WebCockpitUnderscore.woff2',
  bold: 'WebCockpitUnderscore-Bold.woff2',
  text: '_',
  unicodeRange: 'U+5F',
};

/** One font file of a family or of one of its glyph faces. */
export interface FontFaceFile {
  family: string;
  weight: 'normal' | 'bold';
  file: string;
  /** The text to load it with. */
  text: string;
  unicodeRange?: string;
}

/** Every file `id` needs: the family's regular and bold, then its glyph faces. */
export function fontFiles(id: FontId): FontFaceFile[] {
  const f = FONTS[id];
  const out: FontFaceFile[] = [
    { family: f.family, weight: 'normal', file: f.regular, text: '█' },
    { family: f.family, weight: 'bold', file: f.bold, text: '█' },
  ];
  for (const o of f.overrides ?? []) {
    out.push({ family: o.family, weight: 'normal', file: o.regular, text: o.text, unicodeRange: o.unicodeRange });
    out.push({ family: o.family, weight: 'bold', file: o.bold, text: o.text, unicodeRange: o.unicodeRange });
  }
  return out;
}

export const FONTS: Readonly<Record<FontId, FontInfo>> = {
  dejavu: {
    label: 'DejaVu Sans Mono',
    family: 'DejaVu Sans Mono',
    // The underscore face first: it only has `_` (unicode-range U+5F).
    stack: `"${UNDERSCORE_FACE.family}", "DejaVu Sans Mono", monospace`,
    regular: 'DejaVuSansMono.woff2',
    bold: 'DejaVuSansMono-Bold.woff2',
    // █ spans -512..1921 of 2048 units.
    blockEm: 2433 / 2048,
    advanceEm: 1233 / 2048,
    overrides: [UNDERSCORE_FACE],
  },
  jetbrains: {
    label: 'JetBrains Mono',
    family: 'JetBrains Mono',
    // DejaVu covers the symbols JetBrains Mono lacks (✦✧⚔♦★✖). JetBrains
    // Mono's own `_` sits inside the cell: no underscore face here.
    stack: '"JetBrains Mono", "DejaVu Sans Mono", monospace',
    regular: 'JetBrainsMonoNL-Regular.woff2',
    bold: 'JetBrainsMonoNL-Bold.woff2',
    // █ spans -300..1020 of 1000 units.
    blockEm: 1320 / 1000,
    advanceEm: 600 / 1000,
  },
};

/**
 * The CSS px font size actually used for a size setting: the setting
 * nudged so that the glyph advance is a whole number of px (ADR 0011).
 * With a fractional advance, runs of block glyphs show hairline seams
 * (Firefox positions glyphs at sub-pixel offsets; Chrome rounds hinted
 * advances past the glyph's ink). E.g. DejaVu 15 → 14.95 px (9 px cells),
 * 16 → 16.61 px (10 px cells). Neighbouring settings can map to the same
 * size; the change is at most half a pixel of cell width.
 */
export function fontPx(id: FontId, size: number): number {
  const adv = FONTS[id].advanceEm;
  const w = Math.max(1, Math.round(size * adv));
  // Four decimals: enough for the advance, and keeps float noise out of CSS.
  return Math.round((w / adv) * 1e4) / 1e4;
}

/** URL of a font file (respects Vite's `base`). */
export function fontUrl(file: string): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  return `${base.endsWith('/') ? base : base + '/'}fonts/${file}`;
}

/**
 * Adds `<link rel=preload>` for the family's regular and bold files and
 * its glyph faces, once per file. Call before the first render; only the
 * selected family.
 */
export function preloadFont(id: FontId, doc: Document = document): void {
  for (const { file } of fontFiles(id)) {
    const href = fontUrl(file);
    if (doc.head.querySelector(`link[rel="preload"][href="${href}"]`)) continue;
    const link = doc.createElement('link');
    link.rel = 'preload';
    link.as = 'font';
    link.type = 'font/woff2';
    link.crossOrigin = 'anonymous';
    link.href = href;
    doc.head.appendChild(link);
  }
}

/**
 * Resolves when the family's regular and bold faces and its glyph faces
 * are loaded (or failed
 * to load; never rejects). Resolves at once where the Font Loading API is
 * missing.
 */
export async function loadFont(id: FontId, sizePx: number, doc: Document = document): Promise<void> {
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts?.load) return;
  try {
    await Promise.all(
      fontFiles(id).map((f) => fonts.load(`${f.weight === 'bold' ? 'bold ' : ''}${sizePx}px "${f.family}"`, f.text)),
    );
  } catch {
    /* fall back to whatever the browser has */
  }
}
