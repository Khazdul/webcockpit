// Link previews of shared logs (ADR 0158): the preview image's contract
// and the unfurl's title. Pure; shared by the client (src/share/
// preview-image.ts renders the image, src/cloud/pub/api.ts uploads it) and
// the Worker (worker/og.ts checks it and writes the meta tags).

/** The preview image's size, px (4:3: a large thumbnail in Discord, ADR 0158). */
export const PREVIEW_WIDTH = 1200;
export const PREVIEW_HEIGHT = 900;
/** The longest preview image the Worker stores, bytes. */
export const PREVIEW_MAX_BYTES = 768 * 1024;
/** The preview's content type: PNG only. */
export const PREVIEW_TYPE = 'image/png';
/** The generic preview of a log without its own image (public/share-preview.png). */
export const FALLBACK_PREVIEW_PATH = '/share-preview.png';
/** The unfurl's site name (og:site_name). */
export const SITE_NAME = 'MUME Cockpit';
/** The longest og:title, characters (code points): what Discord shows on one or two lines. */
export const OG_TITLE_MAX = 70;
/** The longest og:description, characters. */
export const OG_DESCRIPTION_MAX = 200;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * True when `b` starts as a PNG of exactly `width` x `height` px: the
 * signature, then the IHDR chunk (length 13) with that size, 8-bit RGB or
 * RGBA, no interlace. Only the head is read: the image is never decoded on
 * the server, and browsers and crawlers decode it in their own sandboxes.
 */
export function isPreviewPng(b: Uint8Array, width = PREVIEW_WIDTH, height = PREVIEW_HEIGHT): boolean {
  if (b.length < 33) return false;
  for (let i = 0; i < 8; i++) if (b[i] !== PNG_SIGNATURE[i]) return false;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint32(8) !== 13) return false;
  if (String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!) !== 'IHDR') return false;
  if (v.getUint32(16) !== width || v.getUint32(20) !== height) return false;
  const depth = b[24];
  const colour = b[25];
  return depth === 8 && (colour === 2 || colour === 6) && b[26] === 0 && b[27] === 0 && b[28] === 0;
}

/** `s` cut to `max` code points, the last one an ellipsis when it was longer (trailing space trimmed before it). */
export function clip(s: string, max: number): string {
  const cps = [...s];
  if (cps.length <= max) return s;
  if (max <= 0) return '';
  return cps.slice(0, max - 1).join('').trimEnd() + '…';
}

/** One line: runs of whitespace (line breaks too) as one space, trimmed. */
export function oneLine(s: string): string {
  return s.replace(/\s+/gu, ' ').trim();
}

/**
 * The unfurl's title: "<title> (<character>)", at most `max` code points.
 * The title is cut with an ellipsis so the character's name always shows;
 * a name that alone would not leave room for a few characters of title is
 * cut too. No character: the title alone.
 */
export function ogTitle(title: string, character: string, max = OG_TITLE_MAX): string {
  const t = oneLine(title);
  const c = oneLine(character);
  if (c === '') return clip(t || SITE_NAME, max);
  const name = clip(c, Math.max(1, Math.floor(max / 2)));
  const suffix = ` (${name})`;
  if (t === '') return clip(name, max);
  const room = max - [...suffix].length;
  return clip(t, room) + suffix;
}

/** The unfurl's description: the log's own, on one line and clipped; '' when it has none. */
export function ogDescription(description: string, max = OG_DESCRIPTION_MAX): string {
  return clip(oneLine(description), max);
}
