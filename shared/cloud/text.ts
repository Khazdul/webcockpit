// The text rules of share links (ADR 0154 "As built (stage 64 B1)") and of
// free public text (stage 65, below): the
// one place the Worker's check (worker/pub.ts `textOf`, reports, the
// admin's notes) and the client's cleaning (src/share/link.ts for the
// meta, src/watch/model.ts for a report's text) take them from. Tiny and
// free of imports, so the watch page's chunk can carry it without
// shared/cloud/api.ts.
//
// Refused: control characters (C0, DEL, C1; `\n` only where a text allows
// it), lone surrogates, and the bidi embeddings, overrides and isolates
// (U+202A–U+202E, U+2066–U+2069), which could make a title read as
// something else around it. Text is NFC; lengths are in code points.

/** A character the rules refuse (`\n` included: a text that allows it takes it out before the test). */
export const TEXT_FORBIDDEN = /[\p{Cc}\p{Cs}‪-‮⁦-⁩]/u;

const CONTROL = /[\p{Cc}‪-‮⁦-⁩]/gu;
const LONE = /\p{Cs}/gu;

/**
 * `s` as the rules take it: lone surrogates out, NFC, every refused
 * character replaced by `control` (default: taken out), `\n` kept when
 * `newlines`.
 */
export function cleanText(s: string, o: { newlines?: boolean; control?: string } = {}): string {
  const by = o.control ?? '';
  return s
    .replace(LONE, '')
    .normalize('NFC')
    .replace(CONTROL, (c) => (c === '\n' && o.newlines ? c : by));
}

/** True when `v` is text by the rules (NFC, nothing refused; `\n` allowed when `newlines`). */
export function isCleanText(v: string, newlines = false): boolean {
  return v.normalize('NFC') === v && !TEXT_FORBIDDEN.test(newlines ? v.replace(/\n/g, '') : v);
}

// --- Free public text: comments and notes (stage 65, ADR 0155) ---
//
// The rules above, plus no character that hides or smuggles text, and no
// "Zalgo" towers:
//
// - Invisible characters: U+00AD soft hyphen, U+034F combining grapheme
//   joiner, U+061C Arabic letter mark, U+115F/U+1160 Hangul fillers, U+17B4/
//   U+17B5 Khmer inherent vowels, U+180B–U+180F Mongolian selectors and
//   separator, U+200B, U+200C, U+200E, U+200F (zero width space and
//   non-joiner, the direction marks), U+2060–U+2064 (word joiner and the
//   invisible operators), U+3164 and U+FFA0 Hangul fillers, U+FEFF, the
//   tags U+E0000–U+E007F. As built (stage 65 B): also U+2028/U+2029 (line
//   and paragraph separators: a line break that is not `\n`) and U+FFF9–
//   U+FFFB (interlinear annotation). Variation selectors and the zero width
//   joiner U+200D stay (emoji).
// - At most `MAX_MARKS` combining marks (\p{M}) in a row after a base
//   character.
// - `\n` only where the text allows it, and at most so many.
//
// The Worker refuses (400 `bad_text`) and never changes a text; the client
// cleans as the player types (`cleanPublicText`) and trims before it sends.
// Shown as text only, never linkified.

/** Combining marks allowed in a row after one base character. */
export const MAX_MARKS = 3;

/** A character free public text refuses besides `TEXT_FORBIDDEN`'s (`\n` is the caller's). */
export const PUBLIC_FORBIDDEN =
  /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b\u200c\u200e\u200f\u2028\u2029\u2060-\u2064\u3164\ufeff\uffa0\ufff9-\ufffb\u{e0000}-\u{e007f}]/u;
const PUBLIC_FORBIDDEN_ALL = new RegExp(PUBLIC_FORBIDDEN.source, 'gu');
/** More combining marks in a row than allowed. */
const TOWER = /\p{M}{4,}/u;
const TOWER_ALL = /(\p{M}{3})\p{M}+/gu;

export interface PublicTextRules {
  /** The line breaks allowed (0: one line). */
  newlines: number;
}

/** True when `v` is free public text by the rules (it does not test the length or the trimming). */
export function isPublicText(v: string, o: PublicTextRules): boolean {
  if (!isCleanText(v, o.newlines > 0)) return false;
  if (PUBLIC_FORBIDDEN.test(v) || TOWER.test(v)) return false;
  let breaks = 0;
  for (const ch of v) if (ch === '\n') breaks++;
  return breaks <= o.newlines;
}

/**
 * `s` as the rules take it, for the client's field: lone surrogates out,
 * `\r\n` and `\r` as `\n`, NFC, every refused character out, combining
 * marks past `MAX_MARKS` in a row out, and the line breaks past
 * `newlines` (all of them for one line) as spaces. Not trimmed (the
 * player may still be typing); trim before sending.
 */
export function cleanPublicText(s: string, o: PublicTextRules): string {
  let breaks = 0;
  let out = cleanText(s.replace(/\r\n?/g, '\n'), { newlines: true }).replace(PUBLIC_FORBIDDEN_ALL, '');
  // Taking characters out can make text that NFC composes further, and NFC can join marks: until it holds.
  for (let i = 0; i < 4; i++) {
    const next = out.normalize('NFC').replace(TOWER_ALL, '$1');
    if (next === out) break;
    out = next;
  }
  return out.replace(/\n/g, () => (++breaks <= o.newlines ? '\n' : ' '));
}
