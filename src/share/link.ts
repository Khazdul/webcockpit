// A share link's small pieces (stage 64 C1, ADR 0154 "What is uploaded"):
// the title the share dialog proposes, the text rules of the meta (as the
// Worker checks them: worker/pub.ts), the meta of a payload, the link's
// address and the sizes as the dialog and Published runs say them. Pure,
// so it is unit tested (tests/unit/share-link.test.ts).

import { PUB_DESCRIPTION_MAX, PUB_TITLE_MAX, type PubMetaIn } from '../../shared/cloud/api.ts';
import { cleanPublicText, cleanText, hasVisible } from '../../shared/cloud/text.ts';
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
// lone surrogate and the bidi embeddings, overrides and isolates
// (shared/cloud/text.ts, the one place of the rules); the dialog takes them
// out as they are typed or pasted, so what is sent passes.

/** `s` with the characters the Worker refuses made spaces (`\n` kept only when `newlines`), lone surrogates out, NFC. */
export function pubText(s: string, newlines = false): string {
  return cleanText(s, { newlines, control: ' ' });
}

/**
 * A listed run's text (Hall of Fame, review fix S3): also the free public
 * text rules of comments and notes (shared/cloud/text.ts) on one line,
 * since the Community shows it to everyone.
 */
function listedText(s: string, listed: boolean): string {
  return listed ? cleanPublicText(s, { newlines: 0 }) : s;
}

/** A sent text with nothing visible is none (a listed run's: review fix S3). */
const visibleOr = (s: string, listed: boolean): string => (listed && !hasVisible(s) ? '' : s);

/** The first `max` code points of `s` (the Worker counts code points). */
export function codePoints(s: string, max: number): string {
  const cps = Array.from(s);
  return cps.length <= max ? s : cps.slice(0, max).join('');
}

/** Code points in `s`. */
export const codePointCount = (s: string): number => Array.from(s).length;

/** A title as sent: the rules above (a listed run's: also the free public text rules), whitespace collapsed, trimmed, at most `PUB_TITLE_MAX`. */
export function cleanTitle(s: string, listed = false): string {
  return sent(s, PUB_TITLE_MAX, listed);
}

/** A text as sent: cleaned, one line, cut, cleaned again after the cut (a listed run's: no dangling ZWJ), trimmed. */
function sent(s: string, max: number, listed: boolean): string {
  const one = (v: string): string => listedText(pubText(v).replace(/\s+/g, ' '), listed).trim();
  return visibleOr(one(codePoints(one(s), max)), listed);
}

/**
 * A description as sent: one paragraph (the dialog's field is one, as a
 * comment is: Enter creates the link), whitespace collapsed, trimmed, at
 * most `PUB_DESCRIPTION_MAX`.
 */
export function cleanDescription(s: string, listed = false): string {
  return sent(s, PUB_DESCRIPTION_MAX, listed);
}

/** What a description field keeps of what is typed or pasted: the rules (a listed run's too), one line, the length (not trimmed: a space is being typed). */
export function typedDescription(s: string, listed = false): string {
  return codePoints(listedText(pubText(s).replace(/[\r\n\t]+/g, ' '), listed), PUB_DESCRIPTION_MAX);
}

/** What a title field keeps of what is typed or pasted (a listed run's: also the free public text rules). */
export function typedTitle(s: string, listed = false): string {
  return codePoints(listedText(pubText(s).replace(/[\r\n\t]+/g, ' '), listed), PUB_TITLE_MAX);
}

/**
 * A share dialog's idempotency key (`PubMetaIn.key`, review fix CR3): 22
 * random characters of `[A-Za-z0-9_-]`, drawn once per dialog, so its Try
 * again after a lost answer gets the run the first POST made.
 */
export function newLinkKey(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The meta sent with a payload (`PubMetaIn`): the texts cleaned, the numbers in the Worker's ranges, the dialog's key; `listed` only for the Hall of Fame (stage 65). */
export function linkMeta(o: { title: string; description: string; character: string; level?: number | undefined; lengthS: number; key?: string; listed?: boolean }): PubMetaIn {
  const listed = o.listed === true;
  const character = sent(o.character, PUB_CHARACTER_MAX, listed);
  const lengthS = Number.isFinite(o.lengthS) ? Math.max(0, Math.min(PUB_LENGTH_MAX_S, Math.round(o.lengthS))) : 0;
  const meta: PubMetaIn = { title: cleanTitle(o.title, listed), description: cleanDescription(o.description, listed), character, lengthS, listed };
  const lv = o.level;
  if (typeof lv === 'number' && Number.isInteger(lv) && lv >= 0 && lv <= PUB_LEVEL_MAX) meta.level = lv;
  if (o.key !== undefined) meta.key = o.key;
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
