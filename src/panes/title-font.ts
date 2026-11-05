// The pane title's font (ADR 0123 "Title"): Cinzel Bold, bundled
// (public/fonts, src/theme/fonts.ts `TITLE_FACE`). The title is not in the
// terminal font, so the hood's width comes from the label's measured width:
// a canvas `measureText` once per label and size, cached. Until the face has
// loaded (or where nothing can be measured: tests) an estimate from the
// font's average advance is used; when it loads, the cache is dropped and
// the listeners (the cockpit: a relayout) re-place the frames.

import { TITLE_FACE } from '../theme/fonts';
import { TITLE_TRACK } from './frame';

/** The title's CSS font family, with fallbacks: a serif, as the label is only ornament. */
export const TITLE_STACK = `"${TITLE_FACE.family}", Georgia, "Times New Roman", serif`;

/** Cinzel Bold's average advance over a mixed-case label (capitals 0.73 em, small capitals ~0.6), em. */
const EST_EM = 0.66;

const cache = new Map<string, number>();
const listeners = new Set<() => void>();
let canvas: CanvasRenderingContext2D | null | undefined;
/** The face is loaded (or loading was asked for) in this document. */
let loaded = false;
let asked = false;

const fontOf = (sizePx: number): string => `700 ${sizePx}px ${TITLE_STACK}`;

function ctxOf(doc: Document): CanvasRenderingContext2D | null {
  if (canvas !== undefined) return canvas;
  try {
    canvas = doc.createElement('canvas').getContext('2d');
  } catch {
    canvas = null;
  }
  return canvas;
}

/** The estimate: `EST_EM` per character plus the tracking between them. */
export function estimateTitleWidth(text: string, sizePx: number): number {
  const k = [...text].length;
  return k ? sizePx * (k * EST_EM + (k - 1) * TITLE_TRACK) : 0;
}

/**
 * Asks the browser for the title face once (it downloads only when asked or
 * used); when it has loaded, drops the cached widths and calls the
 * `onTitleFont` listeners.
 */
export function loadTitleFont(doc: Document): void {
  if (asked) return;
  asked = true;
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts?.load) return;
  const font = fontOf(12);
  try {
    if (fonts.check(font, 'Ag')) {
      loaded = true;
      return;
    }
  } catch {
    /* measured with the estimate */
  }
  void fonts
    .load(font, 'Ag')
    .then((faces) => {
      if (!faces.length) return;
      loaded = true;
      cache.clear();
      for (const fn of [...listeners]) fn();
    })
    .catch(() => {});
}

/**
 * The width in CSS px of `text` as the title draws it at `sizePx` (Cinzel
 * Bold with `TITLE_TRACK` between the letters): measured once the face has
 * loaded, the estimate before.
 */
export function titleWidth(doc: Document, text: string, sizePx: number): number {
  if (!text) return 0;
  loadTitleFont(doc);
  const c = loaded ? ctxOf(doc) : null;
  if (!c) return estimateTitleWidth(text, sizePx);
  const key = `${sizePx}|${text}`;
  let w = cache.get(key);
  if (w === undefined) {
    c.font = fontOf(sizePx);
    const k = [...text].length;
    w = c.measureText(text).width + Math.max(0, k - 1) * TITLE_TRACK * sizePx;
    cache.set(key, w);
  }
  return w;
}

/** Calls `fn` when the title face has loaded (widths change). Returns the unsubscribe. */
export function onTitleFont(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
