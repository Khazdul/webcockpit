// Terminal font families (ADR 0010 "Fonts and cell grid", ADR 0049).
//
// Every family but Lucida Console is bundled (public/fonts, sources and
// licences in public/fonts/README.md). The @font-face rules are generated
// from this table (`fontFaceCss`, installed by `installFontFaces`), so the
// CSS, the preload links, the font loading and the exported replay all
// read the same file names. A browser downloads a face only when text
// uses it, and only the selected family is preloaded.
//
// Lucida Console is proprietary: never shipped, never embedded in an
// exported replay. Its @font-face rule uses `local()` only, and it is
// offered only where `detectLocalFonts` finds it installed. Anywhere it is
// set but not available (another device, an imported profile, a recorded
// VIEW, the exported replay), DejaVu Sans Mono is used instead and the
// stored setting is kept (`effectiveFont`).

import { FONT_IDS, type FontId } from '../settings/types';

export interface FontInfo {
  /** Label in the Appearance options. */
  label: string;
  /** The @font-face family name. */
  family: string;
  /** The CSS `font-family` value (with fallbacks). */
  stack: string;
  /** File name under public/fonts (null: a local-only font, see `local`). */
  regular: string | null;
  /**
   * The bold file. Null: the family has no bold, and its bold @font-face
   * rule uses the regular file so that no browser synthesises one (a
   * synthetic bold is wider in Firefox and would break the grid).
   */
  bold: string | null;
  /** `unicode-range` of the bold file, when it covers less than the regular. */
  boldUnicodeRange?: string;
  /** `local()` names: the font is never shipped and only used when installed. */
  local?: readonly string[];
  /**
   * The cell height in em: the tallest cell that the font's `█` covers
   * where the browser puts it (src/theme/cells.ts rounds it down to whole
   * px). That is the ink height of `█` when the glyph is centred on the
   * font's ascent + descent; otherwise less (public/fonts/README.md
   * "Metrics", ADR 0049).
   */
  blockEm: number;
  /** Advance width of every glyph in em (monospace), from the font file. */
  advanceEm: number;
  /**
   * Whole-px font sizes only (`fontPx`). Chrome on Linux draws a font
   * whose `█` its hinting does not stretch at the size rounded to whole px,
   * so at a fractional size rounded down the block is narrower than the
   * cell and runs of it show seams (ADR 0049).
   */
  wholePx?: boolean;
  /**
   * The same Chrome rounding, fixed with less change (JetBrains Mono): a
   * size whose fraction is under half a px is raised to the next half px,
   * which Chrome rounds up, so `█` is at least as wide as the cell; the
   * whole-px advance (and so the cell width) stays as `fontPx` gives it
   * (ADR 0049).
   */
  halfUpPx?: boolean;
  /**
   * Px taken off the cell height before rounding down (`cellHeight`), so
   * that `█` always reaches past both cell edges: without it, a cell that
   * the block fills exactly shows hairline seams between rows where the
   * browser rounds the baseline (ADR 0049). 0 for DejaVu and JetBrains.
   */
  cellMargin?: number;
  /** Faces ahead of the family in `stack` that replace single glyphs. */
  overrides?: readonly GlyphFace[];
  /** Faces after the family in `stack` (the glyphs its bold lacks). */
  fallbacks?: readonly GlyphFace[];
  /** Name and licence for the exported replay's notice (ADR 0001). */
  notice: string;
}

/** A small face that replaces (or supplies) a few glyphs of a family. */
export interface GlyphFace {
  /** The @font-face family name. */
  family: string;
  /** File names under public/fonts (may be the same file). */
  regular: string;
  bold: string;
  /** The characters it draws (the text `document.fonts.load` asks for). */
  text: string;
  /** The @font-face `unicode-range` (absent: all). */
  unicodeRange?: string;
  /** Name and licence for the exported replay's notice; absent: covered by the family's. */
  notice?: string;
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
  notice: 'WebCockpit Underscore (the underscore of DejaVu Sans Mono, moved up; same licence)',
};

const FILL_NOTICE = '(box and block glyphs drawn for WebCockpit; SIL Open Font License 1.1)';

