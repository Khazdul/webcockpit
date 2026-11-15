// A share link's small pieces (stage 64 C1, ADR 0154 "What is uploaded"):
// the title the share dialog proposes, the text rules of the meta (as the
// Worker checks them: worker/pub.ts), the meta of a payload, the link's
// address and the sizes as the dialog and Published runs say them. Pure,
// so it is unit tested (tests/unit/share-link.test.ts).

import { PUB_DESCRIPTION_MAX, PUB_TITLE_MAX, type PubMetaIn } from '../../shared/cloud/api.ts';
import type { ExportDoc } from './edits';

/** `character`'s longest (the Worker's rule, as built in stage 64 B1). */
export const PUB_CHARACTER_MAX = 40;
/** `level`'s and `lengthS`' ranges (the Worker's rules). */
export const PUB_LEVEL_MAX = 1000;
export const PUB_LENGTH_MAX_S = 31 * 86_400;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The title a link gets when the doc has none: "Rasta · 26 September 2026" (the first run's local date). */
export function defaultLinkTitle(character: string, startUs: number): string {
  const d = new Date(startUs / 1000);
  const date = Number.isFinite(d.getTime()) ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
  return cleanTitle([character.trim(), date].filter(Boolean).join(' · ')) || 'A run';
}

/** The link's proposed title: the doc's own title, or the character and date. */
export function linkTitle(doc: Pick<ExportDoc, 'title'>, character: string, startUs: number): string {
  return cleanTitle(doc.title) || defaultLinkTitle(character, startUs);
}

// The Worker refuses (never repairs) a C0 or C1 control character, DEL, a
// lone surrogate and the bidi embeddings, overrides and isolates; the
// dialog takes them out as they are typed or pasted, so what is sent passes.
// eslint-disable-next-line no-control-regex
const CONTROLS = /[\x00-\x09\x0b-\x1f\x7f-\x9f‪-‮⁦-⁩]/g;
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/** `s` with the characters the Worker refuses taken out (`\n` kept only when `newlines`), NFC. */
export function pubText(s: string, newlines = false): string {
  let t = s.replace(LONE, '').normalize('NFC').replace(CONTROLS, ' ');
  if (!newlines) t = t.replace(/\n/g, ' ');
  return t;
}

/** The first `max` code points of `s` (the Worker counts code points). */
export function codePoints(s: string, max: number): string {
  const cps = Array.from(s);
  return cps.length <= max ? s : cps.slice(0, max).join('');
}

/** Code points in `s`. */
export const codePointCount = (s: string): number => Array.from(s).length;

/** A title as sent: the rules above, whitespace collapsed, trimmed, at most `PUB_TITLE_MAX`. */
export function cleanTitle(s: string): string {
  return codePoints(pubText(s).replace(/\s+/g, ' ').trim(), PUB_TITLE_MAX).trim();
}

/**
 * A description as sent: one paragraph (the dialog's field is one, as a
 * comment is: Enter creates the link), whitespace collapsed, trimmed, at
 * most `PUB_DESCRIPTION_MAX`.
 */
export function cleanDescription(s: string): string {
  return codePoints(pubText(s).replace(/\s+/g, ' ').trim(), PUB_DESCRIPTION_MAX).trim();
}

/** What a description field keeps of what is typed or pasted: the rules, one line, the length (not trimmed: a space is being typed). */
export function typedDescription(s: string): string {
  return codePoints(pubText(s).replace(/[\r\n\t]+/g, ' '), PUB_DESCRIPTION_MAX);
}

/** What a title field keeps of what is typed or pasted. */
export function typedTitle(s: string): string {
  return codePoints(pubText(s).replace(/[\r\n\t]+/g, ' '), PUB_TITLE_MAX);
}

/** The meta sent with a payload (`PubMetaIn`): the texts cleaned, the numbers in the Worker's ranges. */
export function linkMeta(o: { title: string; description: string; character: string; level?: number | undefined; lengthS: number }): PubMetaIn {
  const character = codePoints(pubText(o.character).replace(/\s+/g, ' ').trim(), PUB_CHARACTER_MAX).trim();
  const lengthS = Number.isFinite(o.lengthS) ? Math.max(0, Math.min(PUB_LENGTH_MAX_S, Math.round(o.lengthS))) : 0;
  const meta: PubMetaIn = { title: cleanTitle(o.title), description: cleanDescription(o.description), character, lengthS, listed: false };
  const lv = o.level;
  if (typeof lv === 'number' && Number.isInteger(lv) && lv >= 0 && lv <= PUB_LEVEL_MAX) meta.level = lv;
  return meta;
}

/** The base the app is served under (Vite's `BASE_URL`), as an absolute URL of `href`'s origin. */
function siteBase(href: string): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  return new URL(base, href).href;
}

/** A link's address: `<origin><base>r/<id>`. */
export function linkUrl(id: string, href: string = globalThis.location?.href ?? 'http://localhost/'): string {
  return new URL(`r/${id}`, siteBase(href)).href;
}

/** A link's path as Published runs shows it: `/r/<id>` (under the base). */
export function linkPath(id: string, href: string = globalThis.location?.href ?? 'http://localhost/'): string {
  return new URL(linkUrl(id, href)).pathname;
}

const MB = 1024 * 1024;

/**
 * Bytes as the dialog and Published runs say them: "1.2 MB", "0.6 MB",
 * "48 KB" (binary units, so the limit of 5 MiB reads "5 MB").
 */
export function sizeWords(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 0.1 * MB) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  // Rounded up to a tenth: a size never reads smaller than it is (5 MiB + 1 byte is "5.1 MB").
  const shown = Math.ceil((bytes / MB) * 10 - 1e-9) / 10;
  return `${Number.isInteger(shown) ? shown.toFixed(0) : shown.toFixed(1)} MB`;
}

/** The limit's words: "5 MB". */
export const limitWords = (bytes: number): string => sizeWords(bytes);