/**
 * A "WebCockpit Fill" face (ADR 0049, scripts/build-fill-fonts.py): the
 * box-drawing, block and shade glyphs a host font lacks, drawn at the
 * host's advance and vertical metrics. One file serves both weights.
 */
function fillFace(key: string, chars: string): GlyphFace {
  const file = `WebCockpitFill-${key}.woff2`;
  const family = `WebCockpit Fill ${key}`;
  return {
    family,
    regular: file,
    bold: file,
    text: chars,
    unicodeRange: [...chars].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase()}`).join(', '),
    notice: `${family} ${FILL_NOTICE}`,
  };
}

/** The glyphs each fill face draws (exactly what its host lacks; tests/unit/font-glyphs.test.ts). */
export const FILL_FACES = {
  AP: fillFace('AP', '▀▄▌▐█▖▗▘▝▚▞▛▜▙▟▁▂▃▅▆▇░▒▓'),
  H: fillFace('H', '─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬▖▗▘▝▚▞▛▜▙▟░▒▓'),
  GM: fillFace('GM', '▖▗▘▝▚▞▛▜▙▟▁▂▃▅▆▇'),
  LC: fillFace('LC', '▖▗▘▝▚▞▛▜▙▟▁▂▃▅▆▇'),
} as const;

/**
 * Agave's bold covers Latin and a few symbols, but no box or block glyph.
 * Its bold @font-face rule is limited to what the bold file has; the rest
 * of a bold run falls to this family, which is Agave Regular for both
 * weights: Agave's own glyphs at Agave's advance (not DejaVu's), and no
 * synthetic bold.
 */
export const AGAVE_REGULAR_FACE: GlyphFace = {
  family: 'WebCockpit Agave Regular',
  regular: 'Agave-Regular.woff2',
  bold: 'Agave-Regular.woff2',
  text: '█',
};

/** The code points of Agave-Bold.woff2 (its cmap; tests/unit/font-glyphs.test.ts). */
export const AGAVE_BOLD_RANGE =
  'U+20-7E, U+A0-2AF, U+2B9-2BF, U+2C2-2C3, U+2C6-2C7, U+2D8-2DD, U+2EE, U+300-304, U+306-30C, ' +
  'U+30F, U+311-315, U+323-328, U+32C-331, U+374-375, U+37A, U+37E, U+384-385, U+39B, U+3A3, U+3A9, ' +
  'U+3B4-3B5, U+3B9-3BA, U+3BC, U+3C6, U+411, U+432, U+43D, U+443, U+1FBF, U+1FFE, U+2016, ' +
  'U+2032-2033, U+2081-2083';

const OFL = 'SIL Open Font License 1.1';
/** `FontInfo.cellMargin` of the families added in ADR 0049. */
const CELL_MARGIN = 0.5;
/** Symbols most families lack come from DejaVu Sans Mono (at its own advance). */
const FALLBACK = '"DejaVu Sans Mono", monospace';

/** `stack` for a family with its glyph faces and the DejaVu fallback. */
function stackOf(family: string, overrides: readonly GlyphFace[] = [], fallbacks: readonly GlyphFace[] = []): string {
  return [...overrides.map((o) => `"${o.family}"`), `"${family}"`, ...fallbacks.map((o) => `"${o.family}"`), FALLBACK].join(
    ', ',
  );
}

/** One bundled family: files `<base>-Regular.woff2` and `<base>-Bold.woff2`. */
function bundled(
  label: string,
  base: string,
  blockEm: number,
  advanceEm: number,
  licence: string,
  more: Partial<FontInfo> = {},
): FontInfo {
  const family = more.family ?? label;
  return {
    label,
    family,
    stack: stackOf(family, more.overrides, more.fallbacks),
    regular: `${base}-Regular.woff2`,
    bold: `${base}-Bold.woff2`,
    blockEm,
    advanceEm,
    cellMargin: CELL_MARGIN,
    notice: `${label} (${licence})`,
    ...more,
  };
}

// Metrics: units per em, advance and the cell height each family's `█`
// covers, read from the font files with fontTools (public/fonts/README.md
// "Metrics"; tests/unit/font-glyphs.test.ts checks advance and units/em).
export const FONTS: Readonly<Record<FontId, FontInfo>> = {
  agave: bundled('Agave', 'Agave', 2112 / 2048, 1024 / 2048, OFL, {
    boldUnicodeRange: AGAVE_BOLD_RANGE,
    fallbacks: [AGAVE_REGULAR_FACE],
  }),
  anonymous: bundled('Anonymous Pro', 'AnonymousPro', 2048 / 2048, 1118 / 2048, OFL, {
    // No `█`: the cell is the line metrics (-373 .. 1675), which its `│`
    // and the fill face's blocks span.
    overrides: [FILL_FACES.AP],
  }),
  cascadia: bundled('Cascadia Mono', 'CascadiaMono', 2380 / 2048, 1200 / 2048, OFL),
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
    notice: 'DejaVu Sans Mono (Bitstream Vera licence, public domain changes)',
  },
  fantasque: bundled('Fantasque Sans Mono', 'FantasqueSansMono', 2262 / 2048, 1060 / 2048, OFL),
  firacode: bundled('Fira Code', 'FiraCode', 2400 / 1950, 1200 / 1950, OFL),
  gomono: bundled('Go Mono', 'GoMono', 2367 / 2048, 1229 / 2048, 'BSD-style Go font licence', {
    overrides: [FILL_FACES.GM],
    wholePx: true,
  }),
  hack: bundled('Hack', 'Hack', 2442 / 2048, 1233 / 2048, 'MIT and Bitstream Vera licences'),
  hermit: bundled('Hermit', 'Hermit', 1164 / 1000, 618 / 1000, OFL, { overrides: [FILL_FACES.H] }),
  ibm3270: bundled('IBM 3270', 'IBM3270', 2000 / 2000, 1080 / 2000, 'BSD 3-clause licence', {
    bold: null,
    wholePx: true,
  }),
  plex: bundled('IBM Plex Mono', 'IBMPlexMono', 1150 / 1000, 600 / 1000, OFL, { wholePx: true }),
  inconsolata: bundled('Inconsolata', 'Inconsolata', 1331 / 1000, 500 / 1000, OFL),
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
    halfUpPx: true,
    cellMargin: 0.1,
    notice: `JetBrains Mono (${OFL})`,
  },
  // Its `█` and `│` fill the line metrics exactly; Chrome's rounded
  // baseline left a 1 px gap at 26 and 27 with half a px of margin.
  mononoki: bundled('mononoki', 'mononoki', 1150 / 1024, 575 / 1024, OFL, { cellMargin: 1 }),
  notomono: bundled('Noto Sans Mono', 'NotoSansMono', 1170 / 1000, 600 / 1000, OFL),
  lucida: {
    label: 'Lucida Console',
    family: 'WebCockpit Lucida',
    stack: stackOf('WebCockpit Lucida', [FILL_FACES.LC]),
    regular: null,
    bold: null,
    local: ['Lucida Console', 'LucidaConsole'],
    // Lucida Console 5.01: █ spans -432..1616 of 2048, the line metrics.
    blockEm: 2048 / 2048,
    advanceEm: 1234 / 2048,
    wholePx: true,
    cellMargin: CELL_MARGIN,
    overrides: [FILL_FACES.LC],
    notice: 'Lucida Console (installed fonts only; never embedded)',
  },
};

/** The family used when the stored one cannot be (ADR 0049). */
export const DEFAULT_FONT: FontId = 'dejavu';

/** Local-only families found installed (`detectLocalFonts`). */
const installed = new Set<FontId>();

/** Whether `id` can be used here: bundled, or local and installed. */
export function isFontAvailable(id: FontId): boolean {
  return !FONTS[id].local || installed.has(id);
}

/** The family that renders a stored `id`: itself, or DejaVu Sans Mono when it is not available. */
export function effectiveFont(id: FontId): FontId {
  return Object.hasOwn(FONTS, id) && isFontAvailable(id) ? id : DEFAULT_FONT;
}

/** The family an exported file uses for `id`: never a local-only font. */
export function bundledFont(id: FontId): FontId {
  return Object.hasOwn(FONTS, id) && !FONTS[id].local ? id : DEFAULT_FONT;
}

/** `FONTS[effectiveFont(id)]`. */
export function fontInfo(id: FontId): FontInfo {
  return FONTS[effectiveFont(id)];
}

/** The families the font picker offers here, in order. */
export function fontChoices(): FontId[] {
  return FONT_IDS.filter(isFontAvailable);
}

/** Marks a local-only family installed or not (detection; tests). */
export function setFontInstalled(id: FontId, on: boolean): void {
  if (on) installed.add(id);
  else installed.delete(id);
}

/**
 * Looks for the local-only families (Lucida Console) by loading a
 * `local()` FontFace: it loads when the font is installed and fails when
 * not. Resolves with the families found (never rejects).
 */
export async function detectLocalFonts(): Promise<FontId[]> {
  const Face = (globalThis as { FontFace?: typeof FontFace }).FontFace;
  if (!Face) return [];
  const found: FontId[] = [];
  await Promise.all(
    FONT_IDS.filter((id) => FONTS[id].local).map(async (id) => {
      const src = FONTS[id].local!.map((n) => `local("${n}")`).join(', ');
      try {
        await new Face(`${FONTS[id].family} probe`, src).load();
        setFontInstalled(id, true);
        found.push(id);
      } catch {
        setFontInstalled(id, false);
      }
    }),
  );
  return found;
}

/** One @font-face rule of a family or of one of its glyph faces. */
export interface FontFaceFile {
  family: string;
  weight: 'normal' | 'bold';
  /** File name under public/fonts; absent for a `local()` face. */
  file?: string;
  /** `local()` names (Lucida Console). */
  local?: readonly string[];
  /** The text to load it with. */
  text: string;
  unicodeRange?: string;
}

function faceFiles(o: GlyphFace): FontFaceFile[] {
  const r = o.unicodeRange ? { unicodeRange: o.unicodeRange } : {};
  return [
    { family: o.family, weight: 'normal', file: o.regular, text: o.text, ...r },
    { family: o.family, weight: 'bold', file: o.bold, text: o.text, ...r },
  ];
}

/**
 * Every @font-face rule the family `id` needs (not resolved through
 * `effectiveFont`): the family's regular and bold, its glyph faces ahead
 * of it, then those after it.
 */
export function familyFaces(id: FontId): FontFaceFile[] {
  const f = FONTS[id];
  const out: FontFaceFile[] = [];
  if (f.local) {
    for (const weight of ['normal', 'bold'] as const) out.push({ family: f.family, weight, local: f.local, text: '█' });
  } else {
    // A family whose bold lacks `█` is loaded with text its bold has.
    const boldText = f.boldUnicodeRange ? 'A' : '█';
    out.push({ family: f.family, weight: 'normal', file: f.regular!, text: '█' });
    out.push({
      family: f.family,
      weight: 'bold',
      file: f.bold ?? f.regular!,
      text: boldText,
      ...(f.boldUnicodeRange ? { unicodeRange: f.boldUnicodeRange } : {}),
    });
  }
  for (const o of f.overrides ?? []) out.push(...faceFiles(o));
  for (const o of f.fallbacks ?? []) out.push(...faceFiles(o));
  return out;
}

/** The @font-face rules that render a stored `id` here (`effectiveFont`). */
export function fontFiles(id: FontId): FontFaceFile[] {
  return familyFaces(effectiveFont(id));
}

/** The @font-face rules of every family, each (family, weight) once. */
export function allFontFaces(): FontFaceFile[] {
  const seen = new Set<string>();
  const out: FontFaceFile[] = [];
  for (const id of FONT_IDS) {
    for (const f of familyFaces(id)) {
      const key = `${f.family}|${f.weight}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f);
    }
  }
  return out;
}

/** One @font-face rule; `src` is the CSS `src` value. */
export function fontFaceRule(f: Pick<FontFaceFile, 'family' | 'weight' | 'unicodeRange'>, src: string): string {
  return (
    `@font-face{font-family:"${f.family}";src:${src};` +
    `font-weight:${f.weight};font-style:normal;font-display:block` +
    (f.unicodeRange ? `;unicode-range:${f.unicodeRange}` : '') +
    '}'
  );
}

/** The CSS `src` of a face in the app: its URL, or `local()` names. */
function faceSrc(f: FontFaceFile): string {
  if (f.local) return f.local.map((n) => `local("${n}")`).join(', ');
  return `url("${fontUrl(f.file!)}") format("woff2")`;
}

/**
 * The @font-face rules of every family. font-display: block — text waits
 * for the font instead of swapping, so the cell grid is measured once with
 * the real font and never reflows (ADR 0010).
 */
export function fontFaceCss(): string {
  return allFontFaces()
    .map((f) => fontFaceRule(f, faceSrc(f)))
    .join('\n');
}

/** Adds the @font-face rules to `doc` once. Nothing downloads until text uses a family. */
export function installFontFaces(doc: Document = document): void {
  if (doc.getElementById('wc-font-faces')) return;
  const style = doc.createElement('style');
  style.id = 'wc-font-faces';
  style.textContent = fontFaceCss();
  doc.head.appendChild(style);
}

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
  const f = fontInfo(id);
  const adv = f.advanceEm;
  if (f.wholePx) return wholePx(adv, size);
  const w = Math.max(1, Math.round(size * adv));
  // Four decimals: enough for the advance, and keeps float noise out of CSS.
  const px = Math.round((w / adv) * 1e4) / 1e4;
  const frac = px - Math.floor(px);
  // A whole px size is drawn as is.
  if (f.halfUpPx && frac > 0.001 && frac < 0.5) return Math.floor(px) + 0.5;
  return px;
}

/**
 * `fontPx` of a `wholePx` family: the whole px size nearest `size` (the
 * larger on a tie) whose advance is less than half a px over a whole px.
 * Chrome rounds that advance down to the cell, so the glyphs are at least
 * as wide as the cell; Firefox lays out the exact advance, and the cell
 * metrics take the excess off with letter-spacing (src/theme/cells.ts).
 */
function wholePx(adv: number, size: number): number {
  for (let d = 0; d <= 3; d++) {
    for (const n of [size + d, size - d]) {
      const a = n * adv;
      if (n >= 1 && a >= 1 && a - Math.floor(a) < 0.45) return n;
    }
  }
  return Math.max(1, Math.round(size));
}

/**
 * The regular face of the stack's fallback family (`FALLBACK`), which
 * draws what the selected family lacks (the banner's `✧`, the footer's
 * arrows in most families). Its file loads only when such a glyph is
 * first laid out, and with `font-display: block` a face that is loading
 * hides all text of the same style, not only the glyphs it draws: on a
 * slow link the start page's regular rows stayed blank while the bold
 * `<< Enter MUME >>` showed (ADR 0083). So it is preloaded and waited
 * for with the selected family.
 */
const FALLBACK_FACE: FontFaceFile = { family: 'DejaVu Sans Mono', weight: 'normal', file: FONTS.dejavu.regular!, text: '✧' };

/** `fontFiles(id)` and the fallback family's regular face: what a first render of `id` loads. */
export function renderFaces(id: FontId): FontFaceFile[] {
  const faces = fontFiles(id);
  return faces.some((f) => f.file === FALLBACK_FACE.file) ? faces : [...faces, FALLBACK_FACE];
}

/** URL of a font file (respects Vite's `base`). */
export function fontUrl(file: string): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  return `${base.endsWith('/') ? base : base + '/'}fonts/${file}`;
}

/**
 * Adds `<link rel=preload>` for the files that render `id` (its regular
 * and bold, its glyph faces and the fallback face, `renderFaces`), once
 * per file. Call before the first
 * render; only the selected family. A local-only family has nothing to
 * preload but its fill face.
 */
export function preloadFont(id: FontId, doc: Document = document): void {
  for (const { file } of renderFaces(id)) {
    if (!file) continue;
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
 * Resolves when the faces that render `id` (`renderFaces`) are loaded (or
 * failed to load; never rejects). Resolves at once where the Font Loading API is missing.
 */
export async function loadFont(id: FontId, sizePx: number, doc: Document = document): Promise<void> {
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts?.load) return;
  try {
    await Promise.all(
      renderFaces(id).map((f) => fonts.load(`${f.weight === 'bold' ? 'bold ' : ''}${sizePx}px "${f.family}"`, f.text)),
    );
  } catch {
    /* fall back to whatever the browser has */
  }
}
